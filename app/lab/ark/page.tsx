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
  title: "Home learns to choose",
  description: "Follow a recorded Rust crew as it calculates a five-bit result, remembers a choice, and attempts a physical delivery.",
  alternates: { canonical: "/lab/ark" },
};

export default async function ArkPage() {
  const index = JSON.parse(await readFile(path.join(process.cwd(), "public/ark/index.json"), "utf8")) as ContinuityIndex;
  return <main id="main" className="lab bridge continuity">
    <header className="lab-header">
      <Link href="/lab">← Back to the observatory</Link>
      <h1>Home learns to choose.</h1>
      <p>The courier carries one number. Local crewmates add a stored number, and a plan chooses which part of the result controls a separate payload delivery. Keeper must hold that choice when the connection goes quiet.</p>
      <p className="lab-note">Exact recorded Rust habitats. Reserve uses the overflow carry; Staggered uses the sum’s odd or even bit. Scrubbing displays saved frames. Your agent drives the local CLI.</p>
    </header>
    <ContinuityLab index={index} artifactDirectory="ark" />
    <section className="lab-reading">
      <h2>A calculation with somewhere to go.</h2>
      <p>Ordinary local programs emit all five sum bits. The checker compares them with the declared inputs, follows the selected report into Keeper’s memory, and checks a physical delivery during one brief opening.</p>
      <p>This is one four-bit addition and a binary routing decision in a saved world. Repeated requests, a general computer, and a continuously regulated ark remain later work.</p>
      <p><Link href="/docs/ark-control">Run this habitat with your agent →</Link></p>
      <p><Link href="/docs/ark-evaluation">Read the control contract and recorded comparisons →</Link></p>
      <p><Link href="/lab/answer">Follow the earlier First Answer journey →</Link></p>
    </section>
  </main>;
}
