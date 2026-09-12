//! A bounded add4-and-route contract over ordinary habitat-v3 execution.
//! The independent arithmetic oracle uses widened integer addition. No arithmetic
//! operation, sensor, or service actuator is added to the organism interpreter.
use crate::{check, continuation, model::*};
use serde::{Deserialize, Serialize};

pub const SCHEMA: &str = "platonik-ark-control-v1";
const OUTAGE: u32 = 48;
const SERVICE: u32 = 52;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    InProgress,
    Complete,
    Failed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Plan {
    SumLsb,
    Carry,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OutputBit {
    pub index: u8,
    pub tick: u32,
    pub bit: bool,
    pub signal: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SelectedReport {
    pub index: u8,
    pub tick: u32,
    pub bit: bool,
    pub signal: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Decision {
    pub tick: u32,
    pub bit: bool,
    pub delivered: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ArkGrade {
    pub schema: String,
    pub experiment_hash: String,
    pub evidence_hash: String,
    pub result_hash: Option<String>,
    pub tick: u32,
    pub horizon: u32,
    pub phase: Phase,
    pub plan: Plan,
    pub declared_a: u8,
    pub declared_b: u8,
    pub expected_sum: u8,
    pub observed_sum: Option<u8>,
    pub outputs: Vec<OutputBit>,
    pub arithmetic_passed: bool,
    pub selected: Option<SelectedReport>,
    pub retained: bool,
    pub decision: Option<Decision>,
    pub service_passed: bool,
    pub control_passed: bool,
}

pub fn grade(experiment: &Experiment, advance: &continuation::Advance) -> Result<ArkGrade, String> {
    match advance {
        continuation::Advance::Paused(checkpoint) => {
            if checkpoint.experiment != *experiment {
                return Err("Ark prefix belongs to another experiment.".into());
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

pub fn grade_receipt(receipt: &check::Receipt) -> Result<ArkGrade, String> {
    check::verify_receipt(receipt)?;
    grade_verified(
        &receipt.experiment,
        &continuation::Advance::Finished(receipt.result.clone()),
    )
}

fn delivered(frame: &Frame, link: u16, cell: u16, port: u8) -> Option<&Signal> {
    frame
        .signals
        .iter()
        .find(|event| {
            event.outcome == "delivered"
                && event.signal.link == link
                && event.signal.to_cell == cell
                && event.signal.to_port == port
        })
        .map(|event| &event.signal)
}

fn physical_drop(frames: &[Frame], courier: u16, depot: &Depot, spark: Spark) -> Option<u32> {
    frames.windows(2).find_map(|pair| {
        (pair[0]
            .state
            .cells
            .iter()
            .any(|cell| cell.id == courier && cell.cargo == Some(spark))
            && pair[1].activations.iter().any(|activation| {
                activation.cell == courier
                    && activation.success
                    && activation.action == Action::Drop
                    && activation.position_before == depot.position
            }))
        .then_some(pair[1].tick)
    })
}

/// Only for an owner that has ALREADY freshly replayed this exact input.
/// A grade describes this local contract, not competitive environment admission.
/// Frozen cases and component-removal comparisons supply that additional evidence.
pub fn grade_verified(
    experiment: &Experiment,
    advance: &continuation::Advance,
) -> Result<ArkGrade, String> {
    let (frames, finished) = match advance {
        continuation::Advance::Paused(checkpoint) => {
            if checkpoint.experiment != *experiment {
                return Err("Ark prefix belongs to another experiment.".into());
            }
            (&checkpoint.frames, None)
        }
        continuation::Advance::Finished(result) => (&result.frames, Some(result)),
    };
    if experiment.version != CONSTRUCTION_VERSION || experiment.ticks != 128 {
        return Err("Ark control requires a 128-tick habitat-v3 world.".into());
    }
    let input = experiment
        .sources
        .iter()
        .find(|source| source.id == 10)
        .ok_or("Missing physical operand source.")?;
    if input.sparks.len() != 5 || input.sparks[4].bit {
        return Err("Operand A needs four low-first bits and a zero flush.".into());
    }
    let declared_a = input.sparks[..4]
        .iter()
        .enumerate()
        .fold(0, |value, (index, spark)| {
            value | (u8::from(spark.bit) << index)
        });
    let declared_b = experiment
        .cells
        .iter()
        .find(|cell| cell.id == 9)
        .ok_or("Missing stored operand cell.")?
        .memory[0];
    if declared_b > 15 {
        return Err("Operand B must fit four bits.".into());
    }
    let tap = experiment
        .cells
        .iter()
        .find(|cell| cell.id == 11)
        .ok_or("Missing plan selector.")?
        .memory[2];
    let plan = match tap {
        0 => Plan::SumLsb,
        4 => Plan::Carry,
        _ => return Err("The admitted plans select sum bit zero or carry.".into()),
    };
    let expected_sum = declared_a + declared_b;
    let expected_bit = ((expected_sum >> tap) & 1) != 0;
    let depot = experiment
        .depots
        .iter()
        .find(|depot| depot.id == 11)
        .ok_or("Missing operand depot.")?;
    let payload_depot = experiment
        .depots
        .iter()
        .find(|depot| depot.id == 12)
        .ok_or("Missing payload depot.")?;
    let payload_source = experiment
        .sources
        .iter()
        .find(|source| source.id == 14)
        .ok_or("Missing payload source.")?;
    if payload_source.sparks.len() != 1 {
        return Err("Ark control needs one finite payload.".into());
    }
    let payload = payload_source.sparks[0];
    let payload_valve = experiment.valves.iter().any(|valve| {
        valve.id == 30 && valve.depot == 12 && valve.beacon_zero == 20 && valve.beacon_one == 21
    });
    let last = frames.last().ok_or("Ark is missing its loaded frame.")?;
    let emitted: Vec<_> = frames
        .iter()
        .flat_map(|frame| frame.signals.iter())
        .filter(|event| {
            event.outcome == "queued"
                && event.signal.link == 46
                && event.signal.from == (Endpoint::Cell { id: 10, port: 0 })
                && event.signal.to_cell == 11
                && event.signal.to_port == 0
        })
        .map(|event| &event.signal)
        .collect();
    let outputs = emitted
        .iter()
        .enumerate()
        .map(|(index, signal)| OutputBit {
            index: index as u8,
            tick: signal.sent_tick,
            bit: signal.bit,
            signal: signal.id,
        })
        .collect();
    let observed_sum = (emitted.len() == 5).then(|| {
        emitted
            .iter()
            .enumerate()
            .fold(0, |value, (index, signal)| {
                value | (u8::from(signal.bit) << index)
            })
    });
    // Every column must be clocked by the corresponding transported input,
    // with paired local operands. Correct final registers alone are insufficient.
    let arithmetic_passed = observed_sum == Some(expected_sum)
        && experiment
            .cells
            .iter()
            .find(|cell| cell.id == 10)
            .is_some_and(|cell| cell.memory[0] == 0)
        && emitted.iter().enumerate().all(|(index, signal)| {
            let spark = input.sparks[index];
            let Some(frame) = frames.iter().find(|frame| frame.tick == signal.sent_tick) else {
                return false;
            };
            let Some(a) = delivered(frame, 44, 10, 0) else {
                return false;
            };
            let Some(b) = delivered(frame, 45, 10, 1) else {
                return false;
            };
            a.from == (Endpoint::Cell { id: 8, port: 0 })
                && a.bit == spark.bit
                && a.receipt_spark == Some(spark.id)
                && b.from == (Endpoint::Cell { id: 9, port: 0 })
                && b.bit == (index < 4 && ((declared_b >> index) & 1) != 0)
                && physical_drop(frames, 1, depot, spark).is_some_and(|tick| tick < frame.tick)
                && frames
                    .iter()
                    .find(|frame| frame.tick == b.sent_tick)
                    .and_then(|frame| delivered(frame, 42, 9, 0))
                    .is_some_and(|clock| {
                        clock.from == (Endpoint::Cell { id: 2, port: 0 })
                            && clock.receipt_spark == Some(spark.id)
                            && clock.bit == spark.bit
                    })
                && frame.activations.iter().any(|activation| {
                    activation.cell == 10
                        && activation.success
                        && matches!(activation.action, Action::Send { port: 0, .. })
                })
        });
    let selected_output = emitted.get(tap as usize);
    let selected = selected_output.and_then(|output| {
        frames.iter().find_map(|frame| {
            frame
                .signals
                .iter()
                .find(|event| {
                    event.outcome == "consumed"
                        && event.signal.link == 47
                        && event.signal.from == (Endpoint::Cell { id: 11, port: 0 })
                        && event.signal.to_cell == 3
                        && event.signal.to_port == 0
                        && event.signal.sent_tick >= output.deliver_tick
                        && event.signal.bit == output.bit
                        && frames
                            .iter()
                            .find(|frame| frame.tick == output.deliver_tick)
                            .and_then(|frame| delivered(frame, 46, 11, 0))
                            .is_some_and(|incoming| incoming.id == output.id)
                })
                .map(|event| SelectedReport {
                    index: tap,
                    tick: frame.tick,
                    bit: event.signal.bit,
                    signal: event.signal.id,
                })
        })
    });
    let held_through = last.tick.min(SERVICE);
    let retained =
        selected.as_ref().is_some_and(|selected| {
            selected.tick < OUTAGE
                && last.tick >= SERVICE
                && frames
                    .iter()
                    .filter(|frame| (OUTAGE..=held_through).contains(&frame.tick))
                    .all(|frame| {
                        frame
                            .state
                            .links
                            .iter()
                            .any(|link| link.id == 47 && !link.enabled)
                            && frame.state.cells.iter().any(|cell| {
                                cell.id == 3 && cell.memory[0] == u8::from(selected.bit)
                            })
                            && !frame
                                .events
                                .iter()
                                .any(|event| matches!(event, EventKind::ClearMemory { cell: 3 }))
                            && !frame.signals.iter().any(|event| {
                                event.outcome == "delivered" && event.signal.to_cell == 3
                            })
                    })
        });
    let service_frame = frames.iter().find(|frame| frame.tick == SERVICE);
    let prior = frames.iter().find(|frame| frame.tick == SERVICE - 1);
    let decision = service_frame.zip(prior).and_then(|(frame, prior)| {
        frame.activations.iter().find_map(|activation| {
            if activation.cell != 3 {
                return None;
            }
            let Action::Route { valve: 30, ref bit } = activation.action else {
                return None;
            };
            let remembered = prior.state.cells.iter().find(|cell| cell.id == 3)?;
            let value = match bit {
                BitSource::Constant { value } => *value,
                BitSource::Memory { slot } => {
                    if frame
                        .events
                        .iter()
                        .any(|event| matches!(event, EventKind::ClearMemory { cell: 3 }))
                    {
                        false
                    } else {
                        remembered.memory[*slot as usize] != 0
                    }
                }
                BitSource::Message { port } => {
                    frame
                        .signals
                        .iter()
                        .find(|event| {
                            event.outcome == "delivered"
                                && event.signal.to_cell == 3
                                && event.signal.to_port == *port
                        })?
                        .signal
                        .bit
                }
            };
            Some(Decision {
                tick: frame.tick,
                bit: value,
                delivered: activation.success
                    && payload_valve
                    && prior
                        .state
                        .depots
                        .iter()
                        .any(|depot| depot.id == 12 && depot.sparks.first() == Some(&payload))
                    && frame
                        .activations
                        .iter()
                        .filter(|activation| activation.success)
                        .all(|activation| match activation.action {
                            Action::Route { valve, .. } => {
                                !experiment
                                    .valves
                                    .iter()
                                    .any(|entry| entry.id == valve && entry.depot == 12)
                                    || (activation.cell == 3 && valve == 30)
                            }
                            Action::Drop => !experiment.beacons.iter().any(|beacon| {
                                [20, 21].contains(&beacon.id)
                                    && beacon.position == activation.position_before
                            }),
                            _ => true,
                        })
                    && frame.state.delivered.iter().any(|delivery| {
                        delivery.tick == SERVICE
                            && delivery.spark == payload
                            && delivery.beacon == if value { 21 } else { 20 }
                    }),
            })
        })
    });
    let single_window = experiment
        .valves
        .iter()
        .any(|valve| valve.id == 30 && !valve.enabled)
        && frames.iter().all(|frame| {
            frame
                .state
                .valves
                .iter()
                .any(|valve| valve.id == 30 && valve.enabled == (frame.tick == SERVICE))
        });
    let unreported_payload = !experiment
        .links
        .iter()
        .chain(
            experiment
                .construction
                .iter()
                .flat_map(|spec| &spec.blueprints)
                .flat_map(|blueprint| &blueprint.body.links),
        )
        .any(|link| link.from == (Endpoint::Depot { id: 12 }));
    let service_passed = finished
        .is_some_and(|result| result.status == RunStatus::Complete && result.outcome.passed);
    let control_passed = service_passed
        && arithmetic_passed
        && single_window
        && unreported_payload
        && retained
        && selected
            .as_ref()
            .is_some_and(|selected| selected.bit == expected_bit)
        && decision
            .as_ref()
            .is_some_and(|decision| decision.bit == expected_bit && decision.delivered)
        && physical_drop(frames, 12, payload_depot, payload).is_some_and(|tick| tick < SERVICE);
    Ok(ArkGrade {
        schema: SCHEMA.into(),
        experiment_hash: check::artifact_hash(experiment)?,
        evidence_hash: check::artifact_hash(advance)?,
        result_hash: finished.map(check::artifact_hash).transpose()?,
        tick: last.tick,
        horizon: experiment.ticks,
        phase: if control_passed {
            Phase::Complete
        } else if finished.is_some() {
            Phase::Failed
        } else {
            Phase::InProgress
        },
        plan,
        declared_a,
        declared_b,
        expected_sum,
        observed_sum,
        outputs,
        arithmetic_passed,
        selected,
        retained,
        decision,
        service_passed,
        control_passed,
    })
}
