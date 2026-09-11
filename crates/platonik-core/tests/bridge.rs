use platonik_core::check::{make_receipt, verify_receipt};
use platonik_core::fixtures::*;
use platonik_core::model::*;
use platonik_core::run;
use platonik_core::suite::run_suite;
use std::collections::BTreeSet;

#[test]
fn public_bridge_has_a_witnessed_tradeoff_and_explicit_causal_failures() {
    let report = run_suite("bridge-v1").expect("public fixtures and independent checks agree");
    for case in &report.cases {
        assert!(
            case.expectation_met,
            "{}: expected {}, observed {}",
            case.id, case.expected_pass, case.observed_pass
        );
    }
    for assertion in &report.assertions {
        assert!(
            assertion.passed,
            "{}: {:?}",
            assertion.id, assertion.evidence
        );
    }
    assert!(report.passed);
    assert_eq!(report.cases.len(), 21);
}

#[test]
fn editing_a_child_preserves_parent_bytes_and_deterministic_replay() {
    let parent = experiment("opening-normal-resilient").unwrap();
    let bytes = serde_json::to_vec(&parent).unwrap();
    let child = replace_program(&parent, COURIER, idle_program());
    let receipt = make_receipt(&parent).unwrap();
    assert!(receipt.passed());
    assert!(!make_receipt(&child).unwrap().passed());
    assert_eq!(serde_json::to_vec(&parent).unwrap(), bytes);
    assert_eq!(make_receipt(&parent).unwrap(), receipt);
    assert!(verify_receipt(&receipt).unwrap().verified);
}

#[test]
fn opening_timing_and_stock_are_an_inspectable_golden_trace() {
    let receipt = make_receipt(&experiment("opening-normal").unwrap()).unwrap();
    let result = &receipt.result;
    let schedule: Vec<_> = result
        .final_state
        .delivered
        .iter()
        .map(|delivery| (delivery.tick, delivery.spark.id))
        .collect();
    assert_eq!(schedule, vec![(6, 1), (18, 2), (30, 3)]);
    assert_eq!(result.final_state.beacons[0].charge, 8);
    assert_eq!(result.final_state.beacons[0].drained, 11);
    assert_eq!(result.ticks_completed, 44);
    assert!(result.frames.iter().all(|frame| frame.complete));
}

#[test]
fn reports_come_from_deposits_and_memory_is_used_after_contact_ends() {
    for name in ["ark-plan-a", "ark-plan-b"] {
        let parent = experiment(name).unwrap();
        let expected_bit = parent.sources[0].sparks[0].bit;
        let result = run(&parent).unwrap();
        assert!(result.outcome.passed);
        let reports: Vec<_> = result
            .frames
            .iter()
            .flat_map(|frame| &frame.signals)
            .filter(|event| {
                matches!(event.signal.from, Endpoint::Depot { id: 11 }) && event.outcome == "queued"
            })
            .collect();
        assert_eq!(reports.len(), 4);
        let ids: BTreeSet<_> = reports
            .iter()
            .map(|event| event.signal.receipt_spark.unwrap())
            .collect();
        assert_eq!(ids, BTreeSet::from([1, 2, 3, 4]));
        assert!(reports.iter().all(|event| event.signal.bit == expected_bit));
        for event in reports {
            let frame = &result.frames[event.signal.sent_tick as usize];
            assert!(
                frame
                    .activations
                    .iter()
                    .any(|activation| activation.cell == COURIER
                        && activation.action == Action::Drop
                        && activation.success)
            );
            assert!(
                frame.state.depots[0]
                    .sparks
                    .iter()
                    .any(|spark| Some(spark.id) == event.signal.receipt_spark)
            );
        }
        let quiet = &result.frames[(SERVICE_START - 1) as usize].state;
        let controller = quiet
            .cells
            .iter()
            .find(|cell| cell.id == CONTROLLER)
            .unwrap();
        assert_eq!(controller.memory[..2], [u8::from(expected_bit), 1]);
        assert!(controller.inbox.iter().all(Option::is_none));
        assert!(quiet.pending.is_empty());
        assert!(controller.evidence[0].is_some());
        assert!(
            !quiet
                .links
                .iter()
                .find(|link| link.id == 41)
                .unwrap()
                .enabled
        );
        assert_eq!(
            result
                .final_state
                .delivered
                .iter()
                .map(|delivery| delivery.tick)
                .collect::<Vec<_>>(),
            vec![52, 53, 54, 55]
        );

        let lost = run(&clear_retention(&parent)).unwrap();
        assert!(!lost.outcome.passed);
        assert_eq!(
            lost.final_state.depots[0].sparks.len(),
            4,
            "stock still arrived: retention, not transport, was ablated"
        );
        assert!(lost.final_state.delivered.is_empty());
        assert!(
            lost.final_state
                .beacons
                .iter()
                .any(|beacon| beacon.exhausted)
        );
    }
}

#[test]
fn failed_baselines_neither_create_nor_discard_rejected_stock() {
    let parent = experiment("ark-plan-a").unwrap();
    let wrong = replace_program(&parent, CONTROLLER, constant_controller(true));
    let result = run(&wrong).unwrap();
    assert!(!result.outcome.passed);
    assert_eq!(result.final_state.depots[0].sparks.len(), 4);
    assert!(result.final_state.delivered.is_empty());
    let rejected: Vec<_> = result
        .frames
        .iter()
        .flat_map(|frame| &frame.activations)
        .filter(|activation| {
            activation.cell == CONTROLLER
                && activation.error.as_deref() == Some("beacon_rejects_bit")
        })
        .collect();
    assert_eq!(rejected.len(), 4);
    assert!(
        rejected
            .iter()
            .all(|activation| activation.work_after > activation.work_before)
    );
    let matching = run(&replace_program(
        &parent,
        CONTROLLER,
        constant_controller(false),
    ))
    .unwrap();
    assert!(
        matching.outcome.passed,
        "known-plan constant control is an admitted baseline, not suppressed by the story"
    );
}

#[test]
fn scarce_work_records_a_bounded_honest_failure_and_charge_is_conserved() {
    let mut experiment = experiment("ark-plan-b").unwrap();
    let full = run(&experiment).unwrap();
    // The limit is part of the charged input, so do not assume changing its decimal
    // width leaves loading work unchanged. This cut is well beyond that difference.
    experiment.fuel = full.costs.total() - 100;
    let limited = make_receipt(&experiment).unwrap();
    assert_eq!(limited.result.status, RunStatus::FuelExhausted);
    assert!(!limited.passed());
    assert!(limited.result.costs.total() <= experiment.fuel);
    assert!(verify_receipt(&limited).unwrap().verified);
    for frame in &limited.result.frames {
        for (beacon, specification) in frame.state.beacons.iter().zip(&experiment.beacons) {
            assert_eq!(
                beacon.charge + beacon.drained,
                specification.initial_charge + beacon.delivered * specification.spark_charge
            );
        }
    }
    experiment.fuel = 0;
    let empty = make_receipt(&experiment).unwrap();
    assert_eq!(empty.result.ticks_completed, 0);
    assert!(empty.result.final_state.delivered.is_empty());
    assert_eq!(empty.result.final_state.sources[0].sparks.len(), 4);
    assert_eq!(empty.result.costs.total(), 0);
    assert!(verify_receipt(&empty).unwrap().verified);
}
