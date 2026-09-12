# Keep a promise to another home

A neighboring home needs one parcel. Its request can go missing, and its courier's reply can arrive late. Your crew must make the physical handoff once, confirm it, and leave the spare alone when the same request comes again.

This bounded Rust habitat advances the Autoverse proposal with two independent commitments. Follow the [recorded exchange](https://platonik.space/lab/ports), or drive it through your agent below. The [evaluation](ports-evaluation.md) separates physical custody, acknowledgment, and the receiving home's service.

## Start an exchange with a missing reply

Build the pinned CLI using the [local installation guide](rust-bridge.md#install-and-run-locally). Run these commands from the repository root, choosing unused filenames and directories. The save store refuses to replace an existing world; shell redirection can overwrite a file.

```sh
./target/release/platonik habitat case ports-ack-loss > ports-world.json
./target/release/platonik habitat init ports-save ports-world.json
./target/release/platonik habitat ports ports-save
```

Each courier begins docked at its receiving depot. A requester supplies a one-bit order through a two-hop local relay. The courier leaves only after receiving the request, collects a parcel from finite stock, and returns. The source also holds a spare of the same type. Taking that spare to fulfill a duplicate request would break the commitment even if it delivered more energy.

## Leave after the handoff

```sh
./target/release/platonik habitat advance ports-save --until 24 --expect-revision 0 --request-id first-handoff
./target/release/platonik habitat ports ports-save
./target/release/platonik habitat export ports-save > ports-paused.bundle.json
./target/release/platonik habitat import ports-paused.bundle.json ports-restored
```

Inspect each lane's `accepted` and `acknowledged` fields. A parcel can already belong to the receiving depot while its requester is still waiting for confirmation. The acknowledgment channel in this example reopens at tick 48. The exported save preserves the handoff history, current service state, retained receipt, pending reports, untouched spare, and cumulative work.

## Let the reply catch up

```sh
./target/release/platonik habitat advance ports-restored --until 128 --expect-revision 2 --request-id keep-the-promise
./target/release/platonik habitat ports ports-restored
./target/release/platonik habitat verify ports-restored
./target/release/platonik habitat export ports-restored > ports-finished.bundle.json
```

The supplied reference should finish with `ports.commitments_passed` equal to `true`. Both parcels must be accepted, both matching acknowledgments consumed, both required beacon services completed, and both spares preserved. More request or acknowledgment messages do not create additional delivery credit.

Trying to drop a parcel does not prove the handoff succeeded. The courier retries while it still carries cargo. Only after observing empty cargo at the destination does it retain the physical depot receipt and send a confirmation. The old relay and Keeper perform the downstream service separately; acceptance into a depot and use by a beacon are different events.

No ticks pass while the world is paused. Reading a report does not advance it, but freshly verifying saved history consumes real CPU. Prefix commands with `--metrics` to inspect actual engine executions. The existing [revision, retry, and recovery rules](continuous-habitat.md#pause-retry-and-recover) remain in force.

## Give your agent an ambition

Try “Keep my couriers, but make the requesters less noisy,” or “Make a cheaper crew that still keeps both promises.” Preserve the original input and edit a separate experiment before creating a new save. Programs, world events, and allowances stay immutable inside a running save.

The declared comparison uses one shared requester program and one shared courier program across both mirrored lanes. One ambition keeps the supplied courier descendant unchanged; the other may edit both programs. Physical report relays, network adapters, service controllers, terrain, stock, and event schedules remain fixed. Public transfer cases test the selected programs unchanged after training.

## Read the evidence correctly

`habitat ports <dir>` returns a `platonik-ports-report-v1` envelope containing the ordinary `habitat` report and a `ports` grade. `habitat ports-check <receipt.json|->` freshly verifies a standalone receipt and returns its grade. Both are read-only. Valid unfinished or unsuccessful evidence exits 0; invalid or corrupt input exits 2.

Each lane lists the request consumed by its courier, pickup, depot acceptance, acknowledgment consumed by its requester, and eventual beacon service. The full contract additionally checks truthful acknowledgment attempts and an untouched spare throughout the observed history. A finished service quota alone cannot substitute for the required parcel and confirmation.

These are two one-shot commitments in local neighborhoods of one saved world. Port wiring supplies their identities; organisms inspect bits and ports, not the observer's signal or parcel identifiers. Repeated sessions, sequence-number wraparound, arbitrary message identities, distant independently advancing worlds, and a multiplayer market remain later capabilities. Permanent communication loss can leave a physically successful handoff unconfirmed.
