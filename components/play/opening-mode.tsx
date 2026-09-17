"use client";

import { useCallback, useEffect, useState } from "react";
import type { Receipt } from "@/lib/bridge/types";
import { engine, type Point, type WasmModule } from "@/lib/play/engine";
import { OPENING_MISSIONS } from "@/lib/play/missions";
import { PROGRAM_SCHEMA_HELP } from "@/lib/play/schema-help";
import { AgentPanel } from "./agent-panel";
import { ProgramEditor } from "./program-editor";
import { ReplayStage } from "./replay-stage";

// Minimal read of the fixture experiment JSON — the engine is authoritative;
// these fields are all the tutorial track needs for editing and summaries.
type Positioned = { id: number; position: Point };

type ExperimentCell = {
  id: number;
  position?: Point;
  mobile?: boolean;
  program?: { rules?: unknown[] };
};

type ExperimentShape = {
  width?: number;
  height?: number;
  walls?: Point[];
  sources?: Positioned[];
  depots?: Positioned[];
  beacons?: Positioned[];
  valves?: Positioned[];
  cells?: ExperimentCell[];
};

const GOAL =
  "Get the courier to deliver every source spark to a depot, then keep beacons charged.";

// The cells the player may program, per fixture. Opening worlds have a lone
// courier; ark-plan-a adds the valve controller (the relay and the corridor
// body stay fixed).
const PLAYER_CELLS: Record<string, number[]> = {
  "opening-normal": [1],
  "opening-wounded": [1],
  "ark-plan-a": [1, 3],
};

const COURIER_PRESETS = [
  { name: "idle", label: "Wait only" },
  { name: "compact", label: "Bounce back" },
  { name: "resilient", label: "Wall follower" },
];

const STATION_PRESETS = [
  { name: "relay", label: "Relay" },
  { name: "controller", label: "Controller" },
];

const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

/** Parse program JSON, throwing a readable error on any malformed input. */
function parseProgram(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new Error(cause instanceof Error ? `JSON error: ${cause.message}` : "Invalid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as { rules?: unknown }).rules)) {
    throw new Error("A program is an object with a rules array.");
  }
  return parsed as Record<string, unknown>;
}

/** Live rule count for the selector: the draft text when it parses, else the fixture program. */
function ruleCount(cell: ExperimentCell, draft: string | undefined): number {
  if (draft != null) {
    try {
      const parsed = JSON.parse(draft) as { rules?: unknown };
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.rules)) {
        return parsed.rules.length;
      }
    } catch {
      // fall through to the fixture count while the draft is mid-edit
    }
  }
  const rules = cell.program?.rules;
  return Array.isArray(rules) ? rules.length : 0;
}

/** A lone wait rule is the idle placeholder — everything else is real behavior. */
function isNontrivial(cell: ExperimentCell): boolean {
  const rules = cell.program?.rules;
  if (!Array.isArray(rules) || rules.length === 0) return false;
  if (rules.length === 1) {
    const action = (rules[0] as { action?: { kind?: string } })?.action;
    if (action?.kind === "wait") return false;
  }
  return true;
}

/** The player-facing cells for a mission, filtered to what the world ships. */
function editableCells(experiment: ExperimentShape, missionKey: string): ExperimentCell[] {
  const cells = experiment.cells ?? [];
  const wanted = PLAYER_CELLS[missionKey];
  if (wanted) {
    const found = wanted
      .map((id) => cells.find((cell) => cell.id === id))
      .filter((cell): cell is ExperimentCell => Boolean(cell?.program));
    if (found.length > 0) return found;
  }
  const nontrivial = cells.filter(isNontrivial);
  return nontrivial.length > 0 ? nontrivial : cells.filter((cell) => cell.program).slice(0, 1);
}

/** Compact world description handed to the player's own agent. */
function worldSummary(experiment: ExperimentShape, cellId: number): string {
  const at = (point?: Point) => (point ? `(${point.x},${point.y})` : "(?)");
  const list = (items?: Positioned[]) =>
    items && items.length > 0
      ? items.map((item) => `${item.id} at ${at(item.position)}`).join(", ")
      : "none";
  return [
    `Grid ${experiment.width ?? "?"}×${experiment.height ?? "?"} with ${experiment.walls?.length ?? 0} wall tiles.`,
    `Sources: ${list(experiment.sources)}. Depots: ${list(experiment.depots)}.`,
    `Beacons: ${list(experiment.beacons)}. Valves: ${list(experiment.valves)}.`,
    `You write the program for cell ${cellId}.`,
  ].join(" ");
}

const totalWork = (costs: Record<string, number>) =>
  Object.values(costs).reduce((sum, value) => sum + value, 0);

/**
 * The tutorial track: pick a fixture world, edit its courier (and controller)
 * program, run the Rust engine in this tab, and watch the verified replay.
 */
export function OpeningMode({ wasm }: { wasm: WasmModule }) {
  const [missionKey, setMissionKey] = useState("opening-normal");
  const [experiment, setExperiment] = useState<ExperimentShape | null>(null);
  const [editable, setEditable] = useState<ExperimentCell[]>([]);
  const [cellId, setCellId] = useState<number | null>(null);
  const [programs, setPrograms] = useState<Record<number, string>>({});
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [verified, setVerified] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMission = useCallback(
    (key: string) => {
      try {
        const next = engine.tutorialExperiment(wasm, key) as unknown as ExperimentShape;
        const cells = editableCells(next, key);
        setExperiment(next);
        setEditable(cells);
        setCellId(cells[0]?.id ?? null);
        setPrograms(
          Object.fromEntries(cells.map((cell) => [cell.id, pretty(cell.program)]))
        );
        setReceipt(null);
        setVerified(false);
        setError(null);
        setMissionKey(key);
      } catch (cause) {
        setExperiment(null);
        setError(`Could not load mission "${key}": ${message(cause)}`);
      }
    },
    [wasm]
  );

  useEffect(() => {
    loadMission("opening-normal");
  }, [loadMission]);

  const mission = OPENING_MISSIONS.find((item) => item.key === missionKey);
  const currentText = (cellId != null && programs[cellId]) || "";

  function loadPreset(name: string) {
    if (cellId == null) return;
    try {
      const program = engine.referenceProgram(wasm, name);
      setPrograms((prev) => ({ ...prev, [cellId]: pretty(program) }));
      setError(null);
    } catch (cause) {
      setError(`Could not load preset "${name}": ${message(cause)}`);
    }
  }

  /** AgentPanel callback: adopt a pasted program for the selected cell. */
  function acceptProgram(json: string): string | null {
    if (cellId == null) return "No editable cell is selected.";
    try {
      const program = parseProgram(json);
      setPrograms((prev) => ({ ...prev, [cellId]: pretty(program) }));
      setError(null);
      return null;
    } catch (cause) {
      return message(cause);
    }
  }

  function run() {
    if (!experiment || running) return;
    setError(null);
    setRunning(true);
    // Defer one tick so the "Running…" state paints before the synchronous run.
    window.setTimeout(() => {
      try {
        const next = {
          ...experiment,
          cells: (experiment.cells ?? []).map((cell) =>
            cell.id in programs ? { ...cell, program: parseProgram(programs[cell.id]) } : cell
          ),
        };
        const result = engine.run(wasm, next) as Receipt;
        setReceipt(result);
        try {
          setVerified(engine.verifyReceipt(wasm, result).verified);
        } catch {
          setVerified(false);
        }
      } catch (cause) {
        setError(message(cause));
      } finally {
        setRunning(false);
      }
    }, 50);
  }

  return (
    <div className="opening-mode">
      <nav className="mission-picker" aria-label="Opening missions">
        {OPENING_MISSIONS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`mission-card ${item.key === missionKey ? "active" : ""}`}
            onClick={() => loadMission(item.key)}
            aria-pressed={item.key === missionKey}
          >
            <span className="mission-card-title">{item.title}</span>
            <span className="mission-card-detail">{item.detail}</span>
          </button>
        ))}
      </nav>

      {error && (
        <p className="play-error" role="alert">
          {error}
        </p>
      )}

      {!experiment && !error && <p role="status">Loading mission…</p>}

      {experiment && (
        <div className="play-viewer">
          <div className="play-controls">
            <h2>{mission?.title ?? "Opening"}</h2>
            <p className="lab-note">{mission?.detail}</p>

            {editable.length > 1 && (
              <label className="cell-select">
                Cell to program
                <select
                  value={cellId ?? ""}
                  onChange={(event) => setCellId(Number(event.target.value))}
                >
                  {editable.map((cell) => (
                    <option key={cell.id} value={cell.id}>
                      Cell {cell.id} — {ruleCount(cell, programs[cell.id])} rules
                    </option>
                  ))}
                </select>
              </label>
            )}

            {cellId != null && (
              <ProgramEditor
                label={`Cell ${cellId} program`}
                value={currentText}
                onChange={(value) =>
                  setPrograms((prev) => ({ ...prev, [cellId]: value }))
                }
                presets={cellId === 1 ? COURIER_PRESETS : STATION_PRESETS}
                onPreset={loadPreset}
              />
            )}

            <div className="play-loaders">
              <button
                className="lab-button primary"
                type="button"
                onClick={run}
                disabled={running || cellId == null}
              >
                {running ? "Running…" : "Run in browser"}
              </button>
            </div>

            <AgentPanel
              brief={`${mission?.detail ?? ""} ${GOAL}`}
              worldSummary={cellId != null ? worldSummary(experiment, cellId) : ""}
              schemaHelp={PROGRAM_SCHEMA_HELP}
              currentProgram={currentText}
              onProgram={acceptProgram}
            />
          </div>

          <div className="play-stage">
            {receipt ? (
              <>
                <p
                  className={`verdict-banner ${
                    receipt.result.outcome.passed ? "play-pass" : "play-fail"
                  }`}
                  role="status"
                >
                  {receipt.result.outcome.passed ? "Mission passed" : "Mission failed"} —{" "}
                  {receipt.result.ticks_completed} ticks ·{" "}
                  {totalWork(receipt.result.costs).toLocaleString("en-US")} modeled work
                  {verified && <span className="receipt-verified"> · verified ✓</span>}
                </p>
                <ReplayStage receipt={receipt} />
              </>
            ) : (
              <p className="lab-note">
                Edit the program, then run it — the replay and the mission verdict appear
                here.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
