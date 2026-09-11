# Contributing to Platonik

Platonik currently implements a Next.js marketing/documentation website. The game is a proposal. Begin with the [design](docs/game-design.md) and the [first playable acceptance criteria](docs/engine.md#first-playable-acceptance). A proposal should explain which player decision or observable experiment it improves.

Use Node.js 24 and Bun 1.3.14. Install with `bun install --frozen-lockfile`, run the site with `bun run dev`, and validate with `bun run check`. Use a branch and pull request after the initial repository bootstrap. Obtain independent review and pass the source gate and applicable GitHub checks before merging. UI changes need desktop/mobile and keyboard review; deployments need a readback of the public domain and changed routes.

Follow the [Hraness documentation guidelines](https://github.com/hraness/.github/blob/main/DOCUMENTATION_GUIDELINES.md), [README guidelines](https://github.com/hraness/.github/blob/main/README_GUIDELINES.md), and [writing style](https://github.com/hraness/.github/blob/main/STYLE.md). Label fictional examples and proposed capabilities. Cite sources for reported research and keep benchmark results distinct from general claims.

Edit documentation content in `docs/`; the site renders those files. Keep the separately authored home page consistent with product facts and status. Engine work must introduce the actual Rust validation commands and a reproducible end-to-end example before documenting playable commands.

Contributions to original repository material are under the [MIT license](LICENSE). Check upstream licenses and preserve required notices before adapting code or assets. Do not include private data or copied research papers.
