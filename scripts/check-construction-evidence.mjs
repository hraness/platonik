// Independent fresh admission. This file does not import frozen study helpers.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
const equal = assert.deepEqual;
const sha = value => createHash("sha256").update(value).digest("hex");
const identity = value => `sha256:${sha(JSON.stringify(value))}`;
const sum = values => values.reduce((a, b) => a + b, 0);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const prefix = "fixtures/evidence/construction-";
function local(file) {
  assert(typeof file === "string" && !path.isAbsolute(file) && !file.includes("\\"));
  assert(file.split("/").every(part => part && part !== "." && part !== "..")); return file;
}
function bytes(file, maximum = 64 * 1024 * 1024) {
  local(file); const stat = fs.lstatSync(file); assert(stat.isFile() && stat.size <= maximum);
  return fs.readFileSync(file);
}
const read = file => JSON.parse(bytes(file));
const plan = read(`${prefix}protocol.json`), freeze = read(`${prefix}freeze.json`), study = read(`${prefix}study.json`);
equal([plan.schema, freeze.schema, study.schema], ["platonik-construction-protocol-v1", "platonik-construction-freeze-v1", "platonik-construction-study-v1"]);
equal(study.protocol_sha256, sha(bytes(`${prefix}protocol.json`)));
equal(study.freeze_sha256, sha(bytes(`${prefix}freeze.json`)));
equal(study.source_digest, identity(freeze.source)); assert(digest(freeze.source.release_binary_sha256)); assert(digest(freeze.source.capacity_binary_sha256));
for (const [file, hash] of Object.entries(freeze.source.source_files_sha256)) { local(file); assert(digest(hash)); }
// Historical source identity remains visible. Exact current behavior and case
// inputs are checked below; harmless later source refactors need not be byte-identical.
equal(freeze.source.source_files_sha256[`${prefix}protocol.json`], study.protocol_sha256);
equal(plan.roles, { builder: 5, child: 3, blueprint: 50, stock: 60, courier: 1, relay: 2, valve: 30 });
const training = ["construction-one", "construction-zero", "construction-slow", "construction-crossing"];
const transfer = ["construction-rotated-one", "construction-rotated-zero", "construction-rotated-slow", "construction-rotated-crossing"];
equal(plan.training, training); equal(plan.transfer, transfer);
equal(plan.candidates.map(row => row.id), ["reference-builder", "memory-builder", "delayed-builder"]);
equal(plan.comparison_kinds, ["prebuilt", "blind-child"]);
equal(plan.control_kinds, ["no-stock", "no-acquisition", "no-activation", "idle-child", "idle-courier", "idle-relay"]);
equal(plan.budget, { qualification_attempts: 12, qualification_engine_executions: 24, study_engine_executions: 2048,
  maximum_logical_cold_runs: 52, candidate_slots: 3, maximum_segmented_replays: 4, maximum_integrity_probes: 12,
  capacity_engine_executions: 1024, fresh_admission_engine_executions: 1024 });
equal(plan.bounds, { ticks: 128, active_cells: 16, blueprints: 4, copy_bytes_per_build: 32,
  maximum_receipt_bytes: 8388608, maximum_bundle_bytes: 67108864, maximum_expanded_receipt_bytes: 268435456 });
const inventory = new Map(); let expandedTotal = 0;
assert(Object.keys(study.artifacts).length <= 1024);
for (const [file, meta] of Object.entries(study.artifacts)) {
  assert(file.startsWith(prefix) || file.startsWith("public/construction/"));
  assert(digest(meta.sha256) && integer(meta.bytes)); const raw = bytes(file);
  equal(raw.length, meta.bytes); equal(sha(raw), meta.sha256);
  if (file.endsWith(".gz")) {
    assert(integer(meta.uncompressed_bytes) && meta.uncompressed_bytes <= plan.bounds.maximum_bundle_bytes);
    assert(digest(meta.uncompressed_sha256)); equal(path.basename(file), `${meta.uncompressed_sha256}.json.gz`);
    const expanded = gunzipSync(raw, { maxOutputLength: Math.max(1, meta.uncompressed_bytes) });
    equal(expanded.length, meta.uncompressed_bytes); equal(sha(expanded), meta.uncompressed_sha256);
    if (file.startsWith(`${prefix}receipts/`)) {
      assert(meta.uncompressed_bytes <= plan.bounds.maximum_receipt_bytes);
      expandedTotal += meta.uncompressed_bytes; assert(expandedTotal <= plan.bounds.maximum_expanded_receipt_bytes);
    }
  }
  inventory.set(file, meta);
}
function artifact(file) { assert(inventory.has(file), `Unlisted artifact: ${file}`); return inventory.get(file); }
function expanded(file) {
  const meta = artifact(file), raw = bytes(file);
  return file.endsWith(".gz") ? gunzipSync(raw, { maxOutputLength: Math.max(1, meta.uncompressed_bytes) }) : raw;
}
function output(call, field = "stdout") {
  const raw = expanded(call[`${field}_file`]); equal(sha(raw), call[`${field}_sha256`]);
  return raw;
}
function metricLedger(ledger, owner, maximum) {
  equal([ledger.schema, ledger.owner, ledger.source_digest], ["platonik-construction-ledger-v1", owner, study.source_digest]);
  equal(ledger.maximum_engine_executions, maximum);
  assert(!ledger.stopped && !ledger.pending_call && !ledger.pending_operation && !ledger.accounting_incomplete);
  let consumed = 0;
  for (const [index, call] of ledger.calls.entries()) {
    equal(call.index, index); assert(integer(call.reserved_engine_executions));
    equal(call.executable, owner === "capacity" && index === 0
      ? "target/release/examples/construction_capacity" : "target/release/platonik");
    assert(consumed + call.reserved_engine_executions <= maximum);
    assert(Number.isFinite(call.elapsed_ms) && call.elapsed_ms > 0);
    assert([0, 1, 2].includes(call.exit_code)); assert(call.args.every(arg => typeof arg === "string"));
    const lines = output(call, "stderr").toString().trim().split("\n").filter(line => line.startsWith("{"));
    const metrics = lines.map(JSON.parse).filter(row => row.schema === "platonik-process-metrics-v1");
    equal(metrics.length, 1); equal(metrics[0], call.metrics);
    assert(integer(call.metrics.engine_executions) && integer(call.metrics.elapsed_micros));
    assert(call.metrics.engine_executions <= call.reserved_engine_executions);
    output(call); consumed += call.metrics.engine_executions;
  }
  equal(ledger.engine_executions, consumed); assert(consumed <= maximum);
}
metricLedger(study.ledger, "construction", 2048); metricLedger(study.capacity, "capacity", 1024);
// The failed harness assertion did not undo six successful CLI calls. Bind
// their retained source/ledger exactly and admit their results in replayCheck.
const repairStem = `${prefix}repairs/import-envelope`;
equal(study.ledger.harness_repairs?.length, 1);
const repairLink = study.ledger.harness_repairs[0]; equal(repairLink.file, `${repairStem}/repair.json`);
artifact(repairLink.file); equal(sha(bytes(repairLink.file)), repairLink.sha256);
const repair = read(repairLink.file);
equal(repair.schema, "platonik-construction-harness-repair-v1"); equal(repair.freeze_sha256, study.freeze_sha256);
equal([repair.first_call, repair.after_call, repair.engine_executions, repair.retained_prefix_engine_executions, repair.remaining_engine_executions], [104, 110, 166, 62, 1882]);
equal(repair.resume_from, { replay: "keeper-born", tick: 8, next_tick: 16, save: "keeper-born/restored-8" });
equal(repair.interrupted_ledger_file, `${repairStem}/interrupted-ledger.json`); artifact(repair.interrupted_ledger_file);
equal(sha(bytes(repair.interrupted_ledger_file)), repair.interrupted_ledger_sha256);
const interrupted = read(repair.interrupted_ledger_file);
equal(interrupted.engine_executions, 166); equal(interrupted.calls.length, 110); equal(interrupted.pending_operation, "replays");
assert(!interrupted.pending_call && !interrupted.stopped && !interrupted.finished && !interrupted.harness_repairs);
equal(sum(interrupted.calls.slice(104).map(call => call.metrics.engine_executions)), 62);
equal(study.ledger.calls.slice(0, 110).map(({ stdout_file, stderr_file, ...original }) => original), interrupted.calls);
for (const field of ["reference", "candidates", "selected", "confirmation", "comparisons", "controls"])
  equal(JSON.parse(JSON.stringify(study.ledger[field], (key, value) => ["receipt_file", "source_file"].includes(key) ? undefined : value)), interrupted[field]);
equal(repair.script_file, "scripts/construction/repair-import-envelope.mjs");
artifact(`${repairStem}/repair-script.mjs`); equal(sha(bytes(`${repairStem}/repair-script.mjs`)), repair.script_sha256);
equal(repair.changes.map(row => row.file), ["scripts/construction/common.mjs", "scripts/construction/trajectory.mjs"]);
for (const [index, row] of repair.changes.entries()) {
  const name = ["common", "trajectory"][index];
  equal([row.before_file, row.after_file], [`${repairStem}/${name}.before.mjs`, `${repairStem}/${name}.after.mjs`]);
  artifact(row.before_file); artifact(row.after_file);
  equal(sha(bytes(row.before_file)), row.before_sha256); equal(sha(bytes(row.after_file)), row.after_sha256);
  equal(freeze.source.source_files_sha256[row.file], row.before_sha256); assert(row.before_sha256 !== row.after_sha256);
}
const interruptedAdvance = JSON.parse(output(study.ledger.calls[107])), interruptedImport = JSON.parse(output(study.ledger.calls[109]));
equal(interruptedAdvance.request_id, "leg-8"); equal(interruptedImport.request_id, null);
equal(interruptedImport, { ...interruptedAdvance, request_id: null });
const temporary = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "platonik-construction-check-"));
const binary = path.resolve(process.env.PLATONIK_CLI ?? "target/debug/platonik");
let executions = 0;
function cli(args, accepted = 0, reservation = 64) {
  assert(executions + reservation <= 1024, "Fresh admission execution allowance");
  const result = spawnSync(binary, ["--metrics", ...args], { encoding: "utf8", timeout: 60_000, maxBuffer: 70 * 1024 * 1024 });
  if (result.error) throw result.error;
  const metrics = result.stderr.trim().split("\n").filter(Boolean).map(JSON.parse)
    .filter(row => row.schema === "platonik-process-metrics-v1");
  equal(metrics.length, 1); assert(integer(metrics[0].engine_executions) && metrics[0].engine_executions <= reservation);
  executions += metrics[0].engine_executions;
  equal(result.status, accepted, `Fresh ${args.slice(0, 2).join(" ")}: ${result.stderr.slice(0, 500)}`);
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}
const verification = receipt => ({ schema: "platonik-verification-v1", verified: true, passed: receipt.result.outcome.passed,
  protocol: receipt.protocol, experiment_hash: receipt.experiment_hash, result_hash: receipt.result_hash,
  ticks_completed: receipt.result.ticks_completed, work: sum(Object.values(receipt.result.costs)) });
const cache = new Map(), visited = new Set();
function checked(file) {
  const raw = expanded(file), hash = sha(raw); visited.add(file);
  assert(raw.length <= plan.bounds.maximum_receipt_bytes);
  if (cache.has(hash)) return cache.get(hash);
  const receipt = JSON.parse(raw); equal([receipt.schema, receipt.protocol], ["platonik-receipt-v1", "platonik-habitat-v3"]);
  equal(receipt.experiment_hash, identity(receipt.experiment)); equal(receipt.result_hash, identity(receipt.result));
  const input = path.join(temporary, `${hash}.json`); fs.writeFileSync(input, raw, { flag: "wx" });
  equal(cli(["verify", input], 0, 2), verification(receipt)); cache.set(hash, receipt); return receipt;
}
const idle = () => ({ rules: [{ when: [], action: { kind: "wait" }, remember: null }] });
const cases = new Map();
function expectedCase(world, program, kind) {
  const result = structuredClone(world), parent = result.cells.find(cell => cell.id === 5);
  parent.program = structuredClone(program); const blueprint = result.construction.blueprints[0];
  if (kind === "prebuilt") {
    result.cells.push(structuredClone(blueprint.body.cell)); result.cells.sort((a, b) => a.id - b.id);
    result.links.push(...structuredClone(blueprint.body.links)); result.links.sort((a, b) => a.id - b.id);
    parent.program = idle(); delete result.construction;
  } else if (kind === "blind-child") blueprint.body.cell.program = { rules: [
    { when: [{ kind: "memory", slot: 0, value: 0 }], action: { kind: "route", valve: 30, bit: { kind: "constant", value: false } }, remember: { slot: 0, value: 1 } },
    { when: [], action: { kind: "route", valve: 30, bit: { kind: "constant", value: true } }, remember: { slot: 0, value: 0 } },
  ] };
  else if (kind === "no-stock") result.construction.stocks.forEach(stock => { stock.units = []; });
  else if (kind === "no-acquisition" || kind === "no-activation") {
    for (const rule of parent.program.rules) if (rule.action.kind === (kind === "no-acquisition" ? "gather_material" : "activate")) {
      rule.action = { kind: "wait" }; rule.remember = null;
    }
  } else if (kind === "idle-child") blueprint.body.cell.program = idle();
  else if (kind === "idle-courier" || kind === "idle-relay") result.cells.find(cell => cell.id === (kind === "idle-courier" ? 1 : 2)).program = idle();
  else assert(["reference", "candidate", "selected"].includes(kind));
  return result;
}
// Independent causal projection: a report-guided delivery must read the exact
// slot with retained physical-spark provenance, rather than merely follow a read.
function outcomes(receipt) {
  const result = receipt.result, birth = result.final_state.construction?.births.find(item => item.parent === 5 && item.blueprint === 50);
  const ticks = kind => result.frames.filter(frame => frame.activations.some(a => a.cell === 5 && a.success && a.action.kind === kind)).map(frame => frame.tick);
  const construction = Boolean(birth && ticks("gather_material").some(t => t < birth.tick) && ticks("build").some(t => t < birth.tick)
    && ticks("activate").includes(birth.tick) && !result.frames.some(frame => frame.tick <= birth.tick && frame.activations.some(a => a.cell === 3)));
  const arrived = new Set(), consumed = new Set(), routes = new Set(), guided = new Set();
  let prior;
  for (const frame of result.frames) {
    for (const event of frame.signals) if (event.signal.to_cell === 3 && event.signal.receipt_spark != null) {
      if (event.outcome === "delivered") arrived.add(event.signal.receipt_spark);
      if (event.outcome === "consumed" && frame.activations.some(a => a.cell === 3 && a.success && a.action.kind === "take_message" && a.action.port === event.signal.to_port)) consumed.add(event.signal.receipt_spark);
    }
    const actions = frame.activations.filter(a => a.success && a.action.kind === "route");
    assert(actions.every(a => a.cell === 3));
    const delivered = frame.state.delivered.filter(item => item.tick === frame.tick);
    if (actions.length === 1 && delivered.length === 1) {
      const id = delivered[0].spark.id, bit = delivered[0].spark.bit, source = actions[0].action.bit;
      routes.add(id);
      if (source.kind === "memory" && prior?.evidence[source.slot] === id && (prior.memory[source.slot] !== 0) === bit && arrived.has(id) && consumed.has(id)) guided.add(id);
    }
    prior = frame.state.cells.find(cell => cell.id === 3);
  }
  const inactive_ready = Boolean(result.final_state.construction?.assemblies.some(assembly => {
    const spec = receipt.experiment.construction?.blueprints.find(item => item.id === assembly.blueprint);
    return spec && Buffer.from(assembly.copied).equals(Buffer.from(JSON.stringify(spec.body)))
      && JSON.stringify(assembly.wired) === JSON.stringify(spec.body.links);
  }));
  return { inactive_ready, passed: result.outcome.passed, construction_passed: construction, useful_child: routes.size > 0,
    report_used: guided.size > 0, milestone_passed: result.status === "complete" && result.outcome.passed && construction && routes.size > 0,
    birth_tick: birth?.tick ?? null, delivered: result.final_state.delivered.length,
    child_routed_sparks: [...routes].sort((a, b) => a - b), report_guided_sparks: [...guided].sort((a, b) => a - b),
    reported_and_read_sparks: [...consumed].filter(id => arrived.has(id)).sort((a, b) => a - b) };
}
function expectedProbe(sourceReceipt, sourceBundle, id) {
  if (["forged-checkpoint-material", "foreign-future-fuel", "foreign-blueprint"].includes(id)) {
    const bundle = structuredClone(sourceBundle);
    const events = bundle.entries.map(entry => structuredClone(bundle.objects[entry.event.event_hash]));
    const checkpoint = events.at(-1).result.value; equal(events.at(-1).result.kind, "paused");
    if (id === "forged-checkpoint-material") checkpoint.frames.at(-1).state.cells.find(cell => cell.id === 5).material = 1001;
    if (id === "foreign-future-fuel") checkpoint.experiment.fuel += 1;
    if (id === "foreign-blueprint") checkpoint.experiment.construction.blueprints[0].body.cell.memory[0] ^= 1;
    checkpoint.experiment_hash = identity(checkpoint.experiment); checkpoint.prefix_hash = identity(checkpoint.frames);
    bundle.objects = {};
    for (const [index, entry] of bundle.entries.entries()) {
      entry.event.event_hash = identity(events[index]);
      entry.previous_hash = index ? identity(bundle.entries[index - 1]) : null;
      bundle.objects[entry.event.event_hash] = events[index];
    }
    return bundle;
  }
  const receipt = structuredClone(sourceReceipt), frames = receipt.result.frames;
  const body = receipt.experiment.construction.blueprints[0].body, bodyBytes = Buffer.from(JSON.stringify(body));
  const partial = frames.find(frame => frame.state.construction?.assemblies.some(a => a.copied.length > 0 && a.copied.length < bodyBytes.length));
  assert(partial); const assembly = partial.state.construction.assemblies[0];
  const born = frames.find(frame => frame.state.construction?.births.length); assert(born);
  if (id === "duplicate-material") partial.state.construction.stocks[0].units.push(assembly.material);
  else if (id === "changed-copy-byte") assembly.copied[0] ^= 1;
  else if (id === "skipped-copy-work") assembly.copied.push(bodyBytes[assembly.copied.length]);
  else if (id === "stolen-reservation") assembly.parent = 1;
  else if (id === "premature-wire") assembly.wired.push(structuredClone(body.links[0]));
  else if (id === "earlier-birth") born.state.construction.births[0].tick -= 1;
  else if (id === "changed-child-program") born.state.construction.births[0].body.cell.program = idle();
  else if (id === "refunded-copying") {
    partial.costs.copying -= 1;
    partial.activations.find(a => a.cell === 5 && a.success && a.action.kind === "build").work_after -= 1;
  } else if (id === "same-tick-child-activation") {
    const later = frames.find(frame => frame.tick > born.tick && frame.activations.some(a => a.cell === 3));
    born.activations.push(structuredClone(later.activations.find(a => a.cell === 3)));
  } else throw new Error(`Unrecognized declared probe ${id}`);
  receipt.result_hash = identity(receipt.result); return receipt;
}
function rowCheck(row, program) {
  assert(cases.has(row.case_id)); const receipt = checked(row.receipt_file);
  equal(receipt.experiment, expectedCase(cases.get(row.case_id), program, row.kind));
  equal(row.receipt_sha256, artifact(row.receipt_file).uncompressed_sha256);
  equal(row.experiment_hash, receipt.experiment_hash); equal(row.result_hash, receipt.result_hash);
  equal(row.status, receipt.result.status); equal(row.ticks, receipt.result.ticks_completed);
  equal(row.work, sum(Object.values(receipt.result.costs)));
  for (const [key, value] of Object.entries(outcomes(receipt))) equal(row[key], value);
  return receipt;
}
const ledger = study.ledger;
function coldCalls(row, receipt, offset) {
  equal([row.first_call, row.last_call], [offset, offset + 1]);
  const first = ledger.calls[offset], last = ledger.calls[offset + 1];
  equal(first.args, ["run", `${row.id}/experiment.json`]); equal(last.args, ["verify", `${row.id}/receipt.json`]);
  equal([first.metrics.engine_executions, last.metrics.engine_executions], [1, 1]);
  equal([first.exit_code, last.exit_code], [row.passed ? 0 : 1, 0]);
  equal(JSON.parse(output(first)), receipt); equal(JSON.parse(output(last)), verification(receipt));
  return offset + 2;
}
function checkpoint(receipt, tick) {
  const frames = receipt.result.frames.filter(frame => frame.tick <= tick);
  return { schema: "platonik-checkpoint-v1", experiment_hash: receipt.experiment_hash, prefix_hash: identity(frames), experiment: receipt.experiment, frames };
}
function bundleCheck(bundle, receipt, cuts) {
  equal(bundle.schema, "platonik-habitat-bundle-v1"); equal(bundle.entries.length, 1 + 2 * cuts.length);
  const event = entry => bundle.objects[entry.event.event_hash];
  equal(event(bundle.entries[0]), { kind: "initialized", experiment: receipt.experiment, result: { kind: "paused", value: checkpoint(receipt, 0) } });
  const referenced = new Set();
  for (const [index, entry] of bundle.entries.entries()) {
    equal(entry.schema, "platonik-habitat-journal-v1"); equal(entry.revision, index);
    equal(entry.previous_hash, index ? identity(bundle.entries[index - 1]) : null);
    equal(entry.event.event_hash, identity(event(entry))); referenced.add(entry.event.event_hash);
  }
  equal(Object.keys(bundle.objects).sort(), [...referenced].sort());
  for (const [index, tick] of cuts.entries()) {
    const start = bundle.entries[1 + index * 2], end = bundle.entries[2 + index * 2];
    const previousTick = cuts[index - 1] ?? 0;
    const previousResult = { kind: "paused", value: checkpoint(receipt, previousTick) };
    equal(event(start), { kind: "started", until: tick, from_hash: identity(previousResult),
      reserved_work: receipt.experiment.fuel - sum(Object.values(receipt.result.frames[previousTick].costs)) });
    for (const entry of [start, end]) {
      equal(entry.event.request_id, `leg-${tick}`); equal(entry.event.expected_revision, index * 2);
      equal(entry.event.command_hash, identity({ until: tick }));
    }
    equal(event(end), { kind: "completed", result: tick === receipt.experiment.ticks
      ? { kind: "finished", value: receipt.result } : { kind: "paused", value: checkpoint(receipt, tick) } });
  }
}
function reportCheck(report, receipt, tick, advances) {
  equal([report.pending_request_id, report.pending_until, report.pending_reserved_work], [null, null, 0]);
  const frame = receipt.result.frames[tick]; equal(report.tick, tick); equal(report.revision, advances * 2); equal(report.advances, advances);
  equal(report.experiment_hash, receipt.experiment_hash); equal(report.current_state, frame.state); equal(report.costs, frame.costs);
  equal(report.remaining_fuel, receipt.experiment.fuel - sum(Object.values(frame.costs)));
  equal(report.phase, tick === receipt.experiment.ticks ? "finished" : "paused");
  equal(report.result_hash, tick === receipt.experiment.ticks ? receipt.result_hash : null);
  equal(report.checkpoint_hash, tick === receipt.experiment.ticks ? null : identity(checkpoint(receipt, tick)));
}
function spoolBundle(file) {
  const raw = expanded(file), target = path.join(temporary, `bundle-${sha(raw)}.json`);
  if (!fs.existsSync(target)) fs.writeFileSync(target, raw, { flag: "wx" });
  return target;
}
function replayCheck(row, spec, receipt, offset, owner = ledger) {
  equal(row.first_call, offset); equal(row.checkpoints.map(item => item.tick), spec.cuts);
  equal(row.restorations.map(item => item.tick), spec.restore_ticks); assert(row.uninterrupted_equal && row.restored_equal);
  let save = `${row.id}/save`, revision = 0;
  const take = args => { const call = owner.calls[offset++]; equal(call.args, args); assert([0, 1].includes(call.exit_code)); return JSON.parse(output(call)); };
  reportCheck(take(["habitat", "init", save, `${row.id}/experiment.json`]), receipt, 0, 0);
  for (const [index, tick] of spec.cuts.entries()) {
    const report = take(["habitat", "advance", save, "--until", String(tick), "--expect-revision", String(revision), "--request-id", `leg-${tick}`]);
    revision += 2; reportCheck(report, receipt, tick, index + 1);
    const cut = row.checkpoints[index], frame = receipt.result.frames[tick];
    equal(cut.state_hash, identity(frame.state)); equal(cut.costs_hash, identity(frame.costs));
    equal(cut.costs, frame.costs); equal(cut.revision, revision); equal(cut.phase, report.phase);
    equal(cut.remaining_fuel, report.remaining_fuel); equal(cut.checkpoint_hash, report.checkpoint_hash); equal(cut.result_hash, report.result_hash);
    if (spec.restore_ticks.includes(tick)) {
      const bundle = take(["habitat", "export", save]); bundleCheck(bundle, receipt, spec.cuts.slice(0, index + 1));
      const restoration = row.restorations.find(item => item.tick === tick);
      equal(JSON.parse(expanded(restoration.bundle_file)), bundle); equal(sha(expanded(restoration.bundle_file)), restoration.bundle_sha256);
      save = `${row.id}/restored-${tick}`;
      const restored = take(["habitat", "import", `${row.id}/at-${tick}.bundle.json`, save]);
      equal(report.request_id, `leg-${tick}`); equal(restored.request_id, null);
      equal(restored, { ...report, request_id: null });
      const destination = path.join(temporary, `${row.id}-at-${tick}`);
      const imported = cli(["habitat", "import", spoolBundle(restoration.bundle_file), destination]);
      equal(cli(["habitat", "verify", destination]), imported); reportCheck(imported, receipt, tick, index + 1);
      equal(restoration.checkpoint_hash, report.checkpoint_hash); equal(restoration.state_hash, cut.state_hash); equal(restoration.costs_hash, cut.costs_hash); assert(restoration.equal);
    }
  }
  const bundle = take(["habitat", "export", save]); bundleCheck(bundle, receipt, spec.cuts);
  equal(JSON.parse(expanded(row.bundle_file)), bundle); equal(sha(expanded(row.bundle_file)), row.bundle_sha256);
  equal(take(["verify", `${row.id}/receipt.json`]), verification(receipt)); equal(row.after_call, offset);
  const destination = path.join(temporary, `${row.id}-final`);
  const imported = cli(["habitat", "import", spoolBundle(row.bundle_file), destination]);
  equal(cli(["habitat", "verify", destination]), imported); reportCheck(imported, receipt, receipt.experiment.ticks, 8);
  equal(imported.mission_passed, receipt.result.outcome.passed);
  return offset;
}

try {
  equal(plan.cases.map(row => row.id), [...training, ...transfer]);
  for (const item of plan.cases) {
    equal(item.file, `${prefix}cases/${item.id}.json`); artifact(item.file); equal(sha(bytes(item.file)), item.sha256);
    equal(freeze.source.source_files_sha256[item.file], item.sha256);
    const world = read(item.file); equal(cli(["habitat", "case", item.id], 0, 0), world);
    equal([world.version, world.ticks, world.cells.length, world.construction.blueprints.length], [3, 128, 4, 1]);
    equal(world.construction.blueprints[0].id, 50); equal(world.construction.blueprints[0].body.cell.id, 3);
    assert(!world.cells.some(cell => cell.id === 3)); cases.set(item.id, world);
  }
  equal(new Set([...cases.values()].map(identity)).size, 8);
  for (const source of plan.ancestry_sources) {
    equal(sha(bytes(source.file)), source.sha256); equal(freeze.source.source_files_sha256[source.file], source.sha256);
  }
  const oldCourier = read(plan.ancestry_sources[0].file), oldKeeper = read(plan.ancestry_sources[1].file).cells.find(cell => cell.id === 3).program;
  for (const world of cases.values()) {
    equal(world.cells.find(cell => cell.id === 1).program, oldCourier);
    equal(world.construction.blueprints[0].body.cell.program, oldKeeper);
  }
  const qualification = read(plan.qualification_file); artifact(plan.qualification_file);
  equal(sha(bytes(plan.qualification_file)), freeze.qualification_sha256);
  assert(!qualification.pending && qualification.attempts.length <= 12);
  let qualificationExecutions = 0;
  for (const attempt of qualification.attempts) {
    for (const call of attempt.calls) {
      assert(integer(call.metrics?.engine_executions) && integer(call.metrics?.elapsed_micros));
      const stderr = bytes(`${qualification.packet_directory}/${call.stderr}`).toString();
      const actualMetrics = stderr.trim().split("\n").filter(Boolean).map(JSON.parse)
        .filter(row => row.schema === "platonik-process-metrics-v1");
      equal(actualMetrics, [call.metrics]); qualificationExecutions += call.metrics.engine_executions;
      for (const field of ["stdout", "stderr"]) {
        const file = `${qualification.packet_directory}/${call[field]}`; artifact(file); equal(sha(bytes(file)), call[`${field}_sha256`]);
      }
    }
    if (attempt.receipt_file) {
      const file = `${qualification.packet_directory}/${attempt.receipt_file}`, receipt = checked(file);
      equal(receipt.experiment_hash, attempt.experiment_hash); equal(receipt.result_hash, attempt.result_hash);
      equal(attempt.passed, receipt.result.outcome.passed); equal(attempt.work, sum(Object.values(receipt.result.costs)));
    }
  }
  equal(qualificationExecutions, qualification.engine_executions); equal(qualificationExecutions, freeze.qualification_engine_executions); assert(qualificationExecutions <= 24);
  let offset = 0;
  const reference = cases.get(training[0]).cells.find(cell => cell.id === 5).program;
  equal(ledger.reference.map(row => row.case_id), [...training, ...transfer]);
  for (const row of ledger.reference) { equal(row.kind, "reference"); offset = coldCalls(row, rowCheck(row, reference), offset); }
  equal(ledger.candidates.length, 3);
  for (const [index, candidate] of ledger.candidates.entries()) {
    const declared = plan.candidates[index]; equal(candidate.id, declared.id); equal(candidate.sequence, index + 1); equal(candidate.first_call, offset);
    equal(declared.source_file, `${prefix}submissions/${declared.id}.json`); artifact(declared.source_file);
    equal(sha(bytes(declared.source_file)), declared.source_sha256);
    assert(["completed", "rejected", "partial"].includes(candidate.admission));
    if (!candidate.source_file) {
      equal(candidate.admission, "rejected"); equal(candidate.trials, []); equal(candidate.passed, false);
      equal(candidate.after_call, offset);
      assert(candidate.input_unavailable || candidate.source_sha256 !== declared.source_sha256);
      continue;
    }
    equal(candidate.source_sha256, declared.source_sha256); equal(candidate.source_file, declared.source_file);
    let program;
    try { program = read(candidate.source_file); } catch {
      equal(candidate.admission, "rejected"); equal(candidate.trials, []); equal(candidate.passed, false); equal(candidate.after_call, offset); continue;
    }
    assert(candidate.trials.length <= 4);
    equal(candidate.trials.map(row => row.case_id), training.slice(0, candidate.trials.length));
    for (const row of candidate.trials) { equal(row.kind, "candidate"); offset = coldCalls(row, rowCheck(row, program), offset); }
    if (candidate.admission === "completed") {
      equal(candidate.trials.length, 4); equal(candidate.program, program);
      equal(candidate.passed, candidate.trials.every(row => row.milestone_passed));
      equal(candidate.work, sum(candidate.trials.map(row => row.work))); equal(candidate.program_bytes, Buffer.byteLength(JSON.stringify(program)));
    } else {
      equal(candidate.passed, false); assert(candidate.trials.length < 4);
      if (candidate.after_call > offset) {
        equal(candidate.after_call, offset + 1);
        const rejected = ledger.calls[offset++]; equal(rejected.exit_code, 2);
        equal(rejected.args, ["run", `c${index + 1}-${training[candidate.trials.length]}/experiment.json`]);
      }
    }
    equal(candidate.after_call, offset);
  }
  const best = ledger.candidates.filter(row => row.passed).sort((a, b) => a.work - b.work || a.program_bytes - b.program_bytes || a.sequence - b.sequence)[0];
  if (!best) {
    equal(ledger.selected, null); equal(ledger.finished.construction_gate, false);
    equal(ledger.finished.logical_cold_runs, ledger.calls.filter(call => call.args[0] === "run").length);
    for (const field of ["confirmation", "comparisons", "controls", "replays", "probes"]) equal(ledger[field], []);
    equal(ledger.calls.length, offset);
  } else {
    equal(ledger.selected, { id: best.id, sequence: best.sequence, program: best.program, program_hash: identity(best.program), training_work: best.work, after_call: offset });
    equal(ledger.confirmation.map(row => row.case_id), transfer);
    for (const row of ledger.confirmation) { equal(row.kind, "selected"); offset = coldCalls(row, rowCheck(row, best.program), offset); }
    equal(ledger.comparisons.map(row => [row.kind, row.case_id]), plan.comparison_kinds.flatMap(kind => [...training, ...transfer].map(id => [kind, id])));
    equal(ledger.controls.map(row => [row.kind, row.case_id]), plan.control_kinds.flatMap(kind => training.slice(0, 2).map(id => [kind, id])));
    for (const row of [...ledger.comparisons, ...ledger.controls]) offset = coldCalls(row, rowCheck(row, best.program), offset);
    equal(ledger.replays.length, 4); const replayReceipts = new Map();
    for (const [index, row] of ledger.replays.entries()) {
      const spec = plan.replays[index]; equal([row.id, row.case_id, row.kind], [spec.id, spec.case_id, spec.kind]);
      const receipt = rowCheck(row, best.program); offset = replayCheck(row, spec, receipt, offset); replayReceipts.set(row.id, receipt);
    }
    // Probe bindings and fresh rejection checks follow below.
    const probeIds = ["duplicate-material", "changed-copy-byte", "skipped-copy-work", "stolen-reservation", "premature-wire", "earlier-birth", "changed-child-program", "refunded-copying", "same-tick-child-activation", "forged-checkpoint-material", "foreign-future-fuel", "foreign-blueprint"];
    equal(ledger.probes.map(row => row.id), probeIds);
    const probeReceipt = replayReceipts.get(ledger.replays[0].id);
    const probeBundle = JSON.parse(expanded(ledger.replays[0].restorations[0].bundle_file));
    for (const [index, row] of ledger.probes.entries()) {
      equal(row.first_call, offset); equal(row.after_call, offset + 1); equal(row.status, "pass"); assert(row.rejected);
      equal(row.type, index < 9 ? "receipt" : "bundle");
      const raw = expanded(row.input_file); equal(sha(raw), row.input_sha256);
      equal(JSON.parse(raw), expectedProbe(probeReceipt, probeBundle, row.id), "The declared forgery, not an easier malformed substitute");
      const call = ledger.calls[offset++]; equal(call.exit_code, 2); equal(row.engine_executions, call.metrics.engine_executions);
      const expectedArgs = row.type === "receipt" ? ["verify", `probe-${row.id}.json`]
        : ["habitat", "import", `probe-${row.id}.json`, `rejected-${row.id}`]; equal(call.args, expectedArgs);
      const file = path.join(temporary, `probe-${row.id}.json`); fs.writeFileSync(file, raw, { flag: "wx" });
      const target = path.join(temporary, `probe-save-${index}`);
      cli(row.type === "receipt" ? ["verify", file] : ["habitat", "import", file, target], 2);
      assert(!fs.existsSync(target));
    }
    equal(offset, ledger.calls.length);
    equal(ledger.finished.logical_cold_runs, ledger.calls.filter(call => call.args[0] === "run").length);
    assert(ledger.finished.logical_cold_runs <= 52);
    const controls = kind => ledger.controls.filter(row => row.kind === kind);
    const allControls = (kind, predicate) => controls(kind).length === 2 && controls(kind).every(row => row.status === "complete" && predicate(row));
    const removals = {
      material_required: ["no-stock", "no-acquisition"].every(kind => allControls(kind, row => row.birth_tick === null && !row.construction_passed)),
      activation_required: allControls("no-activation", row => row.inactive_ready && row.birth_tick === null && !row.useful_child),
      child_policy_required: allControls("idle-child", row => row.construction_passed && !row.useful_child && !row.passed),
      courier_causal: allControls("idle-courier", row => !row.passed), relay_causal: allControls("idle-relay", row => !row.passed),
    };
    equal(ledger.finished.removal_findings, removals); equal(ledger.finished.causal_reuse, removals.courier_causal && removals.relay_causal);
    const referencePasses = ledger.reference.every(row => row.milestone_passed && row.report_used);
    equal(ledger.finished.reference_report_path, referencePasses); equal(ledger.finished.all_saved_traces_equal, true); equal(ledger.finished.integrity_probes, true);
    equal(ledger.finished.construction_gate, referencePasses && ledger.confirmation.every(row => row.milestone_passed));
    const site = read("public/construction/index.json"); artifact("public/construction/index.json"); equal(site.schema, "platonik-continuous-site-v1");
    equal(site.cases.map(row => row.id), ledger.replays.map(row => row.id));
    for (const item of site.cases) {
      const receipt = replayReceipts.get(item.id), row = ledger.replays.find(row => row.id === item.id);
      artifact(`public/construction/${item.id}.experiment.json`); equal(read(`public/construction/${item.id}.experiment.json`), receipt.experiment);
      equal(checked(`public/construction/${item.id}.receipt.json`), receipt);
      equal(item.passed, receipt.result.outcome.passed); equal(item.result_hash, receipt.result_hash); equal(item.work, row.work); equal(item.ticks, 128);
      equal(item.construction_passed, row.construction_passed); equal(item.milestone_passed, row.milestone_passed);
      assert(item.uninterrupted_equal && item.restored_equal);
      equal(item.cuts.map(({ tick, state_hash, costs_hash }) => ({ tick, state_hash, costs_hash })), row.checkpoints.map(({ tick, state_hash, costs_hash }) => ({ tick, state_hash, costs_hash })));
      for (const cut of item.cuts) {
        const frame = receipt.result.frames[cut.tick], state = frame.state.construction, assembly = state?.assemblies[0];
        equal(cut.detail, `${assembly?.copied.length ?? 0} bytes in partial assembly; ${assembly?.wired.length ?? 0} inactive links; ${state?.births.length ?? 0} children born. ${frame.state.delivered.length} sparks delivered; ${sum(Object.values(frame.costs))} modeled work.`);
      }
    }
  }
  const capacity = study.capacity; assert(capacity.finished); equal(capacity.benchmark_binary_sha256, freeze.source.capacity_binary_sha256); artifact(capacity.measurement_file);
  equal(sha(bytes(capacity.measurement_file)), capacity.measurement_sha256); const measured = read(capacity.measurement_file);
  equal(measured.schema, "platonik-construction-capacity-v1");
  equal(JSON.parse(output(capacity.calls[0])), measured); equal(capacity.calls[0].args, ["--measure"]);
  equal(measured.engine_executions, capacity.calls[0].metrics.engine_executions); equal(measured.engine_executions, 124);
  equal(measured.workloads.length, 2);
  equal(measured.workloads.map(row => row.id), ["four-near-cap-partial", "four-born-sixteen-live"]);
  const rssMatch = output(capacity.calls[0], "stderr").toString().match(/\b(\d+)\s+maximum resident set size/); assert(rssMatch);
  equal(Number(rssMatch[1]), capacity.peak_rss_bytes);
  let capacityOffset = 1; equal(capacity.replays.length, 2);
  for (const [workloadIndex, workload] of measured.workloads.entries()) {
    assert(/^sha256:[a-f0-9]{64}$/.test(workload.experiment_hash)); equal(workload.samples.length, 30);
    const world = workload.experiment, construction = world.construction;
    equal([world.version, world.ticks, world.cells.length, construction.blueprints.length], [3, 128, 12, 4]);
    equal(world.cells.length + construction.blueprints.length, 16);
    equal(world.links.length + sum(construction.blueprints.map(row => row.body.links.length)), 32);
    equal(sum(construction.stocks.map(stock => stock.units.length)), 32);
    if (workloadIndex === 0) assert(construction.blueprints.every(row => {
      const size = Buffer.byteLength(JSON.stringify(row.body)); return size >= 4065 && size <= 4096;
    }));
    const input = path.join(temporary, `capacity-${workload.id}.json`); fs.writeFileSync(input, JSON.stringify(workload.experiment), { flag: "wx" });
    // These stress missions may honestly fail service while exercising valid work.
    assert(executions + 1 <= 1024, "Reserve capacity recomputation before launch");
    const runResult = spawnSync(binary, ["--metrics", "run", input], { encoding: "utf8", timeout: 60_000, maxBuffer: 70 * 1024 * 1024 });
    assert([0, 1].includes(runResult.status) && !runResult.error);
    const metrics = runResult.stderr.trim().split("\n").map(JSON.parse).filter(row => row.schema === "platonik-process-metrics-v1");
    equal(metrics.length, 1); equal(metrics[0].engine_executions, 1); executions += 1; assert(executions <= 1024);
    const receipt = JSON.parse(runResult.stdout), receiptFile = path.join(temporary, `capacity-${workload.id}.receipt.json`);
    fs.writeFileSync(receiptFile, JSON.stringify(receipt), { flag: "wx" }); equal(cli(["verify", receiptFile], 0, 2), verification(receipt));
    equal(receipt.experiment, workload.experiment); equal(receipt.experiment_hash, workload.experiment_hash);
    equal(receipt.result.status, "complete"); equal(receipt.result.ticks_completed, 128);
    const final = receipt.result.final_state;
    equal(final.construction.births.length, workloadIndex === 0 ? 0 : 4);
    equal(final.cells.length, workloadIndex === 0 ? 12 : 16);
    equal(final.construction.assemblies.length, workloadIndex === 0 ? 4 : 0);
    if (workloadIndex === 0) assert(final.construction.assemblies.every(row => row.copied.length > 4000));
    else {
      equal(final.links.length, 32);
      assert(receipt.result.frames.some(frame => frame.state.pending.length === 128), "Queue limit reached by the declared all-born workload");
    }
    for (const sample of [workload.warmup, ...workload.samples]) {
      equal(sample.result_hash, receipt.result_hash); equal(sample.engine_executions, 2);
      equal(sample.receipt_bytes, Buffer.byteLength(JSON.stringify(receipt)));
      for (const key of ["receipt_ms", "serialize_ms", "verify_ms", "total_ms"]) assert(Number.isFinite(sample[key]) && sample[key] >= 0);
      assert(sample.total_ms >= sample.receipt_ms + sample.serialize_ms + sample.verify_ms - 0.001);
      const rss = sample.rss_after_release; equal(rss.source, "ps RSS in KiB"); assert(typeof rss.platform === "string");
      if (rss.bytes === null) assert(typeof rss.error === "string" && rss.error.length > 0);
      else { assert(integer(rss.bytes) && rss.bytes > 0); equal(rss.error, null); equal(rss.platform, "macos"); }
    }
    const replay = capacity.replays[workloadIndex]; equal(replay.id, `capacity-${workload.id}`);
    const recorded = checked(replay.receipt_file); equal(recorded, receipt);
    capacityOffset = replayCheck(replay, { cuts: [1, 2, 8, 16, 32, 64, 96, 128], restore_ticks: [8, 64] }, recorded, capacityOffset, capacity);
    equal(replay.saved_verification_call, capacityOffset);
    const savedCall = capacity.calls[capacityOffset++];
    equal(savedCall.args, ["habitat", "verify", `${replay.id}/restored-64`]); equal(savedCall.exit_code, 0);
    reportCheck(JSON.parse(output(savedCall)), recorded, 128, 8);
    equal(replay.saved_verification_ms, savedCall.elapsed_ms);
    const rss = output(savedCall, "stderr").toString().match(/\b(\d+)\s+maximum resident set size/); assert(rss);
    equal(replay.saved_verification_peak_rss_bytes, Number(rss[1]));
    const times = workload.samples.map(row => row.total_ms).sort((a, b) => a - b);
    equal(workload.p50_ms, times[14]); equal(workload.p95_ms, times[28]);
  }
  equal(capacityOffset, capacity.calls.length);
  for (const file of inventory.keys()) if (file.startsWith(`${prefix}receipts/`) || /^public\/construction\/.*\.receipt\.json$/.test(file)) assert(visited.has(file), `Unattached receipt ${file}`);
  console.log(`Checked construction: ${ledger.finished.logical_cold_runs} cold attempts, ${cache.size} distinct receipt streams, ${executions} fresh admission executions; study ${ledger.engine_executions}, qualification ${qualificationExecutions}, capacity ${capacity.engine_executions}; milestone ${ledger.finished.construction_gate}.`);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
