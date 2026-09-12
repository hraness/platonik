//! Two one-shot custody obligations over ordinary v3 local programs.
//! An acknowledgment certifies depot acceptance, not later beacon service.
//! Signal and parcel identities are checker evidence, never policy sensors.
use crate::{check, continuation, model::*, port_fixtures};
use serde::{Deserialize, Serialize};

pub const SCHEMA: &str = "platonik-port-commitments-v1";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    InProgress,
    Complete,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReportMoment {
    pub tick: u32,
    pub signal: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CommitmentGrade {
    pub lane: u8,
    pub parcel: u32,
    pub spare: u32,
    pub bit: bool,
    pub source: u16,
    pub courier: u16,
    pub requester: u16,
    pub depot: u16,
    pub beacon: u16,
    pub requested: Option<ReportMoment>,
    pub picked_up: Option<u32>,
    pub accepted: Option<u32>,
    pub acknowledged: Option<ReportMoment>,
    pub serviced: Option<u32>,
    pub custody_passed: bool,
    pub acknowledgment_passed: bool,
    pub spare_preserved: bool,
    pub safety_passed: bool,
    pub request_attempts: u32,
    pub ack_attempts: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PortsGrade {
    pub schema: String,
    pub experiment_hash: String,
    pub evidence_hash: String,
    pub result_hash: Option<String>,
    pub tick: u32,
    pub horizon: u32,
    pub phase: Phase,
    pub commitments: Vec<CommitmentGrade>,
    pub custody_passed: bool,
    pub acknowledgments_passed: bool,
    pub safety_passed: bool,
    pub service_passed: bool,
    pub commitments_passed: bool,
}

pub fn grade(
    experiment: &Experiment,
    advance: &continuation::Advance,
) -> Result<PortsGrade, String> {
    match advance {
        continuation::Advance::Paused(checkpoint) => {
            if checkpoint.experiment != *experiment {
                return Err("Port prefix belongs to another experiment.".into());
            }
            continuation::verify_checkpoint(checkpoint)?;
        }
        continuation::Advance::Finished(result) => {
            check::verify_receipt(&check::Receipt {
                schema: check::RECEIPT_SCHEMA.into(),
                protocol: result.protocol.clone(),
                experiment_hash: check::artifact_hash(experiment)?,
                result_hash: check::artifact_hash(result)?,
                experiment: experiment.clone(),
                result: result.clone(),
            })?;
        }
    }
    grade_verified(experiment, advance)
}

pub fn grade_receipt(receipt: &check::Receipt) -> Result<PortsGrade, String> {
    check::verify_receipt(receipt)?;
    grade_verified(
        &receipt.experiment,
        &continuation::Advance::Finished(receipt.result.clone()),
    )
}

fn consumed(
    frame: &Frame,
    sender: u16,
    sender_port: u8,
    recipient: u16,
    bit: bool,
) -> Option<&Signal> {
    frame.signals.iter().find_map(|event| {
        (event.outcome == "consumed"
            && event.signal.from
                == (Endpoint::Cell {
                    id: sender,
                    port: sender_port,
                })
            && event.signal.to_cell == recipient
            && event.signal.to_port == 0
            && event.signal.bit == bit)
            .then_some(&event.signal)
    })
}

// Bind the network relay's outgoing report to the actual incoming local
// message and successful forward action in that same activation frame.
fn forwarded_from(
    frames: &[Frame],
    outgoing: &Signal,
    origin: u16,
    relay: u16,
    port: u8,
    link: u16,
) -> bool {
    frames
        .iter()
        .find(|frame| frame.tick == outgoing.sent_tick)
        .is_some_and(|frame| {
            frame.activations.iter().any(|activation| {
                activation.cell == relay
                    && activation.success
                    && activation.action
                        == (Action::Send {
                            port,
                            bit: BitSource::Message { port },
                        })
            }) && frame.signals.iter().any(|event| {
                event.outcome == "delivered"
                    && event.signal.link == link
                    && event.signal.from
                        == (Endpoint::Cell {
                            id: origin,
                            port: 0,
                        })
                    && event.signal.to_cell == relay
                    && event.signal.to_port == port
                    && event.signal.bit == outgoing.bit
                    && event.signal.receipt_spark == outgoing.receipt_spark
            })
        })
}

fn send_attempts(frames: &[Frame], cell: u16) -> u32 {
    frames
        .iter()
        .flat_map(|frame| &frame.activations)
        .filter(|activation| {
            activation.cell == cell && matches!(activation.action, Action::Send { port: 0, .. })
        })
        .count() as u32
}

/// For callers that have already freshly replayed this exact input.
/// Competitive admission additionally binds all non-policy world fields to
/// the frozen cases; this descriptive grade is not a substitute for that gate.
pub fn grade_verified(
    experiment: &Experiment,
    advance: &continuation::Advance,
) -> Result<PortsGrade, String> {
    let (frames, finished) = match advance {
        continuation::Advance::Paused(checkpoint) => {
            if checkpoint.experiment != *experiment {
                return Err("Port prefix belongs to another experiment.".into());
            }
            (&checkpoint.frames, None)
        }
        continuation::Advance::Finished(result) => (&result.frames, Some(result)),
    };
    if experiment.version != CONSTRUCTION_VERSION || experiment.ticks != 128 {
        return Err("Port commitments require a 128-tick habitat-v3 world.".into());
    }
    let last = frames
        .last()
        .ok_or("Port evidence is missing its loaded frame.")?;
    let mut commitments = Vec::new();
    for lane in port_fixtures::LANES {
        let source = experiment
            .sources
            .iter()
            .find(|source| source.id == lane.source)
            .ok_or("Missing declared port source.")?;
        let depot = experiment
            .depots
            .iter()
            .find(|depot| depot.id == lane.depot)
            .ok_or("Missing receiving depot.")?;
        let requester = experiment
            .cells
            .iter()
            .find(|cell| cell.id == lane.requester)
            .ok_or("Missing requesting endpoint.")?;
        if requester.memory[2] > 1 {
            return Err("Port request must declare a single bit in memory slot two.".into());
        }
        let bit = requester.memory[2] != 0;
        let parcel = Spark {
            id: lane.parcel,
            bit,
        };
        let spare = Spark {
            id: lane.spare,
            bit,
        };
        let beacon = if bit {
            lane.beacon_one
        } else {
            lane.beacon_zero
        };
        let requested = frames.iter().find_map(|frame| {
            consumed(frame, lane.network_relay, 0, lane.courier, bit)
                .filter(|signal| {
                    [lane.request_links[1], lane.duplicate_request].contains(&signal.link)
                        && forwarded_from(
                            frames,
                            signal,
                            lane.requester,
                            lane.network_relay,
                            0,
                            lane.request_links[0],
                        )
                })
                .map(|signal| ReportMoment {
                    tick: frame.tick,
                    signal: signal.id,
                })
        });
        let pickups: Vec<_> = frames
            .windows(2)
            .filter_map(|pair| {
                let before = pair[0]
                    .state
                    .cells
                    .iter()
                    .find(|cell| cell.id == lane.courier)?;
                let after = pair[1]
                    .state
                    .cells
                    .iter()
                    .find(|cell| cell.id == lane.courier)?;
                (before.cargo.is_none()
                    && after.cargo == Some(parcel)
                    && pair[1].activations.iter().any(|activation| {
                        activation.cell == lane.courier
                            && activation.success
                            && activation.action == Action::Pickup
                            && activation.position_before == source.position
                    }))
                .then_some(pair[1].tick)
            })
            .collect();
        let drops: Vec<_> = frames
            .windows(2)
            .filter_map(|pair| {
                let before = pair[0]
                    .state
                    .cells
                    .iter()
                    .find(|cell| cell.id == lane.courier)?;
                (before.cargo == Some(parcel)
                    && pair[1].activations.iter().any(|activation| {
                        activation.cell == lane.courier
                            && activation.success
                            && activation.action == Action::Drop
                            && activation.position_before == depot.position
                    }))
                .then_some(pair[1].tick)
            })
            .collect();
        let picked_up = pickups.first().copied();
        let accepted = drops.first().copied();
        let acknowledged = frames.iter().find_map(|frame| {
            consumed(frame, lane.network_relay, 1, lane.requester, bit)
                .filter(|signal| {
                    accepted.is_some_and(|tick| signal.sent_tick > tick)
                        && signal.receipt_spark == Some(lane.parcel)
                        && [lane.ack_links[1], lane.duplicate_ack].contains(&signal.link)
                        && forwarded_from(
                            frames,
                            signal,
                            lane.courier,
                            lane.network_relay,
                            1,
                            lane.ack_links[0],
                        )
                })
                .map(|signal| ReportMoment {
                    tick: frame.tick,
                    signal: signal.id,
                })
        });
        let services: Vec<_> = last
            .state
            .delivered
            .iter()
            .filter(|delivery| delivery.spark == parcel)
            .collect();
        let serviced = services
            .iter()
            .find(|delivery| delivery.beacon == beacon)
            .map(|delivery| delivery.tick);
        let custody_passed = source.sparks.first() == Some(&parcel)
            && pickups.len() == 1
            && drops.len() == 1
            && requested
                .as_ref()
                .zip(picked_up)
                .is_some_and(|(request, tick)| request.tick < tick)
            && picked_up
                .zip(accepted)
                .is_some_and(|(pickup, drop)| pickup < drop);
        let acknowledgment_passed = custody_passed && acknowledged.is_some();
        let spare_preserved = source.sparks.get(1) == Some(&spare)
            && frames.iter().all(|frame| {
                frame
                    .state
                    .sources
                    .iter()
                    .any(|entry| entry.id == lane.source && entry.sparks.contains(&spare))
            });
        // A duplicate acknowledgment is harmless only if it reports an already
        // accepted parcel. Include failed/disabled sends: attempted false claims
        // must not become safe merely because their channel happened to be down.
        let truthful_acks = frames.iter().all(|frame| {
            frame.signals.iter().all(|event| {
                event.signal.from
                    != (Endpoint::Cell {
                        id: lane.courier,
                        port: 0,
                    })
                    || (accepted.is_some_and(|tick| event.signal.sent_tick > tick)
                        && event.signal.bit == bit
                        && event.signal.receipt_spark == Some(lane.parcel))
            })
        });
        let correct_service = services.len() <= 1
            && services.iter().all(|delivery| {
                delivery.beacon == beacon && accepted.is_some_and(|tick| delivery.tick >= tick)
            });
        let safety_passed = spare_preserved && truthful_acks && correct_service;
        commitments.push(CommitmentGrade {
            lane: lane.id,
            parcel: lane.parcel,
            spare: lane.spare,
            bit,
            source: lane.source,
            courier: lane.courier,
            requester: lane.requester,
            depot: lane.depot,
            beacon,
            requested,
            picked_up,
            accepted,
            acknowledged,
            serviced,
            custody_passed,
            acknowledgment_passed,
            spare_preserved,
            safety_passed,
            request_attempts: send_attempts(frames, lane.requester),
            ack_attempts: send_attempts(frames, lane.courier),
        });
    }
    let custody_passed = commitments.iter().all(|entry| entry.custody_passed);
    let acknowledgments_passed = commitments.iter().all(|entry| entry.acknowledgment_passed);
    let safety_passed = commitments.iter().all(|entry| entry.safety_passed);
    let service_passed = finished
        .is_some_and(|result| result.status == RunStatus::Complete && result.outcome.passed);
    let commitments_passed = service_passed
        && custody_passed
        && acknowledgments_passed
        && safety_passed
        && commitments.iter().all(|entry| entry.serviced.is_some());
    Ok(PortsGrade {
        schema: SCHEMA.into(),
        experiment_hash: check::artifact_hash(experiment)?,
        evidence_hash: check::artifact_hash(advance)?,
        result_hash: finished.map(check::artifact_hash).transpose()?,
        tick: last.tick,
        horizon: experiment.ticks,
        phase: if commitments_passed {
            Phase::Complete
        } else if finished.is_some() {
            Phase::Failed
        } else {
            Phase::InProgress
        },
        commitments,
        custody_passed,
        acknowledgments_passed,
        safety_passed,
        service_passed,
        commitments_passed,
    })
}
