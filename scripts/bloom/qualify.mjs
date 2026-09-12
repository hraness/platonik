// Pre-freeze qualification. Every repair starts an additive batch; no outputs are replaced.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { training, transfer, controls, control, createLedger, runner, read, sha, identity,
  sourceSnapshot, assertSource } from "./common.mjs";

export const plan = {
  schema: "platonik-bloom-qualification-plan-v1", maximum_engine_executions: 128,
  training, transfer, controls,
  expected_first_pass_engine_executions: 28,
  scope: "Eight public finite worlds; two copies of one seed, charged in-world direction edits, physical trials, locally earned selection, and later confirmation in the same world. This qualifies reference feasibility and targeted failure controls, not optimization, blind generalization, unbounded evolution, or the integrated campaign.",
  rule: "Preserve source and binary identities, every input, stdout, stderr, and actual process metrics before continuing. Seal only eight completed successful references and six completed failed controls on identical source and binary. Additive repair batches share this fixed allowance; interrupted or uncertain accounting requires explicit reconciliation. A source snapshot alone does not prove which source built the executable: retain the owner's build record too.",
};

function seal(run) {
  const { ledger } = run;
  const references = [...ledger.batches].reverse().find(batch => batch.operation === "references" && batch.completed);
  const failures = [...ledger.batches].reverse().find(batch => batch.operation === "controls" && batch.completed);
  assert.equal(references?.attempts.length, 8);
  assert.equal(failures?.attempts.length, 6);
  assert.deepEqual(references.source.files, failures.source.files);
  assert.equal(references.source.binary_sha256, failures.source.binary_sha256);
  assertSource(references.source);
  const complete = index => {
    const attempt = ledger.attempts[index];
    assert.equal(sha(fs.readFileSync(path.join(run.root, attempt.input))), attempt.input_sha256);
    if (attempt.rejected || attempt.grade_rejected) return false;
    assert.equal(sha(fs.readFileSync(path.join(run.root, attempt.receipt))), attempt.receipt_sha256);
    assert.deepEqual(read(path.join(run.root, attempt.grade_file)), attempt.grade);
    return attempt.completed && attempt.status === "complete" && attempt.ticks === 128;
  };
  assert(references.attempts.every(index => complete(index) && ledger.attempts[index].bloomed), "Preserve failed references and qualify the repaired source before freezing");
  assert(failures.attempts.every(index => complete(index) && !ledger.attempts[index].bloomed), "Controls must be admitted, complete failed worlds, not rejected inputs");
  ledger.finished = { bloomed: true, reference_batch: references.sequence, control_batch: failures.sequence, reused_references: 8 };
  run.save();
  console.log(JSON.stringify({ finished: ledger.finished, engine_executions: ledger.engine_executions }));
}

function main() {
  const [directory, operation] = process.argv.slice(2);
  assert(directory && ["init", "references", "controls", "seal"].includes(operation), "qualify.mjs DIRECTORY init|references|controls|seal");
  const ledger = operation === "init" ? createLedger(directory, plan) : read(path.join(directory, "ledger.json"));
  assert.deepEqual(ledger.plan, plan);
  assert(!ledger.pending_attempt && !ledger.finished, "Resolve a pending attempt before another batch");
  const run = runner(directory, ledger);
  if (operation === "init") { console.log("Bloom qualification declared; zero engine executions."); return; }
  if (operation === "seal") { seal(run); return; }
  const sequence = ledger.batches.length, source = sourceSnapshot(run.root, sequence);
  const batch = { sequence, operation, source, source_digest: identity(source), first_call: ledger.calls.length, attempts: [], completed: false };
  ledger.batches.push(batch); run.save();
  const recipes = operation === "references" ? [...training, ...transfer].map(case_id => ({ case_id })) : controls;
  for (const recipe of recipes) {
    assertSource(source);
    assert(ledger.engine_executions + 2 <= ledger.maximum_engine_executions, "Keep qualification failures within the declared allowance");
    const index = ledger.attempts.length, stem = `attempt-${String(index).padStart(4, "0")}`;
    const attempt = { index, batch: sequence, ...recipe, first_call: ledger.calls.length, completed: false };
    ledger.attempts.push(attempt); batch.attempts.push(index); ledger.pending_attempt = index; run.save();
    const exported = run.cli(["habitat", "case", recipe.case_id], { reservation: 0 });
    const experiment = recipe.kind ? control(exported.value, recipe.kind) : exported.value;
    attempt.input = `${stem}.experiment.json`;
    fs.writeFileSync(path.join(run.root, attempt.input), `${JSON.stringify(experiment, null, 2)}\n`, { flag: "wx" });
    attempt.input_sha256 = sha(fs.readFileSync(path.join(run.root, attempt.input))); run.save();
    assertSource(source);
    const generated = run.cli(["run", path.join(run.root, attempt.input)], { reservation: 1, accepted: [0, 1, 2] });
    if (generated.call.exit_code === 2) {
      Object.assign(attempt, { rejected: true, diagnostic_file: generated.call.stderr, bloomed: false, after_call: ledger.calls.length, completed: true });
    } else {
      const receipt = generated.value;
      assert.deepEqual(receipt.experiment, experiment);
      attempt.receipt = generated.call.stdout; attempt.receipt_sha256 = generated.call.stdout_sha256; run.save();
      assertSource(source);
      const checked = run.cli(["habitat", "bloom-check", path.join(run.root, attempt.receipt)], { reservation: 1, accepted: [0, 2] });
      if (checked.call.exit_code === 2) {
        Object.assign(attempt, { grade_rejected: true, diagnostic_file: checked.call.stderr, bloomed: false, after_call: ledger.calls.length, completed: true });
      } else {
        const grade = checked.value;
        assert.equal(grade.schema, "platonik-bloom-v1");
        assert.equal(grade.experiment_hash, receipt.experiment_hash);
        assert.equal(grade.result_hash, receipt.result_hash);
        for (const field of ["generated_passed", "trials_passed", "selection_passed", "confirmation_passed", "service_passed", "bloomed"]) {
          assert.equal(typeof grade[field], "boolean", `Missing Bloom grade field: ${field}`);
        }
        Object.assign(attempt, { grade_file: checked.call.stdout, grade, experiment_hash: receipt.experiment_hash,
          result_hash: receipt.result_hash, service_passed: grade.service_passed, bloomed: grade.bloomed,
          status: receipt.result.status, ticks: receipt.result.ticks_completed,
          work: Object.values(receipt.result.costs).reduce((sum, value) => sum + value, 0),
          after_call: ledger.calls.length, completed: true });
      }
    }
    ledger.pending_attempt = null; run.save();
    console.log(JSON.stringify({ index, operation, ...recipe, bloomed: attempt.bloomed, rejected: attempt.rejected ?? false,
      grade_rejected: attempt.grade_rejected ?? false, work: attempt.work }));
  }
  assertSource(source);
  batch.after_call = ledger.calls.length; batch.completed = true; run.save();
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url))) main();
