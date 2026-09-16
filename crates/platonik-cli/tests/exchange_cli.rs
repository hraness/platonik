use platonik_core::{bloom_exchange_fixtures as fixtures, check};
use serde_json::{Value, json};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
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
            "platonik-exchange-cli-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&root).unwrap();
        Self {
            root,
            executions: 0,
        }
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
            if let Some(metric) = serde_json::from_slice::<Value>(line)
                .ok()
                .filter(|value| value["schema"] == "platonik-process-metrics-v1")
            {
                assert!(
                    count
                        .replace(metric["engine_executions"].as_u64().unwrap())
                        .is_none(),
                    "A subprocess must emit exactly one metrics record"
                );
            } else {
                output.stderr.extend_from_slice(line);
            }
        }
        let count = count.expect("Every subprocess must report its engine executions");
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
fn bytes(value: &impl serde::Serialize) -> Vec<u8> {
    serde_json::to_vec(value).unwrap()
}

#[test]
fn exchange_exports_are_pure_and_generic_prepare_cannot_replace_roles() {
    let mut run = Run::new();
    let (listed, count) = run.ok(&["habitat", "cases"], None);
    assert_eq!(count, 0);
    for id in fixtures::case_ids() {
        assert!(listed["examples"].as_array().unwrap().contains(&json!(id)));
        let (exported, count) = run.ok(&["habitat", "case", id], None);
        assert_eq!(count, 0);
        assert_eq!(
            serde_json::from_value::<platonik_core::Experiment>(exported).unwrap(),
            fixtures::experiment(id).unwrap()
        );
    }
    for kind in fixtures::control_ids() {
        let (exported, count) = run.ok(
            &["habitat", "exchange-control", "bloom-exchange-left", kind],
            None,
        );
        assert_eq!(count, 0);
        assert_eq!(
            serde_json::from_value::<platonik_core::Experiment>(exported).unwrap(),
            fixtures::control("bloom-exchange-left", kind).unwrap()
        );
    }
    for args in [
        vec!["habitat", "case", "bloom-exchange-unknown"],
        vec![
            "habitat",
            "exchange-control",
            "bloom-exchange-left",
            "unknown",
        ],
        vec!["habitat", "exchange-control", "unknown", "no-request"],
        vec!["habitat", "exchange-check", "bloom-exchange-left"],
    ] {
        let (output, count) = run.cli(&args, None);
        assert_eq!(output.status.code(), Some(2));
        assert_eq!(count, 0);
        assert!(output.stdout.is_empty());
    }
    let missing = run.root.join("missing-expedition");
    let (output, count) = run.cli(
        &[
            "habitat",
            "prepare",
            "bloom-exchange-left",
            missing.to_str().unwrap(),
        ],
        None,
    );
    assert_eq!(output.status.code(), Some(2));
    assert_eq!(count, 0);
    assert!(String::from_utf8_lossy(&output.stderr).contains("role mapping"));
    assert!(!missing.exists());
}

#[test]
fn exchange_check_replays_once_and_rejects_rehashed_corruption() {
    let mut run = Run::new();
    let experiment = fixtures::experiment("bloom-exchange-left").unwrap();
    let (receipt, count) = run.ok(&["run", "-"], Some(&bytes(&experiment)));
    assert_eq!(count, 1);
    let receipt_bytes = bytes(&receipt);
    let (grade, count) = run.ok(
        &["habitat", "exchange-check", "bloom-exchange-left", "-"],
        Some(&receipt_bytes),
    );
    assert_eq!(count, 1, "The grade must perform exactly one fresh replay");
    assert_eq!(grade["schema"], "platonik-bloom-exchange-v1");
    assert_eq!(grade["case_id"], "bloom-exchange-left");
    assert_eq!(grade["experiment_hash"], receipt["experiment_hash"]);
    assert_eq!(grade["result_hash"], receipt["result_hash"]);
    for predicate in [
        "fixed_world_passed",
        "generation_passed",
        "trials_passed",
        "selection_passed",
        "request_passed",
        "custody_passed",
        "acknowledgment_passed",
        "spare_preserved",
        "service_passed",
        "exchange_passed",
    ] {
        assert_eq!(grade[predicate], true, "{predicate}: {grade}");
    }
    let path = run.root.join("receipt.json");
    fs::write(&path, &receipt_bytes).unwrap();
    let (from_file, count) = run.ok(
        &[
            "habitat",
            "exchange-check",
            "bloom-exchange-left",
            path.to_str().unwrap(),
        ],
        None,
    );
    assert_eq!(count, 1);
    assert_eq!(from_file, grade);
    assert_eq!(fs::read(&path).unwrap(), receipt_bytes);

    let (mismatch, count) = run.ok(
        &["habitat", "exchange-check", "bloom-exchange-right", "-"],
        Some(&receipt_bytes),
    );
    assert_eq!(count, 1);
    assert_eq!(mismatch["fixed_world_passed"], false);
    assert_eq!(mismatch["exchange_passed"], false);
    let (unknown, count) = run.cli(
        &["habitat", "exchange-check", "unknown", "-"],
        Some(&receipt_bytes),
    );
    assert_eq!(unknown.status.code(), Some(2));
    assert_eq!(count, 0);
    assert!(unknown.stdout.is_empty());

    let mut corrupt: check::Receipt = serde_json::from_value(receipt).unwrap();
    corrupt.result.frames[1].state.cells[0].memory[3] ^= 1;
    corrupt.result_hash = check::artifact_hash(&corrupt.result).unwrap();
    let (rejected, count) = run.cli(
        &["habitat", "exchange-check", "bloom-exchange-left", "-"],
        Some(&bytes(&corrupt)),
    );
    assert_eq!(rejected.status.code(), Some(2));
    assert_eq!(
        count, 0,
        "The independent transition checker rejects unearned memory before replay"
    );
    assert!(String::from_utf8_lossy(&rejected.stderr).contains("memory"));
    assert!(rejected.stdout.is_empty());
}

#[test]
fn exchange_failed_control_is_valid_readable_evidence() {
    let mut run = Run::new();
    let (experiment, count) = run.ok(
        &[
            "habitat",
            "exchange-control",
            "bloom-exchange-left",
            "no-request",
        ],
        None,
    );
    assert_eq!(count, 0);
    let (receipt, count) = run.cli(&["run", "-"], Some(&bytes(&experiment)));
    assert!(matches!(receipt.status.code(), Some(0 | 1)));
    assert_eq!(count, 1);
    let (grade, count) = run.ok(
        &["habitat", "exchange-check", "bloom-exchange-left", "-"],
        Some(&receipt.stdout),
    );
    assert_eq!(count, 1);
    assert_eq!(grade["schema"], "platonik-bloom-exchange-v1");
    assert_eq!(grade["fixed_world_passed"], true);
    assert_eq!(grade["request_passed"], false);
    assert_eq!(grade["exchange_passed"], false);
}
