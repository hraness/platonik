import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const version = spawnSync("rustc", ["--version"], { encoding: "utf8" });
if (version.status !== 0 || !version.stdout.startsWith("rustc 1.97.1 ")) {
  throw new Error("The Rust gate requires rustc 1.97.1; install the pinned rust-toolchain.toml toolchain.");
}
run("cargo", ["fmt", "--all", "--", "--check"]);
run("cargo", ["clippy", "--workspace", "--all-targets", "--locked", "--", "-D", "warnings"]);
run("cargo", ["test", "--workspace", "--locked"]);
run("cargo", ["test", "-p", "platonik-core", "--example", "construction_capacity", "--locked"]);
run("cargo", ["test", "-p", "platonik-core", "--example", "answer_capacity", "--locked"]);
run("cargo", ["test", "-p", "platonik-core", "--example", "ark_capacity", "--locked"]);
run("cargo", ["test", "-p", "platonik-core", "--example", "ports_capacity", "--locked"]);
run("cargo", ["build", "--locked", "-p", "platonik-cli"]);
run("bun", ["scripts/record-bridge.ts", "--check"]);
run("node", ["scripts/check-expedition-evidence.mjs"]);
run("node", ["scripts/check-continuity-evidence.mjs"]);
run("node", ["scripts/check-navigation-evidence.mjs"]);
run("node", ["scripts/check-navigation-repair-evidence.mjs"]);
run("node", ["scripts/check-construction-evidence.mjs"]);
run("node", ["scripts/check-construction-buffered-evidence.mjs"]);
run("node", ["scripts/check-answer-evidence.mjs"]);
run("node", ["scripts/check-ark-evidence.mjs"]);
run("node", ["scripts/check-ports-evidence.mjs"]);
run("node", ["scripts/check-bloom-evidence.mjs"]);
run("node", ["scripts/check-exchange-evidence.mjs"]);
run("node", ["--test", "scripts/exchange/capacity-io.test.mjs"]);
run("node", ["scripts/check-exchange-capacity.mjs"]);
run("bun", ["scripts/record-challenges.ts", "--check"]);

// Every committed season manifest gets its public board artifact re-verified
// (receipt replay + ranking; derivation is salt-gated by the evaluator and
// publicly checkable after the season reveals its salt).
if (existsSync("seasons")) {
  for (const name of readdirSync("seasons").filter((name) => /^season-\d{4}\.json$/.test(name)).sort()) {
    run("bun", ["scripts/record-season.ts", name.replace(/\.json$/, ""), "--check"]);
  }
}

// The evaluator publishes canonical entries under season/entries/<season>/.
// Anything else at the top level on main means an entry bypassed admission.
// Entry pull requests legitimately add such files, so this only applies
// outside pull_request runs.
if (process.env.GITHUB_EVENT_NAME !== "pull_request" && existsSync("season/entries")) {
  for (const name of readdirSync("season/entries")) {
    const path = `season/entries/${name}`;
    if (name !== "README.md" && !(/^season-\d{4}$/.test(name) && statSync(path).isDirectory())) {
      throw new Error(`${path} is not an evaluated canonical entry; entries publish only through the season workflow.`);
    }
  }
}
