use crate::model::*;
use crate::sim::{Cat, Meter, Stop, emit};

pub fn face(heading: Direction, relative: Relative) -> Direction {
    let headings = [
        Direction::North,
        Direction::East,
        Direction::South,
        Direction::West,
    ];
    let start = headings.iter().position(|value| *value == heading).unwrap();
    let offset = match relative {
        Relative::Forward => 0,
        Relative::Right => 1,
        Relative::Back => 2,
        Relative::Left => 3,
    };
    headings[(start + offset) % 4]
}
pub fn destination(position: Point, heading: Direction, direction: Relative) -> Option<Point> {
    let (dx, dy) = match face(heading, direction) {
        Direction::North => (0, -1),
        Direction::East => (1, 0),
        Direction::South => (0, 1),
        Direction::West => (-1, 0),
    };
    let x = position.x as i16 + dx;
    let y = position.y as i16 + dy;
    if x < 0 || y < 0 || x > u8::MAX as i16 || y > u8::MAX as i16 {
        None
    } else {
        Some(Point {
            x: x as u8,
            y: y as u8,
        })
    }
}
pub fn blocked(experiment: &Experiment, state: &State, cell: usize, direction: Relative) -> bool {
    let actor = &state.cells[cell];
    match destination(actor.position, actor.heading, direction) {
        None => true,
        Some(point) => {
            point.x >= experiment.width
                || point.y >= experiment.height
                || experiment.walls.contains(&point)
                || state
                    .closed_edges
                    .contains(&Edge::new(actor.position, point))
                || state
                    .cells
                    .iter()
                    .any(|other| other.id != actor.id && other.position == point)
        }
    }
}

fn check_condition(
    condition: &Condition,
    experiment: &Experiment,
    state: &State,
    index: usize,
    meter: &mut Meter,
) -> Result<bool, Stop> {
    meter.charge(Cat::Conditions, 1)?;
    let cell = &state.cells[index];
    if let Condition::Memory { slot, value } = condition {
        meter.charge(Cat::MemoryReads, 1)?;
        return Ok(cell.memory[*slot as usize] == *value);
    }
    meter.charge(Cat::Sensors, 1)?;
    Ok(match condition {
        Condition::Carrying { value } => cell.cargo.is_some() == *value,
        Condition::AtSource { value } => {
            experiment
                .sources
                .iter()
                .any(|source| source.position == cell.position)
                == *value
        }
        Condition::AtDepot { value } => {
            experiment
                .depots
                .iter()
                .any(|depot| depot.position == cell.position)
                == *value
        }
        Condition::AtBeacon { value } => {
            experiment
                .beacons
                .iter()
                .any(|beacon| beacon.position == cell.position)
                == *value
        }
        Condition::AtReceiver { value } => {
            (experiment
                .depots
                .iter()
                .any(|depot| depot.position == cell.position)
                || experiment
                    .beacons
                    .iter()
                    .any(|beacon| beacon.position == cell.position))
                == *value
        }
        Condition::Blocked { direction, value } => {
            meter.charge(Cat::Checking, state.closed_edges.len() as u64)?;
            blocked(experiment, state, index, *direction) == *value
        }
        Condition::HasMessage { port, value } => cell.inbox[*port as usize].is_some() == *value,
        Condition::MessageBit { port, value } => cell.inbox[*port as usize]
            .as_ref()
            .is_some_and(|signal| signal.bit == *value),
        Condition::Heading { direction } => cell.heading == *direction,
        Condition::Memory { .. } => unreachable!(),
    })
}

enum Fault {
    Limit(Stop),
    Action(&'static str),
}
impl From<Stop> for Fault {
    fn from(value: Stop) -> Self {
        Self::Limit(value)
    }
}
fn read_bit(
    source: &BitSource,
    cell: &CellState,
    meter: &mut Meter,
) -> Result<(bool, Option<u32>), Fault> {
    match source {
        BitSource::Constant { value } => {
            meter.charge(Cat::Checking, 1)?;
            Ok((*value, None))
        }
        BitSource::Memory { slot } => {
            meter.charge(Cat::MemoryReads, 1)?;
            Ok((
                cell.memory[*slot as usize] != 0,
                cell.evidence[*slot as usize],
            ))
        }
        BitSource::Message { port } => {
            meter.charge(Cat::Sensors, 1)?;
            cell.inbox[*port as usize]
                .as_ref()
                .map(|signal| (signal.bit, signal.receipt_spark))
                .ok_or(Fault::Action("no_message"))
        }
    }
}

pub(crate) fn credit(
    state: &mut State,
    beacon: usize,
    spark: Spark,
    specification: &Beacon,
    meter: &mut Meter,
) -> Result<(), Stop> {
    meter.charge(Cat::Transfers, 1)?;
    state.beacons[beacon].charge += specification.spark_charge;
    state.beacons[beacon].delivered += 1;
    state.delivered.push(Delivery {
        tick: state.tick,
        spark,
        beacon: specification.id,
    });
    Ok(())
}

fn execute(
    action: &Action,
    experiment: &Experiment,
    state: &mut State,
    index: usize,
    meter: &mut Meter,
    signals: &mut Vec<SignalEvent>,
) -> Result<(), Fault> {
    meter.charge(Cat::Actions, 1)?;
    match action {
        Action::Wait => {}
        Action::Move { direction } => {
            meter.charge(Cat::Checking, 1)?;
            meter.charge(Cat::Checking, state.closed_edges.len() as u64)?;
            if !experiment.cells[index].mobile || blocked(experiment, state, index, *direction) {
                return Err(Fault::Action("movement_blocked"));
            }
            meter.charge(Cat::Transfers, 1)?;
            let cell = &mut state.cells[index];
            cell.position = destination(cell.position, cell.heading, *direction).unwrap();
            cell.heading = face(cell.heading, *direction);
        }
        Action::Turn { direction } => {
            meter.charge(Cat::Transfers, 1)?;
            state.cells[index].heading = face(state.cells[index].heading, *direction);
        }
        Action::Pickup => {
            meter.charge(Cat::Checking, 1)?;
            if state.cells[index].cargo.is_some() {
                return Err(Fault::Action("cargo_full"));
            }
            let source = experiment
                .sources
                .iter()
                .position(|source| source.position == state.cells[index].position)
                .ok_or(Fault::Action("not_at_source"))?;
            if state.sources[source].sparks.is_empty() {
                return Err(Fault::Action("source_empty"));
            }
            meter.charge(Cat::Transfers, 1)?;
            state.cells[index].cargo = Some(state.sources[source].sparks.remove(0));
        }
        Action::Drop => {
            meter.charge(Cat::Checking, 1)?;
            let spark = state.cells[index]
                .cargo
                .ok_or(Fault::Action("cargo_empty"))?;
            let position = state.cells[index].position;
            if let Some(depot) = experiment
                .depots
                .iter()
                .position(|depot| depot.position == position)
            {
                if state.depots[depot].sparks.len() >= experiment.depots[depot].capacity as usize {
                    return Err(Fault::Action("depot_full"));
                }
                meter.charge(Cat::Transfers, 1)?;
                state.cells[index].cargo = None;
                state.depots[depot].sparks.push(spark);
                emit(
                    experiment,
                    state,
                    Endpoint::Depot {
                        id: experiment.depots[depot].id,
                    },
                    spark.bit,
                    Some(spark.id),
                    meter,
                    signals,
                )?;
            } else if let Some(beacon) = experiment
                .beacons
                .iter()
                .position(|beacon| beacon.position == position)
            {
                if experiment.beacons[beacon].accepts != spark.bit {
                    return Err(Fault::Action("beacon_rejects_bit"));
                }
                credit(state, beacon, spark, &experiment.beacons[beacon], meter)?;
                state.cells[index].cargo = None;
            } else {
                return Err(Fault::Action("not_at_receiver"));
            }
        }
        Action::WriteMemory { slot, value } => {
            meter.charge(Cat::MemoryWrites, 1)?;
            state.cells[index].memory[*slot as usize] = *value;
            state.cells[index].evidence[*slot as usize] = None;
        }
        Action::TakeMessage { port, slot } => {
            meter.charge(Cat::Sensors, 1)?;
            let signal = state.cells[index].inbox[*port as usize]
                .clone()
                .ok_or(Fault::Action("no_message"))?;
            meter.charge(Cat::MemoryWrites, 1)?;
            meter.charge(Cat::Messages, 1)?;
            state.cells[index].memory[*slot as usize] = u8::from(signal.bit);
            state.cells[index].evidence[*slot as usize] = signal.receipt_spark;
            state.cells[index].inbox[*port as usize] = None;
            signals.push(SignalEvent {
                signal,
                outcome: "consumed".into(),
            });
        }
        Action::Send { port, bit } => {
            let (value, evidence) = read_bit(bit, &state.cells[index], meter)?;
            let accepted = emit(
                experiment,
                state,
                Endpoint::Cell {
                    id: state.cells[index].id,
                    port: *port,
                },
                value,
                evidence,
                meter,
                signals,
            )?;
            if accepted == 0 {
                return Err(Fault::Action("no_signal_queued"));
            }
        }
        Action::Route { valve, bit } => {
            let (value, _) = read_bit(bit, &state.cells[index], meter)?;
            meter.charge(Cat::Checking, 1)?;
            let valve_index = experiment
                .valves
                .iter()
                .position(|entry| entry.id == *valve)
                .ok_or(Fault::Action("unknown_valve"))?;
            let specification = &experiment.valves[valve_index];
            if state.cells[index].position.distance(specification.position) != 1 {
                return Err(Fault::Action("valve_not_adjacent"));
            }
            if !state.valves[valve_index].enabled {
                return Err(Fault::Action("valve_disabled"));
            }
            let depot = experiment
                .depots
                .iter()
                .position(|depot| depot.id == specification.depot)
                .unwrap();
            let spark = *state.depots[depot]
                .sparks
                .first()
                .ok_or(Fault::Action("depot_empty"))?;
            let beacon_id = if value {
                specification.beacon_one
            } else {
                specification.beacon_zero
            };
            let beacon = experiment
                .beacons
                .iter()
                .position(|beacon| beacon.id == beacon_id)
                .unwrap();
            if experiment.beacons[beacon].accepts != spark.bit {
                return Err(Fault::Action("beacon_rejects_bit"));
            }
            credit(state, beacon, spark, &experiment.beacons[beacon], meter)?;
            state.depots[depot].sparks.remove(0);
        }
    }
    Ok(())
}

pub(crate) fn activate(
    experiment: &Experiment,
    state: &mut State,
    index: usize,
    meter: &mut Meter,
) -> (Activation, Vec<SignalEvent>, Option<Stop>) {
    let before = state.cells[index].position;
    let mut record = Activation {
        cell: state.cells[index].id,
        rule: None,
        action: Action::Wait,
        success: false,
        error: None,
        position_before: before,
        position_after: before,
        work_before: meter.costs.total(),
        work_after: meter.costs.total(),
    };
    meter.begin_activation(experiment.activation_fuel);
    let mut next = state.clone();
    let mut signals = Vec::new();
    let result = (|| -> Result<(), Fault> {
        meter.charge(Cat::Scheduling, 1)?;
        let mut selected = None;
        for (rule_index, rule) in experiment.cells[index].program.rules.iter().enumerate() {
            meter.charge(Cat::Checking, 1)?;
            let mut matches = true;
            for condition in &rule.when {
                if !check_condition(condition, experiment, state, index, meter)? {
                    matches = false;
                    break;
                }
            }
            if matches {
                selected = Some((rule_index, rule));
                break;
            }
        }
        record.rule = selected.map(|(index, _)| index);
        record.action = selected
            .map(|(_, rule)| rule.action.clone())
            .unwrap_or(Action::Wait);
        let action_result = execute(
            &record.action,
            experiment,
            &mut next,
            index,
            meter,
            &mut signals,
        );
        if matches!(action_result, Err(Fault::Limit(_))) {
            return action_result;
        }
        if let Some((
            _,
            Rule {
                remember: Some(write),
                ..
            },
        )) = selected
        {
            meter.charge(Cat::MemoryWrites, 1)?;
            next.cells[index].memory[write.slot as usize] = write.value;
            next.cells[index].evidence[write.slot as usize] = None;
        }
        action_result
    })();
    meter.end_activation();
    record.work_after = meter.costs.total();
    match result {
        Err(Fault::Limit(stop)) => {
            record.error = Some(
                match stop {
                    Stop::Fuel => "fuel_exhausted",
                    Stop::Activation => "activation_limit",
                }
                .into(),
            );
            (record, Vec::new(), Some(stop))
        }
        result => {
            record.success = result.is_ok();
            if let Err(Fault::Action(message)) = result {
                record.error = Some(message.into());
            }
            record.position_after = next.cells[index].position;
            *state = next;
            (record, signals, None)
        }
    }
}
