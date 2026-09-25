import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PlayShell } from "@/components/play/play-shell";
import "../../../lab/lab.css";

type PageProps = { params: Promise<{ programHash: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { programHash } = await params;
  return {
    title: `Archived program · ${programHash.slice(0, 16)}…`,
    description: "Recompute an earlier content-addressed Platonik program in the archived browser laboratory.",
    alternates: { canonical: `/play/p/${programHash}` },
    robots: { index: false, follow: false },
  };
}

export default async function ProgramPage({ params }: PageProps) {
  const { programHash } = await params;
  return (
    <main id="main" tabIndex={-1} className="lab">
      <header className="lab-header">
        <p className="lab-note">Archived program laboratory</p>
        <h1>Recompute this program</h1>
        <p>This earlier share link remains runnable. The primary game now follows one persistent world built through your own agent.</p>
        <p><Link href="/play">Open the living world</Link></p>
      </header>
      <Suspense fallback={<p role="status">Loading the Platonik engine…</p>}>
        <PlayShell programHash={programHash} />
      </Suspense>
    </main>
  );
}
