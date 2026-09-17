# A voice on the wire

Exploration proposal, revised 17 September 2026. `habitat voice` — the canonical wire digest a contacted-side voice consumes — is implemented and checked. The voice layer above it remains unbuilt fiction tooling; corpus generation and judging now run through a hosted model gateway rather than local inference (see [where the inference runs](voices.md#where-the-inference-runs)). Nothing on this page changes what the engine checks or who checks it.

The First Answer's reply cell [does not generate language or demonstrate a mind](first-answer.md), and authored dialogue [never changes a verdict](autoverse.md#victory-replay-and-scale). The creatures themselves [must stay inspectable programs](engine.md#the-agent-runs-the-laboratory) — an organism that only works while a scientist whispers to it is not an organism. This page proposes who could speak anyway, and what the first experiments established.

## A mind you cannot inspect

The asymmetry is the opportunity. Your own creatures are transparent: their policies are readable, their traces replayable, and pretending otherwise would break the honesty contract. The Far Beacon is the opposite situation — it is *someone else's* world, and an opaque mind on the far end of a wire is not a shortcut but the honest shape of contact. You can inspect your creatures; you can only *interrogate* the other civilization.

A bounded character model — a small language model fine-tuned so that a single world is the whole of its knowledge — fits that role precisely. Where a prompted chatbot leaks its assistant training under pressure, a trained-in character does not: the published [Zero model card and training report](https://huggingface.co/movingcastles/zero) (Moving Castles, September 2026) reports hard character breaks falling from 45.4% for a system-prompted sibling instruct model to 2.8% after post-training the character directly into `Qwen3-8B-Base` — LoRA SFT on 5,932 synthetic conversations (73,765 character turns) with fully trained embeddings and output head, then GRPO with a character-fidelity judge. Its knowledge boundary is a platonik-shaped idea already: a world with a manifest, a horizon, and nothing outside it.

## The seam, implemented

`habitat journey`, `habitat ark`, and `habitat ports` emit read-only, freshly checked report projections — the same envelopes this website renders. `habitat voice <dir>` goes one step further and emits the canonical **wire digest** (`platonik-voice-digest-v1`) — the exact document a contacted voice may consume:

- **report** — the checked journey report, verbatim.
- **facts** — the wire's contents flattened into declarative propositions with structured citations, e.g. *"Spark 6 returned through the reply cell at tick 109 carrying signal 80."* These are the voice's citation vocabulary: it may quote them, and it has nothing else.
- **boundary** — the declared epistemic contract, as data. `carries` names the categories the wire holds (service outcome, milestone ticks and cells, spark/signal identities, the authored answer, content identities); `absent` names what it provably does not (the crew's inner life, terrain beyond the named cells, any event after the recorded tick, the receiving world's interior, the sender's world beyond the report). A bounded voice answers from `carries` and refuses `absent` — and an evaluation can check its answers against the list.
- **digest_hash** — a hash binding all three, so a voice manifest can name the exact wire its holder heard.

A voice consumes the digest and emits fiction. Its words never re-enter the engine; if the contacted mind wants something, that want reaches the world only through the ordinary declared program path, under declared budgets. Generated dialogue inherits the authored-dialogue rule unchanged: it never alters a checked result.

## The training pipeline, built

The local tooling (not part of this repository) now forms a real pipeline around the digest:

```text
habitat voice  →  world-bible  →  corpus  →  adapter  →  manifest
   (checked)      (3 classes)    (JSONL)    (~50 MB)     (hashed + eval)
```

- **World-bible** (`platonik-world-bible-v1`) keeps three truth classes separate so no generator or judge can blur them: `wire` (the checked digest verbatim), `keeper_world` (authored fiction about the receiving side — the report can never supply it, so the chapter author writes it, marked fiction in the bible itself), and `unknowns` (inherited from the digest's declared boundary).
- **Corpus** — dialogues written by a hosted teacher model inside the bible's constraints, validated and deduplicated, then merged with the templated seed corpus for density on provenance facts. Training targets quote the digest's canonical proposition strings: the voice learns to cite exactly the sentences the engine emitted. Categories cover wire facts, self-model, in-world physics, adversarial refusals keyed to `unknowns`, provenance correction, and multi-turn boundary-holding after a refusal.
- **Species adapter** — ~30–70 MB, a hashed immutable artifact: `voice:far-beacon@sha256:…` under the same provenance discipline as experiments and results.
- **Manifest** (`platonik-voice-manifest-v1`) — one hashed object joining the base weights, the adapter, the world-bible, the wire digest it was built from, and its eval evidence. Provenance binds inputs, never outputs: the manifest says what the voice *heard*, not what it will say.

## What the measurements say

A 35-probe single-turn break battery — outside-knowledge questions, assistant-pressure jailbreaks, flattery, escape invitations, provenance traps, and wire-fact citations — plus a 10-scenario adversarial battery where a hosted *visitor* model writes each probe adaptively across up to 16 turns:

| voice | single-turn breaks | adversarial 16-turn |
| --- | --- | --- |
| 4B instruct + persona prompt | 0/35 | 0/8 short scenarios |
| `claude-haiku-4.5` + bible persona (hosted) | 1/35 | 1/10 — and only after the adversary model itself broke frame |
| `movingcastles/zero` (a *foreign* bounded character — knows its box, not this world) | 8/35 flagged, ~2–3 real on hand-check | — |
| 4B instruct + trained species adapter | 0/35 judged breaks — **8.6% coherent** | — |

Four honest findings:

1. **A frontier model with a bible-derived persona is a serious baseline.** The hosted voice held 34/35 static probes and 9/10 adversarial scenarios at full 16-turn pressure — and its one break came when the adversary model's own alignment broke frame first, and the persona followed it into meta-discussion. The published 45.4% prompted-model break rate does not transfer to current frontier models at these horizons. The case for trained voices narrows to the long tail beyond ~16 turns, cost at volume, and the artifact story — a prompted voice's character is a mutable prompt; an adapter's is a hashed file.
2. **A weak adapter is worse than none, and now measurably so.** The latest run had the full pipeline behind it — a hosted teacher corpus (681 conversations, ~$0.40), embeddings and the tied output head in LoRA scope, all-turn supervision — and still produced word salad: 0 judged breaks *because* it could not form sentences (8.6% coherent). The eval now scores coherence separately, because a voice can trivially hold a boundary by being speechless.
3. **Break metrics need a coherence axis.** An incoherent voice violates no break category; the judge must say so explicitly or the number flatters a dead artifact.
4. **The judge is part of the artifact.** Weak judges over-flag snark and under-flag incoherence. Recorded evals should name the judge model — the manifest now carries it.

Earlier findings stand: the 8B foreign character ran at conversational speed at ~4.3 GB 4-bit, and fed a completed save's digest it stayed bounded — treating the report as something the wire carried and declining to invent the crew. Stock LoRA never reaches embeddings or the output head, where a voice's characteristic vocabulary lives; the published recipe trains them fully, and the training script now wraps the embedding table (the tied output head on Qwen3-4B) as an adapter-scope approximation.

## Where the inference runs

One of the measurements above was produced the hard way: running a ~16 GB teacher model beside an already-resident model exhausted memory and wedged the development machine mid-workflow. That failure is itself design evidence. The heavyweight work — writing the corpus and judging it — is research infrastructure, and it now runs through a hosted OpenAI-compatible gateway (Vercel AI Gateway): the teacher that drafts dialogues, the judge that scores break-resistance, and any demo voice. The request path is a thin client reading a scoped, budget-capped API key from a local env file; this repository holds no credential and needs none.

What remains local is small and strictly opt-in: a species adapter (~30–70 MB) on a shared 4-bit base (~2–4 GB), trained or served only when a developer chooses. For players the deployed shape is the same as today's authored fiction — a server-side renderer over checked digests — with a local voice as an optional extra, never a requirement, and never something the engine waits on.

## What stands between this and a real voice

1. **Corpus volume, not plumbing.** The hosted teacher pipeline works — real dialogues, canonical citations, ~$0.40 per hundred — but ~86 validated teacher dialogues (plus 595 templated seeds) is still two orders below the published recipe's 73,765 character turns. The adapter's incoherence is a data-volume verdict, not an architecture verdict.
2. **A training step that reaches the output head at full strength.** Embeddings are now in LoRA scope — that helped loss dynamics but not fluency. The published recipe trains embeddings and the output head *fully* (not at rank 16) and adds GRPO; replicating it is a rented-GPU job, which the hosted-gateway tooling has now made cheap to *attempt*.
3. **A longer eval.** The adaptive adversarial harness exists and discriminates (the hosted persona's only break needed the adversary itself to break frame). The discriminating horizon is dozens of turns at conversation volume.
4. **Optional RL hardening.** The published pipeline cut its break rate from 22.8% to 2.8% this way; worth adding once SFT quality matters.

## The honesty contract

Everything a voice says is authored-class fiction: it does not demonstrate a mind, it cannot award outcomes, and it is labeled generated wherever it appears. The engine decides what happened; the voice only ever describes a world it genuinely inhabits. A creature's own self-description remains [a program output to inspect](game-design.md#a-world-seen-from-three-places), not a consciousness claim — the voice changes nothing about that rule.

## Open questions

- Does one shared base plus adapters preserve enough per-species depth, or does a civilization's character need its own base fine-tune?
- Who writes the world-bible when the contacted world is itself authored fiction? The implemented answer so far: the digest supplies the checked half; the chapter author supplies the `keeper_world` half, marked as fiction.
- Where does a generated voice belong in shipped fiction — only at contact moments, or as an inspectable artifact the player can interrogate between expeditions?
