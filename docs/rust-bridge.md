# Run the first shared habitat

Implemented validation prototype, 11 September 2026. The complete campaign remains a proposal. This Rust slice connects physical delivery, delayed local messages, bounded memory, and beacon routing in one runtime. The commands on this page are stateless experiments. For persistent creations, ancestry, closing-route trials, and local recovery, use the [field expedition](field-expedition.md).

## Watch before editing

Open [the recorded Rust bridge](https://platonik.space/lab/bridge). Choose a complete ark case, move through its ticks, then select an ablation. The map, memory, attempted actions, beacon charge, and work come from a real Rust receipt. The browser only displays the committed records; it does not execute Rust or claim to verify a downloaded artifact.

The opening cases compare a compact courier with a recovery policy on intact and initially damaged maps; the route does not collapse mid-run. The ark cases reuse the resilient courier to carry a spark into a depot. A local report crosses a relay, is stored in a controller, and survives interrupted contact. When a valve later opens, the controller uses the report to allocate the finite delivered supply. Two report values exercise the same assembly. A constant controller succeeds on the plan it already knows, but neither tested constant succeeds unchanged on both plans. These small service fixtures are precursors to a living ark, not a moving habitat or a completed chapter.

The public suite preserves expected failures alongside successful references. It checks the declared comparisons, including replacement of individual policies with Wait while preserving their physical bodies, and a timed memory-clear intervention. A passing suite means those expectations held; it does not mean every creature succeeded. These cases are available for inspection and tuning, so they are not held-out evidence of generalization.

## Install and run locally

Clone the public [Platonik repository](https://github.com/hraness/platonik). Use the pinned Rust 1.97.1 toolchain with Cargo. A standard rustup installation reads `rust-toolchain.toml`; another installation must provide that exact compiler plus rustfmt and Clippy for the development gate. No account, database, model API, or hosted game service is needed.

```sh
git clone https://github.com/hraness/platonik.git
cd platonik
cargo build --release --locked -p platonik-cli
./target/release/platonik --help
./target/release/platonik examples
```

Use a new directory and new filenames for this walkthrough. Shell redirection can overwrite existing files, even though the standalone commands in this walkthrough never write one.

```sh
mkdir bridge-trial
./target/release/platonik example ark-plan-a > bridge-trial/parent.json
./target/release/platonik run bridge-trial/parent.json > bridge-trial/parent.receipt.json
./target/release/platonik verify bridge-trial/parent.receipt.json
./target/release/platonik inspect bridge-trial/parent.receipt.json
```

To make a child, copy the parent to a fresh file and change a cell's `program`. Keep the world, seed, starting memory, events, ticks, and budgets fixed for a matched comparison. Run and verify the child, then compare its outcome and work with the parent. Test the identical policy on the corresponding second case before attributing an improvement to a general habit.

An external agent can follow the repository's [platonik-play skill](https://github.com/hraness/platonik/blob/main/skills/platonik-play/SKILL.md). It describes a finite comparison budget, preserves parent files, records failures, and grounds narration in actual ticks. The game runtime has no external-agent access while an organism is executing.

## Commands and failures

| Command | Effect |
| --- | --- |
| `examples` | List the available fixture IDs as JSON |
| `example <id>` | Print an editable experiment |
| `run <experiment.json>` | Execute and print a full receipt, including unsuccessful missions |
| `verify <receipt.json>` | Recompute the experiment and check the supplied receipt |
| `inspect <receipt.json>` | Verify, then show compact text maps and observations |
| `suite bridge-v1` | Run every frozen case and report its declared assertions |
| `--help`, `--version` | Inspect the actual command surface and version |

File-taking commands also accept `-` for bounded standard input. JSON goes to stdout; operational errors are JSON on stderr. Exit **0** means success, **1** means a valid mission or suite failed, and **2** means invalid input, tampering, I/O, or usage error. A valid failed mission can verify with exit 0: integrity and success are different questions. Capture exit codes rather than hiding failed attempts with a pipeline.

`verify` and `inspect` consume real CPU because they rerun the experiment. Neither advances a persisted world. The separate `expedition` command family now provides a checked local journal and interrupted-trial recovery. Immutable parent and child files remain useful for standalone experiments. There is no automatic breeding, hosted submission, or leaderboard.

## The actual laws

The versioned protocol is `platonik-habitat-v1`. The authoritative typed definitions and validation are in the public [core crate](https://github.com/hraness/platonik/tree/main/crates/platonik-core/src). An experiment contains all initial resources, policies, local interfaces, events, seed, and limits. It cannot load native code or read the network, filesystem, wall clock, or evaluator name.

Mobile couriers and stationary signal cells use the same first-matching-rule interpreter. Each cell has four byte registers. The body, port wiring, initial memory, and policy are supplied configuration and count toward admission and loading. A register is an implemented primitive; this slice does not claim memory emerged from simpler physics.

Each tick applies declared events, handles queued messages, activates cells once in a seeded order over stable identities, and drains services. Signal delivery takes at least one tick over a declared adjacent connection; inbox observations expire and queues are bounded. Atomic activation and explicit failure accounting prevent a failed action from moving resources for free. Sparks are conserved across sources, carried cargo, depots, and delivery records. Consumed beacon charge is tracked separately.

Modeled execution fuel is distinct from sparks, code length, memory, wall-clock time, and an external agent's tokens. The shared ledger charges loading, scheduling, conditions, sensors, memory accesses, actions, messages, transfers, drains, and runtime checking. The independent receipt checker and serialization also consume measured host time; their CPU is not a claim of additional in-world energy.

Experiment input is limited to 64 KiB; full receipt input and output to 32 MiB. A run is bounded to 128 ticks and at most 2,000,000 modeled work, with at most 16 cells, 32 rules per cell, eight conditions per rule, 32 links, 128 queued messages, 128 initial sparks, and 64 events. Grid sides are 3–32 tiles. Each activation permits 1–1,024 modeled work. Exceeding that activation limit rolls back its effects, retains spent work, and makes the mission fail while later activations continue. Exhausting the global allowance stops the experiment with a partial final frame. The longer 2,000-tick workload in the [scale proposal](design-validation.md#technical-gates-before-each-increase-in-scale) is not an admitted capacity of this prototype.

## What the evidence can establish

Receipts include the accepted typed experiment, protocol, full result, and SHA-256 identities. Formatting differences in the original JSON do not change its typed meaning. Verification checks the identities, independently checks trace invariants, reruns the engine, and compares the exact deterministic result. A hash by itself does not establish correctness. The checker is separate code in the same repository; it is not independent external scientific replication.

The website's JSON is generated from the CLI's frozen suite. `bun run bridge:record` regenerates it after an intentional engine change. The aggregate gate reruns the suite and compares every published artifact byte for byte. This also provides cross-platform replay evidence when the same committed records pass on local macOS and Linux CI. Never update a fixture merely to make a regression disappear; review the changed behavior and semantics first.

The checker independently audits inventory, energy, identities, recorded movement and resource transfers, memory effects, intervention enablement, activation order, and budget bounds. Exact fresh replay covers policy selection, full message-queue causality, and per-category costs. This is not a second independent implementation of every simulator rule.

## A demonstrated choice for an agent

The shipped skill was exercised with four new evaluations and eight explicit verification/inspection recomputations. The agent preserved the parent files and adopted the public recovery policy as a child. This was a developer-agent walkthrough, not a blinded player study or novel algorithm discovery.

| Policy and case | Mission | Total modeled work | Delivery ticks |
| --- | --- | --- | --- |
| Compact, normal | Pass | 2,412 | 6, 18, 30 |
| Recovery, normal | Pass | 2,805 | 8, 20, 32 |
| Compact, initially wounded | Fail | 2,461 | None |
| Recovery, initially wounded | Pass | 2,850 | 8, 22, 36 |

That is a real choice: retain the cheaper ordinary route or pay more for this demonstrated recovery behavior. It does not prove that a better generalist is impossible. The [walkthrough record](https://github.com/hraness/platonik/blob/main/fixtures/evidence/agent-walkthrough.json) includes every attempt. The [field expedition](field-expedition.md) now supplies public transfer cases and persistent objectives for equal-budget agent comparisons. Its outcomes must be judged separately from this earlier walkthrough.

## Measured cost and the memory repair

The first release-build measurement used an Apple M5 Max with 36 GiB RAM, macOS 26.5.1, and Rust 1.97.1. Each of five fixed workloads had one warmup and 30 measured samples. Within one process, each sample created a receipt, checked it, serialized it in memory, and verified it with fresh recomputation. Timing excludes CLI startup, JSON input parsing, disk I/O, rendering, and external-agent work. This was not an isolated-machine measurement.

| Fixed workload | End-to-end p95 | Serialized receipt |
| --- | --- | --- |
| Opening, normal | 0.77 ms | 43,639 bytes |
| Opening, wounded | 0.85 ms | 43,582 bytes |
| Ark plan A | 2.03 ms | 125,188 bytes |
| Ark plan B | 2.02 ms | 124,920 bytes |
| Dense 16 cells, 128 ticks | 64.12 ms | 4,928,931 bytes |

The dense probe uses 16 rules per cell, 32 delayed links, 128 finite sparks, and a queue that actually reaches its 128-message cap. It records 3,548 rejected-full signal events. Its service quotas are zero: this is a capacity probe, not an expedition achievement or a worst-case upper bound.

**Peak process resident memory was 339,574,784 bytes, about 324 MiB. This misses the proposed 256 MiB target.** The compiler was excluded from that measurement. That failed baseline prompted a targeted allocation investigation. Fast execution alone does not admit a large-world tier, and the 2,000-tick campaign envelope remains unsupported. The [baseline evidence](https://github.com/hraness/platonik/blob/main/fixtures/evidence/capacity-baseline.json) includes complete inputs, hashes, timing distributions, and measurement scope.

The follow-up diagnostic measured about 25 MiB after one dense sample and about 324 MiB across thirty. RSS remained high after the sample's Rust values were dropped; that supports investigating transient allocation and retained allocator memory, not claiming the program intentionally stores previous results. The [diagnostic record](https://github.com/hraness/platonik/blob/main/fixtures/evidence/memory-diagnosis.json) preserves the phase observations.

The repair streams canonical JSON directly into SHA-256, avoiding a large temporary trace buffer for every digest. Exact-byte tests and all published replay hashes remain unchanged. In a matched repeat of the five workloads, **peak process RSS fell to 163,823,616 bytes, about 156 MiB**, and dense end-to-end p95 was **49.74 ms**. Dense verification alone had a 22.95 ms p95. The normal and wounded openings had 0.64/0.61 ms p95; the two ark plans had 1.70/1.71 ms p95. Inputs, modeled work, and serialized receipt sizes were identical to the baseline.

This observed batch now meets the 256 MiB memory target; it does not admit every legal program, a long-lived hosted service, or the proposed 128-cell/2,000-tick world. RSS includes allocator behavior, and one non-isolated before/after measurement is not a universal speedup guarantee. Benchmark bookkeeping and explicit drop order also changed during diagnosis, so the exact improvement cannot be attributed solely to hashing as a perfectly isolated A/B result. The [post-repair evidence](https://github.com/hraness/platonik/blob/main/fixtures/evidence/capacity-streaming.json) keeps the full inputs and distributions.

Reproduce the fixed benchmark after compiling separately:

```sh
cargo build --release --locked -p platonik-cli --example benchmark
./target/release/examples/benchmark
```

For bounded memory diagnosis, select `--workload dense-16-cells-128-ticks --samples 1 --warmups 0 --memory-diagnostics`, then compare with 30 samples. Diagnostic RSS probes perturb timing and cannot replace the uninstrumented throughput measurement. They do not grant a larger execution envelope.

This slice can establish finite transport-to-control composition, causal effects under its admitted interventions, a measured policy tradeoff, and reproducible agent experiments. It cannot establish a compelling complete campaign, an affordable giant ecology, universal computation, biological life, new useful algorithms, or a result about P versus NP. The [validation plan](design-validation.md) keeps those claims attached to their own missing tests.
