# Give home a plan

Your courier now carries a number into a small service crew. Its rules add another number, choose the part of the answer named by a supplied plan, and remember that decision until a delivery window opens. This bounded Rust experiment advances the [Autoverse proposal](autoverse.md); moving arks and the complete campaign remain unimplemented.

Follow the [recorded crew](https://platonik.space/lab/ark), or use your agent to run the same world below. The [evaluation](ark-evaluation.md) explains the complete arithmetic tests, controls, and limits.

## Load a reserve plan

Build the pinned CLI using the [local installation guide](rust-bridge.md#install-and-run-locally), then run these commands from the repository root. Choose unused filenames and directories. The store refuses to replace an existing world; shell redirection can overwrite a file.

```sh
./target/release/platonik habitat case ark-reserve-16 > ark-world.json
./target/release/platonik habitat init ark-save ark-world.json
./target/release/platonik habitat ark ark-save
```

Five physical sparks carry the first number's four bits, low bit first, followed by a zero that flushes out the carry. The second number and the plan are supplied in local memory. Their loading counts as work. Two couriers, relays, a serial adder, a selector, and the familiar Keeper share one grid and one allowance.

The reserve example adds 9 and 7. Its plan selects the carry from that four-bit addition. The staggered plan selects the low result bit, which distinguishes odd and even totals. Both plans use the same selector program; their supplied plan data changes the required decision.

## Leave while a column is in flight

```sh
./target/release/platonik habitat advance ark-save --until 8 --expect-revision 0 --request-id first-column
./target/release/platonik habitat ark ark-save
./target/release/platonik habitat export ark-save > ark-paused.bundle.json
./target/release/platonik habitat import ark-paused.bundle.json ark-restored
```

Inspect the carried state and reports in flight. A save preserves the actual shifted operand, carry memory, physical supplies, and queued messages. Import restores this prefix; it does not start a fresh arithmetic problem.

## Keep the decision through the silence

```sh
./target/release/platonik habitat advance ark-restored --until 128 --expect-revision 2 --request-id keep-home-running
./target/release/platonik habitat ark ark-restored
./target/release/platonik habitat verify ark-restored
./target/release/platonik habitat export ark-restored > ark-finished.bundle.json
```

The supplied reference should finish with `ark.control_passed` equal to `true`. Its report lists all five observed arithmetic outputs, the selected report consumed by Keeper, retention across the communications gap, and the physical routing decision.

The selected report link closes at tick 48. The payload valve opens only at tick 52. The payload depot has no outgoing report link, so its contents cannot simply tell Keeper which answer to choose. This boundary covers initial links and declared blueprint links, including disabled ones. Keeper must retain the computed result and use it during that single decision window. The crew still has to finish the full 128 ticks with its service commitments satisfied.

No real time passes in a paused habitat. Reading a report does not advance the world, but it freshly verifies the saved history and consumes real CPU. Prefix CLI commands with `--metrics` to observe that cost. Use the [recovery guide](continuous-habitat.md#pause-retry-and-recover) for interrupted writes; the original eight-advance limit, revisions, and retry rules remain in force.

## Ask for another kind of crew

Give your agent an ambition such as “Keep my couriers and make the selector cheaper,” or “Spend less work on this voyage.” Preserve the original experiment and edit a separate input before creating a new save. The running world's programs, plan, terrain, and allowance stay immutable.

An arithmetic input can be exported without running it:

```sh
./target/release/platonik habitat arithmetic-case 9 6 0 > staggered-world.json
```

The first two arguments are unsigned numbers from 0 through 15. The final argument is the output tap: `0` for the low sum bit or `4` for carry. This command grants the complete input world; it performs no engine execution. A public comparison must additionally freeze its environments, allowed program edits, selection rule, and search allowance.

## Read the verdicts separately

`habitat ark <dir>` returns a `platonik-ark-report-v1` envelope with the ordinary `habitat` report and an `ark` grade. `habitat ark-check <receipt.json|->` freshly verifies a standalone receipt and returns its grade. Both are read-only. Exit 0 means valid evidence, including a valid unfinished or unsuccessful voyage; corrupt or invalid input exits 2.

Arithmetic success requires exactly five correct outputs clocked by the physical input. Service success is the ordinary habitat result. Control success additionally requires the supplied plan's selected result, retention, and the real payload decision inside the declared window. A correct final register, extra output bits, or a lucky service result cannot substitute for the whole contract.

This is one four-bit addition and one binary routing decision per voyage. The interpreter has no new add instruction: explicit local rules do the work. Repeated requests, resetting and loading another addition inside the same world, continuous numerical regulation, a stored-program computer, and a moving ark need further evidence.
