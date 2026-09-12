// Eight explicit process advances, with two checked export/import boundaries.
// This is orchestration only; Rust computes every transition and verdict.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { identity, sha } from "./runner.mjs";

export const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value)}\n`, { flag: "wx" });
export const total = costs => Object.values(costs).reduce((sum, value) => sum + value, 0);
export function receiptFrom(bundle) {
  assert.equal(bundle.schema, "platonik-habitat-bundle-v1");
  const event = entry => bundle.objects[entry.event.event_hash];
  const genesis = event(bundle.entries[0]), completed = event(bundle.entries.at(-1));
  assert.equal(genesis.kind, "initialized");
  assert.equal(completed.result.kind, "finished");
  const experiment = genesis.experiment, result = completed.result.value;
  assert.equal(result.protocol, "platonik-habitat-v3");
  return { schema: "platonik-receipt-v1", protocol: result.protocol,
    experiment_hash: identity(experiment), result_hash: identity(result), experiment, result };
}
export function trajectory(run, id, experiment, { cuts, restoreTicks }) {
  assert(/^[a-z0-9-]+$/.test(id));
  assert.equal(cuts.length, 8); assert.equal(restoreTicks.length, 2);
  assert(cuts.every((tick, index) => Number.isInteger(tick) && tick > (cuts[index - 1] ?? 0)));
  assert.equal(cuts.at(-1), experiment.ticks);
  assert(restoreTicks.every(tick => cuts.includes(tick) && tick < experiment.ticks));
  const directory = path.join(run.root, id); fs.mkdirSync(directory);
  const input = path.join(directory, "experiment.json"); write(input, experiment);
  let save = path.join(directory, "save"), report;
  const first_call = run.ledger.calls.length;
  report = run.cli(["habitat", "init", save, input]).value;
  const checkpoints = [], restorations = [];
  for (const tick of cuts) {
    assert.notEqual(report.phase, "finished", "A site replay must reach its declared cuts");
    report = run.cli(["habitat", "advance", save, "--until", String(tick),
      "--expect-revision", String(report.revision), "--request-id", `leg-${tick}`]).value;
    checkpoints.push({ tick: report.tick, revision: report.revision, phase: report.phase,
      state_hash: identity(report.current_state), costs_hash: identity(report.costs),
      checkpoint_hash: report.checkpoint_hash, result_hash: report.result_hash,
      remaining_fuel: report.remaining_fuel, costs: report.costs });
    if (restoreTicks.includes(tick)) {
      assert.equal(report.phase, "paused");
      const bundle = run.cli(["habitat", "export", save]).value;
      const file = path.join(directory, `at-${tick}.bundle.json`); write(file, bundle);
      save = path.join(directory, `restored-${tick}`);
      const restored = run.cli(["habitat", "import", file, save]).value;
      assert.equal(report.request_id, `leg-${tick}`); assert.equal(restored.request_id, null);
      assert.deepEqual(restored, { ...report, request_id: null }, "Import preserves all authoritative fields; the request ID belongs to the command response");
      restorations.push({ tick, bundle: path.relative(run.root, file), bundle_sha256: sha(fs.readFileSync(file)),
        checkpoint_hash: restored.checkpoint_hash, state_hash: identity(restored.current_state),
        costs_hash: identity(restored.costs), equal: true });
      report = restored;
    }
  }
  assert.equal(report.phase, "finished");
  const bundle = run.cli(["habitat", "export", save]).value;
  const bundleFile = path.join(directory, "final.bundle.json"); write(bundleFile, bundle);
  const receipt = receiptFrom(bundle), receiptFile = path.join(directory, "receipt.json"); write(receiptFile, receipt);
  const ark = run.cli(["habitat", "ark-check", receiptFile], { reservation: 2, accepted: [0] }).value;
  assert.equal(ark.result_hash, receipt.result_hash); assert.equal(ark.experiment_hash, receipt.experiment_hash);
  assert.equal(report.result_hash, receipt.result_hash);
  assert.deepEqual(report.current_state, receipt.result.final_state);
  assert.deepEqual(report.costs, receipt.result.costs);
  return { id, first_call, after_call: run.ledger.calls.length,
    ark, control_passed: ark.control_passed, passed: receipt.result.outcome.passed, work: total(receipt.result.costs),
    ticks: receipt.result.ticks_completed, status: receipt.result.status,
    experiment_hash: receipt.experiment_hash, result_hash: receipt.result_hash,
    receipt: path.relative(run.root, receiptFile), receipt_sha256: sha(fs.readFileSync(receiptFile)),
    bundle: path.relative(run.root, bundleFile), bundle_sha256: sha(fs.readFileSync(bundleFile)),
    uninterrupted_equal: true, restored_equal: restorations.length === 2 && restorations.every(row => row.equal),
    restorations, checkpoints };
}
