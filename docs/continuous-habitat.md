# Carry one world through the journey

Implemented bounded Rust habitat, September 2026. A courier, relay, and keeper service changing reports in one physical world. Save while a spark is in hand or a report is in flight, then resume the same state. V3 adds [material-dependent construction](construction-evaluation.md) in this same save format. A traveling ark and the complete Long Trail remain proposals.

## Start with the crew you already know

Build the CLI using the [Rust installation guide](rust-bridge.md#install-and-run-locally). Run these commands from the repository root. Choose new output filenames and save directories; shell redirection can overwrite a file even when the game itself never replaces a save.

```sh
cargo build --release --locked -p platonik-cli
./target/release/platonik habitat case changing-one > changing-world.json
./target/release/platonik habitat init first-habitat changing-world.json
```

The supplied world uses Fern's recovery courier, the familiar relay, and Keeper's report-taking controller. Its six sparks ask for both service beacons over the journey. A successful deposit reports the bit on the actual buffered spark. The depot holds one spark at a time, so a later report cannot describe a different item ahead of it.

To bring a frozen pair from your own [field expedition](field-expedition.md), prepare a separate world instead:

```sh
./target/release/platonik habitat prepare changing-one first-camp > my-crew-world.json
./target/release/platonik habitat init my-crew-habitat my-crew-world.json
```

Preparation checks the source collection, copies its exact courier and controller programs into the declared new bodies, and leaves the collection intact. The relay, terrain, supplies, event schedule, and limits belong to the chosen habitat. A new body and initial state are admitted once at launch; all later advances preserve that world's actual state. Passing an older task does not guarantee this changing-report task will pass.

## Leave with a report in flight

Follow the reference `first-habitat` save. Initialization records revision 0 after charging the original input load. It does not run a physical tick.

```sh
./target/release/platonik habitat advance first-habitat --until 5 --expect-revision 0 --request-id carrying
./target/release/platonik habitat advance first-habitat --until 9 --expect-revision 2 --request-id report-in-flight
./target/release/platonik habitat status first-habitat
./target/release/platonik habitat export first-habitat > paused-habitat.bundle.json
./target/release/platonik habitat import paused-habitat.bundle.json restored-habitat
```

The courier has moved; stock is no longer all at the source. At tick 9 in the reference, a report is still queued. The exported world retains its delivery time and identity, the keeper's registers, cargo, beacon reserves, closures, and all work already spent. Status and wall-clock waiting advance no simulated time.

Continue the restored copy. The original `first-habitat` remains paused at tick 9.

```sh
./target/release/platonik habitat advance restored-habitat --until 14 --expect-revision 4 --request-id retained-report
./target/release/platonik habitat advance restored-habitat --until 19 --expect-revision 6 --request-id first-service
./target/release/platonik habitat advance restored-habitat --until 27 --expect-revision 8 --request-id next-supply
./target/release/platonik habitat advance restored-habitat --until 47 --expect-revision 10 --request-id crossing
./target/release/platonik habitat advance restored-habitat --until 79 --expect-revision 12 --request-id last-supplies
./target/release/platonik habitat advance restored-habitat --until 96 --expect-revision 14 --request-id arrival
./target/release/platonik habitat verify restored-habitat
```

Each advance commits an intent and then its checked result, so eight advances end at revision 16. The supplied reference services both beacons. Its uninterrupted and resumed results must match every frame, resource, message, cost, and outcome. The [recorded habitat](https://platonik.space/lab/habitat) lets you inspect these moments without installing Rust.

## What the keeper has to learn

The field expedition's earlier report family held one bit constant throughout each trial. A controller could remember only a positive report and use its initial zero otherwise. Here the next spark can change the answer from one to zero. An old useful specialization can fail a new job.

Your agent may propose a keeper that records both reports, or a simpler method that tries both service routes. Wrong attempts retain stock and consume work. A lawful blind strategy is part of the comparison. The game does not disqualify it for being less elaborate. The [evaluation report](continuity-evaluation.md) records which methods actually worked and what they cost.

Programs stay fixed after launch. Ask the agent to preserve the original experiment, edit a copy, and create another habitat to compare a different design. The current habitat has no mid-journey refit, fuel purchase, or clock jump. In v3, a parent can acquire material, copy a declared blueprint, and activate its child through ordinary metered actions; the supplied experiment remains immutable. See [construction](construction-evaluation.md) for its separate material ledger and bounds.

## Pause, retry, and recover

An advance uses an **absolute** target tick, not a number of additional ticks. It must move strictly forward within the original horizon. Saving is allowed only after a complete tick, including its messages, activations, service drain, and invariant checks. Loading is charged once in the modeled ledger; subsequent advances cannot refill the original allowance.

An exact request retry uses the original request ID, original expected revision, and original target. It returns that action's original response even if later actions exist. Reusing an ID for a different action or sending a stale revision is rejected.

After an interrupted command, inspect `habitat status`. If an advance intent committed, its pending request ID and target remain visible. Finish that exact intent with:

```sh
./target/release/platonik habitat recover restored-habitat --expect-revision CURRENT_REVISION --request-id ORIGINAL_REQUEST_ID
```

Use the values in your actual status report. If no intent committed, retry the original command. Recovery cannot quietly discard a failed attempt or rewrite an earlier world. Temporary and unreferenced files do not establish progress.

A fuel-exhausted partial tick is terminal. Resuming it would need a separately defined cursor within the tick; this release does not invent one. An earlier activation-limit failure remains recorded when later complete ticks are resumed, and cannot turn into a successful mission. A mission failure can still have a valid, replayable saved history.

## Commands and limits

| Command | Result |
| --- | --- |
| `habitat cases` / `habitat case <id>` | List or export a complete supplied world |
| `habitat prepare <id> <expedition-dir>` | Check a frozen field-expedition pair and export the chosen world using its exact programs |
| `habitat init <new-dir> <experiment.json\|->` | Admit one immutable original world and record its initial loading result |
| `habitat advance <dir> --until <tick> --expect-revision <n> --request-id <id>` | Record intent, continue the same world, and commit the result |
| `habitat status <dir>` / `habitat verify <dir>` | Reconstruct and check saved state, history, and progress |
| `habitat journey <dir>` | Check a First Answer save and report its service, construction, contact, and local ending |
| `habitat voice <dir>` | Emit the canonical wire digest a contacted-side voice may consume: checked report, citeable facts, declared boundary, and a binding hash |
| `habitat answer <receipt.json\|->` | Freshly verify a standalone First Answer receipt and report the same local objective |
| `habitat ark <dir>` | Check a saved ark's arithmetic, retained plan, and physical service |
| `habitat ark-check <receipt.json\|->` | Freshly verify a standalone ark receipt and report its control objective |
| `habitat arithmetic-case <a> <b> <tap>` | Export one four-bit addition world; operands 0–15, plan tap 0 or 4; no engine execution |
| `habitat recover <dir> --expect-revision <n> --request-id <id>` | Finish the exact committed pending intent |
| `habitat export <dir>` | Print a checked bundle containing the original world and checkpoint history |
| `habitat import <bundle.json\|-> <new-dir>` | Verify the bundle before creating a separate restored habitat |

The runtime still admits at most 16 cells and 128 ticks in one world. This fixture uses four cells and 96 ticks. A saved habitat permits at most eight advances; zero-time status calls do not consume one. Individual objects are bounded at 32 MiB and export/import at 64 MiB, within the local filesystem store's existing accounting bounds.

These checkpoints contain full frame prefixes. Parsing, replay, hashing, and duplicated storage have real costs. Use `platonik --metrics habitat ...` to count engine executions as well as modeled work. The evaluator records verification overhead and measures actual save sizes; a paused world is not a claim of cheap unlimited history.

The store derives state from a checked original experiment. Imported state cannot change its fuel, future event schedule, memory, stock, or programs while claiming the same genesis. Hashes identify content; they do not authenticate a player or prevent an owner from starting a different lawful local world. Public competition needs a separately authoritative task contract.

For a complete local construction-to-contact adventure, follow [Bring a signal home](first-answer.md). It uses this same save format and adds a separately checked local ending.

For computation that changes a physical delivery, [give home a plan](ark-control.md). This 128-tick habitat carries a number, emits its five-bit sum, and retains one selected bit after contact ends. It uses the same checked save format, with separate arithmetic and service grades.

No account, game server, external model call, or background world simulation is required by these CLI commands. The external agent reasons outside the habitat. Human playtesting follows the remaining [automated campaign gates](design-validation.md#the-automated-path-before-people-play).

The [port walkthrough](port-commitments.md) preserves a handoff while its acknowledgment is missing. Use `habitat ports` to inspect custody, confirmation, and service separately; its [evaluation](ports-evaluation.md) records the bounded six-cut restoration protocol.
