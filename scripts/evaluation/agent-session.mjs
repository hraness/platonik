// Bounded developer-agent playtesting through the public CLI. No simulation here.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const [directory, operation, input] = process.argv.slice(2);
if (!directory || !operation) throw new Error("Use: node scripts/evaluation/agent-session.mjs <new-session-dir> init <frugal|resilient> | candidate <pair.json> | freeze <candidate-id> | transfer | finish");
const root = path.resolve(directory);
const binary = path.resolve("target/release/platonik");
const metaPath = path.join(root, "session.json");
const digest = value => createHash("sha256").update(value).digest("hex");
let meta;
if (operation === "init") {
  if (!["frugal", "resilient"].includes(input)) throw new Error("Unknown ambition");
  fs.mkdirSync(root);
  meta = { schema: "platonik-agent-session-v1", ambition: input, maximum_engine_executions: 1480,
    engine_executions: 0, calls: [], candidates: [], revision: 0, trials: 0, frozen: null };
} else meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
const saveMeta = () => fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
function stop(reason, accountingUnknown = false) {
  meta.stopped = reason;
  if (accountingUnknown) meta.accounting_incomplete = true;
  saveMeta();
  throw new Error(reason);
}
if (meta.stopped) throw new Error(`Diagnostic stopped: ${meta.stopped}`);
if (meta.pending_call) stop("A prior CLI invocation has no complete accounting record; reconcile outside this diagnostic", true);
if (meta.candidates.some(candidate => ["submitted", "admitted"].includes(candidate.admission))) {
  stop("A prior candidate operation was interrupted; preserve its consumed slot and reconcile outside this diagnostic");
}
function cli(args, updateState = true) {
  const reserved = 8 * meta.trials + 16;
  if (meta.engine_executions + reserved > meta.maximum_engine_executions) stop("Insufficient reserved real-execution budget for another command");
  const index = meta.calls.length;
  meta.pending_call = { index, reserved_engine_executions: reserved };
  saveMeta();
  const started = process.hrtime.bigint();
  const result = spawnSync(binary, ["--metrics", ...args], { encoding: "utf8", maxBuffer: 70 * 1024 * 1024, timeout: 60_000 });
  const elapsed_ms = Number(process.hrtime.bigint() - started) / 1e6;
  const stdoutName = `${String(index).padStart(3, "0")}.stdout.json`;
  const stderrName = `${String(index).padStart(3, "0")}.stderr.jsonl`;
  fs.writeFileSync(path.join(root, stdoutName), result.stdout ?? "", { flag: "wx" });
  fs.writeFileSync(path.join(root, stderrName), result.stderr ?? "", { flag: "wx" });
  const record = { index, args: args.map(arg => arg.startsWith(root) ? path.relative(root, arg) : arg),
    exit_code: result.status, elapsed_ms, metrics: null, reserved_engine_executions: reserved, stdout: stdoutName,
    stdout_sha256: digest(result.stdout ?? ""), stderr: stderrName };
  meta.calls.push(record);
  saveMeta();
  let stderr;
  try { stderr = (result.stderr ?? "").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)); }
  catch { stop(`Malformed metrics stream in call ${index}; raw output preserved`, true); }
  const rows = stderr.filter(row => row?.schema === "platonik-process-metrics-v1");
  const metrics = rows[0];
  if (rows.length !== 1 || !Number.isSafeInteger(metrics?.engine_executions) || metrics.engine_executions < 0
    || !Number.isSafeInteger(metrics?.elapsed_micros) || metrics.elapsed_micros < 0) {
    stop(`Missing, duplicate, or invalid metrics in call ${index}; actual total is incomplete`, true);
  }
  record.metrics = metrics;
  meta.engine_executions += metrics.engine_executions;
  delete meta.pending_call;
  saveMeta();
  if (result.error || result.status === null) stop(`Uncertain CLI completion in call ${index}: ${result.error?.message ?? result.signal}`);
  if (metrics.engine_executions > reserved || meta.engine_executions > meta.maximum_engine_executions) stop("Observed execution budget exceeded its reservation; full count preserved");
  if (![0, 1].includes(result.status)) {
    if (result.status !== 2) stop(`Unexpected CLI exit ${result.status} in call ${index}`);
    const error = new Error(`CLI rejected call ${index}: ${result.stderr}`);
    error.exitCode = result.status;
    throw error;
  }
  let report;
  try { report = JSON.parse(result.stdout); }
  catch { stop(`Invalid success output from call ${index}; state may have changed`); }
  if (updateState && report.campaign) {
    meta.revision = report.revision; meta.trials = report.campaign.trials.length;
    meta.work = report.campaign.work; meta.latest_report = stdoutName;
    saveMeta();
  }
  return report;
}
function act(command, id) {
  const before = JSON.parse(fs.readFileSync(path.join(root, meta.latest_report), "utf8"));
  const file = path.join(root, `action-${id}.json`);
  fs.writeFileSync(file, `${JSON.stringify(command)}\n`, { flag: "wx" });
  try {
    return cli(["expedition", "act", path.join(root, "save"), file, "--expect-revision", String(meta.revision), "--request-id", id]);
  } catch (error) {
    if (!meta.stopped && error.exitCode === 2) {
      let after;
      try { after = cli(["expedition", "status", path.join(root, "save")], false); }
      catch { stop(`Cannot reconcile rejected action ${id}; keep the diagnostic stopped`); }
      if (after.revision !== before.revision || JSON.stringify(after.campaign) !== JSON.stringify(before.campaign)) {
        stop(`Rejected action ${id} changed the journal; explicit recovery is required outside this diagnostic`);
      }
    }
    throw error;
  }
}
const training = ["opening-normal", "opening-collapse", "ark-plan-a", "ark-plan-b"];
const transfer = ["transfer-early-collapse", "transfer-reversed-collapse", "transfer-delayed-plan-a", "transfer-delayed-plan-b"];
if (operation === "init") {
  cli(["expedition", "init", path.join(root, "save"), "Agent field trial", input]);
} else if (operation === "candidate") {
  if (meta.frozen || meta.candidates.length >= 4) throw new Error("Four candidate batches only, before freeze");
  const entry = { sequence: meta.candidates.length + 1, id: null, source_sha256: null,
    admission: "submitted", trials: [], passed: false };
  meta.candidates.push(entry); saveMeta();
  try {
    const source = fs.readFileSync(input, "utf8");
    const sourceName = `submission-${entry.sequence}.json`;
    fs.writeFileSync(path.join(root, sourceName), source, { flag: "wx" });
    Object.assign(entry, { source: sourceName, source_sha256: digest(source) });
    saveMeta();
    const candidate = JSON.parse(source);
    if (typeof candidate?.id !== "string" || !/^[a-z][a-z0-9-]{0,24}$/.test(candidate.id)
      || meta.candidates.some(c => c !== entry && c.id === candidate.id)) throw new Error("Use a fresh candidate ID");
    fs.writeFileSync(path.join(root, `candidate-${candidate.id}.json`), source, { flag: "wx" });
    entry.id = candidate.id; saveMeta();
    let courier = candidate.courier ?? "recovery";
    let controller = candidate.controller ?? "memory";
    if (candidate.courier_program) {
      courier = `${candidate.id}-courier`;
      act({ kind: "grow", id: courier, name: courier, parent: "recovery", program: candidate.courier_program }, `${candidate.id}-grow-courier`);
    }
    if (candidate.controller_program) {
      controller = `${candidate.id}-keeper`;
      act({ kind: "grow", id: controller, name: controller, parent: "memory", program: candidate.controller_program }, `${candidate.id}-grow-keeper`);
    }
    const applied = JSON.parse(fs.readFileSync(path.join(root, meta.latest_report), "utf8")).campaign;
    const pair = { courier: applied.creations.find(c => c.id === courier)?.program,
      controller: applied.creations.find(c => c.id === controller)?.program };
    if (!pair.courier || !pair.controller) throw new Error("Unknown creation; this batch slot remains consumed");
    const pairBytes = JSON.stringify(pair);
    Object.assign(entry, { courier, controller, admission: "admitted", bundle_sha256: digest(pairBytes), policy_bytes: Buffer.byteLength(pairBytes) });
    saveMeta();
    const trials = entry.trials;
    for (const case_id of training) {
      const result = act({ kind: "trial", case_id, courier, controller }, `${candidate.id}-${case_id}`);
      trials.push(result.campaign.trials.at(-1));
      saveMeta();
    }
    Object.assign(entry, { admission: "completed", passed: trials.every(t => t.passed), work: trials.reduce((sum, t) => sum + t.work, 0) });
    saveMeta();
  } catch (error) {
    entry.admission = entry.trials.length ? "partial" : "rejected";
    entry.error = error.message;
    entry.work = entry.trials.reduce((sum, trial) => sum + trial.work, 0);
    saveMeta();
    throw error;
  }
} else if (operation === "freeze") {
  if (meta.candidates.length !== 4 || meta.frozen) throw new Error("Freeze once, after four consumed candidate slots");
  const candidate = meta.candidates.find(c => c.id === input && c.passed);
  if (!candidate) throw new Error("Choose a candidate that passed every training case");
  const best = meta.candidates.filter(c => c.passed).toSorted((a, b) => a.work - b.work || a.policy_bytes - b.policy_bytes || a.sequence - b.sequence)[0];
  if (candidate !== best) throw new Error(`The predeclared ordering selects ${best.id}`);
  act({ kind: "freeze", courier: candidate.courier, controller: candidate.controller }, "freeze");
  meta.frozen = candidate.id; saveMeta();
} else if (operation === "transfer") {
  if (!meta.frozen || meta.transfer_complete) throw new Error("Each transfer case runs once after freeze");
  const candidate = meta.candidates.find(c => c.id === meta.frozen);
  const trials = meta.transfer ??= [];
  saveMeta();
  for (const case_id of transfer) {
    if (trials.some(trial => trial.case_id === case_id)) continue;
    const commandFile = path.join(root, `action-confirm-${case_id}.json`);
    if (fs.existsSync(commandFile)) stop(`Transfer ${case_id} has an action intent without a completed metadata row; reconcile it outside this diagnostic`);
    const result = act({ kind: "trial", case_id, courier: candidate.courier, controller: candidate.controller }, `confirm-${case_id}`);
    trials.push(result.campaign.trials.at(-1));
    saveMeta();
  }
  meta.transfer_complete = true; saveMeta();
} else if (operation === "finish") {
  if (!meta.transfer_complete || meta.finished) throw new Error("Finish once after all four transfer cases");
  const before = cli(["expedition", "verify", path.join(root, "save")]);
  const bundle = cli(["expedition", "export", path.join(root, "save")], false);
  const bundlePath = path.join(root, "export.json");
  fs.writeFileSync(bundlePath, JSON.stringify(bundle), { flag: "wx" });
  const restored = cli(["expedition", "import", bundlePath, path.join(root, "restored")], false);
  const replay = cli(["expedition", "verify", path.join(root, "restored")], false);
  if (JSON.stringify(before.campaign) !== JSON.stringify(restored.campaign) || JSON.stringify(before.campaign) !== JSON.stringify(replay.campaign)) throw new Error("Restored campaign differs");
  meta.finished = { campaign_equal: true, complete: before.progress.field_expedition_complete,
    export_bytes: fs.statSync(bundlePath).size, program_hashes: before.campaign.creations.map(c => ({ id: c.id, parent: c.parent, hash: c.program_hash })) };
  saveMeta();
} else throw new Error("Unknown operation");
console.log(JSON.stringify({ ambition: meta.ambition, revision: meta.revision, trials: meta.trials,
  work: meta.work, engine_executions: meta.engine_executions, candidates: meta.candidates,
  frozen: meta.frozen, transfer: meta.transfer, finished: meta.finished }, null, 2));
