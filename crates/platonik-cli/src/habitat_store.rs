//! Checked continuous-habitat records. State enters only through a replayed
//! immutable experiment and its admitted continuation commands.
pub use crate::journal::MAX_BUNDLE_BYTES;
use crate::journal::{
    Entry, Store, checked_path, problem, regular_bytes, sync_directory, uncommitted_import_skeleton,
};
use platonik_core::check::artifact_hash;
use platonik_core::continuation::{self, Advance};
use platonik_core::model::{Costs, Experiment, RunStatus, State};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

const JOURNAL_SCHEMA: &str = "platonik-habitat-journal-v1";
const BUNDLE_SCHEMA: &str = "platonik-habitat-bundle-v1";
const MAX_ADVANCES: usize = 8;
const MAX_ENTRIES: usize = 1 + 2 * MAX_ADVANCES;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct AdvanceCommand {
    until: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Event {
    Initialized {
        experiment: Box<Experiment>,
        result: Box<Advance>,
    },
    Started {
        until: u32,
        from_hash: String,
        reserved_work: u64,
    },
    Completed {
        result: Box<Advance>,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Record {
    pub request_id: String,
    pub command_hash: String,
    pub expected_revision: Option<u64>,
    pub event_hash: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Bundle {
    pub schema: String,
    pub entries: Vec<Entry<Record>>,
    pub objects: BTreeMap<String, Event>,
}

#[derive(Serialize)]
pub struct Report {
    pub schema: &'static str,
    pub revision: u64,
    pub request_id: Option<String>,
    pub pending_request_id: Option<String>,
    pub pending_until: Option<u32>,
    pub pending_reserved_work: u64,
    pub experiment_hash: String,
    pub last_result_hash: String,
    pub checkpoint_hash: Option<String>,
    pub result_hash: Option<String>,
    pub phase: &'static str,
    pub tick: u32,
    pub horizon: u32,
    pub advances: usize,
    pub maximum_advances: usize,
    pub remaining_fuel: u64,
    pub costs: Costs,
    pub current_state: State,
    pub mission_passed: bool,
    pub run_status: Option<RunStatus>,
    pub activation_limited: bool,
}

#[derive(Serialize)]
pub struct JourneyReport {
    pub schema: &'static str,
    pub habitat: Report,
    pub journey: platonik_core::first_answer::Journey,
}

#[derive(Clone)]
struct Request {
    until: u32,
    expected: u64,
    last_revision: u64,
    completed: bool,
}

#[derive(Clone)]
struct Pending {
    request_id: String,
    until: u32,
    reserved_work: u64,
}

struct Snapshot {
    experiment: Experiment,
    result: Advance,
    revision: u64,
    advances: usize,
    pending: Option<Pending>,
    requests: BTreeMap<String, Request>,
}

fn request_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 64
        || id == "init"
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(
            "Request IDs must be 1–64 ASCII letters, digits, '-' or '_'; 'init' is reserved."
                .into(),
        );
    }
    Ok(())
}

fn state_and_costs(result: &Advance) -> Result<(&State, &Costs), String> {
    match result {
        Advance::Paused(checkpoint) => checkpoint
            .frames
            .last()
            .map(|frame| (&frame.state, &frame.costs))
            .ok_or_else(|| "Checkpoint is missing its loaded state.".into()),
        Advance::Finished(result) => Ok((&result.final_state, &result.costs)),
    }
}

fn report(snapshot: Snapshot, request_id: Option<String>) -> Result<Report, String> {
    let (state, costs) = state_and_costs(&snapshot.result)?;
    let (phase, checkpoint_hash, result_hash, mission_passed, run_status, activation_limited) =
        match &snapshot.result {
            Advance::Paused(checkpoint) => (
                "paused",
                Some(artifact_hash(checkpoint)?),
                None,
                false,
                None,
                checkpoint
                    .frames
                    .iter()
                    .flat_map(|frame| &frame.activations)
                    .any(|activation| activation.error.as_deref() == Some("activation_limit")),
            ),
            Advance::Finished(result) => (
                "finished",
                None,
                Some(artifact_hash(result)?),
                result.outcome.passed,
                Some(result.status),
                result
                    .frames
                    .iter()
                    .flat_map(|frame| &frame.activations)
                    .any(|activation| activation.error.as_deref() == Some("activation_limit")),
            ),
        };
    Ok(Report {
        schema: "platonik-habitat-report-v1",
        revision: snapshot.revision,
        request_id,
        pending_request_id: snapshot
            .pending
            .as_ref()
            .map(|pending| pending.request_id.clone()),
        pending_until: snapshot.pending.as_ref().map(|pending| pending.until),
        pending_reserved_work: snapshot
            .pending
            .as_ref()
            .map_or(0, |pending| pending.reserved_work),
        experiment_hash: artifact_hash(&snapshot.experiment)?,
        last_result_hash: artifact_hash(&snapshot.result)?,
        checkpoint_hash,
        result_hash,
        phase,
        tick: state.tick,
        horizon: snapshot.experiment.ticks,
        advances: snapshot.advances,
        maximum_advances: MAX_ADVANCES,
        remaining_fuel: snapshot
            .experiment
            .fuel
            .checked_sub(costs.total())
            .ok_or("Work exceeds the original allowance.")?,
        costs: costs.clone(),
        current_state: state.clone(),
        mission_passed,
        run_status,
        activation_limited,
    })
}

fn plan(snapshot: &Snapshot, until: u32) -> Result<Event, String> {
    if snapshot.pending.is_some() {
        return Err("Recover the pending advance before requesting another.".into());
    }
    let Advance::Paused(_) = &snapshot.result else {
        return Err(
            "The habitat is finished; its success or failure cannot be advanced or refueled."
                .into(),
        );
    };
    if snapshot.advances >= MAX_ADVANCES {
        return Err("The habitat permits at most eight advances.".into());
    }
    let (state, costs) = state_and_costs(&snapshot.result)?;
    if until <= state.tick || until > snapshot.experiment.ticks {
        return Err("Advance until must be later than the current tick and no later than the original horizon.".into());
    }
    Ok(Event::Started {
        until,
        from_hash: artifact_hash(&snapshot.result)?,
        reserved_work: snapshot
            .experiment
            .fuel
            .checked_sub(costs.total())
            .ok_or("Work exceeds the original allowance.")?,
    })
}

fn recompute(snapshot: &Snapshot, until: u32) -> Result<Advance, String> {
    match &snapshot.result {
        Advance::Paused(checkpoint) => continuation::resume_until(checkpoint, until),
        Advance::Finished(_) => Err("A finished habitat cannot continue.".into()),
    }
}

fn reconstruct(
    entries: &[Entry<Record>],
    mut object: impl FnMut(&str) -> Result<Event, String>,
) -> Result<Snapshot, String> {
    if entries.is_empty() || entries.len() > MAX_ENTRIES {
        return Err(
            "Habitat initialization is incomplete or its journal exceeds seventeen entries.".into(),
        );
    }
    let first = &entries[0];
    let event = object(&first.event.event_hash)?;
    let Event::Initialized { experiment, result } = &event else {
        return Err("Habitat journal must begin with its immutable experiment.".into());
    };
    if first.schema != JOURNAL_SCHEMA
        || first.revision != 0
        || first.previous_hash.is_some()
        || first.event.request_id != "init"
        || first.event.expected_revision.is_some()
        || first.event.command_hash != artifact_hash(experiment)?
        || first.event.event_hash != artifact_hash(&event)?
    {
        return Err("Habitat genesis identity is invalid.".into());
    }
    if continuation::start_until(experiment, 0)? != **result {
        return Err("Habitat genesis state differs from actual tick-zero loading.".into());
    }
    let mut snapshot = Snapshot {
        experiment: (**experiment).clone(),
        result: (**result).clone(),
        revision: 0,
        advances: 0,
        pending: None,
        requests: BTreeMap::new(),
    };
    let mut previous = artifact_hash(first)?;
    for (index, entry) in entries.iter().enumerate().skip(1) {
        if entry.schema != JOURNAL_SCHEMA
            || entry.revision != index as u64
            || entry.previous_hash.as_ref() != Some(&previous)
        {
            return Err("Habitat journal revisions or identities disagree.".into());
        }
        request_id(&entry.event.request_id)?;
        let event = object(&entry.event.event_hash)?;
        if artifact_hash(&event)? != entry.event.event_hash {
            return Err("Habitat event object has changed.".into());
        }
        match &event {
            Event::Initialized { .. } => {
                return Err("A second genesis cannot reset a habitat.".into());
            }
            Event::Started {
                until,
                reserved_work,
                ..
            } => {
                if snapshot.requests.contains_key(&entry.event.request_id)
                    || entry.event.expected_revision != Some(snapshot.revision)
                    || entry.event.command_hash != artifact_hash(&AdvanceCommand { until: *until })?
                    || artifact_hash(&plan(&snapshot, *until)?)? != artifact_hash(&event)?
                {
                    return Err("Advance request was changed, reused, or committed against a stale checkpoint.".into());
                }
                snapshot.pending = Some(Pending {
                    request_id: entry.event.request_id.clone(),
                    until: *until,
                    reserved_work: *reserved_work,
                });
                snapshot.requests.insert(
                    entry.event.request_id.clone(),
                    Request {
                        until: *until,
                        expected: snapshot.revision,
                        last_revision: entry.revision,
                        completed: false,
                    },
                );
                snapshot.advances += 1;
            }
            Event::Completed { result } => {
                let pending = snapshot
                    .pending
                    .as_ref()
                    .ok_or("Completion has no committed advance intent.")?;
                let request = snapshot
                    .requests
                    .get(&entry.event.request_id)
                    .ok_or("Completion has no request binding.")?;
                if pending.request_id != entry.event.request_id
                    || request.completed
                    || entry.event.expected_revision != Some(request.expected)
                    || entry.event.command_hash
                        != artifact_hash(&AdvanceCommand {
                            until: request.until,
                        })?
                    || recompute(&snapshot, pending.until)? != **result
                {
                    return Err(
                        "Continuation result differs from its committed request and actual replay."
                            .into(),
                    );
                }
                snapshot.result = (**result).clone();
                snapshot.pending = None;
                let request = snapshot.requests.get_mut(&entry.event.request_id).unwrap();
                request.completed = true;
                request.last_revision = entry.revision;
            }
        }
        snapshot.revision = entry.revision;
        previous = artifact_hash(entry)?;
    }
    Ok(snapshot)
}

fn entries(store: &Store) -> Result<Vec<Entry<Record>>, String> {
    if fs::symlink_metadata(store.root.join("import.json")).is_ok() {
        return Err(
            "An import is pending; repeat it with its original bundle before using this habitat."
                .into(),
        );
    }
    let entries = store.load::<Record>()?;
    if entries.len() > MAX_ENTRIES {
        return Err("Habitat journal entry limit exceeded.".into());
    }
    Ok(entries)
}

fn read_snapshot(store: &Store) -> Result<(Vec<Entry<Record>>, Snapshot), String> {
    let entries = entries(store)?;
    let snapshot = reconstruct(&entries, |hash| store.object(hash))?;
    Ok((entries, snapshot))
}

fn snapshot_at(store: &Store, revision: u64) -> Result<Snapshot, String> {
    let entries = entries(store)?;
    let end = usize::try_from(revision).map_err(problem)?;
    if end >= entries.len() {
        return Err("Committed habitat revision is missing.".into());
    }
    reconstruct(&entries[..=end], |hash| store.object(hash))
}

pub fn initialize(path: &Path, experiment: Experiment) -> Result<Report, String> {
    platonik_core::validate_experiment(&experiment)?;
    let hash = artifact_hash(&experiment)?;
    let store = Store::create(path, JOURNAL_SCHEMA)?;
    let history = entries(&store)?;
    if let Some(genesis) = history.first() {
        reconstruct(&history, |hash| store.object(hash))?;
        if genesis.event.command_hash != hash {
            return Err("This habitat was initialized with a different experiment.".into());
        }
        return report(
            reconstruct(&history[..1], |hash| store.object(hash))?,
            Some("init".into()),
        );
    }
    let result = continuation::start_until(&experiment, 0)?;
    let event_hash = store.put(&Event::Initialized {
        experiment: Box::new(experiment),
        result: Box::new(result),
    })?;
    store.append(
        Record {
            request_id: "init".into(),
            command_hash: hash,
            expected_revision: None,
            event_hash,
        },
        None,
    )?;
    report(snapshot_at(&store, 0)?, Some("init".into()))
}

pub fn status(path: &Path) -> Result<Report, String> {
    let store = Store::open(path, JOURNAL_SCHEMA)?;
    report(read_snapshot(&store)?.1, None)
}

pub fn journey(path: &Path) -> Result<JourneyReport, String> {
    let store = Store::open(path, JOURNAL_SCHEMA)?;
    let snapshot = read_snapshot(&store)?.1;
    // read_snapshot has already replayed this exact immutable input and prefix.
    // A pending intent contributes no future frame or achievement.
    let journey =
        platonik_core::first_answer::grade_verified(&snapshot.experiment, &snapshot.result)?;
    Ok(JourneyReport {
        schema: "platonik-first-answer-report-v1",
        habitat: report(snapshot, None)?,
        journey,
    })
}

fn finish(store: &Store, snapshot: Snapshot, id: &str) -> Result<Report, String> {
    let pending = snapshot
        .pending
        .as_ref()
        .ok_or("No habitat advance is pending.")?;
    if pending.request_id != id {
        return Err("Request ID does not name the pending advance.".into());
    }
    let result = recompute(&snapshot, pending.until)?;
    let request = snapshot
        .requests
        .get(id)
        .ok_or("Pending request binding is absent.")?;
    let event_hash = store.put(&Event::Completed {
        result: Box::new(result),
    })?;
    let committed = store.append(
        Record {
            request_id: id.into(),
            command_hash: artifact_hash(&AdvanceCommand {
                until: request.until,
            })?,
            expected_revision: Some(request.expected),
            event_hash,
        },
        Some(snapshot.revision),
    )?;
    report(snapshot_at(store, committed.revision)?, Some(id.into()))
}

pub fn advance(path: &Path, until: u32, expected: u64, id: &str) -> Result<Report, String> {
    request_id(id)?;
    let store = Store::open(path, JOURNAL_SCHEMA)?;
    let (history, snapshot) = read_snapshot(&store)?;
    if let Some(request) = snapshot.requests.get(id) {
        if request.until != until || request.expected != expected {
            return Err(
                "Request ID is already bound to different input or expected revision.".into(),
            );
        }
        if request.completed {
            return report(
                reconstruct(&history[..=request.last_revision as usize], |hash| {
                    store.object(hash)
                })?,
                Some(id.into()),
            );
        }
        return finish(&store, snapshot, id);
    }
    if expected != snapshot.revision {
        return Err(format!(
            "Stale revision: expected {expected}, current {}.",
            snapshot.revision
        ));
    }
    let event_hash = store.put(&plan(&snapshot, until)?)?;
    let committed = store.append(
        Record {
            request_id: id.into(),
            command_hash: artifact_hash(&AdvanceCommand { until })?,
            expected_revision: Some(expected),
            event_hash,
        },
        Some(expected),
    )?;
    finish(&store, snapshot_at(&store, committed.revision)?, id)
}

pub fn recover(path: &Path, expected: u64, id: &str) -> Result<Report, String> {
    request_id(id)?;
    let store = Store::open(path, JOURNAL_SCHEMA)?;
    let (history, snapshot) = read_snapshot(&store)?;
    if let Some(request) = snapshot.requests.get(id)
        && request.completed
        && expected == request.last_revision.saturating_sub(1)
    {
        return report(
            reconstruct(&history[..=request.last_revision as usize], |hash| {
                store.object(hash)
            })?,
            Some(id.into()),
        );
    }
    if expected != snapshot.revision {
        return Err(format!(
            "Stale recovery revision: expected {expected}, current {}.",
            snapshot.revision
        ));
    }
    finish(&store, snapshot, id)
}

pub fn export(path: &Path) -> Result<Vec<u8>, String> {
    let store = Store::open(path, JOURNAL_SCHEMA)?;
    let (entries, _) = read_snapshot(&store)?;
    let mut objects = BTreeMap::new();
    for entry in &entries {
        objects.insert(
            entry.event.event_hash.clone(),
            store.object::<Event>(&entry.event.event_hash)?,
        );
    }
    let bundle = Bundle {
        schema: BUNDLE_SCHEMA.into(),
        entries,
        objects,
    };
    let mut bytes = serde_json::to_vec(&bundle).map_err(problem)?;
    bytes.push(b'\n');
    if bytes.len() as u64 > MAX_BUNDLE_BYTES {
        return Err("Habitat export exceeds 64 MiB; preserve the original store.".into());
    }
    Ok(bytes)
}

pub fn import(bundle: Bundle, path: &Path) -> Result<Report, String> {
    if bundle.schema != BUNDLE_SCHEMA
        || bundle.entries.is_empty()
        || bundle.entries.len() > MAX_ENTRIES
        || bundle.objects.len() > MAX_ENTRIES
    {
        return Err("Invalid or oversized habitat bundle.".into());
    }
    let referenced: BTreeSet<_> = bundle
        .entries
        .iter()
        .map(|entry| entry.event.event_hash.clone())
        .collect();
    if referenced != bundle.objects.keys().cloned().collect() {
        return Err("Habitat bundle objects do not exactly match its journal references.".into());
    }
    let verified = reconstruct(&bundle.entries, |hash| {
        bundle
            .objects
            .get(hash)
            .cloned()
            .ok_or_else(|| "Missing habitat object.".into())
    })?;
    let import_hash = artifact_hash(&bundle)?;
    let absolute = checked_path(path)?;
    match fs::symlink_metadata(&absolute) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir(&absolute).map_err(problem)?;
            if let Some(parent) = absolute.parent() {
                sync_directory(parent)?;
            }
        }
        Ok(metadata) => {
            if !metadata.is_dir() || metadata.file_type().is_symlink() {
                return Err("Import destination must be a real new directory.".into());
            }
            let marker = absolute.join("import.json");
            match fs::symlink_metadata(&marker) {
                Ok(_) => {
                    let pending: String =
                        serde_json::from_slice(&regular_bytes(&marker, 1024)?).map_err(problem)?;
                    if pending != import_hash {
                        return Err("Destination belongs to another interrupted import.".into());
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    uncommitted_import_skeleton(&absolute)?
                }
                Err(error) => return Err(problem(error)),
            }
        }
        Err(error) => return Err(problem(error)),
    }
    let store = Store::create(&absolute, JOURNAL_SCHEMA)?;
    store.publish(
        &store.root.join("import.json"),
        &serde_json::to_vec(&import_hash).map_err(problem)?,
        true,
    )?;
    for event in bundle.objects.values() {
        store.put(event)?;
    }
    let committed = store.load::<Record>()?;
    if committed.len() > bundle.entries.len()
        || committed
            .iter()
            .zip(&bundle.entries)
            .any(|(actual, expected)| artifact_hash(actual).ok() != artifact_hash(expected).ok())
    {
        return Err("Interrupted habitat import is not a prefix of the supplied bundle.".into());
    }
    for entry in bundle.entries {
        if entry.revision >= committed.len() as u64 {
            store.append(entry.event, entry.revision.checked_sub(1))?;
        }
    }
    fs::remove_file(store.root.join("import.json")).map_err(problem)?;
    sync_directory(&store.root)?;
    let actual = read_snapshot(&store)?.1;
    if actual.revision != verified.revision
        || actual.experiment != verified.experiment
        || actual.result != verified.result
    {
        return Err("Imported habitat did not reproduce its checked state.".into());
    }
    report(actual, None)
}

pub fn cases() -> Vec<&'static str> {
    platonik_core::continuity_fixtures::case_ids()
        .iter()
        .chain(platonik_core::construction_fixtures::case_ids())
        .chain(platonik_core::answer_fixtures::case_ids())
        .copied()
        .collect()
}

pub fn case(id: &str) -> Result<Experiment, String> {
    if platonik_core::answer_fixtures::case_ids().contains(&id) {
        platonik_core::answer_fixtures::experiment(id)
    } else if platonik_core::construction_fixtures::case_ids().contains(&id) {
        platonik_core::construction_fixtures::experiment(id)
    } else {
        platonik_core::continuity_fixtures::experiment(id)
    }
}

pub fn prepare(id: &str, source: &Path) -> Result<Experiment, String> {
    let campaign = crate::expedition_store::status(source)?.campaign;
    let pair = campaign
        .frozen
        .as_ref()
        .ok_or("Freeze an expedition pair before preparing a continuous habitat.")?;
    let mut experiment = case(id)?;
    for (cell_id, creation_id) in [(1, &pair.courier), (3, &pair.controller)] {
        let creation = campaign
            .creations
            .iter()
            .find(|creation| creation.id == *creation_id)
            .ok_or("Frozen creation is missing.")?;
        let cell = if let Some(cell) = experiment.cells.iter_mut().find(|cell| cell.id == cell_id) {
            cell
        } else {
            &mut experiment
                .construction
                .as_mut()
                .and_then(|spec| {
                    spec.blueprints
                        .iter_mut()
                        .find(|blueprint| blueprint.body.cell.id == cell_id)
                })
                .ok_or("Habitat case does not contain the required role or child blueprint.")?
                .body
                .cell
        };
        cell.program = creation.program.clone();
    }
    platonik_core::validate_experiment(&experiment)?;
    Ok(experiment)
}
