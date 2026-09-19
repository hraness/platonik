# One living automation world

Current implementation and design proposal, revised 19 September 2026. Platonik is one persistent automation frontier played in the browser and with an external agent. Place a machine, connect its supplies, run the factory, notice a bottleneck, and improve the same save. This plan orders the next work around making those decisions worthwhile.

## What is playable now

Copperwake is a finite 32×22 region with a working freight circuit, a ridge with passes, distant deposits, two beacons, and two foundry blueprints. Its four material stocks contain 256 units; three spark sources hold 128 sparks. Drills extract material, fabricators turn material and sparks into parts, and assemblers consume material, parts, and sparks to make frames. Couriers supply construction bills and machine inputs. Storehouses buffer supplies; cranes move eligible items between adjacent ready facilities from lower to higher facility IDs.

The browser runs the authoritative Rust engine through WASM. It supports run/pause, placement of the five facility kinds, bounded haul-route editing, camera navigation, local persistence, JSON import/export, and historical replay. A facility inspector shows recipes, held supplies, construction needs, and observed work or waiting states. Original sprite art gives machines, courier rovers, ore, and spark sources recognizable forms; it changes no engine outcome.

The same world can move to an external agent through its file or exact-world handoff. The native CLI preserves each JSON revision, changes original-cell policies, places facilities, and advances 1–128 ticks. Browser and CLI copies do not synchronize automatically: pass the latest revision when switching. The current envelope is 4,096 ticks, 128 events, 16 cells, and 12 facilities. Optional Algal proposals select from host-compiled actions and require receipt verification before acceptance. The base game needs no model provider or hosted account. See the [engine reference](engine.md#the-living-world-command-surface) for exact rules.

Earlier laboratories, challenge seasons, and bounded journeys remain accessible as evidence. The complete [Long Trail](campaign.md), moving arks, a shared economy, and in-world rankings remain proposals.

## The first useful expansion

The supplied freight loop visits the spark source at (7,3), drill at (9,3), fabricator at (9,8), and assembler at (7,8). Let it run and inspect the parts and frames it makes. Place a crane at (8,8), between the producers. Couriers must deliver its one material, one part, and one frame before it starts moving eligible stock into the assembler.

This gives the first frame a purpose. The player can watch the site waiting for its bill, trace what is missing, and see the completed machine perform real transfers. A bounded engine regression establishes parts and frames within 128 ticks, then a supplied crane and observed transfers by 512 ticks. These timings describe the tested sequence; changed routes or extra construction can change the result.

Route editing exposes a further choice. Four to eight orthogonal turnpoints define a closed, nonintersecting loop for an original mobile carrier. The loop must be clear of terrain, stationary builders, and reserved birthsites, and must contain the carrier's current tile. Rust compiles the loop to ordinary admitted policy rules. Cargo remains finite, every move costs work, and traffic can still stop a hauler.

Industry v6 now accounts for the actual sequential facility operations before committing them. A producer finishing and a later crane starting in the same tick both pay their costs. Existing v5 histories preserve their original accounting, stock limits, and receipt identities; opening one does not silently migrate it.

## Next priorities

The next goal is a worthwhile second factory. More scenery alone cannot supply a reason to build one: additional production needs an understandable use, and distance needs to create decisions about transport.

| Priority | Proposed change | Evidence needed before calling it complete |
| --- | --- | --- |
| 1. A useful destination for surplus | Give frames and sustained production another concrete purpose, with a choice between improving the first factory and supplying an eastern outpost. | Both choices have visible costs and useful outcomes in the same save; a stalled chain remains diagnosable. |
| 2. More deliberate logistics | Extend the current route tool with explicit pickup and destination intent, and make crane direction easier to plan without hiding its deterministic rule. | Useful chains complete without circulating stock, starving construction, or concealing traffic; old histories still replay. |
| 3. Reusable construction | Let useful layouts and crew habits become reusable plans with explicit material and work costs. | A plan can be rebuilt from available supplies, interrupted, and inspected without hidden work or free resources. |
| 4. An earned next region | Extend one saved world's capacity and objectives toward the Long Trail. | Measured execution, replay, memory, and storage fit a declared larger envelope; existing creations remain useful. |

These are ordered proposals. The current region is finite; there is no generated infinite world or completed campaign. Recipe balance and progression need player evidence. Automated checks establish execution, conservation, and replay, but do not establish enjoyment. Keep the hopeful space-western direction: familiar couriers, tangible machinery, and useful cooperation that earns each change of scale.

## Boundaries to preserve

Rust owns outcomes, resource accounting, and replay. Browser controls and agents submit admitted commands to that same engine. Reading, inspecting history, waiting while paused, and closing the browser cost no simulated time. Facility diagnostics explain a recorded state and do not grant new organism senses. A currently eligible transfer is not proof that a later transfer occurred.

Preserve prior JSON revisions and historical competitive results. New rankings or hosted services require their own design and evidence. The [game design](game-design.md) retains the longer creative direction; this plan owns the sequence from Copperwake toward it.
