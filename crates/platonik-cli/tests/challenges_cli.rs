use serde_json::Value;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_FILE: AtomicU64 = AtomicU64::new(0);

fn scratch(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "platonik-challenges-cli-{}-{}-{name}",
        std::process::id(),
        NEXT_FILE.fetch_add(1, Ordering::Relaxed),
    ))
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

#[test]
fn challenge_surface_lists_shows_and_scores_with_documented_exit_codes() {
    let list = cli(&["challenges"], None);
    assert_eq!(list.status.code(), Some(0));
    let ids = json(&list.stdout);
    assert_eq!(ids["challenges"].as_array().unwrap().len(), 96);
    assert_eq!(
        ids["families"].as_array().unwrap(),
        &vec![
            Value::from("crossing"),
            Value::from("switchboard"),
            Value::from("foundry")
        ]
    );

    let help = cli(&["challenges", "--help"], None);
    assert_eq!(help.status.code(), Some(0));

    let bundle = cli(&["challenge", "challenge-0001"], None);
    assert_eq!(bundle.status.code(), Some(0));
    let bundle = json(&bundle.stdout);
    assert_eq!(bundle["eval"].as_array().unwrap().len(), 4);

    let reference = cli(
        &["challenge", "reference", "challenge-0001", "resilient"],
        None,
    );
    assert_eq!(reference.status.code(), Some(0));

    // A passing submission exits 0; the idle baseline exits 1 with a scored result.
    let passed = cli(
        &["challenge", "eval", "challenge-0001", "-"],
        Some(&reference.stdout),
    );
    assert_eq!(passed.status.code(), Some(0));
    assert_eq!(json(&passed.stdout)["passed"], true);

    let idle = cli(&["challenge", "reference", "challenge-0001", "idle"], None);
    let failed = cli(
        &["challenge", "eval", "challenge-0001", "-"],
        Some(&idle.stdout),
    );
    assert_eq!(failed.status.code(), Some(1));
    assert_eq!(json(&failed.stdout)["passed"], false);

    // A verify of an honestly failed result still exits 0: the evidence checks out.
    let file = scratch("failed.json");
    fs::write(&file, &failed.stdout).unwrap();
    let verified = cli(&["challenge", "verify", file.to_str().unwrap()], None);
    assert_eq!(verified.status.code(), Some(0));
    fs::remove_file(&file).unwrap();

    let invalid = cli(&["challenge", "eval", "challenge-0001", "-"], Some(b"{}"));
    assert_eq!(invalid.status.code(), Some(2));
    let unknown = cli(&["challenge", "challenge-0000"], None);
    assert_eq!(unknown.status.code(), Some(2));
}

/// The foundry family scores construction: its builder reference clears a
/// challenge, the crossing reference is a scored failure, and the switchboard
/// reference is rejected before scoring because its program names a valve.
#[test]
fn foundry_reference_policies_score_and_controls_fail() {
    let bundle = cli(&["challenge", "challenge-0065"], None);
    assert_eq!(bundle.status.code(), Some(0));
    let bundle = json(&bundle.stdout);
    assert_eq!(bundle["family"], "foundry");
    assert_eq!(bundle["editable"], serde_json::json!([4]));

    let builder = cli(
        &["challenge", "reference", "challenge-0065", "builder"],
        None,
    );
    assert_eq!(builder.status.code(), Some(0));
    let passed = cli(
        &["challenge", "eval", "challenge-0065", "-"],
        Some(&builder.stdout),
    );
    assert_eq!(passed.status.code(), Some(0));
    assert_eq!(json(&passed.stdout)["passed"], true);

    let resilient = cli(
        &["challenge", "reference", "challenge-0065", "resilient"],
        None,
    );
    assert_eq!(resilient.status.code(), Some(0));
    let failed = cli(
        &["challenge", "eval", "challenge-0065", "-"],
        Some(&resilient.stdout),
    );
    assert_eq!(failed.status.code(), Some(1));
    assert_eq!(json(&failed.stdout)["passed"], false);

    let keeper = cli(
        &["challenge", "reference", "challenge-0065", "keeper"],
        None,
    );
    assert_eq!(keeper.status.code(), Some(2));
}

#[test]
fn board_verifies_results_and_skips_files_that_are_not_results() {
    let dir = scratch("board");
    fs::create_dir(&dir).unwrap();
    let reference = cli(
        &["challenge", "reference", "challenge-0002", "resilient"],
        None,
    );
    let result = cli(
        &["challenge", "eval", "challenge-0002", "-"],
        Some(&reference.stdout),
    );
    assert_eq!(result.status.code(), Some(0));
    fs::write(dir.join("entrant.json"), &result.stdout).unwrap();
    // Junk that never parses as a result is not an entry.
    fs::write(dir.join("notes.json"), b"{\"hello\":\"world\"}").unwrap();
    fs::write(dir.join("not-json.txt"), b"garbage").unwrap();
    fs::create_dir(dir.join("nested.json")).unwrap();

    let board = cli(&["challenge", "board", dir.to_str().unwrap()], None);
    fs::remove_dir_all(&dir).unwrap();
    assert_eq!(board.status.code(), Some(0));
    let board = json(&board.stdout);
    assert_eq!(board["schema"], "platonik-challenge-board-v1");
    assert_eq!(
        board["challenges"][0]["rows"][0]["entrant"],
        "reference:resilient"
    );
    assert_eq!(board["global"][0]["cleared"], 1);
}
