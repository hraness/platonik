// Public finite scenario inventory. Read-only transforms; no engine execution.
import assert from 'node:assert/strict';
export const training=['ports-clear-zero-one','ports-clear-one-zero','ports-request-loss','ports-ack-loss'];
export const transfer=['ports-slow-zero-one','ports-slow-one-zero','ports-duplicate-requests','ports-duplicate-acks'];
export const roles={requesters:[10,11],couriers:[1,4],report_relays:[2,5],network_relays:[12,13],keepers:[3,6]};
export const lanes=[
 {id:0,requester:10,courier:1,report_relay:2,network_relay:12,keeper:3,source:10,depot:11,valve:30,beacons:[20,21],parcel:100,spare:101,request_links:[40,41],ack_links:[42,43],report_links:[44,45,46],duplicate_request:47,duplicate_ack:48},
 {id:1,requester:11,courier:4,report_relay:5,network_relay:13,keeper:6,source:12,depot:13,valve:31,beacons:[22,23],parcel:200,spare:201,request_links:[50,51],ack_links:[52,53],report_links:[54,55,56],duplicate_request:57,duplicate_ack:58},
];
export const controls=[
 {kind:'idle-courier',cases:[training[0],training[1]]},
 {kind:'idle-report-relay',cases:[training[0],training[1]]},
 {kind:'premature-ack',cases:[training[0],training[1]]},
 {kind:'forget-done',cases:[training[3],transfer[2]]},
 {kind:'missing-parcel',cases:[training[0],training[1]]},
 {kind:'no-ack',cases:[training[0],training[1]]},
];
export const idle=()=>({rules:[{when:[],action:{kind:'wait'},remember:null}]});
export function control(original,kind){
 const world=structuredClone(original),cell=id=>world.cells.find(row=>row.id===id);
 if(kind==='request-once'){
  // One issued request per endpoint. A missing reply may still be received;
  // the final fallback cannot transmit a replacement after loss.
  for(const id of roles.requesters){const program=cell(id).program;
   assert(program.rules.some(rule=>rule.action.kind==='send'));
   program.rules=[{when:[{kind:'memory',slot:3,value:0}],action:{kind:'send',port:0,bit:{kind:'memory',slot:2}},remember:{slot:3,value:1}},
    ...program.rules.filter(rule=>rule.action.kind!=='send'),...idle().rules];
  }
 }else if(kind==='idle-courier')for(const id of roles.couriers)cell(id).program=idle();
 else if(kind==='idle-report-relay')for(const id of roles.report_relays)cell(id).program=idle();
 else if(kind==='premature-ack')for(const lane of lanes){
  const courier=cell(lane.courier);assert.equal(courier.memory[3],0);
  courier.program.rules.unshift({when:[{kind:'memory',slot:3,value:0}],action:{kind:'send',port:0,bit:{kind:'constant',value:cell(lane.requester).memory[2]!==0}},remember:{slot:3,value:1}});
 }else if(kind==='forget-done'){
  for(const id of roles.couriers)world.events.push({tick:24,event:{kind:'clear_memory',cell:id}});
  world.events.sort((a,b)=>a.tick-b.tick);
 }else if(kind==='missing-parcel')for(const lane of lanes){
  const source=world.sources.find(row=>row.id===lane.source);assert.equal(source.sparks[0].id,lane.parcel);source.sparks.shift();
 }else if(kind==='no-ack'){
  const links=lanes.flatMap(lane=>[...lane.ack_links,lane.duplicate_ack]);
  for(const link of world.links)if(links.includes(link.id))link.enabled=false;
  world.events=world.events.filter(row=>row.event.kind!=='link_enabled'||!links.includes(row.event.id));
 }else throw new Error('Unknown declared port comparison/control');
 return world;
}
