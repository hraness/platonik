use platonik_core::{
    construction_fixtures, fixtures, model::*, port_fixtures as ports, validate_experiment,
};

#[test]
fn eight_worlds_are_bounded_and_share_the_same_local_programs() {
    assert_eq!(ports::case_ids().len(), 8);
    assert_eq!(ports::training_ids(), &ports::case_ids()[..4]);
    assert_eq!(ports::transfer_ids(), &ports::case_ids()[4..]);
    assert!(ports::experiment("ports-unknown").is_err());
    let reference = ports::experiment(ports::case_ids()[0]).unwrap();
    for id in ports::case_ids() {
        let world = ports::experiment(id).unwrap();
        validate_experiment(&world).unwrap();
        assert_eq!(world.version, CONSTRUCTION_VERSION);
        assert_eq!(world.ticks, 128);
        assert_eq!(world.cells.len(), 10);
        assert_eq!(world.links.len(), 18);
        assert_eq!(world.beacons.len(), 4);
        assert_eq!(world.walls, reference.walls);
        assert!(world.construction.is_none());
        for (cell, original) in world.cells.iter().zip(&reference.cells) {
            assert_eq!(cell.id, original.id);
            assert_eq!(cell.position, original.position);
            assert_eq!(cell.program, original.program);
        }
        for lane in ports::LANES {
            let source = world
                .sources
                .iter()
                .find(|entry| entry.id == lane.source)
                .unwrap();
            let courier = world
                .cells
                .iter()
                .find(|entry| entry.id == lane.courier)
                .unwrap();
            let requester = world
                .cells
                .iter()
                .find(|entry| entry.id == lane.requester)
                .unwrap();
            assert_eq!(source.sparks.len(), 2);
            assert_eq!(source.sparks[0].id, lane.parcel);
            assert_eq!(source.sparks[1].id, lane.spare);
            assert_eq!(source.sparks[0].bit, source.sparks[1].bit);
            assert_eq!(
                u8::from(source.sparks[0].bit),
                requester.memory[ports::DECLARED_BIT_SLOT as usize]
            );
            assert_eq!(courier.memory, [0; 4]);
            assert_eq!(courier.program, ports::courier_program());
            assert_eq!(requester.program, ports::requester_program());
            assert_eq!(
                courier.position,
                world
                    .depots
                    .iter()
                    .find(|entry| entry.id == lane.depot)
                    .unwrap()
                    .position
            );
            let relay = world
                .cells
                .iter()
                .find(|entry| entry.id == lane.relay)
                .unwrap();
            assert_eq!(relay.program, fixtures::relay_program());
            let mut keeper = world
                .cells
                .iter()
                .find(|entry| entry.id == lane.keeper)
                .unwrap()
                .program
                .clone();
            for rule in &mut keeper.rules {
                if let Action::Route { valve, .. } = &mut rule.action {
                    *valve = fixtures::VALVE;
                }
            }
            assert_eq!(keeper, construction_fixtures::child_program());
        }
    }
}

#[test]
fn custody_transition_cannot_be_an_initial_empty_dock_or_failed_drop() {
    let program = ports::courier_program();
    let drops: Vec<_> = program
        .rules
        .iter()
        .filter(|rule| rule.action == Action::Drop)
        .collect();
    assert_eq!(drops.len(), 1);
    assert!(drops[0].remember.is_none());
    assert!(drops[0].when.contains(&Condition::Carrying { value: true }));
    let custody = program
        .rules
        .iter()
        .find(|rule| {
            rule.action
                == Action::WriteMemory {
                    slot: ports::COURIER_PHASE_SLOT,
                    value: ports::PHASE_CUSTODY,
                }
        })
        .unwrap();
    assert!(custody.when.contains(&Condition::Memory {
        slot: ports::COURIER_PHASE_SLOT,
        value: ports::PHASE_RETURNING,
    }));
    assert!(custody.when.contains(&Condition::AtDepot { value: true }));
    assert!(custody.when.contains(&Condition::Carrying { value: false }));
    let done = program
        .rules
        .iter()
        .find(|rule| {
            rule.remember
                == Some(MemoryWrite {
                    slot: ports::COURIER_PHASE_SLOT,
                    value: ports::PHASE_DONE,
                })
        })
        .unwrap();
    assert_eq!(
        done.action,
        Action::TakeMessage {
            port: 1,
            slot: ports::COURIER_RECEIPT_SLOT
        }
    );
    assert!(done.when.contains(&Condition::Memory {
        slot: ports::COURIER_PHASE_SLOT,
        value: ports::PHASE_CUSTODY
    }));
    assert_eq!(
        program.rules[0].when,
        vec![Condition::Memory {
            slot: ports::COURIER_PHASE_SLOT,
            value: ports::PHASE_DONE,
        }]
    );
    assert_eq!(
        program.rules[0].action,
        Action::Send {
            port: 0,
            bit: BitSource::Memory {
                slot: ports::COURIER_RECEIPT_SLOT
            },
        }
    );
}

#[test]
fn loss_and_duplicates_are_explicit_local_channels_not_unmetered_injection() {
    for (id, requests, reopen) in [
        ("ports-request-loss", true, 18),
        ("ports-ack-loss", false, 48),
    ] {
        let world = ports::experiment(id).unwrap();
        assert_eq!(world.events.len(), 4);
        for lane in ports::LANES {
            let id = if requests {
                lane.request_links[1]
            } else {
                lane.ack_links[1]
            };
            assert!(world.events.contains(&Event {
                tick: 1,
                event: EventKind::LinkEnabled { id, enabled: false }
            }));
            assert!(world.events.contains(&Event {
                tick: reopen,
                event: EventKind::LinkEnabled { id, enabled: true }
            }));
        }
    }
    for (id, requests) in [
        ("ports-duplicate-requests", true),
        ("ports-duplicate-acks", false),
    ] {
        let world = ports::experiment(id).unwrap();
        assert!(world.events.is_empty());
        for lane in ports::LANES {
            let duplicate_id = if requests {
                lane.duplicate_request
            } else {
                lane.duplicate_ack
            };
            let ordinary_id = if requests {
                lane.request_links[1]
            } else {
                lane.ack_links[1]
            };
            let duplicate = world
                .links
                .iter()
                .find(|entry| entry.id == duplicate_id)
                .unwrap();
            let ordinary = world
                .links
                .iter()
                .find(|entry| entry.id == ordinary_id)
                .unwrap();
            assert!(duplicate.enabled);
            assert_eq!(duplicate.delay, 16);
            assert_eq!(ordinary.delay, 2);
            assert_eq!(duplicate.from, ordinary.from);
            assert_eq!(duplicate.to_cell, ordinary.to_cell);
            assert_eq!(duplicate.to_port, ordinary.to_port);
        }
    }
}

#[test]
fn a_full_depot_keeps_the_parcel_and_return_phase_until_drop_really_succeeds() {
    struct ExecutionCount;
    impl Drop for ExecutionCount {
        fn drop(&mut self) {
            eprintln!(
                "ports-fixture-engine-executions={}",
                platonik_core::sim::execution_count()
            );
        }
    }
    let _execution_count = ExecutionCount;
    let mut world = ports::experiment("ports-clear-zero-one").unwrap();
    let lane = ports::LANES[0];
    let blocker = Spark {
        id: 999,
        bit: false,
    };
    let start = Point { x: 5, y: 2 };
    world.walls.retain(|point| *point != start);
    world.sources.push(Source {
        id: 14,
        position: start,
        sparks: vec![blocker],
    });
    let rule = |when, action| Rule {
        when,
        action,
        remember: None,
    };
    world.cells.push(Cell {
        id: 14,
        position: start,
        heading: Direction::South,
        mobile: true,
        memory: [0; 4],
        program: Program {
            rules: vec![
                rule(vec![Condition::Memory { slot: 0, value: 1 }], Action::Wait),
                rule(
                    vec![
                        Condition::AtDepot { value: true },
                        Condition::Carrying { value: true },
                    ],
                    Action::Drop,
                ),
                Rule {
                    when: vec![
                        Condition::AtDepot { value: true },
                        Condition::Carrying { value: false },
                    ],
                    action: Action::Move {
                        direction: Relative::Back,
                    },
                    remember: Some(MemoryWrite { slot: 0, value: 1 }),
                },
                rule(
                    vec![
                        Condition::AtSource { value: true },
                        Condition::Carrying { value: false },
                    ],
                    Action::Pickup,
                ),
                rule(
                    vec![Condition::AtBeacon { value: true }],
                    Action::Move {
                        direction: Relative::Right,
                    },
                ),
                rule(
                    vec![],
                    Action::Move {
                        direction: Relative::Forward,
                    },
                ),
            ],
        },
    });
    world.events.extend([
        Event {
            tick: 1,
            event: EventKind::ValveEnabled {
                id: lane.valve,
                enabled: false,
            },
        },
        Event {
            tick: 20,
            event: EventKind::ValveEnabled {
                id: lane.valve,
                enabled: true,
            },
        },
    ]);
    validate_experiment(&world).unwrap();
    let receipt = platonik_core::check::make_receipt(&world).unwrap();
    platonik_core::check::verify_receipt(&receipt).unwrap();
    assert_eq!(receipt.result.status, RunStatus::Complete);
    let required = Spark {
        id: lane.parcel,
        bit: false,
    };
    let failed: Vec<_> = receipt
        .result
        .frames
        .iter()
        .filter(|frame| {
            frame.activations.iter().any(|action| {
                action.cell == lane.courier
                    && action.action == Action::Drop
                    && action.error.as_deref() == Some("depot_full")
            })
        })
        .collect();
    assert!(
        failed.len() >= 2,
        "The test must exercise repeated real full-depot failures."
    );
    assert!(failed[0].tick < 20);
    for frame in &failed {
        let courier = frame
            .state
            .cells
            .iter()
            .find(|cell| cell.id == lane.courier)
            .unwrap();
        assert_eq!(courier.cargo, Some(required));
        assert_eq!(
            courier.memory[ports::COURIER_PHASE_SLOT as usize],
            ports::PHASE_RETURNING
        );
        assert_eq!(
            receipt.result.frames[(frame.tick - 1) as usize]
                .state
                .depots
                .iter()
                .find(|depot| depot.id == lane.depot)
                .unwrap()
                .sparks,
            vec![blocker]
        );
    }
    let accepted = receipt
        .result
        .frames
        .iter()
        .find(|frame| {
            frame.activations.iter().any(|action| {
                action.cell == lane.courier && action.action == Action::Drop && action.success
            })
        })
        .unwrap()
        .tick;
    assert!((20..=22).contains(&accepted));
    assert!(failed.last().unwrap().tick < accepted);
    let sender = Endpoint::Cell {
        id: lane.courier,
        port: 0,
    };
    assert!(
        receipt
            .result
            .frames
            .iter()
            .filter(|frame| frame.tick <= accepted)
            .all(|frame| {
                frame
                    .signals
                    .iter()
                    .all(|event| event.signal.from != sender)
            }),
        "No acknowledgment attempt is permitted before actual custody."
    );
    let ack = receipt
        .result
        .frames
        .iter()
        .flat_map(|frame| &frame.signals)
        .find(|event| event.signal.from == sender && event.outcome == "queued")
        .unwrap();
    assert!(ack.signal.sent_tick > accepted);
    assert_eq!(ack.signal.receipt_spark, Some(lane.parcel));
    assert!(
        receipt
            .result
            .final_state
            .delivered
            .iter()
            .any(|delivery| delivery.spark == blocker)
    );
    assert!(
        receipt
            .result
            .final_state
            .delivered
            .iter()
            .any(|delivery| delivery.spark == required)
    );
    assert_eq!(
        world
            .cells
            .iter()
            .find(|cell| cell.id == lane.courier)
            .unwrap()
            .program,
        ports::courier_program()
    );
}
