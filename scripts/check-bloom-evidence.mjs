import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";

const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const digest = value => `sha256:${crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const index = read("public/bloom/index.json");
assert.equal(index.schema, "platonik-continuous-site-v1");
assert.equal(index.cases.length, 2);
for (const item of index.cases) {
  assert.match(item.id, /^[a-z0-9-]+$/);
  const receipt = read(`public/bloom/${item.id}.receipt.json`);
  const experiment = read(`public/bloom/${item.id}.experiment.json`);
  const grade = item.bloom;
  assert.deepEqual(experiment, receipt.experiment);
  assert.equal(digest(receipt.experiment), receipt.experiment_hash);
  assert.equal(digest(receipt.result), receipt.result_hash);
  assert.equal(item.result_hash, receipt.result_hash);
  assert.equal(item.composition, `composition/${item.id}.json`);
  const composition = read(`public/bloom/${item.composition}`);
  assert.equal(receipt.protocol, "platonik-habitat-v4");
  assert.equal(receipt.result.status, "complete");
  assert.equal(receipt.result.ticks_completed, 128);
  assert.equal(grade.schema, "platonik-bloom-v1");
  assert.equal(grade.experiment_hash, receipt.experiment_hash);
  assert.equal(grade.result_hash, receipt.result_hash);
  for (const field of ["generated_passed", "trials_passed", "selection_passed", "confirmation_passed", "service_passed", "bloomed"])
    assert.equal(grade[field], true, `${item.id}: ${field}`);
  assert.equal(grade.phase, "bloomed");
  assert.equal(grade.candidates.length, 2);
  assert.notEqual(grade.candidates[0].program_hash, grade.candidates[1].program_hash);
  for (const candidate of grade.candidates) {
    assert.equal(candidate.family_passed, true);
    assert.equal(candidate.trial_passed, true);
    assert(candidate.edits.length >= 2 && candidate.edits.length <= 8);
  }
  assert.equal(composition.schema, "platonik-composition-v1");
  assert.equal(composition.base_experiment_hash, receipt.experiment_hash);
  assert.equal(composition.base_result_hash, receipt.result_hash);
  assert.equal(composition.bloom_grade_hash, digest(grade));
  const winner = grade.candidates[grade.selection.candidate];
  assert.equal(composition.selected_child, winner.child);
  assert.equal(composition.selected_program_hash, winner.program_hash);
  assert.equal(composition.request.tick, winner.confirmation_requested);
  assert.equal(composition.pickup, winner.confirmation_pickup);
  assert.equal(composition.accepted, winner.confirmation_accepted);
  assert.equal(composition.serviced, winner.confirmation_serviced);
  assert.equal(composition.ack.receipt_spark, winner.confirmation_parcel);
  assert.equal(composition.spare.spark, grade.candidates[1 - grade.selection.candidate].confirmation_parcel);
  assert.equal(composition.work_total, Object.values(receipt.result.costs).reduce((sum, value) => sum + value, 0));
}
console.log(`Checked Bloom evidence: ${index.cases.length} public references, generated variants, causal selection, and confirmation.`);

const study = read("fixtures/evidence/bloom-study.json");
assert.equal(study.schema, "platonik-bloom-agent-study-v1");
assert.equal(study.protocol_sha256, `sha256:${crypto.createHash("sha256").update(fs.readFileSync("fixtures/evidence/bloom-protocol.json")).digest("hex")}`);
assert.equal(study.freeze_sha256, `sha256:${crypto.createHash("sha256").update(fs.readFileSync("fixtures/evidence/bloom-freeze.json")).digest("hex")}`);
assert.deepEqual(Object.keys(study.arms).sort(), ["frugal", "keep"]);
for (const arm of Object.values(study.arms)) {
  assert.equal(arm.engine_executions, 24);
  assert.equal(arm.candidates.length, 3);
  assert.equal(arm.candidates.filter(candidate => candidate.admission === "rejected").length, 1);
  assert.equal(arm.transfer.length, 4);
  assert(arm.finished.bloomed && arm.finished.all_inputs_retained);
}
assert.deepEqual(study.finished, { arms_passed: true, training_worlds: 4, transfer_worlds: 4, total_engine_executions: 48, logical_cold_runs: 24, malformed_slots_retained: 2, reasoning_tokens: null });
for (const arm of ["keep", "frugal"]) assert(fs.existsSync(`fixtures/evidence/bloom-study/${arm}.tar.gz`));
console.log(`Checked Bloom agent study: two bounded arms, 48 engine executions, transfer, and retained malformed slots.`);

const capacity = read("fixtures/evidence/bloom-capacity.json");
assert.equal(capacity.schema, "platonik-bloom-capacity-v1");
assert.equal(capacity.engine_executions, 124);
assert.equal(capacity.samples_per_workload, 30);
assert.equal(capacity.warmups_per_workload, 1);
assert.equal(capacity.workloads.length, 2);
assert.equal(capacity.buffer_capacity_bytes, 8 * 1024 * 1024);
for (const workload of capacity.workloads) {
  assert.equal(workload.samples.length, 30);
  assert(workload.samples.every(sample => sample.bloomed && sample.engine_executions === 2));
  assert(workload.samples.every(sample => sample.receipt_bytes <= capacity.buffer_capacity_bytes));
}
console.log(`Checked Bloom capacity: two fixed workloads, 124 engine executions, bounded receipts, and reusable serialization buffer.`);
