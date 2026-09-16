use hraness_support_foundation::{CommandResult, Options, SupportProfile};

fn profile() -> SupportProfile {
    SupportProfile {
        id: "platonik".into(),
        name: "Platonik".into(),
        updates: false,
        value_proposition: "Support development of a local engineering laboratory with reproducible habitat experiments.".into(),
    }
}

fn options() -> Options {
    Options {
        command: vec!["platonik".into()],
        ..Options::default()
    }
}

pub fn command(args: &[String]) -> CommandResult {
    hraness_support_foundation::run_support_command(&profile(), args, &options())
}

pub fn completed() {
    let _ = hraness_support_foundation::maybe_show_support_invitation(&profile(), true, &options());
}

/// Classify completed user work; skip help, fixtures, polling, frozen suite
/// probes, metrics/benchmark mode and future commands until explicitly reviewed.
pub fn useful_result(args: &[String], metrics: bool) -> bool {
    if metrics {
        return false;
    }
    matches!(
        (
            args.first().map(String::as_str),
            args.get(1).map(String::as_str),
        ),
        (Some("run" | "verify" | "inspect"), Some(_))
            | (
                Some("expedition"),
                Some("init" | "act" | "recover" | "export" | "import")
            )
            | (
                Some("habitat"),
                Some("init" | "advance" | "recover" | "export" | "import" | "prepare"),
            )
    )
}
