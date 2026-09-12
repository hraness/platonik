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
  const repair = run.ledger.owner === "construction" && id === "keeper-born" && run.ledger.harness_repairs?.[0];
  let replayed = 0, retained = [];
  if (repair) {
    const recordBytes = fs.readFileSync(repair.file); assert.equal(sha(recordBytes), repair.sha256);
    const record = JSON.parse(recordBytes), snapshotBytes = fs.readFileSync(record.interrupted_ledger_file);
    assert.equal(sha(snapshotBytes), record.interrupted_ledger_sha256);
    const snapshot = JSON.parse(snapshotBytes);
    assert.equal(record.first_call, 104); assert.equal(record.after_call, 110);
    assert.equal(run.ledger.calls.length, record.after_call, "Only the specifically retained prefix may resume");
    assert.equal(run.ledger.engine_executions, record.engine_executions);
    assert.deepEqual(run.ledger.calls, snapshot.calls);
    retained = snapshot.calls.slice(record.first_call, record.after_call);
  }
  // Re-read already admitted results; never re-execute or refund the retained
  // init/advance/export/import prefix. Every subsequent call remains metered.
  const invoke = (args, options) => {
    if (replayed === retained.length) return run.cli(args, options);
    const call = retained[replayed++];
    assert.deepEqual(call.args, args.map(arg => arg.startsWith(run.root) ? path.relative(run.root, arg) : arg));
    assert.equal(call.exit_code, 0);
    const raw = fs.readFileSync(path.join(run.root, call.stdout)); assert.equal(sha(raw), call.stdout_sha256);
    assert.equal(sha(fs.readFileSync(path.join(run.root, call.stderr))), call.stderr_sha256);
    return { value: JSON.parse(raw), call };
  };
  const directory = path.join(run.root, id);
  const input = path.join(directory, "experiment.json");
  if (repair) assert.deepEqual(JSON.parse(fs.readFileSync(input)), experiment);
  else { fs.mkdirSync(directory); write(input, experiment); }
  let save = path.join(directory, "save"), report;
  const first_call = repair ? retained[0].index : run.ledger.calls.length;
  report = invoke(["habitat", "init", save, input]).value;
  const checkpoints = [], restorations = [];
  for (const tick of cuts) {
    assert.notEqual(report.phase, "finished", "A site replay must reach its declared cuts");
    report = invoke(["habitat", "advance", save, "--until", String(tick),
      "--expect-revision", String(report.revision), "--request-id", `leg-${tick}`]).value;
    checkpoints.push({ tick: report.tick, revision: report.revision, phase: report.phase,
      state_hash: identity(report.current_state), costs_hash: identity(report.costs),
      checkpoint_hash: report.checkpoint_hash, result_hash: report.result_hash,
      remaining_fuel: report.remaining_fuel, costs: report.costs });
    if (restoreTicks.includes(tick)) {
      assert.equal(report.phase, "paused");
      const bundle = invoke(["habitat", "export", save]).value;
      const file = path.join(directory, `at-${tick}.bundle.json`);
      if (repair && tick === 8) assert.deepEqual(JSON.parse(fs.readFileSync(file)), bundle);
      else write(file, bundle);
      save = path.join(directory, `restored-${tick}`);
      const restored = invoke(["habitat", "import", file, save]).value;
      assert.equal(report.request_id, `leg-${tick}`); assert.equal(restored.request_id, null);
      assert.deepEqual(restored, { ...report, request_id: null }, "Import preserves every authoritative report field; request ID identifies only the command response");
      restorations.push({ tick, bundle: path.relative(run.root, file), bundle_sha256: sha(fs.readFileSync(file)),
        checkpoint_hash: restored.checkpoint_hash, state_hash: identity(restored.current_state),
        costs_hash: identity(restored.costs), equal: true });
      report = restored;
    }
  }
  assert.equal(report.phase, "finished");
  assert.equal(replayed, retained.length);
  const bundle = invoke(["habitat", "export", save]).value;
  const bundleFile = path.join(directory, "final.bundle.json"); write(bundleFile, bundle);
  const receipt = receiptFrom(bundle), receiptFile = path.join(directory, "receipt.json"); write(receiptFile, receipt);
  const checked = invoke(["verify", receiptFile], { reservation: 2, accepted: [0] }).value;
  assert(checked.verified); assert.equal(checked.result_hash, receipt.result_hash);
  assert.equal(report.result_hash, receipt.result_hash);
  assert.deepEqual(report.current_state, receipt.result.final_state);
  assert.deepEqual(report.costs, receipt.result.costs);
  return { id, first_call, after_call: run.ledger.calls.length,
    passed: receipt.result.outcome.passed, work: total(receipt.result.costs),
    ticks: receipt.result.ticks_completed, status: receipt.result.status,
    experiment_hash: receipt.experiment_hash, result_hash: receipt.result_hash,
    receipt: path.relative(run.root, receiptFile), receipt_sha256: sha(fs.readFileSync(receiptFile)),
    bundle: path.relative(run.root, bundleFile), bundle_sha256: sha(fs.readFileSync(bundleFile)),
    uninterrupted_equal: true, restored_equal: restorations.length === 2 && restorations.every(row => row.equal),
    restorations, checkpoints };
}
