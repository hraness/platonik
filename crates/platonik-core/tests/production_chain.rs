use platonik_core::{
    check,
    model::{
        Action, Beacon, Condition, ConstructionSpec, Direction, FacilityDecl, FacilityKind,
        ItemKind, MaterialStock, Point, Program, Relative, Rule, Source, Spark,
    },
    world_fixtures,
};

fn rule(when: Vec<Condition>, action: Action) -> Rule {
    Rule {
        when,
        action,
        remember: None,
    }
}

fn courier() -> Program {
    Program {
        rules: vec![
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
                vec![],
                Action::Turn {
                    direction: Relative::Left,
                },
            ),
        ],
    }
}

#[test]
fn assembler_and_crane_chain_replays_through_the_independent_checker() {
    let mut experiment = world_fixtures::homestead();
    experiment.width = 5;
    experiment.height = 5;
    experiment.walls.clear();
    experiment.sources = vec![Source {
        id: 0,
        position: Point { x: 0, y: 0 },
        sparks: (1..=16).map(|id| Spark { id, bit: false }).collect(),
    }];
    experiment.depots.clear();
    experiment.beacons = vec![Beacon {
        id: 0,
        position: Point { x: 4, y: 4 },
        accepts: false,
        initial_charge: 100,
        drain_every: 128,
        drain_amount: 1,
        spark_charge: 8,
        required_deliveries: 0,
    }];
    experiment.valves.clear();
    experiment.cells = vec![platonik_core::model::Cell {
        id: 1,
        position: Point { x: 0, y: 0 },
        heading: Direction::East,
        mobile: true,
        memory: [0; 4],
        program: courier(),
    }];
    experiment.links.clear();
    experiment.events.clear();
    let mut blueprint = experiment.construction.as_ref().unwrap().blueprints[0].clone();
    blueprint.body.cell.position = Point { x: 2, y: 2 };
    experiment.construction = Some(ConstructionSpec {
        stocks: vec![MaterialStock {
            id: 50,
            position: Point { x: 1, y: 0 },
            units: (1001..=1008).collect(),
        }],
        blueprints: vec![blueprint],
    });
    experiment.facilities = vec![
        FacilityDecl {
            id: 90,
            kind: FacilityKind::Fabricator,
            position: Point { x: 2, y: 0 },
        },
        FacilityDecl {
            id: 91,
            kind: FacilityKind::Assembler,
            position: Point { x: 3, y: 0 },
        },
        FacilityDecl {
            id: 92,
            kind: FacilityKind::Crane,
            position: Point { x: 3, y: 1 },
        },
        FacilityDecl {
            id: 93,
            kind: FacilityKind::Storehouse,
            position: Point { x: 4, y: 1 },
        },
    ];

    let receipt = check::make_receipt(&experiment).unwrap();
    check::verify_receipt(&receipt).unwrap();
    let assembler = receipt
        .result
        .final_state
        .facilities
        .iter()
        .find(|facility| facility.id == 91)
        .unwrap();
    let crane = receipt
        .result
        .final_state
        .facilities
        .iter()
        .find(|facility| facility.id == 92)
        .unwrap();
    let storehouse = receipt
        .result
        .final_state
        .facilities
        .iter()
        .find(|facility| facility.id == 93)
        .unwrap();
    assert!(assembler.minted > 0);
    assert!(crane.minted > 0);
    assert!(!storehouse.frames.is_empty());
}
