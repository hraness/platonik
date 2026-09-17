# Platonik game design

Living design proposal, revised 11 September 2026. The website and its bounded browser experiments are implemented. A bounded [Rust bridge and agent play guide](rust-bridge.md) are implemented. A [persistent field expedition](field-expedition.md) now preserves collections and verifies trials. The complete campaign and the in-game leaderboard described here remain proposed; a working [hosted season evaluator](seasons.md) already ranks generated-challenge entries. Campaign creatures, dialogue, and results are illustrative unless linked to a specific recorded experiment.

## The premise

**Make a little creature with your AI. Help it survive. Discover something neither of you expected.**

You inherit a small world with a spring of sparks and a beacon that needs them. Give your creature a name and an ambition: “Make it quick,” “Help it find its way home,” or “Keep the light alive even when something goes wrong.” Your agent turns the wish into rules, shows you what it changed, and sends the creature into the world. You watch, form an opinion, and try another idea.

This is the pleasure of building with AI, given a persistent world and consequences. The creature you made yesterday is still yours today. Its children inherit recognizable habits. A change can work beautifully, fail in an interesting way, or solve a problem you had not yet thought to give it.

The creatures are executable algorithms. They do not contain chatting language models; your external agent is your collaborator at the workbench. No programming or philosophy vocabulary is required to begin. Code, exact costs, and research methods become available when the player asks how something works.

The central loop is **wish → build → watch → surprise → improve**. Each pass should leave the player with a visible change and a consequential choice. Automatic search can help, but the player owns the ambition, the favorites, and the question to pursue next.

The longer campaign is [The Long Trail](campaign.md): a hopeful space western in which a first companion becomes a herd, the herd helps build living arks, and their settlements grow into a civilization capable of reaching a distant beacon. The player is a frontier engineer of living systems, with a naturalist's curiosity and a trail guide's care. Its space-opera fiction gives these experiments a continuing destination.

The [observatory](observatory.md) offers smaller browser experiments to review that promise. Its executable courier sketches, structural portraits, truth maps, and bounded computational demonstrations remain separate from this proposed Rust campaign. The [Autoverse contract](autoverse.md) defines how transport, signals, memory, and construction would share one medium. The [complexity and scale decision](complexity-and-scale.md) explains why work, structural footprint, memory, and demonstrated capability remain separate, and how useful results would have to earn their evidence.

## A laboratory of your own, a world of other researchers

Play each expedition in your own world. A later shared expedition board would connect those private laboratories: another player can commission a recovery habit your creature already suggests, or you can ask a specialist to help a favorite adapt. Earn in-game credits for a checked delivery, and keep its public descendants in the family tree. A useful creation can acquire a life beyond the experiment that produced it.

The proposed [economy](economy.md) begins with funded research commissions. Published genomes remain reusable; payment buys work toward a result. The [leaderboard](competition.md) continues to compare organisms under equal execution limits, independently of balances or market activity. This social layer follows the first complete local expedition.

## Something worth caring about

The opening habitat is a small grid. A creature is a colony of courier cells that can sense nearby spaces, carry sparks, and move. Sparks must actually reach the beacon to replenish its charge. Paths can close; couriers can stall; a longer route can save an expedition. These are proposed simulation rules, so the drama has a cause the player can inspect.

The beacon dims only as the simulation advances. Reading a result, thinking, or closing the game costs no light. Failed expeditions preserve the parent genome and lineage. Stakes come from a difficult journey, a limited roster, and the choice of what to improve next.

Two starter lineages make the first tradeoff legible. **Moth** favors a direct route. **Moss** spends more movement on exploring alternatives. Those names describe intended starter behaviors to implement and calibrate, not measured performance. Neither is universally better. Mixing their cells may help recovery, or waste scarce movement on unnecessary detours.

The world should offer small moments the player can recognize: a courier doubling back with its spark, a cluster gathering at a blocked path, a late delivery keeping the beacon lit. The engine determines whether they happen. The agent can highlight an event; it cannot invent a rescue to make an episode satisfying.

## The first fifteen minutes: The Wound

The intended first session is one complete creation-and-rescue story. This is a storyboard for an unbuilt game, not a playable tutorial.

1. **Make something yours.** Name a starter colony and give it a wish: “Get the light there quickly.” The agent shows one plain-language rule change and runs a short, bounded expedition. See a spark reach its destination before learning a metric.
2. **Watch its habit.** Inspect three compact map snapshots: departure, the decisive moment, and the outcome. Track the same cells between frames. A short explanation connects their movements to the change you requested.
3. **Meet the wound.** Choose a trial whose announced hazard closes the direct route while leaving an attainable alternative. The same colony now has to adapt. The light may survive or go out; this is decided by the run.
4. **Ask for a rescue.** “Keep Moth fast, but help it stop getting stuck.” The agent offers two understandable approaches, such as changing every cell's rule or mixing in a few explorers. Explain the likely cost, let the player choose, and preserve the parent.
5. **See whether it helped.** Run the child and parent on matched worlds within the agreed budget. Show the decisive difference and any new weakness. An improvement earns a name; a failure earns a next hypothesis.
6. **Leave with a new ambition.** Take the favorite into an unseen local map: deliver more light, survive another obstruction, or race an archived rival when that mode exists. Keep a replay and the family tree.

Calibrate the authored opening so a useful improvement is attainable and the first run is short. Do not guarantee that every wish works or every child improves. Before expanding the engine, test whether a new player can say what changed, care which child they keep, and spontaneously ask to try another idea.

An illustrative conversation:

> **You:** I like Moth. Make it less helpless when the road disappears. Keep the original.
>
> **Agent:** We can give every cell a way to turn back, or mix in a few explorers. Explorers might find another route, but spend more of the expedition wandering.
>
> **You:** Try a few explorers. Twelve children at most, within our experiment budget.
>
> **Agent:** This child reached the beacon after the collapse. One courier turned back and took the lower path. It delivered less light on the intact map than Moth did. Here are the two replays.
>
> **You:** Keep it. Was that a fluke?
>
> **Agent:** We can compare them on new maps, then remove that turn-back rule in a copy to see what it contributed.

All dialogue and outcomes above are fictional. A real result must name its cases, costs, and trace evidence. “Helpless,” “persistent,” and “brave” are ways to talk about observed behavior, not diagnoses of a mental state.

## Chat with something to watch

Chat remains the primary interface. The player describes intent; the agent operates the Rust CLI. A normal response leads with what happened, shows a compact spatial view, and offers a choice. Detailed traces, programs, and statistics sit behind follow-up requests.

The first engine should emit a small text map with a stable legend for couriers, carried sparks, the spring, blocked spaces, and the beacon. Its event log can say “Moth-3 turned back at the closed passage” only when the trace supports it. Preserve cell identity across frames and show the result of every completed expedition, including failures. Richer replay images can come later from those same states, without requiring a separate game interface.

Translate wishes into inspectable changes. “Make it brave” might become “try an unexplored adjacent space after repeated failed moves.” The agent explains that interpretation before a consequential experiment; the word itself grants no ability. Respect the player's existing experiment budget and external-agent spending limits. No hidden overnight searches are needed to keep the creature alive.

## A universe that changes scale

The campaign has one recurring problem: carry something precious, keep a home connected, and recover when a familiar route fails. Each transition in [The Long Trail](campaign.md) introduces a new way to solve it using the player's existing creations.

| Campaign stage | New player action | Capability that earns the next scale |
| --- | --- | --- |
| **A spark in the dust** | Improve a companion's local habits | Preserve beacon charge and meet deliveries through a route collapse |
| **The long trail** | Give the traveling herd a way to report and remember | Relay an identified report, retain it through interrupted contact, and acknowledge it while delivering supplies |
| **A herd that carries home** | Connect that relay and memory to logic, arithmetic, and service control | Run different admitted plans and sustain the ark's services without external direction |
| **The free ports** | Connect independently controlled homes | Fulfill distributed commitments under declared message delays, losses, and duplicates without losing resource custody |
| **The bloom** | Turn supplied stock and descriptions into working descendants | Assemble a checked blueprint, then earn a bounded process that generates, tests, and selects a useful candidate |
| **Across the Quiet** | Reuse those capabilities in one long expedition | Preserve services, construct the required continuation, and complete an acknowledged two-way exchange |

These are future campaign gates, not implemented achievements. Each [chapter](campaign.md) specifies the player's wish, new lever, inspectable failure, success contract, resource allowance, and alternative approaches. The first Rust release tests the opening rescue only. Later chapters require calibrated limits, feasible reference builds, and independent checks before they can be called playable.

A colony can become a component of a larger body without consuming the parent or erasing its identity. Its descendants might form the transport system of a living ark while the original remains at home. Composition preserves execution, memory, and communication costs. Changing scale never turns an expensive algorithm into a free primitive.

The same verbs survive every transition: **inspect, change, connect, run, compare, keep, and reuse**. A relay accepts local observations from transport. Its memory feeds a controller that regulates those supply routes and later schedules a builder. Compatible ports carry the dependency. The [migration-to-ark validation gate](design-validation.md#the-bridge-we-must-build-first) requires actual unchanged components to contribute across tasks, with removal comparisons that expose what they do.

The external agent provides working reference blueprints and explains their tradeoffs. The player chooses an ambition and architecture, notices failures, and decides what to keep. Templates are free to inspect; executing them expands into the same metered parts as an original design. No chapter requires hand-wiring a prescribed circuit or preserving a particular starter genome.

The campaign culminates in a fictional first contact, with success determined by a bounded expedition. A proposed [voice on the wire](voices.md) explores what could speak on the far side of that contact without breaking the fiction's honesty rules. Research into checkable answers and complexity remains an optional open frontier. Finishing the story does not require or imply solving P versus NP.

## What you are actually building

An organism has four distinct parts:

- **Genome:** small typed rules governing sensing, local state, communication, and actions.
- **Body:** its cells, connections, and assignment of rules to cells.
- **Memory:** mutable state acquired during an episode or an explicitly persistent task sequence.
- **Lineage:** parent identities, mutations, experiments, and inherited components.

A phenotype is the behavior observed when that organism runs in a particular habitat. Changing the body or environment can change behavior without changing the genome.

The proposed [Autoverse protocol](autoverse.md#shared-laws) binds these parts to one manifest: module versions, typed local interfaces, activation order, finite storage, and complete cost accounting. Transport, signal, memory, and construction modules contribute specific permitted actions. Couriers, latches, controllers, and builders are roles created by policy and body composition, rather than unrelated creature classes with special hidden powers.

A finite builder can eventually read a blueprint and place permitted parts one action at a time. Until that capability exists, the player or agent assembles the initial body through setup, with parts and loading accounted for. Every interface, delay, copied byte, and failed attempt belongs in the work record.

Full computers and endogenous search require additional construction. A computer-builder achievement must expose instruction storage, fetch, decode, working memory, control flow, halt, and reset in the assembled system. A four-bit adder is a step toward that achievement. The campaign instead accepts multiple forms of programmable service control, including composed state machines and table-driven designs.

A blueprint assembler follows supplied instructions. A bounded searcher must also generate candidates, execute their tests, record failures, and select an output under a total budget. These capabilities have different checks. Neither `search` nor “create another organism” is an instruction that silently performs unmetered work. The [capability matrix](autoverse.md#capability-status) keeps the small browser demonstrations separate from these proposed achievements.

Breeding initially offers three understandable operations: mutate one rule, exchange compatible rule fragments, or mix cell types in one body. Genetic crossover and a chimeric body are different operations and should be shown differently. Every offspring has a readable difference from its parents. Invalid combinations are rejected before play.

Players can also ask their agent to write a new genome. There is no advantage for using the supplied breeding menu over direct invention; the same language, resource limits, and evaluator apply. Early campaign unlocks guide learning. Ranked play gives all entrants the same permitted instruction set and body limits.

Memory grafts, spontaneous replication, and evolving body graphs arrive later. Each adds real experimental ambiguity and should earn its place through interesting play.

## Evolving a way to represent the world

An organism's rules can contain reusable descriptions of situations as well as actions. Starting from simple symbols, compose expressions for local relations, inspect their parts, and breed compatible fragments. A pattern named “repairable pair” still has to earn that description in a trial.

The player’s notebook distinguishes a possible situation from a claim checked against the world. A symbol names; an expression represents; the engine checks whether the represented condition holds at a particular snapshot. This gives the agent a concrete job: explain what a lineage's condition means, find where it fails, and test whether it travels to a new environment.

After the first rescue, name a recurring situation such as “carrying a spark and blocked ahead.” Inspect the two conditions, use the expression in a copied policy, and test it on a new map. A name such as “trapped” can be disproved by a replay in which the courier finds another way. Later, transplant a lineage's vocabulary into a different body or let tissues communicate through it. Aliases preserve their definitions and execution costs; a shorter name does not create a cheaper primitive or expose a hidden sensor.

The [symbols and facts glossary](symbols-and-facts.md) develops these mechanics from simple symbols, complex symbols, Sachverhalte, and Tatsachen. It is a dated, revisable reading aid. The introductory episode and competitive ranking stay focused on observable behavior.

## A world seen from three places

“Show me what this cell can see.” The same expedition can be read through a cell's nearby observations, the colony's overall movements, or the player's explanation. A cell may see a blocked passage while the player sees a route around it. Showing those views together makes its strange behavior understandable and suggests a change to try.

The proposed viewpoint selector changes what the observer sees; it grants the organism no new sensor. A creature's self-description would be another program output to inspect. Saying “I exist” does not unlock a mind or certify consciousness.

A later expedition could ask: “What if I give it what the older one learned?” Try an inherited routine, a memory with a declared origin, or a paid clue supplied by that habitat. Compare the same creature with and without the gift. Does it recover better, use too much memory, or depend on a hint that will disappear in the next world?

**What is granted must be counted.** A library brings executable routines and stored information, not just another item in an inventory. Its construction, loading, storage, use, and remaining work all matter. Separate what the outside agent knows from what actually enters the creature. Ordinary ranked habitats retain their existing information limits; assistance belongs to a separately declared challenge or division with equal access and explicit costs. These are later proposals, not additions required for the first beacon rescue.

## A companion brings a history and a habitat

In a later expedition, Moss has crossed a difficult valley before. A fresh descendant hesitates at the same fork; the experienced traveler takes a useful turn. The player can ask, “What did it keep?” The agent compares copies to find out whether the difference comes from stored experience, body arrangement, or a trace still present in the valley. This is an illustrative scene to earn through simulation, not a promised memory effect.

Give the player four practical invitations: **show it something new, find it a partner, help it keep a home, and see what survives the journey.** A specialist that senses a local signal may help a courier navigate. A maintained corridor may let a fragile newcomer reach camp. Each benefit needs an implemented rule and a visible consequence; pairing two names does not grant a synergy bonus.

A favorite's value can grow through the lives it helps make possible. It may keep traveling, remain at the homestead, or support a habitat while its descendants join an ark. Partnerships preserve the participants and their ancestry. Their connections, sensing, and upkeep cost resources, and a larger assembly must justify those costs in the same world.

This extends the game's [research on sensing, symbiosis, and remembered trails](research.md#symbiosis-sensing-and-living-habitats). These are later habitat proposals. Current ranked trials retain their declared information limits; new senses and carried experience require explicit, equal rules. The agent explains the resulting behavior in ordinary language and keeps the evidence available underneath.

## What makes another session worthwhile

**Attachment:** lineages have names, ancestry, characteristic failures, and visible inherited rules. A failed child can remain valuable in a different habitat. Keep a small active stable and a larger archive so choice matters without deleting discoveries.

**Discovery:** a creature bred for delivery might also recover from damage or perform well with an unfamiliar body. Ask “What else can it do?” and let the agent run a bounded side experiment. Later research habitats include self-sorting cells, where players can investigate clustering and temporary setbacks in a particularly transparent world.

**Tradeoffs:** a fast specialist, a slow repairer, and a memory-heavy generalist can all be worth keeping. A finite expedition roster makes the player choose which capabilities to bring. Any routing policy used in competition is part of the submitted organism and pays for its decisions.

**Rivalry:** race archived rival organisms through the same habitat under equal execution limits. Show where a favorite falls behind and let the player build a response. A rival is an observable benchmark with a strategy to understand. Later stressor tournaments can pit repairers against challenge-generating organisms. Stressors operate inside declared, solvable task rules. Direct attacks on another player's save, arbitrary execution, and resource theft are outside the game.

**Agency:** the player chooses the next ambition, the creature to keep, and the cost they are willing to pay. They can ask an excellent question, commission a broad search, pursue a strange side effect, or design a better representation. The agent can automate experiments within explicit budgets. Nothing depends on a daily timer, a paid hint, or leaving the application idling.

## Adventure that can become an experiment

The player earns a growing **atlas of capabilities**: this lineage recovered, that partnership carried more, this habit survived a new body. Familiar creatures, replayable discoveries, and access to harder expeditions make progress tangible. The atlas records what happened under which conditions; it does not add points for program length or generated claims.

Research begins with ordinary curiosity. “Was that a fluke?” commissions a comparison on new worlds. “Why did it work?” commissions a controlled change. “Could anyone else use this?” prepares a reproducible export. The agent handles the protocol within a budget, while the player can inspect the evidence or keep exploring.

Keep three levels visible in the notebook: **observed here**, **reproduced under stated tests**, and **reviewed contribution**. The last requires independent checking and a defensible question or improvement; most play will remain at the first two levels. A new personal best still deserves celebration without being called a scientific breakthrough. Publication is a separate player action.

A later counterexample expedition turns confidence into a challenge: “I think Moth can always find another way.” Freeze what “another way” means and the allowed worlds, then let your agent look for a failure. Simplify the map until the weak spot is easy to see. Keep the smallest case found and use it to breed a response. Worlds must remain feasible under the declared limits; an impossible expedition proves nothing about the creature's relative ability. This proposed mode draws a practical lesson from [past P versus NP claims](research.md#learning-from-past-p-versus-np-claims): a precise, reproducible failure can be useful progress. It earns a place in the notebook, with no extra currency for manufacturing claims.

The larger fiction explores a space of possible forms: how different bodies express a rule, what a colony can do together, and which habits persist when the world changes. Michael Levin's research and philosophical proposals provide questions for these expeditions; the [research foundations](research.md) distinguish experimental findings from speculative interpretations. Play can invite wonder about life and minds without awarding a consciousness score or declaring that a metaphysical theory is true.

## An open ceiling

A fixed game engine and finite season have a finite score ceiling. Long-term openness comes from increasing problem sizes, adding reviewed habitats, composing organisms, and eventually evolving search procedures themselves. Season records remain interpretable because their rules never change underneath them.

New challenges should expose a new failure or capability. Simply adding zeros to a resource counter is not enough. Community proposals require a verifier, baselines, meaningful variation, and an admission review before they affect rankings.

The campaign rewards exploration; the [competitive frontier](competition.md) rewards demonstrated performance; the [research archive](research.md) rewards claims that survive scrutiny. These are related pursuits with different evidence requirements.
