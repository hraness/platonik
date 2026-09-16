use serde_json::Value;
use std::{
    fs,
    io::Write,
    path::PathBuf,
    process::{Command, Output, Stdio},
    sync::atomic::{AtomicU64, Ordering},
};
static NEXT: AtomicU64 = AtomicU64::new(0);
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "platonik-support-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn run(&self, args: &[&str], input: Option<&[u8]>, enabled: bool) -> Output {
        let mut command = Command::new(env!("CARGO_BIN_EXE_platonik"));
        command
            .args(args)
            .env("XDG_STATE_HOME", &self.0)
            .env("HRANESS_SUPPORT", if enabled { "on" } else { "off" })
            .env("HRANESS_SUPPORT_AUDIENCE", "agent")
            .stdin(if input.is_some() {
                Stdio::piped()
            } else {
                Stdio::null()
            })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        for key in [
            "CI",
            "CONTINUOUS_INTEGRATION",
            "GITHUB_ACTIONS",
            "TF_BUILD",
            "BUILD_NUMBER",
            "TEAMCITY_VERSION",
            "JENKINS_URL",
        ] {
            command.env_remove(key);
        }
        let mut child = command.spawn().unwrap();
        if let Some(input) = input {
            child.stdin.take().unwrap().write_all(input).unwrap();
        }
        child.wait_with_output().unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn json(bytes: &[u8]) -> Value {
    serde_json::from_slice(bytes).unwrap()
}

#[test]
fn support_is_pure_discoverable_and_has_no_newsletter() {
    let fixture = Fixture::new();
    let result = fixture.run(&["support", "protocol", "--json"], None, true);
    assert!(result.status.success());
    assert!(result.stderr.is_empty());
    let protocol = json(&result.stdout);
    assert_eq!(
        protocol["commands"]["offer"],
        serde_json::json!(["platonik", "support", "offer", "--json"])
    );
    assert_eq!(protocol["offer"]["actions"].as_array().unwrap().len(), 1);
    assert_eq!(
        protocol["offer"]["actions"][0]["url"],
        "https://account.hraness.com/support?product=platonik&source=agent#support"
    );
    assert!(!fixture.0.join("hraness").exists());
    assert!(
        fixture
            .run(&["support", "dismiss"], None, true)
            .status
            .success()
    );
    assert_eq!(
        json(
            &fixture
                .run(&["support", "offer", "--json"], None, true)
                .stdout
        )["reason"],
        "dismissed"
    );
    assert!(
        fixture
            .run(&["support", "--json"], None, true)
            .status
            .success()
    );
}

#[test]
fn agent_discovery_preserves_receipt_stdout_and_skips_probes_failures_and_metrics() {
    let fixture = Fixture::new();
    for args in [&["--help"][..], &["--version"][..], &["examples"][..]] {
        assert!(fixture.run(args, None, true).status.success());
    }
    let example = fixture.run(&["example", "opening-normal"], None, true);
    assert!(example.status.success());
    assert!(example.stderr.is_empty());
    assert_eq!(
        fixture.run(&["run", "-"], Some(b"{}"), true).status.code(),
        Some(2)
    );
    assert!(!fixture.0.join("hraness").exists());
    let measured = fixture.run(&["--metrics", "run", "-"], Some(&example.stdout), true);
    assert!(measured.status.success());
    assert_eq!(
        json(&measured.stderr)["schema"],
        "platonik-process-metrics-v1"
    );
    assert!(!fixture.0.join("hraness").exists());
    let baseline = fixture.run(&["run", "-"], Some(&example.stdout), false);
    let actual = fixture.run(&["run", "-"], Some(&example.stdout), true);
    assert!(actual.status.success());
    assert_eq!(actual.stdout, baseline.stdout);
    assert_eq!(
        json(&actual.stderr)["schemaVersion"],
        "hraness-support-discovery-v1"
    );
    let status = json(
        &fixture
            .run(&["support", "status", "--json"], None, true)
            .stdout,
    );
    assert!(status["lastShownAt"].is_null());
    assert!(status["reservationExpiresAt"].is_null());
}

#[test]
fn optional_storage_failure_preserves_experiment_result() {
    let fixture = Fixture::new();
    fs::write(fixture.0.join("hraness"), "retained").unwrap();
    let example = fixture.run(&["example", "opening-normal"], None, true);
    let baseline = fixture.run(&["run", "-"], Some(&example.stdout), false);
    let result = fixture.run(&["run", "-"], Some(&example.stdout), true);
    assert!(result.status.success());
    assert_eq!(result.stdout, baseline.stdout);
    assert!(result.stderr.is_empty());
    assert_eq!(
        fs::read_to_string(fixture.0.join("hraness")).unwrap(),
        "retained"
    );
}
