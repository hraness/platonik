// Explicit one-time recovery of a completed import, with no engine execution.
// Original freeze, optimizer results, CLI calls and budget remain unchanged.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const sha = value => createHash("sha256").update(value).digest("hex");
const read = file => JSON.parse(fs.readFileSync(file));
const stem = "fixtures/evidence/construction-repairs/import-envelope";
const [directory] = process.argv.slice(2); assert(directory);
const file = path.join(directory, "ledger.json"), raw = fs.readFileSync(file), ledger = JSON.parse(raw);
const snapshot = `${stem}/interrupted-ledger.json`; assert(fs.readFileSync(snapshot).equals(raw));
assert.equal(ledger.pending_operation, "replays"); assert(!ledger.pending_call && !ledger.stopped && !ledger.finished);
assert.equal(ledger.engine_executions, 166); assert.equal(ledger.calls.length, 110);
assert.equal(ledger.maximum_engine_executions, 2048); assert.equal(ledger.selected.id, "memory-builder");
assert.equal(ledger.replays.length, 0); assert(!ledger.harness_repairs);
const advance = read(path.join(directory, ledger.calls[107].stdout));
const restored = read(path.join(directory, ledger.calls[109].stdout));
assert.equal(advance.request_id, "leg-8"); assert.equal(restored.request_id, null);
assert.deepEqual(restored, { ...advance, request_id: null });
const freezeFile = "fixtures/evidence/construction-freeze.json", frozen = read(freezeFile);
const changes = ["common", "trajectory"].map(name => {
  const file = `scripts/construction/${name}.mjs`, before_file = `${stem}/${name}.before.mjs`, after_file = `${stem}/${name}.after.mjs`;
  const before_sha256 = sha(fs.readFileSync(before_file)), after = fs.readFileSync(file);
  assert.equal(before_sha256, frozen.source.source_files_sha256[file]);
  fs.writeFileSync(after_file, after, { flag: "wx" });
  return { file, before_file, before_sha256, after_file, after_sha256: sha(after) };
});
const repairFile = `${stem}/repair.json`, script_file = "scripts/construction/repair-import-envelope.mjs";
const record = { schema: "platonik-construction-harness-repair-v1",
  reason: "Completed import preserves all authoritative fields and clears only the command-response request_id. Resume the existing imported save; no new candidate, replay prefix, or budget.",
  freeze_sha256: sha(fs.readFileSync(freezeFile)), interrupted_ledger_file: snapshot,
  interrupted_ledger_sha256: sha(raw), first_call: 104, after_call: 110, engine_executions: 166,
  retained_prefix_engine_executions: 62, remaining_engine_executions: 1882,
  resume_from: { replay: "keeper-born", tick: 8, next_tick: 16, save: "keeper-born/restored-8" },
  script_file, script_sha256: sha(fs.readFileSync(script_file)), changes };
const encoded = `${JSON.stringify(record, null, 2)}\n`; fs.writeFileSync(repairFile, encoded, { flag: "wx" });
ledger.harness_repairs = [{ file: repairFile, sha256: sha(encoded) }]; ledger.pending_operation = null;
fs.writeFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`);
console.log(JSON.stringify({ repaired: repairFile, retained_calls: 110, engine_executions: 166, remaining_engine_executions: 1882, new_executions: 0 }));
