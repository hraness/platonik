use serde_json::Value;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_FILE: AtomicU64 = AtomicU64::new(0);

const SALT: &str = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const OTHER_SALT: &str = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

fn scratch(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "platonik-seasons-cli-{}-{}-{name}",
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

fn salt_file(name: &str, salt: &str) -> PathBuf {
    let file = scratch(name);
    fs::write(&file, format!("{salt}\n")).unwrap();
    file
}

fn season_fixture(challenges: &str, max_entries: u32) -> (PathBuf, PathBuf, Value) {
    let salt = salt_file("salt.txt", SALT);
    let manifest = scratch("season.json");
    let begin = cli(
        &[
            "season",
            "begin",
            "1",
            challenges,
            &max_entries.to_string(),
            "--salt",
            salt.to_str().unwrap(),
        ],
        None,
    );
    assert_eq!(
        begin.status.code(),
        Some(0),
        "begin failed: {}",
        String::from_utf8_lossy(&begin.stderr)
    );
    fs::write(&manifest, &begin.stdout).unwrap();
    (manifest, salt, json(&begin.stdout))
}

fn entry_submission(agent: &str) -> Vec<u8> {
    let reference = cli(
        &["challenge", "reference", "challenge-0001", "resilient"],
        None,
    );
    assert_eq!(reference.status.code(), Some(0));
    let mut submission = json(&reference.stdout);
    submission["agent"] = serde_json::json!({"name": agent});
    serde_json::to_vec(&submission).unwrap()
}

#[test]
fn season_begin_eval_verify_and_reveal_round_trip() {
    let (manifest, salt, begun) = season_fixture("1-4", 8);
    assert_eq!(begun["schema"], "platonik-challenge-season-v1");
    let commitment = begun["commitment"].as_str().unwrap().to_string();
    assert!(commitment.starts_with("sha256:"));
    // The manifest commits to the salt but never contains it.
    assert!(begun.get("salt").is_none());
    assert!(!String::from_utf8_lossy(&fs::read(&manifest).unwrap()).contains(SALT));

    let show = cli(&["season", "show", manifest.to_str().unwrap()], None);
    assert_eq!(show.status.code(), Some(0));

    // Eval binds cases to (salt, entrant, challenge, entry); a passing program exits 0.
    let submission = entry_submission("github:tester");
    let evaluated = cli(
        &[
            "season",
            "eval",
            manifest.to_str().unwrap(),
            "-",
            "1",
            "--salt",
            salt.to_str().unwrap(),
        ],
        Some(&submission),
    );
    assert_eq!(
        evaluated.status.code(),
        Some(0),
        "eval failed: {}",
        String::from_utf8_lossy(&evaluated.stderr)
    );
    let result = json(&evaluated.stdout);
    assert_eq!(result["result"]["passed"], true);

    let result_file = scratch("result.json");
    fs::write(&result_file, &evaluated.stdout).unwrap();

    // Receipts replay without the salt; the salt additionally checks derivation.
    let structural = cli(
        &[
            "season",
            "verify",
            manifest.to_str().unwrap(),
            result_file.to_str().unwrap(),
        ],
        None,
    );
    assert_eq!(structural.status.code(), Some(0));
    let full = cli(
        &[
            "season",
            "verify",
            manifest.to_str().unwrap(),
            result_file.to_str().unwrap(),
            "--salt",
            salt.to_str().unwrap(),
        ],
        None,
    );
    assert_eq!(full.status.code(), Some(0));

    // A wrong salt fails derivation verification.
    let wrong = salt_file("wrong.txt", OTHER_SALT);
    let mismatched = cli(
        &[
            "season",
            "verify",
            manifest.to_str().unwrap(),
            result_file.to_str().unwrap(),
            "--salt",
            wrong.to_str().unwrap(),
        ],
        None,
    );
    assert_eq!(mismatched.status.code(), Some(2));

    // Reveal prints the manifest carrying the salt; the commitment is unchanged.
    let revealed = cli(
        &[
            "season",
            "reveal",
            manifest.to_str().unwrap(),
            "--salt",
            salt.to_str().unwrap(),
        ],
        None,
    );
    assert_eq!(revealed.status.code(), Some(0));
    let revealed = json(&revealed.stdout);
    assert_eq!(revealed["commitment"].as_str().unwrap(), commitment);
    assert_eq!(revealed["salt"].as_str().unwrap(), SALT);

    // Revealing with the wrong salt is rejected against the commitment.
    let bad_reveal = cli(
        &[
            "season",
            "reveal",
            manifest.to_str().unwrap(),
            "--salt",
            wrong.to_str().unwrap(),
        ],
        None,
    );
    assert_eq!(bad_reveal.status.code(), Some(2));
}

#[test]
fn season_admit_enforces_quota_and_duplicate_hash() {
    let (manifest, salt, _begun) = season_fixture("1-8", 1);
    let results = scratch("results");
    fs::create_dir(&results).unwrap();
    let submission = entry_submission("github:tester");
    let submission_file = scratch("entry.json");
    fs::write(&submission_file, &submission).unwrap();

    // First entry is inside the quota.
    let admit = cli(
        &[
            "season",
            "admit",
            manifest.to_str().unwrap(),
            results.to_str().unwrap(),
            submission_file.to_str().unwrap(),
        ],
        None,
    );
    assert_eq!(
        admit.status.code(),
        Some(0),
        "admit failed: {}",
        String::from_utf8_lossy(&admit.stderr)
    );
    assert_eq!(json(&admit.stdout)["admitted"], true);

    // Score it, commit the result, and re-admitting the same bytes is a duplicate.
    let evaluated = cli(
        &[
            "season",
            "eval",
            manifest.to_str().unwrap(),
            submission_file.to_str().unwrap(),
            "1",
            "--salt",
            salt.to_str().unwrap(),
        ],
        None,
    );
    assert_eq!(evaluated.status.code(), Some(0));
    fs::write(results.join("tester-1.json"), &evaluated.stdout).unwrap();

    let duplicate = cli(
        &[
            "season",
            "admit",
            manifest.to_str().unwrap(),
            results.to_str().unwrap(),
            submission_file.to_str().unwrap(),
        ],
        None,
    );
    assert_eq!(duplicate.status.code(), Some(1));
    assert_eq!(json(&duplicate.stdout)["admitted"], false);

    // A distinct program exhausts the one-entry quota.
    let compact = cli(
        &["challenge", "reference", "challenge-0001", "compact"],
        None,
    );
    assert_eq!(compact.status.code(), Some(0));
    let mut second = json(&compact.stdout);
    second["agent"] = serde_json::json!({"name": "github:tester"});
    let second_file = scratch("entry2.json");
    fs::write(&second_file, serde_json::to_vec(&second).unwrap()).unwrap();
    let over_quota = cli(
        &[
            "season",
            "admit",
            manifest.to_str().unwrap(),
            results.to_str().unwrap(),
            second_file.to_str().unwrap(),
        ],
        None,
    );
    assert_eq!(over_quota.status.code(), Some(1));
    assert_eq!(json(&over_quota.stdout)["reason"], "entry quota reached");
}

#[test]
fn season_board_ranks_verified_results() {
    let (manifest, salt, _begun) = season_fixture("1-8", 8);
    let results = scratch("board");
    fs::create_dir(&results).unwrap();

    for (agent, entry) in [("github:one", 1), ("github:two", 1)] {
        let submission = entry_submission(agent);
        let file = scratch("entry.json");
        fs::write(&file, &submission).unwrap();
        let evaluated = cli(
            &[
                "season",
                "eval",
                manifest.to_str().unwrap(),
                file.to_str().unwrap(),
                &entry.to_string(),
                "--salt",
                salt.to_str().unwrap(),
            ],
            None,
        );
        assert_eq!(evaluated.status.code(), Some(0));
        fs::write(
            results.join(format!("{agent}-{entry}.json")),
            &evaluated.stdout,
        )
        .unwrap();
    }
    fs::write(results.join("notes.json"), b"{\"hello\":\"world\"}").unwrap();

    let board = cli(
        &[
            "season",
            "board",
            manifest.to_str().unwrap(),
            results.to_str().unwrap(),
        ],
        None,
    );
    fs::remove_dir_all(&results).unwrap();
    assert_eq!(board.status.code(), Some(0));
    let board = json(&board.stdout);
    assert_eq!(board["schema"], "platonik-season-board-v1");
    assert_eq!(board["global"].as_array().unwrap().len(), 2);
    assert_eq!(board["global"][0]["cleared"], 1);
}

#[test]
fn season_rejects_malformed_input() {
    let (manifest, salt, _begun) = season_fixture("1-4", 8);
    let garbage = scratch("garbage.json");
    fs::write(&garbage, b"{}").unwrap();

    let bad_show = cli(&["season", "show", garbage.to_str().unwrap()], None);
    assert_eq!(bad_show.status.code(), Some(2));

    let bad_eval = cli(
        &[
            "season",
            "eval",
            manifest.to_str().unwrap(),
            garbage.to_str().unwrap(),
            "1",
            "--salt",
            salt.to_str().unwrap(),
        ],
        None,
    );
    assert_eq!(bad_eval.status.code(), Some(2));

    let short_salt = salt_file("short.txt", "abcd");
    let bad_salt = cli(
        &[
            "season",
            "eval",
            manifest.to_str().unwrap(),
            garbage.to_str().unwrap(),
            "1",
            "--salt",
            short_salt.to_str().unwrap(),
        ],
        None,
    );
    assert_eq!(bad_salt.status.code(), Some(2));
}
