use platonik_core::{check, continuation, model::*};

static ENGINE_TEST: std::sync::Mutex<()> = std::sync::Mutex::new(());
struct Engines {
    name: &'static str,
    before: u64,
    expected: u64,
    _guard: std::sync::MutexGuard<'static, ()>,
}
impl Engines {
    fn new(name: &'static str, expected: u64) -> Self {
        let guard = ENGINE_TEST.lock().unwrap();
        Self {
            name,
            before: platonik_core::sim::execution_count(),
            expected,
            _guard: guard,
        }
    }
}
impl Drop for Engines {
    fn drop(&mut self) {
        let actual = platonik_core::sim::execution_count() - self.before;
        eprintln!(
            "variation_check_engine_count test={} actual={} expected={} panicking={}",
            self.name,
            actual,
            self.expected,
            std::thread::panicking()
        );
        if !std::thread::panicking() {
            assert_eq!(actual, self.expected);
        }
    }
}

fn rule(when: Vec<Condition>, action: Action) -> Rule {
    Rule {
        when,
        action,
        remember: None,
    }
}

fn world() -> Experiment {
    let stage = |stage| Condition::AssemblyStage {
        blueprint: 7,
        stage,
    };
    Experiment {
        version: VARIATION_VERSION,
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
            memory: [1, 2, 0, 0],
            program: Program {
                rules: vec![
                    rule(vec![stage(AssemblyStage::Born)], Action::Wait),
                    rule(
                        vec![
                            stage(AssemblyStage::Ready),
                            Condition::AssemblyEdits {
                                blueprint: 7,
                                count: 1,
                            },
                        ],
                        Action::Activate { blueprint: 7 },
                    ),
                    rule(
                        vec![stage(AssemblyStage::Ready)],
                        Action::EditDirection {
                            blueprint: 7,
                            rule: 0,
                            slot: 0,
                        },
                    ),
                    rule(
                        vec![
                            stage(AssemblyStage::Absent),
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
        ticks: 32,
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
                            rules: vec![rule(
                                vec![],
                                Action::Turn {
                                    direction: Relative::Forward,
                                },
                            )],
                        },
                    },
                    links: vec![],
                },
            }],
        }),
        facilities: Vec::new(),
    }
}

fn rehash(receipt: &mut check::Receipt) {
    receipt.result_hash = check::artifact_hash(&receipt.result).unwrap();
}

fn edit_tick(receipt: &check::Receipt) -> usize {
    receipt
        .result
        .final_state
        .construction
        .as_ref()
        .unwrap()
        .births[0]
        .edits[0]
        .tick as usize
}

#[test]
fn independent_checker_reconstructs_changed_body_and_charges_a_shorter_operand() {
    let _engines = Engines::new("shorter_operand", 2);
    let receipt = check::make_receipt(&world()).unwrap();
    let birth = &receipt
        .result
        .final_state
        .construction
        .as_ref()
        .unwrap()
        .births[0];
    let seed = &receipt.experiment.construction.as_ref().unwrap().blueprints[0].body;
    assert_eq!(birth.edits.len(), 1);
    assert_eq!(
        birth.edits[0].before_hash,
        check::artifact_hash(seed).unwrap()
    );
    assert_eq!(
        birth.edits[0].after_hash,
        check::artifact_hash(&birth.body).unwrap()
    );
    assert_eq!(
        birth.body.cell.program.rules[0].action,
        Action::Turn {
            direction: Relative::Left
        }
    );
    let seed_bytes = serde_json::to_vec(seed).unwrap().len() as u64;
    let rewritten = u64::from(birth.edits[0].bytes_written);
    assert!(rewritten < seed_bytes);
    assert_eq!(receipt.result.costs.copying, seed_bytes + rewritten);
    check::verify_receipt(&receipt).unwrap();
}

#[test]
fn independent_checker_rejects_rehashed_edit_history_forgery_without_running_it() {
    let _engines = Engines::new("rehashed_history", 1);
    let receipt = check::make_receipt(&world()).unwrap();
    let tick = edit_tick(&receipt);
    let mut variants = vec![];
    for field in 0..8 {
        let mut modified = receipt.clone();
        let assembly = &mut modified.result.frames[tick]
            .state
            .construction
            .as_mut()
            .unwrap()
            .assemblies[0];
        let edit = &mut assembly.edits[0];
        match field {
            0 => edit.actor = 2,
            1 => edit.tick -= 1,
            2 => edit.slot = 4,
            3 => edit.rule = 31,
            4 => edit.value = 0,
            5 => edit.before_hash = edit.after_hash.clone(),
            6 => edit.after_hash = edit.before_hash.clone(),
            7 => edit.bytes_written -= 1,
            _ => unreachable!(),
        }
        variants.push(modified);
    }
    let mut modified = receipt.clone();
    modified.result.frames[tick]
        .state
        .construction
        .as_mut()
        .unwrap()
        .assemblies[0]
        .edits
        .clear();
    variants.push(modified);
    let mut modified = receipt.clone();
    let action = modified.result.frames[tick]
        .activations
        .iter_mut()
        .find(|activation| matches!(activation.action, Action::EditDirection { .. }))
        .unwrap();
    action.success = false;
    action.error = Some("assembly_incomplete".into());
    variants.push(modified);
    for mut modified in variants {
        rehash(&mut modified);
        assert!(
            check::validate_result(&modified.experiment, &modified.result).is_err(),
            "Independent effect validation admitted an invented edit history"
        );
    }
}

#[test]
fn locally_consistent_edit_hashes_cannot_replace_the_observed_register_value() {
    let _engines = Engines::new("observed_register", 1);
    let receipt = check::make_receipt(&world()).unwrap();
    let tick = edit_tick(&receipt);
    let mut frames = receipt.result.frames[..=tick].to_vec();
    let assembly = &mut frames[tick].state.construction.as_mut().unwrap().assemblies[0];
    let mut body: BlueprintBody = serde_json::from_slice(&assembly.copied).unwrap();
    body.cell.program.rules[0].action = Action::Turn {
        direction: Relative::Right,
    };
    assembly.copied = serde_json::to_vec(&body).unwrap();
    assembly.edits[0].value = 2;
    assembly.edits[0].after_hash = check::artifact_hash(&body).unwrap();
    assembly.edits[0].bytes_written = assembly.copied.len() as u32;
    let checkpoint = continuation::Checkpoint {
        schema: continuation::CHECKPOINT_SCHEMA.into(),
        experiment_hash: receipt.experiment_hash.clone(),
        prefix_hash: check::artifact_hash(&frames).unwrap(),
        experiment: receipt.experiment.clone(),
        frames,
    };
    assert!(check::validate_prefix(&checkpoint.experiment, &checkpoint.frames).is_err());
    assert!(continuation::parse_checkpoint(&serde_json::to_string(&checkpoint).unwrap()).is_err());
}

#[test]
fn independent_checker_rejects_reclassifying_committed_rewrite_work() {
    let _engines = Engines::new("rewrite_work", 1);
    let mut receipt = check::make_receipt(&world()).unwrap();
    let tick = edit_tick(&receipt);
    let amount = u64::from(
        receipt
            .result
            .final_state
            .construction
            .as_ref()
            .unwrap()
            .births[0]
            .edits[0]
            .bytes_written,
    );
    for frame in &mut receipt.result.frames[tick..] {
        frame.costs.copying -= amount;
        frame.costs.checking += amount;
    }
    receipt.result.costs.copying -= amount;
    receipt.result.costs.checking += amount;
    rehash(&mut receipt);
    assert!(check::validate_result(&receipt.experiment, &receipt.result).is_err());
}
