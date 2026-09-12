import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { read, sha, identity, binary } from "./runner.mjs";
import { write, total } from "./trajectory.mjs";
export { read, sha, identity, binary, write, total };
export const protocolFile = "fixtures/evidence/answer-protocol.json";
export const freezeFile = "fixtures/evidence/answer-freeze.json";
export const protocol = () => read(protocolFile);
export const caseInput = id => read(`fixtures/evidence/answer-cases/${id}.json`);
export const idle = () => ({ rules: [{ when: [], action: { kind: "wait" }, remember: null }] });
export function programs(world) {
  return { courier: world.cells.find(c => c.id === 1).program, builder: world.cells.find(c => c.id === 5).program,
    reply: world.construction.blueprints.find(b => b.id === 51).body.cell.program };
}
// Rust's sole optional Program field is Rule.remember; preserve raw input
// separately while accepting its ordinary omitted-to-null representation.
export function normalizePrograms(input) {
  return Object.fromEntries(Object.entries(input).map(([role,program])=>[role,{...structuredClone(program),rules:program.rules.map(rule=>({...structuredClone(rule),remember:rule.remember??null}))}]));
}
export function apply(original, input) {
  input = normalizePrograms(input);
  const world = structuredClone(original);
  world.cells.find(c => c.id === 1).program = structuredClone(input.courier);
  world.cells.find(c => c.id === 5).program = structuredClone(input.builder);
  world.construction.blueprints.find(b => b.id === 51).body.cell.program = structuredClone(input.reply);
  return world;
}
export function variant(original, input, kind = "reference") {
  const world = apply(original, input), parent = world.cells.find(c => c.id === 5);
  const reply = world.construction.blueprints.find(b => b.id === 51);
  if (["reference", "candidate", "selected"].includes(kind)) return world;
  if (kind === "prebuilt") {
    for (const blueprint of world.construction.blueprints) {
      world.cells.push(structuredClone(blueprint.body.cell)); world.links.push(...structuredClone(blueprint.body.links));
    }
    world.cells.sort((a,b) => a.id-b.id); world.links.sort((a,b) => a.id-b.id);
    parent.program = idle(); delete world.construction;
  } else if (kind === "direct-reply") {
    reply.body.cell.program = { rules: [
      { when: [{ kind: "has_message", port: 0, value: true }], action: { kind: "send", port: 0, bit: { kind: "message", port: 0 } }, remember: null },
      ...idle().rules,
    ] };
  } else if (kind === "no-stock") world.construction.stocks.forEach(stock => { stock.units = []; });
  else if (kind === "no-activation") parent.program.rules = parent.program.rules.map(rule => rule.action.kind === "activate" ? { ...rule, action: { kind: "wait" }, remember: null } : rule);
  else if (kind === "idle-courier") world.cells.find(c => c.id === 1).program = idle();
  else if (kind === "idle-reply") reply.body.cell.program = idle();
  else if (kind === "severed-return") reply.body.links.find(link => link.id === 43).enabled = false;
  else if (kind === "stale-reply") reply.body.cell.program = { rules: [
    { when: [{ kind: "memory", slot: 1, value: 0 }, { kind: "has_message", port: 0, value: true }], action: { kind: "take_message", port: 0, slot: 0 }, remember: { slot: 1, value: 1 } },
    { when: [], action: { kind: "send", port: 0, bit: { kind: "memory", slot: 0 } }, remember: null },
  ] };
  else throw new Error(`Unknown comparison ${kind}`);
  return world;
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
  visit("crates"); visit("scripts/answer"); visit("fixtures/evidence/answer-cases");
  return { source_files_sha256: Object.fromEntries([...new Set(files)].sort().map(file => [file, sha(fs.readFileSync(file))])),
    release_binary_sha256: sha(fs.readFileSync(binary)),capacity_binary_sha256:sha(fs.readFileSync("target/release/examples/answer_capacity")) };
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
  try { checked = run.cli(["habitat", "answer", receiptFile], { reservation: 2, accepted: [0] }); }
  catch { run.stop("An engine-produced receipt failed answer verification; preserve the attempt and stop."); }
  const journey = checked.value;
  assert.equal(journey.result_hash, receipt.result_hash); assert.equal(journey.experiment_hash, receipt.experiment_hash);
  return { id, first_call: result.call.index, last_call: checked.call.index, receipt: path.relative(run.root, receiptFile),
    receipt_sha256: sha(fs.readFileSync(receiptFile)), experiment_hash: receipt.experiment_hash, result_hash: receipt.result_hash,
    status: receipt.result.status, ticks: receipt.result.ticks_completed, work: total(receipt.result.costs),
    passed: receipt.result.outcome.passed, answered: journey.answered, journey };
}
export function bestCandidate(ledger) {
  return ledger.candidates.filter(c => c.admission === "completed" && c.answered)
    .toSorted((a,b) => a.work-b.work || a.program_bytes-b.program_bytes || a.sequence-b.sequence)[0] ?? null;
}
export function checkSelection(ledger, root) {
  const baseline = programs(caseInput(protocol().training[0]));
  assert.equal(ledger.candidates.length, 3);
  for (const [index,candidate] of ledger.candidates.entries()) {
    assert.equal(candidate.sequence,index+1);
    if (candidate.input_unavailable) { assert.equal(candidate.admission,"rejected"); assert(!candidate.trials.length); continue; }
    assert.equal(sha(fs.readFileSync(path.join(root,candidate.source))),candidate.source_sha256);
    if (candidate.admission !== "completed") { assert(!candidate.answered); continue; }
    const source = read(path.join(root,candidate.source));
    assert.deepEqual(candidate.programs,normalizePrograms({courier:source.courier,builder:source.builder,reply:source.reply}));
    if (ledger.owner === "keep") assert.deepEqual(candidate.programs.courier,baseline.courier);
    assert.deepEqual(candidate.trials.map(row => row.case_id),protocol().training);
    for (const row of candidate.trials) {
      const receipt = read(path.join(root,row.receipt)); assert.equal(sha(fs.readFileSync(path.join(root,row.receipt))),row.receipt_sha256);
      assert.deepEqual(receipt.experiment,apply(caseInput(row.case_id),candidate.programs));
      assert.deepEqual(row.journey,read(path.join(root,ledger.calls[row.last_call].stdout)));
    }
    assert.equal(identity(candidate.programs),identity(programs(read(path.join(root,candidate.trials[0].receipt)).experiment)));
    assert.equal(candidate.work,candidate.trials.reduce((sum,row)=>sum+row.work,0));
    assert.equal(candidate.program_bytes,Buffer.byteLength(JSON.stringify(candidate.programs)));
    assert.equal(candidate.answered,candidate.trials.every(row=>row.answered));
  }
  const winner=bestCandidate(ledger);
  if (ledger.selected) { assert(winner); assert.equal(ledger.selected.id,winner.id); assert.deepEqual(ledger.selected.programs,winner.programs); }
  return winner;
}
