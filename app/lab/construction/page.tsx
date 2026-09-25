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
  title: "Build the crewmate you need",
  description: "Follow recorded Rust construction: gather material, copy a supplied blueprint, wire a child, and watch it work in the same saved habitat.",
  alternates: { canonical: "/lab/construction" },
  openGraph: { url: "/lab/construction", siteName: site.name },
};

export default async function ConstructionPage() {
  const index = JSON.parse(await readFile(path.join(process.cwd(), "public/construction/index.json"), "utf8")) as ContinuityIndex;
  return <main id="main" tabIndex={-1} className="lab bridge continuity">
    <header className="lab-header">
      <Link href="/lab">← Back to the observatory</Link>
      <h1>Build the crewmate you need.</h1>
      <p>The courier brings supplies. The relay carries their reports. One place in the crew is empty. A nearby builder has material and a blueprint for Keeper.</p>
      <p className="lab-note">Exact recorded Rust journeys. Follow the material into an inactive assembly, then inspect the child's actions and the services it reaches. Scrubbing displays saved frames; your agent operates the local CLI.</p>
    </header>
    <ContinuityLab index={index} artifactDirectory="construction" />
    <section className="lab-reading">
      <h2>Being built is only the beginning.</h2>
      <p>A child must execute ordinary rules in the same world. Copying a supplied blueprint has finite material and work costs; it does not discover a program or demonstrate self-reproduction.</p>
      <p><Link href="/docs/construction-evaluation">Read the construction rules and recorded comparisons →</Link></p>
      <p><Link href="/lab/navigation">Meet the courier from the earlier navigation study →</Link></p>
      <p><Link href="/docs/continuous-habitat">Run and resume a habitat with your agent →</Link></p>
    </section>
  </main>;
}