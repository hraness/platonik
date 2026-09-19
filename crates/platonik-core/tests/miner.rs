use platonik_core::{model::*, world, world_fixtures};

/// A collector that walks onto the declared drill, waits for its first
/// extraction, and fetches it — proving the facility_is/fetch path end to end.
#[test]
fn a_hauler_collects_drill_output_from_its_buffer() {
    let mut experiment = world_fixtures::homestead();
    experiment.cells = vec![Cell {
        id: 7,
        position: Point { x: 16, y: 0 },
        heading: Direction::East,
        mobile: true,
        memory: [0; 4],
        program: Program {
            rules: vec![
                Rule {
                    when: vec![
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
                    action: Action::Fetch {
                        item: ItemKind::Material,
                    },
                    remember: None,
                },
                Rule {
                    when: vec![Condition::AtFacility { value: false }],
                    action: Action::Move {
                        direction: Relative::Forward,
                    },
                    remember: None,
                },
                Rule {
                    when: vec![],
                    action: Action::Wait,
                    remember: None,
                },
            ],
        },
    }];
    let origin = world::new("Drilled".into(), experiment).unwrap();
    let grown = world::apply(&origin, world::Command::Advance { ticks: 20 }).unwrap();
    let report = world::report(&grown).unwrap();
    let miner = report
        .state
        .facilities
        .iter()
        .find(|facility| facility.id == world_fixtures::MINER)
        .expect("declared drill");
    let cell = &report.state.cells[0];
    assert_eq!(cell.position, Point { x: 17, y: 0 });
    // The drill's first unit moved from the deposit through the buffer into
    // the collector's hands — not a hand-gather from the stock beneath.
    assert_eq!(cell.material, Some(1009));
    assert!(miner.materials.is_empty());
    assert_eq!(miner.minted, 1);
}
