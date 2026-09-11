//! Expedition-v1 adapter. Its schemas, canonical record bytes, and replay behavior
//! remain unchanged while filesystem publication is shared with other journals.
pub use crate::journal::MAX_BUNDLE_BYTES;
use crate::journal::{
    Entry, MAX_ENTRIES, Store, checked_path, problem, regular_bytes, sync_directory,
    uncommitted_import_skeleton,
};
use platonik_core::check::artifact_hash;
use platonik_core::{
    check,
    expedition::{self, Ambition, Campaign, Command, Event, Progress},
    expedition_fixtures,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

const JOURNAL_SCHEMA: &str = "platonik-expedition-journal-v1";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Payload {
    Genesis { name: String, ambition: Ambition },
    Game { event_hash: String },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Record {
    pub request_id: String,
    pub command_hash: String,
    pub expected_revision: Option<u64>,
    pub payload: Payload,
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
    pub operation_passed: Option<bool>,
    pub available_work: u64,
    pub campaign: Campaign,
    pub progress: Progress,
}

#[derive(Clone)]
struct Request {
    hash: String,
    expected: u64,
    last_revision: u64,
    completed: bool,
    passed: bool,
    trial: bool,
}

struct Snapshot {
    state: Campaign,
    revision: u64,
    requests: BTreeMap<String, Request>,
    pending_request: Option<String>,
}

fn request_id(value: &str) -> Result<(), String> {
    if value == "init"
        || value.is_empty()
        || value.len() > 64
        || !value
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

fn report(snapshot: Snapshot, id: Option<String>, passed: Option<bool>) -> Report {
    let available_work = snapshot.state.allowance
        - snapshot.state.work
        - snapshot
            .state
            .pending
            .as_ref()
            .map_or(0, |pending| pending.reserved_work);
    let progress = expedition::progress(&snapshot.state);
    Report {
        schema: "platonik-expedition-report-v1",
        revision: snapshot.revision,
        request_id: id,
        pending_request_id: snapshot.pending_request,
        operation_passed: passed,
        available_work,
        campaign: snapshot.state,
        progress,
    }
}

fn reconstruct(
    entries: &[Entry<Record>],
    mut object: impl FnMut(&str) -> Result<Event, String>,
) -> Result<Snapshot, String> {
    let genesis = entries
        .first()
        .ok_or("Expedition initialization is incomplete; repeat its init command.")?;
    let Payload::Genesis { name, ambition } = &genesis.event.payload else {
        return Err("Journal must begin with an expedition genesis.".into());
    };
    if genesis.revision != 0
        || genesis.previous_hash.is_some()
        || genesis.schema != JOURNAL_SCHEMA
        || genesis.event.request_id != "init"
        || genesis.event.expected_revision.is_some()
        || genesis.event.command_hash != artifact_hash(&genesis.event.payload)?
    {
        return Err("Genesis identity or revision is invalid.".into());
    }
    let mut snapshot = Snapshot {
        state: expedition::new(name.clone(), *ambition)?,
        revision: 0,
        requests: BTreeMap::new(),
        pending_request: None,
    };
    let mut previous = artifact_hash(genesis)?;
    for (index, entry) in entries.iter().enumerate().skip(1) {
        if entry.schema != JOURNAL_SCHEMA
            || entry.revision != index as u64
            || entry.previous_hash.as_ref() != Some(&previous)
        {
            return Err("Journal revisions or chained identities disagree.".into());
        }
        request_id(&entry.event.request_id)?;
        let Payload::Game { event_hash } = &entry.event.payload else {
            return Err("A second genesis cannot reset an expedition.".into());
        };
        let event = object(event_hash)?;
        if artifact_hash(&event)? != *event_hash {
            return Err("Journal event object hash is invalid.".into());
        }
        match &event {
            Event::Grown { command }
            | Event::Frozen { command }
            | Event::Started { command, .. } => {
                if snapshot.requests.contains_key(&entry.event.request_id)
                    || entry.event.expected_revision != Some(snapshot.revision)
                    || entry.event.command_hash != artifact_hash(command)?
                {
                    return Err(
                        "A request was reused, changed, or committed against a stale revision."
                            .into(),
                    );
                }
                let completed = !matches!(&event, Event::Started { .. });
                snapshot.requests.insert(
                    entry.event.request_id.clone(),
                    Request {
                        hash: entry.event.command_hash.clone(),
                        expected: snapshot.revision,
                        last_revision: entry.revision,
                        completed,
                        passed: true,
                        trial: !completed,
                    },
                );
                if !completed {
                    snapshot.pending_request = Some(entry.event.request_id.clone());
                }
            }
            Event::Completed { receipt } => {
                if snapshot.pending_request.as_ref() != Some(&entry.event.request_id) {
                    return Err("Trial completion has no matching committed intent.".into());
                }
                let request = snapshot
                    .requests
                    .get_mut(&entry.event.request_id)
                    .ok_or("Missing pending request.")?;
                if request.completed
                    || entry.event.command_hash != request.hash
                    || entry.event.expected_revision != Some(request.expected)
                {
                    return Err("Trial completion changed its request binding.".into());
                }
                request.completed = true;
                request.last_revision = entry.revision;
                request.passed = receipt.passed();
                snapshot.pending_request = None;
            }
        }
        expedition::apply(&mut snapshot.state, &event)?;
        snapshot.revision = entry.revision;
        previous = artifact_hash(entry)?;
    }
    Ok(snapshot)
}

fn read_snapshot(store: &Store) -> Result<(Vec<Entry<Record>>, Snapshot), String> {
    if fs::symlink_metadata(store.root.join("import.json")).is_ok() {
        return Err("An interrupted import is pending; repeat import with the original bundle and destination.".into());
    }
    let entries = store.load::<Record>()?;
    let snapshot = reconstruct(&entries, |hash| store.object(hash))?;
    Ok((entries, snapshot))
}

fn snapshot_at(store: &Store, revision: u64) -> Result<Snapshot, String> {
    if fs::symlink_metadata(store.root.join("import.json")).is_ok() {
        return Err("An import is pending; repeat it before using this store.".into());
    }
    // Validate the complete immutable chain structurally, then replay the exact
    // response prefix once. The caller already replayed its starting history.
    let entries = store.load::<Record>()?;
    let end = usize::try_from(revision).map_err(problem)?;
    if end >= entries.len() {
        return Err("Committed response revision is missing.".into());
    }
    reconstruct(&entries[..=end], |hash| store.object(hash))
}

pub fn initialize(path: &Path, name: String, ambition: Ambition) -> Result<Report, String> {
    expedition::new(name.clone(), ambition)?;
    let payload = Payload::Genesis { name, ambition };
    let command_hash = artifact_hash(&payload)?;
    let store = Store::create(path, JOURNAL_SCHEMA)?;
    if fs::symlink_metadata(store.root.join("import.json")).is_ok() {
        return Err("An import is pending; repeat that import before using this store.".into());
    }
    let entries = store.load::<Record>()?;
    if let Some(genesis) = entries.first() {
        // Validate all committed history even when returning the original init.
        reconstruct(&entries, |hash| store.object(hash))?;
        if genesis.event.command_hash != command_hash {
            return Err("This expedition already exists with different initialization.".into());
        }
        return Ok(report(
            reconstruct(&entries[..1], |hash| store.object(hash))?,
            Some("init".into()),
            Some(true),
        ));
    }
    store.append(
        Record {
            request_id: "init".into(),
            command_hash,
            expected_revision: None,
            payload,
        },
        None,
    )?;
    Ok(report(
        snapshot_at(&store, 0)?,
        Some("init".into()),
        Some(true),
    ))
}

pub fn status(path: &Path) -> Result<Report, String> {
    let store = Store::open(path, JOURNAL_SCHEMA)?;
    Ok(report(read_snapshot(&store)?.1, None, None))
}

fn finish(store: &Store, snapshot: Snapshot, id: &str) -> Result<Report, String> {
    if snapshot.pending_request.as_deref() != Some(id) {
        return Err("Request ID does not name the pending trial.".into());
    }
    let pending = snapshot
        .state
        .pending
        .as_ref()
        .ok_or("No trial is pending.")?;
    let experiment = expedition::trial_experiment(&snapshot.state, &pending.command)?;
    if artifact_hash(&experiment)? != pending.experiment_hash {
        return Err("Recovered experiment differs from its committed intent.".into());
    }
    let receipt = check::make_receipt(&experiment)?;
    let passed = receipt.passed();
    let event = expedition::complete(&snapshot.state, receipt)?;
    let request = snapshot
        .requests
        .get(id)
        .ok_or("No committed request binding.")?;
    let event_hash = store.put(&event)?;
    let committed = store.append(
        Record {
            request_id: id.into(),
            command_hash: request.hash.clone(),
            expected_revision: Some(request.expected),
            payload: Payload::Game { event_hash },
        },
        Some(snapshot.revision),
    )?;
    Ok(report(
        snapshot_at(store, committed.revision)?,
        Some(id.into()),
        Some(passed),
    ))
}

pub fn act(path: &Path, command: Command, expected: u64, id: &str) -> Result<Report, String> {
    request_id(id)?;
    let store = Store::open(path, JOURNAL_SCHEMA)?;
    let (entries, snapshot) = read_snapshot(&store)?;
    let hash = artifact_hash(&command)?;
    if let Some(request) = snapshot.requests.get(id) {
        if request.hash != hash || request.expected != expected {
            return Err(
                "Request ID was already bound to different input or expected revision.".into(),
            );
        }
        if request.completed {
            let original = reconstruct(&entries[..=request.last_revision as usize], |hash| {
                store.object(hash)
            })?;
            return Ok(report(original, Some(id.into()), Some(request.passed)));
        }
        return finish(&store, snapshot, id);
    }
    if expected != snapshot.revision {
        return Err(format!(
            "Stale revision: expected {expected}, current {}.",
            snapshot.revision
        ));
    }
    let (event, experiment) = expedition::plan(&snapshot.state, &command)?;
    let event_hash = store.put(&event)?;
    let committed = store.append(
        Record {
            request_id: id.into(),
            command_hash: hash,
            expected_revision: Some(expected),
            payload: Payload::Game { event_hash },
        },
        Some(expected),
    )?;
    let next = snapshot_at(&store, committed.revision)?;
    if experiment.is_some() {
        finish(&store, next, id)
    } else {
        Ok(report(next, Some(id.into()), Some(true)))
    }
}

pub fn recover(path: &Path, expected: u64, id: &str) -> Result<Report, String> {
    request_id(id)?;
    let store = Store::open(path, JOURNAL_SCHEMA)?;
    let (entries, snapshot) = read_snapshot(&store)?;
    if let Some(request) = snapshot.requests.get(id) {
        // A retry of recovery uses the old pending revision (intent revision),
        // even if the outcome was committed before the caller received output.
        if request.trial && request.completed && expected == request.last_revision.saturating_sub(1)
        {
            let original = reconstruct(&entries[..=request.last_revision as usize], |hash| {
                store.object(hash)
            })?;
            return Ok(report(original, Some(id.into()), Some(request.passed)));
        }
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
        if let Payload::Game { event_hash } = &entry.event.payload {
            objects.insert(event_hash.clone(), store.object::<Event>(event_hash)?);
        }
    }
    let bundle = Bundle {
        schema: "platonik-expedition-bundle-v1".into(),
        entries,
        objects,
    };
    let mut bytes = serde_json::to_vec(&bundle).map_err(problem)?;
    bytes.push(b'\n');
    if bytes.len() as u64 > MAX_BUNDLE_BYTES {
        return Err("Export exceeds 64 MiB; preserve the original store. This valid local store may be larger than its export limit.".into());
    }
    Ok(bytes)
}

pub fn import(bundle: Bundle, path: &Path) -> Result<Report, String> {
    if bundle.schema != "platonik-expedition-bundle-v1"
        || bundle.entries.is_empty()
        || bundle.entries.len() > MAX_ENTRIES
        || bundle.objects.len() > MAX_ENTRIES
    {
        return Err("Invalid or oversized expedition bundle.".into());
    }
    let referenced: std::collections::BTreeSet<_> = bundle
        .entries
        .iter()
        .filter_map(|entry| match &entry.event.payload {
            Payload::Game { event_hash } => Some(event_hash.clone()),
            _ => None,
        })
        .collect();
    if referenced != bundle.objects.keys().cloned().collect() {
        return Err("Bundle objects do not exactly match the journal references.".into());
    }
    let verified = reconstruct(&bundle.entries, |hash| {
        bundle
            .objects
            .get(hash)
            .cloned()
            .ok_or_else(|| "Missing bundled object.".into())
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
                return Err("Import destination must be a new real directory.".into());
            }
            let marker = absolute.join("import.json");
            match fs::symlink_metadata(&marker) {
                Ok(_) => {
                    let pending: String =
                        serde_json::from_slice(&regular_bytes(&marker, 1024)?).map_err(problem)?;
                    if pending != import_hash {
                        return Err("Destination belongs to a different interrupted import.".into());
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    uncommitted_import_skeleton(&absolute)?;
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
    for object in bundle.objects.values() {
        store.put(object)?;
    }
    let committed = store.load::<Record>()?;
    if committed.len() > bundle.entries.len()
        || committed
            .iter()
            .zip(&bundle.entries)
            .any(|(actual, expected)| artifact_hash(actual).ok() != artifact_hash(expected).ok())
    {
        return Err("Interrupted import journal is not a prefix of the supplied bundle.".into());
    }
    for entry in bundle.entries {
        if entry.revision < committed.len() as u64 {
            continue;
        }
        let expected = entry.revision.checked_sub(1);
        store.append(entry.event, expected)?;
    }
    fs::remove_file(store.root.join("import.json")).map_err(problem)?;
    sync_directory(&store.root)?;
    // Imported snapshots are reconstructed, not trusted; this final read also
    // validates the bytes actually committed to the new store.
    let actual = read_snapshot(&store)?.1;
    if actual.state != verified.state || actual.revision != verified.revision {
        return Err("Imported journal did not reproduce its validated state.".into());
    }
    Ok(report(actual, None, None))
}

pub fn cases() -> Vec<&'static str> {
    expedition_fixtures::case_ids().to_vec()
}

pub fn case(id: &str) -> Result<platonik_core::model::Experiment, String> {
    expedition_fixtures::experiment(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::journal::NEXT_TEMP;
    use std::path::PathBuf;
    use std::process::{Command as ProcessCommand, Stdio};
    use std::sync::atomic::Ordering;
    use std::time::{Duration, Instant};

    fn grow_command(state: &Campaign) -> Command {
        Command::Grow {
            id: "fern-child".into(),
            name: "Fern child".into(),
            parent: "recovery".into(),
            program: state
                .creations
                .iter()
                .find(|creation| creation.id == "recovery")
                .unwrap()
                .program
                .clone(),
        }
    }

    #[test]
    #[ignore = "Subprocess helper for publication_boundary_interruptions_preserve_history"]
    fn publication_crash_child() {
        let path = PathBuf::from(std::env::var_os("PLATONIK_TEST_CRASH_STORE").unwrap());
        let state = status(&path).unwrap();
        act(&path, grow_command(&state.campaign), 0, "interrupted-grow").unwrap();
        panic!("The configured publication boundary was not reached");
    }

    #[test]
    fn publication_boundary_interruptions_preserve_history() {
        let directory = std::env::temp_dir().canonicalize().unwrap().join(format!(
            "platonik-publication-crash-{}-{}",
            std::process::id(),
            NEXT_TEMP.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&directory).unwrap();
        for (stage, expected_revision) in [("synced-temp", 0), ("linked-entry", 1)] {
            let path = directory.join(stage);
            let initial =
                initialize(&path, "Crash recovery camp".into(), Ambition::Resilient).unwrap();
            let genesis_path = path.join("journal/00000000000000000000.json");
            let genesis = fs::read(&genesis_path).unwrap();
            let mut child = ProcessCommand::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "expedition_store::tests::publication_crash_child",
                    "--ignored",
                ])
                .env("PLATONIK_TEST_CRASH_STORE", &path)
                .env("PLATONIK_TEST_CRASH_STAGE", stage)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .unwrap();
            let started = Instant::now();
            let exited = loop {
                if let Some(exited) = child.try_wait().unwrap() {
                    break exited;
                }
                if started.elapsed() > Duration::from_secs(15) {
                    child.kill().unwrap();
                    child.wait().unwrap();
                    panic!("Publication interruption subprocess timed out at {stage}");
                }
                std::thread::sleep(Duration::from_millis(10));
            };
            assert_eq!(
                exited.code(),
                Some(86),
                "Controlled interruption at {stage}"
            );
            assert_eq!(fs::read(&genesis_path).unwrap(), genesis);
            assert_eq!(status(&path).unwrap().revision, expected_revision);
            assert!(fs::read_dir(path.join("tmp")).unwrap().next().is_some());
            let command = grow_command(&initial.campaign);
            let completed = act(&path, command.clone(), 0, "interrupted-grow").unwrap();
            let retried = act(&path, command, 0, "interrupted-grow").unwrap();
            assert_eq!(completed.revision, 1);
            assert_eq!(
                completed.campaign.creations.len(),
                initial.campaign.creations.len() + 1
            );
            assert_eq!(
                serde_json::to_vec(&completed).unwrap(),
                serde_json::to_vec(&retried).unwrap()
            );
            assert_eq!(fs::read(&genesis_path).unwrap(), genesis);
        }
        fs::remove_dir_all(directory).unwrap();
    }
}
