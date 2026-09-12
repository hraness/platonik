// Rehashed construction forgeries against copied receipts/bundles. No live data.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { read, sha, identity } from "./runner.mjs";
import { write } from "./trajectory.mjs";

export function mutateReceipt(original, kind, roles) {
  const receipt = structuredClone(original), frames = receipt.result.frames;
  const partial = frames.find(frame => frame.state.construction?.assemblies.some(a => a.copied.length > 0
    && a.copied.length < Buffer.byteLength(JSON.stringify(receipt.experiment.construction.blueprints[0].body))));
  assert(partial); const assembly = partial.state.construction.assemblies[0];
  const born = frames.find(frame => frame.state.construction?.births.length);
  assert(born); const birth = born.state.construction.births[0];
  if (kind === "duplicate-material") partial.state.construction.stocks[0].units.push(assembly.material);
  else if (kind === "changed-copy-byte") assembly.copied[0] ^= 1;
  else if (kind === "skipped-copy-work") assembly.copied.push(Buffer.from(JSON.stringify(receipt.experiment.construction.blueprints[0].body))[assembly.copied.length]);
  else if (kind === "stolen-reservation") assembly.parent = roles.courier;
  else if (kind === "premature-wire") assembly.wired.push(structuredClone(receipt.experiment.construction.blueprints[0].body.links[0]));
  else if (kind === "earlier-birth") birth.tick -= 1;
  else if (kind === "changed-child-program") birth.body.cell.program = { rules: [{ when: [], action: { kind: "wait" }, remember: null }] };
  else if (kind === "refunded-copying") {
    assert(partial.costs.copying > 0); partial.costs.copying -= 1;
    const build = partial.activations.find(action => action.cell === roles.builder && action.success && action.action.kind === "build");
    assert(build); build.work_after -= 1;
  } else if (["forged-return-spark", "forged-return-bit", "forged-return-origin"].includes(kind)) {
    const event = frames.flatMap(frame => frame.signals).find(event => event.outcome === "consumed" && event.signal.link === 43 && event.signal.receipt_spark != null);
    assert(event);
    if (kind === "forged-return-spark") event.signal.receipt_spark = 999;
    else if (kind === "forged-return-bit") event.signal.bit = !event.signal.bit;
    else event.signal.from.id = 7;
  } else if (kind === "same-tick-child-activation") {
    const later = frames.find(frame => frame.tick > born.tick && frame.activations.some(a => a.cell === roles.child));
    assert(later); born.activations.push(structuredClone(later.activations.find(a => a.cell === roles.child)));
  } else throw new Error(`Unknown receipt probe ${kind}`);
  receipt.result_hash = identity(receipt.result);
  return receipt;
}
export function mutateBundle(original, kind, roles) {
  const bundle = structuredClone(original);
  const events = bundle.entries.map(entry => structuredClone(bundle.objects[entry.event.event_hash]));
  const checkpoint = events.at(-1).result.value;
  assert.equal(events.at(-1).result.kind, "paused");
  const frame = checkpoint.frames.at(-1);
  if (kind === "forged-checkpoint-material") frame.state.cells.find(cell => cell.id === roles.builder).material = 1001;
  else if (kind === "foreign-future-fuel") checkpoint.experiment.fuel += 1;
  else if (kind === "foreign-blueprint") checkpoint.experiment.construction.blueprints[0].body.cell.memory[0] ^= 1;
  else throw new Error(`Unknown bundle probe ${kind}`);
  checkpoint.experiment_hash = identity(checkpoint.experiment); checkpoint.prefix_hash = identity(checkpoint.frames);
  bundle.objects = {};
  bundle.entries.forEach((entry, index) => {
    entry.event.event_hash = identity(events[index]);
    entry.previous_hash = index ? identity(bundle.entries[index - 1]) : null;
    bundle.objects[entry.event.event_hash] = events[index];
  });
  return bundle;
}
export const receiptProbeIds = ["duplicate-material", "changed-copy-byte", "stolen-reservation", "premature-wire", "earlier-birth", "refunded-copying", "forged-return-spark", "forged-return-bit", "forged-return-origin"];
export const bundleProbeIds = ["forged-checkpoint-material", "foreign-future-fuel", "foreign-blueprint"];
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
      const result = run.cli(type === "receipt" ? ["habitat", "answer", input] : ["habitat", "import", input, destination],
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
