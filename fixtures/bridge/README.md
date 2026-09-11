# Public bridge fixtures

These are small, frozen engineering cases for the Rust bridge. Their purpose is to test whether a courier, signals, retained state, and service control can work in one world with one cost ledger. They are public training and regression cases, not held-out research results or a player study.

The canonical definitions are in `crates/platonik-core/src/fixtures.rs`. Export them with the CLI's `example` command before editing. The `bridge-v1` suite records the full experiment and receipt for each case, including expected failures; a passing suite does not mean every organism completed its mission.

## Opening cases

- `opening-normal`: a compact local courier uses the direct corridor.
- `opening-normal-resilient`: a recovery policy runs in the same undamaged world and resource envelope.
- `opening-wounded`: the recovery policy begins on an initially damaged map while a feasible detour remains. This is not a wall appearing during a run.
- `opening-wounded-fast`: the unchanged compact policy meets that same initial damage. Its failure is an intended counterexample, preserved in a valid receipt.

The suite must establish the actual tradeoff before reporting it: lower work for the compact policy in the normal case, and successful recovery for the resilient policy where the compact policy fails. It awards no resilience points independently of simulation outcomes. A future policy that improves both results is welcome.

## Two service plans

`ark-plan-a` and `ark-plan-b` reuse the earlier courier policy without changing its code. The report bit belongs to a physical source spark; it is not a fixture name or privileged evaluator label. A physical deposit enables the depot's report. A neighboring relay carries it to the local controller, whose bounded memory retains it through interrupted contact. The service window opens after the interruption.

The controller routes the finite deposited stock to the service selected by that report. The suite tests both bit values and checks simple constant/alternating controls rather than assuming those baselines cannot work. A constant matched to a known plan is allowed to succeed; the comparison asks whether one unchanged controller succeeds on both plans. Public fixtures are visible to the external agent, so this is not a defense against agents specializing their submissions to each known case. All movement, failed actions, message handling, memory access, routing, world updates, and checks remain visible in the receipt's declared accounting model.

The reference habitat includes a stationary `Wait` body on the valve tile to preserve the courier corridor's boundary. It is loaded and scheduled under the same ledger. This explicit physical support is part of the architecture, not a free wall inserted by a controller.

Counterfactual copies disable the courier, relay, retention, or control while preserving the original fixture. The suite checks the resulting mission failures and links them to observed deliveries, messages, retained values, and service outcomes. Removing a whole pipeline is insufficient evidence that memory retention itself mattered; the memory counterfactual must distinguish a retained report from a still-live input.

## Reproduce and challenge

Save the exported parent, edit a copy, run both, and verify the resulting receipts. The runner's failure status describes the mission; receipt verification separately establishes that the recorded failure follows from the supplied experiment. Report all cases and all charged attempts.

The bridge is successful only if its declared predicates, causal comparisons, and artifact-reuse checks pass. It does not establish universal correctness, a full campaign, general intelligence, or progress on P versus NP. The site should display the generated Rust evidence, rather than recomputing a similar story in a second runtime.
