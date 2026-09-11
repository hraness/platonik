// Only the Rust CLI executes worlds. This driver preserves every process receipt.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { identity, sha, read, protocol } from "./runner.mjs";

export const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value)}\n`, { flag: "wx" });
export const total = costs => Object.values(costs).reduce((sum, value) => sum + value, 0);
export function applyPair(experiment, pair) {
  const result = structuredClone(experiment);
  for (const [id, role] of [[1, "courier"], [3, "controller"]]) {
    assert(pair[role], `Missing ${role} program`);
    result.cells.find(cell => cell.id === id).program = pair[role];
  }
  return result;
}
export function pairFrom(experiment) {
  return { courier: experiment.cells.find(cell => cell.id === 1).program,
    controller: experiment.cells.find(cell => cell.id === 3).program };
}
export function receiptFrom(bundle) {
  const event = entry => bundle.objects[entry.event.event_hash];
  const genesis = event(bundle.entries[0]);
  const completed = event(bundle.entries.at(-1));
  assert(["completed", "initialized"].includes(completed.kind));
  assert.equal(completed.result.kind, "finished");
  const experiment = genesis.experiment, result = completed.result.value;
  return { schema: "platonik-receipt-v1", protocol: "platonik-habitat-v2",
    experiment_hash: identity(experiment), result_hash: identity(result), experiment, result };
}

// Separate CLI processes at every cut; import a mid-journey export and advance
// that restored save. Verify the entire final trace against a fresh cold run.
export function trajectory(run, id, experiment, { restore = true } = {}) {
  assert(/^[a-z0-9-]+$/.test(id));
  const dir = path.join(run.root, id);
  fs.mkdirSync(dir);
  const input = path.join(dir, "experiment.json");
  write(input, experiment);
  let save = path.join(dir, "save");
  const began = run.cli(["habitat", "init", save, input]);
  let report = began.value;
  const checkpoints = [];
  let restored_equal = null;
  for (const tick of protocol().continuity.advance_to_ticks) {
    if (report.phase === "finished") break;
    report = run.cli(["habitat", "advance", save, "--until", String(tick),
      "--expect-revision", String(report.revision), "--request-id", `leg-${tick}`]).value;
    checkpoints.push({ tick: report.tick, revision: report.revision, phase: report.phase,
      state_hash: identity(report.current_state), costs_hash: identity(report.costs),
      checkpoint_hash: report.checkpoint_hash, result_hash: report.result_hash,
      remaining_fuel: report.remaining_fuel, costs: report.costs });
    if (restore && tick === 9 && report.phase === "paused") {
      const bundle = run.cli(["habitat", "export", save]).value;
      const file = path.join(dir, "middle.bundle.json"); write(file, bundle);
      save = path.join(dir, "restored");
      const imported = run.cli(["habitat", "import", file, save]).value;
      for (const field of ["revision", "experiment_hash", "last_result_hash", "tick", "costs", "current_state", "remaining_fuel"])
        assert.deepEqual(imported[field], report[field], `Restored ${field}`);
      restored_equal = true;
      report = imported;
    }
  }
  assert.equal(report.phase, "finished", "Diagnostic must finish the fixed horizon or retain terminal fuel failure");
  const bundle = run.cli(["habitat", "export", save]).value;
  const bundleFile = path.join(dir, "final.bundle.json"); write(bundleFile, bundle);
  const receipt = receiptFrom(bundle);
  const receiptFile = path.join(dir, "receipt.json"); write(receiptFile, receipt);
  const verified = run.cli(["verify", receiptFile]).value;
  assert.equal(verified.verified, true);
  assert.equal(verified.result_hash, receipt.result_hash);
  assert.equal(report.result_hash, receipt.result_hash);
  return { id, passed: receipt.result.outcome.passed, work: total(receipt.result.costs),
    ticks: receipt.result.ticks_completed, status: receipt.result.status,
    experiment_hash: receipt.experiment_hash, result_hash: receipt.result_hash,
    receipt: path.relative(run.root, receiptFile), receipt_sha256: sha(fs.readFileSync(receiptFile)),
    bundle: path.relative(run.root, bundleFile), bundle_sha256: sha(fs.readFileSync(bundleFile)),
    pair: pairFrom(receipt.experiment), uninterrupted_equal: true, restored_equal,
    restoration: restored_equal ? "verified-at-tick-9" : "not-applicable-terminal-before-cut", checkpoints };
}
