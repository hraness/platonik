// Common references, comparisons and preservation checks; no agent authoring.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createLedger,runner} from "./runner.mjs";
import {read,identity,protocol,checkedFreeze,caseInput,programs,variant,cold,checkSelection} from "./common.mjs";
import {trajectory} from "./trajectory.mjs";
import {probes} from "./probes.mjs";
const [directory,operation,keepDirectory,frugalDirectory]=process.argv.slice(2);assert(directory&&operation);
const plan=protocol(),freeze=checkedFreeze(),reference=programs(caseInput(plan.training[0]));
const ledger=operation==="init"?createLedger(directory,plan.budget.coordinator,{owner:"coordinator",source_digest:identity(freeze.source),references:[],comparisons:[],controls:[],replays:[],probes:[],pending_operation:null}):read(path.join(directory,"ledger.json"));
assert.equal(ledger.owner,"coordinator");assert.equal(ledger.source_digest,identity(freeze.source));assert.equal(ledger.maximum_engine_executions,1920);
assert(!ledger.pending_operation&&!ledger.finished);const run=runner(directory,ledger);
const begin=()=>{ledger.pending_operation=operation;run.save();};
const trial=(kind,case_id)=>({...cold(run,`${kind}-${case_id}`,variant(caseInput(case_id),reference,kind)),kind,case_id});
if(operation==="references") {assert(!ledger.references.length);begin();for(const id of [...plan.training,...plan.transfer]){ledger.references.push(trial("reference",id));run.save();}}
else if(operation==="comparisons") {assert.equal(ledger.references.length,8);assert(!ledger.comparisons.length);begin();for(const kind of plan.comparison_kinds)for(const id of [...plan.training,...plan.transfer]){ledger.comparisons.push(trial(kind,id));run.save();}}
else if(operation==="controls") {assert.equal(ledger.comparisons.length,16);assert(!ledger.controls.length);begin();for(const {kind,cases} of plan.controls)for(const id of cases){ledger.controls.push(trial(kind,id));run.save();}}
else if(operation==="replays") {
 assert.equal(ledger.controls.length,12);assert(!ledger.replays.length);assert(keepDirectory&&frugalDirectory);
 const arms={keep:read(path.join(keepDirectory,"ledger.json")),frugal:read(path.join(frugalDirectory,"ledger.json"))};
 for(const [owner,arm]of Object.entries(arms)){assert.equal(arm.owner,owner);assert(arm.finished);assert.equal(arm.source_digest,ledger.source_digest);checkSelection(arm,owner==="keep"?keepDirectory:frugalDirectory);}
 if(Object.values(arms).some(arm=>!arm.selected)){ledger.finished={control_passed:false,reason:"At least one arm found no complete training solution; no fabricated selected replay."};}
 else {begin();for(const spec of plan.replays){const selected=spec.owner==="reference"?reference:arms[spec.owner].selected.programs;const row=trajectory(run,spec.id,variant(caseInput(spec.case_id),selected,spec.kind),{cuts:spec.cuts,restoreTicks:spec.restore_ticks});ledger.replays.push({...row,case_id:spec.case_id,kind:spec.kind,owner:spec.owner});run.save();}}
} else if(operation==="probes") {assert.equal(ledger.replays.length,4);assert(!ledger.probes.length);begin();probes(run,ledger,plan);}
else if(operation==="finish") {
 assert.equal(ledger.replays.length,4);assert.equal(ledger.probes.length,12);
 const group=kind=>ledger.controls.filter(row=>row.kind===kind);
 ledger.finished={references_control_passed:ledger.references.every(row=>row.control_passed),all_saved_traces_equal:ledger.replays.every(row=>row.restored_equal&&row.uninterrupted_equal),probes_passed:ledger.probes.every(row=>row.status==="pass"),
  control_findings:Object.fromEntries(plan.control_kinds.map(kind=>[kind,group(kind).every(row=>row.status==="complete"&&!row.control_passed)])),logical_cold_runs:ledger.calls.filter(call=>call.args[0]==="run").length};
} else assert.equal(operation,"init");
ledger.pending_operation=null;run.save();console.log(JSON.stringify({operation,engine_executions:ledger.engine_executions,finished:ledger.finished??null}));
