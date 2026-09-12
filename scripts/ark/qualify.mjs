// Capture qualification before any execution; repairs are additive batches.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createLedger, runner, read, sha, identity, binary } from "./runner.mjs";

export const training = ["ark-reserve-15", "ark-reserve-16", "ark-staggered-15", "ark-staggered-16"];
export const transfer = ["ark-reserve-30", "ark-reserve-7", "ark-staggered-30", "ark-staggered-7"];
const idle = () => ({ rules: [{ when: [], action: { kind: "wait" }, remember: null }] });
export function control(world, kind) {
  world = structuredClone(world);
  const cell = id => world.cells.find(cell => cell.id === id);
  if (kind === "idle-clock-courier") cell(1).program = idle();
  else if (kind === "idle-payload-courier") cell(12).program = idle();
  else if (kind === "idle-relay") cell(2).program = idle();
  else if (kind === "clear-keeper") {
    world.events.push({ tick: 49, event: { kind: "clear_memory", cell: 3 } });
    world.events.sort((a, b) => a.tick - b.tick);
  } else if (kind === "without-carry-writes") {
    cell(10).program.rules = cell(10).program.rules.map(rule => rule.remember?.slot === 0 ? { ...rule, remember: null } : rule);
  } else if (kind === "fixed-tap-zero") {
    // Change the policy, not the granted tap input that declares the task.
    cell(11).program.rules = cell(11).program.rules.filter(rule => rule.action.kind !== "send"
      || rule.when.some(condition => condition.kind === "memory" && condition.slot === 0 && condition.value === 0))
      .map(rule => ({ ...rule, when: rule.when.filter(condition => !(condition.kind === "memory" && condition.slot === 2)) }));
  } else if (kind === "broken-b-link") world.links.find(link => link.id === 45).enabled = false;
  else throw new Error("Unknown declared qualification control.");
  return world;
}

function sourceSnapshot(root, sequence) {
  const files = ["Cargo.toml", "Cargo.lock", "rust-toolchain.toml", "scripts/ark/runner.mjs", "scripts/ark/qualify.mjs"];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) visit(file);
      else if (/\.(rs|toml)$/.test(file)) files.push(file);
    }
  }
  visit("crates");
  for (const file of [...files].filter(file => file.endsWith('.rs'))) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/include_str!\(\s*"([^"]+)"\s*\)/g)) {
      const dependency = path.normalize(path.join(path.dirname(file), match[1]));
      assert(!dependency.startsWith('..') && !path.isAbsolute(dependency)); files.push(dependency);
    }
  }
  const directory = `source-${sequence}`;
  fs.mkdirSync(path.join(root, directory));
  const hashes = {};
  for (const file of [...new Set(files)].sort()) {
    const bytes = fs.readFileSync(file), target = path.join(root, directory, file);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes, { flag: "wx" });
    hashes[file] = sha(bytes);
  }
  return { directory, files: hashes, binary_sha256: sha(fs.readFileSync(binary)) };
}

function main() {
  const [directory, operation] = process.argv.slice(2);
  assert(directory && ["init", "references", "controls", "truth"].includes(operation), "qualify.mjs DIRECTORY init|references|controls|truth");
  const plan = { schema: "platonik-ark-qualification-plan-v1", maximum_engine_executions: 1536,
    reserved_truth_executions: 512, maximum_nontruth_executions: 1024, training, transfer,
    arithmetic: { a: [0, 15], b: [0, 15], tap: 0, pairs: 256, carry_in: 0, output_bits: 5 },
    controls: ["idle-clock-courier", "idle-payload-courier", "idle-relay", "clear-keeper", "without-carry-writes", "fixed-tap-zero", "broken-b-link"],
    rule: "Save each exact input and source snapshot before run. Retain every failed attempt and repair batch. Do not start truth until the latest eight reference worlds pass. No optimizer trial in qualification." };
  const ledger = operation === "init" ? createLedger(directory, plan.maximum_engine_executions, {
    owner: "qualification", plan, batches: [], attempts: [], pending_attempt: null,
  }) : read(path.join(directory, "ledger.json"));
  assert.deepEqual(ledger.plan, plan); assert(!ledger.pending_attempt && !ledger.finished);
  const run = runner(directory, ledger);
  if (operation === "init") { run.save(); console.log("Ark qualification declared; zero engine executions."); return; }
  const sequence = ledger.batches.length, source = sourceSnapshot(run.root, sequence);
  const batch = { sequence, operation, source, source_digest: identity(source), first_call: ledger.calls.length, attempts: [], completed: false };
  ledger.batches.push(batch); run.save();
  const latestReference = [...ledger.batches].reverse().find(row => row.operation === "references" && row.completed);
  if (operation === "truth") {
    assert(latestReference?.attempts.length === 8 && latestReference.attempts.every(index => ledger.attempts[index].control_passed), "Qualify every reference before truth sweep.");
    assert.deepEqual(source.files, latestReference.source.files, "Truth uses the qualified reference source.");
    assert.equal(source.binary_sha256, latestReference.source.binary_sha256);
    const latestControls = [...ledger.batches].reverse().find(row => row.operation === 'controls' && row.completed);
    assert(latestControls?.attempts.length === 7, 'Retain all seven control qualifications before truth.');
    assert.deepEqual(source.files, latestControls.source.files); assert.equal(source.binary_sha256, latestControls.source.binary_sha256);
    assert(latestControls.attempts.every(index => {
      const row = ledger.attempts[index];
      return row.status === 'complete' && row.ticks === 128 && !row.service_passed && !row.control_passed
        && row.arithmetic_passed === ['idle-payload-courier', 'clear-keeper', 'fixed-tap-zero'].includes(row.kind);
    }), 'Controls must support their declared reference-architecture claims; retain unexpected outcomes and review before truth.');
    assert(!ledger.batches.some(row => row !== batch && row.operation === "truth"), "One full truth sweep; preserve a failed sweep for explicit reviewed continuation.");
  }
  const recipes = operation === "references" ? [...training, ...transfer].map(case_id => ({ case_id }))
    : operation === "controls" ? plan.controls.map(kind => ({ case_id: "ark-reserve-16", kind }))
      : Array.from({ length: 256 }, (_, index) => ({ a: index >> 4, b: index & 15, tap: 0 }));
  for (const recipe of recipes) {
    if (operation !== "truth") assert(ledger.calls.filter(call => call.phase !== "truth").reduce((sum, call) => sum + call.metrics.engine_executions, 0) + 2 <= 1024, "Preserve the fixed 512-execution truth reserve.");
    const index = ledger.attempts.length, stem = `attempt-${String(index).padStart(4, "0")}`;
    const attempt = { index, batch: sequence, ...recipe, first_call: ledger.calls.length, completed: false };
    ledger.attempts.push(attempt); batch.attempts.push(index); ledger.pending_attempt = index; run.save();
    const args = operation === "truth" ? ["habitat", "arithmetic-case", String(recipe.a), String(recipe.b), "0"] : ["habitat", "case", recipe.case_id];
    const exported = run.cli(args, { reservation: 0, accepted: [0] }); exported.call.phase = operation; run.save();
    const experiment = recipe.kind ? control(exported.value, recipe.kind) : exported.value;
    attempt.input = `${stem}.experiment.json`;
    fs.writeFileSync(path.join(run.root, attempt.input), `${JSON.stringify(experiment, null, 2)}\n`, { flag: "wx" });
    attempt.input_sha256 = sha(fs.readFileSync(path.join(run.root, attempt.input))); run.save();
    const result = run.cli(["run", path.join(run.root, attempt.input)], { reservation: 1, accepted: [0, 1, 2] }); result.call.phase = operation;
    if (result.call.exit_code === 2) {
      Object.assign(attempt, { rejected: true, diagnostic_file: result.call.stderr,
        service_passed: false, arithmetic_passed: false, control_passed: false,
        after_call: ledger.calls.length, completed: true });
      ledger.pending_attempt = null; run.save();
      console.log(JSON.stringify({ index, operation, ...recipe, rejected: true })); continue;
    }
    attempt.receipt = result.call.stdout; attempt.receipt_sha256 = result.call.stdout_sha256; run.save();
    const graded = run.cli(["habitat", "ark-check", path.join(run.root, attempt.receipt)], { reservation: 1, accepted: [0] }); graded.call.phase = operation;
    const receipt = result.value, grade = graded.value;
    assert.equal(grade.experiment_hash, receipt.experiment_hash); assert.equal(grade.result_hash, receipt.result_hash);
    assert.deepEqual(receipt.experiment, experiment);
    Object.assign(attempt, { grade_file: graded.call.stdout, grade, experiment_hash: receipt.experiment_hash, result_hash: receipt.result_hash,
      service_passed: grade.service_passed, arithmetic_passed: grade.arithmetic_passed, control_passed: grade.control_passed,
      status: receipt.result.status, ticks: receipt.result.ticks_completed, work: Object.values(receipt.result.costs).reduce((a, b) => a + b, 0),
      after_call: ledger.calls.length, completed: true });
    ledger.pending_attempt = null; run.save();
    console.log(JSON.stringify({ index, operation, ...recipe, arithmetic_passed: grade.arithmetic_passed, control_passed: grade.control_passed, work: attempt.work }));
  }
  batch.after_call = ledger.calls.length; batch.completed = true;
  if (operation === "truth") ledger.finished = { arithmetic_passed: batch.attempts.every(index => ledger.attempts[index].arithmetic_passed),
    control_passed: batch.attempts.every(index => ledger.attempts[index].control_passed), pairs: batch.attempts.length };
  run.save();
}
// Importing the declared mutations in study preparation executes no experiment.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url))) main();
