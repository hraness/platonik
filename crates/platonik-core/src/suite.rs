//! Public bridge assertions preserve honest failed missions alongside successful receipts.
use crate::check::{Receipt, make_receipt};
use crate::fixtures::*;
use crate::model::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SuiteCase {
    pub id: String,
    pub expected_pass: bool,
    pub observed_pass: bool,
    pub expectation_met: bool,
    pub receipt: Receipt,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SuiteAssertion {
    pub id: String,
    pub passed: bool,
    pub description: String,
    pub evidence: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SuiteReport {
    pub version: String,
    pub id: String,
    pub passed: bool,
    pub cases: Vec<SuiteCase>,
    pub assertions: Vec<SuiteAssertion>,
}

fn add_case(
    cases: &mut Vec<SuiteCase>,
    id: &str,
    experiment: &Experiment,
    expected_pass: bool,
) -> Result<(), String> {
    let receipt = make_receipt(experiment).map_err(|error| format!("case {id}: {error}"))?;
    let observed_pass = receipt.passed();
    let completed = receipt.result.status == RunStatus::Complete
        && receipt.result.ticks_completed == experiment.ticks
        && receipt.result.frames.iter().all(|frame| frame.complete);
    cases.push(SuiteCase {
        id: id.into(),
        expected_pass,
        observed_pass,
        expectation_met: observed_pass == expected_pass && completed,
        receipt,
    });
    Ok(())
}

fn case<'a>(cases: &'a [SuiteCase], id: &str) -> &'a SuiteCase {
    cases
        .iter()
        .find(|case| case.id == id)
        .expect("suite declares this case")
}

fn program(experiment: &Experiment, id: u16) -> &Program {
    &experiment
        .cells
        .iter()
        .find(|cell| cell.id == id)
        .expect("fixture declares this cell")
        .program
}

fn same_world_except_courier(a: &Experiment, b: &Experiment) -> bool {
    replace_program(a, COURIER, idle_program()) == replace_program(b, COURIER, idle_program())
}

fn only_declared_damage(normal: &Experiment, wounded: &Experiment) -> bool {
    let damage = Point { x: 3, y: 2 };
    let mut repaired = wounded.clone();
    repaired.walls.retain(|point| *point != damage);
    !normal.walls.contains(&damage) && wounded.walls.contains(&damage) && normal == &repaired
}

fn normalize_ark_plan(experiment: &Experiment, bit: bool) -> Option<Experiment> {
    let mut normalized = experiment.clone();
    for source in &mut normalized.sources {
        for spark in &mut source.sparks {
            if spark.bit != bit {
                return None;
            }
            spark.bit = false;
        }
    }
    for beacon in &mut normalized.beacons {
        let active = beacon.accepts == bit;
        if beacon.initial_charge != if active { 13 } else { 20 }
            || beacon.required_deliveries != if active { 4 } else { 0 }
        {
            return None;
        }
        beacon.initial_charge = 20;
        beacon.required_deliveries = 0;
    }
    Some(normalized)
}

fn assertion(id: &str, passed: bool, description: &str, evidence: Vec<String>) -> SuiteAssertion {
    SuiteAssertion {
        id: id.into(),
        passed,
        description: description.into(),
        evidence,
    }
}

fn delivery_summary(case: &SuiteCase) -> String {
    let result = &case.receipt.result;
    format!(
        "{}: passed={}, delivered={}, work={}, status={:?}",
        case.id,
        case.observed_pass,
        result.final_state.delivered.len(),
        result.costs.total(),
        result.status
    )
}

pub fn run_suite(id: &str) -> Result<SuiteReport, String> {
    if id != "bridge-v1" {
        return Err(format!("unknown suite: {id}"));
    }
    let mut cases = Vec::new();
    for name in names() {
        add_case(
            &mut cases,
            name,
            &experiment(name)?,
            name != "opening-wounded-fast",
        )?;
    }
    let opening = experiment("opening-normal-resilient")?;
    add_case(
        &mut cases,
        "opening-no-courier",
        &replace_program(&opening, COURIER, idle_program()),
        false,
    )?;
    for (name, bit) in [("ark-plan-a", false), ("ark-plan-b", true)] {
        let parent = experiment(name)?;
        for (suffix, cell_id) in [
            ("no-courier", COURIER),
            ("no-relay", RELAY),
            ("no-controller", CONTROLLER),
        ] {
            add_case(
                &mut cases,
                &format!("{name}-{suffix}"),
                &replace_program(&parent, cell_id, idle_program()),
                false,
            )?;
        }
        add_case(
            &mut cases,
            &format!("{name}-memory-cleared"),
            &clear_retention(&parent),
            false,
        )?;
        for constant in [false, true] {
            let suffix = if constant { "constant-b" } else { "constant-a" };
            add_case(
                &mut cases,
                &format!("{name}-{suffix}"),
                &replace_program(&parent, CONTROLLER, constant_controller(constant)),
                constant == bit,
            )?;
        }
        add_case(
            &mut cases,
            &format!("{name}-alternating"),
            &replace_program(&parent, CONTROLLER, alternating_controller()),
            false,
        )?;
    }

    let mut assertions = Vec::new();
    assertions.push(assertion(
        "honest-expectations", cases.iter().all(|case| case.expectation_met),
        "Every public case matches its declared mission expectation; expected failures remain complete, checked receipts.",
        cases.iter().map(delivery_summary).collect(),
    ));
    let fast = case(&cases, "opening-normal");
    let resilient = case(&cases, "opening-normal-resilient");
    let wounded = case(&cases, "opening-wounded");
    let wounded_fast = case(&cases, "opening-wounded-fast");
    let same_allowance = [resilient, wounded, wounded_fast].iter().all(|case| {
        let a = &fast.receipt.experiment;
        let b = &case.receipt.experiment;
        (a.ticks, a.fuel, a.activation_fuel) == (b.ticks, b.fuel, b.activation_fuel)
    });
    let matched_worlds =
        same_world_except_courier(&fast.receipt.experiment, &resilient.receipt.experiment)
            && same_world_except_courier(
                &wounded_fast.receipt.experiment,
                &wounded.receipt.experiment,
            )
            && only_declared_damage(&fast.receipt.experiment, &wounded_fast.receipt.experiment);
    assertions.push(assertion(
        "witnessed-tradeoff",
        matched_worlds && same_allowance && fast.observed_pass && resilient.observed_pass && wounded.observed_pass && !wounded_fast.observed_pass && fast.receipt.result.costs.total() < resilient.receipt.result.costs.total(),
        "Under matched limits, the compact courier uses less total work on the normal map; the resilient courier also succeeds on the initially damaged map where the compact courier fails.",
        [fast, resilient, wounded, wounded_fast].iter().map(|case| delivery_summary(case)).collect(),
    ));
    let reused = ["opening-wounded", "ark-plan-a", "ark-plan-b"]
        .iter()
        .all(|id| {
            program(&resilient.receipt.experiment, COURIER)
                == program(&case(&cases, id).receipt.experiment, COURIER)
        });
    let causal_courier = !case(&cases, "opening-no-courier").observed_pass
        && ["ark-plan-a-no-courier", "ark-plan-b-no-courier"]
            .iter()
            .all(|id| !case(&cases, id).observed_pass);
    assertions.push(assertion(
        "unchanged-causal-reuse", reused && causal_courier && resilient.observed_pass,
        "The exact same courier program serves a beacon directly in the opening and supplies the signal-controlled depot in both ark plans; replacing that program with Wait breaks both tasks.",
        ["opening-normal-resilient", "opening-no-courier", "ark-plan-a", "ark-plan-a-no-courier", "ark-plan-b", "ark-plan-b-no-courier"].iter().map(|id| delivery_summary(case(&cases, id))).collect(),
    ));
    for (name, bit) in [("ark-plan-a", false), ("ark-plan-b", true)] {
        let parent = case(&cases, name);
        let result = &parent.receipt.result;
        let authenticated_deposits = result
            .frames
            .iter()
            .flat_map(|frame| &frame.signals)
            .filter(|event| {
                matches!(event.signal.from, Endpoint::Depot { id: 11 })
                    && event.signal.receipt_spark.is_some()
                    && event.signal.bit == bit
            })
            .count();
        let relay_evidence = result
            .frames
            .iter()
            .flat_map(|frame| &frame.signals)
            .any(|event| {
                matches!(event.signal.from, Endpoint::Cell { id: RELAY, port: 0 })
                    && event.signal.receipt_spark.is_some()
                    && event.signal.bit == bit
            });
        let retention = result
            .frames
            .iter()
            .find(|frame| frame.tick == SERVICE_START - 1)
            .is_some_and(|frame| {
                let controller = frame
                    .state
                    .cells
                    .iter()
                    .find(|cell| cell.id == CONTROLLER)
                    .unwrap();
                controller.memory[0] == u8::from(bit)
                    && controller.memory[1] == 1
                    && controller.evidence[0].is_some()
                    && controller.inbox.iter().all(Option::is_none)
                    && frame.state.pending.is_empty()
                    && !frame
                        .state
                        .links
                        .iter()
                        .find(|link| link.id == 41)
                        .unwrap()
                        .enabled
            });
        let four_services = result.final_state.delivered.len() == 4
            && result
                .final_state
                .delivered
                .iter()
                .all(|delivery| delivery.tick >= SERVICE_START && delivery.spark.bit == bit);
        let ablations = ["no-courier", "no-relay", "memory-cleared", "no-controller"]
            .iter()
            .all(|suffix| !case(&cases, &format!("{name}-{suffix}")).observed_pass);
        assertions.push(assertion(
            &format!("{name}-causal-chain"), parent.observed_pass && authenticated_deposits > 0 && relay_evidence && retention && four_services && ablations,
            "Physical deposits produce attributed reports, the adjacent relay forwards them, memory retains the bit after contact ends, and the controller spends the stock during the four-action service window. Each declared ablation breaks service.",
            vec![format!("Attributed depot signal events: {authenticated_deposits}; attributed relay evidence: {relay_evidence}; retained report with empty inbox and queue: {retention}; four late physical services: {four_services}"),
                 delivery_summary(parent),
                 delivery_summary(case(&cases, &format!("{name}-memory-cleared")))],
        ));
    }
    let paired_controller_equal =
        program(&case(&cases, "ark-plan-a").receipt.experiment, CONTROLLER)
            == program(&case(&cases, "ark-plan-b").receipt.experiment, CONTROLLER);
    let constants_fail_pair = ["constant-a", "constant-b", "alternating"]
        .iter()
        .all(|suffix| {
            !["ark-plan-a", "ark-plan-b"]
                .iter()
                .all(|name| case(&cases, &format!("{name}-{suffix}")).observed_pass)
        });
    let normalized_a = normalize_ark_plan(&case(&cases, "ark-plan-a").receipt.experiment, false);
    let normalized_b = normalize_ark_plan(&case(&cases, "ark-plan-b").receipt.experiment, true);
    let matched_plans = normalized_a.is_some() && normalized_a == normalized_b;
    assertions.push(assertion(
        "paired-input-baselines", matched_plans && paired_controller_equal && constants_fail_pair,
        "One unchanged report-driven controller passes both input plans. A matching constant control does pass its known plan; neither fixed constant nor the tested alternating control passes the pair.",
        cases.iter().filter(|case| case.id.contains("constant-") || case.id.ends_with("alternating")).map(delivery_summary).collect(),
    ));
    assertions.push(assertion(
        "one-ledger-and-stock", cases.iter().all(|case| {
            let receipt = &case.receipt;
            receipt.result.outcome.conserved && receipt.result.costs.total() <= receipt.experiment.fuel
                && receipt.result.frames.last().is_some_and(|frame| frame.costs == receipt.result.costs)
        }),
        "All recorded cases conserve the finite spark stock and charge successful and failed work to the same bounded world ledger.",
        vec![format!("{} checked receipts, including honest failures; no added rewards or unmetered controller search", cases.len())],
    ));
    let passed = cases.iter().all(|case| case.expectation_met)
        && assertions.iter().all(|assertion| assertion.passed);
    Ok(SuiteReport {
        version: "platonik-bridge-suite-v1".into(),
        id: id.into(),
        passed,
        cases,
        assertions,
    })
}
