// Bounded author-study admission; all simulation stays in the frozen Rust binary.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { read, sha, identity, assertSource } from "./common.mjs";
export { read, sha, identity };
export const protocolFile = "fixtures/evidence/bloom-protocol.json";
export const freezeFile = "fixtures/evidence/bloom-freeze.json";
export const roles = { builder_a: 1, builder_b: 2, selector: 5 };
export const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
export const total = costs => Object.values(costs).reduce((sum, value) => { assert(Number.isSafeInteger(value) && value >= 0); return sum + value; }, 0);
export const caseInput = id => read(`fixtures/evidence/bloom-cases/${id}.json`);
export function checkedFreeze() {
  const frozen = read(freezeFile), plan = read(protocolFile);
  assert.equal(plan.budget.each_agent, 64);
  assert.equal(plan.training.length, 4); assert.equal(plan.transfer.length, 4);
  assert.equal(new Set([...plan.training, ...plan.transfer]).size, 8);
  for (const id of [...plan.training, ...plan.transfer]) assert(/^[a-z0-9-]+$/.test(id));
  for (const file of [protocolFile, "scripts/bloom/study-common.mjs", "scripts/bloom/agent-session.mjs", "scripts/bloom/common.mjs",
    ...[...plan.training, ...plan.transfer].map(id => `fixtures/evidence/bloom-cases/${id}.json`)]) {
    assert.equal(typeof frozen.source.files[file], "string", `Freeze must bind ${file}`);
  }
  assertSource(frozen.source);
  return { frozen, plan };
}
export function normalizePrograms(input) {
  assert(input && typeof input === "object" && !Array.isArray(input));
  assert.deepEqual(Object.keys(input).sort(), Object.keys(roles).sort());
  return Object.fromEntries(Object.keys(roles).map(role => {
    const program = input[role]; assert(program && Array.isArray(program.rules));
    return [role, { ...structuredClone(program), rules: program.rules.map(rule => ({ ...structuredClone(rule), remember: rule.remember ?? null })) }];
  }));
}
export function programs(world) { return Object.fromEntries(Object.entries(roles).map(([role,id]) => [role, world.cells.find(cell => cell.id === id).program])); }
export function apply(original, input) {
  const world = structuredClone(original), normalized = normalizePrograms(input);
  for (const [role,id] of Object.entries(roles)) world.cells.find(cell => cell.id === id).program = normalized[role];
  return world;
}
export function cold(run, stem, case_id, bundle) {
  assert(/^[a-z0-9-]+$/.test(stem));
  const experiment = apply(caseInput(case_id), bundle), input = `${stem}.experiment.json`;
  write(path.join(run.root, input), experiment);
  const row = { case_id, input, input_sha256: sha(fs.readFileSync(path.join(run.root,input))), first_call: run.ledger.calls.length, bloomed: false };
  // Store intent before execution, including an interrupted or rejected trial.
  run.ledger.pending_trial = row; run.save(); checkedFreeze();
  const generated = run.cli(["run", path.join(run.root,input)], { reservation: 1, accepted: [0,1,2] });
  row.run_call = generated.call.index;
  if (generated.call.exit_code === 2) { Object.assign(row, { rejected: true, diagnostic_file: generated.call.stderr }); }
  else {
    assert(generated.value, "Missing generated receipt"); const receipt = generated.value;
    assert.deepEqual(receipt.experiment, experiment);
    Object.assign(row, { receipt: generated.call.stdout, receipt_sha256: generated.call.stdout_sha256 }); run.save(); checkedFreeze();
    const checked = run.cli(["habitat", "bloom-check", path.join(run.root,row.receipt)], { reservation: 1, accepted: [0, 2] });
    if (checked.call.exit_code === 2) {
      Object.assign(row, { grade_rejected: true, diagnostic_file: checked.call.stderr });
    } else {
      const grade = checked.value; assert.equal(grade.schema,"platonik-bloom-v1");
      assert.equal(grade.experiment_hash, receipt.experiment_hash); assert.equal(grade.result_hash, receipt.result_hash);
      Object.assign(row, { grade_call: checked.call.index, grade_file: checked.call.stdout, grade,
        experiment_hash: receipt.experiment_hash, result_hash: receipt.result_hash, work: total(receipt.result.costs),
        status: receipt.result.status, ticks: receipt.result.ticks_completed, passed: receipt.result.outcome.passed, bloomed: grade.bloomed });
    }
  }
  row.after_call = run.ledger.calls.length; run.ledger.pending_trial = null; run.save(); return row;
}
export function bestCandidate(ledger) {
  return ledger.candidates.filter(candidate => candidate.admission === "completed" && candidate.bloomed)
    .toSorted((a,b) => a.work-b.work || a.program_bytes-b.program_bytes || a.sequence-b.sequence)[0] ?? null;
}
export function checkSelection(ledger, root, plan) {
  assert.equal(ledger.candidates.length,3);
  for (const [index,candidate] of ledger.candidates.entries()) {
    assert.equal(candidate.sequence,index+1);
    if (candidate.source) assert.equal(sha(fs.readFileSync(path.join(root,candidate.source))),candidate.source_sha256);
    if (candidate.admission !== "completed") { assert.equal(candidate.bloomed,false); continue; }
    const input = read(path.join(root,candidate.source));
    assert.equal(candidate.id,input.id); assert.equal(candidate.label,input.label);
    assert.deepEqual(candidate.programs,normalizePrograms(input.programs));
    if (ledger.owner === "keep") for (const role of ["builder_a","builder_b"]) assert.deepEqual(candidate.programs[role],programs(caseInput(plan.training[0]))[role]);
    assert.deepEqual(candidate.trials.map(row => row.case_id),plan.training);
    for (const row of candidate.trials) {
      assert.equal(sha(fs.readFileSync(path.join(root,row.receipt))),row.receipt_sha256);
      const receipt = read(path.join(root,row.receipt));
      assert.deepEqual(receipt.experiment,apply(caseInput(row.case_id),candidate.programs));
      assert.deepEqual(row.grade,read(path.join(root,ledger.calls[row.grade_call].stdout)));
      assert.equal(row.work,total(receipt.result.costs)); assert.equal(row.bloomed,row.grade.bloomed);
    }
    assert.equal(candidate.work,candidate.trials.reduce((sum,row) => sum+row.work,0));
    assert.equal(candidate.program_bytes,Buffer.byteLength(JSON.stringify(candidate.programs)));
    assert.equal(candidate.bloomed,candidate.trials.every(row => row.bloomed));
  }
  const best = bestCandidate(ledger);
  if (ledger.selected) { assert(best); assert.equal(ledger.selected.id,best.id); assert.deepEqual(ledger.selected.programs,best.programs); }
  return best;
}
