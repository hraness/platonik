// Fresh independent Rust replay of admitted historical artifacts; no optimizer.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { read, sha, identity } from "./continuity/runner.mjs";
const plan = read("fixtures/evidence/continuity-protocol.json");
const freeze = read("fixtures/evidence/continuity-freeze.json");
const study = read("fixtures/evidence/continuity-study.json");
const equal = assert.deepEqual;
equal([plan.schema, freeze.schema, study.schema], ["platonik-continuity-protocol-v1", "platonik-continuity-freeze-v1", "platonik-continuity-study-v1"]);
equal(sha(fs.readFileSync("fixtures/evidence/continuity-protocol.json")), freeze.protocol_sha256);
equal(study.protocol_sha256, freeze.protocol_sha256);
equal(sha(JSON.stringify(freeze.source_files_sha256)), freeze.source_tree_digest);
equal(study.source_tree_digest, freeze.source_tree_digest);
assert(freeze.preflight.qualified && !freeze.preflight.accounting_incomplete);
const sum = values => values.reduce((sum, value) => sum + value, 0);
function metrics(ledger) {
  assert(!ledger.pending_call && !ledger.stopped && !ledger.accounting_incomplete && !ledger.pending_operation);
  equal(ledger.engine_executions, sum(ledger.calls.map((call, index) => {
    equal(call.index, index); equal(call.metrics.schema, "platonik-process-metrics-v1");
    assert(Number.isSafeInteger(call.metrics.engine_executions) && call.metrics.engine_executions >= 0);
    assert(call.metrics.engine_executions <= call.reserved_engine_executions);
    assert(Number.isFinite(call.elapsed_ms) && call.elapsed_ms > 0);
    assert(/^[a-f0-9]{64}$/.test(call.stdout_sha256) && /^[a-f0-9]{64}$/.test(call.stderr_sha256));
    return call.metrics.engine_executions;
  })));
  assert(ledger.engine_executions <= ledger.maximum_engine_executions);
  return ledger.engine_executions;
}
metrics(freeze.preflight);
equal(study.engine_executions, sum([...study.arms, study.baselines, study.probes, study.capacity].map(metrics)));
assert(study.engine_executions <= plan.budget.maximum_actual_engine_executions_including_replay);
equal(study.logical_evaluations, sum(study.arms.map(arm => sum(arm.candidates.map(item => item.trials.length)) + arm.transfer.length)) + study.baselines.trials.length + study.probes.probes.length);
assert(study.logical_evaluations <= plan.budget.maximum_logical_evaluations);
for (const [file, artifact] of Object.entries(study.artifacts)) {
  assert(file.startsWith("fixtures/evidence/continuity-") || file.startsWith("public/habitat/"));
  assert(!file.split("/").includes(".."));
  const bytes = fs.readFileSync(file); equal(bytes.length, artifact.bytes); equal(sha(bytes), artifact.sha256);
}
const temporary = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "platonik-continuity-check-"));
const binary = path.resolve(process.env.PLATONIK_CLI ?? "target/debug/platonik");
let executions = 0;
function cli(args) {
  assert(executions + 64 <= 1024, "Fresh replay allowance");
  const result = spawnSync(binary, ["--metrics", ...args], { encoding: "utf8", maxBuffer: 70 * 1024 * 1024, timeout: 60_000 });
  if (result.error) throw result.error;
  equal(result.status, 0, `Fresh CLI failure ${args.slice(0, 2)}: ${result.stderr.slice(0, 500)}`);
  const metrics = result.stderr.trim().split("\n").filter(Boolean).map(JSON.parse).filter(row => row.schema === "platonik-process-metrics-v1");
  equal(metrics.length, 1); assert(Number.isSafeInteger(metrics[0].engine_executions) && metrics[0].engine_executions >= 0 && metrics[0].engine_executions <= 64);
  executions += metrics[0].engine_executions;
  return JSON.parse(result.stdout);
}
const receipts = new Map();
function checked(file) {
  if (receipts.has(file)) return receipts.get(file);
  assert(study.artifacts[file], `Unlisted receipt ${file}`);
  const receipt = read(file); equal(receipt.schema, "platonik-receipt-v1"); equal(receipt.protocol, "platonik-habitat-v2");
  equal(identity(receipt.experiment), receipt.experiment_hash); equal(identity(receipt.result), receipt.result_hash);
  const verified = cli(["verify", path.resolve(file)]);
  assert(verified.verified); equal(verified.result_hash, receipt.result_hash);
  receipts.set(file, receipt); return receipt;
}
function trialCheck(trial) {
  const receipt = checked(trial.receipt_file);
  equal(trial.result_hash, receipt.result_hash); equal(trial.experiment_hash, receipt.experiment_hash);
  equal(trial.passed, receipt.result.outcome.passed); equal(trial.work, sum(Object.values(receipt.result.costs)));
  if (trial.status !== undefined) equal(trial.status, receipt.result.status);
  if (trial.ticks !== undefined) equal(trial.ticks, receipt.result.ticks_completed);
  return receipt;
}
try {
  const cases = new Map();
  for (const id of [...plan.cases.training, ...plan.cases.transfer]) {
    const file = `fixtures/evidence/continuity-cases/${id}.json`;
    equal(sha(fs.readFileSync(file)), freeze.source_files_sha256[file]);
    const fresh = cli(["habitat", "case", id]); equal(fresh, read(file)); cases.set(id, fresh);
  }
  equal(study.arms.map(arm => arm.owner), ["frugal", "resilient"]);
  for (const arm of study.arms) {
    equal(arm.source_tree_digest, freeze.source_tree_digest); equal(arm.protocol_sha256, freeze.protocol_sha256);
    equal(arm.release_binary_sha256, freeze.release_binary_sha256);
    equal(arm.maximum_engine_executions, plan.budget.parallel_reservations.each_optimizer_arm);
    equal(arm.candidates.length, 4); equal(arm.transfer.map(trial => trial.case_id), plan.cases.transfer);
    equal(arm.candidates.map(candidate => candidate.sequence), [1, 2, 3, 4]);
    equal(arm.finished.complete, arm.transfer.every(trial => trial.passed));
    assert(arm.finished.all_inputs_retained && arm.finished.all_traces_verified);
    for (const candidate of arm.candidates) {
      if (candidate.source_file) equal(sha(fs.readFileSync(candidate.source_file)), candidate.source_sha256);
      equal(candidate.trials.map(trial => trial.case_id), plan.cases.training.slice(0, candidate.trials.length));
      for (const trial of candidate.trials) equal(trial.pair, candidate.trials[0].pair, "A partial batch also keeps one pair");
      if (candidate.admission === "completed") {
        equal(candidate.trials.length, 4);
        equal(candidate.work, sum(candidate.trials.map(trial => trial.work)));
        equal(candidate.passed, candidate.trials.every(trial => trial.passed));
        equal(candidate.policy_bytes, Buffer.byteLength(JSON.stringify(candidate.pair)));
        equal(candidate.pair_hash, identity(candidate.pair));
        for (const trial of candidate.trials) equal(trial.pair, candidate.pair, "One identical pair per training batch");
      } else {
        assert(["rejected", "partial"].includes(candidate.admission));
        assert(!candidate.passed && typeof candidate.error === "string");
      }
    }
    const selected = arm.candidates.filter(item => item.passed).toSorted((a, b) => a.work - b.work || a.policy_bytes - b.policy_bytes || a.sequence - b.sequence)[0];
    equal(arm.frozen.id, selected.id); equal(arm.frozen.pair, selected.pair);
    equal(arm.frozen.sequence, selected.sequence); equal(arm.frozen.pair_hash, selected.pair_hash); equal(arm.frozen.training_work, selected.work);
    for (const trial of [...arm.candidates.flatMap(item => item.trials), ...arm.transfer]) {
      const receipt = trialCheck(trial), expected = structuredClone(cases.get(trial.case_id));
      for (const [id, role] of [[1, "courier"], [3, "controller"]]) expected.cells.find(cell => cell.id === id).program = trial.pair[role];
      equal(receipt.experiment, expected, "Only admitted policies change across cases");
      if (arm.owner === "resilient") equal(trial.pair.courier, cases.get(trial.case_id).cells.find(cell => cell.id === 1).program);
      assert(trial.uninterrupted_equal && (trial.restored_equal || (trial.restoration === "not-applicable-terminal-before-cut"
        && receipt.result.status === "fuel_exhausted" && receipt.result.ticks_completed <= 9)));
      for (const cut of trial.checkpoints) {
        const frame = receipt.result.frames.find(frame => frame.tick === cut.tick);
        equal(identity(frame.state), cut.state_hash); equal(identity(frame.costs), cut.costs_hash);
      }
    }
    for (const trial of arm.transfer) equal(trial.pair, arm.frozen.pair);
  }
  equal(study.baselines.trials.length, plan.budget.baseline_evaluations + plan.budget.causal_control_evaluations);
  equal(study.baselines.maximum_engine_executions, plan.budget.parallel_reservations.baselines_controls_and_four_segmented_site_replays);
  equal(study.probes.maximum_engine_executions, plan.budget.parallel_reservations.adversarial_probes);
  equal(study.capacity.maximum_engine_executions, plan.budget.parallel_reservations.capacity);
  equal(study.baselines.trials.map(trial => [trial.kind, trial.id, trial.case_id]), [
    ...plan.baselines.flatMap(row => [...plan.cases.training, ...plan.cases.transfer].map(id => ["baseline", row.id, id])),
    ...plan.causal_controls.map(row => ["control", row.id, row.case]),
  ], "Every declared baseline and control exactly once");
  for (const trial of study.baselines.trials) {
    const receipt = trialCheck(trial), input = `fixtures/evidence/continuity-inputs/${trial.id}--${trial.case_id}.json`;
    equal(sha(fs.readFileSync(input)), freeze.source_files_sha256[input]); equal(receipt.experiment, read(input));
    if (trial.kind === "control") assert(!trial.passed);
  }
  for (const id of ["reversed-crossing", "late-crossing"]) {
    const receipt = checked(`fixtures/evidence/continuity-counterexamples/${id}.receipt.json`);
    const input = `fixtures/evidence/continuity-inputs/counterexample--${id}.json`;
    equal(sha(fs.readFileSync(input)), freeze.source_files_sha256[input]);
    equal(receipt.experiment, read(input));
    assert(!receipt.result.outcome.passed); equal(receipt.result.status, "complete");
  }
  equal(study.probes.probes.length, 12); assert(study.probes.probes.every(probe => probe.status === "pass"));
  equal(study.capacity.samples.length, 30);
  equal(study.capacity.engine_executions, sum(study.capacity.samples.map(sample => sample.engine_executions)));
  const times = study.capacity.samples.map(sample => sample.elapsed_ms).toSorted((a, b) => a - b);
  equal(study.capacity.p50_ms, (times[14] + times[15]) / 2); equal(study.capacity.p95_ms, times[28]);
  equal(study.capacity.peak_rss_bytes, Math.max(...study.capacity.samples.map(sample => sample.peak_rss_bytes)));
  const site = read("public/habitat/index.json"); equal(site.schema, "platonik-continuous-site-v1"); equal(site.cases.length, 4);
  const namedInputs = { "remember-both": "unchanged-reference", "keep-only-yes": "previous-frugal", "try-both": "blind-alternator", "relay-rests": "idle-relay" };
  equal(site.cases.map(item => item.id), Object.keys(namedInputs));
  for (const item of site.cases) {
    const receipt = checked(`public/habitat/${item.id}.receipt.json`);
    const baseline = study.baselines.trials.find(trial => trial.id === namedInputs[item.id] && trial.case_id === "changing-one");
    equal(receipt.result_hash, baseline.result_hash); equal(receipt.experiment_hash, baseline.experiment_hash);
    equal(read(`public/habitat/${item.id}.experiment.json`), receipt.experiment);
    equal(item.result_hash, receipt.result_hash); equal(item.passed, receipt.result.outcome.passed); equal(item.work, sum(Object.values(receipt.result.costs)));
    assert(item.uninterrupted_equal && item.restored_equal);
    for (const cut of item.cuts) { const frame = receipt.result.frames[cut.tick]; equal(identity(frame.state), cut.state_hash); equal(identity(frame.costs), cut.costs_hash); }
  }
  const bundles = [...study.arms.map(arm => ({ file: arm.bundle_file, receipt: checked(arm.transfer[0].receipt_file) })),
    ...site.cases.map(item => ({ file: `public/habitat/${item.id}.bundle.json`, receipt: checked(`public/habitat/${item.id}.receipt.json`) }))];
  for (const [index, { file, receipt }] of bundles.entries()) {
    const save = path.join(temporary, `bundle-${index}`), imported = cli(["habitat", "import", path.resolve(file), save]);
    const verified = cli(["habitat", "verify", save]); equal(imported, verified); equal(verified.phase, "finished");
    equal(verified.revision, read(file).entries.at(-1).revision);
    equal(verified.experiment_hash, receipt.experiment_hash); equal(verified.result_hash, receipt.result_hash);
    equal(verified.current_state, receipt.result.final_state); equal(verified.costs, receipt.result.costs);
    equal(verified.mission_passed, receipt.result.outcome.passed); equal(verified.tick, receipt.result.final_state.tick);
  }
  console.log(`Checked continuous study: ${receipts.size} exact receipts, ${bundles.length} fresh restored habitats, ${executions} real engine executions; recorded study ${study.engine_executions}.`);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
