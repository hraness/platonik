use platonik_core::check::{make_receipt, verify_receipt};
use platonik_core::expedition_fixtures as expedition;
use platonik_core::fixtures::{COURIER, replace_program};
use platonik_core::model::*;

#[test]
fn every_predeclared_case_has_a_complete_conservative_reference_witness() {
    for id in expedition::case_ids() {
        let experiment = expedition::experiment(id).unwrap();
        assert_eq!(experiment.version, HAZARD_VERSION);
        let receipt = make_receipt(&experiment).unwrap();
        assert!(
            receipt.passed(),
            "reference must be feasible before admitting {id}"
        );
        assert_eq!(receipt.result.status, RunStatus::Complete);
        assert_eq!(receipt.result.ticks_completed, experiment.ticks);
        assert!(receipt.result.frames.iter().all(|frame| frame.complete));
        assert!(verify_receipt(&receipt).unwrap().verified);
        assert_eq!(
            experiment
                .cells
                .iter()
                .find(|cell| cell.id == COURIER)
                .unwrap()
                .program,
            expedition::recovery_program()
        );
    }
}

#[test]
fn closure_occurs_in_the_run_and_explains_a_real_compact_recovery_difference() {
    let parent = expedition::experiment("opening-collapse").unwrap();
    let recovered = make_receipt(&parent).unwrap();
    let compact = make_receipt(&replace_program(
        &parent,
        COURIER,
        expedition::compact_program(),
    ))
    .unwrap();
    assert!(recovered.passed());
    assert!(!compact.passed());
    assert_eq!(compact.result.status, RunStatus::Complete);
    assert!(
        compact
            .result
            .final_state
            .delivered
            .iter()
            .any(|delivery| delivery.tick < 10),
        "failure follows an initially working route"
    );
    assert!(compact.result.final_state.delivered.len() < 3);
    let edge = Edge::new(Point { x: 3, y: 2 }, Point { x: 4, y: 2 });
    for receipt in [&recovered, &compact] {
        assert!(receipt.result.frames[9].state.closed_edges.is_empty());
        assert_eq!(receipt.result.frames[10].state.closed_edges, vec![edge]);
        assert!(receipt.result.frames[10].events.iter().any(|event| matches!(event, EventKind::EdgeBlocked { edge: declared, blocked: true } if *declared == edge)));
        assert!(
            receipt
                .result
                .frames
                .iter()
                .skip(10)
                .flat_map(|frame| &frame.activations)
                .all(|activation| {
                    Edge::new(activation.position_before, activation.position_after) != edge
                }),
            "neither policy crosses the closed edge after the event"
        );
    }
    let normal = expedition::experiment("opening-normal").unwrap();
    let normal_recovery = make_receipt(&normal).unwrap();
    let normal_compact = make_receipt(&replace_program(
        &normal,
        COURIER,
        expedition::compact_program(),
    ))
    .unwrap();
    assert!(normal_recovery.passed() && normal_compact.passed());
    assert!(normal_compact.result.costs.total() < normal_recovery.result.costs.total());
}

#[test]
fn transfer_cases_change_declared_hazards_without_mutating_training_cases() {
    let train = expedition::experiment("opening-collapse").unwrap();
    let mut early = expedition::experiment("transfer-early-collapse").unwrap();
    assert_eq!(early.events[0].tick, 3);
    early.events[0].tick = 10;
    assert_eq!(early, train);
    let reversed = expedition::experiment("transfer-reversed-collapse").unwrap();
    assert_eq!(reversed.events[0].tick, 27);
    assert_eq!(reversed.cells[0].heading, Direction::West);
    assert_eq!(reversed.cells[0].program, train.cells[0].program);
    let train_bytes = serde_json::to_vec(&train).unwrap();
    make_receipt(&reversed).unwrap();
    assert_eq!(serde_json::to_vec(&train).unwrap(), train_bytes);
    for bit in ['a', 'b'] {
        let training = expedition::experiment(&format!("ark-plan-{bit}")).unwrap();
        let mut delayed = expedition::experiment(&format!("transfer-delayed-plan-{bit}")).unwrap();
        assert_eq!(delayed.seed, 29);
        assert!(delayed.links.iter().all(|link| link.delay == 3));
        delayed.seed = training.seed;
        for link in &mut delayed.links {
            link.delay = 1;
        }
        assert_eq!(delayed, training);
    }
}

#[test]
fn protocol_case_sets_match_executable_fixtures() {
    let protocol: serde_json::Value = serde_json::from_str(include_str!(
        "../../../fixtures/evidence/expedition-protocol.json"
    ))
    .unwrap();
    let ids = |key: &str| {
        protocol["cases"][key]
            .as_array()
            .unwrap()
            .iter()
            .map(|id| id.as_str().unwrap())
            .collect::<Vec<_>>()
    };
    assert_eq!(ids("training"), expedition::training_ids());
    assert_eq!(ids("transfer"), expedition::transfer_ids());
    assert_eq!(expedition::case_ids().len(), 8);
    assert!(expedition::experiment("not-a-case").is_err());
    assert_eq!(protocol["budget"]["candidate_batches_per_agent"], 4);
    assert_eq!(protocol["budget"]["training_evaluations_per_agent"], 16);
}
