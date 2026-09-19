use platonik_core::{
    check,
    model::{FacilityDecl, FacilityKind, MaterialStock, Point},
};

// Frozen before the v6 correction, independent of evolving default worlds.
fn chain_experiment() -> platonik_core::model::Experiment {
    serde_json::from_str(include_str!("fixtures/industry-v5-chain.json")).unwrap()
}

#[test]
fn assembler_and_crane_chain_replays_through_the_independent_checker() {
    let receipt = check::make_receipt(&chain_experiment()).unwrap();
    check::verify_receipt(&receipt).unwrap();
    let assembler = receipt
        .result
        .final_state
        .facilities
        .iter()
        .find(|facility| facility.id == 91)
        .unwrap();
    let crane = receipt
        .result
        .final_state
        .facilities
        .iter()
        .find(|facility| facility.id == 92)
        .unwrap();
    let storehouse = receipt
        .result
        .final_state
        .facilities
        .iter()
        .find(|facility| facility.id == 93)
        .unwrap();
    assert!(assembler.minted > 0);
    assert!(crane.minted > 0);
    assert!(!storehouse.frames.is_empty());
}

#[test]
fn v5_charges_from_before_a_same_tick_crane_becomes_eligible() {
    let mut experiment = chain_experiment();
    experiment.version = platonik_core::model::INDUSTRY_VERSION;
    let receipt = check::make_receipt(&experiment).unwrap();
    assert_eq!(
        receipt.result_hash,
        "sha256:a78bb2d41c3eb8c650648cc440bd6c783bcd907ce78e921e1f5ba819e1e0e51b",
        "historical v5 states, costs, and receipt bytes must remain unchanged",
    );
    check::verify_receipt(&receipt).unwrap();
    let transition = receipt
        .result
        .frames
        .windows(2)
        .find(|frames| {
            let before_assembler = frames[0]
                .state
                .facilities
                .iter()
                .find(|facility| facility.id == 91)
                .unwrap();
            let after_assembler = frames[1]
                .state
                .facilities
                .iter()
                .find(|facility| facility.id == 91)
                .unwrap();
            let before_crane = frames[0]
                .state
                .facilities
                .iter()
                .find(|facility| facility.id == 92)
                .unwrap();
            let after_crane = frames[1]
                .state
                .facilities
                .iter()
                .find(|facility| facility.id == 92)
                .unwrap();
            before_assembler.progress == 1
                && after_assembler.minted == before_assembler.minted + 1
                && before_crane.progress == 0
                && after_crane.progress == platonik_core::model::CRANE_PERIOD
        })
        .expect("the producer should enable an idle crane on the same tick");
    // Habitat v5 calculates work before processing facilities in order. The
    // assembler completion makes the later crane eligible, so both operate but
    // only the completion is charged. Correcting this requires a new protocol:
    // changing v5 would invalidate saved costs, hashes, and fuel-bound outcomes.
    assert_eq!(
        transition[1].costs.construction - transition[0].costs.construction,
        1,
        "preserve the recorded v5 accounting limitation under its original protocol",
    );
}

// Loading itself charges the canonical input bytes. Changing fuel can change
// its digit count, so compensate for that before targeting a phase boundary.
fn fuel_boundary(
    experiment: &platonik_core::model::Experiment,
    work: u64,
    allowance: u64,
) -> platonik_core::model::Experiment {
    let loading = serde_json::to_vec(experiment).unwrap().len() as u64;
    let mut bounded = experiment.clone();
    for _ in 0..4 {
        let bytes = serde_json::to_vec(&bounded).unwrap().len() as u64;
        let fuel = work - loading + bytes + allowance;
        if bounded.fuel == fuel {
            return bounded;
        }
        bounded.fuel = fuel;
    }
    panic!("fuel input byte width should stabilize");
}

#[test]
fn v6_charges_the_producer_and_newly_eligible_crane() {
    let mut experiment = chain_experiment();
    experiment.version = platonik_core::model::INDUSTRY_ACCOUNTING_VERSION;
    let receipt = check::make_receipt(&experiment).unwrap();
    check::verify_receipt(&receipt).unwrap();
    assert_eq!(receipt.protocol, "platonik-habitat-v6");
    let transition = receipt
        .result
        .frames
        .windows(2)
        .find(|frames| {
            let before = &frames[0].state.facilities;
            let after = &frames[1].state.facilities;
            before[1].progress == 1
                && after[1].minted == before[1].minted + 1
                && before[2].progress == 0
                && after[2].progress == platonik_core::model::CRANE_PERIOD
        })
        .unwrap();
    assert_eq!(
        transition[1].costs.construction - transition[0].costs.construction,
        2
    );

    // Both operations commit together, even though the second is enabled by
    // the first. A one-unit-short fuel budget must not mint an uncharged frame.
    let start = transition[1].activations.last().unwrap().work_after;
    for (allowance, committed) in [(4, false), (5, true)] {
        let bounded = fuel_boundary(&experiment, start, allowance);
        let interrupted = check::make_receipt(&bounded).unwrap();
        check::verify_receipt(&interrupted).unwrap();
        assert_eq!(
            interrupted.result.status,
            platonik_core::model::RunStatus::FuelExhausted
        );
        assert_eq!(interrupted.result.costs.total(), bounded.fuel);
        let actual = &interrupted.result.final_state;
        let expected = &transition[usize::from(committed)].state;
        assert_eq!(actual.facilities, expected.facilities);
        assert_eq!(actual.construction, expected.construction);
        assert_eq!(actual.tick, transition[1].tick);
    }
}

fn extraction_chain() -> platonik_core::model::Experiment {
    let mut experiment = chain_experiment();
    experiment.version = platonik_core::model::INDUSTRY_ACCOUNTING_VERSION;
    experiment.ticks = 32;
    experiment.cells[0].program = platonik_core::fixtures::idle_program();
    experiment.construction.as_mut().unwrap().stocks = vec![
        MaterialStock {
            id: 50,
            position: Point { x: 1, y: 0 },
            units: vec![1001, 1002, 1003],
        },
        MaterialStock {
            id: 51,
            position: Point { x: 2, y: 1 },
            units: vec![1004, 1005, 1006],
        },
    ];
    experiment.facilities = vec![
        FacilityDecl {
            id: 90,
            kind: FacilityKind::Miner,
            position: Point { x: 1, y: 0 },
        },
        FacilityDecl {
            id: 91,
            kind: FacilityKind::Miner,
            position: Point { x: 2, y: 1 },
        },
        FacilityDecl {
            id: 92,
            kind: FacilityKind::Crane,
            position: Point { x: 2, y: 0 },
        },
        FacilityDecl {
            id: 93,
            kind: FacilityKind::Storehouse,
            position: Point { x: 3, y: 0 },
        },
    ];
    experiment
}

#[test]
fn v6_charges_completion_and_restart_and_rolls_back_deposit_effects_on_exhaustion() {
    let experiment = extraction_chain();
    let receipt = check::make_receipt(&experiment).unwrap();
    check::verify_receipt(&receipt).unwrap();
    let before = &receipt.result.frames[12];
    let after = &receipt.result.frames[13];
    // Each drill extracts and restarts, then the later crane starts: five jobs.
    assert_eq!(after.costs.construction - before.costs.construction, 5);
    assert_eq!(after.state.facilities[0].materials, vec![1001]);
    assert_eq!(after.state.facilities[1].materials, vec![1004]);
    assert_eq!(
        after.state.facilities[2].progress,
        platonik_core::model::CRANE_PERIOD
    );
    // On its next turn the crane transfers one unit and starts its next job.
    let before_crane = &receipt.result.frames[20];
    let after_crane = &receipt.result.frames[21];
    assert_eq!(
        after_crane.costs.construction - before_crane.costs.construction,
        2
    );
    assert_eq!(after_crane.state.facilities[3].materials, vec![1001]);
    assert_eq!(
        after_crane.state.facilities[2].progress,
        platonik_core::model::CRANE_PERIOD
    );

    // Exercise every interruption within checking and work, plus exact commit.
    // Deposits and every facility must agree on the same atomic boundary.
    let start = after.activations.last().unwrap().work_after;
    for allowance in 0..=8 {
        let bounded = fuel_boundary(&experiment, start, allowance);
        let interrupted = check::make_receipt(&bounded).unwrap();
        check::verify_receipt(&interrupted).unwrap();
        assert_eq!(
            interrupted.result.status,
            platonik_core::model::RunStatus::FuelExhausted
        );
        assert_eq!(interrupted.result.costs.total(), bounded.fuel);
        let expected = if allowance == 8 { after } else { before };
        assert_eq!(
            interrupted.result.final_state.facilities,
            expected.state.facilities
        );
        assert_eq!(
            interrupted.result.final_state.construction,
            expected.state.construction
        );
        assert_eq!(interrupted.result.final_state.tick, 13);
    }
}

#[test]
fn v6_changes_accounting_without_changing_fully_funded_physical_replay() {
    let mut experiment = extraction_chain();
    let exact = check::make_receipt(&experiment).unwrap();
    experiment.version = platonik_core::model::INDUSTRY_VERSION;
    let historical = check::make_receipt(&experiment).unwrap();
    assert_eq!(exact.result.final_state, historical.result.final_state);
    assert!(exact.result.costs.construction > historical.result.costs.construction);
    for (exact, historical) in exact.result.frames.iter().zip(&historical.result.frames) {
        assert_eq!(exact.state, historical.state);
    }
}
