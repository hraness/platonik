use platonik_core::{check, fixtures, model::Experiment, suite};
use serde::Serialize;
use serde::de::DeserializeOwned;
use std::env;
use std::fs::{self, Metadata, OpenOptions};
use std::io::{self, Read, Write};
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;
use std::path::Path;
use std::process::ExitCode;
use std::time::Instant;

mod expedition_store;
mod habitat_store;
mod journal;

const MAX_EXPERIMENT_BYTES: u64 = 65_536;
const MAX_RECEIPT_BYTES: u64 = 32 * 1024 * 1024;
const HELP: &str = "Platonik — a bounded, local engineering laboratory\n\n\
Usage:\n\
  platonik examples                 List editable experiment references as JSON\n\
  platonik example <id>             Print an experiment as JSON\n\
  platonik run <experiment.json|->  Run an experiment and print its full receipt\n\
  platonik verify <receipt.json|->  Recompute and independently check a receipt\n\
  platonik inspect <receipt.json|-> Verify, then print compact replay maps\n\
  platonik suite [bridge-v1]        Run the frozen engineering validation suite\n\
  platonik expedition help          Show durable local expedition commands\n\
  platonik habitat help             Show continuous-habitat checkpoint commands\n\
  platonik --metrics <command...>   Emit process execution metrics on stderr\n\
  platonik --help                   Show this help\n\
  platonik --version                Show the CLI version\n\n\
JSON commands write to stdout; errors are JSON on stderr. Expedition/habitat commands\n\
write only their selected store; the other commands do not write files.\n\
Use a new output filename when redirecting stdout.\n\
Input '-' reads bounded JSON from stdin. Experiments: at most 64 KiB; receipts:\n\
at most 32 MiB. Exit 0 means success, 1 means a valid experiment or suite\n\
missed its goal, and 2 means invalid input or an operational error.\n\
An honestly failed experiment can verify successfully: verification checks\n\
integrity and recomputation, independently of mission success.\n\n\
This is a bounded Rust prototype, not the full campaign or a hosted ranking.\n";

const EXPEDITION_HELP: &str = "Durable local Platonik expeditions\n\n\
  platonik expedition init <new-dir> <name> <frugal|resilient>\n\
  platonik expedition status <dir>\n\
  platonik expedition verify <dir>\n\
  platonik expedition cases\n\
  platonik expedition case <id>\n\
  platonik expedition act <dir> <command.json|-> --expect-revision N --request-id ID\n\
  platonik expedition recover <dir> --expect-revision N --request-id ID\n\
  platonik expedition export <dir>\n\
  platonik expedition import <bundle.json|-> <new-dir>\n\n\
Commands are grow, trial, or freeze JSON objects. Status includes creations,\n\
programs, ancestry, trials, remaining work, and progress. A trial first commits\n\
its intent and fuel reservation, then its result. Honest failed trials remain\n\
charged. Reuse the same request ID, exact command, and original expected revision\n\
to retry an act safely. Recovery uses the pending request ID and current revision.\n\
Stale or differently reused requests fail. A successful trial advances revision\n\
twice; grow and freeze advance it once. Read the returned revision.\n\n\
status, verify, export, and mutation admission replay the bounded journal and\n\
recompute recorded receipts; they consume real CPU, not new discovery allowance.\n\
Stores use immutable content objects and a synced append-only journal. Parents\n\
are preserved. Store paths cannot traverse symlinks; malicious concurrent directory\n\
replacement is outside this local contract. Limits: 32 trials, 1,000,000 modeled\n\
work, 257 entries, 1,024 files, 256 MiB store, 32 MiB object, 64 MiB export/import.\n\
A valid store can exceed the export limit; preserve it if export is rejected.\n";

const HABITAT_HELP: &str = "Checked continuous Platonik habitats\n\n\
  platonik habitat init <new-dir> <experiment.json|->\n\
  platonik habitat status <dir>\n\
  platonik habitat verify <dir>\n\
  platonik habitat journey <dir>\n\
  platonik habitat answer <receipt.json|->\n\
  platonik habitat ark <dir>\n\
  platonik habitat ark-check <receipt.json|->\n\
  platonik habitat arithmetic-case <a> <b> <tap>\n\
  platonik habitat cases\n\
  platonik habitat case <id>\n\
  platonik habitat prepare <case-id> <expedition-dir>\n\
  platonik habitat advance <dir> --until N --expect-revision N --request-id ID\n\
  platonik habitat recover <dir> --expect-revision N --request-id ID\n\
  platonik habitat export <dir>\n\
  platonik habitat import <bundle.json|-> <new-dir>\n\n\
Init loads an immutable experiment at tick zero and revision zero. Advance to\n\
an absolute later tick, preserving the actual physical state, queues, memories,\n\
materials, partial assemblies, event clock, spent work, and original fuel cap.\n\
Construction cases use v3 parent actions; no CLI command injects a child.\n\
At most eight advances and 128\n\
total ticks are admitted. Paused is not mission success. A finished failed run\n\
cannot be refueled or continued; its evidence remains available.\n\n\
Each advance commits intent before execution and completion afterward, using\n\
two revisions. Retry with the same request ID, until, and original expected\n\
revision. Recover uses pending_request_id and the current revision from status.\n\
Reports show current state/costs and artifact identities; full traces are in\n\
exported bundles. Verify/import replay the journal, never trust a caller State.\n\n\
Journey reads checked First Answer progress without changing the save. Answer\n\
freshly verifies a standalone receipt and prints the same journey grade. Both\n\
return exit 0 for valid evidence, including an unfinished or failed journey;\n\
inspect answered and service_passed separately. The authored ending requires\n\
the complete successful horizon. These commands do not run the full campaign.\n\n\
Ark reads checked arithmetic and service progress without changing the save.\n\
Ark-check freshly verifies a standalone ark receipt. Both return exit 0 for\n\
valid evidence, including failed control; inspect arithmetic_passed,\n\
service_passed, and control_passed separately. Arithmetic-case prints an\n\
experiment without running it: operands a/b are 0..15; tap is 0 (sum LSB) or\n\
4 (carry). This is one four-bit addition, not a stored-program computer.\n\n\
Prepare verifies an expedition's frozen pair and prints a case Experiment with\n\
those courier/controller programs. It does not modify that separate collection\n\
or authenticate ownership. A missing controller is supplied in its child\n\
blueprint and must still be built. Use a new filename for redirected output.\n\n\
Exit 1 means init/advance/recover finished with a valid mission failure; a valid\n\
failed habitat can status/verify/import with exit 0. Exit 2 is invalid input,\n\
stale revision, corruption, or an operational error. Prefix --metrics to count\n\
actual engine executions including history/prefix replays. Reads advance no\n\
physical time. Objects: 32 MiB; export/import: 64 MiB; local store: 256 MiB.\n\
Existing expedition-v1 saves remain a separate format.\n";

#[derive(Serialize)]
struct ErrorReport<'a> {
    schema: &'static str,
    error: ErrorDetail<'a>,
}

#[derive(Serialize)]
struct ErrorDetail<'a> {
    code: &'static str,
    message: &'a str,
}

#[derive(Serialize)]
struct Examples {
    schema: &'static str,
    examples: Vec<&'static str>,
}

struct Failure {
    code: &'static str,
    message: String,
}

impl Failure {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

fn validate_input_file(metadata: &Metadata, limit: u64) -> Result<(), Failure> {
    if !metadata.is_file() {
        return Err(Failure::new(
            "invalid_input",
            "Input must be a regular file, or '-' for stdin.",
        ));
    }
    if metadata.len() > limit {
        return Err(Failure::new(
            "input_limit",
            format!("Input exceeds the {limit}-byte limit."),
        ));
    }
    Ok(())
}

fn read_json<T: DeserializeOwned>(path: &str, limit: u64) -> Result<T, Failure> {
    let mut bytes = Vec::new();
    let reader: Box<dyn Read> = if path == "-" {
        Box::new(io::stdin())
    } else {
        let before_open =
            fs::metadata(path).map_err(|error| Failure::new("input_io", error.to_string()))?;
        validate_input_file(&before_open, limit)?;
        let mut options = OpenOptions::new();
        options.read(true);
        // Prevent a path replaced with a FIFO between metadata and open from
        // blocking before the opened-file check. Explicit stdin may still wait.
        #[cfg(unix)]
        options.custom_flags(libc::O_NONBLOCK);
        let file = options
            .open(path)
            .map_err(|error| Failure::new("input_io", error.to_string()))?;
        let metadata = file
            .metadata()
            .map_err(|error| Failure::new("input_io", error.to_string()))?;
        validate_input_file(&metadata, limit)?;
        Box::new(file)
    };
    reader
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| Failure::new("input_io", error.to_string()))?;
    if bytes.len() as u64 > limit {
        return Err(Failure::new(
            "input_limit",
            format!("Input exceeds the {limit}-byte limit."),
        ));
    }
    serde_json::from_slice(&bytes).map_err(|error| Failure::new("invalid_json", error.to_string()))
}

fn print_json<T: Serialize>(value: &T) -> Result<(), Failure> {
    let stdout = io::stdout();
    let mut output = stdout.lock();
    serde_json::to_writer_pretty(&mut output, value)
        .map_err(|error| Failure::new("output_io", error.to_string()))?;
    output
        .write_all(b"\n")
        .map_err(|error| Failure::new("output_io", error.to_string()))
}

fn print_text(value: &str) -> Result<(), Failure> {
    io::stdout()
        .lock()
        .write_all(value.as_bytes())
        .map_err(|error| Failure::new("output_io", error.to_string()))
}

fn print_receipt(receipt: &check::Receipt) -> Result<(), Failure> {
    let mut bytes = serde_json::to_vec_pretty(receipt)
        .map_err(|error| Failure::new("output_json", error.to_string()))?;
    bytes.push(b'\n');
    if bytes.len() as u64 > MAX_RECEIPT_BYTES {
        return Err(Failure::new(
            "receipt_limit",
            "Receipt exceeds the symmetric 32 MiB export/import limit.",
        ));
    }
    io::stdout()
        .lock()
        .write_all(&bytes)
        .map_err(|error| Failure::new("output_io", error.to_string()))
}

fn execute(args: &[String]) -> Result<u8, Failure> {
    match args {
        [command, rest @ ..] if command == "expedition" => execute_expedition(rest),
        [command, rest @ ..] if command == "habitat" => execute_habitat(rest),
        [] => {
            print_text(HELP)?;
            Ok(0)
        }
        [command] if command == "help" || command == "--help" || command == "-h" => {
            print_text(HELP)?;
            Ok(0)
        }
        [command] if command == "--version" => {
            print_text(concat!("platonik ", env!("CARGO_PKG_VERSION"), "\n"))?;
            Ok(0)
        }
        [command] if command == "examples" => {
            print_json(&Examples {
                schema: "platonik-examples-v1",
                examples: fixtures::names(),
            })?;
            Ok(0)
        }
        [command, id] if command == "example" => {
            let experiment =
                fixtures::experiment(id).map_err(|error| Failure::new("unknown_example", error))?;
            print_json(&experiment)?;
            Ok(0)
        }
        [command, path] if command == "run" => {
            let experiment: Experiment = read_json(path, MAX_EXPERIMENT_BYTES)?;
            let receipt = check::make_receipt(&experiment)
                .map_err(|error| Failure::new("invalid_experiment", error))?;
            print_receipt(&receipt)?;
            Ok(if receipt.passed() { 0 } else { 1 })
        }
        [command, path] if command == "verify" => {
            let receipt: check::Receipt = read_json(path, MAX_RECEIPT_BYTES)?;
            let report = check::verify_receipt(&receipt)
                .map_err(|error| Failure::new("invalid_receipt", error))?;
            print_json(&report)?;
            Ok(0)
        }
        [command, path] if command == "inspect" => {
            let receipt: check::Receipt = read_json(path, MAX_RECEIPT_BYTES)?;
            check::verify_receipt(&receipt)
                .map_err(|error| Failure::new("invalid_receipt", error))?;
            print_text(&check::render_receipt(&receipt))?;
            Ok(0)
        }
        [command] if command == "suite" => run_suite("bridge-v1"),
        [command, id] if command == "suite" => run_suite(id),
        _ => Err(Failure::new(
            "usage",
            "Unknown command or argument count. Run 'platonik --help'.",
        )),
    }
}

fn execute_expedition(args: &[String]) -> Result<u8, Failure> {
    let error = |message| Failure::new("invalid_expedition", message);
    let emit = |report: expedition_store::Report| -> Result<u8, Failure> {
        let code = if report.operation_passed == Some(false) {
            1
        } else {
            0
        };
        print_json(&report)?;
        Ok(code)
    };
    let revision = |value: &str| {
        value
            .parse::<u64>()
            .map_err(|_| Failure::new("usage", "Expected revision must be an unsigned integer."))
    };
    match args {
        [] => {
            print_text(EXPEDITION_HELP)?;
            Ok(0)
        }
        [command] if matches!(command.as_str(), "help" | "--help" | "-h") => {
            print_text(EXPEDITION_HELP)?;
            Ok(0)
        }
        [command, dir, name, ambition] if command == "init" => {
            let ambition = match ambition.as_str() {
                "frugal" => platonik_core::expedition::Ambition::Frugal,
                "resilient" => platonik_core::expedition::Ambition::Resilient,
                _ => {
                    return Err(Failure::new(
                        "usage",
                        "Ambition must be frugal or resilient.",
                    ));
                }
            };
            emit(
                expedition_store::initialize(Path::new(dir), name.clone(), ambition)
                    .map_err(error)?,
            )
        }
        [command, dir] if command == "status" || command == "verify" => {
            emit(expedition_store::status(Path::new(dir)).map_err(error)?)
        }
        [command] if command == "cases" => {
            print_json(&Examples {
                schema: "platonik-expedition-cases-v1",
                examples: expedition_store::cases(),
            })?;
            Ok(0)
        }
        [command, id] if command == "case" => {
            print_json(&expedition_store::case(id).map_err(error)?)?;
            Ok(0)
        }
        [command, dir, input, expected_flag, expected, id_flag, id]
            if command == "act"
                && expected_flag == "--expect-revision"
                && id_flag == "--request-id" =>
        {
            let command = read_json(input, MAX_EXPERIMENT_BYTES)?;
            emit(
                expedition_store::act(Path::new(dir), command, revision(expected)?, id)
                    .map_err(error)?,
            )
        }
        [command, dir, expected_flag, expected, id_flag, id]
            if command == "recover"
                && expected_flag == "--expect-revision"
                && id_flag == "--request-id" =>
        {
            emit(
                expedition_store::recover(Path::new(dir), revision(expected)?, id)
                    .map_err(error)?,
            )
        }
        [command, dir] if command == "export" => {
            let bytes = expedition_store::export(Path::new(dir)).map_err(error)?;
            io::stdout()
                .lock()
                .write_all(&bytes)
                .map_err(|cause| Failure::new("output_io", cause.to_string()))?;
            Ok(0)
        }
        [command, input, dir] if command == "import" => {
            let bundle = read_json(input, expedition_store::MAX_BUNDLE_BYTES)?;
            emit(expedition_store::import(bundle, Path::new(dir)).map_err(error)?)
        }
        _ => Err(Failure::new(
            "usage",
            "Unknown expedition command or arguments. Run 'platonik expedition help'.",
        )),
    }
}

fn execute_habitat(args: &[String]) -> Result<u8, Failure> {
    let error = |message| Failure::new("invalid_habitat", message);
    let emit = |report: habitat_store::Report, operation: bool| -> Result<u8, Failure> {
        let failed = operation && report.phase == "finished" && !report.mission_passed;
        print_json(&report)?;
        Ok(if failed { 1 } else { 0 })
    };
    let revision = |value: &str| {
        value
            .parse::<u64>()
            .map_err(|_| Failure::new("usage", "Expected revision must be an unsigned integer."))
    };
    match args {
        [] => {
            print_text(HABITAT_HELP)?;
            Ok(0)
        }
        [command] if matches!(command.as_str(), "help" | "--help" | "-h") => {
            print_text(HABITAT_HELP)?;
            Ok(0)
        }
        [command, dir, input] if command == "init" => {
            let experiment = read_json(input, MAX_EXPERIMENT_BYTES)?;
            emit(
                habitat_store::initialize(Path::new(dir), experiment).map_err(error)?,
                true,
            )
        }
        [command, dir] if command == "status" || command == "verify" => {
            emit(habitat_store::status(Path::new(dir)).map_err(error)?, false)
        }
        [command, dir] if command == "journey" => {
            print_json(&habitat_store::journey(Path::new(dir)).map_err(error)?)?;
            Ok(0)
        }
        [command, input] if command == "answer" => {
            let receipt: check::Receipt = read_json(input, MAX_RECEIPT_BYTES)?;
            print_json(&platonik_core::first_answer::grade_receipt(&receipt).map_err(error)?)?;
            Ok(0)
        }
        [command, dir] if command == "ark" => {
            print_json(&habitat_store::ark(Path::new(dir)).map_err(error)?)?;
            Ok(0)
        }
        [command, input] if command == "ark-check" => {
            let receipt: check::Receipt = read_json(input, MAX_RECEIPT_BYTES)?;
            print_json(&platonik_core::ark_control::grade_receipt(&receipt).map_err(error)?)?;
            Ok(0)
        }
        [command, a, b, tap] if command == "arithmetic-case" => {
            let parse = |value: &str| -> Result<u8, Failure> {
                if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
                    return Err(error(
                        "Arithmetic operands and tap must be decimal integers.".into(),
                    ));
                }
                value
                    .parse()
                    .map_err(|_| error("Arithmetic operands and tap exceed their bounds.".into()))
            };
            let experiment =
                platonik_core::ark_fixtures::arithmetic_case(parse(a)?, parse(b)?, parse(tap)?)
                    .map_err(error)?;
            print_json(&experiment)?;
            Ok(0)
        }
        [command] if command == "cases" => {
            print_json(&Examples {
                schema: "platonik-habitat-cases-v1",
                examples: habitat_store::cases(),
            })?;
            Ok(0)
        }
        [command, id] if command == "case" => {
            print_json(&habitat_store::case(id).map_err(error)?)?;
            Ok(0)
        }
        [command, id, source] if command == "prepare" => {
            print_json(&habitat_store::prepare(id, Path::new(source)).map_err(error)?)?;
            Ok(0)
        }
        [
            command,
            dir,
            until_flag,
            until,
            expected_flag,
            expected,
            id_flag,
            id,
        ] if command == "advance"
            && until_flag == "--until"
            && expected_flag == "--expect-revision"
            && id_flag == "--request-id" =>
        {
            let until = until
                .parse::<u32>()
                .map_err(|_| Failure::new("usage", "Until must be an unsigned tick."))?;
            emit(
                habitat_store::advance(Path::new(dir), until, revision(expected)?, id)
                    .map_err(error)?,
                true,
            )
        }
        [command, dir, expected_flag, expected, id_flag, id]
            if command == "recover"
                && expected_flag == "--expect-revision"
                && id_flag == "--request-id" =>
        {
            emit(
                habitat_store::recover(Path::new(dir), revision(expected)?, id).map_err(error)?,
                true,
            )
        }
        [command, dir] if command == "export" => {
            let bytes = habitat_store::export(Path::new(dir)).map_err(error)?;
            io::stdout()
                .lock()
                .write_all(&bytes)
                .map_err(|cause| Failure::new("output_io", cause.to_string()))?;
            Ok(0)
        }
        [command, input, dir] if command == "import" => {
            let bundle = read_json(input, habitat_store::MAX_BUNDLE_BYTES)?;
            emit(
                habitat_store::import(bundle, Path::new(dir)).map_err(error)?,
                false,
            )
        }
        _ => Err(Failure::new(
            "usage",
            "Unknown habitat command or arguments. Run 'platonik habitat help'.",
        )),
    }
}

fn run_suite(id: &str) -> Result<u8, Failure> {
    let report = suite::run_suite(id).map_err(|error| Failure::new("invalid_suite", error))?;
    print_json(&report)?;
    Ok(if report.passed { 0 } else { 1 })
}

fn main() -> ExitCode {
    let started = Instant::now();
    let mut arguments = env::args_os().skip(1).peekable();
    let metrics = arguments
        .peek()
        .is_some_and(|argument| argument == "--metrics");
    if metrics {
        arguments.next();
    }
    let args: Result<Vec<String>, Failure> = arguments
        .map(|argument| {
            argument
                .into_string()
                .map_err(|_| Failure::new("usage", "Command arguments must be valid UTF-8."))
        })
        .collect();
    let result = args.and_then(|args| execute(&args));
    let exit = match result {
        Ok(code) => ExitCode::from(code),
        Err(failure) => {
            let report = ErrorReport {
                schema: "platonik-error-v1",
                error: ErrorDetail {
                    code: failure.code,
                    message: &failure.message,
                },
            };
            let mut stderr = io::stderr().lock();
            let _ = serde_json::to_writer(&mut stderr, &report);
            let _ = stderr.write_all(b"\n");
            ExitCode::from(2)
        }
    };
    if metrics {
        let metric = serde_json::json!({
            "schema": "platonik-process-metrics-v1",
            "engine_executions": platonik_core::sim::execution_count(),
            "elapsed_micros": started.elapsed().as_micros(),
        });
        let mut stderr = io::stderr().lock();
        let _ = serde_json::to_writer(&mut stderr, &metric);
        let _ = stderr.write_all(b"\n");
    }
    exit
}
