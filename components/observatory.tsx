"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { STARTERS, canonicalProgram, describeProgram, mutateProgram, parseProgram, runExperiment, type Program, type ExperimentResult } from "@/lib/observatory/specimen";
import { SpecimenPortrait } from "./specimen-portrait";
import { TruthGarden } from "./truth-garden";
import { BudgetLab } from "./observatory-budget";
import { AutoverseLab } from "./autoverse-lab";

const STORAGE_KEY = "platonik.lab.collection.v1";
const tabs = [{ id: "specimens", label: "Specimens" }, { id: "truth-garden", label: "Truth garden" }, { id: "world-budget", label: "World budget" }, { id: "autoverse", label: "Autoverse" }] as const;
type Tab = typeof tabs[number]["id"];
type SavedSpecimen = { name: string; program: Program; seed: number };

function Journey({ result, frame }: { result: ExperimentResult; frame: number }) {
  const state = result.trace[Math.min(frame, result.trace.length - 1)];
  const { world } = result;
  return <svg className="journey-map" viewBox={`0 0 ${world.width * 24} ${world.height * 24}`} role="img" aria-label={`Courier expedition at tick ${state.tick}. ${state.delivered} sparks delivered. Home is H, source is S. The line is the traveled route.`}>
    <rect width="100%" height="100%" fill="#f9f9f6" />
    {world.walls.map(({ x, y }) => <rect key={`${x}:${y}`} x={x * 24 + 2} y={y * 24 + 2} width="20" height="20" fill="#dde3d9" />)}
    <polyline points={result.trace.slice(0, frame + 1).map(point => `${point.x * 24 + 12},${point.y * 24 + 12}`).join(" ")} fill="none" stroke="#668768" strokeWidth="2" opacity=".65" />
    <text x={world.home.x * 24 + 12} y={world.home.y * 24 + 17} textAnchor="middle" fill="#304f3d" fontSize="14" fontWeight="bold">H</text>
    <text x={world.source.x * 24 + 12} y={world.source.y * 24 + 17} textAnchor="middle" fill="#805d2d" fontSize="14" fontWeight="bold">S</text>
    <circle cx={state.x * 24 + 12} cy={state.y * 24 + 12} r="6" fill={state.carrying ? "#ad7731" : "#304f3d"} stroke="#f9f9f6" strokeWidth="2" />
  </svg>;
}

export function Observatory() {
  const initial = STARTERS[2];
  const [tab, setTab] = useState<Tab>("specimens");
  const [program, setProgram] = useState<Program>(initial.program);
  const [parent, setParent] = useState<Program>(initial.program);
  const [name, setName] = useState(initial.name);
  const [draft, setDraft] = useState(JSON.stringify(initial.program, null, 2));
  const [seed, setSeed] = useState(7);
  const [result, setResult] = useState(() => runExperiment(initial.program, 7, 256));
  const [view, setView] = useState<"form" | "journey">("form");
  const [frame, setFrame] = useState(result.trace.length - 1);
  const [playing, setPlaying] = useState(false);
  const [collection, setCollection] = useState<SavedSpecimen[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [variation, setVariation] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const metrics = useMemo(() => describeProgram(program), [program]);
  const parentResult = useMemo(() => runExperiment(parent, seed, 256), [parent, seed]);
  const changed = canonicalProgram(program) !== canonicalProgram(parent);

  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash.slice(1);
      if (tabs.some(item => item.id === hash)) setTab(hash as Tab);
    };
    sync(); window.addEventListener("hashchange", sync);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && raw.length < 250_000) {
        const stored: unknown = JSON.parse(raw);
        if (Array.isArray(stored)) {
          const valid: SavedSpecimen[] = [];
          const seen = new Set<string>();
          for (const entry of stored.slice(0, 12)) {
            if (!entry || typeof entry.name !== "string" || typeof entry.seed !== "number" || !Number.isInteger(entry.seed) || entry.seed < 1 || entry.seed > 9999) continue;
            if (!entry.program || typeof entry.program !== "object" || Array.isArray(entry.program)) continue;
            const parsed = parseProgram(JSON.stringify(entry.program));
            if (parsed.ok) {
              const identity = canonicalProgram(parsed.program);
              if (!seen.has(identity)) valid.push({ name: entry.name.slice(0, 32), program: parsed.program, seed: entry.seed });
              seen.add(identity);
            }
          }
          setCollection(valid);
        }
      }
    } catch { setMessage("Local storage is unavailable. You can still explore and export programs."); }
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setFrame(current => Math.min(result.trace.length - 1, current + 2)), 80);
    return () => window.clearInterval(timer);
  }, [playing, result]);
  useEffect(() => { if (frame >= result.trace.length - 1) setPlaying(false); }, [frame, result]);
  useEffect(() => { if (tab !== "specimens") setPlaying(false); }, [tab]);

  function selectTab(next: Tab) {
    setTab(next);
    window.history.replaceState(null, "", `#${next}`);
  }
  function run(next: Program, nextSeed = seed, replaceDraft = true) {
    const experiment = runExperiment(next, nextSeed, 256);
    setProgram(next); setResult(experiment); setFrame(experiment.trace.length - 1); setPlaying(false);
    if (replaceDraft) { setDraft(JSON.stringify(next, null, 2)); setError(""); }
  }
  function select(entry: SavedSpecimen) {
    setParent(entry.program); setName(entry.name); setSeed(entry.seed); run(entry.program, entry.seed); setMessage("");
  }
  function grow() {
    const next = mutateProgram(program, variation + 1);
    setParent(program); setVariation(value => value + 1); setName(`${name.replace(/ · variation \d+$/, "")} · variation ${variation + 1}`.slice(0, 32));
    run(next); setMessage("A variation is on the bench. Its parent remains available for comparison.");
  }
  function save() {
    const savedName = name.trim() || "Unnamed specimen";
    const identity = canonicalProgram(program);
    const others = collection.filter(entry => canonicalProgram(entry.program) !== identity);
    if (others.length >= 12) { setMessage("The collection holds 12 specimens. Remove one or export this program first."); return; }
    const next = [...others, { name: savedName, program, seed }];
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setCollection(next); setMessage(`${savedName} saved in this browser.`); }
    catch { setMessage("Could not save in this browser. Export the program to keep a copy."); }
  }
  function remove(index: number) {
    const next = collection.filter((_, at) => at !== index);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setCollection(next); setMessage("Removed from this browser’s collection."); }
    catch { setMessage("Local storage could not be updated."); }
  }
  function exportProgram() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(program, null, 2) + "\n"], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "platonik-specimen.json"; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Program exported. An agent can edit this JSON and you can paste it back into the bench.");
  }
  const state = result.trace[Math.min(frame, result.trace.length - 1)];
  return <>
    <div className="lab-tabs" role="tablist" aria-label="Laboratory experiments">{tabs.map((item, index) => <button key={item.id} ref={node => { tabRefs.current[index] = node; }} type="button" role="tab" id={`tab-${item.id}`} aria-controls={`panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => selectTab(item.id)} onKeyDown={event => {
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault(); selectTab(tabs[next].id); tabRefs.current[next]?.focus();
    }}>{item.label}</button>)}</div>

    <section role="tabpanel" id="panel-specimens" aria-labelledby="tab-specimens" hidden={tab !== "specimens"} tabIndex={0}>
      <div className="specimen-bench">
        <div className="specimen-window">
          <div className="specimen-toolbar"><span>{name}</span><div className="lab-view-switch"><button aria-pressed={view === "form"} onClick={() => setView("form")}>Form</button><button aria-pressed={view === "journey"} onClick={() => setView("journey")}>Journey</button></div></div>
          <figure>
            {view === "form" ? <SpecimenPortrait program={program} name={name} /> : <Journey result={result} frame={frame} />}
            <figcaption>{view === "form" ? "A visual reading of executable rules. Compare its form with another program; different programs can share an appearance." : "An actual run of the browser model. H is home; S holds four sparks. The courier sees only nearby conditions."}</figcaption>
          </figure>
          {view === "journey" && <div className="replay-controls"><button className="lab-button secondary" onClick={() => { if (frame >= result.trace.length - 1) setFrame(0); setPlaying(value => !value); }}>{playing ? "Pause replay" : "Play replay"}</button><label htmlFor="replay-tick">Tick {state.tick}</label><input id="replay-tick" type="range" min="0" max={result.trace.length - 1} value={frame} onChange={event => { setPlaying(false); setFrame(Number(event.target.value)); }} /><p className="lab-note">{state.action} · {state.delivered} delivered · {state.carrying ? "carrying a spark" : "empty handed"}</p></div>}
          <details className="lab-details"><summary>How to read a specimen</summary><p>Lobes represent rules; grains inside them represent conditions. Inner rings show used memory slots. Memory-writing rules shift the tint toward amber, and turn directions alter lobe reach. These are visual encodings of structure. Size, beauty, and a new shape do not establish usefulness or biological complexity.</p></details>
        </div>
        <div className="lab-controls specimen-controls">
          <h2>Get to know a small program.</h2>
          <p>Choose a lineage, grow a variation, and see what it can carry home. Keep a favorite. Give its rules to your agent and bring back another idea.</p>
          <fieldset className="lineage-picker"><legend>Start from a lineage</legend>{STARTERS.map(starter => <button key={starter.id} type="button" aria-pressed={canonicalProgram(program) === canonicalProgram(starter.program)} onClick={() => select({ ...starter, seed })}><strong>{starter.name}</strong><span>{starter.description}</span></button>)}</fieldset>
          <div className="lab-field"><label htmlFor="specimen-name">Name on the slide</label><input id="specimen-name" value={name} maxLength={32} onChange={event => setName(event.target.value)} /></div>
          <div className="lab-actions"><button className="lab-button" onClick={grow}>Grow a variation</button><button className="lab-button secondary" onClick={save}>Keep specimen</button></div>
          <dl className="lab-metrics"><div><dt>Sparks delivered</dt><dd>{result.deliveries} / 4</dd></div><div><dt>Charged work</dt><dd>{result.primitiveWork.toLocaleString("en-US")}</dd></div><div><dt>Program footprint</dt><dd>{metrics.bytes} bytes</dd></div><div><dt>Memory slots used</dt><dd>{metrics.memorySlots} / 4</dd></div></dl>
          <p className="lab-note">Measured over 256 ticks in this toy habitat. Work counts rule visits, conditions, sensing, memory access, attempted actions, and state writes. It is separate from the four sparks.</p>
          {changed && <div className="lab-result"><strong>Compared with its parent</strong><p>Same map and 256 ticks: {result.deliveries} vs {parentResult.deliveries} deliveries; {result.primitiveWork.toLocaleString("en-US")} vs {parentResult.primitiveWork.toLocaleString("en-US")} work.</p><button className="lab-text-button" onClick={() => { run(parent); setMessage("Parent restored to the bench."); }}>Restore parent</button></div>}
        </div>
      </div>
      <p className="lab-status" role="status">{message}</p>
      <div className="lab-two-column lab-secondary">
        <section><h2>Try another world.</h2><p>A beautiful specimen may get stuck. Compare on several maps before deciding what it is good at.</p><div className="lab-field"><label htmlFor="map-seed">Map seed · 1–9999</label><input id="map-seed" type="number" min="1" max="9999" value={seed} onChange={event => { const value = Math.min(9999, Math.max(1, Math.floor(Number(event.target.value) || 1))); setSeed(value); run(program, value, false); }} /></div><button className="lab-button secondary" onClick={() => { setView("journey"); run(program, seed, false); }}>Run 256 ticks</button><p className="lab-note">This is one courier in a seeded maze, with no beacon drain or colony interaction. It does not implement the proposed Rust expedition, leaderboard, or research verification.</p></section>
        <section><h2>Open the rules.</h2><p>The JSON is the program. An external agent can edit it; this page evaluates the bounded rule language locally.</p><details className="lab-details"><summary>Edit or paste a program</summary><p>First matching rule acts once per tick. Conditions are ANDed; an empty list always matches. Memory has four byte-sized slots. No JavaScript executes from this field.</p><label htmlFor="program-source">Specimen program · JSON</label><textarea id="program-source" spellCheck={false} value={draft} maxLength={16_384} onChange={event => setDraft(event.target.value)} rows={16} /><p role="alert" className="lab-error">{error}</p><div className="lab-actions"><button className="lab-button" onClick={() => { const parsed = parseProgram(draft); if (!parsed.ok) { setError(parsed.error); return; } setParent(program); run(parsed.program); setMessage("Program applied and run. Compare its result with the parent."); }}>Apply and run</button><button className="lab-button secondary" onClick={() => { setDraft(JSON.stringify(program, null, 2)); setError(""); }}>Revert editor</button></div></details><button className="lab-text-button" onClick={exportProgram}>Export this program</button></section>
      </div>
      <section className="specimen-collection"><h2>Your specimen drawer <span>{collection.length} / 12</span></h2><p className="lab-note">Saved only in this browser. Export anything you want to keep elsewhere. Collecting a program does not certify novelty.</p>{collection.length === 0 ? <p className="collection-empty">An empty drawer, for now. Keep a specimen from the bench to begin a collection.</p> : <ul>{collection.map((entry, index) => <li key={canonicalProgram(entry.program)}><button className="collection-load" onClick={() => select(entry)} aria-label={`Load ${entry.name}`}><SpecimenPortrait program={entry.program} name={entry.name} small /><strong>{entry.name}</strong><span>{describeProgram(entry.program).bytes} bytes · map {entry.seed}</span></button><button className="lab-text-button" aria-label={`Remove ${entry.name}`} onClick={() => remove(index)}>Remove</button></li>)}</ul>}</section>
    </section>
    <section role="tabpanel" id="panel-truth-garden" aria-labelledby="tab-truth-garden" hidden={tab !== "truth-garden"} tabIndex={0}>{tab === "truth-garden" && <TruthGarden />}</section>
    <section role="tabpanel" id="panel-world-budget" aria-labelledby="tab-world-budget" hidden={tab !== "world-budget"} tabIndex={0}>{tab === "world-budget" && <BudgetLab program={program} />}</section>
    <section role="tabpanel" id="panel-autoverse" aria-labelledby="tab-autoverse" hidden={tab !== "autoverse"} tabIndex={0}>{tab === "autoverse" && <AutoverseLab />}</section>
    <div className="lab-reading"><p>What would make these experiments useful beyond the game?</p><Link href="/docs/complexity-and-scale">Read the engineering and research thesis <span aria-hidden="true">↗</span></Link></div>
  </>;
}
