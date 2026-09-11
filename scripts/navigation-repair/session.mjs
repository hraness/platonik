// One bounded public-source developer-agent search; all execution is Rust CLI.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createLedger, runner } from "../continuity/runner.mjs";
import { trajectory } from "../continuity/trajectory.mjs";
import { read, sha, identity, write, protocol, caseInput, courier, apply, fixedSource, checkedFreeze, checkSelection, cold, ablate, compact } from "./common.mjs";

const [directory, operation, id, input] = process.argv.slice(2);
assert(directory && operation, "Use session.mjs DIRECTORY preflight|init|candidate ID FILE|freeze|confirm|baselines|replays|finish");
const plan = protocol();
const source = operation === "preflight" ? fixedSource() : checkedFreeze().source;
let ledger;
if (["init", "preflight"].includes(operation)) ledger = createLedger(directory,
  operation === "preflight" ? plan.budget.preflight_engine_executions : plan.budget.study_engine_executions,
  { schema: "platonik-navigation-ledger-v1", owner: operation === "preflight" ? "preflight" : "navigator",
    source_digest: identity(source), candidates: [], selected: null, confirmation: [], baselines: [], replays: [], pending_operation: null });
else ledger = read(path.join(directory, "ledger.json"));
assert.equal(ledger.schema, "platonik-navigation-ledger-v1");
assert.equal(ledger.owner, operation === "preflight" ? "preflight" : "navigator");
assert.equal(ledger.maximum_engine_executions, operation === "preflight" ? plan.budget.preflight_engine_executions : plan.budget.study_engine_executions);
assert.equal(ledger.source_digest, identity(source), "Session is bound to its exact frozen inputs/helpers/executable");
assert(!ledger.pending_operation && !ledger.finished, "Do not silently repeat interrupted or completed work");
const run = runner(directory, ledger);
if (ledger.selected) checkSelection(ledger, run.root);
const trial = (label, case_id, program) => ({ ...cold(run, label, caseInput(case_id), program), case_id });
const original = caseInput(plan.training[0]);
if (operation === "preflight") {
  ledger.pending_operation = "preflight"; run.save();
  for (const case_id of plan.training.slice(0, 2)) {
    const result = trial(`preflight-${case_id}`, case_id, courier(caseInput(case_id)));
    assert(!result.passed && result.status === "complete"); ledger.confirmation.push(result); run.save();
  }
  ledger.replays.push({ ...trajectory(run, "preflight-restoration", original), case_id: plan.training[0] });
  assert(ledger.replays[0].uninterrupted_equal && ledger.replays[0].restored_equal);
  ledger.pending_operation = null; ledger.finished = { preflight: true }; run.save();
} else if (operation === "candidate") {
  assert(!ledger.selected && ledger.confirmation.length === 0 && ledger.candidates.length < plan.candidates.length);
  const declared = plan.candidates[ledger.candidates.length];
  assert.equal(id, declared.id, "Consume the three declared draft slots in order");
  const entry = { id, sequence: ledger.candidates.length + 1, admission: "submitted", trials: [], passed: false, first_call: ledger.calls.length };
  ledger.candidates.push(entry); ledger.pending_operation = `candidate-${id}`; run.save();
  try {
    const bytes = fs.readFileSync(input); entry.source = `submission-${entry.sequence}.json`;
    fs.writeFileSync(path.join(run.root, entry.source), bytes, { flag: "wx" });
    entry.source_sha256 = sha(bytes); run.save();
    assert.equal(entry.source_sha256, declared.source_sha256, "All drafts fixed before any candidate trial");
    const program = JSON.parse(bytes);
    for (const case_id of plan.training) { entry.trials.push(trial(`c${entry.sequence}-${case_id}`, case_id, program)); run.save(); }
    entry.program = entry.trials[0].program;
    assert(entry.trials.every(row => row.program_hash === identity(entry.program)));
    entry.program_hash = identity(entry.program); entry.program_bytes = Buffer.byteLength(JSON.stringify(entry.program));
    entry.work = entry.trials.reduce((sum, row) => sum + row.work, 0);
    entry.passed = entry.trials.every(row => row.passed && row.status === "complete"); entry.admission = "completed";
  } catch (error) {
    entry.error = error.message; entry.admission = entry.trials.length ? "partial" : "rejected";
    entry.after_call = ledger.calls.length;
    if (!entry.source) entry.input_unavailable = true;
    // Unknown CLI completion remains stopped/pending in the underlying ledger.
    ledger.pending_operation = null; run.save(); throw error;
  }
  entry.after_call = ledger.calls.length;
  ledger.pending_operation = null; run.save();
} else if (operation === "freeze") {
  assert.equal(ledger.candidates.length, plan.candidates.length); assert(!ledger.selected);
  const selected = checkSelection(ledger, run.root);
  if (!selected) {
    ledger.finished = { navigation_gate: false, reason: "No all-training-pass candidate; no transfer admission or extra candidate slot." }; run.save();
  } else {
    ledger.selected = { id: selected.id, sequence: selected.sequence, program: selected.program,
      program_hash: selected.program_hash, training_work: selected.work, after_call: ledger.calls.length };
    write(path.join(run.root, "selected.json"), ledger.selected); run.save();
  }
} else if (operation === "confirm") {
  assert(ledger.selected && !ledger.confirmation.length); ledger.pending_operation = "confirmation"; run.save();
  for (const [kind, ids] of [["transfer", plan.transfer], ["compatibility", plan.compatibility]]) for (const case_id of ids) {
    ledger.confirmation.push({ ...trial(`confirm-${case_id}`, case_id, ledger.selected.program), kind }); run.save();
  }
  ledger.pending_operation = null; run.save();
} else if (operation === "baselines") {
  assert(ledger.selected && ledger.confirmation.length === plan.transfer.length + plan.compatibility.length && !ledger.baselines.length);
  ledger.pending_operation = "baselines"; run.save();
  for (const [kind, program] of [["right-wall", courier(original)], ["compact", compact(original)], ["without-return-goal", ablate(ledger.selected.program, ledger.selected.id)]]) {
    for (const case_id of plan.distinct_cases) { ledger.baselines.push({ ...trial(`${kind}-${case_id}`, case_id, program), kind }); run.save(); }
  }
  ledger.pending_operation = null; run.save();
} else if (operation === "replays") {
  assert(ledger.selected && ledger.baselines.length === 3 * plan.distinct_cases.length && !ledger.replays.length);
  ledger.pending_operation = "replays"; run.save();
  for (const [suffix, case_id] of [["reversed", plan.training[0]], ["late", plan.training[1]]])
    for (const variant of ["original", "repaired"]) {
      const experiment = caseInput(case_id);
      const program = variant === "original" ? courier(experiment) : ledger.selected.program;
      ledger.replays.push({ ...trajectory(run, `${variant}-${suffix}`, apply(experiment, program)), case_id, variant }); run.save();
    }
  ledger.pending_operation = null; run.save();
} else if (operation === "finish") {
  assert.equal(ledger.replays.length, 4); assert.equal(ledger.confirmation.length, 42); assert.equal(ledger.baselines.length, 132);
  assert.deepEqual(read(path.join(run.root, "selected.json")), ledger.selected);
  for (const entry of ledger.candidates) {
    if (entry.input_unavailable) assert(entry.admission === "rejected" && !entry.source);
    else assert.equal(sha(fs.readFileSync(path.join(run.root, entry.source))), entry.source_sha256);
  }
  ledger.finished = { navigation_gate: ledger.confirmation.every(row => row.passed),
    original_failures_repaired: ledger.replays.filter(row => row.variant === "repaired").every(row => row.passed),
    all_saved_traces_equal: ledger.replays.every(row => row.uninterrupted_equal && row.restored_equal),
    logical_cold_runs: ledger.candidates.flatMap(row => row.trials).length + ledger.confirmation.length + ledger.baselines.length };
  run.save();
} else assert.equal(operation, "init");
console.log(JSON.stringify({ operation, engine_executions: ledger.engine_executions,
  candidates: ledger.candidates.map(({ id, passed, work, trials }) => ({ id, passed, work, trials: trials.map(({ case_id, passed, work }) => ({ case_id, passed, work })) })),
  selected: ledger.selected && { id: ledger.selected.id, training_work: ledger.selected.training_work },
  confirmation: ledger.confirmation.map(({ case_id, passed, work }) => ({ case_id, passed, work })),
  baseline_passes: ["right-wall", "compact", "without-return-goal"].map(kind => ({ kind, passed: ledger.baselines.filter(row => row.kind === kind && row.passed).length, total: ledger.baselines.filter(row => row.kind === kind).length })),
  replays: ledger.replays.map(({ id, passed, work }) => ({ id, passed, work })), finished: ledger.finished }, null, 2));
