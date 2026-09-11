use platonik_core::check::{Receipt, make_receipt, verify_receipt};
use platonik_core::continuity_fixtures as continuity;
use platonik_core::fixtures::{self, CONTROLLER, COURIER, RELAY, replace_program};
use platonik_core::model::*;

fn recorded(label: &str, experiment: &Experiment) -> Receipt {
    let receipt = make_receipt(experiment).unwrap();
    eprintln!(
        "continuity-qualification {}",
        serde_json::json!({
            "case": label,
            "experiment_json": serde_json::to_string(experiment).unwrap(),
            "receipt_json": if label.starts_with("counterexample/") { Some(serde_json::to_string(&receipt).unwrap()) } else { None },
            "experiment_hash": receipt.experiment_hash,
            "result_hash": receipt.result_hash,
            "passed": receipt.passed(),
            "status": receipt.result.status,
            "work": receipt.result.costs.total(),
            "deliveries": receipt.result.final_state.delivered,
            "beacons": receipt.result.final_state.beacons,
            "engine_executions_so_far": platonik_core::sim::execution_count(),
            "final_state": receipt.result.final_state,
            "courier_positions": receipt.result.frames.iter().map(|frame| {
                let courier = frame.state.cells.iter().find(|cell| cell.id == COURIER).unwrap();
                (frame.tick, courier.position)
            }).collect::<Vec<_>>(),
        })
    );
    receipt
}

fn previous_pair(id: &str, frozen: &str) -> (Program, Program) {
    let study: serde_json::Value = serde_json::from_str(include_str!(
        "../../../fixtures/evidence/expedition-study.json"
    ))
    .unwrap();
    let arm = study["arms"]
        .as_array()
        .unwrap()
        .iter()
        .find(|arm| arm["id"] == id)
        .unwrap();
    assert_eq!(arm["frozen"], frozen);
    (
        serde_json::from_value(arm["frozen_pair"]["courier"].clone()).unwrap(),
        serde_json::from_value(arm["frozen_pair"]["controller"].clone()).unwrap(),
    )
}

#[test]
fn every_public_case_has_a_complete_unchanged_reference_witness() {
    let mut failures = Vec::new();
    for id in continuity::case_ids() {
        let experiment = continuity::experiment(id).unwrap();
        assert_eq!(experiment.cells.len(), 4);
        assert_eq!(experiment.ticks, continuity::HORIZON);
        assert!(experiment.ticks <= MAX_TICKS);
        assert_eq!(experiment.depots[0].capacity, 1);
        assert_eq!(experiment.sources[0].sparks.len(), 6);
        assert_eq!(
            experiment
                .cells
                .iter()
                .find(|cell| cell.id == COURIER)
                .unwrap()
                .program,
            fixtures::resilient_courier()
        );
        assert_eq!(
            experiment
                .cells
                .iter()
                .find(|cell| cell.id == CONTROLLER)
                .unwrap()
                .program,
            fixtures::controller_program()
        );
        let receipt = recorded(&format!("reference/{id}"), &experiment);
        assert_eq!(receipt.result.status, RunStatus::Complete);
        assert_eq!(receipt.result.ticks_completed, continuity::HORIZON);
        assert!(receipt.result.frames.iter().all(|frame| frame.complete));
        assert!(verify_receipt(&receipt).unwrap().verified);
        if !receipt.passed() {
            failures.push(*id);
        }
    }
    assert!(
        failures.is_empty(),
        "unqualified public references: {failures:?}"
    );
}

#[test]
fn checkpoints_expose_cargo_pending_reports_retention_and_service() {
    let receipt = recorded(
        "checkpoints/changing-one",
        &continuity::experiment("changing-one").unwrap(),
    );
    assert!(receipt.passed());
    let frames = &receipt.result.frames;
    assert_eq!(
        frames[5]
            .state
            .cells
            .iter()
            .find(|cell| cell.id == COURIER)
            .unwrap()
            .cargo
            .unwrap()
            .id,
        1
    );
    assert!(!frames[9].state.pending.is_empty());
    let keeper = |tick: usize| {
        frames[tick]
            .state
            .cells
            .iter()
            .find(|cell| cell.id == CONTROLLER)
            .unwrap()
    };
    assert_eq!(keeper(14).memory[0], 1);
    assert_eq!(keeper(14).evidence[0], Some(1));
    assert_eq!(frames[14].state.depots[0].sparks[0].id, 1);
    assert_eq!(keeper(18).memory[0], 1);
    assert!(keeper(18).inbox.iter().all(Option::is_none));
    assert!(!frames[18].state.valves[0].enabled);
    assert_eq!(frames[19].state.delivered.len(), 1);
    assert!(
        frames[19]
            .state
            .beacons
            .iter()
            .all(|beacon| beacon.drained > 0)
    );
    assert!(frames.iter().any(|frame| {
        frame
            .state
            .cells
            .iter()
            .any(|cell| cell.id == CONTROLLER && cell.memory[0] == 0 && cell.evidence[0] == Some(2))
    }));
    assert_eq!(receipt.result.final_state.delivered.len(), 6);
    assert_eq!(
        receipt
            .result
            .final_state
            .delivered
            .iter()
            .map(|delivery| delivery.spark.id)
            .collect::<Vec<_>>(),
        vec![1, 2, 3, 4, 5, 6]
    );
    assert!(
        receipt
            .result
            .final_state
            .beacons
            .iter()
            .all(|beacon| beacon.delivered == 3 && beacon.charge == 6 && !beacon.exhausted)
    );
    let broken = recorded(
        "checkpoints/broken-crossing",
        &continuity::experiment("broken-crossing").unwrap(),
    );
    assert!(!broken.result.frames[27].state.closed_edges.is_empty());
    assert!(broken.result.frames[47].state.closed_edges.is_empty());
}

#[test]
fn inherited_positive_latch_is_a_recorded_specialization_failure() {
    let (courier, controller) = previous_pair("frugal", "wait-latch");
    let mut unexpectedly_passed = Vec::new();
    for id in continuity::case_ids() {
        let world = continuity::experiment(id).unwrap();
        let changed = replace_program(
            &replace_program(&world, COURIER, courier.clone()),
            CONTROLLER,
            controller.clone(),
        );
        let receipt = recorded(&format!("previous-frugal/{id}"), &changed);
        assert_eq!(receipt.result.status, RunStatus::Complete);
        assert!(receipt.result.outcome.conserved);
        if receipt.passed() {
            unexpectedly_passed.push(*id);
        }
        assert_eq!(
            world,
            continuity::experiment(id).unwrap(),
            "parent fixture remains unchanged"
        );
    }
    assert!(
        unexpectedly_passed.is_empty(),
        "review the specialization claim: {unexpectedly_passed:?}"
    );
}

#[test]
fn causal_controls_fail_the_reference_without_claiming_unique_architecture() {
    let parent = continuity::experiment("changing-one").unwrap();
    let mut controls = vec![
        (
            "idle-courier",
            replace_program(&parent, COURIER, fixtures::idle_program()),
        ),
        (
            "idle-relay",
            replace_program(&parent, RELAY, fixtures::idle_program()),
        ),
        (
            "idle-keeper",
            replace_program(&parent, CONTROLLER, fixtures::idle_program()),
        ),
        (
            "constant-zero",
            replace_program(&parent, CONTROLLER, fixtures::constant_controller(false)),
        ),
        (
            "constant-one",
            replace_program(&parent, CONTROLLER, fixtures::constant_controller(true)),
        ),
    ];
    let mut forgotten = parent.clone();
    forgotten.events.push(Event {
        tick: 17,
        event: EventKind::ClearMemory { cell: CONTROLLER },
    });
    forgotten.events.sort_by_key(|event| event.tick);
    controls.push(("forgotten-report", forgotten));
    for (id, world) in controls {
        let receipt = recorded(&format!("control/{id}"), &world);
        assert_eq!(receipt.result.status, RunStatus::Complete);
        assert!(receipt.result.outcome.conserved);
        assert!(
            !receipt.passed(),
            "reference control unexpectedly passed: {id}"
        );
        assert!(!receipt.result.outcome.quotas_met);
    }
    let mut scarce = parent.clone();
    scarce.fuel = 4_000;
    let receipt = recorded("control/shortened-fuel", &scarce);
    assert_eq!(receipt.result.status, RunStatus::FuelExhausted);
    assert!(!receipt.passed());
    assert!(receipt.result.costs.total() <= scarce.fuel);
    assert_eq!(parent, continuity::experiment("changing-one").unwrap());
}

#[test]
fn a_signal_blind_alternator_is_admitted_and_reported_honestly() {
    for id in continuity::case_ids() {
        let experiment = replace_program(
            &continuity::experiment(id).unwrap(),
            CONTROLLER,
            continuity::blind_alternator(),
        );
        let receipt = recorded(&format!("blind-alternator/{id}"), &experiment);
        assert_eq!(receipt.result.status, RunStatus::Complete);
        assert!(receipt.result.outcome.conserved);
        // Feasibility and relative work are qualification observations, never a
        // reason to exclude this legal competitor or grant an invented penalty.
    }
}

#[test]
fn the_prior_resilient_winner_is_a_strong_unchanged_comparator() {
    let (courier, controller) = previous_pair("resilient", "short-memory");
    assert_eq!(courier, fixtures::resilient_courier());
    let mut failures = Vec::new();
    for id in continuity::case_ids() {
        let experiment = replace_program(
            &continuity::experiment(id).unwrap(),
            CONTROLLER,
            controller.clone(),
        );
        let receipt = recorded(&format!("previous-resilient/{id}"), &experiment);
        assert_eq!(receipt.result.status, RunStatus::Complete);
        assert!(receipt.result.outcome.conserved);
        if !receipt.passed() {
            failures.push(*id);
        }
    }
    assert!(
        failures.is_empty(),
        "review the inherited general report controller: {failures:?}"
    );
}

#[test]
fn reopening_counterexamples_remain_visible_as_real_navigation_failures() {
    for (id, reopen, loop_start, remaining) in [
        ("reversed-crossing", 50, 50, 2),
        ("late-crossing", 61, 63, 1),
    ] {
        let mut experiment = continuity::experiment(id).unwrap();
        experiment
            .events
            .iter_mut()
            .find(|event| matches!(event.event, EventKind::EdgeBlocked { blocked: false, .. }))
            .unwrap()
            .tick = reopen;
        experiment.events.sort_by_key(|event| event.tick);
        let receipt = recorded(&format!("counterexample/{id}"), &experiment);
        assert_eq!(receipt.result.status, RunStatus::Complete);
        assert!(receipt.result.outcome.conserved);
        assert!(!receipt.passed());
        assert_eq!(
            receipt.result.final_state.sources[0].sparks.len(),
            remaining
        );
        let position = |tick: usize| {
            receipt.result.frames[tick]
                .state
                .cells
                .iter()
                .find(|cell| cell.id == COURIER)
                .unwrap()
                .position
        };
        for tick in loop_start + 4..=continuity::HORIZON as usize {
            assert_eq!(
                position(tick),
                position(tick - 4),
                "the old wall follower circles an empty four-position loop"
            );
        }
    }
}

#[test]
fn protocol_declares_the_executable_case_sets_and_finite_cutpoints() {
    let protocol: serde_json::Value = serde_json::from_str(include_str!(
        "../../../fixtures/evidence/continuity-protocol.json"
    ))
    .unwrap();
    for (key, ids) in [
        ("training", continuity::training_ids()),
        ("transfer", continuity::transfer_ids()),
    ] {
        let declared: Vec<_> = protocol["cases"][key]
            .as_array()
            .unwrap()
            .iter()
            .map(|id| id.as_str().unwrap())
            .collect();
        assert_eq!(declared, ids);
    }
    let cuts: Vec<_> = protocol["continuity"]["advance_to_ticks"]
        .as_array()
        .unwrap()
        .iter()
        .map(|tick| tick.as_u64().unwrap() as u32)
        .collect();
    assert_eq!(cuts, continuity::PAUSE_CUTS);
    assert!(cuts.len() <= 8 && cuts.windows(2).all(|pair| pair[0] < pair[1]));
    assert_eq!(cuts.last(), Some(&continuity::HORIZON));
    assert!(continuity::experiment("not-a-case").is_err());
}
