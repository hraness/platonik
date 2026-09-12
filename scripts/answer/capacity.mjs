// Measure the actual campaign inputs, then verify two already completed histories.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createLedger,runner} from "./runner.mjs";
import {read,write,sha,identity,protocol,checkedFreeze} from "./common.mjs";
const [directory,coordinatorDirectory]=process.argv.slice(2);assert(directory&&coordinatorDirectory);
const frozen=checkedFreeze(),plan=protocol(),coordinator=read(path.join(coordinatorDirectory,"ledger.json"));assert(coordinator.finished);
const executable=path.resolve("target/release/examples/answer_capacity");assert.equal(sha(fs.readFileSync(executable)),frozen.source.capacity_binary_sha256);
const ledger=createLedger(directory,256,{owner:"capacity",source_digest:identity(frozen.source),platform:process.platform,architecture:process.arch,cpu:os.cpus()[0]?.model??null,
 malloc_nano_zone:process.env.MallocNanoZone??null,benchmark_binary_sha256:frozen.source.capacity_binary_sha256,histories:[]});
const run=runner(directory,ledger);
const measured=run.cli(plan.capacity.cases.map(id=>`fixtures/evidence/answer-cases/${id}.json`),{executable,metricsPrefix:false,captureRss:true,reservation:124,accepted:[0]});
assert.equal(measured.value.schema,"platonik-answer-capacity-v1");assert.equal(measured.call.metrics.engine_executions,124);assert.equal(measured.value.engine_executions,124);
write(path.join(run.root,"measurement.json"),measured.value);ledger.measurement="measurement.json";ledger.measurement_sha256=sha(fs.readFileSync(path.join(run.root,ledger.measurement)));ledger.peak_rss_bytes=measured.call.peak_rss_bytes;run.save();
for(const row of coordinator.replays.slice(0,2)) {
 const final=path.join(coordinatorDirectory,row.bundle),raw=fs.readFileSync(final);assert.equal(sha(raw),row.bundle_sha256);
 const save=path.relative(process.cwd(),path.resolve(coordinatorDirectory,row.id,"restored-38"));
 const verified=run.cli(["habitat","journey",save],{captureRss:true,reservation:32,accepted:[0]});
 assert.deepEqual(verified.value.journey,row.journey);assert.equal(verified.value.habitat.result_hash,row.result_hash);
 ledger.histories.push({id:row.id,result_hash:row.result_hash,bundle_sha256:row.bundle_sha256,bundle_bytes:raw.length,call:verified.call.index,elapsed_ms:verified.call.elapsed_ms,peak_rss_bytes:verified.call.peak_rss_bytes});run.save();
}
ledger.finished={passed:ledger.histories.length===2&&ledger.peak_rss_bytes<=plan.capacity.acceptance.peak_rss_bytes&&ledger.histories.every(row=>row.peak_rss_bytes<=plan.capacity.acceptance.peak_rss_bytes&&row.bundle_bytes<=plan.capacity.acceptance.completed_bundle_bytes)&&measured.value.workloads.every(row=>[row.warmup,...row.samples].every(sample=>sample.receipt_bytes<=plan.capacity.acceptance.receipt_bytes)),thresholds:plan.capacity.acceptance};
run.save();console.log(JSON.stringify({engine_executions:ledger.engine_executions,peak_rss_bytes:ledger.peak_rss_bytes,finished:ledger.finished}));
