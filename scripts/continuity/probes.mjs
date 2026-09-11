// Run only after freeze. All attacks target new task-owned stores or copied
// bundles. No process crash is simulated here; pending prefixes are constructed.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createLedger, runner, read, sha, identity, protocol, verifyFreeze } from "./runner.mjs";
import { write, total, receiptFrom } from "./trajectory.mjs";

const [directory, suppliedBundle] = process.argv.slice(2);
assert(directory && suppliedBundle, "Use: node scripts/continuity/probes.mjs <new-directory> <qualified-middle.bundle.json>");
const frozen = verifyFreeze(), plan = protocol();
const sourcePath = fs.realpathSync(suppliedBundle);
const originalBytes = fs.readFileSync(sourcePath), sourceHash = sha(originalBytes);
const original = JSON.parse(originalBytes);
const eventAt = (bundle, index) => bundle.objects[bundle.entries.at(index).event.event_hash];
assert.equal(original.schema, "platonik-habitat-bundle-v1");
assert.equal(original.entries.length, 5, "Use the qualified two-advance tick-nine bundle");
const genesis = eventAt(original, 0), originalLast = eventAt(original, -1);
assert.equal(genesis.kind, "initialized");
assert.equal(originalLast.kind, "completed");
assert.equal(originalLast.result.kind, "paused");
assert.equal(originalLast.result.value.frames.at(-1).tick, 9);
assert.deepEqual(genesis.experiment, read("fixtures/evidence/continuity-cases/changing-one.json"));
assert.equal(identity(originalLast.result.value), frozen.preflight.segmented.checkpoints.find(row => row.tick === 9).checkpoint_hash);
assert.equal(plan.budget.parallel_reservations.adversarial_probes, 1024);

const ledger = createLedger(directory, 1024, {
  owner: "adversarial-probes", source_tree_digest: frozen.source_tree_digest,
  protocol_sha256: frozen.protocol_sha256, release_binary_sha256: frozen.release_binary_sha256,
  source_bundle_sha256: sourceHash, maximum_logical_evaluations: 12,
  logical_evaluations: 0, probes: [], source_reviews: [
    "Controlled subprocess interruption and activation-limit followed by fuel exhaustion are separate automated-test evidence; these CLI probes do not claim a new OS crash experiment.",
    "Content hashes identify lawful experiments; they do not authenticate ownership. The future-fuel probe changes a nested checkpoint while preserving the original journey genesis.",
  ],
});
const run = runner(directory, ledger);
const localOriginal = path.join(run.root, "original-copy.bundle.json"); write(localOriginal, original);
const projection = report => Object.fromEntries(["revision", "pending_request_id", "pending_until", "experiment_hash", "last_result_hash", "checkpoint_hash", "result_hash", "phase", "tick", "horizon", "advances", "remaining_fuel", "costs", "current_state", "mission_passed", "run_status", "activation_limited"].map(key => [key, report[key]]));
function journalDigest(save) {
  const entries = fs.readdirSync(path.join(save, "journal")).sort().map(name => [name, sha(fs.readFileSync(path.join(save, "journal", name)))]);
  return identity(entries);
}
function cli(args, accepted = [0]) { return run.cli(args, { reservation: 64, accepted }); }
function importCopy(name, bundle = original) {
  const file = path.join(run.root, `${name}.bundle.json`); write(file, bundle);
  const save = path.join(run.root, name);
  return { save, report: cli(["habitat", "import", file, save]).value };
}
function advance(save, until, revision, id, accepted = [0]) {
  return cli(["habitat", "advance", save, "--until", String(until), "--expect-revision", String(revision), "--request-id", id], accepted);
}
function rejected(args, pattern) {
  const { call } = cli(args, [2]);
  const rows = fs.readFileSync(path.join(run.root, call.stderr), "utf8").trim().split("\n").map(JSON.parse);
  const error = rows.find(row => row.schema !== "platonik-process-metrics-v1");
  assert(error, "Rejected commands must explain the error");
  if (pattern) assert.match(JSON.stringify(error), pattern, "Rejection must reach the intended boundary");
  return { call_index: call.index, error };
}
function rewritten(bundle, index, mutate) {
  const copy = structuredClone(bundle), events = copy.entries.map(entry => structuredClone(copy.objects[entry.event.event_hash]));
  mutate(events[index]);
  copy.objects = {};
  copy.entries.forEach((entry, offset) => {
    entry.event.event_hash = identity(events[offset]);
    entry.previous_hash = offset ? identity(copy.entries[offset - 1]) : null;
    copy.objects[entry.event.event_hash] = events[offset];
  });
  return copy;
}
function rejectImport(name, bundle, pattern) {
  const file = path.join(run.root, `${name}.bundle.json`), destination = path.join(run.root, name);
  write(file, bundle);
  const evidence = rejected(["habitat", "import", file, destination], pattern);
  assert(!fs.existsSync(destination), "Invalid state must reject before creating a destination");
  return evidence;
}

const probes = [
  ["checked-import-and-pause", () => {
    const { save, report } = importCopy("checked-import");
    const before = journalDigest(save);
    const checked = cli(["habitat", "verify", save]).value;
    const again = cli(["habitat", "status", save]).value;
    assert.deepEqual(projection(checked), projection(report));
    assert.deepEqual(projection(again), projection(report));
    assert.equal(journalDigest(save), before);
    assert.equal(report.tick, 9);
    assert(report.current_state.pending.length > 0, "The pause must preserve a queued signal");
    return { journal_hash: before, checkpoint_hash: report.checkpoint_hash, tick: report.tick };
  }],
  ["stale-revision", () => {
    const { save, report } = importCopy("stale");
    const before = journalDigest(save);
    const evidence = rejected(["habitat", "advance", save, "--until", "14", "--expect-revision", "0", "--request-id", "stale"], /Stale revision/);
    assert.equal(journalDigest(save), before);
    return { ...evidence, unchanged_revision: report.revision, journal_hash: before };
  }],
  ["exact-retry-after-later-progress", () => {
    const { save, report } = importCopy("retry");
    const first = advance(save, 14, report.revision, "first").value;
    const later = advance(save, 19, first.revision, "later").value;
    const before = journalDigest(save);
    assert.deepEqual(advance(save, 14, report.revision, "first").value, first);
    const changed = rejected(["habitat", "advance", save, "--until", "15", "--expect-revision", String(report.revision), "--request-id", "first"], /already bound/);
    assert.equal(journalDigest(save), before);
    return { original_revision: first.revision, current_revision: later.revision, changed_request: changed, journal_hash: before };
  }],
  ["pending-intent-recovery", () => {
    const pending = structuredClone(original), until = 14, expected = pending.entries.at(-1).revision;
    const event = { kind: "started", until, from_hash: identity(originalLast.result), reserved_work: genesis.experiment.fuel - total(originalLast.result.value.frames.at(-1).costs) };
    const event_hash = identity(event);
    pending.entries.push({ schema: "platonik-habitat-journal-v1", revision: expected + 1, previous_hash: identity(pending.entries.at(-1)), event: { request_id: "pending", command_hash: identity({ until }), expected_revision: expected, event_hash } });
    pending.objects[event_hash] = event;
    const { save, report } = importCopy("pending", pending);
    assert.equal(report.tick, 9); assert.equal(report.pending_request_id, "pending");
    assert.equal(report.pending_reserved_work, event.reserved_work);
    const recovered = cli(["habitat", "recover", save, "--expect-revision", String(report.revision), "--request-id", "pending"]).value;
    assert.equal(recovered.tick, until); assert.equal(recovered.pending_request_id, null);
    const before = journalDigest(save);
    assert.deepEqual(cli(["habitat", "recover", save, "--expect-revision", String(report.revision), "--request-id", "pending"]).value, recovered);
    assert.deepEqual(advance(save, until, expected, "pending").value, recovered);
    assert.equal(journalDigest(save), before);
    return { method: "constructed valid pending journal prefix; no process kill", old_tick: 9, recovered_tick: until, journal_hash: before };
  }],
  ["rehashed-state-forgery", () => {
    const attack = rewritten(original, 4, event => {
      event.result.value.frames.at(-1).state.cells.find(cell => cell.id === 3).memory[0] ^= 1;
      event.result.value.prefix_hash = identity(event.result.value.frames);
    });
    return rejectImport("forged-memory", attack, /Continuation result differs/);
  }],
  ["foreign-checkpoint-fuel-and-future-event", () => {
    const evidence = [];
    for (const field of ["fuel", "event"]) {
      const attack = rewritten(original, 4, event => {
        const checkpoint = event.result.value;
        if (field === "fuel") checkpoint.experiment.fuel += 1;
        else checkpoint.experiment.events.find(item => item.tick > 9).tick += 1;
        checkpoint.experiment_hash = identity(checkpoint.experiment);
        checkpoint.prefix_hash = identity(checkpoint.frames);
      });
      evidence.push(rejectImport(`foreign-${field}`, attack, /Continuation result differs/));
    }
    return { rejected: evidence, genesis_hash: identity(genesis.experiment) };
  }],
  ["immutable-genesis", () => {
    const { save } = importCopy("immutable-genesis");
    const changed = structuredClone(genesis.experiment); changed.fuel += 1;
    const file = path.join(run.root, "changed-genesis.json"); write(file, changed);
    const before = journalDigest(save);
    const evidence = rejected(["habitat", "init", save, file], /different experiment/);
    assert.equal(journalDigest(save), before);
    return { ...evidence, journal_hash: before };
  }],
  ["eight-advance-cap", () => {
    const { save, report } = importCopy("advance-cap");
    let latest = report;
    for (let tick = 10; tick <= 15; tick++) latest = advance(save, tick, latest.revision, `cap-${tick}`).value;
    assert.equal(latest.advances, 8); assert.equal(latest.phase, "paused");
    const before = journalDigest(save);
    const evidence = rejected(["habitat", "advance", save, "--until", "96", "--expect-revision", String(latest.revision), "--request-id", "ninth"], /at most eight advances/);
    assert.equal(journalDigest(save), before);
    return { ...evidence, advances: latest.advances, preserved_tick: latest.tick };
  }],
  ["terminal-loading-failure", () => {
    const experiment = structuredClone(genesis.experiment); experiment.fuel = 0;
    const file = path.join(run.root, "zero-fuel.json"); write(file, experiment);
    const save = path.join(run.root, "zero-fuel");
    const failed = cli(["habitat", "init", save, file], [1]).value;
    assert.equal(failed.phase, "finished"); assert.equal(failed.run_status, "fuel_exhausted");
    assert.equal(failed.tick, 0); assert.equal(failed.mission_passed, false); assert.equal(failed.remaining_fuel, 0);
    const before = journalDigest(save);
    rejected(["habitat", "advance", save, "--until", "1", "--expect-revision", "0", "--request-id", "refill"], /finished/);
    assert.equal(journalDigest(save), before);
    const bundle = cli(["habitat", "export", save]).value;
    const receipt = receiptFrom(bundle), receiptFile = path.join(run.root, "zero-fuel.receipt.json"); write(receiptFile, receipt);
    const verified = cli(["verify", receiptFile]).value;
    assert.equal(verified.verified, true); assert.equal(verified.passed, false);
    return { status: failed.run_status, work: total(failed.costs), result_hash: failed.result_hash, cold_verified: true };
  }],
  ["import-destination-preservation", () => {
    const destination = path.join(run.root, "unrelated"); fs.mkdirSync(destination);
    const sentinel = path.join(destination, "keep.txt"); fs.writeFileSync(sentinel, "Keep this unrelated file.\n", { flag: "wx" });
    const before = sha(fs.readFileSync(sentinel));
    const evidence = rejected(["habitat", "import", localOriginal, destination], /unrelated files/);
    assert.deepEqual(fs.readdirSync(destination), ["keep.txt"]); assert.equal(sha(fs.readFileSync(sentinel)), before);
    return { ...evidence, preserved_file_sha256: before };
  }],
  ["committed-import-destination-preservation", () => {
    const { save } = importCopy("existing");
    const before = journalDigest(save);
    const evidence = rejected(["habitat", "import", localOriginal, save], /cannot overwrite/);
    assert.equal(journalDigest(save), before);
    return { ...evidence, journal_hash: before };
  }],
  ["uncommitted-import-skeleton-recovery", () => {
    const destination = path.join(run.root, "interrupted-import"); fs.mkdirSync(destination);
    for (const child of ["journal", "objects", "tmp"]) fs.mkdirSync(path.join(destination, child));
    const temporary = path.join(destination, "tmp", "interrupted.part");
    fs.writeFileSync(temporary, "Unfinished marker write", { flag: "wx" });
    const before = sha(fs.readFileSync(temporary));
    const imported = cli(["habitat", "import", localOriginal, destination]).value;
    assert.equal(imported.tick, 9); assert.equal(imported.checkpoint_hash, identity(originalLast.result.value));
    assert.equal(sha(fs.readFileSync(temporary)), before);
    assert.deepEqual(cli(["habitat", "export", destination]).value, original);
    return { method: "constructed pre-marker directory skeleton; no process kill", preserved_temporary_sha256: before, checkpoint_hash: imported.checkpoint_hash };
  }],
];

assert.equal(probes.length, 12);
for (const [id, probe] of probes) {
  if (ledger.stopped || ledger.pending_call) {
    ledger.probes.push({ id, status: "unsupported", reason: "A previous accounting stop prevents further commands." });
    run.save(); continue;
  }
  assert(ledger.logical_evaluations < 12);
  ledger.logical_evaluations++;
  const row = { id, status: "running", first_call: ledger.calls.length };
  ledger.probes.push(row); ledger.pending_probe = id; run.save();
  try { row.evidence = probe(); row.status = "pass"; }
  catch (error) { row.status = "fail"; row.error = error.message; }
  row.after_call = ledger.calls.length;
  row.engine_executions = ledger.calls.slice(row.first_call, row.after_call).reduce((sum, call) => sum + (call.metrics?.engine_executions ?? 0), 0);
  ledger.pending_probe = null; run.save();
}
assert.equal(sha(fs.readFileSync(sourcePath)), sourceHash, "The supplied original bundle must remain byte-identical");
ledger.original_preserved = true;
ledger.finished = ledger.probes.every(probe => probe.status === "pass") && !ledger.stopped && !ledger.accounting_incomplete && !ledger.pending_call;
ledger.completed_at = new Date().toISOString(); run.save();
console.log(JSON.stringify({ finished: ledger.finished, logical_evaluations: ledger.logical_evaluations,
  engine_executions: ledger.engine_executions, remaining_engine_executions: 1024 - ledger.engine_executions,
  original_preserved: ledger.original_preserved, probes: ledger.probes.map(({ id, status, error, engine_executions }) => ({ id, status, error, engine_executions })) }, null, 2));
if (!ledger.finished) process.exitCode = 1;
