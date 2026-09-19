use platonik_core::{
    model::{FacilityKind, INDUSTRY_ACCOUNTING_VERSION, INDUSTRY_VERSION, Point},
    sim, world, world_fixtures,
};
use std::collections::BTreeSet;

fn advance(mut value: world::World, ticks: u32) -> world::World {
    for _ in 0..ticks / 128 {
        value = world::apply(&value, world::Command::Advance { ticks: 128 }).unwrap();
    }
    value
}

#[test]
fn frontier_produces_parts_and_frames_and_keeps_its_freight_circuit() {
    let origin = world::new("Copperwake".into(), world_fixtures::frontier()).unwrap();
    let grown = advance(origin, 128);
    let report = world::report(&grown).unwrap();
    assert!(report.summary.parts_minted >= 2, "{:?}", report.summary);
    assert!(report.summary.frames_minted >= 1, "{:?}", report.summary);
    assert!(report.summary.deliveries > 0);
    for frame in &report.recent_frames {
        for cell in frame
            .state
            .cells
            .iter()
            .filter(|cell| [2, 6].contains(&cell.id))
        {
            let Point { x, y } = cell.position;
            assert!((7..=9).contains(&x) && (3..=8).contains(&y));
            assert!(x == 7 || x == 9 || y == 3 || y == 8);
        }
    }
}

#[test]
fn first_expansion_completes_and_transfers_real_factory_output() {
    let origin = world::new("Copperwake".into(), world_fixtures::frontier()).unwrap();
    let placed = world::apply(
        &origin,
        world::Command::Place {
            structure: FacilityKind::Crane,
            position: world_fixtures::FRONTIER_CRANE_SITE,
        },
    )
    .unwrap();
    let grown = advance(placed, 512);
    let report = world::report(&grown).unwrap();
    let crane = report
        .state
        .facilities
        .iter()
        .find(|facility| facility.kind == FacilityKind::Crane)
        .unwrap();
    assert!(crane.ready, "{:?}", crane);
    assert!(crane.minted > 0, "{:?}", crane);
    assert!(report.summary.frames_minted > 0);
    assert!(report.summary.items_moved > 0);
    assert_eq!(crane.spent_materials.len(), 1);
    assert_eq!(crane.spent_parts.len(), 1);
    assert_eq!(crane.spent_frames.len(), 1);
    // Serialization and a separate replay reproduce all admitted construction.
    let restored = serde_json::from_slice(&serde_json::to_vec(&grown).unwrap()).unwrap();
    let restored = world::report(&restored).unwrap();
    assert_eq!(restored.state, report.state);
    assert_eq!(restored.costs, report.costs);
}

#[test]
fn every_frontier_resource_and_machine_is_reachable_on_the_physical_map() {
    let experiment = world_fixtures::frontier();
    let mut reachable = BTreeSet::new();
    let mut pending = vec![Point { x: 7, y: 3 }];
    while let Some(point) = pending.pop() {
        if point.x >= experiment.width
            || point.y >= experiment.height
            || experiment.walls.contains(&point)
            || !reachable.insert(point)
        {
            continue;
        }
        for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
            let x = i16::from(point.x) + dx;
            let y = i16::from(point.y) + dy;
            if x >= 0 && y >= 0 {
                pending.push(Point {
                    x: x as u8,
                    y: y as u8,
                });
            }
        }
    }
    for position in experiment
        .facilities
        .iter()
        .map(|entry| entry.position)
        .chain(experiment.sources.iter().map(|entry| entry.position))
        .chain(experiment.beacons.iter().map(|entry| entry.position))
        .chain(
            experiment
                .construction
                .as_ref()
                .unwrap()
                .stocks
                .iter()
                .map(|entry| entry.position),
        )
    {
        assert!(reachable.contains(&position), "unreachable {position:?}");
    }
}

#[test]
fn larger_material_budget_is_bounded_and_versioned() {
    let mut experiment = world_fixtures::frontier();
    assert_eq!(experiment.version, INDUSTRY_ACCOUNTING_VERSION);
    sim::validate_experiment(&experiment).unwrap();
    experiment.version = INDUSTRY_VERSION;
    assert!(
        sim::validate_experiment(&experiment)
            .unwrap_err()
            .contains("32 material")
    );
    experiment.version = INDUSTRY_ACCOUNTING_VERSION;
    experiment.construction.as_mut().unwrap().stocks[0]
        .units
        .push(2000);
    assert!(
        sim::validate_experiment(&experiment)
            .unwrap_err()
            .contains("256 material")
    );
    sim::validate_experiment(&world_fixtures::homestead()).unwrap();
}

fn factory_corners() -> Vec<Point> {
    vec![
        Point { x: 7, y: 3 },
        Point { x: 9, y: 3 },
        Point { x: 9, y: 8 },
        Point { x: 7, y: 8 },
    ]
}

#[test]
fn drawn_route_is_an_editable_program_with_real_production_and_replay() {
    let origin = world::new("Copperwake".into(), world_fixtures::frontier()).unwrap();
    let program = platonik_core::freight_route::compile(&origin, 2, &factory_corners()).unwrap();
    let assigned = world::apply(&origin, world::Command::SetProgram { cell: 2, program }).unwrap();
    let before = world::report(&origin).unwrap();
    let after = world::report(&assigned).unwrap();
    assert_eq!(after.tick, 0);
    assert_eq!(before.state, after.state);
    let expected = world::report(&advance(origin, 128)).unwrap();
    let actual = world::report(&advance(assigned, 128)).unwrap();
    assert_eq!(actual.state, expected.state);
    assert!(actual.summary.frames_minted > 0);
}

#[test]
fn drawn_route_aligns_a_carrier_without_teleporting_it() {
    use platonik_core::model::{Action, Condition, Direction};
    let mut experiment = world_fixtures::frontier();
    experiment.cells[1].position = Point { x: 7, y: 5 };
    experiment.cells[1].heading = Direction::South;
    let origin = world::new("Facing wrong way".into(), experiment).unwrap();
    let program = platonik_core::freight_route::compile(&origin, 2, &factory_corners()).unwrap();
    assert!(program.rules.iter().any(|rule| matches!(
        rule.action,
        Action::Turn {
            direction: platonik_core::model::Relative::Back
        }
    ) && rule.when.contains(&Condition::AtPosition {
        position: Point { x: 7, y: 5 }
    })));
    let assigned = world::apply(&origin, world::Command::SetProgram { cell: 2, program }).unwrap();
    let advanced = world::apply(&assigned, world::Command::Advance { ticks: 1 }).unwrap();
    let report = world::report(&advanced).unwrap();
    let actor = report.state.cells.iter().find(|cell| cell.id == 2).unwrap();
    assert_eq!(actor.position, Point { x: 7, y: 5 });
    assert_eq!(actor.heading, Direction::North);
    assert!(
        world::report(&advance(assigned, 128))
            .unwrap()
            .summary
            .frames_minted
            > 0
    );
}

#[test]
fn drawn_routes_reject_unsupported_worlds_and_invalid_physical_paths() {
    use platonik_core::{
        freight_route::compile,
        model::{Action, Condition, Rule},
    };
    let origin = world::new("Copperwake".into(), world_fixtures::frontier()).unwrap();
    assert!(
        compile(&origin, 5, &factory_corners())
            .unwrap_err()
            .contains("Stationary")
    );
    assert!(
        compile(&origin, 999, &factory_corners())
            .unwrap_err()
            .contains("original")
    );
    assert!(
        compile(&origin, 2, &factory_corners()[..3])
            .unwrap_err()
            .contains("4–8")
    );
    assert!(
        compile(
            &origin,
            2,
            &[
                Point { x: 7, y: 3 },
                Point { x: 26, y: 3 },
                Point { x: 26, y: 8 },
                Point { x: 7, y: 8 }
            ]
        )
        .unwrap_err()
        .contains("ridge")
    );
    assert!(
        compile(
            &origin,
            2,
            &[
                Point { x: 6, y: 4 },
                Point { x: 10, y: 4 },
                Point { x: 10, y: 9 },
                Point { x: 6, y: 9 }
            ]
        )
        .unwrap_err()
        .contains("current tile")
    );
    let mut diagonal = factory_corners();
    diagonal[1].y = 4;
    assert!(
        compile(&origin, 2, &diagonal)
            .unwrap_err()
            .contains("horizontal or vertical")
    );
    let mut legacy = world_fixtures::homestead();
    let old_world = world::new("Dustlight".into(), legacy.clone()).unwrap();
    assert!(
        compile(&old_world, 2, &factory_corners())
            .unwrap_err()
            .contains("v6")
    );
    legacy.cells[0].program.rules.insert(
        0,
        Rule {
            when: vec![Condition::AtPosition {
                position: Point { x: 0, y: 1 },
            }],
            action: Action::Wait,
            remember: None,
        },
    );
    assert!(sim::validate_experiment(&legacy).is_err());
}

#[test]
fn drawn_routes_reject_closed_edges_and_constructed_stationary_obstacles() {
    use platonik_core::{
        freight_route::compile,
        model::{Edge, Event, EventKind},
    };
    let mut experiment = world_fixtures::frontier();
    experiment.events.push(Event {
        tick: 1,
        event: EventKind::EdgeBlocked {
            edge: Edge::new(Point { x: 8, y: 3 }, Point { x: 9, y: 3 }),
            blocked: true,
        },
    });
    let origin = world::new("Closed pass".into(), experiment).unwrap();
    let closed = world::apply(&origin, world::Command::Advance { ticks: 1 }).unwrap();
    assert!(
        compile(&closed, 2, &factory_corners())
            .unwrap_err()
            .contains("closed passage")
    );

    let mut experiment = world_fixtures::frontier();
    experiment
        .cells
        .iter_mut()
        .find(|cell| cell.id == 5)
        .unwrap()
        .position = Point { x: 8, y: 4 };
    let spec = experiment.construction.as_mut().unwrap();
    spec.stocks[0].position = Point { x: 8, y: 4 };
    let child = &mut spec.blueprints[0].body.cell;
    child.position = Point { x: 8, y: 3 };
    child.mobile = false;
    child.program = platonik_core::fixtures::idle_program();
    let origin = world::new("New obstacle".into(), experiment).unwrap();
    let grown = world::apply(&origin, world::Command::Advance { ticks: 32 }).unwrap();
    assert_eq!(world::report(&grown).unwrap().summary.constructed_cells, 1);
    assert!(
        compile(&grown, 2, &factory_corners())
            .unwrap_err()
            .contains("stationary builder")
    );
}

#[test]
fn a_storehouse_on_the_freight_route_accumulates_finished_frames() {
    let origin = world::new("Copperwake".into(), world_fixtures::frontier()).unwrap();
    let placed = world::apply(
        &origin,
        world::Command::Place {
            structure: FacilityKind::Storehouse,
            position: Point { x: 7, y: 6 },
        },
    )
    .unwrap();
    let grown = advance(placed, 512);
    let report = world::report(&grown).unwrap();
    let store = report
        .state
        .facilities
        .iter()
        .find(|facility| facility.position == Point { x: 7, y: 6 })
        .unwrap();
    assert!(store.ready, "{store:?}");
    assert!(!store.frames.is_empty(), "{store:?}");
    let grown = advance(grown, 128);
    let later = world::report(&grown).unwrap();
    let later = later
        .state
        .facilities
        .iter()
        .find(|facility| facility.id == store.id)
        .unwrap();
    assert!(later.frames.len() >= store.frames.len());
}

#[test]
fn an_eight_corner_route_connects_the_factory_to_the_eastern_outpost() {
    let origin = world::new("Copperwake".into(), world_fixtures::frontier()).unwrap();
    let corners = [
        (7, 3),
        (9, 3),
        (9, 8),
        (13, 8),
        (13, 10),
        (26, 10),
        (26, 18),
        (7, 18),
    ]
    .map(|(x, y)| Point { x, y });
    let program = platonik_core::freight_route::compile(&origin, 2, &corners).unwrap();
    let assigned = world::apply(&origin, world::Command::SetProgram { cell: 2, program }).unwrap();
    let grown = advance(assigned, 512);
    let report = world::report(&grown).unwrap();
    let outpost = report
        .state
        .facilities
        .iter()
        .find(|facility| facility.id == world_fixtures::STOREHOUSE)
        .unwrap();
    assert!(
        !outpost.frames.is_empty(),
        "the drawn route should deliver real factory output to the remote store: {outpost:?}"
    );
}
