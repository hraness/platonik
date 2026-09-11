# Platonik

Platonik is a game concept about making creatures with your AI, helping them survive, and discovering what else they can do. Players would describe a wish in chat; an external agent would turn it into a small program, run it in a deterministic Rust world, and help improve it. Deeper play leads to collective behavior and independently checked competition.

This repository currently implements the **marketing and documentation website** for [platonik.space](https://platonik.space), using Next.js on Vercel. The game engine, CLI, skills, and hosted leaderboard are not implemented. Gameplay conversations and creatures on the site are explicitly illustrative.

## Explore the design

Begin with the [game design](docs/game-design.md): grow a colony that carries sparks to a beacon, help it recover when a route collapses, and take a favorite descendant into an unfamiliar habitat. The proposed world then expands from cells into tissues, ecologies, and algorithm discovery. Sorting remains a later research habitat.

The [competition model](docs/competition.md) compares organisms under equal execution limits while allowing open-ended discovery effort. The [engine proposal](docs/engine.md) defines an agent-facing Rust CLI and the first playable acceptance criteria. The [research foundations](docs/research.md) connect the design to Michael Levin's minimal systems and distinguish empirical results from mathematical claims.

The growing [symbols and facts glossary](docs/symbols-and-facts.md) adds a Wittgenstein-inspired layer: compose descriptions of local situations, breed their parts, and check them against the world. Definitions remain revisable; the proposed mechanics preserve sensory limits and computation costs.

## Run the website

Use Node.js 24 and Bun 1.3.14. No credentials, database, or paid API is required to run the website locally.

```sh
bun install --frozen-lockfile
bun run dev
```

Open `http://localhost:3000`, follow **Explore the game design**, and navigate among the documentation pages. The pages render the Markdown files in `docs/` at build time; editing one of those files updates both the source document and its website projection. The separately authored home page presents the same product facts in a shorter form.

The website loads its reading font locally and has no analytics, account system, forms, or model calls. Following source links leaves the site.

## Validate and deploy

```sh
bun run check
```

The gate checks document registration, relative links, proposal labels, and public identity; generates Next.js route types; runs TypeScript; and builds all routes. Browser review covers the home page, documentation navigation, tables and code on narrow screens, keyboard access, and missing pages. These checks validate the website, not the proposed game engine.

Vercel detects the Next.js application at the repository root. `vercel.json` supplies the locked install and full build gate. Use the Hraness `platonik` project and `platonik.space` domain; `.vercel/` and local environment files are ignored. GitHub runs the same source gate for pull requests and main.

Contribution and delivery rules are in [CONTRIBUTING.md](CONTRIBUTING.md). Original repository material is [MIT licensed](LICENSE); linked research and other games retain their own rights. Newsreader is distributed by Fontsource under the SIL Open Font License.
