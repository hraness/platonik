//! Tick-boundary continuation of one immutable experiment. A checkpoint is
//! identified data, not a signature: a saved journey must also bind its identity
//! to that journey's genesis. Imported state is admitted by prefix replay.
use crate::check::{artifact_hash, validate_prefix, validate_result};
use crate::model::{Experiment, Frame, MAX_TICKS, RunResult, RunStatus};
use crate::sim::run_through;
use serde::{Deserialize, Serialize};

pub use crate::check::PrefixSummary;

pub const CHECKPOINT_SCHEMA: &str = "platonik-checkpoint-v1";
pub const MAX_CHECKPOINT_BYTES: usize = 32 * 1024 * 1024;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Checkpoint {
    pub schema: String,
    pub experiment_hash: String,
    pub prefix_hash: String,
    pub experiment: Experiment,
    pub frames: Vec<Frame>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    content = "value",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum Advance {
    Paused(Checkpoint),
    Finished(RunResult),
}

fn require(condition: bool, message: &str) -> Result<(), String> {
    if condition {
        Ok(())
    } else {
        Err(message.into())
    }
}

// Count canonical bytes without allocating another copy of the saved trace.
fn check_size(checkpoint: &Checkpoint) -> Result<(), String> {
    struct LimitedWriter(usize);
    impl std::io::Write for LimitedWriter {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            self.0 = self
                .0
                .checked_add(bytes.len())
                .filter(|size| *size <= MAX_CHECKPOINT_BYTES)
                .ok_or_else(|| std::io::Error::other("Checkpoint exceeds 32 MiB."))?;
            Ok(bytes.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    serde_json::to_writer(LimitedWriter(0), checkpoint).map_err(|error| error.to_string())
}

fn validate_checkpoint(checkpoint: &Checkpoint) -> Result<PrefixSummary, String> {
    require(
        checkpoint.schema == CHECKPOINT_SCHEMA,
        "Unsupported checkpoint schema.",
    )?;
    require(
        !checkpoint.frames.is_empty() && checkpoint.frames.len() <= MAX_TICKS as usize,
        "Invalid or unbounded checkpoint frame count.",
    )?;
    check_size(checkpoint)?;
    let summary = validate_prefix(&checkpoint.experiment, &checkpoint.frames)?;
    require(
        checkpoint.experiment_hash == artifact_hash(&checkpoint.experiment)?,
        "Checkpoint experiment digest does not match its contents.",
    )?;
    require(
        checkpoint.prefix_hash == artifact_hash(&checkpoint.frames)?,
        "Checkpoint prefix digest does not match its contents.",
    )?;
    Ok(summary)
}

/// Bounded parsing and independent invariants only; does not execute the model.
/// Use verify_checkpoint before treating imported state as an executable prefix.
pub fn parse_checkpoint(input: &str) -> Result<Checkpoint, String> {
    require(
        input.len() <= MAX_CHECKPOINT_BYTES,
        "Checkpoint exceeds 32 MiB.",
    )?;
    let checkpoint =
        serde_json::from_str(input).map_err(|error| format!("Invalid checkpoint JSON: {error}"))?;
    validate_checkpoint(&checkpoint)?;
    Ok(checkpoint)
}

/// Check local invariants, identities, and an exact execution of the prefix.
/// This replay is counted by process telemetry, not charged twice to the world.
pub fn verify_checkpoint(checkpoint: &Checkpoint) -> Result<PrefixSummary, String> {
    let summary = validate_checkpoint(checkpoint)?;
    let replayed = run_through(&checkpoint.experiment, summary.tick, None)?;
    require(
        replayed.status != RunStatus::FuelExhausted && replayed.frames == checkpoint.frames,
        "Fresh recomputation differs from the checkpoint prefix or costs.",
    )?;
    Ok(summary)
}

fn package(experiment: &Experiment, result: RunResult) -> Result<Advance, String> {
    if result.status == RunStatus::FuelExhausted || result.ticks_completed == experiment.ticks {
        validate_result(experiment, &result)?;
        return Ok(Advance::Finished(result));
    }
    validate_prefix(experiment, &result.frames)?;
    let checkpoint = Checkpoint {
        schema: CHECKPOINT_SCHEMA.into(),
        experiment_hash: artifact_hash(experiment)?,
        prefix_hash: artifact_hash(&result.frames)?,
        experiment: experiment.clone(),
        frames: result.frames,
    };
    check_size(&checkpoint)?;
    Ok(Advance::Paused(checkpoint))
}

/// Start one original experiment through an absolute tick. Tick zero charges
/// loading/checking and pauses before any physical tick, unless loading fails.
pub fn start_until(experiment: &Experiment, through_tick: u32) -> Result<Advance, String> {
    let result = run_through(experiment, through_tick, None)?;
    package(experiment, result)
}

/// Continue after a complete tick with the original time, fuel and state.
/// Fuel-exhausted partial ticks have no continuation representation.
pub fn resume_until(checkpoint: &Checkpoint, through_tick: u32) -> Result<Advance, String> {
    require(
        checkpoint
            .frames
            .last()
            .is_some_and(|last| last.tick < through_tick)
            && through_tick <= checkpoint.experiment.ticks,
        "Resume requires a later absolute tick within the original horizon.",
    )?;
    verify_checkpoint(checkpoint)?;
    let result = run_through(
        &checkpoint.experiment,
        through_tick,
        Some(&checkpoint.frames),
    )?;
    package(&checkpoint.experiment, result)
}
