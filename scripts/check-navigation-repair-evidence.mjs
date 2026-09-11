// Fresh admission of the separately declared repair after the failed first navigation study.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";

const equal = assert.deepEqual;
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const identity = value => `sha256:${sha(JSON.stringify(value))}`;
const sum = values => values.reduce((total, value) => total + value, 0);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const MAX_RECEIPT = 2 * 1024 * 1024;
const MAX_BUNDLE = 64 * 1024 * 1024;
const MAX_EXPANDED_TOTAL = 256 * 1024 * 1024;
const evidence = "fixtures/evidence/";
const protocolFile = `${evidence}navigation-repair-protocol.json`;
const freezeFile = `${evidence}navigation-repair-freeze.json`;
const studyFile = `${evidence}navigation-repair-study.json`;

function local(file) {
  assert(typeof file === "string" && file.length > 0 && !path.isAbsolute(file));
  assert(!file.includes("\\") && file.split("/").every(part => part && part !== "." && part !== ".."));
  return file;
}
function bytes(file, maximum = MAX_BUNDLE) {
  local(file);
  const stat = fs.lstatSync(file);
  assert(stat.isFile() && stat.size <= maximum, `Bounded regular artifact: ${file}`);
  return fs.readFileSync(file);
}
const read = file => JSON.parse(bytes(file).toString("utf8"));
const plan = read(protocolFile), freeze = read(freezeFile), study = read(studyFile);
equal([plan.schema, freeze.schema, study.schema], [
  "platonik-navigation-protocol-v1", "platonik-navigation-freeze-v1", "platonik-navigation-study-v1",
]);
equal(study.protocol_sha256, sha(bytes(protocolFile)));
equal(study.freeze_sha256, sha(bytes(freezeFile)));
equal(study.source_digest, identity(freeze.source));
assert(digest(freeze.source.release_binary_sha256));
for (const [file, hash] of Object.entries(freeze.source.source_files_sha256)) {
  local(file); assert(digest(hash));
}
// Historical source remains identified; later source refactors need not retain
// identical bytes. Immutable inputs and results still have to replay exactly.
equal(freeze.source.source_files_sha256[protocolFile], study.protocol_sha256);
equal(plan.budget, { preflight_engine_executions: 384, study_engine_executions: 2048,
  maximum_logical_cold_runs: 186, maximum_segmented_replays: 4, candidate_slots: 3 });
equal(plan.pause_ticks, [5, 9, 14, 19, 27, 47, 79, 96]);
equal(plan.restoration_tick, 9);
equal(plan.baseline_kinds, ["right-wall", "compact", "without-return-goal"]);

// A new allowance does not erase the completed, unsuccessful first search.
const previousFiles = ["navigation-protocol.json", "navigation-freeze.json", "navigation-study.json"]
  .map(file => `${evidence}${file}`);
equal(plan.previous_diagnostic.map(row => row.file), previousFiles);
for (const row of plan.previous_diagnostic) {
  assert(digest(row.sha256)); equal(sha(bytes(row.file)), row.sha256);
  equal(freeze.source.source_files_sha256[row.file], row.sha256);
}
const [previousPlan, previousFreeze, previousStudy] = previousFiles.map(read);
equal([previousPlan.schema, previousFreeze.schema, previousStudy.schema], [
  "platonik-navigation-protocol-v1", "platonik-navigation-freeze-v1", "platonik-navigation-study-v1",
]);
equal(previousStudy.protocol_sha256, plan.previous_diagnostic[0].sha256);
equal(previousStudy.freeze_sha256, plan.previous_diagnostic[1].sha256);
equal(previousStudy.source_digest, identity(previousFreeze.source));
equal(previousFreeze.source.source_files_sha256[previousFiles[0]], previousStudy.protocol_sha256);
equal(freeze.source.release_binary_sha256, previousFreeze.source.release_binary_sha256,
  "The repair uses the same admitted engine executable");
for (const [file, hash] of Object.entries(previousFreeze.source.source_files_sha256)) {
  if (file.startsWith("crates/") || file.startsWith("scripts/continuity/")
    || ["Cargo.toml", "Cargo.lock", "rust-toolchain.toml"].includes(file))
    equal(freeze.source.source_files_sha256[file], hash, `Unchanged engine/runtime source: ${file}`);
}
for (const field of ["training", "transfer", "compatibility", "distinct_cases", "recipes", "pause_ticks", "restoration_tick"])
  equal(plan[field], previousPlan[field], `The repair retains the declared ${field}`);
equal(previousPlan.baseline_kinds, ["right-wall", "compact", "without-memory-writes"]);

// Reconstruct the declared grid independently of the recipe generator.
const sources = {
  reversed: `${evidence}continuity-inputs/counterexample--reversed-crossing.json`,
  late: `${evidence}continuity-inputs/counterexample--late-crossing.json`,
};
const oldIds = ["changing-one", "changing-zero", "broken-crossing", "slow-radio",
  "early-crossing", "reversed-crossing", "repeated-reports", "late-crossing"];
const training = ["repair-reversed-50", "repair-late-61", "steady-service", "closed-then-open"];
const expectedRecipes = [
  { id: training[0], source: sources.reversed }, { id: training[1], source: sources.late },
  { id: training[2], source: `${evidence}continuity-cases/changing-one.json` },
  { id: training[3], source: `${evidence}continuity-cases/broken-crossing.json` },
];
const transfers = [];
for (const [family, closes, reopens, originalClose, originalReopen] of [
  ["reversed", [26, 27, 28], [49, 50, 51], 27, 50],
  ["late", [38, 39, 40], [60, 61, 62], 39, 61],
]) for (const close of closes) for (const reopen of reopens) for (const rotate of [false, true]) {
  if (close === originalClose && reopen === originalReopen && !rotate) continue;
  const id = `${family}-c${close}-r${reopen}-${rotate ? "rotated" : "original"}`;
  transfers.push(id); expectedRecipes.push({ id, source: sources[family], close, reopen, rotate });
}
const compatibility = oldIds.map(id => `prior-${id}`);
for (const id of oldIds) expectedRecipes.push({ id: `prior-${id}`, source: `${evidence}continuity-cases/${id}.json` });
equal(plan.training, training); equal(plan.transfer, transfers); equal(plan.compatibility, compatibility);
equal(plan.recipes.length, 46);
equal(plan.recipes.map(({ source_sha256, ...recipe }) => recipe), expectedRecipes);

function derive(recipe) {
  equal(sha(bytes(recipe.source)), recipe.source_sha256);
  equal(freeze.source.source_files_sha256[recipe.source], recipe.source_sha256);
  const world = read(recipe.source);
  if (recipe.close !== undefined) {
    const closures = world.events.filter(row => row.event.kind === "edge_blocked");
    equal(closures.length, 2); equal(closures.map(row => row.event.blocked).sort(), [false, true]);
    for (const row of closures) row.tick = row.event.blocked ? recipe.close : recipe.reopen;
    world.events.sort((a, b) => a.tick - b.tick);
  }
  if (recipe.rotate) {
    const rotate = point => ({ x: world.width - point.x - 1, y: world.height - point.y - 1 });
    world.walls = world.walls.map(rotate);
    for (const group of ["cells", "sources", "depots", "beacons", "valves"])
      for (const item of world[group]) item.position = rotate(item.position);
    for (const cell of world.cells)
      cell.heading = { north: "south", east: "west", south: "north", west: "east" }[cell.heading];
    for (const row of world.events) if (row.event.kind === "edge_blocked") {
      const ends = [rotate(row.event.edge.a), rotate(row.event.edge.b)].sort((a, b) => a.x - b.x || a.y - b.y);
      row.event.edge = { a: ends[0], b: ends[1] };
    }
  }
  return world;
}
const cases = new Map(), unique = new Map();
for (const recipe of plan.recipes) {
  const file = `${evidence}navigation-cases/${recipe.id}.json`, world = derive(recipe);
  equal(sha(bytes(file)), freeze.source.source_files_sha256[file]); equal(read(file), world);
  equal([world.version, world.ticks, world.cells.length, world.fuel, world.activation_fuel], [2, 96, 4, 20000, 128]);
  cases.set(recipe.id, world);
  if (!unique.has(identity(world))) unique.set(identity(world), recipe.id);
}
equal(unique.size, 44); equal(plan.distinct_cases, [...unique.values()]);
equal(cases.get("steady-service"), cases.get("prior-changing-one"));
equal(cases.get("closed-then-open"), cases.get("prior-broken-crossing"));
equal(plan.candidates.length, 3);
const repairCandidateIds = ["source-compass", "compass-goal", "compass-goal-heading"];
for (const [index, candidate] of plan.candidates.entries()) {
  equal(candidate.id, repairCandidateIds[index]);
  equal(candidate.source_file, `${evidence}navigation-repair-submissions/${candidate.id}.json`);
  equal(sha(bytes(candidate.source_file)), candidate.source_sha256);
}

function metrics(ledger, owner, maximum, sourceDigest = study.source_digest) {
  equal([ledger.schema, ledger.owner, ledger.source_digest], ["platonik-navigation-ledger-v1", owner, sourceDigest]);
  equal(ledger.maximum_engine_executions, maximum);
  assert(!ledger.pending_call && !ledger.pending_operation && !ledger.stopped && !ledger.accounting_incomplete);
  assert(Array.isArray(ledger.calls) && ledger.calls.length <= 1024);
  let consumed = 0;
  for (const [index, call] of ledger.calls.entries()) {
    equal(call.index, index); equal(call.metrics.schema, "platonik-process-metrics-v1");
    assert(integer(call.metrics.engine_executions) && integer(call.metrics.elapsed_micros));
    assert([2, 64].includes(call.reserved_engine_executions));
    assert(consumed + call.reserved_engine_executions <= maximum, "Reservation precedes each historical call");
    assert(call.metrics.engine_executions <= call.reserved_engine_executions);
    assert(Number.isFinite(call.elapsed_ms) && call.elapsed_ms > 0);
    assert([0, 1, 2].includes(call.exit_code));
    assert(digest(call.stdout_sha256) && digest(call.stderr_sha256));
    equal(call.stdout, `${String(index).padStart(4, "0")}.stdout.json`);
    equal(call.stderr, `${String(index).padStart(4, "0")}.stderr.jsonl`);
    assert(Array.isArray(call.args) && call.args.every(arg => typeof arg === "string"));
    if (call.exit_code !== 2) equal(call.stderr_sha256, sha(`${JSON.stringify(call.metrics)}\n`));
    consumed += call.metrics.engine_executions;
  }
  equal(ledger.engine_executions, consumed); assert(consumed <= maximum);
}
metrics(freeze.preflight, "preflight", plan.budget.preflight_engine_executions);
assert(freeze.preflight.finished?.preflight);
equal(freeze.preflight.confirmation.map(row => row.case_id), training.slice(0, 2));
equal(freeze.preflight.replays.length, 1);
const ledger = study.ledger;
metrics(ledger, "navigator", plan.budget.study_engine_executions);

// Authenticate compressed and expanded bytes separately, with bounded reads.
const artifacts = new Map();
assert(Object.keys(study.artifacts).length <= 512);
let expandedBytes = 0;
for (const [file, artifact] of Object.entries(study.artifacts)) {
  local(file);
  assert(file.startsWith(`${evidence}navigation-`) || file.startsWith("public/navigation/"));
  assert(integer(artifact.bytes) && digest(artifact.sha256));
  const buffer = bytes(file); equal(buffer.length, artifact.bytes); equal(sha(buffer), artifact.sha256);
  if (file.endsWith(".gz")) {
    assert(new RegExp(`^${evidence}navigation-repair-receipts/[a-f0-9]{64}\\.json\\.gz$`).test(file));
    assert(integer(artifact.uncompressed_bytes) && artifact.uncompressed_bytes > 0 && artifact.uncompressed_bytes <= MAX_RECEIPT);
    assert(digest(artifact.uncompressed_sha256));
    equal(path.basename(file), `${artifact.uncompressed_sha256}.json.gz`);
    expandedBytes += artifact.uncompressed_bytes;
    assert(expandedBytes <= MAX_EXPANDED_TOTAL);
    const expanded = gunzipSync(buffer, { maxOutputLength: artifact.uncompressed_bytes });
    equal(expanded.length, artifact.uncompressed_bytes); equal(sha(expanded), artifact.uncompressed_sha256);
  }
  artifacts.set(file, artifact);
}
function artifact(file) { assert(artifacts.has(file), `Unlisted artifact ${file}`); return artifacts.get(file); }

const temporary = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "platonik-navigation-repair-check-"));
const binary = path.resolve(process.env.PLATONIK_CLI ?? "target/debug/platonik");
let executions = 0;
function cli(args) {
  assert(executions + 64 <= 1024, "Fresh admission execution reservation");
  const result = spawnSync(binary, ["--metrics", ...args], { encoding: "utf8", timeout: 60_000, maxBuffer: 70 * 1024 * 1024 });
  if (result.error) throw result.error;
  const rows = (result.stderr ?? "").trim().split("\n").filter(Boolean).map(JSON.parse)
    .filter(row => row.schema === "platonik-process-metrics-v1");
  equal(rows.length, 1, "Fresh admission must have known execution accounting");
  assert(integer(rows[0].engine_executions) && rows[0].engine_executions <= 64);
  executions += rows[0].engine_executions;
  equal(result.status, 0, `Fresh CLI failed ${args.slice(0, 2)}: ${result.stderr.slice(0, 500)}`);
  return JSON.parse(result.stdout);
}
const receipts = new Map();
const checkedFiles = new Set();
function checked(file) {
  const meta = artifact(file), rawHash = meta.uncompressed_sha256 ?? meta.sha256;
  checkedFiles.add(file);
  if (receipts.has(rawHash)) return receipts.get(rawHash);
  const raw = file.endsWith(".gz")
    ? gunzipSync(bytes(file), { maxOutputLength: meta.uncompressed_bytes }) : bytes(file, MAX_RECEIPT);
  equal(sha(raw), rawHash);
  const receipt = JSON.parse(raw.toString("utf8"));
  equal([receipt.schema, receipt.protocol], ["platonik-receipt-v1", "platonik-habitat-v2"]);
  equal(identity(receipt.experiment), receipt.experiment_hash); equal(identity(receipt.result), receipt.result_hash);
  const expanded = path.join(temporary, `${rawHash}.json`); fs.writeFileSync(expanded, raw, { flag: "wx" });
  const verified = cli(["verify", expanded]);
  equal(verified, verification(receipt));
  receipts.set(rawHash, receipt); return receipt;
}
function verification(receipt) {
  return { schema: "platonik-verification-v1", verified: true, passed: receipt.result.outcome.passed,
    protocol: receipt.protocol, experiment_hash: receipt.experiment_hash, result_hash: receipt.result_hash,
    ticks_completed: receipt.result.ticks_completed, work: sum(Object.values(receipt.result.costs)) };
}
const courier = world => world.cells.find(cell => cell.id === 1).program;
function apply(world, program) {
  const expected = structuredClone(world); expected.cells.find(cell => cell.id === 1).program = program; return expected;
}
function withoutReturnGoal(program, id) {
  const changed = structuredClone(program);
  if (id === "source-compass") {
    const retained = [];
    for (const rule of changed.rules) {
      const emptyReturn = rule.action.kind === "move"
        && rule.when.some(condition => condition.kind === "carrying" && condition.value === false);
      if (!emptyReturn) retained.push(rule);
    }
    changed.rules = retained;
  } else {
    assert(id === "compass-goal" || id === "compass-goal-heading");
    for (const rule of changed.rules) {
      if (rule.action.kind !== "drop" || rule.remember?.slot !== 1) continue;
      rule.remember = null;
    }
  }
  return changed;
}
function rowCheck(row, program) {
  assert(cases.has(row.case_id));
  const receipt = checked(row.receipt_file);
  equal(row.receipt_sha256, artifact(row.receipt_file).uncompressed_sha256);
  equal(receipt.experiment, apply(cases.get(row.case_id), program), "Only the courier changes");
  equal(row.experiment_hash, receipt.experiment_hash); equal(row.result_hash, receipt.result_hash);
  equal(row.passed, receipt.result.outcome.passed); equal(row.status, receipt.result.status);
  equal(row.ticks, receipt.result.ticks_completed); equal(row.work, sum(Object.values(receipt.result.costs)));
  if (row.program !== undefined) {
    equal(row.program, program); equal(row.program_hash, identity(program)); assert(row.verified);
  }
  return receipt;
}
function coldCalls(owner, row, receipt, offset) {
  equal([row.first_call, row.last_call], [offset, offset + 1]);
  const first = owner.calls[offset], last = owner.calls[offset + 1];
  equal(first.args, ["run", `${row.id}/experiment.json`]);
  equal(last.args, ["verify", `${row.id}/receipt.json`]);
  equal([first.reserved_engine_executions, last.reserved_engine_executions], [2, 2]);
  equal([first.metrics.engine_executions, last.metrics.engine_executions], [1, 1]);
  equal([first.exit_code, last.exit_code], [row.passed ? 0 : 1, 0]);
  equal(first.stdout_sha256, sha(`${JSON.stringify(receipt, null, 2)}\n`));
  equal(last.stdout_sha256, sha(`${JSON.stringify(verification(receipt), null, 2)}\n`));
  equal(row.receipt, `${row.id}/receipt.json`);
  return offset + 2;
}
function replayCalls(owner, row, offset) {
  const expected = [["habitat", "init", `${row.id}/save`, `${row.id}/experiment.json`]];
  let save = `${row.id}/save`, revision = 0;
  // An initialized save is revision 0; each advance appends intent + outcome.
  for (const tick of plan.pause_ticks) {
    expected.push(["habitat", "advance", save, "--until", String(tick), "--expect-revision", String(revision), "--request-id", `leg-${tick}`]);
    revision += 2;
    if (tick === plan.restoration_tick) {
      expected.push(["habitat", "export", save]); save = `${row.id}/restored`;
      expected.push(["habitat", "import", `${row.id}/middle.bundle.json`, save]);
    }
  }
  expected.push(["habitat", "export", save], ["verify", `${row.id}/receipt.json`]);
  for (const [index, args] of expected.entries()) {
    const call = owner.calls[offset + index]; equal(call.args, args);
    equal(call.reserved_engine_executions, 64);
    assert([0, 1].includes(call.exit_code));
  }
  return offset + expected.length;
}
function checkpointCheck(row, receipt) {
  assert(row.uninterrupted_equal && row.restored_equal); equal(row.restoration, "verified-at-tick-9");
  equal(row.pair, { courier: courier(receipt.experiment), controller: receipt.experiment.cells.find(cell => cell.id === 3).program });
  equal(row.checkpoints.map(cut => cut.tick), plan.pause_ticks);
  for (const [index, cut] of row.checkpoints.entries()) {
    const frame = receipt.result.frames.find(frame => frame.tick === cut.tick);
    assert(frame?.complete); equal(cut.revision, 2 * (index + 1));
    equal(cut.state_hash, identity(frame.state)); equal(cut.costs_hash, identity(frame.costs)); equal(cut.costs, frame.costs);
    equal(cut.remaining_fuel, receipt.experiment.fuel - sum(Object.values(frame.costs)));
    equal(cut.phase, cut.tick === receipt.experiment.ticks ? "finished" : "paused");
    equal(cut.result_hash, cut.phase === "finished" ? receipt.result_hash : null);
    equal(cut.checkpoint_hash, cut.phase === "finished" ? null : identity(checkpoint(receipt, cut.tick)));
  }
}
function checkpoint(receipt, tick) {
  const frames = receipt.result.frames.filter(frame => frame.tick <= tick);
  return { schema: "platonik-checkpoint-v1", experiment_hash: receipt.experiment_hash,
    prefix_hash: identity(frames), experiment: receipt.experiment, frames };
}
function bundleCheck(bundle, receipt) {
  equal(bundle.schema, "platonik-habitat-bundle-v1");
  equal(bundle.entries.length, 17);
  const event = entry => bundle.objects[entry.event.event_hash];
  const genesis = event(bundle.entries[0]);
  equal(genesis, { kind: "initialized", experiment: receipt.experiment,
    result: { kind: "paused", value: checkpoint(receipt, 0) } });
  for (const [index, tick] of plan.pause_ticks.entries()) {
    const start = bundle.entries[index * 2 + 1], end = bundle.entries[index * 2 + 2];
    equal(start.event.request_id, `leg-${tick}`); equal(end.event.request_id, `leg-${tick}`);
    equal(start.event.expected_revision, index * 2);
    equal(event(start).kind, "started"); equal(event(start).until, tick);
    equal(event(end), { kind: "completed", result: tick === 96
      ? { kind: "finished", value: receipt.result }
      : { kind: "paused", value: checkpoint(receipt, tick) } });
  }
}

function previousDiagnosticCheck() {
  const prior = previousStudy.ledger;
  metrics(prior, "navigator", previousPlan.budget.study_engine_executions, previousStudy.source_digest);
  metrics(previousFreeze.preflight, "preflight", previousPlan.budget.preflight_engine_executions, previousStudy.source_digest);
  assert(previousFreeze.preflight.finished?.preflight);
  equal(prior.selected, null); equal(prior.confirmation, []); equal(prior.baselines, []); equal(prior.replays, []);
  equal(prior.finished.navigation_gate, false);
  assert(typeof prior.finished.reason === "string" && prior.finished.reason.length > 0);
  equal(prior.candidates.length, 4); equal(prior.engine_executions, 32);
  let expandedTotal = 0;
  assert(Object.keys(previousStudy.artifacts).length <= 512);
  for (const [file, meta] of Object.entries(previousStudy.artifacts)) {
    assert(file.startsWith(`${evidence}navigation-`));
    const raw = bytes(file); equal(raw.length, meta.bytes); equal(sha(raw), meta.sha256);
    if (file.endsWith(".gz")) {
      assert(new RegExp(`^${evidence}navigation-receipts/[a-f0-9]{64}\\.json\\.gz$`).test(file));
      assert(integer(meta.uncompressed_bytes) && meta.uncompressed_bytes > 0 && meta.uncompressed_bytes <= MAX_RECEIPT);
      assert(digest(meta.uncompressed_sha256));
      equal(path.basename(file), `${meta.uncompressed_sha256}.json.gz`);
      expandedTotal += meta.uncompressed_bytes; assert(expandedTotal <= MAX_EXPANDED_TOTAL);
      const decoded = gunzipSync(raw, { maxOutputLength: meta.uncompressed_bytes });
      equal(decoded.length, meta.uncompressed_bytes); equal(sha(decoded), meta.uncompressed_sha256);
    }
  }
  let offset = 0;
  for (const [index, candidate] of prior.candidates.entries()) {
    const declared = previousPlan.candidates[index];
    equal(candidate.id, `right-run-${index + 1}`); equal(candidate.id, declared.id);
    equal(candidate.sequence, index + 1); equal(candidate.first_call, offset);
    equal(candidate.admission, "completed"); equal(candidate.passed, false);
    equal(candidate.source_file, `${evidence}navigation-submissions/${candidate.id}.json`);
    equal(candidate.source_file, declared.source_file); equal(candidate.source_sha256, declared.source_sha256);
    equal(sha(bytes(candidate.source_file)), candidate.source_sha256);
    equal(candidate.program, read(candidate.source_file)); equal(candidate.program_hash, identity(candidate.program));
    equal(candidate.program_bytes, Buffer.byteLength(JSON.stringify(candidate.program)));
    equal(candidate.trials.map(row => row.case_id), training);
    for (const row of candidate.trials) {
      const meta = previousStudy.artifacts[row.receipt_file]; assert(meta);
      equal(meta.uncompressed_sha256, row.receipt_sha256);
      const receipt = JSON.parse(gunzipSync(bytes(row.receipt_file), { maxOutputLength: MAX_RECEIPT }).toString("utf8"));
      equal([receipt.schema, receipt.protocol], ["platonik-receipt-v1", "platonik-habitat-v2"]);
      equal(identity(receipt.experiment), receipt.experiment_hash); equal(identity(receipt.result), receipt.result_hash);
      equal(receipt.experiment, apply(cases.get(row.case_id), candidate.program));
      equal(row.program, candidate.program); equal(row.program_hash, candidate.program_hash);
      equal(row.experiment_hash, receipt.experiment_hash); equal(row.result_hash, receipt.result_hash);
      equal(row.passed, receipt.result.outcome.passed); equal(row.status, receipt.result.status);
      equal(row.ticks, receipt.result.ticks_completed); equal(row.work, sum(Object.values(receipt.result.costs)));
      assert(row.verified); equal(row.id, `c${index + 1}-${row.case_id}`);
      offset = coldCalls(prior, row, receipt, offset);
    }
    assert(!candidate.trials.every(row => row.passed && row.status === "complete"));
    equal(candidate.work, sum(candidate.trials.map(row => row.work)));
    equal(candidate.after_call, offset);
  }
  equal(offset, prior.calls.length);
  // The unchanged v1 admission script owns fresh execution of those 16 receipts.
  // Here their exact linked bytes, failed result and consumed search remain bound.
}

try {
  previousDiagnosticCheck();
  // Preflight failures are the original preserved worlds, not search attempts.
  let preflightOffset = 0;
  for (const [index, row] of freeze.preflight.confirmation.entries()) {
    const original = read(`${evidence}continuity-counterexamples/${index ? "late" : "reversed"}-crossing.receipt.json`);
    equal(original.experiment, cases.get(row.case_id)); equal(row.result_hash, original.result_hash);
    equal(row.experiment_hash, original.experiment_hash); assert(!row.passed); equal(row.status, "complete");
    equal(row.work, sum(Object.values(original.result.costs)));
    preflightOffset = coldCalls(freeze.preflight, row, original, preflightOffset);
  }
  const preflightReplay = freeze.preflight.replays[0];
  equal([preflightReplay.id, preflightReplay.case_id], ["preflight-restoration", training[0]]);
  checkpointCheck(preflightReplay, read(`${evidence}continuity-counterexamples/reversed-crossing.receipt.json`));
  preflightOffset = replayCalls(freeze.preflight, preflightReplay, preflightOffset);
  equal(preflightOffset, freeze.preflight.calls.length);

  equal(ledger.candidates.length, 3);
  let offset = 0;
  for (const [index, candidate] of ledger.candidates.entries()) {
    const declared = plan.candidates[index];
    equal([candidate.id, candidate.sequence], [declared.id, index + 1]);
    equal(candidate.first_call, offset);
    equal(candidate.trials.map(row => row.case_id), training.slice(0, candidate.trials.length));
    assert(candidate.trials.length <= 4);
    let program;
    if (candidate.input_unavailable) {
      equal(candidate.admission, "rejected"); equal(candidate.trials, []);
      assert(!candidate.source && !candidate.source_file && !candidate.passed);
    } else {
      artifact(candidate.source_file);
      equal(sha(bytes(candidate.source_file)), candidate.source_sha256);
      const declaredInput = candidate.source_sha256 === declared.source_sha256;
      equal(candidate.source_file, declaredInput ? declared.source_file : `${evidence}navigation-repair-submissions/rejected-${index + 1}.json`);
      equal(candidate.source, `submission-${index + 1}.json`);
      if (!declaredInput) { equal(candidate.admission, "rejected"); equal(candidate.trials, []); assert(!candidate.passed); }
      try { program = read(candidate.source_file); }
      catch (error) { if (!(error instanceof SyntaxError)) throw error; equal(candidate.admission, "rejected"); equal(candidate.trials, []); }
    }
    for (const row of candidate.trials) {
      equal(row.id, `c${index + 1}-${row.case_id}`);
      const receipt = rowCheck(row, program); offset = coldCalls(ledger, row, receipt, offset);
    }
    if (candidate.admission === "completed") {
      equal(candidate.source_sha256, declared.source_sha256);
      equal(candidate.trials.length, 4); equal(candidate.program, program);
      equal(candidate.program_hash, identity(program)); equal(candidate.program_bytes, Buffer.byteLength(JSON.stringify(program)));
      equal(candidate.work, sum(candidate.trials.map(row => row.work)));
      equal(candidate.passed, candidate.trials.every(row => row.passed && row.status === "complete"));
    } else {
      assert(["rejected", "partial"].includes(candidate.admission)); assert(!candidate.passed && typeof candidate.error === "string");
      // A terminal rejected CLI call cannot masquerade as a completed trial.
      if (ledger.calls[offset]?.exit_code === 2) {
        equal(ledger.calls[offset].args, ["run", `c${index + 1}-${training[candidate.trials.length]}/experiment.json`]);
        offset++;
      }
    }
    equal(candidate.after_call, offset);
  }
  const selected = ledger.candidates.filter(row => row.passed)
    .sort((a, b) => a.work - b.work || a.program_bytes - b.program_bytes || a.sequence - b.sequence)[0];
  if (!selected) {
    equal(ledger.selected, null); equal(ledger.confirmation, []); equal(ledger.baselines, []); equal(ledger.replays, []);
    equal(ledger.finished.navigation_gate, false); assert(typeof ledger.finished.reason === "string");
    equal(offset, ledger.calls.length);
    console.log(`Checked navigation repair diagnostic: no all-training-pass candidate; gate remains false. ${receipts.size} fresh receipts, ${executions} admission executions; previous failed search retained (${previousStudy.ledger.engine_executions} recorded executions).`);
  } else {
    equal(ledger.selected, { id: selected.id, sequence: selected.sequence, program: selected.program,
      program_hash: selected.program_hash, training_work: selected.work, after_call: offset });
    equal(ledger.confirmation.map(row => [row.kind, row.case_id]), [
      ...transfers.map(id => ["transfer", id]), ...compatibility.map(id => ["compatibility", id]),
    ]);
    for (const row of ledger.confirmation) {
      equal(row.id, `confirm-${row.case_id}`);
      offset = coldCalls(ledger, row, rowCheck(row, selected.program), offset);
    }
    const original = courier(cases.get(training[0]));
    const compact = { rules: [...structuredClone(original.rules.slice(0, 2)),
      { when: [{ kind: "blocked", direction: "forward", value: true }], action: { kind: "turn", direction: "back" }, remember: null },
      { when: [], action: { kind: "move", direction: "forward" }, remember: null }] };
    const ablated = withoutReturnGoal(selected.program, selected.id);
    const programs = { "right-wall": original, compact, "without-return-goal": ablated };
    equal(ledger.baselines.map(row => [row.kind, row.case_id]), plan.baseline_kinds.flatMap(kind => plan.distinct_cases.map(id => [kind, id])));
    for (const row of ledger.baselines) {
      equal(row.id, `${row.kind}-${row.case_id}`);
      offset = coldCalls(ledger, row, rowCheck(row, programs[row.kind]), offset);
    }
    const replaySpecs = [
      ["original-reversed", training[0], "original"], ["repaired-reversed", training[0], "repaired"],
      ["original-late", training[1], "original"], ["repaired-late", training[1], "repaired"],
    ];
    equal(ledger.replays.map(row => [row.id, row.case_id, row.variant]), replaySpecs);
    const replayReceipts = new Map();
    for (const [index, row] of ledger.replays.entries()) {
      const receipt = rowCheck(row, row.variant === "original" ? original : selected.program);
      checkpointCheck(row, receipt); offset = replayCalls(ledger, row, offset);
      equal(row.bundle_file, `public/navigation/${row.id}.bundle.json`);
      equal(artifact(row.bundle_file).sha256, row.bundle_sha256);
      const bundle = read(row.bundle_file), target = path.join(temporary, `restored-${index}`);
      bundleCheck(bundle, receipt);
      const imported = cli(["habitat", "import", path.resolve(row.bundle_file), target]);
      const verified = cli(["habitat", "verify", target]); equal(imported, verified);
      equal(verified.phase, "finished"); equal(verified.revision, bundle.entries.at(-1).revision);
      equal(verified.experiment_hash, receipt.experiment_hash); equal(verified.result_hash, receipt.result_hash);
      equal(verified.current_state, receipt.result.final_state); equal(verified.costs, receipt.result.costs);
      equal(verified.mission_passed, receipt.result.outcome.passed); equal(verified.tick, 96);
      equal(verified.remaining_fuel, receipt.experiment.fuel - row.work);
      replayReceipts.set(row.id, receipt);
    }
    equal(offset, ledger.calls.length, "Every recorded CLI call belongs to a declared attempt or replay");
    const logical = sum(ledger.candidates.map(row => row.trials.length)) + ledger.confirmation.length + ledger.baselines.length;
    assert(logical <= plan.budget.maximum_logical_cold_runs);
    equal(ledger.finished.logical_cold_runs, logical);
    equal(ledger.finished.navigation_gate, ledger.confirmation.every(row => row.passed && row.status === "complete"));
    equal(ledger.finished.original_failures_repaired, ledger.replays.filter(row => row.variant === "repaired").every(row => row.passed));
    equal(ledger.finished.all_saved_traces_equal, true);

    const indexFile = "public/navigation/index.json"; artifact(indexFile);
    const site = read(indexFile);
    equal(site.schema, "platonik-continuous-site-v1");
    equal(site.cases.map(row => row.id), replaySpecs.map(row => row[0]));
    for (const item of site.cases) {
      const row = ledger.replays.find(row => row.id === item.id), receipt = replayReceipts.get(item.id);
      const inputFile = `public/navigation/${item.id}.experiment.json`, receiptFile = `public/navigation/${item.id}.receipt.json`;
      artifact(inputFile); artifact(receiptFile);
      equal(read(inputFile), receipt.experiment); equal(checked(receiptFile), receipt);
      equal(item.result_hash, receipt.result_hash); equal(item.passed, receipt.result.outcome.passed);
      equal(item.work, row.work); equal(item.ticks, 96);
      assert(typeof item.label === "string" && typeof item.detail === "string");
      equal(item.cuts.map(({ tick, state_hash, costs_hash }) => ({ tick, state_hash, costs_hash })),
        row.checkpoints.map(({ tick, state_hash, costs_hash }) => ({ tick, state_hash, costs_hash })));
      for (const cut of item.cuts) {
        const frame = receipt.result.frames.find(frame => frame.tick === cut.tick);
        const cell = frame.state.cells.find(cell => cell.id === 1);
        equal(cut.detail, `Courier at (${cell.position.x}, ${cell.position.y}), memory [${cell.memory.join(", ")}], ${cell.cargo ? `carrying spark ${cell.cargo.id}` : "hands empty"}. ${sum(frame.state.sources.map(source => source.sparks.length))} sparks remain at source; ${frame.state.delivered.length} delivered. ${sum(Object.values(frame.costs))} modeled work.`);
      }
      equal(item.uninterrupted_equal, true); equal(item.restored_equal, true);
    }
    console.log(`Checked navigation repair study: ${logical} cold attempts, ${receipts.size} distinct receipt byte streams, four fresh restored habitats, ${executions} admission executions; recorded repair study ${ledger.engine_executions}; previous failed study ${previousStudy.ledger.engine_executions}; navigation gate ${ledger.finished.navigation_gate}.`);
  }
  for (const file of artifacts.keys()) if (file.endsWith(".json.gz") || file.endsWith(".receipt.json"))
    assert(checkedFiles.has(file), `Every published receipt is attached to a checked attempt: ${file}`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
