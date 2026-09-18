"use client";

import { useEffect, useMemo, useState } from "react";
import type { Receipt } from "@/lib/bridge/types";
import {
  engine,
  type Campaign,
  type ExpeditionCommand,
  type ExpeditionEvent,
  type ExpeditionProgress,
  type Program,
  type WasmModule,
} from "@/lib/play/engine";
import {
  deleteCampaign,
  listCampaigns,
  loadCampaign,
  saveCampaign,
  type CampaignSave,
} from "@/lib/play/saves";
import { buildPlayUrl } from "@/lib/play/url";
import { PROGRAM_SCHEMA_HELP } from "@/lib/play/schema-help";
import { AgentPanel } from "./agent-panel";
import { ProgramEditor } from "./program-editor";
import { ReplayStage } from "./replay-stage";

// Mirror crates/platonik-core/src/expedition.rs limits for display only; the
// engine remains authoritative and re-checks every command.
const MAX_TRIALS = 32;
const MAX_CREATIONS = 21;

// Public v1 case ids (expedition_fixtures.rs). The engine catalog is
// authoritative; these only backstop a catalog failure so the rail still works.
const FALLBACK_CASES = {
  training: ["opening-normal", "opening-collapse", "ark-plan-a", "ark-plan-b"],
  transfer: [
    "transfer-early-collapse",
    "transfer-reversed-collapse",
    "transfer-delayed-plan-a",
    "transfer-delayed-plan-b",
  ],
};

const AMBITIONS: { id: "frugal" | "resilient"; label: string; detail: string }[] = [
  {
    id: "frugal",
    label: "Frugal — free program choice",
    detail: "Free program choice: any courier and controller in the collection may be adapted.",
  },
  {
    id: "resilient",
    label: "Resilient — Fern's recovery habit is pinned",
    detail:
      "Fern's recovery habit is pinned: every trial must run the resilient courier witness unchanged.",
  },
];

const COURIER_PRESETS = [
  { name: "compact", label: "Moth (compact)" },
  { name: "resilient", label: "Fern (recovery)" },
  { name: "idle", label: "Wait only" },
];
const CONTROLLER_PRESETS = [
  { name: "controller", label: "Keeper (memory)" },
  { name: "constant-a", label: "A lamp" },
  { name: "constant-b", label: "B lamp" },
  { name: "relay", label: "Relay" },
];

const number = (value: number) => value.toLocaleString("en-US");
const totalWork = (costs: Record<string, number>) =>
  Object.values(costs).reduce((sum, value) => sum + value, 0);
const errorText = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);
const stamp = (time: number) =>
  new Date(time).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

interface LoadedCampaign {
  id: string;
  created: number;
  state: Campaign;
  events: ExpeditionEvent[];
}

function saveId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `exp-${Date.now()}`;
}

/**
 * The persistent campaign track: a named collection of courier and controller
 * creations that grows by descent, proves one unchanged pair on four training
 * cases, freezes it, and faces four one-shot transfer cases. Every command is
 * planned, applied, and journaled through the engine; saves keep the applied
 * events so the journal can always be replayed.
 */
export function ExpeditionMode({
  wasm,
  initialProgram,
}: {
  wasm: WasmModule;
  initialProgram?: Program;
}) {
  const [saves, setSaves] = useState<CampaignSave[]>([]);
  const [campaign, setCampaign] = useState<LoadedCampaign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  // A program carried in by a /play/p/<hash>?mode=expedition link waits here
  // until a campaign is open, then fills the grow editor once.
  const [sharedProgram, setSharedProgram] = useState<Program | null>(
    initialProgram ?? null
  );

  // Last completed trial's receipt + case, for the replay stage.
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [receiptCase, setReceiptCase] = useState<string | null>(null);

  // Start form.
  const [newName, setNewName] = useState("");
  const [ambition, setAmbition] = useState<"frugal" | "resilient">("frugal");

  // Trial selection — driven by the roster buttons or the selects.
  const [caseId, setCaseId] = useState("");
  const [courier, setCourier] = useState("");
  const [controller, setController] = useState("");

  // Grow form.
  const [growParent, setGrowParent] = useState("");
  const [growId, setGrowId] = useState("");
  const [growName, setGrowName] = useState("");
  const [growProgram, setGrowProgram] = useState("");

  const [freezeArmed, setFreezeArmed] = useState(false);

  const state = campaign?.state ?? null;

  const catalog = useMemo(() => {
    try {
      return engine.catalog(wasm).expedition;
    } catch {
      return FALLBACK_CASES;
    }
  }, [wasm]);

  const progressResult = useMemo<{
    progress: ExpeditionProgress | null;
    error: string | null;
  }>(() => {
    if (!state) return { progress: null, error: null };
    try {
      return { progress: engine.expeditionProgress(wasm, state), error: null };
    } catch (cause) {
      return { progress: null, error: errorText(cause) };
    }
  }, [wasm, state]);
  const progress = progressResult.progress;

  const couriers = useMemo(
    () => (state ? state.creations.filter((c) => c.role === "courier") : []),
    [state]
  );
  const controllers = useMemo(
    () => (state ? state.creations.filter((c) => c.role === "controller") : []),
    [state]
  );
  const attemptedCases = useMemo(
    () => new Set((state?.trials ?? []).map((t) => t.case_id)),
    [state]
  );
  const failedAttempts = useMemo(
    () => new Set((state?.trials ?? []).filter((t) => !t.passed).map((t) => t.case_id)),
    [state]
  );

  const growParentCreation = state?.creations.find((c) => c.id === growParent) ?? null;
  const parentProgram = useMemo(
    () => (growParentCreation ? JSON.stringify(growParentCreation.program, null, 2) : ""),
    [growParentCreation]
  );

  useEffect(() => {
    let cancelled = false;
    listCampaigns()
      .then((rows) => {
        if (!cancelled) setSaves(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep selections valid as the campaign state advances.
  useEffect(() => {
    if (!state) return;
    const courierIds = couriers.map((c) => c.id);
    const controllerIds = controllers.map((c) => c.id);
    if (state.frozen) {
      setCourier(state.frozen.courier);
      setController(state.frozen.controller);
    } else {
      if (!courierIds.includes(courier)) {
        const preferred =
          state.ambition === "resilient" && courierIds.includes("recovery")
            ? "recovery"
            : courierIds[0];
        setCourier(preferred ?? "");
      }
      if (!controllerIds.includes(controller)) {
        setController(controllerIds.includes("memory") ? "memory" : controllerIds[0] ?? "");
      }
    }
    const cases = state.frozen ? catalog.transfer : catalog.training;
    const open = cases.filter((id) => !state.frozen || !attemptedCases.has(id));
    if (!open.includes(caseId)) setCaseId(open[0] ?? "");
    if (!state.creations.some((c) => c.id === growParent)) {
      setGrowParent(state.creations[0]?.id ?? "");
    }
  }, [state, catalog, couriers, controllers, attemptedCases, courier, controller, caseId, growParent]);

  // The grow editor starts from the parent's program; reset only when the
  // parent selection (or its program) actually changes.
  useEffect(() => {
    setGrowProgram(parentProgram);
  }, [parentProgram]);

  // A program shared through a /play/p/<hash>?mode=expedition link stays
  // pending until the player applies or dismisses it in the grow section.
  useEffect(() => {
    if (initialProgram) setSharedProgram(initialProgram);
  }, [initialProgram]);

  function applySharedProgram() {
    if (!sharedProgram) return;
    setGrowProgram(JSON.stringify(sharedProgram, null, 2));
    setSharedProgram(null);
  }

  async function persist(next: LoadedCampaign) {
    await saveCampaign({
      id: next.id,
      kind: "expedition",
      name: next.state.name,
      ambition: next.state.ambition,
      created: next.created,
      updated: Date.now(),
      state: next.state,
      events: next.events,
    });
    setCampaign(next);
    try {
      setSaves(await listCampaigns());
    } catch {
      // A stale list is harmless; the loaded campaign is already in state.
    }
  }

  async function begin() {
    setError(null);
    setBusy(true);
    try {
      const fresh = engine.expeditionNew(wasm, newName.trim(), ambition);
      setReceipt(null);
      setReceiptCase(null);
      await persist({ id: saveId(), created: Date.now(), state: fresh, events: [] });
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function resume(id: string) {
    setError(null);
    setBusy(true);
    try {
      const save = await loadCampaign(id);
      if (!save) throw new Error("That saved expedition could not be found.");
      setCampaign({
        id: save.id,
        created: save.created,
        state: save.state as Campaign,
        events: save.events as ExpeditionEvent[],
      });
      setReceipt(null);
      setReceiptCase(null);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this saved expedition? Its journal cannot be recovered.")) return;
    setError(null);
    try {
      await deleteCampaign(id);
      if (campaign?.id === id) {
        setCampaign(null);
        setReceipt(null);
      }
      setSaves(await listCampaigns());
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  /**
   * A trial is two journaled events: plan admits a `started` event and returns
   * the exact experiment; applying it commits the intent (state.pending). Only
   * then does the run produce a receipt, which `expeditionComplete` turns into
   * the `completed` event applied next. Each apply is saved so an interrupted
   * trial is recoverable.
   */
  async function runTrial() {
    if (!campaign || busy) return;
    setError(null);
    setBusy(true);
    try {
      const command: ExpeditionCommand = {
        kind: "trial",
        case_id: caseId,
        courier,
        controller,
      };
      const { event: started, experiment } = engine.expeditionPlan(wasm, campaign.state, command);
      let next = engine.expeditionApply(wasm, campaign.state, started);
      let events = [...campaign.events, started];
      await persist({ ...campaign, state: next, events });
      if (experiment) {
        const result = engine.run(wasm, experiment) as unknown as Receipt;
        const completed = engine.expeditionComplete(wasm, next, result);
        next = engine.expeditionApply(wasm, next, completed);
        events = [...events, completed];
        await persist({ ...campaign, state: next, events });
        setReceipt(result);
        setReceiptCase(caseId);
      }
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  /** Re-run the exact committed experiment for a pending trial and complete it. */
  async function recover() {
    if (!campaign || busy || !campaign.state.pending) return;
    setError(null);
    setBusy(true);
    try {
      const pending = campaign.state.pending;
      const experiment = engine.expeditionTrialExperiment(wasm, campaign.state, pending.command);
      const result = engine.run(wasm, experiment) as unknown as Receipt;
      const completed = engine.expeditionComplete(wasm, campaign.state, result);
      const next = engine.expeditionApply(wasm, campaign.state, completed);
      await persist({ ...campaign, state: next, events: [...campaign.events, completed] });
      setReceipt(result);
      setReceiptCase(pending.command.kind === "trial" ? pending.command.case_id : null);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function grow() {
    if (!campaign || busy) return;
    setError(null);
    let program: Program;
    try {
      program = JSON.parse(growProgram) as Program;
    } catch (cause) {
      setError(`The child program is not valid JSON: ${errorText(cause)}`);
      return;
    }
    setBusy(true);
    try {
      const command: ExpeditionCommand = {
        kind: "grow",
        id: growId.trim(),
        name: growName.trim(),
        parent: growParent,
        program,
      };
      const { event } = engine.expeditionPlan(wasm, campaign.state, command);
      const next = engine.expeditionApply(wasm, campaign.state, event);
      await persist({ ...campaign, state: next, events: [...campaign.events, event] });
      setGrowId("");
      setGrowName("");
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function freeze() {
    if (!campaign || busy) return;
    setError(null);
    setBusy(true);
    try {
      const command: ExpeditionCommand = { kind: "freeze", courier, controller };
      const { event } = engine.expeditionPlan(wasm, campaign.state, command);
      const next = engine.expeditionApply(wasm, campaign.state, event);
      await persist({ ...campaign, state: next, events: [...campaign.events, event] });
      setFreezeArmed(false);
    } catch (cause) {
      setError(errorText(cause));
      setFreezeArmed(false);
    } finally {
      setBusy(false);
    }
  }

  function loadPreset(name: string) {
    try {
      setGrowProgram(JSON.stringify(engine.referenceProgram(wasm, name), null, 2));
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  function acceptAgentProgram(json: string): string | null {
    try {
      const parsed = JSON.parse(json) as Program;
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.rules)) {
        return "A program is an object with a rules array.";
      }
      setGrowProgram(JSON.stringify(parsed, null, 2));
      return null;
    } catch (cause) {
      return `JSON error: ${errorText(cause)}`;
    }
  }

  /** Share the grow program: the URL carries it to another player's grow editor. */
  async function shareGrowProgram() {
    try {
      const program = JSON.parse(growProgram) as Program;
      if (!program || typeof program !== "object" || !Array.isArray(program.rules)) {
        throw new Error("A program is an object with a rules array.");
      }
      const url = await buildPlayUrl({ track: "expedition", program });
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1600);
    } catch (cause) {
      setError(`Share failed: ${errorText(cause)}`);
    }
  }

  function chipState(id: string, done: string[], failed: string[]): "done" | "failed" | "missing" {
    if (done.includes(id)) return "done";
    if (failed.includes(id) || failedAttempts.has(id)) return "failed";
    return "missing";
  }

  // ---- start / resume screen ----
  if (!campaign || !state) {
    return (
      <div className="expedition-start">
        <h2>Field expedition</h2>
        <p className="lab-note">
          A persistent campaign: grow a collection of couriers and controllers, pass the four
          training cases with one unchanged pair, freeze that pair, then face four one-shot
          transfer cases. The discovery allowance is {MAX_TRIALS} trials, {MAX_CREATIONS}{" "}
          creations, and a fixed work budget — the journal is replayable end to end.
        </p>
        <label htmlFor="expedition-name">Expedition name</label>
        <input
          id="expedition-name"
          type="text"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          maxLength={96}
          placeholder="First camp"
        />
        <label htmlFor="expedition-ambition">Ambition</label>
        <select
          id="expedition-ambition"
          value={ambition}
          onChange={(event) => setAmbition(event.target.value as "frugal" | "resilient")}
        >
          {AMBITIONS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <p className="lab-note">{AMBITIONS.find((item) => item.id === ambition)?.detail}</p>
        {sharedProgram && (
          <p className="lab-note">
            A program shared by URL is loaded — it will fill the grow editor once you open an
            expedition.
          </p>
        )}
        <button
          className="lab-button primary"
          type="button"
          disabled={busy || !newName.trim()}
          onClick={begin}
        >
          Begin expedition
        </button>
        {error && (
          <p className="play-error" role="alert">
            {error}
          </p>
        )}
        {saves.length > 0 && (
          <>
            <h3>Saved expeditions</h3>
            <div className="campaign-list">
              {saves.map((save) => {
                const saved = save.state as Campaign;
                return (
                  <div className="campaign-row" key={save.id}>
                    <button
                      className="lab-text-button"
                      type="button"
                      onClick={() => resume(save.id)}
                      disabled={busy}
                    >
                      <span className="campaign-name">{save.name}</span>
                      <span className="campaign-meta">
                        {" "}
                        · {save.ambition} · {saved.trials?.length ?? 0} trials ·{" "}
                        {stamp(save.updated)}
                      </span>
                    </button>
                    <button
                      className="lab-text-button"
                      type="button"
                      onClick={() => remove(save.id)}
                      aria-label={`Delete expedition ${save.name}`}
                    >
                      Delete
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  // ---- loaded campaign ----
  const pending = state.pending;
  const pendingCase =
    pending && pending.command.kind === "trial" ? pending.command.case_id : null;
  const missingForPair = catalog.training.filter(
    (id) =>
      !state.trials.some(
        (t) => t.case_id === id && t.courier === courier && t.controller === controller && t.passed
      )
  );
  const freezeBlock = pending
    ? "A trial is pending — recover it before freezing."
    : missingForPair.length > 0
      ? `All four training cases must pass with this unchanged pair. Still missing: ${missingForPair.join(", ")}.`
      : null;
  const trialsExhausted = state.trials.length >= MAX_TRIALS;
  const creationsFull = state.creations.length >= MAX_CREATIONS;
  const caseOptions = state.frozen ? catalog.transfer : catalog.training;

  return (
    <div className="expedition-mode">
      <div className="expedition-header">
        <span>
          <strong>{state.name}</strong>
        </span>
        <span>
          ambition <strong>{state.ambition}</strong>
        </span>
        <span>
          work{" "}
          <strong>
            {number(state.work)} / {number(state.allowance)}
          </strong>
        </span>
        <span>
          trials{" "}
          <strong>
            {state.trials.length} / {MAX_TRIALS}
          </strong>
        </span>
        <span>
          creations{" "}
          <strong>
            {state.creations.length} / {MAX_CREATIONS}
          </strong>
        </span>
        {pending && <span className="play-fail">trial interrupted</span>}
        <button className="lab-text-button" type="button" onClick={() => setCampaign(null)}>
          All expeditions
        </button>
      </div>

      {pending && (
        <div className="pending-warning">
          <p>
            <strong>A trial was interrupted.</strong> The committed intent
            {pendingCase ? ` (${pendingCase})` : ""} reserved {number(pending.reserved_work)} work;
            the campaign is paused until that exact trial is completed.
          </p>
          <button className="lab-button secondary" type="button" disabled={busy} onClick={recover}>
            {busy ? "Running…" : "Re-run the committed trial"}
          </button>
        </div>
      )}

      {progress && <div className="objective-banner">{progress.next}</div>}
      {progressResult.error && (
        <p className="play-error" role="alert">
          {progressResult.error}
        </p>
      )}

      <div className="case-chips" aria-label="Training cases">
        <span className="lab-note">Training</span>
        {catalog.training.map((id) => {
          const status = chipState(id, progress?.completed_training ?? [], []);
          return (
            <span key={id} className={`case-chip ${status === "done" ? "done" : status === "failed" ? "failed" : ""}`}>
              {id}
            </span>
          );
        })}
      </div>
      <div className="case-chips" aria-label="Transfer cases">
        <span className="lab-note">Transfer{state.frozen ? "" : " — unlocks at freeze"}</span>
        {catalog.transfer.map((id) => {
          const status = chipState(
            id,
            progress?.completed_transfer ?? [],
            progress?.failed_transfer ?? []
          );
          return (
            <span key={id} className={`case-chip ${status === "done" ? "done" : status === "failed" ? "failed" : ""}`}>
              {id}
            </span>
          );
        })}
      </div>

      {progress?.field_expedition_complete && progress.reply && (
        <div className="ending-reply">{progress.reply}</div>
      )}

      {error && (
        <p className="play-error" role="alert">
          {error}
        </p>
      )}

      <div className="play-viewer">
        <div className="play-controls">
          <section className="expedition-section">
            <h3>Collection</h3>
            <div className="roster">
              {state.creations.map((creation) => {
                const selected =
                  creation.role === "courier"
                    ? creation.id === courier
                    : creation.id === controller;
                const inFrozenPair =
                  state.frozen !== null &&
                  ((creation.role === "courier" && state.frozen.courier === creation.id) ||
                    (creation.role === "controller" && state.frozen.controller === creation.id));
                return (
                  <div className="roster-row" key={creation.id}>
                    <span>
                      <strong>{creation.name}</strong> <code>{creation.id}</code>{" "}
                      {inFrozenPair && <span className="case-chip done">frozen</span>}
                    </span>
                    <span>
                      {creation.role} · {creation.program.rules.length} rules ·{" "}
                      {creation.parent ? `child of ${creation.parent}` : "genesis"}
                    </span>
                    <button
                      className="lab-text-button"
                      type="button"
                      disabled={busy || state.frozen !== null}
                      onClick={() =>
                        creation.role === "courier"
                          ? setCourier(creation.id)
                          : setController(creation.id)
                      }
                    >
                      {state.frozen
                        ? inFrozenPair
                          ? "frozen pair"
                          : "—"
                        : selected
                          ? "selected"
                          : `use as ${creation.role}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="expedition-section">
            <h3>Run a trial</h3>
            <div className="trial-form">
              <label>
                Case
                <select value={caseId} onChange={(event) => setCaseId(event.target.value)}>
                  {caseOptions.every((id) => state.frozen !== null && attemptedCases.has(id)) && (
                    <option value="" disabled>
                      all cases recorded
                    </option>
                  )}
                  {caseOptions.map((id) => {
                    const recorded = state.frozen !== null && attemptedCases.has(id);
                    const passed = state.frozen
                      ? progress?.completed_transfer.includes(id)
                      : progress?.completed_training.includes(id);
                    return (
                      <option key={id} value={id} disabled={recorded}>
                        {id}
                        {recorded ? (passed ? " — passed" : " — recorded") : passed ? " — passed" : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label>
                Courier
                <select
                  value={courier}
                  disabled={state.frozen !== null}
                  onChange={(event) => setCourier(event.target.value)}
                >
                  {couriers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Controller
                <select
                  value={controller}
                  disabled={state.frozen !== null}
                  onChange={(event) => setController(event.target.value)}
                >
                  {controllers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="lab-button primary"
                type="button"
                disabled={
                  busy || pending !== null || trialsExhausted || !caseId || !courier || !controller
                }
                onClick={runTrial}
              >
                {busy ? "Running…" : "Run trial"}
              </button>
            </div>
            <p className="lab-note">
              {trialsExhausted
                ? "The 32-trial discovery allowance is exhausted."
                : state.frozen
                  ? "Transfer cases are one-shot: a recorded failure cannot be retried in this expedition."
                  : "Training cases may be retried until a pair is frozen."}
            </p>
          </section>

          {!state.frozen && (
            <section className="expedition-section">
              <h3>Grow a creation</h3>
              {sharedProgram && (
                <div className="objective-banner">
                  <span>A program shared by URL is loaded.</span>
                  <button
                    className="lab-button secondary"
                    type="button"
                    onClick={applySharedProgram}
                  >
                    Use it in the grow editor
                  </button>
                  <button
                    className="lab-text-button"
                    type="button"
                    onClick={() => setSharedProgram(null)}
                  >
                    Dismiss
                  </button>
                </div>
              )}
              <div className="grow-form">
                <label>
                  Name
                  <input
                    type="text"
                    value={growName}
                    onChange={(event) => setGrowName(event.target.value)}
                    maxLength={96}
                    placeholder="Moth's detour"
                  />
                </label>
                <label>
                  ID
                  <input
                    type="text"
                    value={growId}
                    onChange={(event) => setGrowId(event.target.value)}
                    maxLength={48}
                    placeholder="moth-child"
                  />
                </label>
                <label>
                  Parent
                  <select value={growParent} onChange={(event) => setGrowParent(event.target.value)}>
                    {state.creations.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.role})
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="lab-button primary"
                  type="button"
                  disabled={
                    busy ||
                    pending !== null ||
                    creationsFull ||
                    !growId.trim() ||
                    !growName.trim() ||
                    !growParentCreation
                  }
                  onClick={grow}
                >
                  Grow
                </button>
              </div>
              <p className="lab-note">
                IDs are immutable — lowercase letters, digits and dashes, starting with a letter. A
                courier parent yields a courier child, a controller parent a controller child; the
                child is validated in the ark-plan-a world before joining the collection.
                {creationsFull ? " The collection creation limit is reached." : ""}
              </p>
              <ProgramEditor
                label={`Child program (${growParentCreation?.role ?? "creation"})`}
                value={growProgram}
                onChange={setGrowProgram}
                presets={growParentCreation?.role === "controller" ? CONTROLLER_PRESETS : COURIER_PRESETS}
                onPreset={loadPreset}
              />
              <AgentPanel
                brief={
                  growParentCreation
                    ? `Grow a child ${growParentCreation.role} for the expedition "${state.name}" (ambition: ${state.ambition}). The child descends from "${growParentCreation.name}" (${growParentCreation.id}); the parent stays in the collection unchanged. Write the child's program — it is validated in the ark-plan-a world in place of the ${growParentCreation.role} cell before it can join the collection.`
                    : "Write a program for a new expedition creation."
                }
                worldSummary={`Validation world: 9×5 grid with valve (ark-plan-a). The child program replaces the ${growParentCreation?.role ?? "courier"} cell's program; the other cells keep their reference programs.`}
                schemaHelp={PROGRAM_SCHEMA_HELP}
                currentProgram={growProgram}
                onProgram={acceptAgentProgram}
              />
              <button
                className="lab-button secondary"
                type="button"
                disabled={busy}
                onClick={shareGrowProgram}
              >
                {shareCopied ? "Link copied" : "Copy share link"}
              </button>
            </section>
          )}

          {!state.frozen && (
            <section className="expedition-section">
              <h3>Freeze the selection</h3>
              <p className="lab-note">
                Freezing <strong>{courier || "…"}</strong> + <strong>{controller || "…"}</strong>{" "}
                ends training and unlocks the four one-shot transfer cases. The frozen pair can no
                longer change.
              </p>
              {freezeArmed ? (
                <div className="play-actions">
                  <button
                    className="lab-button primary"
                    type="button"
                    disabled={busy || pending !== null}
                    onClick={freeze}
                  >
                    Confirm freeze — this cannot be undone
                  </button>
                  <button
                    className="lab-button secondary"
                    type="button"
                    onClick={() => setFreezeArmed(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="lab-button secondary"
                  type="button"
                  disabled={busy || freezeBlock !== null}
                  onClick={() => setFreezeArmed(true)}
                >
                  Freeze this pair
                </button>
              )}
              {freezeBlock && <p className="lab-note">{freezeBlock}</p>}
            </section>
          )}

          {state.frozen && sharedProgram && (
            <p className="lab-note">
              A program shared by URL is loaded, but this expedition is frozen — growth has ended.{" "}
              <button
                className="lab-text-button"
                type="button"
                onClick={() => setSharedProgram(null)}
              >
                Dismiss
              </button>
            </p>
          )}

          {state.frozen && (
            <section className="expedition-section">
              <h3>Frozen pair</h3>
              <p className="lab-note">
                <strong>{state.frozen.courier}</strong> + <strong>{state.frozen.controller}</strong>{" "}
                are frozen. Training is closed and growth has ended; each remaining transfer case
                runs exactly once with this pair.
              </p>
            </section>
          )}

          {state.trials.length > 0 && (
            <section className="expedition-section">
              <h3>Trial log</h3>
              <div className="roster">
                {[...state.trials]
                  .reverse()
                  .slice(0, 8)
                  .map((trial, index) => (
                    <div className="roster-row" key={`${trial.receipt_hash}-${index}`}>
                      <span>{trial.case_id}</span>
                      <span>
                        {trial.courier} + {trial.controller}
                      </span>
                      <span className={trial.passed ? "play-pass" : "play-fail"}>
                        {trial.passed ? "passed" : "failed"}
                      </span>
                      <span>
                        {number(trial.work)} work · {trial.ticks} ticks
                      </span>
                    </div>
                  ))}
              </div>
            </section>
          )}
        </div>

        <div className="play-stage">
          {receipt ? (
            <>
              <p className="lab-note">
                {receiptCase ? `${receiptCase} — ` : ""}
                {receipt.result.outcome.passed ? (
                  <strong className="play-pass">passed</strong>
                ) : (
                  <strong className="play-fail">failed</strong>
                )}
                . {receipt.result.ticks_completed} ticks; {number(totalWork(receipt.result.costs))}{" "}
                modeled work.
              </p>
              <ReplayStage receipt={receipt} />
            </>
          ) : (
            <div className="play-placeholder">
              <p>
                Pick a case, a courier and a controller, then <strong>Run trial</strong> to watch
                the recorded replay here.
              </p>
              <p className="lab-note">
                Every trial runs the deterministic Rust engine in this tab and appends its checked
                receipt to the expedition journal.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
