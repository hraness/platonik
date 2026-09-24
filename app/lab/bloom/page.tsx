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
  title: "Your creations begin creating",
  description: "Follow two recorded Rust couriers from local program changes through physical trials, selection, and a later confirmation.",
  alternates: { canonical: "/lab/bloom" },
  openGraph: { url: "/lab/bloom", siteName: site.name },
};

export default async function BloomPage() {
  const index = JSON.parse(await readFile(path.join(process.cwd(), "public/bloom/index.json"), "utf8")) as ContinuityIndex;
  return <main id="main" tabIndex={-1} className="lab bridge continuity">
    <header className="lab-header">
      <Link href="/lab">← Back to the observatory</Link>
      <h1>Your creations begin creating.</h1>
      <p>Two builders alter copies of the same courier program. Their children try the world for themselves. A local selector watches the results and sends one courier on another trip.</p>
      <p className="lab-note">Exact recorded Rust habitats. Edits, physical trials, selection, and confirmation are checked separately. Scrubbing displays saved frames; your agent drives the local CLI.</p>
    </header>
    <ContinuityLab index={index} artifactDirectory="bloom" />
    <section className="lab-reading">
      <h2>A first experiment made inside the world.</h2>
      <p>The builders change two direction instructions in a shared seed, pay for the copied bytes, and activate their children using finite material. The children carry real parcels. A local report selects one candidate, and a later parcel tests whether that choice works again.</p>
      <p>This is one bounded round with two candidates and supplied trial stations. Repeated generations, open-ended evolution, and useful outside discoveries remain further experiments.</p>
      <p><Link href="/docs/bloom">Run this habitat with your agent →</Link></p>
      <p><Link href="/docs/bloom-evaluation">Read the Bloom contract and recorded comparisons →</Link></p>
      <p><Link href="/lab/ports">Follow the earlier courier commitments →</Link></p>
    </section>
  </main>;
}