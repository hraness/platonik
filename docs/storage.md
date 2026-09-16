# Keeping a shared world inexpensive

Architecture proposal, 11 September 2026. No game backend or storage service has been provisioned; the [hosted season evaluator](seasons.md) publishes committed static artifacts, not a live service. This is a decision record for the proposed market and in-game leaderboard, with illustrative workloads rather than measured Platonik usage. Provider prices were checked on this date and must be checked again before implementation.

## The recommendation

Keep simulation and candidate search local. Publish only selected, bounded artifacts. Use **Cloudflare R2 for immutable public bundles and Convex for small transactional records**, with cached public leaderboard and contract snapshots. Retain Next.js on Vercel for the website. Choose a separately budgeted evaluator runtime after measuring the Rust engine.

Convex is the recommended first hosted implementation because the market needs coordinated account, escrow, contract, and job state. Its convenience must not become a subscription from every spectator to every market change. Workers with D1 is the main alternative to benchmark if metadata traffic becomes expensive. Turso is a credible SQL alternative when its operational fit is better. None has yet been load-tested for Platonik.

The largest avoidable expense is asking the server to store and rerun every failed idea. A player can try thousands of genomes locally and publish one. Hosted admission gets explicit size, attempt, CPU, memory, and monthly spending limits.

## What goes where

| Data | Proposed home | Lifetime and access |
| --- | --- | --- |
| Local saves, speculative programs, agent notes | Local files and a small rebuildable index | Player-controlled; no automatic upload |
| Admitted genomes, bodies, definitions, released replay bundles | Immutable R2 objects | Public after their declared release; deduplicated by digest |
| Private nominations, unreleased evidence, evaluation seeds | Private storage with authenticated service access | Never in the public bucket before release |
| Accounts, integer ledger, escrow, contracts, job leases | Convex | Authoritative, indexed records; private where appropriate |
| Public rank and market pages | Versioned JSON snapshots on a CDN | Bounded pages, publication time, short freshness window |
| Large execution traces and operational logs | Bounded temporary storage | Short explicit retention; pin selected research evidence |

Only accepted canonical programs and essential receipts get long retention by default. Preserve enough released inputs and versioned runtime information to replay a ranked result after verbose traces expire. Dependencies of a retained artifact stay pinned. Set a storage budget as well as an evaluation budget; successful publication cannot imply unbounded free hosting.

## Borrow the right parts of the precedents

[AI Charts](https://aicharts.io/) presents sourced evaluation snapshots through cached data and comparison views. Its [repository](https://github.com/hraness/aicharts) is a useful model for inexpensive public reads and comparison within a defined cohort. It does not provide a contestant evaluator or a marketplace ledger. Platonik would build those separately and publish their admitted results into a similar read surface.

[Soundfish](https://sound.fish/) separates a composition's semantic identity from the digest of its complete transport document. Its portable URLs embed the program; they are not merely pointers to an object store. Platonik can borrow canonical encoding, bounded decoding, and separate content identities. R2 resolution for larger bundles would be an additional protocol choice, with its own availability and retention rules.

## A hash identifies content, not an achievement

Define these identities before choosing storage keys:

- **Program ID:** a domain-separated SHA-256 digest of canonical typed instructions, language semantics version, and pinned dependency IDs. Specify exact serialization and decoding bounds. Canonical syntax does not establish behavioral equivalence between different programs.
- **Artifact ID:** a digest of the complete canonical document, including labels and declared lineage. Renaming a creature can change this without changing its Program ID. A lineage statement alone does not prove authorship.
- **Evaluation key:** the submitted program, body, starting memory, world and evaluator versions, cost table, complete case set, seeds, budgets, and information/reset rules. The same program in a different body or assay is a different evaluation.
- **Verified receipt:** an evaluator-authenticated result binding that key to all outcomes and costs. The service checks it before updating rank or settling escrow. A client-supplied hash or score is insufficient.

Deduplicate by the appropriate identity and evaluation scope. Hidden-round jobs must not expose seeds, detailed cache hits, or prior verdicts that turn the cache into an answer oracle. Public practice caches can be shared; withheld evaluation stays private until the round's release policy permits disclosure.

A sparsely populated hash space reduces accidental collisions and guessability. It is not access control: known inputs produce guessable addresses, and links can be shared. Public bundles must be deliberately publishable, with credentials, private notes, and unreleased competition inputs excluded.

Prefer one compact bundle for a small program and its bounded metadata over an object per instruction or event. Admission limits compressed and expanded bytes, instruction count, dependency depth and fanout, and total resolved size. Recompute digests server-side; reject malformed inputs before expensive interpretation. Derive actual byte limits from the first engine fixtures rather than declaring every program “small.”

## A small authoritative service

The hosted path is **submit → admit → verify → deliver → settle → list**. Local game ticks never touch the database.

Escrow uses integer amounts and a ledger of balanced transfers. One transaction checks authorization, expected contract revision, available balance, and idempotency key before changing wallets, escrow, and contract state together. Settlement requires both an authoritative qualifying evaluation and a service-confirmed durable delivery record bound to the same artifact and frozen release terms. Immediate-publication contracts require confirmed public delivery before payout. Consume those records once; refund and payout are mutually exclusive. Reusing a request ID with different inputs fails. Avoid a global balance counter on every write; reconcile totals through bounded audit jobs. Available balances plus escrow must equal explicit issuance minus sinks.

[Convex mutations](https://docs.convex.dev/database/advanced/occ) provide atomic transactions. [Scheduling from a mutation](https://docs.convex.dev/scheduling/scheduled-functions) can commit the job with that state change, but an external evaluation or R2 write remains a separate effect. Store the authorized contract and assignee in internal job records; do not assume scheduled work inherits the caller's authentication. Exactly-once financial effects require idempotent settlement even when evaluation runs again.

Write blobs privately first, then commit their validated metadata and a publication job. Database state and R2 are not one atomic transaction. A durable outbox and idempotent publisher reconcile interrupted copies and snapshot writes. Confirm the immutable bundle and receipt through the storage API and intended delivery route, then record delivery and allow settlement. Public listings can lag payment; promised artifact availability cannot. Retain the private original until reconciliation succeeds. Clean up unreferenced staging objects only after a grace period and a fresh reference check. Release timing must honor the accepted terms; reject incompatible competition commitments before accepting a delivery.

Workers lease evaluation jobs, enforce limits outside the interpreter, and retry only within a reserved cost allowance. Run the pinned, restricted organism language without network or filesystem capabilities. Invalid submissions consume their admission allowance. Reserve worst-case verification capacity when accepting contracts, including bounded operational retries. Budget exhaustion pauses new admissions and leaves existing escrow recoverable. The first evaluator must be organizer-operated; untrusted player attestations cannot mint credits or authoritative scores.

Publish bounded top-rank and contract pages on changes, coalesced to a proposed 60-second cadence. Batch changed pages rather than rewriting the entire history. Browse from those snapshots, then read fresh authoritative terms on acceptance. A stale listing may be unavailable; it cannot overspend a wallet. Subscribe only to an active player's own small job or wallet view, with backoff for agent polling.

R2 public delivery should use a custom domain with explicit cache rules for bundle and JSON paths; the development URL is not the production CDN route. Cache configuration and hit rates need verification. A cache does not make every request free: origin reads and any Worker route remain relevant meters. [Cloudflare's public bucket guidance](https://developers.cloudflare.com/r2/buckets/public-buckets/) describes this setup. Verify publication through the storage API and handle stale CDN misses as propagation, not permission to recreate or overwrite an artifact; [cached responses can lag R2 state](https://developers.cloudflare.com/r2/reference/consistency/).

## Compare the viable backends

The alternatives below all assume the same local engine, R2 artifacts, cached public views, trusted evaluator, and transaction invariants. Database operations differ from player actions: one settlement can write several indexed rows, and a reactive query can rerun many times.

| Metadata backend | Why it fits | Cost or scaling concern | Decision |
| --- | --- | --- | --- |
| Convex | Transactions, reactive private views, and scheduled work in one application model | Function calls, database I/O, egress, and fanout must be measured | First pilot; keep documents and subscriptions small |
| Workers + D1 | Low published request and SQL usage rates; same provider as artifacts | Each D1 database is single-threaded and capped at 10 GB; sharding a shared escrow ledger is not free | Benchmark before choosing it for a growing global market |
| Turso + an API runtime | SQL, indexed access, and portable data modeling | Also needs API compute, authentication, jobs, and settlement coordination | Prefer if SQL operations and measured total cost justify the extra integration |

For the pricing comparison, Convex Starter lists a $0 base and usage beyond included resources; in US East, additional calls are $2.20/million, database I/O $0.22/GB, and egress $0.132/GB. Free has hard resource allowances; Starter allows overages. Broad reactive reads can cost more than their tiny result suggests. [Convex pricing](https://www.convex.dev/pricing).

Workers Paid starts at $5/month, including 10 million requests and 30 million CPU milliseconds; additional usage is $0.30/million requests and $0.02/million CPU milliseconds. Its cache hits still count as Worker requests. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/). D1 includes 25 billion rows read, 50 million rows written, and 5 GB stored on that plan; excess reads are $0.001/million rows, writes $1/million, and storage $0.75/GB-month. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/). Its [per-database limits](https://developers.cloudflare.com/d1/platform/limits/) matter more than those rates once writes contend.

Turso's free allowance lists 5 GB, 500 million rows read, and 10 million rows written monthly. Paid plans change allowances and overage rates; the displayed discounted monthly equivalent must not be mistaken for a monthly billing commitment. Compare its selected billing term plus the API runtime before choosing. [Turso pricing](https://turso.tech/pricing).

## What a million programs would cost

Illustrative storage-only workload: one million retained public bundles averaging 32 KiB, resident for a full month, uploaded with one PUT each, with ten million origin GETs. That is about 32.8 decimal GB. At R2 Standard's $0.015/GB-month, the raw storage component is about **$0.49/month before allowances**. Included storage can reduce it; billing rounds to provider units. One million writes and ten million reads fit the listed monthly operation allowances if nothing else uses them. Additional writes cost $4.50/million and reads $0.36/million; Internet egress is free. [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

This is deliberately not a whole-service estimate. Staging, promotion, receipts, snapshots, backups, indexes, dependency fetches, and other account usage add work and storage. Retaining another million bundles each month grows the bill. A large trace is not a 32 KiB genome. Measure actual encoded and expanded sizes before budgeting.

Verification can change the picture much faster. One million checks at an assumed 0.1 CPU-second each require about 28 CPU-hours; at 10 seconds each, about 2,778 CPU-hours. Those are arithmetic scenarios, not measured runtimes or provider quotes. Count failed attempts, sandbox startup, and reruns too. The engine benchmark determines whether a Workers-compatible evaluator fits or a separate sandbox worker pool is required.

## Evidence that would change the choice

Before hosting a pilot, measure bytes per artifact and receipt; calls, scanned/indexed bytes, egress, and rows touched per contract; verifier time distributions; burst settlement contention; and cache misses per active reader. Forecast those measured units at 10× and 100× usage, including authentication, queues, backups, and the existing Vercel plan.

Keep Convex if the capped workload is affordable and avoids substantial operational work. Reconsider Workers/D1 if measured metadata traffic dominates the bill and a benchmark meets settlement latency, recovery, and ledger invariants within one database or a justified partitioning model. Choose Turso if its SQL workflow and complete runtime cost win that same test. Do not split wallets across databases merely to make a storage chart look cheaper.

Run duplicate-delivery, interrupted-publication, simultaneous-spend, delayed-evaluation, restore, and budget-exhaustion scenarios before activating the [economy](economy.md). No price table substitutes for those checks. The first local game needs none of this infrastructure.
