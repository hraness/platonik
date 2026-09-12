//! Two predeclared First Answer inputs, thirty measured repetitions each.
//! Every warmup/sample constructs and independently grades a fresh receipt.
use platonik_core::{check, first_answer, model::*, parse_experiment, sim};
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
    let journey = first_answer::grade_receipt(&receipt)?;
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
    let mut record = json!({"journey_hash":check::artifact_hash(&journey)?,"receipt_ms":receipt_ms,"serialize_ms":serialize_ms,"verify_ms":verify_ms,"total_ms":total_ms,"receipt_bytes":receipt_bytes,"result_hash":result_hash,"engine_executions":sim::execution_count()-before,"rss_after_release":rss});
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
    if arguments.len() != 2 {
        return Err("Usage: answer_capacity FIRST_EXPERIMENT SECOND_EXPERIMENT".into());
    }
    let workloads = arguments
        .iter()
        .map(|file| {
            let raw = std::fs::read_to_string(file).map_err(|e| e.to_string())?;
            let experiment = parse_experiment(&raw)?;
            Ok((file.clone(), experiment))
        })
        .collect::<Result<Vec<_>, String>>()?;
    let buffered = true;
    let mut buffer = Some(SerializationBuffer::new());
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
    let mut record = json!({"schema":"platonik-answer-capacity-v1","workloads":measured,"engine_executions":sim::execution_count()});
    if buffered {
        record["schema"] = json!("platonik-answer-capacity-v1");
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
