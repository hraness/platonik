# The true Bloom–Ports composition gate

This is the proposal and contract for the next automated milestone. It is intentionally a design gate until an authoritative Rust fixture and replay exist.

## Why the current records cannot be joined

The published Bloom habitat is variation version 4. Its generated child is a source-to-depot organism: it edits a blueprint, performs a trial, and later requests a confirmation trip. The earlier Ports commitment is version 3 and grades a fixed courier, requester, report relay, network relay, and Keeper topology. Their program interfaces, role identities, construction rules, and world bounds differ. Concatenating their JSON records would preserve hashes but would not prove that one runtime carried a request through the selected child.

The current v4 envelope starts with six cells and can birth two more. A single Ports lane needs five protocol roles, and the existing child program has no request/acknowledgment state machine. The 16-cell limit therefore cannot support a faithful two-lane join. The reduced `platonik-composition-v1` records are provenance projections inside v4; they are not this gate.

## Required v5 fixture

Add a versioned one-lane composition fixture and grade it in Rust. Keep the existing Bloom and Ports fixtures immutable. The new fixture must declare:

1. A Bloom phase in which two candidates are generated, tested, and selected from a physical post-trial report.
2. A typed adapter boundary that exposes the selected child as a Ports participant. The child must be the actual born program, with its program hash and edit history bound to the construction event.
3. A post-selection request that crosses the adapter into the selected child, a depot-origin report that crosses back through the declared relay, and an acknowledgment that reaches the requester before service.
4. Physical service of the selected confirmation parcel and preservation of the losing parcel as a spare.
5. One fixed horizon and one cost ledger. Every candidate, failed control, replay, serialization, and grade execution is charged.

The implementation may use a 128-tick v5 horizon split into a Bloom window and a post-selection exchange, or a deliberately versioned 256-tick horizon. The choice must be recorded in the fixture protocol and capacity receipt; it must not be inferred by the checker.

## Admission evidence

The gate admits only a fresh Rust receipt and a grade whose experiment and result hashes match. The checker must bind, in order:

`selection → adapter request → selected born program → depot report → acknowledgment → physical service`.

It must also verify endpoint and link provenance, signal bits, delivery times, construction ancestry, loser-spare conservation, and complete replay hashes. A public record should retain the fixture, receipt, grade, compact replay, source/binary identities, modeled work, artifact size, and verifier result.

Retain negative controls with rejection diagnostics:

- selector bypass or direct request to a child;
- request routed to the losing child;
- forged cell-origin report instead of a depot report;
- acknowledgment sent before acceptance or service;
- discarded or double-spent loser spare.

Controls must complete their declared horizon and fail the specific composition predicate. A malformed input is not a completed control.

## Capacity and stop conditions

Before raising the envelope, measure p50/p95 runtime, peak RSS, receipt bytes, verifier time, and total engine executions on the same reference machine used by the Bloom capacity gate. The first v5 target is one lane, two candidates, one confirmation, and the existing bounded artifact budget. Do not claim a larger ecology, a multiplayer economy, useful research output, or a P-versus-NP result from this fixture.

If the generated child cannot carry the declared request/ack protocol without changing its semantics, stop and revise the substrate or narrow the campaign claim. Do not repair the mismatch with a browser-only adapter or an uncharged conversion reward.
