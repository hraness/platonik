# Browser-playable Platonik plan

Colf.dev shows a compelling shape: one page, one prompt/code box, instant scoring, and a leaderboard. Platonik today is high-friction by comparison: the Rust engine and generated challenges exist, but participation is either local CLI setup or a GitHub pull request into a hosted season. This plan turns the existing deterministic Rust engine into a browser-playable game, keeping the engine authoritative and adding useful visualizations.

## What already exists

- `platonik-core`: deterministic experiment engine. Everything needed for play is already a pure function: sim + receipts (`sim`, `check`), pause/resume checkpoints (`continuation`), the persistent field campaign (`expedition`), generated challenges (`challenge`), hosted seasons (`season`), per-journey graders (`first_answer`, `ark_control`, `port_commitments`, `bloom`, `bloom_exchange`), and fixture worlds with reference programs (`*_fixtures`).
- `platonik-cli`: local Rust CLI. Its stores (`habitat_store`, `expedition_store`, `journal`) are filesystem wrappers around pure core functions — the browser replaces the filesystem with IndexedDB and keeps the same event-sourced semantics.
- `platonik-wasm` + `/play`: spike proves the engine compiles to `wasm32-unknown-unknown`, loads in Next.js via a Turbopack alias, runs an experiment, and replays frames through `RecordedHabitat`.
- `/lab/*`: read-only React viewers for recorded Rust results (`RecordedHabitat`, `RecordedJourney`, `RecordedArk`, `RecordedPorts`, `RecordedBloom`, `ContinuityLab`, `BridgeLab`).
- `/voice`: Hraness-account-gated model endpoint for labeled fiction; not required for play.
- `seasons`: hosted evaluator driven by GitHub Actions and pull requests.

## Architecture decision: the game runs entirely client-side

Every game action — running an experiment, grading a journey, advancing a continuous habitat, planning/completing an expedition command, scoring a challenge submission — is a pure function in `platonik-core`. There is no game server. The hosted site serves the WASM bundle and the UI; the browser is the console. Servers enter only for optional sync, sharing, and the audited season track.

Consequences:

- The browser game is fully playable offline after first load.
- Self-scored results are honest local evidence; ranked results still flow through the salt-bearing season evaluator (a browser result can seed a season entry but never scores its own withheld cases).
- The campaign save is the expedition journal + habitat checkpoints, event-sourced exactly like the CLI stores, persisted to IndexedDB instead of files.
- Abuse surface is minimal: the engine enforces its own bounds (128 ticks, fuel, program size) regardless of client.

## Game structure

One surface — `/play` — with a mission map. Each mission is a world + a goal + an editable program. Completing missions unlocks the next track. All missions reuse the same loop: **see the world → edit or ask an agent for a program → run → watch the replay → read the verdict → iterate**.

### Track 0 — Opening (tutorial)

The existing spike, polished: `opening-normal` with three starter programs and a live grid. Teaches source → depot → beacon, rules, and the run/replay loop. No account, no persistence needed.

### Track 1 — Challenges (the Colf loop)

All 96 generated challenges playable in-browser:

- Pick a challenge by family (crossing 1–32, switchboard 33–64, foundry 65–96) and band.
- Brief shows the world shape and which cell(s) are editable.
- Editor holds the program; "Run" executes the public train cases in WASM and shows per-case pass/work plus a replay.
- "Score" runs `evaluate_challenge` on the reserved eval split — the result is a `ChallengeResult` the existing `verify_result` can re-check.
- Local board: best result per challenge in IndexedDB, with work totals ranked like `challenge::board`.
- Bridge: "Enter season" exports the submission JSON + instructions for the PR flow (season stays the audited track).

### Track 2 — Field expedition (the campaign)

`platonik-core::expedition` is already a campaign: a named collection, grow/trial/freeze commands, a 32-trial discovery allowance, training cases, frozen selection, one-shot transfer cases, and a `progress()` that returns the next objective and the ending text. The browser version:

- `expedition_new(name, ambition)` → campaign state (JSON in IndexedDB).
- Case map: the four training + transfer case IDs with per-case status.
- Pick case + courier + controller → `expedition_plan` → run the returned experiment in WASM → `expedition_complete`/`expedition_apply` → state advances.
- Grow screen: derive a child program from a parent (edit JSON), `expedition_plan` validates and admits it.
- Ending: `progress()` drives the mission log; `field_expedition_complete` shows the first-camp reply.

### Track 3 — Continuous habitat + journeys

`continuation::start_until`/`resume_until` give pause/resume of one immutable world; journey graders turn receipts into milestone reports:

- **First Answer**: build, keep lights on, contact — `first_answer::grade_receipt` produces phase/milestones and the answer text only when earned.
- **Ark control**: route a 4-bit addition to a service plan — `ark_control::grade_receipt`.
- **Port commitments**: request → custody → acknowledgment → service — `port_commitments::grade_receipt`.
- **Bloom**: bounded program edits, birth, selection — `bloom::grade_receipt`; exchange cases via `bloom_exchange::grade_receipt`.
- Habitat screen shows the current world frame, tick/horizon, remaining fuel, an Advance-to-tick control (max 8 advances like `habitat_store`), and the milestone rail.

## The WASM surface to add

Beyond the existing five exports:

- `list_journeys()` / `journey_cases(journey)` — fixture catalog for every track.
- `journey_experiment(journey, case_id)` — the world to edit and run.
- `grade_receipt(journey, receipt_json)` — dispatch to the right journey grader.
- `habitat_start(experiment_json, until)` / `habitat_resume(checkpoint_json, until)` — `start_until`/`resume_until`.
- `expedition_new(name, ambition)`, `expedition_cases()`, `expedition_plan(state, command)`, `expedition_complete(state, receipt)`, `expedition_apply(state, event)`, `expedition_progress(state)`.
- `challenge_info(index)` — id/family/band/editable cells/case count without the full case payload (for the picker).
- `verify_receipt(receipt_json)` — independent re-check for the UI's "verified" badge.

All JSON-in/JSON-out, all fallible, all bounded by the engine's own limits.

## Frontend architecture

- `app/play/page.tsx` — game shell; the only route that lazy-loads the WASM bundle.
- `components/play/` — game UI split from the spike's single file:
  - `play-viewer.tsx` → mission shell (briefing, editor, stage, verdict).
  - `mission-map.tsx` → track/mission picker with completion state.
  - `replay-stage.tsx` → animated SVG playback: play/pause/step/scrub/speed, built on `RecordedHabitat` + journey-specific overlays (`RecordedArk`, `RecordedPorts`, `RecordedBloom`).
  - `program-editor.tsx` → JSON editor with parse diagnostics, starter-program presets, and an agent panel.
  - `agent-panel.tsx` → "Describe the behavior" → copies a ready-made prompt (world summary + rules schema + goal) for the player's own agent, accepts pasted JSON back; signed-in users can call `/voice` in place.
  - `verdict-panel.tsx` → pass/fail, work, milestones, receipts, verified badge.
- `lib/play/` — engine client (`engine.ts` wrapping the WASM calls with typed errors), save store (`saves.ts` over IndexedDB with localStorage fallback), progression (`progress.ts`), submission export.
- `lib/bridge/types.ts` already defines `Receipt`/`Frame`; extend the local display types only where the live game needs fields the lab never rendered.

## Persistence model

- `localStorage`: UI prefs, last-open mission.
- `IndexedDB` (`platonik-saves`): one record per expedition campaign (journal events), one per habitat checkpoint chain, challenge results keyed by challenge id. All writes are event-sourced appends; recovery replays the journal — same semantics as `journal.rs`, browser-side.
- Export/import: download a save bundle (`platonik-habitat-bundle-v1` / expedition journal) compatible with `platonik habitat import` / `platonik expedition import` so local CLI and browser stay interchangeable.

## Agent integration ("tell your agent to set up Platonik")

Two paths, both first-class:

1. **Bring-your-own agent** (default, free): every mission has an "Ask your agent" panel that copies a complete prompt — the world's JSON, the program schema, the goal, and the editable cell — and accepts the pasted program back. This is the Colf-style loop without requiring a Hraness account.
2. **Hosted assist**: signed-in users (existing suite-auth) can send the same digest to `/voice` for a proposed program. Rate-limited, cost-bounded, clearly labeled.

The README/docs get a one-line setup path: `tell your agent to set up platonik` → agent runs the documented CLI flow for local play, or just opens `/play` for hosted play.

## Open questions resolved by spikes below

1. Does every needed core function compile under `wasm32`? (expedition/continuation/graders are pure serde + engine — expected yes; spike confirms.)
2. Is `evaluate_challenge` (4–8 eval runs) fast enough in-browser to feel instant?
3. What's the per-frame render cost for `RecordedHabitat` at 60fps playback, and do we need to throttle?
4. Do the journey graders' outputs map onto the existing `Recorded*` components, or do we need live variants?
5. Can a save bundle round-trip browser ↔ CLI (`habitat import`/`expedition import`)?

## Phases

- **Phase 0 (done)**: WASM spike — engine compiles, `/play` runs and replays one experiment.
- **Phase 1**: full WASM surface + challenge loop + IndexedDB saves + polished replay. This is the minimum "full game": tutorial + 96 challenges + expedition campaign.
- **Phase 2**: continuous habitat + all four journey graders + milestone UI.
- **Phase 3**: agent panel (BYOA + `/voice`), submission export to season, save bundle interchange with the CLI.
- **Phase 4 (later, separate decision)**: hosted leaderboard/share API, account sync. The season PR flow stays the ranked path until then.

## Risks and mitigations

- **WASM size** (~1.1 MB today): lazy-load only on `/play`; consider `wasm-opt -Oz` later.
- **Engine changes for WASM**: none expected — all target functions are already pure. If something pulls in `std::fs`, feature-gate it; the native CLI remains authoritative.
- **Self-scored challenges**: UI always labels browser scores as local; ranked claims require the season evaluator.
- **Determinism drift**: `verify_receipt` in-browser plus the CLI's `verify` on export keep both paths honest.
- **Save corruption**: event-sourced journals + schema tags; a bad event fails apply, never silently rewrites state.

## Success criteria

A new visitor opens `/play`, runs the opening, watches the courier move, understands the verdict — no docs, no install. They can pick a challenge, paste or write a program, score it, and see their rank locally. They can start a field expedition, grow a courier, and reach the first-camp ending — all client-side, all replayable, all exportable to the CLI.
