"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RecordedArk } from "@/components/recorded-ark";
import { RecordedBloom } from "@/components/recorded-bloom";
import { RecordedHabitat } from "@/components/recorded-habitat";
import { RecordedJourney } from "@/components/recorded-journey";
import { RecordedPorts } from "@/components/recorded-ports";
import type { ArkGrade } from "@/lib/bridge/ark";
import type { BloomGrade } from "@/lib/bridge/bloom";
import type { FirstAnswerJourney } from "@/lib/bridge/journey";
import type { PortsGrade } from "@/lib/bridge/ports";
import type { Frame, Receipt } from "@/lib/bridge/types";
import {
  engine,
  type Advance,
  type JourneyCatalog,
  type Program,
  type WasmModule,
} from "@/lib/play/engine";
import { JOURNEY_DESCRIPTIONS } from "@/lib/play/missions";
import { PROGRAM_SCHEMA_HELP } from "@/lib/play/schema-help";
import { buildPlayUrl } from "@/lib/play/url";
import { allMarks, saveLastPlay, saveMark } from "@/lib/play/saves";
import { AgentPanel } from "./agent-panel";
import { ProgramEditor } from "./program-editor";
import { ReplayStage } from "./replay-stage";

// Matches the CLI habitat store: one immutable world permits eight advances.
const MAX_ADVANCES = 8;
const ADVANCE_STEP = 24;

type Experiment = Record<string, unknown>;
type Grade = Record<string, unknown>;

interface CellView {
  id: number;
  position: { x: number; y: number };
  heading: string;
  mobile: boolean;
  program?: { rules?: unknown[] };
}

interface EntityView {
  id: number;
  position: { x: number; y: number };
}

interface RunResult {
  protocol?: string;
  status?: string;
  ticks_completed?: number;
  costs?: Record<string, number>;
  outcome?: { passed?: boolean };
  frames?: Frame[];
}

const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);
const number = (value: number) => value.toLocaleString("en-US");
const work = (costs: Record<string, number> | undefined) =>
  Object.values(costs ?? {}).reduce((sum, value) => sum + value, 0);

function cellsOf(experiment: Experiment | null): CellView[] {
  const cells = experiment?.cells;
  return Array.isArray(cells) ? (cells as CellView[]) : [];
}

function numberField(experiment: Experiment | null, key: string): number {
  const value = experiment?.[key];
  return typeof value === "number" ? value : 0;
}

function lastFrame(checkpoint: { frames: unknown[] }): Frame | null {
  const frame = checkpoint.frames.at(-1);
  return frame && typeof frame === "object" ? (frame as Frame) : null;
}

/** Tick the current world stands at: checkpoint tip or run horizon. */
function advanceTick(advance: Advance | null): number {
  if (!advance) return 0;
  if (advance.kind === "paused") return lastFrame(advance.value)?.tick ?? 0;
  return (advance.value as RunResult).ticks_completed ?? 0;
}

/** Journey graders that accept an in-flight Advance (paused or finished). */
const ADVANCE_GRADED = new Set(["answer", "ark", "ports", "bloom"]);
/** Journeys whose cold receipts a grader admits. Exchange needs its case id. */
const RECEIPT_GRADED = new Set(["answer", "ark", "ports", "bloom", "exchange"]);

const JOURNEY_ORDER = [
  "continuity",
  "construction",
  "answer",
  "ark",
  "ports",
  "bloom",
  "exchange",
];

const JOURNEY_PRESETS: Record<string, { name: string; label: string }[]> = {
  continuity: [
    { name: "compact", label: "Compact courier" },
    { name: "resilient", label: "Resilient courier" },
    { name: "idle", label: "Idle" },
  ],
  construction: [
    { name: "idle", label: "Idle" },
    { name: "compact", label: "Compact courier" },
  ],
  answer: [
    { name: "idle", label: "Idle" },
    { name: "compact", label: "Compact courier" },
  ],
  ark: [
    { name: "idle", label: "Idle" },
    { name: "compact", label: "Compact courier" },
    { name: "resilient", label: "Resilient courier" },
  ],
  ports: [
    { name: "idle", label: "Idle" },
    { name: "compact", label: "Compact courier" },
  ],
  bloom: [
    { name: "idle", label: "Idle" },
    { name: "resilient", label: "Resilient courier" },
  ],
  exchange: [
    { name: "idle", label: "Idle" },
    { name: "resilient", label: "Resilient courier" },
  ],
};

function caseKind(
  track: { training?: string[]; transfer?: string[]; capacity?: string[] },
  id: string,
): string | null {
  if (track.training?.includes(id)) return "training";
  if (track.transfer?.includes(id)) return "transfer";
  if (track.capacity?.includes(id)) return "capacity";
  return null;
}

/** Compact world description for the agent prompt: dimensions + entities. */
function worldSummary(experiment: Experiment, editCell: number): string {
  const at = (entity: EntityView) => `(${entity.position.x},${entity.position.y})`;
  const list = (key: string) =>
    (Array.isArray(experiment[key]) ? experiment[key] : []) as EntityView[];
  const cells = cellsOf(experiment);
  const lines = [
    `Habitat ${numberField(experiment, "width")}×${numberField(experiment, "height")}, habitat-v${numberField(experiment, "version")}, horizon ${numberField(experiment, "ticks")} ticks, fuel ${numberField(experiment, "fuel")} modeled work, ${numberField(experiment, "activation_fuel")} work per activation.`,
    `Cells: ${cells
      .map(
        (cell) =>
          `cell ${cell.id} at (${cell.position.x},${cell.position.y}) heading ${cell.heading}${cell.mobile ? "" : ", immobile"}${cell.id === editCell ? " — you are editing this cell's program" : ""}`,
      )
      .join("; ")}.`,
  ];
  const sources = list("sources");
  if (sources.length)
    lines.push(
      `Sources: ${sources.map((s) => `${s.id} at ${at(s)} holding ${((s as { sparks?: unknown[] }).sparks ?? []).length} sparks`).join("; ")}.`,
    );
  const depots = list("depots");
  if (depots.length)
    lines.push(
      `Depots: ${depots.map((d) => `${d.id} at ${at(d)} capacity ${(d as { capacity?: number }).capacity ?? "?"}`).join("; ")}.`,
    );
  const beacons = list("beacons");
  if (beacons.length)
    lines.push(
      `Beacons: ${beacons.map((b) => `${b.id} at ${at(b)}${(b as { accepts?: boolean }).accepts === false ? " (not accepting)" : ""}`).join("; ")}.`,
    );
  const valves = list("valves");
  if (valves.length)
    lines.push(`Valves: ${valves.map((v) => `${v.id} at ${at(v)}`).join("; ")}.`);
  const links = experiment.links;
  if (Array.isArray(links) && links.length)
    lines.push(`${links.length} signal links connect depots and cells.`);
  const construction = experiment.construction as
    | { stocks?: EntityView[]; blueprints?: { id: number }[] }
    | undefined;
  if (construction) {
    lines.push(
      `Construction: ${(construction.stocks ?? [])
        .map((s) => `stock ${s.id} at ${at(s)}`)
        .join("; ")}; blueprints ${(construction.blueprints ?? [])
        .map((b) => b.id)
        .join(", ")}.`,
    );
  }
  const events = experiment.events;
  if (Array.isArray(events) && events.length)
    lines.push(`${events.length} scheduled world events (closings, toggles).`);
  return lines.join("\n");
}

/** The exchange grader has no Recorded component — render its fields plainly. */
function ExchangeGradeList({ grade }: { grade: Grade }) {
  const tick = (value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return value;
    if (typeof value === "object") {
      const moment = (value as { tick?: unknown }).tick;
      return typeof moment === "number" ? moment : null;
    }
    return null;
  };
  const momentLine = (label: string, value: unknown) => {
    const at = tick(value);
    return `${label}: ${at === null ? "not reached" : `tick ${at}`}`;
  };
  const candidates = Array.isArray(grade.candidates)
    ? (grade.candidates as {
        child?: number;
        born?: number | null;
        generated?: boolean;
        trial_pickup?: number | null;
        trial_returned?: number | null;
        trial_accepted?: number | null;
      }[])
    : [];
  const moments: string[] = [
    grade.selected_candidate === null || grade.selected_candidate === undefined
      ? "Selected candidate: none"
      : `Selected candidate: ${Number(grade.selected_candidate) + 1}`,
    momentLine("Selection consumed", grade.selection),
    momentLine("Request consumed", grade.request),
    momentLine("Child request consumed", grade.child_request),
    momentLine("Parcel picked up", grade.pickup),
    momentLine("Parcel accepted at depot", grade.accepted),
    momentLine("Depot report", grade.depot_report),
    momentLine("Child report", grade.child_report),
    momentLine("Child acknowledgment", grade.child_ack),
    momentLine("Acknowledgment consumed", grade.acknowledgment),
    momentLine("Serviced", grade.serviced),
  ];
  const flags: [string, string][] = [
    ["Fixed world", "fixed_world_passed"],
    ["Generation", "generation_passed"],
    ["Trials", "trials_passed"],
    ["Selection", "selection_passed"],
    ["Request", "request_passed"],
    ["Custody", "custody_passed"],
    ["Acknowledgment", "acknowledgment_passed"],
    ["Spare preserved", "spare_preserved"],
    ["Service", "service_passed"],
    ["Whole exchange", "exchange_passed"],
  ];
  return (
    <section
      className="continuity-stops"
      aria-labelledby="exchange-grade-title"
      data-testid="exchange-grade"
    >
      <h2 id="exchange-grade-title">The exchange, checked.</h2>
      <p>
        Case {String(grade.case_id ?? "unknown")} ·{" "}
        {number(typeof grade.work_total === "number" ? grade.work_total : 0)}{" "}
        modeled work. Two generated couriers, one selection, one delivered
        parcel, one matched acknowledgment.
      </p>
      {candidates.length > 0 && (
        <ul aria-label="Exchange candidates">
          {candidates.map((candidate, index) => (
            <li key={candidate.child ?? index}>
              Candidate {index + 1}, courier {candidate.child ?? "?"}:{" "}
              {candidate.born !== null && candidate.born !== undefined
                ? `born at tick ${candidate.born}`
                : "never born"}
              ; generated {candidate.generated ? "in family" : "out of family"};
              trial pickup{" "}
              {candidate.trial_pickup ?? "—"}, returned{" "}
              {candidate.trial_returned ?? "—"}, accepted{" "}
              {candidate.trial_accepted ?? "—"}.
            </li>
          ))}
        </ul>
      )}
      <ul aria-label="Exchange key ticks">
        {moments.map((line) => (
          <li key={line}>{line}.</li>
        ))}
      </ul>
      <ul aria-label="Exchange contract">
        {flags.map(([label, key]) => (
          <li key={key}>
            {label}:{" "}
            <strong className={grade[key] === true ? "play-pass" : "play-fail"}>
              {grade[key] === true ? "passed" : "failed"}
            </strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Route a published grade object to the matching recorded milestone rail. */
function GradeRail({
  journey,
  grade,
  tick,
}: {
  journey: string;
  grade: Grade;
  tick: number;
}) {
  switch (journey) {
    case "answer":
      return (
        <RecordedJourney
          journey={grade as unknown as FirstAnswerJourney}
          tick={tick}
        />
      );
    case "ark":
      return <RecordedArk grade={grade as unknown as ArkGrade} tick={tick} />;
    case "ports":
      return <RecordedPorts grade={grade as unknown as PortsGrade} tick={tick} />;
    case "bloom":
      return <RecordedBloom grade={grade as unknown as BloomGrade} tick={tick} />;
    case "exchange":
      return <ExchangeGradeList grade={grade} />;
    default:
      return null;
  }
}

/**
 * Journeys track: pick a journey and a case, edit one cell's program, then
 * either run the whole world in one shot (receipt + journey grade) or advance
 * the same continuous habitat tick by tick through pause/resume checkpoints.
 */
export function JourneyMode({
  wasm,
  initialJourney,
  initialCase,
  initialProgram,
}: {
  wasm: WasmModule;
  initialJourney?: string;
  initialCase?: string;
  initialProgram?: Program;
}) {
  const [catalog, setCatalog] = useState<JourneyCatalog | null>(null);
  const startJourney = initialJourney ?? "continuity";
  const [journeyId, setJourneyId] = useState(startJourney);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  // Cell programs the player has touched, keyed by cell id, as JSON text.
  const [programs, setPrograms] = useState<Record<number, string>>({});
  const [editCell, setEditCell] = useState(1);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [advance, setAdvance] = useState<Advance | null>(null);
  const [advances, setAdvances] = useState(0);
  const [grade, setGrade] = useState<Grade | null>(null);
  // The grafted world a paused checkpoint chain belongs to; resume ignores
  // later edits because the checkpoint embeds its own immutable experiment.
  const [activeExperiment, setActiveExperiment] = useState<Experiment | null>(null);
  const [until, setUntil] = useState(0);
  const [shareCopied, setShareCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearedCases, setClearedCases] = useState<Set<string>>(new Set());

  // Remember the active journey case so /play can resume here.
  useEffect(() => {
    if (caseId) void saveLastPlay({ track: "journeys", case: caseId }).catch(() => {});
  }, [caseId]);

  function openCase(id: string, initProgram?: Program) {
    const next = engine.journeyExperiment(wasm, id);
    const cells = cellsOf(next);
    const nextEditCell = cells.some((cell) => cell.id === 1) ? 1 : (cells[0]?.id ?? 1);
    setCaseId(id);
    setExperiment(next);
    setPrograms(
      initProgram ? { [nextEditCell]: JSON.stringify(initProgram, null, 2) } : {},
    );
    setEditCell(nextEditCell);
    setUntil(Math.min(ADVANCE_STEP, numberField(next, "ticks")));
    setReceipt(null);
    setAdvance(null);
    setActiveExperiment(null);
    setAdvances(0);
    setGrade(null);
    setError(null);
  }

  // Opens the case the URL points at — including "next journey" and share
  // links that arrive while this track is already mounted.
  useEffect(() => {
    try {
      const next = engine.catalog(wasm);
      setCatalog(next);
      const track =
        next.journeys.find((journey) => journey.id === (initialJourney ?? "continuity")) ??
        next.journeys[0];
      const first =
        initialCase && track?.cases.includes(initialCase)
          ? initialCase
          : track?.cases[0];
      if (track && first) {
        setJourneyId(track.id);
        openCase(first, initialProgram);
      }
    } catch (cause) {
      setError(`The journey catalog could not be loaded: ${message(cause)}`);
    }
    // openCase is stable; the effect re-runs only when the URL state changes.
  }, [wasm, initialJourney, initialCase, initialProgram]);

  // Load persisted case clears once; a passing outcome records its mark.
  useEffect(() => {
    allMarks()
      .then((marks) =>
        setClearedCases(
          new Set(
            marks
              .filter((mark) => mark.passed && mark.key.startsWith("journey:"))
              .map((mark) => mark.key.slice("journey:".length))
          )
        )
      )
      .catch(() => {});
  }, []);

  const track =
    catalog?.journeys.find((journey) => journey.id === journeyId) ??
    catalog?.journeys[0] ??
    null;
  // The resolved journey: identical to journeyId once the catalog loads.
  const activeJourney = track?.id ?? journeyId;
  const copy = track ? JOURNEY_DESCRIPTIONS[track.id] : undefined;
  const cells = cellsOf(experiment);
  const selectedCell = cells.find((cell) => cell.id === editCell) ?? cells[0];
  const programText =
    editCell in programs
      ? programs[editCell]
      : selectedCell?.program
        ? JSON.stringify(selectedCell.program, null, 2)
        : "";
  const horizon = numberField(activeExperiment ?? experiment, "ticks");
  const pausedTick = advance?.kind === "paused" ? advanceTick(advance) : 0;
  const finished =
    advance?.kind === "finished" ? (advance.value as RunResult) : null;
  const canAdvance =
    experiment !== null &&
    (advance === null || advance.kind === "paused") &&
    advances < MAX_ADVANCES;

  function selectJourney(id: string, targetCase?: string) {
    const next = catalog?.journeys.find((journey) => journey.id === id);
    if (!next || id === track?.id) return;
    setJourneyId(next.id);
    const first = targetCase && next.cases.includes(targetCase) ? targetCase : next.cases[0];
    if (first) {
      try {
        openCase(first);
      } catch (cause) {
        setError(message(cause));
      }
    } else {
      setCaseId(null);
      setExperiment(null);
      setReceipt(null);
      setAdvance(null);
      setActiveExperiment(null);
      setAdvances(0);
      setGrade(null);
    }
  }

  function selectCase(id: string) {
    if (id === caseId) return;
    try {
      openCase(id);
    } catch (cause) {
      setError(message(cause));
    }
  }

  /** Apply every edited program over a fresh copy of the fixture world. */
  function graftedExperiment(): Experiment {
    const base = JSON.parse(JSON.stringify(experiment)) as Experiment;
    const cells = Array.isArray(base.cells)
      ? (base.cells as { id: number; program?: unknown }[])
      : [];
    for (const cell of cells) {
      const text: string | undefined = programs[cell.id];
      if (text === undefined) continue;
      let parsed: { rules?: unknown };
      try {
        parsed = JSON.parse(text) as { rules?: unknown };
      } catch (cause) {
        throw new Error(
          `The program for cell ${cell.id} is not valid JSON: ${message(cause)}`,
        );
      }
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !Array.isArray(parsed.rules)
      ) {
        throw new Error(
          `The program for cell ${cell.id} is not an object with a rules array.`,
        );
      }
      cell.program = parsed;
    }
    return base;
  }

  function runToEnd() {
    if (!experiment) return;
    try {
      const grafted = graftedExperiment();
      const result = engine.run(wasm, grafted) as unknown as Receipt;
      setReceipt(result);
      setAdvance(null);
      setActiveExperiment(null);
      setAdvances(0);
      setGrade(
        RECEIPT_GRADED.has(activeJourney)
          ? engine.gradeReceipt(wasm, activeJourney, result, caseId ?? undefined)
          : null,
      );
      setError(null);
    } catch (cause) {
      setError(message(cause));
    }
  }

  function advanceTo() {
    if (!experiment) return;
    if (advance && advance.kind !== "paused") return;
    if (advances >= MAX_ADVANCES) {
      setError("This habitat permits at most eight advances.");
      return;
    }
    if (!Number.isSafeInteger(until)) {
      setError("Enter a whole-number tick to advance to.");
      return;
    }
    const limit = numberField(activeExperiment ?? experiment, "ticks");
    // Tick zero is a valid first advance: it loads the world before tick one.
    const floor = advance === null ? -1 : pausedTick;
    if (until <= floor || until > limit) {
      setError(
        `Advance until must be later than the current tick (${Math.max(floor, 0)}) and no later than the ${limit}-tick horizon.`,
      );
      return;
    }
    try {
      const base = activeExperiment ?? graftedExperiment();
      const next =
        advance === null
          ? engine.habitatStart(wasm, base, until)
          : engine.habitatResume(wasm, advance.value, until);
      setAdvance(next);
      setActiveExperiment(base);
      setAdvances((count) => count + 1);
      setReceipt(null);
      const tick =
        next.kind === "paused"
          ? advanceTick(next)
          : ((next.value as RunResult).ticks_completed ?? limit);
      setUntil(Math.min(tick + ADVANCE_STEP, limit));
      setGrade(
        ADVANCE_GRADED.has(activeJourney)
          ? engine.gradeAdvance(wasm, activeJourney, base, next, caseId ?? undefined)
          : null,
      );
      setError(null);
    } catch (cause) {
      setError(message(cause));
    }
  }

  function resetRun() {
    setReceipt(null);
    setAdvance(null);
    setActiveExperiment(null);
    setAdvances(0);
    setGrade(null);
    setError(null);
    setUntil(Math.min(ADVANCE_STEP, numberField(experiment, "ticks")));
  }

  function loadPreset(name: string) {
    try {
      const program = engine.referenceProgram(wasm, name);
      setPrograms((current) => ({
        ...current,
        [editCell]: JSON.stringify(program, null, 2),
      }));
      setError(null);
    } catch (cause) {
      setError(message(cause));
    }
  }

  async function share() {
    if (!caseId || !programText.trim()) {
      setError("Pick a case and edit a program before sharing.");
      return;
    }
    try {
      const parsed = JSON.parse(programText) as { rules?: unknown };
      if (typeof parsed !== "object" || parsed === null || !Array.isArray(parsed.rules)) {
        throw new Error("A program is an object with a rules array.");
      }
      const url = await buildPlayUrl({ track: "journeys", case: caseId, program: parsed as Program });
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1600);
    } catch (cause) {
      setError(`Share failed: ${message(cause)}`);
    }
  }

  function acceptProgram(json: string): string | null {
    try {
      const parsed = JSON.parse(json) as { rules?: unknown };
      if (typeof parsed !== "object" || parsed === null || !Array.isArray(parsed.rules)) {
        return "A program is an object with a rules array.";
      }
      setPrograms((current) => ({
        ...current,
        [editCell]: JSON.stringify(parsed, null, 2),
      }));
      return null;
    } catch (cause) {
      return message(cause);
    }
  }

  // A paused checkpoint is replayable state, not a receipt; RecordedHabitat
  // only reads experiment + frame, so a loose wrapper keeps it honest.
  const pausedReceipt =
    advance?.kind === "paused" && activeExperiment
      ? ({
          schema: "platonik-receipt-v1",
          protocol: `platonik-habitat-v${numberField(activeExperiment, "version")}`,
          experiment_hash:
            typeof advance.value.experiment_hash === "string"
              ? advance.value.experiment_hash
              : "",
          result_hash: "",
          experiment: activeExperiment,
          result: { frames: advance.value.frames },
        } as unknown as Receipt)
      : null;
  const pausedFrame = advance?.kind === "paused" ? lastFrame(advance.value) : null;
  const finishedReceipt =
    finished && activeExperiment
      ? ({
          schema: "platonik-receipt-v1",
          protocol:
            finished.protocol ??
            `platonik-habitat-v${numberField(activeExperiment, "version")}`,
          experiment_hash: "",
          result_hash: "",
          experiment: activeExperiment,
          result: finished,
        } as unknown as Receipt)
      : null;
  const gradeTick = receipt
    ? (receipt.result.frames.at(-1)?.tick ?? receipt.result.ticks_completed)
    : advance
      ? advanceTick(advance)
      : 0;
  const outcome = receipt?.result ?? finished;
  const journeyIndex = JOURNEY_ORDER.indexOf(activeJourney);
  const nextJourney =
    outcome?.outcome?.passed && journeyIndex >= 0 && journeyIndex < JOURNEY_ORDER.length - 1
      ? JOURNEY_ORDER[journeyIndex + 1]
      : null;
  const nextCase = nextJourney
    ? catalog?.journeys.find((journey) => journey.id === nextJourney)?.cases[0] ?? null
    : null;

  const journeyStats = useMemo(() => {
    const all = catalog?.journeys ?? [];
    const totalCases = all.reduce((sum, journey) => sum + journey.cases.length, 0);
    const cleared = all.filter(
      (journey) => journey.cases.length > 0 && journey.cases.every((id) => clearedCases.has(id)),
    ).length;
    let next: { journey: string; case: string } | null = null;
    for (const id of JOURNEY_ORDER) {
      const journey = all.find((j) => j.id === id);
      if (!journey) continue;
      const missing = journey.cases.find((c) => !clearedCases.has(c));
      if (missing) {
        next = { journey: journey.id, case: missing };
        break;
      }
    }
    return { cleared, totalCases, next };
  }, [catalog, clearedCases]);

  useEffect(() => {
    if (!outcome?.outcome?.passed || !caseId) return;
    void saveMark({ key: `journey:${caseId}`, passed: true, updated: Date.now() }).catch(() => {});
    setClearedCases((prev) => (prev.has(caseId) ? prev : new Set(prev).add(caseId)));
  }, [outcome, caseId]);

  const brief = `${copy?.detail ?? track?.title ?? "Journey"}${caseId ? ` Case ${caseId}.` : ""} Write the program for cell ${editCell}.`;

  return (
    <div className="journey-mode">
      <div className="journey-scoreboard" role="status" aria-label="Journey progress">
        <div className="journey-stat">
          <span className="journey-stat-label">Journeys cleared</span>
          <strong className="journey-stat-value">
            {journeyStats.cleared}<span className="journey-stat-denominator">/{JOURNEY_ORDER.length}</span>
          </strong>
        </div>
        <div className="journey-stat">
          <span className="journey-stat-label">Cases cleared</span>
          <strong className="journey-stat-value">
            {clearedCases.size}<span className="journey-stat-denominator">/{journeyStats.totalCases}</span>
          </strong>
        </div>
        {journeyStats.next ? (
          <button
            type="button"
            className="journey-stat-link"
            onClick={() => selectJourney(journeyStats.next!.journey, journeyStats.next!.case)}
          >
            <span className="journey-stat-label">Next</span>
            <strong className="journey-stat-value">{journeyStats.next.case}</strong>
          </button>
        ) : (
          <div className="journey-stat">
            <span className="journey-stat-label">Next</span>
            <strong className="journey-stat-value play-pass">All done</strong>
          </div>
        )}
      </div>

      <nav className="journey-rail" aria-label="Journeys">
        {(catalog?.journeys ?? []).map((journey) => {
          const allCleared =
            journey.cases.length > 0 && journey.cases.every((id) => clearedCases.has(id));
          return (
            <button
              key={journey.id}
              type="button"
              className={journey.id === track?.id ? "active" : ""}
              aria-pressed={journey.id === track?.id}
              onClick={() => selectJourney(journey.id)}
            >
              {JOURNEY_DESCRIPTIONS[journey.id]?.title ?? journey.title}
              {allCleared && (
                <span className="play-pass" aria-label="all cases cleared">
                  {" "}
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </nav>
      {track && (
        <div className="case-chips" role="group" aria-label="Journey cases">
          {track.cases.map((id) => {
            const kind = caseKind(track, id);
            const active = id === caseId;
            const cleared = clearedCases.has(id);
            return (
              <button
                key={id}
                type="button"
                className={`case-chip${cleared ? " done" : ""}`}
                aria-pressed={active}
                onClick={() => selectCase(id)}
                style={{
                  background: "var(--surface)",
                  cursor: "pointer",
                  ...(active
                    ? {
                        borderColor: "var(--accent)",
                        color: "var(--ink)",
                        fontWeight: 600,
                      }
                    : {}),
                }}
              >
                {id}
                {kind ? ` · ${kind}` : ""}
                {cleared ? " ✓" : ""}
              </button>
            );
          })}
        </div>
      )}
      {error && (
        <p className="play-error" role="alert">
          {error}
        </p>
      )}
      <div className="play-viewer">
        <div className="play-controls">
          <h2>{copy?.title ?? track?.title ?? "Journeys"}</h2>
          <p className="journey-detail">
            {copy?.detail}
            {caseId ? (
              <>
                {" "}
                Case <code>{caseId}</code>.
              </>
            ) : null}
          </p>
          {cells.length > 0 && (
            <div className="cell-select" role="group" aria-label="Cell to program">
              <span>Program cell</span>
              {cells.map((cell) => {
                const text: string | undefined = programs[cell.id];
                let rules = cell.program?.rules?.length ?? 0;
                if (text !== undefined) {
                  try {
                    rules =
                      (JSON.parse(text) as { rules?: unknown[] }).rules?.length ??
                      0;
                  } catch {
                    // Keep the last known count; the editor shows the error.
                  }
                }
                return (
                  <button
                    key={cell.id}
                    type="button"
                    className="lab-button secondary"
                    aria-pressed={cell.id === editCell}
                    disabled={cell.id === editCell}
                    onClick={() => setEditCell(cell.id)}
                  >
                    cell {cell.id} · {rules} rules
                  </button>
                );
              })}
            </div>
          )}
          {experiment && selectedCell && (
            <ProgramEditor
              label={`Cell ${editCell} program`}
              value={programText}
              onChange={(value) =>
                setPrograms((current) => ({ ...current, [editCell]: value }))
              }
              presets={JOURNEY_PRESETS[activeJourney] ?? []}
              onPreset={loadPreset}
            />
          )}
          {experiment && (
            <AgentPanel
              brief={brief}
              worldSummary={worldSummary(experiment, editCell)}
              schemaHelp={PROGRAM_SCHEMA_HELP}
              currentProgram={programText}
              onProgram={acceptProgram}
            />
          )}
          <div className="play-actions">
            <button
              className="lab-button primary"
              type="button"
              onClick={runToEnd}
              disabled={!experiment}
            >
              Run to end
            </button>
            <button
              className="lab-text-button"
              type="button"
              onClick={resetRun}
              disabled={!receipt && !advance}
            >
              Reset
            </button>
            <button
              className="lab-text-button"
              type="button"
              onClick={share}
              disabled={!experiment || !programText.trim()}
            >
              {shareCopied ? "Link copied" : "Copy share link"}
            </button>
          </div>
          {experiment && (
            <div className="advance-controls">
              <label htmlFor="journey-until">
                {advance?.kind === "paused" ? "Resume to tick" : "Advance to tick"}
              </label>
              <input
                id="journey-until"
                type="number"
                min={advance?.kind === "paused" ? pausedTick + 1 : 0}
                max={horizon}
                value={until}
                disabled={!canAdvance}
                onChange={(event) => setUntil(Number(event.target.value))}
              />
              <button
                className="lab-button secondary"
                type="button"
                onClick={advanceTo}
                disabled={!canAdvance}
              >
                {advance === null ? "Start" : "Resume"}
              </button>
              <span>
                {advances} of {MAX_ADVANCES} advances used
                {advance?.kind === "paused" ? ` · paused at tick ${pausedTick}` : ""}
              </span>
            </div>
          )}
          {advance?.kind === "paused" && (
            <p className="pending-warning">
              This paused world keeps the programs it started with. Reset starts
              a new world with your current edits.
            </p>
          )}
          {activeJourney === "exchange" && (
            <p className="lab-note">
              The exchange contract is graded from a complete receipt — use Run
              to end.
            </p>
          )}
        </div>
        <div className="play-stage">
          {receipt && <ReplayStage receipt={receipt} />}
          {!receipt && finishedReceipt && <ReplayStage receipt={finishedReceipt} />}
          {!receipt && !finished && pausedReceipt && pausedFrame && (
            <>
              <figure className="replay-map">
                <RecordedHabitat receipt={pausedReceipt} frame={pausedFrame} />
                <figcaption>
                  Paused at tick {pausedFrame.tick}
                  {horizon ? ` of ${horizon}` : ""}. The same world resumes from
                  this exact state — cargo, memory, and reports in flight
                  included.
                </figcaption>
              </figure>
              <p className="lab-note">
                {number(work(pausedFrame.costs))} modeled work so far.
              </p>
            </>
          )}
          {!receipt && !advance && (
            <div className="play-placeholder">
              <p>
                Pick a case, edit a cell program, then run to the end or advance
                the same world tick by tick.
              </p>
              <p className="lab-note">
                A continuous habitat pauses and resumes without losing carried
                state — the Rust engine checks every prefix.
              </p>
            </div>
          )}
          {outcome && (
            <p className={outcome.outcome?.passed ? "play-pass" : "play-fail"}>
              {outcome.outcome?.passed
                ? "World contract passed"
                : "World contract failed"}{" "}
              — {outcome.status ?? "finished"} · {outcome.ticks_completed ?? 0}{" "}
              ticks · {number(work(outcome.costs))} modeled work.
            </p>
          )}
          {outcome?.outcome?.passed && nextCase && nextJourney && (
            <p className="play-next">
              <Link
                className="lab-button secondary"
                href={`/play/lab?mode=journeys&case=${nextCase}`}
              >
                Next: {JOURNEY_DESCRIPTIONS[nextJourney]?.title ?? nextJourney}{" "}
                <span aria-hidden="true">→</span>
              </Link>
            </p>
          )}
          {grade && (
            <div className="milestone-rail">
              <GradeRail journey={activeJourney} grade={grade} tick={gradeTick} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
