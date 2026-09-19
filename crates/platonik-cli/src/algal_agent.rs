use algal::contract::Manifest;
use algal::effects::{Backend, Host};
use algal::graph::{Transports, interface_args};
use algal::runtime;
use algal::store::Store;
use platonik_core::world::{self, Command, World};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

pub const PROPOSAL_SCHEMA: &str = "platonik-algal-proposal-v1";
pub const MAX_CONFIG_BYTES: u64 = 1_048_576;
pub const MAX_PROPOSAL_BYTES: u64 = 4 * 1_048_576;
const MAX_VIEW_BYTES: usize = 65_536;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Proposal {
    pub schema: String,
    pub world_hash: String,
    pub revision: u64,
    pub organism_digest: String,
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
            "maxOutputBytes": 16_384,
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
                "prompt": "Choose exactly one useful next action for this Platonik automation world. Return only one JSON command. Valid forms are advance with integer ticks, set_program for an original programmable cell with a complete program, place with structure fabricator/storehouse/miner and an integer position, or name with an existing facility id and a printable name. Respect the bounds and terrain in the supplied view. Do not claim to mutate state yourself; Platonik will independently validate the proposal.",
                "view": {"inputs": ["world"]},
                "output": {
                    "kind": "json",
                    "schema": {
                        "type": "object",
                        "required": ["kind"],
                        "properties": {"kind": {"type": "string"}}
                    }
                },
                "budget": {
                    "maxContextBytes": MAX_VIEW_BYTES,
                    "maxOutputBytes": 16_384,
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

fn view(world: &World) -> Result<(Value, String, u64), String> {
    let report = world::report(world)?;
    let max_advance = report.maximum_tick.saturating_sub(report.tick).min(128);
    let value = json!({
        "schema": "platonik-world-agent-view-v1",
        "worldHash": report.world_hash,
        "name": report.name,
        "revision": report.revision,
        "tick": report.tick,
        "maximumTick": report.maximum_tick,
        "maxAdvance": max_advance,
        "summary": report.summary,
        "experiment": report.experiment,
        "state": report.state,
        "costs": report.costs,
        "names": report.names,
        "commands": {
            "advance": {"kind": "advance", "ticks": "integer 1..maxAdvance"},
            "setProgram": {"kind": "set_program", "cell": "original programmable cell id", "program": "complete Program object"},
            "place": {"kind": "place", "structure": "fabricator | storehouse | miner", "position": {"x": "integer", "y": "integer"}},
            "name": {"kind": "name", "facility": "existing facility id", "name": "1..32 printable characters"}
        }
    });
    let size = serde_json::to_vec(&value)
        .map_err(|error| error.to_string())?
        .len();
    if size > MAX_VIEW_BYTES {
        return Err(format!(
            "Algal world view exceeds the {MAX_VIEW_BYTES}-byte context bound."
        ));
    }
    Ok((value, report.world_hash, report.revision))
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
            "Platonik admits only scripted, gateway, OpenAI-compatible, or Apple Algal executors; its planner generates a command rather than a typed decision."
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

fn run_proposal(world: &World, mut host: Host) -> Result<Proposal, String> {
    check_host(&host)?;
    let manifest = manifest()?;
    let organism_digest = manifest.digest().map_err(|error| error.to_string())?;
    let (view, world_hash, revision) = view(world)?;
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
        return Err("Algal planner did not complete successfully.".into());
    }
    let outputs = runtime::outputs(&manifest, &receipt).map_err(|error| error.to_string())?;
    let command: Command = serde_json::from_value(outputs["command"].clone())
        .map_err(|error| format!("Algal planner returned an invalid Platonik command: {error}"))?;
    world::apply(world, command.clone())?;
    Ok(Proposal {
        schema: PROPOSAL_SCHEMA.into(),
        world_hash,
        revision,
        organism_digest,
        command,
        receipt,
    })
}

pub fn organism() -> Result<Value, String> {
    Ok(manifest()?.value)
}

pub fn propose_scripted(world: &World, responses: Value) -> Result<Proposal, String> {
    run_proposal(world, Host::scripted(responses))
}

pub fn propose_configured(world: &World, config: &Value) -> Result<Proposal, String> {
    let host = Host::from_config(config).map_err(|error| error.to_string())?;
    run_proposal(world, host)
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
    let (current_view, _, _) = view(world)?;
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
    let command: Command = serde_json::from_value(outputs["command"].clone())
        .map_err(|error| format!("Algal receipt contains an invalid Platonik command: {error}"))?;
    if command != proposal.command {
        return Err("Algal proposal command does not match its receipt.".into());
    }
    world::apply(world, command)
}
