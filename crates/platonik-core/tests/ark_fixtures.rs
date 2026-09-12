use platonik_core::{
    ark_fixtures as ark, construction_fixtures, fixtures, model::*, validate_experiment,
};

#[test]
fn eight_supplied_worlds_share_programs_local_links_and_one_bounded_window() {
    assert_eq!(ark::case_ids().len(), 8);
    assert_eq!(ark::training_ids(), &ark::case_ids()[..4]);
    assert_eq!(ark::transfer_ids(), &ark::case_ids()[4..]);
    assert!(ark::experiment("ark-unknown").is_err());
    let reference = ark::experiment(ark::case_ids()[0]).unwrap();
    for id in ark::case_ids() {
        let world = ark::experiment(id).unwrap();
        validate_experiment(&world).unwrap();
        assert_eq!(world.version, CONSTRUCTION_VERSION);
        assert_eq!(world.ticks, 128);
        assert_eq!(world.cells.len(), 10);
        assert_eq!(world.links.len(), 8);
        assert!(world.construction.is_none());
        assert_eq!(world.events, reference.events);
        assert_eq!(world.walls, reference.walls);
        for (cell, previous) in world.cells.iter().zip(&reference.cells) {
            assert_eq!(cell.id, previous.id);
            assert_eq!(cell.program, previous.program);
            assert_eq!(cell.position, previous.position);
        }
        for courier in [ark::COURIER, ark::PAYLOAD_COURIER] {
            assert_eq!(
                world
                    .cells
                    .iter()
                    .find(|c| c.id == courier)
                    .unwrap()
                    .program,
                construction_fixtures::courier_program()
            );
        }
        assert_eq!(
            world
                .cells
                .iter()
                .find(|c| c.id == ark::KEEPER)
                .unwrap()
                .program,
            construction_fixtures::child_program()
        );
        for relay in [ark::RELAY, ark::A_FORWARDER] {
            assert_eq!(
                world.cells.iter().find(|c| c.id == relay).unwrap().program,
                fixtures::relay_program()
            );
        }
        assert!(world.links.iter().all(|link| link.delay == 1));
        assert!(!world.links.iter().any(|link| link.from
            == Endpoint::Depot {
                id: ark::PAYLOAD_DEPOT
            }));
        assert_eq!(
            world
                .sources
                .iter()
                .find(|s| s.id == ark::CLOCK_SOURCE)
                .unwrap()
                .sparks
                .len(),
            5
        );
        assert!(
            !world
                .sources
                .iter()
                .find(|s| s.id == ark::CLOCK_SOURCE)
                .unwrap()
                .sparks[4]
                .bit
        );
        assert_eq!(
            world
                .cells
                .iter()
                .find(|c| c.id == ark::ADDER)
                .unwrap()
                .memory,
            [0; 4]
        );
    }
}

#[test]
fn exact_plan_pairs_change_supplied_data_and_goals_not_programs_or_schedules() {
    let reserve = ark::arithmetic_case(9, 6, 4).unwrap();
    let mut staggered = ark::arithmetic_case(9, 6, 0).unwrap();
    staggered
        .cells
        .iter_mut()
        .find(|c| c.id == ark::SELECTOR)
        .unwrap()
        .memory[ark::TAP_SLOT as usize] = 4;
    staggered
        .sources
        .iter_mut()
        .find(|s| s.id == ark::PAYLOAD_SOURCE)
        .unwrap()
        .sparks[0]
        .bit = false;
    staggered
        .beacons
        .iter_mut()
        .find(|b| b.id == ark::PAYLOAD_ZERO)
        .unwrap()
        .required_deliveries = 1;
    staggered
        .beacons
        .iter_mut()
        .find(|b| b.id == ark::PAYLOAD_ONE)
        .unwrap()
        .required_deliveries = 0;
    assert_eq!(staggered, reserve);
    let mut carry = ark::arithmetic_case(9, 7, 4).unwrap();
    carry
        .cells
        .iter_mut()
        .find(|c| c.id == ark::B_SHIFTER)
        .unwrap()
        .memory[ark::B_SLOT as usize] = 6;
    carry
        .sources
        .iter_mut()
        .find(|s| s.id == ark::PAYLOAD_SOURCE)
        .unwrap()
        .sparks[0]
        .bit = false;
    carry
        .beacons
        .iter_mut()
        .find(|b| b.id == ark::PAYLOAD_ZERO)
        .unwrap()
        .required_deliveries = 1;
    carry
        .beacons
        .iter_mut()
        .find(|b| b.id == ark::PAYLOAD_ONE)
        .unwrap()
        .required_deliveries = 0;
    assert_eq!(carry, reserve);
}

#[test]
fn arithmetic_exports_admit_only_the_declared_interface_without_running() {
    for invalid in [(16, 0, 0), (0, 16, 4), (0, 0, 1), (0, 0, 255)] {
        assert!(ark::arithmetic_case(invalid.0, invalid.1, invalid.2).is_err());
    }
    // Constructor shape checks do not execute arithmetic or qualify its truth table.
    for (a, b, tap) in [(0, 0, 0), (15, 15, 4), (9, 7, 0)] {
        let world = ark::arithmetic_case(a, b, tap).unwrap();
        validate_experiment(&world).unwrap();
        assert_eq!(
            world
                .cells
                .iter()
                .find(|c| c.id == ark::B_SHIFTER)
                .unwrap()
                .memory[0],
            b
        );
        let source = world
            .sources
            .iter()
            .find(|s| s.id == ark::CLOCK_SOURCE)
            .unwrap();
        assert_eq!(
            source
                .sparks
                .iter()
                .take(4)
                .enumerate()
                .fold(0_u8, |value, (index, spark)| value
                    | (u8::from(spark.bit) << index)),
            a
        );
        assert!(
            world
                .cells
                .iter()
                .all(|cell| cell.program.rules.len() <= 32)
        );
    }
}
