# Help a lost courier find its way

Bounded navigation evidence, 11 September 2026. The complete campaign remains a proposal. A destination-aware courier passes all 44 distinct worlds in the declared comparison, including two preserved reopening failures. The [continuous habitat](continuous-habitat.md) exposed the problem: a path reopening can leave Fern circling while supplies remain nearby. Changing only the courier's program keeps this crew useful through those journeys.

## A habit meets a changed world

Fern takes a clear right turn before considering forward, left, or back. In the preserved reversed crossing, the route closes at tick 27 and reopens at 50. In the late crossing, it closes at 39 and reopens at 61. After reopening, the courier repeatedly makes four successful right moves around a square. Its movements are legal; they no longer get the remaining supplies to the depot.

Both original runs complete 96 ticks, conserve every spark, and retain fuel. Two sparks remain at the reversed world's source; one remains at the late world's source. The engine did not lose an item or invent a failed collision. The courier's local preference stopped being useful.

The earlier qualification postponed reopening to tick 88. Those narrower cases remain unchanged. Here the original tick-50 and tick-61 cases are mandatory training inputs. Only cell 1's program may change. The keeper, relay, initial memory, terrain, reports, charges, fuel, deadlines, and event times remain fixed within each comparison.

## Counting turns was not enough

One developer agent prepared four programs before any candidate execution. Each counted consecutive right moves in a byte register. After one, two, three, or four right moves, it preferred a clear forward step. Service actions and other movements reset the count. The courier still used relative directions and local obstacles.

All four failed at least one mandatory training world. The first diagnostic closed with no selected program and no transfer runs. All sixteen trials remain in the [failed-search record](https://github.com/hraness/platonik/blob/main/fixtures/evidence/navigation-study.json).

| Turn-count threshold | Training missions passed | Total modeled work |
| --- | --- | --- |
| One | 1 of 4 | 35,923 |
| Two | 2 of 4 | 38,019 |
| Three | 2 of 4 | 39,544 |
| Four | 2 of 4 | 40,947 |

The shorter thresholds formed six-cell loops. The larger thresholds made progress too slowly. In the late world, threshold four deposited the sixth spark at tick 90; its two three-tick signal hops reached the keeper at tick 96. Taking the report used the final activation, leaving no tick to route the spark. More machinery had not supplied a useful destination.

## Remember where the trip is going

A second, separately declared diagnostic keeps the failed search and its cost. Its three programs use a different representation: remember the compass bearing at launch, head toward the depot while carrying, and head toward the source while empty. A clear vertical neighbor provides a detour around a closed longitudinal edge.

The starting bearing already points toward the depot in these worlds. This is supplied information, not a destination discovered without clues. The programs also rely on the specified two-row corridor and its available bypass. They read local heading, cargo, obstacles, and facilities; they receive no coordinates, clock, case ID, or future event schedule during execution.

The first draft stores the launch bearing in one register and derives its current target from cargo. The second stores both the bearing and current target, spending one setup tick to shorten its rules. The third changes the order of those same rules to check common headings earlier. All bodies already contain four byte registers; using a second register consumes more of that existing capacity, not additional allocated RAM. Reads, writes, setup, rule loading, and simulation work remain charged.

Selection uses the same four training worlds: the two original failures, an ordinary changing-report habitat, and an earlier closing-and-reopening route. It requires all four missions to pass, then minimizes total work, canonical program bytes, and submission order. Each diagnostic has its own fixed slots. Failure never creates an extra slot or erases the earlier search.

## What the second diagnostic found

All three drafts passed the four training journeys. Selection froze `compass-goal-heading` before any transfer or compatibility execution.

| Courier | Training missions passed | Total modeled work | Canonical program bytes |
| --- | --- | --- | --- |
| `source-compass` | 4 of 4 | 63,146 | 5,732 |
| `compass-goal` | 4 of 4 | 55,549 | 4,097 |
| `compass-goal-heading`, selected | 4 of 4 | 53,801 | 4,097 |

The two-register implementations used less work despite an extra setup tick. The selected courier saved 9,345 work against the one-register draft: 6,540 from loading its smaller encoding and 2,805 during execution. All three followed the same successful movement sequence and delivered at the same ticks in each training world; waiting absorbed the setup delay. Program size has a concrete cost here, but making the state representation simpler can reduce both size and execution work.

The two goal-register variants produced identical physical state at every tick. Checking common headings earlier saved 1,748 execution work with the same 4,097-byte program size. These are comparisons among three submitted implementations, not a minimum-cost proof. Both original failed couriers cost less than the successful repairs; savings among repairs must not be described as savings against those failures.

The selected courier then passed all 34 transfer variations and all eight compatibility runs. Counting the two repeated training inputs only once gives 44 distinct worlds.

| Courier across the same 44 worlds | Missions passed | Total modeled work |
| --- | --- | --- |
| Selected destination-aware courier | 44 of 44 | 601,191 |
| Original right-wall courier | 14 of 44 | 372,402 |
| Compact bouncing shuttle | 28 of 44 | 352,811 |
| Selected courier without its return-goal update | 0 of 44 | 727,694 |

The compact shuttle is a useful competitor: it repairs the original reversed journey for 8,053 work, while the selected courier spends 13,921. Its final delivery arrives at tick 95; the selected courier finishes at 71. But the shuttle fails the original late journey and sixteen worlds overall. The selected repair buys speed and broader reliability at a substantial cost. A future design that improves both is welcome.

In the reversed journey, the original delivers four sparks; the selected courier delivers all six, finishing at tick 71. In the late journey, the original delivers five; the selected courier finishes all six at tick 73. The removal control keeps the first outward trip but fails every mission. This particular return mechanism matters to the selected architecture.

## How far the comparison reaches

For each original counterexample, vary closing and reopening independently by minus one, zero, or plus one tick. Run each combination at its original bearing and with the entire world rotated 180 degrees. That gives 36 timing-and-bearing worlds, including the two original training worlds. The remaining 34 run only after the training winner freezes. The eight earlier continuity cases provide further compatibility checks; two repeat training inputs and do not count as new evidence.

There are 46 named recipes and 44 distinct worlds. The original right-wall courier, a compact bouncing shuttle, and a version of the selected program with its return-target mechanism removed face every distinct world. The control preserves initialization and the first outward trip. For the one-register draft it removes empty-cargo longitudinal movement rules; for the two-register drafts it removes only the goal update on Drop. This tests the particular return policy. It does not establish that memory is necessary for every lawful courier. A simpler design or removal control is allowed to pass.

This is a complete comparison over a specified small neighborhood of one terrain family. It is not general maze navigation, arbitrary obstacle recovery, or an independently replicated research result. Public recipes and the agent's prior development context make this a developer diagnostic, not a blind test of models. External reasoning-token use is unknown.

The final receipts distinguish completing the task from escaping an identical trapped state. A program installed at launch can prevent the old loop from forming. That does not demonstrate replacing a program mid-journey; the current saved habitat deliberately forbids such a change.

## Keep the same world and every failed attempt

Exploration uses a Rust run followed by independent replay verification. Four recorded comparisons—original and selected courier on each original failure—also advance through eight separate CLI processes, export at tick 9, import a new copy, and continue it. Every frame, register, item, pending signal, resource, and cost must equal the uninterrupted result.

The second study consumed 1,408 of its 2,048 reserved engine executions. Its 186 cold trials comprise 12 training, 42 frozen confirmation runs, and 132 baseline or removal-control trials. Running and verifying them consumed 372 executions; the four segmented replays consumed another 1,036. Every saved trace matched its uninterrupted result, including failed missions.

The first search consumed 32 actual engine executions across sixteen training trials; its unused allowance is not reported as spent. Each study's setup qualification used another 263 executions, for 526 separately recorded qualification executions. The two studies and their qualifications therefore used 1,966 executions before final artifact admission. Fresh admission has its own bounded allowance and does not select new candidates. External agent reasoning and token costs remain unknown.

Complete receipts are compressed and stored by content hash. Repeated identical receipts share a stored file, but each attempt retains its own outcome, process metrics, and budget cost. Admission checks compressed and decompressed hashes, enforces a decompression limit, freshly verifies every distinct receipt in Rust, and restores each published saved world. Compression reduces storage; it cannot improve the reported score or erase an unsuccessful attempt.

One fresh admission of the second study used 388 engine executions, including independent restoration of all four published saves. The first failed study's separate admission used sixteen. Required delivery checks repeat admission on the code being integrated; those checks are not additional search attempts.

The second study stores 184 distinct compressed receipts: 41,671,314 uncompressed bytes become 1,871,549 bytes. The four browser comparisons, including full saved-habitat bundles, use another 3,930,415 bytes; the study ledger is 922,314 bytes. These measurements describe the current small artifact set. They do not qualify a larger active ecology or a public service's operating cost.

## Inspect and reproduce a journey

The [recorded navigation comparison](https://platonik.space/lab/navigation) includes the original failures. Use its experiment, receipt, and saved-habitat download buttons to give exact inputs to your agent.

Build the CLI using the [Rust installation guide](rust-bridge.md#install-and-run-locally), then run these commands from the repository root with the downloaded files there:

```sh
./target/release/platonik run repaired-reversed.experiment.json
./target/release/platonik verify repaired-reversed.receipt.json
./target/release/platonik habitat import repaired-reversed.bundle.json checked-navigation
./target/release/platonik habitat status checked-navigation
```

Choose a new save directory. Import verifies the recorded history; it does not replay a live game clock or change the imported design. To try a different courier, edit a copy of the experiment and initialize a separate habitat. Follow the [saved-world guide](continuous-habitat.md) for advancing and restoring it.

The second [protocol](https://github.com/hraness/platonik/blob/main/fixtures/evidence/navigation-repair-protocol.json), [source freeze](https://github.com/hraness/platonik/blob/main/fixtures/evidence/navigation-repair-freeze.json), and [complete study](https://github.com/hraness/platonik/blob/main/fixtures/evidence/navigation-repair-study.json) expose recipes, submissions, failed attempts, and receipt hashes. `bun run check` runs the new admission check together with all historical gates. It performs fresh verification; it does not secretly search for a different winner.

## What comes after navigation

This repaired courier keeps an earlier crew useful through changed journeys. The following [construction diagnostic](construction-evaluation.md) reuses it while requiring another organism to obtain finite material, build a supplied executable keeper inside the same Rust world, and show that the child does useful work. Material accounting, unsuccessful construction attempts, interruptions, and simpler comparisons have their own checks. The navigation result itself establishes no construction or complete campaign claim.

The [automated campaign path](design-validation.md#the-automated-path-before-people-play) still ends with human playtesting after construction, continuation, the compressed Long Trail, and measured operating limits. Agent success cannot establish attachment or enjoyment.
