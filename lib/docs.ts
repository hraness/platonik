import { readFile } from "node:fs/promises";
import path from "node:path";

export const documents = [
  {
    slug: "living-world-plan",
    title: "Grow one living world",
    description: "Play the Copperwake frontier, build its first production chain, and explore the next steps for logistics and scale.",
    question: "What can I build now, and what comes next?",
  },
  {
    slug: "game-design",
    title: "The game",
    description: "Make a creature, keep a beacon alive, and follow a first rescue into a world that changes scale.",
    question: "What would it feel like to play?",
  },
  {
    slug: "campaign",
    title: "The Long Trail",
    description: "The proposed six-chapter space western, plus the bounded Rust journeys that now implement pieces of its trail.",
    question: "What can I run now, and where could the whole journey lead?"
  },
  {
    slug: "autoverse",
    title: "The Autoverse path",
    description: "How transport, signals, memory, and construction become one engineering medium and an earned campaign.",
    question: "How does a companion become a civilization?",
  },
  {
    slug: "field-expedition",
    title: "Play a field expedition",
    description: "Keep a collection, survive a closing route, freeze a design, and check its next crossing through your agent.",
    question: "Can my agent take a creation through a persistent adventure?",
  },
  {
    slug: "continuous-habitat",
    title: "Carry one world forward",
    description: "Pause with cargo in hand or a report in flight, then resume the same checked Rust habitat.",
    question: "Can my crew keep its actual world between visits?",
  },
  {
    slug: "continuity-evaluation",
    title: "What survived the journey",
    description: "Changing reports, simpler competing controllers, exact continuation, and the measured cost of keeping a world.",
    question: "What did the next agent trials establish?",
  },
  {
    slug: "navigation-evaluation",
    title: "When the courier gets lost",
    description: "Two bounded searches, preserved failures, frozen navigation comparisons, and the cost of keeping a crew useful.",
    question: "Can an old creature learn a more reliable habit?",
  },
  {
    slug: "construction-evaluation",
    title: "Build someone who can help",
    description: "Finite material, copied bodies, useful offspring, and the measured cost of construction in one saved Rust habitat.",
    question: "Can the crew build its next useful member?",
  },
  {
    slug: "first-answer",
    title: "Bring a signal home",
    description: "Build two useful crew members, preserve an unfinished body, and earn a checked local ending through your agent.",
    question: "Can my crew complete a short adventure?",
  },
  {
    slug: "ark-control",
    title: "Give home a plan",
    description: "Carry a number, compute a result, and keep a service decision through a communications gap in one saved world.",
    question: "Can home follow a plan of its own?",
  },
  {
    slug: "ark-evaluation",
    title: "When home can choose",
    description: "Complete four-bit arithmetic, two supplied service plans, bounded agent comparisons, and the cost of saved control.",
    question: "Does the arithmetic change a real decision?",
  },
  {
    slug: "port-commitments",
    title: "Keep a promise",
    description: "Make a physical handoff, confirm it through lost replies, and leave the spare alone when a request returns.",
    question: "Can two homes rely on their couriers?",
  },
  {
    slug: "bloom",
    title: "Let the Bloom begin",
    description: "Derive two bounded courier variants, test them in the world, and let a physical report earn the next trip.",
    question: "Can a creation help choose what comes next?",
  },
  {
    slug: "bloom-evaluation",
    title: "What the Bloom established",
    description: "Reference habitats, causal-selection controls, replay evidence, and the next automated gate.",
    question: "Did the world learn from its own trial?",
  },
  {
    slug: "composition-v5-gate",
    title: "When a new organism keeps a promise",
    description: "Generated couriers, physical custody reports, child acknowledgments, and controls that distinguish delivery from a kept promise.",
    question: "Can the organism we just grew fulfill a real request?",
  },
  {
    slug: "exchange-capacity",
    title: "What a kept promise costs",
    description: "Measured execution, replay, memory, and retained evidence costs for a bounded generated-courier exchange.",
    question: "Can we afford to let agents search this habitat?",
  },
  {
    slug: "ports-evaluation",
    title: "What kept the promise",
    description: "Finite custody obligations, duplicate reports, agent comparisons, and the measured cost of reliable handoffs.",
    question: "Did the parcel arrive, and does its requester know?",
  },
  {
    slug: "answer-evaluation",
    title: "What earned the answer",
    description: "Frozen agent comparisons, physical signal provenance, restored journeys, and the measured cost of the complete local adventure.",
    question: "Does construction compose into an earned ending?",
  },
  {
    slug: "rust-bridge",
    title: "Run the Rust bridge",
    description: "Real shared-habitat experiments, exact replay artifacts, and an agent-facing CLI for testing what composes.",
    question: "Can I run and change the first integrated experiment?",
  },
  {
    slug: "agent-evaluation",
    title: "What the agents found",
    description: "Two persistent expeditions, every candidate and transfer result, adversarial checks, and the measured cost of replay.",
    question: "What happened when agents actually played?",
  },
  {
    slug: "design-validation",
    title: "Will the whole game work?",
    description: "Evidence from the first integration slice, remaining campaign tests, player-study thresholds, and decisions if the promise fails.",
    question: "What would justify confidence in the complete arc?",
  },
  {
    slug: "observatory",
    title: "The observatory",
    description: "Try editable specimens, truth landscapes, world budgets, and a bounded Autoverse signal workbench.",
    question: "What can I explore right now?",
  },
  {
    slug: "complexity-and-scale",
    title: "Complexity & scale",
    description: "Complexity as a tradeoff, a testable research thesis, and the engineering limits of larger ecologies.",
    question: "Could this produce useful computation?",
  },
  {
    slug: "symbols-and-facts",
    title: "Symbols & facts",
    description: "A growing Wittgenstein-inspired vocabulary for representation, composition, and checking what is true in a world.",
    question: "What can an organism learn to represent?",
  },
  {
    slug: "competition",
    title: "Competition",
    description: "A readable frontier rank, equal execution limits, and independently replayable results.",
    question: "What makes one organism better?",
  },
  {
    slug: "challenges",
    title: "Generated challenges",
    description: "A deterministic, growing eval: prompt your agent to write one program that survives unfamiliar seeded worlds.",
    question: "Can a harness solve what it has never seen?",
  },
  {
    slug: "seasons",
    title: "Hosted seasons",
    description: "Pull-request entries scored by CI on withheld, salt-committed cases — every result committed and replayable.",
    question: "Can a harness solve worlds nobody could show it?",
  },
  {
    slug: "economy",
    title: "The shared economy",
    description: "Research commissions, useful public discoveries, and an economy around your own laboratory.",
    question: "Who needs what your creature can do?",
  },
  {
    slug: "engine",
    title: "Agents & engine",
    description: "The implemented Rust journeys, agent-facing CLI, deterministic checks, and remaining campaign progression.",
    question: "How does an agent drive the game now?",
  },
  {
    slug: "storage",
    title: "Storage & cost",
    description: "Local experimentation, content-addressed artifacts, and a small hosted market with bounded costs.",
    question: "How could a shared world stay inexpensive?",
  },
  {
    slug: "research",
    title: "Research foundations",
    description: "Michael Levin, minimal collective computation, and a careful route toward complexity research.",
    question: "What could playing help us learn?",
  },
  {
    slug: "voices",
    title: "A voice on the wire",
    description: "A live account-gated renderer over checked wire digests, plus model, cost, boundary, and portability evidence.",
    question: "Who answers at the Far Beacon, and what can it know?",
  },
] as const;

export function findDocument(slug: string) {
  return documents.find((document) => document.slug === slug);
}

export async function readDocument(slug: string) {
  const document = findDocument(slug);
  if (!document) return null;
  const source = await readFile(path.join(process.cwd(), "docs", `${document.slug}.md`), "utf8");
  return { ...document, source, body: source.replace(/^# .+\n+/, "") };
}

export function documentHref(href: string) {
  const match = /^([a-z0-9-]+)\.md(#[\w-]+)?$/.exec(href);
  return match && findDocument(match[1]) ? `/docs/${match[1]}${match[2] ?? ""}` : href;
}
