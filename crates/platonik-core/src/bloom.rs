//! Evidence for a finite generated family, physical trials, retained selection,
//! and a later confirmation. This observer adds no policy sensor or free search.
use crate::{bloom_fixtures as fixtures, check, continuation, model::*};
use serde::{Deserialize, Serialize};

pub const SCHEMA: &str = "platonik-bloom-v1";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    InProgress,
    Bloomed,
    FinishedWithoutBloom,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CandidateGrade {
    pub id: u8,
    pub builder: u16,
    pub child: u16,
    pub blueprint: u16,
    pub source: u16,
    pub depot: u16,
    pub trial_parcel: u32,
    pub confirmation_parcel: u32,
    pub seed_program_hash: String,
    pub program_hash: Option<String>,
    pub edits: Vec<DirectionEdit>,
    pub born: Option<u32>,
    pub trial_pickup: Option<u32>,
    pub trial_departed: Option<u32>,
    pub trial_returned: Option<u32>,
    pub trial_accepted: Option<u32>,
    pub trial_serviced: Option<u32>,
    pub confirmation_requested: Option<u32>,
    pub confirmation_pickup: Option<u32>,
    pub confirmation_accepted: Option<u32>,
    pub confirmation_serviced: Option<u32>,
    pub changed: bool,
    pub family_passed: bool,
    pub trial_passed: bool,
    pub confirmation_passed: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Selection {
    pub tick: u32,
    pub candidate: u8,
    pub child: u16,
    pub signal: u64,
    pub parcel: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BloomGrade {
    pub schema: String,
    pub experiment_hash: String,
    pub evidence_hash: String,
    pub result_hash: Option<String>,
    pub tick: u32,
    pub horizon: u32,
    pub phase: Phase,
    pub candidates: Vec<CandidateGrade>,
    pub selection: Option<Selection>,
    pub generated_passed: bool,
    pub trials_passed: bool,
    pub selection_passed: bool,
    pub confirmation_passed: bool,
    pub service_passed: bool,
    pub bloomed: bool,
}

pub fn grade(
    experiment: &Experiment,
    advance: &continuation::Advance,
) -> Result<BloomGrade, String> {
    match advance {
        continuation::Advance::Paused(checkpoint) => {
            if checkpoint.experiment != *experiment {
                return Err("Bloom prefix belongs to another experiment.".into());
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
pub fn grade_receipt(receipt: &check::Receipt) -> Result<BloomGrade, String> {
    check::verify_receipt(receipt)?;
    grade_verified(
        &receipt.experiment,
        &continuation::Advance::Finished(receipt.result.clone()),
    )
}
fn cell(frame: &Frame, id: u16) -> Option<&CellState> {
    frame.state.cells.iter().find(|c| c.id == id)
}
fn before(a: Option<u32>, b: Option<u32>) -> bool {
    a.zip(b).is_some_and(|(a, b)| a < b)
}
fn unique(values: &[u32]) -> Option<u32> {
    (values.len() == 1).then(|| values[0])
}
fn pickups(frames: &[Frame], id: u16, point: Point, parcel: Spark) -> Vec<u32> {
    frames
        .windows(2)
        .filter_map(|pair| {
            let prev = cell(&pair[0], id)?;
            let next = cell(&pair[1], id)?;
            (prev.cargo.is_none()
                && next.cargo == Some(parcel)
                && pair[1].activations.iter().any(|a| {
                    a.cell == id
                        && a.success
                        && a.action == Action::Pickup
                        && a.position_before == point
                }))
            .then_some(pair[1].tick)
        })
        .collect()
}
fn drops(frames: &[Frame], id: u16, point: Point, parcel: Spark) -> Vec<u32> {
    frames
        .windows(2)
        .filter_map(|pair| {
            (cell(&pair[0], id)?.cargo == Some(parcel)
                && pair[1].activations.iter().any(|a| {
                    a.cell == id
                        && a.success
                        && a.action == Action::Drop
                        && a.position_before == point
                }))
            .then_some(pair[1].tick)
        })
        .collect()
}
fn service(frame: &Frame, parcel: Spark) -> Option<u32> {
    let entries: Vec<_> = frame
        .state
        .delivered
        .iter()
        .filter(|d| d.spark == parcel)
        .collect();
    (entries.len() == 1 && entries[0].beacon == 20).then(|| entries[0].tick)
}
fn family(seed: &Program, birth: &Birth, berth: fixtures::Berth) -> bool {
    if *seed != fixtures::seed_program()
        || birth.edits.len() < 2
        || birth
            .edits
            .iter()
            .any(|e| e.actor != berth.builder || !fixtures::EDIT_RULES.contains(&e.rule))
    {
        return false;
    }
    let mut expected = seed.clone();
    let Some(Rule {
        action: Action::Turn { direction },
        ..
    }) = birth.body.cell.program.rules.first()
    else {
        return false;
    };
    if *direction == Relative::Forward {
        return false;
    }
    for index in fixtures::EDIT_RULES {
        expected.rules[usize::from(index)].action = Action::Turn {
            direction: *direction,
        };
    }
    expected == birth.body.cell.program
}
fn report(frames: &[Frame], signal: &Signal, berth: fixtures::Berth) -> bool {
    signal.from == (Endpoint::Cell { id: fixtures::RELAY, port: berth.id })
        && signal.to_cell == fixtures::SELECTOR && signal.to_port == berth.id
        && signal.link == berth.feedback_link && !signal.bit && signal.receipt_spark == Some(berth.trial)
        && frames.iter().find(|f| f.tick == signal.sent_tick).is_some_and(|frame| {
            frame.activations.iter().any(|a| a.cell == fixtures::RELAY && a.success
                && a.action == (Action::Send { port: berth.id, bit: BitSource::Memory { slot: 1 } }))
                && frames.iter().find(|f| f.tick + 1 == signal.sent_tick).and_then(|f| cell(f, fixtures::RELAY))
                    .is_some_and(|c| c.memory[1] == 0 && c.evidence[1] == Some(berth.trial))
                // Fresh replay authenticates the retained local message; the
                // declared family additionally binds its physical depot origin.
                && frames.iter().filter(|f| f.tick < signal.sent_tick).any(|f| f.signals.iter().any(|e|
                    e.outcome == "consumed" && e.signal.from == (Endpoint::Depot { id: berth.depot })
                        && e.signal.link == berth.report_link && e.signal.to_cell == fixtures::RELAY
                        && e.signal.to_port == berth.id && !e.signal.bit && e.signal.receipt_spark == Some(berth.trial)))
        })
}

/// Only for callers that freshly verified this exact evidence. Study admission
/// must separately bind all world fields outside the declared editable programs.
pub fn grade_verified(
    experiment: &Experiment,
    advance: &continuation::Advance,
) -> Result<BloomGrade, String> {
    let (frames, finished) = match advance {
        continuation::Advance::Paused(checkpoint) => {
            if checkpoint.experiment != *experiment {
                return Err("Bloom prefix belongs to another experiment.".into());
            }
            (&checkpoint.frames, None)
        }
        continuation::Advance::Finished(result) => (&result.frames, Some(result)),
    };
    if experiment.version != VARIATION_VERSION || experiment.ticks != fixtures::HORIZON {
        return Err("Bloom requires a 128-tick habitat-v4 world.".into());
    }
    let last = frames
        .last()
        .ok_or("Bloom evidence is missing its loaded frame.")?;
    let construction = experiment
        .construction
        .as_ref()
        .ok_or("Missing Bloom construction plan.")?;
    let mut candidates = Vec::new();
    for berth in fixtures::BERTHS {
        let source = experiment
            .sources
            .iter()
            .find(|s| s.id == berth.source)
            .ok_or("Missing Bloom source.")?;
        let depot = experiment
            .depots
            .iter()
            .find(|s| s.id == berth.depot)
            .ok_or("Missing Bloom depot.")?;
        let blueprint = construction
            .blueprints
            .iter()
            .find(|b| b.id == berth.blueprint)
            .ok_or("Missing Bloom seed.")?;
        let birth = last.state.construction.as_ref().and_then(|c| {
            c.births.iter().find(|b| {
                b.blueprint == berth.blueprint
                    && b.parent == berth.builder
                    && b.body.cell.id == berth.child
            })
        });
        let edits = birth
            .map(|b| b.edits.clone())
            .or_else(|| {
                last.state.construction.as_ref().and_then(|c| {
                    c.assemblies
                        .iter()
                        .find(|a| a.blueprint == berth.blueprint && a.parent == berth.builder)
                        .map(|a| a.edits.clone())
                })
            })
            .unwrap_or_default();
        let seed_program_hash = check::artifact_hash(&blueprint.body.cell.program)?;
        let program_hash = birth
            .map(|b| check::artifact_hash(&b.body.cell.program))
            .transpose()?;
        let changed = program_hash
            .as_ref()
            .is_some_and(|h| h != &seed_program_hash);
        let family_passed = birth.is_some_and(|b| family(&blueprint.body.cell.program, b, berth));
        let trial = Spark {
            id: berth.trial,
            bit: false,
        };
        let confirmation = Spark {
            id: berth.confirmation,
            bit: false,
        };
        let born = birth.map(|b| b.tick);
        let trial_pickup = unique(&pickups(frames, berth.child, source.position, trial));
        let trial_departed = frames
            .iter()
            .find(|f| {
                trial_pickup.is_some_and(|t| f.tick > t)
                    && f.activations.iter().any(|a| {
                        a.cell == berth.child
                            && a.success
                            && matches!(a.action, Action::Move { .. })
                            && a.position_before == source.position
                            && a.position_after != source.position
                    })
            })
            .map(|f| f.tick);
        let trial_returned = frames
            .iter()
            .find(|f| {
                trial_departed.is_some_and(|t| f.tick > t)
                    && cell(f, berth.child).is_some_and(|c| {
                        c.position == source.position
                            && c.heading == blueprint.body.cell.heading
                            && c.memory[0] == 5
                    })
            })
            .map(|f| f.tick);
        let trial_accepted = unique(&drops(frames, berth.child, depot.position, trial));
        let trial_serviced = service(last, trial);
        let confirmation_requested = frames
            .iter()
            .find(|f| {
                f.signals.iter().any(|e| {
                    e.outcome == "consumed"
                        && e.signal.from
                            == (Endpoint::Cell {
                                id: fixtures::SELECTOR,
                                port: berth.id,
                            })
                        && e.signal.link == berth.command_link
                        && e.signal.to_cell == berth.child
                        && e.signal.to_port == 0
                        && e.signal.bit
                        && e.signal.sent_tick >= fixtures::CONFIRMATION_OPENS
                })
            })
            .map(|f| f.tick);
        let confirmation_pickup =
            unique(&pickups(frames, berth.child, source.position, confirmation));
        let confirmation_accepted =
            unique(&drops(frames, berth.child, depot.position, confirmation));
        let confirmation_serviced = service(last, confirmation);
        let trial_passed = source.sparks.as_slice() == [trial, confirmation]
            && before(born, trial_pickup)
            && before(trial_pickup, trial_departed)
            && before(trial_departed, trial_returned);
        let confirmation_passed = before(confirmation_requested, confirmation_pickup)
            && before(confirmation_pickup, confirmation_accepted)
            && before(confirmation_accepted, confirmation_serviced);
        candidates.push(CandidateGrade {
            id: berth.id,
            builder: berth.builder,
            child: berth.child,
            blueprint: berth.blueprint,
            source: berth.source,
            depot: berth.depot,
            trial_parcel: berth.trial,
            confirmation_parcel: berth.confirmation,
            seed_program_hash,
            program_hash,
            edits,
            born,
            trial_pickup,
            trial_departed,
            trial_returned,
            trial_accepted,
            trial_serviced,
            confirmation_requested,
            confirmation_pickup,
            confirmation_accepted,
            confirmation_serviced,
            changed,
            family_passed,
            trial_passed,
            confirmation_passed,
        });
    }
    let transition = frames.windows(2).find(|p| {
        cell(&p[0], fixtures::SELECTOR).is_some_and(|c| c.memory[fixtures::SELECTION_SLOT] == 0)
            && cell(&p[1], fixtures::SELECTOR)
                .is_some_and(|c| c.memory[fixtures::SELECTION_SLOT] != 0)
    });
    let selection = transition.and_then(|p| {
        let value = cell(&p[1], fixtures::SELECTOR)?.memory[fixtures::SELECTION_SLOT];
        let berth = fixtures::BERTHS.iter().find(|b| b.id + 1 == value)?;
        if !p[1].activations.iter().any(|a| {
            a.cell == fixtures::SELECTOR
                && a.success
                && a.action
                    == (Action::TakeMessage {
                        port: berth.id,
                        slot: 1,
                    })
        }) {
            return None;
        }
        let signal = p[1]
            .signals
            .iter()
            .find(|e| e.outcome == "consumed" && report(frames, &e.signal, *berth))?;
        Some(Selection {
            tick: p[1].tick,
            candidate: berth.id,
            child: berth.child,
            signal: signal.signal.id,
            parcel: berth.trial,
        })
    });
    let generated_passed = candidates.iter().all(|c| c.changed && c.family_passed)
        && candidates[0].program_hash != candidates[1].program_hash;
    let trials_passed = candidates.iter().all(|c| c.trial_passed)
        && candidates
            .iter()
            .any(|c| before(c.trial_pickup, c.trial_accepted));
    let selection_passed = selection.as_ref().is_some_and(|selection| {
        experiment
            .cells
            .iter()
            .find(|c| c.id == fixtures::SELECTOR)
            .is_some_and(|c| c.memory[fixtures::SELECTION_SLOT] == 0)
            && selection.tick < fixtures::CONFIRMATION_OPENS
            && candidates.iter().all(|c| {
                before(c.born, Some(selection.tick))
                    && before(c.trial_returned, Some(selection.tick))
            })
            && before(
                candidates[usize::from(selection.candidate)].trial_accepted,
                Some(selection.tick),
            )
            && frames.iter().filter(|f| f.tick >= selection.tick).all(|f| {
                cell(f, fixtures::SELECTOR)
                    .is_some_and(|c| c.memory[fixtures::SELECTION_SLOT] == selection.candidate + 1)
            })
    });
    let confirmation_passed = selection.as_ref().is_some_and(|selection| {
        let winner = &candidates[usize::from(selection.candidate)];
        let loser = &candidates[usize::from(1 - selection.candidate)];
        let spare = Spark {
            id: loser.confirmation_parcel,
            bit: false,
        };
        let trial = Spark {
            id: loser.trial_parcel,
            bit: false,
        };
        winner.confirmation_passed
            && winner.trial_serviced.is_some()
            && frames.iter().all(|f| {
                f.state
                    .sources
                    .iter()
                    .any(|s| s.id == loser.source && s.sparks.contains(&spare))
            })
            && cell(last, loser.child).is_some_and(|c| c.cargo == Some(trial))
            && frames.iter().all(|f| {
                f.activations.iter().all(|a| {
                    if a.cell != fixtures::SELECTOR {
                        return true;
                    }
                    match &a.action {
                        Action::Send { port, bit } => {
                            *port == selection.candidate
                                && *bit == (BitSource::Constant { value: true })
                                && f.tick >= fixtures::CONFIRMATION_OPENS
                                && f.tick > selection.tick
                        }
                        _ => true,
                    }
                })
            })
    });
    let service_passed = finished.is_some_and(|r| {
        r.status == RunStatus::Complete
            && r.ticks_completed == fixtures::HORIZON
            && r.outcome.passed
    });
    let bloomed = service_passed
        && generated_passed
        && trials_passed
        && selection_passed
        && confirmation_passed;
    Ok(BloomGrade {
        schema: SCHEMA.into(),
        experiment_hash: check::artifact_hash(experiment)?,
        evidence_hash: check::artifact_hash(advance)?,
        result_hash: finished.map(check::artifact_hash).transpose()?,
        tick: last.tick,
        horizon: experiment.ticks,
        phase: if bloomed {
            Phase::Bloomed
        } else if finished.is_some() {
            Phase::FinishedWithoutBloom
        } else {
            Phase::InProgress
        },
        candidates,
        selection,
        generated_passed,
        trials_passed,
        selection_passed,
        confirmation_passed,
        service_passed,
        bloomed,
    })
}
