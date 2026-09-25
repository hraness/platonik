// One measured recorder. Rust owns every execution and outcome check.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { binary, sourceSnapshot, assertSource, sha, read } from '../bloom/common.mjs';
import { parseTime, parseMetrics, packFiles } from './capacity-io.mjs';

const protocolFile='scripts/exchange/capacity-protocol.json';
const protocol=read(protocolFile);
const qualificationFile='fixtures/evidence/exchange-qualification.json';
const qualification=read(qualificationFile);
const root=path.resolve(process.argv[2]);
assert.equal(process.platform,'darwin');
const scheduler=JSON.parse(process.env.LOCAL_EFFICIENCY_LEASE??'null');
assert.equal(scheduler?.mode,'exclusive');assert.equal(scheduler?.lane,'mac-native');
assert.equal(process.env.LC_ALL,'C');
fs.mkdirSync(root,{recursive:false});
const version=command=>{
  const result=spawnSync(command,['--version'],{encoding:'utf8'});
  if(result.error)throw result.error;assert.equal(result.status,0);return result.stdout.trim();
};
const ledger={schema:'platonik-bloom-exchange-capacity-ledger-v1',protocol,
  started_at:new Date().toISOString(),
  protocol_sha256:sha(fs.readFileSync(protocolFile)),qualification_sha256:sha(fs.readFileSync(qualificationFile)),
  environment:{platform:process.platform,architecture:process.arch,os_release:os.release(),cpu:os.cpus()[0]?.model??null,
    cpu_count:os.cpus().length,total_memory_bytes:os.totalmem(),node:process.version,rustc:version('rustc'),cargo:version('cargo'),
    locale:process.env.LC_ALL,allocator_malloc_nano_zone:process.env.MallocNanoZone??null,scheduler},
  engine_executions:0,calls:[],attempts:[],pending_call:null,accounting_incomplete:false,stopped:null,finished:null};
const save=()=>{
  fs.writeFileSync(path.join(root,'ledger.writing'),JSON.stringify(ledger,null,2)+'\n');
  fs.renameSync(path.join(root,'ledger.writing'),path.join(root,'ledger.json'));
};
const stop=(message,unknown=false)=>{
  ledger.stopped=message;ledger.accounting_incomplete ||= unknown;save();throw new Error(message);
};
ledger.source=sourceSnapshot(root,0);
for(const file of [protocolFile,qualificationFile,'scripts/exchange/capacity.mjs','scripts/exchange/capacity-record.mjs','scripts/exchange/capacity-io.mjs']){
  const bytes=fs.readFileSync(file),target=path.join(root,ledger.source.directory,file);
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});
  ledger.source.files[file]=sha(bytes);
}
save();

function cli(args,operation,item){
  const reservation=operation==='export'?0:1;
  if(ledger.engine_executions+reservation>protocol.maximum_engine_executions)stop('Engine allowance exhausted');
  const index=ledger.calls.length,stem=String(index).padStart(4,'0');
  const relativeArgs=args.map(a=>a.startsWith(`${root}/`)?path.relative(root,a):a);
  ledger.pending_call={index,reservation,args:relativeArgs};save();
  const stdout=`${stem}.stdout.json`,stderr=`${stem}.stderr.txt`;
  const out=fs.openSync(path.join(root,stdout),'wx'),err=fs.openSync(path.join(root,stderr),'wx');
  const timed=reservation===1;
  let result,elapsed_ms;
  try{
    const began=process.hrtime.bigint();
    result=spawnSync(timed?'/usr/bin/time':binary,timed?['-lp',binary,'--metrics',...args]:['--metrics',...args],
      {stdio:['ignore',out,err],timeout:60000,env:{...process.env,LC_ALL:'C'}});
    elapsed_ms=Number(process.hrtime.bigint()-began)/1e6;
  }finally{fs.closeSync(out);fs.closeSync(err);}
  const outBytes=fs.readFileSync(path.join(root,stdout)),errBytes=fs.readFileSync(path.join(root,stderr));
  const call={index,operation,...item,executable:'target/release/platonik',args:relativeArgs,
    reserved_engine_executions:reservation,exit_code:result.status,signal:result.signal,elapsed_ms,
    stdout,stderr,stdout_bytes:outBytes.length,stderr_bytes:errBytes.length,
    stdout_sha256:sha(outBytes),stderr_sha256:sha(errBytes),metrics:null,resources:null};
  ledger.calls.push(call);save();
  try{call.metrics=parseMetrics(errBytes.toString('utf8'),reservation);}
  catch{stop(`Invalid execution counters in call ${index}`,true);}
  ledger.engine_executions+=call.metrics.engine_executions;
  if(result.error||result.status===null)stop(`Uncertain process completion in call ${index}`,true);
  ledger.pending_call=null;save();
  if(call.metrics.engine_executions!==reservation)stop(`Unexpected execution count in call ${index}`);
  if(timed){try{call.resources=parseTime(errBytes.toString('utf8'));}catch{stop(`Invalid OS resources in call ${index}`);}}
  save();
  if(operation==='run'?![0,1].includes(result.status):result.status!==0)stop(`Unexpected exit in call ${index}`);
  return call;
}
const baseline=new Map();
function pair(item,input){
  assertSource(ledger.source);
  const attempt={...item,index:ledger.attempts.length,first_call:ledger.calls.length,completed:false};
  ledger.attempts.push(attempt);save();
  if(!input){
    const args=item.kind==='reference'?['habitat','case',item.case_id]:['habitat','exchange-control',item.case_id,item.kind];
    input=cli(args,'export',item).stdout;
  }
  attempt.input=input;save();
  const run=cli(['run',path.join(root,input)],'run',item);
  attempt.run_call=run.index;save();
  const verified=cli(['habitat','exchange-check',item.case_id,path.join(root,run.stdout)],'verify',item);
  attempt.verify_call=verified.index;save();
  const grade=read(path.join(root,verified.stdout));
  const expected=qualification.results.find(r=>r.case_id===item.case_id&&r.kind===item.kind);
  assert(expected);assert.deepEqual(grade,expected.grade,'Qualified outcome changed');
  attempt.work_total=grade.work_total;
  if(item.phase==='matrix')baseline.set(`${item.case_id}/${item.kind}`,{input,receipt:run.stdout_sha256,grade:verified.stdout_sha256});
  else{
    const original=baseline.get(`${item.case_id}/${item.kind}`);assert(original);
    assert.equal(run.stdout_sha256,original.receipt,'Repeated receipt bytes changed');
    assert.equal(verified.stdout_sha256,original.grade,'Repeated grade bytes changed');
  }
  attempt.completed=true;attempt.after_call=ledger.calls.length;save();
}
try{
  for(const item of [...protocol.references.map(case_id=>({case_id,kind:'reference'})),...protocol.controls.map(kind=>({case_id:protocol.control_case,kind}))])
    pair({...item,phase:'matrix',sample_index:null});
  for(let sample_index=0;sample_index<protocol.samples_per_representative;sample_index++)for(const case_id of protocol.representatives)
    pair({case_id,kind:'reference',phase:'sample',sample_index},baseline.get(`${case_id}/reference`).input);
  assertSource(ledger.source);
  assert.equal(ledger.engine_executions,148);assert.equal(ledger.calls.length,162);assert.equal(ledger.attempts.length,74);
  ledger.finished={measurements_completed:true,engine_executions:148,cli_calls:162,attempts:74,completed_at:new Date().toISOString()};save();
  const names=['ledger.json',...Object.keys(ledger.source.files).map(f=>`${ledger.source.directory}/${f}`),...ledger.calls.flatMap(c=>[c.stdout,c.stderr])];
  const archive=packFiles(root,names,path.join(root,'archive.json.gz'));
  const distribution=(case_id,operation)=>{
    const calls=ledger.calls.filter(c=>c.phase==='sample'&&c.case_id===case_id&&c.operation===operation);
    assert.equal(calls.length,30);const sorted=calls.map(c=>c.elapsed_ms).sort((a,b)=>a-b);
    return {calls:calls.map(c=>c.index),samples:30,min_ms:sorted[0],p50_ms:sorted[14],p95_ms:sorted[28],max_ms:sorted[29]};
  };
  const measurement={schema:'platonik-bloom-exchange-capacity-measurement-v1',protocol_sha256:ledger.protocol_sha256,
    started_at:ledger.started_at,recorded_at:ledger.finished.completed_at,packed_at:new Date().toISOString(),
    qualification_sha256:ledger.qualification_sha256,source:ledger.source,environment:ledger.environment,
    engine_executions:ledger.engine_executions,cli_calls:ledger.calls.length,attempts:ledger.attempts.length,archive,
    distributions:protocol.representatives.map(case_id=>({case_id,run:distribution(case_id,'run'),verify:distribution(case_id,'verify')})),
    maximum_cli_peak_rss_bytes:Math.max(...ledger.calls.filter(c=>c.resources).map(c=>c.resources.peak_rss_bytes)),
    maximum_receipt_bytes:Math.max(...ledger.calls.filter(c=>c.operation==='run').map(c=>c.stdout_bytes)),
    recorder_self_resource_usage:process.resourceUsage()};
  // The supervising /usr/bin/time also observes the process through exit.
  process.stdout.write(JSON.stringify(measurement)+'\n');
}catch(error){
  if(!ledger.stopped){ledger.stopped='Measurement stopped before completion';save();}
  throw error;
}
