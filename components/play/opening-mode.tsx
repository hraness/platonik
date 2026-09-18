"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Receipt } from "@/lib/bridge/types";
import { engine, type Point, type Program, type WasmModule } from "@/lib/play/engine";
import { OPENING_MISSIONS } from "@/lib/play/missions";
import { buildPlayUrl } from "@/lib/play/url";
import { allMarks, saveMark } from "@/lib/play/saves";
import { PROGRAM_SCHEMA_HELP } from "@/lib/play/schema-help";
import { AgentPanel } from "./agent-panel";
import { ProgramEditor } from "./program-editor";
import { ReplayStage } from "./replay-stage";

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

const PLAYER_CELLS: Record<string, number[]> = {
  "opening-normal": [1],
  "opening-wounded": [1],
  "ark-plan-a": [1, 3],
};

const COURIER_PRESETS = [
  { name: "compact", label: "Bounce back" },
  { name: "resilient", label: "Wall follower" },
  { name: "idle", label: "Wait only" },
];

const STATION_PRESETS = [
  { name: "relay", label: "Relay" },
  { name: "controller", label: "Controller" },
];

const OPENING_STARTERS: Record<string, Record<number, string>> = {
  "opening-normal": { 1: "compact" },
  "opening-wounded": { 1: "resilient" },
  "ark-plan-a": { 1: "compact", 3: "controller" },
};

const HINTS: Record<string, string> = {
  "opening-normal":
    "Start with the 'Bounce back' courier. Run it, watch it deliver, then edit one rule to see what breaks.",
  "opening-wounded":
    "The short way closes. Try the 'Wall follower' preset and see if it finds the longer, still-open route.",
  "ark-plan-a":
    "Load a 'Bounce back' courier and a 'Controller' for the valve. The controller must steer the signal bit to the right plan.",
};

const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

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

function isNontrivial(cell: ExperimentCell): boolean {
  const rules = cell.program?.rules;
  if (!Array.isArray(rules) || rules.length === 0) return false;
  if (rules.length === 1) {
    const action = (rules[0] as { action?: { kind?: string } })?.action;
    if (action?.kind === "wait") return false;
  }
  return true;
}

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

export function OpeningMode({
  wasm,
  initialMission,
  initialProgram,
}: {
  wasm: WasmModule;
  initialMission?: string;
  initialProgram?: Program;
}) {
  const startMission =
    initialMission && OPENING_MISSIONS.some((m) => m.key === initialMission)
      ? initialMission
      : "opening-normal";
  const [missionKey, setMissionKey] = useState(startMission);
  const [experiment, setExperiment] = useState<ExperimentShape | null>(null);
  const [editable, setEditable] = useState<ExperimentCell[]>([]);
  const [cellId, setCellId] = useState<number | null>(null);
  const [programs, setPrograms] = useState<Record<number, string>>({});
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [verified, setVerified] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [cleared, setCleared] = useState<Set<string>>(new Set());

  const loadMission = useCallback(
    (key: string) => {
      try {
        const next = engine.tutorialExperiment(wasm, key) as unknown as ExperimentShape;
        const cells = editableCells(next, key);
        const initial: Record<number, string> = Object.fromEntries(
          cells.map((cell) => [cell.id, pretty(cell.program)])
        );
        const starter = OPENING_STARTERS[key];
        for (const cell of cells) {
          if (initialProgram && cell.id === cells[0]?.id) {
            initial[cell.id] = pretty(initialProgram);
            continue;
          }
          const name = starter?.[cell.id];
          if (name && !isNontrivial(cell)) {
            try {
              initial[cell.id] = pretty(engine.referenceProgram(wasm, name));
            } catch {
              // keep the fixture program if the starter is missing
            }
          }
        }
        setExperiment(next);
        setEditable(cells);
        setCellId(cells[0]?.id ?? null);
        setPrograms(initial);
        setReceipt(null);
        setVerified(false);
        setError(null);
        setMissionKey(key);
      } catch (cause) {
        setExperiment(null);
        setError(`Could not load mission "${key}": ${message(cause)}`);
      }
    },
    [wasm, initialProgram]
  );

  useEffect(() => {
    loadMission(startMission);
  }, [loadMission, startMission]);

  // Load persisted mission clears once; a passing receipt records its mark.
  useEffect(() => {
    allMarks()
      .then((marks) =>
        setCleared(
          new Set(
            marks
              .filter((mark) => mark.passed && mark.key.startsWith("opening:"))
              .map((mark) => mark.key.slice("opening:".length))
          )
        )
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!receipt?.result?.outcome?.passed) return;
    void saveMark({ key: `opening:${missionKey}`, passed: true, updated: Date.now() }).catch(() => {});
    setCleared((prev) => (prev.has(missionKey) ? prev : new Set(prev).add(missionKey)));
  }, [receipt, missionKey]);

  const mission = OPENING_MISSIONS.find((item) => item.key === missionKey);
  const currentText = (cellId != null && programs[cellId]) || "";
  const currentIndex = OPENING_MISSIONS.findIndex((item) => item.key === missionKey);
  const nextMission = OPENING_MISSIONS[currentIndex + 1];

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

  async function share() {
    if (cellId == null || !currentText.trim()) {
      setError("No program to share.");
      return;
    }
    try {
      const program = parseProgram(currentText) as unknown as Program;
      const url = await buildPlayUrl({ track: "opening", case: missionKey, program });
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1600);
    } catch (cause) {
      setError(`Share failed: ${message(cause)}`);
    }
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
            <span className="mission-card-title">
              {item.title}
              {cleared.has(item.key) && (
                <span className="mission-check" aria-label="cleared">
                  ✓
                </span>
              )}
            </span>
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
            <p className="lab-note">{HINTS[missionKey]}</p>

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
                onChange={(value) => setPrograms((prev) => ({ ...prev, [cellId]: value }))}
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
              <button
                className="lab-button secondary"
                type="button"
                onClick={share}
                disabled={cellId == null || !currentText.trim()}
              >
                {shareCopied ? "Link copied" : "Copy share link"}
              </button>
            </div>

            {receipt?.result?.outcome?.passed && nextMission && (
              <div className="play-next">
                <button
                  className="lab-button primary"
                  type="button"
                  onClick={() => loadMission(nextMission.key)}
                >
                  Next mission: {nextMission.title} <span aria-hidden="true">→</span>
                </button>
              </div>
            )}

            {receipt?.result?.outcome?.passed && !nextMission && (
              <div className="opening-complete">
                <strong>Opening complete.</strong> You can carry a spark, survive a wounded route,
                and steer a valve. The trail continues —{" "}
                <Link href="/play?mode=journeys">Journeys</Link> keep one world alive across pauses,
                and <Link href="/play?mode=challenges">Challenges</Link> score 96 worlds for the
                season board.
              </div>
            )}

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
                  {verified && <span className="verified-badge"> · verified ✓</span>}
                </p>
                <ReplayStage receipt={receipt} />
              </>
            ) : (
              <p className="lab-note">
                Edit the program, then run it — the replay and the mission verdict appear here.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
