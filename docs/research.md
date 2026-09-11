# Research foundations and useful results

Proposal, 11 September 2026. The website and documentation come first; the game engine and research archive described here are proposed. Platonik starts with a simple ambition: build a colony that carries light across a changing world. Its research value depends on what that colony demonstrably does, which explanations survive testing, and what others can reuse.

## Michael Levin's minimal systems

Michael Levin, a researcher in morphogenesis and diverse intelligence, supplies the central inspiration: investigate what simple components do together, including behaviors outside the objective for which they were selected.

Zhang, Goldstein, and Levin's sorting study reports damage responses, temporary setbacks during sorting, and clustering in mixtures of local sorting policies. These are findings about the models and experiments studied. They motivate experiments in Platonik; they do not guarantee that a different simulator or every mixture will reproduce them. [Sorting study](https://arxiv.org/abs/2401.05375).

In *Ingressing Minds*, Levin proposes studying minimal systems and novel embodiments to understand relationships between constructed interfaces and the patterns they express. The essay also advances hypotheses about minds and nonphysical patterns. Platonik can test concrete behavioral predictions inspired by this program without treating its philosophical interpretation as a simulation result. [Ingressing Minds](https://doi.org/10.3390/philosophies11050161).

His discussion of sorting also suggests looking for useful side effects under different observational descriptions of the same computation. A later sorting habitat could measure task progress and policy clustering from one unchanged trace. The selected objective need not exhaust what is worth studying. [Levin's discussion](https://thoughtforms.life/algorithms-redux-finding-unexpected-properties-in-truly-minimal-systems/).

The opening beacon habitat is a new game model, not a reproduction of the sorting study. Its couriers move conserved sparks from a finite spring to a draining beacon. Start by measuring deliveries, charge over simulation time, occupied routes, recovery after a declared route collapse, and charged computation. Successful delivery demonstrates performance in that specified world; it does not establish cognition, consciousness, or a theory of life.

## Experiments that become game mechanics

| Question | Player action | Evidence needed |
| --- | --- | --- |
| Does a detour rule help after a route collapses? | Disable that rule in a copy and race both colonies | Matched starting states and collapse schedules, complete trajectories, execution costs, and new held-out maps |
| Does a mixed colony beat its strongest constituent? | Send the mixture and each uniform parent colony on the same expedition | Equal cell counts, supply, initial charge, duration, and execution budgets; varied starting positions |
| Does a capability travel? | Move an unchanged lineage to new maps or activation schedules | Frozen genome, fixed sensor contract, and separate results before and after further adaptation |
| Did a side effect precede selection? | Assay baseline populations before breeding for one task | Pre-selection records, a declared search objective, and later independent assays |
| What does local memory contribute? | Disable access to a register in a copied policy | Matched trials with defined replacement behavior, separate genome and state identities, and full memory costs |
| Does a sorting chimera cluster without sensing labels? | Later, mix cell types in the sorting habitat and inspect their positions | No type-reading instruction, shuffled-label nulls, and controls for value/position correlations |

These are proposed experiments with unknown outcomes. Define each measure before interpreting it: a courier moving away from the beacon is an observation, not proof of a useful detour or of planning. Test whether changing the suspected rule changes the result. Preserve failures and report healthy-route costs as well as recovery gains.

The player can ask, “Was that a fluke?” The agent should turn the question into a bounded comparison and a readable evidence record. A confirmatory experiment freezes the hypothesis, measurement, comparator, and evaluation cases before it runs. Exploration and confirmation need separate cases; repeated selection on the confirmation set turns it into training data.

## Wittgenstein and representation

Wittgenstein's *Tractatus*, together with Russell's introductory account, offers a second line of inspiration: distinguish the structure of a representation from the situation it represents and from evidence that it is true. Platonik adapts simple and complex symbols into inspectable expressions, while treating states of affairs and checked facts as different things. This is an analogy for game design, not a claim that the simulator implements Wittgenstein's ontology. [Tractatus, propositions 2–2.01, 2.1–2.225, and 3.3](https://courses.umass.edu/klement/tlp/tlp.html).

The [working glossary](symbols-and-facts.md) starts with four terms and can grow through dated revisions. Its experiments ask whether a reusable description helps a policy generalize, whether recombining descriptions changes behavior, and whether a vocabulary survives a new embodiment. Compare aliases with their expanded programs, freeze interpretation across matched runs, and charge representation and evaluation costs. A concise name, a correct snapshot description, and a useful predictive model are different achievements.

This connects to the existing organism experiments through representation and transfer. Michael Levin motivates investigating collective competencies; the Wittgenstein-inspired layer makes the relationship between a description and the observed world an explicit object of play. Neither connection makes symbolic elegance evidence about P versus NP.

## A route toward P versus NP research

Start with transport, recovery, and reproducible comparisons; add sorting as a calibration habitat. Later constraint habitats could let local cells propose Boolean assignments, or organisms choose branching, propagation, representations, and reusable components for a solver. A satisfying assignment is independently checkable. An unsatisfiability claim needs a checked proof; a timeout is only unfinished search. Improving a beacon colony does not by itself advance a complexity-theoretic claim.

Potentially useful outputs include faster heuristics on declared families, reusable solver components with their acquisition costs included, adversarial counterexamples, structural conjectures, and proofs about restricted algorithm classes. Each output should travel with its code, protocol, costs, and evidence.

Finite benchmark success cannot establish polynomial-time performance on all inputs. A general P=NP claim needs a correct algorithm and a worst-case polynomial bound for an appropriate NP-complete problem. Refuting a particular approach or proving lower bounds in a restricted model does not establish P≠NP. [Clay Mathematics Institute's problem description](https://www.claymath.org/millennium/p-vs-np/).

Consequently the game has no "percent of P=NP solved" meter. Its frontier is empirical. A later formal track can accept machine-checked lemmas with explicit statements and assumptions, evaluated separately from leaderboard points. Even a checked theorem's relevance depends on its statement and on the model it formalizes.

The name Levin can also refer to **Leonid Levin**, the complexity theorist associated with [universal search](https://www.cs.bu.edu/fac/lnd/research/cc.htm). He is a different researcher from Michael Levin. Enumerating small candidate programs is an optional future search strategy; it is not the source of the organism metaphor and is not a premise that useful search will be cheap.

## Reuse from peqnp and Oh

[peqnp](https://github.com/hraness/peqnp) provides a relevant experimental approach: small typed programs, deterministic generators, explicit computational costs, independent checking, and preserved negative results. Adapt these ideas to a game-sized runtime. Inspect the exact source and license before importing any implementation; this proposal specifies no dependency on peqnp or Oh and makes no claim that their current interfaces already fit the game.

Use a small local journal for play. Oh's evidence-oriented approach may later support exporting selected research milestones. Full research-ledger publication, paginated history admission, and solver proof infrastructure should not be prerequisites for breeding a first creature.

Cost accounting is especially worth preserving. A useful abstraction or memory can make repeated tasks cheaper while being expensive to discover or load. Record discovery, construction, and execution costs separately; never silently substitute one for another.

## What the game can honestly produce

The archive should show three distinct states of a finding:

- **Observed:** a result or surprising event occurred in an identified run. Its trace and conditions are preserved.
- **Replicated:** a frozen protocol produced the stated effect across new declared cases, with the relevant controls and uncertainty reported. Replaying the same seed verifies reproducibility; it does not establish generalization.
- **Reviewed contribution:** independent review finds the evidence sound and the result useful in relation to existing work. This may be a reusable benchmark, an informative negative result, or an algorithmic finding. A high game score alone cannot award this status.

The player sees the creature and its expedition first. The agent prepares the underlying record, including unsuccessful cases, and explains what has and has not been established. A potential contribution can emerge from play without making every successful rescue a discovery.

The strongest near-term outcome is a collection of reproducible organisms and controlled experiments in minimal collective computation. Novel algorithms would be valuable. Progress on a major complexity question needs evidence beyond the game score. Interesting behavior remains worth studying without requiring a conclusion about consciousness or metaphysics.
