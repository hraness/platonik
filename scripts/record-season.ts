// Record (or check) a hosted season's public board: `platonik season board`
// re-verifies every committed result's receipts and arithmetic, then ranks
// them. Withheld-case derivation is salt-checked by the evaluator workflow and
// becomes publicly re-verifiable when the season reveals its salt; this script
// needs none. The artifact is byte-reproducible — regenerate with --write and
// review the diff.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [season, mode] = process.argv.slice(2);
if (!/^season-\d{4}$/.test(season ?? "") || !["--write", "--check"].includes(mode ?? "")) {
  throw new Error("Use: bun scripts/record-season.ts <season-NNNN> --write|--check");
}

const manifestPath = join("seasons", `${season}.json`);
if (!existsSync(manifestPath)) throw new Error(`No committed season manifest: ${manifestPath}`);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  schema: string;
  id: string;
  challenges: number[];
};
if (manifest.schema !== "platonik-challenge-season-v1" || manifest.id !== season) {
  throw new Error(`Season manifest is malformed: ${manifestPath}`);
}

const build = spawnSync("cargo", ["build", "--locked", "-p", "platonik-cli"], { stdio: "inherit" });
if (build.error) throw build.error;
if (build.status !== 0) throw new Error("platonik-cli build failed.");

const resultsDir = join("season", "results", season);
if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });
const run = spawnSync(
  join("target", "debug", "platonik"),
  ["season", "board", manifestPath, resultsDir],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
if (run.error) throw run.error;
if (run.status !== 0) throw new Error(`season board failed: ${run.stderr}`);

// The board artifact is republished through JSON; numeric literals must stay
// inside the exact-integer range. String literals are stripped first so digits
// inside hashes never trip the scan.
const numbersOnly = run.stdout.replace(/"(?:[^"\\]|\\.)*"/g, '""');
for (const match of numbersOnly.matchAll(/-?\d{16,}/g)) {
  if (BigInt(match[0]) > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Lossy u64 projection in board output: ${match[0]}`);
  }
}
const board = JSON.parse(run.stdout) as { schema: string; season: string; challenges: unknown[] };
if (board.schema !== "platonik-season-board-v1" || board.season !== season) {
  throw new Error("season board returned an unexpected shape.");
}
if (board.challenges.length > manifest.challenges.length) {
  throw new Error("Board covers challenges outside the season window.");
}

const directory = join("public", "season");
const artifact = `${season}.json`;
const content = run.stdout.endsWith("\n") ? run.stdout : run.stdout + "\n";
if (mode === "--write") {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, artifact), content);
} else if (
  !existsSync(join(directory, artifact)) ||
  readFileSync(join(directory, artifact), "utf8") !== content
) {
  throw new Error(`Stale season board: ${join(directory, artifact)}. Run bun run season:record and review the changes.`);
}
const extras = readdirSync(directory).filter(
  (name) => name.endsWith(".json") && name !== artifact && !existsSync(join("seasons", name)),
);
if (extras.length) {
  throw new Error(`Unreferenced season artifacts require review: ${extras.join(", ")}`);
}
console.log(
  `${mode === "--write" ? "Recorded" : "Verified"} ${season}: ${board.challenges.length} challenge boards from receipt-verified results.`,
);
