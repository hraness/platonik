"use client";

import { useEffect, useState } from "react";
import { loadEngine, type WasmModule } from "@/lib/play/engine";
import { OpeningMode } from "./opening-mode";
import { ChallengeMode } from "./challenge-mode";
import { ExpeditionMode } from "./expedition-mode";
import { JourneyMode } from "./journey-mode";

type Track = "opening" | "challenges" | "expedition" | "journeys";

const TRACKS: { id: Track; title: string; detail: string }[] = [
  { id: "opening", title: "First run", detail: "Learn the loop in one minute." },
  { id: "challenges", title: "Challenges", detail: "96 scored worlds — write a program that generalizes." },
  { id: "expedition", title: "Expedition", detail: "A persistent campaign: grow couriers, freeze a pair, cross over." },
  { id: "journeys", title: "Journeys", detail: "Continuous habitats: build, route arks, hold ports, bloom." },
];

/**
 * The game shell: loads the WASM engine once, then routes between the four
 * playable tracks. No server calls — the engine runs in this tab.
 */
export function PlayShell() {
  const [wasm, setWasm] = useState<WasmModule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [track, setTrack] = useState<Track>("opening");

  useEffect(() => {
    let cancelled = false;
    loadEngine()
      .then((m) => {
        if (!cancelled) setWasm(m);
      })
      .catch((cause) => {
        if (!cancelled)
          setError(
            `The Platonik engine failed to load: ${cause instanceof Error ? cause.message : String(cause)}`
          );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p className="play-error" role="alert">
        {error}
      </p>
    );
  }
  if (!wasm) {
    return <p role="status">Loading the Platonik engine…</p>;
  }

  return (
    <div className="play-shell">
      <nav className="play-tracks" aria-label="Game tracks">
        {TRACKS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`play-track ${track === item.id ? "active" : ""}`}
            onClick={() => setTrack(item.id)}
            aria-pressed={track === item.id}
          >
            <span className="play-track-title">{item.title}</span>
            <span className="play-track-detail">{item.detail}</span>
          </button>
        ))}
      </nav>
      <section className="play-track-body">
        {track === "opening" && <OpeningMode wasm={wasm} />}
        {track === "challenges" && <ChallengeMode wasm={wasm} />}
        {track === "expedition" && <ExpeditionMode wasm={wasm} />}
        {track === "journeys" && <JourneyMode wasm={wasm} />}
      </section>
    </div>
  );
}
