//! Fixed envelope workloads, exported without execution by default. The optional
//! measurement owns only its explicitly counted warmup/sample replays.
use platonik_core::{check, construction, model::*, sim, validate_experiment};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::io::Write;
use std::time::Instant;

const SERIALIZATION_CAPACITY: usize = 8 * 1024 * 1024;

// This diagnostic's two fixed receipts fit within this explicit allocation.
// Retain it across samples and include it in every RSS observation. A future
// larger receipt fails instead of silently taking the allocation-growth path.
struct SerializationBuffer {
    bytes: Vec<u8>,
}

impl SerializationBuffer {
    fn new() -> Self {
        Self {
            bytes: Vec::with_capacity(SERIALIZATION_CAPACITY),
        }
    }
}

impl Write for SerializationBuffer {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        if bytes.len() > SERIALIZATION_CAPACITY - self.bytes.len() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "Receipt exceeds the diagnostic's fixed 8 MiB serialization buffer.",
            ));
        }
        self.bytes.extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

fn rule(when: Vec<Condition>, action: Action) -> Rule {
    Rule {
        when,
        action,
        remember: None,
    }
}
fn fixed_cell(id: u16, position: Point, program: Program) -> Cell {
    Cell {
        id,
        position,
        heading: Direction::East,
        mobile: false,
        memory: [0; 4],
        program,
    }
}
fn builder(blueprint: u16, stock: u16) -> Program {
    Program {
        rules: vec![
            rule(
                vec![Condition::AssemblyStage {
                    blueprint,
                    stage: AssemblyStage::Born,
                }],
                Action::Send {
                    port: 0,
                    bit: BitSource::Constant { value: true },
                },
            ),
            rule(
                vec![Condition::AssemblyStage {
                    blueprint,
                    stage: AssemblyStage::Ready,
                }],
                Action::Activate { blueprint },
            ),
            rule(
                vec![
                    Condition::AssemblyStage {
                        blueprint,
                        stage: AssemblyStage::Absent,
                    },
                    Condition::HasMaterial { value: false },
                ],
                Action::GatherMaterial { stock },
            ),
            rule(vec![], Action::Build { blueprint }),
        ],
    }
}
fn near_cap(blueprint: &mut Blueprint) -> Result<(), String> {
    blueprint.body.cell.program = Program {
        rules: (0..32).map(|_| rule(vec![], Action::Wait)).collect(),
    };
    'fill: for index in 0..32 {
        for _ in 0..8 {
            blueprint.body.cell.program.rules[index]
                .when
                .push(Condition::Memory { slot: 0, value: 0 });
            if construction::payload(blueprint)?.len() > MAX_BLUEPRINT_BYTES {
                blueprint.body.cell.program.rules[index].when.pop();
                break 'fill;
            }
        }
    }
    // Two extra decimal digits per value close the remaining subcondition gap.
    for rule_index in 0..blueprint.body.cell.program.rules.len() {
        for condition_index in 0..blueprint.body.cell.program.rules[rule_index].when.len() {
            blueprint.body.cell.program.rules[rule_index].when[condition_index] =
                Condition::Memory {
                    slot: 0,
                    value: 255,
                };
            if construction::payload(blueprint)?.len() > MAX_BLUEPRINT_BYTES {
                blueprint.body.cell.program.rules[rule_index].when[condition_index] =
                    Condition::Memory { slot: 0, value: 0 };
                break;
            }
        }
    }
    let length = construction::payload(blueprint)?.len();
    if !(4065..=MAX_BLUEPRINT_BYTES).contains(&length) {
        return Err(format!("Near-cap body has unexpected size {length}."));
    }
    Ok(())
}
fn workload(partial: bool) -> Result<Experiment, String> {
    let mut cells = Vec::new();
    let mut stocks = Vec::new();
    let mut blueprints = Vec::new();
    for index in 0..4u16 {
        let position = Point {
            x: 3 + (index % 2) as u8 * 6,
            y: 3 + (index / 2) as u8 * 6,
        };
        let parent = 1 + index;
        let blueprint_id = 40 + index;
        let stock = 50 + index;
        let child = 13 + index;
        let parent_position = Point {
            x: position.x - 1,
            y: position.y,
        };
        cells.push(fixed_cell(
            parent,
            parent_position,
            builder(blueprint_id, stock),
        ));
        cells.push(fixed_cell(
            5 + index * 2,
            Point {
                x: position.x,
                y: position.y - 1,
            },
            Program {
                rules: vec![rule(vec![], Action::Wait)],
            },
        ));
        cells.push(fixed_cell(
            6 + index * 2,
            Point {
                x: position.x + 1,
                y: position.y,
            },
            Program {
                rules: vec![rule(vec![], Action::Wait)],
            },
        ));
        stocks.push(MaterialStock {
            id: stock,
            position: parent_position,
            units: (0..8).map(|unit| 100 + index as u32 * 8 + unit).collect(),
        });
        let mut links = Vec::new();
        for port in 0..4u8 {
            links.push(Link {
                id: index * 8 + port as u16,
                from: Endpoint::Cell {
                    id: parent,
                    port: 0,
                },
                to_cell: child,
                to_port: port,
                delay: 4,
                enabled: true,
            });
            links.push(Link {
                id: index * 8 + 4 + port as u16,
                from: Endpoint::Cell { id: child, port: 0 },
                to_cell: parent,
                to_port: port,
                delay: 4,
                enabled: true,
            });
        }
        let mut blueprint = Blueprint {
            id: blueprint_id,
            body: BlueprintBody {
                cell: fixed_cell(
                    child,
                    position,
                    Program {
                        rules: vec![rule(
                            vec![],
                            Action::Send {
                                port: 0,
                                bit: BitSource::Constant { value: false },
                            },
                        )],
                    },
                ),
                links,
            },
        };
        if partial {
            near_cap(&mut blueprint)?;
        }
        blueprints.push(blueprint);
    }
    let experiment = Experiment {
        version: CONSTRUCTION_VERSION,
        seed: 73,
        width: 13,
        height: 13,
        walls: vec![],
        sources: vec![],
        depots: vec![],
        valves: vec![],
        cells,
        links: vec![],
        events: vec![],
        beacons: vec![Beacon {
            id: 1,
            position: Point { x: 12, y: 12 },
            accepts: false,
            initial_charge: 1000,
            drain_every: 1,
            drain_amount: 1,
            spark_charge: 1,
            required_deliveries: 0,
        }],
        ticks: 128,
        fuel: MAX_FUEL,
        activation_fuel: 128,
        construction: Some(ConstructionSpec { stocks, blueprints }),
    };
    validate_experiment(&experiment)?;
    Ok(experiment)
}
fn inputs() -> Result<Vec<(&'static str, Experiment)>, String> {
    Ok(vec![
        ("four-near-cap-partial", workload(true)?),
        ("four-born-sixteen-live", workload(false)?),
    ])
}
// This host observation is deliberately outside the operation ledger and the
// measured receipt/serialization/replay interval. It is not allocator telemetry.
fn current_rss() -> Value {
    if !cfg!(target_os = "macos") {
        return json!({"bytes":null,"platform":std::env::consts::OS,"source":"ps RSS in KiB","error":"Current RSS sampling is qualified only on macOS."});
    }
    let result = std::process::Command::new("/bin/ps")
        .args(["-o", "rss=", "-p", &std::process::id().to_string()])
        .output();
    match result {
        Ok(output) if output.status.success() => {
            match std::str::from_utf8(&output.stdout)
                .ok()
                .and_then(|value| value.trim().parse::<u64>().ok())
                .and_then(|kib| kib.checked_mul(1024))
            {
                Some(bytes) => {
                    json!({"bytes":bytes,"platform":"macos","source":"ps RSS in KiB","error":null})
                }
                None => {
                    json!({"bytes":null,"platform":"macos","source":"ps RSS in KiB","error":"RSS output was missing, nonnumeric, or out of range."})
                }
            }
        }
        Ok(output) => {
            json!({"bytes":null,"platform":"macos","source":"ps RSS in KiB","error":format!("RSS observation exited with {}.", output.status)})
        }
        Err(error) => {
            json!({"bytes":null,"platform":"macos","source":"ps RSS in KiB","error":error.to_string()})
        }
    }
}
fn sample(
    experiment: &Experiment,
    mut buffer: Option<&mut SerializationBuffer>,
) -> Result<Value, String> {
    let before = sim::execution_count();
    let total_start = Instant::now();
    let start = Instant::now();
    let receipt = check::make_receipt(experiment)?;
    let receipt_ms = start.elapsed().as_secs_f64() * 1000.0;
    let start = Instant::now();
    let serialized = if let Some(buffer) = buffer.as_deref_mut() {
        buffer.bytes.clear();
        serde_json::to_writer(buffer, &receipt).map_err(|error| error.to_string())?;
        None
    } else {
        Some(serde_json::to_vec(&receipt).map_err(|error| error.to_string())?)
    };
    let serialize_ms = start.elapsed().as_secs_f64() * 1000.0;
    let start = Instant::now();
    check::verify_receipt(&receipt)?;
    let verify_ms = start.elapsed().as_secs_f64() * 1000.0;
    let total_ms = total_start.elapsed().as_secs_f64() * 1000.0;
    let receipt_bytes = buffer.as_ref().map_or_else(
        || serialized.as_ref().unwrap().len(),
        |buffer| buffer.bytes.len(),
    );
    let result_hash = receipt.result_hash.clone();
    // These extra identity checks are outside the original comparable timing
    // interval. They still appear in full_sample_ms and process elapsed time.
    let identity_start = Instant::now();
    let serialized_hash = if let Some(buffer) = buffer.as_ref() {
        let observed = format!("sha256:{:x}", Sha256::digest(&buffer.bytes));
        if observed != check::artifact_hash(&receipt)? {
            return Err(
                "Buffered serialization differs from the exact typed receipt bytes.".into(),
            );
        }
        Some(observed)
    } else {
        None
    };
    let identity_check_ms = identity_start.elapsed().as_secs_f64() * 1000.0;
    drop(serialized);
    drop(receipt);
    let full_sample_ms = total_start.elapsed().as_secs_f64() * 1000.0;
    let rss = current_rss();
    let mut record = json!({"receipt_ms":receipt_ms,"serialize_ms":serialize_ms,"verify_ms":verify_ms,"total_ms":total_ms,"receipt_bytes":receipt_bytes,"result_hash":result_hash,"engine_executions":sim::execution_count()-before,"rss_after_release":rss});
    if let Some(hash) = serialized_hash {
        record["serialized_receipt_sha256"] = json!(hash);
        record["serialization_capacity_bytes"] = json!(SERIALIZATION_CAPACITY);
        record["identity_check_ms"] = json!(identity_check_ms);
        record["full_sample_ms"] = json!(full_sample_ms);
    }
    Ok(record)
}
fn main_result() -> Result<(), String> {
    let arguments: Vec<_> = std::env::args().skip(1).collect();
    if arguments.len() > 1
        || arguments.first().is_some_and(|argument| {
            !["--fixtures", "--measure", "--measure-buffered"].contains(&argument.as_str())
        })
    {
        return Err(
            "Usage: construction_capacity [--fixtures|--measure|--measure-buffered]".into(),
        );
    }
    let workloads = inputs()?;
    if arguments
        .first()
        .is_none_or(|argument| argument == "--fixtures")
    {
        println!(
            "{}",
            json!({"schema":"platonik-construction-capacity-inputs-v1","workloads":workloads.iter().map(|(id, experiment)|json!({"id":id,"experiment":experiment})).collect::<Vec<_>>()})
        );
        return Ok(());
    }
    let buffered = arguments
        .first()
        .is_some_and(|argument| argument == "--measure-buffered");
    let mut buffer = buffered.then(SerializationBuffer::new);
    let mut measured = Vec::new();
    for (id, experiment) in workloads {
        let warmup = sample(&experiment, buffer.as_mut())?;
        let samples = (0..30)
            .map(|_| sample(&experiment, buffer.as_mut()))
            .collect::<Result<Vec<_>, _>>()?;
        let mut times: Vec<_> = samples
            .iter()
            .map(|sample| sample["total_ms"].as_f64().unwrap())
            .collect();
        times.sort_by(f64::total_cmp);
        measured.push(json!({"id":id,"experiment_hash":check::artifact_hash(&experiment)?,"experiment":experiment,"warmup":warmup,"samples":samples,"p50_ms":times[14],"p95_ms":times[28]}));
    }
    let mut record = json!({"schema":"platonik-construction-capacity-v1","workloads":measured,"engine_executions":sim::execution_count()});
    if buffered {
        record["schema"] = json!("platonik-construction-capacity-buffered-v1");
        record["buffer_strategy"] = json!("fixed reusable Vec with bounded Write");
        record["buffer_capacity_bytes"] = json!(SERIALIZATION_CAPACITY);
        record["buffer_retained_during_rss"] = json!(true);
    }
    println!("{record}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serialization_buffer_matches_bytes_reuses_capacity_and_rejects_overflow() {
        let mut buffer = SerializationBuffer::new();
        let pointer = buffer.bytes.as_ptr();
        let value = json!({"unicode":"\u{03bb}","nested":[0,u64::MAX],"escaped":"\n\""});
        serde_json::to_writer(&mut buffer, &value).unwrap();
        assert_eq!(buffer.bytes, serde_json::to_vec(&value).unwrap());
        buffer.bytes.resize(SERIALIZATION_CAPACITY - 1, 9);
        assert!(buffer.write_all(&[1, 2]).is_err());
        assert_eq!(buffer.bytes.len(), SERIALIZATION_CAPACITY - 1);
        assert_eq!(buffer.bytes.last(), Some(&9));
        buffer.write_all(&[3]).unwrap();
        assert_eq!(buffer.bytes.len(), SERIALIZATION_CAPACITY);
        assert!(buffer.write_all(&[4]).is_err());
        buffer.bytes.clear();
        serde_json::to_writer(&mut buffer, &value).unwrap();
        assert_eq!(buffer.bytes, serde_json::to_vec(&value).unwrap());
        assert_eq!(buffer.bytes.as_ptr(), pointer);
        assert_eq!(buffer.bytes.capacity(), SERIALIZATION_CAPACITY);
        assert_eq!(sim::execution_count(), 0);
    }
}
fn main() {
    let started = Instant::now();
    let result = main_result();
    eprintln!(
        "{}",
        json!({"schema":"platonik-process-metrics-v1","engine_executions":sim::execution_count(),"elapsed_micros":started.elapsed().as_micros()})
    );
    if let Err(error) = result {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
