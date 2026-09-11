import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const arm = process.argv[2] ?? "frugal";
if (!["frugal", "resilient"].includes(arm)) throw new Error("Choose a completed study arm");
const session = JSON.parse(fs.readFileSync(`.platonik/evaluation/${arm}/session.json`, "utf8"));
if (!session.finished || session.trials !== 20) throw new Error("Capacity requires a frozen completed 20-trial session");
if (process.platform !== "darwin") throw new Error("This measurement uses macOS /usr/bin/time -l RSS units; qualify another platform separately");
const output = ".platonik/evaluation/capacity";
fs.mkdirSync(output);
const binary = path.resolve("target/release/platonik");
const samples = [];
for (let index = 0; index < 30; index++) {
  if (samples.reduce((sum, row) => sum + row.engine_executions, 0) + session.trials > 600) throw new Error("Capacity execution reservation exhausted");
  const started = process.hrtime.bigint();
  const result = spawnSync("/usr/bin/time", ["-l", binary, "--metrics", "expedition", "verify", path.resolve(`.platonik/evaluation/${arm}/save`)],
    { encoding: "utf8", maxBuffer: 70 * 1024 * 1024, timeout: 60_000 });
  const elapsed_ms = Number(process.hrtime.bigint() - started) / 1e6;
  fs.writeFileSync(path.join(output, `${index}.stderr.txt`), result.stderr, { flag: "wx" });
  const metric = result.stderr.trim().split("\n").filter(line => line.startsWith("{")).map(JSON.parse).find(row => row.schema === "platonik-process-metrics-v1");
  const peak = /\b(\d+)\s+maximum resident set size/.exec(result.stderr);
  if (result.status !== 0 || !metric || !peak || metric.engine_executions !== session.trials) throw new Error(`Capacity command failed or count changed: ${index}`);
  const report = JSON.parse(result.stdout);
  const sample = { index, elapsed_ms, engine_elapsed_ms: metric.elapsed_micros / 1000,
    peak_rss_bytes: Number(peak[1]), engine_executions: metric.engine_executions,
    trials: report.campaign.trials.length, work: report.campaign.work, revision: report.revision };
  samples.push(sample);
  fs.writeFileSync(path.join(output, "samples.json"), JSON.stringify(samples, null, 2));
}
const sorted = samples.map(s => s.elapsed_ms).toSorted((a, b) => a - b);
const sys = key => spawnSync("/usr/sbin/sysctl", ["-n", key], { encoding: "utf8" }).stdout.trim();
const report = { schema: "platonik-expedition-capacity-v1", measured_at: new Date().toISOString(), arm,
  hardware: { chip: sys("machdep.cpu.brand_string"), memory_bytes: Number(sys("hw.memsize")), platform: process.platform,
    os_version: spawnSync("/usr/bin/sw_vers", ["-productVersion"], { encoding: "utf8" }).stdout.trim() },
  scope: "30 read-only verifications of a fixed 20-trial saved journal in separate release CLI processes. End-to-end includes process launch, parsing, local filesystem reads, replay checks, report serialization, and /usr/bin/time overhead. No isolated-host claim, no cold-cache control, no new candidate search. RSS is the peak of each Rust process, not external-agent or Node memory. This does not qualify larger habitat envelopes or arbitrary long-lived services.",
  samples, p50_ms: (sorted[14] + sorted[15]) / 2, p95_ms: sorted[28], peak_rss_bytes: Math.max(...samples.map(s => s.peak_rss_bytes)),
  artifact_bytes: fs.statSync(`.platonik/evaluation/${arm}/export.json`).size,
  engine_executions: samples.reduce((sum, s) => sum + s.engine_executions, 0) };
fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2), { flag: "wx" });
console.log(JSON.stringify({ samples: samples.length, p50_ms: report.p50_ms, p95_ms: report.p95_ms,
  peak_rss_bytes: report.peak_rss_bytes, artifact_bytes: report.artifact_bytes, engine_executions: report.engine_executions }));
