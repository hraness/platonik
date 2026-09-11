import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const freeze = read("fixtures/evidence/expedition-freeze.json");
for (const [file, hash] of Object.entries(freeze.source_files_sha256)) {
  if (sha(fs.readFileSync(file)) !== hash) throw new Error(`Frozen source changed: ${file}`);
}
const arms = [];
for (const id of ["frugal", "resilient"]) {
  const directory = `.platonik/evaluation/${id}`;
  const session = read(`${directory}/session.json`);
  if (!session.finished || session.trials !== 20 || session.candidates.length !== 4 || session.stopped || session.accounting_incomplete || session.pending_call || session.calls.some(c => !c.metrics)) throw new Error(`Incomplete agent accounting: ${id}`);
  const campaign = read(`${directory}/${session.latest_report}`).campaign;
  const original = read(`${directory}/000.stdout.json`).campaign;
  const parents_preserved = original.creations.every(parent => JSON.stringify(parent) === JSON.stringify(campaign.creations.find(c => c.id === parent.id)));
  if (!parents_preserved) throw new Error(`Parent changed: ${id}`);
  const exportPath = `${directory}/export.json`;
  const bundleFile = `fixtures/evidence/expedition-${id}.bundle.json`;
  fs.copyFileSync(exportPath, bundleFile, fs.constants.COPYFILE_EXCL);
  const chosen = session.candidates.find(c => c.id === session.frozen);
  const courier = campaign.creations.find(c => c.id === chosen.courier);
  const controller = campaign.creations.find(c => c.id === chosen.controller);
  const bundle = read(exportPath);
  const receipts = new Map(Object.values(bundle.objects).filter(event => event.kind === "completed")
    .map(event => [`sha256:${sha(JSON.stringify(event.receipt))}`, event.receipt]));
  const traces = [...chosen.trials, ...session.transfer].map(trial => {
    const receipt = receipts.get(trial.receipt_hash);
    if (!receipt) throw new Error(`Missing selected receipt: ${trial.receipt_hash}`);
    return { case_id: trial.case_id, receipt_hash: trial.receipt_hash, result_hash: receipt.result_hash,
      delivery_ticks: receipt.result.final_state.delivered.map(delivery => delivery.tick), costs: receipt.result.costs,
      courier_first_twelve_positions: receipt.result.frames.slice(0, 13).map(frame => ({ tick: frame.tick, position: frame.state.cells.find(cell => cell.id === 1)?.position })),
      closure_events: receipt.result.frames.filter(frame => frame.events.some(event => event.kind === "edge_blocked")).map(frame => ({ tick: frame.tick, events: frame.events })),
      controller_at_contact_end: receipt.result.frames.find(frame => frame.tick === 48)?.state.cells.find(cell => cell.id === 3) ?? null };
  });
  const metrics = session.calls.map(call => ({ index: call.index, args: call.args,
    exit_code: call.exit_code, elapsed_ms: call.elapsed_ms, metrics: call.metrics, stdout_sha256: call.stdout_sha256 }));
  const allExecutions = metrics.reduce((sum, call) => sum + call.metrics.engine_executions, 0);
  if (allExecutions !== session.engine_executions || allExecutions > 1480) throw new Error(`Wrong execution total: ${id}`);
  arms.push({ id, bundle_file: bundleFile, bundle_sha256: sha(fs.readFileSync(bundleFile)),
    candidates: session.candidates, frozen: session.frozen,
    frozen_pair: { courier: courier.program, controller: controller.program, courier_hash: courier.program_hash, controller_hash: controller.program_hash },
    transfer: session.transfer, selected_trace_summaries: traces, trials: session.trials, work: session.work, engine_executions: allExecutions,
    cli_wall_ms: metrics.reduce((sum, call) => sum + call.elapsed_ms, 0), cli_metrics: metrics,
    parents_preserved, imported_campaign_equal: session.finished.campaign_equal,
    complete: session.finished.complete, artifact_bytes: fs.statSync(bundleFile).size,
    agent_notes_sha256: sha(fs.readFileSync(`${directory}/agent-notes.md`)), external_agent_tokens: null });
}
const baselines = read(".platonik/evaluation/baselines/report.json");
const capacity = read(".platonik/evaluation/capacity/report.json");
const probesPath = process.argv[2] ?? ".platonik/evaluation/probes/ledger.json";
const probes = JSON.parse(JSON.stringify(read(probesPath)).replaceAll(`${path.resolve(".")}/`, ""));
probes.raw_ledger_sha256 = sha(fs.readFileSync(probesPath));
probes.path_projection = "Repository-relative command paths replace local checkout prefixes; raw byte-output hashes and execution metrics are unchanged.";
const totalExecutions = arms.reduce((sum, arm) => sum + arm.engine_executions, 0) + baselines.engine_executions + capacity.engine_executions + probes.engine_executions;
if (totalExecutions > 4096 || !probes.metrics_complete || probes.stopped || probes.pending_call) throw new Error("Diagnostic budget or probe accounting failed");
const result = { engine_executions: totalExecutions, logical_evaluations: arms.reduce((sum, arm) => sum + arm.trials, 0) + baselines.cases.length + probes.logical_evaluations, schema: "platonik-expedition-study-v1", measured_at: new Date().toISOString(),
  protocol_sha256: freeze.protocol_sha256, source_tree_digest: freeze.source_tree_digest,
  scope: "Two developer agents, equal four-candidate allowances, different prior task context, public source and predeclared transfer recipes. This is a finite engineering demonstration; reasoning-token use is unknown. No human playtest, hidden evaluator, broad generalization, or scientific novelty claim.",
  arms, baselines, probes, capacity };
fs.writeFileSync("fixtures/evidence/expedition-study.json", `${JSON.stringify(result)}\n`, { flag: "wx" });
console.log(JSON.stringify({ arms: arms.map(a => ({ id: a.id, complete: a.complete, engine_executions: a.engine_executions })),
  baseline_executions: baselines.engine_executions, capacity_executions: capacity.engine_executions, probes_file: probesPath }));
