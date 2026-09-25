import type { Metadata } from "next";
import Link from "next/link";
import { Observatory } from "@/components/observatory";
import { labPages } from "@/lib/lab-pages";
import "./lab.css";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "The observatory",
  description: "Explore executable organisms, fuzzy truth landscapes, world budgets, and an Autoverse signal workbench. Four local browser prototypes for Platonik.",
  alternates: { canonical: "/lab" },
  openGraph: { url: "/lab", siteName: site.name },
};

const recordings = labPages.map(({ path, name, description }) => ({ href: path, name, description }));

export default function LabPage() {
  return <main id="main" tabIndex={-1} className="lab">
    <header className="lab-header">
      <h1>A small window into possible life.</h1>
      <p>You are a frontier engineer. Grow a program, examine what it does, and find out what a larger world would cost.</p>
      <p className="lab-note">Four local browser experiments, with no AI calls or paid compute.</p>
    </header>
    <details className="lab-recordings hraness-material-disclosure">
      <summary>Recorded Rust experiments <span>{recordings.length} studies</span></summary>
      <p>A separate Rust prototype connects transport, signals, memory, arithmetic, control, finite construction, and bounded variation, and preserves that world between visits.</p>
      <nav aria-label="Recorded Rust experiments"><ul>{recordings.map(item => <li key={item.href}>
        <Link href={item.href}><strong>{item.name}</strong><span>{item.description} <span aria-hidden="true">↗</span></span></Link>
      </li>)}</ul></nav>
    </details>
    <Observatory />
  </main>;
}