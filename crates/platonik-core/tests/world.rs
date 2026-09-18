use platonik_core::{fixtures, world, world_fixtures};

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
    assert_eq!(
        changed.state.cells[0].position,
        before.state.cells[0].position
    );
    assert!(changed.summary.deliveries < baseline.summary.deliveries);
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
    assert_eq!(report.summary.cells, 4);
    assert_eq!(report.summary.material_units, 0);
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
