// Fixed public developer-agent drafts; no simulated transition lives in this driver.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createLedger, runner } from "./runner.mjs";
import { trajectory } from "./trajectory.mjs";
import { read, write, sha, identity, protocol, checkedFreeze, caseInput, parentProgram,
  apply, variant, grade, cold, checkSelection } from "./common.mjs";
import { probes } from "./probes.mjs";

const [directory, operation, id, input] = process.argv.slice(2);
assert(directory && operation, "session.mjs DIRECTORY init|references|candidate ID FILE|freeze|confirm|comparisons|controls|replays|probes|finish");
const plan = protocol(), frozen = checkedFreeze();
const ledger = operation === "init" ? createLedger(directory, plan.budget.study_engine_executions, {
  owner: "construction", source_digest: identity(frozen.source), reference: [], candidates: [], selected: null,
  confirmation: [], comparisons: [], controls: [], replays: [], probes: [], pending_operation: null,
}) : read(path.join(directory, "ledger.json"));
assert.equal(ledger.schema, "platonik-construction-ledger-v1");
assert.equal(ledger.owner, "construction"); assert.equal(ledger.source_digest, identity(frozen.source));
assert.equal(ledger.maximum_engine_executions, plan.budget.study_engine_executions);
assert(!ledger.pending_operation && !ledger.finished, "Do not silently repeat interrupted or completed work");
const run = runner(directory, ledger);
if (ledger.selected) checkSelection(ledger, run.root);
const referenceProgram = parentProgram(caseInput(plan.training[0]));
const trial = (label, case_id, program, kind) => ({ ...cold(run, label, variant(caseInput(case_id), program, kind)), case_id, kind });
const begin = () => { ledger.pending_operation = operation; run.save(); };
if (operation === "references") {
  assert(!ledger.reference.length && !ledger.candidates.length); begin();
  for (const case_id of [...plan.training, ...plan.transfer]) {
    ledger.reference.push(trial(`reference-${case_id}`, case_id, referenceProgram, "reference")); run.save();
  }
} else if (operation === "candidate") {
  assert.equal(ledger.reference.length, 8); assert(!ledger.selected);
  assert(ledger.candidates.length < plan.candidates.length);
  const declared = plan.candidates[ledger.candidates.length]; assert.equal(id, declared.id);
  const entry = { id, sequence: ledger.candidates.length + 1, admission: "submitted", trials: [], passed: false,
    first_call: ledger.calls.length };
  ledger.candidates.push(entry); begin();
  try {
    const bytes = fs.readFileSync(input); entry.source = `submission-${entry.sequence}.json`;
    fs.writeFileSync(path.join(run.root, entry.source), bytes, { flag: "wx" });
    entry.source_sha256 = sha(bytes); run.save();
    assert.equal(entry.source_sha256, declared.source_sha256, "Drafts fixed before the first execution");
    const program = JSON.parse(bytes);
    for (const case_id of plan.training) { entry.trials.push(trial(`c${entry.sequence}-${case_id}`, case_id, program, "candidate")); run.save(); }
    entry.program = program; entry.program_bytes = Buffer.byteLength(JSON.stringify(program));
    entry.work = entry.trials.reduce((sum, row) => sum + row.work, 0);
    entry.passed = entry.trials.every(row => row.milestone_passed); entry.admission = "completed";
  } catch (error) {
    entry.admission = entry.trials.length ? "partial" : "rejected"; entry.error = "Candidate admission did not complete; raw diagnostics remain in the local session.";
    const errorFile = path.join(run.root, `submission-${entry.sequence}.error.txt`);
    fs.writeFileSync(errorFile, String(error.stack ?? error), { flag: "wx" });
    entry.error_sha256 = sha(fs.readFileSync(errorFile));
    if (!entry.source) entry.input_unavailable = true;
    entry.after_call = ledger.calls.length; ledger.pending_operation = null; run.save(); throw error;
  }
  entry.after_call = ledger.calls.length;
} else if (operation === "freeze") {
  assert.equal(ledger.candidates.length, 3); assert(!ledger.selected);
  const winner = checkSelection(ledger, run.root);
  if (!winner) ledger.finished = { construction_gate: false, logical_cold_runs: ledger.calls.filter(call => call.args[0] === "run").length, reason: "No candidate passed every training mission; no extra slot or transfer." };
  else {
    ledger.selected = { id: winner.id, sequence: winner.sequence, program: winner.program,
      program_hash: identity(winner.program), training_work: winner.work, after_call: ledger.calls.length };
    write(path.join(run.root, "selected.json"), ledger.selected);
  }
} else if (operation === "confirm") {
  assert(ledger.selected && !ledger.confirmation.length); begin();
  for (const case_id of plan.transfer) {
    ledger.confirmation.push(trial(`confirm-${case_id}`, case_id, ledger.selected.program, "selected")); run.save();
  }
} else if (operation === "comparisons") {
  assert(ledger.selected && ledger.confirmation.length === 4 && !ledger.comparisons.length); begin();
  for (const kind of plan.comparison_kinds) for (const case_id of [...plan.training, ...plan.transfer]) {
    ledger.comparisons.push(trial(`${kind}-${case_id}`, case_id, ledger.selected.program, kind)); run.save();
  }
} else if (operation === "controls") {
  assert(ledger.selected && ledger.comparisons.length === 16 && !ledger.controls.length); begin();
  for (const kind of plan.control_kinds) for (const case_id of plan.training.slice(0, 2)) {
    ledger.controls.push(trial(`${kind}-${case_id}`, case_id, ledger.selected.program, kind)); run.save();
  }
} else if (operation === "replays") {
  assert(ledger.selected && ledger.controls.length === 12 && !ledger.replays.length); begin();
  for (const spec of plan.replays) {
    const experiment = variant(caseInput(spec.case_id), ledger.selected.program, spec.kind);
    const row = trajectory(run, spec.id, experiment, { cuts: spec.cuts, restoreTicks: spec.restore_ticks });
    const receipt = read(path.join(run.root, row.receipt));
    ledger.replays.push({ ...row, ...grade(receipt), case_id: spec.case_id, kind: spec.kind }); run.save();
  }
} else if (operation === "probes") {
  assert.equal(ledger.replays.length, 4); assert(!ledger.probes.length); begin();
  probes(run, ledger, plan);
} else if (operation === "finish") {
  assert.equal(ledger.reference.length, 8); assert.equal(ledger.candidates.length, 3);
  assert.equal(ledger.confirmation.length, 4); assert.equal(ledger.comparisons.length, 16);
  assert.equal(ledger.controls.length, 12); assert.equal(ledger.replays.length, 4); assert.equal(ledger.probes.length, 12);
  checkSelection(ledger, run.root);
  const allReference = ledger.reference.every(row => row.milestone_passed && row.report_used);
  const replaysEqual = ledger.replays.every(row => row.restored_equal && row.uninterrupted_equal);
  const probesPassed = ledger.probes.every(row => row.status === "pass");
  const group = kind => ledger.controls.filter(row => row.kind === kind);
  const every = (kind, predicate) => group(kind).length === 2 && group(kind).every(row => row.status === "complete" && predicate(row));
  const removal_findings = {
    material_required: ["no-stock", "no-acquisition"].every(kind => every(kind, row => row.birth_tick === null && !row.construction_passed)),
    activation_required: every("no-activation", row => row.inactive_ready && row.birth_tick === null && !row.useful_child),
    child_policy_required: every("idle-child", row => row.construction_passed && !row.useful_child && !row.passed),
    courier_causal: every("idle-courier", row => !row.passed),
    relay_causal: every("idle-relay", row => !row.passed),
  };
  ledger.finished = { removal_findings, causal_reuse: removal_findings.courier_causal && removal_findings.relay_causal,
    construction_gate: allReference && ledger.confirmation.every(row => row.milestone_passed) && replaysEqual && probesPassed,
    reference_report_path: allReference, all_saved_traces_equal: replaysEqual, integrity_probes: probesPassed,
    logical_cold_runs: ledger.calls.filter(call => call.args[0] === "run").length };
} else assert.equal(operation, "init");
ledger.pending_operation = null; run.save();
console.log(JSON.stringify({ operation, engine_executions: ledger.engine_executions,
  candidates: ledger.candidates.map(({ id, passed, work }) => ({ id, passed, work })),
  selected: ledger.selected?.id ?? null, confirmation: ledger.confirmation.map(({ case_id, passed, milestone_passed, work }) => ({ case_id, passed, milestone_passed, work })),
  finished: ledger.finished ?? null }, null, 2));
