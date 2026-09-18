use platonik_core::{check, continuation, model::*, run};

fn rule(when: Vec<Condition>, action: Action) -> Rule {
    Rule {
        when,
        action,
        remember: None,
    }
}

fn world() -> Experiment {
    let builder = Program {
        rules: vec![
            rule(
                vec![Condition::AssemblyStage {
                    blueprint: 7,
                    stage: AssemblyStage::Born,
                }],
                Action::Wait,
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
    };
    Experiment {
        version: CONSTRUCTION_VERSION,
        seed: 19,
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
            program: builder,
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
        ticks: 24,
        fuel: MAX_FUEL,
        activation_fuel: 1024,
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
                            rules: vec![rule(vec![], Action::Wait)],
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
fn independent_checker_rejects_unearned_construction_even_with_rehashed_receipts() {
    let experiment = world();
    let receipt = check::make_receipt(&experiment).unwrap();
    check::verify_receipt(&receipt).unwrap();
    let birth = receipt
        .result
        .final_state
        .construction
        .as_ref()
        .unwrap()
        .births[0]
        .tick as usize;
    let mut variants = vec![];
    let mut modified = receipt.clone();
    modified.result.frames[2]
        .state
        .construction
        .as_mut()
        .unwrap()
        .assemblies[0]
        .copied[0] ^= 1;
    variants.push(modified);
    let mut modified = receipt.clone();
    let bytes =
        serde_json::to_vec(&experiment.construction.as_ref().unwrap().blueprints[0].body).unwrap();
    modified.result.frames[2]
        .state
        .construction
        .as_mut()
        .unwrap()
        .assemblies[0]
        .copied = bytes[..64].to_vec();
    variants.push(modified);
    let mut modified = receipt.clone();
    modified.result.frames[2]
        .state
        .construction
        .as_mut()
        .unwrap()
        .stocks[0]
        .units
        .push(91);
    variants.push(modified);
    let mut modified = receipt.clone();
    modified.result.frames[birth]
        .state
        .construction
        .as_mut()
        .unwrap()
        .births[0]
        .tick -= 1;
    variants.push(modified);
    let mut modified = receipt.clone();
    modified.result.frames[birth]
        .state
        .construction
        .as_mut()
        .unwrap()
        .births[0]
        .body
        .cell
        .memory[0] = 1;
    variants.push(modified);
    let mut modified = receipt.clone();
    let activation = modified.result.frames[birth]
        .activations
        .iter_mut()
        .find(|action| matches!(action.action, Action::Activate { .. }))
        .unwrap();
    activation.success = false;
    activation.error = Some("no_material".into());
    variants.push(modified);
    let mut modified = receipt.clone();
    let early = modified.result.frames[birth + 1]
        .activations
        .iter()
        .find(|action| action.cell == 2)
        .unwrap()
        .clone();
    modified.result.frames[birth].activations.push(early);
    variants.push(modified);
    let mut modified = receipt.clone();
    modified.result.frames[birth].state.links[0].enabled = false;
    variants.push(modified);
    for mut modified in variants {
        modified.result_hash = check::artifact_hash(&modified.result).unwrap();
        assert!(
            check::validate_result(&modified.experiment, &modified.result).is_err(),
            "Independent checker accepted an unearned construction transition"
        );
        assert!(check::verify_receipt(&modified).is_err());
    }
}

#[test]
fn every_construction_cut_preserves_exact_bytes_and_forged_partial_prefix_is_rejected() {
    let experiment = world();
    let cold = run(&experiment).unwrap();
    let birth = cold.final_state.construction.as_ref().unwrap().births[0].tick;
    for cut in 0..=birth + 1 {
        let continuation::Advance::Paused(checkpoint) =
            continuation::start_until(&experiment, cut).unwrap()
        else {
            panic!("expected partial prefix")
        };
        let serialized = serde_json::to_string(&checkpoint).unwrap();
        let restored = continuation::parse_checkpoint(&serialized).unwrap();
        let continuation::Advance::Finished(resumed) =
            continuation::resume_until(&restored, experiment.ticks).unwrap()
        else {
            panic!("expected completed horizon")
        };
        assert_eq!(
            serde_json::to_vec(&resumed).unwrap(),
            serde_json::to_vec(&cold).unwrap()
        );
    }
    let continuation::Advance::Paused(mut checkpoint) =
        continuation::start_until(&experiment, 2).unwrap()
    else {
        panic!("expected construction prefix")
    };
    checkpoint.frames[2]
        .state
        .construction
        .as_mut()
        .unwrap()
        .assemblies[0]
        .copied
        .pop();
    checkpoint.prefix_hash = check::artifact_hash(&checkpoint.frames).unwrap();
    assert!(check::validate_prefix(&experiment, &checkpoint.frames).is_err());
    assert!(continuation::verify_checkpoint(&checkpoint).is_err());
}
