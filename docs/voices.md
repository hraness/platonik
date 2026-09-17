# A voice on the wire

Exploration proposal, 16 September 2026. A local spike ran the serving seam described here against a checked First Answer save. Production voices remain unbuilt; nothing on this page changes what the engine checks or who checks it.

The First Answer's reply cell [does not generate language or demonstrate a mind](first-answer.md), and authored dialogue [never changes a verdict](autoverse.md#victory-replay-and-scale). The creatures themselves [must stay inspectable programs](engine.md#the-agent-runs-the-laboratory) — an organism that only works while a scientist whispers to it is not an organism. This page proposes who could speak anyway, and what a first experiment established.

## A mind you cannot inspect

The asymmetry is the opportunity. Your own creatures are transparent: their policies are readable, their traces replayable, and pretending otherwise would break the honesty contract. The Far Beacon is the opposite situation — it is *someone else's* world, and an opaque mind on the far end of a wire is not a shortcut but the honest shape of contact. You can inspect your creatures; you can only *interrogate* the other civilization.

A bounded character model — a small language model fine-tuned so that a single world is the whole of its knowledge — fits that role precisely. Where a prompted chatbot leaks its assistant training under pressure, a trained-in character does not: the published [Zero model card and training report](https://huggingface.co/movingcastles/zero) (Moving Castles, September 2026) reports hard character breaks falling from 45.4% for a system-prompted sibling instruct model to 2.8% after post-training the character directly into `Qwen3-8B-Base` — LoRA SFT on 5,932 synthetic conversations (73,765 character turns) with fully trained embeddings and output head, then GRPO with a character-fidelity judge. Its knowledge boundary is a platonik-shaped idea already: a world with a manifest, a horizon, and nothing outside it.

## The seam

`habitat journey`, `habitat ark`, and `habitat ports` emit read-only, freshly checked report projections — the same envelopes this website renders. A voice consumes that digest and emits fiction. Its words never re-enter the engine; if the contacted mind wants something, that want reaches the world only through the ordinary declared program path, under declared budgets. Generated dialogue inherits the authored-dialogue rule unchanged: it never alters a checked result.

## What the spike established

Measured locally, 16 September 2026, on the spike artifacts (not part of this repository):

- [`movingcastles/zero`](https://huggingface.co/movingcastles/zero) — an 8B character model fine-tuned as one bounded inhabitant, "a man in a white plastic box" — ran at 4-bit quantization (~4.3 GB) on a laptop at conversational speed. Its repository declares no license; the proposal below retrains the recipe rather than redistributing the weights.
- Fed the checked journey report of a completed First Answer save (phase `answered`, spark 6 returned at tick 109), it answered in character and stayed bounded: it treated the report as something the wire carried and declined to invent the crew. That is the property a contact voice needs — a character that knows what its world contains and does not decorate the rest.
- A hand-seeded 361-conversation corpus trained a ~30–66 MB LoRA adapter on a 4B instruct base. The artifact works mechanically — it loads, applies, and measurably shifts toward the corpus (supervised loss 5.4 → 2.0 on a held example) — but does not carry a coherent voice at this scale; generation stayed fragmentary.

The negative half is the informative half: voice quality is corpus-bound, not plumbing-bound. Stock LoRA adapters also never reach a model's embeddings and output head — where a voice's characteristic vocabulary actually lives — which the published recipe trains fully.

## The proposed architecture

```text
voice = shared voice base + species adapter + wire digest
```

- **Shared voice base** — one weight set (~4 GB quantized), trained once with the full recipe: a corpus spanning many world-bibles, embeddings and output head trained alongside adapters, then judge-hardened. It carries the generic skill: read what the wire carried, answer as the world's keeper, never assist, never leak outside knowledge.
- **Species adapter** — ~30–70 MB per contacted civilization, a hashed immutable artifact. Persona and world-knowledge live here; break-resistance is inherited from the base. A species becomes a named, versioned object — `voice:far-beacon@sha256:…` — under the same provenance discipline as experiments and results.
- **Wire digest** — the checked report projection at runtime, costing zero weights. The voice may cite it; it cannot extend it.

## What stands between this and a real voice

1. **Corpus generation at scale.** Thousands of multi-turn dialogues inside a world-bible — including adversarial pressure and provenance corrections — written by a teacher model and filtered by a fidelity judge. The spike's templated paraphrase corpus is the smoke test, not the corpus.
2. **A training step that reaches the output head.** Embeddings and LM head trained (fully or at high rank) beside the adapters; pure-LoRA produced vocabulary bias without grammatical control in the spike.
3. **Optional RL hardening.** The published pipeline cut its break rate from 22.8% to 2.8% this way; worth adding once SFT quality matters.
4. **An eval in this repository's style.** Held-out multi-turn conversations scored for hard breaks, plus a provenance check native to Platonik: does the voice claim the beacon spoke when the record says the reply cell did?

## The honesty contract

Everything a voice says is authored-class fiction: it does not demonstrate a mind, it cannot award outcomes, and it is labeled generated wherever it appears. The engine decides what happened; the voice only ever describes a world it genuinely inhabits. A creature's own self-description remains [a program output to inspect](game-design.md#a-world-seen-from-three-places), not a consciousness claim — the voice changes nothing about that rule.

## Open questions

- Does one shared base plus adapters preserve enough per-species depth, or does a civilization's character need its own base fine-tune?
- Who writes the world-bible when the contacted world is itself authored fiction? One answer: the chapter author writes the bible; the checked report supplies the player's half of the record.
- Where does a generated voice belong in shipped fiction — only at contact moments, or as an inspectable artifact the player can interrogate between expeditions?
