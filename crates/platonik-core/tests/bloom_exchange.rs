use platonik_core::{
    bloom_exchange as exchange, bloom_exchange_fixtures as fixtures, check, continuation, model::*,
};

// One test owns process-local engine accounting and reuses its reference receipt.
#[test]
fn exchange_contract_controls_recovery_and_integrity() {
    let before = platonik_core::sim::execution_count();
    let mut calls = 0;
    let mut retained = None;
    for id in fixtures::case_ids() {
        let receipt = check::make_receipt(&fixtures::experiment(id).unwrap()).unwrap();
        let grade = exchange::grade_receipt(id, &receipt).unwrap();
        calls += 2;
        assert!(
            grade.exchange_passed,
            "{id}: {}",
            serde_json::to_string_pretty(&grade).unwrap()
        );
        assert_eq!(
            grade.selected_candidate,
            Some(u8::from(id.contains("right")))
        );
        assert_eq!(grade.result_hash, receipt.result_hash);
        assert_eq!(grade.work_total, receipt.result.costs.total());
        assert_eq!(
            grade.accepted,
            grade.depot_report.as_ref().map(|m| m.signal.sent_tick)
        );
        assert!(grade.child_request.as_ref().unwrap().tick < grade.pickup.unwrap());
        if *id == "bloom-exchange-left" {
            retained = Some((receipt, grade));
        }
    }
    for kind in fixtures::control_ids() {
        let receipt =
            check::make_receipt(&fixtures::control("bloom-exchange-left", kind).unwrap()).unwrap();
        let grade = exchange::grade_receipt("bloom-exchange-left", &receipt).unwrap();
        calls += 2;
        assert_eq!(receipt.result.status, RunStatus::Complete);
        assert_eq!(receipt.result.ticks_completed, 128);
        assert!(!grade.exchange_passed, "{kind}");
        match *kind {
            "no-child-ack" => {
                assert!(!grade.acknowledgment_passed);
                assert_eq!(grade.serviced, Some(fixtures::SERVICE_OPENS));
            }
            "stray-report" => {
                assert!(!grade.acknowledgment_passed);
                assert!(grade.acknowledgment.is_some());
                assert_eq!(grade.serviced, Some(fixtures::SERVICE_OPENS));
            }
            "forged-report" | "early-ack" => assert!(!grade.acknowledgment_passed),
            "wrong-winner" | "no-request" | "selector-bypass" => assert!(!grade.request_passed),
            "missing-spare" => assert!(!grade.spare_preserved),
            _ => panic!("Unasserted control {kind}"),
        }
    }
    let (receipt, grade) = retained.unwrap();
    for tick in [
        grade.request.as_ref().unwrap().signal.sent_tick,
        grade.child_ack.as_ref().unwrap().signal.sent_tick,
    ] {
        let continuation::Advance::Paused(checkpoint) =
            continuation::start_until(&receipt.experiment, tick).unwrap()
        else {
            panic!("Expected pause")
        };
        assert!(!checkpoint.frames.last().unwrap().state.pending.is_empty());
        let encoded = serde_json::to_string(&checkpoint).unwrap();
        let restored = continuation::parse_checkpoint(&encoded).unwrap();
        let continuation::Advance::Finished(result) =
            continuation::resume_until(&restored, 128).unwrap()
        else {
            panic!("Expected finish")
        };
        calls += 3;
        assert_eq!(
            result, receipt.result,
            "Replay lost timing/state/costs at {tick}"
        );
    }
    for mutation in 0..5 {
        let mut tampered = receipt.clone();
        match mutation {
            0 => {
                let signal = tampered
                    .result
                    .frames
                    .iter_mut()
                    .flat_map(|f| &mut f.signals)
                    .find(|e| {
                        e.outcome == "consumed"
                            && e.signal.id == grade.acknowledgment.as_ref().unwrap().signal.id
                    })
                    .unwrap();
                signal.signal.receipt_spark = Some(201);
            }
            1 => tampered.result.frames[100].state.cells[0].memory[3] ^= 1,
            2 => {
                tampered
                    .result
                    .final_state
                    .construction
                    .as_mut()
                    .unwrap()
                    .births[0]
                    .body
                    .cell
                    .program
                    .rules[0]
                    .action = Action::Wait
            }
            3 => tampered.result.costs.actions += 1,
            _ => tampered.result.final_state.sources[0].sparks.push(Spark {
                id: 201,
                bit: false,
            }),
        }
        tampered.result_hash = check::artifact_hash(&tampered.result).unwrap();
        let count = platonik_core::sim::execution_count();
        assert!(
            exchange::grade_receipt("bloom-exchange-left", &tampered).is_err(),
            "Accepted rehashed tampering {mutation}"
        );
        let actual = platonik_core::sim::execution_count() - count;
        assert!(actual <= 1);
        calls += actual;
    }
    let mut free = receipt.experiment.clone();
    free.fuel += 1;
    let free_receipt = check::make_receipt(&free).unwrap();
    let free_grade = exchange::grade_receipt("bloom-exchange-left", &free_receipt).unwrap();
    calls += 2;
    assert!(!free_grade.fixed_world_passed && !free_grade.exchange_passed);
    assert!(exchange::grade_receipt("not-a-case", &receipt).is_err());
    let actual = platonik_core::sim::execution_count() - before;
    eprintln!("bloom_exchange_grade_engines actual={actual} expected={calls}");
    assert_eq!(actual, calls);
}
