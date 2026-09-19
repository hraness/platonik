# Platonik

Platonik is an automation game you play with your AI agent. You describe an ambition; the agent changes a checked local Rust world; the browser lets you follow its creatures, supplies, construction, and consequences. The core loop is **wish → build → watch → notice → improve**.

This repository implements the first **living-world protocol**, agent-facing CLI, browser renderer, immutable event history, and portable play skill. A world carries programs, cargo, memory, construction, source stock, beacon charge, facility buffers, and cumulative work across bounded advances. The Dustlight homestead has two light routes, three material deposits, a fabricator that mints unique parts from material and sparks, a drill that passively extracts a deposit into a fetchable buffer, a storehouse, two foundry blueprints, and admitted construction sites that creatures physically supply before they come online. Deeper recipe trees, more facility kinds, larger maps, and the complete Long Trail remain future engine work. The older observatory, generated challenges, hosted seasons, expeditions, and bounded journeys remain available as engineering evidence rather than parallel foreground games.

## Open the world

Open [platonik.space/play](https://platonik.space/play) to watch Dustlight. The browser recomputes and renders the world, but does not edit or advance it. Give your agent [the play skill](skills/platonik-play/SKILL.md); it preserves the local JSON save, applies bounded commands, and returns a content-addressed `/play/w/<world-hash>?world=…` view. No account or install is required to inspect a view. Changing the world uses the local Rust CLI through your own agent.

```sh
cargo build --release --locked -p platonik-cli
./target/release/platonik world new Dustlight > dustlight-r0.world.json
./target/release/platonik world report dustlight-r0.world.json
printf '%s' '{"kind":"advance","ticks":32}' \
  | ./target/release/platonik world act dustlight-r0.world.json - > dustlight-r1.world.json
./target/release/platonik world link dustlight-r1.world.json
```

Use a new output file for every action; shell redirection can truncate an input before the CLI reads it.

The CLI also embeds [Algal](https://github.com/hraness/algal) as an optional planner boundary. `world propose` gives one bounded Algal organism a compact, read-only world view; `world accept` replays its receipt, checks that the full view still matches, and sends the proposed command through ordinary Platonik admission. Scripted responses keep this path deterministic and offline:

```sh
printf '%s' '{"planner":{"kind":"advance","ticks":16}}' > planner.responses.json
./target/release/platonik world propose dustlight-r0.world.json \
  --responses planner.responses.json > proposal.json
./target/release/platonik world accept dustlight-r0.world.json proposal.json \
  > dustlight-r1.world.json
```

Use `--host <algal.host.v1.json>` instead of `--responses` to opt into a configured generative provider. No model, provider account, or credential is required for the base game; provider keys remain at Algal's executor boundary and never enter the world history. The browser still makes no model calls.

## Explore the design

Start in [the observatory](https://platonik.space/lab), or read its [guide](docs/observatory.md). Export a specimen's JSON, ask an external agent to change it, and paste it back to compare the result. The [complexity and scale thesis](docs/complexity-and-scale.md) explains the separate work, memory, and structural costs, the proposed research comparisons, and the limits of larger worlds.

Begin with the [game design](docs/game-design.md): grow a colony that carries sparks to a beacon, help it recover when a route collapses, and take a favorite descendant into an unfamiliar habitat. The proposed world then expands from cells into tissues, ecologies, and algorithm discovery. Sorting remains a later research habitat.

The proposed campaign, [The Long Trail](docs/campaign.md), follows a first companion into a traveling herd, living arks, cooperating settlements, and a civilization capable of answering a distant beacon. Its hopeful space-western tone preserves familiar creatures as the player's responsibilities change scale.

The [Autoverse path](docs/autoverse.md) connects those chapters to transport, signals, memory, programmable control, and construction. The [validation plan](docs/design-validation.md) distinguishes checked browser behaviors from the initial shared-runtime evidence and remaining full campaign, player, and large-world tests. Try the [Autoverse workbench](https://platonik.space/lab#autoverse) to change a circuit, break a connection, and check its behavior under explicit limits.

The [competition model](docs/competition.md) compares organisms under equal execution limits while allowing open-ended discovery effort. A working slice is running today: [generated challenges](docs/challenges.md) score one program on cases it never trained on, [hosted seasons](docs/seasons.md) evaluate pull-request entries against a committed salt, and the [standings board](https://platonik.space/lab/challenges) shows both. The [engine guide](docs/engine.md) describes the implemented Rust journeys and the agent-facing CLI. The [research foundations](docs/research.md) connect the design to Michael Levin's minimal systems and distinguish empirical results from mathematical claims.

The growing [symbols and facts glossary](docs/symbols-and-facts.md) adds a Wittgenstein-inspired layer: compose descriptions of local situations, breed their parts, and check them against the world. Definitions remain revisable; the proposed mechanics preserve sensory limits and computation costs.

[A voice on the wire](docs/voices.md) now joins the checked digest to a live, account-gated fiction renderer: checked reports in, labeled Qwen output out. The words cannot change an engine verdict. The same document records the model comparisons, production cost, cache, and limits of this prompted-character approach.

The [shared economy](docs/economy.md) proposes a multiplayer expedition board around local play: commission checked improvements and publish reusable discoveries. The [storage and cost decision](docs/storage.md) compares a small Convex service with SQL alternatives, plus R2 artifacts and cached public views. Credits, escrow, and hosted market services remain unimplemented.

## Inspect the archived engineering journeys

The living world is the primary game. Five earlier bounded journeys remain runnable as focused engine evidence:

| Journey | What it connects | Play | Guide |
| --- | --- | --- | --- |
| First camp | Persistent collection, ancestry, a closing route, frozen confirmation cases | [Open](https://platonik.space/play/lab?mode=expedition) | [Field expedition](docs/field-expedition.md) |
| The First Answer | Finite construction, continuing service, and a checked contact ending | [Open](https://platonik.space/play/lab?mode=journeys&case=answer) | [Bring a signal home](docs/first-answer.md) |
| Ark control | Physical input, four-bit arithmetic, retained control, and a payload decision | [Open](https://platonik.space/play/lab?mode=journeys&case=ark) | [Give home a plan](docs/ark-control.md) |
| Port commitments | Physical custody, lost replies, acknowledgment, service, and finite spares | [Open](https://platonik.space/play/lab?mode=journeys&case=ports) | [Keep a promise](docs/port-commitments.md) |
| Bloom exchange | Bounded variation, physical selection, a request, delivery, and acknowledgment | [Open](https://platonik.space/play/lab?mode=journeys&case=exchange) | [Run the one-lane exchange](docs/composition-v5-gate.md) |

They share the deterministic interpreter, checker, cost model, and replay discipline. They do not yet share one continuous campaign progression: finishing one does not unlock the next, the field expedition's trials start separate declared worlds, and moving arks and independent settlements remain proposals.

## Run the Rust experiment

Use Rust 1.97.1, pinned in `rust-toolchain.toml`. No hosted service is required.

```sh
cargo build --release --locked -p platonik-cli
./target/release/platonik --help
./target/release/platonik examples
```

Follow the [complete walkthrough](docs/rust-bridge.md) to export a parent, edit a child, run both, and verify the receipts. Give an external agent [skills/platonik-play/SKILL.md](skills/platonik-play/SKILL.md) for a bounded comparison workflow. The experiment commands write results to stdout; use new filenames for shell redirection. For a saved adventure, follow [the field expedition walkthrough](docs/field-expedition.md): initialize a new save, try a crossing, grow a child while preserving its parent, and compare the outcomes. Expedition commands write an append-only local journal; they do not advance a world while paused. The complete campaign remains a proposal.

Read [the agent evaluation](docs/agent-evaluation.md) for the two completed expeditions, all candidate and transfer results, recovery probes, and measured replay costs. Both archives are committed and rechecked by the aggregate gate. For physical continuity, follow the [save-and-resume guide](docs/continuous-habitat.md) and inspect the [recorded habitat](https://platonik.space/lab/habitat).

The [navigation diagnostic](docs/navigation-evaluation.md) keeps two failed reopening journeys unchanged and tests courier-only repairs, simpler baselines, and a frozen timing-and-bearing neighborhood. Compare the original and selected programs in the [navigation replay](https://platonik.space/lab/navigation). Complete compressed receipts preserve failed attempts while reducing stored duplication.

The [construction diagnostic](docs/construction-evaluation.md) adds finite material, paid byte copying, inactive wiring, and next-tick child execution in v3. A prescribed keeper must help the inherited crew in the same saved world. Inspect its assembly and service in the [construction replay](https://platonik.space/lab/construction); the diagnostic also compares prebuilt and simpler keepers.

For a short adventure with a local ending, [bring a signal home](docs/first-answer.md). **The First Answer** combines the familiar courier, two constructed crew members, continuing service, and a returned report traced to the final delivered spark. The [recorded journey](https://platonik.space/lab/answer) reveals checked milestones and the authored ending. It is one construction-to-contact adventure; the complete six-chapter campaign remains a proposal.

Next, [give home a plan](docs/ark-control.md). The [ark control replay](https://platonik.space/lab/ark) connects a physically carried number to four-bit addition with a five-bit result, a selectable service plan, and the familiar Keeper's memory. One computed bit decides where a separate payload goes after contact ends. Read the [arithmetic and control evaluation](docs/ark-evaluation.md) for complete input coverage, frozen agent comparisons, saved replay, and measured costs. This is one calculation inside a fixed habitat; a moving ark and repeated computation remain later work.

The [port commitments](https://platonik.space/lab/ports) connect two finite courier handoffs to separately checked acknowledgments and beacon service. The [guide](docs/port-commitments.md) covers lost replies and saved restoration; the [evaluation](docs/ports-evaluation.md) retains candidate comparisons, failures, and costs. The [Bloom](https://platonik.space/lab/bloom) now adds a bounded v4 variation: two builders edit copies of one seed, children make physical trials, and a selector earns a later confirmation from a causal report. These are finite local obligations, with repeated sessions and the complete campaign still ahead.

## Run the website

Use Node.js 24 and Bun 1.3.14. No credentials, database, or paid API is required to run the website locally.

```sh
bun install --frozen-lockfile
bun run dev
```

Open `http://localhost:3000` and follow **Enter the observatory**, or visit `/docs` for the field guide. The documentation renders the Markdown files in `docs/` at build time; editing one updates both the source document and its website projection. The separately authored homepage presents the same product facts in a shorter form.

The browser observatory has no analytics or model calls. Its controls run locally, saved specimens use bounded browser local storage, and no program text is sent to a service. Production separately exposes the opt-in, Hraness-account-gated `POST /voice` renderer; it accepts checked wire digests, keeps gateway credentials server-side, and returns labeled fiction. A local site without the server environment remains disabled at that route. Following source links leaves the site.

## Validate and deploy

```sh
bun run check
```

The aggregate gate requires Rust 1.97.1 as well as Node/Bun. It runs Rust formatting, strict Clippy, workspace tests, and an exact regeneration check of the published Rust artifacts. Its web portion checks document registration, relative links, proposal labels, and public identity; tests the bounded browser models; generates Next.js route types; runs TypeScript; and builds all routes. Browser review covers program editing and errors, parent comparisons, collection persistence, export, replay, truth controls, budget measurement/cancellation, signal assays and construction limits, mobile layout, navigation, keyboard access, and missing pages. Review the new Rust replay selector, tick controls, artifact downloads, expected failures, and loading recovery when changing that surface. Passing these checks does not validate a full campaign or player enjoyment.

Vercel detects the Next.js application at the repository root. `vercel.json` supplies the locked install and `check:web` build gate. Vercel hosts static Rust evidence and the Next.js site; it does not build or execute the Rust engine. GitHub runs the full Rust-plus-web aggregate gate before merge. Use the Hraness `platonik` project and `platonik.space` domain; `.vercel/` and local environment files are ignored. Pull requests and main both run that aggregate gate. Intentional changes to Rust evidence use `bun run bridge:record`; review their source and behavioral changes before committing regenerated JSON.

Contribution and delivery rules are in [CONTRIBUTING.md](CONTRIBUTING.md). Original repository material is [MIT licensed](LICENSE); linked research and other games retain their own rights. Newsreader is distributed by Fontsource under the SIL Open Font License.
