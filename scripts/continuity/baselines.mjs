import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createLedger, runner, read, sha, protocol, verifyFreeze } from "./runner.mjs";
import { trajectory, total, write } from "./trajectory.mjs";
const frozen = verifyFreeze();
const plan = protocol();
const ledger = createLedger(process.argv[2], plan.budget.parallel_reservations.baselines_controls_and_four_segmented_site_replays,
  { owner: "baselines", source_tree_digest: frozen.source_tree_digest, trials: [], site: [] });
const run = runner(process.argv[2], ledger);
for (const id of plan.baselines.map(row => row.id)) {
  for (const case_id of [...plan.cases.training, ...plan.cases.transfer]) {
    evaluate(id, case_id, "baseline");
  }
}
for (const control of plan.causal_controls) evaluate(control.id, control.case, "control");
function evaluate(id, case_id, kind) {
  const name = `${id}--${case_id}`;
  const input = path.resolve(`fixtures/evidence/continuity-inputs/${name}.json`);
  const receipt = run.cli(["run", input]).value;
  const file = path.join(run.root, `${name}.receipt.json`); write(file, receipt);
  const verified = run.cli(["verify", file]).value;
  assert(verified.verified);
  if (kind === "control") assert.equal(receipt.result.outcome.passed, false);
  ledger.trials.push({ id, case_id, kind, passed: receipt.result.outcome.passed, work: total(receipt.result.costs),
    status: receipt.result.status, result_hash: receipt.result_hash, experiment_hash: receipt.experiment_hash,
    receipt: path.relative(run.root, file), receipt_sha256: sha(fs.readFileSync(file)) }); run.save();
}
for (const [id, input_id] of [["remember-both", "unchanged-reference"], ["keep-only-yes", "previous-frugal"],
  ["try-both", "blind-alternator"], ["relay-rests", "idle-relay"]]) {
  const result = trajectory(run, id, read(`fixtures/evidence/continuity-inputs/${input_id}--changing-one.json`));
  assert.equal(result.result_hash, ledger.trials.find(row => row.id === input_id && row.case_id === "changing-one").result_hash);
  ledger.site.push({ ...result, input_id }); run.save();
}
ledger.finished = true; run.save();
console.log(JSON.stringify({ engine_executions: ledger.engine_executions,
  trials: ledger.trials.map(({ id, case_id, passed, work }) => ({ id, case_id, passed, work })),
  site: ledger.site.map(({ id, passed, work }) => ({ id, passed, work })) }, null, 2));
