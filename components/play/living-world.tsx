"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { engine, loadEngine, type LivingWorld as World, type Point, type WasmModule, type WorldCommand, type WorldReport } from "@/lib/play/engine";
import { latestWorld, listWorlds, saveWorld, type WorldSave } from "@/lib/play/saves";
import { packWorld, unpackWorld } from "@/lib/play/world-url";
import { WorldStage } from "./world-stage";

export function LivingWorld({ expectedHash }: { expectedHash?: string }) {
  const searchParams = useSearchParams();
  const packed = searchParams.get("world");
  const [world, setWorld] = useState<World>();
  const [report, setReport] = useState<WorldReport>();
  const current = useRef<{ wasm: WasmModule; world: World; report: WorldReport } | undefined>(undefined);
  const busyRef = useRef(false);
  const epoch = useRef(0);
  const [durable, setDurable] = useState(true);
  const [revisions, setRevisions] = useState<WorldSave[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [running, setRunning] = useState(false);
  const [animatedFrom, setAnimatedFrom] = useState<number>();
  const [notice, setNotice] = useState("");
  const [saves, setSaves] = useState<WorldSave[]>([]);
  const [copied, setCopied] = useState(false);
  const [question, setQuestion] = useState("");
  const [handoff, setHandoff] = useState<{ hash: string; url: string | null }>();
  const [detached, setDetached] = useState(false);

  async function refreshSaves() {
    const rows = await listWorlds();
    setRevisions(rows);
    const latest = new Map<string, WorldSave>();
    for (const row of rows) if (!latest.has(`${row.world.genesis_hash}:${row.world.name}`)) latest.set(`${row.world.genesis_hash}:${row.world.name}`, row);
    setSaves([...latest.values()]);
  }
  useEffect(() => {
    let cancelled = false;
    const generation = ++epoch.current;
    busyRef.current = true; setBusy(true); setRunning(false); setError(""); setQuestion(""); setDetached(false); setActionError(""); setNotice(""); setReport(undefined); setWorld(undefined); current.current = undefined;
    async function load() {
      try {
        const wasm = await loadEngine();
        const value = packed ? await unpackWorld(packed) : (await latestWorld())?.world ?? engine.worldNew(wasm, "Copperwake");
        const next = engine.worldReport(wasm, value);
        if (expectedHash && next.world_hash !== expectedHash) throw new Error("This world does not match the content address in the path.");
        if (cancelled) return;
        current.current = { wasm, world: value, report: next };
        setWorld(value); setReport(next);
        try { const persisted = await saveWorld(value, next.world_hash); if (!cancelled) setDurable(persisted); }
        catch (cause) { if (!cancelled) { setDurable(false); setActionError(`Browser saving failed: ${message(cause)}. Download this world to keep it.`); } }
        if (!cancelled) await refreshSaves();
      } catch (cause) { if (!cancelled) setError(message(cause)); }
      finally { if (!cancelled && generation === epoch.current) { busyRef.current = false; setBusy(false); } }
    }
    void load();
    return () => { cancelled = true; epoch.current++; };
  }, [expectedHash, packed]);

  const apply = useCallback(async (command: WorldCommand, animate = false): Promise<boolean> => {
    const before = current.current;
    if (!before || busyRef.current) return false;
    const generation = epoch.current;
    busyRef.current = true; setBusy(true); setActionError("");
    try {
      // Yield for the pending indicator; all decisions and mutations execute in Rust.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      const value = engine.worldApply(before.wasm, before.world, command);
      const next = engine.worldReport(before.wasm, value);
      const persisted = await saveWorld(value, next.world_hash);
      if (generation !== epoch.current || current.current !== before) return false;
      setDurable(persisted);
      current.current = { wasm: before.wasm, world: value, report: next };
      setAnimatedFrom(animate ? before.report.tick : undefined);
      setWorld(value); setReport(next); setDetached(Boolean(expectedHash || packed));
      setNotice(command.kind === "place" ? "Site placed. Haulers must deliver its construction bill." : command.kind === "set_program" ? "Freight route assigned. Run the factory to put it to work." : `Advanced to tick ${next.tick}.`);
      await refreshSaves();
      return true;
    } catch (cause) { if (generation === epoch.current) { setActionError(message(cause)); setRunning(false); } return false; }
    finally { if (generation === epoch.current) { busyRef.current = false; setBusy(false); } }
  }, [expectedHash, packed]);

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function step() {
      const value = current.current;
      if (cancelled || !value) return;
      const remaining = value.report.maximum_tick - value.report.tick;
      if (!remaining || value.world.events.length >= 128) { setRunning(false); setNotice("This expedition has reached its limit. Export it, or start a new frontier."); return; }
      const ok = await apply({ kind: "advance", ticks: Math.min(64, remaining) }, true);
      if (!cancelled && ok) timer = setTimeout(step, 4200);
    }
    void step();
    function visibility() { if (document.hidden) setRunning(false); }
    document.addEventListener("visibilitychange", visibility);
    return () => { cancelled = true; clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [running, apply]);

  useEffect(() => {
    if (!world || !report) return;
    let cancelled = false;
    setHandoff(undefined); setCopied(false);
    void packWorld(world).then((value) => { if (!cancelled) setHandoff({ hash: report.world_hash, url: `https://platonik.space/play/w/${report.world_hash}?world=${value}` }); })
      .catch(() => { if (!cancelled) setHandoff({ hash: report.world_hash, url: null }); });
    return () => { cancelled = true; };
  }, [world, report]);

  const agentPrompt = useMemo(() => {
    if (!report || handoff?.hash !== report.world_hash) return "";
    const context = handoff.url ? `Continue this exact world with \`platonik world open-link '${handoff.url}' > continued.world.json\`.` : "Continue the world JSON I attach. Verify its hash matches the current view below before changing it.";
    return `Play Platonik with me. ${context}\n\nClone https://github.com/hraness/platonik and read skills/platonik-play/SKILL.md. Inspect the world before changing it. Preserve the existing save, make one understandable improvement within a bounded run, explain what changed, then use \`platonik world link\` to send me the updated browser view. Current view: ${report.name}, revision ${report.revision}, tick ${report.tick}, hash ${report.world_hash}.${question ? `\n\nMy question: ${question}` : ""}`;
  }, [handoff, question, report]);

  async function openValue(value: World, description: string) {
    const runtime = current.current?.wasm;
    if (!runtime || busyRef.current) return;
    setRunning(false); busyRef.current = true; setBusy(true);
    const generation = epoch.current;
    try {
      const next = engine.worldReport(runtime, value);
      const persisted = await saveWorld(value, next.world_hash);
      if (generation !== epoch.current) return;
      setDurable(persisted);
      current.current = { wasm: runtime, world: value, report: next };
      setWorld(value); setReport(next); setQuestion(""); setAnimatedFrom(undefined); setActionError(""); setNotice(description); setDetached(Boolean(expectedHash || packed));
      await refreshSaves();
    } catch (cause) { if (generation === epoch.current) setActionError(message(cause)); }
    finally { if (generation === epoch.current) { busyRef.current = false; setBusy(false); } }
  }
  async function newWorld() {
    if (!current.current) return;
    const names = new Set(saves.map((save) => save.world.name));
    let name = "Copperwake";
    for (let serial = 2; names.has(name); serial++) name = `Copperwake ${serial}`;
    await openValue(engine.worldNew(current.current.wasm, name), "A new frontier is ready. Your earlier worlds remain saved.");
  }
  async function openFile(file?: File) {
    if (!file) return;
    setRunning(false);
    try {
      if (file.size > 64 * 1024 * 1024) throw new Error("This file is larger than the 64 MiB world limit.");
      await openValue(JSON.parse(await file.text()) as World, "World verified and opened.");
    } catch (cause) { setActionError(message(cause)); }
  }
  async function route(cell: number, points: Point[]) {
    const value = current.current;
    if (!value) return false;
    setRunning(false);
    try { return await apply({ kind: "set_program", cell, program: engine.worldRouteProgram(value.wasm, value.world, cell, points) }); }
    catch (cause) { setActionError(message(cause)); return false; }
  }
  function download() {
    if (!world || !report) return;
    const href = URL.createObjectURL(new Blob([JSON.stringify(world, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = href; anchor.download = `${report.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-r${report.revision}.world.json`; anchor.click(); URL.revokeObjectURL(href);
  }
  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); setCopied(true); setNotice(label); }
    catch { setActionError("Clipboard is unavailable. Open the agent handoff below to copy the text manually, or download this world."); }
  }
  function ask(value: string) { setRunning(false); setQuestion(value); setCopied(false); document.getElementById("world-agent-title")?.scrollIntoView({ block: "start" }); }

  if (error) return <main id="main" className="world-page"><section className="world-error" role="alert"><h1>This world could not be opened.</h1><p>{error}</p><Link href="/play">Return to your saved frontier</Link></section></main>;
  if (!report || !world) return <main id="main" className="world-page"><header className="world-header"><h1>Opening the frontier</h1></header><div className="world-stage world-loading" role="status">Preparing the landscape and checking your save…</div></main>;
  const shareReady = handoff?.hash === report.world_hash;
  const limit = report.tick >= report.maximum_tick || world.events.length >= 128;
  return <main id="main" className="world-page">
    <header className="world-header"><div><h1>{report.name}</h1><p>Build. Connect. Explore.</p></div>
      <span className="world-save-indicator">{busy ? "Saving…" : durable ? "Saved in this browser" : "Session only"}</span>
    </header>
    {(report.experiment.version ?? 5) < 6 && <p className="world-legacy-notice">This is an earlier world with its original rules. Keep playing it, or start a new frontier for the larger landscape and new accounting.</p>}
    {detached && <p className="world-legacy-notice">You are continuing a saved copy. The original shared link still opens its original revision. <button type="button" onClick={() => handoff?.url ? void copy(handoff.url, "Link copied for this new revision.") : download()} disabled={!shareReady}>Share this revision</button></p>}
    <div className="world-session" aria-label="Factory controls"><div className="world-run-controls">
      <button className="lab-button world-run-button" disabled={limit || (busy && !running)} onClick={() => setRunning((value) => !value)}><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">{running ? <path d="M4 3v10M12 3v10" stroke="currentColor" strokeWidth="3" /> : <path d="m4 2 10 6-10 6Z" fill="currentColor" />}</svg>{running ? "Pause factory" : "Run factory"}</button>
      <button className="lab-button secondary" disabled={running || busy || limit} onClick={() => void apply({ kind: "advance", ticks: Math.min(64, report.maximum_tick - report.tick) })}>Advance 64 ticks</button>
      <span className={`world-run-state${running ? " is-running" : ""}`}>{running ? "Running" : "Paused"} · tick {report.tick}</span>
    </div><details className="world-session-details" onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary>Worlds & files</summary><div>
      <div className="world-file-actions"><button className="lab-button secondary" onClick={download}>Save to file</button><button className="lab-button secondary" onClick={newWorld} disabled={busy}>New frontier</button></div>
      <label>Saved worlds<select aria-label="Saved worlds" value={`${world.genesis_hash}:${world.name}`} disabled={busy} onChange={(event) => { const selected = saves.find((save) => `${save.world.genesis_hash}:${save.world.name}` === event.target.value); if (selected) void openValue(selected.world, "Saved world opened."); }}>{saves.map((save) => <option key={`${save.world.genesis_hash}:${save.world.name}`} value={`${save.world.genesis_hash}:${save.world.name}`}>{save.world.name} · revision {save.world.revision}</option>)}</select></label>
      <label>Earlier revisions<select aria-label="Earlier revisions" disabled={busy} value={report.world_hash} onChange={(event) => { const selected = revisions.find((save) => save.id === event.target.value); if (selected) void openValue(selected.world, "Earlier revision restored as the active copy."); }}>{revisions.filter((save) => save.world.genesis_hash === world.genesis_hash && save.world.name === world.name).map((save) => <option key={save.id} value={save.id}>Revision {save.world.revision} · {save.id.slice(7, 15)}</option>)}</select></label>
      <label className="world-file lab-button secondary">Import world<input type="file" accept="application/json,.json" disabled={busy} onChange={(event) => { void openFile(event.target.files?.[0]); event.target.value = ""; }} /></label>
      <button className="lab-button secondary" disabled={!shareReady} onClick={() => handoff?.url ? void copy(handoff.url, "World link copied.") : download()}>Share world</button>
      <span>{report.experiment.width} × {report.experiment.height} tiles · {report.maximum_tick - report.tick} ticks left · {128 - world.events.length} changes left</span>
    </div></details></div>
    {!durable && <p className="world-legacy-notice" role="status">Browser storage is unavailable. This world is kept only for this session. Save to file before closing the page.</p>}
    {actionError && <p className="world-action-error" role="alert">{actionError} Your last saved world is intact.</p>}
    {limit && <p className="world-legacy-notice">This expedition has reached its current limit. Save it to a file or start another frontier; your creation stays available.</p>}
    <WorldStage key={`${world.genesis_hash}:${world.name}`} report={report} onAsk={ask} running={running} onPause={() => setRunning(false)} busy={busy || limit} animatedFrom={animatedFrom}
      onCommand={apply} onRoute={route} />
    <p className="world-save-status" role="status">{notice || (durable ? "Saved in this browser. Export a file to keep a backup." : "Session-only world. Save to file before leaving.")}</p>
    <section className="world-agent" aria-labelledby="world-agent-title"><div><h2 id="world-agent-title" tabIndex={-1}>Bring your agent to the workshop.</h2><p>Play here, or ask your agent for a more ambitious layout, a different crew habit, or an experiment. The same world travels with you.</p>{question && <p className="world-question">Your question: {question}</p>}</div>
      <div className="world-agent-actions"><button className="lab-button secondary" onClick={() => void copy(agentPrompt, "Ask copied. Paste it into your agent to continue this world.")} disabled={!agentPrompt}>{copied ? "Copied" : "Copy the agent ask"}</button></div>
      {handoff?.url === null && <p>This history is too large for a compact link. Download your world and attach it with the ask.</p>}
      <details><summary>What the agent receives</summary><pre tabIndex={0}>{agentPrompt}</pre></details></section>
    <aside className="world-legacy"><span>One finite frontier. Every resource and result accounted for.</span><Link href="/play/lab">Earlier laboratories</Link></aside>
  </main>;
}
function message(cause: unknown): string { return cause instanceof Error ? cause.message : String(cause); }
