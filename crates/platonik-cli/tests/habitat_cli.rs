use platonik_core::check::artifact_hash;
use platonik_core::continuation::Advance;
use platonik_core::model::Experiment;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Output, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT: AtomicU64 = AtomicU64::new(0);
struct Sandbox(PathBuf);
impl Sandbox {
    fn new() -> Self {
        let path = std::env::temp_dir().canonicalize().unwrap().join(format!(
            "platonik-habitat-cli-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        Self(path)
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
fn text(path: &Path) -> &str {
    path.to_str().unwrap()
}
fn spawn(args: &[&str], input: Option<&[u8]>) -> Child {
    let mut child = Command::new(env!("CARGO_BIN_EXE_platonik"))
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
    if let Some(input) = input {
        child.stdin.take().unwrap().write_all(input).unwrap();
    }
    child
}
fn cli(args: &[&str], input: Option<&[u8]>) -> Output {
    spawn(args, input).wait_with_output().unwrap()
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
fn measured(args: &[&str], input: Option<&[u8]>) -> (Value, u64) {
    let args: Vec<_> = std::iter::once("--metrics")
        .chain(args.iter().copied())
        .collect();
    let output = cli(&args, input);
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let metrics: Value = serde_json::from_slice(&output.stderr).unwrap();
    assert_eq!(metrics["schema"], "platonik-process-metrics-v1");
    (
        value(&output),
        metrics["engine_executions"].as_u64().unwrap(),
    )
}
fn experiment() -> Experiment {
    platonik_core::fixtures::experiment("ark-plan-b").unwrap()
}
fn init(path: &Path, experiment: &Experiment) -> Output {
    cli(
        &["habitat", "init", text(path), "-"],
        Some(&serde_json::to_vec(experiment).unwrap()),
    )
}
fn advance(path: &Path, until: u32, revision: u64, id: &str) -> Output {
    cli(
        &[
            "habitat",
            "advance",
            text(path),
            "--until",
            &until.to_string(),
            "--expect-revision",
            &revision.to_string(),
            "--request-id",
            id,
        ],
        None,
    )
}
fn journal(path: &Path) -> Vec<(PathBuf, Vec<u8>)> {
    let mut files: Vec<_> = fs::read_dir(path.join("journal"))
        .unwrap()
        .map(|file| file.unwrap().path())
        .collect();
    files.sort();
    files
        .into_iter()
        .map(|file| {
            let bytes = fs::read(&file).unwrap();
            (file, bytes)
        })
        .collect()
}

#[test]
fn continuous_state_costs_and_final_receipt_match_the_uninterrupted_run() {
    let sandbox = Sandbox::new();
    let path = sandbox.path("habitat");
    let exp = experiment();
    let first = success(init(&path, &exp));
    assert_eq!(first["revision"], 0);
    assert_eq!(first["tick"], 0);
    assert_eq!(first["phase"], "paused");
    assert_eq!(first["mission_passed"], false);
    let loading = first["costs"]["loading"].clone();
    let original_genesis = journal(&path);
    let mut revision = 0;
    let mut report = first;
    for tick in [5, 9, 49, 55] {
        let before = report["costs"]
            .as_object()
            .unwrap()
            .values()
            .map(|v| v.as_u64().unwrap())
            .sum::<u64>();
        report = success(advance(&path, tick, revision, &format!("through-{tick}")));
        revision += 2;
        assert_eq!(report["revision"], revision);
        assert_eq!(report["tick"], tick);
        assert_eq!(
            report["costs"]["loading"], loading,
            "Checkpointing must not reload or refill the world"
        );
        let work = report["costs"]
            .as_object()
            .unwrap()
            .values()
            .map(|v| v.as_u64().unwrap())
            .sum::<u64>();
        assert!(work > before);
        assert_eq!(report["remaining_fuel"].as_u64().unwrap() + work, exp.fuel);
        if tick == 5 {
            assert!(
                report["current_state"]["cells"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|c| c["id"] == 1)
                    .unwrap()["cargo"]
                    .is_object()
            );
        }
        if tick == 9 {
            assert!(
                !report["current_state"]["pending"]
                    .as_array()
                    .unwrap()
                    .is_empty()
            );
        }
        if tick == 49 {
            let keeper = report["current_state"]["cells"]
                .as_array()
                .unwrap()
                .iter()
                .find(|c| c["id"] == 3)
                .unwrap();
            assert_eq!(keeper["memory"][0], 1);
            assert!(
                keeper["inbox"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .all(Value::is_null)
            );
        }
        let read = success(cli(&["habitat", "status", text(&path)], None));
        assert_eq!(read["current_state"], report["current_state"]);
        assert_eq!(read["costs"], report["costs"]);
        assert_eq!(read["revision"], report["revision"]);
    }
    assert_eq!(report["phase"], "finished");
    assert_eq!(report["mission_passed"], true);
    assert_eq!(report["advances"], 4);
    let cold = success(cli(&["run", "-"], Some(&serde_json::to_vec(&exp).unwrap())));
    assert_eq!(report["result_hash"], cold["result_hash"]);
    assert_eq!(report["current_state"], cold["result"]["final_state"]);
    assert_eq!(report["costs"], cold["result"]["costs"]);
    for (file, bytes) in original_genesis {
        assert_eq!(fs::read(file).unwrap(), bytes);
    }
    let exported = cli(&["habitat", "export", text(&path)], None);
    assert!(exported.status.success());
    let restored = sandbox.path("restored");
    let restored_report = success(cli(
        &["habitat", "import", "-", text(&restored)],
        Some(&exported.stdout),
    ));
    assert_eq!(
        restored_report,
        success(cli(&["habitat", "verify", text(&path)], None))
    );
    assert_eq!(
        cli(&["habitat", "export", text(&restored)], None).stdout,
        exported.stdout
    );
}

#[derive(Clone, Serialize, Deserialize)]
struct Bundle {
    schema: String,
    entries: Vec<Entry>,
    objects: BTreeMap<String, Event>,
}
#[derive(Clone, Serialize, Deserialize)]
struct Entry {
    schema: String,
    revision: u64,
    previous_hash: Option<String>,
    event: Record,
}
#[derive(Clone, Serialize, Deserialize)]
struct Record {
    request_id: String,
    command_hash: String,
    expected_revision: Option<u64>,
    event_hash: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Event {
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

#[test]
fn pending_advance_recovers_exactly_once_and_retries_return_original_state() {
    let sandbox = Sandbox::new();
    let source = sandbox.path("complete");
    success(init(&source, &experiment()));
    let original = success(advance(&source, 20, 0, "interrupted"));
    let output = cli(&["habitat", "export", text(&source)], None);
    assert!(output.status.success());
    let mut bundle: Bundle = serde_json::from_slice(&output.stdout).unwrap();
    let completion = bundle.entries.pop().unwrap();
    let orphan = bundle.objects.remove(&completion.event.event_hash).unwrap();
    let pending = sandbox.path("pending");
    let before = success(cli(
        &["habitat", "import", "-", text(&pending)],
        Some(&serde_json::to_vec(&bundle).unwrap()),
    ));
    assert_eq!(before["revision"], 1);
    assert_eq!(before["tick"], 0);
    assert_eq!(before["pending_request_id"], "interrupted");
    assert_eq!(before["pending_until"], 20);
    assert!(before["pending_reserved_work"].as_u64().unwrap() > 0);
    fs::write(pending.join("tmp/partial.part"), b"{partial").unwrap();
    fs::write(
        pending.join("objects").join(format!(
            "{}.json",
            completion.event.event_hash.strip_prefix("sha256:").unwrap()
        )),
        serde_json::to_vec(&orphan).unwrap(),
    )
    .unwrap();
    let recovered = success(cli(
        &[
            "habitat",
            "recover",
            text(&pending),
            "--expect-revision",
            "1",
            "--request-id",
            "interrupted",
        ],
        None,
    ));
    assert_eq!(recovered, original);
    success(advance(&pending, 55, 2, "finish"));
    assert_eq!(value(&advance(&pending, 20, 0, "interrupted")), original);
    assert_eq!(
        success(cli(
            &[
                "habitat",
                "recover",
                text(&pending),
                "--expect-revision",
                "1",
                "--request-id",
                "interrupted"
            ],
            None
        )),
        original
    );
    let history = journal(&pending);
    assert_eq!(
        advance(&pending, 21, 0, "interrupted").status.code(),
        Some(2)
    );
    assert_eq!(advance(&pending, 55, 0, "stale").status.code(), Some(2));
    assert_eq!(journal(&pending), history);
}

#[test]
fn rehashed_caller_state_is_rejected_and_store_formats_cannot_be_mixed() {
    let sandbox = Sandbox::new();
    let source = sandbox.path("source");
    success(init(&source, &experiment()));
    let output = cli(&["habitat", "export", text(&source)], None);
    assert!(output.status.success());
    let mut bundle: Bundle = serde_json::from_slice(&output.stdout).unwrap();
    let original_hash = bundle.entries[0].event.event_hash.clone();
    let mut event = bundle.objects.remove(&original_hash).unwrap();
    let Event::Initialized { result, .. } = &mut event else {
        panic!("Expected genesis")
    };
    let Advance::Paused(checkpoint) = result.as_mut() else {
        panic!("Expected checkpoint")
    };
    checkpoint.frames[0].state.cells[0].memory[0] = 1;
    checkpoint.prefix_hash = artifact_hash(&checkpoint.frames).unwrap();
    let new_hash = artifact_hash(&event).unwrap();
    bundle.entries[0].event.event_hash = new_hash.clone();
    bundle.objects.insert(new_hash, event);
    let rejected = sandbox.path("forged");
    let forged = cli(
        &["habitat", "import", "-", text(&rejected)],
        Some(&serde_json::to_vec(&bundle).unwrap()),
    );
    assert_eq!(forged.status.code(), Some(2));
    assert!(
        !rejected.exists(),
        "Import must verify before creating the destination"
    );
    let legacy = sandbox.path("expedition");
    success(cli(
        &["expedition", "init", text(&legacy), "Preserved", "frugal"],
        None,
    ));
    let old = cli(&["expedition", "export", text(&legacy)], None);
    assert!(old.status.success());
    assert_eq!(
        cli(&["habitat", "status", text(&legacy)], None)
            .status
            .code(),
        Some(2)
    );
    assert_eq!(
        cli(&["expedition", "status", text(&source)], None)
            .status
            .code(),
        Some(2)
    );
    assert_eq!(
        cli(
            &[
                "habitat",
                "import",
                "-",
                text(&sandbox.path("wrong-format"))
            ],
            Some(&old.stdout)
        )
        .status
        .code(),
        Some(2)
    );
    assert_eq!(
        cli(&["expedition", "export", text(&legacy)], None).stdout,
        old.stdout
    );
}

#[test]
fn advance_limits_and_terminal_loading_failure_do_not_refill_or_reset_state() {
    let sandbox = Sandbox::new();
    let path = sandbox.path("limited");
    let exp = experiment();
    let (initialized, initialization_executions) = measured(
        &["habitat", "init", text(&path), "-"],
        Some(&serde_json::to_vec(&exp).unwrap()),
    );
    let mut observed_executions = Vec::new();
    for tick in 1..=8 {
        let (_, executions) = measured(
            &[
                "habitat",
                "advance",
                text(&path),
                "--until",
                &tick.to_string(),
                "--expect-revision",
                &((tick as u64 - 1) * 2).to_string(),
                "--request-id",
                &format!("step-{tick}"),
            ],
            None,
        );
        assert!(
            executions > 0,
            "Continuation must account for real execution and replay"
        );
        observed_executions.push(executions);
    }
    eprintln!(
        "HABITAT_EXECUTION_DIAGNOSTIC init={initialization_executions} advances={observed_executions:?} total={}",
        initialization_executions + observed_executions.iter().sum::<u64>()
    );
    let before = journal(&path);
    assert_eq!(advance(&path, 9, 16, "ninth").status.code(), Some(2));
    assert_eq!(advance(&path, 8, 16, "same-tick").status.code(), Some(2));
    assert_eq!(
        advance(&path, 56, 16, "past-horizon").status.code(),
        Some(2)
    );
    assert_eq!(journal(&path), before);
    assert_eq!(
        value(&init(&path, &exp)),
        initialized,
        "Exact init retry returns original tick zero"
    );
    let failed_path = sandbox.path("no-fuel");
    let mut exhausted = exp;
    exhausted.fuel = 0;
    let failed = init(&failed_path, &exhausted);
    assert_eq!(failed.status.code(), Some(1));
    let terminal = value(&failed);
    assert_eq!(terminal["phase"], "finished");
    assert_eq!(terminal["tick"], 0);
    assert_eq!(terminal["run_status"], "fuel_exhausted");
    assert_eq!(terminal["remaining_fuel"], 0);
    let before = journal(&failed_path);
    assert_eq!(advance(&failed_path, 1, 0, "refill").status.code(), Some(2));
    let verified = success(cli(&["habitat", "verify", text(&failed_path)], None));
    assert_eq!(verified["mission_passed"], false);
    assert_eq!(journal(&failed_path), before);
}

#[test]
fn competing_advances_commit_only_one_physical_continuation() {
    let sandbox = Sandbox::new();
    let path = sandbox.path("concurrent");
    success(init(&path, &experiment()));
    let genesis = journal(&path);
    let children: Vec<_> = [("5", "first"), ("9", "second")]
        .into_iter()
        .map(|(until, id)| {
            spawn(
                &[
                    "habitat",
                    "advance",
                    text(&path),
                    "--until",
                    until,
                    "--expect-revision",
                    "0",
                    "--request-id",
                    id,
                ],
                None,
            )
        })
        .collect();
    let outputs: Vec<_> = children
        .into_iter()
        .map(|child| child.wait_with_output().unwrap())
        .collect();
    assert_eq!(
        outputs
            .iter()
            .filter(|output| output.status.success())
            .count(),
        1
    );
    assert_eq!(
        outputs
            .iter()
            .filter(|output| output.status.code() == Some(2))
            .count(),
        1
    );
    let winner = value(
        outputs
            .iter()
            .find(|output| output.status.success())
            .unwrap(),
    );
    let checked = success(cli(&["habitat", "verify", text(&path)], None));
    assert_eq!(checked["revision"], 2);
    assert_eq!(checked["advances"], 1);
    assert_eq!(checked["current_state"], winner["current_state"]);
    assert_eq!(checked["last_result_hash"], winner["last_result_hash"]);
    for (file, bytes) in genesis {
        assert_eq!(fs::read(file).unwrap(), bytes);
    }
}

#[test]
fn prepare_uses_a_verified_frozen_pair_without_changing_its_collection() {
    let sandbox = Sandbox::new();
    let source = sandbox.path("collection");
    let initialized = success(cli(
        &[
            "expedition",
            "init",
            text(&source),
            "Carry our companions",
            "frugal",
        ],
        None,
    ));
    assert_eq!(
        cli(&["habitat", "prepare", "changing-one", text(&source)], None)
            .status
            .code(),
        Some(2)
    );
    let mut revision = 0;
    for (index, case_id) in [
        "opening-normal",
        "opening-collapse",
        "ark-plan-a",
        "ark-plan-b",
    ]
    .iter()
    .enumerate()
    {
        let action =
            json!({"kind":"trial","case_id":case_id,"courier":"recovery","controller":"memory"});
        success(cli(
            &[
                "expedition",
                "act",
                text(&source),
                "-",
                "--expect-revision",
                &revision.to_string(),
                "--request-id",
                &format!("training-{index}"),
            ],
            Some(&serde_json::to_vec(&action).unwrap()),
        ));
        revision += 2;
    }
    success(cli(
        &[
            "expedition",
            "act",
            text(&source),
            "-",
            "--expect-revision",
            "8",
            "--request-id",
            "freeze",
        ],
        Some(br#"{"kind":"freeze","courier":"recovery","controller":"memory"}"#),
    ));
    let before = journal(&source);
    let prepared = success(cli(
        &["habitat", "prepare", "changing-one", text(&source)],
        None,
    ));
    let mut expected = success(cli(&["habitat", "case", "changing-one"], None));
    for (cell_id, creation_id) in [(1, "recovery"), (3, "memory")] {
        let creation = initialized["campaign"]["creations"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["id"] == creation_id)
            .unwrap();
        let cell = expected["cells"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .find(|cell| cell["id"] == cell_id)
            .unwrap();
        cell["program"] = creation["program"].clone();
    }
    assert_eq!(prepared, expected);
    assert_eq!(journal(&source), before);
}
