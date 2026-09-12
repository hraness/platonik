import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { read, sha, identity, binary } from "./runner.mjs";
import { write, total } from "./trajectory.mjs";
import { control } from "./qualify.mjs";
export { read, sha, identity, binary, write, total };
export const protocolFile = "fixtures/evidence/ark-protocol.json";
export const freezeFile = "fixtures/evidence/ark-freeze.json";
export const protocol = () => read(protocolFile);
export const caseInput = id => read(`fixtures/evidence/ark-cases/${id}.json`);
export const idle = () => ({ rules: [{ when: [], action: { kind: "wait" }, remember: null }] });
export function programs(world) {
  return { clock_courier: world.cells.find(c => c.id === 1).program,
    payload_courier: world.cells.find(c => c.id === 12).program,
    selector: world.cells.find(c => c.id === 11).program };
}
// Rust's sole optional Program field is Rule.remember; preserve raw input
// separately while accepting its ordinary omitted-to-null representation.
export function normalizePrograms(input) {
  return Object.fromEntries(Object.entries(input).map(([role,program])=>[role,{...structuredClone(program),rules:program.rules.map(rule=>({...structuredClone(rule),remember:rule.remember??null}))}]));
}
export function apply(original, input) {
  input = normalizePrograms(input);
  const world = structuredClone(original);
  world.cells.find(c => c.id === 1).program = structuredClone(input.clock_courier);
  world.cells.find(c => c.id === 12).program = structuredClone(input.payload_courier);
  world.cells.find(c => c.id === 11).program = structuredClone(input.selector);
  return world;
}
export function variant(original, input, kind = "reference") {
  const world = apply(original, input);
  if (["reference", "candidate", "selected"].includes(kind)) return world;
  if (["constant-zero", "constant-one"].includes(kind)) {
    const selector = world.cells.find(cell => cell.id === 11);
    selector.program.rules = selector.program.rules.map(rule => rule.action.kind === "send"
      ? { ...rule, action: { ...rule.action, bit: { kind: "constant", value: kind === "constant-one" } } } : rule);
    return world;
  }
  return control(world, kind);
}
export function sourceIdentity() {
  const files = ["Cargo.toml", "Cargo.lock", "rust-toolchain.toml", protocolFile, protocol().qualification_file,
    ...protocol().ancestry_sources.map(row => row.file)];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) visit(file); else if (/\.(rs|toml|json|mjs)$/.test(file)) files.push(file);
    }
  }
  visit("crates"); visit("scripts/ark"); visit("fixtures/evidence/ark-cases");
  return { source_files_sha256: Object.fromEntries([...new Set(files)].sort().map(file => [file, sha(fs.readFileSync(file))])),
    release_binary_sha256: sha(fs.readFileSync(binary)),capacity_binary_sha256:sha(fs.readFileSync("target/release/examples/ark_capacity")) };
}
export function checkedFreeze() {
  const frozen = read(freezeFile); assert.deepEqual(sourceIdentity(), frozen.source); return frozen;
}
export function cold(run, id, experiment) {
  assert(/^[a-z0-9-]+$/.test(id)); const directory = path.join(run.root, id); fs.mkdirSync(directory);
  const input = path.join(directory, "experiment.json"), receiptFile = path.join(directory, "receipt.json"); write(input, experiment);
  const result = run.cli(["run", input], { reservation: 2 });
  assert(result.value, "A malformed candidate cannot produce an admitted receipt");
  const receipt = result.value; assert.deepEqual(receipt.experiment, experiment); write(receiptFile, receipt);
  let checked;
  try { checked = run.cli(["habitat", "ark-check", receiptFile], { reservation: 2, accepted: [0] }); }
  catch { run.stop("An engine-produced receipt failed ark verification; preserve the attempt and stop."); }
  const ark = checked.value;
  assert.equal(ark.result_hash, receipt.result_hash); assert.equal(ark.experiment_hash, receipt.experiment_hash);
  return { id, first_call: result.call.index, last_call: checked.call.index, receipt: path.relative(run.root, receiptFile),
    receipt_sha256: sha(fs.readFileSync(receiptFile)), experiment_hash: receipt.experiment_hash, result_hash: receipt.result_hash,
    status: receipt.result.status, ticks: receipt.result.ticks_completed, work: total(receipt.result.costs),
    passed: receipt.result.outcome.passed, control_passed: ark.control_passed, ark };
}
export function bestCandidate(ledger) {
  return ledger.candidates.filter(c => c.admission === "completed" && c.control_passed)
    .toSorted((a,b) => a.work-b.work || a.program_bytes-b.program_bytes || a.sequence-b.sequence)[0] ?? null;
}
export function checkSelection(ledger, root) {
  const baseline = programs(caseInput(protocol().training[0]));
  assert.equal(ledger.candidates.length, 3);
  for (const [index,candidate] of ledger.candidates.entries()) {
    assert.equal(candidate.sequence,index+1);
    if (candidate.input_unavailable) { assert.equal(candidate.admission,"rejected"); assert(!candidate.trials.length); continue; }
    assert.equal(sha(fs.readFileSync(path.join(root,candidate.source))),candidate.source_sha256);
    if (candidate.admission !== "completed") { assert(!candidate.control_passed); continue; }
    const source = read(path.join(root,candidate.source));
    assert.deepEqual(candidate.programs,normalizePrograms({clock_courier:source.clock_courier,payload_courier:source.payload_courier,selector:source.selector}));
    if (ledger.owner === "keep") {
      assert.deepEqual(candidate.programs.clock_courier,baseline.clock_courier);
      assert.deepEqual(candidate.programs.payload_courier,baseline.payload_courier);
    }
    assert.deepEqual(candidate.trials.map(row => row.case_id),protocol().training);
    for (const row of candidate.trials) {
      const receipt = read(path.join(root,row.receipt)); assert.equal(sha(fs.readFileSync(path.join(root,row.receipt))),row.receipt_sha256);
      assert.deepEqual(receipt.experiment,apply(caseInput(row.case_id),candidate.programs));
      assert.deepEqual(row.ark,read(path.join(root,ledger.calls[row.last_call].stdout)));
    }
    assert.equal(identity(candidate.programs),identity(programs(read(path.join(root,candidate.trials[0].receipt)).experiment)));
    assert.equal(candidate.work,candidate.trials.reduce((sum,row)=>sum+row.work,0));
    assert.equal(candidate.program_bytes,Buffer.byteLength(JSON.stringify(candidate.programs)));
    assert.equal(candidate.control_passed,candidate.trials.every(row=>row.control_passed));
  }
  const winner=bestCandidate(ledger);
  if (ledger.selected) { assert(winner); assert.equal(ledger.selected.id,winner.id); assert.deepEqual(ledger.selected.programs,winner.programs); }
  return winner;
}
