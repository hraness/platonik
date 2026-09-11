# What survives the next supply?

Evaluation proposal and bounded Rust evidence, 11 September 2026. The [continuous habitat](continuous-habitat.md) keeps one physical world across saved advances. It tests whether the first crew remains useful when reports change, and whether its history can be checked without resetting its resources. Construction, a traveling ark, and the complete campaign remain unimplemented.

## A real specialization meets a different job

The previous expedition held one report bit constant within each trial. Its Frugal winner could remember only a positive report and otherwise rely on its initial zero. This habitat supplies six identified sparks, with three asking for each beacon. A later spark can require the opposite answer.

The depot holds one spark. A successful deposit sends the bit belonging to that actual spark; an unsuccessful deposit retains the courier's cargo. Reports travel through the relay with a declared delay. Both service beacons keep consuming charge. These rules create observable consequences for what the keeper remembers.

The unchanged Frugal winner fails all eight qualified cases. It still spends work, preserves every spark, and produces an honest failed receipt. Its success on the earlier task was real; it did not establish a general keeper.

## Compare simple designs before praising complexity

The qualification includes the strongest known prior report controller as well as a legal blind competitor. All rows use the same eight worlds and 96-tick horizon. Work below is summed over those cases; a failed design does not outrank a successful one merely by spending less.

| Unchanged crew | Missions passed | Total modeled work | What it does |
| --- | --- | --- | --- |
| Prior Resilient winner, `short-memory` | 8 of 8 | 64,890 | Take a message when one exists; otherwise route using remembered value |
| Blind alternator | 8 of 8 | 65,767 | Alternate route guesses without reading reports |
| Full reference | 8 of 8 | 67,134 | Use the original, more elaborate report-taking rules |
| Prior Frugal winner, `wait-latch` | 0 of 8 | 61,365 | Keep the earlier positive-only specialization |

The two-rule keeper costs 877 less work than blind alternation over the same successful cases, about 1.3%. The blind strategy beats the larger reference. This is a useful design result: relevant memory earns a small advantage; additional machinery does not automatically earn one. It is not a proof that every good organism must communicate, or that program length measures intelligence.

The [recorded comparison](https://platonik.space/lab/habitat) follows the full reference, positive-only keeper, blind alternator, and an idle-relay control. The two-rule keeper is also included in the complete evaluation artifacts.

## The same world after every stop

A saved habitat records the original experiment once, then advances to absolute ticks 5,9,14,19,27,47,79,96. These are separate CLI processes. The diagnostic exports at tick 9, imports into a new directory, and continues that restored world.

At the cut, a report can still be in flight. Its identity, arrival time, and source spark survive, along with cargo, stocks, cell positions, registers and evidence, service charge, pending closures, and cumulative work. The final receipt is checked against a fresh uninterrupted Rust execution. Equality covers every frame and modeled cost, not just the final success flag.

Loading is charged once in the world. Saving does not refill fuel. Status and real-world waiting do not advance simulation time. A fuel-exhausted partial tick remains terminal; an earlier activation failure remains in the history. Checked hashes establish content identity and consistency with the original local world, not player authentication or authority over a public competition.

## Keep the failures that qualification uncovered

The first fixture draft gave both beacons8 initial charge. Several sequences began with repeated equal bits and exhausted the other beacon before its first credit. That failed attempt remains in the protocol. Both initial charges increased to 12 before optimizer admission, with every reference and control requalified.

Two navigation failures remained. Reopening the reversed crossing at tick 50 or the late crossing at tick 61 can remove the wall beside the recovery courier. It then follows a four-position loop, leaving two or one supplies at the source. Those inputs and complete failure receipts remain committed as regression cases.

The qualified versions reopen at tick 88, after supply collection. That is a narrower admitted journey, not a navigation repair. The subsequent [navigation diagnostic](navigation-evaluation.md) tests new courier programs on the original event times and retains these historical failures. The world simulator was not changed to rescue the courier.

Seven controls test the reference: idle courier, idle relay, idle keeper, an in-gap memory clear, each constant answer, and a shortened total fuel allowance. Their failures establish dependence of this particular crew on its parts and resources. The successful blind design is a direct reason to avoid claiming that signals are necessary for every lawful architecture.

## Agent adaptation and operational cost

The predeclared diagnostic allows two agent ambitions: optimize both courier and keeper, or preserve the exact recovery courier while optimizing the keeper. Each gets four candidate pairs across four training cases. Selection requires success on all training cases, then minimizes total work, canonical pair bytes, and submission order. Four transfer cases run once after the winner is frozen.

Both agents completed their four candidate batches. All candidates passed all four training cases; the predeclared ordering selected the lowest-work pair for each ambition.

| Ambition | Candidate | Training work | Canonical pair bytes | Selected |
| --- | --- | --- | --- | --- |
| Frugal | `right-memory` | 30,823 | 838 | No |
| Frugal | `left-memory` | 30,840 | 837 | No |
| Frugal | `bounce-blind` | 29,983 | 768 | No |
| Frugal | `depot-phase` | 29,977 | 765 | Yes |
| Preserve Fern | `retained-reports` | 31,997 | 1,012 | No |
| Preserve Fern | `blind-alternation` | 32,434 | 1,068 | No |
| Preserve Fern | `quiet-first` | 31,665 | 1,013 | Yes |
| Preserve Fern | `immediate-reports` | 32,573 | 1,219 | No |

The selected pairs were frozen before transfer. Neither was changed after these results:

| Transfer journey | Frugal: `depot-phase` | Preserve Fern: `quiet-first` |
| --- | --- | --- |
| Early crossing | Passed · 7,847 work | Passed · 8,172 work |
| Reversed crossing | Failed · 7,961 work | Passed · 8,308 work |
| Repeated reports | Passed · 7,393 work | Passed · 7,835 work |
| Late crossing | Failed · 7,932 work | Passed · 8,246 work |

Frugal saves about 5.3% of training work but passes only two transfer journeys. Preserving Fern passes all four. This is an observed cost of the chosen ambition, not evidence that lower cost always generalizes. The failed Frugal transfer remains final for this diagnostic; another adaptation requires a new declared search.

The successful keeper's change is small and explainable: check the common no-message condition first. In `changing-one`, checking costs fall from 2,404 to 2, 320 while loading increases by one. Delivery ticks remain 19,23,35,47,59,71. It reorders known rules; this is not a new scientific algorithm.

Each arm recorded 20 trajectories through 260 CLI calls and 5,180 actual engine executions. Every trace, including the two failed transfers, matched cold replay and the restored state. The combined study used 12,451 of 15,872 reserved engine executions across 91 logical evaluations: 40 agent trajectories, 32 baselines, 7 controls, and 12 probes. The four repeated site replays and thirty capacity checks add real executions to that same ledger without creating new candidate slots.

Every candidate, failure, original submission, restored trace, and CLI process count must remain in the evidence. Source and transfer recipes are public; agents have different prior development context. External reasoning-token use is unknown. This is a bounded developer diagnostic, not blinded research or a controlled comparison of models.

The total reserved allowance is 15,872 real engine executions: 6,144 per agent, 1,536 for baseline/control comparisons and recorded replays, 1,024 for integrity probes, and1,024 for capacity measurement. Initial fixture qualification and final fresh artifact admission are separately counted. These ceilings are not reported as consumed work.

The save stores complete frame prefixes. Reconstructing later history therefore repeats verification, parsing, and hashing. Initialization plus eight advances already requires 226 engine executions; the external CPU cost is distinct from the modeled fuel spent by one 96-tick world. The capacity diagnostic measures thirty fresh release-process verifications of one completed eight-advance save and its exported size. It does not qualify larger cells, longer horizons, an unlimited journal, or a continuously running galaxy.

All twelve integrity probes passed, using 467 actual engine executions. They cover state forgery with recomputed hashes, changed fuel and future events under an old genesis, stale writes, exact retries, pending-intent recovery, the eight-advance ceiling, terminal loading failure, and preservation of existing import destinations. Constructed pending prefixes are labeled as such; actual process interruption is covered by the separate CLI tests.

Thirty read-only verifications of a completed save took 28.00 ms at the median and 31.34 ms at the 95th percentile on this measured host. Maximum Rust process RSS was 7,569,408 bytes (about 7.2 MiB), and the complete exported eight-advance bundle was 721,993 bytes (about 705 KiB). These thirty repetitions used 510 actual engine executions. Files were warm, the host was shared, and agent memory and reasoning were not included. Timing is a local observation, not a service-level promise.

The static replay and published study are projections of actual Rust artifacts, not browser simulations.

## What this admits next

The continuous-state gate passes. Its Frugal transfer failures remain failures; they are not converted into an overall successful campaign claim. A subsequent [bounded navigation repair](navigation-evaluation.md) passes the two preserved counterexamples and a declared timing-and-bearing neighborhood. General navigation remains open. Exact continuity can justify keeping a world while the next capability is added. It cannot establish that the whole game is compelling or scientifically productive. Before a complete campaign claim, the [automated validation path](design-validation.md#the-automated-path-before-people-play) still requires material-dependent construction, useful execution by constructed organisms, continuation without a reset, and traversal of the compressed campaign.

Human playtesting remains last. The next automated stage should test whether players' existing creations remain useful as they build something larger, and whether distinct ambitions produce meaningful tradeoffs under honest cost accounting.

## Reproduce and inspect

The [complete study](https://github.com/hraness/platonik/blob/main/fixtures/evidence/continuity-study.json) lists every candidate, transfer, baseline, control, probe, cost sample, and artifact digest. The [frozen protocol](https://github.com/hraness/platonik/blob/main/fixtures/evidence/continuity-protocol.json) retains the failed qualification attempts. The [source freeze](https://github.com/hraness/platonik/blob/main/fixtures/evidence/continuity-freeze.json) binds the exact executable, source, cases, and successful preflight.

Build using the [Rust guide](rust-bridge.md#install-and-run-locally), then run `bun run check` from the repository. Its Rust gate replays every distinct published study receipt and independently imports and verifies both selected-agent archives and all four browser examples. Historical timing is checked for internal consistency; the gate does not pretend to reproduce an old machine's latency. The old field-expedition artifacts remain unchanged and retain their own admission checks.
