// Independent data admission of one additive benchmark; no engine execution.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const stem = "fixtures/evidence/construction-memory";
const sha = value => createHash("sha256").update(value).digest("hex");
const bytes = file => { assert(!file.startsWith("/") && !file.split("/").includes("..")); const stat = fs.lstatSync(file); assert(stat.isFile() && stat.size <= 16 * 1024 * 1024); return fs.readFileSync(file); };
const read = file => JSON.parse(bytes(file));
const hash = file => sha(bytes(file));
const protocol = read(`${stem}/protocol.json`), frozen = read(`${stem}/freeze.json`), attempt = read(`${stem}/attempt.json`);
assert.equal(protocol.schema, "platonik-construction-buffered-protocol-v1");
assert.equal(frozen.schema, "platonik-construction-buffered-freeze-v1");
assert.equal(attempt.schema, "platonik-construction-buffered-attempt-v1");
assert.equal(attempt.freeze_sha256, hash(`${stem}/freeze.json`));
assert.deepEqual([protocol.mode, protocol.maximum_engine_executions, protocol.expected_engine_executions,
  protocol.warmups_per_workload, protocol.samples_per_workload, protocol.buffer_capacity_bytes, protocol.buffer_retained_during_rss],
  ["--measure-buffered", 256, 124, 1, 30, 8388608, true]);
assert.deepEqual(protocol.workloads, ["four-near-cap-partial", "four-born-sixteen-live"]);
assert.deepEqual([protocol.baseline_study, protocol.baseline_capacity], ["fixtures/evidence/construction-study.json", "fixtures/evidence/construction-capacity.json"]);
const nativeFiles = ["probe.rs", "run.mjs", "default-run.mjs", "result.json", "default-result.json",
  "growth-sampled.ndjson", "reserved-sampled.ndjson", "exact-sampled.ndjson", "reuse-sampled.ndjson", "growth-batch.ndjson",
  "default-growth-sampled.ndjson", "default-reserved-sampled.ndjson"].map(name => `${stem}/native/${name}`);
assert.deepEqual(protocol.native_probe_files, nativeFiles);
const expectedFiles = ["fixtures/evidence/construction-freeze.json", protocol.baseline_study, protocol.baseline_capacity,
  "fixtures/evidence/construction-repairs/import-envelope/repair.json",
  `${stem}/protocol.json`, `${stem}/baseline-capacity.rs`, `${stem}/buffered-capacity.rs`, `${stem}/capture.mjs`, ...nativeFiles];
assert.deepEqual(Object.keys(frozen.files), expectedFiles);
for (const [file, digest] of Object.entries(frozen.files)) assert.equal(hash(file), digest);
const native = read(`${stem}/native/result.json`), pair = read(`${stem}/native/default-result.json`);
assert.equal(native.schema, "platonik-zero-engine-rss-diagnostic-v1");
assert.equal(pair.schema, "platonik-zero-engine-rss-default-pair-v1");
assert.equal(native.source_sha256, hash(`${stem}/native/probe.rs`));
assert.equal(native.driver_sha256, hash(`${stem}/native/run.mjs`));
assert.equal(pair.driver_sha256, hash(`${stem}/native/default-run.mjs`));
assert.equal(pair.original_result_sha256, hash(`${stem}/native/result.json`));
assert.equal(pair.binary_sha256, native.binary_sha256); assert.match(native.binary_sha256, /^[a-f0-9]{64}$/);
assert.deepEqual(native.modes, ["growth-sampled", "reserved-sampled", "exact-sampled", "reuse-sampled", "growth-batch"]);
assert.deepEqual(pair.modes, ["growth-sampled", "reserved-sampled"]);
assert.equal(native.allocator_environment.MallocNanoZone, "0");
assert.equal(pair.parent_malloc_nano_zone, "0"); assert.equal(pair.child_malloc_nano_zone, null);
assert.deepEqual([pair.rustc, pair.os, pair.architecture], [native.rustc, native.os, native.architecture]);
for (const [record, prefix] of [[native, ""], [pair, "default-"]]) {
  assert.equal(record.engine_executions, 0); assert.equal(record.iterations_per_length, 8);
  assert.deepEqual(record.lengths, [4399674, 5077003]);
  assert.deepEqual(record.results.map(result => result.mode), record.modes);
  for (const result of record.results) {
    const raw = bytes(`${stem}/native/${prefix}${result.mode}.ndjson`).toString();
    assert.deepEqual(raw.trim().split("\n").map(JSON.parse), result.rows);
    const completed = result.rows.at(-1); assert.equal(completed.kind, "complete"); assert.equal(completed.engine_executions, 0);
    assert.equal(completed.mode, result.mode); assert(Number.isSafeInteger(completed.elapsed_micros) && completed.elapsed_micros >= 0);
    const batches = result.rows.filter(row => row.kind === "batch"); assert.deepEqual(batches.map(row => row.length), record.lengths);
    for (const row of batches) {
      assert.equal(row.mode, result.mode); assert.equal(row.iterations, 8);
      assert(Number.isSafeInteger(row.rss_before_bytes) && row.rss_before_bytes > 0);
      assert(Number.isSafeInteger(row.rss_after_release_bytes) && row.rss_after_release_bytes > 0);
      assert(Number.isSafeInteger(row.distinct_addresses) && row.distinct_addresses >= 1 && row.distinct_addresses <= 8);
    }
    const samples = result.rows.filter(row => row.kind === "sample"); assert.equal(samples.length, result.mode === "growth-batch" ? 0 : 16);
    for (const [index, row] of samples.entries()) {
      assert.equal(row.mode, result.mode); assert.equal(row.length, record.lengths[Math.floor(index/8)]); assert.equal(row.iteration, index%8+1);
      assert.equal(row.capacity, result.mode === "exact-sampled" ? row.length : 8388608);
      assert.equal(row.buffer_retained, result.mode === "reuse-sampled"); assert(Number.isSafeInteger(row.rss_bytes) && row.rss_bytes > 0);
    }
    assert.equal(result.rows.length, samples.length + batches.length + 1);
  }
}
assert.equal(frozen.benchmark_binary_file, "target/release/examples/construction_capacity");
assert.match(frozen.benchmark_binary_sha256, /^[a-f0-9]{64}$/);
const originalFreeze = read("fixtures/evidence/construction-freeze.json"), source = "crates/platonik-core/examples/construction_capacity.rs";
assert.equal(hash(`${stem}/baseline-capacity.rs`), originalFreeze.source.source_files_sha256[source]);
// Publication removed exactly one redundant EOF newline from this helper.
// Reconstruct its original bytes for both preserved source freezes; no study
// input, recorded artifact, or original freeze is rewritten by normalization.
const runnerFile = "scripts/construction/runner.mjs";
const originalRunnerHash = sha(Buffer.concat([bytes(runnerFile), Buffer.from("\n")]));
assert.equal(originalRunnerHash, originalFreeze.source.source_files_sha256[runnerFile]);
assert.equal(originalRunnerHash, frozen.current_source_files_sha256[runnerFile]);
const sourceHashes = { ...originalFreeze.source.source_files_sha256 };
const repair = read("fixtures/evidence/construction-repairs/import-envelope/repair.json");
assert.equal(hash("fixtures/evidence/construction-repairs/import-envelope/repair.json"), read(protocol.baseline_study).artifacts["fixtures/evidence/construction-repairs/import-envelope/repair.json"].sha256);
assert.deepEqual(repair.changes.map(row => row.file), ["scripts/construction/common.mjs", "scripts/construction/trajectory.mjs"]);
for (const change of repair.changes) { assert.equal(sourceHashes[change.file], change.before_sha256); sourceHashes[change.file] = change.after_sha256; }
sourceHashes[source] = hash(`${stem}/buffered-capacity.rs`);
assert.deepEqual(frozen.current_source_files_sha256, sourceHashes);
// Preserve the historical original measurements, not current executable bytes.
const study = read(protocol.baseline_study), baseline = read(protocol.baseline_capacity);
assert.equal(study.capacity.measurement_sha256, hash(protocol.baseline_capacity));
assert.deepEqual([attempt.args, attempt.reserved_engine_executions, attempt.maximum_engine_executions], [["--measure-buffered"], 124, 256]);
assert.equal(attempt.pending, false); assert.equal(attempt.accounting_unknown, false); assert.equal(attempt.exit_code, 0); assert.equal(attempt.launch_error, null);
assert.deepEqual([attempt.stdout.file, attempt.stderr.file], [`${stem}/measurement.json`, `${stem}/measurement.stderr.txt`]);
for (const row of [attempt.stdout, attempt.stderr]) { assert.equal(hash(row.file), row.sha256); assert.equal(bytes(row.file).length, row.bytes); }
const stderr = bytes(attempt.stderr.file).toString();
const metrics = stderr.split("\n").filter(line => line.startsWith("{")).map(JSON.parse).filter(row => row.schema === "platonik-process-metrics-v1");
assert.equal(metrics.length, 1); assert.deepEqual(metrics[0], attempt.metrics); assert.equal(metrics[0].engine_executions, 124);
assert.equal(attempt.engine_executions, 124); assert(attempt.engine_executions <= attempt.reserved_engine_executions);
assert(Number.isSafeInteger(metrics[0].elapsed_micros) && metrics[0].elapsed_micros >= 0);
assert(Number.isFinite(attempt.elapsed_ms) && attempt.elapsed_ms > 0);
const peak = /\b(\d+)\s+maximum resident set size/.exec(stderr); assert(peak);
assert.equal(attempt.peak_rss_bytes, Number(peak[1])); assert(Number.isSafeInteger(attempt.peak_rss_bytes) && attempt.peak_rss_bytes > 0);
assert.equal(attempt.environment.platform, "darwin"); assert.equal(attempt.environment.architecture, study.capacity.architecture);
assert.equal(attempt.environment.cpu, study.capacity.cpu);
assert(attempt.environment.malloc_nano_zone === null || typeof attempt.environment.malloc_nano_zone === "string");
const measured = read(attempt.stdout.file);
assert.equal(measured.schema, "platonik-construction-capacity-buffered-v1");
assert.deepEqual([measured.buffer_strategy, measured.buffer_capacity_bytes, measured.buffer_retained_during_rss], ["fixed reusable Vec with bounded Write", 8388608, true]);
assert.equal(measured.engine_executions, 124); assert.deepEqual(measured.workloads.map(row => row.id), protocol.workloads);
let observed = 0, observedSampleMs = 0;
for (const [index, workload] of measured.workloads.entries()) {
  const original = baseline.workloads[index], recorded = study.capacity.replays[index];
  assert.equal(workload.id, original.id); assert.equal(workload.experiment_hash, original.experiment_hash);
  assert.deepEqual(workload.experiment, original.experiment); assert.equal(workload.samples.length, 30);
  const meta = study.artifacts[recorded.receipt_file]; assert(meta);
  const compressed = bytes(recorded.receipt_file); assert.equal(sha(compressed), meta.sha256);
  const raw = gunzipSync(compressed, { maxOutputLength: 8 * 1024 * 1024 });
  assert.equal(raw.length, meta.uncompressed_bytes); assert.equal(sha(raw), meta.uncompressed_sha256);
  const receipt = JSON.parse(raw), canonical = JSON.stringify(receipt), serializedHash = `sha256:${sha(canonical)}`;
  assert.equal(receipt.result_hash, recorded.result_hash); assert.equal(receipt.experiment_hash, workload.experiment_hash);
  assert.deepEqual(receipt.experiment, workload.experiment); assert.equal(`sha256:${sha(JSON.stringify(receipt.result))}`, receipt.result_hash);
  const samples = [workload.warmup, ...workload.samples], oldSamples = [original.warmup, ...original.samples];
  for (const [sampleIndex, sample] of samples.entries()) {
    assert.equal(sample.engine_executions, 2); observed += sample.engine_executions;
    assert.equal(sample.result_hash, receipt.result_hash); assert.equal(sample.result_hash, oldSamples[sampleIndex].result_hash);
    assert.equal(sample.serialized_receipt_sha256, serializedHash);
    assert.equal(sample.receipt_bytes, Buffer.byteLength(canonical)); assert.equal(sample.receipt_bytes, oldSamples[sampleIndex].receipt_bytes);
    assert.equal(sample.serialization_capacity_bytes, 8388608); assert(sample.receipt_bytes <= sample.serialization_capacity_bytes);
    for (const key of ["receipt_ms", "serialize_ms", "verify_ms", "total_ms", "identity_check_ms", "full_sample_ms"])
      assert(Number.isFinite(sample[key]) && sample[key] >= 0);
    assert(sample.total_ms >= sample.receipt_ms + sample.serialize_ms + sample.verify_ms - 0.001);
    assert(sample.full_sample_ms >= sample.total_ms + sample.identity_check_ms - 0.001);
    observedSampleMs += sample.full_sample_ms;
    const rss = sample.rss_after_release;
    assert.deepEqual([rss.source, rss.platform], ["ps RSS in KiB", "macos"]);
    if (rss.bytes === null) assert(typeof rss.error === "string" && rss.error.length > 0);
    else { assert(Number.isSafeInteger(rss.bytes) && rss.bytes > 0); assert.equal(rss.error, null); }
  }
  const times = workload.samples.map(row => row.total_ms).sort((a,b) => a-b);
  assert.equal(workload.p50_ms, times[14]); assert.equal(workload.p95_ms, times[28]);
}
assert.equal(observed, 124);
assert(metrics[0].elapsed_micros / 1000 >= observedSampleMs - 0.1);
assert(attempt.elapsed_ms >= metrics[0].elapsed_micros / 1000 - 1);
console.log(`Checked additive construction buffer experiment: 124 recorded executions, 62 exact receipt-byte identities, 0 fresh engine executions; peak RSS ${attempt.peak_rss_bytes} bytes.`);
