//! Frozen public engineering fixtures. These are regression cases, not hidden research tasks.
use crate::model::*;

pub const COURIER: u16 = 1;
pub const RELAY: u16 = 2;
pub const CONTROLLER: u16 = 3;
pub const VALVE: u16 = 30;
pub const CONTACT_END: u32 = 48;
pub const SERVICE_START: u32 = 52;
/// Foundry ids shared by the generator and the witness: one stock the builder
/// stands on and the declared runner blueprints it may raise.
pub const FOUNDRY_STOCK: u16 = 60;
pub const FOUNDRY_RUNNER_A: u16 = 50;
pub const FOUNDRY_RUNNER_B: u16 = 51;

pub fn names() -> Vec<&'static str> {
    vec![
        "opening-normal",
        "opening-normal-resilient",
        "opening-wounded",
        "opening-wounded-fast",
        "ark-plan-a",
        "ark-plan-b",
    ]
}

pub fn experiment(id: &str) -> Result<Experiment, String> {
    match id {
        "opening-normal" => Ok(opening(false, false)),
        "opening-normal-resilient" => Ok(opening(true, false)),
        "opening-wounded" => Ok(opening(true, true)),
        "opening-wounded-fast" => Ok(opening(false, true)),
        "ark-plan-a" => Ok(ark(false)),
        "ark-plan-b" => Ok(ark(true)),
        _ => Err(format!("unknown fixture: {id}")),
    }
}

fn rule(when: Vec<Condition>, action: Action) -> Rule {
    Rule {
        when,
        action,
        remember: None,
    }
}

pub fn idle_program() -> Program {
    Program {
        rules: vec![rule(vec![], Action::Wait)],
    }
}

fn service_rules() -> Vec<Rule> {
    vec![
        rule(
            vec![
                Condition::AtReceiver { value: true },
                Condition::Carrying { value: true },
            ],
            Action::Drop,
        ),
        rule(
            vec![
                Condition::AtSource { value: true },
                Condition::Carrying { value: false },
            ],
            Action::Pickup,
        ),
    ]
}

/// A short bouncing shuttle. A blocked direct corridor defeats this policy.
pub fn compact_courier() -> Program {
    let mut rules = service_rules();
    rules.extend([
        rule(
            vec![Condition::Blocked {
                direction: Relative::Forward,
                value: true,
            }],
            Action::Turn {
                direction: Relative::Back,
            },
        ),
        rule(
            vec![],
            Action::Move {
                direction: Relative::Forward,
            },
        ),
    ]);
    Program { rules }
}

/// A local right-wall follower. No map, destination coordinates, or fixture id is available.
pub fn resilient_courier() -> Program {
    let mut rules = service_rules();
    for direction in [
        Relative::Right,
        Relative::Forward,
        Relative::Left,
        Relative::Back,
    ] {
        rules.push(rule(
            vec![Condition::Blocked {
                direction,
                value: false,
            }],
            Action::Move { direction },
        ));
    }
    Program { rules }
}

pub fn relay_program() -> Program {
    Program {
        rules: vec![
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

pub fn controller_program() -> Program {
    Program {
        rules: vec![
            Rule {
                when: vec![Condition::HasMessage {
                    port: 0,
                    value: true,
                }],
                action: Action::TakeMessage { port: 0, slot: 0 },
                remember: Some(MemoryWrite { slot: 1, value: 1 }),
            },
            rule(
                vec![Condition::Memory { slot: 1, value: 1 }],
                Action::Route {
                    valve: VALVE,
                    bit: BitSource::Memory { slot: 0 },
                },
            ),
            rule(vec![], Action::Wait),
        ],
    }
}

/// The fixed switchboard shuttle: carry each spark from the source to the
/// depot, bouncing off whatever blocks the far side of each stop. The depot
/// itself reports the dropped spark's bit, so this program never needs to
/// read the bit it carries.
pub fn switchboard_porter() -> Program {
    Program {
        rules: vec![
            rule(
                vec![
                    Condition::AtReceiver { value: true },
                    Condition::Carrying { value: true },
                ],
                Action::Drop,
            ),
            rule(
                vec![
                    Condition::AtSource { value: true },
                    Condition::Carrying { value: false },
                ],
                Action::Pickup,
            ),
            rule(
                vec![Condition::Blocked {
                    direction: Relative::Forward,
                    value: true,
                }],
                Action::Turn {
                    direction: Relative::Back,
                },
            ),
            rule(
                vec![],
                Action::Move {
                    direction: Relative::Forward,
                },
            ),
        ],
    }
}

/// The fixed switchboard depot reader: take each arrival report, then keep
/// forwarding the last taken bit downstream. A forwarded signal carries the
/// original spark's receipt id as evidence, so the report still names its
/// spark; resending is what lets a downstream link flap heal on its own.
pub fn switchboard_relay() -> Program {
    Program {
        rules: vec![
            Rule {
                when: vec![Condition::HasMessage {
                    port: 0,
                    value: true,
                }],
                action: Action::TakeMessage { port: 0, slot: 0 },
                remember: Some(MemoryWrite { slot: 1, value: 1 }),
            },
            rule(
                vec![Condition::Memory { slot: 1, value: 1 }],
                Action::Send {
                    port: 0,
                    bit: BitSource::Memory { slot: 0 },
                },
            ),
            rule(vec![], Action::Wait),
        ],
    }
}

/// The switchboard witness: take each forwarded report, then keep routing the
/// depot's front spark by the last taken bit. A capacity-one depot keeps the
/// newest report aligned with the front spark, and the engine's own beacon
/// check turns a stale bit into a rejected action rather than a wrong
/// delivery, so retrying can never misroute.
pub fn switchboard_keeper() -> Program {
    Program {
        rules: vec![
            Rule {
                when: vec![Condition::Memory { slot: 1, value: 1 }],
                action: Action::Route {
                    valve: VALVE,
                    bit: BitSource::Memory { slot: 0 },
                },
                remember: Some(MemoryWrite { slot: 1, value: 0 }),
            },
            Rule {
                when: vec![Condition::HasMessage {
                    port: 0,
                    value: true,
                }],
                action: Action::TakeMessage { port: 0, slot: 0 },
                remember: Some(MemoryWrite { slot: 1, value: 1 }),
            },
            rule(vec![], Action::Wait),
        ],
    }
}

/// The foundry witness: raise the two declared runner blueprints in order.
/// A blueprint's assembly stage is only sensible while the builder stands
/// adjacent to its fixed target, so each rule keys on the stage directly: an
/// `Absent` stage with a held unit starts the body, `Copying` and `Wiring`
/// continue it, `Ready` activates the child, and once it is `Born` that
/// blueprint's rules stop matching and the second block takes over. Every
/// rule for the second runner also requires the first to be `Born`, so work
/// on it can never preempt an unfinished assembly, and gathering fires only
/// for a blueprint that has not started — a held unit is never double-spent
/// and a declared decoy blueprint is never touched. Failed actions cost one
/// tick, so retried stages are safe.
pub fn foundry_builder() -> Program {
    let mut rules = Vec::new();
    for blueprint in [FOUNDRY_RUNNER_A, FOUNDRY_RUNNER_B] {
        for (stage, action) in [
            (AssemblyStage::Ready, Action::Activate { blueprint }),
            (AssemblyStage::Copying, Action::Build { blueprint }),
            (AssemblyStage::Wiring, Action::Build { blueprint }),
        ] {
            let mut when = vec![Condition::AssemblyStage { blueprint, stage }];
            if blueprint == FOUNDRY_RUNNER_B {
                when.push(Condition::AssemblyStage {
                    blueprint: FOUNDRY_RUNNER_A,
                    stage: AssemblyStage::Born,
                });
            }
            rules.push(rule(when, action));
        }
        for value in [true, false] {
            let mut when = vec![
                Condition::AssemblyStage {
                    blueprint,
                    stage: AssemblyStage::Absent,
                },
                Condition::HasMaterial { value },
            ];
            if blueprint == FOUNDRY_RUNNER_B {
                when.push(Condition::AssemblyStage {
                    blueprint: FOUNDRY_RUNNER_A,
                    stage: AssemblyStage::Born,
                });
            }
            rules.push(rule(
                when,
                if value {
                    Action::Build { blueprint }
                } else {
                    Action::GatherMaterial {
                        stock: FOUNDRY_STOCK,
                    }
                },
            ));
        }
    }
    rules.push(rule(vec![], Action::Wait));
    Program { rules }
}

pub fn constant_controller(bit: bool) -> Program {
    Program {
        rules: vec![rule(
            vec![],
            Action::Route {
                valve: VALVE,
                bit: BitSource::Constant { value: bit },
            },
        )],
    }
}

pub fn alternating_controller() -> Program {
    Program {
        rules: vec![
            Rule {
                when: vec![Condition::Memory { slot: 2, value: 0 }],
                action: Action::Route {
                    valve: VALVE,
                    bit: BitSource::Constant { value: false },
                },
                remember: Some(MemoryWrite { slot: 2, value: 1 }),
            },
            Rule {
                when: vec![],
                action: Action::Route {
                    valve: VALVE,
                    bit: BitSource::Constant { value: true },
                },
                remember: Some(MemoryWrite { slot: 2, value: 0 }),
            },
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

fn world(resilient: bool, wounded: bool, bit: bool, count: u32) -> Experiment {
    let mut walls = Vec::new();
    for y in 0..5 {
        for x in 0..9 {
            if !(1..=5).contains(&x) || !(2..=3).contains(&y) || (wounded && x == 3 && y == 2) {
                walls.push(point(x, y));
            }
        }
    }
    Experiment {
        version: MODEL_VERSION,
        seed: 0,
        width: 9,
        height: 5,
        walls,
        sources: vec![Source {
            id: 10,
            position: point(1, 2),
            sparks: (1..=count).map(|id| Spark { id, bit }).collect(),
        }],
        depots: vec![],
        beacons: vec![],
        valves: vec![],
        cells: vec![cell(
            COURIER,
            point(1, 2),
            true,
            if resilient {
                resilient_courier()
            } else {
                compact_courier()
            },
        )],
        links: vec![],
        events: vec![],
        ticks: 44,
        fuel: 20_000,
        activation_fuel: 128,
        construction: None,
    }
}

fn opening(resilient: bool, wounded: bool) -> Experiment {
    let mut experiment = world(resilient, wounded, false, 3);
    experiment.beacons.push(Beacon {
        id: 20,
        position: point(5, 2),
        accepts: false,
        initial_charge: 4,
        drain_every: 4,
        drain_amount: 1,
        spark_charge: 5,
        required_deliveries: 3,
    });
    experiment
}

fn ark(bit: bool) -> Experiment {
    let mut experiment = world(true, false, bit, 4);
    let stations = [point(5, 1), point(6, 1), point(6, 2), point(7, 2)];
    experiment.walls.retain(|point| !stations.contains(point));
    experiment.depots.push(Depot {
        id: 11,
        position: point(5, 2),
        capacity: 4,
    });
    for (id, position, accepts) in [(20, point(6, 1), false), (21, point(7, 2), true)] {
        experiment.beacons.push(Beacon {
            id,
            position,
            accepts,
            initial_charge: if accepts == bit { 13 } else { 20 },
            drain_every: 4,
            drain_amount: 1,
            spark_charge: 3,
            required_deliveries: if accepts == bit { 4 } else { 0 },
        });
    }
    experiment.valves.push(Valve {
        id: VALVE,
        position: point(6, 2),
        depot: 11,
        beacon_zero: 20,
        beacon_one: 21,
        enabled: false,
    });
    experiment.cells.extend([
        cell(RELAY, point(5, 1), false, relay_program()),
        cell(CONTROLLER, point(6, 1), false, controller_program()),
        // This charged, scheduled body forms the corridor boundary. It grants no computation.
        cell(4, point(6, 2), false, idle_program()),
    ]);
    experiment.links.extend([
        Link {
            id: 40,
            from: Endpoint::Depot { id: 11 },
            to_cell: RELAY,
            to_port: 0,
            delay: 1,
            enabled: true,
        },
        Link {
            id: 41,
            from: Endpoint::Cell { id: RELAY, port: 0 },
            to_cell: CONTROLLER,
            to_port: 0,
            delay: 1,
            enabled: true,
        },
    ]);
    experiment.events.extend([
        Event {
            tick: CONTACT_END,
            event: EventKind::LinkEnabled {
                id: 41,
                enabled: false,
            },
        },
        Event {
            tick: SERVICE_START,
            event: EventKind::ValveEnabled {
                id: VALVE,
                enabled: true,
            },
        },
    ]);
    experiment.ticks = SERVICE_START + 3;
    experiment
}

/// Replace behavior without removing the physical body or changing the parent's artifact.
pub fn replace_program(experiment: &Experiment, cell_id: u16, program: Program) -> Experiment {
    let mut copy = experiment.clone();
    copy.cells
        .iter_mut()
        .find(|cell| cell.id == cell_id)
        .expect("fixture cell exists")
        .program = program;
    copy
}

pub fn clear_retention(experiment: &Experiment) -> Experiment {
    let mut copy = experiment.clone();
    copy.events.push(Event {
        tick: CONTACT_END + 1,
        event: EventKind::ClearMemory { cell: CONTROLLER },
    });
    copy.events.sort_by_key(|event| event.tick);
    copy
}
