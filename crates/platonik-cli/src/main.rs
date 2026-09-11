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
  platonik --metrics <command...>   Emit process execution metrics on stderr\n\
  platonik --help                   Show this help\n\
  platonik --version                Show the CLI version\n\n\
JSON commands write to stdout; errors are JSON on stderr. Expedition commands\n\
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
