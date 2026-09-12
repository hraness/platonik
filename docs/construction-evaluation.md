# Build someone who can help

Material-dependent construction in the bounded Rust prototype. The complete campaign remains a proposal. A builder now has a concrete job: obtain a finite piece of material, copy a supplied keeper, connect it to the crew, and activate it. The keeper must then do ordinary work in the same habitat. The [construction replay](https://platonik.space/lab/construction) makes each step inspectable.

## A missing member of the crew

The courier from the [navigation diagnostic](navigation-evaluation.md) still carries sparks to a depot. The earlier relay still forwards the report describing each delivered spark. The keeper's place starts empty. Without someone at that position to read reports and route stock to the matching beacons, the depot blocks and the journey fails.

A builder stands at a material cache beside that empty site. It follows its own bounded program. There is no outside command that inserts a keeper midway through the saved world. The supplied blueprint contains the previous keeper's program, its initial body and memory, and its incoming signal link. Constructing it preserves earlier capabilities as useful parts of a larger crew.

This is a deliberately small construction task. The site, blueprint, stock, launch bearing, and service task are supplied. The organism does not discover its own design, invent new instructions, or search for descendants inside the world.

The engine accepts other agent-authored blueprints within its bounds, using the same rule language as the existing crew. An external agent can change the body, policy, and local links in a new experiment. This diagnostic holds the keeper blueprint fixed while comparing builders, so its scores describe improvements on the same construction task.

## From material to an executable body

Three new actions belong to `platonik-habitat-v3`. The historical v1 and v2 worlds keep their original semantics and canonical records.

| Action | Requirement | Effect |
| --- | --- | --- |
| `gather_material` | Stand on the named cache with an empty material compartment | Move its first remaining token into the builder |
| `build` | Stand beside the declared target; own its assembly | Reserve an empty site and escrow material on the first step; copy up to 32 canonical body bytes per step; then stage one link per step |
| `activate` | Own a fully copied and wired adjacent assembly; all link endpoints are currently adjacent | Decode the copied body, install the child and links, and record its material and ancestry |

A newly activated child first becomes eligible to act on the following tick; the world must still have time and fuel to reach that activation. Until activation, its reserved site blocks movement but its body cannot execute or receive reports through unfinished wiring. A report sent before its link exists cannot reappear later. That makes timing consequential: the fixture declares a longer depot-to-relay delay so construction can finish before the first report reaches the relay. Waiting still consumes scheduled work and service charge.

The builder can sense its own material and the stage of an adjacent declared assembly. It receives no clock, coordinates, future event schedule, or case identifier as a policy input. A failed placement leaves material and occupancy unchanged while charging the attempted work. If fuel interrupts an activation, its state changes roll back together; spent work remains recorded.

## Keep different costs separate

Material is a conserved, indivisible token. Every token occupies exactly one cache, builder, inactive assembly, or activated body. Sparks are a separate conserved inventory. One token supplies one permitted body in this version; code size does not manufacture additional material.

Execution fuel counts modeled work. Loading the complete declared input, evaluating policies, sensing, messaging, unsuccessful actions, and service draining retain their earlier charges. Copying adds one unit per copied byte. Placement, each staged connection, and activation have explicit construction charges. These units define a deterministic game economy; they are not processor instructions, elapsed time, or an estimate of real computer energy. Host serialization, decoding, and verification costs require separate measurement.

The envelope remains 128 ticks, 16 potential cells including children, 32 total links, and a 64 KiB canonical input. Construction allows at most four declared blueprints, four material caches, 32 material tokens, and 4,096 canonical bytes per blueprint body. An accepted description need not be feasible: copying a large body at 32 bytes per step can consume the whole horizon. Failed or unfinished construction is a legitimate result.

A separate 64-tick regression also constructs a builder which acquires another token and constructs a second declared child. That final child executes a memory write through the same interpreter. This checks a finite chain of constructed execution; both blueprints are supplied, and the catalog does not grow. Other tests cover competing builders, reserved movement space, fuel interruptions, and rehashed forgeries.

## Judge birth and service separately

A valid birth proves that material acquisition and assembly occurred. Useful execution requires the born child to perform an ordinary action that contributes a real delivery. Full service success requires the original beacon quotas and continuous charge requirements throughout the horizon. Report use is a separate claim: a physically produced report must reach the keeper, be read into memory, and supply the recorded spark evidence for the corresponding route.

A prebuilt identical keeper can provide faster or cheaper service without attempting construction. A simpler blind keeper may also be useful. These comparisons are allowed to win; the game should expose what construction and communication buy under a stated objective.

The diagnostic preserves three agent-authored builder submissions, selects once on four training habitats, then evaluates the frozen selection on four public transfer habitats. Controls remove material, acquisition, activation, child behavior, courier behavior, or relay behavior. Every attempt is retained, including failed ones. Public recipes and development context make this a developer diagnostic, not a blind ranking of agents or evidence of human enjoyment.

## Reference qualification

All eight declared reference habitats completed construction and service on the first attempt. Each copied the same 444-byte keeper body and activated it at tick 17. Qualification used 16 engine executions: eight runs and eight fresh verifications. There were no failed recipes or adjustments.

The keeper routed six sparks in each habitat. The directly traced report-to-memory routes accounted for 6, 5, 4, and 3 of those sparks across the four schedules, repeated under rotation. Other deliveries used its initial or retained bit. Those deliveries remain useful, but receive no fresh-report credit. This distinction preserves the earlier keeper unchanged and makes its actual behavior visible.

## What the builder trials found

All three submitted builders completed construction and service on the four training habitats. Selection used total modeled work, then program size, then submission order. The selected memory builder retained a small amount of its own progress instead of repeatedly sensing every assembly stage. Its two explicit memory writes are charged.

| Submitted builder | Training successes | Total training work | Builder program bytes | Child activated |
| --- | --- | --- | --- | --- |
| Stage-driven reference | 4 / 4 | 67,950 | 486 | Tick 17 |
| Memory builder, selected | 4 / 4 | 67,702 | 440 | Tick 17 |
| Reference with a paid startup delay | 4 / 4 | 69,976 | 591 | Tick 18 |

The unchanged selection then passed all four public transfer habitats. Its combined work across training and transfer was 133,114. The reference used 133,610 on those same eight worlds. This is a small measured improvement within the declared task, not a claim of optimality or a comparison of agent models.

### Construction and communication earn different credit

| Crew supplied to the eight worlds | Service successes | Total work | Construction result |
| --- | --- | --- | --- |
| Selected builder and report-reading keeper | 8 / 8 | 133,114 | Keeper activated at tick 17 |
| Identical keeper supplied at initialization | 8 / 8 | 120,742 | No construction attempted or credited |
| Selected builder and blind alternating keeper | 8 / 8 | 135,953 | Larger keeper body activated at tick 19 |

Starting with the missing member already supplied is cheaper. Construction matters when the site begins empty and the continuation must be built. The blind keeper also succeeds: communication is not necessary for every possible solution to these habitats. Its alternating guesses cost more in this comparison, including the different body size and repeated memory writes. Neither result should be hidden behind a construction bonus.

Six removal controls ran on two opposite initial-report cases each:

| Removed capability | Observed consequence in both cases |
| --- | --- |
| Material stock | No child and no deliveries |
| Material acquisition | No child and no deliveries |
| Activation | A fully copied and wired assembly stays inactive; no deliveries |
| Useful child policy | A smaller child is born at tick 12 but makes no deliveries |
| Courier behavior | The keeper is built, but receives no supplies and makes no deliveries |
| Relay behavior | Service fails; the initial zero-memory keeper still routes one spark in one case |

These controls establish dependence of the tested crew on material, activation, useful child behavior, and its inherited transport and relay. The successful blind alternative limits the relay claim to that architecture. A birth alone earns no useful-construction milestone.

## Resume in the middle of becoming

Partial copied bytes, staged wiring, reserved occupancy, material escrow, ancestry, pending reports, and cumulative costs live in the existing checked habitat save. A pause introduces no free build steps or elapsed simulation time. Export and import preserve the original immutable world and its history.

Four recorded journeys cover a useful keeper, slower reports, an assembly never activated, and a child with an idle policy. Each has eight saved cuts and two export/import boundaries, at ticks 8 and 17. Every resumed and restored final trace equals uninterrupted execution, including failures, pending signals, material, and cumulative work. Twelve integrity probes reject altered material, copied bytes, reservations, wiring, birth timing, child code, refunded copying, premature child execution, and changed saved-world inputs.

The study used 1,317 actual engine executions against its declared 2,048 limit, including all 52 cold attempts, fresh verification, saved advances, restoration, and probes. Reference qualification used another 16. These counts exclude external-agent reasoning, whose token cost was not measured; capacity and independent artifact admission have separate allowances.

One evaluation-harness error is retained. At the first import, it compared the entire command response with the previous advance response. Import correctly clears the previous command's request ID while preserving the authoritative fields. A reviewed, recorded repair resumed the existing tick-8 save with all 110 calls and 166 executions retained. It changed neither a candidate nor the world, selection, original freeze, or total allowance.

Build the CLI using the [Rust installation guide](rust-bridge.md#install-and-run-locally). From the repository root, choose unused filenames and a new save directory:

```sh
./target/release/platonik habitat case construction-one > construction-one.experiment.json
./target/release/platonik habitat init construction-save construction-one.experiment.json
./target/release/platonik habitat advance construction-save --until 5 --expect-revision 0 --request-id partial-body
./target/release/platonik habitat status construction-save
```

The first five ticks include actual partial construction. Continue with the absolute horizon and revision reported by `status`. Follow the [saved-world guide](continuous-habitat.md) for export, import, idempotent retries, and recovery. To change a blueprint or program, edit a separate experiment and initialize a new habitat; the saved world's definition remains immutable.

## Measured capacity and its current limit

On an Apple M5 Max running macOS, the release benchmark measured two fixed 128-tick workloads in one process. Each had one warmup and 30 recorded repetitions. Each repetition constructed and checked a receipt, serialized it, and performed a fresh verification. The elapsed times below include those steps; they are measurements of this machine and these inputs, not universal bounds.

| Fixed workload | Observed final state | p50 | p95 | Compact receipt bytes |
| --- | --- | --- | --- | --- |
| Four 4,095-byte bodies | Four incomplete assemblies, each with 4,064 copied bytes; 12 live cells | 71.16 ms | 74.63 ms | 4,399,674 |
| Four smaller communicating children | 16 live cells, 32 installed links; queue reaches 128 reports | 65.34 ms | 68.03 ms | 5,077,003 |

Both workloads supplied four caches and 32 conserved material tokens. The first demonstrates that an admitted body can remain unfinished at the horizon. The second exercises the full cell and link counts after real construction. Neither is a full campaign or a worst-case proof over all admitted programs.

The original repeated process reached 312,573,952 bytes of peak resident memory, about 298 MiB. Resident memory kept rising after receipt buffers were released. This exceeds the earlier 256 MiB aspiration and does **not** qualify steady-state operation or justify a larger active envelope. The complete original samples remain available.

An allocation-only investigation reproduced the rising resident memory without Platonik or serialization code: repeatedly growing and dropping byte buffers reached 80–85 MB over the two tested sizes, while preallocation or reuse stayed near 7 MB. Removing intermediate `ps` observations did not remove the growth. It also appeared both with `MallocNanoZone=0`, inherited through Node orchestration, and with that setting absent. These zero-engine probes isolate an allocation-growth path on this host; they do not establish a live-data leak or a rule for other allocators.

The additive `--measure-buffered` benchmark retains one explicitly bounded 8 MiB buffer, serializes each complete receipt into it, and rejects overflow. That buffer remains counted in resident memory. Every sample still executes and verifies the world, and additionally compares the exact serialized bytes. Those extra identity checks have their own timings. The ordinary CLI already streams its output; this is a benchmark storage change, with the original measurement path preserved.

The separately frozen follow-up matched all 62 original receipt-byte identities. Its process peak was 18,612,224 bytes, or **17.75 MiB**. Post-release resident memory moved from 12,189,696 to 12,517,376 bytes across the partial-body samples, then from 17,416,192 to 17,612,800 across the all-born samples. It no longer showed the original per-receipt growth over these repetitions.

| Buffered workload | Comparable p50 | Comparable p95 | Full sample p95, including extra identity checks |
| --- | --- | --- | --- |
| Four near-cap bodies | 93.53 ms | 103.84 ms | 148.37 ms |
| Four communicating children | 80.99 ms | 97.86 ms | 146.80 ms |

Measured latency increased in the follow-up; there is no speedup claim. The instrumented benchmark measured 7.95 seconds internally, including its additional checks and observations; total process wall time was 8.28 seconds. This qualifies the stated buffer strategy for these two repeated workloads on this host. It does not establish an indefinitely stable process, performance on other machines, or the complete campaign's capacity.

Separate eight-advance histories, with two imports each, produced final bundles of 8,943,321 and 10,711,094 bytes. One fresh CLI verification of each complete history took 348.73 and 327.79 ms, with process peaks of 76,087,296 and 70,959,104 bytes respectively. Those isolated commands establish bounded costs for these histories. The original capacity measurement and its saved-history checks consumed 766 actual engine executions against a separate 1,024 allowance.

Independent artifact admission used 725 executions to check 58 distinct receipt streams, the original qualification, candidate selection, comparisons, restored histories, integrity probes, and capacity records. Qualification, study, original capacity, and that admission consumed 2,824 executions. The buffered follow-up added 124 against its separate 256 allowance; its data admission and allocation-only probes used zero. That totals 2,948 recorded executions across these phases; engineering tests and later CI revalidation are separate. Complete receipt streams compress from 29,036,461 to 1,052,956 bytes. The website's construction downloads occupy 6,888,727 uncompressed bytes. Compression saves storage and transfer; it does not erase execution or parsing costs.

Inspect the [frozen protocol](https://github.com/hraness/platonik/blob/main/fixtures/evidence/construction-protocol.json), [study and artifact manifest](https://github.com/hraness/platonik/blob/main/fixtures/evidence/construction-study.json), [capacity samples](https://github.com/hraness/platonik/blob/main/fixtures/evidence/construction-capacity.json), and [preserved harness repair](https://github.com/hraness/platonik/blob/main/fixtures/evidence/construction-repairs/import-envelope/repair.json).

The [buffered follow-up protocol](https://github.com/hraness/platonik/blob/main/fixtures/evidence/construction-memory/protocol.json), [measured samples](https://github.com/hraness/platonik/blob/main/fixtures/evidence/construction-memory/measurement.json), and [allocation-only probes](https://github.com/hraness/platonik/tree/main/fixtures/evidence/construction-memory/native) preserve the memory investigation separately from the original trials.

## The next dependency

The functional construction gate passes for a prescribed single-cell assembler and useful execution in these saved worlds. A computer assembled from many interacting parts, endogenous candidate search, self-construction, and the full Long Trail remain separate gates. Constructing a program does not establish biological life, consciousness, or a complexity-theoretic result.

The next campaign experiment must connect these capabilities into a compressed beginning-to-ending journey: keep familiar creations useful, build the required continuation, preserve it across visits, and earn the final response through checked computation. Qualify capacity for that actual workload, including its sustained use and complete history. [Human playtesting remains last](design-validation.md#the-automated-path-before-people-play), after the automated path is complete.
