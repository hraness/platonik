// Measure already-built prescribed Rust workloads in one process. No agent search.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLedger, runner, sha, identity } from "./runner.mjs";
import { trajectory } from "./trajectory.mjs";
import { protocol, checkedFreeze, write } from "./common.mjs";
const [directory] = process.argv.slice(2); assert(directory, "capacity.mjs NEW_DIRECTORY");
const frozen = checkedFreeze(), plan = protocol();
const executable = path.resolve("target/release/examples/construction_capacity");
assert.equal(sha(fs.readFileSync(executable)), frozen.source.capacity_binary_sha256, "Frozen capacity executable");
const ledger = createLedger(directory, plan.budget.capacity_engine_executions, {
  owner: "capacity", source_digest: identity(frozen.source), samples: [],
  platform: process.platform, architecture: process.arch, cpu: os.cpus()[0]?.model ?? null,
  benchmark_binary_sha256: sha(fs.readFileSync(executable)), replays: [],
  scope: "Two fixed v3 workloads in one release process: one warmup and 30 measured repetitions each. Receipts are not retained between samples. Timings include Rust run/check, serialization and fresh verification; process peak RSS is measured separately and includes both workloads. This does not establish unbounded journals, all possible programs, throughput on other hardware, or an entire ecology.",
});
const run = runner(directory, ledger);
const { value, call } = run.cli(["--measure"], { executable, metricsPrefix: false, captureRss: true,
  reservation: 124, accepted: [0] });
assert.equal(value.schema, "platonik-construction-capacity-v1");
assert.equal(value.engine_executions, call.metrics.engine_executions);
assert.equal(value.workloads.length, 2);
for (const workload of value.workloads) {
  assert.equal(workload.samples.length, 30); assert.equal(workload.experiment.version, 3);
  assert(/^sha256:[a-f0-9]{64}$/.test(workload.experiment_hash));
  assert(workload.samples.every(sample => sample.result_hash === workload.samples[0].result_hash));
}
write(path.join(run.root, "measurement.json"), value);
ledger.measurement = "measurement.json"; ledger.measurement_sha256 = sha(fs.readFileSync(path.join(run.root, ledger.measurement)));
ledger.peak_rss_bytes = call.peak_rss_bytes; run.save();
for (const workload of value.workloads) {
  const replay = trajectory(run, `capacity-${workload.id}`, workload.experiment,
    { cuts: [1, 2, 8, 16, 32, 64, 96, 128], restoreTicks: [8, 64] });
  ledger.replays.push(replay); run.save();
  const saved = run.cli(["habitat", "verify", path.join(run.root, replay.id, "restored-64")],
    { captureRss: true, accepted: [0] });
  assert.equal(saved.value.result_hash, replay.result_hash);
  replay.saved_verification_call = saved.call.index;
  replay.saved_verification_ms = saved.call.elapsed_ms;
  replay.saved_verification_peak_rss_bytes = saved.call.peak_rss_bytes;
  run.save();
}
ledger.finished = true; run.save();
console.log(JSON.stringify({ engine_executions: ledger.engine_executions, peak_rss_bytes: ledger.peak_rss_bytes,
  workloads: value.workloads.map(row => ({ id: row.id, p50_ms: row.p50_ms, p95_ms: row.p95_ms })) }, null, 2));
