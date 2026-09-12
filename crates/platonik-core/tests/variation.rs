use platonik_core::{check, construction, continuation, model::*, run, validate_experiment};

// Serialize this binary's engine accounting even when the aggregate uses parallel tests.
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
            "variation_engine_count test={} actual={} expected={} panicking={}",
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
fn stage(stage: AssemblyStage) -> Condition {
    Condition::AssemblyStage {
        blueprint: 7,
        stage,
    }
}
fn count(count: u8) -> Condition {
    Condition::AssemblyEdits {
        blueprint: 7,
        count,
    }
}
fn world() -> Experiment {
    Experiment {
        version: VARIATION_VERSION,
        seed: 23,
        width: 5,
        height: 5,
        walls: vec![],
        sources: vec![],
        depots: vec![],
        valves: vec![],
        links: vec![],
        events: vec![],
        beacons: vec![Beacon {
            id: 1,
            position: Point { x: 4, y: 4 },
            accepts: false,
            initial_charge: 100,
            drain_every: 1,
            drain_amount: 1,
            spark_charge: 1,
            required_deliveries: 0,
        }],
        cells: vec![Cell {
            id: 1,
            position: Point { x: 1, y: 1 },
            heading: Direction::East,
            mobile: false,
            memory: [1, 0, 0, 0],
            program: Program {
                rules: vec![
                    rule(
                        vec![stage(AssemblyStage::Ready), count(0)],
                        Action::EditDirection {
                            blueprint: 7,
                            rule: 0,
                            slot: 0,
                        },
                    ),
                    rule(
                        vec![stage(AssemblyStage::Ready), count(1)],
                        Action::Activate { blueprint: 7 },
                    ),
                    rule(vec![stage(AssemblyStage::Born)], Action::Wait),
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
        ticks: 24,
        fuel: 100_000,
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
                        mobile: true,
                        memory: [0; 4],
                        program: Program {
                            rules: vec![rule(
                                vec![],
                                Action::Move {
                                    direction: Relative::Forward,
                                },
                            )],
                        },
                    },
                    links: vec![],
                },
            }],
        }),
    }
}
fn birth(result: &RunResult) -> &Birth {
    &result.final_state.construction.as_ref().unwrap().births[0]
}
fn has_error(result: &RunResult, error: &str) -> bool {
    result
        .frames
        .iter()
        .flat_map(|frame| &frame.activations)
        .any(|activation| activation.error.as_deref() == Some(error))
}

#[test]
fn local_edit_is_charged_and_the_derived_child_runs_after_birth() {
    let _engines = Engines::new(
        "local_edit_is_charged_and_the_derived_child_runs_after_birth",
        1,
    );
    let experiment = world();
    let result = run(&experiment).unwrap();
    let child = birth(&result);
    assert_eq!(result.protocol, VARIATION_PROTOCOL);
    assert_eq!(child.edits.len(), 1);
    let edit = &child.edits[0];
    assert_eq!((edit.actor, edit.rule, edit.slot, edit.value), (1, 0, 0, 1));
    let seed = &experiment.construction.as_ref().unwrap().blueprints[0];
    assert_eq!(edit.before_hash, check::artifact_hash(&seed.body).unwrap());
    assert_eq!(edit.after_hash, check::artifact_hash(&child.body).unwrap());
    assert_ne!(edit.before_hash, edit.after_hash);
    assert_eq!(
        result.costs.copying,
        (construction::payload(seed).unwrap().len() + edit.bytes_written as usize) as u64
    );
    assert_eq!(result.costs.construction, 3); // placement, edit, activation
    assert_eq!(
        child.body.cell.program.rules[0].action,
        Action::Move {
            direction: Relative::Left
        }
    );
    assert!(edit.tick < child.tick);
    assert!(
        result.frames[child.tick as usize]
            .activations
            .iter()
            .all(|activation| activation.cell != 2)
    );
    let first = result.frames[child.tick as usize + 1]
        .activations
        .iter()
        .find(|activation| activation.cell == 2)
        .unwrap();
    assert!(first.success);
    assert_eq!(first.position_after, Point { x: 2, y: 0 });
    let edited = &result.frames[edit.tick as usize];
    assert_eq!(
        construction::edit_count(&experiment, &edited.state, 0, 7),
        Some(1)
    );
    let previous = &result.frames[edit.tick as usize - 1];
    assert_eq!(
        edited.costs.copying - previous.costs.copying,
        u64::from(edit.bytes_written)
    );
    check::validate_result(&experiment, &result).unwrap();
}

#[test]
fn invalid_value_locus_and_noop_leave_the_completed_body_unchanged() {
    let _engines = Engines::new(
        "invalid_value_locus_and_noop_leave_the_completed_body_unchanged",
        3,
    );
    for (value, locus, error) in [
        (9, 0, "invalid_edit_value"),
        (1, 1, "invalid_edit_locus"),
        (0, 0, "same_direction"),
    ] {
        let mut experiment = world();
        experiment.cells[0].memory[0] = value;
        experiment.cells[0].program.rules[0].action = Action::EditDirection {
            blueprint: 7,
            rule: locus,
            slot: 0,
        };
        let result = run(&experiment).unwrap();
        assert!(has_error(&result, error), "{error}");
        let construction = result.final_state.construction.as_ref().unwrap();
        assert!(construction.births.is_empty());
        assert!(construction.assemblies[0].edits.is_empty());
        assert_eq!(
            construction.assemblies[0].copied,
            construction::payload(&experiment.construction.as_ref().unwrap().blueprints[0])
                .unwrap()
        );
        assert_eq!(
            result.costs.copying,
            construction.assemblies[0].copied.len() as u64
        );
        check::validate_result(&experiment, &result).unwrap();
    }
}

#[test]
fn edit_limit_keeps_all_eight_attempts_and_never_rewrites_a_ninth_time() {
    let _engines = Engines::new(
        "edit_limit_keeps_all_eight_attempts_and_never_rewrites_a_ninth_time",
        1,
    );
    let mut experiment = world();
    let mut left = rule(
        vec![
            stage(AssemblyStage::Ready),
            Condition::Memory { slot: 0, value: 1 },
        ],
        Action::EditDirection {
            blueprint: 7,
            rule: 0,
            slot: 0,
        },
    );
    left.remember = Some(MemoryWrite { slot: 0, value: 2 });
    let mut right = left.clone();
    right.when[1] = Condition::Memory { slot: 0, value: 2 };
    right.remember = Some(MemoryWrite { slot: 0, value: 1 });
    experiment.cells[0]
        .program
        .rules
        .splice(0..2, [left, right]);
    let result = run(&experiment).unwrap();
    assert!(has_error(&result, "edit_limit"));
    let assembly = &result.final_state.construction.as_ref().unwrap().assemblies[0];
    assert_eq!(assembly.edits.len(), MAX_PROGRAM_EDITS);
    assert_eq!(
        result.costs.copying,
        construction::payload(&experiment.construction.as_ref().unwrap().blueprints[0])
            .unwrap()
            .len() as u64
            + assembly
                .edits
                .iter()
                .map(|edit| u64::from(edit.bytes_written))
                .sum::<u64>()
    );
    for pair in assembly.edits.windows(2) {
        assert!(pair[0].tick < pair[1].tick);
        assert_eq!(pair[0].after_hash, pair[1].before_hash);
    }
    check::validate_result(&experiment, &result).unwrap();
}

#[test]
fn activation_and_global_fuel_limits_rollback_the_edit_but_keep_spent_work() {
    let _engines = Engines::new(
        "activation_and_global_fuel_limits_rollback_the_edit_but_keep_spent_work",
        3,
    );
    let experiment = world();
    let full = run(&experiment).unwrap();
    let tick = birth(&full).edits[0].tick;
    let mut limited = experiment.clone();
    limited.activation_fuel = 128;
    let result = run(&limited).unwrap();
    assert!(has_error(&result, "activation_limit"));
    assert!(
        result.final_state.construction.as_ref().unwrap().assemblies[0]
            .edits
            .is_empty()
    );
    assert!(result.costs.checking > 128);
    check::validate_result(&limited, &result).unwrap();

    let action = full.frames[tick as usize]
        .activations
        .iter()
        .find(|activation| activation.cell == 1)
        .unwrap();
    let mut exhausted = experiment;
    exhausted.fuel = action.work_before + (action.work_after - action.work_before) * 3 / 4;
    let result = run(&exhausted).unwrap();
    assert_eq!(result.status, RunStatus::FuelExhausted);
    assert!(
        result.final_state.construction.as_ref().unwrap().assemblies[0]
            .edits
            .is_empty()
    );
    assert!(
        result.costs.copying
            > construction::payload(&exhausted.construction.as_ref().unwrap().blueprints[0])
                .unwrap()
                .len() as u64
    );
    assert_eq!(result.costs.total(), exhausted.fuel);
    check::validate_result(&exhausted, &result).unwrap();
}

#[test]
fn cuts_before_and_after_edit_restore_identical_history_and_birth() {
    let _engines = Engines::new(
        "cuts_before_and_after_edit_restore_identical_history_and_birth",
        7,
    );
    let experiment = world();
    let cold = run(&experiment).unwrap();
    let tick = birth(&cold).edits[0].tick;
    for cut in [tick - 1, tick] {
        let continuation::Advance::Paused(checkpoint) =
            continuation::start_until(&experiment, cut).unwrap()
        else {
            panic!("expected pause");
        };
        let continuation::Advance::Finished(restored) =
            continuation::resume_until(&checkpoint, experiment.ticks).unwrap()
        else {
            panic!("expected completion");
        };
        assert_eq!(restored, cold);
    }
}

#[test]
fn v4_gates_and_empty_edit_fields_preserve_legacy_shapes() {
    let _engines = Engines::new("v4_gates_and_empty_edit_fields_preserve_legacy_shapes", 1);
    let experiment = world();
    for version in [MODEL_VERSION, HAZARD_VERSION, CONSTRUCTION_VERSION] {
        let mut older = experiment.clone();
        older.version = version;
        assert!(validate_experiment(&older).is_err());
    }
    let mut too_much = experiment.clone();
    too_much.activation_fuel = MAX_VARIATION_ACTIVATION_FUEL + 1;
    assert!(validate_experiment(&too_much).is_err());
    too_much.activation_fuel = MAX_VARIATION_ACTIVATION_FUEL;
    assert!(validate_experiment(&too_much).is_ok());
    for (rule, slot) in [(32, 0), (0, 4)] {
        let mut invalid = experiment.clone();
        invalid.cells[0].program.rules[0].action = Action::EditDirection {
            blueprint: 7,
            rule,
            slot,
        };
        assert!(validate_experiment(&invalid).is_err());
    }
    let mut legacy = experiment;
    legacy.version = CONSTRUCTION_VERSION;
    legacy.cells[0].program.rules.remove(0);
    legacy.cells[0].program.rules[0].when.pop();
    let mut old_limit = legacy.clone();
    old_limit.activation_fuel = 1025;
    assert!(validate_experiment(&old_limit).is_err());
    for version in [MODEL_VERSION, HAZARD_VERSION] {
        old_limit.version = version;
        old_limit.construction = None;
        old_limit.cells[0].program.rules = vec![rule(vec![], Action::Wait)];
        assert!(validate_experiment(&old_limit).is_err());
    }
    let result = run(&legacy).unwrap();
    assert!(birth(&result).edits.is_empty());
    let json = serde_json::to_value(&result).unwrap();
    assert!(
        json["final_state"]["construction"]["births"][0]
            .get("edits")
            .is_none()
    );
    for frame in json["frames"].as_array().unwrap() {
        for assembly in frame["state"]["construction"]["assemblies"]
            .as_array()
            .unwrap()
        {
            assert!(assembly.get("edits").is_none());
        }
    }
    check::validate_result(&legacy, &result).unwrap();
}

#[test]
fn a_partial_body_cannot_be_edited_and_failed_edit_remember_is_ordinary_memory() {
    let _engines = Engines::new(
        "a_partial_body_cannot_be_edited_and_failed_edit_remember_is_ordinary_memory",
        1,
    );
    let mut experiment = world();
    let mut early = rule(
        vec![
            stage(AssemblyStage::Copying),
            Condition::Memory { slot: 3, value: 0 },
        ],
        Action::EditDirection {
            blueprint: 7,
            rule: 0,
            slot: 0,
        },
    );
    early.remember = Some(MemoryWrite { slot: 3, value: 1 });
    experiment.cells[0].program.rules.insert(0, early);
    let result = run(&experiment).unwrap();
    let frame = result
        .frames
        .iter()
        .find(|frame| {
            frame
                .activations
                .iter()
                .any(|activation| activation.error.as_deref() == Some("assembly_incomplete"))
        })
        .unwrap();
    let previous = &result.frames[frame.tick as usize - 1];
    assert_eq!(frame.state.construction, previous.state.construction);
    assert_eq!(frame.state.cells[0].memory[3], 1);
    assert_eq!(birth(&result).edits.len(), 1);
    check::validate_result(&experiment, &result).unwrap();
}

#[test]
fn foreign_builder_cannot_edit_or_sense_an_owned_assembly_or_birth() {
    let _engines = Engines::new(
        "foreign_builder_cannot_edit_or_sense_an_owned_assembly_or_birth",
        1,
    );
    let mut experiment = world();
    let mut intruder = experiment.cells[0].clone();
    intruder.id = 3;
    intruder.position = Point { x: 3, y: 1 };
    intruder.program.rules = vec![rule(
        vec![stage(AssemblyStage::Ready)],
        Action::EditDirection {
            blueprint: 7,
            rule: 0,
            slot: 0,
        },
    )];
    experiment.cells.push(intruder);
    let result = run(&experiment).unwrap();
    assert!(has_error(&result, "assembly_owned_by_other"));
    assert_eq!(birth(&result).parent, 1);
    assert_eq!(birth(&result).edits.len(), 1);
    for frame in &result.frames {
        let construction = frame.state.construction.as_ref().unwrap();
        let expected = if construction.assemblies.is_empty() && construction.births.is_empty() {
            Some(0)
        } else {
            None
        };
        assert_eq!(
            construction::edit_count(&experiment, &frame.state, 1, 7),
            expected
        );
    }
    check::validate_result(&experiment, &result).unwrap();
}
