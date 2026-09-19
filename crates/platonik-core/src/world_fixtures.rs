use crate::construction_fixtures::{BLUEPRINT, BUILDER, CHILD, STOCK};
use crate::model::*;

pub const LOWER_BLUEPRINT: u16 = 51;
pub const LOWER_CHILD: u16 = 4;
pub const HAULER: u16 = 2;
pub const EAST_DEPOSIT: u16 = 61;
pub const SOUTH_DEPOSIT: u16 = 62;
pub const FABRICATOR: u16 = 90;
pub const STOREHOUSE: u16 = 91;
pub const MINER: u16 = 92;

fn rule(when: Vec<Condition>, action: Action) -> Rule {
    Rule {
        when,
        action,
        remember: None,
    }
}

/// Wall-slider movement: run straight until blocked, then turn to slide
/// along the face. A wall-follow preference rule spins forever in open
/// ground; this survey pattern crosses open ground and circulates the rim,
/// so perimeter stations are reached in order.
fn slider_rules() -> Vec<Rule> {
    vec![
        rule(
            vec![Condition::Blocked {
                direction: Relative::Forward,
                value: false,
            }],
            Action::Move {
                direction: Relative::Forward,
            },
        ),
        rule(
            vec![Condition::Blocked {
                direction: Relative::Right,
                value: false,
            }],
            Action::Turn {
                direction: Relative::Right,
            },
        ),
        rule(
            vec![Condition::Blocked {
                direction: Relative::Left,
                value: false,
            }],
            Action::Turn {
                direction: Relative::Left,
            },
        ),
        rule(
            vec![],
            Action::Turn {
                direction: Relative::Back,
            },
        ),
    ]
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

/// The beacon courier: spark service plus the wall slider.
pub fn surveyor_program() -> Program {
    let mut rules = service_rules();
    rules.extend(slider_rules());
    Program { rules }
}

/// The general-purpose supply-chain program every Dustlight hauler runs:
/// frames go to unfinished sites, parts go to sites and assemblers, material
/// goes to any facility that needs it, and sparks fuel facilities and beacons.
/// Producer output is collected; storing or withdrawing finished goods at a
/// storehouse is left to agent-written programs, so the default loop never
/// ping-pongs items back and forth on one tile.
pub fn hauler_program() -> Program {
    let mut rules = vec![
        rule(
            vec![
                Condition::HasFrame { value: true },
                Condition::AtFacility { value: true },
                Condition::FacilityNeeds {
                    item: ItemKind::Frame,
                    value: true,
                },
                Condition::FacilityReady { value: false },
            ],
            Action::Supply {
                item: ItemKind::Frame,
            },
        ),
        rule(
            vec![
                Condition::HasFrame { value: false },
                Condition::AtFacility { value: true },
                Condition::FacilityIs {
                    structure: FacilityKind::Assembler,
                    value: true,
                },
                Condition::FacilityHas {
                    item: ItemKind::Frame,
                    value: true,
                },
            ],
            Action::Fetch {
                item: ItemKind::Frame,
            },
        ),
        rule(
            vec![
                Condition::HasPart { value: true },
                Condition::HasMaterial { value: true },
                Condition::AtFacility { value: true },
                Condition::FacilityIs {
                    structure: FacilityKind::Assembler,
                    value: true,
                },
                Condition::FacilityNeeds {
                    item: ItemKind::Material,
                    value: true,
                },
            ],
            Action::Supply {
                item: ItemKind::Material,
            },
        ),
        rule(
            vec![
                Condition::HasPart { value: true },
                Condition::Carrying { value: true },
                Condition::AtFacility { value: true },
                Condition::FacilityIs {
                    structure: FacilityKind::Assembler,
                    value: true,
                },
                Condition::FacilityNeeds {
                    item: ItemKind::Spark,
                    value: true,
                },
            ],
            Action::Supply {
                item: ItemKind::Spark,
            },
        ),
        rule(
            vec![
                Condition::HasPart { value: true },
                Condition::AtFacility { value: true },
                Condition::FacilityNeeds {
                    item: ItemKind::Part,
                    value: true,
                },
                Condition::FacilityReady { value: false },
            ],
            Action::Supply {
                item: ItemKind::Part,
            },
        ),
        rule(
            vec![
                Condition::HasPart { value: true },
                Condition::AtFacility { value: true },
                Condition::FacilityIs {
                    structure: FacilityKind::Assembler,
                    value: true,
                },
                Condition::FacilityNeeds {
                    item: ItemKind::Part,
                    value: true,
                },
            ],
            Action::Supply {
                item: ItemKind::Part,
            },
        ),
        rule(
            vec![
                Condition::HasPart { value: false },
                Condition::AtFacility { value: true },
                Condition::FacilityIs {
                    structure: FacilityKind::Fabricator,
                    value: true,
                },
                Condition::FacilityHas {
                    item: ItemKind::Part,
                    value: true,
                },
            ],
            Action::Fetch {
                item: ItemKind::Part,
            },
        ),
        rule(
            vec![
                Condition::HasMaterial { value: true },
                Condition::AtFacility { value: true },
                Condition::FacilityNeeds {
                    item: ItemKind::Material,
                    value: true,
                },
                Condition::FacilityReady { value: false },
            ],
            Action::Supply {
                item: ItemKind::Material,
            },
        ),
        rule(
            vec![
                Condition::HasMaterial { value: true },
                Condition::HasPart { value: false },
                Condition::AtFacility { value: true },
                Condition::FacilityNeeds {
                    item: ItemKind::Material,
                    value: true,
                },
            ],
            Action::Supply {
                item: ItemKind::Material,
            },
        ),
        rule(
            vec![
                Condition::AtFacility { value: true },
                Condition::FacilityIs {
                    structure: FacilityKind::Miner,
                    value: true,
                },
                Condition::FacilityHas {
                    item: ItemKind::Material,
                    value: true,
                },
                Condition::HasMaterial { value: false },
            ],
            Action::Fetch {
                item: ItemKind::Material,
            },
        ),
        rule(
            vec![
                Condition::AtStock { value: true },
                Condition::HasMaterial { value: false },
            ],
            Action::Gather,
        ),
        rule(
            vec![
                Condition::Carrying { value: true },
                Condition::HasPart { value: false },
                Condition::AtFacility { value: true },
                Condition::FacilityNeeds {
                    item: ItemKind::Spark,
                    value: true,
                },
            ],
            Action::Supply {
                item: ItemKind::Spark,
            },
        ),
        rule(
            vec![
                Condition::AtSource { value: true },
                Condition::Carrying { value: false },
            ],
            Action::Pickup,
        ),
    ];
    rules.extend(slider_rules());
    Program { rules }
}

pub fn builder_program(blueprint: u16) -> Result<Program, String> {
    if ![BLUEPRINT, LOWER_BLUEPRINT].contains(&blueprint) {
        return Err(format!("unknown homestead blueprint: {blueprint}"));
    }
    Ok(Program {
        rules: vec![
            rule(
                vec![Condition::AssemblyStage {
                    blueprint,
                    stage: AssemblyStage::Born,
                }],
                Action::Wait,
            ),
            rule(
                vec![Condition::AssemblyStage {
                    blueprint,
                    stage: AssemblyStage::Ready,
                }],
                Action::Activate { blueprint },
            ),
            rule(
                vec![
                    Condition::AssemblyStage {
                        blueprint,
                        stage: AssemblyStage::Absent,
                    },
                    Condition::HasMaterial { value: false },
                ],
                Action::GatherMaterial { stock: STOCK },
            ),
            rule(vec![], Action::Build { blueprint }),
        ],
    })
}

fn courier(id: u16, position: Point, heading: Direction, program: Program) -> Cell {
    Cell {
        id,
        position,
        heading,
        mobile: true,
        memory: [0; 4],
        program,
    }
}

/// Dustlight: one open 24×14 region. The west edge holds the homestead — a
/// light source, a working fabricator, and the home beacon. The east edge
/// holds a second light field, an outpost beacon that dies in a few hundred
/// ticks without a supply line, and a drill already working the northeast
/// deposit. A south deposit waits for a second drill; a storehouse guards
/// the midland ridge. Two interior ridges shape routes without sealing the
/// map.
pub fn homestead() -> Experiment {
    let walls = {
        let mut walls = Vec::new();
        for y in 3..=9 {
            walls.push(Point { x: 8, y });
        }
        for x in 12..=20 {
            walls.push(Point { x, y: 10 });
        }
        walls.push(Point { x: 14, y: 4 });
        walls.push(Point { x: 15, y: 4 });
        walls.push(Point { x: 14, y: 5 });
        walls
    };
    let sparks = |start: u32, count: u32| {
        (start..start + count)
            .map(|id| Spark { id, bit: false })
            .collect()
    };
    Experiment {
        version: INDUSTRY_VERSION,
        seed: 74,
        width: 24,
        height: 14,
        walls,
        sources: vec![
            Source {
                id: 0,
                position: Point { x: 0, y: 1 },
                sparks: sparks(1, 64),
            },
            Source {
                id: 1,
                position: Point { x: 23, y: 3 },
                sparks: sparks(65, 48),
            },
        ],
        depots: Vec::new(),
        beacons: vec![
            Beacon {
                id: 0,
                position: Point { x: 0, y: 11 },
                accepts: false,
                initial_charge: 48,
                drain_every: 24,
                drain_amount: 1,
                spark_charge: 8,
                required_deliveries: 0,
            },
            Beacon {
                id: 1,
                position: Point { x: 23, y: 9 },
                accepts: false,
                initial_charge: 40,
                drain_every: 16,
                drain_amount: 1,
                spark_charge: 8,
                required_deliveries: 0,
            },
        ],
        valves: Vec::new(),
        cells: vec![
            courier(
                1,
                Point { x: 0, y: 1 },
                Direction::South,
                surveyor_program(),
            ),
            courier(
                HAULER,
                Point { x: 3, y: 1 },
                Direction::East,
                hauler_program(),
            ),
            Cell {
                id: BUILDER,
                position: Point { x: 5, y: 0 },
                heading: Direction::East,
                mobile: false,
                memory: [0; 4],
                program: builder_program(BLUEPRINT).expect("known homestead blueprint"),
            },
        ],
        links: Vec::new(),
        events: Vec::new(),
        ticks: 128,
        fuel: 2_000_000,
        activation_fuel: 1024,
        construction: Some(ConstructionSpec {
            stocks: vec![
                MaterialStock {
                    id: STOCK,
                    position: Point { x: 5, y: 0 },
                    units: (1001..=1008).collect(),
                },
                MaterialStock {
                    id: EAST_DEPOSIT,
                    position: Point { x: 17, y: 0 },
                    units: (1009..=1020).collect(),
                },
                MaterialStock {
                    id: SOUTH_DEPOSIT,
                    position: Point { x: 11, y: 13 },
                    units: (1021..=1030).collect(),
                },
            ],
            blueprints: vec![
                Blueprint {
                    id: BLUEPRINT,
                    body: BlueprintBody {
                        cell: courier(
                            CHILD,
                            Point { x: 4, y: 0 },
                            Direction::East,
                            surveyor_program(),
                        ),
                        links: Vec::new(),
                    },
                },
                Blueprint {
                    id: LOWER_BLUEPRINT,
                    body: BlueprintBody {
                        cell: courier(
                            LOWER_CHILD,
                            Point { x: 6, y: 0 },
                            Direction::East,
                            hauler_program(),
                        ),
                        links: Vec::new(),
                    },
                },
            ],
        }),
        facilities: vec![
            FacilityDecl {
                id: FABRICATOR,
                kind: FacilityKind::Fabricator,
                position: Point { x: 0, y: 4 },
            },
            FacilityDecl {
                id: STOREHOUSE,
                kind: FacilityKind::Storehouse,
                position: Point { x: 9, y: 6 },
            },
            FacilityDecl {
                id: MINER,
                kind: FacilityKind::Miner,
                position: Point { x: 17, y: 0 },
            },
        ],
    }
}
