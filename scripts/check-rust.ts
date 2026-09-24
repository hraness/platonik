import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";

// The Rust gate. `bun run check:rust` runs every stage in order; CI runs
// `bun scripts/check-rust.ts --stage <name>` in parallel jobs that share one
// debug CLI build (PLATONIK_CLI). The command list is the same either way.

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function requirePinnedRustc() {
  const version = spawnSync("rustc", ["--version"], { encoding: "utf8" });
  if (version.status !== 0 || !version.stdout.startsWith("rustc 1.97.1 ")) {
    throw new Error("The Rust gate requires rustc 1.97.1; install the pinned rust-toolchain.toml toolchain.");
  }
}

// PLATONIK_TEST_RUNNER=nextest runs the same test targets through cargo-nextest
// (one process per test, all binaries in parallel). nextest does not run
// doctests, so the workspace doctest pass is kept explicitly.
const nextest = process.env.PLATONIK_TEST_RUNNER === "nextest";
function cargoTest(args: string[]) {
  run("cargo", nextest ? ["nextest", "run", ...args] : ["test", ...args]);
}

const stages: Record<string, () => void> = {
  lint() {
    requirePinnedRustc();
    run("cargo", ["fmt", "--all", "--", "--check"]);
    run("cargo", ["clippy", "--workspace", "--all-targets", "--locked", "--", "-D", "warnings"]);
  },
  test() {
    requirePinnedRustc();
    cargoTest(["--workspace", "--locked"]);
    if (nextest) run("cargo", ["test", "--workspace", "--locked", "--doc"]);
    cargoTest(["-p", "platonik-core", "--example", "construction_capacity", "--locked"]);
    cargoTest(["-p", "platonik-core", "--example", "answer_capacity", "--locked"]);
    cargoTest(["-p", "platonik-core", "--example", "ark_capacity", "--locked"]);
    cargoTest(["-p", "platonik-core", "--example", "ports_capacity", "--locked"]);
  },
  build() {
    requirePinnedRustc();
    run("cargo", ["build", "--locked", "-p", "platonik-cli"]);
  },
  // Every stage below only executes the built CLI (target/debug/platonik or
  // $PLATONIK_CLI) against committed evidence; none of them compiles Rust.
  "evidence-habitat"() {
    run("bun", ["scripts/record-bridge.ts", "--check"]);
    run("node", ["scripts/check-expedition-evidence.mjs"]);
    run("node", ["scripts/check-continuity-evidence.mjs"]);
    run("node", ["scripts/check-navigation-evidence.mjs"]);
    run("node", ["scripts/check-navigation-repair-evidence.mjs"]);
    run("node", ["scripts/check-construction-evidence.mjs"]);
    run("node", ["scripts/check-construction-buffered-evidence.mjs"]);
  },
  "evidence-answer"() {
    run("node", ["scripts/check-answer-evidence.mjs"]);
    run("node", ["scripts/check-bloom-evidence.mjs"]);
    run("node", ["scripts/check-exchange-evidence.mjs"]);
    run("node", ["--test", "scripts/exchange/capacity-io.test.mjs"]);
    run("node", ["scripts/check-exchange-capacity.mjs"]);
  },
  "evidence-ark"() {
    run("node", ["scripts/check-ark-evidence.mjs"]);
    run("node", ["scripts/check-ports-evidence.mjs"]);
  },
  challenges() {
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
  },
};

const args = process.argv.slice(2);
const selected = args[0] === "--stage" ? args.slice(1) : [];
if (args.length && (args[0] !== "--stage" || selected.length === 0 || selected.some((name) => !stages[name]))) {
  throw new Error(`Usage: bun scripts/check-rust.ts [--stage ${Object.keys(stages).join("|")} ...]`);
}
for (const name of selected.length ? selected : Object.keys(stages)) stages[name]();
