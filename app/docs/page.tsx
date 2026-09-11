import type { Metadata } from "next";
import Link from "next/link";
import { documents } from "@/lib/docs";
import { DocNav } from "@/components/doc-nav";

export const metadata: Metadata = { title: "Documentation", description: "Explore the Platonik game design, competition model, agent interface, and research foundations.", alternates: { canonical: "/docs" } };

export default function DocsPage() {
  return <main id="main" className="docs-layout"><aside className="docs-sidebar"><DocNav /></aside><article className="doc-content"><header className="doc-header"><h1>The field guide.</h1><p>How Platonik could work, what would make it worth playing, and what we might learn along the way.</p></header><p className="proposal-note">These are design documents. The game engine, agent skills, and ranked service are proposed; there is no playable release yet.</p><div className="document-list">{documents.map((document) => <Link href={`/docs/${document.slug}`} key={document.slug}><h2>{document.title}<span aria-hidden="true">↗</span></h2><p>{document.question}</p><span>{document.description}</span></Link>)}</div><section className="doc-next-step"><h2>The first thing to build</h2><p>One complete local experiment: breed a sorting colony, challenge it under damage, understand its behavior from a trace, and replay the result.</p><Link href="/docs/engine#first-playable-acceptance">Read the first-playable acceptance criteria</Link></section></article></main>;
}
