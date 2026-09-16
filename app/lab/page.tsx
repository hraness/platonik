import type { Metadata } from "next";
import Link from "next/link";
import { Observatory } from "@/components/observatory";
import "./lab.css";

export const metadata: Metadata = {
  title: "The observatory",
  description: "Explore executable organisms, fuzzy truth landscapes, world budgets, and an Autoverse signal workbench. Four local browser prototypes for Platonik.",
  alternates: { canonical: "/lab" },
};

const recordings = [
  { href: "/lab/challenges", name: "Challenges", description: "One program against worlds it never saw" },
  { href: "/lab/bloom", name: "Bloom", description: "Watch creations begin creating" },
  { href: "/lab/ports", name: "Ports", description: "Keep a promise when the reply goes missing" },
  { href: "/lab/ark", name: "Ark control", description: "Give home a plan it can carry out" },
  { href: "/lab/answer", name: "First Answer", description: "Bring a signal home with your crew" },
  { href: "/lab/construction", name: "Construction", description: "Build the crewmate the habitat needs" },
  { href: "/lab/navigation", name: "Navigation", description: "Investigate a courier's navigation" },
  { href: "/lab/habitat", name: "Continuous habitat", description: "Follow a continuous habitat" },
  { href: "/lab/bridge", name: "Shared habitat", description: "Replay the first shared Rust habitat" },
];

export default function LabPage() {
  return <main id="main" className="lab">
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
