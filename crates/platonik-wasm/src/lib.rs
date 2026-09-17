//! Browser WASM surface for Platonik.
//!
//! Exports small JSON-in/JSON-out helpers so the Next.js play page can load a
//! tutorial experiment, run it in the authoritative Rust engine, and inspect
//! the resulting receipt without a server round-trip.
use wasm_bindgen::prelude::*;

fn to_js_error(error: impl ToString) -> JsError {
    JsError::new(&error.to_string())
}

/// Return a frozen fixture experiment as JSON. Supported ids match
/// `platonik-core` fixtures (`opening-normal`, `ark-plan-a`, etc.).
#[wasm_bindgen]
pub fn tutorial_experiment(id: &str) -> Result<String, JsError> {
    let experiment = platonik_core::fixtures::experiment(id).map_err(to_js_error)?;
    serde_json::to_string(&experiment).map_err(to_js_error)
}

/// Parse an experiment JSON, run it, and return a full receipt JSON including
/// every frame of the run. Errors are returned as `JsError` messages.
#[wasm_bindgen]
pub fn run_experiment(experiment_json: &str) -> Result<String, JsError> {
    let experiment = platonik_core::sim::parse_experiment(experiment_json).map_err(to_js_error)?;
    let receipt = platonik_core::check::make_receipt(&experiment).map_err(to_js_error)?;
    serde_json::to_string(&receipt).map_err(to_js_error)
}

/// Generate one of the published challenges by index (1–9999) and return it as
/// JSON. The public `train` cases are what honest local iteration uses.
#[wasm_bindgen]
pub fn generated_challenge(index: u32) -> Result<String, JsError> {
    let challenge = platonik_core::challenge::generate(index as u64).map_err(to_js_error)?;
    serde_json::to_string(&challenge).map_err(to_js_error)
}

/// Return a named reference program as JSON. Supported names:
/// `idle`, `compact`, `resilient`, `relay`, `controller`, `switchboard-porter`,
/// `switchboard-relay`, `switchboard-keeper`, `foundry-builder`.
#[wasm_bindgen]
pub fn reference_program(name: &str) -> Result<String, JsError> {
    let program = match name {
        "idle" => platonik_core::fixtures::idle_program(),
        "compact" => platonik_core::fixtures::compact_courier(),
        "resilient" => platonik_core::fixtures::resilient_courier(),
        "relay" => platonik_core::fixtures::relay_program(),
        "controller" => platonik_core::fixtures::controller_program(),
        "switchboard-porter" => platonik_core::fixtures::switchboard_porter(),
        "switchboard-relay" => platonik_core::fixtures::switchboard_relay(),
        "switchboard-keeper" => platonik_core::fixtures::switchboard_keeper(),
        "foundry-builder" => platonik_core::fixtures::foundry_builder(),
        _ => return Err(JsError::new(&format!("Unknown reference program: {name}"))),
    };
    serde_json::to_string(&program).map_err(to_js_error)
}

/// Evaluate a challenge submission in-browser. `challenge_json` is the output
/// of `generated_challenge`; `submission_json` follows the challenge submission
/// schema. The result includes per-case pass/fail, work, and full receipts.
#[wasm_bindgen]
pub fn evaluate_challenge(challenge_json: &str, submission_json: &str) -> Result<String, JsError> {
    let challenge: platonik_core::challenge::Challenge =
        serde_json::from_str(challenge_json).map_err(to_js_error)?;
    let submission: platonik_core::challenge::Submission =
        serde_json::from_str(submission_json).map_err(to_js_error)?;
    let result =
        platonik_core::challenge::evaluate(&challenge, &submission).map_err(to_js_error)?;
    serde_json::to_string(&result).map_err(to_js_error)
}
