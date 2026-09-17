import type { Metadata } from "next";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ContinuityLab } from "@/components/continuity-lab";
import type { ContinuityIndex } from "@/lib/bridge/continuity";
import "../lab.css";
import "../bridge/bridge.css";
import "../habitat/habitat.css";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "A promise can arrive before its reply",
  description: "Follow two recorded Rust courier commitments through physical handoffs, repeated requests, and delayed acknowledgments.",
  alternates: { canonical: "/lab/ports" },
  openGraph: { url: "/lab/ports", siteName: site.name },
};

export default async function PortsPage() {
  const index = JSON.parse(await readFile(path.join(process.cwd(), "public/ports/index.json"), "utf8")) as ContinuityIndex;
  return <main id="main" className="lab bridge continuity">
    <header className="lab-header">
      <Link href="/lab">← Back to the observatory</Link>
      <h1>A promise can arrive before its reply.</h1>
      <p>Two requesters are waiting for a parcel. Their couriers must make the handoff, confirm it, and leave the spare alone—even when a reply gets lost and a request arrives again.</p>
      <p className="lab-note">Exact recorded Rust habitats. Physical custody, acknowledgments and beacon service are checked separately. Scrubbing displays saved frames; your agent drives the local CLI.</p>
    </header>
    <ContinuityLab index={index} artifactDirectory="ports" />
    <section className="lab-reading">
      <h2>A small promise with a complete history.</h2>
      <p>The reference courier begins at its destination, waits for a request, collects one parcel, and drops it at the depot. After observing empty cargo, it retains the physical receipt and acknowledges the handoff. A repeated request must not send it back for the spare.</p>
      <p>This is a finite pair of one-shot commitments in one saved world. It does not establish a general messaging protocol, shared economy, or multiplayer service.</p>
      <p><Link href="/docs/port-commitments">Run this habitat with your agent →</Link></p>
      <p><Link href="/docs/ports-evaluation">Read the commitments contract and recorded comparisons →</Link></p>
      <p><Link href="/lab/ark">Follow the earlier ark control record →</Link></p>
    </section>
  </main>;
}