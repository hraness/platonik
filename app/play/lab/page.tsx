import type { Metadata } from "next";
import { Suspense } from "react";
import { AgentSetupCard } from "@/components/play/agent-setup";
import { ProgressCard } from "@/components/play/progress-card";
import { ResumeCard } from "@/components/play/resume-card";
import { PlayShell } from "@/components/play/play-shell";
import "../../lab/lab.css";

export const metadata: Metadata = {
  title: "Archived play laboratory",
  description: "The earlier Platonik tutorial, challenge, expedition, and journey tracks.",
  alternates: { canonical: "/play/lab" },
  robots: { index: false, follow: false },
};

export default function PlayLabPage() {
  return (
    <main id="main" tabIndex={-1} className="lab">
      <header className="lab-header">
        <p className="lab-note">Earlier laboratory</p>
        <h1>Playable tracks</h1>
        <p>
          These bounded tutorials and scored fixtures remain available for inspection. The main game now follows one persistent automation world through your own agent.
        </p>
        <ResumeCard />
        <ProgressCard />
        <AgentSetupCard />
      </header>
      <Suspense fallback={<p role="status">Loading the Platonik engine…</p>}>
        <PlayShell />
      </Suspense>
    </main>
  );
}
