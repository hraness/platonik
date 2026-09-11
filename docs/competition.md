# Competition proposal

Proposal, 10 September 2026. The Platonik website and documentation are the current milestone. The game engine and leaderboard are proposed; no hosted ranking service exists yet. This page specifies the intended merit model and the work needed before calling results official.

## What it means to be better

The main competition compares the organisms players discover. An external agent may spend substantial compute designing, testing, or breeding one. The submitted organism then runs independently, with the same resources as every competitor in its division. Better discovery can produce a better entry; spending more during discovery does not directly add points.

This is an open engineering competition. Equal execution limits do not mean equal training budgets. A future efficiency division would require organizer-controlled discovery runs to enforce a compute allowance; self-reported external-agent spending cannot establish one.

## One readable main rank

A season publishes ordered difficulty tiers. Each tier contains several balanced habitat classes, exact case counts, and resource limits. For the sorting prototype, candidate classes are healthy arrays, wounded controllers, and changed activation schedules. Larger tiers change array sizes or constraints. Exact constants must be calibrated before a season is frozen.

Rank a player's single selected submission lexicographically by:

1. **Consecutive tiers fully cleared:** every case in every class passes within its limits.
2. **Cases solved in the next uncleared tier:** partial progress remains visible.
3. **Lower charged execution cost:** for entries tied after clearing K tiers, compare total charged work on tiers 1 through K+1, capped at the season's last tier. Run every case in that prefix; an early failure cannot omit later cases. Cases that exhaust their budget or fail without a valid answer receive their full case allowance. Exact ties share rank.

Report class-by-class outcomes beside the rank, including all failures and budget exhaustion. Each player nominates one submission before a round closes; it replaces that player's previous nomination for that round. Retries and duplicate offspring cannot accumulate score. Separate specialist tables can expose useful tradeoffs without changing the main ordering.

This rule favors broad completion before micro-optimization. Clearing a finite tier is an observation on that tier's cases, not a universal correctness or reliability proof. The comparison stops at the season's published maximum; extending the frontier requires a new version or season.

## What the evaluator charges

Each division fixes language version, code and body size, memory, sensors, communication, and per-case fuel. A season's cost table includes instruction evaluation, sensing, state updates, copying, communication, activation scheduling, and actions. Failed actions and inactive scheduling still incur their specified costs. Multi-cell execution costs sum across cells; simulated parallelism does not erase work.

An organism has no access to the network, filesystem, system clock, hidden seeds, evaluator labels, or external agent during a ranked episode. It sees only the observations allowed by its habitat. Deterministic randomness is explicit and metered. Candidate programs cannot choose the checker or revise recorded outcomes.

Most cases reset memory. A separately declared sequence track can retain it, but charges building, storing, loading, and reusing it. The reset boundary, initial contents, and entire sequence are part of the benchmark. Compiling a colony into a reusable component preserves its original costs.

Wall time is useful operational information; deterministic work is the primary comparison. Memory and code size remain hard limits and reported dimensions. The game does not claim that a VM fuel unit is a universal measure of physical energy or computational complexity.

## Training, submission, and replay

Proposed local campaign saves and practice tables would record local results. Hashes make accidental changes detectable but cannot make a self-reported local score authoritative.

Official ranking requires an organizer-operated evaluator that accepts an immutable genome/body bundle and reruns it on withheld cases. It validates the candidate, enforces CPU and memory limits outside the VM as well as within it, and records all scheduled outcomes. It does not trust an uploaded score file.

Publish the generator, rules, evaluator source, baseline entries, and training seeds. Before entries close, commit to the evaluation seed set with a secret random salt. After the evaluation round closes, reveal seeds and salt, confirm the commitment, and release per-case evidence for replay. Fresh rounds use new held-out seeds. Detailed hidden trajectories should not leak while a round is accepting entries.

Use a modest per-account submission allowance and aggregate feedback during a round. These reduce adaptive probing; they do not prove protection against multiple accounts. The first prototype needs no cash prizes or claim of adversarially secure identity. A prize-bearing service would need an explicit eligibility and abuse model before launch.

An official result binds the candidate hash, language and simulator versions, challenge manifest, complete case set, budgets, outcomes, costs, and trajectory hashes. Independent replay checks the released bundle. Superseded evaluator bugs require a documented correction and rerun under a new version, preserving the old record.

## Discoveries, opponents, and credit

Genomes submitted to a ranked round become public under a stated reuse license when the round closes. Reuse and improvement are legitimate; record parent attribution and keep equal-performing identical entries tied. First discovery credit belongs in the lineage and research record, not an advantage that makes an inferior entry win.

Novelty badges and attractive patterns do not boost the main score. A reproducible counterexample to a published claim can earn research credit even when its organism loses. Evidence review should reward useful negative results without creating a farmable numerical "science currency."

Later adversarial arenas need a separate stressor admission rule: generated problems must stay within declared constraints, have independently checkable solutions or feasibility witnesses, and be evaluated across a fixed panel. Relative duels alone can be non-transitive, so the main leaderboard remains anchored to fixed challenges rather than endless Elo farming.
