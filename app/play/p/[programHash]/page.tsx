import type { Metadata } from "next";
import { Suspense } from "react";
import { PlayShell } from "@/components/play/play-shell";
import "../../../lab/lab.css";

type PageProps = { params: Promise<{ programHash: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { programHash } = await params;
  return {
    title: `Play Platonik · ${programHash.slice(0, 16)}…`,
    description: "Run a content-addressed Platonik program in your browser.",
    alternates: { canonical: `/play/p/${programHash}` },
  };
}

export default async function ProgramPage({ params }: PageProps) {
  const { programHash } = await params;
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
      <Suspense fallback={<p role="status">Loading the Platonik engine…</p>}>
        <PlayShell programHash={programHash} />
      </Suspense>
    </main>
  );
}
