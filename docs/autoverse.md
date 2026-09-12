# The Autoverse design contract

Proposal, 12 September 2026. Platonik's campaign needs one programmable medium whose creations remain useful as the story grows. This page defines that proposed medium and the evidence required for its milestones. The browser experiments are separate, bounded models; they do not implement this complete protocol or a shared spatial world.

The [First Answer journey](first-answer.md) carries a familiar courier through construction and a matching returned report, with a local ending checked by Rust. The next [ark control experiment](ark-control.md) uses the same local-program medium to connect one four-bit addition to two supplied service plans. Its [evaluation](ark-evaluation.md) separates arithmetic, retained control, and physical service. Repeated computation, distributed commitments, endogenous search, and the complete campaign remain separate gates.

## One organism, several roles

An organism is a finite body graph, bounded local policies assigned to its nodes, mutable state, and a lineage record. A courier, relay, memory, controller, and builder are roles those parts perform. They are not different species of executable code with unrelated score systems.

The player keeps using the same verbs: **inspect, change, connect, run, compare, keep, and reuse**. The external agent can supply reference blueprints or compile a wish into parts. A template expands into inspectable components with their full costs. Nobody must learn to hand-wire a processor to finish the adventure.

The [campaign](campaign.md) changes the scale and purpose of a working system. A courier's relay and memory help regulate an ark; the ark's controller helps a port honor commitments. Earlier artifacts remain actual components, with explicit adapters when an interface changes. The [migration-to-ark validation gate](design-validation.md#the-bridge-we-must-build-first) requires unchanged components to do causal work across tasks, checked by removal comparisons. A lineage label alone cannot establish reuse.

## Shared laws

The proposed `habitat-protocol/1` manifest pins every module version, numeric width, port type, body and memory bound, tick horizon, cost table, event schedule, and success checker. These identifiers name design targets, not released formats. Values must be calibrated before a release; a published version never silently changes old outcomes.

1. **Local information.** A node reads its own permitted state, adjacent terrain, and declared input ports. No remote-map read, hidden seed, evaluator label, network, filesystem, clock, or external agent enters a running organism.
2. **Explicit time.** At tick start, apply scheduled events and previously queued deliveries in manifest order. Activate each eligible node once in the manifest's seeded order over stable identities. Each bounded activation commits atomically; later nodes can see allowed committed local state. Apply service drains after the sweep. New signal deliveries and newly constructed nodes become eligible no earlier than the next tick. Overflow, conflict, and queue-full behavior are fixed by the module version.
3. **Bounded work.** Meter instruction evaluation, sensing, scheduling, state access, failed actions, copying, communication, and construction. Cap each activation and the whole expedition, including nested tests and children. Exhaustion ends an unfinished attempt; it cannot produce a pass.
4. **Separate quantities.** World sparks or construction stock obey their declared conservation rules. Execution fuel measures modeled work. Code bytes, live state, occupied space, and queued messages have their own bounds. Neither complexity nor a new program hash creates resources.
5. **Declared connections.** Ports specify type, width, direction, capacity, and delivery delay. Links have bounded endpoints and a declared reach or hop model. No instant broadcast or infinitely long free wire. Cross-module adapters are named, versioned, and charged; a sensor-to-signal adapter grants only the observation stated in its interface.
6. **Inspectable reuse.** A blueprint carries its policy and body definitions, dependencies, initialization, interface, and provenance. A reference to it does not erase its code, state, loading, execution, or communication costs. Preserve parent artifacts when constructing descendants.

This follows the proposed beacon engine's activation order while adding explicit module boundaries. It does not retroactively grant new senses to the first courier trial. The browser's `courier-lab-v1`, Float64 truth garden, and standalone signal experiments retain their own semantics and replay identities.

## Modules admitted to the design

| Proposed module | Primitive capability | Boundary and cost |
| --- | --- | --- |
| `transport/1` | Occupy a finite grid, observe allowed neighboring conditions, move one step, collect or deposit a bounded cargo | Collision resolution and cargo conservation are explicit; failed moves and transfers cost work |
| `signal/1` | Read and emit bounded digital values on declared local ports | Messages queue with explicit capacity and delay; sensing and routing cannot expose undeclared information |
| `memory/1` | Read or write bounded registers and finite addressable storage | Initialization, access, copying, and persistence are charged; bit widths and overflow behavior are fixed |
| `construction/1` | Read a finite blueprint, place a permitted part, connect compatible ports, and request activation of a valid assembly | Each placement, connection, copied byte, and activation pays; parts consume declared stock and space |

The earlier browser workbench assembles parts during player or agent setup, with initialization and loading charged at admission. The bounded [v3 Rust constructor](construction-evaluation.md) now moves prescribed single-cell assembly into the running world; broader multi-part construction remains proposed. It uses a finite catalog and validated templates, never native code. Partial assemblies remain inactive. A failed placement consumes work and leaves stock and occupancy unchanged; successful placement transfers stock into an accounted part without overwriting another organism.

Boolean gates, latches, adders, controllers, protocols, and search procedures are **compositions** of permitted rules and parts. They are not free high-level operations. A fractional-signal module would need separate precision, update-order, noise, and metering contracts; the truth garden does not silently add analog abilities to digital ports.

## Milestones depend on earlier creations

| Campaign dependency | Demonstrated capability | What must remain usable next |
| --- | --- | --- |
| Local recovery → migration | Deliver supplies, relay an identified report, retain it across an admitted interruption, and return an acknowledgment | The courier, route-recovery policy, and report memory |
| Migration → living ark | Compose logic, arithmetic, and programmable control to regulate multiple services | The relay and memory become control inputs; transport still supplies the services |
| Living ark → free ports | Fulfill bounded distributed commitments under declared delay, loss, and duplicate delivery | The same service controllers become independent endpoints |
| Free ports → bloom | Assemble a finite blueprint, then earn a separately checked process for generating and evaluating bounded candidates | Ports supply parts; existing controllers schedule construction and tests |
| Bloom → Across the Quiet | Sustain the integrated habitat, construct a needed continuation, and complete two-way contact | Actual admitted components from the earlier stages, or compatible replacements |

Each [chapter contract](campaign.md) specifies observable success. Starter identity and processor architecture are optional. References are free to inspect; alternatives pay the same costs and satisfy the same interfaces. Before recruiting players, require the [witnessed tradeoff and agent stress test](design-validation.md#keep-agency-when-the-agent-is-powerful): a fast or compact solution and a more resilient one must offer an actual choice on frozen cases.

## What counts as a computer?

An adder combines input numbers. A latch retains a bit. Neither alone is a stored-program computer.

The campaign requires **programmable control** at the ark: an assembly must run different admitted service plans and react to local feedback through its declared inputs. A table-driven controller, composed state machines, or a processor can qualify. Plans and controller programs are real supplied information whose loading and execution count.

The current bounded [ark control contract](ark-evaluation.md) gives this a small executable form. The same selector program reads either a low-bit or carry plan from supplied memory. A courier physically supplies one operand; local cells add the other and send the selected result to Keeper. After contact ends, that remembered bit controls a separate delivery. This is one calculation and one routing opportunity per saved world. Repeating the process, regulating a moving habitat, and integrating construction remain additional work.

An optional **computer-builder achievement** has a stricter contract: construct instruction storage, an instruction pointer, fetch and decode logic, working memory, control flow, and an output interface from admitted parts. Show the same assembled machine loading and executing multiple supplied instruction streams, including a data-dependent branch, then halting and resetting correctly. Publish its instruction semantics and complete bounded tests. A reference processor blueprint can teach this construction; its internals and costs remain visible.

Finite memory and episode limits still apply. This achievement demonstrates the stated bounded machine. A claim of universal computation needs an additional mathematical argument about a defined extensible model; no campaign badge supplies one.

## Constructor, searcher, and self-construction

A **finite blueprint assembler** builds a prescribed assembly from supplied instructions and stock. The checker compares its resulting body and wiring with the blueprint, tracks every resource transfer, and tests the finished artifact through its ordinary interface.

A **bounded searcher** must additionally generate candidate descriptions, execute them in an admitted test harness, record outcomes, and choose an output under a total budget. Candidate execution occupies real scheduled work; `search`, `evolve`, and `test a world` are not hidden free primitives. Its feedback is restricted to declared training cases. A selected candidate is checked separately after the search stops.

**Self-construction** is a later, different achievement: the assembled result includes the declared machinery and description needed to repeat the construction under the same permissions. Copying a blueprint file, instantiating an editor preset, or printing a self-description does not meet that contract. Neither construction nor self-construction establishes biological life or consciousness.

## Victory, replay, and scale

A chapter admission includes a successful reference witness and enough allowance for more than one viable approach. Freeze its finite inputs, permitted disturbances, service invariants, completion predicates, and limits before judging a run. Campaign constants remain provisional until calibrated; the [competitive rules](competition.md) retain their separate versioned divisions.

The finale checker verifies required services throughout the voyage, admitted construction, and the outbound message and reply before the deadline. A lit final frame is insufficient. Record initial state, artifact and dependency identities, versions, inputs, seeds, costs, failures, and trace identity. Independent replay must agree. Authored dialogue never changes the verdict.

Activate bounded regions, pause other regions explicitly, and declare how transfers occur between them. Retain checkpoints and replay inputs instead of requiring a continuously simulated galaxy. Compiled or cached components must preserve observable transitions, timing, and charged work over their certified domain; otherwise use ordinary simulation. The [scale proposal](complexity-and-scale.md) explains the missing performance evidence.

## Capability status

| Capability | Status and claim boundary |
| --- | --- |
| Courier portraits, one-courier journeys, local collection, truth maps, browser budget sample | Implemented browser demonstrations; see the [observatory guide](observatory.md) |
| Digital relay, gate, memory, arithmetic, and finite blueprint assembly | Bounded [Autoverse bench](https://platonik.space/lab#autoverse) prototypes in this website update; each identifies its actual model and tested scope |
| Shared spatial transport, signals, memory, and service routing | Implemented in the bounded [Rust bridge](rust-bridge.md); finite public fixtures, not the complete campaign protocol |
| In-world construction within that same runtime | [V3 finite constructor](construction-evaluation.md): acquire material, copy a declared body and links, activate it, and execute its ordinary policy. Multi-part machinery and endogenous design remain proposed |
| Arithmetic used by a supplied service plan | [Ark control](ark-evaluation.md): physical input, all five sum bits, two plans through one selector interface, and retained control of a separate payload; one calculation per fixed habitat |
| Full stored-program computer, autonomous candidate search, self-construction | Proposed achievements; an adder or prescribed assembler does not establish them |
| Persistent collection, local save and ancestry, closing-route field expedition | Implemented in the [field expedition](field-expedition.md), with separate bounded trials and frozen confirmation |
| Continuous physical state between visits | Implemented in the [continuous habitat](continuous-habitat.md): checked absolute-time advances preserve one bounded world; partial construction is preserved too; moving arks remain unimplemented |
| Rust campaign, living arks, distributed settlements, integrated finale | Proposed; no complete campaign or large ecology has been demonstrated |

The campaign has a finite ending. Continuing mastery comes from better designs, new reviewed habitats, larger admitted limits, and useful exported results. It depends on [research evidence](research.md#what-the-game-can-honestly-produce), not a promise that complexity must keep increasing.
