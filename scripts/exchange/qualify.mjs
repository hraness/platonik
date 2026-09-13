// A bounded recorder; simulation and grading are Rust CLI operations only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pack } from './pack.mjs';
import { createLedger, runner, sourceSnapshot, assertSource, sha, read, binary } from '../bloom/common.mjs';

const output = process.argv[2];
assert(output, 'qualify.mjs NEW_LEDGER_DIRECTORY');
const plan = {
  schema: 'platonik-bloom-exchange-protocol-v1',
  references: ['bloom-exchange-left','bloom-exchange-right','bloom-exchange-left-delay','bloom-exchange-right-delay','bloom-exchange-rotated-left','bloom-exchange-rotated-right'],
  controls: ['no-child-ack','forged-report','wrong-winner','early-ack','no-request','missing-spare','selector-bypass','stray-report'],
  control_case: 'bloom-exchange-left',
  maximum_engine_executions: 64,
  scope: 'One generated child fulfills one custody obligation through an explicit adapter within a fresh v4 world. Functional qualification only; not the legacy PortsGrade, full campaign, independent agent search, or capacity admission.',
};
const ledger = createLedger(output, plan);
ledger.schema='platonik-bloom-exchange-qualification-v1';
const run = runner(output,ledger);
ledger.source = sourceSnapshot(run.root,0);
for (const file of ['scripts/exchange/qualify.mjs','scripts/exchange/pack.mjs']) {
  ledger.source.files[file]=sha(fs.readFileSync(file));
  const dest=path.join(run.root,ledger.source.directory,file);
  fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(file,dest,fs.constants.COPYFILE_EXCL);
}
ledger.attempts=[];run.save();
for (const item of [...plan.references.map(case_id=>({case_id,kind:'reference'})),...plan.controls.map(kind=>({case_id:plan.control_case,kind}))]) {
  assertSource(ledger.source);
  const attempt={...item,index:ledger.attempts.length,completed:false,first_call:ledger.calls.length};
  ledger.attempts.push(attempt);run.save();
  const args=item.kind==='reference'?['habitat','case',item.case_id]:['habitat','exchange-control',item.case_id,item.kind];
  const exported=run.cli(args,{reservation:0});
  attempt.input=exported.call.stdout;run.save();
  const executed=run.cli(['run',path.join(run.root,attempt.input)],{reservation:1,accepted:[0,1]});
  attempt.receipt=executed.call.stdout;run.save();
  const graded=run.cli(['habitat','exchange-check',item.case_id,path.join(run.root,attempt.receipt)],{reservation:1});
  attempt.grade=graded.call.stdout;
  assert.equal(graded.value.schema,'platonik-bloom-exchange-v1');
  assert.equal(executed.value.result.status,'complete');
  assert.equal(executed.value.result.ticks_completed,128);
  attempt.exchange_passed=graded.value.exchange_passed;
  attempt.service_deliveries=executed.value.result.final_state.delivered.length;
  attempt.work=graded.value.work_total;
  attempt.completed=true;attempt.after_call=ledger.calls.length;run.save();
  assert.equal(attempt.exchange_passed,item.kind==='reference',JSON.stringify({item,grade:graded.value}));
}
assertSource(ledger.source);
ledger.finished={qualified:true,engine_executions:ledger.engine_executions,attempts:ledger.attempts.length};run.save();
pack(run.root);
