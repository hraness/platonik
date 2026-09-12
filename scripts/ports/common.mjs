import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {gunzipSync} from "node:zlib";
import { read, sha, identity, binary } from "./runner.mjs";
import { write, total } from "./trajectory.mjs";
import { control } from "./qualify.mjs";
export { read, sha, identity, binary, write, total };
export const protocolFile = "fixtures/evidence/ports-protocol.json";
export const freezeFile = "fixtures/evidence/ports-freeze.json";
export const protocol = () => read(protocolFile);
export const caseInput = id => read(`fixtures/evidence/ports-cases/${id}.json`);
export const idle = () => ({ rules: [{ when: [], action: { kind: "wait" }, remember: null }] });
export function programs(world) {
  const roles=protocol().roles;
  const requester=world.cells.find(c=>c.id===roles.requesters[0]).program;
  const courier=world.cells.find(c=>c.id===roles.couriers[0]).program;
  for(const id of roles.requesters)assert.deepEqual(world.cells.find(c=>c.id===id).program,requester);
  for(const id of roles.couriers)assert.deepEqual(world.cells.find(c=>c.id===id).program,courier);
  return {requester,courier};
}
// Rust's sole optional Program field is Rule.remember; preserve raw input
// separately while accepting its ordinary omitted-to-null representation.
export function normalizePrograms(input) {
  return Object.fromEntries(Object.entries(input).map(([role,program])=>[role,{...structuredClone(program),rules:program.rules.map(rule=>({...structuredClone(rule),remember:rule.remember??null}))}]));
}
export function apply(original, input) {
  input = normalizePrograms(input);
  const world = structuredClone(original);
  for(const id of protocol().roles.requesters)world.cells.find(c=>c.id===id).program=structuredClone(input.requester);
  for(const id of protocol().roles.couriers)world.cells.find(c=>c.id===id).program=structuredClone(input.courier);
  return world;
}
export function variant(original, input, kind = "reference") {
  const world = apply(original, input);
  if (["reference", "candidate", "selected"].includes(kind)) return world;
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
  visit("crates"); visit("scripts/ports"); visit("fixtures/evidence/ports-cases");
  // Match qualification: Rust embeds these external immutable JSON artifacts
  // in its source, so changing one must invalidate local trial admission too.
  for(const file of [...files].filter(file=>file.endsWith(".rs"))){
    for(const match of fs.readFileSync(file,"utf8").matchAll(/include_str!\(\s*"([^"]+)"\s*\)/g)){
      const dependency=path.normalize(path.join(path.dirname(file),match[1]));
      assert(!dependency.startsWith("..")&&!path.isAbsolute(dependency));files.push(dependency);
    }
  }

  return { source_files_sha256: Object.fromEntries([...new Set(files)].sort().map(file => [file, sha(fs.readFileSync(file))])),
    release_binary_sha256: sha(fs.readFileSync(binary)),capacity_binary_sha256:sha(fs.readFileSync("target/release/examples/ports_capacity")) };
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
  try { checked = run.cli(["habitat", "ports-check", receiptFile], { reservation: 2, accepted: [0] }); }
  catch { run.stop("An engine-produced receipt failed ports verification; preserve the attempt and stop."); }
  const ports = checked.value;
  assert.equal(ports.result_hash, receipt.result_hash); assert.equal(ports.experiment_hash, receipt.experiment_hash);
  return { id, first_call: result.call.index, last_call: checked.call.index, receipt: path.relative(run.root, receiptFile),
    receipt_sha256: sha(fs.readFileSync(receiptFile)), experiment_hash: receipt.experiment_hash, result_hash: receipt.result_hash,
    status: receipt.result.status, ticks: receipt.result.ticks_completed, work: total(receipt.result.costs),
    passed: receipt.result.outcome.passed, commitments_passed: ports.commitments_passed, ports };
}
export function bestCandidate(ledger) {
  return ledger.candidates.filter(c => c.admission === "completed" && c.commitments_passed)
    .toSorted((a,b) => a.work-b.work || a.program_bytes-b.program_bytes || a.sequence-b.sequence)[0] ?? null;
}
export function checkSelection(ledger, root) {
  const baseline = programs(caseInput(protocol().training[0]));
  assert.equal(ledger.candidates.length, 3);
  for (const [index,candidate] of ledger.candidates.entries()) {
    assert.equal(candidate.sequence,index+1);
    if (candidate.input_unavailable) { assert.equal(candidate.admission,"rejected"); assert(!candidate.trials.length); continue; }
    assert.equal(sha(fs.readFileSync(path.join(root,candidate.source))),candidate.source_sha256);
    if (candidate.admission !== "completed") { assert(!candidate.commitments_passed); continue; }
    const source = read(path.join(root,candidate.source));
    assert.deepEqual(candidate.programs,normalizePrograms({requester:source.requester,courier:source.courier}));
    if (ledger.owner === "keep") {
      assert.deepEqual(candidate.programs.courier,baseline.courier);
    }
    assert.deepEqual(candidate.trials.map(row => row.case_id),protocol().training);
    for (const row of candidate.trials) {
      const receipt = read(path.join(root,row.receipt)); assert.equal(sha(fs.readFileSync(path.join(root,row.receipt))),row.receipt_sha256);
      assert.deepEqual(receipt.experiment,apply(caseInput(row.case_id),candidate.programs));
      assert.deepEqual(row.ports,read(path.join(root,ledger.calls[row.last_call].stdout)));
    }
    assert.equal(identity(candidate.programs),identity(programs(read(path.join(root,candidate.trials[0].receipt)).experiment)));
    assert.equal(candidate.work,candidate.trials.reduce((sum,row)=>sum+row.work,0));
    assert.equal(candidate.program_bytes,Buffer.byteLength(JSON.stringify(candidate.programs)));
    assert.equal(candidate.commitments_passed,candidate.trials.every(row=>row.commitments_passed));
  }
  const winner=bestCandidate(ledger);
  if (ledger.selected) { assert(winner); assert.equal(ledger.selected.id,winner.id); assert.deepEqual(ledger.selected.programs,winner.programs); }
  return winner;
}

// Reuse checked reference receipts from qualification without replaying them in
// the study. Their original calls remain accounted in the qualification ledger.
export function qualifiedReferences() {
  const q=read(protocol().qualification_file);assert(q.finished?.commitments_passed);
  const batch=q.batches[q.finished.reference_batch];assert(batch.completed&&batch.attempts.length===8);
  return batch.attempts.map(index=>{
    const source=q.attempts[index],file=q.files[source.receipt],meta=q.artifacts[file];
    const raw=gunzipSync(fs.readFileSync(file),{maxOutputLength:protocol().bounds.maximum_receipt_bytes});
    assert.equal(sha(raw),meta.uncompressed_sha256);assert.equal(sha(raw),source.receipt_sha256);
    const receipt=JSON.parse(raw);assert.deepEqual(receipt.experiment,caseInput(source.case_id));
    assert(source.commitments_passed&&source.status==="complete"&&source.ticks===128);
    return {id:`reference-${source.case_id}`,kind:"reference",case_id:source.case_id,qualification_index:index,
      receipt_file:file,receipt_sha256:source.receipt_sha256,experiment_hash:source.experiment_hash,result_hash:source.result_hash,
      status:source.status,ticks:source.ticks,work:source.work,passed:source.service_passed,commitments_passed:source.commitments_passed,ports:source.grade};
  });
}
