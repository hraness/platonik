# Research foundations and useful results

Proposal, 10 September 2026. The website and documentation come first; the game engine and research archive described here are proposed. Platonik aims to make algorithm discovery and controlled experiments enjoyable. Its credibility depends on distinguishing performance records, causal explanations, and mathematical proofs.

## Michael Levin's minimal systems

Michael Levin, a researcher in morphogenesis and diverse intelligence, supplies the central inspiration: investigate what simple components do together, including behaviors outside the objective for which they were selected.

Zhang, Goldstein, and Levin's sorting study reports damage responses, temporary setbacks during sorting, and clustering in mixtures of local sorting policies. These are findings about the models and experiments studied. They motivate experiments in Platonik; they do not guarantee that a different simulator or every mixture will reproduce them. [Sorting study](https://arxiv.org/abs/2401.05375).

In *Ingressing Minds*, Levin proposes studying minimal systems and novel embodiments to understand relationships between constructed interfaces and the patterns they express. The essay also advances hypotheses about minds and nonphysical patterns. Platonik can test concrete behavioral predictions inspired by this program without treating its philosophical interpretation as a simulation result. [Ingressing Minds](https://doi.org/10.3390/philosophies11050161).

His discussion of sorting also suggests looking for useful side effects under different observational descriptions of the same computation. In Platonik, task progress and policy clustering can be measured from one unchanged trace. The selected objective need not exhaust what is worth studying. [Levin's discussion](https://thoughtforms.life/algorithms-redux-finding-unexpected-properties-in-truly-minimal-systems/).

## Experiments that become game mechanics

| Question | Player action | Evidence needed |
| --- | --- | --- |
| Does a temporary setback enable recovery? | Disable or replace the suspected detour rule in a copied lineage | Matched starting states, complete trajectories, costs, and a held-out comparison |
| Does a chimera organize by policy without sensing labels? | Mix cell types and inspect transient clusters | No type-reading instruction, shuffled-label nulls, and controls for value/position correlations |
| Which capabilities survive a new embodiment? | Move the same policy into a changed body or schedule | Frozen genome, explicit sensor changes, and separate immediate and adapted results |
| Did a side effect precede selection? | Assay baseline populations before breeding for one task | Pre-selection records, a declared search objective, and later independent assays |
| What does memory contribute? | Wipe or graft state between matched organisms | Separate genome and memory identities; charge construction, storage, access, and residual work |
| Does cooperation beat the strongest part? | Compare a colony with its constituent policies | Equal total resources and communication accounting, not just fewer apparent rounds |

These mechanics are design extrapolations, not claims that their outcomes are known. Define each measure before interpreting it: adjacent ordered pairs and total inversions are different measures of sorting progress, and policy clustering is different from shared ancestry. A temporary drop in a chosen progress measure does not by itself establish planning or a beneficial detour. Exploratory observations can generate hypotheses. A confirmatory experiment freezes the hypothesis, measurement, comparator, and evaluation cases before it runs. An agent should preserve unsuccessful cases and distinguish an observation from an explanation.

## Wittgenstein and representation

Wittgenstein's *Tractatus*, together with Russell's introductory account, offers a second line of inspiration: distinguish the structure of a representation from the situation it represents and from evidence that it is true. Platonik adapts simple and complex symbols into inspectable expressions, while treating states of affairs and checked facts as different things. This is an analogy for game design, not a claim that the simulator implements Wittgenstein's ontology. [Tractatus, propositions 2–2.01, 2.1–2.225, and 3.3](https://courses.umass.edu/klement/tlp/tlp.html).

The [working glossary](symbols-and-facts.md) starts with four terms and can grow through dated revisions. Its experiments ask whether a reusable description helps a policy generalize, whether recombining descriptions changes behavior, and whether a vocabulary survives a new embodiment. Compare aliases with their expanded programs, freeze interpretation across matched runs, and charge representation and evaluation costs. A concise name, a correct snapshot description, and a useful predictive model are different achievements.

This connects to the existing organism experiments through representation and transfer. Michael Levin motivates investigating collective competencies; the Wittgenstein-inspired layer makes the relationship between a description and the observed world an explicit object of play. Neither connection makes symbolic elegance evidence about P versus NP.

## A route toward P versus NP research

Start with sorting and collective recovery. Later add constraint habitats in which local cells propose Boolean assignments, or organisms choose branching, propagation, representations, and reusable components for a solver. A satisfying assignment is independently checkable. An unsatisfiability claim needs a checked proof; a timeout is only unfinished search.

Potentially useful outputs include faster heuristics on declared families, reusable solver components with their acquisition costs included, adversarial counterexamples, structural conjectures, and proofs about restricted algorithm classes. Each output should travel with its code, protocol, costs, and evidence.

Finite benchmark success cannot establish polynomial-time performance on all inputs. A general P=NP claim needs a correct algorithm and a worst-case polynomial bound for an appropriate NP-complete problem. Refuting a particular approach or proving lower bounds in a restricted model does not establish P≠NP. [Clay Mathematics Institute's problem description](https://www.claymath.org/millennium/p-vs-np/).

Consequently the game has no "percent of P=NP solved" meter. Its frontier is empirical. A later formal track can accept machine-checked lemmas with explicit statements and assumptions, evaluated separately from leaderboard points. Even a checked theorem's relevance depends on its statement and on the model it formalizes.

The name Levin can also refer to **Leonid Levin**, the complexity theorist associated with [universal search](https://www.cs.bu.edu/fac/lnd/research/cc.htm). He is a different researcher from Michael Levin. Enumerating small candidate programs is an optional future search strategy; it is not the source of the organism metaphor and is not a premise that useful search will be cheap.

## Reuse from peqnp and Oh

[peqnp](https://github.com/hraness/peqnp) provides a relevant experimental approach: small typed programs, deterministic generators, explicit computational costs, independent checking, and preserved negative results. Adapt these ideas to a game-sized runtime. Inspect the exact source and license before importing any implementation; this proposal specifies no dependency on peqnp or Oh and makes no claim that their current interfaces already fit the game.

Use a small local journal for play. Oh's evidence-oriented approach may later support exporting selected research milestones. Full research-ledger publication, paginated history admission, and solver proof infrastructure should not be prerequisites for breeding a first creature.

Cost accounting is especially worth preserving. A useful abstraction or memory can make repeated tasks cheaper while being expensive to discover or load. Record discovery, construction, and execution costs separately; never silently substitute one for another.

## What the game can honestly produce

The strongest near-term outcome is a public collection of reproducible organisms, informative failures, and controlled experiments in minimal collective computation. Novel algorithms would be valuable. Progress on a major complexity question would require evidence beyond the game score. Interesting cognition-like behavior can remain worth studying without requiring a conclusion about consciousness or metaphysics.
