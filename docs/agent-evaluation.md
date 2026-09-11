# Two agents reached the next camp

Measured agent diagnostic, 11 September 2026. Both agents completed the persistent field expedition, kept their collections, and reproduced the same outcomes after export and restoration. The full campaign remains a proposal. This test establishes a small working engineering loop and a consequential preference; human enjoyment and larger worlds are still untested.

One agent could change its courier and controller to reduce work. The other had to keep Fern's recovery program unchanged and improve the controller around it. Each could submit four candidate pairs, with four training cases per pair and four confirmation cases after freezing its winner. The public references, rules, and cases were available. The agents had different prior development context and unknown reasoning-token usage, so this is a finite task demonstration, not a controlled comparison of model intelligence.

## Keeping a favorite changed the journey

| Observed result | Free to adapt the pair | Keep Fern on the crew |
| --- | ---: | ---: |
| Winning training work, four cases | 16,468 | 17,394 |
| Training success | 4 of 4 | 4 of 4 |
| Unchanged winner on transfer cases | 4 of 4 | 4 of 4 |
| Ordinary-camp delivery ticks | 6, 18, 30 | 8, 20, 32 |
| Creations retained at the end | 12 | 8 |
| Original creations preserved | All five | All five |
| Restored campaign equals original | Yes | Yes |

The unrestricted winner used **5.3% less training work** than the winner that kept Fern unchanged. Its courier followed a different local route and delivered two ticks earlier in the ordinary camp. The preference had an observed cost and behavioral consequence in this search. It does not establish an unavoidable price for keeping Fern, a globally optimal program, or a permanent frontier between the two approaches.

The unrestricted controller took advantage of the declared report family: every spark in a trial carries the same bit, and its register starts at zero. It only needed to latch a positive report. That specialization works on these cases; a changing sequence of reports is a different task. Its final candidate also saved a few bytes in the charged program representation. That is a loading-cost improvement, not faster execution of a newly discovered general algorithm.

The companion-preserving winner removed a redundant readiness register. Its controller attempted the closed valve more often, and those failures were recorded and charged, but the simpler policy still cost less overall. In plan B, it captured reports at ticks 10, 22, 34, and 46. At tick 48, contact had ended and the retained bit remained one. At ticks 52–55, it routed four physically delivered sparks to the service beacon. The courier's contribution stayed visible in the same receipt.

## Every candidate and confirmation result

Each row used one unchanged pair across all four training tasks. None of the eight submitted candidates was rejected or failed a training mission. Deliberate failures were tested separately in the baselines and adversarial probes; they were not dropped to improve these rows.

| Arm | Candidate | Training work | Canonical pair bytes | Result |
| --- | --- | ---: | ---: | --- |
| Free to adapt | Lean loop | 16,568 | 838 | 4 of 4 |
| Free to adapt | Sticky report | 16,498 | 839 | 4 of 4 |
| Free to adapt | Left bank | 16,490 | 838 | 4 of 4 |
| Free to adapt | Wait latch, selected | 16,468 | 827 | 4 of 4 |
| Keep Fern | Public reference | 17,798 | 1,117 | 4 of 4 |
| Keep Fern | Short memory, selected | 17,394 | 1,012 | 4 of 4 |
| Keep Fern | Positive memory | 17,398 | 1,012 | 4 of 4 |
| Keep Fern | Positive write | 17,396 | 1,013 | 4 of 4 |

Both winners were fixed before their confirmation feedback. No replacement followed these results:

| Public transfer case | Free to adapt: work | Keep Fern: work | Result |
| --- | ---: | ---: | --- |
| Earlier route closure | 2,869 | 3,098 | Both pass |
| Reversed world and later closure | 2,754 | 2,975 | Both pass |
| Delayed report, plan A | 5,532 | 5,762 | Both pass |
| Delayed report, plan B | 5,522 | 5,758 | Both pass |

The [frozen protocol](https://github.com/hraness/platonik/blob/main/fixtures/evidence/expedition-protocol.json) records the objectives, cases, budgets, selection rule, and failure decisions. The [freeze record](https://github.com/hraness/platonik/blob/main/fixtures/evidence/expedition-freeze.json) pins source and binary identities and the passing reference qualification. Source and transfer recipes were public; passing four related cases is not statistical evidence about unfamiliar worlds in general.

## Failures, tampering, and recovery

All twelve declared adversarial probes passed. They covered changed task conditions, unknown roles, replacement of the protected courier, incompatible constant-controller successes, rehashed forged receipts, duplicate requests, failed progress, stale revisions, interruption recovery, pause behavior, names containing fake instructions, and parent preservation.

The tutorial's compact courier failed the closing route. Its child succeeded, a failed sibling stayed in the collection, and the original parent remained unchanged through export and restoration. Trying one constant controller for each service plan did not earn permission to freeze either as a single successful pair.

Separate subprocess tests exited at two actual journal-write boundaries: after syncing a temporary file and after publishing its hard link. Recovery retained a valid old or new committed prefix. This is process-interruption evidence on the tested filesystem, not a guarantee against power loss on every filesystem. A bounded exhaustive test also checked 2,048 local movement and closure configurations against an independent coordinate rule; it does not exhaust every possible habitat.

## The real cost of a saved session

The diagnostic used **68 logical evaluations and 2,572 actual engine executions**, within the predeclared ceiling of 4,096. The logical count contains 40 agent trials, 16 reference evaluations, and 12 conservatively counted probe evaluations. The larger execution count includes receipt verification, history replay, recovery, and the capacity measurement. Prior automated tests and 16 preflight qualification executions are recorded separately.

| Measured activity | Engine executions |
| --- | ---: |
| Free-to-adapt agent session | 834 |
| Keep-Fern agent session | 810 |
| Public baselines and verification | 32 |
| Adversarial probes | 296 |
| Thirty saved-journal verifications | 600 |
| Total diagnostic | 2,572 |

The two agents spent 82,701 and 87,579 modeled work across all their trials. Summed CLI subprocess wall time was about 5.47 and 4.77 seconds respectively; those observations exclude external reasoning and scheduler waiting. They are not a comparison of agent speed. Every measured command emitted an execution counter; unavailable token usage was kept unknown.

On an Apple M5 Max with 36 GiB RAM and macOS 26.5.1, thirty separate release-CLI verifications of the same twenty-trial save had **46.53 ms median and 52.40 ms p95** end-to-end latency. Maximum observed Rust-process resident memory was **6,111,232 bytes, about 5.83 MiB**. The exported collection occupied **1,655,039 bytes, about 1.58 MiB**.

That measurement includes process launch, local reads, parsing, replay checking, report serialization, and the timing wrapper. It does not isolate the machine or control cold filesystem caches. It excludes the external agent and does not test a long-lived service. The habitat still permits only 16 cells and 128 ticks per trial; these saved-session measurements do not admit the larger proposed ecology.

## Inspect and reproduce the result

The [complete study record](https://github.com/hraness/platonik/blob/main/fixtures/evidence/expedition-study.json) contains every candidate, selected trace summaries, command metrics, baseline outcomes, probe accounting, and capacity samples. Both checked collections are committed: [free-to-adapt bundle](https://github.com/hraness/platonik/blob/main/fixtures/evidence/expedition-frugal.bundle.json) and [keep-Fern bundle](https://github.com/hraness/platonik/blob/main/fixtures/evidence/expedition-resilient.bundle.json).

After building the CLI from this checkout, import either bundle into a new directory and verify it:

```sh
./target/release/platonik expedition import fixtures/evidence/expedition-frugal.bundle.json reviewed-frugal
./target/release/platonik --metrics expedition verify reviewed-frugal
```

Import checks the complete journal and recreates a separate local collection. It does not alter the supplied bundle or publish anything. Use a fresh destination. The repository's aggregate gate imports and replays both published collections and checks the recorded study arithmetic; historical timing measurements remain observations, not values a new machine must reproduce.

The next automated milestone is a continuous habitat that carries real service state through its journey, followed by construction, continuation, and the compressed Long Trail. Those capabilities must pass their own agent and capacity evaluations. The [validation sequence](design-validation.md#the-automated-path-before-people-play) keeps human playtesting last. This result earns that next engineering step; it does not establish that the whole space opera will be fun or scientifically productive.
