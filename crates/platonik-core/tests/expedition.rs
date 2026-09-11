use platonik_core::{
    check,
    expedition::{self, Ambition, Campaign, Command, Event},
    expedition_fixtures, fixtures,
};

fn start() -> Campaign {
    expedition::new("First camp".into(), Ambition::Frugal).unwrap()
}
fn trial(case: &str, courier: &str) -> Command {
    Command::Trial {
        case_id: case.into(),
        courier: courier.into(),
        controller: "memory".into(),
    }
}
fn execute(state: &mut Campaign, command: &Command) -> Vec<Event> {
    let (event, experiment) = expedition::plan(state, command).unwrap();
    expedition::apply(state, &event).unwrap();
    let mut events = vec![event];
    if let Some(experiment) = experiment {
        let receipt = check::make_receipt(&experiment).unwrap();
        let event = expedition::complete(state, receipt).unwrap();
        expedition::apply(state, &event).unwrap();
        events.push(event);
    }
    events
}

#[test]
fn failure_spends_work_and_growth_preserves_parent_and_ancestry() {
    let mut state = start();
    let before = state.creations.clone();
    execute(&mut state, &trial("opening-collapse", "compact"));
    assert!(!state.trials[0].passed);
    assert!(state.work > 0);
    assert_eq!(state.work, state.trials[0].work);
    assert_eq!(state.creations, before);
    let grow = Command::Grow {
        id: "moth-child".into(),
        name: "Moth's detour".into(),
        parent: "compact".into(),
        program: fixtures::resilient_courier(),
    };
    execute(&mut state, &grow);
    assert_eq!(&state.creations[..before.len()], &before);
    assert_eq!(
        state.creations.last().unwrap().parent.as_deref(),
        Some("compact")
    );
    assert!(expedition::plan(&state, &grow).is_err());
    execute(&mut state, &trial("opening-collapse", "moth-child"));
    assert!(state.trials[1].passed);
    assert_eq!(state.trials.len(), 2);
}

#[test]
fn pending_intent_blocks_other_actions_and_rejects_substituted_or_tampered_receipts() {
    let mut state = start();
    let command = trial("opening-normal", "compact");
    let (event, experiment) = expedition::plan(&state, &command).unwrap();
    expedition::apply(&mut state, &event).unwrap();
    assert_eq!(state.work, 0);
    assert!(state.pending.as_ref().unwrap().reserved_work > 0);
    assert!(expedition::plan(&state, &command).is_err());
    let receipt = check::make_receipt(&experiment.unwrap()).unwrap();
    let mut tampered = receipt.clone();
    tampered.result.outcome.passed = !tampered.result.outcome.passed;
    assert!(expedition::complete(&state, tampered).is_err());
    let other =
        check::make_receipt(&expedition_fixtures::experiment("opening-collapse").unwrap()).unwrap();
    assert!(expedition::complete(&state, other).is_err());
    let completed = expedition::complete(&state, receipt).unwrap();
    expedition::apply(&mut state, &completed).unwrap();
    assert!(state.pending.is_none());
    let before = state.clone();
    assert!(expedition::apply(&mut state, &completed).is_err());
    assert_eq!(state, before);
}

#[test]
fn reference_expedition_reaches_ending_and_replays_exactly_without_time_advancing() {
    let mut state = start();
    let mut journal = Vec::new();
    let freeze = Command::Freeze {
        courier: "recovery".into(),
        controller: "memory".into(),
    };
    assert!(expedition::plan(&state, &freeze).is_err());
    assert!(expedition::plan(&state, &trial("transfer-early-collapse", "recovery")).is_err());
    for id in expedition_fixtures::training_ids() {
        journal.extend(execute(&mut state, &trial(id, "recovery")));
    }
    journal.extend(execute(&mut state, &freeze));
    assert!(expedition::plan(&state, &trial("opening-normal", "recovery")).is_err());
    for id in expedition_fixtures::transfer_ids() {
        journal.extend(execute(&mut state, &trial(id, "recovery")));
    }
    let progress = expedition::progress(&state);
    assert!(progress.field_expedition_complete);
    assert!(progress.reply.is_some());
    assert_eq!(state.trials.len(), 8);
    assert!(expedition::plan(&state, &trial("transfer-early-collapse", "recovery")).is_err());
    let mut replay = start();
    for event in journal {
        expedition::apply(&mut replay, &event).unwrap();
    }
    assert_eq!(replay, state);
    assert_eq!(expedition::progress(&replay), progress);
    // The progress projection must distinguish finished confirmation from an
    // unattempted case; a failed one-shot result cannot be retried in this save.
    replay.trials.last_mut().unwrap().passed = false;
    let failed = expedition::progress(&replay);
    assert!(failed.confirmation_finished);
    assert!(!failed.field_expedition_complete);
    assert!(failed.unattempted_transfer.is_empty());
    assert_eq!(failed.failed_transfer.len(), 1);
    assert!(failed.next.contains("new declared expedition"));
}

#[test]
fn persistent_favorite_constraint_is_enforced_by_program_not_display_name() {
    let mut state = expedition::new("Keep Fern".into(), Ambition::Resilient).unwrap();
    assert!(expedition::plan(&state, &trial("opening-normal", "compact")).is_err());
    execute(
        &mut state,
        &Command::Grow {
            id: "fern-copy".into(),
            name: "Fern".into(),
            parent: "recovery".into(),
            program: fixtures::resilient_courier(),
        },
    );
    assert!(expedition::plan(&state, &trial("opening-normal", "fern-copy")).is_ok());
    execute(
        &mut state,
        &Command::Grow {
            id: "impostor".into(),
            name: "Fern".into(),
            parent: "recovery".into(),
            program: fixtures::compact_courier(),
        },
    );
    assert!(expedition::plan(&state, &trial("opening-normal", "impostor")).is_err());
}

#[test]
fn work_reservations_limits_and_event_forgery_fail_closed() {
    let mut state = start();
    let cmd = trial("opening-normal", "compact");
    state.allowance = 1;
    assert!(expedition::plan(&state, &cmd).is_err());
    state.allowance = expedition::ALLOWANCE;
    let (mut forged, _) = expedition::plan(&state, &cmd).unwrap();
    if let Event::Started { reserved_work, .. } = &mut forged {
        *reserved_work = 0;
    }
    let before = state.clone();
    assert!(expedition::apply(&mut state, &forged).is_err());
    assert_eq!(state, before);
    for _ in 0..expedition::MAX_TRIALS {
        execute(&mut state, &trial("opening-collapse", "compact"));
    }
    assert!(expedition::plan(&state, &cmd).is_err());
    assert_eq!(state.trials.len(), 32);
    assert_eq!(state.work, state.trials.iter().map(|t| t.work).sum::<u64>());
}

#[test]
fn training_success_with_mixed_pairs_cannot_forge_unchanged_reuse() {
    let mut state = start();
    execute(&mut state, &trial("opening-normal", "compact"));
    for id in &expedition_fixtures::training_ids()[1..] {
        execute(&mut state, &trial(id, "recovery"));
    }
    let freeze = Command::Freeze {
        courier: "recovery".into(),
        controller: "memory".into(),
    };
    assert!(expedition::plan(&state, &freeze).is_err());
    execute(&mut state, &trial("opening-normal", "recovery"));
    assert!(expedition::plan(&state, &freeze).is_ok());
}
