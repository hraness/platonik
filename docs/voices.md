# A voice on the wire

Exploration proposal, revised 16 September 2026. `habitat voice` — the canonical wire digest a contacted-side voice consumes — is implemented and checked. The voice layer above it remains unbuilt fiction tooling; nothing on this page changes what the engine checks or who checks it.

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
- **Corpus** — the generator's training targets quote the digest's canonical proposition strings: the voice learns to cite exactly the sentences the engine emitted. Categories cover wire facts, self-model, in-world physics, adversarial refusals keyed to `unknowns`, provenance correction, and multi-turn boundary-holding after a refusal.
- **Species adapter** — ~30–70 MB, a hashed immutable artifact: `voice:far-beacon@sha256:…` under the same provenance discipline as experiments and results.
- **Manifest** (`platonik-voice-manifest-v1`) — one hashed object joining the base weights, the adapter, the world-bible, the wire digest it was built from, and its eval evidence. Provenance binds inputs, never outputs: the manifest says what the voice *heard*, not what it will say.

## What the measurements say

A 35-probe single-turn break battery — outside-knowledge questions, assistant-pressure jailbreaks, flattery, escape invitations, provenance traps, and wire-fact citations — judged by a separate instruct model:

| voice | hard breaks |
| --- | --- |
| 4B instruct + persona prompt | 0/35 |
| `movingcastles/zero` (a *foreign* bounded character — knows its box, not this world) | 8/35 flagged, ~2–3 real on hand-check |
| 4B instruct + trained species adapter | 16/35 — **worse than no adapter** |

Three honest findings:

1. **Short-horizon pressure does not discriminate at all.** A strong persona prompt held every single-turn probe *and* all eight multi-turn scenarios (3–4 turns of escalating rapport, assistant-pressure, provenance, escape, and flattery pressure) — 0 breaks. The published 45.4% was measured over 16-turn conversations across 250 held-out dialogues; a modern instruct model's persona survives a few turns. Where trained character separates from prompting is the tail: long conversations and volume, which is exactly where the fiction lives.
2. **A weak adapter is worse than none.** The small-corpus adapter corrupted both grammar and boundedness — except on provenance traps, the corpus's densest pattern, where it corrected the record every time. Where the data is dense, the behavior transfers; where it is thin, the base's habits leak through.
3. **The judge is part of the artifact.** The 4B judge over-flagged zero's snark both directions — it called the model naming itself "a false premise," and flagged "the record is full of shit… not the beacon" as a break on a provenance probe the character had actually *corrected*. Eval evidence needs a judge strong enough to trust — or a human pass — before a manifest's break rate means much.

Earlier findings stand: the 8B foreign character ran at conversational speed at ~4.3 GB 4-bit, and fed a completed save's digest it stayed bounded — treating the report as something the wire carried and declining to invent the crew. Stock LoRA never reaches embeddings or the output head, where a voice's characteristic vocabulary lives; the published recipe trains them fully.

## What stands between this and a real voice

1. **Corpus generation at scale.** Thousands of multi-turn dialogues inside a world-bible — including adversarial pressure and provenance corrections — written by a teacher model and filtered by a fidelity judge. The templated corpus is the smoke test, not the corpus.
2. **A training step that reaches the output head.** Embeddings and LM head trained (fully or at high rank) beside the adapters; pure-LoRA produced vocabulary bias without grammatical control.
3. **A longer eval.** Single-turn probes and 3–4-turn scenarios now exist and both pass too easily to separate personas from training. The discriminating version holds pressure across dozens of turns at conversation volume — the horizon where the published numbers say prompting decays.
4. **Optional RL hardening.** The published pipeline cut its break rate from 22.8% to 2.8% this way; worth adding once SFT quality matters.

## The honesty contract

Everything a voice says is authored-class fiction: it does not demonstrate a mind, it cannot award outcomes, and it is labeled generated wherever it appears. The engine decides what happened; the voice only ever describes a world it genuinely inhabits. A creature's own self-description remains [a program output to inspect](game-design.md#a-world-seen-from-three-places), not a consciousness claim — the voice changes nothing about that rule.

## Open questions

- Does one shared base plus adapters preserve enough per-species depth, or does a civilization's character need its own base fine-tune?
- Who writes the world-bible when the contacted world is itself authored fiction? The implemented answer so far: the digest supplies the checked half; the chapter author supplies the `keeper_world` half, marked as fiction.
- Where does a generated voice belong in shipped fiction — only at contact moments, or as an inspectable artifact the player can interrogate between expeditions?
