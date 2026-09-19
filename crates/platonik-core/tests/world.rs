use platonik_core::{
    fixtures,
    model::{FacilityKind, Point},
    world, world_fixtures,
};

#[test]
fn one_world_carries_state_across_bounded_advances() {
    let origin = world::new("Dustlight".into(), world_fixtures::homestead()).unwrap();
    let one = world::apply(&origin, world::Command::Advance { ticks: 64 }).unwrap();
    let first = world::apply(&origin, world::Command::Advance { ticks: 32 }).unwrap();
    let two = world::apply(&first, world::Command::Advance { ticks: 32 }).unwrap();
    let one_report = world::report(&one).unwrap();
    let two_report = world::report(&two).unwrap();
    assert_eq!(one_report.tick, 64);
    assert_eq!(one_report.state, two_report.state);
    assert_eq!(one_report.costs, two_report.costs);
    assert_eq!(one_report.summary, two_report.summary);
    assert!(one_report.summary.deliveries > 0);
    assert_eq!(one_report.summary.constructed_cells, 1);
}

#[test]
fn an_intervention_preserves_the_world_and_changes_later_work() {
    let origin = world::new("Dustlight".into(), world_fixtures::homestead()).unwrap();
    let first = world::apply(&origin, world::Command::Advance { ticks: 32 }).unwrap();
    let baseline = world::apply(&first, world::Command::Advance { ticks: 64 }).unwrap();
    let changed = world::apply(
        &first,
        world::Command::SetProgram {
            cell: 1,
            program: fixtures::idle_program(),
        },
    )
    .unwrap();
    let changed = world::apply(&changed, world::Command::Advance { ticks: 64 }).unwrap();
    let before = world::report(&first).unwrap();
    let baseline = world::report(&baseline).unwrap();
    let changed = world::report(&changed).unwrap();
    assert_eq!(changed.tick, baseline.tick);
    // The idled surveyor never moved again, while the baseline one kept working.
    assert_eq!(
        changed.state.cells[0].position,
        before.state.cells[0].position
    );
    assert_ne!(
        changed.state.cells[0].position,
        baseline.state.cells[0].position
    );
    assert!(changed.summary.deliveries <= baseline.summary.deliveries);
    assert_eq!(changed.revision, 3);
}

#[test]
fn the_foundry_can_redirect_remaining_material_into_more_capacity() {
    let origin = world::new("Dustlight".into(), world_fixtures::homestead()).unwrap();
    let upper = world::apply(&origin, world::Command::Advance { ticks: 64 }).unwrap();
    let redirected = world::apply(
        &upper,
        world::Command::SetProgram {
            cell: 5,
            program: world_fixtures::builder_program(51).unwrap(),
        },
    )
    .unwrap();
    let expanded = world::apply(&redirected, world::Command::Advance { ticks: 128 }).unwrap();
    let report = world::report(&expanded).unwrap();
    assert_eq!(report.summary.constructed_cells, 2);
    assert_eq!(report.summary.cells, 5);
    assert_eq!(report.summary.material_units, 28);
}

#[test]
fn recorded_world_history_is_recomputed_before_use() {
    let origin = world::new("Dustlight".into(), world_fixtures::homestead()).unwrap();
    let mut advanced = world::apply(&origin, world::Command::Advance { ticks: 8 }).unwrap();
    let world::WorldEvent::Advanced { through_tick } = &mut advanced.events[0] else {
        panic!("advance event");
    };
    *through_tick = 129;
    assert!(world::report(&advanced).is_err());
}

#[test]
fn world_commands_remain_bounded_and_target_real_cells() {
    let origin = world::new("Dustlight".into(), world_fixtures::homestead()).unwrap();
    assert!(world::apply(&origin, world::Command::Advance { ticks: 0 }).is_err());
    assert!(world::apply(&origin, world::Command::Advance { ticks: 129 }).is_err());
    assert!(
        world::apply(
            &origin,
            world::Command::SetProgram {
                cell: 999,
                program: fixtures::idle_program(),
            },
        )
        .is_err()
    );
}

#[test]
fn the_fabricator_mints_unique_parts_from_supplied_inputs() {
    let origin = world::new("Dustlight".into(), world_fixtures::homestead()).unwrap();
    let grown = world::apply(&origin, world::Command::Advance { ticks: 128 }).unwrap();
    let report = world::report(&grown).unwrap();
    let fabricator = report
        .state
        .facilities
        .iter()
        .find(|facility| facility.id == world_fixtures::FABRICATOR)
        .expect("declared fabricator");
    assert!(fabricator.minted > 0);
    let parts: Vec<u32> = report
        .state
        .facilities
        .iter()
        .flat_map(|facility| {
            facility
                .parts
                .iter()
                .chain(facility.spent_parts.iter())
                .copied()
                .collect::<Vec<u32>>()
        })
        .chain(
            report
                .state
                .cells
                .iter()
                .filter_map(|cell| cell.part)
                .collect::<Vec<u32>>(),
        )
        .collect();
    assert_eq!(parts.len(), fabricator.minted as usize);
    let mut unique = parts.clone();
    unique.sort_unstable();
    unique.dedup();
    assert_eq!(unique.len(), parts.len());
    assert_eq!(report.summary.parts_minted, fabricator.minted as usize);
}

#[test]
fn a_placed_site_consumes_its_bill_and_becomes_ready() {
    let origin = world::new("Dustlight".into(), world_fixtures::homestead()).unwrap();
    let placed = world::apply(
        &origin,
        world::Command::Place {
            structure: FacilityKind::Storehouse,
            position: Point { x: 12, y: 13 },
        },
    )
    .unwrap();
    let named = world::apply(
        &placed,
        world::Command::Name {
            facility: 93,
            name: "South Depot".into(),
        },
    )
    .unwrap();
    let report = world::report(&named).unwrap();
    let site = report
        .state
        .facilities
        .iter()
        .find(|facility| facility.id == 93)
        .expect("placed site");
    assert!(!site.ready);
    assert_eq!(
        report.names.get(&93).map(String::as_str),
        Some("South Depot")
    );
    assert_eq!(report.summary.facilities, 4);
    assert_eq!(report.summary.ready_facilities, 3);

    let grown = (0..24).fold(named, |world, _| {
        world::apply(&world, world::Command::Advance { ticks: 64 }).unwrap()
    });
    let report = world::report(&grown).unwrap();
    let site = report
        .state
        .facilities
        .iter()
        .find(|facility| facility.id == 93)
        .expect("placed site");
    assert!(
        site.ready,
        "site should complete once its bill is supplied: {site:?}"
    );
    assert_eq!(report.summary.ready_facilities, 4);
}

#[test]
fn stock_hauler_carries_parts_past_storage_to_unfinished_construction() {
    let mut experiment = world_fixtures::homestead();
    experiment
        .cells
        .retain(|cell| cell.id == world_fixtures::HAULER);
    experiment.cells[0].position = Point { x: 0, y: 0 };
    experiment.cells[0].heading = platonik_core::model::Direction::South;
    experiment.construction.as_mut().unwrap().stocks[0].position = Point { x: 0, y: 2 };
    experiment
        .facilities
        .iter_mut()
        .find(|facility| facility.id == world_fixtures::STOREHOUSE)
        .unwrap()
        .position = Point { x: 0, y: 6 };
    let origin = world::new("Parts route".into(), experiment).unwrap();
    let placed = world::apply(
        &origin,
        world::Command::Place {
            structure: FacilityKind::Storehouse,
            position: Point { x: 0, y: 8 },
        },
    )
    .unwrap();
    let grown = world::apply(&placed, world::Command::Advance { ticks: 128 }).unwrap();
    let report = world::report(&grown).unwrap();
    assert!(
        report.recent_frames.iter().any(|frame| {
            frame.state.cells.iter().any(|cell| {
                cell.id == world_fixtures::HAULER
                    && cell.position == (Point { x: 0, y: 6 })
                    && cell.part.is_some()
            })
        }),
        "the hauler must pass through ready storage carrying a produced part"
    );
    let site = report
        .state
        .facilities
        .iter()
        .find(|facility| facility.id == 93)
        .unwrap();
    assert_eq!(
        site.needed_part, 0,
        "the hauler must carry its part onward to construction"
    );
    assert_eq!(site.spent_parts.len(), 1);
}

#[test]
fn placement_and_naming_are_validated() {
    let origin = world::new("Dustlight".into(), world_fixtures::homestead()).unwrap();
    // out of bounds
    assert!(
        world::apply(
            &origin,
            world::Command::Place {
                structure: FacilityKind::Fabricator,
                position: Point { x: 99, y: 0 },
            },
        )
        .is_err()
    );
    // occupied by the declared fabricator
    assert!(
        world::apply(
            &origin,
            world::Command::Place {
                structure: FacilityKind::Storehouse,
                position: Point { x: 0, y: 4 },
            },
        )
        .is_err()
    );
    // occupied by a cell
    assert!(
        world::apply(
            &origin,
            world::Command::Place {
                structure: FacilityKind::Storehouse,
                position: Point { x: 0, y: 1 },
            },
        )
        .is_err()
    );
    // a wall tile on the midland ridge
    assert!(
        world::apply(
            &origin,
            world::Command::Place {
                structure: FacilityKind::Storehouse,
                position: Point { x: 8, y: 5 },
            },
        )
        .is_err()
    );
    // unknown facility
    assert!(
        world::apply(
            &origin,
            world::Command::Name {
                facility: 77,
                name: "Nowhere".into(),
            },
        )
        .is_err()
    );
    // empty and padded names
    for name in ["", "  padded  ", "bad\nname"] {
        assert!(
            world::apply(
                &origin,
                world::Command::Name {
                    facility: 90,
                    name: name.into(),
                },
            )
            .is_err(),
            "name {name:?} should be rejected"
        );
    }
    // a drill belongs on a deposit
    assert!(
        world::apply(
            &origin,
            world::Command::Place {
                structure: FacilityKind::Miner,
                position: Point { x: 12, y: 13 },
            },
        )
        .is_err()
    );
    // other structures still refuse deposit tiles
    assert!(
        world::apply(
            &origin,
            world::Command::Place {
                structure: FacilityKind::Storehouse,
                position: Point { x: 11, y: 13 },
            },
        )
        .is_err()
    );
    // a drill site admits onto the open south deposit
    assert!(
        world::apply(
            &origin,
            world::Command::Place {
                structure: FacilityKind::Miner,
                position: Point { x: 11, y: 13 },
            },
        )
        .is_ok()
    );
}

/// A homestead with one far-away idle cell: extraction runs uncontested, so
/// cadence, buffer limits, and the deposit ledger are exact.
fn drilled_world() -> world::World {
    let mut experiment = world_fixtures::homestead();
    experiment.cells = vec![platonik_core::model::Cell {
        id: 7,
        position: Point { x: 12, y: 12 },
        heading: platonik_core::model::Direction::North,
        mobile: true,
        memory: [0; 4],
        program: fixtures::idle_program(),
    }];
    world::new("Drilled".into(), experiment).unwrap()
}

#[test]
fn a_drill_extracts_its_deposit_on_a_deterministic_period() {
    let origin = drilled_world();
    let first = world::apply(&origin, world::Command::Advance { ticks: 13 }).unwrap();
    let report = world::report(&first).unwrap();
    let miner = report
        .state
        .facilities
        .iter()
        .find(|facility| facility.id == world_fixtures::MINER)
        .expect("declared drill");
    assert_eq!(miner.minted, 1);
    assert_eq!(miner.materials.len(), 1);
    assert_eq!(report.summary.material_extracted, 1);
    let stock = report
        .state
        .construction
        .as_ref()
        .unwrap()
        .stocks
        .iter()
        .find(|stock| stock.id == world_fixtures::EAST_DEPOSIT)
        .expect("east deposit");
    assert_eq!(stock.units.len(), 11);
    // One unit per period while the deposit lasts; the buffer caps at eight.
    let grown = (0..7).fold(first, |world, _| {
        world::apply(&world, world::Command::Advance { ticks: 128 }).unwrap()
    });
    let report = world::report(&grown).unwrap();
    let miner = report
        .state
        .facilities
        .iter()
        .find(|facility| facility.id == world_fixtures::MINER)
        .expect("declared drill");
    assert_eq!(miner.materials.len(), 8);
    assert_eq!(miner.minted, 8);
    let stock = report
        .state
        .construction
        .as_ref()
        .unwrap()
        .stocks
        .iter()
        .find(|stock| stock.id == world_fixtures::EAST_DEPOSIT)
        .expect("east deposit");
    // The buffer filled before the deposit emptied: four units remain.
    assert_eq!(stock.units.len(), 4);
    assert_eq!(report.summary.parts_minted, 0);
}

#[test]
fn facility_inputs_and_outputs_follow_their_kind() {
    use platonik_core::industry;
    use platonik_core::model::{FacilityState, ItemKind};
    let ready = |kind, materials: Vec<u32>| FacilityState {
        id: 1,
        kind,
        position: Point { x: 0, y: 0 },
        ready: true,
        needed_material: 0,
        needed_part: 0,
        needed_frame: 0,
        materials,
        sparks: Vec::new(),
        parts: Vec::new(),
        frames: Vec::new(),
        spent_materials: Vec::new(),
        spent_sparks: Vec::new(),
        spent_parts: Vec::new(),
        spent_frames: Vec::new(),
        progress: 0,
        minted: 0,
    };
    let items = [
        ItemKind::Spark,
        ItemKind::Material,
        ItemKind::Part,
        ItemKind::Frame,
    ];
    let miner = ready(FacilityKind::Miner, vec![1]);
    for item in items {
        assert!(!industry::needs(&miner, item));
    }
    assert!(industry::has(&miner, ItemKind::Material));
    assert!(!industry::has(&miner, ItemKind::Part));
    let fabricator = ready(FacilityKind::Fabricator, Vec::new());
    assert!(industry::needs(&fabricator, ItemKind::Spark));
    assert!(industry::needs(&fabricator, ItemKind::Material));
    assert!(!industry::needs(&fabricator, ItemKind::Part));
    assert!(!industry::needs(&fabricator, ItemKind::Frame));
    let assembler = ready(FacilityKind::Assembler, Vec::new());
    assert!(industry::needs(&assembler, ItemKind::Spark));
    assert!(industry::needs(&assembler, ItemKind::Material));
    assert!(industry::needs(&assembler, ItemKind::Part));
    assert!(!industry::needs(&assembler, ItemKind::Frame));
    let crane = ready(FacilityKind::Crane, Vec::new());
    for item in items {
        assert!(!industry::needs(&crane, item));
    }
    let storehouse = ready(FacilityKind::Storehouse, Vec::new());
    for item in items {
        assert!(industry::needs(&storehouse, item));
    }
}
