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

#[test]
fn redirected_help_and_machine_outputs_have_no_terminal_intro() {
    let canonical = cli(&["--help"], None);
    for args in [
        vec![],
        vec!["help"],
        vec!["-h"],
        vec!["--metrics", "--help"],
    ] {
        let output = cli(&args, None);
        assert!(output.status.success());
        assert_eq!(output.stdout, canonical.stdout);
    }
    assert!(canonical.stdout.starts_with(b"Platonik"));
    assert!(canonical.stderr.is_empty());
    for args in [
        vec!["expedition", "help"],
        vec!["habitat", "help"],
        vec!["--version"],
    ] {
        let output = cli(&args, None);
        assert!(output.status.success());
        assert!(
            !String::from_utf8(output.stdout)
                .unwrap()
                .contains("--( : )--")
        );
        assert!(output.stderr.is_empty());
    }
    let examples = cli(&["--metrics", "examples"], None);
    assert!(examples.status.success());
    assert_eq!(json(&examples.stdout)["schema"], "platonik-examples-v1");
    assert_eq!(
        json(&examples.stderr)["schema"],
        "platonik-process-metrics-v1"
    );
    for args in [
        vec!["--json"],
        vec!["--jsonl"],
        vec!["completions"],
        vec!["help", "missing"],
    ] {
        let output = cli(&args, None);
        assert_eq!(output.status.code(), Some(2));
        assert!(output.stdout.is_empty());
        assert_eq!(json(&output.stderr)["schema"], "platonik-error-v1");
    }
}

#[test]
fn agent_world_commands_produce_replayable_browser_views() {
    let created = cli(&["world", "new", "Rustlight"], None);
    assert!(created.status.success());
    let original = InputFile::new(&created.stdout);
    let command = br#"{"kind":"advance","ticks":32}"#;
    let advanced = cli(&["world", "act", original.path(), "-"], Some(command));
    assert!(
        advanced.status.success(),
        "{}",
        String::from_utf8_lossy(&advanced.stderr)
    );
    let current = InputFile::new(&advanced.stdout);
    let report = cli(&["world", "report", current.path()], None);
    assert!(report.status.success());
    assert_eq!(json(&report.stdout)["tick"], 32);
    assert!(
        json(&report.stdout)["summary"]["deliveries"]
            .as_u64()
            .unwrap()
            > 0
    );
    let link = cli(&["world", "link", current.path()], None);
    assert!(link.status.success());
    let link = json(&link.stdout);
    assert_eq!(link["schema"], "platonik-world-link-v1");
    let url = link["url"].as_str().unwrap();
    assert!(url.starts_with("https://platonik.space/play/w/"));
    let opened = cli(&["world", "open-link", url], None);
    assert!(opened.status.success());
    assert_eq!(json(&opened.stdout), json(&advanced.stdout));
}

#[test]
fn algal_planner_proposals_replay_before_world_admission() {
    let organism = cli(&["world", "organism"], None);
    assert!(organism.status.success());
    assert_eq!(json(&organism.stdout)["contract"], "algal.organism.v1");

    let created = cli(&["world", "new", "Algalight"], None);
    assert!(created.status.success());
    let world = InputFile::new(&created.stdout);
    let responses = InputFile::new(br#"{"planner":{"kind":"advance","ticks":16}}"#);
    let proposed = cli(
        &[
            "world",
            "propose",
            world.path(),
            "--responses",
            responses.path(),
        ],
        None,
    );
    assert!(
        proposed.status.success(),
        "{}",
        String::from_utf8_lossy(&proposed.stderr)
    );
    let proposal = json(&proposed.stdout);
    assert_eq!(proposal["schema"], "platonik-algal-proposal-v1");
    assert_eq!(
        proposal["world_hash"],
        json(&cli(&["world", "report", world.path()], None).stdout)["world_hash"]
    );
    assert_eq!(
        proposal["command"],
        json(br#"{"kind":"advance","ticks":16}"#)
    );
    assert_eq!(proposal["receipt"]["contract"], "algal.run.v1");
    assert_eq!(proposal["receipt"]["outcome"], "complete");

    let proposal_file = InputFile::new(&proposed.stdout);
    let accepted = cli(
        &["world", "accept", world.path(), proposal_file.path()],
        None,
    );
    assert!(
        accepted.status.success(),
        "{}",
        String::from_utf8_lossy(&accepted.stderr)
    );
    assert_eq!(json(&accepted.stdout)["revision"], 1);
    let accepted_world = InputFile::new(&accepted.stdout);
    let report = cli(&["world", "report", accepted_world.path()], None);
    assert!(report.status.success());
    let accepted_report = json(&report.stdout);
    assert_eq!(accepted_report["tick"], 16);

    let stale = cli(
        &[
            "world",
            "accept",
            accepted_world.path(),
            proposal_file.path(),
        ],
        None,
    );
    assert_eq!(stale.status.code(), Some(2));
    assert!(stale.stdout.is_empty());

    let mut transplanted = proposal.clone();
    transplanted["world_hash"] = accepted_report["world_hash"].clone();
    transplanted["revision"] = Value::from(1);
    let transplanted = InputFile::new(&serde_json::to_vec(&transplanted).unwrap());
    let rejected = cli(
        &[
            "world",
            "accept",
            accepted_world.path(),
            transplanted.path(),
        ],
        None,
    );
    assert_eq!(rejected.status.code(), Some(2));
    assert!(rejected.stdout.is_empty());

    let mut altered = proposal;
    altered["command"]["ticks"] = Value::from(17);
    let altered = InputFile::new(&serde_json::to_vec(&altered).unwrap());
    let rejected = cli(&["world", "accept", world.path(), altered.path()], None);
    assert_eq!(rejected.status.code(), Some(2));
    assert!(rejected.stdout.is_empty());
}

#[test]
fn algal_host_plugins_are_optional_and_process_executors_are_rejected() {
    let created = cli(&["world", "new"], None);
    assert!(created.status.success());
    let world = InputFile::new(&created.stdout);
    let host = InputFile::new(
        br#"{"contract":"algal.host.v1","executors":{"offline":{"kind":"scripted","responses":{"planner":{"kind":"advance","ticks":8}}}}}"#,
    );
    let proposed = cli(
        &["world", "propose", world.path(), "--host", host.path()],
        None,
    );
    assert!(
        proposed.status.success(),
        "{}",
        String::from_utf8_lossy(&proposed.stderr)
    );
    assert_eq!(json(&proposed.stdout)["command"]["ticks"], 8);

    let process_host = InputFile::new(
        br#"{"contract":"algal.host.v1","executors":{"process":{"kind":"command","argv":["false"]}}}"#,
    );
    let rejected = cli(
        &[
            "world",
            "propose",
            world.path(),
            "--host",
            process_host.path(),
        ],
        None,
    );
    assert_eq!(rejected.status.code(), Some(2));
    assert!(rejected.stdout.is_empty());
    assert!(
        String::from_utf8(rejected.stderr)
            .unwrap()
            .contains("admits only scripted")
    );

    let invalid = InputFile::new(br#"{"planner":{"kind":"advance","ticks":0}}"#);
    let rejected = cli(
        &[
            "world",
            "propose",
            world.path(),
            "--responses",
            invalid.path(),
        ],
        None,
    );
    assert_eq!(rejected.status.code(), Some(2));
    assert!(rejected.stdout.is_empty());
}

#[cfg(unix)]
#[test]
fn non_utf8_arguments_are_structured_errors_instead_of_panics() {
    use std::os::unix::ffi::OsStringExt;
    let output = Command::new(env!("CARGO_BIN_EXE_platonik"))
        .env("HRANESS_SUPPORT", "off")
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
            .env("HRANESS_SUPPORT", "off")
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
