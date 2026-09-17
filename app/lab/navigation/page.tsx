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
  title: "Help a lost courier find its way",
  description: "Compare recorded Rust navigation failures with a checked repair. Inspect each courier's route, deliveries, and work in the same worlds.",
  alternates: { canonical: "/lab/navigation" },
  openGraph: { url: "/lab/navigation", siteName: site.name },
};

export default async function NavigationPage() {
  const index = JSON.parse(await readFile(path.join(process.cwd(), "public/navigation/index.json"), "utf8")) as ContinuityIndex;
  return <main id="main" className="lab bridge continuity">
    <header className="lab-header">
      <Link href="/lab">← Back to the observatory</Link>
      <h1>Help a lost courier find its way.</h1>
      <p>A reopened path can send a familiar courier in circles. A new program remembers where its trip is going. Compare both journeys, from the first pickup to the last delivery.</p>
      <p className="lab-note">Exact recorded Rust journeys. Choose a crew, follow its route, and inspect the deliveries and work that determine its outcome. This page displays saved results; it does not run a simulation.</p>
    </header>
    <ContinuityLab index={index} artifactDirectory="navigation" />
    <section className="lab-reading">
      <h2>Keep the failure in view.</h2>
      <p>The selected courier passed all 44 distinct worlds in a declared corridor comparison. The original wall follower passed 14; a compact shuttle passed 28. The repair costs more, and these results do not establish recovery in every unfamiliar habitat.</p>
      <p><Link href="/docs/navigation-evaluation">Read the failed search, repair, and complete comparisons →</Link></p>
      <p><Link href="/lab/habitat">Follow the earlier continuous habitats →</Link></p>
      <p><Link href="/docs/continuous-habitat">Run and resume a habitat with your agent →</Link></p>
    </section>
  </main>;
}