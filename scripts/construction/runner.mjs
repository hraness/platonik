// Audited subprocess accounting for one bounded diagnostic owner. No model logic.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

export const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
export const identity = value => `sha256:${sha(JSON.stringify(value))}`;
export const binary = path.resolve("target/release/platonik");
export function createLedger(directory, maximum, details = {}) {
  fs.mkdirSync(directory, { recursive: false });
  return { schema: "platonik-construction-ledger-v1", ...details, maximum_engine_executions: maximum,
    engine_executions: 0, calls: [], pending_call: null, stopped: null };
}

export function runner(directory, ledger) {
  const root = fs.realpathSync(directory);
  const ledgerPath = path.join(root, "ledger.json");
  const save = () => fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  const stop = (reason, unknown = false) => {
    ledger.stopped = reason;
    if (unknown) ledger.accounting_incomplete = true;
    save(); throw new Error(reason);
  };
  if (ledger.stopped || ledger.pending_call) throw new Error("Reconcile the preserved interrupted diagnostic before running more commands.");
  save();
  function cli(args, { reservation = 64, accepted = [0, 1], captureRss = false, executable = binary, metricsPrefix = true } = {}) {
    if (ledger.engine_executions + reservation > ledger.maximum_engine_executions) stop("Insufficient reserved real-execution allowance.");
    const index = ledger.calls.length;
    ledger.pending_call = { index, reservation, args: args.map(arg => arg.startsWith(root) ? path.relative(root, arg) : arg) };
    save();
    const began = process.hrtime.bigint();
    if (captureRss && process.platform !== "darwin") stop("This capacity driver requires macOS /usr/bin/time -l.");
    const childArgs = [...(metricsPrefix ? ["--metrics"] : []), ...args];
    const result = spawnSync(captureRss ? "/usr/bin/time" : executable,
      captureRss ? ["-l", executable, ...childArgs] : childArgs,
      { encoding: "utf8", maxBuffer: 70 * 1024 * 1024, timeout: 60_000 });
    const elapsed_ms = Number(process.hrtime.bigint() - began) / 1e6;
    const name = String(index).padStart(4, "0");
    const stdout = `${name}.stdout.json`, stderr = `${name}.stderr.jsonl`;
    fs.writeFileSync(path.join(root, stdout), result.stdout ?? "", { flag: "wx" });
    fs.writeFileSync(path.join(root, stderr), result.stderr ?? "", { flag: "wx" });
    const record = { index, executable: path.relative(process.cwd(), executable), args: ledger.pending_call.args, reserved_engine_executions: reservation,
      exit_code: result.status, elapsed_ms, stdout, stderr, stdout_sha256: sha(result.stdout ?? ""),
      stderr_sha256: sha(result.stderr ?? ""), metrics: null };
    ledger.calls.push(record); save();
    let metrics;
    try { metrics = (result.stderr ?? "").trim().split("\n").filter(line => line && (!captureRss || line.startsWith("{"))).map(JSON.parse).filter(row => row.schema === "platonik-process-metrics-v1"); }
    catch { stop(`Malformed metrics in call ${index}.`, true); }
    if (metrics.length !== 1 || !Number.isSafeInteger(metrics[0].engine_executions) || metrics[0].engine_executions < 0
      || !Number.isSafeInteger(metrics[0].elapsed_micros) || metrics[0].elapsed_micros < 0) stop(`Missing or invalid metrics in call ${index}.`, true);
    record.metrics = metrics[0];
    ledger.engine_executions += metrics[0].engine_executions;
    ledger.pending_call = null; save();
    if (captureRss) {
      const peak = /\b(\d+)\s+maximum resident set size/.exec(result.stderr ?? "");
      if (!peak || !Number.isSafeInteger(Number(peak[1]))) stop(`Missing peak RSS in call ${index}.`);
      record.peak_rss_bytes = Number(peak[1]); save();
    }
    if (result.error || result.status === null) stop(`Uncertain completion in call ${index}.`);
    if (metrics[0].engine_executions > reservation || ledger.engine_executions > ledger.maximum_engine_executions) stop(`Execution reservation exceeded in call ${index}.`);
    let value;
    try { value = JSON.parse(result.stdout); }
    catch { if (accepted.includes(result.status) && result.status !== 2) stop(`Invalid output in call ${index}.`); }
    if (!accepted.includes(result.status)) {
      const error = new Error(`CLI rejected call ${index}: ${result.stderr}`);
      error.exitCode = result.status; throw error;
    }
    return { value, call: record };
  }
  return { cli, save, stop, root, ledger };
}
