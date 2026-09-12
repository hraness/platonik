use platonik_core::{bloom, bloom_fixtures as fixtures, check, continuation, model::*};

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
            "bloom_engine_count test={} actual={} expected={} panicking={}",
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

#[test]
fn all_reference_worlds_generate_trial_select_and_confirm_through_physical_evidence() {
    let _engines = Engines::new("all_references", 16);
    for id in fixtures::case_ids() {
        let experiment = fixtures::experiment(id).unwrap();
        let receipt = check::make_receipt(&experiment).unwrap();
        let grade = bloom::grade_receipt(&receipt).unwrap();
        assert!(grade.bloomed, "{id}: {grade:?}");
        assert_eq!(grade.phase, bloom::Phase::Bloomed);
        assert!(
            grade.generated_passed
                && grade.trials_passed
                && grade.selection_passed
                && grade.confirmation_passed
                && grade.service_passed
        );
        assert_eq!(grade.result_hash, Some(receipt.result_hash.clone()));
        let selection = grade.selection.as_ref().unwrap();
        let expected = u8::from(id.contains("right"));
        assert_eq!(selection.candidate, expected, "{id}");
        assert!(selection.tick < fixtures::CONFIRMATION_OPENS);
        for candidate in &grade.candidates {
            assert!(
                candidate.trial_returned.unwrap() < selection.tick,
                "selection preceded returned trial: {id}"
            );
            assert_eq!(candidate.edits.len(), 2);
            assert!(candidate.changed && candidate.family_passed && candidate.trial_passed);
        }
        let winner = &grade.candidates[usize::from(expected)];
        let loser = &grade.candidates[usize::from(1 - expected)];
        assert!(winner.confirmation_requested.unwrap() >= fixtures::CONFIRMATION_OPENS);
        assert!(winner.confirmation_passed);
        assert!(loser.confirmation_requested.is_none());
        assert!(loser.trial_accepted.is_none());
        assert_eq!(
            receipt
                .result
                .final_state
                .cells
                .iter()
                .find(|cell| cell.id == loser.child)
                .unwrap()
                .cargo,
            Some(Spark {
                id: loser.trial_parcel,
                bit: false
            })
        );
    }
}

#[test]
fn prefixes_on_each_side_of_an_edit_remain_unfinished_and_restore_exactly() {
    let _engines = Engines::new("edit_prefix_restoration", 11);
    let experiment = fixtures::experiment("bloom-left").unwrap();
    let cold = check::make_receipt(&experiment).unwrap();
    let first_edit = cold
        .result
        .final_state
        .construction
        .as_ref()
        .unwrap()
        .births
        .iter()
        .flat_map(|birth| &birth.edits)
        .map(|edit| edit.tick)
        .min()
        .unwrap();
    for cut in [first_edit - 1, first_edit] {
        let advance = continuation::start_until(&experiment, cut).unwrap();
        let grade = bloom::grade(&experiment, &advance).unwrap();
        assert_eq!(grade.tick, cut);
        assert_eq!(grade.phase, bloom::Phase::InProgress);
        assert!(!grade.bloomed && !grade.generated_passed && !grade.selection_passed);
        assert!(grade.selection.is_none());
        assert!(
            grade
                .candidates
                .iter()
                .all(|candidate| candidate.born.is_none() && candidate.program_hash.is_none())
        );
        let recorded_edits: usize = grade
            .candidates
            .iter()
            .map(|candidate| candidate.edits.len())
            .sum();
        assert_eq!(recorded_edits == 0, cut < first_edit);
        let continuation::Advance::Paused(checkpoint) = advance else {
            panic!("expected unfinished prefix");
        };
        let restored = continuation::resume_until(&checkpoint, experiment.ticks).unwrap();
        let grade = bloom::grade(&experiment, &restored).unwrap();
        assert!(grade.bloomed);
        let continuation::Advance::Finished(result) = restored else {
            panic!("expected final result");
        };
        assert_eq!(
            serde_json::to_vec(&result).unwrap(),
            serde_json::to_vec(&cold.result).unwrap()
        );
        assert_eq!(check::artifact_hash(&result).unwrap(), cold.result_hash);
    }
}

#[test]
fn rehashing_edited_history_or_selector_memory_cannot_forge_a_bloom() {
    let _engines = Engines::new("forged_evidence", 1);
    let experiment = fixtures::experiment("bloom-left").unwrap();
    let receipt = check::make_receipt(&experiment).unwrap();
    let mut forged_edit = receipt.clone();
    for frame in &mut forged_edit.result.frames {
        for assembly in &mut frame.state.construction.as_mut().unwrap().assemblies {
            if let Some(edit) = assembly.edits.first_mut() {
                edit.before_hash = "sha256:forged".into();
            }
        }
        for birth in &mut frame.state.construction.as_mut().unwrap().births {
            if let Some(edit) = birth.edits.first_mut() {
                edit.before_hash = "sha256:forged".into();
            }
        }
    }
    forged_edit.result.final_state = forged_edit.result.frames.last().unwrap().state.clone();
    forged_edit.result_hash = check::artifact_hash(&forged_edit.result).unwrap();
    assert!(bloom::grade_receipt(&forged_edit).is_err());

    let mut forged_selection = receipt;
    for frame in &mut forged_selection.result.frames {
        let selector = frame
            .state
            .cells
            .iter_mut()
            .find(|cell| cell.id == fixtures::SELECTOR)
            .unwrap();
        if selector.memory[fixtures::SELECTION_SLOT] != 0 {
            selector.memory[fixtures::SELECTION_SLOT] = 2;
        }
    }
    forged_selection.result.final_state =
        forged_selection.result.frames.last().unwrap().state.clone();
    forged_selection.result_hash = check::artifact_hash(&forged_selection.result).unwrap();
    assert!(bloom::grade_receipt(&forged_selection).is_err());
}

#[test]
fn a_correct_hardwired_winner_can_deliver_service_without_earning_selection() {
    let _engines = Engines::new("hardwired_winner", 2);
    let mut experiment = fixtures::experiment("bloom-left").unwrap();
    let selector = experiment
        .cells
        .iter_mut()
        .find(|cell| cell.id == fixtures::SELECTOR)
        .unwrap();
    selector.program = Program {
        rules: vec![
            Rule {
                when: vec![Condition::Memory {
                    slot: fixtures::SELECTION_SLOT as u8,
                    value: 0,
                }],
                action: Action::WriteMemory {
                    slot: fixtures::SELECTION_SLOT as u8,
                    value: 1,
                },
                remember: None,
            },
            Rule {
                when: vec![Condition::HasMessage {
                    port: 2,
                    value: true,
                }],
                action: Action::Send {
                    port: 0,
                    bit: BitSource::Constant { value: true },
                },
                remember: None,
            },
            Rule {
                when: vec![],
                action: Action::Wait,
                remember: None,
            },
        ],
    };
    let receipt = check::make_receipt(&experiment).unwrap();
    let grade = bloom::grade_receipt(&receipt).unwrap();
    assert!(receipt.passed());
    assert!(grade.service_passed && grade.generated_passed && grade.trials_passed);
    assert!(grade.selection.is_none());
    assert!(!grade.selection_passed && !grade.bloomed);
    assert_eq!(grade.phase, bloom::Phase::FinishedWithoutBloom);
}
