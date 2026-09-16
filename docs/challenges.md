# Generated challenges

Eval proposal, 16 September 2026. The `platonik challenge` commands are implemented in the local CLI: a deterministic generator derives each challenge's cases, a submission is scored on reserved cases, and every result is independently replayable. The published window is a local, self-checked leaderboard — for the hosted version with withheld cases and per-entrant quotas, see [hosted seasons](seasons.md). Ranked competition remains governed by the [competition proposal](competition.md).

A challenge asks a question in the spirit of code golf and ARC: *can your agent write one small program that works in worlds it has never seen?* You prompt; the harness produces a program in the habitat rule language; the engine replays it against cases your agent did not train on and charges the work it actually does.

## The set that keeps growing

Every challenge is a pure function of its index. `platonik challenges` lists the published window, currently thirty-two ids, and `platonik challenge <id>` prints its bundle on any machine. There is no database of questions to leak or memorize: challenge 0050's worlds did not exist anywhere until someone derived them, and a reviewed generator change can extend the window or add families without touching existing ids.

Each challenge carries a difficulty band. Every eight indices raise the band, up to four, widening grid sizes, wall density, spark counts, and timing budgets. From band two upward, some cases schedule a declared edge closure mid-run — the [edge hazards](field-expedition.md) of the expedition, now generated rather than authored.

## Family one: crossing

The first family asks one editable courier to keep a generated beacon alight. The generator draws a small walled grid, a source of sparks, and a draining beacon, then admits the case only when the public `resilient_courier` witness passes it under the same limits — so every published case has a checked feasible run, matching the [admission rule](engine.md) the engine already requires.

A bundle contains four public **training** cases and four reserved **eval** cases from the same family. The right artifact is a general policy — a little state machine built from local senses and four memory bytes — not a rehearsed route, because the eval layouts differ from every training layout. That is the ARC move made executable: examples to learn from, held-out instances to be judged on, and the answer expressed as a program that actually runs.

## What one score reports

`platonik challenge eval <id> <submission.json>` grafts the submitted programs into each reserved case, runs them, and emits a result carrying full receipts. A submission is exactly the `editable` cell programs — nothing else in the case can move:

```json
{
  "schema": "platonik-challenge-submission-v1",
  "challenge": "challenge-0001",
  "programs": { "1": { "rules": [{ "when": [], "action": { "kind": "wait" } }] } },
  "agent": { "name": "your-harness", "tokens": 12345 }
}
```

That program is the smallest legal one — one unconditional wait — and loses everywhere. `platonik challenge reference <id> resilient` prints a complete passing baseline to start from.

Rank order on a challenge is lexicographic:

1. **Eval cases passed.** Clearing the whole reserved set first; partial progress stays visible.
2. **Lower total charged work.** Summed across eval cases, including the costs of failed actions — the world's own ledger, not a token estimate.
3. **Fewer canonical program bytes.** The golf axis: the rule language already charges program loading into the ledger, and the tiebreak keeps it honest.

One consequence worth reading twice: the ordering applies to failures too, so among entries that pass zero cases the one that spent less work ranks higher — a deliberate ledger reading (a cheaper failure consumed less of the world), not a reward for idleness. Nothing below a full clear counts on the global board.

`platonik challenge board <dir>` re-verifies every result file in a directory — verification re-derives the cases and re-executes them rather than trusting any recorded number — then prints per-challenge boards and a global rollup that counts cleared challenges before total work. The recorded board at `/lab/challenges` shows reference baselines, not a live ranking.

## The prompting axis

Colf measures how few tokens a prompt needs. Here the analogue is declared, not measured: `agent.name` and `agent.tokens` are self-reported and printed beside each row. They cannot be authoritative in a local tool — an entrant could report anything — so the board labels them and ranks on replayed work. The [agent evaluation](agent-evaluation.md) shows why: two harnesses finished the same expedition with different real token costs, and only the modeled work was measurable. A hosted evaluator could enforce a compute allowance at the [competition](competition.md) boundary; a local board cannot.

Honest practice iterates on the training cases and submits once against the reserved set. Local bundles publish the eval cases for inspection, so nothing technically prevents studying them — the same convention the expedition calls *predeclared transfer testing*, not blinded evaluation.

## What this does not establish

Clearing challenges is evidence that a harness can synthesize working policies for a bounded family it had not seen, at a measured cost. It is not a general intelligence score: the families are known and seeded, the worlds are small, and a public witness already passes every case. What the board does make hard to fake is the artifact itself — a submission is a program whose receipts either replay or do not. [Hosted seasons](seasons.md) add the withheld-salt evaluator and per-entrant quotas on this same family; families for valves, links, construction, and multi-cell organisms remain later work under the competition proposal's [commitment scheme](competition.md#training-submission-and-replay).

```text
platonik challenges                                       # the published window
platonik challenge challenge-0007 > bundle.json           # inspect a bundle
platonik challenge reference challenge-0007 resilient     # a baseline submission
platonik run train-case-with-your-program.json            # iterate locally
platonik challenge eval challenge-0007 mine.json > result.json
platonik challenge verify result.json                     # anyone can re-check
platonik challenge board results/                         # the local leaderboard
```

A training case scores an edited copy of its courier program through `platonik run`; the same program, unchanged, is what `challenge eval` measures on the reserved cases.
