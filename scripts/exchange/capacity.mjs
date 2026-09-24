// Capture recorder lifetime resources, then seal a small public summary.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { sha, read } from '../bloom/common.mjs';
import { parseTime } from './capacity-io.mjs';

const directory=process.argv[2];assert(directory,'capacity.mjs NEW_DIRECTORY');
assert.equal(process.platform,'darwin','The frozen measurement uses macOS time -lp');
const lease=JSON.parse(process.env.HRA_LOCAL_EFFICIENCY_LEASE??'null');
assert.equal(lease?.mode,'exclusive');assert.equal(lease?.lane,'mac-native');
fs.mkdirSync(directory,{recursive:false});const root=fs.realpathSync(directory);
const command=[process.execPath,'scripts/exchange/capacity-record.mjs',path.join(root,'recording')];
fs.writeFileSync(path.join(root,'launch.json'),JSON.stringify({schema:'platonik-bloom-exchange-capacity-launch-v1',
  command:['node','scripts/exchange/capacity-record.mjs','recording'],protocol_sha256:sha(fs.readFileSync('scripts/exchange/capacity-protocol.json'))})+'\n',{flag:'wx'});
const stdout=fs.openSync(path.join(root,'recorder.stdout.json'),'wx'),stderr=fs.openSync(path.join(root,'recorder.stderr.txt'),'wx');
let result,elapsed_ms;
try{
  const began=process.hrtime.bigint();
  result=spawnSync('/usr/bin/time',['-lp',...command],{stdio:['ignore',stdout,stderr],timeout:300000,env:{...process.env,LC_ALL:'C'}});
  elapsed_ms=Number(process.hrtime.bigint()-began)/1e6;
}finally{fs.closeSync(stdout);fs.closeSync(stderr);}
if(result.error)throw result.error;assert.equal(result.status,0,'Recorder failed; preserve and inspect its directory');
const raw=fs.readFileSync(path.join(root,'recorder.stdout.json'),'utf8'),osOutput=fs.readFileSync(path.join(root,'recorder.stderr.txt'),'utf8');
const measurement=JSON.parse(raw),protocol=read('scripts/exchange/capacity-protocol.json'),limits=protocol.limits;
assert.equal(measurement.protocol_sha256,sha(fs.readFileSync('scripts/exchange/capacity-protocol.json')));
const resources=parseTime(osOutput);
const criteria={
  accounting:measurement.engine_executions===148&&measurement.cli_calls===162&&measurement.attempts===74,
  latency:measurement.distributions.every(w=>w.run.p95_ms<=limits.operation_p95_ms&&w.verify.p95_ms<=limits.operation_p95_ms),
  cli_memory:measurement.maximum_cli_peak_rss_bytes<=limits.cli_peak_rss_bytes,
  recorder_memory:resources.peak_rss_bytes<=limits.recorder_peak_rss_bytes&&measurement.recorder_self_resource_usage.maxRSS*1024<=limits.recorder_peak_rss_bytes,
  receipt_size:measurement.maximum_receipt_bytes<=limits.receipt_bytes,
  logical_storage:measurement.archive.logical_bytes<=limits.logical_archive_bytes,
  compressed_storage:measurement.archive.compressed_bytes<=limits.compressed_archive_bytes,
};
const summary={schema:'platonik-bloom-exchange-capacity-v1',protocol,measurement,
  recorder:{command:['/usr/bin/time','-lp','node','scripts/exchange/capacity-record.mjs','recording'],
    exit_code:result.status,signal:result.signal,elapsed_ms,stdout:raw,stderr:osOutput,stdout_sha256:sha(raw),stderr_sha256:sha(osOutput),resources},
  criteria,capacity_passed:Object.values(criteria).every(Boolean)};
fs.writeFileSync(path.join(root,'summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({capacity_passed:summary.capacity_passed,engine_executions:measurement.engine_executions,
  archive:measurement.archive,maximum_cli_peak_rss_bytes:measurement.maximum_cli_peak_rss_bytes,recorder_peak_rss_bytes:resources.peak_rss_bytes,
  distributions:measurement.distributions}));
