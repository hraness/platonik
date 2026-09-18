import type { Metadata } from "next";
import { Suspense } from "react";
import { AgentSetupCard } from "@/components/play/agent-setup";
import { PlayShell } from "@/components/play/play-shell";
import { site } from "@/lib/site";
import "../lab/lab.css";

export const metadata: Metadata = {
  title: "Play",
  description:
    "Play Platonik in your browser: open a shareable program link from your agent, or write and run a program right here — no install, no account.",
  alternates: { canonical: "/play" },
  openGraph: { url: "/play", siteName: site.name },
};

export default function PlayPage() {
  return (
    <main id="main" className="lab">
      <header className="lab-header">
        <h1>Play Platonik</h1>
        <p>
          Open a link your agent shared, or write a program in this tab and run the deterministic
          engine. No install, no account — every program hash is checked before it runs, and your
          saves stay in this browser.
        </p>
        <p className="lab-note">
          Your agent can send you a content-addressable URL like
          /play/p/&lt;hash&gt;?mode=challenges&amp;case=challenge-0001&amp;program=…
          The browser verifies the program against the hash, loads the same case, and replays it.
        </p>
        <AgentSetupCard />
      </header>
      <Suspense fallback={<p role="status">Loading the Platonik engine…</p>}>
        <PlayShell />
      </Suspense>
    </main>
  );
}
