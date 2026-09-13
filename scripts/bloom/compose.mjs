// Reduced one-lane composition admission for a checked Bloom receipt.
// This binds the selected confirmation to a physical depot report and service;
// it does not invoke the separate v3 two-lane port checker.
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";

const [receiptFile, gradeFile, outputFile] = process.argv.slice(2);
assert(receiptFile && gradeFile && outputFile, "compose.mjs RECEIPT GRADE OUTPUT");
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const identity = value => `sha256:${crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const receipt = read(receiptFile), grade = read(gradeFile);
assert.equal(grade.schema, "platonik-bloom-v1");
assert(grade.bloomed && receipt.result.status === "complete" && receipt.result.ticks_completed === 128);
assert.equal(grade.experiment_hash, receipt.experiment_hash);
assert.equal(grade.result_hash, receipt.result_hash);
const selection = grade.selection;
assert(selection && selection.tick < 96);
const winner = grade.candidates[selection.candidate], loser = grade.candidates[1 - selection.candidate];
assert(winner && loser && winner.program_hash && winner.confirmation_requested >= 96);
const frames = receipt.result.frames;
const consumed = frames.flatMap(frame => (frame.signals ?? []).filter(signal => signal.outcome === "consumed").map(signal => ({ tick: frame.tick, signal: signal.signal })));
const request = consumed.find(row => row.signal.from.kind === "cell" && row.signal.from.id === 5 && row.signal.to_cell === winner.child && row.signal.bit && row.signal.sent_tick >= 96);
assert(request, "Selected child has no checked post-selection request");
assert(frames.find(frame => frame.tick === request.signal.sent_tick)?.activations.some(activation => activation.cell === 5 && activation.success && activation.action.kind === "send" && activation.action.port === request.signal.from.port), "Request lacks selector action evidence");
const priorReport = consumed.find(row => row.signal.from.kind === "depot" && row.signal.from.id === winner.depot && row.signal.receipt_spark === winner.trial_parcel);
assert(priorReport, "Selected trial has no checked depot report topology");
const ack = consumed.find(row => row.signal.from.kind === "depot" && row.signal.from.id === winner.depot && row.signal.receipt_spark === winner.confirmation_parcel && row.signal.sent_tick >= selection.tick && row.signal.link === priorReport.signal.link && row.signal.to_cell === priorReport.signal.to_cell && row.signal.to_port === priorReport.signal.to_port && row.signal.bit === false);
assert(ack, "Selected confirmation has no physical depot report");
assert(request.signal.sent_tick < winner.confirmation_pickup && winner.confirmation_pickup <= winner.confirmation_accepted && winner.confirmation_accepted <= ack.signal.sent_tick);
const last = frames.at(-1);
const birth = last.state.construction?.births.find(entry => entry.body.cell.id === winner.child);
assert.equal(identity(birth?.body.cell.program), winner.program_hash, "Selected program hash is not bound to the born child");
const delivered = last.state.delivered.find(entry => entry.spark.id === winner.confirmation_parcel && entry.beacon === 20);
assert(delivered, "Selected confirmation has no physical service");
assert.equal(delivered.tick, winner.confirmation_serviced);
const loserSource = last.state.sources.find(source => source.id === loser.source);
assert(loserSource?.sparks.some(spark => spark.id === loser.confirmation_parcel), "Loser confirmation was not preserved as the spare");
const result = {
  schema: "platonik-composition-v1",
  scope: "Reduced one-lane Bloom composition: the selected generated child fulfills its later confirmation as a checked request, depot report, and service. The v3 two-lane port contract remains separate.",
  base_experiment_hash: receipt.experiment_hash,
  base_result_hash: receipt.result_hash,
  bloom_grade_hash: identity(grade),
  selected_child: winner.child,
  selected_program_hash: winner.program_hash,
  request: { tick: request.tick, sent_tick: request.signal.sent_tick, signal: request.signal.id, link: request.signal.link },
  pickup: winner.confirmation_pickup,
  accepted: winner.confirmation_accepted,
  ack: { tick: ack.tick, sent_tick: ack.signal.sent_tick, signal: ack.signal.id, link: ack.signal.link, receipt_spark: ack.signal.receipt_spark },
  serviced: delivered.tick,
  spare: { source: loser.source, spark: loser.confirmation_parcel },
  work_total: Object.values(receipt.result.costs).reduce((sum, value) => sum + value, 0),
  controls: [],
};
fs.writeFileSync(outputFile, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ composition: outputFile, selected_child: result.selected_child, request_tick: result.request.tick, ack_tick: result.ack.tick, serviced: result.serviced }));
