import type { Metadata } from "next";
import { PlayShell } from "@/components/play/play-shell";
import { site } from "@/lib/site";
import "../lab/lab.css";

export const metadata: Metadata = {
  title: "Play",
  description:
    "Play Platonik in your browser: run the deterministic Rust engine on challenges, a field expedition, and continuous habitats — no install, no account.",
  alternates: { canonical: "/play" },
  openGraph: { url: "/play", siteName: site.name },
};

export default function PlayPage() {
  return (
    <main id="main" className="lab">
      <header className="lab-header">
        <h1>Play Platonik</h1>
        <p>
          Write a program, run the deterministic engine in this tab, watch the replay. No install,
          no account — your saves stay in this browser.
        </p>
        <p className="lab-note">
          Every run produces a receipt the Rust engine can independently verify — the same engine
          behind the command line and the hosted seasons.
        </p>
      </header>
      <PlayShell />
    </main>
  );
}
