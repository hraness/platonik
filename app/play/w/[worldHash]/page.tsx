import type { Metadata } from "next";
import { Suspense } from "react";
import { LivingWorld } from "@/components/play/living-world";
import "../../../lab/lab.css";
import "../../world.css";

type PageProps = { params: Promise<{ worldHash: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { worldHash } = await params;
  const decoded = decodeURIComponent(worldHash);
  return {
    title: `Living world · ${decoded.slice(0, 12)}…`,
    description: "Inspect a content-addressed Platonik automation world recomputed by the Rust engine.",
    alternates: { canonical: `/play/w/${worldHash}` },
    robots: { index: false, follow: false },
  };
}

export default async function WorldPage({ params }: PageProps) {
  const { worldHash } = await params;
  const decoded = decodeURIComponent(worldHash);
  return (
    <Suspense fallback={<main id="main" className="world-page"><p className="world-loading" role="status">Opening the world…</p></main>}>
      <LivingWorld expectedHash={decoded} />
    </Suspense>
  );
}
