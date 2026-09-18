use crate::construction_fixtures::{BLUEPRINT, BUILDER, CHILD, STOCK};
use crate::fixtures::compact_courier;
use crate::model::*;

pub const LOWER_BLUEPRINT: u16 = 51;
pub const LOWER_CHILD: u16 = 4;

fn rule(when: Vec<Condition>, action: Action) -> Rule {
    Rule {
        when,
        action,
        remember: None,
    }
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

pub fn homestead() -> Experiment {
    let mut walls = Vec::new();
    for x in 0..12 {
        walls.push(Point { x, y: 2 });
        if x != 2 {
            walls.push(Point { x, y: 4 });
        }
        walls.push(Point { x, y: 6 });
    }
    for y in [3, 5] {
        walls.push(Point { x: 0, y });
        walls.push(Point { x: 11, y });
    }
    let sparks = |start: u32| {
        (start..start + 32)
            .map(|id| Spark { id, bit: false })
            .collect()
    };
    let courier = |id, y| Cell {
        id,
        position: Point {
            x: if id == 1 { 1 } else { 2 },
            y,
        },
        heading: if id == 1 {
            Direction::East
        } else {
            Direction::West
        },
        mobile: true,
        memory: [0; 4],
        program: compact_courier(),
    };
    Experiment {
        version: CONSTRUCTION_VERSION,
        seed: 74,
        width: 12,
        height: 9,
        walls,
        sources: vec![
            Source {
                id: 0,
                position: Point { x: 1, y: 5 },
                sparks: sparks(1),
            },
            Source {
                id: 1,
                position: Point { x: 1, y: 3 },
                sparks: sparks(33),
            },
        ],
        depots: Vec::new(),
        beacons: vec![
            Beacon {
                id: 0,
                position: Point { x: 10, y: 5 },
                accepts: false,
                initial_charge: 20,
                drain_every: 16,
                drain_amount: 1,
                spark_charge: 6,
                required_deliveries: 0,
            },
            Beacon {
                id: 1,
                position: Point { x: 10, y: 3 },
                accepts: false,
                initial_charge: 20,
                drain_every: 16,
                drain_amount: 1,
                spark_charge: 6,
                required_deliveries: 0,
            },
        ],
        valves: Vec::new(),
        cells: vec![
            courier(1, 5),
            Cell {
                id: BUILDER,
                position: Point { x: 2, y: 4 },
                heading: Direction::North,
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
            stocks: vec![MaterialStock {
                id: STOCK,
                position: Point { x: 2, y: 4 },
                units: vec![1001, 1002],
            }],
            blueprints: vec![
                Blueprint {
                    id: BLUEPRINT,
                    body: BlueprintBody {
                        cell: courier(CHILD, 3),
                        links: Vec::new(),
                    },
                },
                Blueprint {
                    id: LOWER_BLUEPRINT,
                    body: BlueprintBody {
                        cell: courier(LOWER_CHILD, 5),
                        links: Vec::new(),
                    },
                },
            ],
        }),
    }
}
