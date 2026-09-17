"use client";

import { useEffect, useState } from "react";
import { RecordedHabitat } from "@/components/recorded-habitat";
import type { Receipt } from "@/lib/bridge/types";

const number = (value: number) => value.toLocaleString("en-US");
const work = (costs: Record<string, number>) => Object.values(costs).reduce((sum, value) => sum + value, 0);

type WasmModule = {
  tutorial_experiment(id: string): string;
  reference_program(name: string): string;
  run_experiment(json: string): string;
  generated_challenge(index: number): string;
  evaluate_challenge(challengeJson: string, submissionJson: string): string;
};

export function PlayViewer() {
  const [wasm, setWasm] = useState<WasmModule | null>(null);
  const [error, setError] = useState<string>("");
  const [experimentJson, setExperimentJson] = useState<string>("");
  const [programJson, setProgramJson] = useState<string>("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [at, setAt] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("platonik-wasm").then(async (mod: unknown) => {
      const m = mod as { default: (path?: string) => Promise<WasmModule> } & WasmModule;
      await m.default();
      if (cancelled) return;
      setWasm(m);
      try {
        const exp = m.tutorial_experiment("opening-normal");
        setExperimentJson(exp);
        const experiment = JSON.parse(exp);
        const cell = experiment.cells.find((c: { id: number }) => c.id === 1);
        setProgramJson(JSON.stringify(cell?.program ?? { rules: [] }, null, 2));
      } catch (cause) {
        setError(String(cause));
      }
    }).catch(cause => { if (!cancelled) setError(`Failed to load the Rust engine: ${String(cause.message ?? cause)}`); });
    return () => { cancelled = true; };
  }, []);

  const frame = receipt?.result.frames[Math.min(at, receipt.result.frames.length - 1)];

  function replaceProgram(newProgram: unknown) {
    try {
      const experiment = JSON.parse(experimentJson);
      const index = experiment.cells.findIndex((c: { id: number }) => c.id === 1);
      if (index === -1) throw new Error("No editable cell with id 1");
      experiment.cells[index].program = newProgram;
      setExperimentJson(JSON.stringify(experiment, null, 2));
    } catch (cause) {
      setError(String(cause));
    }
  }

  function loadProgram(name: string) {
    if (!wasm) return;
    try {
      const program = JSON.parse(wasm.reference_program(name));
      setProgramJson(JSON.stringify(program, null, 2));
      replaceProgram(program);
    } catch (cause) {
      setError(String(cause));
    }
  }

  function run() {
    if (!wasm) return;
    setError("");
    setRunning(true);
    try {
      const experiment = JSON.parse(experimentJson);
      const parsedProgram = JSON.parse(programJson);
      const index = experiment.cells.findIndex((c: { id: number }) => c.id === 1);
      if (index === -1) throw new Error("No editable cell with id 1");
      experiment.cells[index].program = parsedProgram;
      const receiptJson = wasm.run_experiment(JSON.stringify(experiment));
      const parsed: Receipt = JSON.parse(receiptJson);
      setReceipt(parsed);
      setAt(0);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setRunning(false);
    }
  }

  if (error) return <p className="play-error" role="alert">{error}</p>;
  if (!wasm) return <p role="status">Loading the Platonik engine…</p>;

  return (
    <div className="play-viewer">
      <div className="play-controls">
        <h2>Program for courier 1</h2>
        <div className="play-loaders">
          <button className="lab-button secondary" type="button" onClick={() => loadProgram("idle")}>Wait only</button>
          <button className="lab-button secondary" type="button" onClick={() => loadProgram("compact")}>Bounce back</button>
          <button className="lab-button secondary" type="button" onClick={() => loadProgram("resilient")}>Wall follower</button>
        </div>
        <textarea
          className="play-editor"
          value={programJson}
          onChange={event => setProgramJson(event.target.value)}
          rows={16}
          spellCheck={false}
          aria-label="Courier program JSON"
        />
        <button className="lab-button primary" type="button" disabled={running} onClick={run}>{running ? "Running…" : "Run in browser"}</button>
      </div>
      <div className="play-stage">
        {receipt && frame ? (
          <>
            <figure>
              <RecordedHabitat receipt={receipt} frame={frame} />
              <figcaption>S: source · D: depot · B: beacon · numbered circle: your courier. Step through the tick to follow the spark.</figcaption>
            </figure>
            <label htmlFor="play-tick">Tick {frame.tick}{!frame.complete ? " · incomplete" : ""}</label>
            <input id="play-tick" type="range" min="0" max={receipt.result.frames.length - 1} value={at} onChange={event => setAt(Number(event.target.value))} />
            <div className="play-actions">
              <button className="lab-button secondary" type="button" disabled={at === 0} onClick={() => setAt(v => v - 1)}>Previous</button>
              <button className="lab-button secondary" type="button" disabled={at === receipt.result.frames.length - 1} onClick={() => setAt(v => v + 1)}>Next</button>
              <button className="lab-text-button" type="button" onClick={() => setAt(receipt.result.frames.length - 1)}>End</button>
            </div>
            <p className="lab-note">Mission: {receipt.result.outcome.passed ? <strong className="play-pass">passed</strong> : <strong className="play-fail">failed</strong>}. {receipt.result.ticks_completed} ticks; {number(work(receipt.result.costs))} modeled work.</p>
          </>
        ) : (
          <div className="play-placeholder">
            <p>Your courier starts at the source. Choose a program and press <strong>Run in browser</strong>.</p>
            <p className="lab-note">This runs the deterministic Rust engine compiled to WebAssembly in your browser. No server call, no account.</p>
          </div>
        )}
      </div>
    </div>
  );
}
