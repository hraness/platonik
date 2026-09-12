//! One supplied add4 transaction composed from ordinary habitat-v3 rules.
//! Physical depot reports carry A, local initial memory supplies B and the
//! plan's output tap, and the selected computed bit controls a real valve.
//! The fifth input bit is a zero flush. There is no reset/repeated-query claim.
use crate::{construction_fixtures, fixtures, model::*};

pub const COURIER: u16 = 1;
pub const RELAY: u16 = 2;
pub const KEEPER: u16 = 3;
pub const BLOCKER: u16 = 4;
pub const A_FORWARDER: u16 = 8;
pub const B_SHIFTER: u16 = 9;
pub const ADDER: u16 = 10;
pub const SELECTOR: u16 = 11;
pub const PAYLOAD_COURIER: u16 = 12;
pub const OPERAND_SINK: u16 = 13;
pub const CLOCK_SOURCE: u16 = 10;
pub const PAYLOAD_SOURCE: u16 = 14;
pub const CLOCK_DEPOT: u16 = 11;
pub const PAYLOAD_DEPOT: u16 = 12;
pub const PAYLOAD_VALVE: u16 = 30;
pub const CLOCK_VALVE: u16 = 31;
pub const PAYLOAD_ZERO: u16 = 20;
pub const PAYLOAD_ONE: u16 = 21;
pub const CLOCK_ZERO: u16 = 22;
pub const CLOCK_ONE: u16 = 23;
pub const DEPOT_REPORT: u16 = 40;
pub const A_CLOCK: u16 = 41;
pub const B_CLOCK: u16 = 42;
pub const SINK_REPORT: u16 = 43;
pub const A_INPUT: u16 = 44;
pub const B_INPUT: u16 = 45;
pub const SUM_OUTPUT: u16 = 46;
pub const SELECTED_OUTPUT: u16 = 47;
pub const CLOCK_SPARK_START: u32 = 100;
pub const PAYLOAD_SPARK: u32 = 200;
pub const B_SLOT: u8 = 0;
pub const CARRY_SLOT: u8 = 0;
pub const INDEX_SLOT: u8 = 0;
pub const SCRATCH_SLOT: u8 = 1;
pub const TAP_SLOT: u8 = 2;
pub const CONTACT_END: u32 = 48;
pub const SERVICE_START: u32 = 52;
pub const SERVICE_END: u32 = 53;
pub const HORIZON: u32 = 128;
pub const FUEL: u64 = 100_000;

const TRAINING: &[&str] = &[
    "ark-reserve-15",
    "ark-reserve-16",
    "ark-staggered-15",
    "ark-staggered-16",
];
const TRANSFER: &[&str] = &[
    "ark-reserve-30",
    "ark-reserve-7",
    "ark-staggered-30",
    "ark-staggered-7",
];
const ALL: &[&str] = &[
    "ark-reserve-15",
    "ark-reserve-16",
    "ark-staggered-15",
    "ark-staggered-16",
    "ark-reserve-30",
    "ark-reserve-7",
    "ark-staggered-30",
    "ark-staggered-7",
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

fn rule(when: Vec<Condition>, action: Action) -> Rule {
    Rule {
        when,
        action,
        remember: None,
    }
}
fn empty_inbox() -> Rule {
    rule(
        vec![Condition::HasMessage {
            port: 0,
            value: false,
        }],
        Action::Wait,
    )
}

/// A granted four-bit word shifts out one bit per actual incoming report.
/// This is an explicit sixteen-row policy, not a native shift instruction.
pub fn shifter_program() -> Program {
    let mut rules = vec![empty_inbox()];
    for value in 0..16 {
        rules.push(Rule {
            when: vec![Condition::Memory {
                slot: B_SLOT,
                value,
            }],
            action: Action::Send {
                port: 0,
                bit: BitSource::Constant {
                    value: value & 1 != 0,
                },
            },
            remember: Some(MemoryWrite {
                slot: B_SLOT,
                value: value >> 1,
            }),
        });
    }
    Program { rules }
}

/// Eight explicit full-adder rows. The computed sum has no single-spark
/// provenance: constants and carry writes correctly clear that annotation.
pub fn adder_program() -> Program {
    let mut rules = vec![empty_inbox()];
    rules.push(rule(
        vec![Condition::HasMessage {
            port: 1,
            value: false,
        }],
        Action::Wait,
    ));
    for a in [false, true] {
        for b in [false, true] {
            for carry in [false, true] {
                rules.push(Rule {
                    when: vec![
                        Condition::MessageBit { port: 0, value: a },
                        Condition::MessageBit { port: 1, value: b },
                        Condition::Memory {
                            slot: CARRY_SLOT,
                            value: u8::from(carry),
                        },
                    ],
                    action: Action::Send {
                        port: 0,
                        bit: BitSource::Constant {
                            value: a ^ b ^ carry,
                        },
                    },
                    remember: Some(MemoryWrite {
                        slot: CARRY_SLOT,
                        value: u8::from((a && b) || ((a || b) && carry)),
                    }),
                });
            }
        }
    }
    Program { rules }
}

/// Consume five successive computed bits. Forward just the declared tap;
/// retain the transaction index and stop after five. Tap 4 selects overflow,
/// tap 0 selects the odd/even service lane. Timing is not a policy sensor.
pub fn selector_program() -> Program {
    let mut rules = vec![empty_inbox()];
    rules.push(rule(
        vec![Condition::Memory {
            slot: INDEX_SLOT,
            value: 5,
        }],
        Action::Wait,
    ));
    for index in 0..5 {
        rules.push(Rule {
            when: vec![
                Condition::Memory {
                    slot: INDEX_SLOT,
                    value: index,
                },
                Condition::Memory {
                    slot: TAP_SLOT,
                    value: index,
                },
            ],
            action: Action::Send {
                port: 0,
                bit: BitSource::Message { port: 0 },
            },
            remember: Some(MemoryWrite {
                slot: INDEX_SLOT,
                value: index + 1,
            }),
        });
        rules.push(Rule {
            when: vec![Condition::Memory {
                slot: INDEX_SLOT,
                value: index,
            }],
            action: Action::TakeMessage {
                port: 0,
                slot: SCRATCH_SLOT,
            },
            remember: Some(MemoryWrite {
                slot: INDEX_SLOT,
                value: index + 1,
            }),
        });
    }
    Program { rules }
}

/// Service the operand depot using its physical reports. This helper shares
/// the Keeper's memory-and-route pattern with an explicitly different valve.
pub fn sink_program() -> Program {
    Program {
        rules: vec![
            rule(
                vec![Condition::HasMessage {
                    port: 0,
                    value: true,
                }],
                Action::TakeMessage { port: 0, slot: 0 },
            ),
            rule(
                vec![],
                Action::Route {
                    valve: CLOCK_VALVE,
                    bit: BitSource::Memory { slot: 0 },
                },
            ),
        ],
    }
}

fn point(x: u8, y: u8) -> Point {
    Point { x, y }
}
fn cell(id: u16, position: Point, mobile: bool, program: Program) -> Cell {
    Cell {
        id,
        position,
        heading: Direction::East,
        mobile,
        memory: [0; 4],
        program,
    }
}
fn link(id: u16, from: Endpoint, to_cell: u16, to_port: u8) -> Link {
    Link {
        id,
        from,
        to_cell,
        to_port,
        delay: 1,
        enabled: true,
    }
}
fn from(id: u16) -> Endpoint {
    Endpoint::Cell { id, port: 0 }
}

/// Export a complete ordinary world without executing it. A is encoded only
/// in physically transported spark bits; B and the tap are explicit supplied
/// local memory. The selected payload is never exposed by a depot-report link.
pub fn arithmetic_case(a: u8, b: u8, tap: u8) -> Result<Experiment, String> {
    if a > 15 || b > 15 || ![0, 4].contains(&tap) {
        return Err("add4 requires A/B in 0..15 and output tap 0 or 4.".into());
    }
    // Fixture construction defines the task's expected physical outlet. The
    // policy must compute it through its rule tables; this value is not sensed.
    let selected = ((u16::from(a) + u16::from(b)) >> tap) & 1 != 0;
    let clock_sparks: Vec<_> = (0..5)
        .map(|index| Spark {
            id: CLOCK_SPARK_START + index,
            bit: index < 4 && (a >> index) & 1 != 0,
        })
        .collect();
    let one_count = clock_sparks.iter().filter(|spark| spark.bit).count() as u32;
    let mut cells = vec![
        cell(
            COURIER,
            point(1, 2),
            true,
            construction_fixtures::courier_program(),
        ),
        cell(RELAY, point(5, 2), false, fixtures::relay_program()),
        cell(
            KEEPER,
            point(8, 3),
            false,
            construction_fixtures::child_program(),
        ),
        cell(BLOCKER, point(8, 4), false, fixtures::idle_program()),
        cell(A_FORWARDER, point(6, 2), false, fixtures::relay_program()),
        cell(B_SHIFTER, point(5, 3), false, shifter_program()),
        cell(ADDER, point(6, 3), false, adder_program()),
        cell(SELECTOR, point(7, 3), false, selector_program()),
        cell(
            PAYLOAD_COURIER,
            point(3, 4),
            true,
            construction_fixtures::courier_program(),
        ),
        cell(OPERAND_SINK, point(5, 1), false, sink_program()),
    ];
    cells.iter_mut().find(|c| c.id == B_SHIFTER).unwrap().memory[B_SLOT as usize] = b;
    cells.iter_mut().find(|c| c.id == SELECTOR).unwrap().memory[TAP_SLOT as usize] = tap;
    let sources = vec![
        Source {
            id: CLOCK_SOURCE,
            position: point(1, 2),
            sparks: clock_sparks,
        },
        Source {
            id: PAYLOAD_SOURCE,
            position: point(3, 4),
            sparks: vec![Spark {
                id: PAYLOAD_SPARK,
                bit: selected,
            }],
        },
    ];
    let depots = vec![
        Depot {
            id: CLOCK_DEPOT,
            position: point(4, 2),
            capacity: 1,
        },
        Depot {
            id: PAYLOAD_DEPOT,
            position: point(7, 4),
            capacity: 1,
        },
    ];
    let beacons = [
        (PAYLOAD_ZERO, point(9, 4), false, u32::from(!selected)),
        (PAYLOAD_ONE, point(8, 5), true, u32::from(selected)),
        (CLOCK_ZERO, point(3, 1), false, 5 - one_count),
        (CLOCK_ONE, point(4, 0), true, one_count),
    ]
    .into_iter()
    .map(|(id, position, accepts, required_deliveries)| Beacon {
        id,
        position,
        accepts,
        initial_charge: 33,
        drain_every: 4,
        drain_amount: 1,
        spark_charge: 6,
        required_deliveries,
    })
    .collect::<Vec<_>>();
    let valves = vec![
        Valve {
            id: PAYLOAD_VALVE,
            position: point(8, 4),
            depot: PAYLOAD_DEPOT,
            beacon_zero: PAYLOAD_ZERO,
            beacon_one: PAYLOAD_ONE,
            enabled: false,
        },
        Valve {
            id: CLOCK_VALVE,
            position: point(4, 1),
            depot: CLOCK_DEPOT,
            beacon_zero: CLOCK_ZERO,
            beacon_one: CLOCK_ONE,
            enabled: true,
        },
    ];
    let mut floor: Vec<_> = cells
        .iter()
        .map(|cell| cell.position)
        .chain(sources.iter().map(|item| item.position))
        .chain(depots.iter().map(|item| item.position))
        .chain(beacons.iter().map(|item| item.position))
        .chain(valves.iter().map(|item| item.position))
        .collect();
    floor.extend((1..=4).map(|x| point(x, 2)));
    floor.extend((3..=7).map(|x| point(x, 4)));
    let walls = (0..7)
        .flat_map(|y| (0..11).map(move |x| point(x, y)))
        .filter(|position| !floor.contains(position))
        .collect();
    Ok(Experiment {
        version: CONSTRUCTION_VERSION,
        seed: 0,
        width: 11,
        height: 7,
        walls,
        sources,
        depots,
        beacons,
        valves,
        cells,
        links: vec![
            link(DEPOT_REPORT, Endpoint::Depot { id: CLOCK_DEPOT }, RELAY, 0),
            link(A_CLOCK, from(RELAY), A_FORWARDER, 0),
            link(B_CLOCK, from(RELAY), B_SHIFTER, 0),
            link(SINK_REPORT, from(RELAY), OPERAND_SINK, 0),
            link(A_INPUT, from(A_FORWARDER), ADDER, 0),
            link(B_INPUT, from(B_SHIFTER), ADDER, 1),
            link(SUM_OUTPUT, from(ADDER), SELECTOR, 0),
            link(SELECTED_OUTPUT, from(SELECTOR), KEEPER, 0),
        ],
        events: vec![
            Event {
                tick: CONTACT_END,
                event: EventKind::LinkEnabled {
                    id: SELECTED_OUTPUT,
                    enabled: false,
                },
            },
            Event {
                tick: SERVICE_START,
                event: EventKind::ValveEnabled {
                    id: PAYLOAD_VALVE,
                    enabled: true,
                },
            },
            Event {
                tick: SERVICE_END,
                event: EventKind::ValveEnabled {
                    id: PAYLOAD_VALVE,
                    enabled: false,
                },
            },
        ],
        ticks: HORIZON,
        fuel: FUEL,
        activation_fuel: 128,
        construction: None,
    })
}

pub fn experiment(id: &str) -> Result<Experiment, String> {
    let (a, b, tap, seed) = match id {
        "ark-reserve-15" => (9, 6, 4, 0),
        "ark-reserve-16" => (9, 7, 4, 0),
        "ark-staggered-15" => (9, 6, 0, 0),
        "ark-staggered-16" => (9, 7, 0, 0),
        "ark-reserve-30" => (15, 15, 4, 29),
        "ark-reserve-7" => (3, 4, 4, 29),
        "ark-staggered-30" => (15, 15, 0, 29),
        "ark-staggered-7" => (3, 4, 0, 29),
        _ => return Err(format!("Unknown ark fixture: {id}")),
    };
    let mut world = arithmetic_case(a, b, tap)?;
    world.seed = seed;
    Ok(world)
}
