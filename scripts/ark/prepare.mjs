// Project retained qualification bytes and declare the optimizer protocol.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {read,sha,identity} from './runner.mjs';
const write=(file,value)=>{const raw=Buffer.from(JSON.stringify(value)+'\n');if(fs.existsSync(file))assert(fs.readFileSync(file).equals(raw),'Immutable preparation artifact differs');else fs.writeFileSync(file,raw,{flag:'wx'});};
import {training,transfer} from './qualify.mjs';
const [directory]=process.argv.slice(2);assert(directory);
const original=read(path.join(directory,'ledger.json'));
assert(original.finished?.arithmetic_passed&&original.finished.pairs===256&&!original.stopped&&!original.pending_call&&!original.pending_attempt);
assert(original.engine_executions<=1536);
const references=[...original.batches].reverse().find(row=>row.operation==='references'&&row.completed);
assert(references?.attempts.length===8&&references.attempts.every(index=>original.attempts[index].control_passed));
const artifacts={},files={};
const put=(local,raw)=>{const publicFile=`fixtures/evidence/ark-qualification/${sha(raw)}.gz`;const zipped=gzipSync(raw,{level:9});fs.mkdirSync(path.dirname(publicFile),{recursive:true});if(fs.existsSync(publicFile))assert(fs.readFileSync(publicFile).equals(zipped));else fs.writeFileSync(publicFile,zipped,{flag:'wx'});artifacts[publicFile]={sha256:sha(zipped),bytes:zipped.length,uncompressed_sha256:sha(raw),uncompressed_bytes:raw.length};files[local]=publicFile;};
for(const row of original.calls)for(const field of ['stdout','stderr']){const raw=fs.readFileSync(path.join(directory,row[field]));assert.equal(sha(raw),row[`${field}_sha256`]);assert(!raw.includes(Buffer.from(fs.realpathSync(directory))));put(row[field],raw);}
for(const row of original.attempts){const raw=fs.readFileSync(path.join(directory,row.input));assert.equal(sha(raw),row.input_sha256);put(row.input,raw);}
for(const batch of original.batches)for(const [file,digest]of Object.entries(batch.source.files)){const local=`${batch.source.directory}/${file}`,raw=fs.readFileSync(path.join(directory,local));assert.equal(sha(raw),digest);put(local,raw);}
const qualification={...original,original_ledger_sha256:sha(fs.readFileSync(path.join(directory,'ledger.json'))),files,artifacts};
write('fixtures/evidence/ark-qualification.json',qualification);
fs.mkdirSync('fixtures/evidence/ark-cases',{recursive:true});
for(const index of references.attempts){const row=original.attempts[index];write(`fixtures/evidence/ark-cases/${row.case_id}.json`,read(path.join(directory,row.receipt)).experiment);}
const cases=[...training,...transfer].map(id=>{const file=`fixtures/evidence/ark-cases/${id}.json`;return{id,file,sha256:sha(fs.readFileSync(file))};});
const controls=[
 {kind:'idle-clock-courier',cases:[training[0],training[1]]},
 {kind:'idle-payload-courier',cases:[training[0],training[1]]},
 {kind:'idle-relay',cases:[training[0],training[1]]},
 {kind:'clear-keeper',cases:[training[1],training[2]]},
 {kind:'without-carry-writes',cases:[training[1],training[3]]},
 {kind:'fixed-tap-zero',cases:[training[0],training[1]]},
];
const replays=[
 {id:'ark-control',owner:'reference',case_id:training[1],kind:'reference'},
 {id:'familiar-couriers',owner:'keep',case_id:training[2],kind:'selected'},
 {id:'frugal-ark',owner:'frugal',case_id:training[3],kind:'selected'},
 {id:'forgotten-plan',owner:'reference',case_id:training[1],kind:'clear-keeper'},
].map(row=>({...row,cuts:[1,2,6,38,47,48,52,128],restore_ticks:[6,48]}));
const ancestry=['fixtures/evidence/navigation-repair-submissions/compass-goal-heading.json','fixtures/evidence/continuity-inputs/previous-resilient--changing-one.json'];
const plan={schema:'platonik-ark-protocol-v1',declared_on:'2026-09-12',scope:'Public developer-agent diagnostic of one add4-and-route transaction in a 128-tick world. The full campaign, repeated-query processor, stored-program computer and moving ark remain proposals. Transfer recipes are public and selected programs are frozen before their transfer runs.',
 roles:{clock_courier:1,relay:2,keeper:3,a_forwarder:8,b_shifter:9,adder:10,selector:11,payload_courier:12,operand_sink:13,clock_source:10,payload_source:14,output_link:46,selected_link:47},
 arithmetic:{inputs_a:[0,15],inputs_b:[0,15],carry_in:0,output_bits:5,truth_pairs:256,truth_tap:0,plans:{sum_lsb:0,carry:4},qualification:'All 256 pairs use the actual physical clock and the same fixed component programs. The two plans are additionally checked on eight declared voyages. Fixed arithmetic is not redundantly retested for each controller submission.'},
 training,transfer,cases,replays,controls,control_kinds:controls.map(row=>row.kind),comparison_kinds:['constant-zero','constant-one'],qualification_file:'fixtures/evidence/ark-qualification.json',ancestry_sources:ancestry.map(file=>({file,sha256:sha(fs.readFileSync(file))})),
 arms:{keep:'Keep both exact earlier courier programs; edit only the selector policy.',frugal:'May additionally edit both courier policies. Arithmetic, relay, Keeper and operand sink programs, body state and world fields remain fixed.'},
 selection:['control passes all four training worlds','least total modeled work','least canonical clock courier + payload courier + selector program bytes','earliest submitted slot'],
 candidate_normalization:'Raw submissions stay immutable. Only omitted Rule.remember normalizes to null. Rust typed output determines policy bytes and identity after the first admitted receipt.',
 budget:{fixture_qualification:1536,cli_calibration:360,study:2048,each_agent:64,coordinator:1920,candidate_slots:3,logical_cold_runs:68,segmented_replays:4,integrity_probes:12,capacity:256,admission:1536},
 bounds:{ticks:128,cells:10,links:8,maximum_receipt_bytes:8388608,maximum_bundle_bytes:67108864},
 capacity:{cases:[training[1],training[2]],warmups:1,samples:30,expected_cold_executions:124,history_verifications:2,buffer_capacity_bytes:8388608,acceptance:{peak_rss_bytes:268435456,receipt_bytes:8388608,completed_bundle_bytes:16777216}},
 accounting:'Thirty-two optimizer cold worlds, eight reference worlds, sixteen constant-output comparisons and twelve controls total 68; every run and fresh ark-check normally uses two executions. Four eight-cut/two-import histories and twelve integrity probes share the separate 2048 study allowance. Qualification1536, calibration360, capacity256 and fresh admission1536 are disjoint. Rejected slots and unknown completion remain recorded; unknown counters stop execution. Reasoning tokens are unobserved.',
 boundaries:'One finite supplied arithmetic transaction. A lawful simpler controller may tie or win on this public family. Reference removals test that architecture, not necessity of arithmetic or memory for every algorithm. Failed service, wrong sum, missing selection and lost retention are separate outcomes.'};
write('fixtures/evidence/ark-protocol.json',plan);
console.log(JSON.stringify({qualification_engine_executions:original.engine_executions,truth_pairs:256,case_count:8,protocol_identity:identity(plan)}));
