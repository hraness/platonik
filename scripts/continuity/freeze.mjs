// Admit an already-qualified source. This operation executes no game worlds.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { read, sha, binary, protocol, sourceIdentity, protocolIdentity } from "./runner.mjs";
import { write } from "./trajectory.mjs";
const preflight = read(path.join(process.argv[2], "ledger.json"));
assert(preflight.qualified && !preflight.stopped && !preflight.pending_call && !preflight.accounting_incomplete);
assert(Number.isSafeInteger(preflight.engine_executions) && preflight.engine_executions > 0);
assert.equal(preflight.engine_executions, preflight.calls.reduce((sum, call) => {
  assert(Number.isSafeInteger(call.metrics.engine_executions) && call.metrics.engine_executions >= 0);
  assert(call.metrics.engine_executions <= call.reserved_engine_executions);
  return sum + call.metrics.engine_executions;
}, 0));
assert(preflight.engine_executions <= preflight.maximum_engine_executions);
const plan = protocol();
assert.equal(plan.status, "qualified-frozen");
const admitted = sourceIdentity();
assert.deepEqual(admitted, preflight.source_files_sha256, "Source differs from qualified source");
assert.equal(protocolIdentity(), preflight.protocol_projection_hash, "Protocol differs from qualified protocol");
assert.equal(sha(fs.readFileSync(binary)), preflight.release_binary_sha256, "Executable differs from qualified executable");
const source_files_sha256 = Object.fromEntries(Object.entries({ ...admitted,
  "fixtures/evidence/continuity-protocol.json": sha(fs.readFileSync("fixtures/evidence/continuity-protocol.json")) }).toSorted(([a], [b]) => a.localeCompare(b)));
const sanitize = value => {
  if (typeof value === "string") return value.replaceAll(`${process.cwd()}/`, "");
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item)]));
  return value;
};
write("fixtures/evidence/continuity-freeze.json", {
  schema: "platonik-continuity-freeze-v1", date: "2026-09-11",
  protocol_sha256: sha(fs.readFileSync("fixtures/evidence/continuity-protocol.json")),
  source_files_sha256, source_tree_digest: sha(JSON.stringify(source_files_sha256)),
  release_binary_sha256: sha(fs.readFileSync(binary)), preflight: sanitize(preflight),
  context: "Public inputs, source and transfer recipes; agents may reuse previous programs. External reasoning tokens are unknown. Historical source identities are provenance, not a requirement to prohibit later compatible source changes."
});
console.log("Qualified source and protocol frozen; optimizer admission may begin.");
