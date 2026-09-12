// Provisional observer cuts: qualify actual milestones before source freeze.
import {training,transfer} from './manifest.mjs';
export const replays=[
 {id:'ports-reference',owner:'reference',case_id:training[0],kind:'reference'},
 {id:'familiar-couriers',owner:'keep',case_id:transfer[2],kind:'selected'},
 {id:'frugal-ports',owner:'frugal',case_id:training[3],kind:'selected'},
 {id:'lost-ack',owner:'reference',case_id:training[0],kind:'no-ack'},
].map(row=>({...row,cuts:[1,8,16,32,64,128],restore_ticks:[8,32]}));
export const tutorial={case_id:training[3],pause_tick:24,first_request_id:'first-handoff',final_request_id:'keep-the-promise'};
