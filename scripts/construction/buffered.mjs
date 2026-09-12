// A separate, fixed serialization experiment. Never reruns the construction study.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const stem = "fixtures/evidence/construction-memory";
const source = "crates/platonik-core/examples/construction_capacity.rs";
const binary = "target/release/examples/construction_capacity";
const script = "scripts/construction/buffered.mjs";
const sha = value => createHash("sha256").update(value).digest("hex");
const read = file => JSON.parse(fs.readFileSync(file));
const hash = file => sha(fs.readFileSync(file));
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
function originalSources() {
  const frozen = read("fixtures/evidence/construction-freeze.json");
  const repair = read("fixtures/evidence/construction-repairs/import-envelope/repair.json");
  assert.equal(hash("fixtures/evidence/construction-repairs/import-envelope/repair.json"), read("fixtures/evidence/construction-study.json").artifacts["fixtures/evidence/construction-repairs/import-envelope/repair.json"].sha256);
  assert.deepEqual(repair.changes.map(row => row.file), ["scripts/construction/common.mjs", "scripts/construction/trajectory.mjs"]);
  const expected = { ...frozen.source.source_files_sha256 };
  for (const change of repair.changes) {
    assert.equal(expected[change.file], change.before_sha256);
    expected[change.file] = change.after_sha256;
  }
  assert.equal(hash(`${stem}/baseline-capacity.rs`), expected[source]);
  expected[source] = hash(source);
  for (const [file, digest] of Object.entries(expected)) assert.equal(hash(file), digest, `Undeclared source change: ${file}`);
  assert.equal(hash("target/release/platonik"), frozen.source.release_binary_sha256);
  return expected;
}
const [operation] = process.argv.slice(2);
if (operation === "freeze") {
  const sources = originalSources();
  const nativeFiles = ["probe.rs", "run.mjs", "default-run.mjs", "result.json", "default-result.json",
    "growth-sampled.ndjson", "reserved-sampled.ndjson", "exact-sampled.ndjson", "reuse-sampled.ndjson", "growth-batch.ndjson",
    "default-growth-sampled.ndjson", "default-reserved-sampled.ndjson"].map(name => `${stem}/native/${name}`);
  nativeFiles.forEach(hash);
  const protocol = { schema: "platonik-construction-buffered-protocol-v1",
    baseline_study: "fixtures/evidence/construction-study.json", baseline_capacity: "fixtures/evidence/construction-capacity.json",
    mode: "--measure-buffered", maximum_engine_executions: 256, expected_engine_executions: 124,
    workloads: ["four-near-cap-partial", "four-born-sixteen-live"], warmups_per_workload: 1, samples_per_workload: 30,
    buffer_capacity_bytes: 8388608, buffer_retained_during_rss: true,
    native_probe_files: nativeFiles,
    scope: "One repeated release process, same inputs and run/check/serialize/verify work as the preserved baseline. A fixed reusable serialization buffer remains allocated during RSS observations. Additional byte-identity checking is reported separately. No original study, saved history, optimizer, or runtime semantics are rerun or changed.",
    baseline_allocator_environment: "Not recorded by the original benchmark; do not infer environment-wide conclusions from this comparison." };
  write(`${stem}/protocol.json`, protocol);
  fs.writeFileSync(`${stem}/buffered-capacity.rs`, fs.readFileSync(source), { flag: "wx" });
  fs.writeFileSync(`${stem}/capture.mjs`, fs.readFileSync(script), { flag: "wx" });
  const files = ["fixtures/evidence/construction-freeze.json", protocol.baseline_study, protocol.baseline_capacity,
    "fixtures/evidence/construction-repairs/import-envelope/repair.json",
    `${stem}/protocol.json`, `${stem}/baseline-capacity.rs`, `${stem}/buffered-capacity.rs`, `${stem}/capture.mjs`, ...nativeFiles];
  write(`${stem}/freeze.json`, { schema: "platonik-construction-buffered-freeze-v1", files: Object.fromEntries(files.map(file => [file, hash(file)])),
    current_source_files_sha256: sources, benchmark_binary_file: binary, benchmark_binary_sha256: hash(binary) });
  console.log("Separate buffered benchmark frozen; zero engine executions.");
} else if (operation === "measure") {
  const protocol = read(`${stem}/protocol.json`), frozen = read(`${stem}/freeze.json`);
  for (const [file, digest] of Object.entries(frozen.files)) assert.equal(hash(file), digest);
  assert.deepEqual(originalSources(), frozen.current_source_files_sha256);
  assert.equal(hash(script), frozen.files[`${stem}/capture.mjs`]);
  assert.equal(hash(binary), frozen.benchmark_binary_sha256); assert.equal(process.platform, "darwin");
  const attemptFile = `${stem}/attempt.json`;
  const attempt = { schema: "platonik-construction-buffered-attempt-v1", freeze_sha256: hash(`${stem}/freeze.json`),
    args: [protocol.mode], reserved_engine_executions: 124, maximum_engine_executions: 256,
    environment: { platform: process.platform, architecture: process.arch, release: os.release(), cpu: os.cpus()[0]?.model ?? null,
      malloc_nano_zone: process.env.MallocNanoZone ?? null }, pending: true };
  write(attemptFile, attempt); // Existing attempt prevents a silent retry, including failed launches.
  const began = process.hrtime.bigint();
  const result = spawnSync("/usr/bin/time", ["-l", path.resolve(binary), protocol.mode],
    { encoding: "utf8", timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  attempt.elapsed_ms = Number(process.hrtime.bigint() - began) / 1e6;
  const stdout = `${stem}/measurement.json`, stderr = `${stem}/measurement.stderr.txt`;
  fs.writeFileSync(stdout, result.stdout ?? "", { flag: "wx" }); fs.writeFileSync(stderr, result.stderr ?? "", { flag: "wx" });
  attempt.stdout = { file: stdout, sha256: hash(stdout), bytes: fs.statSync(stdout).size };
  attempt.stderr = { file: stderr, sha256: hash(stderr), bytes: fs.statSync(stderr).size };
  attempt.exit_code = result.status; attempt.launch_error = result.error ? String(result.error.code ?? "launch-failed") : null;
  const lines = (result.stderr ?? "").split("\n").filter(line => line.startsWith("{"));
  let metrics = [];
  try { metrics = lines.map(JSON.parse).filter(row => row.schema === "platonik-process-metrics-v1"); } catch { /* Recorded below as unknown accounting. */ }
  attempt.metrics = metrics.length === 1 ? metrics[0] : null;
  attempt.engine_executions = attempt.metrics?.engine_executions ?? null;
  attempt.accounting_unknown = !Number.isSafeInteger(attempt.engine_executions) || attempt.engine_executions < 0;
  const peak = /\b(\d+)\s+maximum resident set size/.exec(result.stderr ?? "");
  attempt.peak_rss_bytes = peak ? Number(peak[1]) : null; attempt.pending = false;
  fs.writeFileSync(attemptFile, `${JSON.stringify(attempt, null, 2)}\n`);
  assert(!result.error && result.status === 0, "Preserve failed benchmark attempt; do not silently retry.");
  assert(!attempt.accounting_unknown); assert.equal(attempt.engine_executions, 124); assert(attempt.engine_executions <= 256);
  assert(Number.isSafeInteger(attempt.peak_rss_bytes) && attempt.peak_rss_bytes > 0);
  console.log(JSON.stringify({ attempt: attemptFile, engine_executions: attempt.engine_executions, peak_rss_bytes: attempt.peak_rss_bytes }));
} else throw new Error("Usage: buffered.mjs freeze|measure");
