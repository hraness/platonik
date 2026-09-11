//! A finite, replay-derived field collection. Trials reset their physical world;
//! creations and the full search ledger persist. Nothing advances while paused.
use crate::{check, expedition_fixtures, fixtures, model::*, sim};
use serde::{Deserialize, Serialize};

pub const SCHEMA: &str = "platonik-expedition-v1";
pub const ALLOWANCE: u64 = 1_000_000;
pub const MAX_TRIALS: usize = 32;
pub const MAX_ASSETS: usize = 21;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Ambition {
    Frugal,
    Resilient,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Courier,
    Controller,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Creation {
    pub id: String,
    pub name: String,
    pub parent: Option<String>,
    pub role: Role,
    pub program: Program,
    pub program_hash: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Command {
    Grow {
        id: String,
        name: String,
        parent: String,
        program: Program,
    },
    Trial {
        case_id: String,
        courier: String,
        controller: String,
    },
    Freeze {
        courier: String,
        controller: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Selection {
    pub courier: String,
    pub controller: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Pending {
    pub command: Command,
    pub experiment_hash: String,
    pub reserved_work: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Event {
    Grown {
        command: Command,
    },
    Frozen {
        command: Command,
    },
    Started {
        command: Command,
        experiment_hash: String,
        reserved_work: u64,
    },
    Completed {
        receipt: Box<check::Receipt>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Trial {
    pub case_id: String,
    pub courier: String,
    pub controller: String,
    pub experiment_hash: String,
    pub receipt_hash: String,
    pub passed: bool,
    pub work: u64,
    pub ticks: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Campaign {
    pub schema: String,
    pub name: String,
    pub ambition: Ambition,
    pub allowance: u64,
    pub work: u64,
    pub creations: Vec<Creation>,
    pub trials: Vec<Trial>,
    pub frozen: Option<Selection>,
    pub pending: Option<Pending>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Progress {
    pub completed_training: Vec<String>,
    pub completed_transfer: Vec<String>,
    pub missing_training: Vec<String>,
    pub missing_transfer: Vec<String>,
    pub unattempted_transfer: Vec<String>,
    pub failed_transfer: Vec<String>,
    pub confirmation_finished: bool,
    pub field_expedition_complete: bool,
    pub next: String,
    pub reply: Option<String>,
}

fn valid_name(value: &str) -> bool {
    !value.trim().is_empty() && value.len() <= 96 && !value.chars().any(char::is_control)
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 48
        && value.as_bytes()[0].is_ascii_lowercase()
        && value
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}

pub fn new(name: String, ambition: Ambition) -> Result<Campaign, String> {
    if !valid_name(&name) {
        return Err("Expedition name must be 1–96 bytes without control characters.".into());
    }
    let mut creations = Vec::new();
    for (id, label, role, program) in [
        (
            "compact",
            "Moth",
            Role::Courier,
            fixtures::compact_courier(),
        ),
        (
            "recovery",
            "Fern",
            Role::Courier,
            fixtures::resilient_courier(),
        ),
        (
            "memory",
            "Keeper",
            Role::Controller,
            fixtures::controller_program(),
        ),
        (
            "constant-a",
            "A lamp",
            Role::Controller,
            fixtures::constant_controller(false),
        ),
        (
            "constant-b",
            "B lamp",
            Role::Controller,
            fixtures::constant_controller(true),
        ),
    ] {
        creations.push(Creation {
            id: id.into(),
            name: label.into(),
            parent: None,
            role,
            program_hash: check::artifact_hash(&program)?,
            program,
        });
    }
    Ok(Campaign {
        schema: SCHEMA.into(),
        name,
        ambition,
        allowance: ALLOWANCE,
        work: 0,
        creations,
        trials: Vec::new(),
        frozen: None,
        pending: None,
    })
}

fn creation<'a>(state: &'a Campaign, id: &str, role: Role) -> Result<&'a Creation, String> {
    state
        .creations
        .iter()
        .find(|c| c.id == id && c.role == role)
        .ok_or_else(|| format!("No {role:?} creation named {id}."))
}

fn selection(state: &Campaign, courier: &str, controller: &str) -> Result<Selection, String> {
    let selected_courier = creation(state, courier, Role::Courier)?;
    creation(state, controller, Role::Controller)?;
    if state.ambition == Ambition::Resilient
        && selected_courier.program != fixtures::resilient_courier()
    {
        return Err("This expedition preserves Fern's recovery habit unchanged. Choose recovery or an exact copy; controller adaptations remain available.".into());
    }
    Ok(Selection {
        courier: courier.into(),
        controller: controller.into(),
    })
}

pub fn trial_experiment(state: &Campaign, command: &Command) -> Result<Experiment, String> {
    let Command::Trial {
        case_id,
        courier,
        controller,
    } = command
    else {
        return Err("Only a trial has an experiment.".into());
    };
    let courier = creation(state, courier, Role::Courier)?;
    let controller = creation(state, controller, Role::Controller)?;
    let mut experiment = expedition_fixtures::experiment(case_id)?;
    for cell in &mut experiment.cells {
        if cell.id == fixtures::COURIER {
            cell.program = courier.program.clone();
        }
        if cell.id == fixtures::CONTROLLER {
            cell.program = controller.program.clone();
        }
    }
    sim::validate_experiment(&experiment)?;
    Ok(experiment)
}

pub fn plan(state: &Campaign, command: &Command) -> Result<(Event, Option<Experiment>), String> {
    if state.pending.is_some() {
        return Err("An interrupted trial is pending; recover it before another action.".into());
    }
    match command {
        Command::Grow {
            id,
            name,
            parent,
            program,
        } => {
            if state.frozen.is_some() {
                return Err("The confirmation selection is frozen; further growth requires a new expedition.".into());
            }
            if state.creations.len() >= MAX_ASSETS {
                return Err("The collection creation limit is reached.".into());
            }
            if !valid_id(id) || !valid_name(name) {
                return Err("Use a lowercase ID of at most 48 bytes and a name of at most 96 bytes, without controls.".into());
            }
            if state.creations.iter().any(|c| c.id == *id) {
                return Err("Creation IDs are immutable; choose a new ID.".into());
            }
            let parent = state
                .creations
                .iter()
                .find(|c| c.id == *parent)
                .ok_or("Unknown parent.")?;
            let mut experiment = expedition_fixtures::experiment("ark-plan-a")?;
            let target = if parent.role == Role::Courier {
                fixtures::COURIER
            } else {
                fixtures::CONTROLLER
            };
            experiment
                .cells
                .iter_mut()
                .find(|c| c.id == target)
                .ok_or("Missing fixture role.")?
                .program = program.clone();
            sim::validate_experiment(&experiment)?;
            Ok((
                Event::Grown {
                    command: command.clone(),
                },
                None,
            ))
        }
        Command::Freeze {
            courier,
            controller,
        } => {
            if state.frozen.is_some() {
                return Err("The selection is already frozen.".into());
            }
            selection(state, courier, controller)?;
            // A frozen artifact must already satisfy every public training task.
            if !expedition_fixtures::training_ids()
                .iter()
                .all(|id| passed_by(state, id, courier, controller))
            {
                return Err(
                    "Complete all four training cases with this unchanged pair before freezing."
                        .into(),
                );
            }
            Ok((
                Event::Frozen {
                    command: command.clone(),
                },
                None,
            ))
        }
        Command::Trial {
            case_id,
            courier,
            controller,
        } => {
            let chosen = selection(state, courier, controller)?;
            if state.trials.len() >= MAX_TRIALS {
                return Err("The 32-trial discovery allowance is exhausted.".into());
            }
            let transfer = expedition_fixtures::transfer_ids().contains(&case_id.as_str());
            if transfer {
                if state.frozen.as_ref() != Some(&chosen) {
                    return Err("Transfer cases require the unchanged frozen pair.".into());
                }
                if state.trials.iter().any(|t| t.case_id == *case_id) {
                    return Err("Each transfer case is evaluated once; start a new declared study to adapt.".into());
                }
            } else if state.frozen.is_some() {
                return Err("Training ended when the selection was frozen.".into());
            }
            let experiment = trial_experiment(state, command)?;
            if state
                .work
                .checked_add(experiment.fuel)
                .is_none_or(|work| work > state.allowance)
            {
                return Err(
                    "Insufficient remaining work for the trial's full fuel reservation.".into(),
                );
            }
            let event = Event::Started {
                command: command.clone(),
                experiment_hash: check::artifact_hash(&experiment)?,
                reserved_work: experiment.fuel,
            };
            Ok((event, Some(experiment)))
        }
    }
}

/// Completion must derive from the exact committed intent, including its policy,
/// world, seed and allowance. Honest mission failure is still a completed trial.
pub fn complete(state: &Campaign, receipt: check::Receipt) -> Result<Event, String> {
    let pending = state.pending.as_ref().ok_or("No trial is pending.")?;
    let expected = trial_experiment(state, &pending.command)?;
    if receipt.experiment != expected || check::artifact_hash(&expected)? != pending.experiment_hash
    {
        return Err("Receipt does not match the committed trial intent.".into());
    }
    check::verify_receipt(&receipt)?;
    if receipt.result.costs.total() > pending.reserved_work {
        return Err("Receipt exceeded its reserved work.".into());
    }
    Ok(Event::Completed {
        receipt: Box::new(receipt),
    })
}

/// Reconstruct authoritative state from checked journal events, never from a
/// client-supplied save snapshot or success flag.
pub fn apply(state: &mut Campaign, event: &Event) -> Result<(), String> {
    match event {
        Event::Grown { command } | Event::Frozen { command } | Event::Started { command, .. } => {
            let (expected, _) = plan(state, command)?;
            if expected != *event {
                return Err("Journal event differs from the admitted command.".into());
            }
            match command {
                Command::Grow {
                    id,
                    name,
                    parent,
                    program,
                } => {
                    let role = state
                        .creations
                        .iter()
                        .find(|c| c.id == *parent)
                        .ok_or("Unknown parent.")?
                        .role;
                    state.creations.push(Creation {
                        id: id.clone(),
                        name: name.clone(),
                        parent: Some(parent.clone()),
                        role,
                        program_hash: check::artifact_hash(program)?,
                        program: program.clone(),
                    });
                }
                Command::Freeze {
                    courier,
                    controller,
                } => state.frozen = Some(selection(state, courier, controller)?),
                Command::Trial { .. } => {
                    let Event::Started {
                        experiment_hash,
                        reserved_work,
                        ..
                    } = event
                    else {
                        unreachable!()
                    };
                    state.pending = Some(Pending {
                        command: command.clone(),
                        experiment_hash: experiment_hash.clone(),
                        reserved_work: *reserved_work,
                    });
                }
            }
        }
        Event::Completed { receipt } => {
            complete(state, (**receipt).clone())?;
            let pending = state.pending.as_ref().ok_or("No trial pending.")?;
            let Command::Trial {
                case_id,
                courier,
                controller,
            } = &pending.command
            else {
                return Err("Invalid pending command.".into());
            };
            let work = receipt.result.costs.total();
            state.trials.push(Trial {
                case_id: case_id.clone(),
                courier: courier.clone(),
                controller: controller.clone(),
                experiment_hash: pending.experiment_hash.clone(),
                receipt_hash: check::artifact_hash(receipt.as_ref())?,
                passed: receipt.passed(),
                work,
                ticks: receipt.result.ticks_completed,
            });
            state.work += work;
            state.pending = None;
        }
    }
    Ok(())
}

fn passed_by(state: &Campaign, id: &str, courier: &str, controller: &str) -> bool {
    state
        .trials
        .iter()
        .any(|t| t.case_id == id && t.courier == courier && t.controller == controller && t.passed)
}

pub fn progress(state: &Campaign) -> Progress {
    let passed = |id: &&str| match &state.frozen {
        Some(pair) => passed_by(state, id, &pair.courier, &pair.controller),
        None => state.trials.iter().any(|t| t.case_id == *id && t.passed),
    };
    let (completed_training, missing_training): (Vec<_>, Vec<_>) =
        expedition_fixtures::training_ids()
            .iter()
            .partition(|id| passed(id));
    let (completed_transfer, missing_transfer): (Vec<_>, Vec<_>) =
        expedition_fixtures::transfer_ids()
            .iter()
            .partition(|id| passed(id));
    let complete = state.frozen.is_some()
        && missing_training.is_empty()
        && missing_transfer.is_empty()
        && state.pending.is_none();
    let unattempted_transfer: Vec<String> = expedition_fixtures::transfer_ids()
        .iter()
        .filter(|id| !state.trials.iter().any(|t| t.case_id == **id))
        .map(|id| id.to_string())
        .collect();
    let failed_transfer: Vec<String> = expedition_fixtures::transfer_ids()
        .iter()
        .filter(|id| state.trials.iter().any(|t| t.case_id == **id && !t.passed))
        .map(|id| id.to_string())
        .collect();
    let confirmation_finished =
        state.frozen.is_some() && unattempted_transfer.is_empty() && state.pending.is_none();
    let next = if state.pending.is_some() {
        "Recover the committed trial; the collection is preserved."
    } else if complete {
        "The field expedition is complete. Export its checked journal and keep your collection."
    } else if confirmation_finished {
        "Confirmation is finished with a recorded failure. Export this collection and result; adaptation requires a new declared expedition. This frozen result cannot be retried."
    } else if state.frozen.is_some() {
        "Test each unattempted transfer case once. Keep failed cases as evidence; adapting or retrying them requires a new declared expedition."
    } else if missing_training.is_empty() {
        "Complete all four training cases with one unchanged pair, then freeze it for transfer."
    } else {
        "Keep a camp light supplied, survive a closing route, then use a remembered report to route the same stock."
    };
    Progress {
        completed_training: completed_training.into_iter().map(|s: &&str| s.to_string()).collect(),
        completed_transfer: completed_transfer.into_iter().map(|s: &&str| s.to_string()).collect(),
        missing_training: missing_training.into_iter().map(|s: &&str| s.to_string()).collect(),
        missing_transfer: missing_transfer.into_iter().map(|s: &&str| s.to_string()).collect(),
        unattempted_transfer, failed_transfer, confirmation_finished,
        field_expedition_complete: complete, next: next.into(),
        reply: complete.then(|| "A light answers from the new camp. Your couriers carried its supply; your keeper remembered where it belonged. The crossing is repeatable, and your companions are safe in the collection. This is the first camp on the Long Trail.".into()),
    }
}
