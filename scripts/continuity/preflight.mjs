// Run before optimizer admission. Failed attempts remain separate evidence.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createLedger, runner, read, identity, protocol, sourceIdentity, protocolIdentity, binary, sha } from "./runner.mjs";
import { trajectory, write } from "./trajectory.mjs";
const directory = process.argv[2];
assert(directory, "Supply a new preflight directory");
const ledger = createLedger(directory, 1024, { owner: "preflight", cases: [],
  source_files_sha256: sourceIdentity(), protocol_projection_hash: protocolIdentity(),
  release_binary_sha256: sha(fs.readFileSync(binary)) });
const run = runner(directory, ledger);
const plan = protocol();
for (const id of [...plan.cases.training, ...plan.cases.transfer]) {
  const file = path.resolve(`fixtures/evidence/continuity-cases/${id}.json`);
  const input = run.cli(["habitat", "case", id]).value;
  assert.deepEqual(input, read(file), `Canonical case export ${id}`);
  const receipt = run.cli(["run", file]).value;
  const receiptFile = path.join(run.root, `${id}.receipt.json`); write(receiptFile, receipt);
  const verified = run.cli(["verify", receiptFile]).value;
  assert(verified.verified && verified.passed, `Unqualified reference ${id}`);
  ledger.cases.push({ id, experiment_hash: receipt.experiment_hash, result_hash: receipt.result_hash,
    passed: verified.passed, verified: verified.verified, work: verified.work }); run.save();
}
ledger.segmented = trajectory(run, "continuous-reference", read("fixtures/evidence/continuity-cases/changing-one.json"));
assert(ledger.segmented.passed && ledger.segmented.uninterrupted_equal && ledger.segmented.restored_equal);
ledger.maximum_observed_call = Math.max(...ledger.calls.map(call => call.metrics.engine_executions));
ledger.segmented_executions = ledger.engine_executions - 16;
const terminal = read("fixtures/evidence/continuity-cases/changing-one.json"); terminal.fuel = 1;
ledger.loading_failure = trajectory(run, "terminal-loading", terminal);
assert.equal(ledger.loading_failure.passed, false);
assert.equal(ledger.loading_failure.status, "fuel_exhausted");
assert.equal(ledger.loading_failure.restoration, "not-applicable-terminal-before-cut");
ledger.maximum_observed_call = Math.max(...ledger.calls.map(call => call.metrics.engine_executions));
assert(ledger.maximum_observed_call <= plan.budget.per_cli_command_reservation);
assert(20 * ledger.segmented_executions + plan.budget.per_cli_command_reservation <= plan.budget.parallel_reservations.each_optimizer_arm,
  "Twenty trajectories and a reserved next-call margin must fit each optimizer budget");
assert.deepEqual(sourceIdentity(), ledger.source_files_sha256, "Source changed during qualification");
assert.equal(protocolIdentity(), ledger.protocol_projection_hash, "Protocol changed during qualification");
assert.equal(sha(fs.readFileSync(binary)), ledger.release_binary_sha256, "Executable changed during qualification");
ledger.qualified = true; run.save();
console.log(JSON.stringify({ qualified: true, engine_executions: ledger.engine_executions,
  per_trajectory: ledger.segmented_executions, maximum_observed_call: ledger.maximum_observed_call,
  cases: ledger.cases, result_hash: ledger.segmented.result_hash, final_ledger_hash: identity(ledger) }, null, 2));
