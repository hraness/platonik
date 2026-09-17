import type { Metadata } from "next";
import Link from "next/link";
import { documents } from "@/lib/docs";
import { DocNav } from "@/components/doc-nav";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Documentation", description: "Run Platonik's bounded Rust journeys, inspect replayable experiments, enter hosted challenges, and explore the proposed Long Trail.", alternates: { canonical: "/docs" }, openGraph: { url: "/docs", siteName: site.name } };

const runnableSlugs = new Set(["field-expedition", "continuous-habitat", "first-answer", "ark-control", "port-commitments", "bloom", "composition-v5-gate", "challenges", "seasons"]);
const runnableDocuments = documents.filter(({ slug }) => runnableSlugs.has(slug));
const otherDocuments = documents.filter(({ slug }) => !runnableSlugs.has(slug));

function DocumentList({ entries }: Readonly<{ entries: ReadonlyArray<(typeof documents)[number]> }>) {
  return <div className="document-list">{entries.map((document) => <Link href={`/docs/${document.slug}`} key={document.slug}><h2>{document.title}<span aria-hidden="true">↗</span></h2><p>{document.question}</p><span>{document.description}</span></Link>)}</div>;
}

export default function DocsPage() {
  return <main id="main" className="docs-layout"><aside className="docs-sidebar"><DocNav /></aside><article className="doc-content"><header className="doc-header"><h1>The field guide.</h1><p>Run the bounded journeys that exist now, inspect their evidence, or follow the design toward the larger game.</p></header><p className="proposal-note">The local Rust CLI, play skill, replayable journeys, generated challenges, and hosted seasons are implemented. The six-chapter Long Trail, moving arks, player economy, and continuous campaign progression remain proposals.</p><section className="doc-next-step"><h2>Run what exists now</h2><p>Start at the first camp, carry one saved world through contact and control, or enter a program in the open hosted season. Each guide names exact commands, limits, evidence, and what the result does not establish.</p><Link href="/docs/field-expedition">Take a companion to the first camp</Link></section><DocumentList entries={runnableDocuments} /><section className="doc-next-step"><h2>Design, evidence, and reference</h2><p>The remaining guide separates the proposed campaign from implemented diagnostics, evaluations, cost measurements, and research questions.</p></section><DocumentList entries={otherDocuments} /></article></main>;
}
