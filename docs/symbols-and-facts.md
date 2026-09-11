# Symbols and facts

Design proposal and working glossary, 11 September 2026. These ideas extend Platonik's proposed game; the Rust engine and mechanics described here are not implemented. The glossary can grow as the reading develops. Philosophical definitions, game adaptations, and observed results remain distinct.

## Give an organism a way to describe its world

A creature can inherit more than an action rule. It can inherit a useful way of grouping observations: a courier carrying a spark toward a blocked space, a local configuration that permits a repair, or a remembered signal that predicts trouble. Breeding can change how these descriptions are composed and how a policy responds to them.

The player names a pattern, inspects its parts, and asks whether it represents something useful. A new name earns its place when it helps an organism act in unfamiliar conditions. Naming alone does not change the world or establish a fact.

This adds a representation experiment to the existing loop: **observe a relation → describe it → combine descriptions → act → check the world**. It does not require a new score or a separate resource economy.

In the first beacon expedition, start with “carrying a spark” and “blocked ahead.” Combine them into a condition, inspect its parts, and choose what a copied creature should do when both hold. Whether that condition is true in a recorded moment is a separate, checkable question. The formal vocabulary can wait until the player wants it.

## A growing vocabulary

These four entries begin the glossary. The simple/complex symbol wording and the distinction between the two German terms closely follow Bertrand Russell's introduction to the *Tractatus*. In that introduction, Sachverhalte are not compound facts, and a Tatsache may be compound. In the main text, propositions 2 and 2.01 distinguish a fact from a configuration of objects; translations render *Sachverhalt* as “atomic fact” or “state of affairs.” [Tractatus and Russell's introduction](https://courses.umass.edu/klement/tlp/tlp.html).

| Term | Working reading | Adaptation in Platonik |
| --- | --- | --- |
| **Simple symbol** | A symbol with no parts that themselves function as symbols. | A leaf in the declared game language, such as a local reference or literal. This is simplicity relative to that language, not a claim that a simulated cell is metaphysically simple. |
| **Complex symbol** | A structured symbol whose symbolic parts contribute to the whole. | A typed expression whose constituents and arrangement can be inspected, mutated, or recombined. Giving it a short alias does not erase its structure. |
| **Sachverhalt**; plural **Sachverhalte** | A state of affairs: objects configured together. In Russell's account, it is not compounded of other facts. It is not restricted to a relation between exactly two symbols. | A possible configuration of game objects. An expression represents that possibility; the configuration itself belongs to the simulated world. |
| **Tatsache**; plural **Tatsachen** | A fact: what is the case. It may include several states of affairs; “two or more” is not a requirement. | A condition that holds in the authoritative world at a specified time and scope. The notebook records a checked claim and evidence about that fact. A verified conjunction can record several facts together; call it a compound fact when that distinction matters. |

The game mapping is a design choice, not an interpretation claiming to settle the *Tractatus*. In particular, game predicates can constrain one another; they do not automatically have the logical independence attributed to elementary propositions in the book.

## Keep the description separate from the situation

In the later sorting habitat's observer notebook, let `a` and `b` name two cells. The expression `left_of(a, b)` represents a possible relation. It can be true or false at a particular snapshot. If the engine confirms it there, the notebook can attach evidence to that claim. The expression itself is not the pair of cells, and a well-formed expression is not automatically true.

Now combine it with a second expression:

```text
left_of(a, b) AND value(a) > value(b)
```

This illustrative expression describes an inversion, using a strictly-left-of relation whose meaning must be fixed by the language. The two parts can be evaluated separately. If both hold at the same snapshot, their conjunction holds there. If the observation is unavailable, the notebook records it as unknown rather than false. Unknown describes missing evidence, not a third truth value in the philosophical account. A malformed or ill-typed expression is rejected as invalid, separately from either outcome.

Notebook descriptions can refer to the full recorded world. Organisms retain their limited sensors: a cell may use `self` and a visible neighbor, but cannot read global identities, other policies, or hidden evaluator information because the player has named them. No notebook assertion becomes a free sensor.

## A language, a sensor, and a world

Wittgenstein's proposition 5.6 connects the limits of language and world. Platonik uses that as a question for experiment: what changes when a creature gets a richer way to describe the same observations? This is a design adaptation, not a literal implementation of the philosophical claim. [Tractatus, 5.6](https://courses.umass.edu/klement/tlp/tlp.html).

Keep three interventions separate. A new **name** can abbreviate an existing expression without changing its behavior. A new **representation** can reorganize the same information into rules the agent finds easier to compose. A new **sensor** can supply information the creature previously lacked. Compare names with their expansions, representations under matched information and costs, and sensor changes only in challenges that explicitly permit them.

Ask the agent to show a cell's local view beside the complete recorded world. Missing local evidence does not make the unseen part nonexistent. It identifies the observer boundary. The chat agent's explanation, the program's internal state, and the world state are different objects; none is a direct measurement of subjective experience.

## Three experiments to play

**Name the useful relation.** After a sorting trial, identify a recurring local inversion. Define a parameterized expression for it, inspect its expansion, and use it as a condition in a copied policy. Changed values and held-out worlds test generalization. Separately, rename the observer's cells while preserving their bindings: replay should remain identical because those labels are not policy inputs. Compare the alias with its expanded condition for identical behavior and correctly accounted costs. Reusing a name may help the player or agent compose rules without improving the organism's execution; measure those benefits separately.

**Breed a description.** Cross compatible fragments of two conditions, then choose which action the child takes when its new condition holds. Run both parents and the child on matched worlds. Disable one condition in a copy to investigate its contribution. A suggestive name such as “repairable” is a hypothesis about behavior, not permission to mark the repair successful. The notebook also makes room for refutation: a claim that “a disabled cell cannot move” can be defeated by a single recorded exchange involving that passive cell. Keep that counterexample with the original claim.

**Transplant a vocabulary.** Move a genome and its definitions to a new body or activation schedule. Preserve every definition and the sensor contract, documenting any unavoidable changes. Does the same local description remain useful? Compare immediate performance with a separately adapted descendant. Later tissues can exchange bounded messages carrying these descriptions; receivers must learn or share the interpretation rather than receiving truth by declaration.

Naming a useful condition can begin after the introductory beacon rescue; the sorting example above belongs to a later research habitat. Crossovers of conditions can use the existing typed-rule breeding system. Vocabulary transplantation and communication belong to later chapters; they do not expand the first playable release into a general symbolic reasoning engine.

## Names are not free computation

An alias such as `mend` must resolve to a finite, inspectable definition. If it abbreviates a hundred operations, those operations still count. Stored definitions, argument binding, message transfer, and evaluation consume the resources specified by the engine's cost model. Recursive or cyclic definitions remain outside the first language.

A compact description can make search easier or expose a useful regularity, but compact notation is not evidence of a faster algorithm. Ranked organisms still win by solving the same challenges within the same limits. Extra symbols, longer fact lists, and renamed duplicates earn no points.

The proposed notebook separates definitions, unchecked claims, snapshot checks, and conclusions about a batch of trials. A checked statement about one snapshot does not become an invariant or a theorem through repeated copying. A broader claim needs its own test or proof.

## How this glossary grows

Add a dated entry with the term, source passage, provisional reading, proposed mechanic, and an example or counterexample that makes the distinction concrete. Mark revisions explicitly. A revised reading can improve the design without rewriting an old experiment's definitions or results; executable definitions and their interpretation stay versioned with each run.

Use English in ordinary play—symbol, expression, situation, checked fact—and retain the German terms as optional lenses in the notebook. The vocabulary should help a player ask a better question without requiring them to learn a philosophical taxonomy before meeting their first creature.

Continue with [the game design](game-design.md), [the engine's representation boundary](engine.md#representations-and-checked-facts), or [the research connection](research.md#wittgenstein-and-representation).
