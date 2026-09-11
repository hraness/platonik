// Fresh replay admission for the historical study, not another optimizer run.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.resolve(root, process.env.PLATONIK_CLI ?? "target/debug/platonik");
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const bytes = value => JSON.stringify(value);
const sha = value => createHash("sha256").update(value).digest("hex");
const identity = value => `sha256:${sha(bytes(value))}`;
const equal = (actual, expected, label) => assert.deepStrictEqual(actual, expected, label);
const integer = (value, label) => assert(Number.isSafeInteger(value) && value >= 0, label);
const positive = (value, label) => assert(Number.isFinite(value) && value > 0, label);
const hash = (value, label) => assert(typeof value === "string" && /^[a-f0-9]{64}$/.test(value), label);
const sum = values => values.reduce((total, value) => total + value, 0);
const approximate = (actual, expected, label) => assert(Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected)), label);
function safeArtifact(value) {
  if (typeof value === "number") integer(value, "Artifact contains a lossy or negative numeric projection");
  else if (value && typeof value === "object") Object.values(value).forEach(safeArtifact);
}

const study = read("fixtures/evidence/expedition-study.json");
const freeze = read("fixtures/evidence/expedition-freeze.json");
const protocolFile = "fixtures/evidence/expedition-protocol.json";
const protocol = read(protocolFile);
equal(study.schema, "platonik-expedition-study-v1", "Study schema");
equal(freeze.schema, "platonik-expedition-freeze-v1", "Freeze schema");
equal(protocol.schema, "platonik-agent-evaluation-v1", "Protocol schema");
equal(sha(fs.readFileSync(path.join(root, protocolFile))), freeze.protocol_sha256, "Historical protocol bytes changed");
equal(study.protocol_sha256, freeze.protocol_sha256, "Study protocol identity");
// Source provenance remains historical: later compatible source edits are allowed.
Object.values(freeze.source_files_sha256).forEach(value => hash(value, "Historical source digest"));
equal(sha(bytes(freeze.source_files_sha256)), freeze.source_tree_digest, "Historical source manifest identity");
equal(study.source_tree_digest, freeze.source_tree_digest, "Study source identity");
hash(freeze.release_binary_sha256, "Historical executable identity");
const training = protocol.cases.training;
const transfer = protocol.cases.transfer;
const caseIds = [...training, ...transfer];
equal([training.length, transfer.length, new Set(caseIds).size], [4, 4, 8], "Eight distinct frozen cases");
equal(freeze.preflight.cases.map(row => row.id), caseIds, "Frozen reference case order");
assert(freeze.preflight.cases.every(row => row.passed && row.verified), "All frozen reference cases were qualified");
for (const metric of freeze.preflight.cli_metrics) integer(metric.engine_executions, "Recorded preflight execution count");
equal(freeze.preflight.actual_engine_executions, sum(freeze.preflight.cli_metrics.map(metric => metric.engine_executions)), "Separate preflight execution arithmetic");
equal(freeze.preflight.actual_engine_executions, 16, "Eight reference qualifications plus verification before the study");
equal(study.arms.map(arm => arm.id), ["frugal", "resilient"], "Study arms");
const freshCases = new Map();
const checkedArms = new Map();
// macOS exposes /var and /tmp aliases; the store requires real path ancestors.
const temporary = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "platonik-evidence-"));
let freshExecutions = 0;

function invoke(args, expectedExecutions) {
  assert(freshExecutions + expectedExecutions <= 120, "Fresh replay gate budget");
  const result = spawnSync(cli, ["--metrics", ...args], {
    cwd: root, encoding: "utf8", maxBuffer: 36 * 1024 * 1024, timeout: 30_000,
  });
  if (result.error) throw result.error;
  equal(result.status, 0, `CLI failed: ${args[0]} ${args[1]}: ${result.stderr.slice(0, 2000)}`);
  const rows = result.stderr.trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  const metrics = rows.filter(row => row.schema === "platonik-process-metrics-v1");
  equal(metrics.length, 1, "One authoritative process metric per fresh command");
  integer(metrics[0].engine_executions, "Fresh engine count");
  freshExecutions += metrics[0].engine_executions;
  equal(metrics[0].engine_executions, expectedExecutions, "Fresh command replay count changed; review its admission budget");
  return JSON.parse(result.stdout);
}

function metricsTotal(calls, label) {
  assert(Array.isArray(calls) && calls.length, `${label}: missing metrics`);
  for (const [index, call] of calls.entries()) {
    if (call.index !== undefined) equal(call.index, index, `${label}: call sequence`);
    equal(call.metrics?.schema, "platonik-process-metrics-v1", `${label}: metric schema`);
    integer(call.metrics.engine_executions, `${label}: engine executions`);
    integer(call.metrics.elapsed_micros, `${label}: elapsed micros`);
    positive(call.elapsed_ms, `${label}: wall time`);
    assert([0, 1, 2].includes(call.exit_code), `${label}: recorded exit code`);
    hash(call.stdout_sha256, `${label}: recorded stdout digest`);
    if (call.stderr_sha256 !== undefined) hash(call.stderr_sha256, `${label}: recorded stderr digest`);
    if (call.reserved_engine_executions !== undefined) {
      integer(call.reserved_engine_executions, `${label}: reservation`);
      assert(call.metrics.engine_executions <= call.reserved_engine_executions, `${label}: reservation exceeded`);
    }
  }
  return sum(calls.map(call => call.metrics.engine_executions));
}

const parentHashes = {
  compact: "sha256:68096e4f0bbad3ab63943c9fedaf9ba4d10664e8cf772db8f34c56d0b3d52175",
  recovery: "sha256:cec338245d1e64140a3a5b24b5b5f42d61f12e11d43bd0689c16a377bd1bfce0",
  memory: "sha256:15feb6a98c14ae48b9c59f7e6a0be338c9bd44d7089a793d7f55141b9d150a2a",
  "constant-a": "sha256:603a3ec25694f6498f80dea54bc4957825a86fbbdace8b501c1c3facc45a09f6",
  "constant-b": "sha256:1dba2771f7f3f39bf6a5cca1834b02f754fa9be603abf80f18db07b1a84b30b0",
};
const parentLabels = { compact: "Moth", recovery: "Fern", memory: "Keeper", "constant-a": "A lamp", "constant-b": "B lamp" };

function traceSummary(trial, receipt) {
  const result = receipt.result;
  return {
    case_id: trial.case_id, receipt_hash: trial.receipt_hash, result_hash: receipt.result_hash,
    delivery_ticks: result.final_state.delivered.map(delivery => delivery.tick), costs: result.costs,
    courier_first_twelve_positions: result.frames.slice(0, 13).map(frame => ({ tick: frame.tick,
      position: frame.state.cells.find(cell => cell.id === 1)?.position })),
    closure_events: result.frames.filter(frame => frame.events.some(event => event.kind === "edge_blocked"))
      .map(frame => ({ tick: frame.tick, events: frame.events })),
    controller_at_contact_end: result.frames.find(frame => frame.tick === 48)?.state.cells.find(cell => cell.id === 3) ?? null,
  };
}

try {
  for (const frozen of freeze.preflight.cases) {
    const experiment = invoke(["expedition", "case", frozen.id], 0);
    safeArtifact(experiment);
    equal(experiment.version, 2, `${frozen.id}: protocol version`);
    equal(identity(experiment), frozen.experiment_hash, `${frozen.id}: frozen reference input changed`);
    freshCases.set(frozen.id, experiment);
  }

  for (const arm of study.arms) {
    const bundleFile = `fixtures/evidence/expedition-${arm.id}.bundle.json`;
    equal(arm.bundle_file, bundleFile, `${arm.id}: admitted evidence path`);
    const bundleBytes = fs.readFileSync(path.join(root, bundleFile));
    equal(sha(bundleBytes), arm.bundle_sha256, `${arm.id}: public bundle digest`);
    equal(bundleBytes.length, arm.artifact_bytes, `${arm.id}: public artifact size`);
    const bundle = JSON.parse(bundleBytes);
    safeArtifact(bundle);
    equal(bundle.schema, "platonik-expedition-bundle-v1", `${arm.id}: bundle schema`);
    const save = path.join(temporary, arm.id);
    const imported = invoke(["expedition", "import", path.join(root, bundleFile), save], 40);
    const verified = invoke(["expedition", "verify", save], 20);
    equal(imported.campaign, verified.campaign, `${arm.id}: imported/verified campaign`);
    equal(verified.progress.field_expedition_complete, true, `${arm.id}: replayed completion`);
    equal(verified.progress.confirmation_finished, true, `${arm.id}: replayed confirmation`);
    const campaign = verified.campaign;
    equal(campaign.schema, "platonik-expedition-v1", `${arm.id}: campaign schema`);
    equal(campaign.ambition, arm.id, `${arm.id}: player constraint`);
    equal(campaign.pending, null, `${arm.id}: unfinished intent`);
    equal(campaign.allowance, protocol.budget.session_limits.maximum_actual_modeled_work, `${arm.id}: work allowance`);
    equal(campaign.trials.length, 20, `${arm.id}: complete trial history`);
    assert(campaign.trials.length <= protocol.budget.session_limits.maximum_trials, `${arm.id}: trial ceiling`);
    assert(campaign.work <= campaign.allowance, `${arm.id}: modeled work ceiling`);
    assert(campaign.creations.length <= protocol.budget.session_limits.maximum_creations_including_five_references, `${arm.id}: collection ceiling`);
    equal(new Set(campaign.creations.map(item => item.id)).size, campaign.creations.length, `${arm.id}: immutable creation IDs`);
    const initial = invoke(["expedition", "init", path.join(temporary, `${arm.id}-parents`), "Evidence parent check", arm.id], 0).campaign;
    equal(initial.creations.map(item => item.id), Object.keys(parentHashes), `${arm.id}: five original parents`);
    for (const parent of initial.creations) {
      equal(parent.program_hash, parentHashes[parent.id], `${arm.id}: historical parent identity ${parent.id}`);
      equal([parent.name, parent.parent, parent.role], [parentLabels[parent.id], null,
        ["compact", "recovery"].includes(parent.id) ? "courier" : "controller"], `${arm.id}: historical parent metadata`);
      equal(campaign.creations.find(item => item.id === parent.id), parent, `${arm.id}: preserved parent ${parent.id}`);
    }
    const creation = id => {
      const found = campaign.creations.find(item => item.id === id);
      assert(found, `${arm.id}: unknown creation ${id}`);
      equal(found.program_hash, identity(found.program), `${arm.id}: typed program identity`);
      return found;
    };
    const receipts = new Map(Object.values(bundle.objects).filter(event => event.kind === "completed")
      .map(event => [identity(event.receipt), event.receipt]));
    for (const trial of campaign.trials) {
      const receipt = receipts.get(trial.receipt_hash);
      assert(receipt, `${arm.id}: missing authoritative receipt`);
      equal(receipt.protocol, "platonik-habitat-v2", `${arm.id}: receipt protocol`);
      equal(receipt.experiment_hash, identity(receipt.experiment), `${arm.id}: typed experiment digest`);
      equal(receipt.result_hash, identity(receipt.result), `${arm.id}: typed result digest`);
      equal(trial.experiment_hash, receipt.experiment_hash, `${arm.id}: trial input identity`);
      equal(trial.passed, receipt.result.outcome.passed, `${arm.id}: checked trial outcome`);
      equal(trial.work, sum(Object.values(receipt.result.costs)), `${arm.id}: actual trial work`);
      equal(trial.ticks, receipt.result.ticks_completed, `${arm.id}: actual trial ticks`);
      equal(receipt.result.status, "complete", `${arm.id}: complete bounded run`);
      equal(receipt.result.ticks_completed, receipt.experiment.ticks, `${arm.id}: full tick contract`);
      assert(receipt.result.frames.every(frame => frame.complete), `${arm.id}: incomplete receipt frame`);
      const expected = structuredClone(freshCases.get(trial.case_id));
      assert(expected, `${arm.id}: unknown frozen case`);
      for (const [id, selected, role] of [[1, trial.courier, "courier"], [3, trial.controller, "controller"]]) {
        const asset = creation(selected);
        equal(asset.role, role, `${arm.id}: admitted policy role`);
        const cell = expected.cells.find(item => item.id === id);
        if (cell) cell.program = asset.program;
      }
      equal(receipt.experiment, expected, `${arm.id}: only declared policy roles may vary`);
      if (arm.id === "resilient") equal(creation(trial.courier).program_hash, parentHashes.recovery, "Preserved favorite in every resilient trial");
    }
    equal(arm.candidates.length, 4, `${arm.id}: four candidate slots`);
    for (const [index, candidate] of arm.candidates.entries()) {
      equal(candidate.sequence, index + 1, `${arm.id}: submitted order`);
      equal(candidate.admission, "completed", `${arm.id}: complete candidate accounting`);
      hash(candidate.source_sha256, `${arm.id}: candidate source digest`);
      const trials = campaign.trials.slice(index * 4, index * 4 + 4);
      equal(candidate.trials, trials, `${arm.id}: candidate trials from journal`);
      equal(trials.map(trial => trial.case_id), training, `${arm.id}: all training cases per candidate`);
      assert(trials.every(trial => trial.courier === candidate.courier && trial.controller === candidate.controller), `${arm.id}: unchanged candidate pair`);
      equal(candidate.passed, trials.every(trial => trial.passed), `${arm.id}: candidate pass predicate`);
      equal(candidate.work, sum(trials.map(trial => trial.work)), `${arm.id}: candidate work sum`);
      const pair = { courier: creation(candidate.courier).program, controller: creation(candidate.controller).program };
      equal(candidate.bundle_sha256, sha(bytes(pair)), `${arm.id}: canonical candidate pair`);
      equal(candidate.policy_bytes, Buffer.byteLength(bytes(pair)), `${arm.id}: canonical candidate bytes`);
    }
    const best = arm.candidates.filter(candidate => candidate.passed)
      .sort((a, b) => a.work - b.work || a.policy_bytes - b.policy_bytes || a.sequence - b.sequence)[0];
    assert(best, `${arm.id}: no successful winner`);
    equal(arm.frozen, best.id, `${arm.id}: predeclared winner ordering`);
    equal(campaign.frozen, { courier: best.courier, controller: best.controller }, `${arm.id}: actual frozen pair`);
    equal(arm.frozen_pair, { courier: creation(best.courier).program, controller: creation(best.controller).program,
      courier_hash: creation(best.courier).program_hash, controller_hash: creation(best.controller).program_hash }, `${arm.id}: published frozen programs`);
    equal(arm.transfer, campaign.trials.slice(16), `${arm.id}: actual transfer outcomes`);
    equal(arm.transfer.map(trial => trial.case_id), transfer, `${arm.id}: transfer once per case`);
    assert(arm.transfer.every(trial => trial.courier === best.courier && trial.controller === best.controller), `${arm.id}: unchanged transfer pair`);
    let completed = 0, freezes = 0;
    for (const entry of bundle.entries) {
      if (entry.event.payload.kind !== "game") continue;
      const event = bundle.objects[entry.event.payload.event_hash];
      if (event.kind === "completed") completed++;
      if (event.kind === "frozen") { equal(completed, 16, `${arm.id}: freeze before transfer`); freezes++; }
      if (freezes) assert(event.kind !== "grown", `${arm.id}: post-freeze growth`);
    }
    equal([completed, freezes], [20, 1], `${arm.id}: one freeze and complete history`);
    equal(arm.selected_trace_summaries, [...best.trials, ...arm.transfer].map(trial => traceSummary(trial, receipts.get(trial.receipt_hash))), `${arm.id}: trace claims from replayed receipts`);
    equal([arm.trials, arm.work], [campaign.trials.length, campaign.work], `${arm.id}: published totals`);
    equal(campaign.work, sum(campaign.trials.map(trial => trial.work)), `${arm.id}: complete work ledger`);
    equal([arm.parents_preserved, arm.imported_campaign_equal, arm.complete], [true, true, true], `${arm.id}: claims justified by fresh checks`);
    equal(arm.engine_executions, metricsTotal(arm.cli_metrics, arm.id), `${arm.id}: historical execution arithmetic`);
    assert(arm.engine_executions <= protocol.budget.parallel_reservations.each_agent_maximum, `${arm.id}: historical compute ceiling`);
    approximate(arm.cli_wall_ms, sum(arm.cli_metrics.map(call => call.elapsed_ms)), `${arm.id}: observed wall-time sum`);
    equal(arm.external_agent_tokens, null, `${arm.id}: unknown reasoning tokens`);
    hash(arm.agent_notes_sha256, `${arm.id}: historical notes digest`);
    checkedArms.set(arm.id, { arm, campaign, revision: verified.revision });
  }

  const baseline = study.baselines;
  equal(baseline.schema, "platonik-expedition-baselines-v1", "Baseline schema");
  equal(baseline.protocol_sha256, freeze.protocol_sha256, "Baseline protocol");
  equal(baseline.cases.map(row => `${row.baseline}:${row.case_id}`), ["public-recovery", "public-compact"].flatMap(id => caseIds.map(caseId => `${id}:${caseId}`)), "Complete reference matrix");
  equal(baseline.engine_executions, metricsTotal(baseline.calls, "baselines"), "Baseline execution arithmetic");
  equal([baseline.calls.length, baseline.engine_executions], [32, 32], "Sixteen baseline runs plus verification");
  assert(baseline.calls.every(call => call.metrics.engine_executions === 1), "One execution per historical baseline command");
  const compact = checkedArms.get("frugal").campaign.creations.find(item => item.id === "compact").program;
  for (const row of baseline.cases) {
    const expected = structuredClone(freshCases.get(row.case_id));
    if (row.baseline === "public-compact") expected.cells.find(cell => cell.id === 1).program = compact;
    equal(identity(expected), row.experiment_hash, "Baseline fixed input identity");
    integer(row.work, "Baseline work"); integer(row.ticks, "Baseline ticks"); positive(row.receipt_bytes, "Historical baseline receipt bytes");
    equal(row.verified, true, "Historical baseline verification was recorded");
    if (row.baseline === "public-recovery") {
      const reference = freeze.preflight.cases.find(item => item.id === row.case_id);
      for (const key of ["experiment_hash", "result_hash", "passed", "work", "ticks"]) equal(row[key], reference[key], `Reference/freeze agreement: ${key}`);
    }
  }
  const probes = study.probes;
  equal(probes.schema, "platonik-adversarial-probes-v1", "Probe schema");
  equal(probes.protocol_sha256, freeze.protocol_sha256, "Probe protocol");
  equal(probes.source_tree_digest, freeze.source_tree_digest, "Probe historical source");
  equal(probes.binary_sha256, freeze.release_binary_sha256, "Probe historical binary");
  equal([probes.metrics_complete, probes.completed], [true, true], "Completed recorded probes");
  assert(!probes.stopped && !probes.pending_call, "No unresolved probe accounting");
  equal(probes.engine_executions, metricsTotal(probes.calls, "probes"), "Probe execution arithmetic");
  equal(probes.maximum_engine_executions, protocol.budget.parallel_reservations.adversarial_probes_maximum, "Declared probe execution allowance");
  equal(probes.maximum_logical_evaluations, protocol.budget.mechanical_probe_evaluations_maximum, "Declared probe discovery allowance");
  assert(probes.engine_executions <= protocol.budget.parallel_reservations.adversarial_probes_maximum, "Probe execution ceiling");
  equal(probes.logical_evaluations, sum(probes.calls.map(call => Number(call.logical_evaluation))), "Probe discovery arithmetic");
  equal(probes.all_trials.map(row => row.logical_evaluation), Array.from({ length: 12 }, (_, index) => index + 1), "All probe discoveries retained");
  equal(probes.logical_evaluations, 12, "Bounded probe discoveries");
  equal(probes.probes.map(row => row.id).sort(), protocol.mechanical_probes.map(row => row.id).sort(), "Declared probe coverage");
  assert(probes.probes.every(row => row.status === "pass"), "Recorded probe outcomes require review");
  equal(probes.remaining_engine_executions, probes.maximum_engine_executions - probes.engine_executions, "Probe remaining budget");
  equal(probes.external_agent_tokens, null, "Probe reasoning tokens unknown");
  hash(probes.raw_ledger_sha256, "Historical raw probe ledger digest");

  const capacity = study.capacity;
  equal(capacity.schema, "platonik-expedition-capacity-v1", "Capacity schema");
  const measured = checkedArms.get(capacity.arm);
  assert(measured, "Capacity uses a verified published arm");
  equal(capacity.samples.length, 30, "Thirty recorded capacity samples");
  for (const [index, sample] of capacity.samples.entries()) {
    equal(sample.index, index, "Capacity sample sequence");
    positive(sample.elapsed_ms, "Capacity wall time"); positive(sample.engine_elapsed_ms, "Capacity process time");
    assert(sample.elapsed_ms >= sample.engine_elapsed_ms, "Process timing exceeds containing command");
    integer(sample.peak_rss_bytes, "Capacity RSS"); positive(sample.peak_rss_bytes, "Nonzero capacity RSS");
    equal([sample.engine_executions, sample.trials, sample.work, sample.revision], [20, 20, measured.campaign.work, measured.revision], "Capacity measured the same complete journal");
  }
  const times = capacity.samples.map(sample => sample.elapsed_ms).sort((a, b) => a - b);
  approximate(capacity.p50_ms, (times[14] + times[15]) / 2, "Capacity median arithmetic");
  approximate(capacity.p95_ms, times[28], "Capacity nearest-rank p95 arithmetic");
  equal(capacity.peak_rss_bytes, Math.max(...capacity.samples.map(sample => sample.peak_rss_bytes)), "Capacity peak arithmetic");
  equal(capacity.artifact_bytes, measured.arm.artifact_bytes, "Capacity measured public artifact size");
  equal(capacity.engine_executions, sum(capacity.samples.map(sample => sample.engine_executions)), "Capacity execution arithmetic");
  equal(capacity.engine_executions, 600, "Capacity fixed verification allowance");
  const historicalExecutions = sum(study.arms.map(arm => arm.engine_executions)) + baseline.engine_executions + probes.engine_executions + capacity.engine_executions;
  equal(study.engine_executions, historicalExecutions, "Full historical execution ledger");
  equal(historicalExecutions, 2572, "Published study epoch execution count");
  assert(historicalExecutions <= protocol.budget.maximum_actual_engine_executions_including_journal_replays, "Global study budget");
  equal(study.logical_evaluations, sum(study.arms.map(arm => arm.trials)) + baseline.cases.length + probes.logical_evaluations, "Full historical discovery ledger");
  equal(study.logical_evaluations, 68, "Published study logical evaluations");
  equal(freshExecutions, 120, "Fresh regression verification is separate from historical study cost");
  console.log("Verified two published expeditions, 40 trials, eight frozen case inputs, selected traces, parents and study arithmetic; 120 fresh replay executions. Historical baseline/probe outcomes and timing samples are arithmetically checked records, not newly repeated measurements; unpublished raw-output/notes digests are provenance only.");
} finally {
  // Delete only the uniquely created, gate-owned temporary tree, including failures.
  fs.rmSync(temporary, { recursive: true, force: true });
}
