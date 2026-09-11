// Publish complete compressed Rust receipts, preserving every logical attempt.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
const namespace = process.argv[3] ?? "navigation";
assert(["navigation", "navigation-repair"].includes(namespace));
const { read, sha, identity, protocol, checkedFreeze, checkSelection, caseInput, apply, courier, total, ablate, compact } = await import(`./${namespace}/common.mjs`);

const root = fs.realpathSync(process.argv[2]);
const plan = protocol(), freeze = checkedFreeze(), ledger = read(path.join(root, "ledger.json"));
assert(ledger.finished && !ledger.pending_call && !ledger.pending_operation && !ledger.stopped && !ledger.accounting_incomplete);
assert.equal(ledger.source_digest, identity(freeze.source));
const selected = checkSelection(ledger, root);
assert.equal(ledger.selected?.id ?? null, selected?.id ?? null);
const artifacts = {};
const put = (file, bytes, extra = {}) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) assert(fs.readFileSync(file).equals(bytes), `Existing artifact differs: ${file}`);
  else fs.writeFileSync(file, bytes, { flag: "wx" });
  artifacts[file] = { sha256: sha(bytes), bytes: bytes.length, ...extra };
};
const include = file => put(file, fs.readFileSync(file));
for (const file of [`fixtures/evidence/${namespace}-protocol.json`, `fixtures/evidence/${namespace}-freeze.json`,
  ...plan.recipes.map(recipe => `fixtures/evidence/navigation-cases/${recipe.id}.json`), ...plan.candidates.map(row => row.source_file)]) include(file);
const receiptFor = (row, program) => {
  const bytes = fs.readFileSync(path.join(root, row.receipt));
  assert.equal(sha(bytes), row.receipt_sha256);
  const receipt = JSON.parse(bytes);
  assert(plan.recipes.some(recipe => recipe.id === row.case_id));
  assert.deepEqual(receipt.experiment, apply(caseInput(row.case_id), program), "Published recipe and courier must match the executed input");
  assert.equal(receipt.experiment_hash, identity(receipt.experiment));
  assert.equal(receipt.result_hash, identity(receipt.result));
  assert.equal(row.experiment_hash, receipt.experiment_hash);
  assert.equal(row.result_hash, receipt.result_hash);
  assert.equal(row.passed, receipt.result.outcome.passed);
  assert.equal(row.status, receipt.result.status);
  assert.equal(row.ticks, receipt.result.ticks_completed);
  assert.equal(row.work, total(receipt.result.costs));
  if (row.program) { assert.deepEqual(row.program, program); assert.equal(row.program_hash, identity(program)); }
  const file = `fixtures/evidence/${namespace}-receipts/${sha(bytes)}.json.gz`;
  const compressed = gzipSync(bytes, { level: 9 }); assert(gunzipSync(compressed, { maxOutputLength: 2 * 1024 * 1024 }).equals(bytes));
  put(file, compressed, { uncompressed_sha256: sha(bytes), uncompressed_bytes: bytes.length });
  row.receipt_file = file;
  return receipt;
};
for (const candidate of ledger.candidates) {
  if (candidate.source) {
    const file = plan.candidates[candidate.sequence - 1].source_file;
    const bytes = fs.readFileSync(path.join(root, candidate.source));
    assert.equal(sha(bytes), candidate.source_sha256);
    if (sha(bytes) === sha(fs.readFileSync(file))) candidate.source_file = file;
    else { candidate.source_file = `fixtures/evidence/${namespace}-submissions/rejected-${candidate.sequence}.json`; put(candidate.source_file, bytes); }
  }
  for (const row of candidate.trials) receiptFor(row, JSON.parse(fs.readFileSync(path.join(root, candidate.source))));
}
for (const row of ledger.confirmation) receiptFor(row, ledger.selected.program);
const originalWorld = caseInput(plan.training[0]);
const baselinePrograms = ledger.selected ? {
  "right-wall": courier(originalWorld), compact: compact(originalWorld),
  [plan.baseline_kinds[2]]: ablate(ledger.selected.program, ledger.selected.id),
} : {};
for (const row of ledger.baselines) { assert(Object.hasOwn(baselinePrograms, row.kind)); receiptFor(row, baselinePrograms[row.kind]); }
const index = { schema: "platonik-continuous-site-v1", cases: [] };
if (ledger.selected) assert.deepEqual(ledger.replays.map(row => [row.id, row.case_id, row.variant]), [
  ["original-reversed", plan.training[0], "original"], ["repaired-reversed", plan.training[0], "repaired"],
  ["original-late", plan.training[1], "original"], ["repaired-late", plan.training[1], "repaired"],
]);
for (const row of ledger.replays) {
  const receipt = receiptFor(row, row.variant === "original" ? courier(caseInput(row.case_id)) : ledger.selected.program);
  const stem = `public/navigation/${row.id}`;
  put(`${stem}.receipt.json`, Buffer.from(JSON.stringify(receipt) + "\n"));
  put(`${stem}.experiment.json`, Buffer.from(JSON.stringify(receipt.experiment) + "\n"));
  const bytes = fs.readFileSync(path.join(root, row.bundle)); assert.equal(sha(bytes), row.bundle_sha256);
  const bundle = JSON.parse(bytes);
  assert.equal(bundle.schema, "platonik-habitat-bundle-v1");
  const event = entry => bundle.objects[entry.event.event_hash];
  const genesis = event(bundle.entries[0]), final = event(bundle.entries.at(-1));
  assert.equal(genesis.kind, "initialized"); assert.deepEqual(genesis.experiment, receipt.experiment);
  assert.deepEqual(final, { kind: "completed", result: { kind: "finished", value: receipt.result } });
  assert(row.uninterrupted_equal && row.restored_equal);
  assert.deepEqual(row.checkpoints.map(cut => cut.tick), plan.pause_ticks);
  row.bundle_file = `${stem}.bundle.json`; put(row.bundle_file, bytes);
  const original = row.variant === "original", reversed = row.case_id === plan.training[0];
  index.cases.push({ id: row.id, label: `${original ? "Original wall follower" : "Selected courier"} · ${reversed ? "reversed" : "late"} crossing`,
    detail: `${original ? "Fern’s original local wall-following rules." : `The frozen ${ledger.selected.id} courier.`} The crossing closes at tick ${reversed ? 27 : 39} and reopens at tick ${reversed ? 50 : 61}. Only the courier program differs in this pair.`,
    passed: row.passed, work: row.work, ticks: row.ticks, result_hash: row.result_hash,
    uninterrupted_equal: row.uninterrupted_equal, restored_equal: row.restored_equal,
    cuts: row.checkpoints.map(cut => {
      const frame = receipt.result.frames.find(frame => frame.tick === cut.tick);
      assert(frame && frame.complete); const courier = frame.state.cells.find(cell => cell.id === 1);
      assert.equal(cut.state_hash, identity(frame.state)); assert.equal(cut.costs_hash, identity(frame.costs));
      return { tick: cut.tick, label: cut.tick === 47 ? "Before reopening" : cut.tick === 79 ? "Later supplies" : cut.tick === 96 ? "Final accounting" : "Saved state",
        state_hash: identity(frame.state), costs_hash: identity(frame.costs),
        detail: `Courier at (${courier.position.x}, ${courier.position.y}), memory [${courier.memory.join(", ")}], ${courier.cargo ? `carrying spark ${courier.cargo.id}` : "hands empty"}. ${frame.state.sources.reduce((sum, source) => sum + source.sparks.length, 0)} sparks remain at source; ${frame.state.delivered.length} delivered. ${total(frame.costs)} modeled work.` };
    }) });
}
if (index.cases.length) put("public/navigation/index.json", Buffer.from(JSON.stringify(index) + "\n"));
const study = { schema: "platonik-navigation-study-v1", protocol_sha256: sha(fs.readFileSync(`fixtures/evidence/${namespace}-protocol.json`)),
  freeze_sha256: sha(fs.readFileSync(`fixtures/evidence/${namespace}-freeze.json`)), source_digest: ledger.source_digest,
  ledger, artifacts };
const output = `fixtures/evidence/${namespace}-study.json`;
fs.writeFileSync(output, JSON.stringify(study) + "\n", { flag: "wx" });
console.log(JSON.stringify({ artifact_count: Object.keys(artifacts).length, published_bytes: Object.values(artifacts).reduce((sum, row) => sum + row.bytes, 0),
  distinct_receipts: Object.keys(artifacts).filter(file => file.endsWith(".json.gz")).length,
  engine_executions: ledger.engine_executions, finished: ledger.finished }));
