// Independent fresh admission. This file does not import frozen study helpers.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
let executions=0,reported=false,accountingIncomplete=false;
function admissionMetrics(){if(!reported){reported=true;console.error(JSON.stringify({schema:"platonik-answer-admission-metrics-v1",engine_executions:executions,maximum_engine_executions:1024,accounting_incomplete:accountingIncomplete}));}}
process.once("exit",admissionMetrics);
const equal = assert.deepEqual;
const sha = value => createHash("sha256").update(value).digest("hex");
const identity = value => `sha256:${sha(JSON.stringify(value))}`;
const sum = values => values.reduce((a, b) => a + b, 0);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const prefix = "fixtures/evidence/answer-";
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
equal([plan.schema,freeze.schema,study.schema],["platonik-answer-protocol-v1","platonik-answer-freeze-v1","platonik-answer-study-v1"]);
equal(study.protocol_sha256,sha(bytes(`${prefix}protocol.json`)));equal(study.freeze_sha256,sha(bytes(`${prefix}freeze.json`)));equal(study.source_digest,identity(freeze.source));
for(const [file,hash]of Object.entries(freeze.source.source_files_sha256)){local(file);assert(digest(hash));}
assert(digest(freeze.source.release_binary_sha256)&&digest(freeze.source.capacity_binary_sha256));
equal(freeze.source.source_files_sha256[`${prefix}protocol.json`],study.protocol_sha256);
const training=["answer-one","answer-zero","answer-slow","answer-crossing"],transfer=training.map(id=>id.replace("answer-","answer-rotated-"));
equal(plan.training,training);equal(plan.transfer,transfer);
equal(plan.roles,{courier:1,relay:2,keeper:3,builder:5,reply:6,receiver:7,keeper_blueprint:50,reply_blueprint:51,stock:60,incoming_link:42,return_link:43});
equal(plan.comparison_kinds,["prebuilt","direct-reply"]);equal(plan.control_kinds,["no-stock","no-activation","idle-courier","idle-reply","severed-return","stale-reply"]);
equal(plan.budget,{qualification:384,fixture_qualification:24,cli_calibration:360,study:2048,each_agent:64,coordinator:1920,candidate_slots:3,logical_cold_runs:68,segmented_replays:4,integrity_probes:12,capacity:256,admission:1024});
equal(plan.bounds,{ticks:128,potential_cells:7,blueprints:2,links:4,materials:2,maximum_receipt_bytes:8388608,maximum_bundle_bytes:67108864});
equal(plan.capacity,{cases:[training[0],training[3]],warmups:1,samples:30,expected_cold_executions:124,history_verifications:2,buffer_capacity_bytes:8388608,acceptance:{peak_rss_bytes:268435456,receipt_bytes:8388608,completed_bundle_bytes:16777216}});
const inventory=new Map();let expandedTotal=0;
assert(Object.keys(study.artifacts).length<=2048);
for(const [file,meta]of Object.entries(study.artifacts)){
 assert(file.startsWith(prefix)||file.startsWith("public/answer/"));assert(digest(meta.sha256)&&integer(meta.bytes));const raw=bytes(file);equal(raw.length,meta.bytes);equal(sha(raw),meta.sha256);
 if(file.endsWith(".gz")){assert(integer(meta.uncompressed_bytes)&&meta.uncompressed_bytes<=plan.bounds.maximum_bundle_bytes&&digest(meta.uncompressed_sha256));equal(path.basename(file),`${meta.uncompressed_sha256}.json.gz`);const raw=gunzipSync(bytes(file),{maxOutputLength:Math.max(1,meta.uncompressed_bytes)});equal(raw.length,meta.uncompressed_bytes);equal(sha(raw),meta.uncompressed_sha256);if(file.startsWith(`${prefix}receipts/`)){assert(raw.length<=plan.bounds.maximum_receipt_bytes);expandedTotal+=raw.length;assert(expandedTotal<=512*1024*1024);}}
 inventory.set(file,meta);
}
function artifact(file){assert(inventory.has(file),`Unlisted artifact: ${file}`);return inventory.get(file);}
function expanded(file){const meta=artifact(file),raw=bytes(file);return file.endsWith(".gz")?gunzipSync(raw,{maxOutputLength:Math.max(1,meta.uncompressed_bytes)}):raw;}
function output(call,field="stdout"){const raw=expanded(call[`${field}_file`]);if(field==="stderr"&&call.stderr_redacted){assert(digest(call.stderr_sha256));equal(sha(raw),call.stderr_public_sha256);}else equal(sha(raw),call[`${field}_sha256`]);return raw;}
function metricLedger(owner,name,maximum){
 equal(owner.schema,"platonik-answer-ledger-v1");equal(owner.owner,name);equal(owner.maximum_engine_executions,maximum);
 if(name==="calibration")equal(owner.source,freeze.source);else equal(owner.source_digest,study.source_digest);
 assert(owner.finished&&!owner.stopped&&!owner.pending_call&&!owner.pending_operation&&!owner.accounting_incomplete);
 let consumed=0;for(const [index,call]of owner.calls.entries()){
  equal(call.index,index);assert(integer(call.reserved_engine_executions));assert(consumed+call.reserved_engine_executions<=maximum);equal(call.executable,name==="capacity"&&index===0?"target/release/examples/answer_capacity":"target/release/platonik");
  assert(Number.isFinite(call.elapsed_ms)&&call.elapsed_ms>0);assert([0,1,2].includes(call.exit_code));assert(call.args.every(arg=>typeof arg==="string"));
  const metrics=output(call,"stderr").toString().trim().split("\n").filter(line=>line.startsWith("{")).map(JSON.parse).filter(row=>row.schema==="platonik-process-metrics-v1");equal(metrics,[call.metrics]);assert(integer(call.metrics.engine_executions)&&integer(call.metrics.elapsed_micros)&&call.metrics.engine_executions<=call.reserved_engine_executions);consumed+=call.metrics.engine_executions;output(call);
  if(call.stderr_redacted){assert(["keep","frugal"].includes(name));equal(call.exit_code,2);equal(call.metrics.engine_executions,0);equal(output(call,"stderr").toString(),JSON.stringify(call.metrics)+"\n");equal(output(call).toString().trim(),"");}
  if(call.peak_rss_bytes!==undefined){const match=/\b(\d+)\s+maximum resident set size/.exec(output(call,"stderr").toString());assert(match);equal(call.peak_rss_bytes,Number(match[1]));assert(integer(call.peak_rss_bytes)&&call.peak_rss_bytes>0);}
 }equal(consumed,owner.engine_executions);assert(consumed<=maximum);
}
const ledger=study.ledger;metricLedger(ledger,"coordinator",1920);for(const owner of ["keep","frugal"])metricLedger(study.arms[owner],owner,64);metricLedger(study.calibration,"calibration",360);metricLedger(study.capacity,"capacity",256);
const temporary = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "platonik-answer-check-"));
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

const cache=new Map(),journeys=new Map(),visited=new Set(),cases=new Map();
function checked(file){const raw=expanded(file),hash=sha(raw);visited.add(file);assert(raw.length<=plan.bounds.maximum_receipt_bytes);if(cache.has(hash))return cache.get(hash);
 const receipt=JSON.parse(raw);equal([receipt.schema,receipt.protocol],["platonik-receipt-v1","platonik-habitat-v3"]);equal(receipt.experiment_hash,identity(receipt.experiment));equal(receipt.result_hash,identity(receipt.result));
 const target=path.join(temporary,`${hash}.json`);fs.writeFileSync(target,raw,{flag:"wx"});const journey=cli(["habitat","answer",target],0,2);equal(journey.schema,"platonik-first-answer-v1");equal(journey.result_hash,receipt.result_hash);equal(journey.experiment_hash,receipt.experiment_hash);equal(journey.evidence_hash,identity({kind:"finished",value:receipt.result}));journeys.set(receipt.result_hash,journey);cache.set(hash,receipt);return receipt;}
function journeyFor(receipt){assert(journeys.has(receipt.result_hash));return journeys.get(receipt.result_hash);}
const idle=()=>({rules:[{when:[],action:{kind:"wait"},remember:null}]});
const programs=world=>({courier:world.cells.find(cell=>cell.id===1).program,builder:world.cells.find(cell=>cell.id===5).program,reply:world.construction.blueprints.find(item=>item.id===51).body.cell.program});
const normalizedPrograms=input=>Object.fromEntries(Object.entries(input).map(([role,program])=>[role,{...structuredClone(program),rules:program.rules.map(rule=>({...structuredClone(rule),remember:rule.remember??null}))}]));
function expectedCase(world,program,kind="reference"){
 const result=structuredClone(world),parent=result.cells.find(cell=>cell.id===5),reply=result.construction.blueprints.find(item=>item.id===51);
 result.cells.find(cell=>cell.id===1).program=structuredClone(program.courier);parent.program=structuredClone(program.builder);reply.body.cell.program=structuredClone(program.reply);
 if(kind==="prebuilt"){for(const body of result.construction.blueprints.map(item=>item.body)){result.cells.push(structuredClone(body.cell));result.links.push(...structuredClone(body.links));}result.cells.sort((a,b)=>a.id-b.id);result.links.sort((a,b)=>a.id-b.id);parent.program=idle();delete result.construction;}
 else if(kind==="direct-reply")reply.body.cell.program={rules:[{when:[{kind:"has_message",port:0,value:true}],action:{kind:"send",port:0,bit:{kind:"message",port:0}},remember:null},...idle().rules]};
 else if(kind==="no-stock")result.construction.stocks.forEach(stock=>{stock.units=[];});
 else if(kind==="no-activation")parent.program.rules=parent.program.rules.map(rule=>rule.action.kind==="activate"?{...rule,action:{kind:"wait"},remember:null}:rule);
 else if(kind==="idle-courier")result.cells.find(cell=>cell.id===1).program=idle();
 else if(kind==="idle-reply")reply.body.cell.program=idle();
 else if(kind==="severed-return")reply.body.links.find(link=>link.id===43).enabled=false;
 else if(kind==="stale-reply")reply.body.cell.program={rules:[{when:[{kind:"memory",slot:1,value:0},{kind:"has_message",port:0,value:true}],action:{kind:"take_message",port:0,slot:0},remember:{slot:1,value:1}},{when:[],action:{kind:"send",port:0,bit:{kind:"memory",slot:0}},remember:null}]};
 else assert(["reference","candidate","selected"].includes(kind));return result;
}
function rowCheck(row,program,kind=row.kind??"candidate"){
 assert(cases.has(row.case_id));const receipt=checked(row.receipt_file);equal(receipt.experiment,expectedCase(cases.get(row.case_id),program,kind));equal(sha(expanded(row.receipt_file)),row.receipt_sha256);
 equal(row.experiment_hash,receipt.experiment_hash);equal(row.result_hash,receipt.result_hash);equal(row.status,receipt.result.status);equal(row.ticks,receipt.result.ticks_completed);equal(row.work,sum(Object.values(receipt.result.costs)));equal(row.passed,receipt.result.outcome.passed);equal(row.journey,journeyFor(receipt));equal(row.answered,row.journey.answered);return receipt;
}
function coldCalls(owner,row,receipt,offset){equal([row.first_call,row.last_call],[offset,offset+1]);const first=owner.calls[offset],last=owner.calls[offset+1];equal(first.args,["run",`${row.id}/experiment.json`]);equal(last.args,["habitat","answer",`${row.id}/receipt.json`]);equal([first.metrics.engine_executions,last.metrics.engine_executions],[1,1]);equal([first.exit_code,last.exit_code],[receipt.result.outcome.passed?0:1,0]);equal(JSON.parse(output(first)),receipt);equal(JSON.parse(output(last)),journeyFor(receipt));return offset+2;}
function probeMutation(receipt,bundle,id){
 if(["forged-checkpoint-material","foreign-future-fuel","foreign-blueprint"].includes(id)){
  const value=structuredClone(bundle),events=value.entries.map(entry=>structuredClone(value.objects[entry.event.event_hash])),checkpoint=events.at(-1).result.value;
  if(id==="forged-checkpoint-material")checkpoint.frames.at(-1).state.cells.find(cell=>cell.id===5).material=1001;else if(id==="foreign-future-fuel")checkpoint.experiment.fuel++;else checkpoint.experiment.construction.blueprints[0].body.cell.memory[0]^=1;
  checkpoint.experiment_hash=identity(checkpoint.experiment);checkpoint.prefix_hash=identity(checkpoint.frames);value.objects={};for(const[index,entry]of value.entries.entries()){entry.event.event_hash=identity(events[index]);entry.previous_hash=index?identity(value.entries[index-1]):null;value.objects[entry.event.event_hash]=events[index];}return value;
 }
 const value=structuredClone(receipt),frames=value.result.frames,body=value.experiment.construction.blueprints[0].body;
 const partial=frames.find(frame=>frame.state.construction?.assemblies.some(item=>item.copied.length>0&&item.copied.length<Buffer.byteLength(JSON.stringify(body)))),assembly=partial.state.construction.assemblies[0];
 if(id==="duplicate-material")partial.state.construction.stocks[0].units.push(assembly.material);else if(id==="changed-copy-byte")assembly.copied[0]^=1;else if(id==="stolen-reservation")assembly.parent=1;else if(id==="premature-wire")assembly.wired.push(structuredClone(body.links[0]));else if(id==="earlier-birth")frames.find(frame=>frame.state.construction?.births.length).state.construction.births[0].tick--;else if(id==="refunded-copying"){partial.costs.copying--;partial.activations.find(item=>item.cell===5&&item.success&&item.action.kind==="build").work_after--;}
 else {const signal=frames.flatMap(frame=>frame.signals).find(event=>event.outcome==="consumed"&&event.signal.link===43&&event.signal.receipt_spark!=null).signal;if(id==="forged-return-spark")signal.receipt_spark=999;else if(id==="forged-return-bit")signal.bit=!signal.bit;else {equal(id,"forged-return-origin");signal.from.id=7;}}
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
  equal(take(["habitat", "answer", `${row.id}/receipt.json`]), journeyFor(receipt)); equal(row.after_call, offset);
  const destination = path.join(temporary, `${owner.owner}-${row.id}-final`);
  const imported = cli(["habitat", "import", spoolBundle(row.bundle_file), destination]);
  equal(cli(["habitat", "verify", destination]), imported); reportCheck(imported, receipt, receipt.experiment.ticks, 8);
  equal(imported.mission_passed, receipt.result.outcome.passed);
  return offset;
}

try {
 equal(plan.cases.map(row=>row.id),[...training,...transfer]);
 for(const item of plan.cases){equal(item.file,`${prefix}cases/${item.id}.json`);artifact(item.file);equal(sha(bytes(item.file)),item.sha256);equal(freeze.source.source_files_sha256[item.file],item.sha256);const world=read(item.file);equal(cli(["habitat","case",item.id],0,0),world);equal([world.version,world.ticks,world.cells.length,world.construction.blueprints.length],[3,128,5,2]);equal(world.construction.blueprints.map(item=>[item.id,item.body.cell.id]),[[50,3],[51,6]]);equal(world.links.length+sum(world.construction.blueprints.map(item=>item.body.links.length)),4);equal(sum(world.construction.stocks.map(item=>item.units.length)),2);cases.set(item.id,world);}
 equal(new Set([...cases.values()].map(identity)).size,8);
 for(const source of plan.ancestry_sources){equal(sha(bytes(source.file)),source.sha256);equal(freeze.source.source_files_sha256[source.file],source.sha256);}
 const oldCourier=read(plan.ancestry_sources[0].file),oldKeeper=read(plan.ancestry_sources[1].file).cells.find(cell=>cell.id===3).program;
 for(const world of cases.values()){equal(world.cells.find(cell=>cell.id===1).program,oldCourier);equal(world.construction.blueprints[0].body.cell.program,oldKeeper);}
 const qualification=read(plan.qualification_file);artifact(plan.qualification_file);equal(sha(bytes(plan.qualification_file)),freeze.qualification_sha256);equal(qualification.schema,"platonik-answer-fixture-qualification-v1");equal([qualification.pending,qualification.exit_code,qualification.error],[false,0,null]);equal(qualification.attempts.length,12);
 for(const [file,meta]of Object.entries(qualification.artifacts))equal(artifact(file),meta);
 const metrics=bytes(`${prefix}qualification/metrics.ndjson`).toString().trim().split("\n").map(line=>{assert(line.startsWith("answer-qualification "));return JSON.parse(line.slice(21));});equal(metrics,qualification.attempts);
 for(const [index,row]of qualification.attempts.entries()){
  equal(row.attempt,index+1);equal(row.engine_executions,2);equal(row.engine_executions_so_far,2*(index+1));equal([row.error,row.verification_error,row.grading_error],[null,null,null]);assert(row.verified);
  const stem=`${prefix}qualification/${String(index+1).padStart(2,"0")}-${row.id}`;equal(read(`${stem}.attempt.json`),row);const receipt=checked(`${stem}.receipt.json`);equal(read(`${stem}.experiment.json`),receipt.experiment);equal(row.input_hash,receipt.experiment_hash);equal(row.result_hash,receipt.result_hash);equal(row.journey,journeyFor(receipt));equal(row.service_passed,receipt.result.outcome.passed);equal(row.expected_service,row.service_passed);equal(row.expected_answer,row.journey.answered);equal(row.work,sum(Object.values(receipt.result.costs)));equal(row.status,receipt.result.status);assert(row.passed);
  equal(row.births,receipt.result.final_state.construction?.births.map(birth=>({cell:birth.body.cell.id,material:birth.material,tick:birth.tick}))??[]);equal(row.answer_tick,row.journey.milestones.find(item=>item.kind==="matching_reply")?.tick??null);
  equal(receipt.result.status,"complete");equal(receipt.result.ticks_completed,128);assert(receipt.result.frames.every(frame=>frame.complete));
  if(index<8){equal(row.id,[...training,...transfer][index]);equal(receipt.experiment,cases.get(row.id));assert(row.expected_answer&&row.expected_service);}
  else {equal(row.id,["control-no-reply-material","control-return-disabled","control-blind-reply","control-idle-courier"][index-8]);const expected=structuredClone(cases.get(training[0]));if(index===8)expected.construction.stocks[0].units.pop();else if(index===9)expected.construction.blueprints[1].body.links.find(link=>link.id===43).enabled=false;else if(index===10)expected.construction.blueprints[1].body.cell.program={rules:[{when:[],action:{kind:"send",port:0,bit:{kind:"constant",value:expected.sources[0].sparks.at(-1).bit}},remember:null}]};else expected.cells.find(cell=>cell.id===1).program=idle();equal(receipt.experiment,expected);equal(row.expected_answer,false);equal(row.expected_service,index!==11);}
 }
 equal(qualification.engine_executions,sum(qualification.attempts.map(row=>row.engine_executions)));equal(qualification.engine_executions,24);
 const reference=programs(cases.get(training[0]));
 for(const name of ["keep","frugal"]){
  const arm=study.arms[name];equal(arm.candidates.length,3);let offset=0;
  for(const [index,candidate]of arm.candidates.entries()){
   equal(candidate.sequence,index+1);equal(candidate.first_call,offset);assert(["completed","rejected","partial"].includes(candidate.admission));
   if(candidate.source_file){equal(candidate.source_file,`${prefix}submissions/${name}-${index+1}.json`);equal(sha(expanded(candidate.source_file)),candidate.source_sha256);equal(bytes(candidate.source_file).length,candidate.source_bytes);assert(candidate.source_bytes<=65536);}
   if(candidate.admission==="completed"||candidate.trials.length){
    const source=read(candidate.source_file);equal(Object.keys(source).sort(),["builder","courier","id","reply"]);equal(source.id,candidate.id);assert(/^[a-z][a-z0-9-]{0,31}$/.test(candidate.id));equal(candidate.programs,normalizedPrograms({courier:source.courier,builder:source.builder,reply:source.reply}));if(name==="keep")equal(candidate.programs.courier,reference.courier);
   }
   if(candidate.admission==="completed")equal(candidate.trials.map(row=>row.case_id),training);
   else{assert(!candidate.answered);equal(candidate.trials.map(row=>row.case_id),training.slice(0,candidate.trials.length));assert(candidate.trials.length<4);if(!candidate.source_file){equal(candidate.trials,[]);assert(candidate.metadata_redacted);equal(candidate.id,null);assert(candidate.programs===undefined);if(candidate.source){assert(candidate.source_retained_locally&&digest(candidate.source_sha256)&&integer(candidate.source_bytes)&&candidate.source_bytes<=65536);}else assert(candidate.input_unavailable);if(candidate.local_diagnostic_sha256)assert(digest(candidate.local_diagnostic_sha256));}}
   for(const row of candidate.trials)offset=coldCalls(arm,row,rowCheck(row,candidate.programs),offset);
   if(candidate.admission!=="completed"&&offset<candidate.after_call){equal(candidate.after_call,offset+1);const rejected=arm.calls[offset++];equal(rejected.exit_code,2);equal(rejected.args,["run",`c${index+1}-${training[candidate.trials.length]}/experiment.json`]);equal(rejected.metrics.engine_executions,0);}
   equal(candidate.after_call,offset);
   if(candidate.trials.length)equal(identity(candidate.programs),identity(programs(checked(candidate.trials[0].receipt_file).experiment)));
   if(candidate.admission==="completed"){equal(candidate.work,sum(candidate.trials.map(row=>row.work)));equal(candidate.program_bytes,Buffer.byteLength(JSON.stringify(programs(checked(candidate.trials[0].receipt_file).experiment))));equal(candidate.answered,candidate.trials.every(row=>row.answered));}
  }
  const winner=arm.candidates.filter(item=>item.admission==="completed"&&item.answered).sort((a,b)=>a.work-b.work||a.program_bytes-b.program_bytes||a.sequence-b.sequence)[0]??null;
  if(winner){equal(arm.selected,{id:winner.id,sequence:winner.sequence,programs:winner.programs,program_hash:identity(winner.programs),training_work:winner.work,after_call:offset});equal(arm.transfer.map(row=>row.case_id),transfer);for(const row of arm.transfer)offset=coldCalls(arm,row,rowCheck(row,winner.programs),offset);equal(arm.finished.answered,arm.transfer.every(row=>row.answered));assert(arm.finished.all_inputs_retained);}
  else{equal(arm.selected,null);equal(arm.transfer,[]);equal(arm.finished.answered,false);}
  equal(offset,arm.calls.length);equal(arm.finished.logical_cold_runs,arm.calls.filter(call=>call.args[0]==="run").length);
 }
 let offset=0;equal(ledger.references.map(row=>row.case_id),[...training,...transfer]);for(const row of ledger.references){equal(row.kind,"reference");offset=coldCalls(ledger,row,rowCheck(row,reference),offset);}
 equal(ledger.comparisons.map(row=>[row.kind,row.case_id]),plan.comparison_kinds.flatMap(kind=>[...training,...transfer].map(id=>[kind,id])));for(const row of ledger.comparisons)offset=coldCalls(ledger,row,rowCheck(row,reference),offset);
 equal(ledger.controls.map(row=>[row.kind,row.case_id]),plan.control_kinds.flatMap(kind=>training.slice(0,2).map(id=>[kind,id])));for(const row of ledger.controls)offset=coldCalls(ledger,row,rowCheck(row,reference),offset);
 const selected=Object.values(study.arms).every(arm=>arm.selected);
 const replayDefinitions=[{id:"first-answer",owner:"reference",case_id:training[0],kind:"reference"},{id:"familiar-courier",owner:"keep",case_id:training[3],kind:"selected"},{id:"frugal-crew",owner:"frugal",case_id:training[2],kind:"selected"},{id:"old-answer",owner:"reference",case_id:training[0],kind:"stale-reply"}];
 equal(plan.replays,replayDefinitions.map(row=>({...row,cuts:[1,2,8,17,18,38,qualification.attempts.find(item=>item.id===row.case_id).answer_tick,128],restore_ticks:[8,38]})));
 const replayReceipts=[];
 if(selected){
  equal(ledger.replays.length,4);
  for(const[index,row]of ledger.replays.entries()){const spec=plan.replays[index];for(const field of ["id","owner","case_id","kind"])equal(row[field],spec[field]);const input=spec.owner==="reference"?reference:study.arms[spec.owner].selected.programs;const receipt=rowCheck(row,input);replayReceipts.push(receipt);equal(row.bundle_file,`public/answer/${row.id}.bundle.json`);offset=replayCheck(row,spec,receipt,offset);}
  equal(ledger.probes.map(row=>row.id),["duplicate-material","changed-copy-byte","stolen-reservation","premature-wire","earlier-birth","refunded-copying","forged-return-spark","forged-return-bit","forged-return-origin","forged-checkpoint-material","foreign-future-fuel","foreign-blueprint"]);
  const sourceReceipt=replayReceipts[0],sourceBundle=JSON.parse(expanded(ledger.replays[0].restorations[0].bundle_file));
  for(const [index,probe]of ledger.probes.entries()){
   equal(probe.type,index<9?"receipt":"bundle");equal(probe.first_call,offset);equal(probe.after_call,offset+1);equal(probe.status,"pass");assert(probe.rejected);equal(sha(expanded(probe.input_file)),probe.input_sha256);equal(JSON.parse(expanded(probe.input_file)),probeMutation(sourceReceipt,sourceBundle,probe.id));
   const call=ledger.calls[offset++],args=probe.type==="receipt"?["habitat","answer",`probe-${probe.id}.json`]:["habitat","import",`probe-${probe.id}.json`,`rejected-${probe.id}`];equal(call.args,args);equal(call.exit_code,2);equal(probe.engine_executions,call.metrics.engine_executions);
   const input=path.join(temporary,`probe-${probe.id}.json`);fs.writeFileSync(input,expanded(probe.input_file),{flag:"wx"});const destination=path.join(temporary,`rejected-${probe.id}`);cli(probe.type==="receipt"?["habitat","answer",input]:["habitat","import",input,destination],2,probe.type==="receipt"?2:64);assert(!fs.existsSync(destination));
  }
  equal(ledger.finished,{references_answered:ledger.references.every(row=>row.answered),all_saved_traces_equal:ledger.replays.every(row=>row.restored_equal&&row.uninterrupted_equal),probes_passed:ledger.probes.every(row=>row.status==="pass"),control_findings:Object.fromEntries(plan.control_kinds.map(kind=>[kind,ledger.controls.filter(row=>row.kind===kind).every(row=>row.status==="complete"&&!row.answered)])),logical_cold_runs:ledger.calls.filter(call=>call.args[0]==="run").length});
 }else{equal(ledger.replays,[]);equal(ledger.probes,[]);assert(!ledger.finished.answered);}
 equal(offset,ledger.calls.length);
 const calibration=study.calibration,calibrationFile=`${prefix}calibration.json`;
 equal(sha(bytes(calibrationFile)),freeze.calibration_sha256);artifact(calibrationFile);
 const projectedKeys=["stdout_file","stderr_file","receipt_file","bundle_file","final_bundle_file","restoration_bundle_file","final_bundle_sha256","restoration_bundle_sha256"];
 equal(JSON.parse(JSON.stringify(calibration,(key,value)=>projectedKeys.includes(key)?undefined:value)),read(calibrationFile));
 const calibrationRow={...calibration.replay,case_id:training[0]},calibrationReceipt=rowCheck(calibrationRow,reference);
 let calibrationOffset=replayCheck(calibrationRow,plan.replays[0],calibrationReceipt,0,calibration);
 const tutorialCall=args=>{const call=calibration.calls[calibrationOffset++];equal(call.args,args);equal(call.exit_code,0);return JSON.parse(output(call));};
 const initial=tutorialCall(["habitat","init","tutorial-save","tutorial.experiment.json"]);reportCheck(initial,calibrationReceipt,0,0);equal(initial.request_id,"init");
 const opening=tutorialCall(["habitat","journey","tutorial-save"]);equal(opening,calibration.tutorial.opening);equal(opening.schema,"platonik-first-answer-report-v1");equal(opening.habitat,{...initial,request_id:null});equal([opening.journey.tick,opening.journey.phase,opening.journey.answered],[0,"in_progress",false]);equal(opening.journey.evidence_hash,identity({kind:"paused",value:checkpoint(calibrationReceipt,0)}));
 const openingDestination=path.join(temporary,"tutorial-opening");equal(cli(["habitat","init",openingDestination,`${prefix}cases/${training[0]}.json`]),initial);equal(cli(["habitat","journey",openingDestination]),opening);
 const partial=tutorialCall(["habitat","advance","tutorial-save","--until","5","--expect-revision","0","--request-id","first-body"]);reportCheck(partial,calibrationReceipt,5,1);equal(partial.request_id,"first-body");
 const partialJourney=tutorialCall(["habitat","journey","tutorial-save"]);equal(partialJourney,calibration.tutorial.partial);equal(partialJourney.habitat,{...partial,request_id:null});equal([partialJourney.journey.tick,partialJourney.journey.phase,partialJourney.journey.answered],[5,"in_progress",false]);equal(partialJourney.journey.evidence_hash,identity({kind:"paused",value:checkpoint(calibrationReceipt,5)}));
 const partialBundle=tutorialCall(["habitat","export","tutorial-save"]);bundleCheck(partialBundle,calibrationReceipt,[5],["first-body"]);equal(JSON.parse(expanded(calibration.tutorial.restoration_bundle_file)),partialBundle);equal(sha(expanded(calibration.tutorial.restoration_bundle_file)),calibration.tutorial.restoration_bundle_sha256);
 const restored=tutorialCall(["habitat","import","tutorial.at-5.bundle.json","tutorial-restored"]);equal(restored,{...partial,request_id:null});
 const completed=tutorialCall(["habitat","advance","tutorial-restored","--until","128","--expect-revision","2","--request-id","bring-it-home"]);reportCheck(completed,calibrationReceipt,128,2);equal(completed.request_id,"bring-it-home");
 const finalJourney=tutorialCall(["habitat","journey","tutorial-restored"]);equal(finalJourney.habitat,{...completed,request_id:null});equal(finalJourney.journey,journeyFor(calibrationReceipt));equal(calibration.tutorial.journey,finalJourney.journey);
 equal(tutorialCall(["habitat","verify","tutorial-restored"]),finalJourney.habitat);
 const completedBundle=tutorialCall(["habitat","export","tutorial-restored"]);bundleCheck(completedBundle,calibrationReceipt,[5,128],["first-body","bring-it-home"]);equal(JSON.parse(expanded(calibration.tutorial.final_bundle_file)),completedBundle);equal(sha(expanded(calibration.tutorial.final_bundle_file)),calibration.tutorial.final_bundle_sha256);equal(calibrationOffset,calibration.calls.length);assert(calibration.tutorial.restored_equal&&calibration.tutorial.uninterrupted_equal);
 for(const [field,tick,advances,expectedJourney]of [["restoration_bundle_file",5,1,partialJourney.journey],["final_bundle_file",128,2,finalJourney.journey]]){
  const destination=path.join(temporary,`tutorial-${tick}`),report=cli(["habitat","import",spoolBundle(calibration.tutorial[field]),destination]);reportCheck(report,calibrationReceipt,tick,advances);const actual=cli(["habitat","journey",destination]);equal(actual.habitat,report);equal(actual.journey,expectedJourney);
 }
 const capacity=study.capacity,measurement=read(capacity.measurement_file);equal(capacity.measurement_file,`${prefix}capacity.json`);equal(sha(bytes(capacity.measurement_file)),capacity.measurement_sha256);equal(capacity.benchmark_binary_sha256,freeze.source.capacity_binary_sha256);equal(capacity.platform,"darwin");assert(typeof capacity.architecture==="string");assert(capacity.cpu===null||typeof capacity.cpu==="string");assert(capacity.malloc_nano_zone===null||typeof capacity.malloc_nano_zone==="string");
 equal(measurement.schema,"platonik-answer-capacity-v1");equal(measurement.buffer_strategy,"fixed reusable Vec with bounded Write");equal(measurement.buffer_capacity_bytes,8388608);assert(measurement.buffer_retained_during_rss);equal(measurement.engine_executions,124);equal(measurement.workloads.length,2);
 const benchmarkCall=capacity.calls[0];equal(benchmarkCall.args,plan.capacity.cases.map(id=>`${prefix}cases/${id}.json`));equal(JSON.parse(output(benchmarkCall)),measurement);equal(benchmarkCall.metrics.engine_executions,124);equal(benchmarkCall.exit_code,0);equal(benchmarkCall.reserved_engine_executions,124);equal(capacity.peak_rss_bytes,benchmarkCall.peak_rss_bytes);
 for(const [index,workload]of measurement.workloads.entries()){
  const caseId=plan.capacity.cases[index],row=ledger.references.find(row=>row.case_id===caseId),receipt=checked(row.receipt_file),journey=journeyFor(receipt);equal(workload.id,`${prefix}cases/${caseId}.json`);equal(workload.experiment,cases.get(caseId));equal(workload.experiment_hash,receipt.experiment_hash);equal(workload.samples.length,30);
  for(const sample of [workload.warmup,...workload.samples]){
   equal(sample.result_hash,receipt.result_hash);equal(sample.journey_hash,identity(journey));equal(sample.receipt_bytes,Buffer.byteLength(JSON.stringify(receipt)));equal(sample.serialized_receipt_sha256,identity(receipt));equal(sample.serialization_capacity_bytes,8388608);equal(sample.engine_executions,2);
   for(const field of ["receipt_ms","serialize_ms","verify_ms","total_ms","identity_check_ms","full_sample_ms"])assert(Number.isFinite(sample[field])&&sample[field]>=0);assert(sample.total_ms+0.000001>=sample.receipt_ms+sample.serialize_ms+sample.verify_ms);assert(sample.full_sample_ms+0.000001>=sample.total_ms+sample.identity_check_ms);
   equal(sample.rss_after_release.source,"ps RSS in KiB");equal(sample.rss_after_release.platform,"macos");if(sample.rss_after_release.bytes===null)assert(typeof sample.rss_after_release.error==="string");else {assert(integer(sample.rss_after_release.bytes)&&sample.rss_after_release.bytes>0);equal(sample.rss_after_release.error,null);}
  }
  const times=workload.samples.map(row=>row.total_ms).sort((a,b)=>a-b);equal(workload.p50_ms,times[14]);equal(workload.p95_ms,times[28]);
 }
 equal(capacity.histories.length,selected?2:0);equal(capacity.calls.length,1+capacity.histories.length);
 for(const[index,history]of capacity.histories.entries()){
  const row=ledger.replays[index],call=capacity.calls[index+1];equal(history.id,row.id);equal(history.result_hash,row.result_hash);equal(history.bundle_sha256,row.bundle_sha256);equal(history.bundle_bytes,expanded(row.bundle_file).length);equal(history.call,index+1);equal(history.elapsed_ms,call.elapsed_ms);equal(history.peak_rss_bytes,call.peak_rss_bytes);equal(call.args.slice(0,2),["habitat","journey"]);equal(call.args.length,3);local(call.args[2]);assert(call.args[2].endsWith(`/${row.id}/restored-38`));equal(call.exit_code,0);
  const report=JSON.parse(output(call));equal(report.journey,row.journey);equal(report.schema,"platonik-first-answer-report-v1");reportCheck(report.habitat,replayReceipts[index],128,8);equal(report.habitat.request_id,null);
 }
 const capacityPass=capacity.histories.length===2&&capacity.peak_rss_bytes<=268435456&&capacity.histories.every(row=>row.peak_rss_bytes<=268435456&&row.bundle_bytes<=16777216)&&measurement.workloads.every(row=>[row.warmup,...row.samples].every(sample=>sample.receipt_bytes<=8388608));equal(capacity.finished,{passed:capacityPass,thresholds:plan.capacity.acceptance});
 if(selected){
  const indexFile="public/answer/index.json",index=read(indexFile);artifact(indexFile);equal(index.schema,"platonik-continuous-site-v1");equal(index.cases.length,4);
  for(const [number,item]of index.cases.entries()){
   const row=ledger.replays[number],receipt=replayReceipts[number],stem=`public/answer/${row.id}`;equal(item.id,row.id);assert(typeof item.label==="string"&&item.label.length>0&&item.label.length<100);assert(typeof item.detail==="string"&&item.detail.length>0&&item.detail.length<1000);
   artifact(`${stem}.experiment.json`);artifact(`${stem}.receipt.json`);equal(read(`${stem}.experiment.json`),receipt.experiment);equal(read(`${stem}.receipt.json`),receipt);
   for(const field of ["passed","work","ticks","result_hash","journey","uninterrupted_equal","restored_equal"])equal(item[field],row[field]);equal(item.cuts.map(cut=>cut.tick),row.checkpoints.map(cut=>cut.tick));
   for(const [cutIndex,cut]of item.cuts.entries()){const original=row.checkpoints[cutIndex],frame=receipt.result.frames[cut.tick];equal(cut.state_hash,original.state_hash);equal(cut.costs_hash,original.costs_hash);equal(cut.state_hash,identity(frame.state));equal(cut.costs_hash,identity(frame.costs));assert(typeof cut.label==="string"&&cut.label.length>0&&cut.label.length<100);assert(typeof cut.detail==="string"&&cut.detail.length>0&&cut.detail.length<500);}
  }
 }else assert(!inventory.has("public/answer/index.json"));
 const logical=[ledger,...Object.values(study.arms)].reduce((sum,owner)=>sum+owner.calls.filter(call=>call.args[0]==="run").length,0);assert(logical<=68);
 equal(study.finished,{logical_cold_runs:logical,study_engine_executions:ledger.engine_executions+study.arms.keep.engine_executions+study.arms.frugal.engine_executions,qualification_engine_executions:qualification.engine_executions+study.calibration.engine_executions,capacity_engine_executions:study.capacity.engine_executions,answered:!!ledger.finished.references_answered&&study.arms.keep.finished.answered&&study.arms.frugal.finished.answered,capacity_passed:study.capacity.finished.passed,reasoning_tokens:null});
 assert(study.finished.study_engine_executions<=2048&&study.finished.qualification_engine_executions<=384&&executions<=1024);
 console.log(`Admitted First Answer evidence: ${logical} cold attempts, ${cache.size} distinct receipts, ${executions} fresh engine executions; answered=${study.finished.answered}, capacity=${study.finished.capacity_passed}.`);
} finally {admissionMetrics();fs.rmSync(temporary,{recursive:true,force:true});}
