//! Standalone macOS allocation diagnostic. No Platonik dependency or engine runs.
use std::{collections::BTreeSet, hint::black_box, process::Command, time::Instant};

const ITERATIONS: usize = 8;
const CAPACITY: usize = 8 * 1024 * 1024;
const LENGTHS: [usize; 2] = [4_399_674, 5_077_003];

fn rss() -> u64 {
    let output = Command::new("/bin/ps")
        .args(["-o", "rss=", "-p", &std::process::id().to_string()])
        .output().expect("ps invocation");
    assert!(output.status.success());
    std::str::from_utf8(&output.stdout).unwrap().trim().parse::<u64>().unwrap() * 1024
}

fn allocate(mode: &str, length: usize, value: u8) -> Vec<u8> {
    if mode.starts_with("growth") {
        let mut bytes = Vec::with_capacity(128);
        while bytes.len() < length {
            let next = (bytes.len().max(128) * 2).min(length);
            bytes.resize(next, value);
        }
        bytes
    } else {
        let capacity = if mode == "exact-sampled" { length } else { CAPACITY };
        let mut bytes = Vec::with_capacity(capacity);
        bytes.resize(length, value);
        bytes
    }
}

fn main() {
    let mode = std::env::args().nth(1).expect("mode");
    assert!(["growth-sampled", "reserved-sampled", "exact-sampled", "reuse-sampled", "growth-batch"].contains(&mode.as_str()));
    let started = Instant::now();
    let sampled = mode != "growth-batch";
    for length in LENGTHS {
        let before = rss();
        let mut addresses = BTreeSet::new();
        let mut reused = if mode == "reuse-sampled" { Some(Vec::with_capacity(CAPACITY)) } else { None };
        for index in 0..ITERATIONS {
            let mut bytes = reused.take().unwrap_or_else(|| allocate(&mode, length, index as u8));
            bytes.resize(length, index as u8);
            bytes.fill((index + 1) as u8);
            black_box(&bytes);
            addresses.insert(bytes.as_ptr() as usize);
            let capacity = bytes.capacity();
            if mode == "reuse-sampled" { reused = Some(bytes); } else { drop(bytes); }
            if sampled {
                println!("{{\"kind\":\"sample\",\"mode\":\"{mode}\",\"length\":{length},\"iteration\":{},\"capacity\":{capacity},\"distinct_addresses\":{},\"rss_bytes\":{},\"buffer_retained\":{}}}", index + 1, addresses.len(), rss(), reused.is_some());
            }
        }
        drop(reused);
        println!("{{\"kind\":\"batch\",\"mode\":\"{mode}\",\"length\":{length},\"iterations\":{ITERATIONS},\"rss_before_bytes\":{before},\"rss_after_release_bytes\":{},\"distinct_addresses\":{}}}", rss(), addresses.len());
    }
    println!("{{\"kind\":\"complete\",\"mode\":\"{mode}\",\"engine_executions\":0,\"elapsed_micros\":{}}}", started.elapsed().as_micros());
}
