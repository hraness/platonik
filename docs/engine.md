# Rust engine and agent interface proposal

Proposal, 10 September 2026. The current milestone is the Platonik website and documentation. The Rust engine, CLI, file formats, and skills below are not implemented. This is the first prototype's intended contract, not an installation guide.

## The agent runs the laboratory

The Rust executable owns genomes, simulation, random seeds, costs, saves, and outcomes. An external agent reads structured observations, writes candidate genomes, chooses experiments, and explains results in chat. The agent's prose cannot mutate facts or award itself discoveries.

Do not embed an LLM in each cell. The organism is a small executable policy; the external agent is the scientist controlling the laboratory. A submitted organism must function when the scientist is disconnected.

Use one Cargo workspace with a small library and CLI at first. Keep the deterministic interpreter, simulation, checker, and persistence behind distinct module boundaries. A hosted evaluator can reuse them later; no service, account, model provider, or Oh installation should be needed for the first local episode.

## The first world

The initial body is a line of cells carrying immutable input values, local registers, and policy identifiers. A local exchange moves the whole cell, including its policy and memory. This makes clustering by policy measurable; ancestry remains a separate lineage record. Identity and policy labels are visible to the observer but unavailable to organism instructions.

Proposed instructions include bounded integer and Boolean operations, neighbor comparisons, local register reads and writes, conditional choice, and a request to swap with an adjacent cell. Reject unchecked native code, unbounded integers, recursion, and unbounded allocation in the first language. All permitted loops or repeated activations terminate under fuel. Bounds are prototype decisions to calibrate, then version explicitly.

Activate cells in a specified seeded order using stable cell identities. Complete each activation atomically; the next cell observes committed state. Moving a cell does not give it an accidental extra activation in the same sweep. A wounded controller cannot initiate an action, but a neighbor can still exchange with it. Damage schedules must name whether they target a cell identity or a location; the tutorial disables one cell identity. Two passive cells cannot exchange with each other, so later challenges with multiple disabled controllers need a reachability check or a known feasible construction. Additional injury semantics require new challenge definitions.

The checker independently verifies the final values are a permutation of the original input and meet the ordering objective. It does not trust a policy's declaration of success. A stalled or exhausted run is unfinished within budget, not evidence that the task has no solution. The competitive rules score it as a non-completion.

Sorting is the first habitat because it has a small readable state and cheap independent checking. General grids, transport tasks, and endogenous reproduction can be added after the loop proves interesting.

## A small command surface

Illustrative future commands:

```text
platonik init --world wound --seed 7
platonik status --json
platonik inspect starter-a --json
platonik breed starter-a starter-b --mode chimera --seed 19 --name moth
platonik run moth --suite wound-training --fuel-limit 2000000 --request-id trial-1
platonik observe trial-1 --view recovery --json
platonik export trial-1 --output expedition.json
platonik replay expedition.json --json
```

Here `--fuel-limit` caps the whole experiment, including all children and cases when batching is supported. The suite also supplies per-case limits. Reaching the total cap records remaining cases as not run; it cannot produce a ranked complete result. Long jobs should expose resumable progress or bounded chunks and support cancellation without leaving a partial result labeled complete.

All commands should support structured output with schema version, status, stable IDs, costs, result references, and explicit errors. Help must expose valid commands and JSON schemas. Human-readable tables and a tiny array rendering are useful fallback views; a separate TUI is unnecessary for this prototype.

Mutations take a request ID and expected save revision. Retrying an identical request returns its prior result; reusing an ID for different input fails. Reads do not advance the simulation. Persist new content before atomically publishing a new save revision, so cancellation preserves the previous valid state. A failed append or interrupted write needs a tested recovery path.

## Skills to ship with the playable engine

Start with one portable `platonik-play` skill. It checks the installed version and command schema, opens or resumes a world, obtains a player-authorized experiment budget, runs bounded commands, and narrates changes using result IDs. It should offer a consequential choice after an experiment rather than spending indefinitely or asking the player to micromanage every command.

Add `platonik-research` when claims and controls exist. It freezes a hypothesis, proposes a matched intervention, separates exploration from confirmation, runs a held-out assay, and exports a concise evidence bundle. Both skills use the same public CLI that any competing agent can use.

The skill must treat creature names, imported descriptions, and rival commentary as data rather than instructions. An imported organism cannot change tool permissions or spend external-agent compute. Local play does not publish anything; a future submit command must explain the exact genome and result data it sends. External-agent tokens and services remain under that agent's existing budget controls.

Ship skills only with commands they can actually run. This proposal intentionally has no installable skill containing imagined executable instructions.

## Replay and evidence

Use content-addressed genome, body, challenge, and result objects plus a small append-only event journal. Store immutable blobs separately from a rebuildable save index. Events identify creation, breeding, experiment start/completion, preservation, and observations. Store facts separately from player notes and agent interpretations.

A replay bundle contains the accepted program, starting body and memory, simulator and cost-model versions, exact seeds and activation rules, interventions, budgets, all outcomes, and digests of the event stream. Re-execution is the check; a hash alone is not evidence that a computation ran correctly. Store enough bounded trace detail to explain a failure without flooding the agent's context.

No engine dependency set or Rust toolchain is pinned by this proposal. The first Rust implementation must select and lock them, check licensing, and document supported targets. Cross-platform replay needs golden fixtures, explicit integer overflow behavior, stable serialization, and specified random and scheduling algorithms.

## First-playable acceptance

The first release should support one complete loop, with no hosted infrastructure:

- Start a seeded world, inspect two baseline policies, create a chimera or mutation, and preserve its ancestry.
- Run healthy and wounded sorting trials, with strict code, memory, per-case, and whole-job limits.
- Inspect a stalled activation and a recovery trace in chat using engine-derived facts.
- Compare a child with its parents on matched cases, then on a reserved local confirmation set. Label that set as locally inspectable, not authoritative hidden evaluation.
- Export, close the game, and replay the same outcomes and charged costs from a fresh save.
- Recover from an interrupted write and reject stale revisions or altered replay inputs.
- Demonstrate the complete loop through an external agent using the shipped skill, including a failed trial and a bounded batch.

Before release, test that organisms cannot fabricate success, exceed budgets through failed actions, double-activate through movement, hide failed cases, or change outcomes by resuming. Verify the interpreter and checker independently on exhaustive tiny states. Run `cargo fmt --check`, strict Clippy, and the project's actual test suite once those exist.

The first milestone succeeds when a player can recognize a behavioral difference, ask a useful question, and reproduce an improvement or a refutation. It need not demonstrate a novel algorithm. Competitive service work begins only after this local loop is worth playing.
