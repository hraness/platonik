# Earning confidence in the whole game

Validation proposal, 11 September 2026. Platonik has working browser experiments, a small [Rust integration slice](rust-bridge.md), and a specified campaign direction. It does not yet have a playable Rust campaign, a demonstrated audience, or evidence that large ecologies produce useful new algorithms. This page defines what would justify those claims and what would make us change course.

**The design decision is to build one engineering adventure with a finite ending and an open workshop beyond it.** The [campaign](campaign.md) supplies reasons to care; the [Autoverse contract](autoverse.md) supplies the capabilities that make its changes of scale possible. Complexity creates tradeoffs. It is not a score that grows just because a program gets longer.

## What we can be confident about today

| Question | Evidence available | What remains to establish |
| --- | --- | --- |
| Can a small program have a recognizable, changeable habit? | Editable courier rules, deterministic journeys, parent comparisons, and structural portraits in the observatory | Attachment and understandable improvement when a new player drives it through an agent |
| Can simple components support more elaborate computation? | The separate signal workbench checks relays, NAND behavior, resettable registers, four-bit addition, and an accumulator | The Rust bridge adds shared spatial transport and control; a stored-program computer and in-world construction remain unimplemented |
| Can construction have real limits? | The workbench copies a blueprint into an initially empty graph with finite build steps and node material | Construction performed by an organism inside the world; sensing, acquiring material, repairing, and generating useful descendants |
| Does the narrative have an earned end? | Six chapters with observable capability contracts and a final delivery-and-reply objective | A complete playable expedition, pacing, player choices, and an ending players find satisfying |
| Can larger worlds be affordable? | Fixed Rust workload measurements, including a 16-cell/128-tick queue-saturating probe and a measured memory repair; see the [bridge evidence](rust-bridge.md#measured-cost-and-the-memory-repair) | Larger envelopes, worst-case workloads, supported hardware tiers, and long-lived process behavior |
| Will play produce useful research? | A falsifiable comparison and transfer protocol | Replicated results that survive matched baselines and an independent implementation |

Passing the circuit tests establishes those finite circuit behaviors. It does not validate all the chapters, establish universality, or predict that the game will be fun. The [workbench](https://platonik.space/lab#autoverse) makes that boundary visible rather than hiding it behind a campaign completion meter.

## The bridge we must build first

Before expanding the setting, build a short **migration-to-ark bridge** in the Rust engine. It must exercise the same saved creations across three problems:

1. A named courier colony maintains a beacon through a route change.
2. Its deliveries trigger local signals. A memory-bearing component retains a route decision after that signal disappears. The player can inspect the delivery, the signal, and the retained state in one replay.
3. Those components become part of a small mobile habitat. During a declared interruption, a controller schedules circulation and reserves well enough to finish the journey. A player can replace one component and rerun the same case.

Use one manifest, one time model, typed interfaces, and one cost ledger. A “colony module” must expand into the actual cells and connections it contains. A signal cannot conjure a spark, a saved pattern cannot smuggle in extra memory, and a disconnected component cannot read the world through its agent. Templates may provide working examples; they carry their full execution costs.

This bridge is the main go/no-go decision. If earlier creatures stop mattering when circuits appear, or each transition needs an unrelated simulator with invented conversion rewards, revise the substrate and campaign before building more planets. The [Rust bridge](rust-bridge.md) now tests the core transport–signal–memory–routing chain in one runtime, with unchanged-policy comparisons and component removals. Its static damaged opening map and stationary service fixture are narrower than the three-task gate above: scheduled route collapse, moving-habitat services, persistent creations, and player-driven reuse remain to be completed.

Require at least one unchanged earlier controller or module to do causal work in two different bridge tasks. Remove it in a comparison copy and check the resulting loss or changed tradeoff on frozen cases. A lineage label or a paid conversion unlock does not establish reuse. If a module needs a change, record that change and call the result adaptation.

## Keep agency when the agent is powerful

The player chooses an ambition, a constraint, a favorite, or a tradeoff; the agent handles the implementation and explains the result. Reference designs are available. A player need not discover binary arithmetic unaided to earn an ark.

Make choices consequential through competing objectives: compact versus resilient, fast versus frugal, specialized versus adaptable. Let a player request a repair, commission a comparison, adopt a public design, or build a new architecture. Every route must satisfy the same expedition contract. Avoid arbitrary waiting, mandatory random breeding, and a single secret genome required by the story.

Automation is welcome within a declared search budget. It should yield a comparison and an inspectable artifact. It must not turn every scene into “press optimize, receive a larger number.” If the agent solves a challenge immediately, the player can accept the result and advance, then choose a tighter envelope or an unfamiliar situation. Do not sabotage capable agents to manufacture difficulty.

Separate three purposes. The campaign has a reachable authored conclusion. Open competitions compare results within fixed execution and information limits. Personal mastery is demonstrated by explaining and improving builds on unfamiliar tasks under a stated discovery budget. More compute may improve search, but expenditure by itself earns no campaign achievement or scientific credit.

Before recruiting players, demonstrate a real choice on frozen cases: one feasible compact design uses less work or space on ordinary journeys; another completes a disruption the first cannot, or restores service sooner at its declared extra cost. Replay and component removal must explain both outcomes. This is a finite witness of a tradeoff, not proof that no future design can improve both. A better generalist is welcome.

Also run an agent stress test under equal stated discovery allowances: an unchanged public reference, an agent optimizing the next objective, and an agent maintaining a persistent player constraint. Charge adaptation and include unfamiliar admissible cases. Copying a reference may legitimately finish the story. Revise the missions if every ambition yields the same assembly with no observable sacrifice, or the player's chosen constraint has no effect. This diagnostic is separate from the human pilot, not a controlled comparison against it.

## A small player study before a large world

These are proposed decision thresholds, not results or population estimates. Recruit twelve people who have enjoyed building with an AI; include at least six without formal computer-science training. Record prior experience. Use the same agent configuration and a published per-session search allowance, record assistance, and obtain permission before collecting session data. Use a separate later cohort for any confirmation after redesign.

Predeclare the facilitator script, allowed hints, scoring rubric, session budget, and optional continuation period. Compensation does not depend on success or continuing. Score causal explanations against recorded events, with participant identity hidden from the scorer where practical. Distinguish a correct explanation from an unsupported guess.

Start with a 30–45 minute opening session. A successful pilot requires at least:

- **9 of 12** independently initiate a build or change and complete a matched comparison without the facilitator operating the game.
- **8 of 12** explain the cause of one observed failure and choose a change that addresses it. Score against the trace, not eloquence or technical vocabulary.
- **8 of 12** voluntarily request another experiment when given a genuine option to stop.
- **8 of 12** choose a creation to keep and identify an observed habit that makes it worth keeping. A name or attractive portrait alone is insufficient.

Report the individual outcomes and exact counts, including withdrawals and failed runs. These small samples catch large design failures; they do not establish retention or a market. If a threshold is missed, change the opening and repeat with new players before adding campaign chapters.

Then test the migration-to-ark bridge with a new twelve-person cohort, in two sessions. Require at least eight to reuse an earlier creation successfully, explain a cross-component failure, and make an unaided consequential choice in the second session. Ask participants to describe the goal of the journey in their own words. If they remember only disconnected puzzles, revise the integration and story presentation.

Finally, test a compressed, fully playable six-chapter campaign. Make all necessary templates and local contracts available, disclose the test length, and count everyone who begins. A proposed acceptance gate is at least nine of twelve reaching the ending within three 60-minute sessions, with at least eight able to explain why their final expedition succeeded and name a prior creation that contributed. Track where people disengage, whether they feel hurried, and whether they choose to continue building afterward. No completion target justifies silently doing the final engineering for them.

These time boxes are prototype tests, not promises about the final campaign's length. Longer progression is earned only after the shorter complete arc works.

After two redesigned opening or bridge cohorts still miss their gates, pause chapter expansion and choose a narrower courier laboratory or circuit workshop while repairing the integration. Do not keep resampling until twelve favorable players appear.

## Technical gates before each increase in scale

Every new capability needs a finite, independently checkable scenario contract and a known feasible example. Publish the legal observations, world events, initial resources, limits, success conditions, and failure conditions. Test the example, a simpler baseline, and deliberately damaged variants. Do not infer feasibility from map connectivity alone.

The reference campaign must run from a new save through the ending without the multiplayer market, paid services, developer intervention, or spending while paused. Save and replay every transition. Repeat across a frozen set of admissible hazard schedules, and check that restart, partial failure, and budget exhaustion preserve the player's collection. Reference solutions demonstrate reachability; player studies establish whether people can find and understand solutions.

For a later admitted Rust bridge envelope, propose a supported reference workload of at most 128 active cells, 2,000 ticks, and 32 policy operations per activation: at most 8,192,000 policy operations, plus all world and interface work. Pin a reference machine and a fixed set of cases before measuring. Target a two-second p95 run, including checking, with less than 256 MiB peak resident memory and less than 5 MiB for a compact replay artifact. These are admission targets, not measured capacity. The implemented prototype is capped at 128 ticks; it does not satisfy this 2,000-tick envelope. If they fail, reduce the active envelope or improve the implementation; keep charged work truthful.

For later tiers, publish measured p50/p95 runtime, peak memory, artifact bytes, verifier time, and the total cost of the permitted candidate search. A hundred cheap-looking candidate runs can dominate the one replay a player sees. Require a new capacity receipt before raising an envelope; extrapolation is not admission evidence.

Total evaluation work sums **policy + world/scheduling + signal edges and queues + memory/interfaces + construction + checking**, across every candidate and case. Real cost also includes search orchestration, external-agent tokens, serialization, and replay storage. Bound nodes, edges and fan-out, queued messages and delay horizon, blueprint expansion, generated candidates, total ticks, and exported trace bytes separately. A cell count alone cannot bound a communication network.

Keep most of civilization as saved blueprints, history, and paused regions. Advance only explicitly budgeted expeditions. Long-range communication uses scheduled, charged messages; pausing a region cannot complete its voyage or fabricate acknowledgments. If an exact component acceleration cannot preserve timing, boundary events, state, and work, use the ordinary interpreter for official results. Approximate spectacle can be a separately labeled view.

## What would count as productive play?

The first scientific target is modest: a reusable method for transport or recovery under local information. Publish a frozen task family, simple and strong matched baselines, an improvement threshold, evaluation allowance, and an uncertainty analysis before testing the final candidate. Preserve unsuccessful candidates and charge preprocessing, borrowed components, memory, communication, and adaptation.

A contribution can be a robust method, a useful benchmark, a counterexample to a proposed mechanism, or an ablation that explains why a collective works. Export promising methods into an independent implementation and an appropriate external task before claiming practical benefit. The [research thesis](complexity-and-scale.md#a-thesis-that-can-fail) defines the comparisons and the two-family stop rule.

Circuit construction is initially an engineering demonstration. Fractal-looking truth maps are initially an exploratory visualization. Each needs a functional task and comparisons before becoming a scored research habitat. Neither appearance nor campaign success is evidence about consciousness, general intelligence, or P versus NP.

The optional market pays for specified, checked work. Public blueprints remain copyable, so usefulness comes from solving a new commission or improving a result, not pretending a public hash makes a scarce object. The campaign supplies its own contracts and can finish offline. Shared storage and commerce follow demonstrated demand; they do not rescue a weak local game loop.

Before implementing commerce, try three manual local commissions from distinct requesters for adaptations the public references do not already satisfy. Each delivered result must pass its frozen acceptance conditions. This is a small test of demand for useful work, not evidence of a sustainable economy.

## Decisions if the promise fails

| Failed test | Change to make |
| --- | --- |
| Players enjoy portraits but cannot explain or influence behavior | Simplify the first habitat and improve cause-and-effect replay before adding more species |
| The agent does everything and players have no preferences | Add meaningful mission and architecture tradeoffs; remove chores and automatic progress narration |
| Transport, circuits, and construction do not compose | Repair their shared protocol or narrow the Autoverse promise before continuing the campaign |
| The short arc works but large active worlds are too expensive | Keep civilization as linked, bounded expeditions with explicit time semantics |
| Research gains disappear against fair baselines | Publish that result and redirect the research track; retain the engineering game only if people enjoy it |
| The complete compressed campaign does not sustain interest | Rewrite the failing transition and ending; do not stretch it with grind, rarity, or a market |

The next release decision is concrete: extend the checked Rust transport-to-control slice into the persistent, player-operated bridge above, then put it in front of new players. The fuller campaign has a testable design now; confidence in its success must grow through those results.
