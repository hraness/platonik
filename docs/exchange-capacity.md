# What a kept promise costs

The generated-courier exchange passed its capacity gate for a small independent-agent study on the measured machine. Running a supplied world and freshly checking its receipt each took about 32 ms at the median. Retaining the complete experiment cost much more memory than any individual CLI process. The larger campaign remains a proposal; this measurement admits the next local study, with explicit costs and limits.

The [exchange](composition-v5-gate.md) follows two generated organisms through a physical trial, selects a winner, and checks its requested delivery and returned acknowledgment. This measurement uses those same nine-cell, thirteen-link, 128-tick worlds. It changes neither the engine nor its charged work and makes no optimization claim.

## Execution and checking

The [frozen protocol](https://github.com/hraness/platonik/blob/main/scripts/exchange/capacity-protocol.json) names all six reference worlds and eight failure controls. Each first receives one execution and one fresh verification. The initial pairs for `bloom-exchange-left` and `bloom-exchange-rotated-right` also serve as their excluded warmups. Thirty additional pairs per representative alternate left, then rotated-right. Every CLI invocation starts a new process; warmups prime filesystem caches only.

| Representative | Operation | p50 | p95 |
| --- | --- | --- | --- |
| Left winner | Run and write receipt | 32.28 ms | 34.71 ms |
| Left winner | Read, replay, and grade | 32.49 ms | 34.54 ms |
| Rotated right winner | Run and write receipt | 32.00 ms | 34.91 ms |
| Rotated right winner | Read, replay, and grade | 32.33 ms | 34.21 ms |

Each row contains thirty measured samples. Percentiles use nearest rank: the 15th and 29th sorted observations are p50 and p95. The median here is the lower middle observation, rather than the average of the two middle values. Timings cover process launch through completion, including receipt I/O. Hashing and ledger writes sit outside each CLI timing and inside the recorder's lifetime.

The complete measurement retained **74 execution/verification pairs: 162 CLI calls and 148 engine executions**. Fourteen calls export inputs without running the engine. All reference grades passed and all controls retained their expected failures. Repeated receipts and grades matched the original bytes. The recorder completed in 9.18 seconds, including orchestration and archive packing. This total excludes compilation and external-agent reasoning.

The host was an Apple M5 Max with 36 GiB RAM, running macOS on Darwin 25.5.0, Node 24.20.0, and release Rust 1.97.1. It used locale `C`, `MallocNanoZone=0`, and an exclusive `mac-native` host-scheduler admission. Unmanaged machine activity and cache state were not controlled. These are observations on that host, not a service throughput measurement.

## Memory and retained evidence

| Observation | Measured maximum | Declared admission limit |
| --- | --- | --- |
| Each operation's p95 | 34.91 ms | 500 ms |
| CLI peak resident memory | 15.1 MiB | 256 MiB |
| Recorder peak resident memory | 211.2 MiB | 256 MiB |
| One receipt | 7,141,362 bytes, or 6.81 MiB | 8 MiB |
| All logical archive entries | 530,046,511 bytes | 1 GiB |
| Compressed archive | 3,318,509 bytes | 64 MiB |

All admission criteria passed. Recorder memory has modest headroom: roughly 45 MiB below its limit. The macOS process measurements report high-water resident memory for each timed CLI and the recorder process tree; Node also records the recorder's own high-water memory after packing. These observations are not additive and do not establish total concurrent machine memory.

The [public capacity record](https://github.com/hraness/platonik/blob/main/fixtures/evidence/exchange-capacity.json) binds the protocol, source files, binary, timing samples, counters, and admission results. Its [compressed archive](https://github.com/hraness/platonik/blob/main/fixtures/evidence/exchange-capacity.json.gz) preserves the ledger, frozen source, and every measured CLI output. The summary retains the recorder's output and OS resource report. Identical byte strings are stored once by their SHA-256 identity: 530,046,511 logical bytes become 101,677,141 unique bytes before compression. Repeating deterministic worlds makes this archive unusually repetitive. Its compression ratio cannot predict storage for novel agent candidates.

The performance thresholds decide whether a completed measurement qualifies; they do not enforce a runtime sandbox. Separate packing safety bounds limit entry sizes, file counts, and the encoded envelope. The 64 MiB compressed limit serves both purposes, so a package exceeding it stops before the summary is sealed. Incomplete measurements preserve their evidence and do not silently replace failed samples.

## Repeat the measurement locally

Use a repository checkout on macOS with the pinned Rust 1.97.1 toolchain, Node 24, and the installed HRA host scheduler available as `hra-host-run`. Run from the repository root. Resolve the installed scheduler's absolute executable path, build the release CLI, then record into a directory name that does not yet exist:

```sh
exchange_scheduler="$(command -v hra-host-run)"
"$exchange_scheduler" --mode=heavy --lane=compute --label=exchange-build -- cargo build --release --locked -p platonik-cli
MallocNanoZone=0 "$exchange_scheduler" --mode=exclusive --lane=mac-native --label=exchange-capacity -- node scripts/exchange/capacity.mjs exchange-capacity-001
```

This recorder supports macOS `/usr/bin/time -lp` and requires the scheduler's exclusive `mac-native` admission. It writes local evidence only. Choose a new output name for every run; existing directories are rejected. Inspect `exchange-capacity-001/summary.json` for `capacity_passed` and each criterion, and retain `exchange-capacity-001/recording/archive.json.gz` with it. A valid summary can report failed admission. If recording stops before sealing, preserve the directory and diagnose its ledger and stderr before starting a separately named run.

Reproduction does not overwrite or publish the checked-in public record. Admitting a replacement public artifact is a separate reviewed step. A new timing run can vary with its machine and environment; its source identities and deterministic outcomes provide the comparison.

## What this permits next

The measured workload supports a bounded independent-agent search on this exact exchange. That study still needs a fixed discovery allowance, frozen transfer cases, retained failed candidates, and costs for external-agent reasoning as well as execution and checking. The current result measures supplied solutions; it does not establish that independent agents can discover better ones.

Larger ecologies, concurrent servers, and a multiplayer economy need their own workloads and capacity evidence. Useful computational research needs the [matched comparisons and external validation](complexity-and-scale.md#a-thesis-that-can-fail) defined by the research thesis. The complete campaign and human playtesting remain later gates; neither these timings nor automated completion establish scientific novelty or human enjoyment.
