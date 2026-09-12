// Source admission follows qualification; freezing itself executes no worlds.
import assert from "node:assert/strict";
import fs from "node:fs";
import { read, sha, write, sourceIdentity, protocol, freezeFile, grade } from "./common.mjs";
const plan = protocol(), qualification = read(plan.qualification_file);
assert(!qualification.pending); assert(qualification.attempts.length <= plan.budget.qualification_attempts);
const calls = qualification.attempts.flatMap(row => row.calls);
assert(calls.every(call => Number.isSafeInteger(call.metrics?.engine_executions) && call.metrics.engine_executions >= 0));
assert.equal(qualification.engine_executions, calls.reduce((sum, call) => sum + call.metrics.engine_executions, 0));
assert(qualification.engine_executions <= plan.budget.qualification_engine_executions);
for (const row of plan.cases) {
  assert.equal(sha(fs.readFileSync(row.file)), row.sha256);
  const last = qualification.attempts.findLast(attempt => attempt.case_id === row.id && attempt.passed && attempt.verified);
  assert(last, `No qualified reference for ${row.id}`);
  const receipt = read(`${qualification.packet_directory}/${last.receipt_file}`);
  assert.deepEqual(receipt.experiment, read(row.file)); assert.equal(receipt.result.status, "complete");
  const verdict = grade(receipt); assert(verdict.milestone_passed && verdict.report_used, "Known feasible material/useful/report reference");
}
write(freezeFile, { schema: "platonik-construction-freeze-v1", source: sourceIdentity(),
  qualification_sha256: sha(fs.readFileSync(plan.qualification_file)),
  qualification_engine_executions: qualification.engine_executions });
console.log("Construction inputs, drafts, source and executable frozen; no candidate trial executed by this command.");
