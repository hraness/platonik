import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import type { BridgeIndex, Receipt } from "../lib/bridge/types";

const mode = process.argv[2];
if (!["--write", "--check"].includes(mode)) throw new Error("Use --write or --check.");
// PLATONIK_CLI points at an already built CLI (CI builds it once and shares it);
// otherwise cargo builds and runs the workspace binary as before.
const execution = process.env.PLATONIK_CLI
  ? spawnSync(process.env.PLATONIK_CLI, ["suite", "bridge-v1"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  : spawnSync("cargo", ["run", "--locked", "-q", "-p", "platonik-cli", "--", "suite", "bridge-v1"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (execution.error) throw execution.error;
if (execution.status !== 0) throw new Error(`Rust bridge suite failed: ${execution.stderr}`);
const suite = JSON.parse(execution.stdout) as {
  version: string; id: string; passed: boolean;
  cases: { id: string; expected_pass: boolean; observed_pass: boolean; expectation_met: boolean; receipt: Receipt }[];
  assertions: { id: string; passed: boolean; description: string; evidence: string[] }[];
};
if (!suite.passed || suite.cases.length === 0 || suite.assertions.length === 0) throw new Error("Suite must supply passing checks and complete case evidence.");
const artifacts = new Map<string, string>();
const json = (value: unknown) => JSON.stringify(value) + "\n";
const digest = (value: unknown) => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const index: BridgeIndex = { schema: "platonik-bridge-site-v1", protocol: suite.cases[0].receipt.protocol, suite: suite.id, passed: suite.passed, cases: [], checks: [] };
for (const item of suite.cases) {
  if (!/^[a-z0-9-]+$/.test(item.id) || !item.expectation_met) throw new Error(`Invalid case: ${item.id}`);
  // JSON.parse cannot preserve every u64. Reject any lossy projection (including
  // a future large seed), rather than publishing a receipt Rust cannot verify.
  if (digest(item.receipt.experiment) !== item.receipt.experiment_hash || digest(item.receipt.result) !== item.receipt.result_hash) {
    throw new Error(`Lossy or invalid Rust receipt projection: ${item.id}`);
  }
  if (artifacts.has(`${item.id}.receipt.json`)) throw new Error(`Duplicate case: ${item.id}`);
  const receipt = json(item.receipt);
  artifacts.set(`${item.id}.receipt.json`, receipt);
  artifacts.set(`${item.id}.experiment.json`, json(item.receipt.experiment));
  index.cases.push({ id: item.id, expected_pass: item.expected_pass, passed: item.observed_pass,
    work: Object.values(item.receipt.result.costs).reduce((sum, value) => sum + value, 0),
    ticks: item.receipt.result.ticks_completed, receipt_bytes: Buffer.byteLength(receipt),
    experiment_hash: item.receipt.experiment_hash, result_hash: item.receipt.result_hash });
}
index.checks = suite.assertions.map(item => ({ id: item.id, passed: item.passed, detail: item.description, evidence: item.evidence }));
artifacts.set("index.json", json(index));
const directory = "public/bridge";
if (mode === "--write") await mkdir(directory, { recursive: true });
for (const [name, content] of artifacts) {
  const path = `${directory}/${name}`;
  if (mode === "--write") await writeFile(path, content);
  else if (await readFile(path, "utf8").catch(() => "") !== content) throw new Error(`Stale Rust evidence: ${path}. Run bun run bridge:record and review the changes.`);
}
const extras = (await readdir(directory)).filter(name => name.endsWith(".json") && !artifacts.has(name));
if (extras.length) throw new Error(`Unreferenced bridge artifacts require review: ${extras.join(", ")}`);
console.log(`${mode === "--write" ? "Recorded" : "Verified"} ${suite.cases.length} Rust cases and ${suite.assertions.length} assertions; ${artifacts.size} exact public JSON artifacts.`);
