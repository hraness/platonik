# When home can choose

This diagnostic tests a bounded dependency of the [Autoverse proposal](autoverse.md): arithmetic and a supplied plan must change an actual service decision in the same saved world. It extends the [First Answer](first-answer.md), while moving arks and the complete campaign remain unimplemented. The [walkthrough](ark-control.md) and [recorded crew](https://platonik.space/lab/ark) expose the agent-facing path and its evidence.

## One calculation that matters

The world contains ten initial cells, eight adjacent links, six finite sparks, and four draining beacons. It runs for at most 128 ticks under a 100,000-unit work allowance. No new interpreter primitive, runtime version, or save format is introduced.

The familiar courier program carries five sparks into a depot. Their bits encode A in low-first order followed by a zero flush. An unchanged relay distributes those physical reports. Another local rule table shifts the explicitly supplied B operand, and an eight-row full-adder table combines the input bits with retained carry. Five output bits encode the complete widened sum.

The reference selector interprets a supplied plan field. The reserve plan selects output bit four, the carry; the staggered plan selects bit zero, the low sum bit. The plans have distinct physical routing obligations and run through the same selector program. The second courier delivers a separate payload to a depot that emits no report. Keeper receives the selected computed result, retains it after the report link closes at tick 48, and routes the payload during the sole valve window at tick 52.

The four arithmetic result bits and carry are all checked. Only the plan-selected bit controls this payload decision. This is a small programmable service selector, not a demonstration of continuous regulation, a general processor, or a moving habitat.

In all eight reference worlds, the adder emits at ticks 9, 17, 25, 33, and 41. Keeper consumes the low-bit plan's selected report at tick 11, or the carry plan's report at tick 43. The physical decision occurs at tick 52. The resulting work is 35,716–35,855 units within the original allowance.

## What is granted and what is checked

A is carried by physical resources. B and the output tap are supplied local memory, whose loading and use are charged. Programs cannot inspect the fixture label, expected answer, global clock, or payload bit remotely. The observer's report includes the expected sum; this is checker information, not an organism input.

The shifter's sixteen value cases, the adder's eight Boolean cases, and their input guards are supplied code. Their loading and evaluation remain in the work ledger. No arithmetic operation is added to the interpreter for this experiment.

The arithmetic interface is a single unsigned `add4(A, B)` transaction with A and B in 0 through 15 and internal carry initialized to zero. Its complete admitted input set contains 256 pairs. The independent oracle uses ordinary widened integer addition and requires exactly five observed outputs in order, including carry. The physical input, paired local signals, and output trace must agree. Surplus outputs remain visible in unsuccessful grades.

Arithmetic, selected output, retention, routing, and overall service have separate verdicts. The full milestone requires their conjunction at the complete horizon. A single trace checks matching actions and values; frozen counterfactual inputs and component-removal comparisons supply the additional evidence about causal dependence.

## Arithmetic qualification

The reference passed **all 256 input pairs**, including every carry output, using the actual physical clock and local programs. Each of these worlds also passed integrated control under the low-bit plan. Both plan families were separately checked on all eight declared voyage cases. This full arithmetic coverage applies to the supplied reference; optimized courier variants are judged on their declared training and transfer worlds.

All eight reference worlds passed their first captured round. Independent review tightened the payload-channel boundary to exclude links in declared blueprints as well as initial links. A second reference round after source and review convergence reproduced the same eight results. All seven qualification controls completed 128 ticks and failed the whole control contract; arithmetic remained correct when only the payload courier, Keeper's memory, or plan selection was disrupted.

Qualification retained 279 attempts and used 558 of its 1,536 allowed engine executions: 16 reference voyages across two rounds, seven removal controls, and 256 arithmetic worlds, each run and freshly checked. No input was rejected. These are separate from calibration, agent search, capacity capture, and later admission checks.

## Declared comparisons

Training uses 9 + 6 = 15 and 9 + 7 = 16 under both plans. The physical A stream is identical across these additions, while the stored operand changes a carry chain. Each sum's low bit differs from its carry. Transfer uses 15 + 15 = 30 and 3 + 4 = 7 under both plans. Both plans therefore require zero and one decisions in training and transfer.

That complementary-bit pattern is also a correlation an optimizer may exploit. Success on these eight public worlds does not establish that every submitted selector uses the designated bit internally or works on all 256 input pairs. The checker requires the complete arithmetic trace and a matching selected report at the admitted time; it does not infer arbitrary program dependencies from matching values. A lawful shortcut remains a result to report, with broader controller testing left visible.

The arithmetic components, reference relay, and Keeper remain fixed during the agent search. One ambition keeps both couriers and changes the selector. The other can additionally change the courier policies. Three submitted slots per arm face four training worlds; selection precedes four unchanged transfer worlds. Successful candidates are compared by total modeled work and canonical program bytes. Public references remain admissible, and failures consume their declared slots and work.

Constant-zero and constant-one selectors retain the same input timing and plan handling while substituting the output value. Removal controls test each courier, relay, retained memory, carry, and plan selection separately. A memory-clear comparison uses cases requiring a one: clearing an already-zero register cannot establish that memory was necessary.

## Two agent ambitions

Both developer agents submitted three candidates in sequence. Every candidate passed all four training worlds; no slot was rejected, discarded, or replaced. Selection used training results only. The chosen programs then passed all four transfer worlds unchanged. Each arm used 32 of its 64 allowed engine executions: sixteen cold worlds, each run and freshly checked. External reasoning tokens were not measured.

| Ambition | Candidate | Training work, four worlds | Policy bytes |
| --- | --- | ---: | ---: |
| Reference | Supplied crew | 143,020 | 10,021 |
| Keep both couriers | `direct-tap` | 139,694 | 9,261 |
| Keep both couriers | `tap-countdown` | 139,072 | 9,113 |
| Keep both couriers | **`count-and-let-go`** | **138,640** | **9,009** |
| Spend less work | `short-hall-couriers` | 102,536 | 3,049 |
| Spend less work | `rest-after-delivery` | 98,364 | 2,802 |
| Spend less work | **`two-plan-selector`** | **95,038** | **2,042** |

Policy bytes count the canonical bundle of both courier programs and the selector. The arithmetic and other fixed programs remain supplied and charged in each world's total work.

The selected familiar crew uses 3.1% less training work than the reference, while preserving both inherited courier programs exactly. It counts down from the supplied tap and lets irrelevant transient messages expire instead of copying them into scratch memory. Its transfer work totals 138,762, compared with the reference's 143,142.

The frugal selection uses 33.5% less training work than the reference; its transfer total is 95,160. It specializes the couriers for these straight corridors and lets the payload courier rest after its first Drop attempt. Clock deliveries and arithmetic occur one tick earlier; the service window remains tick 52. Source and trace review found that both selected policies forward the actual designated message, without using the complementary-bit shortcut described above.

The savings have a visible cost in scope. The frugal clock courier does not retain the inherited detour behavior, and its payload courier has no robust retry after a failed Drop. Across the eight worlds, 55,736 of the 87,204 work units saved relative to the selected familiar crew come from loading smaller programs. Its carry selector actually spends slightly more activation work than the familiar selection. This is a useful specialization of the crew; the adder is unchanged. Eighty-eight unsuccessful source-empty pickup attempts also remain charged in each frugal world. No optimality claim follows from these three slots.

## What the simpler and broken crews reveal

Constant-zero and constant-one comparisons each pass four of eight service and control cases. Their arithmetic remains correct in all eight. A constant answer can win a particular voyage, but cannot finish this balanced family.

All twelve component-removal worlds fail the whole control contract. Eleven also fail physical service. The exception is removing carry writes under the low-bit plan for 9 + 7: service still succeeds, but the computed sum is 14 instead of 16. The full grade preserves that arithmetic failure. Clearing Keeper's memory in a case requiring one leaves the sum correct and loses the required delivery; the [forgotten-plan replay](https://platonik.space/lab/ark) retains that separate failure.

Four selected or comparison trajectories used the eight declared pauses and both restorations. Each consumed 304 actual engine executions and reproduced its cold result and grade exactly, including the failed forgotten plan. Twelve tampered-receipt and bundle probes were rejected, consuming 23 actual executions. The complete frozen study retains 68 cold voyages and uses **1,375 of 2,048 allowed engine executions**, including both agents, shared comparisons, saved replay, and rejected probes.

## Save-and-resume calibration

Before agent search, one reference journey used all eight allowed advances, at ticks 1, 2, 6, 38, 47, 48, 52, and 128. It was exported and restored at ticks 6 and 48. The completed result and ark grade matched the uninterrupted receipt exactly. This path required 304 actual engine executions because commands freshly verify retained history.

The [shorter walkthrough](ark-control.md) was also executed exactly: pause at tick 8, export and restore, then finish at tick 128. Its ten saved-world commands required 50 actual engine executions and reproduced the same result. Together these paths used 354 of the separate 360-execution calibration allowance. A paused world consumes no simulation ticks; integrity reads still use real CPU.

## Measured cost

The capacity capture used release Rust 1.97.1 on an Apple M5 Max, macOS arm64. Each reference workload had one warmup and thirty measured repetitions. A sample creates a receipt, serializes it into a fixed reusable 8 MiB buffer, and freshly verifies and grades it. Extra serialized-byte identity checks are recorded outside that timing interval; full sample and process times remain in the evidence.

| Reference world | Median sample | p95 sample | Compact receipt |
| --- | ---: | ---: | ---: |
| Reserve, 9 + 7 | 13.15 ms | 13.84 ms | 647,611 bytes |
| Staggered, 9 + 6 | 13.43 ms | 14.05 ms | 647,600 bytes |

The benchmark process peaked at 7.72 MiB resident memory. Two separate completed-history reads used seventeen fresh engine executions each: 79.44 ms with 13.19 MiB peak memory for the reference, and 77.53 ms with 13.20 MiB for the selected familiar crew. These are single observed history reads, not latency percentiles. The four complete save bundles occupy 1,759,873–1,829,552 bytes each.

The capture used 158 of its 256 allowed engine executions and passed the declared 256 MiB memory, 8 MiB receipt, and 16 MiB completed-bundle thresholds. The runtime's separate 64 MiB import limit is not an admitted operating size. These measurements cover ten cells and 128 ticks on this machine. They do not establish larger-world throughput, the complete campaign's capacity, hosted cost, or agent-token cost.

## Inspect and reproduce the evidence

The [frozen protocol](https://github.com/hraness/platonik/blob/main/fixtures/evidence/ark-protocol.json), [complete study](https://github.com/hraness/platonik/blob/main/fixtures/evidence/ark-study.json), and [capacity samples](https://github.com/hraness/platonik/blob/main/fixtures/evidence/ark-capacity.json) retain the cases, allowances, source identities, every candidate and failure, process counters, and exact artifact identities. The [qualification packet](https://github.com/hraness/platonik/blob/main/fixtures/evidence/ark-qualification.json) preserves all 256 arithmetic worlds and both captured reference rounds. The [recorded crew](https://platonik.space/lab/ark) offers four full receipts and portable save bundles.

After installing the pinned toolchain and dependencies, run `bun run check` from the repository root. The ark gate freshly verifies the retained receipts, imports and checks saved prefixes, repeats integrity probes, and checks the public projections. Initial admission passed with 337 distinct receipts and 942 fresh engine executions. Every admission has its own 1,536-execution limit and prints its actual count, including on failure.

Qualification used 558 executions and calibration used 354; the study's combined qualification field therefore reads 912. These are separate from the 1,375 study executions and 158 capacity executions. Repository tests and integration checks are additional validation work outside those frozen allowances. Reasoning tokens remain unmeasured.

## Scope of the next dependency

This step qualifies the declared arithmetic and two supplied binary service plans if its automated gates pass. Repeated requests and reset, richer local feedback, continuous numerical regulation, and physical movement of an ark remain separate capabilities. The subsequent [port commitments experiment](ports-evaluation.md) tests two one-shot obligations under delayed, lost, and duplicate reports without creating duplicate physical delivery credit.

Endogenous candidate generation and the complete sequence of chapter transitions remain after that. Capacity must be measured for the actual integrated campaign before [human playtesting](design-validation.md#human-playtesting-comes-after-agent-evaluation). Reachability, correct arithmetic, and cheaper programs cannot establish enjoyment or scientific novelty.
