//! A generated courier fulfills a real one-shot exchange in one v4 trace.
//! This contract is versioned independently of the interpreter and old grades.
use crate::{bloom_exchange_fixtures as fixtures, bloom_fixtures as bloom, check, model::*};
use serde::{Deserialize, Serialize};

pub const SCHEMA: &str = "platonik-bloom-exchange-v1";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Moment {
    pub tick: u32,
    pub signal: Signal,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Candidate {
    pub child: u16,
    pub seed_hash: String,
    pub program_hash: Option<String>,
    pub born: Option<u32>,
    pub edits: Vec<DirectionEdit>,
    pub generated: bool,
    pub trial_pickup: Option<u32>,
    pub trial_returned: Option<u32>,
    pub trial_accepted: Option<u32>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExchangeGrade {
    pub schema: String,
    pub case_id: String,
    pub experiment_hash: String,
    pub result_hash: String,
    pub candidates: Vec<Candidate>,
    pub selected_candidate: Option<u8>,
    pub selection: Option<Moment>,
    pub request: Option<Moment>,
    pub child_request: Option<Moment>,
    pub pickup: Option<u32>,
    pub accepted: Option<u32>,
    pub depot_report: Option<Moment>,
    pub child_report: Option<Moment>,
    pub child_ack: Option<Moment>,
    pub acknowledgment: Option<Moment>,
    pub serviced: Option<u32>,
    pub work_total: u64,
    pub fixed_world_passed: bool,
    pub generation_passed: bool,
    pub trials_passed: bool,
    pub selection_passed: bool,
    pub request_passed: bool,
    pub custody_passed: bool,
    pub acknowledgment_passed: bool,
    pub spare_preserved: bool,
    pub service_passed: bool,
    pub exchange_passed: bool,
}
fn cell(frame: &Frame, id: u16) -> Option<&CellState> {
    frame.state.cells.iter().find(|c| c.id == id)
}
fn before(a: Option<u32>, b: Option<u32>) -> bool {
    a.zip(b).is_some_and(|(a, b)| a < b)
}
fn unique(values: Vec<u32>) -> Option<u32> {
    (values.len() == 1).then(|| values[0])
}
fn movement(
    frames: &[Frame],
    child: u16,
    point: Point,
    spark: Spark,
    action: Action,
) -> Option<u32> {
    unique(
        frames
            .windows(2)
            .filter_map(|p| {
                let old = cell(&p[0], child)?;
                let new = cell(&p[1], child)?;
                let cargo = if action == Action::Pickup {
                    old.cargo.is_none() && new.cargo == Some(spark)
                } else {
                    old.cargo == Some(spark) && new.cargo.is_none()
                };
                (cargo
                    && p[1].activations.iter().any(|a| {
                        a.cell == child
                            && a.success
                            && a.action == action
                            && a.position_before == point
                    }))
                .then_some(p[1].tick)
            })
            .collect(),
    )
}
fn consumed(frames: &[Frame], predicate: impl Fn(&Signal) -> bool) -> Option<Moment> {
    frames.iter().find_map(|f| {
        f.signals
            .iter()
            .find(|e| e.outcome == "consumed" && predicate(&e.signal))
            .map(|e| Moment {
                tick: f.tick,
                signal: e.signal.clone(),
            })
    })
}
fn endpoint(id: u16, port: u8) -> Endpoint {
    Endpoint::Cell { id, port }
}
fn take(frames: &[Frame], moment: &Moment, recipient: u16, port: u8, slot: u8) -> bool {
    frames
        .iter()
        .find(|f| f.tick == moment.tick)
        .is_some_and(|f| {
            f.activations.iter().any(|a| {
                a.cell == recipient && a.success && a.action == (Action::TakeMessage { port, slot })
            })
        })
}
fn send(frames: &[Frame], signal: &Signal, sender: u16, port: u8, bit: BitSource) -> bool {
    frames
        .iter()
        .find(|f| f.tick == signal.sent_tick)
        .is_some_and(|f| {
            f.activations.iter().any(|a| {
                a.cell == sender
                    && a.success
                    && a.action
                        == (Action::Send {
                            port,
                            bit: bit.clone(),
                        })
            })
        })
}
// A memory-backed send must use evidence stored strictly earlier. Fresh replay
// authenticates that storage; matching prior consumption authenticates its hop.
fn forwarded(
    frames: &[Frame],
    from: &Moment,
    to: &Moment,
    sender: u16,
    port: u8,
    slot: u8,
) -> bool {
    from.tick < to.signal.sent_tick
        && from.signal.to_cell == sender
        && from.signal.receipt_spark == to.signal.receipt_spark
        && from.signal.bit == to.signal.bit
        && take(frames, from, sender, from.signal.to_port, slot)
        && send(frames, &to.signal, sender, port, BitSource::Memory { slot })
        && frames
            .iter()
            .find(|f| f.tick + 1 == to.signal.sent_tick)
            .and_then(|f| cell(f, sender))
            .is_some_and(|c| {
                c.evidence[slot as usize] == to.signal.receipt_spark
                    && (c.memory[slot as usize] != 0) == to.signal.bit
            })
}
fn body_family(seed: &Program, birth: &Birth, berth: bloom::Berth) -> bool {
    if *seed != fixtures::seed_program()
        || birth.edits.len() != 2
        || birth
            .edits
            .iter()
            .enumerate()
            .any(|(i, e)| e.actor != berth.builder || e.rule != bloom::EDIT_RULES[i])
    {
        return false;
    }
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
    let mut expected = seed.clone();
    for rule in bloom::EDIT_RULES {
        expected.rules[usize::from(rule)].action = Action::Turn {
            direction: *direction,
        };
    }
    expected == birth.body.cell.program
}

/// Replays once. A completed control returns a grade with false predicates;
/// corrupt evidence and unknown case identifiers are errors. Only initial-cell
/// programs are editable; world resources, wiring, seed, memory, schedules and
/// budgets must match the named case to earn the exchange.
pub fn grade_receipt(case_id: &str, receipt: &check::Receipt) -> Result<ExchangeGrade, String> {
    let expected = fixtures::experiment(case_id)?;
    check::verify_receipt(receipt)?;
    let experiment = &receipt.experiment;
    let mut normalized = experiment.clone();
    for c in &mut normalized.cells {
        if let Some(reference) = expected.cells.iter().find(|r| r.id == c.id) {
            c.program = reference.program.clone();
        }
    }
    let fixed_world_passed = normalized == expected;
    let frames = &receipt.result.frames;
    let last = frames.last().ok_or("Missing exchange frames")?;
    let construction = experiment
        .construction
        .as_ref()
        .ok_or("Exchange requires construction")?;
    let mut candidates = Vec::new();
    for berth in bloom::BERTHS {
        let blueprint = construction
            .blueprints
            .iter()
            .find(|b| b.id == berth.blueprint)
            .ok_or("Missing seed")?;
        let source = experiment
            .sources
            .iter()
            .find(|s| s.id == berth.source)
            .ok_or("Missing source")?;
        let depot = experiment
            .depots
            .iter()
            .find(|d| d.id == berth.depot)
            .ok_or("Missing depot")?;
        let birth = last.state.construction.as_ref().and_then(|c| {
            c.births.iter().find(|b| {
                b.blueprint == berth.blueprint
                    && b.parent == berth.builder
                    && b.body.cell.id == berth.child
            })
        });
        let trial = Spark {
            id: berth.trial,
            bit: false,
        };
        let trial_pickup = movement(frames, berth.child, source.position, trial, Action::Pickup);
        let trial_accepted = movement(frames, berth.child, depot.position, trial, Action::Drop);
        let departed = frames
            .iter()
            .find(|f| {
                trial_pickup.is_some_and(|p| f.tick > p)
                    && cell(f, berth.child).is_some_and(|c| c.position != source.position)
            })
            .map(|f| f.tick);
        let trial_returned = frames
            .iter()
            .find(|f| {
                departed.is_some_and(|d| f.tick > d)
                    && cell(f, berth.child).is_some_and(|c| {
                        c.position == source.position
                            && c.heading == blueprint.body.cell.heading
                            && c.memory[0] == 5
                    })
            })
            .map(|f| f.tick);
        candidates.push(Candidate {
            child: berth.child,
            seed_hash: check::artifact_hash(&blueprint.body.cell.program)?,
            program_hash: birth
                .map(|b| check::artifact_hash(&b.body.cell.program))
                .transpose()?,
            born: birth.map(|b| b.tick),
            edits: birth.map(|b| b.edits.clone()).unwrap_or_default(),
            generated: birth.is_some_and(|b| body_family(&blueprint.body.cell.program, b, berth)),
            trial_pickup,
            trial_returned,
            trial_accepted,
        });
    }
    let generation_passed = candidates.iter().all(|c| c.generated)
        && candidates[0].program_hash != candidates[1].program_hash;
    let trials_passed = candidates
        .iter()
        .all(|c| before(c.born, c.trial_pickup) && before(c.trial_pickup, c.trial_returned));
    let selected = frames.windows(2).find_map(|p| {
        let prev = cell(&p[0], bloom::SELECTOR)?;
        let now = cell(&p[1], bloom::SELECTOR)?;
        (prev.memory[2] == 0 && (1..=2).contains(&now.memory[2]))
            .then(|| (p[1].tick, now.memory[2] - 1))
    });
    let selected_candidate = selected.map(|(_, id)| id);
    let mut selection = None;
    let mut request = None;
    let mut child_request = None;
    let mut pickup = None;
    let mut accepted = None;
    let mut depot_report = None;
    let mut child_report = None;
    let mut child_ack = None;
    let mut acknowledgment = None;
    let mut serviced = None;
    let mut selection_passed = false;
    let mut request_passed = false;
    let mut custody_passed = false;
    let mut acknowledgment_passed = false;
    let mut spare_preserved = false;
    if let Some((selection_tick, id)) = selected {
        let berth = bloom::BERTHS[usize::from(id)];
        let loser = bloom::BERTHS[usize::from(1 - id)];
        selection = consumed(frames, |s| {
            s.from == endpoint(bloom::RELAY, id)
                && s.to_cell == bloom::SELECTOR
                && s.to_port == id
                && s.link == berth.feedback_link
                && !s.bit
                && s.receipt_spark == Some(berth.trial)
        });
        let trial_report = consumed(frames, |s| {
            s.from == (Endpoint::Depot { id: berth.depot })
                && s.link == berth.report_link
                && s.to_cell == bloom::RELAY
                && s.to_port == id
                && !s.bit
                && s.receipt_spark == Some(berth.trial)
        });
        selection_passed = selection
            .as_ref()
            .zip(trial_report.as_ref())
            .is_some_and(|(s, r)| {
                s.tick == selection_tick
                    && forwarded(frames, r, s, bloom::RELAY, id, 1)
                    && take(frames, s, bloom::SELECTOR, id, 1)
                    && candidates
                        .iter()
                        .all(|c| before(c.trial_returned, Some(s.tick)))
                    && before(
                        candidates[usize::from(id)].trial_accepted,
                        Some(r.signal.sent_tick + 1),
                    )
                    && s.tick < bloom::CONFIRMATION_OPENS
                    && frames
                        .iter()
                        .filter(|f| f.tick >= s.tick)
                        .all(|f| cell(f, bloom::SELECTOR).is_some_and(|c| c.memory[2] == id + 1))
            });
        request = consumed(frames, |s| {
            s.from == endpoint(fixtures::REQUESTER, 0)
                && s.to_cell == bloom::SELECTOR
                && s.to_port == 2
                && s.link == fixtures::REQUEST_LINK
                && s.bit
                && s.receipt_spark.is_none()
                && s.sent_tick >= bloom::CONFIRMATION_OPENS
        });
        child_request = consumed(frames, |s| {
            s.from == endpoint(bloom::SELECTOR, id)
                && s.to_cell == berth.child
                && s.to_port == 0
                && s.link == berth.command_link
                && s.bit
                && s.receipt_spark.is_none()
        });
        request_passed = request
            .as_ref()
            .zip(child_request.as_ref())
            .is_some_and(|(r, c)| {
                selection_tick < r.signal.sent_tick && r.tick < c.signal.sent_tick
            && take(frames,r,bloom::SELECTOR,2,0) // selector consumes into scratch/phase slot
            && send(frames,&r.signal,fixtures::REQUESTER,0,BitSource::Constant { value:true })
            && send(frames,&c.signal,bloom::SELECTOR,id,BitSource::Constant { value:true })
            && take(frames,c,berth.child,0,1)
            });
        let spark = Spark {
            id: berth.confirmation,
            bit: false,
        };
        let source = experiment
            .sources
            .iter()
            .find(|s| s.id == berth.source)
            .ok_or("Missing source")?;
        let depot = experiment
            .depots
            .iter()
            .find(|s| s.id == berth.depot)
            .ok_or("Missing depot")?;
        pickup = movement(frames, berth.child, source.position, spark, Action::Pickup);
        accepted = movement(frames, berth.child, depot.position, spark, Action::Drop);
        depot_report = consumed(frames, |s| {
            s.from == (Endpoint::Depot { id: berth.depot })
                && s.to_cell == bloom::RELAY
                && s.to_port == id
                && s.link == berth.report_link
                && !s.bit
                && s.receipt_spark == Some(berth.confirmation)
        });
        custody_passed = child_request
            .as_ref()
            .is_some_and(|r| before(Some(r.tick), pickup))
            && before(pickup, accepted)
            && depot_report
                .as_ref()
                .is_some_and(|r| accepted.is_some_and(|a| a == r.signal.sent_tick));
        let feedback = consumed(frames, |s| {
            s.from == endpoint(bloom::RELAY, id)
                && s.to_cell == bloom::SELECTOR
                && s.to_port == id
                && s.link == berth.feedback_link
                && !s.bit
                && s.receipt_spark == Some(berth.confirmation)
        });
        child_report = consumed(frames, |s| {
            s.from == endpoint(bloom::SELECTOR, id)
                && s.to_cell == berth.child
                && s.to_port == 0
                && s.link == berth.command_link
                && !s.bit
                && s.receipt_spark == Some(berth.confirmation)
        });
        child_ack = consumed(frames, |s| {
            s.from == endpoint(berth.child, 1)
                && s.to_cell == bloom::SELECTOR
                && s.to_port == 3
                && s.link == fixtures::CHILD_ACK_LINKS[usize::from(id)]
                && !s.bit
                && s.receipt_spark == Some(berth.confirmation)
        });
        acknowledgment = consumed(frames, |s| {
            s.from == endpoint(bloom::SELECTOR, 2)
                && s.to_cell == fixtures::REQUESTER
                && s.to_port == 0
                && s.link == fixtures::ACK_LINK
                && !s.bit
                && s.receipt_spark == Some(berth.confirmation)
        });
        acknowledgment_passed = depot_report
            .as_ref()
            .zip(feedback.as_ref())
            .zip(child_report.as_ref())
            .zip(child_ack.as_ref())
            .zip(acknowledgment.as_ref())
            .is_some_and(|((((d, f), r), c), a)| {
                forwarded(frames, d, f, bloom::RELAY, id, 1)
                    && forwarded(frames, f, r, bloom::SELECTOR, id, 1)
                    && forwarded(frames, r, c, berth.child, 1, 3)
                    && forwarded(frames, c, a, bloom::SELECTOR, 2, 1)
                    && take(frames, a, fixtures::REQUESTER, 0, 2)
                    && cell(last, fixtures::REQUESTER).is_some_and(|c| {
                        c.memory[0] == 2 && c.evidence[2] == Some(berth.confirmation)
                    })
            });
        serviced = unique(
            last.state
                .delivered
                .iter()
                .filter(|d| d.spark == spark && d.beacon == 20)
                .map(|d| d.tick)
                .collect(),
        );
        let spare = Spark {
            id: loser.confirmation,
            bit: false,
        };
        spare_preserved = frames.iter().all(|f| {
            f.state
                .sources
                .iter()
                .any(|s| s.id == loser.source && s.sparks.contains(&spare))
        });
        // False or early acknowledgments must not be hidden by a later valid one.
        acknowledgment_passed &= frames.iter().all(|f| {
            f.signals
                .iter()
                .filter(|e| {
                    e.outcome == "consumed"
                        && e.signal.to_cell == fixtures::REQUESTER
                        && e.signal.to_port == 0
                })
                .all(|e| {
                    !e.signal.bit
                        && e.signal.receipt_spark == Some(berth.confirmation)
                        && accepted.is_some_and(|a| a < e.signal.sent_tick)
                })
        });
    }
    // Every attempted command and acknowledgment must tell the same story,
    // including packets that failed to queue or reach a recipient.
    if let Some(id) = selected_candidate {
        let berth = bloom::BERTHS[usize::from(id)];
        for frame in frames {
            for event in &frame.signals {
                let signal = &event.signal;
                if signal.sent_tick != frame.tick {
                    continue;
                }
                if signal.from == endpoint(bloom::SELECTOR, 0)
                    || signal.from == endpoint(bloom::SELECTOR, 1)
                {
                    request_passed &= signal.from == endpoint(bloom::SELECTOR, id)
                        && signal.to_cell == berth.child
                        && signal.to_port == 0
                        && signal.link == berth.command_link;
                    if signal.bit {
                        request_passed &= signal.receipt_spark.is_none()
                            && request.as_ref().is_some_and(|r| r.tick < signal.sent_tick);
                    } else {
                        acknowledgment_passed &= signal.receipt_spark == Some(berth.confirmation)
                            && depot_report
                                .as_ref()
                                .is_some_and(|r| r.tick < signal.sent_tick)
                            && send(
                                frames,
                                signal,
                                bloom::SELECTOR,
                                id,
                                BitSource::Memory { slot: 1 },
                            );
                    }
                }
                if signal.from == endpoint(bloom::SELECTOR, 2) {
                    acknowledgment_passed &= signal.link == fixtures::ACK_LINK
                        && !signal.bit
                        && signal.receipt_spark == Some(berth.confirmation)
                        && accepted.is_some_and(|a| a < signal.sent_tick)
                        && child_ack
                            .as_ref()
                            .is_some_and(|a| a.tick < signal.sent_tick);
                }
                if signal.from == endpoint(berth.child, 1)
                    || signal.from == endpoint(bloom::BERTHS[usize::from(1 - id)].child, 1)
                {
                    acknowledgment_passed &= signal.from == endpoint(berth.child, 1)
                        && signal.link == fixtures::CHILD_ACK_LINKS[usize::from(id)]
                        && !signal.bit
                        && signal.receipt_spark == Some(berth.confirmation)
                        && child_report
                            .as_ref()
                            .is_some_and(|r| r.tick < signal.sent_tick);
                }
            }
        }
    }
    let service_passed = receipt.result.status == RunStatus::Complete
        && receipt.result.ticks_completed == expected.ticks
        && receipt.result.outcome.passed
        && before(acknowledgment.as_ref().map(|a| a.tick), serviced);
    let exchange_passed = fixed_world_passed
        && generation_passed
        && trials_passed
        && selection_passed
        && request_passed
        && custody_passed
        && acknowledgment_passed
        && spare_preserved
        && service_passed;
    Ok(ExchangeGrade {
        schema: SCHEMA.into(),
        case_id: case_id.into(),
        experiment_hash: receipt.experiment_hash.clone(),
        result_hash: receipt.result_hash.clone(),
        candidates,
        selected_candidate,
        selection,
        request,
        child_request,
        pickup,
        accepted,
        depot_report,
        child_report,
        child_ack,
        acknowledgment,
        serviced,
        work_total: receipt.result.costs.total(),
        fixed_world_passed,
        generation_passed,
        trials_passed,
        selection_passed,
        request_passed,
        custody_passed,
        acknowledgment_passed,
        spare_preserved,
        service_passed,
        exchange_passed,
    })
}
