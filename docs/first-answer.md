# Bring a signal home

The First Answer is a short, local Platonik journey. Your courier keeps two lights supplied while a builder makes a Keeper and a reply cell. A report travels through the new cell and returns to a receiver. Completing the journey earns an authored ending tied to the recorded work of this crew.

This is one construction-to-contact adventure in the Rust prototype. The six-chapter [Long Trail](campaign.md), moving arks, and independent civilizations remain proposals. Inspect the recorded version at [The First Answer](https://platonik.space/lab/answer), or run your own save below.

## Begin with a crew

Install the pinned Rust toolchain and build the CLI using the [local installation guide](rust-bridge.md#install-and-run-locally). Run these commands from the repository root. Choose unused filenames and directories: the save store refuses to replace an existing world, but shell redirection can overwrite a file.

```sh
./target/release/platonik habitat case answer-one > answer-world.json
./target/release/platonik habitat init answer-save answer-world.json
./target/release/platonik habitat journey answer-save
```

The journey starts at tick zero. Five cells are present; the two blueprint bodies have yet to be built. Two finite material tokens can supply those bodies. Six sparks must reach their matching service beacons within the original 128 ticks and 40,000 units of modeled work.

You can give your agent a concrete wish: “Keep my courier and bring the signal home,” or “Find a cheaper crew.” To make an alternative, preserve this input and edit a separate experiment before launch. Programs, blueprint bodies, supplies, and terrain stay immutable inside a saved world. The [play skill](https://github.com/hraness/platonik/blob/main/skills/platonik-play/SKILL.md) explains bounded comparisons and failure accounting.

## Pause while something is being built

```sh
./target/release/platonik habitat advance answer-save --until 5 --expect-revision 0 --request-id first-body
./target/release/platonik habitat journey answer-save
./target/release/platonik habitat export answer-save > answer-paused.bundle.json
./target/release/platonik habitat import answer-paused.bundle.json answer-restored
```

Inspect the material escrow and copied body prefix in the habitat report. They belong to a real unfinished assembly. A child cannot run until its builder finishes copying and wiring, explicitly activates it, and another tick begins. Import preserves that partial work, the courier's position, queued reports, and spent fuel. The original save remains paused.

## Let the crew finish

```sh
./target/release/platonik habitat advance answer-restored --until 128 --expect-revision 2 --request-id bring-it-home
./target/release/platonik habitat journey answer-restored
./target/release/platonik habitat verify answer-restored
./target/release/platonik habitat export answer-restored > answer-finished.bundle.json
```

The supplied reference should end with `journey.phase` equal to `answered` and a nonempty `journey.answer`. Read the milestone ticks to find the births and returned report, then inspect the recorded frames for the final physical delivery. A valid history can also finish without an answer; verification checks honesty and reproducibility separately from success.

There are at most eight advances per habitat, so this two-advance walkthrough leaves room for finer observation. Targets are absolute ticks. Reading a journey or waiting in real time advances no simulated time. Each read still verifies the saved history and consumes real CPU; prefix commands with `--metrics` when measuring that cost. Use the [recovery guide](continuous-habitat.md#pause-retry-and-recover) if an advance is interrupted.

## What earns the ending

The Rust checker requires the complete service horizon, construction from acquired material, useful work by both born children, and an exact spark identity carried through the reply. It also traces the final spark through the courier's physical deposit and the Keeper's service action. A constant correct bit, an earlier spark's report, an inactive child, or a broken return connection cannot satisfy that conjunction.

The reply carries a report originally emitted at the depot. The receiver must consume it after the final physical delivery. This establishes matching provenance and completed service together; the beacon itself does not emit an acknowledgment. The story text is authored, and the reply cell does not generate language or demonstrate a mind. A separate proposal, [a voice on the wire](voices.md), explores a generated voice for the contacted side — still fiction, still unable to change the verdict.

Intermediate reports expose only milestones observed in the committed prefix. Even after the matching reply arrives, the ending stays locked until the full horizon verifies: the crew still has lights to keep alive. The browser uses these recorded Rust facts to reveal the same moments; it does not run another simulation.

## Read a checked report

`habitat journey <dir>` returns a `platonik-first-answer-report-v1` envelope containing the ordinary `habitat` report and a `journey` with its experiment and evidence identities. `habitat answer <receipt.json|->` freshly verifies a standalone receipt and returns the same journey projection without a save envelope. Both are read-only. Exit 0 means the input verified, including a valid unfinished or unsuccessful journey; invalid input or a corrupt history exits 2.

The local objective uses the declared roles and six-spark, two-service, 128-tick v3 contract. Hashes bind a result to its input; they do not certify that an arbitrary edited world meets a public competition's rules. A comparison must additionally fix its environments, allowed edits, selection rule, and search allowance. See the [evaluation](answer-evaluation.md) for the finite trials and capacity measurements supporting this journey.
