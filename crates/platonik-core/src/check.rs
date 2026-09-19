//! Receipt identity and a checker independent of the simulator's success predicate.
//! Hashes identify the parsed artifacts; verification also executes their pinned model.
#[path = "check_construction.rs"]
mod construction;
#[path = "check_industry.rs"]
mod industry;

use crate::model::*;
use crate::sim::{run, validate_experiment};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write;

pub const RECEIPT_SCHEMA: &str = "platonik-receipt-v1";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Receipt {
    pub schema: String,
    pub protocol: String,
    pub experiment_hash: String,
    pub result_hash: String,
    pub experiment: Experiment,
    pub result: RunResult,
}

impl Receipt {
    pub fn passed(&self) -> bool {
        self.result.outcome.passed
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VerificationReport {
    pub schema: String,
    pub verified: bool,
    pub passed: bool,
    pub protocol: String,
    pub experiment_hash: String,
    pub result_hash: String,
    pub ticks_completed: u32,
    pub work: u64,
}

/// Canonical for these versioned, integer-only typed records: struct field order
/// is fixed, collections are ordered vectors or BTreeMaps, and whitespace is absent.
pub fn artifact_hash<T: Serialize>(artifact: &T) -> Result<String, String> {
    // Keep serde's exact byte encoding without allocating a second full copy of
    // a potentially large trace solely to calculate its identity.
    struct HashWriter(Sha256);
    impl std::io::Write for HashWriter {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            self.0.update(bytes);
            Ok(bytes.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    let mut writer = HashWriter(Sha256::new());
    serde_json::to_writer(&mut writer, artifact).map_err(|error| error.to_string())?;
    Ok(format!("sha256:{:x}", writer.0.finalize()))
}

pub fn make_receipt(experiment: &Experiment) -> Result<Receipt, String> {
    let result = run(experiment)?;
    validate_result(experiment, &result)?;
    Ok(Receipt {
        schema: RECEIPT_SCHEMA.into(),
        protocol: result.protocol.clone(),
        experiment_hash: artifact_hash(experiment)?,
        result_hash: artifact_hash(&result)?,
        experiment: experiment.clone(),
        result,
    })
}

pub fn verify_receipt(receipt: &Receipt) -> Result<VerificationReport, String> {
    ensure(
        receipt.schema == RECEIPT_SCHEMA
            && protocol_for_version(receipt.experiment.version) == Some(receipt.protocol.as_str()),
        "Unsupported receipt or protocol version.",
    )?;
    ensure(
        receipt.experiment_hash == artifact_hash(&receipt.experiment)?,
        "Experiment digest does not match its contents.",
    )?;
    ensure(
        receipt.result_hash == artifact_hash(&receipt.result)?,
        "Result digest does not match its contents.",
    )?;
    validate_result(&receipt.experiment, &receipt.result)?;
    let replayed = run(&receipt.experiment)?;
    ensure(
        replayed == receipt.result,
        "Fresh recomputation differs from the supplied result, trace, or costs.",
    )?;
    Ok(VerificationReport {
        schema: "platonik-verification-v1".into(),
        verified: true,
        passed: receipt.passed(),
        protocol: receipt.protocol.clone(),
        experiment_hash: receipt.experiment_hash.clone(),
        result_hash: receipt.result_hash.clone(),
        ticks_completed: replayed.ticks_completed,
        work: checked_work(&replayed.costs)?,
    })
}

fn ensure(condition: bool, message: &str) -> Result<(), String> {
    if condition {
        Ok(())
    } else {
        Err(message.into())
    }
}

fn counters(costs: &Costs) -> [u64; 13] {
    [
        costs.loading,
        costs.scheduling,
        costs.conditions,
        costs.sensors,
        costs.memory_reads,
        costs.memory_writes,
        costs.actions,
        costs.messages,
        costs.transfers,
        costs.checking,
        costs.draining,
        costs.copying,
        costs.construction,
    ]
}

fn checked_work(costs: &Costs) -> Result<u64, String> {
    counters(costs).into_iter().try_fold(0u64, |sum, value| {
        sum.checked_add(value)
            .ok_or_else(|| "Cost counters overflow their declared integer width.".into())
    })
}

fn ids_match(expected: impl Iterator<Item = u16>, observed: impl Iterator<Item = u16>) -> bool {
    let expected: Vec<_> = expected.collect();
    let observed: Vec<_> = observed.collect();
    expected.len() == observed.len()
        && observed.iter().copied().collect::<BTreeSet<_>>().len() == observed.len()
        && expected.into_iter().collect::<BTreeSet<_>>() == observed.into_iter().collect()
}

fn validate_state(
    experiment: &Experiment,
    state: &State,
    complete: bool,
    initial: &BTreeMap<u32, bool>,
) -> Result<(), String> {
    construction::validate_state(experiment, state)?;
    crate::industry::check_state(experiment, state, true)?;
    ensure(
        state.tick <= experiment.ticks,
        "A state exceeds the declared tick horizon.",
    )?;
    ensure(
        state.closed_edges.len() <= experiment.events.len()
            && state.closed_edges.windows(2).all(|pair| pair[0] < pair[1])
            && state.closed_edges.iter().all(|edge| {
                matches!(experiment.version, HAZARD_VERSION | CONSTRUCTION_VERSION | VARIATION_VERSION) && edge.is_canonical()
                    && experiment.events.iter().any(|event| {
                        matches!(event.event, EventKind::EdgeBlocked { edge: declared, .. } if declared == *edge)
                    })
            }),
        "Closed movement edges are not distinct declared v2 edges.",
    )?;
    ensure(
        ids_match(
            experiment.cells.iter().map(|cell| cell.id).chain(
                state
                    .construction
                    .iter()
                    .flat_map(|construction| &construction.births)
                    .map(|birth| birth.body.cell.id),
            ),
            state.cells.iter().map(|cell| cell.id),
        ),
        "Cell identities changed or duplicated.",
    )?;
    ensure(
        ids_match(
            experiment.sources.iter().map(|source| source.id),
            state.sources.iter().map(|source| source.id),
        ),
        "Source identities changed or duplicated.",
    )?;
    ensure(
        ids_match(
            experiment.depots.iter().map(|depot| depot.id),
            state.depots.iter().map(|depot| depot.id),
        ),
        "Depot identities changed or duplicated.",
    )?;
    ensure(
        ids_match(
            experiment.beacons.iter().map(|beacon| beacon.id),
            state.beacons.iter().map(|beacon| beacon.id),
        ),
        "Beacon identities changed or duplicated.",
    )?;
    ensure(
        ids_match(
            experiment.valves.iter().map(|valve| valve.id),
            state.valves.iter().map(|valve| valve.id),
        ),
        "Valve identities changed or duplicated.",
    )?;
    ensure(
        ids_match(
            construction::links(experiment, state)
                .iter()
                .map(|link| link.id),
            state.links.iter().map(|link| link.id),
        ),
        "Link identities changed or duplicated.",
    )?;

    let mut occupied = BTreeSet::new();
    for cell in &state.cells {
        ensure(
            cell.position.x < experiment.width
                && cell.position.y < experiment.height
                && !experiment.walls.contains(&cell.position),
            "A cell is outside traversable terrain.",
        )?;
        ensure(
            occupied.insert((cell.position.x, cell.position.y)),
            "Two cells occupy one position.",
        )?;
        let definition = construction::definition(experiment, state, cell.id)
            .ok_or("A cell has no admitted definition.")?;
        ensure(
            definition.mobile || cell.position == definition.position,
            "A stationary cell moved.",
        )?;
        for evidence in cell.evidence.iter().flatten() {
            ensure(
                initial.contains_key(evidence),
                "Memory refers to an unknown spark receipt.",
            )?;
        }
    }

    let mut observed = BTreeMap::new();
    let mut insert = |spark: Spark| -> Result<(), String> {
        ensure(
            initial.get(&spark.id) == Some(&spark.bit),
            "An unknown spark was created or its bit changed.",
        )?;
        ensure(
            observed.insert(spark.id, spark.bit).is_none(),
            "A spark exists in more than one accountable location.",
        )
    };
    for source in &state.sources {
        for spark in &source.sparks {
            insert(*spark)?;
        }
    }
    for depot in &state.depots {
        let capacity = experiment
            .depots
            .iter()
            .find(|definition| definition.id == depot.id)
            .unwrap()
            .capacity;
        ensure(
            depot.sparks.len() <= capacity as usize,
            "Depot capacity was exceeded.",
        )?;
        for spark in &depot.sparks {
            insert(*spark)?;
        }
    }
    for cell in &state.cells {
        if let Some(spark) = cell.cargo {
            insert(spark)?;
        }
    }
    for facility in &state.facilities {
        for spark in facility.sparks.iter().chain(facility.spent_sparks.iter()) {
            insert(*spark)?;
        }
    }
    for delivery in &state.delivered {
        ensure(
            delivery.tick > 0 && delivery.tick <= state.tick,
            "A delivery has an impossible timestamp.",
        )?;
        let beacon = experiment
            .beacons
            .iter()
            .find(|beacon| beacon.id == delivery.beacon)
            .ok_or("A delivery names an unknown beacon.")?;
        ensure(
            delivery.spark.bit == beacon.accepts,
            "A delivery was accepted by the wrong typed service.",
        )?;
        insert(delivery.spark)?;
    }
    ensure(
        observed == *initial,
        "The complete spark inventory is not conserved.",
    )?;
    for beacon in &state.beacons {
        let definition = experiment
            .beacons
            .iter()
            .find(|definition| definition.id == beacon.id)
            .unwrap();
        let deliveries = state
            .delivered
            .iter()
            .filter(|delivery| delivery.beacon == beacon.id)
            .count() as u64;
        ensure(
            u64::from(beacon.delivered) == deliveries,
            "A beacon's delivery counter disagrees with the delivery ledger.",
        )?;
        let available =
            u64::from(definition.initial_charge) + deliveries * u64::from(definition.spark_charge);
        ensure(
            u64::from(beacon.charge) + u64::from(beacon.drained) == available,
            "A beacon's charge equation is not conserved.",
        )?;
        ensure(
            beacon.charge > 0 || beacon.exhausted,
            "A zero-charge service did not record exhaustion.",
        )?;
    }
    ensure(
        state.pending.len() <= MAX_PENDING,
        "The pending signal queue exceeded its limit.",
    )?;
    let mut signal_ids = BTreeSet::new();
    for signal in &state.pending {
        validate_signal(experiment, state, signal, initial)?;
        ensure(
            !complete || signal.deliver_tick > state.tick,
            "A due signal remains after a completed tick.",
        )?;
        ensure(
            signal_ids.insert(signal.id),
            "A signal is duplicated in pending delivery.",
        )?;
    }
    for cell in &state.cells {
        for (port, signal) in cell
            .inbox
            .iter()
            .enumerate()
            .filter_map(|(port, signal)| signal.as_ref().map(|signal| (port, signal)))
        {
            validate_signal(experiment, state, signal, initial)?;
            ensure(
                signal.to_cell == cell.id
                    && usize::from(signal.to_port) == port
                    && signal.deliver_tick <= state.tick,
                "An inbox signal arrived at the wrong endpoint or before its delay.",
            )?;
            ensure(
                signal_ids.insert(signal.id),
                "A signal occupies multiple queue or inbox slots.",
            )?;
        }
    }
    ensure(
        signal_ids.iter().all(|id| *id < state.next_signal),
        "Signal sequence counter is inconsistent.",
    )
}

fn validate_signal(
    experiment: &Experiment,
    state: &State,
    signal: &Signal,
    initial: &BTreeMap<u32, bool>,
) -> Result<(), String> {
    let definitions = construction::links(experiment, state);
    let link = definitions
        .iter()
        .find(|link| link.id == signal.link)
        .ok_or("Signal uses an unknown or inactive link.")?;
    if let Some(birth) = state
        .construction
        .iter()
        .flat_map(|construction| &construction.births)
        .find(|birth| birth.body.links.iter().any(|link| link.id == signal.link))
    {
        ensure(
            signal.sent_tick >= birth.tick,
            "A signal used wiring before its installation.",
        )?;
    }
    ensure(
        signal.from == link.from
            && signal.to_cell == link.to_cell
            && signal.to_port == link.to_port,
        "Signal changed its declared endpoints.",
    )?;
    ensure(
        signal.sent_tick > 0
            && signal.sent_tick.checked_add(link.delay) == Some(signal.deliver_tick),
        "Signal delivery does not respect the declared delay.",
    )?;
    if let Some(spark) = signal.receipt_spark {
        ensure(
            initial.get(&spark) == Some(&signal.bit),
            "A signal claims inconsistent spark evidence.",
        )?;
    }
    Ok(())
}

/// Observed progress of a checked prefix; this is not a final success claim.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PrefixSummary {
    pub tick: u32,
    pub work: u64,
    pub activation_limited: bool,
}

/// Independent trace invariants for a resumable prefix, without asserting a
/// final quota result. Exact policy selection and charges also require replay.
pub fn validate_prefix(experiment: &Experiment, frames: &[Frame]) -> Result<PrefixSummary, String> {
    let summary = validate_frames(experiment, frames)?;
    ensure(
        frames.iter().all(|frame| frame.complete) && summary.tick < experiment.ticks,
        "A checkpoint must end at a complete tick before the original horizon.",
    )?;
    Ok(summary)
}

fn validate_frames(experiment: &Experiment, frames: &[Frame]) -> Result<PrefixSummary, String> {
    validate_experiment(experiment)?;
    ensure(
        !frames.is_empty() && frames.len() <= experiment.ticks as usize + 1,
        "Invalid or unbounded frame count.",
    )?;
    let mut initial = BTreeMap::new();
    for spark in experiment.sources.iter().flat_map(|source| &source.sparks) {
        ensure(
            initial.insert(spark.id, spark.bit).is_none(),
            "Initial spark identities are duplicated.",
        )?;
    }
    let mut previous_costs = [0u64; 13];
    let mut previous_frame: Option<&Frame> = None;
    for (index, frame) in frames.iter().enumerate() {
        ensure(
            frame.tick == index as u32 && frame.state.tick == frame.tick,
            "Frame ticks are not contiguous.",
        )?;
        validate_state(experiment, &frame.state, frame.complete, &initial)?;
        ensure(
            experiment.version >= CONSTRUCTION_VERSION
                || (frame.costs.copying == 0 && frame.costs.construction == 0),
            "Older protocols contain construction costs.",
        )?;
        let work = checked_work(&frame.costs)?;
        ensure(
            work <= experiment.fuel,
            "A frame exceeds the whole-experiment fuel allowance.",
        )?;
        let current_costs = counters(&frame.costs);
        ensure(
            current_costs
                .iter()
                .zip(previous_costs)
                .all(|(current, previous)| *current >= previous),
            "Cumulative costs went backwards.",
        )?;
        if let Some(previous) = previous_frame {
            validate_transition(experiment, previous, frame, &initial)?;
        } else {
            validate_initial(experiment, frame)?;
        }
        previous_costs = current_costs;
        previous_frame = Some(frame);
    }
    Ok(PrefixSummary {
        tick: frames
            .iter()
            .filter(|frame| frame.complete)
            .map(|frame| frame.tick)
            .max()
            .unwrap_or(0),
        work: checked_work(&frames.last().unwrap().costs)?,
        activation_limited: frames
            .iter()
            .flat_map(|frame| &frame.activations)
            .any(|activation| activation.error.as_deref() == Some("activation_limit")),
    })
}

/// Independent structural, conservation, timing, transition, budget, and outcome
/// checks. Full rule evaluation is checked additionally by fresh recomputation.
pub fn validate_result(experiment: &Experiment, result: &RunResult) -> Result<(), String> {
    let summary = validate_frames(experiment, &result.frames)?;
    ensure(
        protocol_for_version(experiment.version) == Some(result.protocol.as_str()),
        "Run protocol does not match the supported model.",
    )?;
    ensure(
        result.initial_sparks as usize
            == experiment
                .sources
                .iter()
                .map(|source| source.sparks.len())
                .sum::<usize>(),
        "Initial spark count is incorrect.",
    )?;
    let last = result.frames.last().unwrap();
    ensure(
        last.state == result.final_state && last.costs == result.costs,
        "Final state or costs disagree with the last frame.",
    )?;
    let completed = summary.tick;
    ensure(
        result.ticks_completed == completed,
        "Completed tick count disagrees with the trace.",
    )?;
    ensure(
        result.status != RunStatus::Complete || (last.complete && completed == experiment.ticks),
        "A truncated run claims completion.",
    )?;
    let all_beacons_positive = result.frames.iter().all(|frame| {
        frame
            .state
            .beacons
            .iter()
            .all(|beacon| beacon.charge > 0 && !beacon.exhausted)
    });
    let quotas_met = experiment.beacons.iter().all(|definition| {
        result
            .final_state
            .beacons
            .iter()
            .find(|beacon| beacon.id == definition.id)
            .unwrap()
            .delivered
            >= definition.required_deliveries
    });
    let passed = result.status == RunStatus::Complete
        && completed == experiment.ticks
        && all_beacons_positive
        && quotas_met;
    ensure(
        result.outcome
            == (Outcome {
                all_beacons_positive,
                quotas_met,
                conserved: true,
                passed,
            }),
        "The claimed outcome does not follow from the checked trace.",
    )
}

fn validate_initial(experiment: &Experiment, frame: &Frame) -> Result<(), String> {
    construction::validate_initial(experiment, &frame.state)?;
    ensure(
        frame.activations.is_empty()
            && frame.events.is_empty()
            && frame.signals.is_empty()
            && frame.state.delivered.is_empty()
            && frame.state.pending.is_empty()
            && frame.state.closed_edges.is_empty(),
        "Initial state contains work or deliveries that never occurred.",
    )?;
    for cell in &frame.state.cells {
        let definition = experiment
            .cells
            .iter()
            .find(|definition| definition.id == cell.id)
            .unwrap();
        ensure(
            cell.position == definition.position
                && cell.heading == definition.heading
                && cell.memory == definition.memory
                && cell.evidence == [None; 4]
                && cell.cargo.is_none()
                && cell.inbox == [None, None, None, None],
            "A cell's initial state differs from the experiment.",
        )?;
    }
    for source in &frame.state.sources {
        ensure(
            source.sparks
                == experiment
                    .sources
                    .iter()
                    .find(|definition| definition.id == source.id)
                    .unwrap()
                    .sparks,
            "Initial source inventory differs from the experiment.",
        )?;
    }
    ensure(
        frame
            .state
            .depots
            .iter()
            .all(|depot| depot.sparks.is_empty()),
        "A depot starts with unaccounted stock.",
    )?;
    for beacon in &frame.state.beacons {
        let definition = experiment
            .beacons
            .iter()
            .find(|definition| definition.id == beacon.id)
            .unwrap();
        ensure(
            beacon.charge == definition.initial_charge
                && beacon.delivered == 0
                && beacon.drained == 0,
            "A beacon's initial accounting differs from the experiment.",
        )?;
    }
    ensure(
        frame.state.next_signal == 1,
        "Initial signal sequence counter is incorrect.",
    )?;
    ensure(
        frame.state.links.iter().all(|link| {
            experiment
                .links
                .iter()
                .find(|definition| definition.id == link.id)
                .unwrap()
                .enabled
                == link.enabled
        }),
        "A link starts with undeclared enablement.",
    )?;
    ensure(
        frame.state.valves.iter().all(|valve| {
            experiment
                .valves
                .iter()
                .find(|definition| definition.id == valve.id)
                .unwrap()
                .enabled
                == valve.enabled
        }),
        "A valve starts with undeclared enablement.",
    )?;
    Ok(())
}

fn expected_activation_order(experiment: &Experiment, state: &State, tick: u32) -> Vec<u16> {
    let priority = |id: u16| {
        let mut word = (experiment.seed ^ (u64::from(tick) << 32) ^ u64::from(id))
            .wrapping_add(0x9e3779b97f4a7c15);
        word = (word ^ (word >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
        word = (word ^ (word >> 27)).wrapping_mul(0x94d049bb133111eb);
        (word ^ (word >> 31), id)
    };
    let mut ids: Vec<_> = state.cells.iter().map(|cell| cell.id).collect();
    ids.sort_by_key(|id| priority(*id));
    ids
}

fn validate_transition(
    experiment: &Experiment,
    previous: &Frame,
    frame: &Frame,
    initial: &BTreeMap<u32, bool>,
) -> Result<(), String> {
    ensure(
        previous.complete,
        "Simulation continued after an unfinished tick.",
    )?;
    ensure(
        frame.state.delivered.starts_with(&previous.state.delivered),
        "The delivery history was rewritten.",
    )?;
    let expected_events: Vec<_> = experiment
        .events
        .iter()
        .filter(|event| event.tick == frame.tick)
        .map(|event| event.event.clone())
        .collect();
    ensure(
        expected_events.starts_with(&frame.events)
            && (!frame.complete || frame.events == expected_events),
        "Scheduled interventions differ from the declared event list.",
    )?;
    let mut links: BTreeMap<_, _> = previous
        .state
        .links
        .iter()
        .map(|link| (link.id, link.enabled))
        .collect();
    let mut valves: BTreeMap<_, _> = previous
        .state
        .valves
        .iter()
        .map(|valve| (valve.id, valve.enabled))
        .collect();
    let mut closed_edges: BTreeSet<_> = previous.state.closed_edges.iter().copied().collect();
    for event in &frame.events {
        match event {
            EventKind::LinkEnabled { id, enabled } => {
                links.insert(*id, *enabled);
            }
            EventKind::ValveEnabled { id, enabled } => {
                valves.insert(*id, *enabled);
            }
            EventKind::ClearMemory { .. } => {}
            EventKind::EdgeBlocked { edge, blocked } => {
                if *blocked {
                    closed_edges.insert(*edge);
                } else {
                    closed_edges.remove(edge);
                }
            }
        }
    }
    for birth in frame
        .state
        .construction
        .iter()
        .flat_map(|construction| &construction.births)
        .filter(|birth| birth.tick == frame.tick)
    {
        for link in &birth.body.links {
            links.insert(link.id, link.enabled);
        }
    }
    ensure(
        frame.state.closed_edges == closed_edges.into_iter().collect::<Vec<_>>(),
        "Movement edges changed outside their declared intervention prefix.",
    )?;
    ensure(
        frame
            .state
            .links
            .iter()
            .all(|link| links.get(&link.id) == Some(&link.enabled))
            && frame
                .state
                .valves
                .iter()
                .all(|valve| valves.get(&valve.id) == Some(&valve.enabled)),
        "A link or valve changed outside its declared intervention.",
    )?;
    let mut positions: BTreeMap<_, _> = previous
        .state
        .cells
        .iter()
        .map(|cell| (cell.id, cell.position))
        .collect();
    let mut activated = BTreeSet::new();
    let expected_order = expected_activation_order(experiment, &previous.state, frame.tick);
    let observed_order: Vec<_> = frame
        .activations
        .iter()
        .map(|activation| activation.cell)
        .collect();
    ensure(
        expected_order.starts_with(&observed_order),
        "Activations do not follow the declared seeded order.",
    )?;
    let mut activation_work = checked_work(&previous.costs)?;
    for activation in &frame.activations {
        let definition = construction::definition(experiment, &previous.state, activation.cell)
            .ok_or("An unknown or not-yet-eligible cell activated.")?;
        ensure(
            activated.insert(activation.cell),
            "A cell activated more than once in a tick.",
        )?;
        ensure(
            positions.get(&activation.cell) == Some(&activation.position_before),
            "An activation starts at the wrong location.",
        )?;
        ensure(
            activation.work_before >= activation_work
                && activation.work_after >= activation.work_before
                && activation.work_after <= checked_work(&frame.costs)?,
            "Activation work intervals are inconsistent.",
        )?;
        ensure(
            activation.work_after - activation.work_before <= u64::from(experiment.activation_fuel),
            "An activation exceeds its work allowance.",
        )?;
        activation_work = activation.work_after;
        let moved = activation.position_before != activation.position_after;
        ensure(
            !moved
                || (definition.mobile
                    && activation.success
                    && matches!(activation.action, Action::Move { .. })
                    && activation
                        .position_before
                        .distance(activation.position_after)
                        == 1),
            "A movement is nonlocal or has no successful movement action.",
        )?;
        ensure(
            !moved
                || !positions.iter().any(|(id, position)| {
                    *id != activation.cell && *position == activation.position_after
                }),
            "A movement crossed into an occupied cell.",
        )?;
        positions.insert(activation.cell, activation.position_after);
        if activation.success
            && let Action::Activate { blueprint } = activation.action
        {
            let birth = frame
                .state
                .construction
                .iter()
                .flat_map(|construction| &construction.births)
                .find(|birth| {
                    birth.blueprint == blueprint
                        && birth.parent == activation.cell
                        && birth.tick == frame.tick
                })
                .ok_or("Successful activation has no matching birth.")?;
            ensure(
                !positions.contains_key(&birth.body.cell.id)
                    && !positions
                        .values()
                        .any(|point| *point == birth.body.cell.position),
                "Birth overwrites an existing cell or position.",
            )?;
            positions.insert(birth.body.cell.id, birth.body.cell.position);
        }
        if let Some(rule) = activation.rule {
            ensure(
                definition
                    .program
                    .rules
                    .get(rule)
                    .is_some_and(|rule| rule.action == activation.action),
                "An activation names a different action than its selected rule.",
            )?;
        } else {
            ensure(
                matches!(activation.action, Action::Wait),
                "An unmatched policy performed an action other than waiting.",
            )?;
        }
    }
    ensure(
        !frame.complete || activated.len() == expected_order.len(),
        "A completed tick skipped a cell activation.",
    )?;
    ensure(
        frame
            .state
            .cells
            .iter()
            .all(|cell| positions.get(&cell.id) == Some(&cell.position)),
        "Final positions disagree with the activation trace.",
    )?;
    validate_action_effects(experiment, previous, frame)?;
    let copied_bytes = |state: &State| -> Result<u64, String> {
        let Some(construction) = &state.construction else {
            return Ok(0);
        };
        let staged: usize = construction
            .assemblies
            .iter()
            .map(|assembly| assembly.copied.len())
            .sum();
        let born = construction.births.iter().try_fold(0usize, |sum, birth| {
            serde_json::to_vec(&birth.body)
                .map(|bytes| sum + bytes.len())
                .map_err(|error| error.to_string())
        })?;
        Ok((staged + born) as u64)
    };
    let copying_work = |state: &State| {
        if experiment.version >= VARIATION_VERSION {
            construction::copying_work(experiment, state)
        } else {
            copied_bytes(state)
        }
    };
    let committed_copying = copying_work(&frame.state)?
        .checked_sub(copying_work(&previous.state)?)
        .ok_or("Copied construction history went backwards.")?;
    ensure(
        frame.costs.copying - previous.costs.copying >= committed_copying,
        "Committed copied bytes were not charged.",
    )?;
    if experiment.version >= VARIATION_VERSION {
        let (checking, count) = construction::edit_charges(experiment, &frame.state, frame.tick)?;
        ensure(
            frame.costs.checking - previous.costs.checking >= checking
                && frame.costs.memory_reads - previous.costs.memory_reads >= count
                && frame.costs.construction - previous.costs.construction >= count
                && frame.costs.actions - previous.costs.actions >= count,
            "Committed program editing was not charged.",
        )?;
    }
    for signal_event in &frame.signals {
        validate_signal(experiment, &frame.state, &signal_event.signal, initial)?;
        match signal_event.outcome.as_str() {
            "queued" => ensure(
                signal_event.signal.sent_tick == frame.tick,
                "A queued signal has the wrong send tick.",
            )?,
            "delivered" => ensure(
                signal_event.signal.deliver_tick == frame.tick,
                "A signal was delivered outside its scheduled tick.",
            )?,
            "consumed" => ensure(
                signal_event.signal.deliver_tick <= frame.tick,
                "A message was consumed before arrival.",
            )?,
            "expired" => ensure(
                signal_event.signal.deliver_tick < frame.tick,
                "A message expired before its delivery tick ended.",
            )?,
            "disabled" | "full" | "not_adjacent" => {}
            _ => return Err("Unknown signal outcome.".into()),
        }
    }
    let mut drain_prefix_ended = false;
    for definition in &experiment.beacons {
        let beacon = frame
            .state
            .beacons
            .iter()
            .find(|beacon| beacon.id == definition.id)
            .unwrap();
        let before = previous
            .state
            .beacons
            .iter()
            .find(|previous| previous.id == beacon.id)
            .unwrap();
        ensure(
            beacon.drained >= before.drained && (!before.exhausted || beacon.exhausted),
            "Service drain or exhaustion history was erased.",
        )?;
        ensure(
            beacon.exhausted == (before.exhausted || beacon.charge == 0),
            "Service exhaustion does not follow from its charge history.",
        )?;
        let replenished = u64::from(before.charge)
            + u64::from(beacon.delivered - before.delivered) * u64::from(definition.spark_charge);
        let drain = if frame.tick.is_multiple_of(definition.drain_every) {
            replenished.min(u64::from(definition.drain_amount))
        } else {
            0
        };
        let actual = u64::from(beacon.drained - before.drained);
        if frame.complete {
            ensure(
                actual == drain,
                "Completed tick drain differs from its declared schedule.",
            )?;
        } else {
            ensure(
                actual == 0 || (actual == drain && !drain_prefix_ended),
                "Partial tick drain is not a permitted prefix of service updates.",
            )?;
            if drain > 0 && actual == 0 {
                drain_prefix_ended = true;
            }
        }
    }
    Ok(())
}

fn turned(heading: Direction, relative: Relative) -> Direction {
    let heading = match heading {
        Direction::North => 0,
        Direction::East => 1,
        Direction::South => 2,
        Direction::West => 3,
    };
    let offset = match relative {
        Relative::Forward => 0,
        Relative::Right => 1,
        Relative::Back => 2,
        Relative::Left => 3,
    };
    [
        Direction::North,
        Direction::East,
        Direction::South,
        Direction::West,
    ][(heading + offset) % 4]
}

fn step(position: Point, direction: Direction) -> Option<Point> {
    match direction {
        Direction::North => position
            .y
            .checked_sub(1)
            .map(|y| Point { x: position.x, y }),
        Direction::East => position
            .x
            .checked_add(1)
            .map(|x| Point { x, y: position.y }),
        Direction::South => position
            .y
            .checked_add(1)
            .map(|y| Point { x: position.x, y }),
        Direction::West => position
            .x
            .checked_sub(1)
            .map(|x| Point { x, y: position.y }),
    }
}

/// Reconstruct the effects of recorded actions without calling the interpreter.
/// The fresh simulator replay separately validates which policy rule was selected.
fn validate_action_effects(
    experiment: &Experiment,
    previous: &Frame,
    frame: &Frame,
) -> Result<(), String> {
    let mut expected = previous.state.clone();
    for cell in &mut expected.cells {
        cell.inbox = [None, None, None, None];
    }
    for event in &frame.events {
        if let EventKind::LinkEnabled { id, enabled } = event {
            expected
                .links
                .iter_mut()
                .find(|link| link.id == *id)
                .ok_or("Unknown link intervention.")?
                .enabled = *enabled;
        }
        if let EventKind::ClearMemory { cell } = event {
            let cell = expected
                .cells
                .iter_mut()
                .find(|candidate| candidate.id == *cell)
                .ok_or("Memory intervention names an unknown cell.")?;
            cell.memory = [0; 4];
            cell.evidence = [None; 4];
        }
    }
    for event in frame
        .signals
        .iter()
        .filter(|event| event.outcome == "delivered")
    {
        let cell = expected
            .cells
            .iter_mut()
            .find(|cell| cell.id == event.signal.to_cell)
            .ok_or("Delivery targets an unknown cell.")?;
        let port = usize::from(event.signal.to_port);
        ensure(
            port < 4 && cell.inbox[port].is_none(),
            "Two signals were delivered into one occupied inbox slot.",
        )?;
        cell.inbox[port] = Some(event.signal.clone());
    }
    for activation in &frame.activations {
        let index = expected
            .cells
            .iter()
            .position(|cell| cell.id == activation.cell)
            .ok_or("Unknown action actor.")?;
        let position = expected.cells[index].position;
        let interrupted = matches!(
            activation.error.as_deref(),
            Some("fuel_exhausted" | "activation_limit")
        );
        if activation.success {
            ensure(
                activation.error.is_none(),
                "A successful action also reports a failure.",
            )?;
            match &activation.action {
                Action::Move { direction } => {
                    let heading = turned(expected.cells[index].heading, *direction);
                    let destination = step(position, heading)
                        .ok_or("Movement crosses the numeric coordinate boundary.")?;
                    ensure(
                        destination.x < experiment.width
                            && destination.y < experiment.height
                            && !experiment.walls.contains(&destination)
                            && !frame
                                .state
                                .closed_edges
                                .contains(&Edge::new(position, destination)),
                        "A move crosses blocked terrain.",
                    )?;
                    ensure(
                        !expected
                            .cells
                            .iter()
                            .any(|cell| cell.id != activation.cell && cell.position == destination)
                            && !construction::reserved(experiment, &expected, destination),
                        "A move enters an occupied tile.",
                    )?;
                    expected.cells[index].position = destination;
                    expected.cells[index].heading = heading;
                }
                Action::Turn { direction } => {
                    expected.cells[index].heading =
                        turned(expected.cells[index].heading, *direction)
                }
                Action::Pickup => {
                    ensure(
                        expected.cells[index].cargo.is_none(),
                        "Pickup overwrites existing cargo.",
                    )?;
                    let source_id = experiment
                        .sources
                        .iter()
                        .find(|source| source.position == position)
                        .ok_or("Pickup occurs away from a source.")?
                        .id;
                    let source = expected
                        .sources
                        .iter_mut()
                        .find(|source| source.id == source_id)
                        .unwrap();
                    ensure(
                        !source.sparks.is_empty(),
                        "Pickup creates a spark from an empty source.",
                    )?;
                    expected.cells[index].cargo = Some(source.sparks.remove(0));
                }
                Action::Drop => {
                    let spark = expected.cells[index]
                        .cargo
                        .ok_or("Drop occurs without cargo.")?;
                    if let Some(depot) = experiment
                        .depots
                        .iter()
                        .find(|depot| depot.position == position)
                    {
                        let destination = expected
                            .depots
                            .iter_mut()
                            .find(|candidate| candidate.id == depot.id)
                            .unwrap();
                        ensure(
                            destination.sparks.len() < usize::from(depot.capacity),
                            "Drop exceeds depot capacity.",
                        )?;
                        destination.sparks.push(spark);
                    } else {
                        let beacon = experiment
                            .beacons
                            .iter()
                            .find(|beacon| beacon.position == position)
                            .ok_or("Drop occurs away from a receiver.")?;
                        ensure(
                            beacon.accepts == spark.bit,
                            "Drop credits the wrong typed beacon.",
                        )?;
                        expected.delivered.push(Delivery {
                            tick: frame.tick,
                            spark,
                            beacon: beacon.id,
                        });
                    }
                    expected.cells[index].cargo = None;
                }
                Action::WriteMemory { slot, value } => {
                    expected.cells[index].memory[usize::from(*slot)] = *value;
                    expected.cells[index].evidence[usize::from(*slot)] = None;
                }
                Action::TakeMessage { port, slot } => {
                    let signal = expected.cells[index].inbox[usize::from(*port)]
                        .take()
                        .ok_or("Memory load has no delivered message.")?;
                    expected.cells[index].memory[usize::from(*slot)] = u8::from(signal.bit);
                    expected.cells[index].evidence[usize::from(*slot)] = signal.receipt_spark;
                }
                Action::Route { valve, bit } => {
                    let valve = experiment
                        .valves
                        .iter()
                        .find(|candidate| candidate.id == *valve)
                        .ok_or("Route uses an unknown valve.")?;
                    ensure(
                        position.distance(valve.position) == 1,
                        "Route operates a non-adjacent valve.",
                    )?;
                    ensure(
                        frame
                            .state
                            .valves
                            .iter()
                            .find(|candidate| candidate.id == valve.id)
                            .unwrap()
                            .enabled,
                        "Route operates a disabled valve.",
                    )?;
                    let choice = match bit {
                        BitSource::Constant { value } => *value,
                        BitSource::Memory { slot } => {
                            expected.cells[index].memory[usize::from(*slot)] != 0
                        }
                        BitSource::Message { port } => {
                            expected.cells[index].inbox[usize::from(*port)]
                                .as_ref()
                                .ok_or("Route reads an absent message.")?
                                .bit
                        }
                    };
                    let depot = expected
                        .depots
                        .iter_mut()
                        .find(|candidate| candidate.id == valve.depot)
                        .unwrap();
                    ensure(
                        !depot.sparks.is_empty(),
                        "Route creates stock from an empty depot.",
                    )?;
                    let spark = depot.sparks.remove(0);
                    let beacon_id = if choice {
                        valve.beacon_one
                    } else {
                        valve.beacon_zero
                    };
                    let beacon = experiment
                        .beacons
                        .iter()
                        .find(|candidate| candidate.id == beacon_id)
                        .unwrap();
                    ensure(
                        beacon.accepts == spark.bit,
                        "Route credits the wrong typed service.",
                    )?;
                    expected.delivered.push(Delivery {
                        tick: frame.tick,
                        spark,
                        beacon: beacon_id,
                    });
                }
                Action::GatherMaterial { .. }
                | Action::Build { .. }
                | Action::Activate { .. }
                | Action::EditDirection { .. } => {
                    construction::apply(
                        experiment,
                        &mut expected,
                        index,
                        &activation.action,
                        frame.tick,
                    )?;
                }
                Action::Gather | Action::Supply { .. } | Action::Fetch { .. } => {
                    industry::apply(experiment, &mut expected, index, &activation.action)?;
                }
                Action::Wait | Action::Send { .. } => {}
            }
        } else {
            ensure(
                activation.error.is_some(),
                "An unsuccessful action has no recorded reason.",
            )?;
        }
        if !interrupted
            && let Some(rule) = activation.rule
            && let Some(write) =
                &construction::definition(experiment, &previous.state, activation.cell)
                    .ok_or("No admitted actor definition.")?
                    .program
                    .rules[rule]
                    .remember
        {
            expected.cells[index].memory[usize::from(write.slot)] = write.value;
            expected.cells[index].evidence[usize::from(write.slot)] = None;
        }
        ensure(
            expected.cells[index].position == activation.position_after,
            "Movement direction disagrees with its recorded destination.",
        )?;
    }
    // The world facility step is atomic: its modeled charges precede any
    // mutation, so an interrupted tick leaves either the untouched or the
    // fully processed set.
    let before_tick = expected.facilities.clone();
    crate::industry::tick(experiment, &mut expected);
    ensure(
        expected.facilities == frame.state.facilities
            || (!frame.complete && before_tick == frame.state.facilities),
        "Recorded actions do not explain the facility transition.",
    )?;
    ensure(
        expected.sources == frame.state.sources
            && expected.depots == frame.state.depots
            && expected.delivered == frame.state.delivered,
        "Recorded actions do not explain the stock or delivery transition.",
    )?;
    ensure(
        expected.construction == frame.state.construction
            && expected.links == frame.state.links
            && expected.cells.len() == frame.state.cells.len(),
        "Recorded actions do not explain construction, identities, or wiring.",
    )?;
    for expected in &expected.cells {
        let actual = frame
            .state
            .cells
            .iter()
            .find(|cell| cell.id == expected.id)
            .unwrap();
        ensure(
            expected.cargo == actual.cargo
                && expected.material == actual.material
                && expected.part == actual.part
                && expected.frame == actual.frame
                && expected.position == actual.position
                && expected.heading == actual.heading
                && expected.memory == actual.memory
                && expected.evidence == actual.evidence,
            "Recorded actions do not explain a cell's cargo, memory, or movement.",
        )?;
    }
    Ok(())
}

/// A bounded observer view of an already verified receipt; no state is advanced.
pub fn render_receipt(receipt: &Receipt) -> String {
    let mut text = format!(
        "{}\nmission passed: {}\n{}\n",
        receipt.protocol,
        receipt.passed(),
        receipt.experiment_hash
    );
    let frames = &receipt.result.frames;
    let mut chosen = BTreeSet::from([0, frames.len().saturating_sub(1)]);
    if frames.len() > 1 {
        chosen.insert(1);
        chosen.insert(frames.len() / 2);
    }
    for (index, frame) in frames
        .iter()
        .enumerate()
        .filter(|(_, frame)| !frame.events.is_empty())
        .take(4)
    {
        let _ = frame;
        chosen.insert(index);
    }
    for index in chosen {
        let frame = &frames[index];
        let _ = writeln!(
            text,
            "\ntick {} · complete {} · work {}",
            frame.tick,
            frame.complete,
            checked_work(&frame.costs).unwrap_or(0)
        );
        for y in 0..receipt.experiment.height {
            for x in 0..receipt.experiment.width {
                let point = Point { x, y };
                let symbol = if let Some(cell) =
                    frame.state.cells.iter().find(|cell| cell.position == point)
                {
                    if cell.cargo.is_some() { '*' } else { 'c' }
                } else if receipt.experiment.walls.contains(&point) {
                    '#'
                } else if receipt
                    .experiment
                    .sources
                    .iter()
                    .any(|source| source.position == point)
                {
                    'S'
                } else if receipt
                    .experiment
                    .depots
                    .iter()
                    .any(|depot| depot.position == point)
                {
                    'D'
                } else if receipt
                    .experiment
                    .beacons
                    .iter()
                    .any(|beacon| beacon.position == point)
                {
                    'B'
                } else {
                    '.'
                };
                text.push(symbol);
            }
            text.push('\n');
        }
        for beacon in &frame.state.beacons {
            let _ = writeln!(
                text,
                "beacon {}: charge {}, deliveries {}, drained {}",
                beacon.id, beacon.charge, beacon.delivered, beacon.drained
            );
        }
        for cell in &frame.state.cells {
            let _ = writeln!(
                text,
                "cell {}: ({},{}), memory {:?}, cargo {:?}",
                cell.id,
                cell.position.x,
                cell.position.y,
                cell.memory,
                cell.cargo.map(|spark| spark.id)
            );
        }
    }
    text.push_str("\nLegend: c cell, * carrying cell, S source, D depot, B beacon, # wall.\nVerification recomputed this recorded experiment; no saved world was advanced.\n");
    text
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixtures;

    #[test]
    fn streaming_hash_preserves_buffered_canonical_bytes() {
        fn buffered<T: Serialize>(value: &T) -> String {
            let bytes = serde_json::to_vec(value).unwrap();
            format!("sha256:{:x}", Sha256::digest(bytes))
        }

        type Entries = BTreeMap<String, Vec<Option<(u64, bool, String)>>>;
        #[derive(Serialize)]
        struct Nested {
            label: String,
            entries: Entries,
        }
        let nested = Nested {
            label: "Moth\n\"quoted\"\\tab\t\0 — λ 🦋".into(),
            entries: BTreeMap::from([
                (
                    "z-last".into(),
                    vec![None, Some((u64::MAX, false, "\r\n".into()))],
                ),
                (
                    "a-first".into(),
                    vec![Some((0, true, "雪\u{0008}\u{000c}".repeat(1024)))],
                ),
            ]),
        };
        assert_eq!(artifact_hash(&nested).unwrap(), buffered(&nested));
        assert_eq!(
            artifact_hash(&Vec::<u8>::new()).unwrap(),
            buffered(&Vec::<u8>::new())
        );

        let receipt = make_receipt(&fixtures::experiment("ark-plan-a").unwrap()).unwrap();
        assert_eq!(receipt.experiment_hash, buffered(&receipt.experiment));
        assert_eq!(receipt.result_hash, buffered(&receipt.result));
        assert_eq!(artifact_hash(&receipt).unwrap(), buffered(&receipt));
        assert!(verify_receipt(&receipt).unwrap().verified);
    }

    #[test]
    fn independently_rejects_created_resources_and_unearned_memory() {
        let experiment = fixtures::experiment("opening-normal").unwrap();
        let receipt = make_receipt(&experiment).unwrap();
        let mut duplicate = receipt.result.clone();
        let spark = duplicate.frames[0].state.sources[0].sparks[0];
        duplicate.frames[0].state.cells[0].cargo = Some(spark);
        assert!(
            validate_result(&experiment, &duplicate)
                .unwrap_err()
                .contains("more than one")
        );

        let mut memory = receipt.result.clone();
        memory.frames[1].state.cells[0].memory[0] ^= 1;
        assert!(
            validate_result(&experiment, &memory)
                .unwrap_err()
                .contains("memory")
        );

        let mut outcome = receipt.result.clone();
        outcome.outcome.passed = !outcome.outcome.passed;
        assert!(
            validate_result(&experiment, &outcome)
                .unwrap_err()
                .contains("outcome")
        );
    }

    #[test]
    fn rehashing_fabricated_work_does_not_make_a_receipt_valid() {
        let experiment = fixtures::experiment("opening-normal").unwrap();
        let mut receipt = make_receipt(&experiment).unwrap();
        for frame in &mut receipt.result.frames {
            frame.costs.checking += 1;
        }
        receipt.result.costs.checking += 1;
        receipt.result_hash = artifact_hash(&receipt.result).unwrap();
        assert!(verify_receipt(&receipt).is_err());

        let mut overflow = receipt.result;
        overflow.frames[0].costs.loading = u64::MAX;
        overflow.frames[0].costs.checking = 1;
        assert!(
            validate_result(&experiment, &overflow)
                .unwrap_err()
                .contains("overflow")
        );
    }

    #[test]
    fn budget_interruptions_preserve_lawful_partial_receipts() {
        let reference = fixtures::experiment("ark-plan-a").unwrap();
        let complete = run(&reference).unwrap();
        let mut budgets = BTreeSet::from([0, 1, 100, 1000]);
        for frame in complete
            .frames
            .iter()
            .filter(|frame| frame.tick < 4 || !frame.events.is_empty() || !frame.signals.is_empty())
            .take(16)
        {
            let work = checked_work(&frame.costs).unwrap();
            for difference in 0..3 {
                budgets.insert(work.saturating_sub(difference));
            }
        }
        for fuel in budgets {
            let mut experiment = reference.clone();
            experiment.fuel = fuel;
            let receipt =
                make_receipt(&experiment).unwrap_or_else(|error| panic!("fuel {fuel}: {error}"));
            assert!(checked_work(&receipt.result.costs).unwrap() <= fuel);
            assert!(verify_receipt(&receipt).unwrap().verified);
        }
        let mut limited = reference;
        limited.activation_fuel = 1;
        let receipt = make_receipt(&limited).unwrap();
        assert_eq!(receipt.result.status, RunStatus::ActivationLimit);
        assert!(!receipt.passed());
        assert!(verify_receipt(&receipt).unwrap().verified);
    }

    #[test]
    fn message_timing_and_intervention_state_are_checked_independently() {
        let experiment = fixtures::experiment("ark-plan-a").unwrap();
        let receipt = make_receipt(&experiment).unwrap();
        let mut early = receipt.result.clone();
        let frame = early
            .frames
            .iter_mut()
            .find(|frame| !frame.state.pending.is_empty())
            .unwrap();
        frame.state.pending[0].deliver_tick = frame.tick;
        assert!(validate_result(&experiment, &early).is_err());

        let mut intervention = receipt.result;
        let frame = intervention
            .frames
            .iter_mut()
            .find(|frame| !frame.events.is_empty())
            .unwrap();
        frame.events.clear();
        assert!(
            validate_result(&experiment, &intervention)
                .unwrap_err()
                .contains("interventions")
        );
    }
}

/// Kani bounded model-checking harnesses (`cargo kani -p platonik-core`).
///
/// These cover the receipt arithmetic and identity helpers rather than the
/// full simulator replay — `verify_receipt` re-executes the world, which is
/// too large a model for CBMC; what *is* proven here is that cost summation
/// never wraps silently and that frame-id equality is exactly set equality
/// with distinctness.
#[cfg(kani)]
mod proofs {
    use super::*;

    fn any_costs() -> Costs {
        Costs {
            loading: kani::any(),
            scheduling: kani::any(),
            conditions: kani::any(),
            sensors: kani::any(),
            memory_reads: kani::any(),
            memory_writes: kani::any(),
            actions: kani::any(),
            messages: kani::any(),
            transfers: kani::any(),
            checking: kani::any(),
            draining: kani::any(),
            copying: kani::any(),
            construction: kani::any(),
        }
    }

    /// `checked_work` returns the exact arithmetic sum of all thirteen
    /// counters, or fails — it can never silently wrap.
    #[kani::proof]
    #[kani::unwind(16)]
    fn checked_work_never_wraps() {
        let costs = any_costs();
        let expected = counters(&costs)
            .iter()
            .fold(0u128, |sum, &value| sum + value as u128);
        match checked_work(&costs) {
            Ok(work) => {
                assert_eq!(work as u128, expected);
                assert!(expected <= u64::MAX as u128);
            }
            Err(_) => {
                assert!(expected > u64::MAX as u128);
            }
        }
    }

    /// `ids_match` accepts exactly when the observed ids are a permutation
    /// of the expected ids with no duplicates — a frame can neither replay
    /// nor omit an id.
    #[kani::proof]
    #[kani::unwind(10)]
    fn ids_match_is_set_equality_with_distinctness() {
        let n: usize = kani::any();
        kani::assume(n <= 3);
        let m: usize = kani::any();
        kani::assume(m <= 3);
        let mut expected = Vec::with_capacity(n);
        let mut observed = Vec::with_capacity(m);
        for _ in 0..n {
            expected.push(kani::any::<u16>() % 4);
        }
        for _ in 0..m {
            observed.push(kani::any::<u16>() % 4);
        }
        let result = ids_match(expected.iter().copied(), observed.iter().copied());
        // Check side is plain O(n²) loops — no BTreeSet, which is the
        // expensive part for the solver and already exercised inside
        // `ids_match` itself.
        let mut distinct = true;
        for i in 0..observed.len() {
            for j in (i + 1)..observed.len() {
                if observed[i] == observed[j] {
                    distinct = false;
                }
            }
        }
        let mut same_set = expected.len() == observed.len();
        for &e in &expected {
            same_set &= observed.contains(&e);
        }
        for &o in &observed {
            same_set &= expected.contains(&o);
        }
        assert_eq!(result, distinct && same_set);
    }
}
