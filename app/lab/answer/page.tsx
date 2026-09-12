import type { Metadata } from "next";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ContinuityLab } from "@/components/continuity-lab";
import type { ContinuityIndex } from "@/lib/bridge/continuity";
import "../lab.css";
import "../bridge/bridge.css";
import "../habitat/habitat.css";

export const metadata: Metadata = {
  title: "The First Answer",
  description: "Follow one saved Rust crew as it gathers supplies, builds two companions, and attempts a physically traced reply.",
  alternates: { canonical: "/lab/answer" },
};

export default async function AnswerPage() {
  const index = JSON.parse(await readFile(path.join(process.cwd(), "public/answer/index.json"), "utf8")) as ContinuityIndex;
  return <main id="main" className="lab bridge continuity">
    <header className="lab-header">
      <Link href="/lab">← Back to the observatory</Link>
      <h1>The First Answer.</h1>
      <p>The familiar courier brings supplies. Keeper must be built to put them to use. A second new companion carries a reply back to the waiting receiver.</p>
      <p className="lab-note">Exact recorded Rust journeys in one saved world. A matching reply must trace back to a physically delivered spark, and the services must survive the whole journey. Scrubbing displays saved frames; your agent drives the local CLI.</p>
    </header>
    <ContinuityLab index={index} artifactDirectory="answer" />
    <section className="lab-reading">
      <h2>A small ending, earned together.</h2>
      <p>The supplied blueprints and finite materials make this a bounded construction and communication task. The ending text is authored; earning it depends on checked actions. This is one connected journey, not the complete six-chapter campaign.</p>
      <p><Link href="/docs/first-answer">Start a journey with your agent →</Link></p>
      <p><Link href="/docs/answer-evaluation">Read the contract and recorded comparisons →</Link></p>
      <p><Link href="/lab/construction">Inspect the earlier construction task →</Link></p>
      <p><Link href="/docs/continuous-habitat">Run and resume a habitat with your agent →</Link></p>
    </section>
  </main>;
}
