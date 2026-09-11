import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createLedger, runner, read, sha, identity, protocol, verifyFreeze } from "./runner.mjs";
import { trajectory, applyPair, write } from "./trajectory.mjs";

const [directory, operation, input] = process.argv.slice(2);
if (!directory || !operation) throw new Error("Use: node scripts/continuity/agent-session.mjs <new-directory> init <frugal|resilient> | candidate <pair.json> | freeze <candidate-id> | transfer | finish");
const frozenSource = verifyFreeze();
const plan = protocol();
let ledger;
if (operation === "init") {
  assert(["frugal", "resilient"].includes(input));
  ledger = createLedger(directory, plan.budget.parallel_reservations.each_optimizer_arm,
    { owner: input, source_tree_digest: frozenSource.source_tree_digest,
      protocol_sha256: frozenSource.protocol_sha256, release_binary_sha256: frozenSource.release_binary_sha256,
      candidates: [], frozen: null, transfer: [] });
} else ledger = read(path.join(directory, "ledger.json"));
for (const field of ["source_tree_digest", "protocol_sha256", "release_binary_sha256"])
  assert.equal(ledger[field], frozenSource[field], `Session belongs to a different frozen ${field}`);
const run = runner(directory, ledger);
const caseInput = id => read(`fixtures/evidence/continuity-cases/${id}.json`);
const original = caseInput(plan.cases.training[0]);
if (ledger.pending_operation) run.stop("Interrupted study operation retained; reconcile before any further diagnostic.");
function candidatePair(file) {
  const pair = read(file);
  assert(typeof pair.id === "string" && /^[a-z][a-z0-9-]{0,23}$/.test(pair.id), "Candidate needs a short fresh id");
  assert(pair.courier && pair.controller, "Provide both whole programs");
  if (ledger.owner === "resilient") assert.deepEqual(pair.courier, original.cells.find(cell => cell.id === 1).program, "Resilient arm preserves the exact original courier");
  return pair;
}
if (operation === "candidate") {
  assert(!ledger.frozen && ledger.candidates.length < plan.budget.candidate_batches_per_agent);
  const entry = { sequence: ledger.candidates.length + 1, id: null, admission: "submitted", trials: [], passed: false };
  ledger.candidates.push(entry); ledger.pending_operation = `candidate-${entry.sequence}`; run.save();
  try {
    const bytes = fs.readFileSync(input);
    entry.source = `submission-${entry.sequence}.json`;
    fs.writeFileSync(path.join(run.root, entry.source), bytes, { flag: "wx" });
    entry.source_sha256 = sha(bytes); run.save();
    const pair = candidatePair(path.join(run.root, entry.source));
    assert(!ledger.candidates.some(item => item !== entry && item.id === pair.id), "Candidate id already used");
    entry.id = pair.id; entry.admission = "admitted"; run.save();
    for (const case_id of plan.cases.training) {
      const trial = trajectory(run, `c${entry.sequence}-${case_id}`, applyPair(caseInput(case_id), pair));
      entry.trials.push({ ...trial, case_id }); run.save();
    }
    entry.pair = entry.trials[0].pair;
    entry.pair_hash = identity(entry.pair);
    entry.policy_bytes = Buffer.byteLength(JSON.stringify(entry.pair));
    entry.passed = entry.trials.every(trial => trial.passed);
    entry.work = entry.trials.reduce((sum, trial) => sum + trial.work, 0);
    entry.admission = "completed";
  } catch (error) {
    if (!entry.source) entry.input_unavailable = true;
    entry.admission = entry.trials.length ? "partial" : "rejected";
    entry.error = error.message;
    ledger.pending_operation = null; run.save(); throw error;
  }
  ledger.pending_operation = null; run.save();
} else if (operation === "freeze") {
  assert.equal(ledger.candidates.length, plan.budget.candidate_batches_per_agent);
  assert(!ledger.frozen);
  const best = ledger.candidates.filter(item => item.passed).toSorted((a, b) => a.work - b.work || a.policy_bytes - b.policy_bytes || a.sequence - b.sequence)[0];
  assert(best && best.id === input, `Predeclared ordering selects ${best?.id ?? "no successful candidate"}`);
  ledger.frozen = { id: best.id, sequence: best.sequence, pair: best.pair, pair_hash: best.pair_hash,
    after_call: ledger.calls.length, training_work: best.work };
  write(path.join(run.root, "frozen.json"), ledger.frozen); run.save();
} else if (operation === "transfer") {
  assert(ledger.frozen && ledger.transfer.length === 0 && !ledger.finished);
  ledger.pending_operation = "transfer"; run.save();
  for (const case_id of plan.cases.transfer) {
    const trial = trajectory(run, `transfer-${case_id}`, applyPair(caseInput(case_id), ledger.frozen.pair));
    ledger.transfer.push({ ...trial, case_id }); run.save();
  }
  ledger.pending_operation = null; run.save();
} else if (operation === "finish") {
  assert.equal(ledger.transfer.length, plan.cases.transfer.length);
  assert(!ledger.finished);
  for (const candidate of ledger.candidates) {
    if (candidate.input_unavailable) assert(candidate.admission === "rejected" && !candidate.source);
    else assert.equal(sha(fs.readFileSync(path.join(run.root, candidate.source))), candidate.source_sha256, "Original candidate retained");
  }
  assert.equal(identity(read(path.join(run.root, "frozen.json"))), identity(ledger.frozen));
  ledger.finished = { complete: ledger.transfer.every(trial => trial.passed), all_inputs_retained: true,
    all_traces_verified: [...ledger.candidates.flatMap(item => item.trials), ...ledger.transfer].every(trial => trial.uninterrupted_equal
      && (trial.restored_equal || trial.restoration === "not-applicable-terminal-before-cut")) };
  run.save();
} else assert.equal(operation, "init");
console.log(JSON.stringify({ owner: ledger.owner, engine_executions: ledger.engine_executions,
  candidates: ledger.candidates.map(({ id, admission, passed, work, policy_bytes, error, trials }) => ({ id, admission, passed, work, policy_bytes, error, trials: trials.map(({ case_id, passed, work }) => ({ case_id, passed, work })) })),
  frozen: ledger.frozen, transfer: ledger.transfer.map(({ case_id, passed, work }) => ({ case_id, passed, work })), finished: ledger.finished }, null, 2));
