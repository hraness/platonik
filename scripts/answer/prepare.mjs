// Project already retained qualification evidence; no engine execution.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {read,write,sha} from "./common.mjs";
const [directory]=process.argv.slice(2);assert(directory);
const original=read(path.join(directory,"execution.json"));assert(!original.pending&&original.exit_code===0&&original.engine_executions<=24);
assert.equal(original.attempts.length,12);
const training=["answer-one","answer-zero","answer-slow","answer-crossing"],transfer=training.map(id=>id.replace("answer-","answer-rotated-"));
fs.mkdirSync("fixtures/evidence/answer-qualification");fs.mkdirSync("fixtures/evidence/answer-cases");
const artifacts={};
for(const row of original.attempts){
 const stem=`${String(row.attempt).padStart(2,"0")}-${row.id}`;
 for(const suffix of ["experiment","receipt","attempt"]){
  const file=`fixtures/evidence/answer-qualification/${stem}.${suffix}.json`,raw=fs.readFileSync(path.join(directory,`${stem}.${suffix}.json`));
  fs.writeFileSync(file,raw,{flag:"wx"});artifacts[file]={sha256:sha(raw),bytes:raw.length};
 }
 if([...training,...transfer].includes(row.id)){
  assert(row.passed&&row.journey.answered&&row.verified);
  const receipt=read(`fixtures/evidence/answer-qualification/${stem}.receipt.json`);
  write(`fixtures/evidence/answer-cases/${row.id}.json`,receipt.experiment);
 }
}
const rawMetrics=fs.readFileSync(path.join(directory,"cargo.stderr.txt"),"utf8").split("\n").filter(line=>line.startsWith("answer-qualification ")).join("\n")+"\n";
assert.deepEqual(rawMetrics.trim().split("\n").map(line=>JSON.parse(line.slice("answer-qualification ".length))),original.attempts);
const metricFile="fixtures/evidence/answer-qualification/metrics.ndjson";fs.writeFileSync(metricFile,rawMetrics,{flag:"wx"});artifacts[metricFile]={sha256:sha(rawMetrics),bytes:Buffer.byteLength(rawMetrics)};
const qualification={...original,original_execution_sha256:sha(fs.readFileSync(path.join(directory,"execution.json"))),original_stderr_sha256:sha(fs.readFileSync(path.join(directory,"cargo.stderr.txt"))),artifacts};
write("fixtures/evidence/answer-qualification.json",qualification);
const cases=[...training,...transfer].map(id=>{const file=`fixtures/evidence/answer-cases/${id}.json`;return{id,file,sha256:sha(fs.readFileSync(file))};});
const cuts=case_id=>{const row=original.attempts.find(row=>row.id===case_id);const result=[1,2,8,17,18,38,row.answer_tick,128];assert(result.every((tick,i)=>tick>(result[i-1]??0)));return result;};
const replays=[
 {id:"first-answer",owner:"reference",case_id:training[0],kind:"reference"},
 {id:"familiar-courier",owner:"keep",case_id:training[3],kind:"selected"},
 {id:"frugal-crew",owner:"frugal",case_id:training[2],kind:"selected"},
 {id:"old-answer",owner:"reference",case_id:training[0],kind:"stale-reply"},
].map(row=>({...row,cuts:cuts(row.case_id),restore_ticks:[8,38]}));
const ancestorFiles=["fixtures/evidence/navigation-repair-submissions/compass-goal-heading.json","fixtures/evidence/continuity-inputs/previous-resilient--changing-one.json","fixtures/evidence/construction-submissions/memory-builder.json"];
const plan={schema:"platonik-answer-protocol-v1",declared_on:"2026-09-12",scope:"Public developer-agent diagnostic of construction-to-contact in one 128-tick world. Transfer occurs after selection; recipes remain public, not blinded. No complete six-chapter campaign or endogenous search claim.",
 roles:{courier:1,relay:2,keeper:3,builder:5,reply:6,receiver:7,keeper_blueprint:50,reply_blueprint:51,stock:60,incoming_link:42,return_link:43},
 training,transfer,cases,replays,qualification_file:"fixtures/evidence/answer-qualification.json",
 ancestry_sources:ancestorFiles.map(file=>({file,sha256:sha(fs.readFileSync(file))})),
 arms:{keep:"Keep the exact earlier courier; edit builder and Reply programs.",frugal:"May additionally edit courier. Other body/program/link/world fields are fixed."},
 comparison_kinds:["prebuilt","direct-reply"],control_kinds:["no-stock","no-activation","idle-courier","idle-reply","severed-return","stale-reply"],
 selection:["answer all four training worlds","least total modeled work","least canonical courier+builder+reply program bytes","earliest submitted slot"],
 candidate_normalization:"Raw submissions remain immutable. Omitted Rule.remember is normalized to null, as in Rust. Scoring and selected program identity come from the first admitted Rust receipt, including all typed fields.",
 budget:{qualification:384,fixture_qualification:24,cli_calibration:360,study:2048,each_agent:64,coordinator:1920,candidate_slots:3,logical_cold_runs:68,segmented_replays:4,integrity_probes:12,capacity:256,admission:1024},
 bounds:{ticks:128,potential_cells:7,blueprints:2,links:4,materials:2,maximum_receipt_bytes:8388608,maximum_bundle_bytes:67108864},
 capacity:{cases:[training[0],training[3]],warmups:1,samples:30,expected_cold_executions:124,history_verifications:2,buffer_capacity_bytes:8388608,acceptance:{peak_rss_bytes:268435456,receipt_bytes:8388608,completed_bundle_bytes:16777216}},
 accounting:"Each arm submits three candidates, each tested on four training worlds, then freezes once and runs four transfers. The 32 optimizer cold journeys, 8 references, 16 common-reference comparisons and 12 controls total 68. Each run plus habitat answer normally uses 2 executions. Four segmented replays and 12 probes are separate within the 2048-execution allowance. Failed slots and calls remain counted; unknown metrics stop. Independent agents may use identical lawful winners. Reasoning tokens are unobserved. No mid-world refit, cold trial reset disguised as continuity, or extra candidate after failure.",
 provenance_controls:"Qualification retains a constant-bit reply with absent physical provenance. Study additionally latches an old report; service and answer success are distinct. Prebuilt and directforwarding alternatives are legitimate comparisons, not mandatory losers.",
};
write("fixtures/evidence/answer-protocol.json",plan);console.log("Prepared fixed First Answer inputs and protocol; zero new engine executions.");
