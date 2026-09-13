//! A typed, Rust-authoritative continuity grade for one selected Bloom child.
//!
//! This is deliberately a reduced one-lane adapter over the verified Bloom v4
//! receipt. It binds the generated child to a post-selection request, a
//! physical depot-origin confirmation report, and service while conserving the
//! losing candidate's confirmation parcel. It does not claim the separate v3
//! two-lane Ports commitment contract.
use crate::{bloom, bloom_fixtures, check, continuation, model::*};
use serde::{Deserialize, Serialize};

pub const SCHEMA: &str = "platonik-bloom-continuation-v1";

/// Public one-lane composition cases. Each case keeps Bloom's two-candidate
/// generation phase, then admits only the selected child into this adapter
/// lane. The underlying worlds stay immutable Bloom v4 fixtures.
const CASES: &[&str] = &["bloom-left", "bloom-crossing-right"];

pub fn case_ids() -> &'static [&'static str] {
    CASES
}

pub fn experiment(id: &str) -> Result<Experiment, String> {
    if CASES.contains(&id) {
        bloom_fixtures::experiment(id)
    } else {
        Err(format!("unknown Bloom composition case: {id}"))
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Moment {
    pub tick: u32,
    pub sent_tick: u32,
    pub signal: u64,
    pub link: u16,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Confirmation {
    pub request: Moment,
    pub pickup: u32,
    pub accepted: u32,
    pub acknowledgment: Moment,
    pub serviced: u32,
    pub receipt_spark: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CompositionGrade {
    pub schema: String,
    pub experiment_hash: String,
    pub result_hash: String,
    pub bloom_grade_hash: String,
    pub selected_child: u16,
    pub selected_program_hash: String,
    pub confirmation: Confirmation,
    pub loser_source: u16,
    pub loser_spare: u32,
    pub work_total: u64,
    pub composition_passed: bool,
}

fn cell(frame: &Frame, id: u16) -> Option<&CellState> {
    frame.state.cells.iter().find(|cell| cell.id == id)
}
fn unique_pickup(frames: &[Frame], child: u16, point: Point, parcel: Spark) -> Option<u32> {
    let values: Vec<_> = frames
        .windows(2)
        .filter_map(|pair| {
            let before = cell(&pair[0], child)?;
            let after = cell(&pair[1], child)?;
            (before.cargo.is_none()
                && after.cargo == Some(parcel)
                && pair[1].activations.iter().any(|activation| {
                    activation.cell == child
                        && activation.success
                        && activation.action == Action::Pickup
                        && activation.position_before == point
                }))
            .then_some(pair[1].tick)
        })
        .collect();
    (values.len() == 1).then(|| values[0])
}
fn unique_drop(frames: &[Frame], child: u16, point: Point, parcel: Spark) -> Option<u32> {
    let values: Vec<_> = frames
        .windows(2)
        .filter_map(|pair| {
            (cell(&pair[0], child)?.cargo == Some(parcel)
                && pair[1].activations.iter().any(|activation| {
                    activation.cell == child
                        && activation.success
                        && activation.action == Action::Drop
                        && activation.position_before == point
                }))
            .then_some(pair[1].tick)
        })
        .collect();
    (values.len() == 1).then(|| values[0])
}

/// Grade only after `check::verify_receipt` has freshly replayed the exact
/// experiment. Every predicate below is derived from that replayed trace.
pub fn grade_receipt(receipt: &check::Receipt) -> Result<CompositionGrade, String> {
    check::verify_receipt(receipt)?;
    let bloom = bloom::grade_receipt(receipt)?;
    if !bloom.bloomed {
        return Err("Bloom continuation requires a bloomed receipt.".into());
    }
    let selection = bloom
        .selection
        .as_ref()
        .ok_or("Bloom selection is missing.")?;
    let winner = bloom
        .candidates
        .iter()
        .find(|candidate| candidate.id == selection.candidate)
        .ok_or("Selected Bloom candidate is missing.")?;
    let loser = bloom
        .candidates
        .iter()
        .find(|candidate| candidate.id != selection.candidate)
        .ok_or("Losing Bloom candidate is missing.")?;
    let berth = bloom_fixtures::BERTHS
        .iter()
        .find(|berth| berth.id == selection.candidate)
        .ok_or("Selected Bloom berth is missing.")?;
    let frames = &receipt.result.frames;
    let last = frames.last().ok_or("Receipt has no final frame.")?;
    let birth = last
        .state
        .construction
        .as_ref()
        .and_then(|construction| {
            construction.births.iter().find(|birth| {
                birth.blueprint == winner.blueprint
                    && birth.parent == winner.builder
                    && birth.body.cell.id == winner.child
            })
        })
        .ok_or("Selected child birth is missing.")?;
    let selected_program_hash = check::artifact_hash(&birth.body.cell.program)?;
    if winner.program_hash.as_deref() != Some(selected_program_hash.as_str()) {
        return Err("Selected child hash is not bound to its birth event.".into());
    }
    let request_event = frames
        .iter()
        .flat_map(|frame| frame.signals.iter().map(move |event| (frame.tick, event)))
        .find(|(_, event)| {
            event.outcome == "consumed"
                && event.signal.from
                    == (Endpoint::Cell {
                        id: bloom_fixtures::SELECTOR,
                        port: berth.id,
                    })
                && event.signal.to_cell == winner.child
                && event.signal.to_port == 0
                && event.signal.link == berth.command_link
                && event.signal.bit
                && event.signal.sent_tick >= bloom_fixtures::CONFIRMATION_OPENS
                && event.signal.sent_tick > selection.tick
        })
        .ok_or("Selected child request is missing or bypassed.")?;
    let request = &request_event.1.signal;
    let confirmation = Spark {
        id: winner.confirmation_parcel,
        bit: false,
    };
    let source = receipt
        .experiment
        .sources
        .iter()
        .find(|source| source.id == winner.source)
        .ok_or("Selected source is missing.")?;
    let pickup = unique_pickup(frames, winner.child, source.position, confirmation)
        .ok_or("Selected confirmation pickup is not unique.")?;
    let depot = receipt
        .experiment
        .depots
        .iter()
        .find(|depot| depot.id == winner.depot)
        .ok_or("Selected depot is missing.")?;
    let accepted = unique_drop(frames, winner.child, depot.position, confirmation)
        .ok_or("Selected confirmation acceptance is not unique.")?;
    if !(request.sent_tick < pickup && pickup <= accepted) {
        return Err("Confirmation chronology is invalid.".into());
    }
    let ack_event = frames
        .iter()
        .flat_map(|frame| frame.signals.iter().map(move |event| (frame.tick, event)))
        .find(|(_, event)| {
            event.outcome == "consumed"
                && event.signal.from == (Endpoint::Depot { id: winner.depot })
                && event.signal.to_cell == bloom_fixtures::RELAY
                && event.signal.link == berth.report_link
                && event.signal.receipt_spark == Some(winner.confirmation_parcel)
                && event.signal.sent_tick >= accepted
        })
        .ok_or("Depot-origin confirmation report is missing.")?;
    let ack = &ack_event.1.signal;
    if ack_event.0 < pickup || ack_event.0 < accepted {
        return Err("Confirmation report arrived before custody.".into());
    }
    let serviced = last
        .state
        .delivered
        .iter()
        .find(|delivery| delivery.spark == confirmation && delivery.beacon == 20)
        .map(|delivery| delivery.tick)
        .ok_or("Selected confirmation was not physically serviced.")?;
    if serviced < ack_event.0 {
        return Err("Service preceded the depot acknowledgment.".into());
    }
    let spare = Spark {
        id: loser.confirmation_parcel,
        bit: false,
    };
    if !frames.iter().all(|frame| {
        frame
            .state
            .sources
            .iter()
            .any(|source| source.id == loser.source && source.sparks.contains(&spare))
    }) {
        return Err("Losing confirmation spare was spent or discarded.".into());
    }
    let work_total = last.costs.total();
    Ok(CompositionGrade {
        schema: SCHEMA.into(),
        experiment_hash: receipt.experiment_hash.clone(),
        result_hash: receipt.result_hash.clone(),
        bloom_grade_hash: check::artifact_hash(&bloom)?,
        selected_child: winner.child,
        selected_program_hash,
        confirmation: Confirmation {
            request: Moment {
                tick: request.deliver_tick,
                sent_tick: request.sent_tick,
                signal: request.id,
                link: request.link,
            },
            pickup,
            accepted,
            acknowledgment: Moment {
                tick: ack_event.0,
                sent_tick: ack.sent_tick,
                signal: ack.id,
                link: ack.link,
            },
            serviced,
            receipt_spark: winner.confirmation_parcel,
        },
        loser_source: loser.source,
        loser_spare: loser.confirmation_parcel,
        work_total,
        composition_passed: true,
    })
}

/// Grade an already verified advance, useful to callers that are composing a
/// paused continuation without serializing a receipt first.
pub fn grade(
    experiment: &Experiment,
    advance: &continuation::Advance,
) -> Result<CompositionGrade, String> {
    let result = match advance {
        continuation::Advance::Finished(result) => result,
        continuation::Advance::Paused(_) => {
            return Err("Composition requires a finished receipt.".into());
        }
    };
    let receipt = check::Receipt {
        schema: check::RECEIPT_SCHEMA.into(),
        protocol: result.protocol.clone(),
        experiment_hash: check::artifact_hash(experiment)?,
        result_hash: check::artifact_hash(result)?,
        experiment: experiment.clone(),
        result: result.clone(),
    };
    grade_receipt(&receipt)
}
