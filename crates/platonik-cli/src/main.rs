use platonik_core::{check, fixtures, model::Experiment, suite};
use serde::Serialize;
use serde::de::DeserializeOwned;
use std::env;
use std::fs::{self, Metadata, OpenOptions};
use std::io::{self, Read, Write};
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;
use std::process::ExitCode;

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
  platonik --help                   Show this help\n\
  platonik --version                Show the CLI version\n\n\
JSON commands write to stdout; errors are JSON on stderr. No command writes\n\
or overwrites a file. Use a new output filename when redirecting stdout.\n\
Input '-' reads bounded JSON from stdin. Experiments: at most 64 KiB; receipts:\n\
at most 32 MiB. Exit 0 means success, 1 means a valid experiment or suite\n\
missed its goal, and 2 means invalid input or an operational error.\n\
An honestly failed experiment can verify successfully: verification checks\n\
integrity and recomputation, independently of mission success.\n\n\
This is a stateless Rust prototype, not the full campaign or a hosted ranking.\n";

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

fn run_suite(id: &str) -> Result<u8, Failure> {
    let report = suite::run_suite(id).map_err(|error| Failure::new("invalid_suite", error))?;
    print_json(&report)?;
    Ok(if report.passed { 0 } else { 1 })
}

fn main() -> ExitCode {
    let args: Result<Vec<String>, Failure> = env::args_os()
        .skip(1)
        .map(|argument| {
            argument
                .into_string()
                .map_err(|_| Failure::new("usage", "Command arguments must be valid UTF-8."))
        })
        .collect();
    match args.and_then(|args| execute(&args)) {
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
    }
}
