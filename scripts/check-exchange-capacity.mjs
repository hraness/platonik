// Admit retained capacity measurements and replay outcomes, without retiming them.
// Keep parsing and acceptance independent from the recorder and archive writer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';

const MAX_ENTRY = 32 * 1024 * 1024;
const MAX_ARCHIVE = 64 * 1024 * 1024;
const references = ['bloom-exchange-left', 'bloom-exchange-right', 'bloom-exchange-left-delay', 'bloom-exchange-right-delay', 'bloom-exchange-rotated-left', 'bloom-exchange-rotated-right'];
const controls = ['no-child-ack', 'forged-report', 'wrong-winner', 'early-ack', 'no-request', 'missing-spare', 'selector-bypass', 'stray-report'];
const representatives = ['bloom-exchange-left', 'bloom-exchange-rotated-right'];
const limits = { operation_p95_ms: 500, cli_peak_rss_bytes: 268435456, recorder_peak_rss_bytes: 268435456,
  receipt_bytes: 8388608, logical_archive_bytes: 1073741824, compressed_archive_bytes: 67108864 };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const integer = value => assert(Number.isSafeInteger(value) && value >= 0, `Invalid nonnegative integer: ${value}`);
const positive = value => { integer(value); assert(value > 0); };
const finite = value => assert(typeof value === 'number' && Number.isFinite(value) && value >= 0);
const utcTimestamp = value => {
  assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value));
  const timestamp = Date.parse(value); assert(Number.isFinite(timestamp));
  assert.equal(new Date(timestamp).toISOString(), value); return timestamp;
};
const hash = value => assert(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value));
const object = value => assert(value !== null && typeof value === 'object' && !Array.isArray(value));
const keys = (value, expected) => { object(value); assert.deepEqual(Object.keys(value).sort(), [...expected].sort()); };
const safeName = value => {
  assert(typeof value === 'string' && value.length > 0 && !value.includes('\\') && !value.includes('\0'));
  assert(!path.posix.isAbsolute(value) && path.posix.normalize(value) === value);
  assert(value.split('/').every(part => part !== '' && part !== '.' && part !== '..'));
};
function boundedFile(name, limit = MAX_ARCHIVE) {
  const info = fs.statSync(name); assert(info.isFile() && info.size <= limit);
  const bytes = fs.readFileSync(name); assert(bytes.length <= limit); return bytes;
}

function timeFields(text) {
  assert.equal(typeof text, 'string');
  const found = {};
  const put = (key, token, whole = false) => {
    assert(!Object.hasOwn(found, key), `Duplicate measured time field ${key}`);
    assert(typeof token === 'string' && (whole ? /^\d+$/ : /^\d+(?:\.\d+)?$/).test(token));
    const number = Number(token); finite(number);
    if (whole) positive(number);
    found[key] = number;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const timing = /^(real|user|sys)\b(.*)$/.exec(line);
    if (timing) put(timing[1], timing[2].trim());
    else if (line.includes('maximum resident set size')) {
      const rss = /^(\S+)\s+maximum resident set size$/.exec(line);
      put('rss', rss?.[1], true);
    }
  }
  keys(found, ['real', 'user', 'sys', 'rss']);
  return { wall_seconds: found.real, user_seconds: found.user, system_seconds: found.sys, peak_rss_bytes: found.rss };
}
function processMetrics(text, expected) {
  const records = [];
  for (const line of text.split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
    if (!/^[{\[]/.test(line) && !line.includes('platonik-process-metrics-v1')) continue;
    const record = JSON.parse(line);
    if (record?.schema === 'platonik-process-metrics-v1') records.push(record);
  }
  assert.equal(records.length, 1, 'A call needs exactly one intact execution counter');
  const record = records[0]; integer(record.engine_executions); integer(record.elapsed_micros);
  assert.equal(record.engine_executions, expected);
  return record;
}

const summary = JSON.parse(boundedFile('fixtures/evidence/exchange-capacity.json'));
assert.equal(summary.schema, 'platonik-bloom-exchange-capacity-v1');
const protocolBytes = boundedFile('scripts/exchange/capacity-protocol.json');
const protocol = JSON.parse(protocolBytes);
assert.deepEqual(summary.protocol, protocol);
assert.equal(protocol.schema, 'platonik-bloom-exchange-capacity-protocol-v1');
assert.deepEqual(protocol.references, references); assert.deepEqual(protocol.controls, controls);
assert.equal(protocol.control_case, references[0]); assert.deepEqual(protocol.representatives, representatives);
assert.equal(protocol.samples_per_representative, 30); assert.equal(protocol.maximum_engine_executions, 148);
assert.equal(protocol.expected_cli_calls, 162); assert.deepEqual(protocol.limits, limits);
assert.deepEqual(protocol.packing_safety, { entry_bytes: MAX_ENTRY, file_count: 1024,
  encoded_envelope_bytes: MAX_ARCHIVE, compressed_archive_bytes: MAX_ARCHIVE });
const qualificationBytes = boundedFile('fixtures/evidence/exchange-qualification.json');
const qualification = JSON.parse(qualificationBytes);
assert.equal(qualification.schema, 'platonik-bloom-exchange-qualification-v1');
const measurement = summary.measurement;
assert.equal(measurement.schema, 'platonik-bloom-exchange-capacity-measurement-v1');
assert.equal(measurement.protocol_sha256, sha(protocolBytes));
assert.equal(measurement.qualification_sha256, sha(qualificationBytes));
assert.equal(measurement.engine_executions, 148); assert.equal(measurement.cli_calls, 162); assert.equal(measurement.attempts, 74);
assert(utcTimestamp(measurement.started_at) <= utcTimestamp(measurement.recorded_at));
assert(utcTimestamp(measurement.recorded_at) <= utcTimestamp(measurement.packed_at));
const recorder = summary.recorder;
assert.deepEqual(recorder.command, ['/usr/bin/time', '-lp', 'node', 'scripts/exchange/capacity-record.mjs', 'recording']);
assert.equal(recorder.exit_code, 0); assert.equal(recorder.signal, null); finite(recorder.elapsed_ms);
assert.equal(typeof recorder.stdout, 'string'); assert.equal(typeof recorder.stderr, 'string');
assert.equal(sha(recorder.stdout), recorder.stdout_sha256); assert.equal(sha(recorder.stderr), recorder.stderr_sha256);
assert.deepEqual(JSON.parse(recorder.stdout), measurement);
assert.deepEqual(timeFields(recorder.stderr), recorder.resources);
// The enclosing monotonic interval contains the measured process lifetime;
// time -p prints only two decimal places, so allow one 10 ms rounding unit.
assert(recorder.elapsed_ms + 10 >= recorder.resources.wall_seconds * 1000);

const archiveBytes = boundedFile('fixtures/evidence/exchange-capacity.json.gz');
assert.equal(archiveBytes.length, measurement.archive.compressed_bytes); assert.equal(sha(archiveBytes), measurement.archive.sha256);
const archive = JSON.parse(gunzipSync(archiveBytes, { maxOutputLength: MAX_ARCHIVE }));
keys(archive, ['schema', 'files', 'blobs']);
assert.equal(archive.schema, 'platonik-bloom-exchange-capacity-archive-v1');
object(archive.files); object(archive.blobs);
const names = Object.keys(archive.files); assert(names.length > 0 && names.length <= 1024);
const usedBlobs = new Map(); let logicalBytes = 0;
for (const name of names) {
  safeName(name); const entry = archive.files[name]; keys(entry, ['bytes', 'sha256']);
  integer(entry.bytes); assert(entry.bytes <= MAX_ENTRY); hash(entry.sha256);
  logicalBytes += entry.bytes; integer(logicalBytes);
  if (usedBlobs.has(entry.sha256)) assert.equal(usedBlobs.get(entry.sha256), entry.bytes);
  usedBlobs.set(entry.sha256, entry.bytes);
}
assert.deepEqual(Object.keys(archive.blobs).sort(), [...usedBlobs.keys()].sort(), 'No missing or unreferenced archive blobs');
function blobContent(id) {
  hash(id); const blob = archive.blobs[id]; keys(blob, ['gzip']);
  assert(typeof blob.gzip === 'string' && blob.gzip.length <= Math.ceil(MAX_ARCHIVE / 3) * 4);
  const compressed = Buffer.from(blob.gzip, 'base64');
  assert.equal(compressed.toString('base64'), blob.gzip, 'Noncanonical archive base64');
  const raw = gunzipSync(compressed, { maxOutputLength: MAX_ENTRY });
  assert.equal(raw.length, usedBlobs.get(id)); assert.equal(sha(raw), id); return raw;
}
// Validate one bounded blob at a time. Repeated logical outputs share a hash;
// they are never expanded into a many-receipt object graph.
let uniqueBytes = 0;
for (const id of usedBlobs.keys()) { uniqueBytes += blobContent(id).length; integer(uniqueBytes); }
assert.deepEqual(measurement.archive, { sha256: sha(archiveBytes), compressed_bytes: archiveBytes.length,
  logical_bytes: logicalBytes, unique_bytes: uniqueBytes, file_count: names.length, blob_count: usedBlobs.size });
const content = name => { assert(Object.hasOwn(archive.files, name), `Missing archive entry ${name}`); return blobContent(archive.files[name].sha256); };
const read = name => JSON.parse(content(name));
const ledger = read('ledger.json');
assert.equal(ledger.schema, 'platonik-bloom-exchange-capacity-ledger-v1');
assert.deepEqual(ledger.protocol, protocol); assert.equal(ledger.protocol_sha256, sha(protocolBytes));
assert.equal(ledger.qualification_sha256, sha(qualificationBytes));
assert.equal(ledger.pending_call, null); assert.equal(ledger.accounting_incomplete, false); assert.equal(ledger.stopped, null);
assert.equal(ledger.started_at, measurement.started_at);
assert.deepEqual(ledger.finished, { measurements_completed: true, engine_executions: 148, cli_calls: 162, attempts: 74,
  completed_at: measurement.recorded_at });
assert.equal(ledger.engine_executions, 148); assert.equal(ledger.calls.length, 162); assert.equal(ledger.attempts.length, 74);
assert.deepEqual(ledger.source, measurement.source); assert.equal(ledger.source.directory, 'source-0');
hash(ledger.source.binary_sha256); object(ledger.source.files);
for (const required of ['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'crates/platonik-cli/src/main.rs',
  'crates/platonik-core/src/bloom_exchange.rs', 'crates/platonik-core/src/bloom_exchange_fixtures.rs',
  'scripts/bloom/common.mjs', 'scripts/exchange/capacity-protocol.json', 'scripts/exchange/capacity.mjs',
  'scripts/exchange/capacity-record.mjs', 'scripts/exchange/capacity-io.mjs', 'fixtures/evidence/exchange-qualification.json']) {
  assert(Object.hasOwn(ledger.source.files, required), `Missing frozen source ${required}`);
}
for (const [file, expected] of Object.entries(ledger.source.files)) {
  safeName(file); hash(expected); assert.equal(sha(content(`${ledger.source.directory}/${file}`)), expected);
}
assert.equal(ledger.source.files['scripts/exchange/capacity-protocol.json'], sha(protocolBytes));
assert.equal(ledger.source.files['fixtures/evidence/exchange-qualification.json'], sha(qualificationBytes));
const expectedNames = ['ledger.json', ...Object.keys(ledger.source.files).map(file => `${ledger.source.directory}/${file}`),
  ...ledger.calls.flatMap(call => [call.stdout, call.stderr])];
assert.equal(new Set(expectedNames).size, expectedNames.length);
assert.deepEqual(names.sort(), expectedNames.sort(), 'Archive must retain exactly the declared source, ledger, and all call outputs');

const environment = ledger.environment;
assert.deepEqual(environment, measurement.environment);
assert.equal(environment.platform, 'darwin'); assert(['arm64', 'x64'].includes(environment.architecture));
assert.equal(environment.locale, 'C'); assert.equal(environment.scheduler?.mode, 'exclusive');
assert.equal(environment.scheduler?.lane, 'mac-native');
for (const field of ['os_release', 'cpu', 'node', 'rustc', 'cargo']) assert(typeof environment[field] === 'string' && environment[field].length > 0);
assert(/^v\d+\./.test(environment.node)); assert(/^rustc \d+\./.test(environment.rustc)); assert(/^cargo \d+\./.test(environment.cargo));
positive(environment.cpu_count); positive(environment.total_memory_bytes);
assert(environment.allocator_malloc_nano_zone === null || typeof environment.allocator_malloc_nano_zone === 'string');
const usage = measurement.recorder_self_resource_usage;
keys(usage, ['userCPUTime', 'systemCPUTime', 'maxRSS', 'sharedMemorySize', 'unsharedDataSize', 'unsharedStackSize',
  'minorPageFault', 'majorPageFault', 'swappedOut', 'fsRead', 'fsWrite', 'ipcSent', 'ipcReceived', 'signalsCount',
  'voluntaryContextSwitches', 'involuntaryContextSwitches']);
for (const value of Object.values(usage)) integer(value);
positive(usage.maxRSS); integer(usage.maxRSS * 1024);
// The outer OS observation runs through recorder exit and must contain its
// earlier self high-water mark. Native Node reports maxRSS in KiB.
assert(usage.maxRSS * 1024 <= recorder.resources.peak_rss_bytes);

let counted = 0; let maximumCliRss = 0; let maximumReceipt = 0;
for (const [index, call] of ledger.calls.entries()) {
  assert.equal(call.index, index); assert.equal(call.executable, 'target/release/platonik');
  assert.equal(call.stdout, `${String(index).padStart(4, '0')}.stdout.json`);
  assert.equal(call.stderr, `${String(index).padStart(4, '0')}.stderr.txt`);
  assert(['export', 'run', 'verify'].includes(call.operation));
  const reservation = call.operation === 'export' ? 0 : 1;
  assert.equal(call.reserved_engine_executions, reservation); assert.equal(call.signal, null); finite(call.elapsed_ms);
  const out = archive.files[call.stdout], err = archive.files[call.stderr];
  assert.equal(call.stdout_sha256, out.sha256); assert.equal(call.stdout_bytes, out.bytes);
  assert.equal(call.stderr_sha256, err.sha256); assert.equal(call.stderr_bytes, err.bytes);
  const stderr = content(call.stderr).toString('utf8');
  assert.deepEqual(processMetrics(stderr, reservation), call.metrics); counted += call.metrics.engine_executions;
  assert(call.elapsed_ms >= call.metrics.elapsed_micros / 1000, 'Outer call interval must contain CLI elapsed time');
  if (reservation) {
    assert.deepEqual(timeFields(stderr), call.resources);
    assert(call.elapsed_ms + 10 >= call.resources.wall_seconds * 1000, 'Outer call interval must contain rounded OS wall time');
    maximumCliRss = Math.max(maximumCliRss, call.resources.peak_rss_bytes);
  } else assert.equal(call.resources, null);
  if (call.operation === 'run') maximumReceipt = Math.max(maximumReceipt, out.bytes);
  else assert.equal(call.exit_code, 0);
}
assert.equal(counted, 148); assert.equal(measurement.maximum_cli_peak_rss_bytes, maximumCliRss);
assert.equal(measurement.maximum_receipt_bytes, maximumReceipt);

const matrix = [...references.map(case_id => ({ case_id, kind: 'reference' })), ...controls.map(kind => ({ case_id: references[0], kind }))];
assert.deepEqual(qualification.results.map(({ case_id, kind }) => ({ case_id, kind })), matrix);
const expectedAttempts = matrix.map(item => ({ ...item, phase: 'matrix', sample_index: null }));
for (let sample_index = 0; sample_index < 30; sample_index++) for (const case_id of representatives)
  expectedAttempts.push({ case_id, kind: 'reference', phase: 'sample', sample_index });
const baselines = new Map();
function controlGrade(kind, grade) {
  assert.equal(grade.exchange_passed, kind === 'reference');
  if (kind === 'no-child-ack') { assert.equal(grade.acknowledgment_passed, false); assert.notEqual(grade.serviced, null); }
  if (kind === 'stray-report') { assert.equal(grade.acknowledgment_passed, false); assert.notEqual(grade.acknowledgment, null); assert.notEqual(grade.serviced, null); }
  if (kind === 'forged-report' || kind === 'early-ack') assert.equal(grade.acknowledgment_passed, false);
  if (kind === 'wrong-winner' || kind === 'no-request' || kind === 'selector-bypass') assert.equal(grade.request_passed, false);
  if (kind === 'missing-spare') assert.equal(grade.spare_preserved, false);
}
let cursor = 0;
for (const [index, expected] of expectedAttempts.entries()) {
  const attempt = ledger.attempts[index];
  for (const [key, value] of Object.entries(expected)) assert.equal(attempt[key], value);
  assert.equal(attempt.index, index); assert.equal(attempt.completed, true); assert.equal(attempt.first_call, cursor);
  const identity = `${expected.case_id}/${expected.kind}`;
  const exportArgs = expected.kind === 'reference' ? ['habitat', 'case', expected.case_id] : ['habitat', 'exchange-control', expected.case_id, expected.kind];
  if (expected.phase === 'matrix') {
    const exported = ledger.calls[cursor++]; assert.equal(exported.operation, 'export');
    assert.deepEqual(exported.args, exportArgs); assert.equal(attempt.input, exported.stdout);
    for (const [key, value] of Object.entries(expected)) assert.equal(exported[key], value);
  } else assert.equal(attempt.input, baselines.get(identity).input);
  const run = ledger.calls[cursor++], verified = ledger.calls[cursor++];
  assert.equal(attempt.run_call, run.index); assert.equal(attempt.verify_call, verified.index);
  assert.equal(attempt.after_call, cursor); assert.equal(run.operation, 'run'); assert.equal(verified.operation, 'verify');
  assert.deepEqual(run.args, ['run', attempt.input]);
  assert.deepEqual(verified.args, ['habitat', 'exchange-check', expected.case_id, run.stdout]);
  for (const call of [run, verified]) for (const [key, value] of Object.entries(expected)) assert.equal(call[key], value);
  if (expected.phase === 'matrix') {
    const input = read(attempt.input), receipt = read(run.stdout), grade = read(verified.stdout);
    assert.deepEqual(receipt.experiment, input); assert.equal(receipt.result.status, 'complete'); assert.equal(receipt.result.ticks_completed, 128);
    assert.equal(typeof receipt.result.outcome.passed, 'boolean');
    assert.equal(run.exit_code, receipt.result.outcome.passed ? 0 : 1);
    assert.equal(grade.schema, 'platonik-bloom-exchange-v1'); assert.equal(grade.case_id, expected.case_id);
    assert.deepEqual(grade, qualification.results[index].grade); controlGrade(expected.kind, grade);
    assert.equal(attempt.work_total, grade.work_total);
    baselines.set(identity, { input: attempt.input, receipt: run.stdout, grade: verified.stdout, exportArgs,
      receipt_sha256: run.stdout_sha256, grade_sha256: verified.stdout_sha256, run_exit_code: run.exit_code, work_total: grade.work_total });
  } else {
    const baseline = baselines.get(identity);
    assert.equal(run.stdout_sha256, baseline.receipt_sha256, 'Repeated receipt bytes changed');
    assert.equal(verified.stdout_sha256, baseline.grade_sha256, 'Repeated grade bytes changed');
    assert.equal(run.exit_code, baseline.run_exit_code); assert.equal(attempt.work_total, baseline.work_total);
  }
}
assert.equal(cursor, 162); assert.equal(baselines.size, 14);
const distribution = (case_id, operation) => {
  const calls = ledger.calls.filter(call => call.phase === 'sample' && call.case_id === case_id && call.operation === operation);
  assert.equal(calls.length, 30);
  const sorted = calls.map(call => call.elapsed_ms).sort((a, b) => a - b);
  return { calls: calls.map(call => call.index), samples: 30, min_ms: sorted[0], p50_ms: sorted[14], p95_ms: sorted[28], max_ms: sorted[29] };
};
const distributions = representatives.map(case_id => ({ case_id, run: distribution(case_id, 'run'), verify: distribution(case_id, 'verify') }));
assert.deepEqual(measurement.distributions, distributions);
const criteria = {
  accounting: counted === 148 && ledger.calls.length === 162 && ledger.attempts.length === 74,
  latency: distributions.every(world => world.run.p95_ms <= limits.operation_p95_ms && world.verify.p95_ms <= limits.operation_p95_ms),
  cli_memory: maximumCliRss <= limits.cli_peak_rss_bytes,
  recorder_memory: recorder.resources.peak_rss_bytes <= limits.recorder_peak_rss_bytes && usage.maxRSS * 1024 <= limits.recorder_peak_rss_bytes,
  receipt_size: maximumReceipt <= limits.receipt_bytes,
  logical_storage: logicalBytes <= limits.logical_archive_bytes,
  compressed_storage: archiveBytes.length <= limits.compressed_archive_bytes,
};
assert.deepEqual(summary.criteria, criteria);
assert.equal(summary.capacity_passed, Object.values(criteria).every(Boolean), 'Retain honest threshold failures as complete failed gates');

// Fresh debug-build replay establishes current outcome compatibility; none of
// these calls are samples in the historical release-build timing distributions.
const binary = path.resolve(process.env.PLATONIK_CLI ?? 'target/debug/platonik');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'platonik-exchange-capacity-'));
let executions = 0;
const cli = (args, reservation) => {
  const result = spawnSync(binary, ['--metrics', ...args], { encoding: 'utf8', maxBuffer: MAX_ENTRY, timeout: 60000 });
  if (result.error) throw result.error;
  assert.equal(result.signal, null); assert.equal(result.status, 0, result.stderr);
  executions += processMetrics(result.stderr, reservation).engine_executions;
  return JSON.parse(result.stdout);
};
try {
  let index = 0;
  for (const [identity, baseline] of baselines) {
    const case_id = identity.split('/')[0];
    assert.deepEqual(cli(baseline.exportArgs, 0), read(baseline.input), 'Frozen case/control changed');
    const receiptPath = path.join(temporary, `${index++}.json`);
    fs.writeFileSync(receiptPath, content(baseline.receipt), { flag: 'wx' });
    assert.deepEqual(cli(['habitat', 'exchange-check', case_id, receiptPath], 1), read(baseline.grade), 'Fresh Rust grade changed');
  }
  assert.equal(executions, 14);
  console.log(`Checked Bloom exchange capacity: 74 retained pairs, 148 recorded engines, 162 CLI calls; 14 fresh replay executions; capacity gate ${summary.capacity_passed ? 'passed' : 'failed'}. Historical timings were not rerun.`);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
