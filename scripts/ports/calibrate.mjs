// One bounded six-cut replay plus the exact two-advance documentation path.
// Qualify process overhead before freezing optimizer allowance.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createLedger,runner} from "./runner.mjs";
import {read,write,identity,protocol,caseInput,sourceIdentity} from "./common.mjs";
import {trajectory} from "./trajectory.mjs";
const [directory]=process.argv.slice(2);assert(directory);
const plan=protocol(),ledger=createLedger(directory,256,{owner:"calibration",source:sourceIdentity(),pending_operation:"calibration"});
const run=runner(directory,ledger),spec=plan.replays[0],tutorial=plan.tutorial,world=caseInput(spec.case_id);
ledger.replay=trajectory(run,"calibration",world,{cuts:spec.cuts,restoreTicks:spec.restore_ticks});run.save();
const input=path.join(run.root,"tutorial.experiment.json");write(input,caseInput(tutorial.case_id));
let save=path.join(run.root,"tutorial-save"),report=run.cli(["habitat","init",save,input],{reservation:2,accepted:[0]}).value;
const opening=run.cli(["habitat","ports",save],{reservation:1,accepted:[0]}).value;assert(!opening.ports.commitments_passed&&opening.ports.tick===0);
report=run.cli(["habitat","advance",save,"--until",String(tutorial.pause_tick),"--expect-revision","0","--request-id",tutorial.first_request_id],{reservation:7,accepted:[0]}).value;
const partial=run.cli(["habitat","ports",save],{reservation:3,accepted:[0]}).value;assert(!partial.ports.commitments_passed&&partial.ports.tick===tutorial.pause_tick);
assert(partial.ports.custody_passed&&!partial.ports.acknowledgments_passed&&partial.ports.safety_passed);
assert(partial.ports.commitments.every(row=>row.accepted!==null&&row.acknowledged===null));
const bundle=run.cli(["habitat","export",save],{reservation:3,accepted:[0]}).value;
const file=path.join(run.root,`tutorial.at-${tutorial.pause_tick}.bundle.json`);write(file,bundle);
save=path.join(run.root,"tutorial-restored");const restored=run.cli(["habitat","import",file,save],{reservation:6,accepted:[0]}).value;
assert.equal(report.request_id,tutorial.first_request_id);assert.deepEqual(restored,{...report,request_id:null});
report=run.cli(["habitat","advance",save,"--until","128","--expect-revision","2","--request-id",tutorial.final_request_id],{reservation:13,accepted:[0]}).value;
const ports=run.cli(["habitat","ports",save],{reservation:5,accepted:[0]}).value;
assert(ports.ports.commitments_passed);assert.deepEqual(ports.habitat,{...report,request_id:null});
const verified=run.cli(["habitat","verify",save],{reservation:5,accepted:[0]}).value;assert.deepEqual(verified,ports.habitat);
const final=run.cli(["habitat","export",save],{reservation:5,accepted:[0]}).value;
write(path.join(run.root,"tutorial.final.bundle.json"),final);
assert.equal(ports.ports.result_hash,report.result_hash);
const reference=read(plan.qualification_file);const expected=reference.attempts[reference.batches[reference.finished.reference_batch].attempts.find(index=>reference.attempts[index].case_id===tutorial.case_id)];assert.equal(report.result_hash,expected.result_hash);assert.deepEqual(ports.ports,expected.grade);
ledger.tutorial={opening,partial,ports:ports.ports,uninterrupted_equal:true,restored_equal:true,final_bundle:"tutorial.final.bundle.json",restoration_bundle:`tutorial.at-${tutorial.pause_tick}.bundle.json`};
ledger.pending_operation=null;ledger.finished=true;run.save();
// Raw process files stay local until the common collector admits each byte.
write("fixtures/evidence/ports-calibration.json",ledger);
console.log(JSON.stringify({engine_executions:ledger.engine_executions,maximum:256,tutorial_commitments_passed:true,six_cut_restored:true}));
