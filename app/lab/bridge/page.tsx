import type { Metadata } from "next";
import Link from "next/link";
import { BridgeLab } from "@/components/bridge-lab";
import "../lab.css";
import "./bridge.css";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "The first living circuit",
  description: "Replay real Rust experiments connecting a courier, signals, retained memory, and beacon control in one bounded habitat.",
  alternates: { canonical: "/lab/bridge" },
  openGraph: { url: "/lab/bridge", siteName: site.name },
};

export default function BridgePage() {
  return <main id="main" tabIndex={-1} className="lab bridge"><header className="lab-header">
    <Link href="/lab">← Back to the observatory</Link>
    <h1>The first living circuit.</h1>
    <p>A courier brings something home. A message travels. The connection goes dark. Can a small system remember what to do?</p>
    <p className="lab-note">Recorded Rust experiments. Every position, message, cost, and outcome below comes from the same bounded engine. The browser replays these records; it does not run or edit the Rust world.</p>
  </header><BridgeLab /><section className="lab-reading"><h2>Now give your agent a small ambition.</h2><p>Download a parent, change a copy, and compare both on the same cases. A failed child leaves the original intact.</p><Link href="/docs/rust-bridge">Run the CLI and understand the evidence →</Link><p><Link href="/docs/field-expedition">Keep a collection and play a field expedition →</Link></p><p><Link href="/docs/design-validation">What remains before the whole game is proven in play?</Link></p></section></main>;
}