// Record (or check) the reference challenge board: run each public baseline
// policy through `challenge eval` on every published challenge, then let
// `challenge board` re-verify and rank the results. The published artifact is
// byte-reproducible — regenerate it with --write and review the diff.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const mode = process.argv[2];
if (!["--write", "--check"].includes(mode)) throw new Error("Use --write or --check.");

const FAMILY_POLICIES: Record<string, readonly string[]> = {
  crossing: ["resilient", "compact", "idle"],
  switchboard: ["keeper", "resilient", "idle"],
  foundry: ["builder", "resilient", "idle"],
};
const directory = "public/challenges";
const artifact = "index.json";

// PLATONIK_CLI points at an already built CLI (CI builds it once and shares it);
// otherwise cargo builds the workspace binary as before.
if (!process.env.PLATONIK_CLI) {
  const build = spawnSync("cargo", ["build", "--locked", "-p", "platonik-cli"], { stdio: "inherit" });
  if (build.error) throw build.error;
  if (build.status !== 0) throw new Error("platonik-cli build failed.");
}
const binary = process.env.PLATONIK_CLI ?? join("target", "debug", "platonik");

function cli(args: string[], allowScoredMiss = false): string {
  const run = spawnSync(binary, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.error) throw run.error;
  // Exit 1 is a valid scored-but-incomplete result; exit 2 is an error.
  if (run.status === 2 || (run.status !== 0 && !allowScoredMiss)) {
    throw new Error(`platonik ${args.join(" ")} failed: ${run.stderr}`);
  }
  return run.stdout;
}

// JSON.parse cannot preserve every u64 — result files carry full-range seed
// fields, but they are written verbatim and only string fields are read back.
// The board artifact is republished through JSON, so its numeric literals must
// stay inside the exact-integer range. String literals are stripped first so
// digits inside hashes never trip the scan.
function parseExact(raw: string): any {
  const numbersOnly = raw.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  for (const match of numbersOnly.matchAll(/-?\d{16,}/g)) {
    if (BigInt(match[0]) > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`Lossy u64 projection in CLI output: ${match[0]}`);
    }
  }
  return JSON.parse(raw);
}

const list = parseExact(cli(["challenges"])) as { schema: string; challenges: string[] };
if (list.schema !== "platonik-challenges-v1" || list.challenges.length === 0) {
  throw new Error("Challenge list is empty or has an unexpected schema.");
}

const work = mkdtempSync(join(tmpdir(), "platonik-challenges-"));
const submissions = join(work, "submissions");
const results = join(work, "results");
mkdirSync(submissions);
mkdirSync(results);
try {
  const familyOf = new Map<string, string>();
  const policySet = new Set<string>();
  for (const id of list.challenges) {
    // The bundle embeds full-range u64 seeds; only its string fields are read.
    const bundle = cli(["challenge", id]);
    const family = bundle.match(/"family"\s*:\s*"([^"]+)"/)?.[1] ?? "";
    if (!/"schema"\s*:\s*"platonik-challenge-v1"/.test(bundle)) {
      throw new Error(`Challenge ${id} returned an unexpected bundle schema.`);
    }
    const policies = FAMILY_POLICIES[family];
    if (!policies) throw new Error(`Challenge ${id} belongs to an unrecorded family: ${family}.`);
    familyOf.set(id, family);
    for (const policy of policies) {
      policySet.add(policy);
      // Retry a truncated spawnSync capture: the submission must parse whole.
      let submission = "";
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const candidate = cli(["challenge", "reference", id, policy]);
        try {
          JSON.parse(candidate);
          submission = candidate;
          break;
        } catch {
          // incomplete capture; retry
        }
      }
      if (!submission) throw new Error(`Reference for ${id}/${policy} did not capture.`);
      const submissionFile = join(submissions, `${id}-${policy}.json`);
      writeFileSync(submissionFile, submission);
      const result = cli(["challenge", "eval", id, submissionFile], true);
      // Verbatim bytes are what the board re-verifies; only strings are read here.
      const parsed = JSON.parse(result) as { schema: string; challenge: string; agent?: { name: string } };
      if (parsed.schema !== "platonik-challenge-result-v1" || parsed.challenge !== id) {
        throw new Error(`Eval returned an unexpected result for ${id}/${policy}.`);
      }
      writeFileSync(join(results, `${id}-${policy}.json`), result);
    }
  }
  const board = parseExact(cli(["challenge", "board", results])) as {
    schema: string;
    generator: number;
    challenges: { challenge: string; index: number; band: number; rows: unknown[] }[];
    global: { entrant: string; cleared: number; attempted: number }[];
  };
  if (board.schema !== "platonik-challenge-board-v1") throw new Error("Unexpected board schema.");
  if (board.challenges.length !== list.challenges.length) {
    throw new Error("Board does not cover every published challenge.");
  }
  for (const entry of board.challenges) {
    const expected = FAMILY_POLICIES[familyOf.get(entry.challenge) ?? ""]?.length;
    if (!expected || entry.rows.length !== expected) {
      throw new Error(`${entry.challenge} is missing a reference row.`);
    }
  }
  const index = {
    schema: "platonik-challenges-site-v1",
    generator: board.generator,
    policies: [...policySet].sort(),
    families: [...new Set([...familyOf.values()])],
    challenges: board.challenges.map((entry) => ({ ...entry, family: familyOf.get(entry.challenge) })),
    global: board.global,
  };
  const content = JSON.stringify(index, null, 2) + "\n";
  if (mode === "--write") {
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, artifact), content);
  } else if (
    !existsSync(join(directory, artifact)) ||
    readFileSync(join(directory, artifact), "utf8") !== content
  ) {
    throw new Error(`Stale challenge board: ${join(directory, artifact)}. Run bun run challenges:record and review the changes.`);
  }
  const extras = readdirSync(directory).filter((name) => name.endsWith(".json") && name !== artifact);
  if (extras.length) throw new Error(`Unreferenced challenge artifacts require review: ${extras.join(", ")}`);
  console.log(
    `${mode === "--write" ? "Recorded" : "Verified"} ${board.challenges.length} challenges across ${new Set([...familyOf.values()]).size} families; board rows re-verified by the CLI.`,
  );
} finally {
  if (existsSync(work)) rmSync(work, { recursive: true, force: true });
}
