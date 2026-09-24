import type { Metadata } from "next";
import { Suspense } from "react";
import { LivingWorld } from "@/components/play/living-world";
import { site } from "@/lib/site";
import "../lab/lab.css";
import "./world.css";

export const metadata: Metadata = {
  title: "Play",
  description:
    "Open a living Platonik automation world, follow its creatures and supply routes, and build its next chapter with your own agent.",
  alternates: { canonical: "/play" },
  openGraph: { url: "/play", siteName: site.name },
};

export default function PlayPage() {
  return (
    <Suspense fallback={<main id="main" tabIndex={-1} className="world-page"><p className="world-loading" role="status">Opening the world…</p></main>}>
      <LivingWorld />
    </Suspense>
  );
}
