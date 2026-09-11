# Rust engine and agent interface proposal

Proposal, 11 September 2026. The current milestone is the Platonik website and documentation. The Rust engine, CLI, file formats, and skills below are not implemented. This is the first prototype's intended contract, not an installation guide.

## The agent runs the laboratory

The Rust executable owns genomes, simulation, random seeds, costs, saves, and outcomes. An external agent reads structured observations, writes candidate genomes, chooses experiments, and explains results in chat. The agent's prose cannot mutate facts or award itself discoveries.

Do not embed an LLM in each cell. The organism is a small executable policy; the external agent is the scientist controlling the laboratory. A submitted organism must function when the scientist is disconnected.

Use one Cargo workspace with a small library and CLI at first. Keep the deterministic interpreter, simulation, checker, and persistence behind distinct module boundaries. A hosted evaluator can reuse them later; no service, account, model provider, or Oh installation should be needed for the first local episode.

## The first world: keep the beacon alight

A small finite grid contains a spring, a beacon, obstacles, and a colony of courier cells. The spring holds a finite supply of integer spark units. Each cell carries at most one unit and occupies one tile. Cells must physically collect sparks and deliver them to the beacon. Moving a cell moves its cargo, policy, and local memory together. Identities, ancestry, and policy labels are visible to the observer but unavailable to organism instructions.

A cell can inspect its own tile, cargo, bounded local registers, and the four adjacent tiles' terrain and occupancy, including whether each connecting edge is open. It can choose a direction, move to an unoccupied neighboring tile across an open edge, collect one available spark while on the spring, deposit its cargo while on the beacon, or wait. It cannot inspect a remote map, another cell's memory, or an unannounced future event. The first world needs neither reproduction nor a physics engine.

The starter pair should make a visible tradeoff: a fast direct-route policy and a slower policy that can recover from a blockage. Calibrate the tutorial for an attainable improvement without forcing a particular child to win. Mixing policies changes the actual colony's behavior; a name or narrated personality has no effect on the simulation.

### Time, resources, and interventions

Define one simulation tick as a complete sweep of the colony. Apply scheduled terrain changes at the start of a tick, activate each cell once in a specified seeded order using stable identities, then apply any charge drain due that tick. Each activation commits atomically and permits at most one action; later cells see the committed state. Movement never grants an extra activation. Failed actions still consume their declared execution fuel.

One deposited spark adds one charge unit. The beacon drains one unit every N ticks, where N is a fixed positive integer in the challenge; ticks start at one and the first drain is at tick N. The challenge also fixes the positive initial charge, finite spring supply, duration in ticks, and minimum required deliveries. Success means completing that duration with positive charge after every drain and meeting the delivery target. A zero-charge endpoint fails even if a courier could deliver next tick. Charge changes only during a run; reading state or thinking in chat advances no time.

Keep game resources separate from computation: sparks and charge are integer world quantities, ticks measure simulated time, and fuel measures charged execution. The checker verifies that spring supply, carried sparks, beacon charge, and cumulative drained charge sum to the starting supply plus initial charge. Cumulative deliveries are a separate achievement counter, not an additional reservoir. Policies cannot create sparks, declare deliveries, or report their own success.

The opening hazard closes a declared route edge at a specified tick. It does not delete cells or cargo. A challenge must retain an alternate route and have a successful checked witness run from its starting state under the same event schedule, body bounds, duration, and resource limits. Connectivity alone is insufficient: travel time and traffic can make an apparently connected world impossible. Admission checks feasibility; an individual colony can still strand itself or run out of charge. Later damage types need their own precise semantics and feasibility checks.

### Bounded rules and later habitats

The policy language provides bounded integer and Boolean operations, local sensing and register access, conditional choice, and the actions above. Reject unchecked native code, unbounded integers, recursion, and unbounded allocation. Interpreter steps, sensing, memory access, and successful or failed actions pay versioned costs; cap both individual activations and whole experiments. A stalled or exhausted run is unfinished within budget and cannot count as a completion.

Sorting remains a proposed later calibration habitat with a small readable state and cheap checking. It uses a line of cells with immutable input values and local swaps, verifies ordering and preservation of the input permutation, and specifies controller damage separately from terrain collapse. It can investigate sorting-specific recovery and policy clustering; the beacon world does not itself reproduce those experiments. Evolving body graphs and endogenous reproduction also come later.

## Representations and checked facts

The proposed [symbols and facts layer](symbols-and-facts.md) builds on the typed rule language. Treat simple symbols as declared syntactic leaves and complex expressions as inspectable syntax trees. A named compound keeps a versioned definition; a display alias cannot turn it into a primitive instruction. Initial aliases expand to finite expressions without recursion or cycles and pay for their constituent evaluation and representation costs.

Keep observer notation separate from executable policy notation. A notebook can name cells in a recorded world; an organism can only bind references allowed by its local sensor contract. Compiling a notebook description into a policy must reject unavailable observations and type-invalid compositions. Boolean combinations do not acquire new sensory privileges.

Record the expression and definition versions, object bindings, snapshot or trace identity, and check scope with every checked claim. Where evidence is missing, retain an unknown or unassessed status; do not confuse it with a false expression or a failed task. Reject malformed or ill-typed expressions separately as invalid. A compound claim requires compatible scope and evidence for its components. Check records stay attached to their original state and scope when the world advances; unchecked claims are not observations.

Begin with expressions already supported by the transport rules and an observer-side notebook: for example, “carrying a spark and the adjacent route is blocked.” A name for that condition does not add a remote sensor. Open-ended predicates, communication vocabularies, and theorem proving are later proposals, not requirements for the first playable release.

## A small command surface

Illustrative future commands:

```text
platonik init --world beacon --seed 7
platonik status --json
platonik inspect starter-a --json
platonik breed starter-a starter-b --mode chimera --seed 19 --name moth
platonik run moth --suite beacon-training --fuel-limit 2000000 --request-id trial-1
platonik observe trial-1 --view recovery --json
platonik export trial-1 --output expedition.json
platonik replay expedition.json --json
```

Here `--fuel-limit` caps the whole experiment, including all children and cases when batching is supported. The suite also supplies per-case limits. Reaching the total cap records remaining cases as not run; it cannot produce a ranked complete result. Long jobs should expose resumable progress or bounded chunks and support cancellation without leaving a partial result labeled complete.

All commands should support structured output with schema version, status, stable IDs, costs, result references, and explicit errors. Help must expose valid commands and JSON schemas. A tiny grid rendering and selected event frames let the agent show a delivery, a blockage, or a recovery in chat. Every frame and captioned event must reference actual recorded state; a separate TUI is unnecessary for this prototype.

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

- Start a seeded beacon world, inspect two baseline policies, create a chimera or mutation, and preserve its ancestry.
- Run intact-route and collapsed-route trials with verified feasible starting challenges, conserved sparks, and strict code, memory, per-case, and whole-job limits.
- Show a delivery, a blockage, and a baseline recovery trace in chat using engine-derived frames and facts. An evolved child may improve, trade one capability for another, or fail.
- Compare a child with its parents on matched cases, then on a reserved local confirmation set. Label that set as locally inspectable, not authoritative hidden evaluation.
- Export, close the game, and replay the same outcomes and charged costs from a fresh save.
- Recover from an interrupted write and reject stale revisions or altered replay inputs.
- Demonstrate the complete loop through an external agent using the shipped skill, including a failed trial and a bounded batch.

Before release, test that organisms cannot fabricate success, create or duplicate sparks, exceed budgets through failed actions, double-activate through movement, hide failed cases, or change outcomes by resuming. Verify tick ordering, final-tick charge checks, intervention feasibility, and the interpreter and checker independently on exhaustive tiny states. Run `cargo fmt --check`, strict Clippy, and the project's actual test suite once those exist.

The first milestone succeeds when a player can recognize a behavioral difference, ask a useful question, and reproduce an improvement or a refutation. It need not demonstrate a novel algorithm. Competitive service work begins only after this local loop is worth playing.
