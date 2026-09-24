# Contributing to Platonik

Platonik implements a Next.js website, bounded browser experiments, and a Rust shared-habitat validation prototype. The complete game remains a proposal. Begin with the [design](docs/game-design.md) and the [first playable acceptance criteria](docs/engine.md#first-playable-acceptance). A proposal should explain which player decision or observable experiment it improves.

Use Node.js 24, Bun 1.3.14, and the pinned Rust 1.97.1 toolchain. Install with `bun install --frozen-lockfile`, run the site with `bun run dev`, and validate with `bun run check`. Use a branch and pull request after the initial repository bootstrap: open it, enable auto-merge, and CI decides — the `Required` check must pass, and nobody is asked for a review. UI changes need a desktop/mobile and keyboard pass by the author; deployments need a readback of the public domain and changed routes.

Follow the [Hraness documentation guidelines](https://github.com/hraness/.github/blob/main/DOCUMENTATION_GUIDELINES.md), [README guidelines](https://github.com/hraness/.github/blob/main/README_GUIDELINES.md), and [writing style](https://github.com/hraness/.github/blob/main/STYLE.md). Label fictional examples and proposed capabilities. Cite sources for reported research and keep benchmark results distinct from general claims.

Edit documentation content in `docs/`; the site renders those files. Keep the separately authored home page consistent with product facts and status. Engine work must preserve meaningful interpreter and independent-checker tests, the locked toolchain, and the aggregate gate. Update the executable walkthrough and regenerate public bridge receipts after reviewed behavior changes; those records are checked byte for byte in CI.

Contributions to original repository material are under the [MIT license](LICENSE). Check upstream licenses and preserve required notices before adapting code or assets. Do not include private data or copied research papers.
