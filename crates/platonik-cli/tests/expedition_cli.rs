use serde_json::{Value, json};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Output, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT: AtomicU64 = AtomicU64::new(0);

struct Sandbox(PathBuf);
impl Sandbox {
    fn new() -> Self {
        let root = std::env::temp_dir().canonicalize().unwrap().join(format!(
            "platonik-expedition-test-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&root).unwrap();
        Self(root)
    }
    fn path(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}
impl Drop for Sandbox {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn spawn(args: &[&str], input: Option<&[u8]>) -> Child {
    let mut child = Command::new(env!("CARGO_BIN_EXE_platonik"))
        .env("HRANESS_SUPPORT", "off")
        .arg("expedition")
        .args(args)
        .stdin(if input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    if let Some(bytes) = input {
        child.stdin.take().unwrap().write_all(bytes).unwrap();
    }
    child
}
fn cli(args: &[&str], input: Option<&[u8]>) -> Output {
    spawn(args, input).wait_with_output().unwrap()
}
fn text(path: &Path) -> &str {
    path.to_str().unwrap()
}
fn value(output: &Output) -> Value {
    serde_json::from_slice(&output.stdout)
        .unwrap_or_else(|error| panic!("{error}: {}", String::from_utf8_lossy(&output.stderr)))
}
fn success(output: Output) -> Value {
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    value(&output)
}
fn init(path: &Path) -> Value {
    success(cli(&["init", text(path), "First camp", "resilient"], None))
}
fn trial(case_id: &str, courier: &str) -> Value {
    json!({"kind":"trial","case_id":case_id,"courier":courier,"controller":"memory"})
}
fn act(path: &Path, command: &Value, revision: u64, id: &str) -> Output {
    cli(
        &[
            "act",
            text(path),
            "-",
            "--expect-revision",
            &revision.to_string(),
            "--request-id",
            id,
        ],
        Some(&serde_json::to_vec(command).unwrap()),
    )
}
fn journal(path: &Path) -> Vec<(PathBuf, Vec<u8>)> {
    let mut files: Vec<_> = fs::read_dir(path.join("journal"))
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .collect();
    files.sort();
    files
        .into_iter()
        .map(|path| {
            let bytes = fs::read(&path).unwrap();
            (path, bytes)
        })
        .collect()
}

#[test]
fn failed_trials_are_charged_and_exact_retries_return_the_original_revision() {
    let sandbox = Sandbox::new();
    let path = sandbox.path("camp");
    let parent = success(cli(&["init", text(&path), "First camp", "frugal"], None));
    assert_eq!(parent["revision"], 0);
    let genesis = journal(&path);
    let command = trial("opening-collapse", "compact");
    let first = act(&path, &command, 0, "trial-one");
    assert_eq!(
        first.status.code(),
        Some(1),
        "{}",
        String::from_utf8_lossy(&first.stderr)
    );
    let failed = value(&first);
    assert_eq!(failed["revision"], 2);
    assert_eq!(failed["campaign"]["trials"][0]["passed"], false);
    assert!(failed["campaign"]["work"].as_u64().unwrap() > 0);
    assert!(failed["available_work"].as_u64().unwrap() < 1_000_000);
    assert_eq!(
        failed["campaign"]["creations"],
        parent["campaign"]["creations"]
    );
    for (file, bytes) in genesis {
        assert_eq!(fs::read(file).unwrap(), bytes);
    }

    let second = act(&path, &trial("opening-normal", "recovery"), 2, "trial-two");
    assert!(
        second.status.success(),
        "{}",
        String::from_utf8_lossy(&second.stderr)
    );
    let retry = act(&path, &command, 0, "trial-one");
    assert_eq!(retry.status.code(), Some(1));
    assert_eq!(
        retry.stdout, first.stdout,
        "Retry returns the original response, not newer campaign state"
    );
    let current = success(cli(&["status", text(&path)], None));
    assert_eq!(current["revision"], 4);
    assert_eq!(current["campaign"]["trials"].as_array().unwrap().len(), 2);
    let before = journal(&path);
    for output in [
        act(&path, &command, 0, "new-stale-id"),
        act(&path, &trial("opening-normal", "compact"), 0, "trial-one"),
    ] {
        assert_eq!(output.status.code(), Some(2));
        assert!(output.stdout.is_empty());
    }
    assert_eq!(journal(&path), before);
}

#[test]
fn growth_preserves_parent_and_concurrent_writers_cannot_share_a_revision() {
    let sandbox = Sandbox::new();
    let path = sandbox.path("camp");
    let initialized = init(&path);
    let program = initialized["campaign"]["creations"]
        .as_array()
        .unwrap()
        .iter()
        .find(|creation| creation["id"] == "recovery")
        .unwrap()["program"]
        .clone();
    let commands: Vec<_> = ["child-one", "child-two"]
        .into_iter()
        .map(|id| json!({"kind":"grow","id":id,"name":id,"parent":"compact","program":program}))
        .collect();
    let first = spawn(
        &[
            "act",
            text(&path),
            "-",
            "--expect-revision",
            "0",
            "--request-id",
            "grow-one",
        ],
        Some(&serde_json::to_vec(&commands[0]).unwrap()),
    );
    let second = spawn(
        &[
            "act",
            text(&path),
            "-",
            "--expect-revision",
            "0",
            "--request-id",
            "grow-two",
        ],
        Some(&serde_json::to_vec(&commands[1]).unwrap()),
    );
    let results = [
        first.wait_with_output().unwrap(),
        second.wait_with_output().unwrap(),
    ];
    assert_eq!(
        results
            .iter()
            .filter(|output| output.status.success())
            .count(),
        1
    );
    assert_eq!(
        results
            .iter()
            .filter(|output| output.status.code() == Some(2))
            .count(),
        1
    );
    let state = success(cli(&["verify", text(&path)], None));
    assert_eq!(state["revision"], 1);
    let creations = state["campaign"]["creations"].as_array().unwrap();
    assert_eq!(creations.len(), 6);
    assert_eq!(
        creations
            .iter()
            .find(|creation| creation["id"] == "compact")
            .unwrap(),
        &initialized["campaign"]["creations"][0]
    );
    assert_eq!(creations.last().unwrap()["parent"], "compact");
}

#[test]
fn interrupted_intent_and_orphan_objects_recover_without_a_second_trial_debit() {
    let sandbox = Sandbox::new();
    let original = sandbox.path("complete");
    let pending = sandbox.path("interrupted");
    init(&original);
    let command = trial("opening-normal", "recovery");
    let finished = success(act(&original, &command, 0, "recover-me"));
    let export = cli(&["export", text(&original)], None);
    assert!(export.status.success());
    let mut bundle: platonik_core_bundle::Bundle = serde_json::from_slice(&export.stdout).unwrap();
    let completion = bundle.entries.pop().unwrap();
    let object_hash = completion.event.payload.event_hash().unwrap().to_string();
    let orphan = bundle.objects.remove(&object_hash).unwrap();
    let bytes = serde_json::to_vec(&bundle).unwrap();
    let imported = success(cli(&["import", "-", text(&pending)], Some(&bytes)));
    assert_eq!(imported["revision"], 1);
    assert!(imported["campaign"]["pending"].is_object());
    assert_eq!(imported["pending_request_id"], "recover-me");
    assert_eq!(imported["campaign"]["work"], 0);
    fs::write(pending.join("tmp").join("interrupted.part"), b"{incomplete").unwrap();
    fs::write(
        pending.join("objects").join(format!(
            "{}.json",
            object_hash.strip_prefix("sha256:").unwrap()
        )),
        serde_json::to_vec(&orphan).unwrap(),
    )
    .unwrap();
    let recovered = cli(
        &[
            "recover",
            text(&pending),
            "--expect-revision",
            "1",
            "--request-id",
            "recover-me",
        ],
        None,
    );
    let state = success(recovered);
    assert_eq!(state["campaign"], finished["campaign"]);
    assert_eq!(state["revision"], 2);
    assert!(state["pending_request_id"].is_null());
    assert_eq!(state["campaign"]["trials"].as_array().unwrap().len(), 1);
    let again = success(cli(
        &[
            "recover",
            text(&pending),
            "--expect-revision",
            "1",
            "--request-id",
            "recover-me",
        ],
        None,
    ));
    assert_eq!(again, state);
    assert_eq!(value(&act(&pending, &command, 0, "recover-me")), state);
}

// Match the public bundle representation with typed core Event values. Using
// serde_json::Value for an Event would change its canonical struct-field order.
mod platonik_core_bundle {
    use platonik_core::expedition::{Ambition, Event};
    use serde::{Deserialize, Serialize};
    use std::collections::BTreeMap;
    #[derive(Deserialize, Serialize)]
    pub struct Bundle {
        pub schema: String,
        pub entries: Vec<Entry>,
        pub objects: BTreeMap<String, Event>,
    }
    #[derive(Deserialize, Serialize)]
    pub struct Entry {
        pub schema: String,
        pub revision: u64,
        pub previous_hash: Option<String>,
        pub event: Record,
    }
    #[derive(Deserialize, Serialize)]
    pub struct Record {
        pub request_id: String,
        pub command_hash: String,
        pub expected_revision: Option<u64>,
        pub payload: Payload,
    }
    #[derive(Deserialize, Serialize)]
    #[serde(tag = "kind", rename_all = "snake_case")]
    pub enum Payload {
        Genesis { name: String, ambition: Ambition },
        Game { event_hash: String },
    }
    impl Payload {
        pub fn event_hash(&self) -> Option<&str> {
            match self {
                Self::Game { event_hash } => Some(event_hash),
                _ => None,
            }
        }
    }
}

#[test]
fn export_round_trip_is_replayed_and_existing_destinations_are_preserved() {
    let sandbox = Sandbox::new();
    let original = sandbox.path("original");
    let copy = sandbox.path("copy");
    init(&original);
    success(act(
        &original,
        &trial("opening-normal", "recovery"),
        0,
        "trial-one",
    ));
    let export = cli(&["export", text(&original)], None);
    assert!(export.status.success());
    let imported = success(cli(&["import", "-", text(&copy)], Some(&export.stdout)));
    assert_eq!(imported, success(cli(&["verify", text(&original)], None)));
    assert_eq!(cli(&["export", text(&copy)], None).stdout, export.stdout);
    let before = journal(&copy);
    let blocked = cli(&["import", "-", text(&copy)], Some(&export.stdout));
    assert_eq!(blocked.status.code(), Some(2));
    assert_eq!(journal(&copy), before);
    let mut corrupt: Value = serde_json::from_slice(&export.stdout).unwrap();
    corrupt["entries"][1]["event"]["command_hash"] = json!("sha256:bad");
    let rejected = sandbox.path("rejected");
    let result = cli(
        &["import", "-", text(&rejected)],
        Some(&serde_json::to_vec(&corrupt).unwrap()),
    );
    assert_eq!(result.status.code(), Some(2));
    assert!(!rejected.exists());
}

#[test]
fn committed_gaps_corruption_and_unrelated_directories_are_rejected() {
    let sandbox = Sandbox::new();
    let path = sandbox.path("camp");
    init(&path);
    success(act(
        &path,
        &trial("opening-normal", "recovery"),
        0,
        "trial-one",
    ));
    let records = journal(&path);
    fs::remove_file(&records[1].0).unwrap();
    assert_eq!(cli(&["status", text(&path)], None).status.code(), Some(2));
    fs::write(&records[1].0, &records[1].1).unwrap();
    let mut corrupted = records[2].1.clone();
    corrupted.push(b' ');
    fs::write(&records[2].0, corrupted).unwrap();
    assert_eq!(cli(&["verify", text(&path)], None).status.code(), Some(2));
    let unrelated = sandbox.path("unrelated");
    fs::create_dir(&unrelated).unwrap();
    fs::write(unrelated.join("keep.txt"), b"preserved").unwrap();
    assert_eq!(
        cli(&["init", text(&unrelated), "test", "frugal"], None)
            .status
            .code(),
        Some(2)
    );
    assert_eq!(fs::read(unrelated.join("keep.txt")).unwrap(), b"preserved");
    assert!(!unrelated.join("journal").exists());
}

#[test]
fn import_recovers_each_pre_marker_boundary_without_adopting_existing_data() {
    let sandbox = Sandbox::new();
    let original = sandbox.path("original");
    init(&original);
    let exported = cli(&["export", text(&original)], None);
    assert!(exported.status.success());
    for count in 0..=4 {
        let destination = sandbox.path(&format!("interrupted-{count}"));
        fs::create_dir(&destination).unwrap();
        for name in ["journal", "objects", "tmp"].iter().take(count) {
            fs::create_dir(destination.join(name)).unwrap();
        }
        if count == 4 {
            fs::write(destination.join("tmp/123-0.part"), b"\"sha256:partial").unwrap();
        }
        success(cli(
            &["import", "-", text(&destination)],
            Some(&exported.stdout),
        ));
        assert_eq!(
            cli(&["export", text(&destination)], None).stdout,
            exported.stdout
        );
        if count == 4 {
            assert_eq!(
                fs::read(destination.join("tmp/123-0.part")).unwrap(),
                b"\"sha256:partial"
            );
        }
    }
    let unrelated = sandbox.path("occupied");
    fs::create_dir(&unrelated).unwrap();
    fs::create_dir(unrelated.join("objects")).unwrap();
    fs::write(unrelated.join("objects/keep.json"), b"keep").unwrap();
    let blocked = cli(&["import", "-", text(&unrelated)], Some(&exported.stdout));
    assert_eq!(blocked.status.code(), Some(2));
    assert_eq!(
        fs::read(unrelated.join("objects/keep.json")).unwrap(),
        b"keep"
    );
    assert!(!unrelated.join("journal").exists());
}

#[test]
fn explicit_metrics_count_replay_and_are_emitted_after_errors() {
    let sandbox = Sandbox::new();
    let path = sandbox.path("camp");
    init(&path);
    success(act(
        &path,
        &trial("opening-normal", "recovery"),
        0,
        "counted",
    ));
    let plain = cli(&["status", text(&path)], None);
    assert!(plain.stderr.is_empty());
    let measured = Command::new(env!("CARGO_BIN_EXE_platonik"))
        .env("HRANESS_SUPPORT", "off")
        .args(["--metrics", "expedition", "status", text(&path)])
        .output()
        .unwrap();
    assert!(measured.status.success());
    assert_eq!(measured.stdout, plain.stdout);
    let metrics: Value = serde_json::from_slice(&measured.stderr).unwrap();
    assert_eq!(metrics["schema"], "platonik-process-metrics-v1");
    assert_eq!(
        metrics["engine_executions"], 1,
        "A status query must count its actual historical receipt replay"
    );
    assert!(metrics["elapsed_micros"].as_u64().unwrap() > 0);
    let invalid = Command::new(env!("CARGO_BIN_EXE_platonik"))
        .env("HRANESS_SUPPORT", "off")
        .args(["--metrics", "expedition", "unknown"])
        .output()
        .unwrap();
    assert_eq!(invalid.status.code(), Some(2));
    assert!(invalid.stdout.is_empty());
    let records: Vec<Value> = String::from_utf8(invalid.stderr)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert_eq!(records.len(), 2);
    assert_eq!(records[0]["schema"], "platonik-error-v1");
    assert_eq!(records[1]["schema"], "platonik-process-metrics-v1");
    assert_eq!(records[1]["engine_executions"], 0);
}

#[test]
fn published_field_walkthrough_finishes_and_restores_with_its_failed_parent() {
    // Post-study documentation regression: run the exact committed action files,
    // not reconstructed copies of their policies or extra optimization candidates.
    let repository = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let guide = fs::read_to_string(repository.join("docs/field-expedition.md")).unwrap();
    let sandbox = Sandbox::new();
    let original = sandbox.path("first-camp");
    let initial = success(cli(
        &["init", text(&original), "First camp", "frugal"],
        None,
    ));
    let initial_creations = initial["campaign"]["creations"].as_array().unwrap();
    assert_eq!(initial["revision"], 0);
    for (file, expected, request, exit, revision) in [
        ("try-moth.json", 0, "moth-crossing", 1, 2),
        ("grow-moth.json", 2, "grow-moth", 0, 3),
        ("cross-with-child.json", 3, "child-crossing", 0, 5),
        ("calm-with-child.json", 5, "calm-child", 0, 7),
        ("plan-a-with-child.json", 7, "plan-a-child", 0, 9),
        ("plan-b-with-child.json", 9, "plan-b-child", 0, 11),
        ("freeze-child.json", 11, "freeze-child", 0, 12),
        ("confirm-early.json", 12, "confirm-early", 0, 14),
        ("confirm-reversed.json", 14, "confirm-reversed", 0, 16),
        ("confirm-delay-a.json", 16, "confirm-delay-a", 0, 18),
        ("confirm-delay-b.json", 18, "confirm-delay-b", 0, 20),
    ] {
        let documented = format!(
            "./target/release/platonik expedition act first-camp fixtures/expedition/{file} --expect-revision {expected} --request-id {request}"
        );
        assert!(
            guide.contains(&documented),
            "Guide action drifted: {documented}"
        );
        let input = repository.join("fixtures/expedition").join(file);
        let input_before = fs::read(&input).unwrap();
        let output = cli(
            &[
                "act",
                text(&original),
                text(&input),
                "--expect-revision",
                &expected.to_string(),
                "--request-id",
                request,
            ],
            None,
        );
        assert_eq!(
            output.status.code(),
            Some(exit),
            "{file}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let report = value(&output);
        assert_eq!(report["revision"], revision, "Revision after {file}");
        assert_eq!(report["campaign"]["trials"][0]["passed"], false);
        let creations = report["campaign"]["creations"].as_array().unwrap();
        for parent in initial_creations {
            assert_eq!(
                creations
                    .iter()
                    .find(|creation| creation["id"] == parent["id"])
                    .unwrap(),
                parent
            );
        }
        assert_eq!(
            fs::read(&input).unwrap(),
            input_before,
            "Action file was modified"
        );
    }
    let verified = success(cli(&["verify", text(&original)], None));
    assert_eq!(verified["revision"], 20);
    assert_eq!(verified["progress"]["field_expedition_complete"], true);
    assert!(
        verified["progress"]["reply"]
            .as_str()
            .is_some_and(|reply| !reply.is_empty())
    );
    let trials = verified["campaign"]["trials"].as_array().unwrap();
    assert_eq!(trials.len(), 9);
    assert_eq!(trials[0]["passed"], false);
    assert!(trials[0]["work"].as_u64().unwrap() > 0);
    assert!(trials[1..].iter().all(|trial| trial["passed"] == true));
    assert_eq!(
        verified["campaign"]["creations"].as_array().unwrap().len(),
        6
    );

    let exported = cli(&["export", text(&original)], None);
    assert!(
        exported.status.success(),
        "{}",
        String::from_utf8_lossy(&exported.stderr)
    );
    let export_file = sandbox.path("first-camp.bundle.json");
    fs::write(&export_file, &exported.stdout).unwrap();
    let restored = sandbox.path("restored-first-camp");
    let imported = success(cli(&["import", text(&export_file), text(&restored)], None));
    assert_eq!(imported, verified);
    assert_eq!(success(cli(&["verify", text(&restored)], None)), verified);
    assert_eq!(fs::read(&export_file).unwrap(), exported.stdout);
}

#[cfg(unix)]
#[test]
fn symlink_store_paths_and_nonregular_objects_are_rejected() {
    use std::os::unix::fs::symlink;
    let sandbox = Sandbox::new();
    let path = sandbox.path("camp");
    init(&path);
    let link = sandbox.path("alias");
    symlink(&path, &link).unwrap();
    assert_eq!(cli(&["status", text(&link)], None).status.code(), Some(2));
    symlink(
        path.join("journal/00000000000000000000.json"),
        path.join("objects/linked.json"),
    )
    .unwrap();
    assert_eq!(cli(&["verify", text(&path)], None).status.code(), Some(2));
}
