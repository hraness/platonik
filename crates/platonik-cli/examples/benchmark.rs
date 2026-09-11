//! Run with `cargo run --release --locked --offline -p platonik-cli --example benchmark`.
//! This fixed-shape local benchmark is evidence, not a claim about larger worlds.
use platonik_core::check::{artifact_hash, make_receipt, verify_receipt};
use platonik_core::fixtures::experiment;
use platonik_core::model::*;
use serde::Serialize;
use std::time::Instant;

const SAMPLES: usize = 30;

#[derive(Serialize)]
struct Distribution {
    p50_ms: f64,
    p95_ms: f64,
}

#[derive(Serialize)]
struct WorkloadReport {
    id: String,
    experiment_hash: String,
    experiment_bytes: usize,
    experiment: Experiment,
    passed: bool,
    primitive_work: u64,
    receipt_bytes: usize,
    peak_pending_messages: usize,
    rejected_full_signal_events: usize,
    make_receipt: Distribution,
    serialize_receipt: Distribution,
    verify_receipt: Distribution,
    end_to_end: Distribution,
}

#[derive(Serialize)]
struct BenchmarkReport {
    schema: &'static str,
    protocol: &'static str,
    samples_per_workload: usize,
    warmups_per_workload: usize,
    build_profile: &'static str,
    target_os: &'static str,
    target_arch: &'static str,
    memory_diagnostics: bool,
    scope: &'static str,
    workloads: Vec<WorkloadReport>,
}

struct Sample {
    make_ms: f64,
    serialize_ms: f64,
    verify_ms: f64,
    total_ms: f64,
    passed: bool,
    work: u64,
    bytes: usize,
    result_hash: String,
    peak_pending: usize,
    full_events: usize,
}

fn milliseconds(start: Instant) -> f64 {
    start.elapsed().as_secs_f64() * 1000.0
}

fn memory_probe(phase: &str, sample: usize) -> Result<(), String> {
    let output = std::process::Command::new("ps")
        .args(["-o", "rss=", "-p", &std::process::id().to_string()])
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err("ps memory diagnostic failed".into());
    }
    let rss_kib: u64 = std::str::from_utf8(&output.stdout)
        .map_err(|error| error.to_string())?
        .trim()
        .parse::<u64>()
        .map_err(|error| error.to_string())?;
    eprintln!(
        "{}",
        serde_json::json!({"diagnostic":"resident-memory", "phase":phase, "sample":sample, "rss_kib":rss_kib})
    );
    Ok(())
}

fn sample(experiment: &Experiment, index: usize, diagnostics: bool) -> Result<Sample, String> {
    if diagnostics {
        memory_probe("before_sample", index)?;
    }
    let total = Instant::now();
    let start = Instant::now();
    let receipt = make_receipt(experiment)?;
    let make_ms = milliseconds(start);
    if diagnostics {
        memory_probe("after_receipt", index)?;
    }
    let start = Instant::now();
    let serialized = serde_json::to_vec(&receipt).map_err(|error| error.to_string())?;
    let serialize_ms = milliseconds(start);
    if diagnostics {
        memory_probe("after_serialization", index)?;
    }
    let start = Instant::now();
    let verification = verify_receipt(&receipt)?;
    let verify_ms = milliseconds(start);
    let total_ms = milliseconds(total);
    if diagnostics {
        memory_probe("after_verification", index)?;
    }
    if !verification.verified {
        return Err("benchmark received an unverified receipt".into());
    }
    let sample = Sample {
        make_ms,
        serialize_ms,
        verify_ms,
        total_ms,
        passed: receipt.passed(),
        work: receipt.result.costs.total(),
        bytes: serialized.len(),
        peak_pending: receipt
            .result
            .frames
            .iter()
            .map(|frame| frame.state.pending.len())
            .max()
            .unwrap_or(0),
        full_events: receipt
            .result
            .frames
            .iter()
            .flat_map(|frame| &frame.signals)
            .filter(|event| event.outcome == "full")
            .count(),
        result_hash: receipt.result_hash.clone(),
    };
    drop(receipt);
    drop(serialized);
    drop(verification);
    if diagnostics {
        memory_probe("after_drop", index)?;
    }
    Ok(sample)
}

fn distribution(values: impl Iterator<Item = f64>) -> Distribution {
    let mut values: Vec<_> = values.collect();
    values.sort_by(f64::total_cmp);
    let middle = values.len() / 2;
    let p50_ms = if values.len().is_multiple_of(2) {
        (values[middle - 1] + values[middle]) / 2.0
    } else {
        values[middle]
    };
    // Nearest-rank p95; percentiles are computed from individual sample timings.
    let rank = (values.len() * 95).div_ceil(100) - 1;
    Distribution {
        p50_ms,
        p95_ms: values[rank],
    }
}

fn benchmark(
    id: &str,
    experiment: Experiment,
    options: &Options,
) -> Result<WorkloadReport, String> {
    let experiment_hash = artifact_hash(&experiment)?;
    let experiment_bytes = serde_json::to_vec(&experiment)
        .map_err(|error| error.to_string())?
        .len();
    if options.warmups == 1 {
        sample(&experiment, 0, false)?;
    }
    let mut samples: Vec<Sample> = Vec::with_capacity(options.samples);
    for index in 0..options.samples {
        let probe = options.memory_diagnostics && (index == 0 || index + 1 == options.samples);
        let measured = sample(&experiment, index + 1, probe)?;
        if let Some(first) = samples.first()
            && (measured.result_hash != first.result_hash
                || measured.bytes != first.bytes
                || measured.work != first.work)
        {
            return Err(format!("workload {id} changed between identical runs"));
        }
        samples.push(measured);
    }
    let first = &samples[0];
    Ok(WorkloadReport {
        id: id.into(),
        experiment_hash,
        experiment_bytes,
        experiment,
        passed: first.passed,
        primitive_work: first.work,
        receipt_bytes: first.bytes,
        peak_pending_messages: first.peak_pending,
        rejected_full_signal_events: first.full_events,
        make_receipt: distribution(samples.iter().map(|sample| sample.make_ms)),
        serialize_receipt: distribution(samples.iter().map(|sample| sample.serialize_ms)),
        verify_receipt: distribution(samples.iter().map(|sample| sample.verify_ms)),
        end_to_end: distribution(samples.iter().map(|sample| sample.total_ms)),
    })
}

fn point(x: u8, y: u8) -> Point {
    Point { x, y }
}

fn dense_world() -> Experiment {
    let mut rules = Vec::new();
    for _ in 0..15 {
        rules.push(Rule {
            when: vec![Condition::Memory {
                slot: 0,
                value: 255,
            }],
            action: Action::Wait,
            remember: None,
        });
    }
    rules.push(Rule {
        when: vec![],
        action: Action::Send {
            port: 0,
            bit: BitSource::Constant { value: true },
        },
        remember: None,
    });
    let program = Program { rules };
    let mut cells = Vec::new();
    let mut links = Vec::new();
    for y in 0..4u16 {
        for x in 0..4u16 {
            let id = y * 4 + x + 1;
            cells.push(Cell {
                id,
                position: point(x as u8 + 1, y as u8 + 1),
                heading: Direction::East,
                mobile: false,
                memory: [0; 4],
                program: program.clone(),
            });
            let horizontal = if x < 3 { id + 1 } else { id - 1 };
            let vertical = if y < 3 { id + 4 } else { id - 4 };
            for (offset, neighbor) in [horizontal, vertical].into_iter().enumerate() {
                links.push(Link {
                    id: id * 2 + offset as u16,
                    from: Endpoint::Cell { id, port: 0 },
                    to_cell: neighbor,
                    to_port: 0,
                    delay: 16,
                    enabled: true,
                });
            }
        }
    }
    let sources = (0..8u16)
        .map(|index| Source {
            id: index + 1,
            position: point(index as u8 + 6, 1),
            sparks: (0..16)
                .map(|spark| Spark {
                    id: index as u32 * 16 + spark,
                    bit: spark % 2 == 0,
                })
                .collect(),
        })
        .collect();
    let beacons = (0..8u16)
        .map(|index| Beacon {
            id: index + 1,
            position: point(index as u8 + 6, 2),
            accepts: index % 2 == 0,
            initial_charge: 1000,
            drain_every: 1,
            drain_amount: 1,
            spark_charge: 1,
            required_deliveries: 0,
        })
        .collect();
    let walls = (16..32u8)
        .flat_map(|y| (0..32u8).map(move |x| point(x, y)))
        .collect();
    Experiment {
        version: MODEL_VERSION,
        seed: 0,
        width: 32,
        height: 32,
        walls,
        sources,
        depots: vec![],
        beacons,
        valves: vec![],
        cells,
        links,
        events: vec![],
        ticks: 128,
        fuel: MAX_FUEL,
        activation_fuel: 128,
    }
}

struct Options {
    workload: Option<String>,
    samples: usize,
    warmups: usize,
    memory_diagnostics: bool,
}

fn options() -> Result<Options, String> {
    let mut options = Options {
        workload: None,
        samples: SAMPLES,
        warmups: 1,
        memory_diagnostics: false,
    };
    let mut arguments = std::env::args().skip(1);
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--workload" => {
                options.workload = Some(arguments.next().ok_or("missing workload")?);
            }
            "--samples" => {
                options.samples = arguments
                    .next()
                    .ok_or("missing sample count")?
                    .parse()
                    .map_err(|_| "invalid sample count")?;
            }
            "--warmups" => {
                options.warmups = arguments
                    .next()
                    .ok_or("missing warmup count")?
                    .parse()
                    .map_err(|_| "invalid warmup count")?;
            }
            "--memory-diagnostics" => {
                options.memory_diagnostics = true;
            }
            _ => return Err(format!("unknown benchmark option: {argument}")),
        }
    }
    if !(1..=SAMPLES).contains(&options.samples) || options.warmups > 1 {
        return Err("samples must be 1–30; warmups 0 or 1".into());
    }
    Ok(options)
}

fn run_benchmark() -> Result<BenchmarkReport, String> {
    let options = options()?;
    let mut workloads = Vec::new();
    for id in [
        "opening-normal",
        "opening-wounded",
        "ark-plan-a",
        "ark-plan-b",
    ] {
        if options
            .workload
            .as_deref()
            .is_none_or(|selected| selected == id)
        {
            workloads.push(benchmark(id, experiment(id)?, &options)?);
        }
    }
    if options
        .workload
        .as_deref()
        .is_none_or(|selected| selected == "dense-16-cells-128-ticks")
    {
        workloads.push(benchmark(
            "dense-16-cells-128-ticks",
            dense_world(),
            &options,
        )?);
    }
    if workloads.is_empty() {
        return Err("unknown workload".into());
    }
    Ok(BenchmarkReport {
        schema: "platonik-local-capacity-v1",
        protocol: PROTOCOL,
        samples_per_workload: options.samples,
        warmups_per_workload: options.warmups,
        build_profile: if cfg!(debug_assertions) {
            "debug"
        } else {
            "release"
        },
        target_os: std::env::consts::OS,
        target_arch: std::env::consts::ARCH,
        memory_diagnostics: options.memory_diagnostics,
        scope: "One process, fixed public input shapes. End-to-end covers receipt creation (run plus independent check), in-memory JSON serialization, and verification (fresh run plus check); excludes CLI process startup, filesystem/network I/O, rendering, and deallocation after each sample. p50 is median, p95 nearest rank. Full experiments are included for reproduction. Dense service quotas are zero: it is a capacity probe, not a mission achievement. With memory_diagnostics enabled, ps probes on the first and last sample perturb total timing; those diagnostic timings are not throughput evidence.",
        workloads,
    })
}

fn main() {
    match run_benchmark()
        .and_then(|report| serde_json::to_string_pretty(&report).map_err(|error| error.to_string()))
    {
        Ok(report) => println!("{report}"),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
