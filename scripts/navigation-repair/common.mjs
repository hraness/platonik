import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { read, sha, identity, verifyFreeze, binary } from "../continuity/runner.mjs";
import { write, total } from "../continuity/trajectory.mjs";
import { derive } from "./recipes.mjs";
export { read, sha, identity, write, total };
export const protocol = () => read("fixtures/evidence/navigation-repair-protocol.json");
export const caseInput = id => read(`fixtures/evidence/navigation-cases/${id}.json`);
export const courier = world => world.cells.find(cell => cell.id === 1).program;
export function apply(world, program) {
  const changed = structuredClone(world);
  changed.cells.find(cell => cell.id === 1).program = structuredClone(program);
  return changed;
}
export function fixedSource() {
  const old = verifyFreeze();
  const files = { ...old.source_files_sha256 };
  for (const prior of protocol().previous_diagnostic) {
    assert.equal(sha(fs.readFileSync(prior.file)), prior.sha256, "Earlier failed search is retained");
    files[prior.file] = prior.sha256;
  }
  for (const name of ["common.mjs", "recipes.mjs", "session.mjs", "freeze.mjs"])
    files[`scripts/navigation-repair/${name}`] = sha(fs.readFileSync(`scripts/navigation-repair/${name}`));
  for (const recipe of protocol().recipes) {
    assert.equal(sha(fs.readFileSync(recipe.source)), recipe.source_sha256);
    assert.deepEqual(caseInput(recipe.id), derive(recipe), "Case is exactly its declared transform");
    for (const file of [recipe.source, `fixtures/evidence/navigation-cases/${recipe.id}.json`])
      files[file] = sha(fs.readFileSync(file));
  }
  files["fixtures/evidence/navigation-repair-protocol.json"] = sha(fs.readFileSync("fixtures/evidence/navigation-repair-protocol.json"));
  return { source_files_sha256: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))),
    release_binary_sha256: sha(fs.readFileSync(binary)) };
}
export function checkedFreeze() {
  const freeze = read("fixtures/evidence/navigation-repair-freeze.json");
  assert.deepEqual(fixedSource(), freeze.source);
  return freeze;
}
export function cold(run, id, original, program) {
  assert(/^[a-z0-9-]+$/.test(id));
  const dir = path.join(run.root, id); fs.mkdirSync(dir);
  const input = path.join(dir, "experiment.json"), receiptFile = path.join(dir, "receipt.json");
  const experiment = apply(original, program); write(input, experiment);
  const executed = run.cli(["run", input], { reservation: 2 });
  const receipt = executed.value;
  assert.deepEqual(receipt.experiment, experiment, "Only the courier program may change");
  write(receiptFile, receipt);
  const verified = run.cli(["verify", receiptFile], { reservation: 2, accepted: [0] });
  assert.equal(verified.value.verified, true);
  assert.equal(verified.value.result_hash, receipt.result_hash);
  return { id, first_call: executed.call.index, last_call: verified.call.index,
    experiment_hash: receipt.experiment_hash, result_hash: receipt.result_hash,
    receipt: path.relative(run.root, receiptFile), receipt_sha256: sha(fs.readFileSync(receiptFile)),
    program: courier(receipt.experiment), program_hash: identity(courier(receipt.experiment)),
    passed: receipt.result.outcome.passed, status: receipt.result.status,
    ticks: receipt.result.ticks_completed, work: total(receipt.result.costs),
    verified: true };
}
export function checkSelection(ledger, root) {
  const plan = protocol();
  assert.equal(ledger.candidates.length, plan.candidates.length);
  for (const [index, entry] of ledger.candidates.entries()) {
    assert.equal(entry.id, plan.candidates[index].id); assert.equal(entry.sequence, index + 1);
    if (entry.input_unavailable) {
      assert(entry.admission === "rejected" && !entry.source && !entry.passed && !entry.trials.length);
      continue;
    }
    const bytes = fs.readFileSync(path.join(root, entry.source));
    assert.equal(sha(bytes), entry.source_sha256);
    if (entry.admission !== "completed") { assert(!entry.passed); continue; }
    assert.equal(entry.source_sha256, plan.candidates[index].source_sha256);
    assert.deepEqual(entry.trials.map(row => row.case_id), plan.training);
    for (const row of entry.trials) {
      const receiptBytes = fs.readFileSync(path.join(root, row.receipt));
      assert.equal(sha(receiptBytes), row.receipt_sha256);
      const receipt = JSON.parse(receiptBytes);
      assert.deepEqual(receipt.experiment, apply(caseInput(row.case_id), JSON.parse(bytes)));
      assert.equal(row.passed, receipt.result.outcome.passed); assert.equal(row.status, receipt.result.status);
      assert.equal(row.work, total(receipt.result.costs)); assert.deepEqual(row.program, courier(receipt.experiment));
      assert.deepEqual(row.program, entry.program);
    }
    assert.equal(entry.passed, entry.trials.every(row => row.passed && row.status === "complete"));
    assert.equal(entry.work, entry.trials.reduce((sum, row) => sum + row.work, 0));
    assert.equal(entry.program_hash, identity(entry.program));
    assert.equal(entry.program_bytes, Buffer.byteLength(JSON.stringify(entry.program)));
  }
  const best = ledger.candidates.filter(row => row.passed)
    .sort((a, b) => a.work - b.work || a.program_bytes - b.program_bytes || a.sequence - b.sequence)[0];
  if (ledger.selected) {
    assert(best); assert.equal(ledger.selected.id, best.id); assert.equal(ledger.selected.sequence, best.sequence);
    assert.deepEqual(ledger.selected.program, best.program); assert.equal(ledger.selected.program_hash, best.program_hash);
    assert.equal(ledger.selected.training_work, best.work);
    assert.equal(ledger.selected.after_call, ledger.candidates.at(-1).after_call);
    assert.deepEqual(read(path.join(root, "selected.json")), ledger.selected, "Frozen winner is checked before transfer");
  }
  return best;
}
export function ablate(program, id) {
  const changed = structuredClone(program);
  if (id === "source-compass") changed.rules = changed.rules.filter(rule =>
    !(rule.action.kind === "move" && rule.when.some(condition => condition.kind === "carrying" && condition.value === false)));
  else {
    assert(["compass-goal", "compass-goal-heading"].includes(id));
    for (const rule of changed.rules) if (rule.action.kind === "drop" && rule.remember?.slot === 1) rule.remember = null;
  }
  return changed;
}
export function compact(original) {
  return { rules: [...structuredClone(courier(original).rules.slice(0, 2)),
    { when: [{ kind: "blocked", direction: "forward", value: true }], action: { kind: "turn", direction: "back" }, remember: null },
    { when: [], action: { kind: "move", direction: "forward" }, remember: null }] };
}
