import { spawnSync } from "node:child_process";

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
