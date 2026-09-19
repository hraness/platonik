//! A finite in-world enumerator: two builders edit copies of one seed, their
//! children make physical trials, and a local selector commissions one return.
use crate::model::*;

pub const HORIZON: u32 = 128;
pub const FUEL: u64 = 200_000;
pub const CONFIRMATION_OPENS: u32 = 96;
pub const SELECTOR: u16 = 5;
pub const RELAY: u16 = 6;
pub const KEEPER: u16 = 7;
pub const CLOCK: u16 = 8;
pub const SELECTION_SLOT: usize = 2;
pub const EDIT_RULES: [u8; 2] = [0, 1];

#[derive(Clone, Copy, Debug)]
pub struct Berth {
    pub id: u8,
    pub builder: u16,
    pub child: u16,
    pub blueprint: u16,
    pub stock: u16,
    pub source: u16,
    pub depot: u16,
    pub valve: u16,
    pub trial: u32,
    pub confirmation: u32,
    pub direction: u8,
    pub report_link: u16,
    pub feedback_link: u16,
    pub command_link: u16,
}
pub const BERTHS: [Berth; 2] = [
    Berth {
        id: 0,
        builder: 1,
        child: 3,
        blueprint: 50,
        stock: 60,
        source: 10,
        depot: 11,
        valve: 30,
        trial: 100,
        confirmation: 101,
        direction: 1,
        report_link: 40,
        feedback_link: 42,
        command_link: 46,
    },
    Berth {
        id: 1,
        builder: 2,
        child: 4,
        blueprint: 51,
        stock: 61,
        source: 12,
        depot: 13,
        valve: 31,
        trial: 200,
        confirmation: 201,
        direction: 2,
        report_link: 41,
        feedback_link: 44,
        command_link: 47,
    },
];
const TRAINING: &[&str] = &[
    "bloom-left",
    "bloom-right",
    "bloom-left-delay",
    "bloom-right-delay",
];
const TRANSFER: &[&str] = &[
    "bloom-rotated-left",
    "bloom-rotated-right",
    "bloom-crossing-left",
    "bloom-crossing-right",
];
const ALL: &[&str] = &[
    "bloom-left",
    "bloom-right",
    "bloom-left-delay",
    "bloom-right-delay",
    "bloom-rotated-left",
    "bloom-rotated-right",
    "bloom-crossing-left",
    "bloom-crossing-right",
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
fn memory(slot: u8, value: u8) -> Condition {
    Condition::Memory { slot, value }
}
fn rule(when: Vec<Condition>, action: Action) -> Rule {
    Rule {
        when,
        action,
        remember: None,
    }
}
fn remember(when: Vec<Condition>, action: Action, slot: u8, value: u8) -> Rule {
    Rule {
        when,
        action,
        remember: Some(MemoryWrite { slot, value }),
    }
}
fn phase(value: u8) -> Condition {
    memory(0, value)
}

/// Both berths receive these identical rules. The two Forward turn operands
/// are changed by each running builder; candidate programs are not supplied.
pub fn seed_program() -> Program {
    Program {
        rules: vec![
            remember(
                vec![phase(1)],
                Action::Turn {
                    direction: Relative::Forward,
                },
                0,
                2,
            ),
            remember(
                vec![phase(4)],
                Action::Turn {
                    direction: Relative::Forward,
                },
                0,
                5,
            ),
            rule(
                vec![phase(0), Condition::Carrying { value: true }],
                Action::WriteMemory { slot: 0, value: 1 },
            ),
            rule(
                vec![phase(0), Condition::AtSource { value: true }],
                Action::Pickup,
            ),
            remember(
                vec![
                    phase(2),
                    Condition::Blocked {
                        direction: Relative::Forward,
                        value: false,
                    },
                ],
                Action::Move {
                    direction: Relative::Forward,
                },
                0,
                3,
            ),
            rule(
                vec![
                    phase(3),
                    Condition::AtDepot { value: true },
                    Condition::Carrying { value: true },
                ],
                Action::Drop,
            ),
            remember(
                vec![
                    phase(3),
                    Condition::AtDepot { value: false },
                    Condition::Blocked {
                        direction: Relative::Back,
                        value: false,
                    },
                ],
                Action::Move {
                    direction: Relative::Back,
                },
                0,
                4,
            ),
            remember(
                vec![
                    phase(3),
                    Condition::Carrying { value: false },
                    Condition::Blocked {
                        direction: Relative::Back,
                        value: false,
                    },
                ],
                Action::Move {
                    direction: Relative::Back,
                },
                0,
                4,
            ),
            remember(
                vec![
                    phase(5),
                    Condition::HasMessage {
                        port: 0,
                        value: true,
                    },
                ],
                Action::TakeMessage { port: 0, slot: 1 },
                0,
                0,
            ),
        ],
    }
}

/// A two-station enumerator. A register write and two explicit edits derive
/// each candidate; local stage/count sensors prevent success-by-remembering.
pub fn builder_program(berth: Berth) -> Program {
    let stage = |stage| Condition::AssemblyStage {
        blueprint: berth.blueprint,
        stage,
    };
    let edits = |count| Condition::AssemblyEdits {
        blueprint: berth.blueprint,
        count,
    };
    Program {
        rules: vec![
            rule(vec![stage(AssemblyStage::Born)], Action::Wait),
            rule(
                vec![stage(AssemblyStage::Ready), memory(1, 0)],
                Action::WriteMemory {
                    slot: 1,
                    value: berth.direction,
                },
            ),
            rule(
                vec![stage(AssemblyStage::Ready), edits(0)],
                Action::EditDirection {
                    blueprint: berth.blueprint,
                    rule: EDIT_RULES[0],
                    slot: 1,
                },
            ),
            rule(
                vec![stage(AssemblyStage::Ready), edits(1)],
                Action::EditDirection {
                    blueprint: berth.blueprint,
                    rule: EDIT_RULES[1],
                    slot: 1,
                },
            ),
            rule(
                vec![stage(AssemblyStage::Ready), edits(2)],
                Action::Activate {
                    blueprint: berth.blueprint,
                },
            ),
            rule(
                vec![
                    stage(AssemblyStage::Absent),
                    Condition::HasMaterial { value: false },
                ],
                Action::GatherMaterial { stock: berth.stock },
            ),
            rule(
                vec![],
                Action::Build {
                    blueprint: berth.blueprint,
                },
            ),
        ],
    }
}

/// Selection is latched from an isolated physical report channel only after
/// both candidates exist. An external phase signal permits the later trip.
pub fn selector_program() -> Program {
    let born = || {
        BERTHS
            .iter()
            .map(|b| Condition::AssemblyStage {
                blueprint: b.blueprint,
                stage: AssemblyStage::Born,
            })
            .collect::<Vec<_>>()
    };
    let mut rules = Vec::new();
    for berth in BERTHS {
        rules.push(rule(
            vec![
                memory(2, berth.id + 1),
                Condition::HasMessage {
                    port: 2,
                    value: true,
                },
            ],
            Action::Send {
                port: berth.id,
                bit: BitSource::Constant { value: true },
            },
        ));
        rules.push(rule(vec![memory(2, berth.id + 1)], Action::Wait));
    }
    for berth in BERTHS {
        let mut when = born();
        when.push(Condition::HasMessage {
            port: berth.id,
            value: true,
        });
        rules.push(remember(
            when,
            Action::TakeMessage {
                port: berth.id,
                slot: 1,
            },
            2,
            berth.id + 1,
        ));
    }
    Program { rules }
}

pub fn relay_program() -> Program {
    let mut rules = Vec::new();
    for port in 0..2 {
        rules.push(remember(
            vec![phase(port + 1)],
            Action::Send {
                port,
                bit: BitSource::Memory { slot: 1 },
            },
            0,
            0,
        ));
    }
    for port in 0..2 {
        rules.push(remember(
            vec![Condition::HasMessage { port, value: true }],
            Action::TakeMessage { port, slot: 1 },
            0,
            port + 1,
        ));
    }
    Program { rules }
}
pub fn keeper_program() -> Program {
    let mut rules = Vec::new();
    for berth in BERTHS {
        rules.push(remember(
            vec![phase(berth.id + 1)],
            Action::TakeMessage {
                port: berth.id,
                slot: 1,
            },
            0,
            0,
        ));
    }
    for berth in BERTHS {
        rules.push(remember(
            vec![Condition::HasMessage {
                port: berth.id,
                value: true,
            }],
            Action::Route {
                valve: berth.valve,
                bit: BitSource::Message { port: berth.id },
            },
            0,
            berth.id + 1,
        ));
    }
    Program { rules }
}
fn cell(id: u16, position: Point, mobile: bool, program: Program) -> Cell {
    Cell {
        id,
        position,
        heading: Direction::North,
        mobile,
        memory: [0; 4],
        program,
    }
}
fn link(id: u16, from: Endpoint, to_cell: u16, to_port: u8, delay: u32) -> Link {
    Link {
        id,
        from,
        to_cell,
        to_port,
        delay,
        enabled: true,
    }
}

pub fn experiment(id: &str) -> Result<Experiment, String> {
    let (left, delay, seed, rotated, crossing) = match id {
        "bloom-left" => (true, 1, 0, false, false),
        "bloom-right" => (false, 1, 0, false, false),
        "bloom-left-delay" => (true, 2, 17, false, false),
        "bloom-right-delay" => (false, 2, 17, false, false),
        "bloom-rotated-left" => (true, 3, 29, true, false),
        "bloom-rotated-right" => (false, 3, 29, true, false),
        "bloom-crossing-left" => (true, 3, 29, true, true),
        "bloom-crossing-right" => (false, 3, 29, true, true),
        _ => return Err(format!("unknown Bloom habitat fixture: {id}")),
    };
    let side = if left { 4 } else { 6 };
    let outside = if left { 3 } else { 7 };
    let mut world = Experiment {
        version: VARIATION_VERSION,
        seed,
        width: 11,
        height: 9,
        walls: Vec::new(),
        sources: Vec::new(),
        depots: Vec::new(),
        beacons: Vec::new(),
        valves: Vec::new(),
        cells: Vec::new(),
        links: Vec::new(),
        events: Vec::new(),
        ticks: HORIZON,
        fuel: FUEL,
        activation_fuel: 8192,
        construction: Some(ConstructionSpec {
            stocks: Vec::new(),
            blueprints: Vec::new(),
        }),
        facilities: Vec::new(),
    };
    world.cells.push(cell(
        SELECTOR,
        Point { x: 5, y: 4 },
        false,
        selector_program(),
    ));
    world
        .cells
        .push(cell(RELAY, Point { x: side, y: 4 }, false, relay_program()));
    world.cells.push(cell(
        KEEPER,
        Point { x: outside, y: 4 },
        false,
        keeper_program(),
    ));
    world.cells.push(cell(
        CLOCK,
        Point { x: 10 - side, y: 4 },
        false,
        Program {
            rules: vec![rule(
                vec![],
                Action::Send {
                    port: 0,
                    bit: BitSource::Constant { value: true },
                },
            )],
        },
    ));
    world.beacons.push(Beacon {
        id: 20,
        position: Point { x: outside, y: 4 },
        accepts: false,
        initial_charge: 64,
        drain_every: 4,
        drain_amount: 1,
        spark_charge: 8,
        required_deliveries: 2,
    });
    for berth in BERTHS {
        let y = if berth.id == 0 { 3 } else { 5 };
        let outer_y = if berth.id == 0 { 2 } else { 6 };
        let source = Point { x: 5, y };
        let depot = Point { x: side, y };
        let builder_position = Point { x: 5, y: outer_y };
        world.cells.push(cell(
            berth.builder,
            builder_position,
            false,
            builder_program(berth),
        ));
        world.sources.push(Source {
            id: berth.source,
            position: source,
            sparks: vec![
                Spark {
                    id: berth.trial,
                    bit: false,
                },
                Spark {
                    id: berth.confirmation,
                    bit: false,
                },
            ],
        });
        world.depots.push(Depot {
            id: berth.depot,
            position: depot,
            capacity: 2,
        });
        world.beacons.push(Beacon {
            id: 21 + u16::from(berth.id),
            position: Point {
                x: outside,
                y: outer_y,
            },
            accepts: true,
            initial_charge: 64,
            drain_every: 4,
            drain_amount: 1,
            spark_charge: 8,
            required_deliveries: 0,
        });
        world.valves.push(Valve {
            id: berth.valve,
            position: Point { x: outside, y },
            depot: berth.depot,
            beacon_zero: 20,
            beacon_one: 21 + u16::from(berth.id),
            enabled: true,
        });
        world.links.push(link(
            berth.report_link,
            Endpoint::Depot { id: berth.depot },
            RELAY,
            berth.id,
            delay,
        ));
        world.links.push(link(
            berth.feedback_link,
            Endpoint::Cell {
                id: RELAY,
                port: berth.id,
            },
            SELECTOR,
            berth.id,
            delay,
        ));
        world.links.push(link(
            berth.feedback_link + 1,
            Endpoint::Cell {
                id: RELAY,
                port: berth.id,
            },
            KEEPER,
            berth.id,
            delay,
        ));
        let construction = world.construction.as_mut().unwrap();
        construction.stocks.push(MaterialStock {
            id: berth.stock,
            position: builder_position,
            units: vec![1001 + u32::from(berth.id)],
        });
        construction.blueprints.push(Blueprint {
            id: berth.blueprint,
            body: BlueprintBody {
                cell: cell(berth.child, source, true, seed_program()),
                links: vec![link(
                    berth.command_link,
                    Endpoint::Cell {
                        id: SELECTOR,
                        port: berth.id,
                    },
                    berth.child,
                    0,
                    delay,
                )],
            },
        });
        if crossing {
            world.events.push(Event {
                tick: CONFIRMATION_OPENS,
                event: EventKind::EdgeBlocked {
                    edge: Edge::new(source, depot),
                    blocked: true,
                },
            });
            world.events.push(Event {
                tick: 112,
                event: EventKind::EdgeBlocked {
                    edge: Edge::new(source, depot),
                    blocked: false,
                },
            });
        }
    }
    let mut phase_link = link(48, Endpoint::Cell { id: CLOCK, port: 0 }, SELECTOR, 2, 1);
    phase_link.enabled = false;
    world.links.push(phase_link);
    world.events.push(Event {
        tick: CONFIRMATION_OPENS,
        event: EventKind::LinkEnabled {
            id: 48,
            enabled: true,
        },
    });
    world.events.sort_by_key(|event| event.tick);
    let mut floor = vec![
        Point { x: 4, y: 3 },
        Point { x: 6, y: 3 },
        Point { x: 4, y: 5 },
        Point { x: 6, y: 5 },
    ];
    floor.extend(world.cells.iter().map(|c| c.position));
    floor.extend(world.sources.iter().map(|c| c.position));
    floor.extend(world.depots.iter().map(|c| c.position));
    floor.extend(world.beacons.iter().map(|c| c.position));
    floor.extend(world.valves.iter().map(|c| c.position));
    for y in 0..world.height {
        for x in 0..world.width {
            let p = Point { x, y };
            if !floor.contains(&p) {
                world.walls.push(p);
            }
        }
    }
    if rotated {
        let point = |p: Point| Point {
            x: world.width - 1 - p.x,
            y: world.height - 1 - p.y,
        };
        world.walls.iter_mut().for_each(|p| *p = point(*p));
        for c in &mut world.cells {
            c.position = point(c.position);
            c.heading = Direction::South;
        }
        for x in &mut world.sources {
            x.position = point(x.position);
        }
        for x in &mut world.depots {
            x.position = point(x.position);
        }
        for x in &mut world.beacons {
            x.position = point(x.position);
        }
        for x in &mut world.valves {
            x.position = point(x.position);
        }
        let construction = world.construction.as_mut().unwrap();
        for stock in &mut construction.stocks {
            stock.position = point(stock.position);
        }
        for blueprint in &mut construction.blueprints {
            blueprint.body.cell.position = point(blueprint.body.cell.position);
            blueprint.body.cell.heading = Direction::South;
        }
        for event in &mut world.events {
            if let EventKind::EdgeBlocked { edge, .. } = &mut event.event {
                *edge = Edge::new(point(edge.a), point(edge.b));
            }
        }
    }
    Ok(world)
}
