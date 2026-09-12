// Rehashed arithmetic/control forgeries against copied receipts/bundles. No live data.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { read, sha, identity } from "./runner.mjs";
import { write } from "./trajectory.mjs";

export function mutateReceipt(original, kind, roles) {
  const receipt=structuredClone(original),frames=receipt.result.frames;
  const event=(outcome,link)=>{const found=frames.flatMap(frame=>frame.signals).find(event=>event.outcome===outcome&&event.signal.link===link);assert(found);return found;};
  if(kind==='changed-clock-bit')event('queued',40).signal.bit=!event('queued',40).signal.bit;
  else if(kind==='forged-a-provenance')event('delivered',44).signal.receipt_spark=999;
  else if(kind==='changed-b-input')event('delivered',45).signal.bit=!event('delivered',45).signal.bit;
  else if(kind==='changed-sum-output')event('queued',46).signal.bit=!event('queued',46).signal.bit;
  else if(kind==='changed-carry-memory'){
    const tick=event('queued',46).signal.sent_tick;
    frames.find(frame=>frame.tick===tick).state.cells.find(cell=>cell.id===roles.adder).memory[0]^=1;
  }else if(kind==='forged-selected-origin')event('consumed',47).signal.from.id=roles.adder;
  else if(kind==='shortened-outage')frames.find(frame=>frame.tick===49).state.links.find(link=>link.id===47).enabled=true;
  else if(kind==='forged-payload-delivery'){
    const delivery=frames.find(frame=>frame.tick===52).state.delivered.find(delivery=>delivery.spark.id===200);assert(delivery);delivery.spark.id=999;
  }else if(kind==='unearned-route-success'){
    const action=frames.find(frame=>frame.tick===51).activations.find(action=>action.cell===roles.keeper);assert(action&&!action.success);action.success=true;
  }else throw new Error('Unknown receipt probe');
  receipt.result_hash=identity(receipt.result);return receipt;
}
export function mutateBundle(original,kind,roles){
  const bundle=structuredClone(original),events=bundle.entries.map(entry=>structuredClone(bundle.objects[entry.event.event_hash]));
  const checkpoint=events.at(-1).result.value;assert.equal(events.at(-1).result.kind,'paused');
  if(kind==='forged-checkpoint-cargo')checkpoint.frames.at(-1).state.cells.find(cell=>cell.id===roles.clock_courier).cargo={id:999,bit:false};
  else if(kind==='foreign-future-fuel')checkpoint.experiment.fuel+=1;
  else if(kind==='foreign-operand')checkpoint.experiment.cells.find(cell=>cell.id===roles.b_shifter).memory[0]^=1;
  else throw new Error('Unknown bundle probe');
  checkpoint.experiment_hash=identity(checkpoint.experiment);checkpoint.prefix_hash=identity(checkpoint.frames);bundle.objects={};
  bundle.entries.forEach((entry,index)=>{entry.event.event_hash=identity(events[index]);entry.previous_hash=index?identity(bundle.entries[index-1]):null;bundle.objects[entry.event.event_hash]=events[index];});return bundle;
}
export const receiptProbeIds=['changed-clock-bit','forged-a-provenance','changed-b-input','changed-sum-output','changed-carry-memory','forged-selected-origin','shortened-outage','forged-payload-delivery','unearned-route-success'];
export const bundleProbeIds=['forged-checkpoint-cargo','foreign-future-fuel','foreign-operand'];
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
      const result = run.cli(type === "receipt" ? ["habitat", "ark-check", input] : ["habitat", "import", input, destination],
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
