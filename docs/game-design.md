# Platonik game design

Proposal, 10 September 2026. The Platonik website and documentation are being built first. The Rust game engine, agent skills, and leaderboard described here are proposed. Example creatures, dialogue, and results are fictional.

## The premise

You inherit a chamber containing a handful of simple rules. Give them bodies, and they begin to organize. Your job is to discover which patterns can survive, cooperate, remember, and solve problems in worlds they have never encountered.

The creatures are executable algorithms. Their personalities come from observable behavior: one rushes and jams, another waits and repairs, a third succeeds only in a mixed colony. An external AI agent is your field scientist. You direct its attention, set ambitions, name lineages, and choose experiments; it operates the engine and explains what the evidence shows.

The central loop is **observe → hypothesize → breed or edit → challenge → explain → preserve**. Each cycle should produce a decision a player can understand. Automatic search is useful, but a screenful of fitness numbers is not the entire game.

You accumulate **capabilities**: surviving a wound, coordinating across a larger body, carrying useful memory into a new task. The laboratory records these as an atlas of conquered habitats and preserved lineages. Program length, unpredictability, and time spent computing do not themselves earn progress.

## A universe that changes scale

Universal Paperclips changes the player's responsibilities as its economy expands into planetary industry and autonomous exploration. Platonik borrows that pattern of major mechanical transitions, while using its own fiction and rules. [Universal Paperclips](https://www.decisionproblem.com/paperclips/index2.html).

| Chapter | What you control | The new tension | What survives the transition |
| --- | --- | --- | --- |
| **The Cell** | Tiny local programs and a small body | Fast behavior can be brittle; a useful detour can look like failure | Named genomes and the ability to read their actions |
| **The Wound** | Chimeric colonies and damage experiments | Mixed strategies can help or interfere; recovery has a cost | Tested repair strategies and persistent lineages |
| **The Tissue** | Networks of colonies with explicit interfaces | Coordination, memory, and communication compete for resources | A whole colony becomes a callable component, with its costs intact |
| **The Ecology** | A stable of specialists and their partnerships | No strategy dominates every habitat; competitors expose weaknesses | An adaptive portfolio and a record of its tradeoffs |
| **The Frontier** | Search processes that invent organisms and experiments | Finding useful representations becomes the problem | Reusable algorithms, counterexamples, and research records |

The first playable release covers a small slice of the first two chapters. Later transitions introduce new choices, not merely larger quantities of the same resource.

The narrative reveal is that the world you mastered can become a cell in another world. Promotion preserves a component's real execution, memory, and communication costs. It never turns an expensive algorithm into a free primitive.

The campaign can culminate in an expedition toward **the Witness**: a method that finds checkable answers across increasingly difficult constraint worlds. It is a fictional destination for an open research frontier, not a promise that the campaign has a P=NP solution hidden at its end.

## Creatures you can understand

An organism has four distinct parts:

- **Genome:** small typed rules governing sensing, local state, communication, and actions.
- **Body:** its cells, connections, and assignment of rules to cells.
- **Memory:** mutable state acquired during an episode or an explicitly persistent task sequence.
- **Lineage:** parent identities, mutations, experiments, and inherited components.

A phenotype is the behavior observed when that organism runs in a particular habitat. Changing the body or environment can change behavior without changing the genome.

Breeding initially offers three understandable operations: mutate one rule, exchange compatible rule fragments, or mix cell types in one body. Genetic crossover and a chimeric body are different operations and should be shown differently. Every offspring has a readable difference from its parents. Invalid combinations are rejected before play.

Players can also ask their agent to write a new genome. There is no advantage for using the supplied breeding menu over direct invention; the same language, resource limits, and evaluator apply. Early campaign unlocks guide learning. Ranked play gives all entrants the same permitted instruction set and body limits.

Memory grafts, spontaneous replication, and evolving body graphs arrive later. Each adds real experimental ambiguity and should earn its place through interesting play.

## Evolving a way to represent the world

An organism's rules can contain reusable descriptions of situations as well as actions. Starting from simple symbols, compose expressions for local relations, inspect their parts, and breed compatible fragments. A pattern named “repairable pair” still has to earn that description in a trial.

The player’s notebook distinguishes a possible situation from a claim checked against the world. A symbol names; an expression represents; the engine checks whether the represented condition holds at a particular snapshot. This gives the agent a concrete job: explain what a lineage's condition means, find where it fails, and test whether it travels to a new environment.

After the first wound, try naming a recurring local inversion, using that expression in a copied policy, and testing it on new values. Later, transplant a lineage's vocabulary into a different body or let tissues communicate through it. Aliases preserve their definitions and execution costs; a shorter name does not create a cheaper primitive or expose a hidden sensor.

The [symbols and facts glossary](symbols-and-facts.md) develops these mechanics from simple symbols, complex symbols, Sachverhalte, and Tatsachen. It is a dated, revisable reading aid. The introductory episode and competitive ranking stay focused on observable behavior.

## The first fifteen minutes: The Wound

Start with a short line of numbered cells, two transparent starter policies, and one goal: put the numbers in order. A cell can inspect its immediate neighbors, retain a little state, and propose a local exchange. The engine shows the values, policy colors, and a few important events as compact text that the chat agent can quote.

1. **Meet two lineages.** Run each on the same small array. Inspect one cell's sensing and action. The agent explains a visible difference in their rules.
2. **Make a chimera.** Mix the policies and name the offspring. Compare it with both parents on matched starting arrays.
3. **Introduce a wound.** Disable one cell's controller partway through the run. Other cells may still exchange with that passive cell, so it can reach its sorted position. Later challenges with multiple disabled controllers must establish that the target remains reachable.
4. **Investigate the failure.** Inspect a short trace around the stall. Form a hypothesis about one rule, the update schedule, or the mixture.
5. **Breed a rescue.** Evaluate a small batch with an explicit compute cap. Preserve a useful child, then move it to unseen arrays or a different schedule.
6. **Archive the expedition.** Save its lineage and a replayable result. An eventual ranked submission sends the organism to an independent evaluator.

The lesson is not pre-scripted success: both starters or their offspring may fail a challenge. The authored tutorial must be calibrated to supply an attainable improvement, while all reported outcomes come from the simulation.

An illustrative conversation:

> **Player:** Moth is quick, but it falls apart after the wound. Cross it with the patient one. Spend at most two million fuel units.
>
> **Agent:** I tested twelve children. Moth-7 recovered on 18 of 20 training worlds; Moth recovered on 9. The child sometimes makes the array less ordered before it frees a stalled neighbor. It spends more fuel on healthy arrays.
>
> **Player:** Is the detour actually helping, or is it just lucky?
>
> **Agent:** I can disable that rule in a copy and run both on matched worlds. That tests the mechanism. A separate unseen batch tests whether the improvement travels.
>
> **Player:** Do both. Keep the original intact.

These numbers illustrate the intended conversation and are not experimental results. The engine returns exact counts and trace references; the agent supplies the explanation. Calling a creature "patient" is narrative shorthand, not a claim about its mental state.

## What makes another session worthwhile

**Attachment:** lineages have names, ancestry, characteristic failures, and visible inherited rules. A failed child can remain valuable in a different habitat. Keep a small active stable and a larger archive so choice matters without deleting discoveries.

**Discovery:** observations beyond the selected objective can become side quests. Does a mixed colony cluster by policy even though cells cannot read policy labels? Does the same genome recover under a different schedule? A surprising trace prompts a controlled experiment, not an automatic scientific award.

**Tradeoffs:** a fast specialist, a slow repairer, and a memory-heavy generalist can all be worth keeping. A finite expedition roster makes the player choose which capabilities to bring. Any routing policy used in competition is part of the submitted organism and pays for its decisions.

**Rivalry:** fight archived rival organisms on the same challenges. Later stressor tournaments can pit repairers against challenge-generating organisms. Stressors operate inside declared, solvable task rules. Direct attacks on another player's save, arbitrary execution, and resource theft are outside the game.

**Agency:** the player can ask an excellent question, commission a broad search, pursue a strange side effect, or design a better representation. The agent can automate experiments within explicit budgets. Nothing depends on a daily timer, a paid hint, or leaving the application idling.

## An open ceiling

A fixed game engine and finite season have a finite score ceiling. Long-term openness comes from increasing problem sizes, adding reviewed habitats, composing organisms, and eventually evolving search procedures themselves. Season records remain interpretable because their rules never change underneath them.

New challenges should expose a new failure or capability. Simply adding zeros to a resource counter is not enough. Community proposals require a verifier, baselines, meaningful variation, and an admission review before they affect rankings.

The campaign rewards exploration; the [competitive frontier](competition.md) rewards demonstrated performance; the [research archive](research.md) rewards claims that survive scrutiny. These are related pursuits with different evidence requirements.
