use platonik_core::{bloom_exchange_fixtures as fixtures, check, model::*};

fn engine_budget() -> u64 {
    (fixtures::case_ids().len() + fixtures::control_ids().len()) as u64
}
struct EngineBudget(u64);
impl Drop for EngineBudget {
    fn drop(&mut self) {
        let actual = platonik_core::sim::execution_count() - self.0;
        let budget = engine_budget();
        eprintln!(
            "bloom_exchange_fixture_engine_count actual={actual} budget={budget} panicking={}",
            std::thread::panicking()
        );
        assert!(actual <= budget);
        if !std::thread::panicking() {
            assert_eq!(actual, budget);
        }
    }
}
fn requester(receipt: &check::Receipt) -> &CellState {
    receipt
        .result
        .final_state
        .cells
        .iter()
        .find(|c| c.id == fixtures::REQUESTER)
        .unwrap()
}
fn service(receipt: &check::Receipt, spark: u32) -> Option<u32> {
    receipt
        .result
        .final_state
        .delivered
        .iter()
        .find(|d| d.spark.id == spark && d.beacon == 20)
        .map(|d| d.tick)
}
fn retain_failure(name: &str, receipt: &check::Receipt) {
    let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../.platonik/exchange-diagnostics");
    std::fs::create_dir_all(&directory).unwrap();
    std::fs::write(
        directory.join(format!("{name}.json")),
        serde_json::to_vec(receipt).unwrap(),
    )
    .unwrap();
}

#[test]
fn fresh_references_exchange_receipt_backed_acks_and_controls_remain_executable() {
    let _budget = EngineBudget(platonik_core::sim::execution_count());
    assert!(fixtures::experiment("missing").is_err());
    assert!(fixtures::control("bloom-exchange-left", "missing").is_err());
    for id in fixtures::case_ids() {
        let experiment = fixtures::experiment(id).unwrap();
        let receipt = check::make_receipt(&experiment).unwrap();
        let winner = fixtures::BERTHS[usize::from(id.contains("right"))];
        let loser = fixtures::BERTHS[usize::from(!id.contains("right"))];
        let requester = requester(&receipt);
        if requester.memory[0] != 2
            || requester.evidence[2] != Some(winner.confirmation)
            || service(&receipt, winner.confirmation).is_none()
        {
            retain_failure(id, &receipt);
        }
        assert_eq!(receipt.result.status, RunStatus::Complete, "{id}");
        assert_eq!(requester.memory[0], 2, "{id}");
        assert_eq!(requester.evidence[2], Some(winner.confirmation), "{id}");
        assert!(
            receipt
                .result
                .frames
                .iter()
                .flat_map(|f| &f.signals)
                .any(|s| s.signal.from
                    == Endpoint::Cell {
                        id: winner.child,
                        port: 1
                    }
                    && s.signal.receipt_spark == Some(winner.confirmation)),
            "{id}: no child ACK"
        );
        let ack = receipt
            .result
            .frames
            .iter()
            .find(|f| {
                f.state
                    .cells
                    .iter()
                    .any(|c| c.id == fixtures::REQUESTER && c.memory[0] == 2)
            })
            .unwrap()
            .tick;
        let delivered = service(&receipt, winner.confirmation).unwrap();
        assert!(ack < delivered, "{id}: service preceded acknowledgment");
        assert_eq!(delivered, fixtures::SERVICE_OPENS);
        assert!(
            receipt
                .result
                .final_state
                .sources
                .iter()
                .find(|s| s.id == loser.source)
                .unwrap()
                .sparks
                .iter()
                .any(|s| s.id == loser.confirmation),
            "{id}: spare spent"
        );
        eprintln!("bloom_exchange_reference case={id} ack={ack} serviced={delivered}");
    }
    for kind in fixtures::control_ids() {
        let world = fixtures::control("bloom-exchange-left", kind).unwrap();
        let receipt = check::make_receipt(&world).unwrap();
        if receipt.result.status != RunStatus::Complete {
            retain_failure(kind, &receipt);
        }
        assert_eq!(receipt.result.status, RunStatus::Complete, "{kind}");
        assert_eq!(receipt.result.final_state.tick, fixtures::HORIZON, "{kind}");
        assert!(receipt.result.outcome.conserved, "{kind}");
        match *kind {
            "stray-report" => assert_eq!(service(&receipt, 101), Some(fixtures::SERVICE_OPENS)),
            "no-child-ack" | "forged-report" => {
                assert_eq!(
                    service(&receipt, 101),
                    Some(fixtures::SERVICE_OPENS),
                    "{kind}: service dissociation lost"
                );
                assert_ne!(
                    requester(&receipt).evidence[2],
                    Some(101),
                    "{kind}: forged child ACK acquired physical ancestry"
                );
            }
            "no-request" | "wrong-winner" => assert!(service(&receipt, 101).is_none(), "{kind}"),
            "early-ack" => {
                assert_eq!(requester(&receipt).memory[0], 2);
                assert_eq!(requester(&receipt).evidence[2], None);
                assert!(service(&receipt, 101).is_none());
            }
            "selector-bypass" => {}
            "missing-spare" => assert!(
                receipt
                    .result
                    .final_state
                    .sources
                    .iter()
                    .find(|s| s.id == 12)
                    .unwrap()
                    .sparks
                    .iter()
                    .all(|s| s.id != 201)
            ),
            _ => unreachable!(),
        }
    }
}
