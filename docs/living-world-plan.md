# One living automation world

Current implementation and design proposal, revised 19 September 2026. Platonik is one persistent automation world played through an external agent. The browser is its read-only window: watch the crew, inspect a machine, notice a problem, and carry a specific wish back to the agent. This plan orders the next work around that loop.

## What is playable now

Dustlight has a 24×14 homestead, two beacon routes, finite material deposits, two foundry blueprints, and five facility kinds. Drills extract material; fabricators turn material and sparks into parts; assemblers consume material, parts, and sparks to make frames. Creatures supply construction bills and machine inputs. Storehouses buffer supplies; cranes move eligible items between adjacent ready facilities from lower to higher facility IDs.

The agent preserves each JSON revision, changes original-cell policies or places facilities, advances 1–128 ticks, and returns a browser link. The current envelope is 4,096 ticks, 128 events, 16 cells, and 12 facilities. Optional Algal proposals select from host-compiled actions and require receipt verification before acceptance. The base game requires no model provider or hosted account. See the [engine reference](engine.md#the-living-world-command-surface) for exact rules.

Earlier laboratories, challenge seasons, and bounded journeys remain accessible as evidence. The complete [Long Trail](campaign.md), moving arks, a shared economy, and in-world rankings remain proposals.

## Production that can be understood

The current milestone makes the existing factory legible before adding more recipes. Selecting a facility reveals its name, recipe, held supplies, remaining construction needs, and current work or waiting state. Rust computes these observations for each replay tick, including missing inputs, output capacity, deposit exhaustion, and eligible crane transfers. The renderer presents them without advancing the world.

A focused handoff carries the selected place and tick into the player's agent conversation. The agent checks the latest revision, makes one change, and returns a new view. Stock hauling preserves parts for construction and assembler inputs instead of circulating them through a ready storehouse; older saves retain their recorded programs.

This milestone is useful when a player can explain why one machine is waiting, request a relevant improvement, and see whether it helped. Automated checks establish observation accuracy, bounded commands, and replay. They cannot establish enjoyment or understanding without observing players.

## Next priorities

Before adding industry mechanics, a versioned accounting change must charge every sequential facility operation. In v5, a producer can make a later crane eligible in the same tick after work has already been charged from the earlier state. Preserve v5 replay and introduce exact staged accounting under a new version, with fuel-boundary and producer-to-crane regressions. This is an engineering prerequisite, not a new player mechanic.

| Priority | Proposed change | Evidence needed before calling it complete |
| --- | --- | --- |
| 1. A dependable first improvement | Make the first production expansion and beacon-service tradeoff clear through a short agent-led progression in the same save. | A fresh world completes the described steps with visible results; failed or competing work remains understandable. |
| 2. Deliberate logistics | Give the player clearer control over pickup, destination, and crane direction while retaining local sensing and finite cargo. | Routes complete useful chains without circulating stock or abandoning construction; old histories still replay. |
| 3. Reusable construction | Let useful layouts or crew habits become reusable plans with explicit material and work costs. | A plan can be rebuilt from available supplies, interrupted, and inspected without hidden work or free resources. |
| 4. An earned next region | Extend one saved world's goals and capacity toward the Long Trail. | Measured execution, replay, memory, and storage fit a declared larger envelope; existing creations remain useful. |

These are ordered proposals, not implemented commands or a promise of infinite capacity. Recipes, map scale, and campaign progression should follow the choices players actually enjoy making. The hopeful space-western direction stays: keep familiar creatures, make cooperation useful, and let changes of scale grow from their work.

## Boundaries to preserve

Rust owns outcomes, resource accounting, and replay. The agent owns interventions; the browser owns observation. Reading, waiting, or closing the browser costs no simulated time. Facility diagnostics explain a recorded state and do not grant new organism senses. A currently eligible transfer is not proof that a later transfer occurred.

Every change preserves prior JSON revisions and historical competitive results. New rankings or hosted services require their own design and evidence. The [game design](game-design.md) retains the longer creative direction; this plan owns the sequence from the current factory toward it.
