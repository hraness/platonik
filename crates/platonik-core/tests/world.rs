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
    let expanded = world::apply(&redirected, world::Command::Advance { ticks: 64 }).unwrap();
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
            facility: 92,
            name: "South Depot".into(),
        },
    )
    .unwrap();
    let report = world::report(&named).unwrap();
    let site = report
        .state
        .facilities
        .iter()
        .find(|facility| facility.id == 92)
        .expect("placed site");
    assert!(!site.ready);
    assert_eq!(
        report.names.get(&92).map(String::as_str),
        Some("South Depot")
    );
    assert_eq!(report.summary.facilities, 3);
    assert_eq!(report.summary.ready_facilities, 2);

    let grown = (0..24).fold(named, |world, _| {
        world::apply(&world, world::Command::Advance { ticks: 64 }).unwrap()
    });
    let report = world::report(&grown).unwrap();
    let site = report
        .state
        .facilities
        .iter()
        .find(|facility| facility.id == 92)
        .expect("placed site");
    assert!(
        site.ready,
        "site should complete once its bill is supplied: {site:?}"
    );
    assert_eq!(report.summary.ready_facilities, 3);
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
}
