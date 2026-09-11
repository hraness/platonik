import Link from "next/link";
import { documents } from "@/lib/docs";

export function DocNav({ active }: { active?: string }) {
  return (
    <nav className="doc-nav" aria-label="Documentation">
      <Link href="/docs" aria-current={!active ? "page" : undefined}>Overview</Link>
      {documents.map((document) => <Link key={document.slug} href={`/docs/${document.slug}`} aria-current={active === document.slug ? "page" : undefined}>{document.title}</Link>)}
    </nav>
  );
}
