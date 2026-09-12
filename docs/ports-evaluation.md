# What kept the promise

The port experiment tests a small dependency of the [Long Trail proposal](campaign.md#the-free-ports): can a crew fulfill a finite promise when a request or reply goes missing? Two independent lanes share a saved Rust world, each with a requester, courier, network adapter, physical report relay, and Keeper. A [walkthrough](port-commitments.md) and [recorded exchange](https://platonik.space/lab/ports) expose the same events.

## A parcel is not its acknowledgment

Each lane has one required parcel and a same-bit spare. A courier begins at the receiving depot, waits for a request, travels to the source, picks up the parcel, and returns. It retries Drop while carrying cargo. Only empty cargo in its returning phase permits it to wait for the physical depot receipt and confirm acceptance.

The acknowledgment passes through the network adapter to the requester. Its retained parcel annotation must match the actual handoff. The separate inherited report relay and Keeper route the parcel into the receiving home's beacon service. Acknowledgment certifies depot custody; it does not claim the beacon has already used the parcel.

The familiar physical relay is reused exactly. Keeper's rules are reused with the declared valve identifier remapped on the second lane. The request-driven courier is an explicit descendant with new waiting, transport, custody, and reply states. The earlier navigation courier cannot perform this protocol unchanged. The new two-channel network adapter prioritizes replies over repeated requests.

## What the world grants

Ten cells, eighteen local links, four finite sparks, and four draining beacons run for at most 128 ticks under a 100,000-unit modeled work allowance. No interpreter primitive, version, or save format changes. The two mirrored neighborhoods are supplied; this is not a geographic shipping network or two separately advancing worlds.

An organism can inspect a message's bit and local port, plus ordinary cargo and memory sensors. It cannot inspect the observer's signal IDs or parcel provenance. Wiring supplies two one-shot obligation identities. Both parcels in a lane have the same bit, so a spare substitution cannot be detected by payload value alone. The supplied requester checks the acknowledged type; the courier follows the same route for either type rather than selecting between different stocks.

Message delays, finite outage windows, and duplicate echo links are explicit world fields. They consume ordinary work and queue capacity. The engine bounds pending messages at 128 and link delay at sixteen ticks. A missing reply can trigger more work, but it cannot create matter or another delivery credit.

## Independent outcomes

The checker freshly replays the exact receipt or saved prefix. For each lane it binds a consumed request through both relay hops to the requester, then requires a later successful pickup and receiving-depot Drop by the declared courier. It binds the consumed acknowledgment through the return relay to a post-handoff report carrying that parcel's physical provenance.

Custody, acknowledgment, safety, and overall service have separate verdicts. Safety requires that the same-bit spare remain in its source throughout the observed history, that acknowledgment attempts make no premature or unproven custody claim, and that the required parcel receive at most one correct service credit. Failed or disabled sends still count as attempted claims. The complete commitment requires the full service horizon and both lanes' required events.

The grade projects one obligation per lane. Repeated truthful acknowledgment messages, or repeated consumption of them, do not create another physical credit. A trace is evidence about this execution. The competitive gate additionally binds every non-policy field to the frozen case and uses counterfactual controls; matching values alone cannot establish every possible program's internal reasoning.

In the clear reference, both couriers consume their requests at tick 3, pick up the required parcels at tick 7, and complete depot handoffs at tick 11. Both requesters receive confirmation at tick 16. With the reply channel disabled until tick 48, the same handoffs still occur at tick 11 and physical service finishes at ticks 12 and 14, but confirmation arrives at tick 49. The [walkthrough](port-commitments.md) pauses inside that gap.

## Fixture qualification

All eight supplied worlds passed the complete commitments contract on their first captured qualification attempt. Their modeled work totals range from 26,078 to 27,697. All six qualification controls completed 128 ticks and failed the whole contract. A control can preserve physical service while losing truthful confirmation or the required parcel's identity; those outcomes stay separate in the grade.

Qualification used 28 of its 128 allowed engine executions: eight reference worlds and six controls, each run and freshly checked. The focused full-depot regression also passed: repeated failed Drops retained the required parcel and returning phase, no acknowledgment was attempted before actual custody, and the later reply carried the delivered parcel's physical receipt. That regression is a separate counterfactual test, outside the eight frozen study cases.

## Declared comparisons

Training uses both opposite-type arrangements, an initial request outage that reopens at tick 18, and a reply outage that reopens at tick 48. Transfer changes the schedule seed, lengthens ordinary links to three ticks, or enables sixteen-tick echoes of requests or replies. The selected policies remain unchanged during transfer. These public recipes are not secret test data.

One agent ambition keeps the supplied request-driven couriers and edits one shared requester program. The other may edit both the shared requester and shared courier. Both lanes use the same submitted programs. Fixed report relays, network adapters, Keepers, initial state, terrain, stock, and schedules remain unchanged. Each arm has three candidate slots and four training worlds; selection orders full success, total modeled work, canonical policy bytes, then submission order. Four transfer worlds follow selection.

A simpler requester issues its request once. Controls remove couriers or physical report relays, insert an acknowledgment before transport, clear the courier's remembered completion, remove the required parcel while leaving the spare, or permanently disable the reply channel. Permanent reply loss is an expected confirmation failure, not a promise of eventual termination under arbitrary loss.

## Two agent ambitions

Both developer agents submitted three candidates in sequence. Every candidate passed all four training worlds; no slot was rejected, discarded, or replaced. Selection used training results only. Each selected program then passed all four transfer worlds unchanged. Each arm used 32 of its 64 allowed engine executions: sixteen cold worlds, each run and freshly checked. These were developer agents with access to the public recipes, not a blind generalization test. Their reasoning tokens were not measured.

| Ambition | Candidate | Training work, four worlds | Policy bytes |
| --- | --- | ---: | ---: |
| Reference | Supplied crew | 107,002 | 2,175 |
| Keep my couriers | **`trust-local-ack`** | **104,172** | **1,961** |
| Keep my couriers | `pace-request-retries` | 104,932 | 2,082 |
| Keep my couriers | `minimal-receipt-loop` | 104,250 | 1,856 |
| Spend less work | `reply-when-asked` | 104,822 | 2,309 |
| Spend less work | `shorter-custody-trip` | 100,939 | 2,227 |
| Spend less work | **`paced-requests`** | **98,609** | **2,134** |

Policy bytes count one canonical requester-plus-courier bundle. Both lanes load those programs, and the fixed relays, Keepers, state, and every subsequent operation remain charged in each world's work. The smallest submitted bundle does not win: its total work is slightly higher than the selected familiar crew's. Across training, it saves 840 units of loading work but spends 918 more during execution. Code size and running cost create different pressures.

The familiar selection saves 2.6% of reference training work and preserves the supplied courier program exactly. Its transfer total is 103,479, compared with the reference's 106,059. It accepts the next message on its isolated acknowledgment port, retaining the message and marking the request done, instead of branching on the payload bit. Courier routes, handoff times, and send counts remain unchanged.

The frugal selection saves 7.8% of reference training work; its transfer total is 97,262. It combines turning with movement through the supplied straight corridors and retains the depot receipt only after returning without cargo. Its rules preserve pickup and Drop retries, although the eight selected study runs encounter no failed courier actions. The separate full-depot regression exercises the reference courier. Once done, it sends that retained acknowledgment only when another request arrives. Its requester alternates sending and waiting until a reply arrives.

In the clear world the frugal crew hands off at tick 9 and confirms at tick 15, compared with ticks 11 and 16 for the reference. In the lost-reply world it confirms at tick 51 instead of 49. Each lane sends 25 requests and ten acknowledgments there, compared with the reference's 48 and 115. Fewer messages buy lower work while delaying confirmation in this case. Within the frugal arm, pacing the requests adds one acknowledgment tick across each training case compared with its second candidate.

Both selected requesters rely on the granted isolated reply channel rather than checking the bit themselves. The observer still requires a matching bit and physical provenance, but these results do not establish that the requester would reject a wrong or malicious message. The frugal movement transitions also rely on the initial outward headings and clear corridors; they are not a repair for arbitrary failed moves. These are explicit specializations of the eight declared worlds. No optimum, adversarial robustness, or arbitrary-loss liveness follows from three candidates.

## What simpler and broken crews reveal

The requester that transmits once passes seven of eight worlds. It fails the initial request outage, where its only forwarded request is lost. That crew still survives the reply outage because the supplied courier keeps retransmitting its retained receipt. The one-request rule also uses more modeled work than the reference in every passing case. Fewer transmissions alone do not make a cheaper program; the comparison isolates the need to retry a lost request.

All twelve control worlds complete 128 ticks and fail the whole commitments contract. Premature acknowledgment and missing required parcels can still pass ordinary physical service. With the reply channels permanently disabled, custody, service, and safety pass while acknowledgment fails. Clearing the courier's completion memory in the duplicate-request world even preserves custody, acknowledgment, and service, but spends the spares and fails safety.

These controls apply to the supplied architecture. They demonstrate why its request handling, physical evidence, retained state, and separate checks matter; they do not prove those exact programs are necessary for every correct design. In particular, success under finite outages is not a promise of eventual confirmation under permanent communication loss.

Four trajectories then used the declared six advances and both restorations: the reference, the familiar selection with duplicate requests, the frugal selection with lost replies, and the reference with permanently disabled replies. Each used 190 actual engine executions and reproduced its cold result and grade exactly, including the failed confirmation. Twelve tampered-receipt and bundle probes were rejected, using seventeen actual executions; early structural rejections remain counted as zero-engine attempts.

The complete frozen study retains **52 new cold worlds plus eight reused qualification references** and uses **881 of 1,024 allowed engine executions**. That total includes both agents, comparisons and controls, four saved histories, and rejected probes. It does not include the separate qualification, calibration, capacity, or admission allowances.

## Save-and-resume calibration

Before agent search, the clear reference used six advances, at ticks 1, 8, 16, 32, 64, and 128. Exports and imports at ticks 8 and 32 preserved its cargo, retained evidence, pending messages, and cumulative work. The final result and commitments grade matched the uninterrupted receipt exactly. Those thirteen saved-world commands required 190 actual engine executions because each command freshly checks retained history.

The [shorter walkthrough](port-commitments.md) was also executed exactly: pause the lost-reply case at tick 24, export and restore, then finish at tick 128. At the pause both depot handoffs had succeeded, both acknowledgments remained absent, and safety passed. The final checked result matched the reference. Its ten saved-world commands required 50 executions. Together the two paths used 240 of the separate 256-execution calibration allowance.

The study uses six advances, within the store's existing eight-advance limit. Pausing consumes no simulated ticks, but checking a longer history costs real CPU. This diagnostic does not raise the runtime's operating limits.

## Measured cost

The capacity capture used release Rust 1.97.1 on an Apple M5 Max, macOS arm64, with `MallocNanoZone=0`. Each of two reference workloads had one warmup and thirty measured repetitions. A sample constructs a receipt, serializes it into a fixed reusable 8 MiB buffer, and freshly verifies and grades it. Additional serialized-byte identity checks are outside that timing interval; full sample and process times remain in the evidence. Percentiles use the nearest-rank method over thirty measured samples.

| Reference world | p50 sample | p95 sample | Compact receipt |
| --- | ---: | ---: | ---: |
| Clear, types zero and one | 19.06 ms | 20.23 ms | 1,117,066 bytes |
| Lost reply, types one and zero | 19.79 ms | 20.78 ms | 1,133,888 bytes |

The benchmark process peaked at 8.05 MiB resident memory. Separate completed-history reads used thirteen fresh engine executions each: 69.40 ms with 20.06 MiB peak memory for the reference, and 78.57 ms with 21.50 MiB for the familiar selection under duplicate requests. These are single observed history reads, not latency percentiles. The four complete public bundles occupy 1,595,488–2,553,282 bytes each.

The capture used 150 of its 192 allowed engine executions and passed the declared 256 MiB memory, 8 MiB receipt, and 16 MiB completed-bundle thresholds. The runtime's separate 64 MiB import limit is not an admitted operating size. These measurements cover two specified workloads and two saved histories in the ten-cell, 128-tick envelope on this machine. They do not establish larger-world throughput, the integrated campaign's capacity, hosted cost, or an agent's token bill.

## Inspect and reproduce the evidence

The [frozen protocol](https://github.com/hraness/platonik/blob/main/fixtures/evidence/ports-protocol.json), [qualification packet](https://github.com/hraness/platonik/blob/main/fixtures/evidence/ports-qualification.json), [complete study](https://github.com/hraness/platonik/blob/main/fixtures/evidence/ports-study.json), and [capacity samples](https://github.com/hraness/platonik/blob/main/fixtures/evidence/ports-capacity.json) retain the world grants, submitted programs, process counters, and exact artifact identities. The [recorded exchange](https://platonik.space/lab/ports) offers full receipts and portable save bundles for four trajectories, including a permanently missing reply.

After installing the pinned toolchain and dependencies, run `bun run check` from the repository root. The ports evidence gate freshly replays retained receipts, imports and verifies saved prefixes and completed histories, repeats tampering probes, and checks the public projections. Initial independent admission passed with 67 distinct receipts and 516 fresh engine executions. Each admission has its own 1,024-execution allowance and reports the count even on failure.

Fixture qualification used 28 executions and calibration used 240; the study's combined qualification field therefore reads 268. These are separate from the 881 study executions, 150 capacity executions, and fresh admission allowance. Repository tests and integration checks are additional work outside the frozen study. External reasoning tokens remain unmeasured. Modeled work measures operations inside the habitat; it is not a measurement of an agent's token bill or a proof that a program is optimal.

## What remains beyond these ports

This experiment covers two finite one-shot obligations under declared schedules. It does not establish repeated-session reset, sequence-number wraparound, arbitrary message identifiers, malicious peers, independent node crashes, cross-region time, or a hosted economy. A sender's correct belief about depot custody is still different from end-to-end beacon service.

The next proposed capability is [endogenous candidate generation](campaign.md#the-bloom): a bounded in-world process must propose a changed program and earn a checked result. That capability must then compose with transport, construction, repeatable control, and these commitments across the actual chapter transitions. The integrated campaign needs its own capacity and agent evaluation before [human playtesting](design-validation.md#human-playtesting-comes-after-agent-evaluation). A working protocol cannot establish human enjoyment or research novelty.
