use platonik_core::{
    check, construction,
    continuation::{self, Advance},
    model::*,
    run, validate_experiment,
};

fn rule(when: Vec<Condition>, action: Action) -> Rule {
    Rule {
        when,
        action,
        remember: None,
    }
}
fn world(bit: bool) -> Experiment {
    let mut initial_send = rule(
        vec![Condition::Memory { slot: 3, value: 0 }],
        Action::Send {
            port: 0,
            bit: BitSource::Constant { value: bit },
        },
    );
    initial_send.remember = Some(MemoryWrite { slot: 3, value: 1 });
    Experiment {
        version: CONSTRUCTION_VERSION,
        seed: 17,
        width: 5,
        height: 5,
        walls: vec![],
        sources: vec![],
        depots: vec![],
        valves: vec![],
        links: vec![],
        events: vec![],
        cells: vec![Cell {
            id: 1,
            position: Point { x: 1, y: 1 },
            heading: Direction::East,
            mobile: false,
            memory: [0; 4],
            program: Program {
                rules: vec![
                    initial_send,
                    rule(
                        vec![Condition::AssemblyStage {
                            blueprint: 7,
                            stage: AssemblyStage::Born,
                        }],
                        Action::Send {
                            port: 0,
                            bit: BitSource::Constant { value: bit },
                        },
                    ),
                    rule(
                        vec![Condition::AssemblyStage {
                            blueprint: 7,
                            stage: AssemblyStage::Ready,
                        }],
                        Action::Activate { blueprint: 7 },
                    ),
                    rule(
                        vec![
                            Condition::AssemblyStage {
                                blueprint: 7,
                                stage: AssemblyStage::Absent,
                            },
                            Condition::HasMaterial { value: false },
                        ],
                        Action::GatherMaterial { stock: 8 },
                    ),
                    rule(vec![], Action::Build { blueprint: 7 }),
                ],
            },
        }],
        beacons: vec![Beacon {
            id: 9,
            position: Point { x: 4, y: 4 },
            accepts: false,
            initial_charge: 100,
            drain_every: 1,
            drain_amount: 1,
            spark_charge: 1,
            required_deliveries: 0,
        }],
        ticks: 28,
        fuel: MAX_FUEL,
        activation_fuel: 128,
        construction: Some(ConstructionSpec {
            stocks: vec![MaterialStock {
                id: 8,
                position: Point { x: 1, y: 1 },
                units: vec![91],
            }],
            blueprints: vec![Blueprint {
                id: 7,
                body: BlueprintBody {
                    cell: Cell {
                        id: 2,
                        position: Point { x: 2, y: 1 },
                        heading: Direction::East,
                        mobile: false,
                        memory: [0; 4],
                        program: Program {
                            rules: vec![
                                rule(
                                    vec![Condition::HasMessage {
                                        port: 0,
                                        value: true,
                                    }],
                                    Action::TakeMessage { port: 0, slot: 0 },
                                ),
                                rule(vec![], Action::Wait),
                            ],
                        },
                    },
                    links: vec![Link {
                        id: 5,
                        from: Endpoint::Cell { id: 1, port: 0 },
                        to_cell: 2,
                        to_port: 0,
                        delay: 1,
                        enabled: true,
                    }],
                },
            }],
        }),
        facilities: Vec::new(),
    }
}

#[test]
fn exact_copy_inactive_wires_next_tick_child_and_fresh_local_signal() {
    for bit in [false, true] {
        let experiment = world(bit);
        let result = run(&experiment).unwrap();
        check::validate_result(&experiment, &result).unwrap();
        assert_eq!(result.status, RunStatus::Complete);
        let bytes = construction::payload(&experiment.construction.as_ref().unwrap().blueprints[0])
            .unwrap();
        let birth = &result.final_state.construction.as_ref().unwrap().births[0];
        assert_eq!(birth.tick, 4 + bytes.len().div_ceil(COPY_BYTES) as u32);
        assert_eq!(result.costs.copying, bytes.len() as u64);
        assert_eq!(result.costs.construction, 3); // placement, one wire, activation
        assert!(result.frames[1].signals.is_empty()); // no link existed for the early Send
        assert_eq!(
            result.frames[1].activations[0].error.as_deref(),
            Some("no_signal_queued")
        );
        let mut previous = 0;
        let mut saw_wired_inactive = false;
        for frame in &result.frames {
            let state = frame.state.construction.as_ref().unwrap();
            if let Some(assembly) = state.assemblies.first() {
                assert_eq!(assembly.copied, bytes[..assembly.copied.len()]);
                assert!(assembly.copied.len() - previous <= COPY_BYTES);
                previous = assembly.copied.len();
                assert!(frame.state.cells.iter().all(|cell| cell.id != 2));
                assert!(frame.state.links.is_empty());
                saw_wired_inactive |= !assembly.wired.is_empty();
            }
            if frame.tick <= birth.tick {
                assert!(
                    frame
                        .activations
                        .iter()
                        .all(|activation| activation.cell != 2)
                );
            }
        }
        assert!(saw_wired_inactive);
        assert!(
            result.frames[(birth.tick + 1) as usize]
                .activations
                .iter()
                .any(|activation| activation.cell == 2)
        );
        let signal = result
            .frames
            .iter()
            .flat_map(|frame| &frame.signals)
            .find(|entry| entry.outcome == "consumed")
            .unwrap();
        assert!(signal.signal.sent_tick > birth.tick);
        assert_eq!(signal.signal.deliver_tick, signal.signal.sent_tick + 1);
        assert_eq!(
            result
                .final_state
                .cells
                .iter()
                .find(|cell| cell.id == 2)
                .unwrap()
                .memory[0],
            u8::from(bit)
        );
        assert_eq!(birth.material, 91);
        assert!(
            result.final_state.construction.as_ref().unwrap().stocks[0]
                .units
                .is_empty()
        );
        assert!(
            result
                .final_state
                .cells
                .iter()
                .all(|cell| cell.material.is_none())
        );
    }
}

#[test]
fn every_complete_cut_replays_copy_wiring_birth_and_child_state_exactly() {
    let experiment = world(true);
    let cold = run(&experiment).unwrap();
    for tick in 0..experiment.ticks {
        let Advance::Paused(checkpoint) = continuation::start_until(&experiment, tick).unwrap()
        else {
            panic!("expected complete prefix at {tick}");
        };
        let text = serde_json::to_string(&checkpoint).unwrap();
        let restored = continuation::parse_checkpoint(&text).unwrap();
        let Advance::Finished(resumed) =
            continuation::resume_until(&restored, experiment.ticks).unwrap()
        else {
            panic!("expected terminal result");
        };
        assert_eq!(cold, resumed, "continuation at tick {tick}");
    }
}

#[test]
fn failed_material_placement_and_activation_preserve_world_resources() {
    let mut empty = world(false);
    empty.construction.as_mut().unwrap().stocks[0].units.clear();
    let result = run(&empty).unwrap();
    assert!(
        result
            .final_state
            .construction
            .as_ref()
            .unwrap()
            .births
            .is_empty()
    );
    assert_eq!(result.costs.copying, 0);
    assert!(
        result
            .frames
            .iter()
            .flat_map(|frame| &frame.activations)
            .any(|activation| activation.error.as_deref() == Some("material_stock_empty"))
    );
    check::validate_result(&empty, &result).unwrap();

    let mut occupied = world(false);
    occupied.cells.push(Cell {
        id: 3,
        position: Point { x: 2, y: 1 },
        heading: Direction::East,
        mobile: false,
        memory: [0; 4],
        program: Program {
            rules: vec![rule(vec![], Action::Wait)],
        },
    });
    let result = run(&occupied).unwrap();
    assert_eq!(result.final_state.cells[0].material, Some(91));
    assert!(
        result
            .final_state
            .construction
            .as_ref()
            .unwrap()
            .assemblies
            .is_empty()
    );
    assert_eq!(result.costs.copying, 0);
    assert!(
        result
            .frames
            .iter()
            .flat_map(|frame| &frame.activations)
            .any(|activation| activation.error.as_deref() == Some("construction_target_occupied"))
    );
    check::validate_result(&occupied, &result).unwrap();

    let mut premature = world(false);
    premature.cells[0].program = Program {
        rules: vec![rule(vec![], Action::Activate { blueprint: 7 })],
    };
    let result = run(&premature).unwrap();
    assert!(
        result
            .final_state
            .construction
            .as_ref()
            .unwrap()
            .births
            .is_empty()
    );
    assert_eq!(
        result.final_state.construction.as_ref().unwrap().stocks[0].units,
        [91]
    );
    assert!(
        result
            .frames
            .iter()
            .skip(1)
            .all(|frame| frame.activations[0].error.as_deref() == Some("assembly_missing"))
    );
}

#[test]
fn fuel_and_activation_cuts_roll_back_partial_copy_but_keep_spent_work() {
    let experiment = world(false);
    let reference = run(&experiment).unwrap();
    let first_copy = reference.frames[3]
        .activations
        .iter()
        .find(|activation| matches!(activation.action, Action::Build { .. }))
        .unwrap();
    for remaining in 0..(first_copy.work_after - first_copy.work_before) {
        let mut trial = experiment.clone();
        // Fuel digit count changes loading. Calibrate against its own loaded
        // input and two complete ticks without executing the target action.
        trial.fuel = 100_000;
        let Advance::Paused(prefix) = continuation::start_until(&trial, 2).unwrap() else {
            panic!()
        };
        let base = prefix.frames.last().unwrap().costs.total();
        trial.fuel = base + 1 + remaining; // one tick scheduling before activation
        let digit_delta = serde_json::to_vec(&trial).unwrap().len() as i64
            - serde_json::to_vec(&{
                let mut copy = trial.clone();
                copy.fuel = 100_000;
                copy
            })
            .unwrap()
            .len() as i64;
        trial.fuel = (trial.fuel as i64 + digit_delta) as u64;
        let result = run(&trial).unwrap();
        assert_eq!(result.status, RunStatus::FuelExhausted);
        assert!(
            result
                .final_state
                .construction
                .as_ref()
                .unwrap()
                .assemblies
                .is_empty()
        );
        assert_eq!(result.final_state.cells[0].material, Some(91));
        assert_eq!(result.costs.total(), trial.fuel);
        check::validate_result(&trial, &result).unwrap();
    }
    let mut limited = experiment.clone();
    limited.activation_fuel = 30;
    let result = run(&limited).unwrap();
    assert_eq!(result.status, RunStatus::ActivationLimit);
    assert!(result.costs.copying > 0);
    assert!(
        result
            .final_state
            .construction
            .as_ref()
            .unwrap()
            .assemblies
            .is_empty()
    );
    assert_eq!(result.final_state.cells[0].material, Some(91));
    check::validate_result(&limited, &result).unwrap();
}

#[test]
fn reservation_blocks_movement_and_born_body_uses_its_own_mobile_policy() {
    let mut experiment = world(false);
    experiment.construction.as_mut().unwrap().blueprints[0]
        .body
        .cell
        .mobile = true;
    experiment.construction.as_mut().unwrap().blueprints[0]
        .body
        .cell
        .program = Program {
        rules: vec![rule(
            vec![],
            Action::Move {
                direction: Relative::Forward,
            },
        )],
    };
    let result = run(&experiment).unwrap();
    let birth_tick = result.final_state.construction.as_ref().unwrap().births[0].tick;
    assert_eq!(
        result.frames[(birth_tick + 1) as usize]
            .state
            .cells
            .iter()
            .find(|cell| cell.id == 2)
            .unwrap()
            .position,
        Point { x: 3, y: 1 }
    );
    let staged = result
        .frames
        .iter()
        .find(|frame| {
            !frame
                .state
                .construction
                .as_ref()
                .unwrap()
                .assemblies
                .is_empty()
        })
        .unwrap();
    assert!(platonik_core::policy::blocked(
        &experiment,
        &staged.state,
        0,
        Relative::Forward
    ));
    check::validate_result(&experiment, &result).unwrap();
}

#[test]
fn schema_caps_and_version_gates_preserve_legacy_bytes() {
    let mut experiment = world(false);
    experiment.version = HAZARD_VERSION;
    assert!(validate_experiment(&experiment).is_err());
    experiment.version = CONSTRUCTION_VERSION;
    experiment.construction.as_mut().unwrap().stocks[0].units = vec![1, 1];
    assert!(validate_experiment(&experiment).is_err());
    experiment.construction.as_mut().unwrap().stocks[0].units = (0..33).collect();
    assert!(validate_experiment(&experiment).is_err());
    experiment.construction.as_mut().unwrap().stocks[0].units = vec![91];
    experiment.construction.as_mut().unwrap().blueprints[0]
        .body
        .cell
        .id = 1;
    assert!(validate_experiment(&experiment).is_err());
    let legacy = platonik_core::fixtures::experiment("ark-plan-a").unwrap();
    let json = serde_json::to_value(run(&legacy).unwrap()).unwrap();
    assert!(json["costs"].get("copying").is_none());
    assert!(json["costs"].get("construction").is_none());
    assert!(json["final_state"].get("construction").is_none());
    assert!(json["final_state"]["cells"][0].get("material").is_none());
    assert!(
        serde_json::to_value(&legacy)
            .unwrap()
            .get("construction")
            .is_none()
    );
}

#[test]
fn competing_parents_cannot_steal_escrow_and_a_born_builder_uses_the_same_vm() {
    let mut competing = world(false);
    let mut other = competing.cells[0].clone();
    other.id = 3;
    other.position = Point { x: 2, y: 2 };
    for rule in &mut other.program.rules {
        if matches!(rule.action, Action::GatherMaterial { .. }) {
            rule.action = Action::GatherMaterial { stock: 9 };
        }
    }
    competing.cells.push(other);
    competing
        .construction
        .as_mut()
        .unwrap()
        .stocks
        .push(MaterialStock {
            id: 9,
            position: Point { x: 2, y: 2 },
            units: vec![92],
        });
    let result = run(&competing).unwrap();
    assert!(
        result
            .frames
            .iter()
            .flat_map(|frame| &frame.activations)
            .any(|activation| activation.error.as_deref() == Some("assembly_owned_by_other"))
    );
    assert_eq!(
        result
            .final_state
            .construction
            .as_ref()
            .unwrap()
            .births
            .len(),
        1
    );
    assert_eq!(
        result
            .final_state
            .cells
            .iter()
            .filter(|cell| cell.material.is_some())
            .count(),
        1
    );
    check::validate_result(&competing, &result).unwrap();

    let mut recursive = world(false);
    recursive.ticks = 64;
    let builder = recursive.cells[0].program.clone();
    let spec = recursive.construction.as_mut().unwrap();
    spec.stocks.push(MaterialStock {
        id: 9,
        position: Point { x: 2, y: 1 },
        units: vec![92],
    });
    let mut next_builder = builder;
    next_builder.rules.remove(0); // no unrelated initial signal attempt
    for rule in &mut next_builder.rules {
        for condition in &mut rule.when {
            if let Condition::AssemblyStage { blueprint, .. } = condition {
                *blueprint = 8;
            }
        }
        match &mut rule.action {
            Action::Build { blueprint } | Action::Activate { blueprint } => *blueprint = 8,
            Action::GatherMaterial { stock } => *stock = 9,
            Action::Send { .. } => rule.action = Action::Wait,
            _ => {}
        }
    }
    spec.blueprints[0].body.cell.program = next_builder;
    spec.blueprints.push(Blueprint {
        id: 8,
        body: BlueprintBody {
            cell: Cell {
                id: 3,
                position: Point { x: 3, y: 1 },
                heading: Direction::East,
                mobile: false,
                memory: [0; 4],
                program: Program {
                    rules: vec![rule(vec![], Action::WriteMemory { slot: 2, value: 77 })],
                },
            },
            links: vec![],
        },
    });
    let result = run(&recursive).unwrap();
    assert_eq!(result.status, RunStatus::Complete);
    let births = &result.final_state.construction.as_ref().unwrap().births;
    assert_eq!(births.len(), 2);
    assert_eq!(births[0].parent, 1);
    assert_eq!(births[1].parent, 2);
    assert!(births[1].tick > births[0].tick);
    assert_eq!(
        result
            .final_state
            .cells
            .iter()
            .find(|cell| cell.id == 3)
            .unwrap()
            .memory[2],
        77
    );
    check::validate_result(&recursive, &result).unwrap();
}
