// Publish only the finite completed diagnostic and its exact Rust artifacts.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { read, sha, identity, protocol } from "./continuity/runner.mjs";
const root = path.resolve(".platonik/continuity");
const freeze = read("fixtures/evidence/continuity-freeze.json");
const plan = protocol();
const owners = ["frugal", "resilient", "baselines", "probes", "capacity"];
const ledgers = Object.fromEntries(owners.map(owner => [owner, read(path.join(root, owner, "ledger.json"))]));
const sanitize = value => {
  if (typeof value === "string") return value.replaceAll(`${process.cwd()}/`, "");
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item)]));
  return value;
};
const artifacts = {};
function publish(source, file) {
  const bytes = fs.readFileSync(source), hash = sha(bytes);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) assert.equal(sha(fs.readFileSync(file)), hash, `Refuse to rewrite published ${file}`);
  else fs.writeFileSync(file, bytes, { flag: "wx" });
  artifacts[file] = { sha256: hash, bytes: bytes.length };
  return file;
}
function publishTrial(owner, trial) {
  const source = path.join(root, owner, trial.receipt);
  assert.equal(sha(fs.readFileSync(source)), trial.receipt_sha256);
  const receipt = read(source);
  assert.equal(receipt.result_hash, trial.result_hash);
  const receipt_file = publish(source, `fixtures/evidence/continuity-receipts/${trial.receipt_sha256}.json`);
  return { ...trial, receipt_file };
}
let engine_executions = 0;
for (const [owner, ledger] of Object.entries(ledgers)) {
  assert(!ledger.stopped && !ledger.pending_call && !ledger.pending_operation && !ledger.accounting_incomplete, `${owner}: incomplete accounting`);
  assert(ledger.finished, `${owner}: unfinished diagnostic`);
  assert.equal(ledger.source_tree_digest, freeze.source_tree_digest);
  assert.equal(ledger.engine_executions, ledger.calls.reduce((sum, call, index) => {
    assert.equal(call.index, index);
    assert(Number.isSafeInteger(call.metrics.engine_executions) && call.metrics.engine_executions >= 0);
    assert(call.metrics.engine_executions <= call.reserved_engine_executions);
    for (const stream of ["stdout", "stderr"])
      assert.equal(sha(fs.readFileSync(path.join(root, owner, call[stream]))), call[`${stream}_sha256`]);
    return sum + call.metrics.engine_executions;
  }, 0));
  assert(ledger.engine_executions <= ledger.maximum_engine_executions);
  engine_executions += ledger.engine_executions;
}
assert(engine_executions <= plan.budget.maximum_actual_engine_executions_including_replay);
const arms = ["frugal", "resilient"].map(owner => {
  const ledger = structuredClone(ledgers[owner]);
  assert.equal(ledger.candidates.length, 4); assert.equal(ledger.transfer.length, 4);
  for (const candidate of ledger.candidates) {
    if (candidate.source) candidate.source_file = publish(path.join(root, owner, candidate.source), `fixtures/evidence/continuity-submissions/${owner}-${candidate.sequence}.json`);
    candidate.trials = candidate.trials.map(trial => publishTrial(owner, trial));
  }
  ledger.transfer = ledger.transfer.map(trial => publishTrial(owner, trial));
  const representative = ledger.transfer[0];
  assert.equal(sha(fs.readFileSync(path.join(root, owner, representative.bundle))), representative.bundle_sha256);
  ledger.bundle_file = publish(path.join(root, owner, representative.bundle), `fixtures/evidence/continuity-${owner}.bundle.json`);
  return ledger;
});
const baselines = structuredClone(ledgers.baselines);
baselines.trials = baselines.trials.map(trial => publishTrial("baselines", trial));
for (const id of ["reversed-crossing", "late-crossing"]) {
  const file = `fixtures/evidence/continuity-counterexamples/${id}.receipt.json`;
  publish(file, file);
}
const labels = {
  "remember-both": ["Remember both reports", "The full reference keeper records both zero and one. Follow the same cargo, memories, and queued reports across every saved stop."],
  "keep-only-yes": ["Keep only yes", "The earlier Frugal winner keeps its old specialization. Watch what happens when a later supply asks for zero."],
  "try-both": ["Try both routes", "A blind keeper alternates its guesses. Wrong attempts cost work and leave the spark in the depot; every success is legitimate."],
  "relay-rests": ["Let the relay rest", "The full reference crew with its relay idle. This tests that crew's reliance on reports; the blind strategy uses a different design."]
};
const stops = { 5: "Cargo and position", 9: "Signals in transit", 14: "Remembered reports", 19: "Service begins", 27: "The next supply", 47: "Mid-journey", 79: "Late supplies", 96: "Final accounting" };
const site = { schema: "platonik-continuous-site-v1", cases: baselines.site.map(trial => {
  const source = path.join(root, "baselines", trial.receipt), receipt = read(source);
  assert.equal(sha(fs.readFileSync(source)), trial.receipt_sha256);
  assert.equal(sha(fs.readFileSync(path.join(root, "baselines", trial.bundle))), trial.bundle_sha256);
  publish(source, `public/habitat/${trial.id}.receipt.json`);
  publish(path.join(root, "baselines", trial.bundle), `public/habitat/${trial.id}.bundle.json`);
  publish(path.join(root, "baselines", trial.id, "experiment.json"), `public/habitat/${trial.id}.experiment.json`);
  return { id: trial.id, label: labels[trial.id][0], detail: labels[trial.id][1],
    passed: trial.passed, work: trial.work, ticks: trial.ticks, result_hash: trial.result_hash,
    uninterrupted_equal: trial.uninterrupted_equal, restored_equal: trial.restored_equal,
    cuts: trial.checkpoints.map(cut => {
      const frame = receipt.result.frames.find(frame => frame.tick === cut.tick);
      const courier = frame.state.cells.find(cell => cell.id === 1), keeper = frame.state.cells.find(cell => cell.id === 3);
      assert.equal(identity(frame.state), cut.state_hash); assert.equal(identity(frame.costs), cut.costs_hash);
      return { tick: cut.tick, label: stops[cut.tick], state_hash: cut.state_hash, costs_hash: cut.costs_hash,
        detail: `${courier.cargo ? `Spark ${courier.cargo.id} is in the courier's hands.` : "The courier's hands are empty."} ${frame.state.pending.length} reports in flight. Keeper memory: [${keeper.memory.join(", ")}]. ${frame.state.delivered.length} of six sparks delivered.` };
    }) };
}) };
fs.writeFileSync("public/habitat/index.json", `${JSON.stringify(site)}\n`);
artifacts["public/habitat/index.json"] = { sha256: sha(fs.readFileSync("public/habitat/index.json")), bytes: fs.statSync("public/habitat/index.json").size };
const study = sanitize({ schema: "platonik-continuity-study-v1", measured_at: new Date().toISOString(),
  scope: "Two developer-agent ambitions with public source and recipes, four candidates per arm, fixed training selection, unchanged transfer and complete subprocess accounting. This is finite engineering evidence, not blinded research, player enjoyment, a moving ark, construction or the complete campaign. External reasoning tokens are unknown.",
  protocol_sha256: freeze.protocol_sha256, source_tree_digest: freeze.source_tree_digest,
  engine_executions, logical_evaluations: arms.reduce((sum, arm) => sum + arm.candidates.reduce((sum, item) => sum + item.trials.length, 0) + arm.transfer.length, 0) + baselines.trials.length + ledgers.probes.probes.length,
  arms, baselines, probes: ledgers.probes, capacity: ledgers.capacity, artifacts });
fs.writeFileSync("fixtures/evidence/continuity-study.json", `${JSON.stringify(study)}\n`, { flag: "wx" });
console.log(JSON.stringify({ engine_executions, logical_evaluations: study.logical_evaluations,
  artifacts: Object.keys(artifacts).length, artifact_bytes: Object.values(artifacts).reduce((sum, item) => sum + item.bytes, 0) }));
