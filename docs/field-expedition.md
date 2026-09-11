# Take a companion to the next camp

Implemented local expedition, September 2026. The full Long Trail and mobile ark remain proposals. This short field expedition gives your agent a persistent collection, a real closing route, a service system to assemble, and a checked ending. Creations survive between trials; each trial starts its own declared physical world.

## Reach the first crossing

Build the CLI with Rust 1.97.1 using the [installation guide](rust-bridge.md#install-and-run-locally). Work from the repository root. Choose a new save directory: initialization never replaces another save or unrelated files, and an exact initialization retry returns its original result. Import requires a new destination or the matching interrupted import. These commands write an append-only journal and immutable objects locally. No account, model API, database, or network is required by the game.

```sh
cargo build --release --locked -p platonik-cli
./target/release/platonik expedition init first-camp "First camp" frugal
./target/release/platonik expedition status first-camp
```

The collection begins with Moth, a compact shuttle; Fern, a recovery courier; Keeper, a memory controller; and two constant controllers. Names describe supplied references. A creation's actual habit comes from its program.

Try Moth when the route closes. The request ID identifies this action; the expected revision protects your save from a stale agent.

```sh
./target/release/platonik expedition act first-camp fixtures/expedition/try-moth.json --expect-revision 0 --request-id moth-crossing
```

This is an expected mission failure, returned with exit 1. The valid receipt and spent work remain recorded. The save advances to revision 2 because trial intent and completion are separate durable events. An agent can explain the blockage using the receipt's edge events and movements.

Grow a child using the supplied recovery policy, then repeat the same crossing. This adopts a known design; it does not claim a new algorithm. Moth's original program remains intact.

```sh
./target/release/platonik expedition act first-camp fixtures/expedition/grow-moth.json --expect-revision 2 --request-id grow-moth
./target/release/platonik expedition act first-camp fixtures/expedition/cross-with-child.json --expect-revision 3 --request-id child-crossing
./target/release/platonik expedition verify first-camp
```

The child completes the crossing; the failed parent trial remains available for comparison. Ask your agent to explain the cost difference, inspect the actual route, and decide which creation to take onward. The engine admits a finite edited program; there is no automatic mutation search or in-world reproduction.

## Finish the field expedition

Continue the same untouched walkthrough save at revision 5. Complete the other three training tasks with the same child and controller, then freeze that pair:

```sh
./target/release/platonik expedition act first-camp fixtures/expedition/calm-with-child.json --expect-revision 5 --request-id calm-child
./target/release/platonik expedition act first-camp fixtures/expedition/plan-a-with-child.json --expect-revision 7 --request-id plan-a-child
./target/release/platonik expedition act first-camp fixtures/expedition/plan-b-with-child.json --expect-revision 9 --request-id plan-b-child
./target/release/platonik expedition act first-camp fixtures/expedition/freeze-child.json --expect-revision 11 --request-id freeze-child
```

Now run the four confirmations once. The pair remains unchanged:

```sh
./target/release/platonik expedition act first-camp fixtures/expedition/confirm-early.json --expect-revision 12 --request-id confirm-early
./target/release/platonik expedition act first-camp fixtures/expedition/confirm-reversed.json --expect-revision 14 --request-id confirm-reversed
./target/release/platonik expedition act first-camp fixtures/expedition/confirm-delay-a.json --expect-revision 16 --request-id confirm-delay-a
./target/release/platonik expedition act first-camp fixtures/expedition/confirm-delay-b.json --expect-revision 18 --request-id confirm-delay-b
./target/release/platonik expedition verify first-camp
```

The final report has revision 20, nine recorded trials including the failed parent, and `progress.field_expedition_complete: true`. Its authored first-camp reply is earned by these eight successful cases. If you performed additional actions, use the current revision from `status` instead of these walkthrough numbers. A stale command is rejected without overwriting progress.

Use a **new** export filename and restore directory:

```sh
./target/release/platonik expedition export first-camp > first-camp.bundle.json
./target/release/platonik expedition import first-camp.bundle.json restored-first-camp
./target/release/platonik expedition verify restored-first-camp
```

Action reports contain trial summaries and hashes, not full traces. The exported bundle supplies the traces: each journal entry binds a request ID to an event object in `objects`; a `completed` event contains its full `receipt`. Ask your agent to follow the `child-crossing` request to its completed event, copy that receipt into a fresh JSON file, and inspect it with the standalone `inspect` command. Reading the exported JSON itself runs no simulation; `inspect` independently checks and reruns the receipt. Include that extra execution when measuring a session.

## Give the agent a persistent ambition

The repository's [play skill](https://github.com/hraness/platonik/blob/main/skills/platonik-play/SKILL.md) drives the commands through chat. Choose one of two expedition ambitions at initialization:

| Ambition | Choice it preserves |
| --- | --- |
| `frugal` | The agent may adapt both the courier and controller while comparing total work across all required cases. Minimum work is an objective, not a claim of global optimality. |
| `resilient` | Keep Fern's recovery program unchanged in every trial. The agent can adapt its controller or adopt an exact copy of the courier. The engine enforces the retained habit. |

The same four training tasks apply to both: supply the ordinary camp, survive a scheduled route closure, then supply the two report-dependent service plans. `expedition cases` lists their IDs; `expedition case <id>` prints the full declared world. A trial selects saved courier and controller IDs. The relay, bodies, initial memory, supplies, hazards, seed, and limits belong to the fixed task and cannot be edited through a campaign action.

Complete all four tasks with one unchanged pair, then freeze that pair. Four transfer cases vary closure timing, orientation, and message delay. Each transfer case runs once. Further growth and training stop after freezing; a failed confirmation remains a result, and adaptation starts a new declared expedition. These cases are public and locally inspectable. They are not a secret evaluator or evidence of generalization to arbitrary worlds.

All eight successful cases earn the first camp's authored reply. The fiction recognizes what the receipts established: transport survived a closure, and a saved controller used a retained report to allocate delivered stock. This ends the small field expedition. It does not complete the six-chapter campaign or simulate a traveling ark.

## Commands and records

```json
{"kind":"trial","case_id":"ark-plan-a","courier":"moth-child","controller":"memory"}
```

An action is one JSON object. `grow` accepts a new `id`, display `name`, existing `parent`, and complete `program`; the child's role follows its parent. `trial` accepts a fixed `case_id` and two saved creation IDs. `freeze` accepts the chosen `courier` and `controller` IDs. Supplied examples live in `fixtures/expedition/`.

| Command | Effect |
| --- | --- |
| `expedition init <dir> <name> <frugal\|resilient>` | Create a new local save with five supplied creations |
| `expedition status <dir>` | Reconstruct and check the journal; show collection, trials, pending action, revision, and next objective |
| `expedition cases` / `expedition case <id>` | Inspect the fixed task family |
| `expedition act <dir> <command.json\|-> --expect-revision <n> --request-id <id>` | Apply one admitted action; a trial records intent before executing |
| `expedition recover <dir> --expect-revision <n> --request-id <id>` | Finish the exact pending trial under its original request ID |
| `expedition verify <dir>` | Reconstruct state and re-execute recorded results |
| `expedition export <dir>` | Print a bounded replay bundle; shell redirection needs a new destination file |
| `expedition import <bundle.json\|-> <new-dir>` | Verify a bundle before creating a separate restored save |

An exact retry of an existing request returns its original result. Reusing an ID with a different action is rejected. A stale revision never replaces a newer action. A mission failure returns exit 1; malformed input, invalid actions, storage failures, and tampering return exit 2. A failed mission can verify successfully.

## Recover without losing the collection

After an interruption, inspect `status`. If a trial intent committed, use `recover` with its original request ID and the current revision. The engine replays that same experiment and commits its outcome once. If no intent committed, retry the original action. Temporary or unreferenced files are not evidence of progress. Committed corruption, a journal gap, or a mismatched object is rejected rather than silently repaired.

Export to a new file, then import into a new directory to test recovery on a separate save. Exported bundles contain programs, names, history, and receipts. Share them only when you intend to share that collection. Hashes detect changed content but do not authenticate a player; a local owner can create another history or start a new expedition. This is not an authoritative competitive service.

The store uses local filesystem atomic publication and explicit revision checks. A matching interrupted import may resume in an empty generated directory skeleton before its marker was written; existing committed data is never adopted without the matching marker. It does not provide hostile multi-user filesystem isolation or guarantee power-loss behavior on every filesystem. Keep a verified exported copy of a collection you care about.

The first two agent sessions completed this workflow under equal candidate allowances. Read [what the agents found](agent-evaluation.md) for the full outcome and its limits.

## What the allowance counts

Each expedition permits at most 32 trials, 21 creations including five references, and 1,000,000 modeled execution work. An intent reserves its experiment's full fuel cap; completion spends actual work and releases the unused part. Failed runs spend work. Pausing, naming, or growing a bounded program does not advance physical time. External reasoning, source editing, preprocessing, and replay verification still consume real resources even when they consume no simulated fuel.

Use the optional `--metrics` prefix when measuring an agent session. It writes a final process-metrics JSON line to stderr, including actual admitted engine invocations and elapsed execution time. History verification can execute earlier experiments again on each command. Count those invocations; trial count alone understates real computation. Agent tokens and total process-launch time require their own observation.

The habitat envelope remains at most 16 cells and 128 ticks per trial. Opt-in `platonik-habitat-v2` adds locally sensed undirected route closures; old v1 records retain their original behavior and identities. A closed route changes movement, preserves cells and cargo, and pays for event handling and edge checks. Signals continue to use their declared links.

Storage is bounded separately: at most 257 journal entries, 1,024 files, and 256 MiB accounted local data; an individual object is at most 32 MiB. Export and import use a symmetric 64 MiB bundle limit, so a larger valid local store may not fit one export. These are admission limits, not measured large-world capacity.

The [validation plan](design-validation.md) puts persistent agent trials, adversarial recovery tests, cost measurements, and the remaining campaign transitions before human playtesting. A checked small expedition can expose useful tradeoffs and refute bad ideas. Human enjoyment and scientific novelty require their own later evidence.
