// Two independent agent authors; no candidate generation or hidden optimizer.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createLedger,runner } from "./runner.mjs";
import { read,write,sha,identity,protocol,checkedFreeze,caseInput,programs,normalizePrograms,apply,cold,checkSelection } from "./common.mjs";
const [directory,operation,input]=process.argv.slice(2);
assert(directory&&operation,"agent-session.mjs DIRECTORY init keep|frugal | candidate FILE | freeze ID | transfer | finish");
const plan=protocol(),frozen=checkedFreeze();
const ledger=operation==="init"?createLedger(directory,plan.budget.each_agent,{owner:input,source_digest:identity(frozen.source),candidates:[],selected:null,transfer:[],pending_operation:null}):read(path.join(directory,"ledger.json"));
assert(["keep","frugal"].includes(ledger.owner)); assert.equal(ledger.source_digest,identity(frozen.source));
assert.equal(ledger.maximum_engine_executions,plan.budget.each_agent);
assert(!ledger.pending_operation&&!ledger.finished,"Preserve interrupted/completed operations; no silent reset");
const run=runner(directory,ledger);
if(ledger.selected)checkSelection(ledger,run.root);
if(operation==="candidate") {
  assert(!ledger.selected&&ledger.candidates.length<3);
  const entry={sequence:ledger.candidates.length+1,id:null,admission:"submitted",trials:[],commitments_passed:false,first_call:ledger.calls.length};
  ledger.candidates.push(entry);ledger.pending_operation=`candidate-${entry.sequence}`;run.save();
  try {
    const stat=fs.statSync(input);assert(stat.isFile()&&stat.size<=65536,"Bounded candidate file");
    const raw=fs.readFileSync(input);entry.source=`submission-${entry.sequence}.json`;
    fs.writeFileSync(path.join(run.root,entry.source),raw,{flag:"wx"});entry.source_sha256=sha(raw);run.save();
    const candidate=JSON.parse(raw);assert(/^[a-z][a-z0-9-]{0,31}$/.test(candidate.id));
    assert(!ledger.candidates.some(c=>c!==entry&&c.id===candidate.id));
    assert.deepEqual(Object.keys(candidate).sort(),["courier","id","requester"]);
    let bundle={requester:candidate.requester,courier:candidate.courier};
    for(const program of Object.values(bundle))assert(program&&Array.isArray(program.rules));
    bundle=normalizePrograms(bundle);
    if(ledger.owner==="keep"){
      const reference=programs(caseInput(plan.training[0]));
      assert.deepEqual(bundle.courier,reference.courier,"Keep the exact qualified request courier");
    }
    entry.id=candidate.id;entry.programs=bundle;run.save();
    for(const case_id of plan.training){const trial={...cold(run,`c${entry.sequence}-${case_id}`,apply(caseInput(case_id),entry.programs)),case_id};entry.trials.push(trial);entry.programs=programs(read(path.join(run.root,trial.receipt)).experiment);run.save();}
    entry.work=entry.trials.reduce((sum,row)=>sum+row.work,0);entry.program_bytes=Buffer.byteLength(JSON.stringify(entry.programs));
    entry.commitments_passed=entry.trials.every(row=>row.commitments_passed);entry.admission="completed";
  } catch(error) {
    entry.admission=entry.trials.length?"partial":"rejected";
    entry.error="Submission did not complete; source and local diagnostics are retained.";
    if(!entry.source)entry.input_unavailable=true;
    fs.writeFileSync(path.join(run.root,`submission-${entry.sequence}.error.txt`),String(error.stack??error),{flag:"wx"});
    entry.after_call=ledger.calls.length;ledger.pending_operation=null;run.save();throw error;
  }
  entry.after_call=ledger.calls.length;ledger.pending_operation=null;
} else if(operation==="freeze") {
  assert(!ledger.selected);const best=checkSelection(ledger,run.root);
  if(!best)ledger.finished={commitments_passed:false,reason:"No candidate commitments_passed all four training worlds; no extra slot or transfer.",logical_cold_runs:ledger.calls.filter(c=>c.args[0]==="run").length};
  else {assert.equal(input,best.id);ledger.selected={id:best.id,sequence:best.sequence,programs:best.programs,program_hash:identity(best.programs),training_work:best.work,after_call:ledger.calls.length};write(path.join(run.root,"selected.json"),ledger.selected);}
} else if(operation==="transfer") {
  assert(ledger.selected&&!ledger.transfer.length);ledger.pending_operation="transfer";run.save();
  for(const case_id of plan.transfer){ledger.transfer.push({...cold(run,`transfer-${case_id}`,apply(caseInput(case_id),ledger.selected.programs)),case_id});run.save();}
  ledger.pending_operation=null;
} else if(operation==="finish") {
  assert.equal(ledger.transfer.length,4);checkSelection(ledger,run.root);
  assert.deepEqual(read(path.join(run.root,"selected.json")),ledger.selected);
  ledger.finished={commitments_passed:ledger.transfer.every(row=>row.commitments_passed),all_inputs_retained:true,logical_cold_runs:ledger.calls.filter(c=>c.args[0]==="run").length};
} else assert.equal(operation,"init");
run.save();
console.log(JSON.stringify({owner:ledger.owner,engine_executions:ledger.engine_executions,candidates:ledger.candidates.map(({id,admission,commitments_passed,work,program_bytes,trials})=>({id,admission,commitments_passed,work,program_bytes,trials:trials.map(({case_id,commitments_passed,passed,work,ports})=>({case_id,commitments_passed,passed,work,ports}))})),selected:ledger.selected?.id??null,transfer:ledger.transfer,finished:ledger.finished??null},null,2));
