"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { engine, loadEngine, type LivingWorld, type WasmModule, type WorldReport } from "@/lib/play/engine";
import { latestWorld, saveWorld } from "@/lib/play/saves";
import { unpackWorld } from "@/lib/play/world-url";
import { WorldStage } from "./world-stage";

export function LivingWorld({ expectedHash }: { expectedHash?: string }) {
  const searchParams = useSearchParams();
  const [wasm, setWasm] = useState<WasmModule>();
  const [world, setWorld] = useState<LivingWorld>();
  const [report, setReport] = useState<WorldReport>();
  const [error, setError] = useState("");
  const [importError, setImportError] = useState("");
  const [copied, setCopied] = useState(false);
  const packed = searchParams.get("world");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const runtime = await loadEngine();
        let value: LivingWorld;
        if (packed) {
          value = unpackWorld(packed);
        } else {
          const cached = await Promise.race([
            latestWorld(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 400)),
          ]);
          if (cached) {
            value = cached.world;
          } else {
            value = engine.worldNew(runtime, "Dustlight");
            value = engine.worldApply(runtime, value, { kind: "advance", ticks: 64 });
          }
        }
        const nextReport = engine.worldReport(runtime, value);
        if (expectedHash && nextReport.world_hash !== expectedHash) {
          throw new Error("This world does not match the content address in the path.");
        }
        if (!cancelled) {
          setWasm(runtime);
          setWorld(value);
          setReport(nextReport);
          await saveWorld(value, nextReport.world_hash);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [expectedHash, packed]);

  useEffect(() => {
    if (report && window.location.hash === "#world-agent-title") {
      document.getElementById("world-agent-title")?.scrollIntoView();
    }
  }, [report]);

  const agentPrompt = useMemo(() => {
    if (!report) return "";
    const context = expectedHash && typeof window !== "undefined"
      ? `Continue this exact world view with \`platonik world open-link '${window.location.href}' > continued.world.json\`.`
      : "Start a new living world for me with `platonik world new`, or continue the world JSON I attach.";
    return `Play Platonik with me. ${context}\n\nClone https://github.com/hraness/platonik and read skills/platonik-play/SKILL.md. Inspect the world before changing it. Preserve the existing save, make one understandable improvement or expansion within a bounded run, explain what changed in plain language, then use \`platonik world link\` to send me the updated browser view. The browser is only the renderer; keep the authoritative JSON world in the local checkout. Current view: ${report.name}, revision ${report.revision}, tick ${report.tick}, hash ${report.world_hash}.`;
  }, [expectedHash, report]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(agentPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  function downloadWorld() {
    if (!world || !report) return;
    const blob = new Blob([JSON.stringify(world, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${report.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-r${report.revision}.world.json`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  async function openWorld(file: File | undefined) {
    if (!file || !wasm) return;
    try {
      const value = JSON.parse(await file.text()) as LivingWorld;
      const nextReport = engine.worldReport(wasm, value);
      if (expectedHash && nextReport.world_hash !== expectedHash) {
        throw new Error("That file is a different world revision. Open it from the main world page.");
      }
      setWorld(value);
      setReport(nextReport);
      setImportError("");
      await saveWorld(value, nextReport.world_hash);
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  if (error) {
    return (
      <main id="main" className="world-page">
        <section className="world-error" role="alert">
          <p className="world-kicker">World unavailable</p>
          <h1>This view could not be verified.</h1>
          <p>{error}</p>
          <Link href="/play">Open the homestead</Link>
        </section>
      </main>
    );
  }

  if (!report || !world) {
    return (
      <main id="main" className="world-page">
        <header className="world-header">
          <div>
            <p className="world-kicker">Living world</p>
            <h1>Opening the world</h1>
            <p>Recomputing its creatures, supplies, construction, and recent movement.</p>
          </div>
        </header>
        <div className="world-stage world-loading" role="status"><span>Opening the world…</span></div>
      </main>
    );
  }

  const lastEvent = world.events.at(-1) as { kind?: string; cell?: number } | undefined;
  const change = lastEvent?.kind === "program_changed"
    ? `${cellName(lastEvent.cell)} has a new working habit.`
    : report.summary.constructed_cells > 1
      ? "The foundry added carrying capacity to both routes."
      : report.summary.constructed_cells > 0
        ? "The foundry raised a second courier route."
        : "The homestead's first light route is running.";

  return (
    <main id="main" className="world-page">
      <header className="world-header">
        <div>
          <p className="world-kicker">Living world · revision {report.revision}</p>
          <h1>{report.name}</h1>
          <p>{change} Follow a creature, watch supplies move, then ask your agent what to build next.</p>
        </div>
        <div className="world-identity">
          <span>Tick {report.tick}</span>
          <span title={report.world_hash}>{report.world_hash.slice(0, 12)}…</span>
          <span>Recomputed locally</span>
        </div>
      </header>

      <WorldStage report={report} />

      <section className="world-agent" aria-labelledby="world-agent-title">
        <div>
          <p className="world-kicker">Your workbench</p>
          <h2 id="world-agent-title">Explore with your agent.</h2>
          <p>
            Tell it what you want: a steadier route, another courier, less congestion, or a stranger experiment.
            It changes the checked local world and sends back a new view. This page never edits or advances it.
          </p>
        </div>
        <div className="world-agent-actions">
          <button className="lab-button" type="button" onClick={copyPrompt}>
            {copied ? "Ask copied" : "Copy the agent ask"}
          </button>
          <button className="lab-button secondary" type="button" onClick={downloadWorld}>Download this world</button>
          <label className="world-file lab-button secondary">
            Open a world file
            <input type="file" accept="application/json,.json" onChange={(event) => void openWorld(event.target.files?.[0])} />
          </label>
        </div>
        {importError && <p className="world-import-error" role="alert">{importError}</p>}
        <details>
          <summary>What the agent receives</summary>
          <pre tabIndex={0}>{agentPrompt}</pre>
        </details>
      </section>

      <aside className="world-legacy">
        <span>Looking for the earlier puzzle laboratory?</span>
        <Link href="/play/lab">Open the archived tracks</Link>
      </aside>
    </main>
  );
}

function cellName(cell: number | undefined): string {
  if (cell === 1) return "Moth";
  if (cell === 3) return "Moss";
  if (cell === 4) return "Lark";
  if (cell === 5) return "Foundry";
  return cell == null ? "A creature" : `Cell ${cell}`;
}
