import { readFile } from "node:fs/promises";
import path from "node:path";

export const documents = [
  {
    slug: "game-design",
    title: "The game",
    description: "Make a creature, keep a beacon alive, and follow a first rescue into a world that changes scale.",
    question: "What would it feel like to play?",
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
    slug: "economy",
    title: "The shared economy",
    description: "Research commissions, useful public discoveries, and an economy around your own laboratory.",
    question: "Who needs what your creature can do?",
  },
  {
    slug: "engine",
    title: "Agents & engine",
    description: "The proposed Rust engine, agent-facing CLI, skills, and the first playable milestone.",
    question: "How would an agent drive the game?",
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
  const match = /^([a-z-]+)\.md(#[\w-]+)?$/.exec(href);
  return match && findDocument(match[1]) ? `/docs/${match[1]}${match[2] ?? ""}` : href;
}
