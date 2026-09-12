// One bounded eight-cut replay plus the exact two-advance documentation path.
// Qualify process overhead before freezing optimizer allowance.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createLedger,runner} from "./runner.mjs";
import {read,write,identity,protocol,caseInput,sourceIdentity} from "./common.mjs";
import {trajectory} from "./trajectory.mjs";
const [directory]=process.argv.slice(2);assert(directory);
const plan=protocol(),ledger=createLedger(directory,360,{owner:"calibration",source:sourceIdentity(),pending_operation:"calibration"});
const run=runner(directory,ledger),spec=plan.replays[0],world=caseInput(spec.case_id);
ledger.replay=trajectory(run,"calibration",world,{cuts:spec.cuts,restoreTicks:spec.restore_ticks});run.save();
const input=path.join(run.root,"tutorial.experiment.json");write(input,world);
let save=path.join(run.root,"tutorial-save"),report=run.cli(["habitat","init",save,input],{reservation:2,accepted:[0]}).value;
const opening=run.cli(["habitat","journey",save],{reservation:1,accepted:[0]}).value;assert(!opening.journey.answered&&opening.journey.tick===0);
report=run.cli(["habitat","advance",save,"--until","5","--expect-revision","0","--request-id","first-body"],{reservation:7,accepted:[0]}).value;
const partial=run.cli(["habitat","journey",save],{reservation:3,accepted:[0]}).value;assert(!partial.journey.answered&&partial.journey.tick===5);
const bundle=run.cli(["habitat","export",save],{reservation:3,accepted:[0]}).value;
const file=path.join(run.root,"tutorial.at-5.bundle.json");write(file,bundle);
save=path.join(run.root,"tutorial-restored");const restored=run.cli(["habitat","import",file,save],{reservation:6,accepted:[0]}).value;
assert.equal(report.request_id,"first-body");assert.deepEqual(restored,{...report,request_id:null});
report=run.cli(["habitat","advance",save,"--until","128","--expect-revision","2","--request-id","bring-it-home"],{reservation:13,accepted:[0]}).value;
const journey=run.cli(["habitat","journey",save],{reservation:5,accepted:[0]}).value;
assert(journey.journey.answered);assert.deepEqual(journey.habitat,{...report,request_id:null});
const verified=run.cli(["habitat","verify",save],{reservation:5,accepted:[0]}).value;assert.deepEqual(verified,journey.habitat);
const final=run.cli(["habitat","export",save],{reservation:5,accepted:[0]}).value;
write(path.join(run.root,"tutorial.final.bundle.json"),final);
assert.equal(report.result_hash,ledger.replay.result_hash);assert.deepEqual(journey.journey,ledger.replay.journey);
ledger.tutorial={opening,partial,journey:journey.journey,uninterrupted_equal:true,restored_equal:true,final_bundle:"tutorial.final.bundle.json",restoration_bundle:"tutorial.at-5.bundle.json"};
ledger.pending_operation=null;ledger.finished=true;run.save();
// Raw process files stay local until the common collector admits each byte.
write("fixtures/evidence/answer-calibration.json",ledger);
console.log(JSON.stringify({engine_executions:ledger.engine_executions,maximum:360,tutorial_answered:true,eight_cut_restored:true}));
