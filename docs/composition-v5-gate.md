# When a new organism keeps a promise

The campaign proposal now has a working one-lane exchange: a generated organism wins a physical trial, receives a request, delivers its parcel, and sends a custody acknowledgment back to the requester. Six fresh Rust worlds complete that chain in one continuous 128-tick execution.

This page retains the earlier v5 proposal's URL. The implemented exchange uses existing v4 instructions with a new fixture and grade, `platonik-bloom-exchange-v1`. It needs no interpreter extension. The old Bloom and two-lane Ports records remain separate, reproducible experiments.

## What actually connects

Two builders derive opposite directions from the same supplied seed. Both children try the route and return; a physical depot report chooses the winner. After a later request arrives, the adapter asks that selected child to make its confirmation trip.

The depot emits a report containing the delivered parcel's identity. Ordinary local messages carry that evidence back to the selected child, which stores it and emits an acknowledgment. The adapter forwards the acknowledgment to the requester. The requester stops asking only after consuming the reply. The final beacon then receives the physical parcel.

The replay checks this complete chain:

`trial → selection → requester → adapter → generated child → depot → child report → child acknowledgment → requester → service`

Each hop binds its sender, receiver, ports, link, bit, parcel evidence, and timing to successful actions in the Rust trace. A constant false bit cannot stand in for a custody report. The losing candidate's confirmation parcel stays in its source throughout the run. All world resources, seed bodies, initial memory, wiring, schedules, and budgets must match the named reference case; only initial-cell programs are editable. Changed world grants produce a false admission predicate.

## What the qualification establishes

| Supplied worlds | Requester receives acknowledgment | Physical service |
| --- | --- | --- |
| Left and right winners | Tick 115 | Tick 126 |
| Delayed left and right routes | Tick 120 | Tick 126 |
| Rotated left and right routes | Tick 125 | Tick 126 |

These are reachable examples with a supplied program family, not independently discovered agent strategies. The [qualification record](https://github.com/hraness/platonik/blob/main/fixtures/evidence/exchange-qualification.json) includes each grade, work total, source identity, and binary identity. Its compressed archive retains every qualification input, receipt, grade, subprocess output, and measured engine count. Six references and eight completed controls use 28 engine executions, including fresh grade replays, within a predeclared allowance of 64.

The controls test specific failures:

- **No child acknowledgment:** physical delivery succeeds, but the requester never obtains the child's valid reply.
- **Forged report:** a constant bit loses the depot's parcel evidence; delivery alone does not rescue the exchange.
- **Wrong winner:** the adapter requests the losing candidate.
- **Early acknowledgment:** the requester receives a reply before custody exists.
- **No request:** the requester never commissions the confirmation trip.
- **Missing spare:** the experiment omits the losing confirmation parcel from its initial resources, failing admission and preservation.
- **Selector bypass:** the adapter dispatches without consuming a request.
- **Stray report:** an unsupported report precedes an otherwise successful exchange. Later success does not erase the false claim.

Separate integrity tests reject rehashed changes to acknowledgment evidence, remembered state, birth programs, costs, and duplicated parcel identities. A forged receipt is an integrity failure; it is not counted as an honestly completed control. Serialized checkpoints with a request or child acknowledgment in flight resume to the same complete trace, state, outcome, and work as uninterrupted execution.

## Run and inspect the exchange

From a repository checkout with the pinned Rust toolchain, build the CLI and use fresh output filenames:

```sh
cargo build --release --locked -p platonik-cli
./target/release/platonik habitat case bloom-exchange-left > exchange-world.json
./target/release/platonik run exchange-world.json > exchange-receipt.json
./target/release/platonik habitat exchange-check bloom-exchange-left exchange-receipt.json
```

Inspect `exchange_passed` and the separate stage predicates in the JSON grade. The check replays the receipt once. Exit 0 means the evidence is valid, including an honestly failed exchange; corrupt evidence and unknown case identifiers return exit 2.

To see delivery succeed while the reply fails:

```sh
./target/release/platonik habitat exchange-control bloom-exchange-left no-child-ack > without-ack.json
./target/release/platonik run without-ack.json > without-ack-receipt.json
./target/release/platonik habitat exchange-check bloom-exchange-left without-ack-receipt.json
```

The grade reports a service timestamp with `acknowledgment_passed: false`. This seed-removal control also fails the unchanged-seed admission and generation requirements. `habitat cases` lists the available reference worlds; `habitat help` lists the controls. Existing habitat initialization, advance, export, and import commands can carry these fresh worlds through checked pauses. The generic expedition `prepare` command does not substitute its incompatible role IDs into an exchange.

## Limits and the next gate

The fixture has nine active cells after two births, thirteen links, two candidate bodies, and one confirmation obligation. The new seed extends the earlier seed with report handling and acknowledgment; this is adaptation with recorded ancestry, not unchanged courier reuse. The retained Keeper also needs a new memory policy to hold the report through the closed-valve interval. All its retries consume modeled work.

A scheduled valve reopening creates the final service window. Receiving an acknowledgment does not itself authorize service: the no-ack control deliberately demonstrates that separation. This establishes ordered custody, acknowledgment, and service for the declared reference; it does not prove an acknowledgment-controlled economy.

The six cases exclude the old late-reopening crossing schedules. The three-tick link delay already puts the requester acknowledgment at tick 125, one tick before service. Extending those schedules requires a separately qualified protocol or a larger runtime envelope. The earlier claim that a 16-cell bound makes composition impossible was too strong; it only ruled out a naive union of unshared roles.

Next measure this exact workload's execution, verification, memory, and artifact costs, then run bounded agents against it with every failed candidate retained and transfer cases frozen before selection. Subsequent campaign work must still connect the other chapter transitions, repeated operation, and the final ending. Human playtesting comes after those useful automated investigations. This exchange does not establish scalable ecologies, research novelty, a P-versus-NP result, or human enjoyment.
