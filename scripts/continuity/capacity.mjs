import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLedger, runner, protocol, verifyFreeze, identity } from "./runner.mjs";
const [directory, save, bundle] = process.argv.slice(2);
assert(directory && save && bundle, "Use new capacity directory, completed habitat save, exported bundle");
const frozen = verifyFreeze();
const ledger = createLedger(directory, protocol().budget.parallel_reservations.capacity,
  { owner: "capacity", source_tree_digest: frozen.source_tree_digest,
    scope: "30 separate release CLI verifications of one completed eight-advance save. End-to-end includes process launch, filesystem reads, parsing, replay, serialization and time-wrapper overhead. Warm local files; host is not isolated. Rust peak RSS excludes agent and Node memory. This does not qualify larger worlds or unlimited journals.",
    platform: process.platform, architecture: process.arch, cpus: os.cpus()[0]?.model ?? null,
    artifact_bytes: fs.statSync(bundle).size, samples: [] });
const run = runner(directory, ledger);
let expected;
for (let index = 0; index < 30; index++) {
  const { value, call } = run.cli(["habitat", "verify", path.resolve(save)], { captureRss: true });
  assert.equal(value.phase, "finished"); assert.equal(value.revision, 16);
  const hash = identity(value); expected ??= hash; assert.equal(hash, expected);
  ledger.samples.push({ index, elapsed_ms: call.elapsed_ms, peak_rss_bytes: call.peak_rss_bytes,
    engine_executions: call.metrics.engine_executions, result_hash: value.result_hash }); run.save();
}
const times = ledger.samples.map(sample => sample.elapsed_ms).toSorted((a, b) => a - b);
Object.assign(ledger, { finished: true, p50_ms: (times[14] + times[15]) / 2, p95_ms: times[28],
  peak_rss_bytes: Math.max(...ledger.samples.map(sample => sample.peak_rss_bytes)) }); run.save();
console.log(JSON.stringify({ engine_executions: ledger.engine_executions, p50_ms: ledger.p50_ms,
  p95_ms: ledger.p95_ms, peak_rss_bytes: ledger.peak_rss_bytes, artifact_bytes: ledger.artifact_bytes }));
