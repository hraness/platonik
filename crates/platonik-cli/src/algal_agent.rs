use algal::contract::Manifest;
use algal::effects::{Backend, Host};
use algal::graph::{Transports, interface_args};
use algal::runtime;
use algal::store::Store;
use platonik_core::model::{Experiment, FacilityKind, Point, Program};
use platonik_core::world::{self, Command, World};
use platonik_core::{industry, sim, world_fixtures};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;

pub const PROPOSAL_SCHEMA: &str = "platonik-algal-proposal-v1";
pub const MAX_CONFIG_BYTES: u64 = 1_048_576;
pub const MAX_PROPOSAL_BYTES: u64 = 4 * 1_048_576;
const MAX_VIEW_BYTES: usize = 16_384;
const MAX_CANDIDATES: usize = 32;
const MAX_GOAL_CHARS: usize = 512;
const DEFAULT_GOAL: &str = "Improve the factory safely and finish existing work before expanding.";

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Proposal {
    pub schema: String,
    pub world_hash: String,
    pub revision: u64,
    pub organism_digest: String,
    pub goal: String,
    pub command: Command,
    pub receipt: Value,
}

fn manifest() -> Result<Manifest, String> {
    Manifest::parse(&json!({
        "contract": "algal.organism.v1",
        "key": "organism:platonik-world-planner",
        "name": "Platonik world planner",
        "budgets": {
            "maxSteps": 4,
            "maxAgentCalls": 1,
            "maxWork": 100_000,
            "maxContextBytes": MAX_VIEW_BYTES,
            "maxOutputBytes": 1_024,
            "maxDepth": 0
        },
        "interface": {
            "inputs": {"world": {"cell": "state", "port": "world"}},
            "outputs": {"command": {"cell": "planner", "port": "out"}}
        },
        "cells": [
            {"id": "state", "kind": "input", "outputs": {"world": "json"}},
            {
                "id": "planner",
                "kind": "agent",
                "inputs": {"world": "json"},
                "prompt": "Choose one useful next action for this Platonik automation world that best serves world.goal. The host has already compiled and validated every available action. Take explicit production terms literally: choose an assembler candidate for assembler, frame, or second-tier goals, and a crane candidate for crane or automatic-transfer goals, when that candidate exists. Return only {\"candidate\":\"ID\"} using one exact ID from world.candidates. Prefer finishing existing construction before expansion. Do not invent an ID or command fields.",
                "view": {"inputs": ["world"]},
                "output": {
                    "kind": "json",
                    "schema": {
                        "type": "object",
                        "required": ["candidate"],
                        "properties": {"candidate": {"type": "string"}}
                    }
                },
                "budget": {
                    "maxContextBytes": MAX_VIEW_BYTES,
                    "maxOutputBytes": 1_024,
                    "maxEffectMs": 120_000
                }
            }
        ],
        "edges": [
            {"from": {"cell": "state", "port": "world"}, "to": {"cell": "planner", "port": "world"}}
        ]
    }))
    .map_err(|error| error.to_string())
}

fn validate_goal(goal: &str) -> Result<(), String> {
    if goal.trim() != goal
        || goal.is_empty()
        || goal.chars().count() > MAX_GOAL_CHARS
        || goal.chars().any(char::is_control)
    {
        return Err(format!(
            "Planner goals need 1–{MAX_GOAL_CHARS} trimmed printable characters."
        ));
    }
    Ok(())
}

fn add_candidate(
    commands: &mut BTreeMap<String, Command>,
    choices: &mut Vec<Value>,
    id: String,
    description: String,
    command: Command,
) {
    if commands.len() >= MAX_CANDIDATES || commands.contains_key(&id) {
        return;
    }
    choices.push(json!({"id": id, "description": description}));
    commands.insert(id, command);
}

fn valid_program(experiment: &Experiment, cell: u16, program: &Program) -> bool {
    let mut next = experiment.clone();
    let Some(target) = next.cells.iter_mut().find(|entry| entry.id == cell) else {
        return false;
    };
    target.program = program.clone();
    sim::validate_experiment(&next).is_ok()
}

fn program_name(program: &Program) -> &'static str {
    if *program == world_fixtures::surveyor_program() {
        "surveyor"
    } else if *program == world_fixtures::hauler_program() {
        "hauler"
    } else if world_fixtures::builder_program(50).is_ok_and(|value| value == *program) {
        "upper-builder"
    } else if world_fixtures::builder_program(51).is_ok_and(|value| value == *program) {
        "lower-builder"
    } else {
        "custom"
    }
}

fn cell_program(report: &world::Report, cell: u16) -> Option<&Program> {
    report
        .experiment
        .cells
        .iter()
        .find(|entry| entry.id == cell)
        .map(|entry| &entry.program)
        .or_else(|| {
            report
                .state
                .construction
                .as_ref()?
                .births
                .iter()
                .find(|birth| birth.body.cell.id == cell)
                .map(|birth| &birth.body.cell.program)
        })
}

fn live_role_count(report: &world::Report, program: &Program) -> usize {
    report
        .state
        .cells
        .iter()
        .filter(|cell| cell_program(report, cell.id).is_some_and(|value| value == program))
        .count()
}

fn preserves_essential_roles(
    report: &world::Report,
    cell: u16,
    program: &Program,
    surveyor: &Program,
    hauler: &Program,
) -> bool {
    let Some(current) = cell_program(report, cell) else {
        return false;
    };
    let surveyors = live_role_count(report, surveyor)
        .saturating_sub(usize::from(current == surveyor))
        + usize::from(program == surveyor);
    let haulers = live_role_count(report, hauler).saturating_sub(usize::from(current == hauler))
        + usize::from(program == hauler);
    (report.experiment.beacons.is_empty() || surveyors > 0)
        && (report.state.facilities.is_empty() || haulers > 0)
}

fn planning_input(
    world: &World,
    goal: &str,
) -> Result<(Value, BTreeMap<String, Command>, String, u64), String> {
    validate_goal(goal)?;
    let report = world::report(world)?;
    if world.events.len() >= world::MAX_WORLD_EVENTS {
        return Err("Living world event limit leaves no planner actions.".into());
    }
    let mut commands = BTreeMap::new();
    let mut choices = Vec::new();
    let max_advance = report.maximum_tick.saturating_sub(report.tick).min(128);
    for ticks in [16, 32, 64, 128, 8] {
        if ticks <= max_advance {
            add_candidate(
                &mut commands,
                &mut choices,
                format!("advance-{ticks}"),
                format!("Run the existing automation for {ticks} ticks."),
                Command::Advance { ticks },
            );
        }
    }

    let unfinished_site = report
        .state
        .facilities
        .iter()
        .any(|facility| !facility.ready);
    if !unfinished_site {
        if let Some(construction) = &report.experiment.construction {
            for stock in &construction.stocks {
                if industry::validate_placement(
                    &report.experiment,
                    &report.state,
                    FacilityKind::Miner,
                    stock.position,
                )
                .is_ok()
                {
                    add_candidate(
                        &mut commands,
                        &mut choices,
                        format!("place-miner-stock-{}", stock.id),
                        format!(
                            "Open a drill site on material deposit {} at ({}, {}).",
                            stock.id, stock.position.x, stock.position.y
                        ),
                        Command::Place {
                            structure: FacilityKind::Miner,
                            position: stock.position,
                        },
                    );
                }
            }
        }

        let preferred_sites = [
            Point { x: 12, y: 13 },
            Point { x: 23, y: 6 },
            Point { x: 0, y: 8 },
            Point { x: 12, y: 0 },
        ];
        let assembler_sites = [
            Point { x: 0, y: 6 },
            Point { x: 12, y: 13 },
            Point { x: 23, y: 6 },
            Point { x: 0, y: 8 },
        ];
        for (kind, label) in [
            (FacilityKind::Storehouse, "storehouse"),
            (FacilityKind::Fabricator, "fabricator"),
            (FacilityKind::Assembler, "assembler"),
        ] {
            let sites = if kind == FacilityKind::Assembler {
                &assembler_sites
            } else {
                &preferred_sites
            };
            if let Some(position) = sites.iter().copied().find(|position| {
                industry::validate_placement(&report.experiment, &report.state, kind, *position)
                    .is_ok()
            }) {
                add_candidate(
                    &mut commands,
                    &mut choices,
                    format!("place-{label}-{}-{}", position.x, position.y),
                    if kind == FacilityKind::Assembler && position == (Point { x: 0, y: 6 }) {
                        "Open the frame-producing second-tier assembler at (0, 6), leaving (0, 5) for a crane from the west fabricator.".into()
                    } else if kind == FacilityKind::Fabricator {
                        format!(
                            "Open another first-tier fabricator site at ({}, {}).",
                            position.x, position.y
                        )
                    } else {
                        format!(
                            "Open a {label} construction site at ({}, {}).",
                            position.x, position.y
                        )
                    },
                    Command::Place {
                        structure: kind,
                        position,
                    },
                );
            }
        }
        let crane_site = (0..report.experiment.height).find_map(|y| {
            (0..report.experiment.width)
                .map(|x| Point { x, y })
                .find(|position| {
                    report
                        .state
                        .facilities
                        .iter()
                        .filter(|facility| {
                            facility.ready && facility.position.distance(*position) == 1
                        })
                        .count()
                        >= 2
                        && industry::validate_placement(
                            &report.experiment,
                            &report.state,
                            FacilityKind::Crane,
                            *position,
                        )
                        .is_ok()
                })
        });
        if let Some(position) = crane_site {
            add_candidate(
                &mut commands,
                &mut choices,
                format!("place-crane-{}-{}", position.x, position.y),
                format!(
                    "Open an automatic crane site between ready facilities at ({}, {}).",
                    position.x, position.y
                ),
                Command::Place {
                    structure: FacilityKind::Crane,
                    position,
                },
            );
        }
    }

    let surveyor = world_fixtures::surveyor_program();
    let hauler = world_fixtures::hauler_program();
    for cell in &report.experiment.cells {
        if cell.mobile {
            for (label, program) in [("surveyor", &surveyor), ("hauler", &hauler)] {
                if cell.program != *program
                    && valid_program(&report.experiment, cell.id, program)
                    && preserves_essential_roles(&report, cell.id, program, &surveyor, &hauler)
                {
                    add_candidate(
                        &mut commands,
                        &mut choices,
                        format!("cell-{}-{label}", cell.id),
                        format!(
                            "Change original cell {} from {} to {label}; all essential roles remain staffed.",
                            cell.id,
                            program_name(&cell.program)
                        ),
                        Command::SetProgram {
                            cell: cell.id,
                            program: program.clone(),
                        },
                    );
                }
            }
        }
    }
    for (label, blueprint) in [("upper-builder", 50), ("lower-builder", 51)] {
        if let Ok(program) = world_fixtures::builder_program(blueprint) {
            for cell in report.experiment.cells.iter().filter(|cell| !cell.mobile) {
                if cell.program != program && valid_program(&report.experiment, cell.id, &program) {
                    add_candidate(
                        &mut commands,
                        &mut choices,
                        format!("cell-{}-{label}", cell.id),
                        format!(
                            "Change original cell {} from {} to {label}.",
                            cell.id,
                            program_name(&cell.program)
                        ),
                        Command::SetProgram {
                            cell: cell.id,
                            program: program.clone(),
                        },
                    );
                }
            }
        }
    }
    if choices.is_empty() {
        return Err("Living world has no valid bounded planner actions.".into());
    }

    let cells: Vec<_> = report
        .state
        .cells
        .iter()
        .map(|cell| {
            let policy = cell_program(&report, cell.id).map_or("unknown", program_name);
            json!({
                "id": cell.id,
                "position": cell.position,
                "heading": cell.heading,
                "policy": policy,
                "memory": cell.memory,
                "carryingSpark": cell.cargo.is_some(),
                "carryingMaterial": cell.material.is_some(),
                "carryingPart": cell.part.is_some()
            })
        })
        .collect();
    let sources: Vec<_> = report
        .experiment
        .sources
        .iter()
        .map(|source| {
            let sparks = report
                .state
                .sources
                .iter()
                .find(|state| state.id == source.id)
                .map_or(0, |state| state.sparks.len());
            json!({"id": source.id, "position": source.position, "sparks": sparks})
        })
        .collect();
    let depots: Vec<_> = report
        .experiment
        .depots
        .iter()
        .map(|depot| {
            let sparks = report
                .state
                .depots
                .iter()
                .find(|state| state.id == depot.id)
                .map_or(0, |state| state.sparks.len());
            json!({"id": depot.id, "position": depot.position, "sparks": sparks, "capacity": depot.capacity})
        })
        .collect();
    let beacons: Vec<_> = report
        .experiment
        .beacons
        .iter()
        .filter_map(|beacon| {
            report
                .state
                .beacons
                .iter()
                .find(|state| state.id == beacon.id)
                .map(|state| {
                    json!({
                        "id": beacon.id,
                        "position": beacon.position,
                        "charge": state.charge,
                        "delivered": state.delivered,
                        "requiredDeliveries": beacon.required_deliveries,
                        "drainEvery": beacon.drain_every,
                        "exhausted": state.exhausted
                    })
                })
        })
        .collect();
    let stocks: Vec<_> = report
        .experiment
        .construction
        .as_ref()
        .into_iter()
        .flat_map(|construction| &construction.stocks)
        .map(|stock| {
            let units = report
                .state
                .construction
                .as_ref()
                .and_then(|state| state.stocks.iter().find(|entry| entry.id == stock.id))
                .map_or(0, |state| state.units.len());
            json!({"id": stock.id, "position": stock.position, "units": units})
        })
        .collect();
    let facilities: Vec<_> = report
        .state
        .facilities
        .iter()
        .map(|facility| {
            json!({
                "id": facility.id,
                "name": report.names.get(&facility.id),
                "kind": facility.kind,
                "position": facility.position,
                "ready": facility.ready,
                "neededMaterial": facility.needed_material,
                "neededPart": facility.needed_part,
                "materials": facility.materials.len(),
                "sparks": facility.sparks.len(),
                "parts": facility.parts.len(),
                "progress": facility.progress,
                "produced": facility.minted
            })
        })
        .collect();
    let assemblies: Vec<_> = report
        .state
        .construction
        .as_ref()
        .into_iter()
        .flat_map(|construction| &construction.assemblies)
        .map(|assembly| {
            json!({
                "blueprint": assembly.blueprint,
                "parent": assembly.parent,
                "copiedBytes": assembly.copied.len(),
                "wiredLinks": assembly.wired.len()
            })
        })
        .collect();
    let live_surveyors = live_role_count(&report, &surveyor);
    let live_haulers = live_role_count(&report, &hauler);
    let world_hash = report.world_hash.clone();
    let value = json!({
        "schema": "platonik-world-agent-view-v2",
        "worldHash": world_hash,
        "goal": goal,
        "name": report.name,
        "revision": report.revision,
        "tick": report.tick,
        "maximumTick": report.maximum_tick,
        "summary": report.summary,
        "liveRoles": {"surveyors": live_surveyors, "haulers": live_haulers},
        "map": {"width": report.experiment.width, "height": report.experiment.height, "walls": report.experiment.walls},
        "cells": cells,
        "sources": sources,
        "depots": depots,
        "beacons": beacons,
        "materialStocks": stocks,
        "facilities": facilities,
        "assemblies": assemblies,
        "births": report.state.construction.as_ref().map_or(0, |state| state.births.len()),
        "totalWork": report.costs.total(),
        "candidates": choices
    });
    let size = serde_json::to_vec(&value)
        .map_err(|error| error.to_string())?
        .len();
    if size > MAX_VIEW_BYTES {
        return Err(format!(
            "Algal world view exceeds the {MAX_VIEW_BYTES}-byte context bound."
        ));
    }
    Ok((value, commands, world_hash, report.revision))
}

fn check_host(host: &Host) -> Result<(), String> {
    if !host.has_executor() {
        return Err("Algal proposal execution requires one configured executor.".into());
    }
    if host.entries.iter().any(|(_, backend)| {
        matches!(
            backend,
            Backend::Jev { .. }
                | Backend::Command { .. }
                | Backend::Acp { .. }
                | Backend::Xcb { .. }
        )
    }) {
        return Err(
            "Platonik admits only scripted, gateway, OpenAI-compatible, or Apple Algal executors; its planner generates a candidate selection rather than a typed decision."
                .into(),
        );
    }
    Ok(())
}

fn runtime() -> Result<tokio::runtime::Runtime, String> {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|error| error.to_string())
}

fn selected_command(
    outputs: &Value,
    commands: &BTreeMap<String, Command>,
) -> Result<Command, String> {
    let candidate = outputs["command"]["candidate"]
        .as_str()
        .ok_or("Algal planner output needs one candidate id.")?;
    commands
        .get(candidate)
        .cloned()
        .ok_or_else(|| format!("Algal planner selected unknown candidate {candidate}."))
}

fn run_proposal(world: &World, mut host: Host, goal: String) -> Result<Proposal, String> {
    check_host(&host)?;
    let manifest = manifest()?;
    let organism_digest = manifest.digest().map_err(|error| error.to_string())?;
    let (view, commands, world_hash, revision) = planning_input(world, &goal)?;
    let args =
        interface_args(&manifest, &json!({"world": view})).map_err(|error| error.to_string())?;
    let mut store = Store::default();
    let receipt = runtime()?
        .block_on(runtime::run(
            manifest.clone(),
            args,
            &mut store,
            &mut host,
            &Transports::new(),
            None,
        ))
        .map_err(|error| error.to_string())?;
    if receipt["outcome"] != "complete" {
        let code = receipt["failure"]["code"].as_str().unwrap_or("RUN_FAILED");
        let message = receipt["failure"]["message"]
            .as_str()
            .unwrap_or("planner did not complete successfully");
        return Err(format!("Algal planner failed ({code}): {message}"));
    }
    let outputs = runtime::outputs(&manifest, &receipt).map_err(|error| error.to_string())?;
    let command = selected_command(&outputs, &commands)?;
    world::apply(world, command.clone())?;
    Ok(Proposal {
        schema: PROPOSAL_SCHEMA.into(),
        world_hash,
        revision,
        organism_digest,
        goal,
        command,
        receipt,
    })
}

pub fn organism() -> Result<Value, String> {
    Ok(manifest()?.value)
}

pub fn default_goal() -> &'static str {
    DEFAULT_GOAL
}

pub fn propose_scripted(world: &World, responses: Value, goal: String) -> Result<Proposal, String> {
    run_proposal(world, Host::scripted(responses), goal)
}

pub fn propose_configured(world: &World, config: &Value, goal: String) -> Result<Proposal, String> {
    let host = Host::from_config(config).map_err(|error| error.to_string())?;
    run_proposal(world, host, goal)
}

pub fn accept(world: &World, proposal: &Proposal) -> Result<World, String> {
    if proposal.schema != PROPOSAL_SCHEMA {
        return Err("Unsupported Algal proposal schema.".into());
    }
    let report = world::report(world)?;
    if proposal.world_hash != report.world_hash || proposal.revision != report.revision {
        return Err("Algal proposal targets a different world revision.".into());
    }
    let manifest = manifest()?;
    if proposal.organism_digest != manifest.digest().map_err(|error| error.to_string())? {
        return Err("Algal proposal uses a different planner organism.".into());
    }
    let (current_view, commands, _, _) = planning_input(world, &proposal.goal)?;
    let expected_args = interface_args(&manifest, &json!({"world": current_view}))
        .map_err(|error| error.to_string())?;
    if proposal.receipt["args"] != expected_args {
        return Err("Algal proposal receipt is not bound to this world view.".into());
    }
    let receipt_size = serde_json::to_vec(&proposal.receipt)
        .map_err(|error| error.to_string())?
        .len();
    if receipt_size > MAX_PROPOSAL_BYTES as usize {
        return Err("Algal receipt exceeds the proposal byte bound.".into());
    }
    let store = Store::default();
    let verified = runtime()?
        .block_on(runtime::verify(
            &proposal.receipt,
            manifest.clone(),
            &store,
            &Host::default(),
        ))
        .map_err(|error| error.to_string())?;
    if verified["ok"] != true {
        return Err("Algal proposal receipt did not replay exactly.".into());
    }
    let outputs =
        runtime::outputs(&manifest, &proposal.receipt).map_err(|error| error.to_string())?;
    let command = selected_command(&outputs, &commands)?;
    if command != proposal.command {
        return Err("Algal proposal command does not match its receipt.".into());
    }
    world::apply(world, command)
}
