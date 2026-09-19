//! Browser WASM surface for Platonik.
//!
//! Exports small JSON-in/JSON-out helpers so the Next.js play page can load
//! worlds, run them in the authoritative Rust engine, grade journeys, and
//! drive the expedition campaign without a server round-trip. Every export is
//! a thin wrapper over a pure `platonik-core` function; the engine's own
//! bounds (ticks, fuel, program size) apply regardless of the caller.
use wasm_bindgen::prelude::*;

fn to_js_error(error: impl ToString) -> JsError {
    JsError::new(&error.to_string())
}

fn to_json<T: serde::Serialize>(value: &T) -> Result<String, JsError> {
    serde_json::to_string(value).map_err(to_js_error)
}

fn from_json<T: serde::de::DeserializeOwned>(json: &str) -> Result<T, JsError> {
    serde_json::from_str(json).map_err(to_js_error)
}

/// Return a frozen fixture experiment as JSON. Supported ids match
/// `platonik-core` fixtures (`opening-normal`, `ark-plan-a`, etc.).
#[wasm_bindgen]
pub fn tutorial_experiment(id: &str) -> Result<String, JsError> {
    let experiment = platonik_core::fixtures::experiment(id).map_err(to_js_error)?;
    to_json(&experiment)
}

/// Parse an experiment JSON, run it, and return a full receipt JSON including
/// every frame of the run. Errors are returned as `JsError` messages.
#[wasm_bindgen]
pub fn run_experiment(experiment_json: &str) -> Result<String, JsError> {
    let experiment = platonik_core::sim::parse_experiment(experiment_json).map_err(to_js_error)?;
    let receipt = platonik_core::check::make_receipt(&experiment).map_err(to_js_error)?;
    to_json(&receipt)
}

/// Validate an experiment JSON without running it — fast editor feedback for
/// malformed programs, out-of-range fields, or exceeded bounds.
#[wasm_bindgen]
pub fn validate_experiment(experiment_json: &str) -> Result<String, JsError> {
    let experiment = platonik_core::sim::parse_experiment(experiment_json).map_err(to_js_error)?;
    platonik_core::sim::validate_experiment(&experiment).map_err(to_js_error)?;
    to_json(&serde_json::json!({ "ok": true }))
}

/// Re-check a receipt JSON produced by `run_experiment` (or the CLI). Returns
/// the verification report; a badge should only render on success.
#[wasm_bindgen]
pub fn verify_receipt(receipt_json: &str) -> Result<String, JsError> {
    let receipt: platonik_core::check::Receipt = from_json(receipt_json)?;
    let report = platonik_core::check::verify_receipt(&receipt).map_err(to_js_error)?;
    to_json(&report)
}

/// Generate one of the published challenges by index (1–9999) and return it as
/// JSON. The public `train` cases are what honest local iteration uses.
#[wasm_bindgen]
pub fn generated_challenge(index: u32) -> Result<String, JsError> {
    let challenge = platonik_core::challenge::generate(index as u64).map_err(to_js_error)?;
    to_json(&challenge)
}

/// Lightweight challenge metadata for the picker: id, family, band, editable
/// cells, and case counts — without the full case payloads.
#[wasm_bindgen]
pub fn challenge_info(index: u32) -> Result<String, JsError> {
    let challenge = platonik_core::challenge::generate(index as u64).map_err(to_js_error)?;
    to_json(&serde_json::json!({
        "schema": challenge.schema,
        "id": challenge.id,
        "index": challenge.index,
        "generator": challenge.generator,
        "family": challenge.family,
        "band": challenge.band,
        "editable": challenge.editable,
        "witness": challenge.witness,
        "train_cases": challenge.train.len(),
        "eval_cases": challenge.eval.len(),
    }))
}

/// Evaluate a challenge submission in-browser. `challenge_json` is the output
/// of `generated_challenge`; `submission_json` follows the challenge submission
/// schema. The result includes per-case pass/fail, work, and full receipts.
#[wasm_bindgen]
pub fn evaluate_challenge(challenge_json: &str, submission_json: &str) -> Result<String, JsError> {
    let challenge: platonik_core::challenge::Challenge = from_json(challenge_json)?;
    let submission: platonik_core::challenge::Submission = from_json(submission_json)?;
    let result =
        platonik_core::challenge::evaluate(&challenge, &submission).map_err(to_js_error)?;
    to_json(&result)
}

/// Build a well-formed submission JSON for a challenge from per-cell program
/// JSON values (`{"1": {...}, "3": {...}}`). Keeps the schema construction in
/// the engine so the frontend cannot produce a malformed envelope.
#[wasm_bindgen]
pub fn make_submission(
    challenge_json: &str,
    programs_json: &str,
    agent_name: Option<String>,
) -> Result<String, JsError> {
    let challenge: platonik_core::challenge::Challenge = from_json(challenge_json)?;
    let programs: std::collections::BTreeMap<String, platonik_core::model::Program> =
        from_json(programs_json)?;
    let mut expected: Vec<String> = challenge.editable.iter().map(u16::to_string).collect();
    expected.sort();
    let provided: Vec<String> = programs.keys().cloned().collect();
    if provided != expected {
        return Err(JsError::new(&format!(
            "Submission must supply exactly the editable cells: {}.",
            expected.join(", ")
        )));
    }
    let submission = platonik_core::challenge::Submission {
        schema: "platonik-challenge-submission-v1".into(),
        challenge: challenge.id.clone(),
        programs: programs.into_iter().collect(),
        agent: agent_name.map(|name| platonik_core::challenge::AgentReport {
            name,
            tokens: None,
            notes: None,
        }),
    };
    to_json(&submission)
}

#[wasm_bindgen]
pub fn world_new(name: &str) -> Result<String, JsError> {
    let world =
        platonik_core::world::new(name.to_string(), platonik_core::world_fixtures::frontier())
            .map_err(to_js_error)?;
    to_json(&world)
}

#[wasm_bindgen]
pub fn world_apply(world_json: &str, command_json: &str) -> Result<String, JsError> {
    let world: platonik_core::world::World = from_json(world_json)?;
    let command: platonik_core::world::Command = from_json(command_json)?;
    let next = platonik_core::world::apply(&world, command).map_err(to_js_error)?;
    to_json(&next)
}

/// Compile a bounded drawn route; applying its Program is a separate world command.
#[wasm_bindgen]
pub fn world_route_program(
    world_json: &str,
    cell: u16,
    waypoints_json: &str,
) -> Result<String, JsError> {
    let world: platonik_core::world::World = from_json(world_json)?;
    let points: Vec<platonik_core::model::Point> = from_json(waypoints_json)?;
    let program =
        platonik_core::freight_route::compile(&world, cell, &points).map_err(to_js_error)?;
    to_json(&program)
}

#[wasm_bindgen]
pub fn world_report(world_json: &str) -> Result<String, JsError> {
    let world: platonik_core::world::World = from_json(world_json)?;
    let report = platonik_core::world::report(&world).map_err(to_js_error)?;
    to_json(&report)
}

/// Return a named reference program as JSON. Supported names:
/// `idle`, `compact`, `resilient`, `relay`, `controller`, `switchboard-porter`,
/// `switchboard-relay`, `switchboard-keeper`, `foundry-builder`, the
/// `world-surveyor` and `world-hauler` Dustlight roles, `frontier-hauler`, and the
/// `world-builder-upper` or `world-builder-lower` homestead plans.
#[wasm_bindgen]
pub fn reference_program(name: &str) -> Result<String, JsError> {
    let program = match name {
        "idle" => platonik_core::fixtures::idle_program(),
        "compact" => platonik_core::fixtures::compact_courier(),
        "resilient" => platonik_core::fixtures::resilient_courier(),
        "relay" => platonik_core::fixtures::relay_program(),
        "controller" => platonik_core::fixtures::controller_program(),
        "constant-a" => platonik_core::fixtures::constant_controller(false),
        "constant-b" => platonik_core::fixtures::constant_controller(true),
        "switchboard-porter" => platonik_core::fixtures::switchboard_porter(),
        "switchboard-relay" => platonik_core::fixtures::switchboard_relay(),
        "switchboard-keeper" => platonik_core::fixtures::switchboard_keeper(),
        "foundry-builder" => platonik_core::fixtures::foundry_builder(),
        "world-surveyor" => platonik_core::world_fixtures::surveyor_program(),
        "world-hauler" => platonik_core::world_fixtures::hauler_program(),
        "frontier-hauler" => platonik_core::world_fixtures::frontier_hauler_program(),
        "world-builder-upper" => {
            platonik_core::world_fixtures::builder_program(50).map_err(to_js_error)?
        }
        "world-builder-lower" => {
            platonik_core::world_fixtures::builder_program(51).map_err(to_js_error)?
        }
        _ => return Err(JsError::new(&format!("Unknown reference program: {name}"))),
    };
    to_json(&program)
}

/// Journey and case catalog: every playable world, grouped by track. Mirrors
/// the dispatch order used by `platonik habitat case`.
#[wasm_bindgen]
pub fn journey_catalog() -> Result<String, JsError> {
    to_json(&serde_json::json!({
        "schema": "platonik-journey-catalog-v1",
        "journeys": [
            {
                "id": "continuity",
                "title": "First camp",
                "cases": platonik_core::continuity_fixtures::case_ids(),
                "training": platonik_core::continuity_fixtures::training_ids(),
                "transfer": platonik_core::continuity_fixtures::transfer_ids(),
            },
            {
                "id": "construction",
                "title": "Construction",
                "cases": platonik_core::construction_fixtures::case_ids(),
                "training": platonik_core::construction_fixtures::training_ids(),
                "transfer": platonik_core::construction_fixtures::transfer_ids(),
            },
            {
                "id": "answer",
                "title": "First Answer",
                "cases": platonik_core::answer_fixtures::case_ids(),
                "training": platonik_core::answer_fixtures::training_ids(),
                "transfer": platonik_core::answer_fixtures::transfer_ids(),
            },
            {
                "id": "ark",
                "title": "Ark control",
                "cases": platonik_core::ark_fixtures::case_ids(),
                "training": platonik_core::ark_fixtures::training_ids(),
                "transfer": platonik_core::ark_fixtures::transfer_ids(),
            },
            {
                "id": "ports",
                "title": "Port commitments",
                "cases": platonik_core::port_fixtures::case_ids(),
                "training": platonik_core::port_fixtures::training_ids(),
                "transfer": platonik_core::port_fixtures::transfer_ids(),
                "capacity": platonik_core::port_fixtures::capacity_ids(),
            },
            {
                "id": "bloom",
                "title": "Bloom",
                "cases": platonik_core::bloom_fixtures::case_ids(),
                "training": platonik_core::bloom_fixtures::training_ids(),
                "transfer": platonik_core::bloom_fixtures::transfer_ids(),
            },
            {
                "id": "exchange",
                "title": "Bloom exchange",
                "cases": platonik_core::bloom_exchange_fixtures::case_ids(),
            },
        ],
        "expedition": {
            "cases": platonik_core::expedition_fixtures::case_ids(),
            "training": platonik_core::expedition_fixtures::training_ids(),
            "transfer": platonik_core::expedition_fixtures::transfer_ids(),
        },
    }))
}

/// Load a habitat/journey world by case id, using the same module dispatch as
/// `platonik habitat case`.
#[wasm_bindgen]
pub fn journey_experiment(case_id: &str) -> Result<String, JsError> {
    let experiment = if platonik_core::bloom_exchange_fixtures::case_ids().contains(&case_id) {
        platonik_core::bloom_exchange_fixtures::experiment(case_id)
    } else if platonik_core::bloom_fixtures::case_ids().contains(&case_id) {
        platonik_core::bloom_fixtures::experiment(case_id)
    } else if platonik_core::port_fixtures::case_ids().contains(&case_id) {
        platonik_core::port_fixtures::experiment(case_id)
    } else if platonik_core::ark_fixtures::case_ids().contains(&case_id) {
        platonik_core::ark_fixtures::experiment(case_id)
    } else if platonik_core::answer_fixtures::case_ids().contains(&case_id) {
        platonik_core::answer_fixtures::experiment(case_id)
    } else if platonik_core::construction_fixtures::case_ids().contains(&case_id) {
        platonik_core::construction_fixtures::experiment(case_id)
    } else {
        platonik_core::continuity_fixtures::experiment(case_id)
    }
    .map_err(to_js_error)?;
    to_json(&experiment)
}

/// Start a continuous habitat: run `experiment` through absolute tick `until`
/// and return an `Advance` (`paused` checkpoint or `finished` result).
#[wasm_bindgen]
pub fn habitat_start(experiment_json: &str, until: u32) -> Result<String, JsError> {
    let experiment = platonik_core::sim::parse_experiment(experiment_json).map_err(to_js_error)?;
    let advance =
        platonik_core::continuation::start_until(&experiment, until).map_err(to_js_error)?;
    to_json(&advance)
}

/// Resume a paused habitat checkpoint through a later absolute tick.
#[wasm_bindgen]
pub fn habitat_resume(checkpoint_json: &str, until: u32) -> Result<String, JsError> {
    let checkpoint: platonik_core::continuation::Checkpoint = from_json(checkpoint_json)?;
    let advance =
        platonik_core::continuation::resume_until(&checkpoint, until).map_err(to_js_error)?;
    to_json(&advance)
}

/// Grade an `Advance` produced in this same session against a journey. The
/// advance came from this engine, so the verified projection is safe; cold
/// receipts should go through `grade_receipt` instead. `journey` is one of
/// `answer`, `ark`, `ports`, `bloom`. `case_id` is required for `exchange`.
#[wasm_bindgen]
pub fn grade_advance(
    journey: &str,
    experiment_json: &str,
    advance_json: &str,
    case_id: Option<String>,
) -> Result<String, JsError> {
    let experiment: platonik_core::model::Experiment = from_json(experiment_json)?;
    let advance: platonik_core::continuation::Advance = from_json(advance_json)?;
    // Verification is cheap and keeps this entry point honest for any caller.
    match journey {
        "answer" => to_json(
            &platonik_core::first_answer::grade(&experiment, &advance).map_err(to_js_error)?,
        ),
        "ark" => {
            to_json(&platonik_core::ark_control::grade(&experiment, &advance).map_err(to_js_error)?)
        }
        "ports" => to_json(
            &platonik_core::port_commitments::grade(&experiment, &advance).map_err(to_js_error)?,
        ),
        "bloom" => {
            to_json(&platonik_core::bloom::grade(&experiment, &advance).map_err(to_js_error)?)
        }
        other => Err(JsError::new(&format!(
            "Unknown journey {other}. Use answer, ark, ports, bloom, or grade_receipt for exchange (case {case_id:?})."
        ))),
    }
}

/// Grade a cold receipt JSON against a journey, verifying it first. `journey`
/// is one of `answer`, `ark`, `ports`, `bloom`, `exchange`; `exchange` needs
/// `case_id` to select its control contract.
#[wasm_bindgen]
pub fn grade_receipt(
    journey: &str,
    receipt_json: &str,
    case_id: Option<String>,
) -> Result<String, JsError> {
    let receipt: platonik_core::check::Receipt = from_json(receipt_json)?;
    match journey {
        "answer" => {
            to_json(&platonik_core::first_answer::grade_receipt(&receipt).map_err(to_js_error)?)
        }
        "ark" => {
            to_json(&platonik_core::ark_control::grade_receipt(&receipt).map_err(to_js_error)?)
        }
        "ports" => {
            to_json(&platonik_core::port_commitments::grade_receipt(&receipt).map_err(to_js_error)?)
        }
        "bloom" => to_json(&platonik_core::bloom::grade_receipt(&receipt).map_err(to_js_error)?),
        "exchange" => {
            let case_id =
                case_id.ok_or_else(|| JsError::new("Exchange grading needs a case id."))?;
            to_json(
                &platonik_core::bloom_exchange::grade_receipt(&case_id, &receipt)
                    .map_err(to_js_error)?,
            )
        }
        other => Err(JsError::new(&format!("Unknown journey: {other}"))),
    }
}

/// Start a new field expedition campaign. `ambition` is `frugal` or `resilient`.
#[wasm_bindgen]
pub fn expedition_new(name: &str, ambition: &str) -> Result<String, JsError> {
    let ambition = match ambition {
        "frugal" => platonik_core::expedition::Ambition::Frugal,
        "resilient" => platonik_core::expedition::Ambition::Resilient,
        other => {
            return Err(JsError::new(&format!(
                "Unknown ambition {other}; use frugal or resilient."
            )));
        }
    };
    let campaign =
        platonik_core::expedition::new(name.to_string(), ambition).map_err(to_js_error)?;
    to_json(&campaign)
}

/// Plan a campaign command (`grow`, `trial`, `freeze`) against the campaign
/// state. Returns `{ "event": ..., "experiment": ... | null }`; a trial plan
/// returns the experiment to run.
#[wasm_bindgen]
pub fn expedition_plan(state_json: &str, command_json: &str) -> Result<String, JsError> {
    let state: platonik_core::expedition::Campaign = from_json(state_json)?;
    let command: platonik_core::expedition::Command = from_json(command_json)?;
    let (event, experiment) =
        platonik_core::expedition::plan(&state, &command).map_err(to_js_error)?;
    to_json(&serde_json::json!({ "event": event, "experiment": experiment }))
}

/// Complete a pending trial with the receipt produced by `run_experiment`.
#[wasm_bindgen]
pub fn expedition_complete(state_json: &str, receipt_json: &str) -> Result<String, JsError> {
    let state: platonik_core::expedition::Campaign = from_json(state_json)?;
    let receipt: platonik_core::check::Receipt = from_json(receipt_json)?;
    let event = platonik_core::expedition::complete(&state, receipt).map_err(to_js_error)?;
    to_json(&event)
}

/// Apply a journal event to the campaign, returning the new state. Events are
/// re-derived from their command, so a forged or stale event fails.
#[wasm_bindgen]
pub fn expedition_apply(state_json: &str, event_json: &str) -> Result<String, JsError> {
    let mut state: platonik_core::expedition::Campaign = from_json(state_json)?;
    let event: platonik_core::expedition::Event = from_json(event_json)?;
    platonik_core::expedition::apply(&mut state, &event).map_err(to_js_error)?;
    to_json(&state)
}

/// Campaign progress: completed/missing cases, the next objective, and the
/// first-camp reply once the expedition is complete.
#[wasm_bindgen]
pub fn expedition_progress(state_json: &str) -> Result<String, JsError> {
    let state: platonik_core::expedition::Campaign = from_json(state_json)?;
    to_json(&platonik_core::expedition::progress(&state))
}

/// Render the experiment a trial command would run — useful for previewing a
/// case with a chosen pair before committing to it.
#[wasm_bindgen]
pub fn expedition_trial_experiment(
    state_json: &str,
    command_json: &str,
) -> Result<String, JsError> {
    let state: platonik_core::expedition::Campaign = from_json(state_json)?;
    let command: platonik_core::expedition::Command = from_json(command_json)?;
    let experiment =
        platonik_core::expedition::trial_experiment(&state, &command).map_err(to_js_error)?;
    to_json(&experiment)
}
