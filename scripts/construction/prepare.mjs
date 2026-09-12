// Run before any candidate trial. Reads already qualified case/receipt files;
// it neither runs the engine nor hides unsuccessful qualification attempts.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { read, sha } from "./runner.mjs";
import { write } from "./trajectory.mjs";

const [qualificationFile] = process.argv.slice(2);
assert(qualificationFile, "prepare.mjs QUALIFICATION_JSON (eight canonical construction-cases must already exist)");
const training = ["construction-one", "construction-zero", "construction-slow", "construction-crossing"];
const transfer = ["construction-rotated-one", "construction-rotated-zero", "construction-rotated-slow", "construction-rotated-crossing"];
const roles = { builder: 5, child: 3, blueprint: 50, stock: 60, courier: 1, relay: 2, valve: 30 };
const originalQualification = read(qualificationFile);
assert(originalQualification.attempts?.length <= 12 && !originalQualification.pending);
const packet = "fixtures/evidence/construction-qualification";
fs.mkdirSync(packet, { recursive: true });
const qualification = structuredClone(originalQualification);
qualification.original_ledger_sha256 = sha(fs.readFileSync(qualificationFile));
qualification.packet_directory = packet;
for (const attempt of qualification.attempts) for (const call of attempt.calls) {
  for (const field of ["stdout", "stderr"]) {
    const bytes = fs.readFileSync(path.join(path.dirname(qualificationFile), call[field]));
    assert.equal(sha(bytes), call[`${field}_sha256`]);
    fs.writeFileSync(path.join(packet, call[field]), bytes, { flag: "wx" });
  }
  call.args = call.args.map(arg => path.isAbsolute(arg) ? path.basename(arg) : arg);
}
const publicQualificationFile = "fixtures/evidence/construction-qualification.json";
write(publicQualificationFile, qualification);
fs.mkdirSync("fixtures/evidence/construction-cases", { recursive: true });
for (const id of [...training, ...transfer]) {
  const attempt = qualification.attempts.findLast(row => row.case_id === id && row.passed && row.verified);
  assert(attempt, `Known feasible case ${id}`);
  const receipt = read(path.join(packet, attempt.receipt_file));
  write(`fixtures/evidence/construction-cases/${id}.json`, receipt.experiment);
}
const cases = [...training, ...transfer].map(id => {
  const file = `fixtures/evidence/construction-cases/${id}.json`;
  return { id, file, sha256: sha(fs.readFileSync(file)) };
});
const original = read(cases[0].file), reference = original.cells.find(cell => cell.id === roles.builder).program;
// Root-authored alternative: remember acquisition/completion instead of asking
// for every assembly stage on every activation. Two successful writes are paid.
const memory = { rules: [
  { when: [{ kind: "memory", slot: 2, value: 2 }], action: { kind: "wait" }, remember: null },
  { when: [{ kind: "assembly_stage", blueprint: roles.blueprint, stage: "ready" }],
    action: { kind: "activate", blueprint: roles.blueprint }, remember: { slot: 2, value: 2 } },
  { when: [{ kind: "memory", slot: 2, value: 1 }], action: { kind: "build", blueprint: roles.blueprint }, remember: null },
  { when: [], action: { kind: "gather_material", stock: roles.stock }, remember: { slot: 2, value: 1 } },
] };
const delayed = structuredClone(reference);
delayed.rules.unshift({ when: [{ kind: "memory", slot: 3, value: 0 }],
  action: { kind: "wait" }, remember: { slot: 3, value: 1 } });
const candidateDir = "fixtures/evidence/construction-submissions";
fs.mkdirSync(candidateDir, { recursive: true });
const candidates = [["reference-builder", reference], ["memory-builder", memory], ["delayed-builder", delayed]].map(([id, program]) => {
  const source_file = `${candidateDir}/${id}.json`; write(source_file, program);
  return { id, source_file, source_sha256: sha(fs.readFileSync(source_file)) };
});
const qualified = id => {
  const attempt = qualification.attempts.findLast(row => row.case_id === id && row.passed);
  assert(attempt, `Feasible reference needed for ${id}`);
  const receipt = read(path.join(packet, attempt.receipt_file));
  assert.deepEqual(receipt.experiment, read(`fixtures/evidence/construction-cases/${id}.json`));
  return receipt;
};
for (const id of [...training, ...transfer]) qualified(id);
const cutsFor = receipt => {
  const body = receipt.experiment.construction.blueprints[0].body;
  const bytes = Buffer.byteLength(JSON.stringify(body));
  const frames = receipt.result.frames;
  const material = frames.find(frame => frame.state.cells.find(cell => cell.id === roles.builder)?.material != null)?.tick;
  const partial = frames.find(frame => frame.state.construction?.assemblies.some(a => a.copied.length >= 32 && a.copied.length < bytes))?.tick;
  const halfway = frames.find(frame => frame.state.construction?.assemblies.some(a => a.copied.length >= bytes / 2 && a.copied.length < bytes))?.tick;
  const ready = frames.find(frame => frame.state.construction?.assemblies.some(a => a.copied.length === bytes && a.wired.length === body.links.length))?.tick;
  const born = receipt.result.final_state.construction.births[0]?.tick;
  assert([material, partial, halfway, ready, born].every(Number.isInteger));
  const cuts = [material, partial, halfway, ready, born, born + 1, Math.min(96, receipt.experiment.ticks - 1), receipt.experiment.ticks];
  assert(cuts.every((tick, i) => tick > (cuts[i - 1] ?? 0)), "Eight distinct physical milestones fit the horizon");
  return { cuts, restore_ticks: [halfway, born] };
};
const first = cutsFor(qualified(training[0])), slow = cutsFor(qualified(training[2]));
const replays = [
  { id: "keeper-born", case_id: training[0], kind: "selected", ...first },
  { id: "keeper-slow-radio", case_id: training[2], kind: "selected", ...slow },
  { id: "assembly-stays-inactive", case_id: training[0], kind: "no-activation", ...first },
  { id: "child-does-no-work", case_id: training[0], kind: "idle-child", ...first },
];
write("fixtures/evidence/construction-protocol.json", {
  schema: "platonik-construction-protocol-v1", declared_on: "2026-09-11",
  scope: "Public developer-agent diagnostic of prescribed material-dependent assembly and useful ordinary child execution. No hidden/blind model comparison, autonomous search, self-construction, large ecology or enjoyment claim.",
  roles, training, transfer, cases, candidates, replays,
  ancestry_sources: ["fixtures/evidence/navigation-repair-submissions/compass-goal-heading.json",
    "fixtures/evidence/continuity-inputs/previous-resilient--changing-one.json"].map(file => ({ file, sha256: sha(fs.readFileSync(file)) })),
  candidate_provenance: "Three agent-authored alternatives fixed before trial: fixture stage-driven reference; root-proposed memory builder paying two state writes; reference with one explicit paid startup delay. No automatic internal program search.",
  comparison_kinds: ["prebuilt", "blind-child"],
  control_kinds: ["no-stock", "no-acquisition", "no-activation", "idle-child", "idle-courier", "idle-relay"],
  selection: ["all four training construction/useful-child/service milestones pass", "least total training modeled work", "least canonical builder program bytes", "earliest declared slot"],
  budget: { qualification_attempts: 12, qualification_engine_executions: 24, study_engine_executions: 2048,
    maximum_logical_cold_runs: 52, candidate_slots: 3, maximum_segmented_replays: 4,
    maximum_integrity_probes: 12, capacity_engine_executions: 1024, fresh_admission_engine_executions: 1024 },
  bounds: { ticks: 128, active_cells: 16, blueprints: 4, copy_bytes_per_build: 32,
    maximum_receipt_bytes: 8 * 1024 * 1024, maximum_bundle_bytes: 64 * 1024 * 1024,
    maximum_expanded_receipt_bytes: 256 * 1024 * 1024 },
  qualification_file: publicQualificationFile,
  qualified_references: "All attempted recipes, including failures and adjustments, remain in the qualification packet. Reference feasibility is separate from frozen candidate selection.",
  accounting: "Count every Rust invocation's internal executions, including failures, replay and import. Three submitted slots fixed before candidate execution; no extra slot after failure. Eight reference + twelve training + four selected transfer + sixteen comparisons + twelve controls are 52 cold attempts. Four two-import segmented replays and twelve probes are additional accounted work. Qualification, capacity and fresh artifact admission are separately bounded; external reasoning tokens are unknown.",
  comparisons: "Prebuilt installs the identical body/link initially, idles its former builder, removes the construction specification and cache; it is an explicitly supplied-body service comparator. Blind-child changes only the copied child program; its different payload size and birth time are real costs. Six controls change only their declared stock or program components. A control may lawfully succeed.",
  removal_claims: "Report material dependence, activation dependence, child-policy usefulness, courier dependence and relay dependence separately. A lawful successful removal invalidates that architecture-specific claim without erasing its result or automatically disproving useful construction.",
  report_boundary: "Milestone success requires acquired material, actual assembly/activation, useful ordinary child routing and service success. Report use is separately established by physical receipt provenance, TakeMessage and corresponding child routing; blind routing is permitted and receives no communication credit.",
});
console.log(JSON.stringify({ cases: cases.length, candidates: candidates.map(row => row.id), replays }, null, 2));
