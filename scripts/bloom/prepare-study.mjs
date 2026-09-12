// Declare the bounded Bloom agent study and freeze the exact executable/source inputs.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const binary = path.resolve("target/release/platonik");
const ids = [
  "bloom-left", "bloom-right", "bloom-left-delay", "bloom-right-delay",
  "bloom-rotated-left", "bloom-rotated-right", "bloom-crossing-left", "bloom-crossing-right",
];
const training = ids.slice(0, 4), transfer = ids.slice(4);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const writeImmutable = (file, bytes) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) assert(fs.readFileSync(file).equals(bytes), `Immutable artifact differs: ${file}`);
  else fs.writeFileSync(file, bytes, { flag: "wx" });
};
const writeJson = (file, value) => writeImmutable(file, Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
assert(fs.existsSync(binary), "Build target/release/platonik before preparing the study");

for (const id of ids) {
  const exported = spawnSync(binary, ["habitat", "case", id], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  assert.equal(exported.status, 0, `Could not export ${id}`);
  const world = JSON.parse(exported.stdout);
  assert.equal(world.version, 4);
  writeImmutable(`fixtures/evidence/bloom-cases/${id}.json`, Buffer.from(`${JSON.stringify(world, null, 2)}\n`));
}

const cases = ids.map(id => ({ id, file: `fixtures/evidence/bloom-cases/${id}.json`, sha256: sha(fs.readFileSync(`fixtures/evidence/bloom-cases/${id}.json`)) }));
const protocol = {
  schema: "platonik-bloom-agent-protocol-v1",
  scope: "Bounded agent study of endogenous variation in eight fixed v4 Bloom habitats. Candidates submit only typed programs; worlds, selectors, and checker rules remain fixed.",
  training, transfer, cases,
  roles: { builder_a: 1, builder_b: 2, selector: 5 },
  budget: { each_agent: 64, candidate_slots: 3, training_worlds: 4, transfer_worlds: 4 },
  selection: ["all four checked training worlds bloom", "least total modeled work", "least canonical program bytes", "earliest submitted slot"],
  submission: { shape: "{id,label,programs:{builder_a,builder_b,selector}}", maximum_bytes: 65536, normalized_field: "Rule.remember omitted values become null" },
  arms: {
    keep: "Builders retain the exact qualified Bloom builders; the selector may vary.",
    frugal: "All three role programs may vary within the typed v4 program envelope.",
  },
  boundaries: "This study measures transfer across the declared worlds. It does not claim arbitrary synthesis, unbounded evolution, scientific novelty, P-versus-NP progress, or optimality.",
};
writeJson("fixtures/evidence/bloom-protocol.json", protocol);

const sourceFiles = [
  "Cargo.toml", "Cargo.lock", "rust-toolchain.toml", "fixtures/evidence/bloom-protocol.json",
  "scripts/bloom/common.mjs", "scripts/bloom/study-common.mjs", "scripts/bloom/agent-session.mjs",
  ...cases.map(item => item.file),
];
for (const directory of ["crates", "scripts/bloom"]) {
  const visit = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = `${dir}/${entry.name}`;
      if (entry.isDirectory()) visit(file);
      else if (/\.(rs|toml|mjs)$/.test(file) && !sourceFiles.includes(file)) sourceFiles.push(file);
    }
  };
  visit(directory);
}
const files = Object.fromEntries([...new Set(sourceFiles)].sort().map(file => [file, sha(fs.readFileSync(file))]));
const freeze = {
  schema: "platonik-bloom-agent-freeze-v1",
  protocol_sha256: sha(fs.readFileSync("fixtures/evidence/bloom-protocol.json")),
  source: { files, binary_sha256: sha(fs.readFileSync(binary)) },
  frozen_at: new Date().toISOString(),
};
writeJson("fixtures/evidence/bloom-freeze.json", freeze);
console.log(JSON.stringify({ protocol: "fixtures/evidence/bloom-protocol.json", freeze: "fixtures/evidence/bloom-freeze.json", cases: ids.length, source_files: Object.keys(files).length }));
