//! A local, finite journey objective over the existing habitat-v3 trace.
//! This joins physical service with a returned signal about the same spark. The
//! signal is a depot report, not an acknowledgment emitted by the beacon.
use crate::{check, continuation, model::*};
use serde::{Deserialize, Serialize};

pub const SCHEMA: &str = "platonik-first-answer-v1";
pub const ANSWER: &str = "A pattern crossed the quiet. Your crew kept the lights on, built a new member, and brought a trace of its work home. The workshop is still yours.";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    InProgress,
    Answered,
    FinishedWithoutAnswer,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MilestoneKind {
    CrewSupplied,
    KeeperBorn,
    ReplyBorn,
    MatchingReply,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Milestone {
    pub kind: MilestoneKind,
    pub tick: u32,
    pub cell: Option<u16>,
    pub spark: Option<u32>,
    pub signal: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Journey {
    pub schema: String,
    pub experiment_hash: String,
    pub evidence_hash: String,
    pub result_hash: Option<String>,
    pub tick: u32,
    pub horizon: u32,
    pub phase: Phase,
    pub service_passed: bool,
    pub answered: bool,
    pub milestones: Vec<Milestone>,
    pub answer: Option<String>,
}

fn born(frames: &[Frame], child: u16, blueprint: u16) -> Option<&Birth> {
    let birth = frames
        .last()?
        .state
        .construction
        .as_ref()?
        .births
        .iter()
        .find(|birth| {
            birth.parent == 5 && birth.blueprint == blueprint && birth.body.cell.id == child
        })?;
    let acted = |predicate: fn(&Action) -> bool| {
        frames
            .iter()
            .filter(|frame| frame.tick <= birth.tick)
            .any(|frame| {
                frame.activations.iter().any(|activation| {
                    activation.cell == 5 && activation.success && predicate(&activation.action)
                })
            })
    };
    let gathered = acted(|action| matches!(action, Action::GatherMaterial { stock: 60 }));
    let built = frames.iter().any(|frame| {
        frame.tick < birth.tick
            && frame.activations.iter().any(|activation| {
                activation.cell == 5
                    && activation.success
                    && activation.action == (Action::Build { blueprint })
            })
    });
    let activated = frames.iter().any(|frame| {
        frame.tick == birth.tick
            && frame.activations.iter().any(|activation| {
                activation.cell == 5
                    && activation.success
                    && activation.action == (Action::Activate { blueprint })
            })
    });
    (gathered && built && activated).then_some(birth)
}

/// Freshly verify the exact prefix or finished result, then grade its objective.
pub fn grade(experiment: &Experiment, advance: &continuation::Advance) -> Result<Journey, String> {
    match advance {
        continuation::Advance::Paused(checkpoint) => {
            if checkpoint.experiment != *experiment {
                return Err("Journey prefix belongs to another experiment.".into());
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

/// Verify a cold receipt, including its supplied identities, before grading.
pub fn grade_receipt(receipt: &check::Receipt) -> Result<Journey, String> {
    check::verify_receipt(receipt)?;
    grade_verified(
        &receipt.experiment,
        &continuation::Advance::Finished(receipt.result.clone()),
    )
}

/// Projection for an owner that has ALREADY freshly replayed this exact input.
/// This function does not authenticate untrusted traces. Public entry points
/// must use `grade`/`grade_receipt`, or a verified habitat-store snapshot.
/// This is a local objective; competition admission must additionally freeze
/// the task's environment and permitted program edits.
pub fn grade_verified(
    experiment: &Experiment,
    advance: &continuation::Advance,
) -> Result<Journey, String> {
    let (frames, finished) = match advance {
        continuation::Advance::Paused(checkpoint) => {
            if checkpoint.experiment != *experiment {
                return Err("Journey prefix belongs to another experiment.".into());
            }
            (&checkpoint.frames, None)
        }
        continuation::Advance::Finished(result) => (&result.frames, Some(result)),
    };
    if experiment.version != CONSTRUCTION_VERSION || experiment.ticks != 128 {
        return Err("The First Answer requires a 128-tick habitat-v3 world.".into());
    }
    let sparks: Vec<_> = experiment
        .sources
        .iter()
        .flat_map(|source| &source.sparks)
        .collect();
    if sparks.len() != 6
        || experiment.beacons.len() != 2
        || experiment
            .beacons
            .iter()
            .any(|beacon| beacon.required_deliveries != 3)
        || experiment.beacons[0].accepts == experiment.beacons[1].accepts
    {
        return Err(
            "The First Answer requires six sparks and two opposite three-delivery services.".into(),
        );
    }
    let last = frames
        .last()
        .ok_or("Journey is missing its loaded frame.")?;
    let mut milestones = Vec::new();
    let keeper = born(frames, 3, 50);
    let reply = born(frames, 6, 51);
    for (birth, kind) in [
        (keeper, MilestoneKind::KeeperBorn),
        (reply, MilestoneKind::ReplyBorn),
    ] {
        if let Some(birth) = birth {
            milestones.push(Milestone {
                kind,
                tick: birth.tick,
                cell: Some(birth.body.cell.id),
                spark: None,
                signal: None,
            });
        }
    }
    // Every source object must physically reach a service; a matching report
    // cannot replace even one delivery. Fresh replay establishes conservation.
    let supplied = frames.iter().find(|frame| {
        sparks.iter().all(|spark| {
            frame
                .state
                .delivered
                .iter()
                .any(|delivery| delivery.spark == **spark)
        }) && frame
            .state
            .beacons
            .iter()
            .all(|beacon| beacon.delivered >= 3 && !beacon.exhausted && beacon.charge > 0)
    });
    let final_delivery = supplied.and_then(|frame| frame.state.delivered.last());
    if let Some(delivery) = final_delivery {
        milestones.push(Milestone {
            kind: MilestoneKind::CrewSupplied,
            tick: delivery.tick,
            cell: Some(1),
            spark: Some(delivery.spark.id),
            signal: None,
        });
    }
    let contact = final_delivery.and_then(|delivery| {
        frames
            .iter()
            .filter(|frame| frame.tick > delivery.tick)
            .find_map(|frame| {
                frame
                    .signals
                    .iter()
                    .find(|event| {
                        let signal = &event.signal;
                        event.outcome == "consumed"
                            && signal.link == 43
                            && signal.from == (Endpoint::Cell { id: 6, port: 0 })
                            && signal.to_cell == 7
                            && signal.to_port == 0
                            && signal.receipt_spark == Some(delivery.spark.id)
                            && signal.bit == delivery.spark.bit
                            && frames.iter().any(|incoming| {
                                incoming.tick <= signal.sent_tick
                                    && incoming.signals.iter().any(|event| {
                                        event.outcome == "delivered"
                                            && event.signal.link == 42
                                            && event.signal.from
                                                == (Endpoint::Cell { id: 2, port: 0 })
                                            && event.signal.to_cell == 6
                                            && event.signal.to_port == 0
                                            && event.signal.receipt_spark == Some(delivery.spark.id)
                                            && event.signal.bit == delivery.spark.bit
                                    })
                            })
                    })
                    .map(|event| (frame.tick, &event.signal))
            })
    });
    if let Some((tick, signal)) = contact {
        milestones.push(Milestone {
            kind: MilestoneKind::MatchingReply,
            tick,
            cell: Some(7),
            spark: signal.receipt_spark,
            signal: Some(signal.id),
        });
    }
    // Require useful born Keeper execution on the final physical delivery,
    // plus a born Reply that sent the actual returned signal after activation.
    let material_from_stock = |birth: &Birth| {
        experiment.construction.as_ref().is_some_and(|spec| {
            spec.stocks
                .iter()
                .any(|stock| stock.id == 60 && stock.units.contains(&birth.material))
        })
    };
    let useful_keeper = keeper.zip(final_delivery).is_some_and(|(birth, delivery)| {
        if !material_from_stock(birth) {
            return false;
        }
        frames.iter().any(|frame| {
            frame.tick == delivery.tick
                && frame.tick > birth.tick
                && frame
                    .activations
                    .iter()
                    .filter(|activation| {
                        activation.success
                            && (matches!(activation.action, Action::Route { .. })
                                || (activation.action == Action::Drop
                                    && experiment.beacons.iter().any(|beacon| {
                                        beacon.position == activation.position_before
                                    })))
                    })
                    .all(|activation| activation.cell == 3)
                && frame.activations.iter().any(|activation| {
                    activation.cell == 3
                        && activation.success
                        && matches!(activation.action, Action::Route { valve: 30, .. })
                })
        })
    });
    let useful_reply = reply.zip(contact).is_some_and(|(birth, (_, signal))| {
        material_from_stock(birth) && signal.sent_tick > birth.tick
    });
    let courier_worked = final_delivery.is_some_and(|delivery| {
        frames.windows(2).any(|pair| {
            pair[0]
                .state
                .cells
                .iter()
                .any(|cell| cell.id == 1 && cell.cargo == Some(delivery.spark))
                && pair[1].tick <= delivery.tick
                && pair[1].activations.iter().any(|activation| {
                    activation.cell == 1
                        && activation.success
                        && activation.action == Action::Drop
                        && experiment
                            .depots
                            .iter()
                            .any(|depot| depot.position == activation.position_before)
                })
        })
    });
    let service_passed = finished
        .is_some_and(|result| result.status == RunStatus::Complete && result.outcome.passed);
    let answered = service_passed && useful_keeper && useful_reply && courier_worked;
    milestones.sort_by_key(|milestone| milestone.tick);
    Ok(Journey {
        schema: SCHEMA.into(),
        experiment_hash: check::artifact_hash(experiment)?,
        evidence_hash: check::artifact_hash(advance)?,
        result_hash: finished.map(check::artifact_hash).transpose()?,
        tick: last.tick,
        horizon: experiment.ticks,
        phase: if answered {
            Phase::Answered
        } else if finished.is_some() {
            Phase::FinishedWithoutAnswer
        } else {
            Phase::InProgress
        },
        service_passed,
        answered,
        milestones,
        answer: answered.then(|| ANSWER.into()),
    })
}
