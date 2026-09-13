// Re-admit each retained receipt and exact declared case with the current Rust CLI.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const sha = x=>createHash('sha256').update(x).digest('hex');
const summary=JSON.parse(fs.readFileSync('fixtures/evidence/exchange-qualification.json','utf8'));
const bytes=fs.readFileSync('fixtures/evidence/exchange-qualification.json.gz');
assert.equal(sha(bytes),summary.archive_sha256);
const archive=JSON.parse(gunzipSync(bytes,{maxOutputLength:32*1024*1024}));
assert.equal(archive.schema,'platonik-bloom-exchange-archive-v2');
assert.equal(sha(fs.readFileSync('scripts/exchange/pack.mjs')),summary.packer_sha256);
const files=archive.files;
function content(name) {
 const entry=files[name];assert(entry&&Number.isSafeInteger(entry.bytes)&&entry.bytes<=32*1024*1024);
 const raw=gunzipSync(Buffer.from(entry.gzip,'base64'),{maxOutputLength:32*1024*1024});
 assert.equal(raw.length,entry.bytes);assert.equal(sha(raw),entry.sha256);return raw.toString('utf8');
}
const read=name=>JSON.parse(content(name));
const ledger=read('ledger.json');
assert.equal(ledger.schema,'platonik-bloom-exchange-qualification-v1');
assert.deepEqual(ledger.plan,summary.protocol);
assert.deepEqual(ledger.plan.references,['bloom-exchange-left','bloom-exchange-right','bloom-exchange-left-delay','bloom-exchange-right-delay','bloom-exchange-rotated-left','bloom-exchange-rotated-right']);
assert.deepEqual(ledger.plan.controls,['no-child-ack','forged-report','wrong-winner','early-ack','no-request','missing-spare','selector-bypass','stray-report']);
assert.equal(ledger.plan.control_case,'bloom-exchange-left');
assert.equal(ledger.plan.maximum_engine_executions,64);
assert.equal(ledger.attempts.length,14);assert.equal(summary.results.length,14);assert.equal(ledger.calls.length,42);
assert.equal(ledger.finished.attempts,14);assert.equal(ledger.finished.engine_executions,28);
const names=['ledger.json',...Object.keys(ledger.source.files).map(f=>`${ledger.source.directory}/${f}`),...ledger.calls.flatMap(c=>[c.stdout,c.stderr])];
assert.deepEqual(Object.keys(files).sort(),names.sort());

assert(ledger.finished.qualified&&!ledger.pending_call&&!ledger.accounting_incomplete&&!ledger.stopped);
assert.equal(ledger.engine_executions,summary.engine_executions);
assert.equal(ledger.engine_executions,ledger.attempts.length*2);
assert(ledger.engine_executions<=ledger.plan.maximum_engine_executions);
assert.deepEqual(ledger.source.files,summary.source_files);
for(const [file,hash] of Object.entries(ledger.source.files)) assert.equal(sha(content(`${ledger.source.directory}/${file}`)),hash);
assert.equal(ledger.source.binary_sha256,summary.binary_sha256);
let counted=0;
for(const call of ledger.calls) {
  assert.equal(sha(content(call.stdout)),call.stdout_sha256);assert.equal(sha(content(call.stderr)),call.stderr_sha256);
  const metrics=content(call.stderr).trim().split('\n').filter(Boolean).map(JSON.parse).filter(v=>v.schema==='platonik-process-metrics-v1');
  assert.equal(metrics.length,1);assert.deepEqual(call.metrics,metrics[0]);
  assert(metrics[0].engine_executions<=call.reserved_engine_executions);counted+=metrics[0].engine_executions;
}
assert.equal(counted,summary.engine_executions);
const expected=[...ledger.plan.references.map(case_id=>({case_id,kind:'reference'})),...ledger.plan.controls.map(kind=>({case_id:ledger.plan.control_case,kind}))];
assert.deepEqual(ledger.attempts.map(({case_id,kind})=>({case_id,kind})),expected);
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'platonik-exchange-admit-'));
let executions=0;
const cli=args=>{
  const result=spawnSync(path.resolve('target/release/platonik'),['--metrics',...args],{encoding:'utf8',maxBuffer:32*1024*1024,timeout:60000});
  assert.equal(result.status,0,result.stderr);
  const metrics=result.stderr.trim().split('\n').filter(Boolean).map(JSON.parse).filter(v=>v.schema==='platonik-process-metrics-v1');
  assert.equal(metrics.length,1);executions+=metrics[0].engine_executions;
  return JSON.parse(result.stdout);
};
try {
 for(const [i,a] of ledger.attempts.entries()) {
  assert(a.completed);assert.equal(a.exchange_passed,a.kind==='reference');
  assert.equal(a.index,i);assert.equal(a.first_call,i*3);assert.equal(a.after_call,(i+1)*3);
  const triple=ledger.calls.slice(i*3,(i+1)*3);
  for(const [j,c] of triple.entries()) { assert.equal(c.index,i*3+j);assert.equal(c.metrics.engine_executions,j===0?0:1); }
  assert.equal(a.input,triple[0].stdout);assert.equal(a.receipt,triple[1].stdout);assert.equal(a.grade,triple[2].stdout);
  const input=read(a.input),receipt=read(a.receipt),grade=read(a.grade);
  const commands=a.kind==='reference'?['habitat','case',a.case_id]:['habitat','exchange-control',a.case_id,a.kind];
  assert.deepEqual(triple[0].args,commands);assert.equal(triple[0].exit_code,0);
  assert.deepEqual(triple[1].args,['run',a.input]);assert.equal(triple[1].exit_code,receipt.result.outcome.passed?0:1);
  assert.deepEqual(triple[2].args,['habitat','exchange-check',a.case_id,a.receipt]);assert.equal(triple[2].exit_code,0);
  assert.deepEqual(cli(commands),input,'Frozen case/control changed');
  assert.deepEqual(receipt.experiment,input);assert.equal(receipt.result.status,'complete');assert.equal(receipt.result.ticks_completed,128);
  const target=path.join(temporary,`${i}.json`);fs.writeFileSync(target,content(a.receipt),{flag:'wx'});
  assert.deepEqual(cli(['habitat','exchange-check',a.case_id,target]),grade,'Fresh Rust grade changed');
  assert.deepEqual(summary.results[i],{...a,grade});
  if(a.kind==='reference')assert(grade.exchange_passed);
  else assert(!grade.exchange_passed);
  if(a.kind==='no-child-ack') { assert(!grade.acknowledgment_passed);assert(grade.serviced!==null,'Removing ACK must preserve physical service'); }
  if(a.kind==='stray-report') { assert(!grade.acknowledgment_passed);assert(grade.acknowledgment!==null&&grade.serviced!==null); }
  if(a.kind==='forged-report'||a.kind==='early-ack')assert(!grade.acknowledgment_passed);
  if(a.kind==='wrong-winner'||a.kind==='no-request'||a.kind==='selector-bypass')assert(!grade.request_passed);
  if(a.kind==='missing-spare')assert(!grade.spare_preserved);
 }
 assert.equal(executions,ledger.attempts.length);
 console.log(`Checked Bloom exchange: ${ledger.plan.references.length} references, ${ledger.plan.controls.length} completed controls; ${executions} fresh replay executions.`);
} finally { fs.rmSync(temporary,{recursive:true,force:true}); }
