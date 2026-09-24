import Link from "next/link";
import { documents } from "@/lib/docs";

function DocLinks({ active }: { active?: string }) {
  return <>
      <Link href="/docs" aria-current={!active ? "page" : undefined}>Overview</Link>
      {documents.map((document) => <Link key={document.slug} href={`/docs/${document.slug}`} aria-current={active === document.slug ? "page" : undefined}>{document.title}</Link>)}
  </>;
}

export function DocNav({ active }: { active?: string }) {
  return <>
    <nav className="doc-nav doc-nav--desktop" aria-label="Documentation"><DocLinks active={active} /></nav>
    <details className="doc-navigation">
      <summary>Field guide</summary>
      <nav className="doc-nav" aria-label="Documentation"><DocLinks active={active} /></nav>
    </details>
  </>;
}
