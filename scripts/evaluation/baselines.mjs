import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
const root = ".platonik/evaluation/baselines";
fs.mkdirSync(root);
const binary = path.resolve("target/release/platonik");
const freeze = JSON.parse(fs.readFileSync("fixtures/evidence/expedition-freeze.json", "utf8"));
const compact = JSON.parse(fs.readFileSync("public/bridge/opening-normal.experiment.json", "utf8")).cells.find(c => c.id === 1).program;
const calls = [], cases = [];
const hash = text => createHash("sha256").update(text).digest("hex");
function invoke(args, id, expected) {
  if (calls.reduce((sum, row) => sum + row.metrics.engine_executions, 0) + 1 > 32) throw new Error("Baseline execution reservation exhausted");
  const start = process.hrtime.bigint();
  const result = spawnSync(binary, ["--metrics", ...args], { encoding: "utf8", maxBuffer: 34 * 1024 * 1024, timeout: 30_000 });
  const elapsed_ms = Number(process.hrtime.bigint() - start) / 1e6;
  fs.writeFileSync(path.join(root, `${id}.stdout.json`), result.stdout, { flag: "wx" });
  fs.writeFileSync(path.join(root, `${id}.stderr.jsonl`), result.stderr, { flag: "wx" });
  const metrics = result.stderr.trim().split("\n").map(JSON.parse).find(m => m.schema === "platonik-process-metrics-v1");
  calls.push({ id, exit_code: result.status, elapsed_ms, metrics, stdout_sha256: hash(result.stdout) });
  fs.writeFileSync(path.join(root, "calls.json"), JSON.stringify(calls, null, 2));
  if (!metrics || metrics.engine_executions !== 1 || !expected.includes(result.status)) throw new Error(`Baseline failed: ${id}`);
  return JSON.parse(result.stdout);
}
for (const baseline of ["public-recovery", "public-compact"]) {
  for (const frozen of freeze.preflight.cases) {
    const experiment = JSON.parse(fs.readFileSync(`.platonik/evaluation/preflight/${frozen.id}.experiment.json`, "utf8"));
    if (baseline === "public-compact") experiment.cells.find(c => c.id === 1).program = compact;
    const id = `${baseline}-${frozen.id}`;
    const input = path.join(root, `${id}.input.json`);
    fs.writeFileSync(input, JSON.stringify(experiment), { flag: "wx" });
    const receipt = invoke(["run", input], `${id}-run`, [0, 1]);
    const verified = invoke(["verify", path.join(root, `${id}-run.stdout.json`)], `${id}-verify`, [0]);
    cases.push({ baseline, case_id: frozen.id, passed: receipt.result.outcome.passed, verified: verified.verified,
      work: verified.work, ticks: verified.ticks_completed, experiment_hash: receipt.experiment_hash,
      result_hash: receipt.result_hash, receipt_bytes: fs.statSync(path.join(root, `${id}-run.stdout.json`)).size });
  }
}
const report = { schema: "platonik-expedition-baselines-v1", protocol_sha256: freeze.protocol_sha256,
  cases, calls, engine_executions: calls.reduce((sum, row) => sum + row.metrics.engine_executions, 0) };
fs.writeFileSync(path.join(root, "report.json"), JSON.stringify(report, null, 2), { flag: "wx" });
console.log(JSON.stringify({ reference_evaluations: cases.length, engine_executions: report.engine_executions, verified: cases.every(c => c.verified) }));
