import type { Metadata } from "next";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ContinuityLab } from "@/components/continuity-lab";
import type { ContinuityIndex } from "@/lib/bridge/continuity";
import "../lab.css";
import "../bridge/bridge.css";
import "./habitat.css";

export const metadata: Metadata = {
  title: "Keep the same world alive",
  description: "Follow a Rust habitat through changing reports and saved checkpoints. Compare crews and inspect the exact carried state.",
  alternates: { canonical: "/lab/habitat" },
};

export default async function HabitatPage() {
  const index = JSON.parse(await readFile(path.join(process.cwd(), "public/habitat/index.json"), "utf8")) as ContinuityIndex;
  return <main id="main" className="lab bridge continuity"><header className="lab-header"><Link href="/lab">← Back to the observatory</Link><h1>Keep the same world alive.</h1><p>The next spark asks for something different. Both lights keep consuming energy. Can your crew keep them on?</p><p className="lab-note">Recorded Rust journeys. Cargo, memory, signals, service charge, and spent work persist across saved checkpoints. This page displays the records; your external agent drives the local CLI.</p></header><ContinuityLab index={index} /><section className="lab-reading"><h2>A step toward a living ark.</h2><p>The courier moves through one continuous habitat. This bounded camp does not yet construct itself or travel between worlds.</p><p><Link href="/lab/navigation">Investigate where the courier loses its way →</Link></p><p><Link href="/docs/continuous-habitat">Run and resume a habitat →</Link></p><p><Link href="/docs/continuity-evaluation">Read the agent comparisons and remaining limits →</Link></p></section></main>;
}
