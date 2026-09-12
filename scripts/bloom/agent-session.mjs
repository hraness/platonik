// Three retained author slots; selection is deterministic and transfers never mutate a program.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createLedger, runner } from "./common.mjs";
import { read, write, sha, identity, checkedFreeze, caseInput, programs, normalizePrograms, cold, checkSelection } from "./study-common.mjs";
const [directory, operation, input] = process.argv.slice(2);
assert(directory && ["init","submit","select","transfer","finish","status"].includes(operation),
  "agent-session.mjs DIRECTORY init keep|frugal | submit FILE | select | transfer | finish | status");
const { frozen, plan } = checkedFreeze();
let ledger;
if (operation === "init") {
  assert(["keep","frugal"].includes(input));
  ledger = Object.assign(createLedger(directory,{ maximum_engine_executions: 64 }), {
    schema: "platonik-bloom-agent-ledger-v1", owner: input, source_digest: identity(frozen.source), protocol_digest: identity(plan),
    candidates: [], selected: null, transfer: [], pending_operation: null, pending_trial: null,
  });
} else ledger = read(path.join(directory,"ledger.json"));
assert.equal(ledger.schema,"platonik-bloom-agent-ledger-v1"); assert(["keep","frugal"].includes(ledger.owner));
assert.equal(ledger.maximum_engine_executions,64); assert.equal(ledger.source_digest,identity(frozen.source)); assert.equal(ledger.protocol_digest,identity(plan));
const summary = () => ({ owner: ledger.owner, engine_executions: ledger.engine_executions, maximum_engine_executions: 64,
  candidates: ledger.candidates.map(({sequence,id,label,admission,bloomed,work,program_bytes,trials}) => ({sequence,id,label,admission,bloomed,work,program_bytes,trials})),
  selected: ledger.selected?.id ?? null, transfer: ledger.transfer, finished: ledger.finished,
  pending_operation: ledger.pending_operation, pending_trial: ledger.pending_trial, stopped: ledger.stopped, accounting_incomplete: ledger.accounting_incomplete });
if (operation === "status") { console.log(JSON.stringify(summary(),null,2)); process.exit(0); }
assert(!ledger.pending_operation && !ledger.pending_trial && !ledger.finished,"Preserve interrupted or finished sessions; no reset or rerun");
const run = runner(directory,ledger);
if (ledger.selected) checkSelection(ledger,run.root,plan);
if (operation === "submit") {
  assert(input && !ledger.selected && ledger.candidates.length < 3);
  const entry = { sequence: ledger.candidates.length+1, id: null, label: null, admission: "submitted", trials: [], bloomed: false, first_call: ledger.calls.length };
  ledger.candidates.push(entry); ledger.pending_operation = `submit-${entry.sequence}`; run.save();
  try {
    const stat = fs.statSync(input); assert(stat.isFile() && stat.size <= 65536,"Candidate must be a regular file of at most64KiB");
    const raw = fs.readFileSync(input); assert(raw.length <= 65536);
    entry.source = `submission-${entry.sequence}.json`; fs.writeFileSync(path.join(run.root,entry.source),raw,{flag:"wx"}); entry.source_sha256 = sha(raw); run.save();
    const candidate = JSON.parse(raw); assert.deepEqual(Object.keys(candidate).sort(),["id","label","programs"]);
    assert(/^[a-z][a-z0-9-]{0,31}$/.test(candidate.id)); assert(typeof candidate.label === "string" && candidate.label.length > 0 && candidate.label.length <= 120);
    assert(!ledger.candidates.some(other => other !== entry && other.id === candidate.id));
    entry.programs = normalizePrograms(candidate.programs);
    if (ledger.owner === "keep") for (const role of ["builder_a","builder_b"]) assert.deepEqual(entry.programs[role],programs(caseInput(plan.training[0]))[role],"Keep both reference builders unchanged");
    entry.id = candidate.id; entry.label = candidate.label;
  } catch (error) {
    entry.admission = "rejected"; entry.error = "Candidate input was rejected; slot and diagnostics retained.";
    if (!entry.source) entry.input_unavailable = true;
    fs.writeFileSync(path.join(run.root,`submission-${entry.sequence}.error.txt`),String(error.stack ?? error),{flag:"wx"});
    entry.after_call = ledger.calls.length; ledger.pending_operation = null; run.save(); console.log(JSON.stringify(summary(),null,2)); process.exit(2);
  }
  run.save();
  for (const case_id of plan.training) {
    const trial = cold(run,`c${entry.sequence}-${case_id}`,case_id,entry.programs); entry.trials.push(trial); run.save();
    if (trial.rejected) { entry.admission = "rejected"; break; }
  }
  if (entry.trials.length === 4 && entry.trials.every(row => !row.rejected && !row.grade_rejected)) {
    entry.admission = "completed"; entry.work = entry.trials.reduce((sum,row) => sum+row.work,0);
    entry.program_bytes = Buffer.byteLength(JSON.stringify(entry.programs)); entry.bloomed = entry.trials.every(row => row.bloomed);
  }
  entry.after_call = ledger.calls.length; ledger.pending_operation = null;
} else if (operation === "select") {
  assert(!ledger.selected); const best = checkSelection(ledger,run.root,plan);
  if (!best) ledger.finished = { bloomed: false, reason: "No candidate passed all four training worlds; no replacement slot or transfer." };
  else {
    ledger.selected = { id: best.id, sequence: best.sequence, programs: structuredClone(best.programs), program_hash: identity(best.programs), training_work: best.work, after_call: ledger.calls.length };
    write(path.join(run.root,"selected.json"),ledger.selected);
  }
} else if (operation === "transfer") {
  assert(ledger.selected && !ledger.transfer.length); ledger.pending_operation = "transfer"; run.save();
  for (const case_id of plan.transfer) {
    const row = cold(run,`transfer-${case_id}`,case_id,ledger.selected.programs); ledger.transfer.push(row); run.save();
    if (row.rejected) run.stop("Unchanged selected program was rejected on transfer; preserve the session for review.");
  }
  ledger.pending_operation = null;
} else if (operation === "finish") {
  assert.deepEqual(ledger.transfer.map(row => row.case_id),plan.transfer); checkSelection(ledger,run.root,plan);
  assert.deepEqual(read(path.join(run.root,"selected.json")),ledger.selected);
  ledger.finished = { bloomed: ledger.transfer.every(row => row.bloomed), all_inputs_retained: ledger.candidates.every(row => Boolean(row.source)),
    logical_cold_runs: ledger.calls.filter(call => call.args[0] === "run").length };
} else assert.equal(operation,"init");
run.save(); console.log(JSON.stringify(summary(),null,2));
