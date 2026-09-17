import type { Metadata } from "next";
import Link from "next/link";
import { documents } from "@/lib/docs";
import { DocNav } from "@/components/doc-nav";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Documentation", description: "Play Platonik in your browser, then use the field guide to understand each track and what remains in design.", alternates: { canonical: "/docs" }, openGraph: { url: "/docs", siteName: site.name } };

const runnableSlugs = new Set(["field-expedition", "continuous-habitat", "first-answer", "ark-control", "port-commitments", "bloom", "composition-v5-gate", "challenges", "seasons"]);
const runnableDocuments = documents.filter(({ slug }) => runnableSlugs.has(slug));
const otherDocuments = documents.filter(({ slug }) => !runnableSlugs.has(slug));

function DocumentList({ entries }: Readonly<{ entries: ReadonlyArray<(typeof documents)[number]> }>) {
  return <div className="document-list">{entries.map((document) => <Link href={`/docs/${document.slug}`} key={document.slug}><h2>{document.title}<span aria-hidden="true">↗</span></h2><p>{document.question}</p><span>{document.description}</span></Link>)}</div>;
}

export default function DocsPage() {
  return <main id="main" className="docs-layout"><aside className="docs-sidebar"><DocNav /></aside><article className="doc-content"><header className="doc-header"><h1>The field guide.</h1><p>Start at <Link href="/play">/play</Link> to run the deterministic engine in this browser, then read a guide to understand what your agent can try next.</p></header><p className="proposal-note">The local Rust CLI, play skill, browser game, generated challenges, and hosted seasons are implemented. The six-chapter Long Trail, moving arks, player economy, and continuous campaign progression remain proposals.</p><section className="doc-next-step"><h2>Run what exists now</h2><p>Open <Link href="/play">/play</Link> for the opening, challenges, expedition, and journey tracks. Each track loads the same Rust engine that the CLI uses, and every runnable program gets a content-addressable URL your agent can share.</p><Link href="/play">Play in the browser</Link><span aria-hidden="true"> · </span><Link href="/docs/field-expedition">Read the first-camp guide</Link></section><DocumentList entries={runnableDocuments} /><section className="doc-next-step"><h2>Design, evidence, and reference</h2><p>The remaining guide separates the proposed campaign from implemented diagnostics, evaluations, cost measurements, and research questions.</p></section><DocumentList entries={otherDocuments} /></article></main>;
}
