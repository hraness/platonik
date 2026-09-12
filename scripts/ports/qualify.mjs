// Capture qualification before any execution; repairs are additive batches.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createLedger, runner, read, sha, identity, binary } from "./runner.mjs";

import {training,transfer,roles,control,controls} from "./manifest.mjs";
export {training,transfer,roles,control,controls};

function sourceSnapshot(root, sequence) {
  const files = ["Cargo.toml", "Cargo.lock", "rust-toolchain.toml", "scripts/ports/runner.mjs", "scripts/ports/qualify.mjs", "scripts/ports/manifest.mjs"];
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
  const [directory,operation]=process.argv.slice(2);
  assert(directory&&["init","references","controls","seal"].includes(operation),"qualify.mjs DIRECTORY init|references|controls|seal");
  const plan={schema:"platonik-ports-qualification-plan-v1",maximum_engine_executions:128,training,transfer,
    controls:controls.map(row=>({kind:row.kind,case_id:row.cases[0]})),
    rule:"Retain each source snapshot and input before execution. Repairs are additive batches under one fixed allowance. Seal only after eight complete reference worlds and six complete failed controls on exactly the same source and binary. No optimizer runs here."};
  const ledger=operation==="init"?createLedger(directory,128,{owner:"qualification",plan,batches:[],attempts:[],pending_attempt:null}):read(path.join(directory,"ledger.json"));
  assert.deepEqual(ledger.plan,plan);assert(!ledger.pending_attempt&&!ledger.finished);
  const run=runner(directory,ledger);
  if(operation==="init"){console.log("Ports qualification declared; zero engine executions.");return;}
  if(operation==="seal"){
    const reference=[...ledger.batches].reverse().find(row=>row.operation==="references"&&row.completed);
    const removal=[...ledger.batches].reverse().find(row=>row.operation==="controls"&&row.completed);
    assert(reference?.attempts.length===8&&removal?.attempts.length===6);
    assert.deepEqual(reference.source.files,removal.source.files);assert.equal(reference.source.binary_sha256,removal.source.binary_sha256);
    for(const[file,hash]of Object.entries(reference.source.files))assert.equal(sha(fs.readFileSync(file)),hash);
    assert.equal(sha(fs.readFileSync(binary)),reference.source.binary_sha256);
    const complete=index=>{const row=ledger.attempts[index];return !row.rejected&&row.status==="complete"&&row.ticks===128;};
    assert(reference.attempts.every(index=>complete(index)&&ledger.attempts[index].commitments_passed),"Keep failed references; qualify before freezing.");
    assert(removal.attempts.every(index=>complete(index)&&!ledger.attempts[index].commitments_passed),"Unexpected control outcomes require explicit review before freeze.");
    ledger.finished={commitments_passed:true,reference_batch:reference.sequence,control_batch:removal.sequence,reused_references:8};run.save();
    console.log(JSON.stringify({finished:ledger.finished,engine_executions:ledger.engine_executions}));return;
  }
  const sequence=ledger.batches.length,source=sourceSnapshot(run.root,sequence);
  const batch={sequence,operation,source,source_digest:identity(source),first_call:ledger.calls.length,attempts:[],completed:false};
  ledger.batches.push(batch);run.save();
  const recipes=operation==="references"?[...training,...transfer].map(case_id=>({case_id})):plan.controls;
  for(const recipe of recipes){
    assert(ledger.engine_executions+2<=128,"Retain qualification failures without extending the declared budget.");
    const index=ledger.attempts.length,stem=`attempt-${String(index).padStart(4,"0")}`;
    const attempt={index,batch:sequence,...recipe,first_call:ledger.calls.length,completed:false};
    ledger.attempts.push(attempt);batch.attempts.push(index);ledger.pending_attempt=index;run.save();
    const exported=run.cli(["habitat","case",recipe.case_id],{reservation:0,accepted:[0]});
    const experiment=recipe.kind?control(exported.value,recipe.kind):exported.value;
    attempt.input=`${stem}.experiment.json`;
    fs.writeFileSync(path.join(run.root,attempt.input),`${JSON.stringify(experiment,null,2)}\n`,{flag:"wx"});
    attempt.input_sha256=sha(fs.readFileSync(path.join(run.root,attempt.input)));run.save();
    const result=run.cli(["run",path.join(run.root,attempt.input)],{reservation:1,accepted:[0,1,2]});
    if(result.call.exit_code===2){Object.assign(attempt,{rejected:true,diagnostic_file:result.call.stderr,service_passed:false,commitments_passed:false,after_call:ledger.calls.length,completed:true});ledger.pending_attempt=null;run.save();console.log(JSON.stringify({index,operation,...recipe,rejected:true}));continue;}
    attempt.receipt=result.call.stdout;attempt.receipt_sha256=result.call.stdout_sha256;run.save();
    const graded=run.cli(["habitat","ports-check",path.join(run.root,attempt.receipt)],{reservation:1,accepted:[0]}),receipt=result.value,grade=graded.value;
    assert.equal(grade.experiment_hash,receipt.experiment_hash);assert.equal(grade.result_hash,receipt.result_hash);assert.deepEqual(receipt.experiment,experiment);
    Object.assign(attempt,{grade_file:graded.call.stdout,grade,experiment_hash:receipt.experiment_hash,result_hash:receipt.result_hash,
      service_passed:grade.service_passed,commitments_passed:grade.commitments_passed,status:receipt.result.status,ticks:receipt.result.ticks_completed,
      work:Object.values(receipt.result.costs).reduce((a,b)=>a+b,0),after_call:ledger.calls.length,completed:true});
    ledger.pending_attempt=null;run.save();console.log(JSON.stringify({index,operation,...recipe,commitments_passed:grade.commitments_passed,work:attempt.work}));
  }
  batch.after_call=ledger.calls.length;batch.completed=true;run.save();
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fs.realpathSync(new URL(import.meta.url)))main();
