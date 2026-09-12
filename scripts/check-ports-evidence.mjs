// Independent fresh admission. This file does not import frozen study helpers.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
let executions=0,reported=false,accountingIncomplete=false;
function admissionMetrics(){if(!reported){reported=true;console.error(JSON.stringify({schema:"platonik-ports-admission-metrics-v1",engine_executions:executions,maximum_engine_executions:1024,accounting_incomplete:accountingIncomplete}));}}
process.once("exit",admissionMetrics);
const equal = assert.deepEqual;
const sha = value => createHash("sha256").update(value).digest("hex");
const identity = value => `sha256:${sha(JSON.stringify(value))}`;
const sum = values => values.reduce((a, b) => a + b, 0);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const prefix = "fixtures/evidence/ports-";
function local(file) {
  assert(typeof file === "string" && !path.isAbsolute(file) && !file.includes("\\"));
  assert(file.split("/").every(part => part && part !== "." && part !== "..")); return file;
}
function bytes(file, maximum = 64 * 1024 * 1024) {
  local(file); const stat = fs.lstatSync(file); assert(stat.isFile() && stat.size <= maximum);
  return fs.readFileSync(file);
}
const read = file => JSON.parse(bytes(file));

const plan = read(`${prefix}protocol.json`), freeze = read(`${prefix}freeze.json`), study = read(`${prefix}study.json`);
equal([plan.schema,freeze.schema,study.schema],["platonik-ports-protocol-v1","platonik-ports-freeze-v1","platonik-ports-study-v1"]);
equal(study.protocol_sha256,sha(bytes(`${prefix}protocol.json`)));equal(study.freeze_sha256,sha(bytes(`${prefix}freeze.json`)));equal(study.source_digest,identity(freeze.source));
for(const [file,hash]of Object.entries(freeze.source.source_files_sha256)){local(file);assert(digest(hash));}
assert(digest(freeze.source.release_binary_sha256)&&digest(freeze.source.capacity_binary_sha256));
equal(freeze.source.source_files_sha256[`${prefix}protocol.json`],study.protocol_sha256);
const training=['ports-clear-zero-one','ports-clear-one-zero','ports-request-loss','ports-ack-loss'],transfer=['ports-slow-zero-one','ports-slow-one-zero','ports-duplicate-requests','ports-duplicate-acks'];
equal(plan.training,training);equal(plan.transfer,transfer);
const roles={requesters:[10,11],couriers:[1,4],report_relays:[2,5],network_relays:[12,13],keepers:[3,6]};
const lanes=[
 {id:0,requester:10,courier:1,report_relay:2,network_relay:12,keeper:3,source:10,depot:11,valve:30,beacons:[20,21],parcel:100,spare:101,request_links:[40,41],ack_links:[42,43],report_links:[44,45,46],duplicate_request:47,duplicate_ack:48},
 {id:1,requester:11,courier:4,report_relay:5,network_relay:13,keeper:6,source:12,depot:13,valve:31,beacons:[22,23],parcel:200,spare:201,request_links:[50,51],ack_links:[52,53],report_links:[54,55,56],duplicate_request:57,duplicate_ack:58},
];
equal(plan.roles,roles);equal(plan.lanes,lanes);equal(plan.comparison_kinds,['request-once']);
const controls=[{kind:'idle-courier',cases:[training[0],training[1]]},{kind:'idle-report-relay',cases:[training[0],training[1]]},{kind:'premature-ack',cases:[training[0],training[1]]},{kind:'forget-done',cases:[training[3],transfer[2]]},{kind:'missing-parcel',cases:[training[0],training[1]]},{kind:'no-ack',cases:[training[0],training[1]]}];
equal(plan.controls,controls);equal(plan.control_kinds,controls.map(row=>row.kind));
equal(plan.budget,{fixture_qualification:128,cli_calibration:256,study:1024,each_agent:64,coordinator:896,candidate_slots:3,logical_cold_runs:52,reused_reference_runs:8,segmented_replays:4,integrity_probes:12,capacity:192,admission:1024});
equal(plan.bounds,{ticks:128,cells:10,links:18,maximum_receipt_bytes:8388608,maximum_bundle_bytes:67108864});
equal(plan.capacity,{cases:[training[0],training[3]],warmups:1,samples:30,expected_cold_executions:124,history_verifications:2,buffer_capacity_bytes:8388608,acceptance:{peak_rss_bytes:268435456,receipt_bytes:8388608,completed_bundle_bytes:16777216}});
const inventory=new Map();let expandedTotal=0;
assert(Object.keys(study.artifacts).length<=4096);
for(const [file,meta]of Object.entries(study.artifacts)){
 assert(file.startsWith(prefix)||file.startsWith("public/ports/"));assert(digest(meta.sha256)&&integer(meta.bytes));const raw=bytes(file);equal(raw.length,meta.bytes);equal(sha(raw),meta.sha256);
 if(file.endsWith(".gz")){assert(integer(meta.uncompressed_bytes)&&meta.uncompressed_bytes<=plan.bounds.maximum_bundle_bytes&&digest(meta.uncompressed_sha256));equal(path.basename(file),file.startsWith(`${prefix}qualification/`)?`${meta.uncompressed_sha256}.gz`:`${meta.uncompressed_sha256}.json.gz`);const raw=gunzipSync(bytes(file),{maxOutputLength:Math.max(1,meta.uncompressed_bytes)});equal(raw.length,meta.uncompressed_bytes);equal(sha(raw),meta.uncompressed_sha256);if(file.startsWith(`${prefix}receipts/`)){assert(raw.length<=plan.bounds.maximum_receipt_bytes);expandedTotal+=raw.length;assert(expandedTotal<=512*1024*1024);}}
 inventory.set(file,meta);
}
function artifact(file){assert(inventory.has(file),`Unlisted artifact: ${file}`);return inventory.get(file);}
function expanded(file){const meta=artifact(file),raw=bytes(file);return file.endsWith(".gz")?gunzipSync(raw,{maxOutputLength:Math.max(1,meta.uncompressed_bytes)}):raw;}
function output(call,field="stdout"){const raw=expanded(call[`${field}_file`]);if(field==="stderr"&&call.stderr_redacted){assert(digest(call.stderr_sha256));equal(sha(raw),call.stderr_public_sha256);}else equal(sha(raw),call[`${field}_sha256`]);return raw;}
function metricLedger(owner,name,maximum){
 equal(owner.schema,"platonik-ports-ledger-v1");equal(owner.owner,name);equal(owner.maximum_engine_executions,maximum);
 if(name==="calibration")equal(owner.source,freeze.source);else equal(owner.source_digest,study.source_digest);
 assert(owner.finished&&!owner.stopped&&!owner.pending_call&&!owner.pending_operation&&!owner.accounting_incomplete);
 let consumed=0;for(const [index,call]of owner.calls.entries()){
  equal(call.index,index);assert(integer(call.reserved_engine_executions));assert(consumed+call.reserved_engine_executions<=maximum);equal(call.executable,name==="capacity"&&index===0?"target/release/examples/ports_capacity":"target/release/platonik");
  assert(Number.isFinite(call.elapsed_ms)&&call.elapsed_ms>0);assert([0,1,2].includes(call.exit_code));assert(call.args.every(arg=>typeof arg==="string"));
  const metrics=output(call,"stderr").toString().trim().split("\n").filter(line=>line.startsWith("{")).map(JSON.parse).filter(row=>row.schema==="platonik-process-metrics-v1");equal(metrics,[call.metrics]);assert(integer(call.metrics.engine_executions)&&integer(call.metrics.elapsed_micros)&&call.metrics.engine_executions<=call.reserved_engine_executions);consumed+=call.metrics.engine_executions;output(call);
  if(call.stderr_redacted){assert(["keep","frugal"].includes(name));equal(call.exit_code,2);equal(call.metrics.engine_executions,0);equal(output(call,"stderr").toString(),JSON.stringify(call.metrics)+"\n");equal(output(call).toString().trim(),"");}
  if(call.peak_rss_bytes!==undefined){const match=/\b(\d+)\s+maximum resident set size/.exec(output(call,"stderr").toString());assert(match);equal(call.peak_rss_bytes,Number(match[1]));assert(integer(call.peak_rss_bytes)&&call.peak_rss_bytes>0);}
 }equal(consumed,owner.engine_executions);assert(consumed<=maximum);
}
const ledger=study.ledger;metricLedger(ledger,"coordinator",896);for(const owner of ["keep","frugal"])metricLedger(study.arms[owner],owner,64);metricLedger(study.calibration,"calibration",256);metricLedger(study.capacity,"capacity",192);
const temporary = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "platonik-ports-check-"));
const binary = path.resolve(process.env.PLATONIK_CLI ?? "target/debug/platonik");
function cli(args, accepted = 0, reservation = 64) {
  assert(executions + reservation <= 1024, "Fresh admission execution allowance");
  const result = spawnSync(binary, ["--metrics", ...args], { encoding: "utf8", timeout: 60_000, maxBuffer: 70 * 1024 * 1024 });
  let metrics;
  try {metrics=result.stderr.trim().split("\n").filter(Boolean).map(JSON.parse).filter(row=>row.schema==="platonik-process-metrics-v1");assert.equal(metrics.length,1);assert(integer(metrics[0].engine_executions));}
  catch(error){accountingIncomplete=true;throw error;}
  executions += metrics[0].engine_executions;
  assert(metrics[0].engine_executions<=reservation);if(result.error)throw result.error;
  equal(result.status, accepted, `Fresh ${args.slice(0, 2).join(" ")}: ${result.stderr.slice(0, 500)}`);
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}

const cache=new Map(),grades=new Map(),visited=new Set(),cases=new Map();
function checked(file){const raw=expanded(file),hash=sha(raw);visited.add(file);assert(raw.length<=plan.bounds.maximum_receipt_bytes);if(cache.has(hash))return JSON.parse(raw);
 const receipt=JSON.parse(raw);equal([receipt.schema,receipt.protocol],["platonik-receipt-v1","platonik-habitat-v3"]);equal(receipt.experiment_hash,identity(receipt.experiment));equal(receipt.result_hash,identity(receipt.result));
 const target=path.join(temporary,`${hash}.json`);fs.writeFileSync(target,raw,{flag:"wx"});const ports=cli(["habitat","ports-check",target],0,2);equal(ports.schema,"platonik-port-commitments-v1");equal(ports.result_hash,receipt.result_hash);equal(ports.experiment_hash,receipt.experiment_hash);equal(ports.evidence_hash,identity({kind:"finished",value:receipt.result}));grades.set(`${receipt.experiment_hash}:${receipt.result_hash}`,ports);cache.set(hash,true);return receipt;}
function portsFor(receipt){assert(grades.has(`${receipt.experiment_hash}:${receipt.result_hash}`));return grades.get(`${receipt.experiment_hash}:${receipt.result_hash}`);}
const idle=()=>({rules:[{when:[],action:{kind:"wait"},remember:null}]});
function programs(world){
 const requester=world.cells.find(cell=>cell.id===roles.requesters[0]).program,courier=world.cells.find(cell=>cell.id===roles.couriers[0]).program;
 for(const id of roles.requesters)equal(world.cells.find(cell=>cell.id===id).program,requester);
 for(const id of roles.couriers)equal(world.cells.find(cell=>cell.id===id).program,courier);
 return {requester,courier};
}
const normalizedPrograms=input=>Object.fromEntries(Object.entries(input).map(([role,program])=>[role,{...structuredClone(program),rules:program.rules.map(rule=>({...structuredClone(rule),remember:rule.remember??null}))}]));
function expectedCase(world,program,kind='reference'){
 const result=structuredClone(world),cell=id=>result.cells.find(cell=>cell.id===id);
 for(const id of roles.requesters)cell(id).program=structuredClone(program.requester);
 for(const id of roles.couriers)cell(id).program=structuredClone(program.courier);
 if(kind==='request-once')for(const id of roles.requesters)cell(id).program.rules=[{when:[{kind:'memory',slot:3,value:0}],action:{kind:'send',port:0,bit:{kind:'memory',slot:2}},remember:{slot:3,value:1}},...cell(id).program.rules.filter(rule=>rule.action.kind!=='send'),...idle().rules];
 else if(kind==='idle-courier')for(const id of roles.couriers)cell(id).program=idle();
 else if(kind==='idle-report-relay')for(const id of roles.report_relays)cell(id).program=idle();
 else if(kind==='premature-ack')for(const lane of lanes)cell(lane.courier).program.rules.unshift({when:[{kind:'memory',slot:3,value:0}],action:{kind:'send',port:0,bit:{kind:'constant',value:cell(lane.requester).memory[2]!==0}},remember:{slot:3,value:1}});
 else if(kind==='forget-done'){for(const id of roles.couriers)result.events.push({tick:24,event:{kind:'clear_memory',cell:id}});result.events.sort((a,b)=>a.tick-b.tick);}
 else if(kind==='missing-parcel')for(const lane of lanes)result.sources.find(row=>row.id===lane.source).sparks.shift();
 else if(kind==='no-ack'){const blocked=lanes.flatMap(lane=>[...lane.ack_links,lane.duplicate_ack]);for(const link of result.links)if(blocked.includes(link.id))link.enabled=false;result.events=result.events.filter(row=>row.event.kind!=='link_enabled'||!blocked.includes(row.event.id));}
 else assert(['reference','candidate','selected'].includes(kind));return result;
}
function rowCheck(row,program,kind=row.kind??"candidate"){
 assert(cases.has(row.case_id));const receipt=checked(row.receipt_file);equal(receipt.experiment,expectedCase(cases.get(row.case_id),program,kind));equal(sha(expanded(row.receipt_file)),row.receipt_sha256);
 equal(row.experiment_hash,receipt.experiment_hash);equal(row.result_hash,receipt.result_hash);equal(row.status,receipt.result.status);equal(row.ticks,receipt.result.ticks_completed);equal(row.work,sum(Object.values(receipt.result.costs)));equal(row.passed,receipt.result.outcome.passed);equal(row.ports,portsFor(receipt));equal(row.commitments_passed,row.ports.commitments_passed);return receipt;
}
function coldCalls(owner,row,receipt,offset){equal([row.first_call,row.last_call],[offset,offset+1]);const first=owner.calls[offset],last=owner.calls[offset+1];equal(first.args,["run",`${row.id}/experiment.json`]);equal(last.args,["habitat","ports-check",`${row.id}/receipt.json`]);equal([first.metrics.engine_executions,last.metrics.engine_executions],[1,1]);equal([first.exit_code,last.exit_code],[receipt.result.outcome.passed?0:1,0]);equal(JSON.parse(output(first)),receipt);equal(JSON.parse(output(last)),portsFor(receipt));return offset+2;}
const receiptProbeIds=['forged-request-bit','forged-request-origin','forged-ack-provenance','early-ack','duplicated-service-credit','spent-spare','unearned-drop','cross-port-service','forged-custody-report'];
const bundleProbeIds=['forged-checkpoint-cargo','foreign-future-fuel','foreign-obligation'];
function probeMutation(receipt,bundle,id){
 if(bundleProbeIds.includes(id)){
  const value=structuredClone(bundle),events=value.entries.map(entry=>structuredClone(value.objects[entry.event.event_hash])),checkpoint=events.at(-1).result.value;
  if(id==='forged-checkpoint-cargo')checkpoint.frames.at(-1).state.cells.find(cell=>cell.id===roles.couriers[0]).cargo={id:999,bit:false};else if(id==='foreign-future-fuel')checkpoint.experiment.fuel++;else checkpoint.experiment.cells.find(cell=>cell.id===roles.requesters[0]).memory[2]^=1;
  checkpoint.experiment_hash=identity(checkpoint.experiment);checkpoint.prefix_hash=identity(checkpoint.frames);value.objects={};for(const[index,entry]of value.entries.entries()){entry.event.event_hash=identity(events[index]);entry.previous_hash=index?identity(value.entries[index-1]):null;value.objects[entry.event.event_hash]=events[index];}return value;
 }
 const value=structuredClone(receipt),frames=value.result.frames,signal=(outcome,link)=>{const found=frames.flatMap(frame=>frame.signals).find(event=>event.outcome===outcome&&event.signal.link===link);assert(found);return found.signal;};
 if(id==='forged-request-bit')signal('delivered',41).bit=!signal('delivered',41).bit;
 else if(id==='forged-request-origin')signal('consumed',41).from.id=13;
 else if(id==='forged-ack-provenance')signal('consumed',43).receipt_spark=101;
 else if(id==='early-ack')signal('consumed',43).sent_tick=1;
 else if(id==='duplicated-service-credit'){const final=frames.at(-1).state;assert(final.delivered.length);final.delivered.push(structuredClone(final.delivered[0]));value.result.final_state=structuredClone(final);}
 else if(id==='spent-spare'){const final=frames.at(-1).state,source=final.sources.find(row=>row.id===10);assert(source.sparks.some(row=>row.id===101));source.sparks=source.sparks.filter(row=>row.id!==101);value.result.final_state=structuredClone(final);}
 else if(id==='unearned-drop'){const action=frames.flatMap(frame=>frame.activations).find(row=>row.cell===roles.couriers[0]&&row.action.kind==='drop'&&row.success);assert(action);action.success=false;}
 else if(id==='cross-port-service'){const final=frames.at(-1).state,delivery=final.delivered.find(row=>row.spark.id===100);assert(delivery);delivery.beacon=22;value.result.final_state=structuredClone(final);}
 else {equal(id,'forged-custody-report');signal('queued',44).receipt_spark=101;}
 value.result_hash=identity(value.result);return value;
}
function checkpoint(receipt, tick) {
  const frames = receipt.result.frames.filter(frame => frame.tick <= tick);
  return { schema: "platonik-checkpoint-v1", experiment_hash: receipt.experiment_hash, prefix_hash: identity(frames), experiment: receipt.experiment, frames };
}
function bundleCheck(bundle, receipt, cuts, requestIds = cuts.map(tick => `leg-${tick}`)) {
  equal(bundle.schema, "platonik-habitat-bundle-v1"); equal(bundle.entries.length, 1 + 2 * cuts.length);
  const event = entry => bundle.objects[entry.event.event_hash];
  equal(event(bundle.entries[0]), { kind: "initialized", experiment: receipt.experiment, result: { kind: "paused", value: checkpoint(receipt, 0) } });
  const referenced = new Set();
  for (const [index, entry] of bundle.entries.entries()) {
    equal(entry.schema, "platonik-habitat-journal-v1"); equal(entry.revision, index);
    equal(entry.previous_hash, index ? identity(bundle.entries[index - 1]) : null);
    equal(entry.event.event_hash, identity(event(entry))); referenced.add(entry.event.event_hash);
  }
  equal(Object.keys(bundle.objects).sort(), [...referenced].sort());
  for (const [index, tick] of cuts.entries()) {
    const start = bundle.entries[1 + index * 2], end = bundle.entries[2 + index * 2];
    const previousTick = cuts[index - 1] ?? 0;
    const previousResult = { kind: "paused", value: checkpoint(receipt, previousTick) };
    equal(event(start), { kind: "started", until: tick, from_hash: identity(previousResult),
      reserved_work: receipt.experiment.fuel - sum(Object.values(receipt.result.frames[previousTick].costs)) });
    for (const entry of [start, end]) {
      equal(entry.event.request_id, requestIds[index]); equal(entry.event.expected_revision, index * 2);
      equal(entry.event.command_hash, identity({ until: tick }));
    }
    equal(event(end), { kind: "completed", result: tick === receipt.experiment.ticks
      ? { kind: "finished", value: receipt.result } : { kind: "paused", value: checkpoint(receipt, tick) } });
  }
}
function reportCheck(report, receipt, tick, advances) {
  equal([report.pending_request_id, report.pending_until, report.pending_reserved_work], [null, null, 0]);
  const frame = receipt.result.frames[tick]; equal(report.tick, tick); equal(report.revision, advances * 2); equal(report.advances, advances);
  equal(report.experiment_hash, receipt.experiment_hash); equal(report.current_state, frame.state); equal(report.costs, frame.costs);
  equal(report.remaining_fuel, receipt.experiment.fuel - sum(Object.values(frame.costs)));
  equal(report.phase, tick === receipt.experiment.ticks ? "finished" : "paused");
  equal(report.result_hash, tick === receipt.experiment.ticks ? receipt.result_hash : null);
  equal(report.checkpoint_hash, tick === receipt.experiment.ticks ? null : identity(checkpoint(receipt, tick)));
}
function spoolBundle(file) {
  const raw = expanded(file), target = path.join(temporary, `bundle-${sha(raw)}.json`);
  if (!fs.existsSync(target)) fs.writeFileSync(target, raw, { flag: "wx" });
  return target;
}
function replayCheck(row, spec, receipt, offset, owner = ledger) {
  equal(row.first_call, offset); equal(row.checkpoints.map(item => item.tick), spec.cuts);
  equal(row.restorations.map(item => item.tick), spec.restore_ticks); assert(row.uninterrupted_equal && row.restored_equal);
  let save = `${row.id}/save`, revision = 0;
  const take = args => { const call = owner.calls[offset++]; equal(call.args, args); assert([0, 1].includes(call.exit_code)); return JSON.parse(output(call)); };
  reportCheck(take(["habitat", "init", save, `${row.id}/experiment.json`]), receipt, 0, 0);
  for (const [index, tick] of spec.cuts.entries()) {
    const report = take(["habitat", "advance", save, "--until", String(tick), "--expect-revision", String(revision), "--request-id", `leg-${tick}`]);
    revision += 2; reportCheck(report, receipt, tick, index + 1);
    const cut = row.checkpoints[index], frame = receipt.result.frames[tick];
    equal(cut.state_hash, identity(frame.state)); equal(cut.costs_hash, identity(frame.costs));
    equal(cut.costs, frame.costs); equal(cut.revision, revision); equal(cut.phase, report.phase);
    equal(cut.remaining_fuel, report.remaining_fuel); equal(cut.checkpoint_hash, report.checkpoint_hash); equal(cut.result_hash, report.result_hash);
    if (spec.restore_ticks.includes(tick)) {
      const bundle = take(["habitat", "export", save]); bundleCheck(bundle, receipt, spec.cuts.slice(0, index + 1));
      const restoration = row.restorations.find(item => item.tick === tick);
      equal(JSON.parse(expanded(restoration.bundle_file)), bundle); equal(sha(expanded(restoration.bundle_file)), restoration.bundle_sha256);
      save = `${row.id}/restored-${tick}`;
      const restored = take(["habitat", "import", `${row.id}/at-${tick}.bundle.json`, save]);
      equal(report.request_id, `leg-${tick}`); equal(restored.request_id, null);
      equal(restored, { ...report, request_id: null });
      const destination = path.join(temporary, `${owner.owner}-${row.id}-at-${tick}`);
      const imported = cli(["habitat", "import", spoolBundle(restoration.bundle_file), destination]);
      equal(cli(["habitat", "verify", destination]), imported); reportCheck(imported, receipt, tick, index + 1);
      equal(restoration.checkpoint_hash, report.checkpoint_hash); equal(restoration.state_hash, cut.state_hash); equal(restoration.costs_hash, cut.costs_hash); assert(restoration.equal);
    }
  }
  const bundle = take(["habitat", "export", save]); bundleCheck(bundle, receipt, spec.cuts);
  equal(JSON.parse(expanded(row.bundle_file)), bundle); equal(sha(expanded(row.bundle_file)), row.bundle_sha256);
  equal(take(["habitat", "ports-check", `${row.id}/receipt.json`]), portsFor(receipt)); equal(row.after_call, offset);
  const destination = path.join(temporary, `${owner.owner}-${row.id}-final`);
  const imported = cli(["habitat", "import", spoolBundle(row.bundle_file), destination]);
  equal(cli(["habitat", "verify", destination]), imported); reportCheck(imported, receipt, receipt.experiment.ticks, spec.cuts.length);
  equal(imported.mission_passed, receipt.result.outcome.passed);
  return offset;
}

try {
 equal(plan.cases.map(row=>row.id),[...training,...transfer]);
 for(const item of plan.cases){equal(item.file,`${prefix}cases/${item.id}.json`);artifact(item.file);equal(sha(bytes(item.file)),item.sha256);equal(freeze.source.source_files_sha256[item.file],item.sha256);const world=read(item.file);equal(cli(['habitat','case',item.id],0,0),world);equal([world.version,world.ticks,world.cells.length,world.links.length],[3,128,10,18]);assert(!world.construction);cases.set(item.id,world);}
 equal(new Set([...cases.values()].map(identity)).size,8);
 for(const source of plan.ancestry_sources){equal(sha(bytes(source.file)),source.sha256);equal(freeze.source.source_files_sha256[source.file],source.sha256);}
 const ancestor=read(plan.ancestry_sources[0].file),oldKeeper=ancestor.cells.find(cell=>cell.id===3).program,oldRelay=ancestor.cells.find(cell=>cell.id===2).program;
 equal(plan.ancestry_sources.map(row=>row.file),['fixtures/evidence/continuity-inputs/previous-resilient--changing-one.json']);
 for(const world of cases.values())for(const lane of lanes){equal(world.cells.find(cell=>cell.id===lane.report_relay).program,oldRelay);const keeper=structuredClone(oldKeeper);for(const rule of keeper.rules)if(rule.action.kind==='route')rule.action.valve=lane.valve;equal(world.cells.find(cell=>cell.id===lane.keeper).program,keeper);}
 const qualification=read(plan.qualification_file);artifact(plan.qualification_file);equal(sha(bytes(plan.qualification_file)),freeze.qualification_sha256);equal(qualification.schema,'platonik-ports-ledger-v1');equal(qualification.maximum_engine_executions,128);assert(qualification.finished&&!qualification.stopped&&!qualification.pending_attempt&&!qualification.pending_call&&!qualification.accounting_incomplete);
 equal([qualification.plan.schema,qualification.plan.maximum_engine_executions],['platonik-ports-qualification-plan-v1',128]);equal(qualification.plan.training,training);equal(qualification.plan.transfer,transfer);equal(qualification.plan.controls,controls.map(row=>({kind:row.kind,case_id:row.cases[0]})));
 for(const [file,meta]of Object.entries(qualification.artifacts))equal(artifact(file),meta);
 const qbytes=localFile=>{assert(Object.hasOwn(qualification.files,localFile));return expanded(qualification.files[localFile]);};
 let qconsumed=0;
 for(const[index,call]of qualification.calls.entries()){
  equal(call.index,index);assert(integer(call.reserved_engine_executions));assert(qconsumed+call.reserved_engine_executions<=128);equal(call.executable,'target/release/platonik');
  for(const field of ['stdout','stderr'])equal(sha(qbytes(call[field])),call[`${field}_sha256`]);
  const metrics=qbytes(call.stderr).toString().trim().split('\n').filter(Boolean).map(JSON.parse).filter(row=>row.schema==='platonik-process-metrics-v1');equal(metrics,[call.metrics]);assert(integer(call.metrics.engine_executions)&&integer(call.metrics.elapsed_micros)&&call.metrics.engine_executions<=call.reserved_engine_executions);qconsumed+=call.metrics.engine_executions;assert(Number.isFinite(call.elapsed_ms)&&call.elapsed_ms>0);
 }
 equal(qconsumed,qualification.engine_executions);assert(qconsumed<=128);
 const finalReference=qualification.batches[qualification.finished.reference_batch],finalControls=qualification.batches[qualification.finished.control_batch];
 assert(finalReference?.completed&&finalControls?.completed);equal(finalReference.operation,'references');equal(finalControls.operation,'controls');equal(finalReference.source.files,finalControls.source.files);equal(finalReference.source.binary_sha256,finalControls.source.binary_sha256);equal(finalReference.source.binary_sha256,freeze.source.release_binary_sha256);
 for(const[file,hash]of Object.entries(finalReference.source.files)){assert(Object.hasOwn(freeze.source.source_files_sha256,file));equal(freeze.source.source_files_sha256[file],hash);}
 let qoffset=0;const attemptIndices=[];
 for(const[index,batch]of qualification.batches.entries()){
  equal(batch.sequence,index);equal(batch.first_call,qoffset);assert(batch.completed);assert(['references','controls'].includes(batch.operation));equal(batch.source_digest,identity(batch.source));assert(digest(batch.source.binary_sha256));
  for(const[file,hash]of Object.entries(batch.source.files))equal(sha(qbytes(`${batch.source.directory}/${file}`)),hash);
  equal(batch.attempts.length,batch.operation==='references'?8:6);
  for(const[position,attemptIndex]of batch.attempts.entries()){
   attemptIndices.push(attemptIndex);const row=qualification.attempts[attemptIndex];equal(row.index,attemptIndex);equal(row.batch,index);equal(row.first_call,qoffset);assert(row.completed);
   const recipe=batch.operation==='references'?{case_id:[...training,...transfer][position]}:qualification.plan.controls[position];equal(row.case_id,recipe.case_id);equal(row.kind,recipe.kind);
   const exported=qualification.calls[qoffset++],run=qualification.calls[qoffset++];equal(exported.args,['habitat','case',row.case_id]);equal(exported.metrics.engine_executions,0);equal(exported.exit_code,0);equal(run.args,['run',row.input]);equal(sha(qbytes(row.input)),row.input_sha256);
   const exportedWorld=JSON.parse(qbytes(exported.stdout)),input=JSON.parse(qbytes(row.input));
   if(batch===finalReference||batch===finalControls){equal(exportedWorld,cases.get(row.case_id));equal(input,row.kind?expectedCase(exportedWorld,programs(exportedWorld),row.kind):exportedWorld);}
   else if(!row.kind)equal(input,exportedWorld);
   // Earlier failed recipes are retained historical qualification attempts;
   // their inputs/results replay, but do not inherit final-recipe success claims.
   if(row.rejected){equal(run.exit_code,2);equal(run.metrics.engine_executions,0);equal(row.after_call,qoffset);equal(row.diagnostic_file,run.stderr);equal([row.service_passed,row.commitments_passed],[false,false]);const target=path.join(temporary,`qualification-rejected-${row.index}.json`);fs.writeFileSync(target,qbytes(row.input),{flag:'wx'});cli(['run',target],2,1);continue;}
   const gradeCall=qualification.calls[qoffset++];equal([run.metrics.engine_executions,gradeCall.metrics.engine_executions],[1,1]);equal(gradeCall.exit_code,0);equal(row.after_call,qoffset);equal(gradeCall.args,['habitat','ports-check',row.receipt]);equal(run.stdout,row.receipt);equal(gradeCall.stdout,row.grade_file);equal(run.stdout_sha256,row.receipt_sha256);
   const receipt=checked(qualification.files[row.receipt]);equal(receipt.experiment,input);equal(run.exit_code,receipt.result.outcome.passed?0:1);equal(row.experiment_hash,receipt.experiment_hash);equal(row.result_hash,receipt.result_hash);equal(row.grade,portsFor(receipt));equal(JSON.parse(qbytes(row.grade_file)),row.grade);
   equal([row.service_passed,row.commitments_passed],[row.grade.service_passed,row.grade.commitments_passed]);equal(row.status,receipt.result.status);equal(row.ticks,receipt.result.ticks_completed);equal(row.work,sum(Object.values(receipt.result.costs)));
  }
  equal(batch.after_call,qoffset);
 }
 equal(qoffset,qualification.calls.length);equal(attemptIndices,qualification.attempts.map((_,index)=>index));
 for(const index of [...finalReference.attempts,...finalControls.attempts]){const row=qualification.attempts[index];equal([row.status,row.ticks],['complete',128]);assert(checked(qualification.files[row.receipt]).result.frames.every(frame=>frame.complete));equal(row.commitments_passed,finalReference.attempts.includes(index));}
 equal(qualification.finished,{commitments_passed:true,reference_batch:finalReference.sequence,control_batch:finalControls.sequence,reused_references:8});
 const reference=programs(cases.get(training[0]));
 for(const name of ["keep","frugal"]){
  const arm=study.arms[name];equal(arm.candidates.length,3);let offset=0;
  for(const [index,candidate]of arm.candidates.entries()){
   equal(candidate.sequence,index+1);equal(candidate.first_call,offset);assert(["completed","rejected","partial"].includes(candidate.admission));
   if(candidate.source_file){equal(candidate.source_file,`${prefix}submissions/${name}-${index+1}.json`);equal(sha(expanded(candidate.source_file)),candidate.source_sha256);equal(bytes(candidate.source_file).length,candidate.source_bytes);assert(candidate.source_bytes<=65536);}
   if(candidate.admission==="completed"||candidate.trials.length){
    const source=read(candidate.source_file);equal(Object.keys(source).sort(),["courier","id","requester"]);equal(source.id,candidate.id);assert(/^[a-z][a-z0-9-]{0,31}$/.test(candidate.id));equal(candidate.programs,normalizedPrograms({requester:source.requester,courier:source.courier}));if(name==="keep"){equal(candidate.programs.courier,reference.courier);}
   }
   if(candidate.admission==="completed")equal(candidate.trials.map(row=>row.case_id),training);
   else{assert(!candidate.commitments_passed);equal(candidate.trials.map(row=>row.case_id),training.slice(0,candidate.trials.length));assert(candidate.trials.length<4);if(!candidate.source_file){equal(candidate.trials,[]);assert(candidate.metadata_redacted);equal(candidate.id,null);assert(candidate.programs===undefined);if(candidate.source){assert(candidate.source_retained_locally&&digest(candidate.source_sha256)&&integer(candidate.source_bytes)&&candidate.source_bytes<=65536);}else assert(candidate.input_unavailable);if(candidate.local_diagnostic_sha256)assert(digest(candidate.local_diagnostic_sha256));}}
   for(const row of candidate.trials)offset=coldCalls(arm,row,rowCheck(row,candidate.programs),offset);
   if(candidate.admission!=="completed"&&offset<candidate.after_call){equal(candidate.after_call,offset+1);const rejected=arm.calls[offset++];equal(rejected.exit_code,2);equal(rejected.args,["run",`c${index+1}-${training[candidate.trials.length]}/experiment.json`]);equal(rejected.metrics.engine_executions,0);}
   equal(candidate.after_call,offset);
   if(candidate.trials.length)equal(identity(candidate.programs),identity(programs(checked(candidate.trials[0].receipt_file).experiment)));
   if(candidate.admission==="completed"){equal(candidate.work,sum(candidate.trials.map(row=>row.work)));equal(candidate.program_bytes,Buffer.byteLength(JSON.stringify(programs(checked(candidate.trials[0].receipt_file).experiment))));equal(candidate.commitments_passed,candidate.trials.every(row=>row.commitments_passed));}
  }
  const winner=arm.candidates.filter(item=>item.admission==="completed"&&item.commitments_passed).sort((a,b)=>a.work-b.work||a.program_bytes-b.program_bytes||a.sequence-b.sequence)[0]??null;
  if(winner){equal(arm.selected,{id:winner.id,sequence:winner.sequence,programs:winner.programs,program_hash:identity(winner.programs),training_work:winner.work,after_call:offset});equal(arm.transfer.map(row=>row.case_id),transfer);for(const row of arm.transfer)offset=coldCalls(arm,row,rowCheck(row,winner.programs),offset);equal(arm.finished.commitments_passed,arm.transfer.every(row=>row.commitments_passed));assert(arm.finished.all_inputs_retained);}
  else{equal(arm.selected,null);equal(arm.transfer,[]);equal(arm.finished.commitments_passed,false);}
  equal(offset,arm.calls.length);equal(arm.finished.logical_cold_runs,arm.calls.filter(call=>call.args[0]==="run").length);
 }
 let offset=0;equal(ledger.references.map(row=>row.case_id),[...training,...transfer]);
 for(const[index,row]of ledger.references.entries()){
  equal(row.kind,'reference');equal(row.qualification_index,finalReference.attempts[index]);const original=qualification.attempts[row.qualification_index];
  equal(row.receipt_file,qualification.files[original.receipt]);equal(row.receipt_sha256,original.receipt_sha256);equal(row.ports,original.grade);rowCheck(row,reference);assert(!Object.hasOwn(row,'first_call')&&!Object.hasOwn(row,'last_call'));
 }
 equal(ledger.comparisons.map(row=>[row.kind,row.case_id]),plan.comparison_kinds.flatMap(kind=>[...training,...transfer].map(id=>[kind,id])));for(const row of ledger.comparisons)offset=coldCalls(ledger,row,rowCheck(row,reference),offset);
 equal(ledger.controls.map(row=>[row.kind,row.case_id]),plan.controls.flatMap(({kind,cases})=>cases.map(id=>[kind,id])));for(const row of ledger.controls)offset=coldCalls(ledger,row,rowCheck(row,reference),offset);
 const selected=Object.values(study.arms).every(arm=>arm.selected);
 const replayDefinitions=[{id:'ports-reference',owner:'reference',case_id:training[0],kind:'reference'},{id:'familiar-couriers',owner:'keep',case_id:transfer[2],kind:'selected'},{id:'frugal-ports',owner:'frugal',case_id:training[3],kind:'selected'},{id:'lost-ack',owner:'reference',case_id:training[0],kind:'no-ack'}];
 equal(plan.replays,replayDefinitions.map(row=>({...row,cuts:[1,8,16,32,64,128],restore_ticks:[8,32]})));
 const replayReceipts=[];
 if(selected){
  equal(ledger.replays.length,4);
  for(const[index,row]of ledger.replays.entries()){const spec=plan.replays[index];for(const field of ["id","owner","case_id","kind"])equal(row[field],spec[field]);const input=spec.owner==="reference"?reference:study.arms[spec.owner].selected.programs;const receipt=rowCheck(row,input);replayReceipts.push(receipt);equal(row.bundle_file,`public/ports/${row.id}.bundle.json`);offset=replayCheck(row,spec,receipt,offset);}
  equal(ledger.probes.map(row=>row.id),[...receiptProbeIds,...bundleProbeIds]);
  const sourceReceipt=replayReceipts[0],sourceBundle=JSON.parse(expanded(ledger.replays[0].restorations[0].bundle_file));
  for(const [index,probe]of ledger.probes.entries()){
   equal(probe.type,index<9?"receipt":"bundle");equal(probe.first_call,offset);equal(probe.after_call,offset+1);equal(probe.status,"pass");assert(probe.rejected);equal(sha(expanded(probe.input_file)),probe.input_sha256);equal(JSON.parse(expanded(probe.input_file)),probeMutation(sourceReceipt,sourceBundle,probe.id));
   const call=ledger.calls[offset++],args=probe.type==="receipt"?["habitat","ports-check",`probe-${probe.id}.json`]:["habitat","import",`probe-${probe.id}.json`,`rejected-${probe.id}`];equal(call.args,args);equal(call.exit_code,2);equal(probe.engine_executions,call.metrics.engine_executions);
   const input=path.join(temporary,`probe-${probe.id}.json`);fs.writeFileSync(input,expanded(probe.input_file),{flag:"wx"});const destination=path.join(temporary,`rejected-${probe.id}`);cli(probe.type==="receipt"?["habitat","ports-check",input]:["habitat","import",input,destination],2,probe.type==="receipt"?2:64);assert(!fs.existsSync(destination));
  }
  equal(ledger.finished,{references_commitments_passed:ledger.references.every(row=>row.commitments_passed),all_saved_traces_equal:ledger.replays.every(row=>row.restored_equal&&row.uninterrupted_equal),probes_passed:ledger.probes.every(row=>row.status==="pass"),control_findings:Object.fromEntries(plan.control_kinds.map(kind=>[kind,ledger.controls.filter(row=>row.kind===kind).every(row=>row.status==="complete"&&!row.commitments_passed)])),logical_cold_runs:ledger.calls.filter(call=>call.args[0]==="run").length});
 }else{equal(ledger.replays,[]);equal(ledger.probes,[]);assert(!ledger.finished.commitments_passed);}
 equal(offset,ledger.calls.length);
 const calibration=study.calibration,calibrationFile=`${prefix}calibration.json`;
 equal(sha(bytes(calibrationFile)),freeze.calibration_sha256);artifact(calibrationFile);
 const projectedKeys=["stdout_file","stderr_file","receipt_file","bundle_file","final_bundle_file","restoration_bundle_file","final_bundle_sha256","restoration_bundle_sha256"];
 equal(JSON.parse(JSON.stringify(calibration,(key,value)=>projectedKeys.includes(key)?undefined:value)),read(calibrationFile));
 const calibrationRow={...calibration.replay,case_id:training[0]},calibrationReceipt=rowCheck(calibrationRow,reference);
 let calibrationOffset=replayCheck(calibrationRow,plan.replays[0],calibrationReceipt,0,calibration);
 const tutorial=plan.tutorial;equal(tutorial,{case_id:training[3],pause_tick:24,first_request_id:'first-handoff',final_request_id:'keep-the-promise'});
 const tutorialReceipt=checked(ledger.references.find(row=>row.case_id===tutorial.case_id).receipt_file);
 const tutorialCall=args=>{const call=calibration.calls[calibrationOffset++];equal(call.args,args);equal(call.exit_code,0);return JSON.parse(output(call));};
 const initial=tutorialCall(["habitat","init","tutorial-save","tutorial.experiment.json"]);reportCheck(initial,tutorialReceipt,0,0);equal(initial.request_id,"init");
 const opening=tutorialCall(["habitat","ports","tutorial-save"]);equal(opening,calibration.tutorial.opening);equal(opening.schema,"platonik-ports-report-v1");equal(opening.habitat,{...initial,request_id:null});equal([opening.ports.tick,opening.ports.phase,opening.ports.commitments_passed],[0,"in_progress",false]);equal(opening.ports.evidence_hash,identity({kind:"paused",value:checkpoint(tutorialReceipt,0)}));
 const openingDestination=path.join(temporary,"tutorial-opening");equal(cli(["habitat","init",openingDestination,`${prefix}cases/${tutorial.case_id}.json`]),initial);equal(cli(["habitat","ports",openingDestination]),opening);
 const partial=tutorialCall(["habitat","advance","tutorial-save","--until",String(tutorial.pause_tick),"--expect-revision","0","--request-id",tutorial.first_request_id]);reportCheck(partial,tutorialReceipt,tutorial.pause_tick,1);equal(partial.request_id,tutorial.first_request_id);
 const partialJourney=tutorialCall(["habitat","ports","tutorial-save"]);equal(partialJourney,calibration.tutorial.partial);equal(partialJourney.habitat,{...partial,request_id:null});equal([partialJourney.ports.tick,partialJourney.ports.phase,partialJourney.ports.commitments_passed],[tutorial.pause_tick,"in_progress",false]);equal(partialJourney.ports.evidence_hash,identity({kind:"paused",value:checkpoint(tutorialReceipt,tutorial.pause_tick)}));
 equal([partialJourney.ports.custody_passed,partialJourney.ports.acknowledgments_passed,partialJourney.ports.safety_passed],[true,false,true]);assert(partialJourney.ports.commitments.every(row=>row.accepted!==null&&row.acknowledged===null));
 const partialBundle=tutorialCall(["habitat","export","tutorial-save"]);bundleCheck(partialBundle,tutorialReceipt,[tutorial.pause_tick],[tutorial.first_request_id]);equal(JSON.parse(expanded(calibration.tutorial.restoration_bundle_file)),partialBundle);equal(sha(expanded(calibration.tutorial.restoration_bundle_file)),calibration.tutorial.restoration_bundle_sha256);
 const restored=tutorialCall(["habitat","import",`tutorial.at-${tutorial.pause_tick}.bundle.json`,"tutorial-restored"]);equal(restored,{...partial,request_id:null});
 const completed=tutorialCall(["habitat","advance","tutorial-restored","--until","128","--expect-revision","2","--request-id",tutorial.final_request_id]);reportCheck(completed,tutorialReceipt,128,2);equal(completed.request_id,tutorial.final_request_id);
 const finalJourney=tutorialCall(["habitat","ports","tutorial-restored"]);equal(finalJourney.habitat,{...completed,request_id:null});equal(finalJourney.ports,portsFor(tutorialReceipt));equal(calibration.tutorial.ports,finalJourney.ports);
 equal(tutorialCall(["habitat","verify","tutorial-restored"]),finalJourney.habitat);
 const completedBundle=tutorialCall(["habitat","export","tutorial-restored"]);bundleCheck(completedBundle,tutorialReceipt,[tutorial.pause_tick,128],[tutorial.first_request_id,tutorial.final_request_id]);equal(JSON.parse(expanded(calibration.tutorial.final_bundle_file)),completedBundle);equal(sha(expanded(calibration.tutorial.final_bundle_file)),calibration.tutorial.final_bundle_sha256);equal(calibrationOffset,calibration.calls.length);assert(calibration.tutorial.restored_equal&&calibration.tutorial.uninterrupted_equal);
 for(const [field,tick,advances,expectedJourney]of [["restoration_bundle_file",tutorial.pause_tick,1,partialJourney.ports],["final_bundle_file",128,2,finalJourney.ports]]){
  const destination=path.join(temporary,`tutorial-${tick}`),report=cli(["habitat","import",spoolBundle(calibration.tutorial[field]),destination]);reportCheck(report,tutorialReceipt,tick,advances);const actual=cli(["habitat","ports",destination]);equal(actual.habitat,report);equal(actual.ports,expectedJourney);
 }
 const capacity=study.capacity,measurement=read(capacity.measurement_file);equal(capacity.measurement_file,`${prefix}capacity.json`);equal(sha(bytes(capacity.measurement_file)),capacity.measurement_sha256);equal(capacity.benchmark_binary_sha256,freeze.source.capacity_binary_sha256);equal(capacity.platform,"darwin");assert(typeof capacity.architecture==="string");assert(capacity.cpu===null||typeof capacity.cpu==="string");assert(capacity.malloc_nano_zone===null||typeof capacity.malloc_nano_zone==="string");
 equal(measurement.schema,"platonik-ports-capacity-v1");equal(measurement.buffer_strategy,"fixed reusable Vec with bounded Write");equal(measurement.buffer_capacity_bytes,8388608);assert(measurement.buffer_retained_during_rss);equal(measurement.engine_executions,124);equal(measurement.workloads.length,2);
 const benchmarkCall=capacity.calls[0];equal(benchmarkCall.args,plan.capacity.cases.map(id=>`${prefix}cases/${id}.json`));equal(JSON.parse(output(benchmarkCall)),measurement);equal(benchmarkCall.metrics.engine_executions,124);equal(benchmarkCall.exit_code,0);equal(benchmarkCall.reserved_engine_executions,124);equal(capacity.peak_rss_bytes,benchmarkCall.peak_rss_bytes);
 for(const [index,workload]of measurement.workloads.entries()){
  const caseId=plan.capacity.cases[index],row=ledger.references.find(row=>row.case_id===caseId),receipt=checked(row.receipt_file),ports=portsFor(receipt);equal(workload.id,`${prefix}cases/${caseId}.json`);equal(workload.experiment,cases.get(caseId));equal(workload.experiment_hash,receipt.experiment_hash);equal(workload.samples.length,30);
  for(const sample of [workload.warmup,...workload.samples]){
   equal(sample.result_hash,receipt.result_hash);equal(sample.ports_hash,identity(ports));equal(sample.receipt_bytes,Buffer.byteLength(JSON.stringify(receipt)));equal(sample.serialized_receipt_sha256,identity(receipt));equal(sample.serialization_capacity_bytes,8388608);equal(sample.engine_executions,2);
   for(const field of ["receipt_ms","serialize_ms","verify_ms","total_ms","identity_check_ms","full_sample_ms"])assert(Number.isFinite(sample[field])&&sample[field]>=0);assert(sample.total_ms+0.000001>=sample.receipt_ms+sample.serialize_ms+sample.verify_ms);assert(sample.full_sample_ms+0.000001>=sample.total_ms+sample.identity_check_ms);
   equal(sample.rss_after_release.source,"ps RSS in KiB");equal(sample.rss_after_release.platform,"macos");if(sample.rss_after_release.bytes===null)assert(typeof sample.rss_after_release.error==="string");else {assert(integer(sample.rss_after_release.bytes)&&sample.rss_after_release.bytes>0);equal(sample.rss_after_release.error,null);}
  }
  const times=workload.samples.map(row=>row.total_ms).sort((a,b)=>a-b);equal(workload.p50_ms,times[14]);equal(workload.p95_ms,times[28]);
 }
 equal(capacity.histories.length,selected?2:0);equal(capacity.calls.length,1+capacity.histories.length);
 for(const[index,history]of capacity.histories.entries()){
  const row=ledger.replays[index],call=capacity.calls[index+1];equal(history.id,row.id);equal(history.result_hash,row.result_hash);equal(history.bundle_sha256,row.bundle_sha256);equal(history.bundle_bytes,expanded(row.bundle_file).length);equal(history.call,index+1);equal(history.elapsed_ms,call.elapsed_ms);equal(history.peak_rss_bytes,call.peak_rss_bytes);equal(call.args.slice(0,2),["habitat","ports"]);equal(call.args.length,3);local(call.args[2]);assert(call.args[2].endsWith(`/${row.id}/restored-${plan.replays[index].restore_ticks.at(-1)}`));equal(call.exit_code,0);equal(call.metrics.engine_executions,13);
  const report=JSON.parse(output(call));equal(report.ports,row.ports);equal(report.schema,"platonik-ports-report-v1");reportCheck(report.habitat,replayReceipts[index],128,6);equal(report.habitat.request_id,null);
 }
 const capacityPass=capacity.histories.length===2&&capacity.peak_rss_bytes<=268435456&&capacity.histories.every(row=>row.peak_rss_bytes<=268435456&&row.bundle_bytes<=16777216)&&measurement.workloads.every(row=>[row.warmup,...row.samples].every(sample=>sample.receipt_bytes<=8388608));equal(capacity.finished,{passed:capacityPass,thresholds:plan.capacity.acceptance});
 if(selected){
  const indexFile="public/ports/index.json",index=read(indexFile);artifact(indexFile);equal(index.schema,"platonik-continuous-site-v1");equal(index.cases.length,4);
  for(const [number,item]of index.cases.entries()){
   const row=ledger.replays[number],receipt=replayReceipts[number],stem=`public/ports/${row.id}`;equal(item.id,row.id);assert(typeof item.label==="string"&&item.label.length>0&&item.label.length<100);assert(typeof item.detail==="string"&&item.detail.length>0&&item.detail.length<1000);
   artifact(`${stem}.experiment.json`);artifact(`${stem}.receipt.json`);equal(read(`${stem}.experiment.json`),receipt.experiment);equal(read(`${stem}.receipt.json`),receipt);
   for(const field of ["passed","work","ticks","result_hash","ports","uninterrupted_equal","restored_equal"])equal(item[field],row[field]);equal(item.cuts.map(cut=>cut.tick),row.checkpoints.map(cut=>cut.tick));
   for(const [cutIndex,cut]of item.cuts.entries()){const original=row.checkpoints[cutIndex],frame=receipt.result.frames[cut.tick];equal(cut.state_hash,original.state_hash);equal(cut.costs_hash,original.costs_hash);equal(cut.state_hash,identity(frame.state));equal(cut.costs_hash,identity(frame.costs));assert(typeof cut.label==="string"&&cut.label.length>0&&cut.label.length<100);assert(typeof cut.detail==="string"&&cut.detail.length>0&&cut.detail.length<500);}
  }
 }else assert(!inventory.has("public/ports/index.json"));
 const logical=[ledger,...Object.values(study.arms)].reduce((sum,owner)=>sum+owner.calls.filter(call=>call.args[0]==="run").length,0);assert(logical<=52);
 equal(study.finished,{logical_cold_runs:logical,reused_reference_runs:8,study_engine_executions:ledger.engine_executions+study.arms.keep.engine_executions+study.arms.frugal.engine_executions,qualification_engine_executions:qualification.engine_executions+study.calibration.engine_executions,capacity_engine_executions:study.capacity.engine_executions,commitments_passed:!!ledger.finished.references_commitments_passed&&study.arms.keep.finished.commitments_passed&&study.arms.frugal.finished.commitments_passed,capacity_passed:study.capacity.finished.passed,reasoning_tokens:null});
 assert(study.finished.study_engine_executions<=1024&&study.finished.qualification_engine_executions<=384&&executions<=1024);
 console.log(`Admitted First Ports evidence: ${logical} cold attempts, ${cache.size} distinct receipts, ${executions} fresh engine executions; commitments_passed=${study.finished.commitments_passed}, capacity=${study.finished.capacity_passed}.`);
} finally {admissionMetrics();fs.rmSync(temporary,{recursive:true,force:true});}
