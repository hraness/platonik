use crate::model::*;
use crate::{construction, policy};
use std::collections::BTreeSet;
use std::sync::atomic::{AtomicU64, Ordering};

static EXECUTIONS: AtomicU64 = AtomicU64::new(0);

/// Process-local telemetry, including verification replays. It is observer data,
/// outside deterministic receipts and the modeled world-work ledger.
pub fn execution_count() -> u64 {
    EXECUTIONS.load(Ordering::Relaxed)
}

#[derive(Clone, Copy)]
pub(crate) enum Cat {
    Loading,
    Scheduling,
    Conditions,
    Sensors,
    MemoryReads,
    MemoryWrites,
    Actions,
    Messages,
    Transfers,
    Checking,
    Draining,
    Copying,
    Construction,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Stop {
    Fuel,
    Activation,
}
pub(crate) struct Meter {
    pub costs: Costs,
    fuel: u64,
    activation: Option<(u64, u32)>,
}
impl Meter {
    pub(crate) fn charge(&mut self, category: Cat, amount: u64) -> Result<(), Stop> {
        for _ in 0..amount {
            let total = self.costs.total();
            if total >= self.fuel {
                return Err(Stop::Fuel);
            }
            if self
                .activation
                .is_some_and(|(start, limit)| total - start >= limit as u64)
            {
                return Err(Stop::Activation);
            }
            let counter = match category {
                Cat::Loading => &mut self.costs.loading,
                Cat::Scheduling => &mut self.costs.scheduling,
                Cat::Conditions => &mut self.costs.conditions,
                Cat::Sensors => &mut self.costs.sensors,
                Cat::MemoryReads => &mut self.costs.memory_reads,
                Cat::MemoryWrites => &mut self.costs.memory_writes,
                Cat::Actions => &mut self.costs.actions,
                Cat::Messages => &mut self.costs.messages,
                Cat::Transfers => &mut self.costs.transfers,
                Cat::Checking => &mut self.costs.checking,
                Cat::Draining => &mut self.costs.draining,
                Cat::Copying => &mut self.costs.copying,
                Cat::Construction => &mut self.costs.construction,
            };
            *counter += 1;
        }
        Ok(())
    }
    pub(crate) fn begin_activation(&mut self, limit: u32) {
        self.activation = Some((self.costs.total(), limit));
    }
    pub(crate) fn end_activation(&mut self) {
        self.activation = None;
    }
}

fn require(value: bool, message: &str) -> Result<(), String> {
    if value { Ok(()) } else { Err(message.into()) }
}
fn unique(ids: impl IntoIterator<Item = u16>) -> bool {
    let mut seen = BTreeSet::new();
    ids.into_iter().all(|id| seen.insert(id))
}
fn valid_bit(source: &BitSource) -> bool {
    match source {
        BitSource::Constant { .. } => true,
        BitSource::Memory { slot } => *slot < 4,
        BitSource::Message { port } => *port < 4,
    }
}
pub(crate) fn validate_program(experiment: &Experiment, program: &Program) -> Result<(), String> {
    require(
        !program.rules.is_empty() && program.rules.len() <= 32,
        "Programs need 1–32 rules.",
    )?;
    for rule in &program.rules {
        require(
            rule.when.len() <= 8 && rule.remember.as_ref().is_none_or(|write| write.slot < 4),
            "Condition or memory limits exceeded.",
        )?;
        for condition in &rule.when {
            require(
                match condition {
                    Condition::Memory { slot, .. } => *slot < 4,
                    Condition::HasMessage { port, .. } | Condition::MessageBit { port, .. } => {
                        *port < 4
                    }
                    Condition::HasMaterial { .. } => experiment.version == CONSTRUCTION_VERSION,
                    Condition::AssemblyStage { blueprint, .. } => {
                        experiment.version == CONSTRUCTION_VERSION
                            && experiment.construction.as_ref().is_some_and(|spec| {
                                spec.blueprints.iter().any(|entry| entry.id == *blueprint)
                            })
                    }
                    _ => true,
                },
                "Invalid condition memory slot or port.",
            )?;
        }
        require(
            match &rule.action {
                Action::WriteMemory { slot, .. } => *slot < 4,
                Action::TakeMessage { port, slot } => *port < 4 && *slot < 4,
                Action::Send { port, bit } => *port < 4 && valid_bit(bit),
                Action::Route { valve, bit } => {
                    valid_bit(bit) && experiment.valves.iter().any(|entry| entry.id == *valve)
                }
                Action::GatherMaterial { stock } => {
                    experiment.version == CONSTRUCTION_VERSION
                        && experiment
                            .construction
                            .as_ref()
                            .is_some_and(|spec| spec.stocks.iter().any(|entry| entry.id == *stock))
                }
                Action::Build { blueprint } | Action::Activate { blueprint } => {
                    experiment.version == CONSTRUCTION_VERSION
                        && experiment.construction.as_ref().is_some_and(|spec| {
                            spec.blueprints.iter().any(|entry| entry.id == *blueprint)
                        })
                }
                _ => true,
            },
            "Invalid action slot, port, or valve.",
        )?;
    }
    Ok(())
}
pub fn parse_experiment(input: &str) -> Result<Experiment, String> {
    require(input.len() <= MAX_INPUT_BYTES, "Experiment exceeds 64 KiB.")?;
    let experiment: Experiment =
        serde_json::from_str(input).map_err(|error| format!("Invalid experiment JSON: {error}"))?;
    validate_experiment(&experiment)?;
    Ok(experiment)
}
pub fn validate_experiment(experiment: &Experiment) -> Result<(), String> {
    require(
        protocol_for_version(experiment.version).is_some(),
        "Unsupported model version.",
    )?;
    require(
        (3..=32).contains(&experiment.width) && (3..=32).contains(&experiment.height),
        "Grid dimensions must be 3–32.",
    )?;
    require(
        (1..=MAX_TICKS).contains(&experiment.ticks)
            && experiment.fuel <= MAX_FUEL
            && (1..=1024).contains(&experiment.activation_fuel),
        "Invalid tick, fuel, or activation budget.",
    )?;
    require(
        experiment.walls.len() <= 512
            && !experiment.cells.is_empty()
            && experiment.cells.len() <= 16
            && experiment.sources.len() <= 8
            && experiment.depots.len() <= 8
            && !experiment.beacons.is_empty()
            && experiment.beacons.len() <= 8
            && experiment.valves.len() <= 8
            && experiment.links.len() <= 32
            && experiment.events.len() <= 64,
        "World entity limits exceeded.",
    )?;
    require(
        serde_json::to_vec(experiment)
            .map_err(|_| "Cannot serialize experiment.")?
            .len()
            <= MAX_INPUT_BYTES,
        "Canonical experiment exceeds 64 KiB.",
    )?;
    let on_grid = |point: Point| point.x < experiment.width && point.y < experiment.height;
    let usable = |point: Point| on_grid(point) && !experiment.walls.contains(&point);
    let mut walls = BTreeSet::new();
    for point in &experiment.walls {
        require(
            on_grid(*point) && walls.insert((point.x, point.y)),
            "Walls must be distinct in-bounds positions.",
        )?;
    }
    require(
        unique(experiment.cells.iter().map(|entry| entry.id))
            && unique(experiment.sources.iter().map(|entry| entry.id))
            && unique(experiment.depots.iter().map(|entry| entry.id))
            && unique(experiment.beacons.iter().map(|entry| entry.id))
            && unique(experiment.valves.iter().map(|entry| entry.id))
            && unique(experiment.links.iter().map(|entry| entry.id)),
        "Entity IDs must be unique within each kind.",
    )?;
    let mut positions = BTreeSet::new();
    for cell in &experiment.cells {
        require(
            usable(cell.position) && positions.insert((cell.position.x, cell.position.y)),
            "Cells need distinct usable positions.",
        )?;
        validate_program(experiment, &cell.program)?;
    }
    let mut stations = BTreeSet::new();
    for point in experiment
        .sources
        .iter()
        .map(|entry| entry.position)
        .chain(experiment.depots.iter().map(|entry| entry.position))
        .chain(experiment.beacons.iter().map(|entry| entry.position))
        .chain(experiment.valves.iter().map(|entry| entry.position))
    {
        require(
            usable(point) && stations.insert((point.x, point.y)),
            "Stations need distinct usable positions; cells may stand on them.",
        )?;
    }
    let mut sparks = BTreeSet::new();
    for source in &experiment.sources {
        for spark in &source.sparks {
            require(
                sparks.insert(spark.id),
                "Spark IDs must be globally unique.",
            )?;
        }
    }
    require(
        sparks.len() <= 128,
        "At most 128 initial sparks are allowed.",
    )?;
    for depot in &experiment.depots {
        require(
            (1..=128).contains(&depot.capacity),
            "Depot capacity must be 1–128.",
        )?;
    }
    for beacon in &experiment.beacons {
        require(
            (1..=10_000).contains(&beacon.initial_charge)
                && (1..=MAX_TICKS).contains(&beacon.drain_every)
                && (1..=1024).contains(&beacon.drain_amount)
                && (1..=64).contains(&beacon.spark_charge)
                && beacon.required_deliveries <= 128,
            "Invalid beacon charge, drain, or quota.",
        )?;
    }
    for valve in &experiment.valves {
        let depot = experiment
            .depots
            .iter()
            .find(|entry| entry.id == valve.depot)
            .ok_or("Valve depot is missing.")?;
        let zero = experiment
            .beacons
            .iter()
            .find(|entry| entry.id == valve.beacon_zero)
            .ok_or("Valve zero beacon is missing.")?;
        let one = experiment
            .beacons
            .iter()
            .find(|entry| entry.id == valve.beacon_one)
            .ok_or("Valve one beacon is missing.")?;
        require(
            valve.position.distance(depot.position) == 1
                && valve.position.distance(zero.position) == 1
                && valve.position.distance(one.position) == 1
                && !zero.accepts
                && one.accepts,
            "Valve needs adjacent depot and matching zero/one outlets.",
        )?;
    }
    for link in &experiment.links {
        let target = experiment
            .cells
            .iter()
            .find(|entry| entry.id == link.to_cell)
            .ok_or("Link recipient is missing.")?;
        let origin = match &link.from {
            Endpoint::Cell { id, port } => {
                require(*port < 4, "Invalid source port.")?;
                experiment
                    .cells
                    .iter()
                    .find(|entry| entry.id == *id)
                    .ok_or("Link sender is missing.")?
                    .position
            }
            Endpoint::Depot { id } => {
                experiment
                    .depots
                    .iter()
                    .find(|entry| entry.id == *id)
                    .ok_or("Link depot is missing.")?
                    .position
            }
        };
        require(
            link.to_port < 4
                && (1..=16).contains(&link.delay)
                && origin.distance(target.position) == 1,
            "Links require local adjacent endpoints, port 0–3, and delay 1–16.",
        )?;
    }
    for event in &experiment.events {
        require(
            (1..=experiment.ticks).contains(&event.tick),
            "Event tick is outside the run.",
        )?;
        require(
            match event.event {
                EventKind::LinkEnabled { id, .. } => {
                    experiment.links.iter().any(|entry| entry.id == id)
                }
                EventKind::ValveEnabled { id, .. } => {
                    experiment.valves.iter().any(|entry| entry.id == id)
                }
                EventKind::ClearMemory { cell } => {
                    experiment.cells.iter().any(|entry| entry.id == cell)
                }
                EventKind::EdgeBlocked { edge, .. } => {
                    experiment.version >= HAZARD_VERSION
                        && edge.is_canonical()
                        && usable(edge.a)
                        && usable(edge.b)
                }
            },
            "Event target does not exist.",
        )?;
    }
    construction::validate_spec(experiment)?;
    Ok(())
}

pub fn activation_order(experiment: &Experiment, tick: u32) -> Vec<u16> {
    order_ids(
        experiment,
        tick,
        experiment.cells.iter().map(|cell| cell.id).collect(),
    )
}
pub fn active_order(experiment: &Experiment, state: &State, tick: u32) -> Vec<u16> {
    order_ids(
        experiment,
        tick,
        state
            .cells
            .iter()
            .filter(|cell| {
                state.construction.as_ref().is_none_or(|construction| {
                    construction
                        .births
                        .iter()
                        .find(|birth| birth.body.cell.id == cell.id)
                        .is_none_or(|birth| birth.tick < tick)
                })
            })
            .map(|cell| cell.id)
            .collect(),
    )
}
fn order_ids(experiment: &Experiment, tick: u32, mut ids: Vec<u16>) -> Vec<u16> {
    fn mix(mut value: u64) -> u64 {
        value = value.wrapping_add(0x9e3779b97f4a7c15);
        value = (value ^ (value >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
        value = (value ^ (value >> 27)).wrapping_mul(0x94d049bb133111eb);
        value ^ (value >> 31)
    }
    ids.sort_by_key(|id| {
        (
            mix(experiment.seed ^ ((tick as u64) << 32) ^ *id as u64),
            *id,
        )
    });
    ids
}
fn origin_position(experiment: &Experiment, state: &State, endpoint: &Endpoint) -> Point {
    match endpoint {
        Endpoint::Cell { id, .. } => {
            state
                .cells
                .iter()
                .find(|cell| cell.id == *id)
                .unwrap()
                .position
        }
        Endpoint::Depot { id } => {
            experiment
                .depots
                .iter()
                .find(|depot| depot.id == *id)
                .unwrap()
                .position
        }
    }
}
pub(crate) fn emit(
    experiment: &Experiment,
    state: &mut State,
    endpoint: Endpoint,
    bit: bool,
    evidence: Option<u32>,
    meter: &mut Meter,
    events: &mut Vec<SignalEvent>,
) -> Result<usize, Stop> {
    let mut accepted = 0;
    let links: Vec<_> = construction::link_definitions(experiment, state)
        .into_iter()
        .cloned()
        .collect();
    for (index, link) in links
        .iter()
        .enumerate()
        .filter(|(_, link)| link.from == endpoint)
    {
        meter.charge(Cat::Messages, 1)?;
        meter.charge(Cat::Checking, 1)?;
        let recipient = state
            .cells
            .iter()
            .find(|cell| cell.id == link.to_cell)
            .unwrap();
        let signal = Signal {
            id: state.next_signal,
            link: link.id,
            from: endpoint.clone(),
            to_cell: link.to_cell,
            to_port: link.to_port,
            bit,
            sent_tick: state.tick,
            deliver_tick: state.tick + link.delay,
            receipt_spark: evidence,
        };
        state.next_signal += 1;
        let outcome = if !state.links[index].enabled {
            "disabled"
        } else if origin_position(experiment, state, &endpoint).distance(recipient.position) != 1 {
            "not_adjacent"
        } else if state.pending.len() >= MAX_PENDING {
            "full"
        } else {
            state.pending.push(signal.clone());
            accepted += 1;
            "queued"
        };
        events.push(SignalEvent {
            signal,
            outcome: outcome.into(),
        });
    }
    Ok(accepted)
}

fn initial_state(experiment: &Experiment) -> State {
    State {
        tick: 0,
        cells: experiment
            .cells
            .iter()
            .map(|cell| CellState {
                id: cell.id,
                position: cell.position,
                heading: cell.heading,
                memory: cell.memory,
                evidence: [None; 4],
                cargo: None,
                inbox: std::array::from_fn(|_| None),
                material: None,
            })
            .collect(),
        sources: experiment
            .sources
            .iter()
            .map(|source| SourceState {
                id: source.id,
                sparks: source.sparks.clone(),
            })
            .collect(),
        depots: experiment
            .depots
            .iter()
            .map(|depot| DepotState {
                id: depot.id,
                sparks: Vec::new(),
            })
            .collect(),
        beacons: experiment
            .beacons
            .iter()
            .map(|beacon| BeaconState {
                id: beacon.id,
                charge: beacon.initial_charge,
                delivered: 0,
                drained: 0,
                exhausted: false,
            })
            .collect(),
        valves: experiment
            .valves
            .iter()
            .map(|valve| EnabledState {
                id: valve.id,
                enabled: valve.enabled,
            })
            .collect(),
        links: experiment
            .links
            .iter()
            .map(|link| EnabledState {
                id: link.id,
                enabled: link.enabled,
            })
            .collect(),
        pending: Vec::new(),
        delivered: Vec::new(),
        next_signal: 1,
        closed_edges: Vec::new(),
        construction: experiment
            .construction
            .as_ref()
            .map(construction::initial_state),
    }
}
fn outcome(experiment: &Experiment, state: &State, status: RunStatus, initial: u32) -> Outcome {
    let present = state
        .sources
        .iter()
        .map(|source| source.sparks.len())
        .sum::<usize>()
        + state
            .depots
            .iter()
            .map(|depot| depot.sparks.len())
            .sum::<usize>()
        + state
            .cells
            .iter()
            .filter(|cell| cell.cargo.is_some())
            .count()
        + state.delivered.len();
    let all_beacons_positive = state
        .beacons
        .iter()
        .all(|beacon| beacon.charge > 0 && !beacon.exhausted);
    let quotas_met = experiment
        .beacons
        .iter()
        .zip(&state.beacons)
        .all(|(goal, result)| result.delivered >= goal.required_deliveries);
    let conserved = present == initial as usize;
    Outcome {
        all_beacons_positive,
        quotas_met,
        conserved,
        passed: status == RunStatus::Complete && all_beacons_positive && quotas_met && conserved,
    }
}

fn check_live_invariants(experiment: &Experiment, state: &State) -> Result<(), String> {
    construction::check_state(experiment, state)?;
    require(
        state.closed_edges.len() <= experiment.events.len()
            && state.closed_edges.windows(2).all(|pair| pair[0] < pair[1])
            && state.closed_edges.iter().all(|edge| {
                experiment.version >= HAZARD_VERSION && edge.is_canonical()
                    && experiment.events.iter().any(|event| {
                        matches!(event.event, EventKind::EdgeBlocked { edge: declared, .. } if declared == *edge)
                    })
            }),
        "Runtime invariant: closed movement edges are not bounded declared edges.",
    )?;
    let expected: std::collections::BTreeMap<_, _> = experiment
        .sources
        .iter()
        .flat_map(|source| &source.sparks)
        .map(|spark| (spark.id, spark.bit))
        .collect();
    let mut actual = std::collections::BTreeMap::new();
    for spark in state
        .sources
        .iter()
        .flat_map(|source| &source.sparks)
        .chain(state.depots.iter().flat_map(|depot| &depot.sparks))
        .chain(state.cells.iter().filter_map(|cell| cell.cargo.as_ref()))
        .chain(state.delivered.iter().map(|delivery| &delivery.spark))
    {
        require(
            actual.insert(spark.id, spark.bit).is_none(),
            "Runtime invariant: duplicate spark identity.",
        )?;
    }
    require(
        actual == expected,
        "Runtime invariant: spark inventory or payload changed.",
    )?;
    for (specification, beacon) in experiment.beacons.iter().zip(&state.beacons) {
        let deliveries = state
            .delivered
            .iter()
            .filter(|delivery| delivery.beacon == beacon.id)
            .count() as u32;
        let supplied = specification.initial_charge as u64
            + deliveries as u64 * specification.spark_charge as u64;
        require(
            beacon.delivered == deliveries
                && beacon.drained as u64 <= supplied
                && beacon.charge as u64 + beacon.drained as u64 == supplied,
            "Runtime invariant: beacon energy ledger does not balance.",
        )?;
        require(
            beacon.charge != 0 || beacon.exhausted,
            "Runtime invariant: beacon exhaustion was not recorded.",
        )?;
    }
    Ok(())
}

pub fn run(experiment: &Experiment) -> Result<RunResult, String> {
    run_through(experiment, experiment.ticks, None)
}

/// The optional prefix is admitted only by continuation's checked replay path.
/// This crate-private driver never makes a caller-supplied state authoritative.
pub(crate) fn run_through(
    experiment: &Experiment,
    through_tick: u32,
    prefix: Option<&[Frame]>,
) -> Result<RunResult, String> {
    validate_experiment(experiment)?;
    require(
        through_tick <= experiment.ticks,
        "Advance exceeds the original tick horizon.",
    )?;
    if let Some(frames) = prefix {
        require(
            !frames.is_empty()
                && frames.len() <= experiment.ticks as usize
                && frames.iter().all(|frame| frame.complete)
                && frames.last().is_some_and(|frame| frame.tick < through_tick),
            "Continuation requires a complete prefix and a later absolute tick.",
        )?;
    }
    EXECUTIONS.fetch_add(1, Ordering::Relaxed);
    let initial_sparks = experiment
        .sources
        .iter()
        .map(|source| source.sparks.len() as u32)
        .sum();
    let (mut state, mut meter, mut status, mut frames, mut ticks_completed) =
        if let Some(prefix) = prefix {
            let last = prefix.last().unwrap();
            let limited = prefix
                .iter()
                .flat_map(|frame| &frame.activations)
                .any(|activation| activation.error.as_deref() == Some("activation_limit"));
            (
                last.state.clone(),
                Meter {
                    costs: last.costs.clone(),
                    fuel: experiment.fuel,
                    activation: None,
                },
                if limited {
                    RunStatus::ActivationLimit
                } else {
                    RunStatus::Complete
                },
                prefix.to_vec(),
                last.tick,
            )
        } else {
            let state = initial_state(experiment);
            let mut meter = Meter {
                costs: Costs::default(),
                fuel: experiment.fuel,
                activation: None,
            };
            // Loading charges every canonical input byte; host serialization/allocation time is not a CPU estimate.
            let loading = serde_json::to_vec(experiment)
                .map_err(|error| error.to_string())?
                .len() as u64;
            let initial_checking = (experiment.walls.len()
                + experiment.cells.len()
                + experiment.sources.len()
                + experiment.depots.len()
                + experiment.beacons.len()
                + experiment.valves.len()
                + experiment.links.len()
                + experiment.events.len()) as u64
                + initial_sparks as u64
                + experiment
                    .construction
                    .as_ref()
                    .map_or(0, construction::initial_checking);
            let loaded = meter
                .charge(Cat::Loading, loading)
                .and_then(|_| meter.charge(Cat::Checking, initial_checking))
                .is_ok();
            let status = if loaded {
                RunStatus::Complete
            } else {
                RunStatus::FuelExhausted
            };
            let frames = vec![Frame {
                tick: 0,
                complete: loaded,
                events: Vec::new(),
                signals: Vec::new(),
                activations: Vec::new(),
                state: state.clone(),
                costs: meter.costs.clone(),
            }];
            (state, meter, status, frames, 0)
        };
    if frames.last().unwrap().complete {
        for tick in ticks_completed + 1..=through_tick {
            let eligible = active_order(experiment, &state, tick);
            state.tick = tick;
            let mut frame = Frame {
                tick,
                complete: false,
                events: Vec::new(),
                signals: Vec::new(),
                activations: Vec::new(),
                state: state.clone(),
                costs: meter.costs.clone(),
            };
            let result = (|| -> Result<(), Stop> {
                meter.charge(Cat::Scheduling, 1)?;
                // Old inboxes are transient; only explicit byte registers preserve a received value.
                for cell in &mut state.cells {
                    for port in &mut cell.inbox {
                        if let Some(signal) = port.as_ref() {
                            meter.charge(Cat::Messages, 1)?;
                            frame.signals.push(SignalEvent {
                                signal: signal.clone(),
                                outcome: "expired".into(),
                            });
                            *port = None;
                        }
                    }
                }
                for event in experiment.events.iter().filter(|event| event.tick == tick) {
                    let mut next = state.clone();
                    meter.charge(Cat::Checking, 1)?;
                    match event.event {
                        EventKind::LinkEnabled { id, enabled } => {
                            meter.charge(Cat::Actions, 1)?;
                            next.links
                                .iter_mut()
                                .find(|link| link.id == id)
                                .unwrap()
                                .enabled = enabled;
                        }
                        EventKind::ValveEnabled { id, enabled } => {
                            meter.charge(Cat::Actions, 1)?;
                            next.valves
                                .iter_mut()
                                .find(|valve| valve.id == id)
                                .unwrap()
                                .enabled = enabled;
                        }
                        EventKind::ClearMemory { cell } => {
                            meter.charge(Cat::MemoryWrites, 4)?;
                            let actor = next
                                .cells
                                .iter_mut()
                                .find(|actor| actor.id == cell)
                                .unwrap();
                            actor.memory = [0; 4];
                            actor.evidence = [None; 4];
                        }
                        EventKind::EdgeBlocked { edge, blocked } => {
                            meter.charge(Cat::Checking, next.closed_edges.len() as u64)?;
                            meter.charge(Cat::Actions, 1)?;
                            match next.closed_edges.binary_search(&edge) {
                                Ok(index) if !blocked => {
                                    next.closed_edges.remove(index);
                                }
                                Err(index) if blocked => {
                                    next.closed_edges.insert(index, edge);
                                }
                                _ => {}
                            }
                        }
                    }
                    state = next;
                    frame.events.push(event.event.clone());
                }
                let due: Vec<_> = state
                    .pending
                    .iter()
                    .filter(|signal| signal.deliver_tick <= tick)
                    .map(|signal| signal.id)
                    .collect();
                for id in due {
                    meter.charge(Cat::Messages, 1)?;
                    meter.charge(Cat::Checking, 1)?;
                    let index = state
                        .pending
                        .iter()
                        .position(|signal| signal.id == id)
                        .unwrap();
                    let signal = state.pending.remove(index);
                    let link = state
                        .links
                        .iter()
                        .find(|link| link.id == signal.link)
                        .unwrap();
                    let recipient = state
                        .cells
                        .iter()
                        .position(|cell| cell.id == signal.to_cell)
                        .unwrap();
                    let adjacent = origin_position(experiment, &state, &signal.from)
                        .distance(state.cells[recipient].position)
                        == 1;
                    let outcome = if !link.enabled {
                        "disabled"
                    } else if !adjacent {
                        "not_adjacent"
                    } else if state.cells[recipient].inbox[signal.to_port as usize].is_some() {
                        "full"
                    } else {
                        state.cells[recipient].inbox[signal.to_port as usize] =
                            Some(signal.clone());
                        "delivered"
                    };
                    frame.signals.push(SignalEvent {
                        signal,
                        outcome: outcome.into(),
                    });
                }
                for id in eligible {
                    let index = state.cells.iter().position(|cell| cell.id == id).unwrap();
                    let (activation, signals, limit) =
                        policy::activate(experiment, &mut state, index, &mut meter);
                    frame.activations.push(activation);
                    frame.signals.extend(signals);
                    if let Some(stop) = limit {
                        if stop == Stop::Fuel {
                            return Err(stop);
                        }
                        status = RunStatus::ActivationLimit;
                    }
                }
                for (index, beacon) in experiment.beacons.iter().enumerate() {
                    meter.charge(Cat::Checking, 1)?;
                    if tick % beacon.drain_every == 0 {
                        meter.charge(Cat::Draining, 1)?;
                        let drained = state.beacons[index].charge.min(beacon.drain_amount);
                        state.beacons[index].charge -= drained;
                        state.beacons[index].drained += drained;
                        if state.beacons[index].charge == 0 {
                            state.beacons[index].exhausted = true;
                        }
                    }
                }
                // Reserve modeled checking work before checking identities and beacon energy below.
                meter.charge(
                    Cat::Checking,
                    state.cells.len() as u64
                        + state.beacons.len() as u64
                        + initial_sparks as u64
                        + state.closed_edges.len() as u64
                        + construction::state_checking(&state),
                )?;
                Ok(())
            })();
            if result.is_ok() {
                check_live_invariants(experiment, &state)?;
            }
            frame.complete = result.is_ok();
            frame.state = state.clone();
            frame.costs = meter.costs.clone();
            frames.push(frame);
            if result.is_err() {
                status = RunStatus::FuelExhausted;
                break;
            }
            ticks_completed += 1;
        }
    }
    let mut measured_outcome = outcome(experiment, &state, status, initial_sparks);
    measured_outcome.passed &= ticks_completed == experiment.ticks;
    Ok(RunResult {
        protocol: protocol_for_version(experiment.version).unwrap().into(),
        status,
        ticks_completed,
        initial_sparks,
        costs: meter.costs,
        outcome: measured_outcome,
        frames,
        final_state: state,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn rule(when: Vec<Condition>, action: Action) -> Rule {
        Rule {
            when,
            action,
            remember: None,
        }
    }
    fn courier() -> Program {
        Program {
            rules: vec![
                rule(
                    vec![
                        Condition::Carrying { value: false },
                        Condition::AtSource { value: true },
                    ],
                    Action::Pickup,
                ),
                rule(
                    vec![
                        Condition::Carrying { value: true },
                        Condition::AtReceiver { value: true },
                    ],
                    Action::Drop,
                ),
                rule(
                    vec![],
                    Action::Move {
                        direction: Relative::Forward,
                    },
                ),
            ],
        }
    }
    fn cell(id: u16, x: u8, y: u8, program: Program) -> Cell {
        Cell {
            id,
            position: Point { x, y },
            heading: Direction::East,
            mobile: true,
            memory: [0; 4],
            program,
        }
    }
    fn beacon(id: u16, x: u8, y: u8, accepts: bool, required: u32) -> Beacon {
        Beacon {
            id,
            position: Point { x, y },
            accepts,
            initial_charge: 10,
            drain_every: 2,
            drain_amount: 1,
            spark_charge: 2,
            required_deliveries: required,
        }
    }
    fn opening() -> Experiment {
        Experiment {
            version: 1,
            seed: 42,
            width: 3,
            height: 3,
            walls: vec![],
            sources: vec![Source {
                id: 0,
                position: Point { x: 1, y: 1 },
                sparks: vec![Spark { id: 7, bit: false }],
            }],
            depots: vec![],
            beacons: vec![beacon(0, 2, 1, false, 1)],
            valves: vec![],
            cells: vec![cell(0, 1, 1, courier())],
            links: vec![],
            events: vec![],
            ticks: 4,
            fuel: MAX_FUEL,
            activation_fuel: 256,
            construction: None,
        }
    }
    fn bridge(bit: bool) -> Experiment {
        let mut experiment = opening();
        experiment.width = 4;
        experiment.height = 4;
        experiment.ticks = 8;
        experiment.sources[0].position = Point { x: 0, y: 1 };
        experiment.sources[0].sparks[0].bit = bit;
        experiment.cells[0].position = Point { x: 0, y: 1 };
        experiment.depots = vec![Depot {
            id: 0,
            position: Point { x: 1, y: 1 },
            capacity: 8,
        }];
        experiment.beacons = vec![
            beacon(0, 2, 0, false, u32::from(!bit)),
            beacon(1, 3, 1, true, u32::from(bit)),
        ];
        experiment.valves = vec![Valve {
            id: 0,
            position: Point { x: 2, y: 1 },
            depot: 0,
            beacon_zero: 0,
            beacon_one: 1,
            enabled: false,
        }];
        experiment.cells.push(cell(
            1,
            1,
            0,
            Program {
                rules: vec![
                    rule(
                        vec![Condition::HasMessage {
                            port: 0,
                            value: true,
                        }],
                        Action::Send {
                            port: 0,
                            bit: BitSource::Message { port: 0 },
                        },
                    ),
                    rule(vec![], Action::Wait),
                ],
            },
        ));
        experiment.cells.push(cell(
            2,
            2,
            0,
            Program {
                rules: vec![
                    Rule {
                        when: vec![Condition::HasMessage {
                            port: 0,
                            value: true,
                        }],
                        action: Action::TakeMessage { port: 0, slot: 0 },
                        remember: Some(MemoryWrite { slot: 1, value: 1 }),
                    },
                    rule(
                        vec![Condition::Memory { slot: 1, value: 1 }],
                        Action::Route {
                            valve: 0,
                            bit: BitSource::Memory { slot: 0 },
                        },
                    ),
                    rule(vec![], Action::Wait),
                ],
            },
        ));
        experiment.cells[1].mobile = false;
        experiment.cells[2].mobile = false;
        experiment.links = vec![
            Link {
                id: 0,
                from: Endpoint::Depot { id: 0 },
                to_cell: 1,
                to_port: 0,
                delay: 1,
                enabled: true,
            },
            Link {
                id: 1,
                from: Endpoint::Cell { id: 1, port: 0 },
                to_cell: 2,
                to_port: 0,
                delay: 1,
                enabled: true,
            },
        ];
        experiment.events = vec![
            Event {
                tick: 6,
                event: EventKind::LinkEnabled {
                    id: 0,
                    enabled: false,
                },
            },
            Event {
                tick: 6,
                event: EventKind::LinkEnabled {
                    id: 1,
                    enabled: false,
                },
            },
            Event {
                tick: 7,
                event: EventKind::ValveEnabled {
                    id: 0,
                    enabled: true,
                },
            },
        ];
        experiment
    }
    #[test]
    fn same_courier_physically_delivers_and_failed_movement_still_costs_work() {
        let experiment = opening();
        let result = run(&experiment).unwrap();
        assert!(result.outcome.passed);
        assert_eq!(result.final_state.delivered.len(), 1);
        assert_eq!(
            result.frames[1].state.cells[0].cargo,
            Some(Spark { id: 7, bit: false })
        );
        assert_eq!(
            result.frames[2].state.cells[0].position,
            Point { x: 2, y: 1 }
        );
        assert!(result.frames[3].state.cells[0].cargo.is_none());
        let failed = &result.frames[4].activations[0];
        assert!(!failed.success);
        assert_eq!(failed.error.as_deref(), Some("movement_blocked"));
        assert!(failed.work_after > failed.work_before);
        assert_eq!(result, run(&experiment).unwrap());
        assert!(
            result.costs.loading > 0
                && result.costs.checking > 0
                && result.costs.scheduling > 0
                && result.costs.draining > 0
        );
    }
    #[test]
    fn physical_report_relay_and_retained_memory_drive_both_service_bits() {
        for bit in [false, true] {
            let experiment = bridge(bit);
            assert_eq!(experiment.cells[0].program, opening().cells[0].program);
            let result = run(&experiment).unwrap();
            assert!(result.outcome.passed, "{result:?}");
            assert_eq!(result.frames[3].state.depots[0].sparks.len(), 1);
            assert!(
                result.frames[3]
                    .signals
                    .iter()
                    .any(|event| event.outcome == "queued"
                        && event.signal.receipt_spark == Some(7)
                        && event.signal.bit == bit)
            );
            assert_eq!(
                result.frames[5].state.cells[2].memory,
                [u8::from(bit), 1, 0, 0]
            );
            assert!(
                result.frames[6].state.cells[2]
                    .inbox
                    .iter()
                    .all(Option::is_none)
            );
            assert_eq!(result.final_state.delivered[0].tick, 7);
            assert_eq!(result.final_state.delivered[0].beacon, u16::from(bit));
            let mut erased = experiment.clone();
            erased.events.push(Event {
                tick: 6,
                event: EventKind::ClearMemory { cell: 2 },
            });
            let ablation = run(&erased).unwrap();
            assert!(!ablation.outcome.passed);
            assert!(ablation.final_state.delivered.is_empty());
            assert_eq!(ablation.final_state.depots[0].sparks.len(), 1);
        }
    }
    #[test]
    fn constant_control_is_legal_but_wrong_service_fails_without_destroying_stock() {
        let mut experiment = bridge(true);
        experiment.cells[2].program = Program {
            rules: vec![rule(
                vec![],
                Action::Route {
                    valve: 0,
                    bit: BitSource::Constant { value: false },
                },
            )],
        };
        let wrong = run(&experiment).unwrap();
        assert!(!wrong.outcome.passed);
        assert_eq!(wrong.final_state.depots[0].sparks.len(), 1);
        assert!(
            wrong
                .frames
                .last()
                .unwrap()
                .activations
                .iter()
                .any(|entry| entry.error.as_deref() == Some("beacon_rejects_bit"))
        );
        experiment.cells[2].program = Program {
            rules: vec![rule(
                vec![],
                Action::Route {
                    valve: 0,
                    bit: BitSource::Constant { value: true },
                },
            )],
        };
        assert!(run(&experiment).unwrap().outcome.passed);
    }
    #[test]
    fn transient_unread_messages_expire_and_colliding_arrivals_are_metered() {
        let mut experiment = bridge(true);
        experiment.cells[1].program = Program {
            rules: vec![rule(vec![], Action::Wait)],
        };
        let mut duplicate = experiment.links[0].clone();
        duplicate.id = 9;
        experiment.links.push(duplicate);
        let result = run(&experiment).unwrap();
        assert!(!result.outcome.passed);
        assert!(
            result.frames[4]
                .signals
                .iter()
                .any(|event| event.outcome == "full")
        );
        assert!(
            result.frames[5]
                .signals
                .iter()
                .any(|event| event.outcome == "expired")
        );
        assert!(
            result.frames[5].state.cells[1]
                .inbox
                .iter()
                .all(Option::is_none)
        );
    }
    #[test]
    fn finite_signal_queue_never_grows_past_its_bound() {
        let mut experiment = opening();
        experiment.ticks = 8;
        experiment.cells[0].program = Program {
            rules: vec![rule(
                vec![],
                Action::Send {
                    port: 0,
                    bit: BitSource::Constant { value: true },
                },
            )],
        };
        experiment.cells.push(cell(
            1,
            1,
            0,
            Program {
                rules: vec![rule(vec![], Action::Wait)],
            },
        ));
        experiment.links = (0..32)
            .map(|id| Link {
                id,
                from: Endpoint::Cell { id: 0, port: 0 },
                to_cell: 1,
                to_port: 0,
                delay: 16,
                enabled: true,
            })
            .collect();
        let result = run(&experiment).unwrap();
        assert_eq!(result.final_state.pending.len(), MAX_PENDING);
        assert!(
            result
                .frames
                .iter()
                .all(|frame| frame.state.pending.len() <= MAX_PENDING)
        );
        assert!(
            result
                .frames
                .iter()
                .flat_map(|frame| &frame.signals)
                .any(|event| event.outcome == "full")
        );
    }
    #[test]
    fn activation_fuel_rolls_back_effects_and_global_fuel_produces_an_honest_partial_frame() {
        let mut limited = opening();
        limited.activation_fuel = 1;
        let result = run(&limited).unwrap();
        assert_eq!(result.status, RunStatus::ActivationLimit);
        assert!(!result.outcome.passed);
        assert_eq!(result.final_state.sources[0].sparks.len(), 1);
        assert!(result.final_state.cells[0].cargo.is_none());
        assert!(
            result
                .frames
                .iter()
                .skip(1)
                .flat_map(|frame| &frame.activations)
                .all(|entry| entry.work_after - entry.work_before == 1)
        );
        let mut partial = opening();
        // Three post-loading operations admit tick scheduling and start a cell, then stop before its condition.
        for _ in 0..5 {
            partial.fuel = serde_json::to_vec(&partial).unwrap().len() as u64 + 4 + 3;
        }
        let result = run(&partial).unwrap();
        assert_eq!(result.status, RunStatus::FuelExhausted);
        assert_eq!(result.costs.total(), partial.fuel);
        assert!(!result.frames.last().unwrap().complete);
        assert!(!result.outcome.passed);
        assert!(result.outcome.conserved);
        partial.fuel = 0;
        let empty = run(&partial).unwrap();
        assert_eq!(empty.frames.len(), 1);
        assert_eq!(empty.costs.total(), 0);
        assert!(!empty.outcome.passed);
    }
    #[test]
    fn beacon_failure_is_sticky_even_if_a_later_spark_recharges_it() {
        let mut experiment = opening();
        experiment.beacons[0].initial_charge = 1;
        experiment.beacons[0].drain_every = 1;
        experiment.beacons[0].spark_charge = 8;
        let result = run(&experiment).unwrap();
        assert!(result.final_state.beacons[0].charge > 0);
        assert!(result.final_state.beacons[0].exhausted);
        assert!(!result.outcome.passed);
    }
    #[test]
    fn parser_rejects_oversized_unknown_nonlocal_and_invalid_memory_inputs() {
        let valid = opening();
        let raw = serde_json::to_string(&valid).unwrap();
        assert_eq!(parse_experiment(&raw).unwrap(), valid);
        assert!(parse_experiment(&" ".repeat(MAX_INPUT_BYTES + 1)).is_err());
        let mut unknown: serde_json::Value = serde_json::from_str(&raw).unwrap();
        unknown["magic"] = true.into();
        assert!(parse_experiment(&unknown.to_string()).is_err());
        let mut invalid = valid.clone();
        invalid.cells[0].program.rules[0].when = vec![Condition::Memory { slot: 4, value: 0 }];
        assert!(validate_experiment(&invalid).is_err());
        invalid = valid.clone();
        let duplicate = invalid.sources[0].sparks[0];
        invalid.sources[0].sparks.push(duplicate);
        assert!(validate_experiment(&invalid).is_err());
        invalid = bridge(false);
        invalid.links[0].delay = 0;
        assert!(validate_experiment(&invalid).is_err());
        invalid = bridge(false);
        invalid.cells[1].position = Point { x: 0, y: 3 };
        assert!(validate_experiment(&invalid).is_err());
        invalid = valid;
        invalid.ticks = MAX_TICKS + 1;
        assert!(validate_experiment(&invalid).is_err());
    }
    #[test]
    fn activation_priority_uses_stable_identities_instead_of_array_order() {
        let mut experiment = bridge(false);
        let expected = activation_order(&experiment, 7);
        experiment.cells.reverse();
        assert_eq!(activation_order(&experiment, 7), expected);
        assert_ne!(
            activation_order(&experiment, 7),
            activation_order(&experiment, 8)
        );
    }
}

#[cfg(test)]
mod hazard_tests {
    use super::*;
    use crate::check::{make_receipt, validate_result, verify_receipt};
    use crate::fixtures;

    fn point(x: u8, y: u8) -> Point {
        Point { x, y }
    }
    fn edge() -> Edge {
        Edge::new(point(1, 2), point(2, 2))
    }
    fn event(tick: u32, blocked: bool) -> Event {
        Event {
            tick,
            event: EventKind::EdgeBlocked {
                edge: edge(),
                blocked,
            },
        }
    }
    fn trial() -> Experiment {
        let mut experiment = fixtures::experiment("opening-normal").unwrap();
        experiment.version = HAZARD_VERSION;
        // Keep the service rules but deliberately try blocked moves: failure must be charged.
        experiment.cells[0].program.rules.remove(2);
        experiment.ticks = 10;
        experiment.beacons[0].initial_charge = 100;
        experiment.beacons[0].required_deliveries = 1;
        experiment.events = vec![event(2, true), event(4, false)];
        experiment
    }

    #[test]
    fn closure_preserves_cargo_and_reopening_precedes_the_same_tick_move() {
        let experiment = trial();
        let receipt = make_receipt(&experiment).unwrap();
        assert_eq!(receipt.protocol, HAZARD_PROTOCOL);
        assert!(receipt.passed());
        assert!(verify_receipt(&receipt).unwrap().verified);
        let frames = &receipt.result.frames;
        for tick in [2, 3] {
            assert_eq!(frames[tick].state.cells[0].position, point(1, 2));
            assert_eq!(frames[tick].state.cells[0].cargo.unwrap().id, 1);
            assert_eq!(frames[tick].state.closed_edges, vec![edge()]);
            let action = &frames[tick].activations[0];
            assert_eq!(action.error.as_deref(), Some("movement_blocked"));
            assert!(action.work_after > action.work_before);
        }
        assert_eq!(frames[4].state.cells[0].position, point(2, 2));
        assert!(frames[4].state.closed_edges.is_empty());
        assert_eq!(receipt.result.final_state.delivered[0].tick, 8);
        assert!(receipt.result.outcome.conserved);
        assert_eq!(make_receipt(&experiment).unwrap(), receipt);
    }

    #[test]
    fn closed_edges_are_symmetric_and_only_the_local_blocked_direction_changes() {
        let mut experiment = trial();
        experiment.cells[0].position = point(2, 2);
        experiment.cells[0].heading = Direction::West;
        experiment.sources[0].position = point(2, 2);
        let result = run(&experiment).unwrap();
        assert_eq!(result.frames[2].state.cells[0].position, point(2, 2));
        assert_eq!(
            result.frames[2].activations[0].error.as_deref(),
            Some("movement_blocked")
        );
        assert_eq!(result.frames[4].state.cells[0].position, point(1, 2));

        let mut experiment = trial();
        experiment.cells[0].program.rules.insert(
            2,
            Rule {
                when: vec![
                    Condition::Blocked {
                        direction: Relative::Forward,
                        value: true,
                    },
                    Condition::Blocked {
                        direction: Relative::Right,
                        value: false,
                    },
                ],
                action: Action::Move {
                    direction: Relative::Right,
                },
                remember: None,
            },
        );
        let result = run(&experiment).unwrap();
        assert_eq!(result.frames[2].state.cells[0].position, point(1, 3));
        assert_eq!(result.frames[2].state.cells[0].cargo.unwrap().id, 1);
        assert!(result.frames[2].activations[0].success);
    }

    #[test]
    fn duplicate_closures_are_idempotent_and_input_edges_are_versioned_and_bounded() {
        let mut experiment = trial();
        experiment.events = vec![
            event(1, true),
            event(1, true),
            event(2, false),
            event(2, false),
        ];
        let receipt = make_receipt(&experiment).unwrap();
        assert_eq!(receipt.result.frames[1].state.closed_edges, vec![edge()]);
        assert_eq!(receipt.result.frames[1].events.len(), 2);
        assert!(receipt.result.frames[2].state.closed_edges.is_empty());
        assert_eq!(receipt.result.frames[2].events.len(), 2);
        assert!(verify_receipt(&receipt).unwrap().verified);
        experiment.version = MODEL_VERSION;
        assert!(validate_experiment(&experiment).is_err());
        experiment.version = HAZARD_VERSION;
        for invalid in [
            Edge {
                a: edge().b,
                b: edge().a,
            },
            Edge::new(point(1, 2), point(3, 2)),
            Edge::new(point(0, 2), point(1, 2)),
            Edge::new(point(30, 2), point(31, 2)),
        ] {
            experiment.events = vec![Event {
                tick: 1,
                event: EventKind::EdgeBlocked {
                    edge: invalid,
                    blocked: true,
                },
            }];
            assert!(validate_experiment(&experiment).is_err());
        }
        experiment.events = vec![event(1, true); 65];
        assert!(validate_experiment(&experiment).is_err());
    }

    #[test]
    fn fuel_interruptions_commit_only_a_complete_event_prefix() {
        let mut experiment = trial();
        experiment.fuel = 5_000;
        experiment.events = vec![event(1, true), event(1, false)];
        let loading = run(&experiment).unwrap().frames[0].costs.total();
        assert!((1_000..10_000).contains(&(loading + 2)));
        for (extra, expected_events, expected_closed) in
            [(2, 0, false), (3, 1, true), (5, 1, true), (6, 2, false)]
        {
            experiment.fuel = loading + extra;
            let receipt = make_receipt(&experiment).unwrap();
            assert_eq!(receipt.result.status, RunStatus::FuelExhausted);
            let frame = receipt.result.frames.last().unwrap();
            assert!(!frame.complete);
            assert_eq!(frame.events.len(), expected_events);
            assert_eq!(!frame.state.closed_edges.is_empty(), expected_closed);
            assert!(verify_receipt(&receipt).unwrap().verified);
        }
    }

    #[test]
    fn independent_checker_rejects_undeclared_edges_and_crossings() {
        let experiment = trial();
        let result = run(&experiment).unwrap();
        let mut changed = result.clone();
        changed.frames[2].state.closed_edges.clear();
        assert!(
            validate_result(&experiment, &changed)
                .unwrap_err()
                .contains("intervention")
        );
        let mut changed = result.clone();
        changed.frames[1].state.closed_edges.push(edge());
        assert!(
            validate_result(&experiment, &changed)
                .unwrap_err()
                .contains("intervention")
        );
        let mut changed = result;
        changed.frames[2].activations[0].success = true;
        changed.frames[2].activations[0].error = None;
        changed.frames[2].activations[0].position_after = point(2, 2);
        changed.frames[2].state.cells[0].position = point(2, 2);
        assert!(
            validate_result(&experiment, &changed)
                .unwrap_err()
                .contains("blocked terrain")
        );
    }

    #[test]
    fn legacy_public_receipt_bytes_and_protocol_remain_unchanged() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../public/bridge/opening-normal.receipt.json");
        let saved = std::fs::read_to_string(path).unwrap();
        let receipt = make_receipt(&fixtures::experiment("opening-normal").unwrap()).unwrap();
        assert_eq!(serde_json::to_string(&receipt).unwrap() + "\n", saved);
        assert_eq!(receipt.protocol, PROTOCOL);
        assert!(!saved.contains("closed_edges"));
        assert!(verify_receipt(&receipt).unwrap().verified);
    }
}
