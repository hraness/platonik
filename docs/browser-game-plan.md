# Browser-playable Platonik plan

Colf.dev shows a compelling shape: one page, one prompt/code box, instant scoring, and a leaderboard. Platonik today is high-friction by comparison: the Rust engine and generated challenges exist, but participation is either local CLI setup or a GitHub pull request into a hosted season. This plan turns the existing deterministic Rust engine into a browser-playable game, keeping the engine authoritative and adding useful visualizations.

## What already exists

- `platonik-core`: deterministic experiment engine with per-tick frames, costs, verification, generated challenges, and challenge seasons.
- `platonik-cli`: local Rust CLI for expeditions, habitats, challenges, seasons, and verification.
- `/lab/*`: read-only React viewers for recorded Rust results.
- `/voice`: Hraness-account-gated model endpoint for labeled fiction; not required for play.
- `seasons`: hosted evaluator driven by GitHub Actions and pull requests.

## Goal

A visitor can open `platonik.space/play`, interact with the game immediately, understand what is happening, and iterate without installing anything. Auth and persistence start optional; the season path can remain a higher-stakes hosted track.

## Architecture

1. **WASM engine**: compile `platonik-core` to `wasm32-unknown-unknown` and expose a small JavaScript API.
2. **Browser state**: one experiment/challenge loaded from the engine, a program editor, a run button, and per-tick replay.
3. **Visualization**: SVG grid animation driven by the receipt frames, plus overlays for signals, deliveries, blocked edges, and work spend.
4. **Persistence**: start with `localStorage`/`IndexedDB` for saves and progress; later optionally sync to a Hraness account.
5. **Agent integration**: reuse the existing `/voice` route or a cheaper direct model call so a player can ask the agent to change the program.
6. **Season bridge**: optionally submit a result from the browser into the existing season workflow.

## Phases

### Phase 0 — WASM engine proof and one tutorial level

- Make `platonik-core` compile for `wasm32-unknown-unknown`.
- Add a `crates/platonik-wasm` crate with `wasm-bindgen` exports:
  - `tutorial_experiment(id: &str) -> String`
  - `run_experiment(experiment_json: &str) -> String`
  - `evaluate_challenge(index: u32, submission_json: &str) -> String`
- Build the WASM artifact as part of the web build and place it where Next.js can import it.
- Create `/play` with a single fixed level (`opening-normal`), a JSON program editor, a Run button, pass/fail/work output, and a basic SVG replay of the grid.

### Phase 1 — challenge loop

- Load any of the 96 generated challenges (`challenge-0001` to `challenge-0096`).
- Show the public training cases and let the player edit the editable cell(s).
- Run all training cases in-browser and display per-case results.
- Add a simple selector for family/crossing, switchboard, foundry.

### Phase 2 — agent-driven editing

- Add a prompt box on `/play`.
- For authenticated users, call the existing `/voice` endpoint to turn a wish into a proposed program.
- For unauthenticated or cheaper use, include a small local prompt-to-program example using a rules schema and lightweight heuristics, clearly marked as a helper.

### Phase 3 — persistence and identity

- Browser-local saves for edited programs, challenge progress, and simple expeditions.
- Optional Hraness-account sign-in for cross-device saves and season submissions.
- Migrate season entry creation from manual PR to a web form that still uses the existing audited evaluator.

### Phase 4 — richer journeys

- Port the continuous-habitat and expedition flows to the browser with local saves.
- Add more visualization modes: signal propagation, construction stages, bloom variation, port handoffs.

## Open questions to resolve by spiking

1. Does `platonik-core` compile to `wasm32-unknown-unknown` out of the box, or do `AtomicU64` / `std::sync::atomic` or other APIs need adjustment?
2. What is the cleanest way to load a WASM module in Next.js 16 without bloating the bundle for non-play pages?
3. Is the WASM artifact size acceptable for a first load, or should it be lazy-loaded?
4. How much of the existing `/lab` SVG/view components can be reused for the live replay?
5. Should programs be edited as JSON, as a visual block editor, or both?
6. What is the cost and latency of using `/voice` per edit vs. a client-side heuristic vs. a direct cheap model call?

## Spikes to run now

- Compile `platonik-core` for `wasm32-unknown-unknown`.
- Build a tiny `wasm-bindgen` wrapper and load it in a throwaway Next.js page.
- Render one receipt frame as SVG using the existing lab components as reference.
- Time how long `run_experiment` takes in WASM for the tutorial case.

## Risks and mitigations

- **WASM size**: lazy-load `/play` and its WASM separately from marketing pages.
- **Engine changes for WASM**: keep changes minimal and behind feature flags; the native CLI must remain the authoritative evaluator.
- **Persistence abuse**: local-only at first; no server state means no abuse surface.
- **Season integrity**: browser submissions still flow through the existing PR-based, salt-bearing evaluator; the browser does not score its own reserved cases.

## Success criteria

A new visitor can land on `/play`, press Run on the tutorial, see the creature move, and understand whether the mission succeeded — all without reading docs or installing Rust. Subsequent iterations add challenge selection, persistence, and agent help.
