# Hosted seasons

Eval proposal, 16 September 2026 — with a working hosted evaluator. Season `season-0001` accepts entries by pull request on the public repository: the evaluator is a GitHub Actions workflow that runs the pinned Rust CLI with a withheld salt, commits results it can prove, and republishes the board. There are no prizes, accounts are GitHub accounts, and the standing [competition](competition.md) proposal still governs what a full ranked season would add.

A [generated challenge](challenges.md) already publishes its eval cases for inspection — honest local iteration, not blinded testing. A season is the next step: scoring cases are **withheld**, derived from a secret salt, and the evaluator runs somewhere the entrant does not control.

## How an entry works

1. Fork the repository and add exactly one file: `season/entries/<your-github-login>-<n>.json` (login lowercased, `n` starting at 1), a challenge submission in the usual shape (`schema`, `challenge`, `programs`, `agent`).
2. Open the pull request. The `Season entry` workflow reads only that file — it never checks out or executes PR code — and binds your identity: the entrant recorded is `github:<your-login>`, whatever the file claims.
3. The engine grafts your programs onto withheld cases derived from `(season salt, your name, the challenge, your entry number)` and replays them under the published limits.
4. The result — every case, every receipt — is committed at `season/results/<season>/<login>-<seq>.json`, the public board is regenerated, and the PR is closed with the score. The PR is the audit trail; the result file is the evidence.

Each entrant gets `max_entries` attempts per season (eight in `season-0001`), counted from committed results. An identical resubmission on the same challenge is neither charged nor rescored; the same program entered on a different challenge is a distinct attempt against fresh withheld cases.

## Why the salt matters

Season eval cases derive from `sha256(salt, entrant, challenge, entry)` — not the public `(generator, index)` stream. Three consequences:

- **Nobody can precompute their exam.** Your withheld worlds differ from every other entrant's and from your own previous entry's. Reading another entrant's receipts teaches you nothing about your cases.
- **The organizer is committed.** `seasons/<id>.json` publishes `commitment`, a hash of the salt record, before entries open; the evaluator cannot tune worlds to an entrant afterward without breaking the commitment.
- **Everything becomes checkable.** When the season closes, the salt is revealed into the manifest and `platonik season verify --salt` re-derives every case and re-runs every receipt for any committed result — the same recompute-not-trust rule as the rest of the engine.

Before reveal, a committed result is still honest evidence: its receipts replay independently with `platonik season verify` (no salt needed), so a forged score can't be committed. What stays unverifiable until reveal is only *that the cases came from the salt* — exactly what the commitment reserves for later.

## What the abuse controls are

- **Identity:** the entrant is the PR author's GitHub login, bound by the workflow — not a self-reported name.
- **Allowance:** `max_entries` per entrant, enforced against committed results, not claimed filenames.
- **Admission:** one new file, on the `season/entries/` path, named for you, under the input limits; everything else is closed unscored.
- **No fork execution:** the workflow never checks out the PR head; the submission is bounded data read through the API, pinned to the head SHA.
- **Approval gate:** every entry waits on the `season-eval` environment's required reviewer before the salt-bearing steps run.
- **Serialization:** entries evaluate one at a time, so ordinals and quotas can't race.
- **Protected ledger:** `main` is ruleset-protected — changes arrive by pull request and the aggregate `site` gate is required for everyone else, while the evaluator publishes through a dedicated deploy key that is the only bypass actor besides org admins.
- **Self-verification:** the workflow re-verifies the result — derivation and replay — before pushing, re-checks the board artifact afterward, and the published commit still runs the normal `site` gate on `main` as an audit.

## Commands

```text
platonik season show seasons/season-0001.json      # the committed manifest
platonik season verify seasons/season-0001.json season/results/season-0001/<login>-1.json
platonik season board seasons/season-0001.json season/results/season-0001/
```

After reveal, append `--salt <file>` to verify derivation too. Organizer-side commands (`begin`, `eval`, `admit`, `reveal`) are documented under `platonik season help`.

## What this does not establish

A hosted season is a small operated contest, not a frontier benchmark: the salt lives in a GitHub secret under one maintainer's approval, identity is a GitHub account, and per-entrant sampling means scores carry distribution noise alongside ability. Clearing entries is evidence that a harness produces working programs for worlds it could not have seen — it is not a general intelligence score. The withheld cases here are the crossing family only; [competition](competition.md) remains the spec for richer families, organism bundles, and prize-bearing rounds.
