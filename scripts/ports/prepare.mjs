// Project retained qualification bytes and declare the optimizer protocol.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {read,sha,identity} from './runner.mjs';
const write=(file,value)=>{const raw=Buffer.from(JSON.stringify(value)+'\n');if(fs.existsSync(file))assert(fs.readFileSync(file).equals(raw),'Immutable preparation artifact differs');else fs.writeFileSync(file,raw,{flag:'wx'});};
import {training,transfer,roles,lanes,controls} from './manifest.mjs';
import {replays,tutorial} from './replay-plan.mjs';
const [directory]=process.argv.slice(2);assert(directory);
const original=read(path.join(directory,'ledger.json'));
assert(original.finished?.commitments_passed&&original.finished.reused_references===8&&!original.stopped&&!original.pending_call&&!original.pending_attempt);
assert(original.engine_executions<=128);
const references=original.batches[original.finished.reference_batch];
assert(references?.attempts.length===8&&references.attempts.every(index=>original.attempts[index].commitments_passed));
const artifacts={},files={};
const put=(local,raw)=>{const publicFile=`fixtures/evidence/ports-qualification/${sha(raw)}.gz`;const zipped=gzipSync(raw,{level:9});fs.mkdirSync(path.dirname(publicFile),{recursive:true});if(fs.existsSync(publicFile))assert(fs.readFileSync(publicFile).equals(zipped));else fs.writeFileSync(publicFile,zipped,{flag:'wx'});artifacts[publicFile]={sha256:sha(zipped),bytes:zipped.length,uncompressed_sha256:sha(raw),uncompressed_bytes:raw.length};files[local]=publicFile;};
for(const row of original.calls)for(const field of ['stdout','stderr']){const raw=fs.readFileSync(path.join(directory,row[field]));assert.equal(sha(raw),row[`${field}_sha256`]);assert(!raw.includes(Buffer.from(fs.realpathSync(directory))));put(row[field],raw);}
for(const row of original.attempts){const raw=fs.readFileSync(path.join(directory,row.input));assert.equal(sha(raw),row.input_sha256);put(row.input,raw);}
for(const batch of original.batches)for(const [file,digest]of Object.entries(batch.source.files)){const local=`${batch.source.directory}/${file}`,raw=fs.readFileSync(path.join(directory,local));assert.equal(sha(raw),digest);put(local,raw);}
const qualification={...original,original_ledger_sha256:sha(fs.readFileSync(path.join(directory,'ledger.json'))),files,artifacts};
write('fixtures/evidence/ports-qualification.json',qualification);
fs.mkdirSync('fixtures/evidence/ports-cases',{recursive:true});
for(const index of references.attempts){const row=original.attempts[index];write(`fixtures/evidence/ports-cases/${row.case_id}.json`,read(path.join(directory,row.receipt)).experiment);}
const cases=[...training,...transfer].map(id=>{const file=`fixtures/evidence/ports-cases/${id}.json`;return{id,file,sha256:sha(fs.readFileSync(file))};});
const ancestry=['fixtures/evidence/continuity-inputs/previous-resilient--changing-one.json'];
const plan={schema:'platonik-ports-protocol-v1',scope:'Public developer-agent diagnostic of two finite per-port commitments in one 128-tick world. Each endpoint can observe its own bits and ports, not the checker parcel identifiers. Transfer recipes are public; selected policies freeze before confirmation. No global consensus, arbitrary identifiers, unbounded loss or full campaign claim.',
 roles,lanes,training,transfer,cases,replays,tutorial,controls,control_kinds:controls.map(row=>row.kind),comparison_kinds:['request-once'],qualification_file:'fixtures/evidence/ports-qualification.json',ancestry_sources:ancestry.map(file=>({file,sha256:sha(fs.readFileSync(file))})),
 arms:{keep:'Retain the exact qualified request courier on both lanes; edit one shared requester program.',frugal:'May edit the shared requester and courier programs. Local report relays, network relays, Keepers, granted state and world rules remain fixed.'},
 selection:['commitments pass all four training worlds','least total modeled work','least canonical requester + courier program bytes','earliest submitted slot'],
 candidate_normalization:'Raw submissions stay immutable. Only omitted Rule.remember normalizes to null. The first admitted Rust receipt supplies typed program identity and scoring bytes. Shared programs apply unchanged to both independent lanes.',
 budget:{fixture_qualification:128,cli_calibration:256,study:1024,each_agent:64,coordinator:896,candidate_slots:3,logical_cold_runs:52,reused_reference_runs:8,segmented_replays:4,integrity_probes:12,capacity:192,admission:1024},
 bounds:{ticks:128,cells:10,links:18,maximum_receipt_bytes:8388608,maximum_bundle_bytes:67108864},
 capacity:{cases:[training[0],training[3]],warmups:1,samples:30,expected_cold_executions:124,history_verifications:2,buffer_capacity_bytes:8388608,acceptance:{peak_rss_bytes:268435456,receipt_bytes:8388608,completed_bundle_bytes:16777216}},
 accounting:'Thirty-two optimizer cold worlds, eight one-shot-request comparisons and twelve controls total 52 new cold worlds. Eight exact frozen reference receipts are reused from qualification, with their original calls retained. Four six-cut/two-import histories and twelve integrity probes share 1024 study executions. Qualification 128, calibration 256, capacity 192 and fresh admission 1024 are disjoint caps. Unknown completion or counters stop execution; no silent retries or budget resets. Reasoning tokens are unobserved.',
 boundaries:'A promise is a declared one-shot obligation on an independent port lane. Acknowledgment certifies depot custody; the unchanged Keeper performs separately checked service. Duplicate requests/reports may consume work but cannot earn another parcel delivery or spend the same-bit spare. Reference removals support that architecture only. All-loss liveness, adversarial agents, node crashes, scalable economy and general exactly-once networking remain untested.'};
write('fixtures/evidence/ports-protocol.json',plan);
console.log(JSON.stringify({qualification_engine_executions:original.engine_executions,reused_reference_runs:8,case_count:8,protocol_identity:identity(plan)}));
