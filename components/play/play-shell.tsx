"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loadEngine, type WasmModule, type Program } from "@/lib/play/engine";
import { unpackProgram, programHash, verifyProgram } from "@/lib/play/url";
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

function validateTrack(value: string | null): Track {
  const id = (value ?? "opening") as Track;
  return TRACKS.some((t) => t.id === id) ? id : "opening";
}

interface PlayShellProps {
  programHash?: string;
}

interface Initial {
  track: Track;
  case?: string;
  program?: Program;
  programUrl?: string;
  programHash: string;
  loading?: boolean;
  error?: string;
}

/**
 * The game shell: loads the WASM engine once, then routes between the four
 * playable tracks. It also reads URL state for the own-agent flow:
 * - `/play?mode=challenge&case=challenge-0001&program=<base64url>`
 * - `/play/p/<sha256>?mode=journey&case=continuity-000&program=<base64url>`
 * - `/play?mode=challenge&case=challenge-0001&programUrl=<agent-server-url>`
 *
 * The program packed in the query is verified against the path hash before the
 * engine runs it; the agent is free to host the program itself via `programUrl`.
 */
export function PlayShell({ programHash: pathHash }: PlayShellProps) {
  const searchParams = useSearchParams();
  const [wasm, setWasm] = useState<WasmModule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [track, setTrack] = useState<Track>("opening");
  const [initial, setInitial] = useState<Initial | null>(null);

  // Load the WASM engine once.
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

  // Parse and verify URL state once on mount / route change.
  useEffect(() => {
    let cancelled = false;

    const mode = searchParams.get("mode");
    const caseId = searchParams.get("case") ?? undefined;
    const packed = searchParams.get("program");
    const programUrl = searchParams.get("programUrl");
    const selected = validateTrack(mode);

    async function resolve() {
      if (packed) {
        try {
          const program = unpackProgram(packed);
          const computed = await programHash(program);
          if (pathHash && computed !== pathHash) {
            if (!cancelled) {
              setError(
                `The program does not match the content address ${pathHash.slice(0, 16)}… — it may have been altered.`,
              );
              setInitial({ track: selected, case: caseId, programHash: pathHash ?? computed });
            }
            return;
          }
          if (!cancelled) {
            setTrack(selected);
            setInitial({ track: selected, case: caseId, program, programHash: pathHash ?? computed });
          }
        } catch (cause) {
          if (!cancelled) setError(`The program URL is malformed: ${String(cause)}`);
        }
        return;
      }

      if (programUrl && pathHash) {
        try {
          const response = await fetch(programUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const text = await response.text();
          const ok = await verifyProgram(text, pathHash);
          if (!ok) {
            throw new Error("The fetched program does not match the path hash.");
          }
          const program = unpackProgram(text);
          if (!cancelled) {
            setTrack(selected);
            setInitial({ track: selected, case: caseId, program, programHash: pathHash });
          }
        } catch (cause) {
          if (!cancelled) {
            setError(
              `The program could not be loaded from ${programUrl}: ${cause instanceof Error ? cause.message : String(cause)}`,
            );
          }
        }
        return;
      }

      if (!cancelled) {
        setTrack(selected);
        setInitial({ track: selected, case: caseId, programHash: pathHash ?? "" });
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [searchParams, pathHash]);

  const programNotice = useMemo(() => {
    if (initial?.programHash) {
      return `Program ${initial.programHash.slice(0, 16)}… ${initial.program ? "(loaded from URL)" : ""}`;
    }
    return null;
  }, [initial]);

  if (error) {
    return (
      <p className="play-error" role="alert">
        {error}
      </p>
    );
  }
  if (!wasm || !initial) {
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
      {programNotice && <p className="play-notice lab-note">{programNotice}</p>}
      <section className="play-track-body">
        {track === "opening" && <OpeningMode wasm={wasm} initialMission={initial.case} initialProgram={initial.program} />}
        {track === "challenges" && (
          <ChallengeMode
            wasm={wasm}
            initialIndex={initial.case ? challengeIndexFromId(initial.case) : undefined}
            initialProgram={initial.program}
          />
        )}
        {track === "expedition" && <ExpeditionMode wasm={wasm} />}
        {track === "journeys" && (
          <JourneyMode
            wasm={wasm}
            initialJourney={initial.case ? initial.case.split("-")[0] : undefined}
            initialCase={initial.case}
            initialProgram={initial.program}
          />
        )}
      </section>
    </div>
  );
}

function challengeIndexFromId(id: string): number | undefined {
  const match = /^challenge-(\d{4})$/.exec(id);
  return match ? Number(match[1]) : undefined;
}
