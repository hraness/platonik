import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const destination = "fixtures/evidence/expedition-freeze.json";
if (fs.existsSync(destination)) throw new Error("The study already has a freeze record; preserve it before declaring a new epoch.");
const output = ".platonik/evaluation/preflight";
fs.mkdirSync(output, { recursive: true });
const binary = path.resolve("target/release/platonik");
const sha = value => createHash("sha256").update(value).digest("hex");
const files = ["Cargo.toml", "Cargo.lock", "rust-toolchain.toml", "fixtures/evidence/expedition-protocol.json",
  "scripts/evaluation/agent-session.mjs", "scripts/evaluation/freeze.mjs",
  ...fs.readdirSync("crates/platonik-core/src").filter(f => f.endsWith(".rs")).map(f => `crates/platonik-core/src/${f}`),
  ...fs.readdirSync("crates/platonik-cli/src").filter(f => f.endsWith(".rs")).map(f => `crates/platonik-cli/src/${f}`)];
const source = Object.fromEntries(files.sort().map(file => [file, sha(fs.readFileSync(file))]));
const protocol = JSON.parse(fs.readFileSync("fixtures/evidence/expedition-protocol.json", "utf8"));
const metrics = [];
function invoke(args, id) {
  const result = spawnSync(binary, ["--metrics", ...args], { encoding: "utf8", maxBuffer: 33 * 1024 * 1024, timeout: 30_000 });
  fs.writeFileSync(path.join(output, `${id}.stdout.json`), result.stdout, { flag: "wx" });
  fs.writeFileSync(path.join(output, `${id}.stderr.jsonl`), result.stderr, { flag: "wx" });
  const metric = result.stderr.trim().split("\n").filter(Boolean).map(JSON.parse).find(m => m.schema === "platonik-process-metrics-v1");
  metrics.push({ id, exit_code: result.status, ...metric });
  if (result.status !== 0 || !metric) throw new Error(`Preflight failed: ${id}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}
const cases = [];
for (const id of [...protocol.cases.training, ...protocol.cases.transfer]) {
  const experiment = invoke(["expedition", "case", id], `${id}-input`);
  const input = path.join(output, `${id}.experiment.json`);
  fs.writeFileSync(input, JSON.stringify(experiment), { flag: "wx" });
  const receipt = invoke(["run", input], `${id}-run`);
  const verified = invoke(["verify", path.join(output, `${id}-run.stdout.json`)], `${id}-verify`);
  cases.push({ id, experiment_hash: receipt.experiment_hash, result_hash: receipt.result_hash,
    passed: receipt.result.outcome.passed, verified: verified.verified, work: verified.work, ticks: verified.ticks_completed,
    receipt_file_sha256: sha(fs.readFileSync(path.join(output, `${id}-run.stdout.json`))) });
}
if (files.some(file => sha(fs.readFileSync(file)) !== source[file])) throw new Error("Runtime/protocol changed during qualification");
const report = { schema: "platonik-expedition-freeze-v1", frozen_at: new Date().toISOString(),
  protocol_sha256: source["fixtures/evidence/expedition-protocol.json"], source_files_sha256: source,
  source_tree_digest: sha(JSON.stringify(source)), release_binary_sha256: sha(fs.readFileSync(binary)),
  agent_configuration: { model: "Inherited caller model; no override. Exact provider model identifier unobserved.",
    reasoning: "Inherited caller reasoning; no override. Token usage unavailable.",
    context: "Two existing developer subagents with different prior implementation/review context. Both may inspect public source and reference data. This is a task-specific demonstration, not a controlled comparison of models.",
    restrictions: "Four candidate batches per arm; training-only execution feedback until freeze; no external simulator or extra candidate execution." },
  preflight: { cases, cli_metrics: metrics, actual_engine_executions: metrics.reduce((sum, m) => sum + m.engine_executions, 0),
    scope: "Fixture qualification before optimizer prompts; separate from the 4096-execution diagnostic allowance. Prior automated tests are separately reported." } };
fs.writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ frozen_at: report.frozen_at, source_tree_digest: report.source_tree_digest,
  cases: cases.length, all_passed: cases.every(c => c.passed && c.verified), preflight_executions: report.preflight.actual_engine_executions }));
