import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { documents, findDocument, readDocument } from "@/lib/docs";
import { site } from "@/lib/site";
import { Markdown } from "@/components/markdown";
import { DocNav } from "@/components/doc-nav";

export const dynamicParams = false;
export function generateStaticParams() { return documents.map(({ slug }) => ({ slug })); }
type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const document = findDocument(slug);
  return document ? { title: document.title, description: document.description, alternates: { canonical: `/docs/${document.slug}` } } : {};
}

export default async function DocumentPage({ params }: PageProps) {
  const { slug } = await params;
  const document = await readDocument(slug);
  if (!document) notFound();
  const index = documents.findIndex((item) => item.slug === document.slug);
  const next = documents[index + 1];
  return <main id="main" className="docs-layout"><aside className="docs-sidebar"><DocNav active={document.slug} /></aside><article className="doc-content"><header className="doc-header"><h1>{document.title}</h1><p>{document.description}</p></header><Markdown>{document.body}</Markdown><footer className="doc-end"><a href={`${site.repository}/blob/main/docs/${document.slug}.md`}>View source on GitHub</a>{next ? <Link href={`/docs/${next.slug}`}>Next: {next.title} <span aria-hidden="true">↗</span></Link> : <Link href="/docs">Back to the field guide</Link>}</footer></article></main>;
}
