use serde_json::Value;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_FILE: AtomicU64 = AtomicU64::new(0);

struct InputFile(PathBuf);

impl InputFile {
    fn new(bytes: &[u8]) -> Self {
        let path = std::env::temp_dir().join(format!(
            "platonik-cli-{}-{}.json",
            std::process::id(),
            NEXT_FILE.fetch_add(1, Ordering::Relaxed),
        ));
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .unwrap();
        file.write_all(bytes).unwrap();
        Self(path)
    }

    fn path(&self) -> &str {
        self.0.to_str().unwrap()
    }
}

impl Drop for InputFile {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

fn cli(args: &[&str], input: Option<&[u8]>) -> Output {
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
    if let Some(bytes) = input {
        child.stdin.take().unwrap().write_all(bytes).unwrap();
    }
    child.wait_with_output().unwrap()
}

fn json(bytes: &[u8]) -> Value {
    serde_json::from_slice(bytes).unwrap()
}

fn reference() -> Vec<u8> {
    let example = cli(&["example", "opening-normal"], None);
    assert!(
        example.status.success(),
        "{}",
        String::from_utf8_lossy(&example.stderr)
    );
    example.stdout
}

#[test]
fn exported_experiment_runs_verifies_and_has_inspectable_replay() {
    let example = reference();
    let first = cli(&["run", "-"], Some(&example));
    assert!(
        first.status.success(),
        "{}",
        String::from_utf8_lossy(&first.stderr)
    );
    assert!(first.stderr.is_empty());
    let repeat = cli(&["run", "-"], Some(&example));
    assert_eq!(
        first.stdout, repeat.stdout,
        "Receipt serialization must be deterministic"
    );

    let verified = cli(&["verify", "-"], Some(&first.stdout));
    assert!(
        verified.status.success(),
        "{}",
        String::from_utf8_lossy(&verified.stderr)
    );
    assert_eq!(json(&verified.stdout)["verified"], true);
    assert_eq!(json(&verified.stdout)["passed"], true);

    let inspected = cli(&["inspect", "-"], Some(&first.stdout));
    assert!(
        inspected.status.success(),
        "{}",
        String::from_utf8_lossy(&inspected.stderr)
    );
    let text = String::from_utf8(inspected.stdout).unwrap();
    assert!(text.contains("tick"));
    assert!(text.contains("charge"));
}

#[test]
fn malformed_and_oversized_files_fail_without_changing_the_source() {
    for (bytes, code) in [
        (b"{".to_vec(), "invalid_json"),
        (vec![b' '; 65_537], "input_limit"),
    ] {
        let file = InputFile::new(&bytes);
        let modified = fs::metadata(&file.0).unwrap().modified().unwrap();
        let output = cli(&["run", file.path()], None);
        assert_eq!(output.status.code(), Some(2));
        assert!(output.stdout.is_empty());
        assert_eq!(json(&output.stderr)["error"]["code"], code);
        assert_eq!(fs::read(&file.0).unwrap(), bytes);
        assert_eq!(fs::metadata(&file.0).unwrap().modified().unwrap(), modified);
    }

    let bytes = reference();
    let file = InputFile::new(&bytes);
    let modified = fs::metadata(&file.0).unwrap().modified().unwrap();
    assert!(cli(&["run", file.path()], None).status.success());
    assert_eq!(fs::read(&file.0).unwrap(), bytes);
    assert_eq!(fs::metadata(&file.0).unwrap().modified().unwrap(), modified);
}

#[test]
fn altered_receipts_are_rejected_without_printing_an_inspection() {
    let example = reference();
    let run = cli(&["run", "-"], Some(&example));
    assert!(run.status.success());
    let mut receipt = json(&run.stdout);
    receipt["result_hash"] = Value::String(format!("sha256:{}", "0".repeat(64)));
    let tampered = serde_json::to_vec(&receipt).unwrap();
    for command in ["verify", "inspect"] {
        let output = cli(&[command, "-"], Some(&tampered));
        assert_eq!(output.status.code(), Some(2));
        assert!(output.stdout.is_empty());
        assert_eq!(json(&output.stderr)["error"]["code"], "invalid_receipt");
    }
}

#[test]
fn an_honest_mission_failure_still_has_a_valid_replay_receipt() {
    let example = cli(&["example", "opening-wounded-fast"], None);
    assert!(example.status.success());
    let run = cli(&["run", "-"], Some(&example.stdout));
    assert_eq!(run.status.code(), Some(1));
    assert!(run.stderr.is_empty());
    let verified = cli(&["verify", "-"], Some(&run.stdout));
    assert!(
        verified.status.success(),
        "{}",
        String::from_utf8_lossy(&verified.stderr)
    );
    assert_eq!(json(&verified.stdout)["verified"], true);
    assert_eq!(json(&verified.stdout)["passed"], false);
}

#[test]
fn help_discovery_and_invalid_commands_match_the_public_surface() {
    let help = cli(&["--help"], None);
    assert!(help.status.success());
    assert!(
        String::from_utf8(help.stdout)
            .unwrap()
            .contains("verify <receipt.json|->")
    );
    let examples = cli(&["examples"], None);
    assert!(examples.status.success());
    assert!(
        json(&examples.stdout)["examples"]
            .as_array()
            .unwrap()
            .iter()
            .any(|id| id == "opening-normal")
    );
    for args in [
        vec!["missing"],
        vec!["run"],
        vec!["run", "a", "b"],
        vec!["example", "missing"],
        vec!["suite", "missing"],
    ] {
        let output = cli(&args, None);
        assert_eq!(output.status.code(), Some(2));
        assert!(output.stdout.is_empty());
        assert_eq!(json(&output.stderr)["schema"], "platonik-error-v1");
    }
}

#[cfg(unix)]
#[test]
fn non_utf8_arguments_are_structured_errors_instead_of_panics() {
    use std::os::unix::ffi::OsStringExt;
    let output = Command::new(env!("CARGO_BIN_EXE_platonik"))
        .arg(std::ffi::OsString::from_vec(vec![0xff]))
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(2));
    assert!(output.stdout.is_empty());
    assert_eq!(json(&output.stderr)["error"]["code"], "usage");
}

#[cfg(unix)]
#[test]
fn an_unconnected_fifo_is_rejected_without_waiting_for_a_writer() {
    use std::time::{Duration, Instant};
    let path = std::env::temp_dir().join(format!(
        "platonik-cli-fifo-{}-{}",
        std::process::id(),
        NEXT_FILE.fetch_add(1, Ordering::Relaxed),
    ));
    let created = Command::new("mkfifo").arg(&path).output().unwrap();
    assert!(
        created.status.success(),
        "{}",
        String::from_utf8_lossy(&created.stderr)
    );
    let fifo = InputFile(path);
    for command in ["run", "verify", "inspect"] {
        let mut child = Command::new(env!("CARGO_BIN_EXE_platonik"))
            .args([command, fifo.path()])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(2);
        while child.try_wait().unwrap().is_none() {
            if Instant::now() >= deadline {
                child.kill().unwrap();
                child.wait().unwrap();
                panic!("{command} blocked while opening a FIFO without a writer");
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        let output = child.wait_with_output().unwrap();
        assert_eq!(output.status.code(), Some(2));
        assert!(output.stdout.is_empty());
        assert_eq!(json(&output.stderr)["error"]["code"], "invalid_input");
    }
}
