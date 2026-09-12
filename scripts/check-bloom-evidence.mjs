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
}
console.log(`Checked Bloom evidence: ${index.cases.length} public references, generated variants, causal selection, and confirmation.`);
