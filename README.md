# Platonik

Platonik is an engineering game in development about making creatures with your AI, helping them survive, and discovering what else they can do. In the local prototype, you describe a wish in chat; an external agent edits a small program, runs it in a deterministic Rust world, and helps improve it. Deeper play leads to collective behavior and independently checked competition.

This repository implements the **website and browser observatory** for [platonik.space](https://platonik.space), using Next.js on Vercel. The observatory has four bounded local experiments: editable courier programs with collectible structural portraits, coupled fuzzy-truth systems, a world-cost calculator, and a signal workbench for circuits and budgeted blueprint assembly. It also implements a **bounded Rust habitat prototype**, a real agent-facing CLI, immutable checked receipts, and a portable play skill. Its [recorded bridge](https://platonik.space/lab/bridge) connects physical delivery, signals, memory, and service routing. The [field expedition](docs/field-expedition.md) adds a persistent collection, checked local saves, scheduled route closure, and frozen transfer trials. The [continuous habitat](docs/continuous-habitat.md) carries cargo, memory, queued reports, service charge, and cumulative work across checked pauses and restoration. The complete campaign, in-world breeding, and hosted leaderboard remain unimplemented. Older observatory traces come from their separate TypeScript models.

## Explore the design

Start in [the observatory](https://platonik.space/lab), or read its [guide](docs/observatory.md). Export a specimen's JSON, ask an external agent to change it, and paste it back to compare the result. The [complexity and scale thesis](docs/complexity-and-scale.md) explains the separate work, memory, and structural costs, the proposed research comparisons, and the limits on larger worlds.

Begin with the [game design](docs/game-design.md): grow a colony that carries sparks to a beacon, help it recover when a route collapses, and take a favorite descendant into an unfamiliar habitat. The proposed world then expands from cells into tissues, ecologies, and algorithm discovery. Sorting remains a later research habitat.

The proposed campaign, [The Long Trail](docs/campaign.md), follows a first companion into a traveling herd, living arks, cooperating settlements, and a civilization capable of answering a distant beacon. Its hopeful space-western tone preserves familiar creatures as the player's responsibilities change scale.

The [Autoverse path](docs/autoverse.md) connects those chapters to transport, signals, memory, programmable control, and construction. The [validation plan](docs/design-validation.md) distinguishes checked browser behaviors from the initial shared-runtime evidence and remaining full campaign, player, and large-world tests. Try the [Autoverse workbench](https://platonik.space/lab#autoverse) to change a circuit, break a connection, and check its behavior under explicit limits.

The [competition model](docs/competition.md) compares organisms under equal execution limits while allowing open-ended discovery effort. The [engine proposal](docs/engine.md) defines an agent-facing Rust CLI and the first playable acceptance criteria. The [research foundations](docs/research.md) connect the design to Michael Levin's minimal systems and distinguish empirical results from mathematical claims.

The growing [symbols and facts glossary](docs/symbols-and-facts.md) adds a Wittgenstein-inspired layer: compose descriptions of local situations, breed their parts, and check them against the world. Definitions remain revisable; the proposed mechanics preserve sensory limits and computation costs.

The [shared economy](docs/economy.md) proposes a multiplayer expedition board around local play: commission checked improvements and publish reusable discoveries. The [storage and cost decision](docs/storage.md) compares a small Convex service with SQL alternatives, plus R2 artifacts and cached public views. Credits, escrow, and all hosted game services remain unimplemented.

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

## Run the website

Use Node.js 24 and Bun 1.3.14. No credentials, database, or paid API is required to run the website locally.

```sh
bun install --frozen-lockfile
bun run dev
```

Open `http://localhost:3000` and follow **Enter the observatory**, or visit `/docs` for the field guide. The documentation renders the Markdown files in `docs/` at build time; editing one updates both the source document and its website projection. The separately authored homepage presents the same product facts in a shorter form.

The website loads its reading font locally and has no analytics, account system, or model calls. Observatory controls run locally; saved specimens use bounded browser local storage. No program text is sent to a service. Following source links leaves the site.

## Validate and deploy

```sh
bun run check
```

The aggregate gate requires Rust 1.97.1 as well as Node/Bun. It runs Rust formatting, strict Clippy, workspace tests, and an exact regeneration check of the published Rust artifacts. Its web portion checks document registration, relative links, proposal labels, and public identity; tests the bounded browser models; generates Next.js route types; runs TypeScript; and builds all routes. Browser review covers program editing and errors, parent comparisons, collection persistence, export, replay, truth controls, budget measurement/cancellation, signal assays and construction limits, mobile layout, navigation, keyboard access, and missing pages. Review the new Rust replay selector, tick controls, artifact downloads, expected failures, and loading recovery when changing that surface. Passing these checks does not validate a full campaign or player enjoyment.

Vercel detects the Next.js application at the repository root. `vercel.json` supplies the locked install and `check:web` build gate. Vercel hosts static Rust evidence and the Next.js site; it does not build or execute the Rust engine. GitHub runs the full Rust-plus-web aggregate gate before merge. Use the Hraness `platonik` project and `platonik.space` domain; `.vercel/` and local environment files are ignored. Pull requests and main both run that aggregate gate. Intentional changes to Rust evidence use `bun run bridge:record`; review their source and behavioral changes before committing regenerated JSON.

Contribution and delivery rules are in [CONTRIBUTING.md](CONTRIBUTING.md). Original repository material is [MIT licensed](LICENSE); linked research and other games retain their own rights. Newsreader is distributed by Fontsource under the SIL Open Font License.
