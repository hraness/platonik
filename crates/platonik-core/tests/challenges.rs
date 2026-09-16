use platonik_core::challenge::*;
use platonik_core::fixtures;
use platonik_core::model::*;
use std::collections::BTreeMap;

fn submission(challenge: &str, program: Program, name: &str) -> Submission {
    Submission {
        schema: SUBMISSION_SCHEMA.into(),
        challenge: challenge.into(),
        programs: BTreeMap::from([("1".to_string(), program)]),
        agent: Some(AgentReport {
            name: name.into(),
            tokens: None,
            notes: None,
        }),
    }
}

/// A resilient courier carrying one never-true guard, so every activation pays
/// an extra checked condition. It solves the same cases at higher work.
fn guarded_courier() -> Program {
    let mut rules = vec![Rule {
        when: vec![Condition::Memory {
            slot: 3,
            value: 255,
        }],
        action: Action::Wait,
        remember: None,
    }];
    rules.extend(fixtures::resilient_courier().rules);
    Program { rules }
}

#[test]
fn every_published_challenge_generates_deterministically_with_witnessed_cases() {
    for index in 1..=PUBLISHED_CHALLENGES {
        let first = generate(index).expect("published challenge generates");
        let second = generate(index).expect("published challenge generates again");
        assert_eq!(first, second, "challenge {index} must be deterministic");
        assert_eq!(first.train.len(), TRAIN_CASES);
        assert_eq!(first.eval.len(), EVAL_CASES);
        for case in first.train.iter().chain(first.eval.iter()) {
            assert_eq!(case.cells.len(), 1);
            assert_eq!(case.cells[0].id, EDITABLE_COURIER);
            assert_eq!(case.cells[0].program, fixtures::idle_program());
            platonik_core::validate_experiment(case).expect("generated case validates");
        }
    }
}

#[test]
fn eval_cases_differ_from_train_cases() {
    let challenge = generate(7).unwrap();
    let train_walls: Vec<_> = challenge.train.iter().map(|case| &case.walls).collect();
    for case in &challenge.eval {
        assert!(
            !train_walls.contains(&&case.walls),
            "eval layouts must not duplicate a training layout"
        );
    }
}

#[test]
fn witness_passes_and_idle_fails_on_eval_cases() {
    let challenge = generate(1).unwrap();
    let passing = evaluate(
        &challenge,
        &submission(
            &challenge.id,
            fixtures::resilient_courier(),
            "witness-reference",
        ),
    )
    .unwrap();
    assert!(passing.passed);
    assert_eq!(passing.cases_passed, EVAL_CASES as u32);
    let idle = evaluate(
        &challenge,
        &submission(&challenge.id, fixtures::idle_program(), "idle-control"),
    )
    .unwrap();
    assert!(!idle.passed);
    assert_eq!(idle.cases_passed, 0);
    assert!(
        idle.cases
            .iter()
            .all(|case| case.status == RunStatus::Complete)
    );
}

#[test]
fn result_verification_recomputes_and_rejects_tampering() {
    let challenge = generate(3).unwrap();
    let result = evaluate(
        &challenge,
        &submission(&challenge.id, fixtures::resilient_courier(), "entrant"),
    )
    .unwrap();
    let report = verify_result(&result).expect("honest result verifies");
    assert!(report.verified && report.passed);
    let mut forged = result.clone();
    forged.total_work -= 1;
    assert!(verify_result(&forged).is_err());
    let mut inflated = result.clone();
    inflated.cases[0].work += 1;
    assert!(verify_result(&inflated).is_err());
    let mut miscounted = result.clone();
    miscounted.cases_total += 1;
    assert!(verify_result(&miscounted).is_err());
    let mut wrong_index = result.clone();
    wrong_index.index = 4;
    assert!(verify_result(&wrong_index).is_err());
}

#[test]
fn submissions_must_match_the_declared_editable_cells() {
    let challenge = generate(2).unwrap();
    let mut wrong_challenge = submission(&challenge.id, fixtures::resilient_courier(), "a");
    wrong_challenge.challenge = "challenge-0009".into();
    assert!(evaluate(&challenge, &wrong_challenge).is_err());
    let mut extra_cell = submission(&challenge.id, fixtures::resilient_courier(), "a");
    extra_cell
        .programs
        .insert("99".into(), fixtures::idle_program());
    assert!(evaluate(&challenge, &extra_cell).is_err());
    let mut missing = submission(&challenge.id, fixtures::resilient_courier(), "a");
    missing.programs.clear();
    assert!(evaluate(&challenge, &missing).is_err());
}

#[test]
fn board_ranks_cleared_then_work_and_keeps_one_row_per_entrant() {
    let challenge = generate(1).unwrap();
    let passing = evaluate(
        &challenge,
        &submission(&challenge.id, fixtures::resilient_courier(), "solver"),
    )
    .unwrap();
    let mut slower_submission = submission(&challenge.id, guarded_courier(), "slower-copy");
    slower_submission.agent.as_mut().unwrap().tokens = Some(5000);
    let slower = evaluate(&challenge, &slower_submission).unwrap();
    assert!(slower.passed && slower.total_work > passing.total_work);
    let failing = evaluate(
        &challenge,
        &submission(&challenge.id, fixtures::idle_program(), "stuck"),
    )
    .unwrap();
    let board = board(&[slower.clone(), failing.clone(), passing.clone()]);
    let rows = &board.challenges[0].rows;
    assert_eq!(rows.len(), 3);
    assert_eq!(rows[0].entrant, "solver");
    assert_eq!(rows[1].entrant, "slower-copy");
    assert_eq!(rows[2].entrant, "stuck");
    let global = &board.global;
    assert_eq!(global[0].entrant, "solver");
    assert_eq!(global[0].cleared, 1);
    assert!(
        global
            .iter()
            .any(|row| row.entrant == "stuck" && row.cleared == 0)
    );
    assert_eq!(
        global
            .iter()
            .find(|row| row.entrant == "slower-copy")
            .unwrap()
            .tokens,
        Some(5000)
    );
}

#[test]
fn board_keeps_best_result_per_entrant_and_distinct_anonymous_names() {
    let challenge = generate(1).unwrap();
    let fast = evaluate(
        &challenge,
        &submission(&challenge.id, fixtures::resilient_courier(), "repeater"),
    )
    .unwrap();
    let slow = evaluate(
        &challenge,
        &submission(&challenge.id, guarded_courier(), "repeater"),
    )
    .unwrap();
    assert!(fast.total_work < slow.total_work);
    let deduped = board(&[slow.clone(), fast.clone()]);
    let rows = &deduped.challenges[0].rows;
    assert_eq!(rows.len(), 1, "one entrant keeps only their best result");
    assert_eq!(rows[0].total_work, fast.total_work);

    let mut anonymous_a = submission(&challenge.id, fixtures::resilient_courier(), "");
    anonymous_a.agent = None;
    let mut anonymous_b = submission(&challenge.id, fixtures::idle_program(), "");
    anonymous_b.agent = None;
    let first = evaluate(&challenge, &anonymous_a).unwrap();
    let second = evaluate(&challenge, &anonymous_b).unwrap();
    assert_ne!(first.submission_hash, second.submission_hash);
    let distinct = board(&[first, second]);
    let names: Vec<_> = distinct.challenges[0]
        .rows
        .iter()
        .map(|row| row.entrant.clone())
        .collect();
    assert_eq!(names.len(), 2);
    assert!(names.iter().all(|name| name.starts_with("anon-")));
    assert_ne!(names[0], names[1], "anonymous entrants must not collapse");
}

#[test]
fn self_reported_token_totals_cannot_overflow_the_rollup() {
    let challenge = generate(1).unwrap();
    let mut huge = submission(&challenge.id, fixtures::idle_program(), "whale");
    huge.agent.as_mut().unwrap().tokens = Some(u64::MAX);
    let one = evaluate(&challenge, &huge).unwrap();
    let two = evaluate(&challenge, &huge).unwrap();
    let board = board(&[one, two]);
    let row = board
        .global
        .iter()
        .find(|row| row.entrant == "whale")
        .unwrap();
    assert_eq!(row.tokens, Some(u64::MAX));
}
