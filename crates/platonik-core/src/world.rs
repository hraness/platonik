use crate::check::artifact_hash;
use crate::continuation::{self, Advance};
use crate::industry;
use crate::model::{Costs, Experiment, FacilityKind, Frame, Point, Program, RunStatus, State};
use crate::sim;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const WORLD_SCHEMA: &str = "platonik-living-world-v1";
pub const WORLD_REPORT_SCHEMA: &str = "platonik-living-world-report-v1";
pub const MAX_WORLD_TICK: u32 = 4096;
pub const MAX_WORLD_EVENTS: usize = 128;
pub const MAX_WORLD_BYTES: usize = 64 * 1024 * 1024;
pub const ADVANCE_FUEL: u64 = 2_000_000;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct World {
    pub schema: String,
    pub name: String,
    pub genesis_hash: String,
    pub genesis: Experiment,
    pub revision: u64,
    pub events: Vec<WorldEvent>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum WorldEvent {
    ProgramChanged {
        cell: u16,
        before_hash: String,
        after_hash: String,
        program: Program,
    },
    Advanced {
        through_tick: u32,
    },
    /// An admitted facility site: unready until creatures supply its bill.
    StructurePlaced {
        id: u16,
        structure: FacilityKind,
        position: Point,
    },
    /// A display name for a facility, kept in the report's name registry.
    StructureNamed {
        facility: u16,
        name: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Command {
    SetProgram {
        cell: u16,
        program: Program,
    },
    Advance {
        ticks: u32,
    },
    Place {
        structure: FacilityKind,
        position: Point,
    },
    Name {
        facility: u16,
        name: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct WorldSummary {
    pub cells: usize,
    pub constructed_cells: usize,
    pub deliveries: usize,
    pub source_sparks: usize,
    pub depot_sparks: usize,
    pub carried_sparks: usize,
    pub material_units: usize,
    pub beacon_charge: u64,
    pub beacons_without_charge: usize,
    pub facilities: usize,
    pub ready_facilities: usize,
    pub facility_sparks: usize,
    pub parts_minted: usize,
    pub material_extracted: usize,
    pub carried_parts: usize,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Report {
    pub schema: &'static str,
    pub world_hash: String,
    pub name: String,
    pub revision: u64,
    pub tick: u32,
    pub maximum_tick: u32,
    pub experiment: Experiment,
    pub state: State,
    pub costs: Costs,
    pub recent_frames: Vec<Frame>,
    pub summary: WorldSummary,
    /// Facility display names admitted by `structure_named` events.
    pub names: BTreeMap<u16, String>,
}

struct Snapshot {
    experiment: Experiment,
    state: State,
    costs: Costs,
    recent_frames: Vec<Frame>,
    names: BTreeMap<u16, String>,
}

fn require(condition: bool, message: &str) -> Result<(), String> {
    if condition {
        Ok(())
    } else {
        Err(message.into())
    }
}

fn check_size(world: &World) -> Result<(), String> {
    struct LimitedWriter(usize);
    impl std::io::Write for LimitedWriter {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            self.0 = self
                .0
                .checked_add(bytes.len())
                .filter(|size| *size <= MAX_WORLD_BYTES)
                .ok_or_else(|| std::io::Error::other("Living world exceeds 64 MiB."))?;
            Ok(bytes.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    serde_json::to_writer(LimitedWriter(0), world).map_err(|error| error.to_string())
}

fn initial_snapshot(experiment: &Experiment) -> Result<Snapshot, String> {
    let advance = continuation::start_until(experiment, 0)?;
    let checkpoint = match advance {
        Advance::Paused(checkpoint) => checkpoint,
        Advance::Finished(_) => {
            return Err("Living world genesis could not pause at tick zero.".into());
        }
    };
    let frame = checkpoint
        .frames
        .into_iter()
        .next()
        .ok_or("Living world genesis did not produce tick zero.")?;
    Ok(Snapshot {
        experiment: experiment.clone(),
        state: frame.state.clone(),
        costs: frame.costs.clone(),
        recent_frames: vec![frame],
        names: BTreeMap::new(),
    })
}

fn program_mut(experiment: &mut Experiment, cell: u16) -> Result<&mut Program, String> {
    experiment
        .cells
        .iter_mut()
        .find(|entry| entry.id == cell)
        .map(|entry| &mut entry.program)
        .ok_or_else(|| format!("Cell {cell} is not an original programmable cell."))
}

fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.chars().count() <= 32
        && name.trim() == name
        && name.chars().all(|character| !character.is_control())
}

fn replay(world: &World) -> Result<Snapshot, String> {
    require(
        world.schema == WORLD_SCHEMA,
        "Unsupported living world schema.",
    )?;
    require(
        !world.name.trim().is_empty() && world.name.chars().count() <= 64,
        "Living world names need 1–64 characters.",
    )?;
    require(
        world.events.len() <= MAX_WORLD_EVENTS && world.revision == world.events.len() as u64,
        "Living world revision or event limit is invalid.",
    )?;
    require(
        world.genesis_hash == artifact_hash(&world.genesis)?,
        "Living world genesis hash does not match its experiment.",
    )?;
    check_size(world)?;
    let mut snapshot = initial_snapshot(&world.genesis)?;
    for event in &world.events {
        match event {
            WorldEvent::ProgramChanged {
                cell,
                before_hash,
                after_hash,
                program,
            } => {
                let current = program_mut(&mut snapshot.experiment, *cell)?;
                require(
                    artifact_hash(current)? == *before_hash,
                    "Program intervention does not match the prior cell program.",
                )?;
                require(
                    artifact_hash(program)? == *after_hash,
                    "Program intervention hash does not match its program.",
                )?;
                *current = program.clone();
                sim::validate_experiment(&snapshot.experiment)?;
            }
            WorldEvent::Advanced { through_tick } => {
                require(
                    snapshot.state.tick < *through_tick && *through_tick <= MAX_WORLD_TICK,
                    "Living world advances must be continuous and within the world horizon.",
                )?;
                let segment = sim::continue_world(
                    &snapshot.experiment,
                    &snapshot.state,
                    &snapshot.costs,
                    *through_tick,
                    ADVANCE_FUEL,
                )?;
                require(
                    segment.status != RunStatus::FuelExhausted
                        && segment.ticks_completed == *through_tick
                        && segment.frames.iter().all(|frame| frame.complete),
                    "Fresh living world execution could not complete its recorded advance.",
                )?;
                snapshot.state = segment.final_state;
                snapshot.costs = segment.costs;
                snapshot.recent_frames = segment.frames;
            }
            WorldEvent::StructurePlaced {
                id,
                structure,
                position,
            } => {
                let expected = industry::validate_placement(
                    &snapshot.experiment,
                    &snapshot.state,
                    *structure,
                    *position,
                )?;
                require(
                    expected == *id,
                    "A recorded site id does not match its placement order.",
                )?;
                snapshot
                    .state
                    .facilities
                    .push(industry::site(*id, *structure, *position));
                industry::check_state(&snapshot.experiment, &snapshot.state, false)?;
            }
            WorldEvent::StructureNamed { facility, name } => {
                require(
                    valid_name(name),
                    "Structure names need 1–32 printable characters.",
                )?;
                require(
                    snapshot
                        .state
                        .facilities
                        .iter()
                        .any(|entry| entry.id == *facility),
                    "A named structure does not exist in the world.",
                )?;
                snapshot.names.insert(*facility, name.clone());
            }
        }
    }
    Ok(snapshot)
}

pub fn new(name: String, genesis: Experiment) -> Result<World, String> {
    let world = World {
        schema: WORLD_SCHEMA.into(),
        name,
        genesis_hash: artifact_hash(&genesis)?,
        genesis,
        revision: 0,
        events: Vec::new(),
    };
    replay(&world)?;
    Ok(world)
}

pub fn apply(world: &World, command: Command) -> Result<World, String> {
    require(
        world.events.len() < MAX_WORLD_EVENTS,
        "Living world event limit reached; export before continuing.",
    )?;
    let mut snapshot = replay(world)?;
    let event = match command {
        Command::SetProgram { cell, program } => {
            let current = program_mut(&mut snapshot.experiment, cell)?;
            let before_hash = artifact_hash(&*current)?;
            *current = program.clone();
            sim::validate_experiment(&snapshot.experiment)?;
            WorldEvent::ProgramChanged {
                cell,
                before_hash,
                after_hash: artifact_hash(&program)?,
                program,
            }
        }
        Command::Advance { ticks } => {
            require(
                (1..=128).contains(&ticks)
                    && snapshot
                        .state
                        .tick
                        .checked_add(ticks)
                        .is_some_and(|tick| tick <= MAX_WORLD_TICK),
                "Living world advances need 1–128 ticks within the world horizon.",
            )?;
            let through_tick = snapshot.state.tick + ticks;
            let segment = sim::continue_world(
                &snapshot.experiment,
                &snapshot.state,
                &snapshot.costs,
                through_tick,
                ADVANCE_FUEL,
            )?;
            require(
                segment.status != RunStatus::FuelExhausted
                    && segment.ticks_completed == through_tick
                    && segment.frames.iter().all(|frame| frame.complete),
                "Living world advance exhausted its bounded operation budget.",
            )?;
            WorldEvent::Advanced { through_tick }
        }
        Command::Place {
            structure,
            position,
        } => {
            let id = industry::validate_placement(
                &snapshot.experiment,
                &snapshot.state,
                structure,
                position,
            )?;
            WorldEvent::StructurePlaced {
                id,
                structure,
                position,
            }
        }
        Command::Name { facility, name } => {
            require(
                valid_name(&name),
                "Structure names need 1–32 printable characters.",
            )?;
            require(
                snapshot
                    .state
                    .facilities
                    .iter()
                    .any(|entry| entry.id == facility),
                "A named structure does not exist in the world.",
            )?;
            WorldEvent::StructureNamed { facility, name }
        }
    };
    let mut next = world.clone();
    next.events.push(event);
    next.revision += 1;
    replay(&next)?;
    Ok(next)
}

pub fn report(world: &World) -> Result<Report, String> {
    let snapshot = replay(world)?;
    let construction = snapshot.state.construction.as_ref();
    let summary = WorldSummary {
        cells: snapshot.state.cells.len(),
        constructed_cells: construction.map_or(0, |state| state.births.len()),
        deliveries: snapshot.state.delivered.len(),
        source_sparks: snapshot
            .state
            .sources
            .iter()
            .map(|source| source.sparks.len())
            .sum(),
        depot_sparks: snapshot
            .state
            .depots
            .iter()
            .map(|depot| depot.sparks.len())
            .sum(),
        carried_sparks: snapshot
            .state
            .cells
            .iter()
            .filter(|cell| cell.cargo.is_some())
            .count(),
        material_units: construction.map_or(0, |state| {
            state
                .stocks
                .iter()
                .map(|stock| stock.units.len())
                .sum::<usize>()
                + state.assemblies.len()
                + snapshot
                    .state
                    .cells
                    .iter()
                    .filter(|cell| cell.material.is_some())
                    .count()
                + snapshot
                    .state
                    .facilities
                    .iter()
                    .map(|facility| facility.materials.len() + facility.spent_materials.len())
                    .sum::<usize>()
        }),
        beacon_charge: snapshot
            .state
            .beacons
            .iter()
            .map(|beacon| u64::from(beacon.charge))
            .sum(),
        beacons_without_charge: snapshot
            .state
            .beacons
            .iter()
            .filter(|beacon| beacon.charge == 0)
            .count(),
        facilities: snapshot.state.facilities.len(),
        ready_facilities: snapshot
            .state
            .facilities
            .iter()
            .filter(|facility| facility.ready)
            .count(),
        facility_sparks: snapshot
            .state
            .facilities
            .iter()
            .map(|facility| facility.sparks.len() + facility.spent_sparks.len())
            .sum(),
        parts_minted: snapshot
            .state
            .facilities
            .iter()
            .filter(|facility| facility.kind == FacilityKind::Fabricator)
            .map(|facility| facility.minted as usize)
            .sum(),
        material_extracted: snapshot
            .state
            .facilities
            .iter()
            .filter(|facility| facility.kind == FacilityKind::Miner)
            .map(|facility| facility.minted as usize)
            .sum(),
        carried_parts: snapshot
            .state
            .cells
            .iter()
            .filter(|cell| cell.part.is_some())
            .count(),
    };
    Ok(Report {
        schema: WORLD_REPORT_SCHEMA,
        world_hash: artifact_hash(world)?,
        name: world.name.clone(),
        revision: world.revision,
        tick: snapshot.state.tick,
        maximum_tick: MAX_WORLD_TICK,
        experiment: snapshot.experiment,
        state: snapshot.state,
        costs: snapshot.costs,
        recent_frames: snapshot.recent_frames,
        summary,
        names: snapshot.names,
    })
}
