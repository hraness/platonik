use serde_json::{Value, json};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT: AtomicU64 = AtomicU64::new(0);
struct Run {
    root: PathBuf,
    executions: u64,
}
impl Run {
    fn new() -> Self {
        let root = std::env::temp_dir().canonicalize().unwrap().join(format!(
            "platonik-bloom-cli-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&root).unwrap();
        Self {
            root,
            executions: 0,
        }
    }
    fn path(&self, name: &str) -> PathBuf {
        self.root.join(name)
    }
    fn cli(&mut self, args: &[&str], input: Option<&[u8]>) -> (Output, u64) {
        let mut child = Command::new(env!("CARGO_BIN_EXE_platonik"))
            .env("HRANESS_SUPPORT", "off")
            .arg("--metrics")
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
        let mut output = child.wait_with_output().unwrap();
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
            } else {
                output.stderr.extend_from_slice(line);
            }
        }
        let count = count.expect("Every subprocess must report its actual engine executions");
        self.executions += count;
        (output, count)
    }
    fn ok(&mut self, args: &[&str], input: Option<&[u8]>) -> (Value, u64) {
        let (output, count) = self.cli(args, input);
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        (serde_json::from_slice(&output.stdout).unwrap(), count)
    }
}
impl Drop for Run {
    fn drop(&mut self) {
        eprintln!(
            "{}",
            json!({
                "schema": "platonik-cli-test-metrics-v1",
                "test": std::thread::current().name(),
                "engine_executions": self.executions,
            })
        );
        let _ = fs::remove_dir_all(&self.root);
    }
}
fn text(path: &Path) -> &str {
    path.to_str().unwrap()
}
fn bytes(value: &Value) -> Vec<u8> {
    serde_json::to_vec(value).unwrap()
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
fn bloom_case_exports_preserve_typed_inputs_without_execution() {
    let mut run = Run::new();
    let (listed, count) = run.ok(&["habitat", "cases"], None);
    assert_eq!(count, 0);
    assert_eq!(platonik_core::bloom_fixtures::case_ids().len(), 8);
    for id in platonik_core::bloom_fixtures::case_ids() {
        assert!(listed["examples"].as_array().unwrap().contains(&json!(id)));
        let (exported, count) = run.ok(&["habitat", "case", id], None);
        assert_eq!(count, 0);
        assert_eq!(
            serde_json::from_value::<platonik_core::model::Experiment>(exported).unwrap(),
            platonik_core::bloom_fixtures::experiment(id).unwrap()
        );
    }
}

#[test]
fn bloom_reads_preserve_prefixes_and_restore_pending_confirmation() {
    let mut run = Run::new();
    let source = run.path("source");
    let restored = run.path("restored");
    let pending = run.path("pending");
    let (experiment, _) = run.ok(&["habitat", "case", "bloom-left"], None);
    run.ok(
        &["habitat", "init", text(&source), "-"],
        Some(&bytes(&experiment)),
    );
    let genesis = journal(&source);
    let (status, status_count) = run.ok(&["habitat", "status", text(&source)], None);
    let (loaded, grade_count) = run.ok(&["habitat", "bloom", text(&source)], None);
    assert_eq!(loaded["schema"], "platonik-bloom-report-v1");
    assert_eq!(loaded["habitat"], status);
    assert_eq!(
        status_count, grade_count,
        "Grading adds no run beyond the verified snapshot"
    );
    assert!(status.get("bloom").is_none(), "Legacy status is unchanged");
    assert_eq!(loaded["bloom"]["phase"], "in_progress");
    assert_eq!(loaded["bloom"]["bloomed"], false);
    assert_eq!(loaded["bloom"]["selection"], Value::Null);
    assert!(
        loaded["bloom"]["candidates"]
            .as_array()
            .unwrap()
            .iter()
            .all(
                |candidate| candidate["edits"].as_array().unwrap().is_empty()
                    && candidate["born"].is_null()
            )
    );
    assert_eq!(journal(&source), genesis);

    let (cold, _) = run.ok(&["run", "-"], Some(&bytes(&experiment)));
    let (grade, count) = run.ok(&["habitat", "bloom-check", "-"], Some(&bytes(&cold)));
    assert_eq!(
        count, 1,
        "Standalone grade performs exactly one fresh replay"
    );
    assert_eq!(grade["bloomed"], true);
    let cut = grade["selection"]["tick"].as_u64().unwrap();
    let (saved, _) = run.ok(
        &[
            "habitat",
            "advance",
            text(&source),
            "--until",
            &cut.to_string(),
            "--expect-revision",
            "0",
            "--request-id",
            "choose",
        ],
        None,
    );
    let before_read = journal(&source);
    let (prefix, _) = run.ok(&["habitat", "bloom", text(&source)], None);
    assert_eq!(prefix["bloom"]["selection"], grade["selection"]);
    assert_eq!(prefix["bloom"]["confirmation_passed"], false);
    assert_eq!(prefix["bloom"]["bloomed"], false);
    assert_eq!(prefix["bloom"]["phase"], "in_progress");
    assert_eq!(journal(&source), before_read);
    let (bundle, _) = run.ok(&["habitat", "export", text(&source)], None);
    let (imported, _) = run.ok(
        &["habitat", "import", "-", text(&restored)],
        Some(&bytes(&bundle)),
    );
    assert_eq!(imported["current_state"], saved["current_state"]);
    assert_eq!(imported["costs"], saved["costs"]);
    let (restored_prefix, _) = run.ok(&["habitat", "bloom", text(&restored)], None);
    assert_eq!(restored_prefix["bloom"], prefix["bloom"]);
    let (completed, _) = run.ok(
        &[
            "habitat",
            "advance",
            text(&restored),
            "--until",
            "128",
            "--expect-revision",
            "2",
            "--request-id",
            "confirm",
        ],
        None,
    );
    let (final_grade, _) = run.ok(&["habitat", "bloom", text(&restored)], None);
    assert_eq!(
        final_grade["bloom"], grade,
        "Cold and saved histories share their exact grade"
    );

    let (mut interrupted, _) = run.ok(&["habitat", "export", text(&restored)], None);
    let completion = interrupted["entries"]
        .as_array_mut()
        .unwrap()
        .pop()
        .unwrap();
    let hash = completion["event"]["event_hash"].as_str().unwrap();
    assert!(
        interrupted["objects"]
            .as_object_mut()
            .unwrap()
            .remove(hash)
            .is_some()
    );
    run.ok(
        &["habitat", "import", "-", text(&pending)],
        Some(&bytes(&interrupted)),
    );
    let pending_journal = journal(&pending);
    let (pending_grade, _) = run.ok(&["habitat", "bloom", text(&pending)], None);
    assert_eq!(pending_grade["bloom"], prefix["bloom"]);
    assert_eq!(pending_grade["habitat"]["pending_request_id"], "confirm");
    assert_eq!(pending_grade["habitat"]["revision"], 3);
    assert_eq!(journal(&pending), pending_journal);
    let (recovered, _) = run.ok(
        &[
            "habitat",
            "recover",
            text(&pending),
            "--expect-revision",
            "3",
            "--request-id",
            "confirm",
        ],
        None,
    );
    assert_eq!(recovered, completed);
    let (recovered_grade, _) = run.ok(&["habitat", "bloom", text(&pending)], None);
    assert_eq!(recovered_grade, final_grade);
    let settled = journal(&pending);
    let (retry, _) = run.ok(
        &[
            "habitat",
            "advance",
            text(&pending),
            "--until",
            "128",
            "--expect-revision",
            "2",
            "--request-id",
            "confirm",
        ],
        None,
    );
    assert_eq!(retry, completed);
    assert_eq!(journal(&pending), settled);
    for (path, original) in genesis {
        assert_eq!(fs::read(path).unwrap(), original);
    }
}

#[test]
fn bloom_failed_evidence_is_readable_but_tampered_costs_are_rejected() {
    let mut run = Run::new();
    let save = run.path("failed");
    let receipt_path = run.path("failed.receipt.json");
    let (mut experiment, _) = run.ok(&["habitat", "case", "bloom-left"], None);
    experiment["fuel"] = json!(0);
    let (init, _) = run.cli(
        &["habitat", "init", text(&save), "-"],
        Some(&bytes(&experiment)),
    );
    assert_eq!(init.status.code(), Some(1));
    let (read, _) = run.ok(&["habitat", "bloom", text(&save)], None);
    assert_eq!(read["bloom"]["phase"], "finished_without_bloom");
    assert_eq!(read["bloom"]["bloomed"], false);
    let (cold, _) = run.cli(&["run", "-"], Some(&bytes(&experiment)));
    assert_eq!(cold.status.code(), Some(1));
    let (grade, count) = run.ok(&["habitat", "bloom-check", "-"], Some(&cold.stdout));
    assert_eq!(count, 1);
    assert_eq!(grade, read["bloom"]);
    fs::write(&receipt_path, &cold.stdout).unwrap();
    let (file_grade, _) = run.ok(&["habitat", "bloom-check", text(&receipt_path)], None);
    assert_eq!(file_grade, grade);
    assert_eq!(fs::read(&receipt_path).unwrap(), cold.stdout);
    let mut forged: Value = serde_json::from_slice(&cold.stdout).unwrap();
    forged["result"]["costs"]["loading"] = json!(1);
    let (bad, _) = run.cli(&["habitat", "bloom-check", "-"], Some(&bytes(&forged)));
    assert_eq!(bad.status.code(), Some(2));
    assert!(bad.stdout.is_empty());
}
