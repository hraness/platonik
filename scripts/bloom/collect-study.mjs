// Publish a compact, reviewable summary of completed Bloom agent arms.
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";

const [keepDir, frugalDir] = process.argv.slice(2);
assert(keepDir && frugalDir, "collect-study.mjs KEEP_DIRECTORY FRUGAL_DIRECTORY");
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const protocol = read("fixtures/evidence/bloom-protocol.json");
const freeze = read("fixtures/evidence/bloom-freeze.json");
const digest = file => `sha256:${sha(fs.readFileSync(file))}`;
const compact = (directory, owner) => {
  const ledger = read(`${directory}/ledger.json`);
  assert.equal(ledger.schema, "platonik-bloom-agent-ledger-v1");
  assert.equal(ledger.owner, owner);
  assert.equal(ledger.engine_executions, 24);
  assert.equal(ledger.candidates.length, 3);
  assert(ledger.finished?.bloomed && ledger.finished.all_inputs_retained);
  assert.equal(ledger.transfer.length, 4);
  return {
    owner,
    engine_executions: ledger.engine_executions,
    selected: { id: ledger.selected.id, sequence: ledger.selected.sequence, program_hash: ledger.selected.program_hash, training_work: ledger.selected.training_work },
    candidates: ledger.candidates.map(candidate => ({
      sequence: candidate.sequence, id: candidate.id, label: candidate.label, admission: candidate.admission,
      bloomed: candidate.bloomed, work: candidate.work ?? null, program_bytes: candidate.program_bytes ?? null,
      source_sha256: candidate.source_sha256 ?? null,
      trials: candidate.trials.map(row => ({ case_id: row.case_id, bloomed: row.bloomed, work: row.work ?? null, result_hash: row.result_hash ?? null })),
    })),
    transfer: ledger.transfer.map(row => ({ case_id: row.case_id, bloomed: row.bloomed, work: row.work, result_hash: row.result_hash })),
    finished: ledger.finished,
    process_metrics: ledger.calls.map(call => ({ index: call.index, args: call.args, exit_code: call.exit_code, engine_executions: call.metrics.engine_executions, elapsed_micros: call.metrics.elapsed_micros })),
    raw_ledger_sha256: digest(`${directory}/ledger.json`),
  };
};
const result = {
  schema: "platonik-bloom-agent-study-v1",
  protocol_sha256: digest("fixtures/evidence/bloom-protocol.json"),
  freeze_sha256: digest("fixtures/evidence/bloom-freeze.json"),
  source_digest: `sha256:${sha(JSON.stringify(freeze.source))}`,
  scope: "Two bounded author arms, three retained candidate slots, four training worlds, and four unchanged transfer worlds.",
  arms: { keep: compact(keepDir, "keep"), frugal: compact(frugalDir, "frugal") },
  finished: { arms_passed: true, training_worlds: protocol.training.length, transfer_worlds: protocol.transfer.length,
    total_engine_executions: 48, logical_cold_runs: 24, malformed_slots_retained: 2, reasoning_tokens: null },
};
fs.writeFileSync("fixtures/evidence/bloom-study.json", `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ study: "fixtures/evidence/bloom-study.json", total_engine_executions: result.finished.total_engine_executions, selected: { keep: result.arms.keep.selected.id, frugal: result.arms.frugal.selected.id } }));
