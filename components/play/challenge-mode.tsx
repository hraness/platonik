"use client";

import { useEffect, useState } from "react";
import {
  engine,
  type Challenge,
  type ChallengeInfo,
  type ChallengeResult,
  type Program,
  type Submission,
  type WasmModule,
} from "@/lib/play/engine";
import type { Receipt } from "@/lib/bridge/types";
import { CHALLENGE_FAMILIES, challengeId } from "@/lib/play/missions";
import {
  allScores,
  getScore,
  saveScore,
  type ChallengeScore,
} from "@/lib/play/saves";
import { PROGRAM_SCHEMA_HELP } from "@/lib/play/schema-help";
import { AgentPanel } from "./agent-panel";
import { ProgramEditor } from "./program-editor";
import { ReplayStage } from "./replay-stage";

const number = (value: number) => value.toLocaleString("en-US");
const totalWork = (costs: Record<string, number>) =>
  Object.values(costs).reduce((sum, value) => sum + value, 0);
const describe = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

/** Experiment JSON as the frontend needs it: enough to graft and summarize. */
interface ExperimentShape {
  width?: number;
  height?: number;
  walls?: unknown[];
  cells?: {
    id: number;
    position?: { x: number; y: number };
    heading?: string;
    mobile?: boolean;
    program?: unknown;
  }[];
  sources?: { id: number; position?: { x: number; y: number } }[];
  depots?: { id: number; position?: { x: number; y: number } }[];
  beacons?: { id: number; position?: { x: number; y: number } }[];
  valves?: { id: number; position?: { x: number; y: number } }[];
  links?: { id: number }[];
  ticks?: number;
  fuel?: number;
  construction?: {
    stocks?: { id: number; position?: { x: number; y: number } }[];
    blueprints?: { id: number }[];
  };
  [key: string]: unknown;
}

interface CaseRun {
  index: number;
  passed: boolean;
  work: number;
  ticks: number;
  receipt: Receipt;
}

/** Starter programs offered per family; names resolve via engine.referenceProgram. */
const FAMILY_PRESETS: Record<string, { name: string; label: string }[]> = {
  crossing: [
    { name: "idle", label: "Idle" },
    { name: "compact", label: "Compact" },
    { name: "resilient", label: "Resilient" },
  ],
  switchboard: [
    { name: "idle", label: "Idle" },
    { name: "switchboard-keeper", label: "Keeper" },
    { name: "switchboard-porter", label: "Porter" },
  ],
  foundry: [
    { name: "idle", label: "Idle" },
    { name: "foundry-builder", label: "Builder" },
  ],
};

function familyTitle(id: string): string {
  return CHALLENGE_FAMILIES.find((family) => family.id === id)?.title ?? id;
}

function familyRange(range: readonly [number, number]): number[] {
  const [lo, hi] = range;
  return Array.from({ length: hi - lo + 1 }, (_, offset) => lo + offset);
}

function position(point?: { x: number; y: number }): string {
  return point ? `(${point.x},${point.y})` : "(?)";
}

/** One editable program per challenge; the starting text is the cell's own. */
function startingProgramText(challenge: Challenge): string {
  const editable = challenge.editable[0];
  const first = challenge.train[0] as ExperimentShape | undefined;
  const cell = first?.cells?.find((candidate) => candidate.id === editable);
  return JSON.stringify(cell?.program ?? { rules: [] }, null, 2);
}

function parseProgram(text: string): Program {
  if (!text.trim()) throw new Error("The program is empty.");
  const parsed = JSON.parse(text) as Program;
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.rules)) {
    throw new Error("A program is an object with a rules array.");
  }
  return parsed;
}

function worldSummary(experiment: ExperimentShape | undefined): string {
  if (!experiment) return "World details unavailable.";
  const lines: string[] = [
    `Grid ${experiment.width ?? "?"}×${experiment.height ?? "?"}, ${experiment.walls?.length ?? 0} walls.`,
  ];
  for (const cell of experiment.cells ?? []) {
    lines.push(
      `cell ${cell.id} at ${position(cell.position)}${cell.heading ? ` heading ${cell.heading}` : ""}${cell.mobile === false ? " (fixed)" : ""}`
    );
  }
  for (const source of experiment.sources ?? []) {
    lines.push(`source ${source.id} at ${position(source.position)}`);
  }
  for (const depot of experiment.depots ?? []) {
    lines.push(`depot ${depot.id} at ${position(depot.position)}`);
  }
  for (const beacon of experiment.beacons ?? []) {
    lines.push(`beacon ${beacon.id} at ${position(beacon.position)}`);
  }
  for (const valve of experiment.valves ?? []) {
    lines.push(`valve ${valve.id} at ${position(valve.position)}`);
  }
  if (experiment.links?.length) {
    lines.push(`${experiment.links.length} links between cells.`);
  }
  if (experiment.construction) {
    lines.push(
      `construction: ${experiment.construction.stocks?.length ?? 0} material stocks, ${experiment.construction.blueprints?.length ?? 0} blueprints.`
    );
  }
  if (experiment.ticks) {
    lines.push(`tick limit ${experiment.ticks}, fuel ${experiment.fuel ?? "?"}.`);
  }
  return lines.join("\n");
}

/**
 * Scored challenges: pick one of 96 generated worlds, iterate a single program
 * on its public train cases, then score once against the reserved eval set.
 * Local scores persist in IndexedDB; ranked entry goes through the season PR.
 */
export function ChallengeMode({ wasm }: { wasm: WasmModule }) {
  const [selected, setSelected] = useState(1);
  const [info, setInfo] = useState<ChallengeInfo | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [programText, setProgramText] = useState("");
  const [passed, setPassed] = useState<Set<string>>(new Set());
  const [cases, setCases] = useState<CaseRun[]>([]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [activeRow, setActiveRow] = useState<string | null>(null);
  const [result, setResult] = useState<ChallengeResult | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [busy, setBusy] = useState<"practice" | "scoring" | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load saved scores once, and brief the default selection (challenge-0001).
  useEffect(() => {
    let cancelled = false;
    allScores()
      .then((rows) => {
        if (!cancelled) {
          setPassed(new Set(rows.filter((row) => row.passed).map((row) => row.challenge)));
        }
      })
      .catch(() => {});
    try {
      const meta = engine.challengeInfo(wasm, 1);
      if (!cancelled) setInfo(meta);
    } catch (cause) {
      if (!cancelled) setError(describe(cause));
    }
    return () => {
      cancelled = true;
    };
  }, [wasm]);

  function selectChallenge(index: number) {
    setSelected(index);
    setInfo(null);
    setChallenge(null);
    setProgramText("");
    setCases([]);
    setReceipt(null);
    setActiveRow(null);
    setResult(null);
    setSubmission(null);
    setError(null);
    try {
      setInfo(engine.challengeInfo(wasm, index));
    } catch (cause) {
      setError(describe(cause));
    }
  }

  /**
   * The full challenge payload is fetched lazily — the picker and brief run on
   * `challengeInfo` alone; cases arrive only when the run path needs them.
   * Returns the challenge plus the program text to use (the editor's own, or
   * the editable cell's starting program when the editor is still empty).
   */
  function ensureChallenge(): { full: Challenge; text: string } {
    if (challenge && challenge.index === selected) {
      return { full: challenge, text: programText };
    }
    const full = engine.challenge(wasm, selected);
    setChallenge(full);
    let text = programText;
    if (!text.trim()) {
      text = startingProgramText(full);
      setProgramText(text);
    }
    return { full, text };
  }

  function loadPreset(name: string) {
    try {
      const program = engine.referenceProgram(wasm, name);
      setProgramText(JSON.stringify(program, null, 2));
      setError(null);
    } catch (cause) {
      setError(describe(cause));
    }
  }

  function loadStartingProgram() {
    try {
      ensureChallenge();
      setError(null);
    } catch (cause) {
      setError(describe(cause));
    }
  }

  function practice() {
    if (busy) return;
    setError(null);
    setBusy("practice");
    setResult(null);
    setSubmission(null);
    // Defer one tick so the "Running…" state paints before the synchronous runs.
    window.setTimeout(() => {
      try {
        const { full, text } = ensureChallenge();
        const program = parseProgram(text);
        const editable = full.editable[0];
        const runs = full.train.map((experiment, index) => {
          const grafted = JSON.parse(JSON.stringify(experiment)) as ExperimentShape;
          const cell = grafted.cells?.find((candidate) => candidate.id === editable);
          if (!cell) throw new Error(`Train case ${index + 1} has no cell ${editable}.`);
          cell.program = program;
          const runReceipt = engine.run(wasm, grafted) as unknown as Receipt;
          return {
            index,
            passed: runReceipt.result.outcome.passed,
            work: totalWork(runReceipt.result.costs),
            ticks: runReceipt.result.ticks_completed,
            receipt: runReceipt,
          };
        });
        setCases(runs);
        if (runs.length > 0) {
          setReceipt(runs[0].receipt);
          setActiveRow("train-0");
        }
      } catch (cause) {
        setError(describe(cause));
      } finally {
        setBusy(null);
      }
    }, 50);
  }

  async function persistScore(res: ChallengeResult, sub: Submission) {
    try {
      const previous = await getScore(res.challenge);
      const better =
        !previous ||
        (res.passed && !previous.passed) ||
        (res.passed === previous.passed && res.total_work < previous.total_work);
      if (better) {
        const entry: ChallengeScore = {
          challenge: res.challenge,
          index: res.index,
          passed: res.passed,
          cases_passed: res.cases_passed,
          cases_total: res.cases_total,
          total_work: res.total_work,
          program_bytes: res.program_bytes,
          submission_hash: res.submission_hash,
          updated: Date.now(),
          submission: sub,
        };
        await saveScore(entry);
      }
      const rows = await allScores();
      setPassed(new Set(rows.filter((row) => row.passed).map((row) => row.challenge)));
    } catch (cause) {
      setError(`Scored, but the local save failed: ${describe(cause)}`);
    }
  }

  function score() {
    if (busy) return;
    setError(null);
    setBusy("scoring");
    // Defer one tick so the "Scoring…" state paints before the synchronous eval.
    window.setTimeout(() => {
      try {
        const { full, text } = ensureChallenge();
        const program = parseProgram(text);
        const sub = engine.makeSubmission(wasm, full, {
          [String(full.editable[0])]: program,
        });
        const res = engine.evaluate(wasm, full, sub);
        setSubmission(sub);
        setResult(res);
        const first = res.receipts[0] as Receipt | undefined;
        if (first) {
          setReceipt(first);
          setActiveRow("eval-0");
        }
        void persistScore(res, sub);
      } catch (cause) {
        setError(describe(cause));
      } finally {
        setBusy(null);
      }
    }, 50);
  }

  function acceptProgram(json: string): string | null {
    try {
      const program = parseProgram(json);
      setProgramText(JSON.stringify(program, null, 2));
      setError(null);
      return null;
    } catch (cause) {
      return describe(cause);
    }
  }

  async function copySubmission() {
    if (!submission) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(submission, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Clipboard is unavailable — select and copy the submission text manually.");
    }
  }

  const presets = FAMILY_PRESETS[info?.family ?? "crossing"] ?? FAMILY_PRESETS.crossing;

  return (
    <div>
      <div className="challenge-picker" role="group" aria-label="Choose a challenge">
        {CHALLENGE_FAMILIES.map((family) => (
          <section className="challenge-family" key={family.id}>
            <h3>{family.title}</h3>
            <p className="lab-note">{family.detail}</p>
            <div className="challenge-grid">
              {familyRange(family.range).map((index) => {
                const id = challengeId(index);
                const cleared = passed.has(id);
                return (
                  <button
                    key={id}
                    type="button"
                    className={`challenge-cell${selected === index ? " active" : ""}`}
                    onClick={() => selectChallenge(index)}
                    aria-pressed={selected === index}
                    title={cleared ? `${id} — cleared` : id}
                  >
                    {String(index).padStart(4, "0")}
                    {cleared && (
                      <span className="challenge-check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {error && (
        <p className="play-error" role="alert">
          {error}
        </p>
      )}

      <div className="play-viewer">
        <div className="play-controls">
          {info ? (
            <div className="challenge-brief">
              <h2>{info.id}</h2>
              <p className="lab-note">
                {familyTitle(info.family)} family · band {info.band} of 4 · editable cell
                {info.editable.length === 1 ? "" : "s"} {info.editable.join(", ")} · witness{" "}
                {info.witness} · {info.train_cases} train / {info.eval_cases} eval cases
              </p>
            </div>
          ) : (
            <p className="lab-note">Select a challenge to see its brief.</p>
          )}

          <ProgramEditor
            label={info ? `Program for cell ${info.editable[0]}` : "Program"}
            value={programText}
            onChange={setProgramText}
            presets={presets}
            onPreset={loadPreset}
          />
          {!challenge && info && (
            <button className="lab-text-button" type="button" onClick={loadStartingProgram}>
              Load the cell&rsquo;s starting program
            </button>
          )}

          <div className="play-loaders">
            <button
              className="lab-button primary"
              type="button"
              disabled={busy !== null || !info}
              onClick={practice}
            >
              {busy === "practice" ? "Running…" : "Practice on train cases"}
            </button>
            <button
              className="lab-button secondary"
              type="button"
              disabled={busy !== null || !info}
              onClick={score}
            >
              {busy === "scoring" ? "Scoring…" : "Score (reserved cases)"}
            </button>
          </div>

          {result && (
            <div
              className={`verdict-banner ${result.passed ? "play-pass" : "play-fail"}`}
              role="status"
            >
              <strong>
                {result.passed
                  ? `Cleared — ${result.cases_passed}/${result.cases_total} cases, ${number(result.total_work)} work`
                  : `Not yet — ${result.cases_passed}/${result.cases_total}`}
              </strong>
              <span className="lab-note">
                Local score — ranked entry goes through the season.
              </span>
            </div>
          )}

          {submission && (
            <details className="season-entry">
              <summary>Enter season</summary>
              <p className="lab-note">
                Season entry happens via GitHub PR: add this submission as{" "}
                <code>season/entries/&lt;your-login&gt;-&lt;n&gt;.json</code> — see{" "}
                <code>docs/seasons.md</code>.
              </p>
              <pre className="agent-prompt" tabIndex={0} aria-label="Season submission JSON">
                {JSON.stringify(submission, null, 2)}
              </pre>
              <button className="lab-button secondary" type="button" onClick={copySubmission}>
                {copied ? "Copied" : "Copy submission"}
              </button>
            </details>
          )}

          {challenge && (
            <AgentPanel
              brief={`Write a program for the editable cell that passes all cases of ${challenge.id} (family ${challenge.family}, band ${challenge.band})`}
              worldSummary={worldSummary(challenge.train[0] as ExperimentShape)}
              schemaHelp={PROGRAM_SCHEMA_HELP}
              currentProgram={programText}
              onProgram={acceptProgram}
            />
          )}
        </div>

        <div className="play-stage">
          {cases.length > 0 && (
            <div className="case-results" aria-label="Train case results">
              {cases.map((run) => (
                <button
                  key={run.index}
                  type="button"
                  className={`case-row${activeRow === `train-${run.index}` ? " active" : ""}`}
                  onClick={() => {
                    setReceipt(run.receipt);
                    setActiveRow(`train-${run.index}`);
                  }}
                >
                  <span>Case {run.index + 1}</span>
                  <span className={run.passed ? "play-pass" : "play-fail"}>
                    {run.passed ? "pass" : "fail"}
                  </span>
                  <span>
                    {number(run.work)} work · {run.ticks} ticks
                  </span>
                </button>
              ))}
            </div>
          )}

          {result && result.cases.length > 0 && (
            <div className="case-results" aria-label="Reserved case results">
              {result.cases.map((evalCase, index) => (
                <button
                  key={evalCase.id || index}
                  type="button"
                  className={`case-row${activeRow === `eval-${index}` ? " active" : ""}`}
                  title={evalCase.id}
                  onClick={() => {
                    const evalReceipt = result.receipts[index] as Receipt | undefined;
                    if (evalReceipt) {
                      setReceipt(evalReceipt);
                      setActiveRow(`eval-${index}`);
                    }
                  }}
                >
                  <span>Eval {index + 1}</span>
                  <span className={evalCase.passed ? "play-pass" : "play-fail"}>
                    {evalCase.passed ? "pass" : "fail"}
                  </span>
                  <span>{number(evalCase.work)} work</span>
                </button>
              ))}
            </div>
          )}

          {receipt ? (
            <ReplayStage receipt={receipt} />
          ) : (
            <div className="play-placeholder">
              <p>
                Pick a challenge, then <strong>practice on the train cases</strong> or score against
                the reserved set.
              </p>
              <p className="lab-note">
                Runs execute in this tab on the Rust engine compiled to WebAssembly. Receipts replay
                deterministically — no server call, no account.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
