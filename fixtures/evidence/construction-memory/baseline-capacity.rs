//! Fixed envelope workloads, exported without execution by default. The optional
//! measurement owns only its explicitly counted warmup/sample replays.
use platonik_core::{check, construction, model::*, sim, validate_experiment};
use serde_json::{Value, json};
use std::time::Instant;

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
fn sample(experiment: &Experiment) -> Result<Value, String> {
    let before = sim::execution_count();
    let total_start = Instant::now();
    let start = Instant::now();
    let receipt = check::make_receipt(experiment)?;
    let receipt_ms = start.elapsed().as_secs_f64() * 1000.0;
    let start = Instant::now();
    let serialized = serde_json::to_vec(&receipt).map_err(|error| error.to_string())?;
    let serialize_ms = start.elapsed().as_secs_f64() * 1000.0;
    let start = Instant::now();
    check::verify_receipt(&receipt)?;
    let verify_ms = start.elapsed().as_secs_f64() * 1000.0;
    let total_ms = total_start.elapsed().as_secs_f64() * 1000.0;
    let receipt_bytes = serialized.len();
    let result_hash = receipt.result_hash.clone();
    drop(serialized);
    drop(receipt);
    let rss = current_rss();
    Ok(
        json!({"receipt_ms":receipt_ms,"serialize_ms":serialize_ms,"verify_ms":verify_ms,"total_ms":total_ms,"receipt_bytes":receipt_bytes,"result_hash":result_hash,"engine_executions":sim::execution_count()-before,"rss_after_release":rss}),
    )
}
fn main_result() -> Result<(), String> {
    let arguments: Vec<_> = std::env::args().skip(1).collect();
    if arguments.len() > 1
        || arguments
            .first()
            .is_some_and(|argument| argument != "--fixtures" && argument != "--measure")
    {
        return Err("Usage: construction_capacity [--fixtures|--measure]".into());
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
    let mut measured = Vec::new();
    for (id, experiment) in workloads {
        let warmup = sample(&experiment)?;
        let samples = (0..30)
            .map(|_| sample(&experiment))
            .collect::<Result<Vec<_>, _>>()?;
        let mut times: Vec<_> = samples
            .iter()
            .map(|sample| sample["total_ms"].as_f64().unwrap())
            .collect();
        times.sort_by(f64::total_cmp);
        measured.push(json!({"id":id,"experiment_hash":check::artifact_hash(&experiment)?,"experiment":experiment,"warmup":warmup,"samples":samples,"p50_ms":times[14],"p95_ms":times[28]}));
    }
    println!(
        "{}",
        json!({"schema":"platonik-construction-capacity-v1","workloads":measured,"engine_executions":sim::execution_count()})
    );
    Ok(())
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
