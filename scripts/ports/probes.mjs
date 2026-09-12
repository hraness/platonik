// Rehashed custody, acknowledgment and conservation forgeries against copied receipts/bundles. No live data.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { read, sha, identity } from "./runner.mjs";
import { write } from "./trajectory.mjs";

export const receiptProbeIds=['forged-request-bit','forged-request-origin','forged-ack-provenance','early-ack','duplicated-service-credit','spent-spare','unearned-drop','cross-port-service','forged-custody-report'];
export const bundleProbeIds=['forged-checkpoint-cargo','foreign-future-fuel','foreign-obligation'];
export function mutateReceipt(original,kind,roles) {
 const receipt=structuredClone(original),frames=receipt.result.frames;
 const signal=(outcome,link)=>{const row=frames.flatMap(frame=>frame.signals).find(row=>row.outcome===outcome&&row.signal.link===link);assert(row);return row.signal;};
 if(kind==='forged-request-bit')signal('delivered',41).bit=!signal('delivered',41).bit;
 else if(kind==='forged-request-origin')signal('consumed',41).from.id=13;
 else if(kind==='forged-ack-provenance')signal('consumed',43).receipt_spark=101;
 else if(kind==='early-ack')signal('consumed',43).sent_tick=1;
 else if(kind==='duplicated-service-credit'){
  const final=frames.at(-1).state;assert(final.delivered.length);final.delivered.push(structuredClone(final.delivered[0]));receipt.result.final_state=structuredClone(final);
 }else if(kind==='spent-spare'){
  const final=frames.at(-1).state,source=final.sources.find(row=>row.id===10);assert(source.sparks.some(row=>row.id===101));source.sparks=source.sparks.filter(row=>row.id!==101);receipt.result.final_state=structuredClone(final);
 }else if(kind==='unearned-drop'){
  const action=frames.flatMap(frame=>frame.activations).find(row=>row.cell===roles.couriers[0]&&row.action.kind==='drop'&&row.success);assert(action);action.success=false;
 }else if(kind==='cross-port-service'){
  const final=frames.at(-1).state,delivery=final.delivered.find(row=>row.spark.id===100);assert(delivery);delivery.beacon=22;receipt.result.final_state=structuredClone(final);
 }else if(kind==='forged-custody-report')signal('queued',44).receipt_spark=101;
 else throw new Error('Unknown receipt probe');
 receipt.result_hash=identity(receipt.result);return receipt;
}
export function mutateBundle(original,kind,roles){
 const bundle=structuredClone(original),events=bundle.entries.map(entry=>structuredClone(bundle.objects[entry.event.event_hash]));
 const checkpoint=events.at(-1).result.value;assert.equal(events.at(-1).result.kind,'paused');
 if(kind==='forged-checkpoint-cargo')checkpoint.frames.at(-1).state.cells.find(cell=>cell.id===roles.couriers[0]).cargo={id:999,bit:false};
 else if(kind==='foreign-future-fuel')checkpoint.experiment.fuel++;
 else if(kind==='foreign-obligation')checkpoint.experiment.cells.find(cell=>cell.id===roles.requesters[0]).memory[2]^=1;
 else throw new Error('Unknown bundle probe');
 checkpoint.experiment_hash=identity(checkpoint.experiment);checkpoint.prefix_hash=identity(checkpoint.frames);bundle.objects={};
 bundle.entries.forEach((entry,index)=>{entry.event.event_hash=identity(events[index]);entry.previous_hash=index?identity(bundle.entries[index-1]):null;bundle.objects[entry.event.event_hash]=events[index];});return bundle;
}
export function probes(run, ledger, plan) {
  const source = ledger.replays[0], receiptPath = path.join(run.root, source.receipt);
  const bundlePath = path.join(run.root, source.restorations[0].bundle);
  const receiptBytes = fs.readFileSync(receiptPath), bundleBytes = fs.readFileSync(bundlePath);
  const receipt = JSON.parse(receiptBytes), bundle = JSON.parse(bundleBytes);
  for (const [type, ids] of [["receipt", receiptProbeIds], ["bundle", bundleProbeIds]]) for (const id of ids) {
    const row = { id, type, status: "running", first_call: ledger.calls.length };
    ledger.probes.push(row); run.save();
    try {
      const changed = type === "receipt" ? mutateReceipt(receipt, id, plan.roles) : mutateBundle(bundle, id, plan.roles);
      const input = path.join(run.root, `probe-${id}.json`); write(input, changed);
      row.input = path.relative(run.root, input); row.input_sha256 = sha(fs.readFileSync(input));
      const destination = path.join(run.root, `rejected-${id}`);
      const result = run.cli(type === "receipt" ? ["habitat", "ports-check", input] : ["habitat", "import", input, destination],
        { reservation: type === "receipt" ? 2 : 64, accepted: [2] });
      assert.equal(result.call.exit_code, 2);
      if (type === "bundle") assert(!fs.existsSync(destination), "Reject before creating a forged save");
      row.status = "pass"; row.rejected = true;
    } catch (error) {
      row.status = "fail"; row.error = "Probe did not produce its declared rejection; raw call diagnostics remain retained.";
      if (ledger.stopped || ledger.pending_call || ledger.accounting_incomplete) { run.save(); throw error; }
    }
    row.after_call = ledger.calls.length;
    row.engine_executions = ledger.calls.slice(row.first_call, row.after_call).reduce((sum, call) => sum + call.metrics.engine_executions, 0);
    run.save();
  }
  assert(fs.readFileSync(receiptPath).equals(receiptBytes)); assert(fs.readFileSync(bundlePath).equals(bundleBytes));
  assert.equal(ledger.probes.length, 12);
}
