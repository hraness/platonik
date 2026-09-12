import type { Metadata } from "next";
import Link from "next/link";
import { Observatory } from "@/components/observatory";
import "./lab.css";

export const metadata: Metadata = {
  title: "The observatory",
  description: "Explore executable organisms, fuzzy truth landscapes, world budgets, and an Autoverse signal workbench. Four local browser prototypes for Platonik.",
  alternates: { canonical: "/lab" },
};

export default function LabPage() {
  return <main id="main" className="lab"><header className="lab-header"><h1>A small window into possible life.</h1><p>You are a frontier engineer. Grow a program, examine what it does, and find out what a larger world would cost.</p><p className="lab-note">Four local browser experiments, with no AI calls or paid compute. A separate Rust prototype connects transport, signals, memory, control, and finite construction, and preserves that world between visits.</p><p><Link href="/lab/answer">Bring a signal home with your crew →</Link><br /><Link href="/lab/construction">Build the crewmate the habitat needs →</Link><br /><Link href="/lab/navigation">Investigate a courier's navigation →</Link><br /><Link href="/lab/habitat">Follow a continuous habitat →</Link><br /><Link href="/lab/bridge">Replay the first shared Rust habitat →</Link></p></header><Observatory /></main>;
}
