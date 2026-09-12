# Complexity, engineering, and scale

Proposal with bounded measurements, 12 September 2026. These are decisions to test as Platonik develops. A bounded [Rust integration prototype](rust-bridge.md) is implemented; the competitive evaluator and large ecologies are not. The browser laboratory is a bounded design prototype, with its own rules.

**You are an engineer of living systems.** A favorite companion can become a component in a bridge, a memory, or a civilization. Engineering gives the player something concrete to master; the [Long Trail](campaign.md) gives those creations a reason to matter.

## Complexity should create tradeoffs

Use several visible properties instead of one complexity score. Keep execution fuel as the computational allowance, sparks as the beacon world's conserved resource, and achievement as demonstrated capability. A longer program cannot mint either resource.

| Measure | Useful game role | What it cannot establish |
| --- | --- | --- |
| Charged execution steps | Work allowance: sensing, movement, calculation, and coordination compete for a budget | Physical energy, intelligence, or an asymptotic complexity bound |
| Canonical program bytes and body size | Structural footprint: fit a more capable design into a limited vessel | Minimal description length or usefulness |
| Bounded memory and prepared state | Capacity to retain experience; acquiring, storing, loading, and using it have costs | Knowledge without acquisition costs or permission to inspect hidden inputs |
| Measured behavior and novelty descriptors | A collection of demonstrated abilities and distinctive strategies on declared assays | A universal measure of complexity, scientific importance, or consciousness |

Kolmogorov complexity asks for the length of a shortest description under a fixed reference machine. It is not computable in general. A compressor supplies a particular encoding, with no general guarantee that it is near that minimum. Platonik should label a byte count or compression ratio by what it measures. [Vitányi, 2020](https://arxiv.org/html/2002.07674v2).

Noise is the immediate exploit in “more complexity means more energy”: unused instructions, random-looking output, or decorative branches could inflate the reward. Instead, make a tighter description valuable when it preserves useful behavior. Include required definitions and prepared data; a short alias does not erase its dependencies. Novelty can guide exploration and collection, while the [main rank](competition.md) continues to reward completed challenges and lower charged work.

This creates recognizable choices. A scout spends fuel sensing. A practiced courier spends memory to avoid repeating mistakes. A redundant colony survives a blocked route but occupies more space. A tightly coupled partnership coordinates well until a missing partner disrupts it. These are proposed forces produced by explicit rules and measured outcomes, with no automatic “complexity bonus.”

The [port commitments evaluation](ports-evaluation.md#two-agent-ambitions) supplies a small measured example. Its smallest submitted program saves 840 loading units but spends 918 more during execution than the selected familiar crew. A different crew reduces communication work by retrying less often, with confirmation two ticks later during a reply outage. Those are checked tradeoffs inside the declared simulator and eight public worlds, not physical energy or a universal measure of complexity.

## A thesis that can fail

**Working hypothesis:** designing reusable local policies and their interactions can produce useful methods for bounded transport, recovery, and later constraint-solving tasks. The game may help people discover those methods by making variation, comparison, and reuse engaging. Both parts need evidence.

Start with one research question per habitat. For example: does a mixed colony recover from route changes better than its strongest uniform constituent, within the same total cell, observation, memory, and work allowances?

Use four comparisons:

1. **Ordinary engineering:** hand-written simple policies, random search, and a direct implementation of the task. Include a flat controller restricted to the same information and delay model; report a controller with richer access separately.
2. **Composition:** the candidate assembly, uniform constituent colonies, and copies with suspected capabilities removed. Keep total resources matched and charge interfaces.
3. **Transfer:** freeze the candidate before testing new map families, damage schedules, and admitted adversarial cases. Separate further adaptation from unchanged transfer.
4. **Practical export:** move the useful method into an independent implementation and an external benchmark. Compare against appropriate existing methods, including input conversion, preprocessing, memory, and real runtime on specified hardware.

An improvement visible only through a favorable simulator cost table is a game result. Exported performance, a reusable benchmark, a counterexample, or a supported explanation can become a [reviewed contribution](research.md#what-the-game-can-honestly-produce). Finding a transport policy does not settle P versus NP; even finite SAT victories need a separate correctness and worst-case analysis for that claim.

Before confirmation, publish the comparator, smallest improvement worth pursuing, case count, uncertainty analysis, and fixed evaluation budget. Preserve failures and unsuccessful searches. If two successive frozen task families show no useful gain after accounting for overhead, redirect the collective-algorithm research track. The game can remain worthwhile as an engineering environment without implying a scientific breakthrough.

Also test the game itself: under a controlled agent and discovery budget, can players produce improvements and explain a failure more reliably after playing? The open leaderboard alone cannot isolate agent skill from compute, borrowed components, or prior expertise. A portfolio of reproducible builds and clear experiments is the stronger signal.

## How large can a living world get?

The straightforward simulation bill grows with activated cells, ticks, and work per activation. These examples assume every cell executes 32 primitive operations each tick; they are arithmetic, not measured throughput or supported engine limits.

| Illustrative expedition | Cells × ticks × operations | Policy operations |
| --- | --- | --- |
| Small colony | 128 × 2,000 × 32 | 8,192,000 |
| Living ark | 4,096 × 10,000 × 32 | 1,310,720,000 |
| Million-cell world | 1,000,000 × 10,000 × 32 | 320,000,000,000 |

Scheduling, world updates, communication, checking, rendering, and trace storage add work. Searching 1,000 candidates multiplies evaluation cost again. No LLM runs inside a cell; an external agent designs a small policy that executes independently.

Begin with bounded active expeditions and pause them between runs. A civilization can be a saved network of habitats, blueprints, and completed journeys. Only explicitly active regions advance; exchanges between regions need declared timing and state. This supports a large history without pretending to simulate a continuously active universe.

Measure interpreter throughput, peak memory, verification cost, and trace size on declared hardware before admitting larger tiers. Keep compact state, share immutable programs, bound neighborhoods, and save checkpoints plus replay inputs rather than every rendered frame. The [storage design](storage.md) publishes selected artifacts; it does not upload every rejected candidate.

There are two different ways to accelerate a world. An exact implementation optimization preserves every relevant transition and the same charged work. A reusable macro needs a verified contract covering inputs, boundary interactions, intermediate observable events, timing, and resource accounting; a final output match alone is insufficient. Exhaustive verification is possible for some bounded components. Tests alone do not certify arbitrary replacements. Fall back to ordinary simulation outside the certified domain. A statistical approximation belongs in a separately labeled mode, not an official replay.

## Build a computer inside it

The ambition is a medium players can engineer beyond our examples. Cellular automata provide a real precedent: Cook proved that Rule 110 supports universal computation. That result concerns its specific rules and construction; it does not establish universality or efficiency for Platonik. [Cook, 2004](https://www.complex-systems.com/abstracts/v15_i01_a01/).

Introduce a separate, versioned signal habitat: bounded local channels, explicit propagation delays, finite registers, and metered operations. Its first milestones should be a signal relay, a logic gate, a memory latch, and a four-bit adder. Check the adder on all 256 input pairs, including its carry output, reset conditions, and settling time. The first courier VM gains none of these permissions implicitly.

Then let players build reusable modules, compilers into the habitat, repairable circuits, and organisms that assemble other organisms within declared budgets. A computer takes space and work; nesting one never supplies free compute. Increasing finite limits can extend the playground while universality remains a separate mathematical question.

A player's small creation should remain useful inside a larger system, with enough openness for someone else to discover an unexpected use for it.

The [Autoverse design contract](autoverse.md) makes this progression part of the campaign: its interfaces, module admission rules, computer and constructor criteria, and final voyage depend on earlier capabilities. The separate [signal workbench](https://platonik.space/lab#autoverse) tests finite circuits and budgeted blueprint assembly. Its Boolean model remains separate. The [Rust bridge](rust-bridge.md) integrates physical couriers, delayed signals, retained state, and local service routing in small public fixtures. The [v3 constructor](construction-evaluation.md) adds prescribed material-dependent assembly and ordinary child execution in that runtime. [The First Answer](first-answer.md) joins useful construction to a returned report and a checked local ending. [Ark control](ark-evaluation.md) gives one computed result a physical job under two supplied plans, with all code, initial state, local messages, and execution charged. [Port commitments](ports-evaluation.md) add finite request, custody, acknowledgment, and service obligations in that same runtime. Repeated exchanges and a continuously regulated or moving ark remain unimplemented. The [validation plan](design-validation.md) defines the remaining campaign, scale-admission, and player tests.
