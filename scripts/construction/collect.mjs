// Publish exact Rust artifacts; compression deduplicates storage, not attempts.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { read, sha, identity, protocol, checkedFreeze, checkSelection, caseInput, parentProgram,
  variant, grade, total } from "./common.mjs";
const [directory, capacityDirectory] = process.argv.slice(2);
assert(directory && capacityDirectory, "collect.mjs STUDY_DIRECTORY CAPACITY_DIRECTORY");
const root = fs.realpathSync(directory), capacityRoot = fs.realpathSync(capacityDirectory);
const plan = protocol(), freeze = checkedFreeze(), ledger = read(path.join(root, "ledger.json"));
assert(ledger.finished && !ledger.stopped && !ledger.accounting_incomplete && !ledger.pending_call && !ledger.pending_operation);
const best = checkSelection(ledger, root); assert.equal(ledger.selected?.id ?? null, best?.id ?? null);
const artifacts = {};
function put(file, bytes, extra = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) assert(fs.readFileSync(file).equals(bytes), `Immutable output differs: ${file}`);
  else fs.writeFileSync(file, bytes, { flag: "wx" });
  artifacts[file] = { sha256: sha(bytes), bytes: bytes.length, ...extra }; return file;
}
const include = file => put(file, fs.readFileSync(file));
function compressed(kind, bytes, maximum) {
  assert(bytes.length <= maximum, `Bounded ${kind} artifact`);
  const compressed = gzipSync(bytes, { level: 9 });
  assert(gunzipSync(compressed, { maxOutputLength: maximum }).equals(bytes));
  return put(`fixtures/evidence/construction-${kind}/${sha(bytes)}.json.gz`, compressed,
    { uncompressed_sha256: sha(bytes), uncompressed_bytes: bytes.length });
}
for (const file of ["fixtures/evidence/construction-protocol.json", "fixtures/evidence/construction-freeze.json",
  plan.qualification_file, ...plan.cases.map(row => row.file), ...plan.candidates.map(row => row.source_file)]) include(file);
for (const repair of ledger.harness_repairs ?? []) {
  assert.equal(sha(fs.readFileSync(repair.file)), repair.sha256); include(repair.file);
  const record = read(repair.file); include(record.interrupted_ledger_file);
  // Store the reviewed recovery script beside the immutable source snapshots.
  put("fixtures/evidence/construction-repairs/import-envelope/repair-script.mjs", fs.readFileSync(record.script_file));
  for (const row of record.changes) { include(row.before_file); include(row.after_file); }
}
const qualification = read(plan.qualification_file);
for (const attempt of qualification.attempts) for (const call of attempt.calls)
  for (const field of ["stdout", "stderr"]) include(`${qualification.packet_directory}/${call[field]}`);
function processes(owner, localRoot) {
  for (const call of owner.calls) for (const field of ["stdout", "stderr"]) {
    const bytes = fs.readFileSync(path.join(localRoot, call[field]));
    assert.equal(sha(bytes), call[`${field}_sha256`]);
    assert(!bytes.includes(Buffer.from(localRoot)), "Published subprocess output must not contain a private save path");
    call[`${field}_file`] = compressed("process", bytes, 64 * 1024 * 1024);
  }
}
processes(ledger, root);
function receiptFor(row, expected) {
  const raw = fs.readFileSync(path.join(root, row.receipt)); assert.equal(sha(raw), row.receipt_sha256);
  const receipt = JSON.parse(raw);
  assert.deepEqual(receipt.experiment, expected);
  assert.equal(receipt.experiment_hash, identity(expected)); assert.equal(receipt.result_hash, identity(receipt.result));
  assert.equal(row.experiment_hash, receipt.experiment_hash); assert.equal(row.result_hash, receipt.result_hash);
  assert.equal(row.work, total(receipt.result.costs)); assert.equal(row.status, receipt.result.status);
  assert.equal(row.ticks, receipt.result.ticks_completed);
  for (const [key, value] of Object.entries(grade(receipt))) assert.deepEqual(row[key], value);
  row.receipt_file = compressed("receipts", raw, plan.bounds.maximum_receipt_bytes);
  return receipt;
}
const reference = parentProgram(caseInput(plan.training[0]));
for (const row of ledger.reference) receiptFor(row, variant(caseInput(row.case_id), reference, "reference"));
for (const candidate of ledger.candidates) {
  if (candidate.source) {
    const raw = fs.readFileSync(path.join(root, candidate.source)); assert.equal(sha(raw), candidate.source_sha256);
    const declared = plan.candidates[candidate.sequence - 1];
    candidate.source_file = sha(raw) === declared.source_sha256 ? declared.source_file : null;
    if (candidate.source_file === null) {
      assert.equal(candidate.admission, "rejected"); assert.equal(candidate.trials.length, 0);
    }
    for (const row of candidate.trials) receiptFor(row, variant(caseInput(row.case_id), JSON.parse(raw), "candidate"));
  }
}
for (const row of [...ledger.confirmation, ...ledger.comparisons, ...ledger.controls])
  receiptFor(row, variant(caseInput(row.case_id), ledger.selected.program, row.kind));
const index = { schema: "platonik-continuous-site-v1", cases: [] };
for (const [number, row] of ledger.replays.entries()) {
  const spec = plan.replays[number]; assert.equal(row.id, spec.id); assert.equal(row.case_id, spec.case_id); assert.equal(row.kind, spec.kind);
  const receipt = receiptFor(row, variant(caseInput(row.case_id), ledger.selected.program, row.kind));
  const stem = `public/construction/${row.id}`;
  put(`${stem}.receipt.json`, Buffer.from(JSON.stringify(receipt) + "\n"));
  put(`${stem}.experiment.json`, Buffer.from(JSON.stringify(receipt.experiment) + "\n"));
  const bundleBytes = fs.readFileSync(path.join(root, row.bundle)); assert.equal(sha(bundleBytes), row.bundle_sha256);
  const bundle = JSON.parse(bundleBytes), event = entry => bundle.objects[entry.event.event_hash];
  assert.deepEqual(event(bundle.entries[0]).experiment, receipt.experiment);
  assert.deepEqual(event(bundle.entries.at(-1)), { kind: "completed", result: { kind: "finished", value: receipt.result } });
  row.bundle_file = put(`${stem}.bundle.json`, bundleBytes);
  assert.deepEqual(row.restorations.map(restoration => restoration.tick), spec.restore_ticks);
  for (const restoration of row.restorations) {
    const bytes = fs.readFileSync(path.join(root, restoration.bundle)); assert.equal(sha(bytes), restoration.bundle_sha256);
    restoration.bundle_file = put(`${stem}.at-${restoration.tick}.bundle.json`, bytes);
  }
  assert(row.uninterrupted_equal && row.restored_equal);
  assert.deepEqual(row.checkpoints.map(cut => cut.tick), spec.cuts);
  const labels = { selected: "A useful keeper", "no-activation": "An assembly left inactive", "idle-child": "A child without a useful policy" };
  index.cases.push({ id: row.id, label: `${labels[row.kind]} · ${row.case_id.replace(/^construction-/, "")}`,
    detail: `A supplied keeper blueprint, finite material and one existing service crew. ${row.birth_tick === null ? "No child is activated." : `Child activated at tick ${row.birth_tick}.`} ${row.report_guided_sparks.length} delivered sparks have a directly traced report-to-memory route.`,
    passed: row.passed, work: row.work, ticks: row.ticks, result_hash: row.result_hash,
    construction_passed: row.construction_passed, milestone_passed: row.milestone_passed,
    uninterrupted_equal: row.uninterrupted_equal, restored_equal: row.restored_equal,
    cuts: row.checkpoints.map(cut => {
      const frame = receipt.result.frames.find(frame => frame.tick === cut.tick); assert(frame?.complete);
      assert.equal(identity(frame.state), cut.state_hash); assert.equal(identity(frame.costs), cut.costs_hash);
      const construction = frame.state.construction, assembly = construction?.assemblies[0];
      const birth = construction?.births.find(item => item.tick === cut.tick);
      const parent = frame.state.cells.find(cell => cell.id === plan.roles.builder);
      const body = receipt.experiment.construction?.blueprints.find(item => item.id === assembly?.blueprint)?.body;
      const ready = assembly && body && assembly.copied.length === Buffer.byteLength(JSON.stringify(body)) && assembly.wired.length === body.links.length;
      const waiting = frame.activations.some(action => action.cell === plan.roles.builder && action.action.kind === "wait");
      const childAction = frame.activations.find(action => action.cell === plan.roles.child);
      const childLabel = !childAction ? "Child not scheduled" : childAction.action.kind === "wait" ? "Child waiting"
        : childAction.success ? "Child at work" : childAction.action.kind === "route" ? "Child tries to route" : "Child action fails";
      const label = cut.tick === receipt.experiment.ticks ? "Journey outcome" : birth ? "Child activated"
        : construction?.births.length ? childLabel
        : ready ? (waiting ? "Assembly stays inactive" : "Ready to activate")
        : assembly ? "Body taking shape" : parent?.material != null ? "Material gathered" : "Before construction";
      return { tick: cut.tick, state_hash: cut.state_hash, costs_hash: cut.costs_hash,
        label,
        detail: `${assembly?.copied.length ?? 0} bytes in partial assembly; ${assembly?.wired.length ?? 0} inactive links; ${construction?.births.length ?? 0} children born. ${frame.state.delivered.length} sparks delivered; ${total(frame.costs)} modeled work.` };
    }) });
}
if (index.cases.length) put("public/construction/index.json", Buffer.from(JSON.stringify(index) + "\n"));
for (const probe of ledger.probes) if (probe.input) {
  const bytes = fs.readFileSync(path.join(root, probe.input)); assert.equal(sha(bytes), probe.input_sha256);
  probe.input_file = compressed("probes", bytes, plan.bounds.maximum_bundle_bytes);
}
const capacity = read(path.join(capacityRoot, "ledger.json")); assert(capacity.finished && !capacity.stopped && !capacity.pending_call);
assert.equal(capacity.source_digest, identity(freeze.source)); processes(capacity, capacityRoot);
const measurement = fs.readFileSync(path.join(capacityRoot, capacity.measurement)); assert.equal(sha(measurement), capacity.measurement_sha256);
capacity.measurement_file = put("fixtures/evidence/construction-capacity.json", measurement);
for (const row of capacity.replays) {
  const raw = fs.readFileSync(path.join(capacityRoot, row.receipt)); assert.equal(sha(raw), row.receipt_sha256);
  const receipt = JSON.parse(raw); assert.equal(receipt.result_hash, row.result_hash);
  row.receipt_file = compressed("receipts", raw, plan.bounds.maximum_receipt_bytes);
  for (const item of [row, ...row.restorations]) {
    const raw = fs.readFileSync(path.join(capacityRoot, item.bundle)); assert.equal(sha(raw), item.bundle_sha256);
    item.bundle_file = compressed("capacity-artifacts", raw, plan.bounds.maximum_bundle_bytes);
  }
}
const study = { schema: "platonik-construction-study-v1", protocol_sha256: sha(fs.readFileSync("fixtures/evidence/construction-protocol.json")),
  freeze_sha256: sha(fs.readFileSync("fixtures/evidence/construction-freeze.json")), source_digest: identity(freeze.source),
  ledger, capacity, artifacts };
const studyFile = "fixtures/evidence/construction-study.json";
fs.writeFileSync(studyFile, `${JSON.stringify(study)}\n`, { flag: "wx" });
console.log(JSON.stringify({ study: studyFile, logical_cold_runs: ledger.finished.logical_cold_runs ?? 0,
  study_executions: ledger.engine_executions, capacity_executions: capacity.engine_executions,
  artifact_files: Object.keys(artifacts).length, artifact_bytes: Object.values(artifacts).reduce((sum, row) => sum + row.bytes, 0) }));
