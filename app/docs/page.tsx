import type { Metadata } from "next";
import Link from "next/link";
import { DocNav } from "@/components/doc-nav";
import { documents } from "@/lib/docs";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Documentation",
  description: "Build one persistent Platonik world through your own agent, then inspect the engine, evidence, and larger design.",
  alternates: { canonical: "/docs" },
  openGraph: { url: "/docs", siteName: site.name },
};

const runnableSlugs = new Set(["field-expedition", "continuous-habitat", "first-answer", "ark-control", "port-commitments", "bloom", "composition-v5-gate", "challenges", "seasons"]);
const runnableDocuments = documents.filter(({ slug }) => runnableSlugs.has(slug));
const otherDocuments = documents.filter(({ slug }) => !runnableSlugs.has(slug));

function DocumentList({ entries }: Readonly<{ entries: ReadonlyArray<(typeof documents)[number]> }>) {
  return <div className="document-list">{entries.map((document) => <Link href={`/docs/${document.slug}`} key={document.slug}><h2>{document.title}<span aria-hidden="true">↗</span></h2><p>{document.question}</p><span>{document.description}</span></Link>)}</div>;
}

export default function DocsPage() {
  return (
    <main id="main" className="docs-layout">
      <aside className="docs-sidebar"><DocNav /></aside>
      <article className="doc-content">
        <header className="doc-header">
          <h1>The field guide.</h1>
          <p>Platonik is now one persistent automation world operated by your agent and observed in the browser. Start with the world; open technical detail only when it helps.</p>
        </header>
        <p className="proposal-note">
          The Dustlight world, agent CLI, bounded interventions, facility placement, repeatable production, replay, and content-addressed views are implemented. Deeper recipe trees, more facility kinds, larger regions, and the complete Long Trail remain in design.
        </p>
        <section className="doc-next-step">
          <h2>Start here</h2>
          <p>Open Dustlight to follow its working routes. Copy the agent ask when you want to build or improve something. The browser is a verified renderer; your agent keeps the authoritative JSON world.</p>
          <Link href="/play">Open the living world</Link><span aria-hidden="true"> · </span><Link href="/docs/engine#the-living-world-command-surface">Use the world CLI</Link>
        </section>
        <section className="doc-next-step">
          <h2>Earlier bounded studies</h2>
          <p>These focused journeys remain executable evidence for transport, memory, control, construction, promises, variation, and competition. They are no longer presented as separate foreground game modes.</p>
        </section>
        <DocumentList entries={runnableDocuments} />
        <section className="doc-next-step">
          <h2>Design, evidence, and reference</h2>
          <p>The remaining guide separates the larger proposed world from implemented diagnostics, measurements, and research questions.</p>
        </section>
        <DocumentList entries={otherDocuments} />
      </article>
    </main>
  );
}
