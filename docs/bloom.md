# Let your creations begin creating

The Bloom is a bounded experiment in endogenous variation. Two builders receive the same courier blueprint. Each writes a direction into its own copy, pays to rewrite the body, and activates a child. The children make a physical trial: they pick up a parcel, travel to a depot, return, and leave evidence that another local process can read.

This is a proposal for the next playable slice of the Autoverse, implemented here as a finite reference habitat.

The selector may choose one child only after both trials have returned and a relay has forwarded an actual depot report. A clock then opens a second trip for the selected child. The losing child keeps its unfinished trial and its confirmation parcel. This is a small, inspectable step toward the Autoverse: a world can grow a useful variation and make a consequential choice from what happened inside it.

## Drive the reference

Build the CLI with the [Rust bridge guide](rust-bridge.md#install-and-run-locally), then export a supplied world and run it:

```sh
./target/release/platonik habitat case bloom-left > bloom-world.json
./target/release/platonik run bloom-world.json > bloom-receipt.json
./target/release/platonik habitat bloom-check bloom-receipt.json
```

The read-only check freshly verifies the receipt and prints the Rust-authored Bloom grade. `habitat bloom <save>` grades a paused or finished saved world without advancing it. The public [Bloom replay](https://platonik.space/lab/bloom) displays the same recorded evidence.

## What can change

The v4 primitive permits at most eight direction edits on an adjacent, fully copied and wired assembly. An edit chooses an existing `Move` or `Turn` direction operand and records the actor, rule, register slot, old and new body hashes, and rewritten bytes. Reading a register, checking the old and new body, copying the replacement, and recording the edit all consume the finite activation allowance. An interrupted edit spends its work but leaves the assembly unchanged.

The supplied Bloom family deliberately narrows this general primitive to two `Turn` rules in one nine-rule seed. The builders can produce a left or right courier, but they cannot change its opcode, body layout, links, memory initialization, or world. This keeps the first result legible. It is not an open-ended evolutionary system or a claim of novel algorithm discovery.

## Read a result

The grade reports the seed and born-program identities, every edit, physical trial moments, the causal selection report, and confirmation moments. A final Bloom requires a complete 128-tick v4 run, two distinct permitted variants, two returned trials, selection before tick 96, a selected confirmation request and depot handoff, service at the shared beacon, and preservation of the loser's confirmation parcel. A successful beacon alone is not enough.

The browser projection is a display layer. Its strict shape and receipt hashes prevent stale or malformed records from appearing, while the Rust checker remains authoritative for replay, edit derivation, physical provenance, and selection causality.

The [evaluation](bloom-evaluation.md) records the reference qualification, controls, recovery checks, and the limits of this milestone. The next work is a bounded agent comparison and integrated chapter transition, followed by capacity evidence. Human playtesting still comes after those automated gates.
