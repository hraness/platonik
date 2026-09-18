//! Two supplied, independent, one-shot port commitments in ordinary habitat-v3.
//! A docked courier waits for a request, fetches one finite parcel, and retries
//! Drop until empty cargo proves receiving-depot custody. A separate physical
//! depot report supplies the retained ACK evidence. DONE prevents a duplicate
//! request from withdrawing the same-bit spare. These are two local two-hop
//! neighborhoods, not arbitrary packet IDs, a geographic shipping network, or
//! a general exactly-once protocol across reset/repeated transactions.
use crate::{construction_fixtures, fixtures, model::*};

pub const HORIZON: u32 = 128;
pub const FUEL: u64 = 100_000;
pub const DECLARED_BIT_SLOT: u8 = 2;
pub const REQUESTER_DONE_SLOT: u8 = 1;
pub const COURIER_PHASE_SLOT: u8 = 0;
pub const COURIER_RECEIPT_SLOT: u8 = 2;
pub const PHASE_IDLE: u8 = 0;
pub const PHASE_ACCEPTED: u8 = 1;
pub const PHASE_OUTBOUND: u8 = 2;
pub const PHASE_RETURNING: u8 = 3;
pub const PHASE_CUSTODY: u8 = 4;
pub const PHASE_DONE: u8 = 5;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LaneSpec {
    pub id: u8,
    pub requester: u16,
    pub courier: u16,
    /// Exact inherited physical depot-report relay.
    pub relay: u16,
    /// Two-channel request/ACK adapter; it is a distinct supplied program.
    pub network_relay: u16,
    pub keeper: u16,
    pub source: u16,
    pub depot: u16,
    pub valve: u16,
    pub beacon_zero: u16,
    pub beacon_one: u16,
    pub parcel: u32,
    pub spare: u32,
    pub request_links: [u16; 2],
    pub ack_links: [u16; 2],
    /// Depot -> report relay, relay -> Keeper, relay -> courier port 1.
    pub report_links: [u16; 3],
    pub duplicate_request: u16,
    pub duplicate_ack: u16,
}

pub const LANES: [LaneSpec; 2] = [
    LaneSpec {
        id: 0,
        requester: 10,
        courier: 1,
        relay: 2,
        network_relay: 12,
        keeper: 3,
        source: 10,
        depot: 11,
        valve: 30,
        beacon_zero: 20,
        beacon_one: 21,
        parcel: 100,
        spare: 101,
        request_links: [40, 41],
        ack_links: [42, 43],
        report_links: [44, 45, 46],
        duplicate_request: 47,
        duplicate_ack: 48,
    },
    LaneSpec {
        id: 1,
        requester: 11,
        courier: 4,
        relay: 5,
        network_relay: 13,
        keeper: 6,
        source: 12,
        depot: 13,
        valve: 31,
        beacon_zero: 22,
        beacon_one: 23,
        parcel: 200,
        spare: 201,
        request_links: [50, 51],
        ack_links: [52, 53],
        report_links: [54, 55, 56],
        duplicate_request: 57,
        duplicate_ack: 58,
    },
];

const TRAINING: &[&str] = &[
    "ports-clear-zero-one",
    "ports-clear-one-zero",
    "ports-request-loss",
    "ports-ack-loss",
];
const TRANSFER: &[&str] = &[
    "ports-slow-zero-one",
    "ports-slow-one-zero",
    "ports-duplicate-requests",
    "ports-duplicate-acks",
];
const ALL: &[&str] = &[
    "ports-clear-zero-one",
    "ports-clear-one-zero",
    "ports-request-loss",
    "ports-ack-loss",
    "ports-slow-zero-one",
    "ports-slow-one-zero",
    "ports-duplicate-requests",
    "ports-duplicate-acks",
];

pub fn case_ids() -> &'static [&'static str] {
    ALL
}
pub fn training_ids() -> &'static [&'static str] {
    TRAINING
}
pub fn transfer_ids() -> &'static [&'static str] {
    TRANSFER
}
pub fn capacity_ids() -> &'static [&'static str] {
    &["ports-clear-zero-one", "ports-ack-loss"]
}

fn rule(when: Vec<Condition>, action: Action) -> Rule {
    Rule {
        when,
        action,
        remember: None,
    }
}
fn phase(value: u8) -> Condition {
    Condition::Memory {
        slot: COURIER_PHASE_SLOT,
        value,
    }
}
fn transition(when: Vec<Condition>, action: Action, value: u8) -> Rule {
    Rule {
        when,
        action,
        remember: Some(MemoryWrite {
            slot: COURIER_PHASE_SLOT,
            value,
        }),
    }
}

/// Retransmit the supplied request bit until the matching ACK is consumed.
/// No message ID or provenance identifier is visible to this program.
pub fn requester_program() -> Program {
    let mut rules = vec![rule(
        vec![Condition::Memory {
            slot: REQUESTER_DONE_SLOT,
            value: 1,
        }],
        Action::Wait,
    )];
    for value in [false, true] {
        rules.push(Rule {
            when: vec![
                Condition::Memory {
                    slot: DECLARED_BIT_SLOT,
                    value: u8::from(value),
                },
                Condition::MessageBit { port: 0, value },
            ],
            action: Action::TakeMessage { port: 0, slot: 0 },
            remember: Some(MemoryWrite {
                slot: REQUESTER_DONE_SLOT,
                value: 1,
            }),
        });
    }
    rules.push(rule(
        vec![],
        Action::Send {
            port: 0,
            bit: BitSource::Memory {
                slot: DECLARED_BIT_SLOT,
            },
        },
    ));
    Program { rules }
}

/// A request-driven descendant, not the earlier unchanged navigation courier.
/// Its supplied initial docking heading points away from the source. Every
/// accepted request turns back, making a lost DONE flag expose the spare.
/// Crucially Drop has no remember write: only a later empty-cargo observation
/// at the depot in the returning phase permits the custody state.
pub fn courier_program() -> Program {
    Program {
        rules: vec![
            rule(
                vec![phase(PHASE_DONE)],
                Action::Send {
                    port: 0,
                    bit: BitSource::Memory {
                        slot: COURIER_RECEIPT_SLOT,
                    },
                },
            ),
            transition(
                vec![
                    phase(PHASE_CUSTODY),
                    Condition::HasMessage {
                        port: 1,
                        value: true,
                    },
                ],
                Action::TakeMessage {
                    port: 1,
                    slot: COURIER_RECEIPT_SLOT,
                },
                PHASE_DONE,
            ),
            rule(vec![phase(PHASE_CUSTODY)], Action::Wait),
            rule(
                vec![
                    phase(PHASE_RETURNING),
                    Condition::AtDepot { value: true },
                    Condition::Carrying { value: true },
                ],
                Action::Drop,
            ),
            rule(
                vec![
                    phase(PHASE_RETURNING),
                    Condition::AtDepot { value: true },
                    Condition::Carrying { value: false },
                ],
                Action::WriteMemory {
                    slot: COURIER_PHASE_SLOT,
                    value: PHASE_CUSTODY,
                },
            ),
            rule(
                vec![phase(PHASE_RETURNING)],
                Action::Move {
                    direction: Relative::Forward,
                },
            ),
            transition(
                vec![phase(PHASE_OUTBOUND), Condition::Carrying { value: true }],
                Action::Turn {
                    direction: Relative::Back,
                },
                PHASE_RETURNING,
            ),
            rule(
                vec![phase(PHASE_OUTBOUND), Condition::AtSource { value: true }],
                Action::Pickup,
            ),
            rule(
                vec![phase(PHASE_OUTBOUND)],
                Action::Move {
                    direction: Relative::Forward,
                },
            ),
            transition(
                vec![phase(PHASE_ACCEPTED)],
                Action::Turn {
                    direction: Relative::Back,
                },
                PHASE_OUTBOUND,
            ),
            transition(
                vec![
                    phase(PHASE_IDLE),
                    Condition::HasMessage {
                        port: 0,
                        value: true,
                    },
                ],
                Action::TakeMessage { port: 0, slot: 1 },
                PHASE_ACCEPTED,
            ),
            rule(vec![], Action::Wait),
        ],
    }
}

/// ACKs take priority over retries. A fulfilled courier remains docked and
/// retransmits, so transient inboxes are not treated as durable storage.
pub fn network_relay_program() -> Program {
    Program {
        rules: vec![
            rule(
                vec![Condition::HasMessage {
                    port: 1,
                    value: true,
                }],
                Action::Send {
                    port: 1,
                    bit: BitSource::Message { port: 1 },
                },
            ),
            rule(
                vec![Condition::HasMessage {
                    port: 0,
                    value: true,
                }],
                Action::Send {
                    port: 0,
                    bit: BitSource::Message { port: 0 },
                },
            ),
            rule(vec![], Action::Wait),
        ],
    }
}

/// The exact earlier two-rule Keeper, with only its declared valve ID remapped.
pub fn keeper_program(valve: u16) -> Program {
    let mut program = construction_fixtures::child_program();
    for rule in &mut program.rules {
        if let Action::Route { valve: target, .. } = &mut rule.action {
            *target = valve;
        }
    }
    program
}

pub fn experiment(id: &str) -> Result<Experiment, String> {
    let (bits, delay, seed, loss, duplicates) = match id {
        "ports-clear-zero-one" => ([false, true], 1, 0, 0, 0),
        "ports-clear-one-zero" => ([true, false], 1, 0, 0, 0),
        "ports-request-loss" => ([false, true], 1, 0, 1, 0),
        "ports-ack-loss" => ([true, false], 1, 0, 2, 0),
        "ports-slow-zero-one" => ([false, true], 3, 29, 0, 0),
        "ports-slow-one-zero" => ([true, false], 3, 29, 0, 0),
        "ports-duplicate-requests" => ([false, true], 2, 29, 0, 1),
        "ports-duplicate-acks" => ([true, false], 2, 29, 0, 2),
        _ => return Err(format!("unknown port fixture: {id}")),
    };
    let mut world = Experiment {
        version: CONSTRUCTION_VERSION,
        seed,
        width: 13,
        height: 7,
        walls: vec![],
        sources: vec![],
        depots: vec![],
        beacons: vec![],
        valves: vec![],
        cells: vec![],
        links: vec![],
        events: vec![],
        ticks: HORIZON,
        fuel: FUEL,
        activation_fuel: 128,
        construction: None,
        facilities: Vec::new(),
    };
    let mut floor = vec![];
    for lane in LANES {
        let bit = bits[lane.id as usize];
        // Reflect the complete local neighborhood. Heading is the supplied
        // outward dock pose; the program itself contains no absolute compass.
        let point = |x, y| Point {
            x: if lane.id == 0 { x } else { 12 - x },
            y,
        };
        let cell = |id, position, mobile, program, memory| Cell {
            id,
            position,
            mobile,
            program,
            memory,
            heading: if lane.id == 0 {
                Direction::East
            } else {
                Direction::West
            },
        };
        world.cells.extend([
            cell(lane.courier, point(3, 3), true, courier_program(), [0; 4]),
            cell(
                lane.requester,
                point(4, 4),
                false,
                requester_program(),
                [0, 0, u8::from(bit), 0],
            ),
            cell(
                lane.network_relay,
                point(3, 4),
                false,
                network_relay_program(),
                [0; 4],
            ),
            cell(
                lane.relay,
                point(3, 2),
                false,
                fixtures::relay_program(),
                [0; 4],
            ),
            cell(
                lane.keeper,
                point(4, 2),
                false,
                keeper_program(lane.valve),
                [0; 4],
            ),
        ]);
        world.sources.push(Source {
            id: lane.source,
            position: point(1, 3),
            sparks: vec![
                Spark {
                    id: lane.parcel,
                    bit,
                },
                Spark {
                    id: lane.spare,
                    bit,
                },
            ],
        });
        world.depots.push(Depot {
            id: lane.depot,
            position: point(3, 3),
            capacity: 1,
        });
        for (id, position, accepts) in [
            (lane.beacon_zero, point(5, 3), false),
            (lane.beacon_one, point(4, 4), true),
        ] {
            world.beacons.push(Beacon {
                id,
                position,
                accepts,
                initial_charge: 33,
                drain_every: 4,
                drain_amount: 1,
                spark_charge: 6,
                required_deliveries: u32::from(accepts == bit),
            });
        }
        world.valves.push(Valve {
            id: lane.valve,
            position: point(4, 3),
            depot: lane.depot,
            beacon_zero: lane.beacon_zero,
            beacon_one: lane.beacon_one,
            enabled: true,
        });
        let cell_endpoint = |id, port| Endpoint::Cell { id, port };
        let link = |id, from, to_cell, to_port, delay, enabled| Link {
            id,
            from,
            to_cell,
            to_port,
            delay,
            enabled,
        };
        world.links.extend([
            link(
                lane.request_links[0],
                cell_endpoint(lane.requester, 0),
                lane.network_relay,
                0,
                delay,
                true,
            ),
            link(
                lane.request_links[1],
                cell_endpoint(lane.network_relay, 0),
                lane.courier,
                0,
                delay,
                true,
            ),
            link(
                lane.ack_links[0],
                cell_endpoint(lane.courier, 0),
                lane.network_relay,
                1,
                delay,
                true,
            ),
            link(
                lane.ack_links[1],
                cell_endpoint(lane.network_relay, 1),
                lane.requester,
                0,
                delay,
                true,
            ),
            link(
                lane.report_links[0],
                Endpoint::Depot { id: lane.depot },
                lane.relay,
                0,
                1,
                true,
            ),
            link(
                lane.report_links[1],
                cell_endpoint(lane.relay, 0),
                lane.keeper,
                0,
                1,
                true,
            ),
            link(
                lane.report_links[2],
                cell_endpoint(lane.relay, 0),
                lane.courier,
                1,
                1,
                true,
            ),
            link(
                lane.duplicate_request,
                cell_endpoint(lane.network_relay, 0),
                lane.courier,
                0,
                16,
                duplicates == 1,
            ),
            link(
                lane.duplicate_ack,
                cell_endpoint(lane.network_relay, 1),
                lane.requester,
                0,
                16,
                duplicates == 2,
            ),
        ]);
        if loss != 0 {
            let id = if loss == 1 {
                lane.request_links[1]
            } else {
                lane.ack_links[1]
            };
            world.events.extend([
                Event {
                    tick: 1,
                    event: EventKind::LinkEnabled { id, enabled: false },
                },
                Event {
                    tick: if loss == 1 { 18 } else { 48 },
                    event: EventKind::LinkEnabled { id, enabled: true },
                },
            ]);
        }
        floor.extend((1..=3).map(|x| point(x, 3)));
    }
    world.cells.sort_by_key(|entry| entry.id);
    world.links.sort_by_key(|entry| entry.id);
    world.events.sort_by_key(|entry| entry.tick);
    floor.extend(world.cells.iter().map(|entry| entry.position));
    floor.extend(world.sources.iter().map(|entry| entry.position));
    floor.extend(world.depots.iter().map(|entry| entry.position));
    floor.extend(world.beacons.iter().map(|entry| entry.position));
    floor.extend(world.valves.iter().map(|entry| entry.position));
    world.walls = (0..world.height)
        .flat_map(|y| (0..world.width).map(move |x| Point { x, y }))
        .filter(|position| !floor.contains(position))
        .collect();
    Ok(world)
}
