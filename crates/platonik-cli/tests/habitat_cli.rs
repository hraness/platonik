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
        .env("HRANESS_SUPPORT", "off")
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
thread_local! {
    // Only explicitly scoped ports tests collect subprocess telemetry. Older
    // tests keep their original argv and stderr behavior.
    static PORTS_EXECUTIONS: std::cell::Cell<Option<u64>> = const { std::cell::Cell::new(None) };
}
struct PortsExecutions;
impl PortsExecutions {
    fn start() -> Self {
        PORTS_EXECUTIONS.with(|count| assert!(count.replace(Some(0)).is_none()));
        Self
    }
}
impl Drop for PortsExecutions {
    fn drop(&mut self) {
        let executions = PORTS_EXECUTIONS.with(|count| count.take().unwrap());
        eprintln!(
            "{}",
            json!({
                "schema": "platonik-cli-test-metrics-v1",
                "test": std::thread::current().name(),
                "engine_executions": executions,
            })
        );
    }
}
fn cli(args: &[&str], input: Option<&[u8]>) -> Output {
    let collect = PORTS_EXECUTIONS.with(|count| count.get().is_some());
    let explicit_metrics = args.first() == Some(&"--metrics");
    let effective: Vec<_> = std::iter::once("--metrics")
        .filter(|_| collect && !explicit_metrics)
        .chain(args.iter().copied())
        .collect();
    let mut output = spawn(&effective, input).wait_with_output().unwrap();
    if collect {
        let stderr = std::mem::take(&mut output.stderr);
        let mut count = None;
        for line in stderr.split_inclusive(|byte| *byte == b'\n') {
            let metric = serde_json::from_slice::<Value>(line)
                .ok()
                .filter(|value| value["schema"] == "platonik-process-metrics-v1");
            if let Some(metric) = metric {
                assert!(
                    count
                        .replace(metric["engine_executions"].as_u64().unwrap())
                        .is_none()
                );
                if explicit_metrics {
                    output.stderr.extend_from_slice(line);
                }
            } else {
                output.stderr.extend_from_slice(line);
            }
        }
        let executions =
            count.expect("Every ports-test subprocess must report actual engine executions");
        PORTS_EXECUTIONS.with(|count| count.set(Some(count.get().unwrap() + executions)));
    }
    output
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
    let constructed = success(cli(
        &["habitat", "prepare", "construction-one", text(&source)],
        None,
    ));
    let courier = constructed["cells"]
        .as_array()
        .unwrap()
        .iter()
        .find(|cell| cell["id"] == 1)
        .unwrap();
    assert_eq!(
        courier["program"],
        expected["cells"]
            .as_array()
            .unwrap()
            .iter()
            .find(|cell| cell["id"] == 1)
            .unwrap()["program"]
    );
    assert_eq!(
        constructed["construction"]["blueprints"][0]["body"]["cell"]["program"],
        expected["cells"]
            .as_array()
            .unwrap()
            .iter()
            .find(|cell| cell["id"] == 3)
            .unwrap()["program"]
    );
    assert!(
        constructed["cells"]
            .as_array()
            .unwrap()
            .iter()
            .all(|cell| cell["id"] != 3)
    );
    assert_eq!(journal(&source), before);
}

#[test]
fn construction_case_exports_preserve_the_inherited_programs_without_running_them() {
    use platonik_core::construction_fixtures as construction;
    let (listed, runs) = measured(&["habitat", "cases"], None);
    assert_eq!(runs, 0);
    for id in construction::case_ids() {
        assert!(listed["examples"].as_array().unwrap().contains(&json!(id)));
        let (exported, runs) = measured(&["habitat", "case", id], None);
        assert_eq!(runs, 0);
        let exp: Experiment = serde_json::from_value(exported).unwrap();
        assert_eq!(exp, construction::experiment(id).unwrap());
        assert_eq!(
            exp.cells.iter().find(|cell| cell.id == 1).unwrap().program,
            construction::courier_program()
        );
        assert_eq!(
            exp.cells.iter().find(|cell| cell.id == 2).unwrap().program,
            platonik_core::fixtures::relay_program()
        );
        assert!(exp.cells.iter().all(|cell| cell.id != construction::CHILD));
        assert!(exp.links.iter().all(|link| link.id != 41));
        assert_eq!(
            exp.construction.as_ref().unwrap().blueprints[0]
                .body
                .cell
                .program,
            construction::child_program()
        );
    }
    let (_, runs) = measured(&["habitat", "case", "changing-one"], None);
    assert_eq!(runs, 0);
}

#[test]
fn first_answer_case_exports_and_readonly_journey_preserve_existing_status() {
    use platonik_core::answer_fixtures as answer;
    let (listed, runs) = measured(&["habitat", "cases"], None);
    assert_eq!(runs, 0);
    for id in answer::case_ids() {
        assert!(listed["examples"].as_array().unwrap().contains(&json!(id)));
        let (exported, runs) = measured(&["habitat", "case", id], None);
        assert_eq!(runs, 0);
        assert_eq!(
            serde_json::from_value::<Experiment>(exported).unwrap(),
            answer::experiment(id).unwrap()
        );
    }
    let sandbox = Sandbox::new();
    let source = sandbox.path("answer");
    let restored = sandbox.path("restored-answer");
    let exp = answer::experiment("answer-one").unwrap();
    success(init(&source, &exp));
    let genesis = journal(&source);
    let (status, status_runs) = measured(&["habitat", "status", text(&source)], None);
    let (loaded, journey_runs) = measured(&["habitat", "journey", text(&source)], None);
    assert_eq!(loaded["schema"], "platonik-first-answer-report-v1");
    assert_eq!(loaded["habitat"], status);
    assert_eq!(
        status_runs, journey_runs,
        "Grading must reuse the verified snapshot"
    );
    assert!(
        status.get("journey").is_none(),
        "Legacy status shape stays unchanged"
    );
    assert_eq!(loaded["journey"]["phase"], "in_progress");
    assert_eq!(loaded["journey"]["milestones"], json!([]));
    assert_eq!(loaded["journey"]["answer"], Value::Null);
    assert_eq!(journal(&source), genesis);

    let cold = cli(&["run", "-"], Some(&serde_json::to_vec(&exp).unwrap()));
    assert!(cold.status.success());
    let (grade, grade_runs) = measured(&["habitat", "answer", "-"], Some(&cold.stdout));
    assert_eq!(
        grade_runs, 1,
        "A cold grade must freshly replay exactly once"
    );
    assert_eq!(grade["answered"], true);
    let contact = grade["milestones"]
        .as_array()
        .unwrap()
        .iter()
        .find(|milestone| milestone["kind"] == "matching_reply")
        .unwrap()["tick"]
        .as_u64()
        .unwrap() as u32;
    assert!(contact > 5 && contact < exp.ticks);

    // Follow the public continuation tutorial, then inspect the earned contact
    // before the horizon. Neither a reached milestone nor restoration reveals
    // a future success or changes the remaining physical budget.
    let at_five = success(advance(&source, 5, 0, "first-leg"));
    let exported = cli(&["habitat", "export", text(&source)], None);
    assert!(exported.status.success());
    let imported = success(cli(
        &["habitat", "import", "-", text(&restored)],
        Some(&exported.stdout),
    ));
    assert_eq!(imported["current_state"], at_five["current_state"]);
    assert_eq!(imported["costs"], at_five["costs"]);
    success(advance(&restored, contact, 2, "contact"));
    let (at_contact, contact_runs) = measured(&["habitat", "journey", text(&restored)], None);
    let (contact_status, status_runs) = measured(&["habitat", "status", text(&restored)], None);
    assert_eq!(at_contact["habitat"], contact_status);
    assert_eq!(contact_runs, status_runs);
    assert_eq!(at_contact["journey"]["phase"], "in_progress");
    assert_eq!(at_contact["journey"]["answered"], false);
    assert_eq!(at_contact["journey"]["answer"], Value::Null);
    assert_eq!(at_contact["journey"]["milestones"], grade["milestones"]);
    success(advance(&restored, exp.ticks, 4, "finish"));
    let before = journal(&restored);
    let final_grade = success(cli(&["habitat", "journey", text(&restored)], None));
    assert_eq!(
        final_grade["journey"], grade,
        "Saved and cold evidence identities must agree"
    );
    assert_eq!(journal(&restored), before);
    for (file, bytes) in genesis {
        assert_eq!(fs::read(file).unwrap(), bytes);
    }
}

#[test]
fn first_answer_pending_intent_reveals_only_committed_progress_and_recovers_once() {
    let sandbox = Sandbox::new();
    let source = sandbox.path("completed-answer");
    let pending = sandbox.path("pending-answer");
    success(init(
        &source,
        &platonik_core::answer_fixtures::experiment("answer-one").unwrap(),
    ));
    success(advance(&source, 5, 0, "first-leg"));
    let before = success(cli(&["habitat", "journey", text(&source)], None));
    let original = success(advance(&source, 128, 2, "return-home"));
    let original_journey = success(cli(&["habitat", "journey", text(&source)], None));
    let output = cli(&["habitat", "export", text(&source)], None);
    assert!(output.status.success());
    let mut bundle: Bundle = serde_json::from_slice(&output.stdout).unwrap();
    let completion = bundle.entries.pop().unwrap();
    bundle.objects.remove(&completion.event.event_hash).unwrap();
    success(cli(
        &["habitat", "import", "-", text(&pending)],
        Some(&serde_json::to_vec(&bundle).unwrap()),
    ));
    let journal_before = journal(&pending);
    let read = success(cli(&["habitat", "journey", text(&pending)], None));
    assert_eq!(read["journey"], before["journey"]);
    assert_eq!(read["habitat"]["pending_request_id"], "return-home");
    assert_eq!(read["habitat"]["revision"], 3);
    assert_eq!(read["journey"]["answered"], false);
    assert_eq!(journal(&pending), journal_before);
    let recovered = success(cli(
        &[
            "habitat",
            "recover",
            text(&pending),
            "--expect-revision",
            "3",
            "--request-id",
            "return-home",
        ],
        None,
    ));
    assert_eq!(recovered, original);
    assert_eq!(
        success(cli(&["habitat", "journey", text(&pending)], None)),
        original_journey
    );
    let settled = journal(&pending);
    assert_eq!(success(advance(&pending, 128, 2, "return-home")), original);
    assert_eq!(journal(&pending), settled);
}

#[test]
fn first_answer_accepts_failed_evidence_but_rejects_tampered_receipts() {
    let sandbox = Sandbox::new();
    let path = sandbox.path("no-fuel-answer");
    let mut exp = platonik_core::answer_fixtures::experiment("answer-one").unwrap();
    exp.fuel = 0;
    assert_eq!(init(&path, &exp).status.code(), Some(1));
    let read = success(cli(&["habitat", "journey", text(&path)], None));
    assert_eq!(read["journey"]["phase"], "finished_without_answer");
    assert_eq!(read["journey"]["answered"], false);
    assert_eq!(read["journey"]["answer"], Value::Null);
    let failed = cli(&["run", "-"], Some(&serde_json::to_vec(&exp).unwrap()));
    assert_eq!(failed.status.code(), Some(1));
    let (grade, runs) = measured(&["habitat", "answer", "-"], Some(&failed.stdout));
    assert_eq!(runs, 1);
    assert_eq!(grade, read["journey"]);
    let receipt_path = sandbox.path("failed.receipt.json");
    fs::write(&receipt_path, &failed.stdout).unwrap();
    assert_eq!(
        success(cli(&["habitat", "answer", text(&receipt_path)], None)),
        grade
    );
    assert_eq!(fs::read(&receipt_path).unwrap(), failed.stdout);
    let mut forged = value(&failed);
    forged["result"]["costs"]["loading"] = json!(1);
    let bad = cli(
        &["habitat", "answer", "-"],
        Some(&serde_json::to_vec(&forged).unwrap()),
    );
    assert_eq!(bad.status.code(), Some(2));
    assert!(bad.stdout.is_empty());
    assert!(serde_json::from_slice::<Value>(&bad.stderr).unwrap()["error"].is_object());
}

#[test]
fn construction_partial_body_wiring_and_child_execution_survive_restoration() {
    use platonik_core::construction_fixtures as construction;
    let sandbox = Sandbox::new();
    let source = sandbox.path("construction");
    let restored = sandbox.path("restored");
    let exp = construction::experiment("construction-one").unwrap();
    let body = &exp.construction.as_ref().unwrap().blueprints[0].body;
    let bytes = serde_json::to_vec(body).unwrap();
    let copy_end = 1 + (bytes.len() as u32).div_ceil(32);
    let wire_end = copy_end + body.links.len() as u32;
    let birth_tick = wire_end + 1;
    success(init(&source, &exp));
    let genesis = journal(&source);
    let mut path = source.clone();
    let mut final_report = Value::Null;
    for (index, tick) in [
        1,
        2,
        6,
        copy_end,
        wire_end,
        birth_tick,
        birth_tick + 1,
        exp.ticks,
    ]
    .into_iter()
    .enumerate()
    {
        let report = success(advance(
            &path,
            tick,
            (index * 2) as u64,
            &format!("stage-{tick}"),
        ));
        let state = &report["current_state"];
        let builder = state["cells"]
            .as_array()
            .unwrap()
            .iter()
            .find(|cell| cell["id"] == construction::BUILDER)
            .unwrap();
        let staged = &state["construction"];
        assert!(staged["stocks"][0]["units"].as_array().unwrap().is_empty());
        if tick == 1 {
            assert_eq!(builder["material"], construction::MATERIAL);
            assert!(staged["assemblies"].as_array().unwrap().is_empty());
        } else if tick < birth_tick {
            assert!(builder.get("material").is_none());
            assert_eq!(staged["assemblies"][0]["material"], construction::MATERIAL);
            let expected = if tick <= copy_end {
                ((tick - 1) as usize * 32).min(bytes.len())
            } else {
                bytes.len()
            };
            assert_eq!(staged["assemblies"][0]["copied"], json!(&bytes[..expected]));
            assert_eq!(
                staged["assemblies"][0]["wired"].as_array().unwrap().len(),
                usize::from(tick == wire_end)
            );
        } else {
            assert!(staged["assemblies"].as_array().unwrap().is_empty());
            assert_eq!(staged["births"].as_array().unwrap().len(), 1);
            assert_eq!(staged["births"][0]["tick"], birth_tick);
            assert_eq!(staged["births"][0]["parent"], construction::BUILDER);
            assert_eq!(staged["births"][0]["material"], construction::MATERIAL);
            assert_eq!(
                staged["births"][0]["body"],
                serde_json::to_value(body).unwrap()
            );
        }
        assert_eq!(
            state["cells"]
                .as_array()
                .unwrap()
                .iter()
                .any(|cell| cell["id"] == construction::CHILD),
            tick >= birth_tick
        );
        assert_eq!(
            state["links"]
                .as_array()
                .unwrap()
                .iter()
                .any(|link| link["id"] == 41),
            tick >= birth_tick
        );
        assert_eq!(
            report["remaining_fuel"].as_u64().unwrap()
                + report["costs"]
                    .as_object()
                    .unwrap()
                    .values()
                    .map(|v| v.as_u64().unwrap())
                    .sum::<u64>(),
            exp.fuel
        );
        if tick == 6 {
            let export = cli(&["habitat", "export", text(&source)], None);
            assert!(export.status.success());
            let mut forged: Bundle = serde_json::from_slice(&export.stdout).unwrap();
            let old_hash = forged.entries.last().unwrap().event.event_hash.clone();
            let mut event = forged.objects.remove(&old_hash).unwrap();
            let Event::Completed { result } = &mut event else {
                panic!("Expected partial construction completion");
            };
            let Advance::Paused(checkpoint) = result.as_mut() else {
                panic!("Expected a paused assembly");
            };
            checkpoint
                .frames
                .last_mut()
                .unwrap()
                .state
                .construction
                .as_mut()
                .unwrap()
                .assemblies[0]
                .copied[0] ^= 1;
            checkpoint.prefix_hash = artifact_hash(&checkpoint.frames).unwrap();
            let new_hash = artifact_hash(&event).unwrap();
            forged.entries.last_mut().unwrap().event.event_hash = new_hash.clone();
            forged.objects.insert(new_hash, event);
            let rejected = sandbox.path("forged-copy");
            let reject = cli(
                &["habitat", "import", "-", text(&rejected)],
                Some(&serde_json::to_vec(&forged).unwrap()),
            );
            assert_eq!(reject.status.code(), Some(2));
            assert!(
                !rejected.exists(),
                "Rehashing a forged assembly cannot admit it into a new save"
            );
            let imported = success(cli(
                &["habitat", "import", "-", text(&restored)],
                Some(&export.stdout),
            ));
            assert_eq!(imported["current_state"], report["current_state"]);
            assert_eq!(imported["costs"], report["costs"]);
            assert_eq!(
                cli(&["habitat", "export", text(&restored)], None).stdout,
                export.stdout
            );
            path = restored.clone();
        }
        final_report = report;
    }
    assert_eq!(final_report["mission_passed"], true);
    assert_eq!(final_report["revision"], 16);
    let cold = success(cli(&["run", "-"], Some(&serde_json::to_vec(&exp).unwrap())));
    assert_eq!(final_report["result_hash"], cold["result_hash"]);
    assert_eq!(final_report["current_state"], cold["result"]["final_state"]);
    let frames = cold["result"]["frames"].as_array().unwrap();
    assert!(
        frames[birth_tick as usize]["activations"]
            .as_array()
            .unwrap()
            .iter()
            .all(|a| a["cell"] != construction::CHILD)
    );
    assert!(
        frames[birth_tick as usize + 1]["activations"]
            .as_array()
            .unwrap()
            .iter()
            .any(|a| a["cell"] == construction::CHILD)
    );
    assert!(
        frames
            .iter()
            .flat_map(|f| f["activations"].as_array().unwrap())
            .any(|a| a["cell"] == construction::CHILD
                && a["action"]["kind"] == "route"
                && a["success"] == true)
    );
    for (file, bytes) in genesis {
        assert_eq!(fs::read(file).unwrap(), bytes);
    }
    assert_eq!(
        success(cli(&["habitat", "status", text(&source)], None))["tick"],
        6
    );
}

#[test]
fn construction_activation_recovery_and_retry_cannot_duplicate_the_child_or_material() {
    use platonik_core::construction_fixtures as construction;
    let sandbox = Sandbox::new();
    let source = sandbox.path("source");
    let recovered = sandbox.path("recovered");
    let exp = construction::experiment("construction-one").unwrap();
    let body = &exp.construction.as_ref().unwrap().blueprints[0].body;
    let birth_tick =
        2 + (serde_json::to_vec(body).unwrap().len() as u32).div_ceil(32) + body.links.len() as u32;
    success(init(&source, &exp));
    success(advance(&source, 2, 0, "first-copy"));
    let original = success(advance(&source, birth_tick, 2, "birth"));
    let exported = cli(&["habitat", "export", text(&source)], None);
    assert!(exported.status.success());
    let mut bundle: Bundle = serde_json::from_slice(&exported.stdout).unwrap();
    let completion = bundle.entries.pop().unwrap();
    bundle.objects.remove(&completion.event.event_hash).unwrap();
    let pending = success(cli(
        &["habitat", "import", "-", text(&recovered)],
        Some(&serde_json::to_vec(&bundle).unwrap()),
    ));
    assert_eq!(pending["revision"], 3);
    assert_eq!(pending["pending_request_id"], "birth");
    assert_eq!(pending["tick"], 2);
    let before = journal(&recovered);
    let result = success(cli(
        &[
            "habitat",
            "recover",
            text(&recovered),
            "--expect-revision",
            "3",
            "--request-id",
            "birth",
        ],
        None,
    ));
    assert_eq!(result, original);
    assert_eq!(
        result["current_state"]["construction"]["births"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    success(advance(&recovered, birth_tick + 1, 4, "child-runs"));
    assert_eq!(
        success(advance(&recovered, birth_tick, 2, "birth")),
        original
    );
    let intact = journal(&recovered);
    assert_eq!(
        advance(&recovered, birth_tick + 2, 2, "birth")
            .status
            .code(),
        Some(2)
    );
    assert_eq!(journal(&recovered), intact);
    for (file, bytes) in before {
        assert_eq!(fs::read(file).unwrap(), bytes);
    }
}

#[test]
fn ark_exports_are_zero_execution_and_enforce_public_arithmetic_bounds() {
    use platonik_core::ark_fixtures as ark;
    let (listed, runs) = measured(&["habitat", "cases"], None);
    assert_eq!(runs, 0);
    for id in ark::case_ids() {
        assert!(listed["examples"].as_array().unwrap().contains(&json!(id)));
        let (exported, runs) = measured(&["habitat", "case", id], None);
        assert_eq!(runs, 0);
        assert_eq!(
            serde_json::from_value::<Experiment>(exported).unwrap(),
            ark::experiment(id).unwrap()
        );
    }
    for (a, b, tap) in [(0, 0, 0), (15, 15, 4), (9, 7, 0)] {
        let (exported, runs) = measured(
            &[
                "habitat",
                "arithmetic-case",
                &a.to_string(),
                &b.to_string(),
                &tap.to_string(),
            ],
            None,
        );
        assert_eq!(runs, 0);
        assert_eq!(
            serde_json::from_value::<Experiment>(exported).unwrap(),
            ark::arithmetic_case(a, b, tap).unwrap()
        );
    }
    for args in [
        ["16", "0", "0"],
        ["0", "16", "4"],
        ["0", "0", "1"],
        ["-1", "0", "0"],
        ["+1", "0", "0"],
        ["1.0", "0", "0"],
        ["256", "0", "0"],
        ["", "0", "0"],
    ] {
        let output = cli(
            &["habitat", "arithmetic-case", args[0], args[1], args[2]],
            None,
        );
        assert_eq!(output.status.code(), Some(2));
        assert!(output.stdout.is_empty());
        assert!(serde_json::from_slice::<Value>(&output.stderr).unwrap()["error"].is_object());
    }
}

#[test]
fn ark_readonly_progress_preserves_partial_arithmetic_and_recovers_exactly_once() {
    let sandbox = Sandbox::new();
    let source = sandbox.path("ark");
    let restored = sandbox.path("restored-ark");
    let pending = sandbox.path("pending-ark");
    let exp = platonik_core::ark_fixtures::experiment("ark-reserve-16").unwrap();
    success(init(&source, &exp));
    let genesis = journal(&source);
    let (status, status_runs) = measured(&["habitat", "status", text(&source)], None);
    let (loaded, grade_runs) = measured(&["habitat", "ark", text(&source)], None);
    assert_eq!(loaded["schema"], "platonik-ark-report-v1");
    assert_eq!(loaded["habitat"], status);
    assert_eq!(
        grade_runs, status_runs,
        "Grading reuses the exact verified snapshot"
    );
    assert!(
        status.get("ark").is_none(),
        "Legacy status remains unchanged"
    );
    assert_eq!(loaded["ark"]["phase"], "in_progress");
    assert_eq!(loaded["ark"]["outputs"], json!([]));
    assert_eq!(loaded["ark"]["control_passed"], false);
    assert_eq!(journal(&source), genesis);

    let cold = cli(&["run", "-"], Some(&serde_json::to_vec(&exp).unwrap()));
    assert!(cold.status.success());
    let (grade, runs) = measured(&["habitat", "ark-check", "-"], Some(&cold.stdout));
    assert_eq!(runs, 1, "Cold grading freshly replays exactly once");
    assert_eq!(grade["control_passed"], true);
    assert_eq!(grade["outputs"].as_array().unwrap().len(), 5);
    let cut = grade["outputs"][2]["tick"].as_u64().unwrap() as u32;
    let saved = success(advance(&source, cut, 0, "three-bits"));
    let prefix = success(cli(&["habitat", "ark", text(&source)], None));
    assert_eq!(
        prefix["ark"]["outputs"],
        json!(&grade["outputs"].as_array().unwrap()[..3])
    );
    assert_eq!(prefix["ark"]["phase"], "in_progress");
    assert_eq!(prefix["ark"]["observed_sum"], Value::Null);
    assert_eq!(prefix["ark"]["decision"], Value::Null);
    let exported = cli(&["habitat", "export", text(&source)], None);
    assert!(exported.status.success());
    let imported = success(cli(
        &["habitat", "import", "-", text(&restored)],
        Some(&exported.stdout),
    ));
    assert_eq!(imported["current_state"], saved["current_state"]);
    assert_eq!(imported["costs"], saved["costs"]);
    assert_eq!(
        success(cli(&["habitat", "ark", text(&restored)], None))["ark"],
        prefix["ark"]
    );
    let completed = success(advance(&restored, 128, 2, "service"));
    let final_grade = success(cli(&["habitat", "ark", text(&restored)], None));
    assert_eq!(
        final_grade["ark"], grade,
        "Saved and cold evidence identities agree"
    );

    // Import the exact committed intent prefix: a read cannot reveal the result
    // of the pending advance. Recovery must reproduce it without a second debit.
    let output = cli(&["habitat", "export", text(&restored)], None);
    assert!(output.status.success());
    let mut bundle: Bundle = serde_json::from_slice(&output.stdout).unwrap();
    let completion = bundle.entries.pop().unwrap();
    bundle.objects.remove(&completion.event.event_hash).unwrap();
    success(cli(
        &["habitat", "import", "-", text(&pending)],
        Some(&serde_json::to_vec(&bundle).unwrap()),
    ));
    let history = journal(&pending);
    let read = success(cli(&["habitat", "ark", text(&pending)], None));
    assert_eq!(read["ark"], prefix["ark"]);
    assert_eq!(read["habitat"]["pending_request_id"], "service");
    assert_eq!(read["habitat"]["revision"], 3);
    assert_eq!(journal(&pending), history);
    let recovered = success(cli(
        &[
            "habitat",
            "recover",
            text(&pending),
            "--expect-revision",
            "3",
            "--request-id",
            "service",
        ],
        None,
    ));
    assert_eq!(recovered, completed);
    assert_eq!(
        success(cli(&["habitat", "ark", text(&pending)], None)),
        final_grade
    );
    let settled = journal(&pending);
    assert_eq!(success(advance(&pending, 128, 2, "service")), completed);
    assert_eq!(journal(&pending), settled);
    for (file, bytes) in genesis {
        assert_eq!(fs::read(file).unwrap(), bytes);
    }
}

#[test]
fn ark_failed_evidence_is_readable_but_tampered_receipts_are_rejected() {
    let sandbox = Sandbox::new();
    let path = sandbox.path("no-fuel-ark");
    let mut exp = platonik_core::ark_fixtures::experiment("ark-reserve-16").unwrap();
    exp.fuel = 0;
    assert_eq!(init(&path, &exp).status.code(), Some(1));
    let read = success(cli(&["habitat", "ark", text(&path)], None));
    assert_eq!(read["ark"]["phase"], "failed");
    assert_eq!(read["ark"]["control_passed"], false);
    assert_eq!(read["ark"]["arithmetic_passed"], false);
    let failed = cli(&["run", "-"], Some(&serde_json::to_vec(&exp).unwrap()));
    assert_eq!(failed.status.code(), Some(1));
    let (grade, runs) = measured(&["habitat", "ark-check", "-"], Some(&failed.stdout));
    assert_eq!(runs, 1);
    assert_eq!(grade, read["ark"]);
    let receipt_path = sandbox.path("failed.receipt.json");
    fs::write(&receipt_path, &failed.stdout).unwrap();
    assert_eq!(
        success(cli(&["habitat", "ark-check", text(&receipt_path)], None)),
        grade
    );
    assert_eq!(fs::read(&receipt_path).unwrap(), failed.stdout);
    let mut forged = value(&failed);
    forged["result"]["costs"]["loading"] = json!(1);
    let bad = cli(
        &["habitat", "ark-check", "-"],
        Some(&serde_json::to_vec(&forged).unwrap()),
    );
    assert_eq!(bad.status.code(), Some(2));
    assert!(bad.stdout.is_empty());
    assert!(serde_json::from_slice::<Value>(&bad.stderr).unwrap()["error"].is_object());
}

#[test]
fn ports_case_exports_are_zero_execution_and_preserve_typed_inputs() {
    let _executions = PortsExecutions::start();
    use platonik_core::port_fixtures as ports;
    let (listed, runs) = measured(&["habitat", "cases"], None);
    assert_eq!(runs, 0);
    assert_eq!(ports::case_ids().len(), 8);
    for id in ports::case_ids() {
        assert!(listed["examples"].as_array().unwrap().contains(&json!(id)));
        let (exported, runs) = measured(&["habitat", "case", id], None);
        assert_eq!(runs, 0);
        assert_eq!(
            serde_json::from_value::<Experiment>(exported).unwrap(),
            ports::experiment(id).unwrap()
        );
    }
}

#[test]
fn ports_readonly_progress_separates_custody_from_ack_and_preserves_recovery() {
    let _executions = PortsExecutions::start();
    let sandbox = Sandbox::new();
    let source = sandbox.path("ports");
    let restored = sandbox.path("restored-ports");
    let pending = sandbox.path("pending-ports");
    let exp = platonik_core::port_fixtures::experiment("ports-clear-zero-one").unwrap();
    success(init(&source, &exp));
    let genesis = journal(&source);
    let (status, status_runs) = measured(&["habitat", "status", text(&source)], None);
    let (loaded, grade_runs) = measured(&["habitat", "ports", text(&source)], None);
    assert_eq!(loaded["schema"], "platonik-ports-report-v1");
    assert_eq!(loaded["habitat"], status);
    assert_eq!(
        grade_runs, status_runs,
        "The grade adds no execution beyond the verified snapshot"
    );
    assert!(
        status.get("ports").is_none(),
        "Legacy status remains unchanged"
    );
    assert_eq!(loaded["ports"]["phase"], "in_progress");
    assert_eq!(loaded["ports"]["commitments_passed"], false);
    assert_eq!(loaded["ports"]["commitments"].as_array().unwrap().len(), 2);
    for lane in loaded["ports"]["commitments"].as_array().unwrap() {
        assert_eq!(lane["requested"], Value::Null);
        assert_eq!(lane["accepted"], Value::Null);
        assert_eq!(lane["acknowledged"], Value::Null);
    }
    assert_eq!(journal(&source), genesis);

    let cold = cli(&["run", "-"], Some(&serde_json::to_vec(&exp).unwrap()));
    assert!(cold.status.success());
    let (grade, runs) = measured(&["habitat", "ports-check", "-"], Some(&cold.stdout));
    assert_eq!(runs, 1, "Standalone grading freshly replays exactly once");
    assert_eq!(grade["commitments_passed"], true);
    let cut = grade["commitments"][0]["accepted"].as_u64().unwrap() as u32;
    assert!(
        grade["commitments"][0]["acknowledged"]["tick"]
            .as_u64()
            .unwrap()
            > u64::from(cut)
    );
    let saved = success(advance(&source, cut, 0, "parcel-arrived"));
    let prefix = success(cli(&["habitat", "ports", text(&source)], None));
    assert_eq!(prefix["ports"]["phase"], "in_progress");
    assert_eq!(prefix["ports"]["commitments"][0]["accepted"], cut);
    assert_eq!(
        prefix["ports"]["commitments"][0]["acknowledged"],
        Value::Null
    );
    assert_eq!(prefix["ports"]["commitments_passed"], false);
    let exported = cli(&["habitat", "export", text(&source)], None);
    assert!(exported.status.success());
    let imported = success(cli(
        &["habitat", "import", "-", text(&restored)],
        Some(&exported.stdout),
    ));
    assert_eq!(imported["current_state"], saved["current_state"]);
    assert_eq!(imported["costs"], saved["costs"]);
    assert_eq!(
        success(cli(&["habitat", "ports", text(&restored)], None))["ports"],
        prefix["ports"]
    );
    let completed = success(advance(&restored, 128, 2, "acknowledge"));
    let final_grade = success(cli(&["habitat", "ports", text(&restored)], None));
    assert_eq!(
        final_grade["ports"], grade,
        "Saved and cold evidence identities agree"
    );

    // A committed intent exposes only the previously completed physical prefix.
    let output = cli(&["habitat", "export", text(&restored)], None);
    assert!(output.status.success());
    let mut bundle: Bundle = serde_json::from_slice(&output.stdout).unwrap();
    let completion = bundle.entries.pop().unwrap();
    bundle.objects.remove(&completion.event.event_hash).unwrap();
    success(cli(
        &["habitat", "import", "-", text(&pending)],
        Some(&serde_json::to_vec(&bundle).unwrap()),
    ));
    let history = journal(&pending);
    let read = success(cli(&["habitat", "ports", text(&pending)], None));
    assert_eq!(read["ports"], prefix["ports"]);
    assert_eq!(read["habitat"]["pending_request_id"], "acknowledge");
    assert_eq!(read["habitat"]["revision"], 3);
    assert_eq!(journal(&pending), history);
    let recovered = success(cli(
        &[
            "habitat",
            "recover",
            text(&pending),
            "--expect-revision",
            "3",
            "--request-id",
            "acknowledge",
        ],
        None,
    ));
    assert_eq!(recovered, completed);
    assert_eq!(
        success(cli(&["habitat", "ports", text(&pending)], None)),
        final_grade
    );
    let settled = journal(&pending);
    assert_eq!(success(advance(&pending, 128, 2, "acknowledge")), completed);
    assert_eq!(journal(&pending), settled);
    for (file, bytes) in genesis {
        assert_eq!(fs::read(file).unwrap(), bytes);
    }
}

#[test]
fn ports_failed_receipts_remain_readable_but_forged_costs_are_rejected() {
    let _executions = PortsExecutions::start();
    let sandbox = Sandbox::new();
    let path = sandbox.path("no-fuel-ports");
    let mut exp = platonik_core::port_fixtures::experiment("ports-clear-zero-one").unwrap();
    exp.fuel = 0;
    assert_eq!(init(&path, &exp).status.code(), Some(1));
    let read = success(cli(&["habitat", "ports", text(&path)], None));
    assert_eq!(read["ports"]["phase"], "failed");
    assert_eq!(read["ports"]["commitments_passed"], false);
    assert_eq!(read["ports"]["custody_passed"], false);
    assert_eq!(read["ports"]["commitments"].as_array().unwrap().len(), 2);
    let failed = cli(&["run", "-"], Some(&serde_json::to_vec(&exp).unwrap()));
    assert_eq!(failed.status.code(), Some(1));
    let (grade, runs) = measured(&["habitat", "ports-check", "-"], Some(&failed.stdout));
    assert_eq!(runs, 1);
    assert_eq!(grade, read["ports"]);
    let receipt_path = sandbox.path("failed.receipt.json");
    fs::write(&receipt_path, &failed.stdout).unwrap();
    assert_eq!(
        success(cli(&["habitat", "ports-check", text(&receipt_path)], None)),
        grade
    );
    assert_eq!(fs::read(&receipt_path).unwrap(), failed.stdout);
    let mut forged = value(&failed);
    forged["result"]["costs"]["loading"] = json!(1);
    let bad = cli(
        &["habitat", "ports-check", "-"],
        Some(&serde_json::to_vec(&forged).unwrap()),
    );
    assert_eq!(bad.status.code(), Some(2));
    assert!(bad.stdout.is_empty());
    assert!(serde_json::from_slice::<Value>(&bad.stderr).unwrap()["error"].is_object());
}
