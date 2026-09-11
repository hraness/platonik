# Explore the observatory

Browser prototype guide, 11 September 2026. The experiments described here are implemented on the website. The Rust game, agent skills, rankings, and shared world remain a proposal. These small models are for testing a design direction, not evidence that the larger ecology works.

## Put a specimen on the bench

Open [the observatory](https://platonik.space/lab). No account, installation, credentials, or paid compute is needed.

1. Choose Moth, Moss, or Reed. The bench executes its program for 256 ticks in the selected maze and reports deliveries and modeled work.
2. Compare **Form** with **Journey**. The portrait encodes rules and memory; the journey comes from the actual execution trace. Play or scrub the recorded run.
3. Choose **Grow a variation**. One rule changes, and the new program runs on the same map. The immediate parent remains available for a matched comparison and restoration. A variation can make things worse.
4. Change the map seed. Several successful examples are more informative than one favorite result; none is an independent research evaluation.
5. Name and **Keep specimen** to save the current program and map seed in this browser's drawer. The drawer holds twelve distinct canonical programs. Loading a saved entry runs it again; removing it changes only this browser's collection.

The portrait is a lossy visualization: lobes encode rules, grains encode conditions, rings encode used memory slots, and memory-writing rules shift the tint. Directional choices alter lobe reach. Unused rules can affect appearance, so beauty is never a fitness score or a guarantee of novelty. Different programs can share a portrait. Collection names are labels, not claims about biological species.

Local browser data can be cleared. **Export this program** downloads the current JSON for safekeeping or editing by an external agent. It exports the program only; record the map seed separately to repeat a particular run. The website makes no model calls and has no shared collection or leaderboard.

## Let an agent change the rules

Expand **Edit or paste a program**. Give the exported JSON and these rules to your agent, ask for a bounded change, and paste its result back. **Apply and run** validates it before replacing the program on the bench. Invalid input leaves the current specimen intact; **Revert editor** restores its current JSON.

The laboratory format is `version: 1` with 1–24 ordered rules. Each rule has a `when` list of up to eight conditions and an `action`. Conditions are ANDed and short-circuit; the first matching rule acts once per tick. An empty condition list always matches. With no match, the courier waits. Optional `remember` writes one memory slot after the action, even if the action fails.

Conditions can inspect `home`, `spark`, `carrying`, an adjacent `blocked.forward`, `blocked.left`, `blocked.right`, or `blocked.back` sensor, the courier's heading, or a memory slot. Actions are `move`, `turn`, `pickup`, `drop`, `wait`, and `write`. Use a starter's exact object fields as a template. There are four memory slots, numbered 0–3, storing integers 0–255. Input is capped at 16 KiB and extra fields are rejected. It is a fixed interpreter, with no JavaScript evaluation, network, filesystem, or remote-map sensor in the program.

This model has one courier, a deterministic 15×11 maze, a finite source of four sparks, and home. A successful move sets the heading to the movement direction. A pickup carries one spark; a drop at home delivers it. The 256-tick cap ends the run. Rule visits, condition checks, reads, attempted actions, and state writes contribute to the explicit work ledger. Failed actions still cost work. The toy records that cost; it does not yet enforce a separate fuel allowance. Maze generation and rendering take real computer time outside that modeled ledger.

There is no beacon drain, route collapse, colony communication, or evolved body in this demonstrator. The names overlap the proposed campaign to test recognition; its measured results belong only to this model.

## Explore a truth landscape

In **Truth garden**, choose one of two coupled systems from Patrick Grim's paper. Change the initial truth values, update order, threshold radius, and revision cap. The landscape samples 192×192 starting pairs. Each pixel records the first update after which the pair lies outside the chosen radius about the origin; paper-colored pixels have not crossed within the cap. All values remain within the truth square.

Click a point or use the x and y sliders, then choose **Zoom here** to inspect a smaller region. Keyboard activation of the map chooses its center. **Whole square** restores the full domain. **Trajectory** follows the selected pair, and the table exposes its first five updates. An exact repeated floating-point pair is reported when one occurs.

Truth degrees are not probabilities or confidence scores. The formulas, schedule, finite iteration cap, and JavaScript Float64 precision define this experiment. No noise is added. A detailed boundary does not prove infinite fractal structure or useful computation. The [research notes](research.md#fractional-truth-and-fractal-patterns) explain the source and possible later signal-habitat experiments.

## Price the ambition

In **World budget**, choose active cells, simulation ticks, average primitive work, state bytes, and trace bytes. The calculator separates policy operations, current state, and an uncompressed per-cell history. These are assumptions, not demonstrated capacities of a Rust engine.

**Measure this browser** runs 64 bounded 256-tick courier experiments using the specimen currently on the bench. It yields between runs, supports cancellation, and reports observed modeled work per elapsed second for that browser and program. Leaving the view cancels an unfinished sample. The rough time estimate uses that sample and excludes important whole-world costs; it cannot predict Rust throughput. Read the [complexity and scale proposal](complexity-and-scale.md) before interpreting a large number as an affordable world.
