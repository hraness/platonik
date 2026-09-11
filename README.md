# Platonik

Platonik is a game concept about making creatures with your AI, helping them survive, and discovering what else they can do. Players would describe a wish in chat; an external agent would turn it into a small program, run it in a deterministic Rust world, and help improve it. Deeper play leads to collective behavior and independently checked competition.

This repository implements the **website and browser observatory** for [platonik.space](https://platonik.space), using Next.js on Vercel. The observatory has three bounded local experiments: editable courier programs with collectible structural portraits, coupled fuzzy-truth systems, and a world-cost calculator with an optional browser benchmark. The Rust game engine, CLI, skills, and hosted leaderboard are not implemented. Campaign scenes remain illustrative; observatory traces come from its separate TypeScript models.

## Explore the design

Start in [the observatory](https://platonik.space/lab), or read its [guide](docs/observatory.md). Export a specimen's JSON, ask an external agent to change it, and paste it back to compare the result. The [complexity and scale thesis](docs/complexity-and-scale.md) explains the separate work, memory, and structural costs, the proposed research comparisons, and the limits on larger worlds.

Begin with the [game design](docs/game-design.md): grow a colony that carries sparks to a beacon, help it recover when a route collapses, and take a favorite descendant into an unfamiliar habitat. The proposed world then expands from cells into tissues, ecologies, and algorithm discovery. Sorting remains a later research habitat.

The proposed campaign, [The Long Trail](docs/campaign.md), follows a first companion into a traveling herd, living arks, cooperating settlements, and a civilization capable of answering a distant beacon. Its hopeful space-western tone preserves familiar creatures as the player's responsibilities change scale.

The [competition model](docs/competition.md) compares organisms under equal execution limits while allowing open-ended discovery effort. The [engine proposal](docs/engine.md) defines an agent-facing Rust CLI and the first playable acceptance criteria. The [research foundations](docs/research.md) connect the design to Michael Levin's minimal systems and distinguish empirical results from mathematical claims.

The growing [symbols and facts glossary](docs/symbols-and-facts.md) adds a Wittgenstein-inspired layer: compose descriptions of local situations, breed their parts, and check them against the world. Definitions remain revisable; the proposed mechanics preserve sensory limits and computation costs.

The [shared economy](docs/economy.md) proposes a multiplayer expedition board around local play: commission checked improvements and publish reusable discoveries. The [storage and cost decision](docs/storage.md) compares a small Convex service with SQL alternatives, plus R2 artifacts and cached public views. Credits, escrow, and all hosted game services remain unimplemented.

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

The gate checks document registration, relative links, proposal labels, and public identity; tests the bounded browser models; generates Next.js route types; runs TypeScript; and builds all routes. Browser review covers program editing and errors, parent comparisons, collection persistence, export, replay, truth controls, budget measurement/cancellation, mobile layout, navigation, keyboard access, and missing pages. These checks validate the website and its laboratory models, not the proposed Rust game engine.

Vercel detects the Next.js application at the repository root. `vercel.json` supplies the locked install and full build gate. Use the Hraness `platonik` project and `platonik.space` domain; `.vercel/` and local environment files are ignored. GitHub runs the same source gate for pull requests and main.

Contribution and delivery rules are in [CONTRIBUTING.md](CONTRIBUTING.md). Original repository material is [MIT licensed](LICENSE); linked research and other games retain their own rights. Newsreader is distributed by Fontsource under the SIL Open Font License.
