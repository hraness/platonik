import type { Metadata } from "next";
import { PlayViewer } from "@/components/play-viewer";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Play",
  description: "Run a Platonik tutorial in your browser with the deterministic Rust engine compiled to WebAssembly.",
  alternates: { canonical: "/play" },
  openGraph: { url: "/play", siteName: site.name },
};

export default function PlayPage() {
  return (
    <main id="main" className="lab">
      <header className="lab-header">
        <h1>Make a creature. See what it does.</h1>
        <p>One fixed world, one courier, one beacon. Edit the courier&apos;s rules and run the Rust engine right here.</p>
      </header>
      <PlayViewer />
    </main>
  );
}
