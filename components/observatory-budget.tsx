"use client";

import { useEffect, useId, useRef, useState } from "react";
import { runExperiment, type Program } from "@/lib/observatory/specimen";

const fields = [
  { key: "cells", label: "Active cells", min: 1, max: 1_000_000, initial: "128" },
  { key: "ticks", label: "Simulation ticks", min: 1, max: 1_000_000, initial: "2000" },
  { key: "operations", label: "Average primitive operations per cell per tick", min: 1, max: 256, initial: "32" },
  { key: "stateBytes", label: "State bytes per cell", min: 0, max: 4096, initial: "64" },
  { key: "traceBytes", label: "Trace bytes per cell per tick", min: 0, max: 1024, initial: "16" },
] as const;

type FieldKey = (typeof fields)[number]["key"];
type Inputs = Record<FieldKey, string>;
type Measurement =
  | { status: "idle" }
  | { status: "running"; programKey: string; completed: number }
  | { status: "cancelled"; programKey: string; completed: number }
  | { status: "error"; programKey: string; message: string }
  | { status: "complete"; programKey: string; work: number; elapsedMs: number; rate: number };

const benchmarkRuns = 64;
const benchmarkTicks = 256;
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function byteLabel(bytes: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${decimal.format(size)} ${units[unit]}`;
}

function durationLabel(seconds: number): string {
  if (seconds < 0.01) return "Less than 0.01 seconds";
  if (seconds < 60) return `About ${decimal.format(seconds)} seconds`;
  if (seconds < 3600) return `About ${decimal.format(seconds / 60)} minutes`;
  if (seconds < 86400) return `About ${decimal.format(seconds / 3600)} hours`;
  return `About ${decimal.format(seconds / 86400)} days`;
}

export function BudgetLab({ program }: { program: Program }) {
  const id = useId();
  const [inputs, setInputs] = useState<Inputs>(() => Object.fromEntries(fields.map((field) => [field.key, field.initial])) as Inputs);
  const [measurement, setMeasurement] = useState<Measurement>({ status: "idle" });
  const pendingTimer = useRef<number | null>(null);
  const runVersion = useRef(0);
  const programKey = JSON.stringify(program);
  const latestProgramKey = useRef(programKey);
  latestProgramKey.current = programKey;

  useEffect(() => {
    setMeasurement({ status: "idle" });
    return () => {
      runVersion.current += 1;
      if (pendingTimer.current !== null) {
        window.clearTimeout(pendingTimer.current);
        pendingTimer.current = null;
      }
    };
  }, [programKey]);

  const values = {} as Record<FieldKey, number>;
  const invalid = new Set<FieldKey>();
  for (const field of fields) {
    const value = Number(inputs[field.key]);
    values[field.key] = value;
    if (inputs[field.key].trim() === "" || !Number.isSafeInteger(value) || value < field.min || value > field.max) {
      invalid.add(field.key);
    }
  }
  const valid = invalid.size === 0;
  const work = values.cells * values.ticks * values.operations;
  const stateBytes = values.cells * values.stateBytes;
  const traceBytes = values.cells * values.ticks * values.traceBytes;
  const current = measurement.status === "idle" || measurement.programKey === programKey ? measurement : { status: "idle" as const };
  const busy = current.status === "running";

  function cancelMeasurement() {
    runVersion.current += 1;
    if (pendingTimer.current !== null) {
      window.clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
    setMeasurement((previous) => previous.status === "running"
      ? { status: "cancelled", programKey: previous.programKey, completed: previous.completed }
      : previous);
  }

  function measureBrowser() {
    if (busy) return;
    const version = ++runVersion.current;
    const capturedKey = programKey;
    const capturedProgram = structuredClone(program);
    let completed = 0;
    let primitiveWork = 0;
    const startedAt = performance.now();
    setMeasurement({ status: "running", programKey: capturedKey, completed });

    function nextBatch() {
      pendingTimer.current = null;
      if (version !== runVersion.current || latestProgramKey.current !== capturedKey) return;
      try {
        // One bounded experiment per task gives input and cancellation a chance to run.
        const result = runExperiment(capturedProgram, completed + 1, benchmarkTicks);
        if (!Number.isSafeInteger(result.primitiveWork) || result.primitiveWork < 0) {
          throw new Error("Invalid work count");
        }
        primitiveWork += result.primitiveWork;
        completed += 1;
        if (completed < benchmarkRuns) {
          setMeasurement({ status: "running", programKey: capturedKey, completed });
          pendingTimer.current = window.setTimeout(nextBatch, 0);
          return;
        }
        const elapsedMs = performance.now() - startedAt;
        const rate = primitiveWork / (elapsedMs / 1000);
        if (!(elapsedMs > 0) || !(rate > 0) || !Number.isFinite(rate)) {
          setMeasurement({ status: "error", programKey: capturedKey, message: "This sample was too short to measure reliably. Run it again in an active tab." });
          return;
        }
        setMeasurement({ status: "complete", programKey: capturedKey, work: primitiveWork, elapsedMs, rate });
      } catch {
        setMeasurement({ status: "error", programKey: capturedKey, message: "The specimen benchmark could not finish. Select a valid specimen and try again." });
      }
    }

    pendingTimer.current = window.setTimeout(nextBatch, 0);
  }

  return (
    <div>
      <div className="lab-panel-intro">
        <h3>How much world can you afford?</h3>
        <p>Choose an expedition size. These are illustrative assumptions, not measured Rust engine limits. The calculator runs locally and advances no game state.</p>
      </div>
      <div className="lab-two-column">
        <div className="lab-controls">
          {fields.map((field) => (
            <div className="lab-field" key={field.key}>
              <label htmlFor={`${id}-${field.key}`}>{field.label}</label>
              <input
                id={`${id}-${field.key}`}
                type="number"
                min={field.min}
                max={field.max}
                step={1}
                value={inputs[field.key]}
                aria-invalid={invalid.has(field.key)}
                aria-describedby={`${id}-${field.key}-help`}
                onChange={(event) => setInputs((previous) => ({ ...previous, [field.key]: event.target.value }))}
              />
              <small id={`${id}-${field.key}-help`}>Whole numbers from {integer.format(field.min)} to {integer.format(field.max)}.</small>
            </div>
          ))}
        </div>
        <div>
          {valid ? (
            <div className="lab-result" aria-live="polite" aria-atomic="true">
              <p>{integer.format(values.cells)} cells × {integer.format(values.ticks)} ticks × {integer.format(values.operations)} operations</p>
              <dl className="lab-metrics">
                <div><dt>Policy operations</dt><dd>{integer.format(work)}</dd></div>
                <div><dt>Current cell state</dt><dd>{byteLabel(stateBytes)}</dd></div>
                <div><dt>Uncompressed trace</dt><dd>{byteLabel(traceBytes)}</dd></div>
              </dl>
            </div>
          ) : (
            <p className="lab-error" role="status">Enter whole numbers within the listed ranges to calculate an expedition.</p>
          )}
          <p className="lab-note">Current state assumes one resident record per cell. Trace storage assumes a separate record for every cell at every tick. Neither includes programs, terrain, indexes, renderer data, or object overhead. Zero trace bytes means no per-cell trace records.</p>
          <p className="lab-note">Policy operations omit scheduling, world updates, checking, and other simulation work. Evaluating 1,000 candidates can multiply the work by 1,000. A saved civilization can pause its unvisited regions.</p>
        </div>
      </div>

      <h3>Try this browser, with this specimen</h3>
      <p>The optional sample runs {benchmarkRuns} experiments of {benchmarkTicks} ticks with the selected specimen. It yields between runs so you can cancel. No model or server is contacted.</p>
      <div className="lab-actions">
        <button className="lab-button" type="button" onClick={measureBrowser} disabled={busy}>Measure this browser</button>
        {busy && <button className="lab-button secondary" type="button" onClick={cancelMeasurement}>Cancel measurement</button>}
      </div>
      <div aria-live="polite" aria-atomic="true">
        {current.status === "running" && <p className="lab-note">Measuring: {current.completed} of {benchmarkRuns} runs complete.</p>}
        {current.status === "cancelled" && <p className="lab-note">Cancelled after {current.completed} runs. No estimate was recorded.</p>}
        {current.status === "error" && <p className="lab-error">{current.message}</p>}
        {current.status === "complete" && (
          <div className="lab-result">
            <dl className="lab-metrics">
              <div><dt>Observed work per elapsed second</dt><dd>{integer.format(current.rate)} primitive operations</dd></div>
              <div><dt>Sampled work</dt><dd>{integer.format(current.work)} operations</dd></div>
              <div><dt>Sample elapsed time</dt><dd>{decimal.format(current.elapsedMs / 1000)} seconds</dd></div>
              {valid && <div><dt>Rough extrapolation for your policy work</dt><dd>{durationLabel(work / current.rate)}</dd></div>}
            </dl>
          </div>
        )}
      </div>
      <p className="lab-note">This measures this JavaScript toy interpreter, selected program, browser, and device, including pauses between batches. Tab throttling and system load affect it. It does not predict Rust throughput, other simulation kernels, long-run garbage collection, full-world traces, rendering, network traffic, or verification. Changing the specimen clears the sample.</p>
      <p><a href="/docs/complexity-and-scale">Read the complexity and scale proposal</a> for the research thesis and the costs a larger world must account for.</p>
    </div>
  );
}
