import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { read, sha, identity, binary } from "./runner.mjs";
import { write, total } from "./trajectory.mjs";
export { read, sha, identity, write, total };
export const protocolFile = "fixtures/evidence/construction-protocol.json";
export const freezeFile = "fixtures/evidence/construction-freeze.json";
export const protocol = () => read(protocolFile);
export const caseInput = id => read(`fixtures/evidence/construction-cases/${id}.json`);
export const idle = () => ({ rules: [{ when: [], action: { kind: "wait" }, remember: null }] });
export const parentProgram = world => world.cells.find(cell => cell.id === protocol().roles.builder).program;
export function apply(original, program) {
  const world = structuredClone(original);
  world.cells.find(cell => cell.id === protocol().roles.builder).program = structuredClone(program);
  return world;
}
export function variant(original, program, kind) {
  const world = apply(original, program), { builder, child, courier, relay, blueprint } = protocol().roles;
  const parent = world.cells.find(cell => cell.id === builder);
  const template = world.construction.blueprints.find(item => item.id === blueprint);
  if (["reference", "candidate", "selected"].includes(kind)) return world;
  if (kind === "prebuilt") {
    // This explicitly supplied initial body is a service comparator, not a birth.
    world.cells.push(structuredClone(template.body.cell));
    world.cells.sort((a, b) => a.id - b.id);
    world.links.push(...structuredClone(template.body.links));
    world.links.sort((a, b) => a.id - b.id);
    parent.program = idle();
    delete world.construction;
  } else if (kind === "blind-child") {
    template.body.cell.program = { rules: [
      { when: [{ kind: "memory", slot: 0, value: 0 }],
        action: { kind: "route", valve: protocol().roles.valve, bit: { kind: "constant", value: false } }, remember: { slot: 0, value: 1 } },
      { when: [], action: { kind: "route", valve: protocol().roles.valve, bit: { kind: "constant", value: true } }, remember: { slot: 0, value: 0 } },
    ] };
  } else if (kind === "no-stock") {
    for (const stock of world.construction.stocks) stock.units = [];
  } else if (kind === "no-acquisition" || kind === "no-activation") {
    const action = kind === "no-acquisition" ? "gather_material" : "activate";
    parent.program.rules = parent.program.rules.map(rule => rule.action.kind === action
      ? { ...rule, action: { kind: "wait" }, remember: null } : rule);
  } else if (kind === "idle-child") template.body.cell.program = idle();
  else if (kind === "idle-courier" || kind === "idle-relay")
    world.cells.find(cell => cell.id === (kind === "idle-courier" ? courier : relay)).program = idle();
  else throw new Error(`Unknown construction comparison: ${kind}`);
  assert(kind === "prebuilt" || template.body.cell.id === child);
  return world;
}

// These are declared diagnostic predicates over a freshly verified Rust trace.
// They are not a second simulator and do not replace the Rust conservation audit.
export function grade(receipt) {
  const { builder, child, blueprint } = protocol().roles;
  const result = receipt.result, frames = result.frames;
  const birth = result.final_state.construction?.births.find(row => row.blueprint === blueprint && row.parent === builder);
  const actions = kind => frames.flatMap(frame => frame.activations
    .filter(action => action.cell === builder && action.action.kind === kind && action.success)
    .map(action => ({ tick: frame.tick, action })));
  const acquired = actions("gather_material").some(row => birth && row.tick < birth.tick);
  const built = actions("build").some(row => birth && row.tick < birth.tick);
  const activated = actions("activate").some(row => birth && row.tick === birth.tick);
  const reported = new Set(), readIds = new Set(), routedIds = new Set(), causalRoutes = new Set();
  for (const [index, frame] of frames.entries()) {
    const previous = frames[index - 1]?.state.cells.find(cell => cell.id === child);
    const childActions = frame.activations.filter(action => action.cell === child && action.success);
    const routes = frame.activations.filter(action => action.action.kind === "route" && action.success);
    assert(routes.every(action => action.cell === child), "This diagnostic admits the child as its sole Route actor");
    for (const signal of frame.signals)
      if (signal.outcome === "delivered" && signal.signal.to_cell === child && signal.signal.receipt_spark != null)
        reported.add(signal.signal.receipt_spark);
    for (const action of childActions) {
      if (action.action.kind === "take_message") {
        for (const signal of frame.signals)
          if (signal.outcome === "consumed" && signal.signal.to_cell === child
            && signal.signal.to_port === action.action.port && signal.signal.receipt_spark != null)
            readIds.add(signal.signal.receipt_spark);
      }
      if (action.action.kind === "route") {
        const deliveredHere = frame.state.delivered.filter(item => item.tick === frame.tick);
        // One successful Route transfers one spark. Multiple simultaneous
        // deliveries would need a stronger attribution contract than this assay.
        if (deliveredHere.length !== 1) continue;
        const item = deliveredHere[0]; routedIds.add(item.spark.id);
        const source = action.action.bit;
        if (source.kind === "memory" && previous?.evidence[source.slot] === item.spark.id
          && (previous.memory[source.slot] !== 0) === item.spark.bit
          && reported.has(item.spark.id) && readIds.has(item.spark.id)) causalRoutes.add(item.spark.id);
      }
    }
  }
  const delivered = result.final_state.delivered.map(row => row.spark.id);
  const useful_child = routedIds.size > 0;
  const construction_passed = Boolean(birth && acquired && built && activated
    && frames.every(frame => !frame.activations.some(action => action.cell === child && frame.tick <= birth.tick)));
  const report_used = causalRoutes.size > 0;
  const inactive_ready = Boolean(result.final_state.construction?.assemblies.some(assembly => {
    const template = receipt.experiment.construction?.blueprints.find(item => item.id === assembly.blueprint);
    return template && Buffer.from(assembly.copied).equals(Buffer.from(JSON.stringify(template.body)))
      && JSON.stringify(assembly.wired) === JSON.stringify(template.body.links);
  }));
  return { inactive_ready, passed: result.outcome.passed, construction_passed, useful_child, report_used,
    milestone_passed: result.status === "complete" && result.outcome.passed && construction_passed && useful_child,
    birth_tick: birth?.tick ?? null, delivered: delivered.length,
    child_routed_sparks: [...routedIds].sort((a, b) => a - b),
    report_guided_sparks: [...causalRoutes].sort((a, b) => a - b),
    reported_and_read_sparks: [...readIds].filter(id => reported.has(id)).sort((a, b) => a - b) };
}
export function sourceIdentity() {
  const files = ["Cargo.toml", "Cargo.lock", "rust-toolchain.toml", protocolFile];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) visit(file);
      else if (/\.(rs|toml|json)$/.test(file)) files.push(file);
    }
  };
  files.push(...protocol().ancestry_sources.map(row => row.file), protocol().qualification_file);
  visit("crates"); visit("fixtures/evidence/construction-cases"); visit("fixtures/evidence/construction-submissions");
  for (const name of ["common", "runner", "trajectory", "session", "prepare", "freeze", "probes", "capacity"])
    files.push(`scripts/construction/${name}.mjs`);
  return { source_files_sha256: Object.fromEntries([...new Set(files)].sort().map(file => [file, sha(fs.readFileSync(file))])),
    release_binary_sha256: sha(fs.readFileSync(binary)),
    capacity_binary_sha256: sha(fs.readFileSync("target/release/examples/construction_capacity")) };
}
export function checkedFreeze() {
  const freeze = read(freezeFile); assert.deepEqual(sourceIdentity(), freeze.source);
  return freeze;
}
export function cold(run, id, experiment) {
  assert(/^[a-z0-9-]+$/.test(id));
  const directory = path.join(run.root, id); fs.mkdirSync(directory);
  const input = path.join(directory, "experiment.json"), output = path.join(directory, "receipt.json");
  write(input, experiment);
  const executed = run.cli(["run", input], { reservation: 2 });
  const receipt = executed.value;
  assert.equal(receipt.protocol, "platonik-habitat-v3");
  assert.deepEqual(receipt.experiment, experiment, "Only the declared inputs may change");
  write(output, receipt);
  let checked;
  try { checked = run.cli(["verify", output], { reservation: 2, accepted: [0] }); }
  catch { run.stop("A generated receipt failed verification; stop this diagnostic and retain the complete local evidence."); }
  assert(checked.value.verified); assert.equal(checked.value.result_hash, receipt.result_hash);
  return { id, first_call: executed.call.index, last_call: checked.call.index,
    experiment_hash: receipt.experiment_hash, result_hash: receipt.result_hash,
    receipt: path.relative(run.root, output), receipt_sha256: sha(fs.readFileSync(output)),
    status: receipt.result.status, ticks: receipt.result.ticks_completed, work: total(receipt.result.costs),
    ...grade(receipt) };
}
export function checkSelection(ledger, root) {
  const plan = protocol(); assert.equal(ledger.candidates.length, plan.candidates.length);
  for (const [index, entry] of ledger.candidates.entries()) {
    assert.equal(entry.id, plan.candidates[index].id); assert.equal(entry.sequence, index + 1);
    if (entry.input_unavailable) { assert.equal(entry.admission, "rejected"); assert(!entry.trials.length); continue; }
    const bytes = fs.readFileSync(path.join(root, entry.source)); assert.equal(sha(bytes), entry.source_sha256);
    if (entry.admission !== "completed") { assert(!entry.passed); continue; }
    assert.equal(entry.source_sha256, plan.candidates[index].source_sha256);
    const program = JSON.parse(bytes); assert.deepEqual(entry.program, program);
    assert.deepEqual(entry.trials.map(row => row.case_id), plan.training);
    for (const row of entry.trials) {
      const raw = fs.readFileSync(path.join(root, row.receipt)); assert.equal(sha(raw), row.receipt_sha256);
      const receipt = JSON.parse(raw); assert.deepEqual(receipt.experiment, apply(caseInput(row.case_id), program));
      for (const [key, value] of Object.entries(grade(receipt))) assert.deepEqual(row[key], value);
      assert.equal(row.work, total(receipt.result.costs));
    }
    assert.equal(entry.passed, entry.trials.every(row => row.milestone_passed));
    assert.equal(entry.work, entry.trials.reduce((sum, row) => sum + row.work, 0));
    assert.equal(entry.program_bytes, Buffer.byteLength(JSON.stringify(program)));
  }
  const winner = ledger.candidates.filter(row => row.passed)
    .sort((a, b) => a.work - b.work || a.program_bytes - b.program_bytes || a.sequence - b.sequence)[0];
  if (ledger.selected) {
    assert(winner); assert.equal(ledger.selected.id, winner.id); assert.deepEqual(ledger.selected.program, winner.program);
    assert.equal(ledger.selected.training_work, winner.work);
    assert.equal(ledger.selected.after_call, ledger.candidates.at(-1).after_call);
    assert.deepEqual(read(path.join(root, "selected.json")), ledger.selected);
  }
  return winner;
}
