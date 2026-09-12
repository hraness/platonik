// Publish exact bounded Rust evidence; deduplication never removes attempts.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {gzipSync,gunzipSync} from "node:zlib";
import {read,sha,identity,protocol,checkedFreeze,checkSelection,caseInput,programs,variant,total,qualifiedReferences} from "./common.mjs";
const [directory,keepDirectory,frugalDirectory,capacityDirectory,calibrationDirectory]=process.argv.slice(2);
assert(directory&&keepDirectory&&frugalDirectory&&capacityDirectory&&calibrationDirectory);
const roots=Object.fromEntries(Object.entries({coordinator:directory,keep:keepDirectory,frugal:frugalDirectory,capacity:capacityDirectory,calibration:calibrationDirectory}).map(([key,value])=>[key,fs.realpathSync(value)]));
const plan=protocol(),freeze=checkedFreeze(),artifacts={};
const ledgers=Object.fromEntries(Object.entries(roots).map(([key,value])=>[key,read(path.join(value,"ledger.json"))]));
for(const owner of Object.values(ledgers))assert(owner.finished&&!owner.stopped&&!owner.pending_call&&!owner.pending_operation&&!owner.accounting_incomplete);
function put(file,raw,extra={}){fs.mkdirSync(path.dirname(file),{recursive:true});if(fs.existsSync(file))assert(fs.readFileSync(file).equals(raw),`Immutable artifact differs: ${file}`);else fs.writeFileSync(file,raw,{flag:"wx"});artifacts[file]={sha256:sha(raw),bytes:raw.length,...extra};return file;}
const include=file=>put(file,fs.readFileSync(file));
function compressed(kind,raw,maximum=plan.bounds.maximum_bundle_bytes){assert(raw.length<=maximum);const zipped=gzipSync(raw,{level:9});assert(gunzipSync(zipped,{maxOutputLength:maximum}).equals(raw));return put(`fixtures/evidence/ports-${kind}/${sha(raw)}.json.gz`,zipped,{uncompressed_sha256:sha(raw),uncompressed_bytes:raw.length});}
for(const file of ["fixtures/evidence/ports-protocol.json","fixtures/evidence/ports-freeze.json",plan.qualification_file,"fixtures/evidence/ports-calibration.json",...plan.cases.map(row=>row.file)])include(file);
const qualification=read(plan.qualification_file);for(const [file,meta] of Object.entries(qualification.artifacts)){const raw=fs.readFileSync(file);assert.equal(sha(raw),meta.sha256);assert.equal(raw.length,meta.bytes);put(file,raw,meta);}
const rejectedCalls=new Map();
for(const key of ["keep","frugal"]){const owner=ledgers[key];checkSelection(owner,roots[key]);for(const candidate of owner.candidates)if(candidate.admission!=="completed")for(let index=candidate.first_call;index<candidate.after_call;index++)if(owner.calls[index].exit_code===2)rejectedCalls.set(`${key}:${index}`,true);}
for(const [key,owner]of Object.entries(ledgers))for(const call of owner.calls)for(const field of ["stdout","stderr"]){
 const raw=fs.readFileSync(path.join(roots[key],call[field]));assert.equal(sha(raw),call[`${field}_sha256`]);
 if(rejectedCalls.has(`${key}:${call.index}`)){
  if(field==="stdout"){assert.equal(raw.toString().trim(),"");call.stdout_file=compressed("process",raw);continue;}
  const safe=Buffer.from(raw.toString().split("\n").filter(line=>{try{return JSON.parse(line).schema==="platonik-process-metrics-v1";}catch{return false;}}).join("\n")+"\n");
  assert.deepEqual(safe.toString().trim().split("\n").map(JSON.parse),[call.metrics]);call.stderr_file=compressed("process",safe);call.stderr_public_sha256=sha(safe);call.stderr_redacted="Only the exact process metrics line is public; the raw diagnostic stays local.";continue;
 }
 assert(!raw.includes(Buffer.from(roots[key])),"Do not publish private local save paths");call[`${field}_file`]=compressed("process",raw);
}
const reference=programs(caseInput(plan.training[0]));
function receiptFor(key,row,expected){
 const raw=row.qualification_index!==undefined?gunzipSync(fs.readFileSync(row.receipt_file),{maxOutputLength:plan.bounds.maximum_receipt_bytes}):fs.readFileSync(path.join(roots[key],row.receipt));assert.equal(sha(raw),row.receipt_sha256);const receipt=JSON.parse(raw);
 assert.deepEqual(receipt.experiment,expected);assert.equal(receipt.experiment_hash,identity(receipt.experiment));assert.equal(receipt.result_hash,identity(receipt.result));
 for(const [field,value]of Object.entries({experiment_hash:receipt.experiment_hash,result_hash:receipt.result_hash,status:receipt.result.status,ticks:receipt.result.ticks_completed,passed:receipt.result.outcome.passed,work:total(receipt.result.costs),commitments_passed:row.ports.commitments_passed}))assert.deepEqual(row[field],value);
 assert.equal(row.ports.experiment_hash,receipt.experiment_hash);assert.equal(row.ports.result_hash,receipt.result_hash);
 assert.equal(row.ports.evidence_hash,identity({kind:"finished",value:receipt.result}));
 if(row.qualification_index===undefined)row.receipt_file=compressed("receipts",raw,plan.bounds.maximum_receipt_bytes);return receipt;
}
for(const owner of ["keep","frugal"]){
 const arm=ledgers[owner];
 for(const candidate of arm.candidates){
  if(candidate.source){const raw=fs.readFileSync(path.join(roots[owner],candidate.source));assert.equal(sha(raw),candidate.source_sha256);candidate.source_bytes=raw.length;if(candidate.trials.length)candidate.source_file=put(`fixtures/evidence/ports-submissions/${owner}-${candidate.sequence}.json`,raw);else{candidate.source_file=null;candidate.source_retained_locally=true;}}
  if(!candidate.trials.length){assert.equal(candidate.admission,"rejected");delete candidate.programs;candidate.id=null;candidate.metadata_redacted=true;const diagnostic=path.join(roots[owner],`submission-${candidate.sequence}.error.txt`);if(fs.existsSync(diagnostic))candidate.local_diagnostic_sha256=sha(fs.readFileSync(diagnostic));}
  for(const row of candidate.trials)receiptFor(owner,row,variant(caseInput(row.case_id),candidate.programs));
 }
 for(const row of arm.transfer)receiptFor(owner,row,variant(caseInput(row.case_id),arm.selected.programs));
}
const ledger=ledgers.coordinator;assert.deepEqual(ledger.references,qualifiedReferences());
for(const row of [...ledger.references,...ledger.comparisons,...ledger.controls])receiptFor("coordinator",row,variant(caseInput(row.case_id),reference,row.kind));
function saveArtifacts(key,row,receipt,stem,publicFiles=false){
 const raw=fs.readFileSync(path.join(roots[key],row.bundle));assert.equal(sha(raw),row.bundle_sha256);
 const bundle=JSON.parse(raw),event=entry=>bundle.objects[entry.event.event_hash];
 assert.deepEqual(event(bundle.entries[0]).experiment,receipt.experiment);assert.deepEqual(event(bundle.entries.at(-1)),{kind:"completed",result:{kind:"finished",value:receipt.result}});
 row.bundle_file=publicFiles?put(`${stem}.bundle.json`,raw):compressed("histories",raw);
 for(const restored of row.restorations){const raw=fs.readFileSync(path.join(roots[key],restored.bundle));assert.equal(sha(raw),restored.bundle_sha256);const data=JSON.parse(raw),last=data.objects[data.entries.at(-1).event.event_hash];assert.equal(last.result.kind,"paused");assert.deepEqual(last.result.value.frames,receipt.result.frames.filter(frame=>frame.tick<=restored.tick));restored.bundle_file=publicFiles?put(`${stem}.at-${restored.tick}.bundle.json`,raw):compressed("histories",raw);}
}
const index={schema:"platonik-continuous-site-v1",cases:[]};
const labels={"ports-reference":"Two promises between homes","familiar-couriers":"Keep my couriers","frugal-ports":"Spend less work","lost-ack":"Delivered, but no reply"};
for(const [number,row]of ledger.replays.entries()){
 const spec=plan.replays[number];for(const field of ["id","case_id","kind","owner"])assert.equal(row[field],spec[field]);
 const input=spec.owner==="reference"?reference:ledgers[spec.owner].selected.programs,receipt=receiptFor("coordinator",row,variant(caseInput(row.case_id),input,row.kind));
 const stem=`public/ports/${row.id}`;put(`${stem}.receipt.json`,Buffer.from(JSON.stringify(receipt)+"\n"));put(`${stem}.experiment.json`,Buffer.from(JSON.stringify(receipt.experiment)+"\n"));saveArtifacts("coordinator",row,receipt,stem,true);
 assert.deepEqual(row.checkpoints.map(cut=>cut.tick),spec.cuts);assert.deepEqual(row.restorations.map(cut=>cut.tick),spec.restore_ticks);assert(row.restored_equal&&row.uninterrupted_equal);
 index.cases.push({id:row.id,label:labels[row.id],detail:row.commitments_passed?"Independent endpoints exchange two finite parcels, confirm custody and keep their services running.":"Custody, acknowledgment, spare preservation and service are separate claims. This record preserves the observed failure.",passed:row.passed,work:row.work,ticks:row.ticks,result_hash:row.result_hash,ports:row.ports,uninterrupted_equal:row.uninterrupted_equal,restored_equal:row.restored_equal,
 cuts:row.checkpoints.map(cut=>{const frame=receipt.result.frames.find(frame=>frame.tick===cut.tick);assert(frame?.complete);assert.equal(identity(frame.state),cut.state_hash);assert.equal(identity(frame.costs),cut.costs_hash);
 const moments=row.ports.commitments;
 const label=cut.tick===128?'Exchange outcome':moments.some(c=>c.acknowledged?.tick===cut.tick)?'Custody acknowledged':moments.some(c=>c.accepted===cut.tick)?'Parcel accepted':moments.some(c=>c.picked_up===cut.tick)?'Parcel collected':frame.state.cells.some(cell=>cell.cargo)?'Cargo in transit':frame.state.pending.length?'Reports in transit':'Ports at work';
 return{tick:cut.tick,label,detail:`${moments.filter(c=>c.accepted!==null&&c.accepted<=cut.tick).length} parcels accepted; ${moments.filter(c=>c.acknowledged&&c.acknowledged.tick<=cut.tick).length} custody acknowledgments; ${frame.state.delivered.length} physical service deliveries; ${total(frame.costs)} modeled work.`,state_hash:cut.state_hash,costs_hash:cut.costs_hash};})});
}
if(index.cases.length)put("public/ports/index.json",Buffer.from(JSON.stringify(index)+"\n"));
for(const probe of ledger.probes)if(probe.input){const raw=fs.readFileSync(path.join(roots.coordinator,probe.input));assert.equal(sha(raw),probe.input_sha256);probe.input_file=compressed("probes",raw);}
const calibration=ledgers.calibration;assert.deepEqual(JSON.parse(JSON.stringify(calibration,(key,value)=>["stdout_file","stderr_file"].includes(key)?undefined:value)),read("fixtures/evidence/ports-calibration.json"));
const calibrationReceipt=receiptFor("calibration",calibration.replay,caseInput(plan.replays[0].case_id));saveArtifacts("calibration",calibration.replay,calibrationReceipt,null);
for(const field of ["final_bundle","restoration_bundle"]){const raw=fs.readFileSync(path.join(roots.calibration,calibration.tutorial[field]));calibration.tutorial[`${field}_file`]=compressed("histories",raw);calibration.tutorial[`${field}_sha256`]=sha(raw);}
const capacity=ledgers.capacity,raw=fs.readFileSync(path.join(roots.capacity,capacity.measurement));assert.equal(sha(raw),capacity.measurement_sha256);capacity.measurement_file=put("fixtures/evidence/ports-capacity.json",raw);
const logical_cold_runs=[ledger,ledgers.keep,ledgers.frugal].reduce((sum,owner)=>sum+owner.calls.filter(call=>call.args[0]==="run").length,0);
const study={schema:"platonik-ports-study-v1",protocol_sha256:sha(fs.readFileSync("fixtures/evidence/ports-protocol.json")),freeze_sha256:sha(fs.readFileSync("fixtures/evidence/ports-freeze.json")),source_digest:identity(freeze.source),ledger,arms:{keep:ledgers.keep,frugal:ledgers.frugal},calibration,capacity,artifacts,
 finished:{logical_cold_runs,reused_reference_runs:ledger.references.length,study_engine_executions:ledger.engine_executions+ledgers.keep.engine_executions+ledgers.frugal.engine_executions,qualification_engine_executions:qualification.engine_executions+calibration.engine_executions,capacity_engine_executions:capacity.engine_executions,commitments_passed:!!ledger.finished.references_commitments_passed&&ledgers.keep.finished.commitments_passed&&ledgers.frugal.finished.commitments_passed,capacity_passed:capacity.finished.passed,reasoning_tokens:null}};
put("fixtures/evidence/ports-study.json",Buffer.from(JSON.stringify(study)+"\n"));
console.log(JSON.stringify({study:"fixtures/evidence/ports-study.json",finished:study.finished,artifact_files:Object.keys(artifacts).length}));
