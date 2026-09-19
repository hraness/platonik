# Rust engine and agent interface

Implemented interface and campaign-engine proposal, revised 19 September 2026. A persistent automation-world protocol is implemented alongside the stateless Rust bridge, [field expedition](field-expedition.md), continuous saved habitat, finite construction, [First Answer](first-answer.md), [ark control](ark-control.md), [port commitments](port-commitments.md), Bloom, and one-lane generated-courier exchange. `platonik world` carries one homestead through bounded advances, recorded policy interventions, and admitted facility sites; `/play` recomputes its content-addressed history as a read-only visual world. Free-form construction beyond the five facility kinds, automatic open-ended breeding, and the full campaign remain future work.

The implemented [browser observatory](observatory.md) contains separate, bounded TypeScript demonstrators. Its single courier, fuzzy truth maps, cost calculator, and signal workbench do not implement the Rust journeys. Their JSON formats are laboratory formats, not released Rust CLI schemas; the recorded Rust pages display checked artifacts instead of reimplementing the simulation.

The [Autoverse path](autoverse.md) defines the module interfaces and capability dependencies. The current Rust slices connect transport, signals, memory, construction, arithmetic, control, bounded variation, physical custody, and acknowledgment under one interpreter and ledger. The living-world protocol establishes progression-level continuity for transport, a finite two-blueprint foundry, and a repeatable deposit-to-fabricator-to-assembler production chain with automatic crane transfer. The remaining integration work is to deepen recipes and construction choices, and carry those consequences toward a compressed Long Trail instead of resetting between independently declared journeys.

## The agent runs the laboratory

The Rust executable owns genomes, simulation, random seeds, costs, saves, and outcomes. An external agent reads structured observations, writes candidate genomes, chooses experiments, and explains results in chat. The agent's prose cannot mutate facts or award itself discoveries.

Do not embed an LLM in each cell. The organism is a small executable policy; the external agent is the scientist controlling the laboratory. A submitted organism must function when the scientist is disconnected.

Algal is now the optional planner runtime at the CLI boundary, not a second simulation authority. Platonik compiles a compact read-only projection, the player's bounded goal, and at most 32 already-valid actions. The bounded organism selects one candidate ID; it does not synthesize placements, policies, or engine state. Platonik replays the receipt, binds it to the exact view and goal, resolves the same candidate again, and runs normal admission before an event can enter history. A scripted executor proves the path offline; an `algal.host.v1` configuration can explicitly opt into a generative provider. Provider output and receipts never replace Platonik's checker, conservation rules, or replay.

Keep the deterministic interpreter, simulation, checker, and persistence behind distinct module boundaries. The core and WASM renderer do not depend on Algal; only the native agent-facing CLI does. No service, account, model provider, or Algal executor is needed for the first local episode.

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

## The living-world command surface

The implemented agent loop uses immutable JSON revisions:

```text
platonik world new Dustlight
platonik world report dustlight-r0.world.json
platonik world act dustlight-r0.world.json advance.json
platonik world propose dustlight-r0.world.json --responses responses.json --goal 'Keep both beacons lit'
platonik world accept dustlight-r0.world.json proposal.json
platonik world link dustlight-r1.world.json
```

`act` accepts a 1–128-tick advance, a complete admitted policy replacement for an original cell, a `place` command that opens a fabricator, storehouse, assembler, or crane construction site on an open tile — or a drill on a material deposit — or a `name` command that labels a facility. Program changes, placement, and naming do not move time; an advance does. `propose` runs the fixed Algal planner with deterministic responses or an explicitly configured provider and returns a receipt-bound selection without changing the world. Its optional `--goal` is 1–512 trimmed printable characters. The compiler offers bounded advances, valid stock policies, and valid sites; it withholds every new site while one facility is unready and omits any policy reassignment that would leave no live surveyor for beacons or no live hauler for industry. Its first assembler site leaves a traversed midpoint between it and the west fabricator; after creatures finish that site, a crane candidate appears. Constructed children count only after they are actually born. `accept` independently replays the receipt, recompiles the candidate set from the unchanged world, and applies the selected command. Each world records only its genesis and accepted intervention/advance endpoints; report and browser rendering freshly replay that compact history. The initial protocol permits 4,096 ticks and 128 events while retaining the engine's 16-cell, local-sensing, material, and execution limits.

Dustlight now supports a two-tier production chain. The declared fabricator consumes one material plus one spark and completes its part after six processing ticks; a placed assembler burns one material, one part, and one spark over ten ticks to mint a globally unique frame. A declared drill extracts one material every twelve ticks, and storehouses buffer all four item kinds. Placed sites open unready with a construction bill — storehouse 2 material + 1 part, fabricator 3 material + 2 parts, drill 2 material + 1 part, assembler 4 material + 2 parts, crane 1 material + 1 part + 1 frame — and become ready only when creatures physically supply it. A ready crane holds nothing itself and moves one fetchable item every eight ticks from the lowest-ID adjacent ready source to the first higher-ID adjacent ready facility that accepts it; the increasing identity rule prevents transfer cycles, and cranes never supply unfinished construction. A drill is the only structure allowed on a deposit, and it must sit on one. `has_frame`, frame-valued supply/fetch conditions, and `facility_is` let programs operate the full chain. What remains bounded: five facility kinds, two recipes, finite deposits, buffers of eight, deterministic crane routing, and no free-form structures, automatic search, or complete Long Trail.

The report's `industry` field describes the exact current state, including a newly placed site before time advances. Its `industry_frames` align with the retained `recent_frames` for replay. Each carries Rust-derived facility observations: construction needs, recipe, current status, missing inputs, remaining work, and any currently eligible crane transfer. These are read-only observations of that tick. An eligible transfer is not a completed delivery, and a countdown does not promise that a recipient will still accept an item later. `/play` uses those same observations for facility selection and focused agent handoff.

Industry v5 charges facility work from the state before the facility step, while facilities execute in order. If a producer finishes and makes a later crane eligible in that same tick, the crane can start without a separate start charge. Existing v5 histories retain that behavior; their work totals are not an exact count of every sequential facility operation. A future engine version needs staged work accounting before expanding industry mechanics.

The stock hauler collects parts from fabricators and reserves them for unfinished construction or assembler inputs. It does not unload parts into ready storehouses or fetch them back as part of its stock route. Custom policies and cranes retain their admitted storage operations. Existing JSON worlds preserve their serialized programs; updating the CLI does not rewrite an old save's behavior.

Use a new output filename for every action. The content-addressed browser URL identifies and contains a compressed history; the local JSON remains the agent's authoritative working save. The browser exposes replay, selection, and inspection but no world mutation controls. See the [living-world plan](living-world-plan.md) for the current product milestones.

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

Ship skills only with commands they can actually run. The repository now includes a [prototype play skill](https://github.com/hraness/platonik/blob/main/skills/platonik-play/SKILL.md) for standalone experiments and the persistent field expedition. The fuller save-and-breed workflow above remains proposed.

## A later hosted boundary

The [economy proposal](economy.md) adds optional contract discovery, escrow, and submission commands after local play works. A future agent skill needs an explicit in-game spending and escrow ceiling, separate from its experiment and external-agent compute budgets. It must show the exact terms and publication scope, accept within the player's authorization, and use stable request IDs and expected contract revisions. Cached offers are suggestions until the service validates current price, availability, balance, and evaluator capacity.

Local saves cannot update hosted balances or rankings. Publish selected immutable bundles; the hosted evaluator runs its own copy of the pinned engine and checker. The proposed [storage boundary](storage.md) separates canonical artifacts, transactional records, public snapshots, and bounded verification jobs. No hosted service becomes a prerequisite for the first local expedition.

## Replay and evidence

Use content-addressed genome, body, challenge, and result objects plus a small append-only event journal. Store immutable blobs separately from a rebuildable save index. Events identify creation, breeding, experiment start/completion, preservation, and observations. Store facts separately from player notes and agent interpretations.

A replay bundle contains the accepted program, starting body and memory, simulator and cost-model versions, exact seeds and activation rules, interventions, budgets, all outcomes, and digests of the event stream. Re-execution is the check; a hash alone is not evidence that a computation ran correctly. Store enough bounded trace detail to explain a failure without flooding the agent's context.

The current bridge pins Rust 1.97.1, locks Cargo dependencies, enables release overflow checks, and checks generated replay artifacts in the aggregate gate. See the [implemented guide](rust-bridge.md). The field expedition adds persistence and recovery; later saved habitats add continuous state, construction, contact, control, promises, variation, and one-lane exchange under the original small capacity envelope. The broader campaign still needs progression across those journeys and capacity admission for every larger target.

## First-playable acceptance

The living-world milestone should support one complete production improvement through an external agent:

- Inspect a facility at a selected replay tick and distinguish construction, active work, missing supplies, a full output, and an exhausted deposit from Rust observations.
- Carry the facility identity, observed state, and a concrete player wish into the agent handoff.
- Apply one admitted change to a new JSON revision and advance within the existing limits.
- Inspect whether the intended production or service changed, preserving the prior revision and any failed attempt.
- Reopen the resulting world link and reproduce the same state; inspection itself never advances time.

Checks establish those operations and their replay behavior. Player understanding and enjoyment still need observation. The [living-world plan](living-world-plan.md) defines the next bounded priorities.

### Campaign first episode (proposed)

The larger creation-and-rescue opening should eventually support this loop with no hosted infrastructure:

- Start a seeded beacon world, inspect two baseline policies, create a chimera or mutation, and preserve its ancestry.
- Run intact-route and collapsed-route trials with verified feasible starting challenges, conserved sparks, and strict code, memory, per-case, and whole-job limits.
- Show a delivery, a blockage, and a baseline recovery trace in chat using engine-derived frames and facts. An evolved child may improve, trade one capability for another, or fail.
- Compare a child with its parents on matched cases, then on a reserved local confirmation set. Label that set as locally inspectable, not authoritative hidden evaluation.
- Export, close the game, and replay the same outcomes and charged costs from a fresh save.
- Recover from an interrupted write and reject stale revisions or altered replay inputs.
- Demonstrate the complete loop through an external agent using the shipped skill, including a failed trial and a bounded batch.

Before release, test that organisms cannot fabricate success, create or duplicate sparks, exceed budgets through failed actions, double-activate through movement, hide failed cases, or change outcomes by resuming. Verify tick ordering, final-tick charge checks, intervention feasibility, and the interpreter and checker independently on exhaustive tiny states. Run the repository aggregate gate, `bun run check`, including formatting, strict Clippy, the Rust suites, evidence checks, and the web build.

The first milestone succeeds when a player can recognize a behavioral difference, ask a useful question, and reproduce an improvement or a refutation. It need not demonstrate a novel algorithm. Competitive service work begins only after this local loop is worth playing.
