import assert from "node:assert/strict";
import { read, identity, fixedSource, write } from "./common.mjs";
const ledger = read(`${process.argv[2]}/ledger.json`);
assert(ledger.owner === "preflight" && ledger.finished?.preflight && !ledger.stopped && !ledger.pending_call && !ledger.pending_operation);
const source = fixedSource(); assert.equal(ledger.source_digest, identity(source));
assert.equal(ledger.engine_executions, ledger.calls.reduce((sum, call) => sum + call.metrics.engine_executions, 0));
write("fixtures/evidence/navigation-repair-freeze.json", { schema: "platonik-navigation-freeze-v1", source, preflight: ledger });
console.log(JSON.stringify({ source_digest: identity(source), preflight_executions: ledger.engine_executions }));
