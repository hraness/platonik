"use client";

import { useEffect, useState } from "react";
import type { BridgeIndex, Frame, Point, Receipt } from "@/lib/bridge/types";

const number = (value: number) => value.toLocaleString("en-US");
const words = (value: string) => value.replaceAll(/[-_]/g, " ");
const work = (costs: Record<string, number>) => Object.values(costs).reduce((sum, value) => sum + value, 0);

function Habitat({ receipt, frame }: { receipt: Receipt; frame: Frame }) {
  const world = receipt.experiment, state = frame.state;
  const center = (point: Point) => ({ x: point.x * 36 + 18, y: point.y * 36 + 18 });
  const label = (point: Point, text: string, fill = "#304f3d") => <text x={center(point).x} y={center(point).y + 5} textAnchor="middle" fontSize="13" fontWeight="600" fill={fill}>{text}</text>;
  return <svg className="bridge-map" viewBox={`0 0 ${world.width * 36} ${world.height * 36}`} role="img" aria-label={`Recorded habitat at tick ${frame.tick}. ${state.delivered.length} sparks delivered to beacons. S: source, D: depot, V: valve, B: beacon, numbered circles: cells. Exact memory and service values follow below.`}>
    <rect width="100%" height="100%" fill="#f9f9f6" />
    {world.walls.map(point => <rect key={`${point.x},${point.y}`} x={point.x * 36 + 2} y={point.y * 36 + 2} width="32" height="32" fill="#dde3d9" />)}
    {world.links.map(link => {
      const from = link.from.kind === "cell" ? state.cells.find(cell => cell.id === link.from.id) : world.depots.find(depot => depot.id === link.from.id);
      const to = state.cells.find(cell => cell.id === link.to_cell);
      if (!from || !to) return null;
      const a = center(from.position), b = center(to.position);
      const enabled = state.links.find(item => item.id === link.id)?.enabled;
      return <line key={link.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={enabled ? "#668768" : "#805d2d"} strokeWidth="3" strokeDasharray={enabled ? undefined : "3 4"} />;
    })}
    {world.sources.map(item => <g key={`source-${item.id}`}>{label(item.position, "S", "#805d2d")}</g>)}
    {world.depots.map(item => <g key={`depot-${item.id}`}>{label(item.position, "D")}</g>)}
    {world.valves.map(item => <g key={`valve-${item.id}`}>{label(item.position, "V")}</g>)}
    {world.beacons.map(item => <g key={`beacon-${item.id}`}>{label(item.position, `B${item.id}`)}</g>)}
    {state.cells.map(cell => <g key={cell.id}><circle {...{ cx: center(cell.position).x, cy: center(cell.position).y }} r="11" fill={cell.cargo ? "#805d2d" : "#304f3d"} stroke="#f9f9f6" strokeWidth="2" />{label(cell.position, String(cell.id), "#ffffff")}</g>)}
  </svg>;
}

export function BridgeLab() {
  const [index, setIndex] = useState<BridgeIndex | null>(null);
  const [selected, setSelected] = useState("ark-plan-a");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [at, setAt] = useState(0);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch("/bridge/index.json", { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error("The experiment index could not be loaded.");
      return response.json() as Promise<BridgeIndex>;
    }).then(setIndex).catch(cause => { if (!controller.signal.aborted) setError(String(cause.message)); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    if (!index) return;
    const controller = new AbortController();
    setReceipt(null); setError(""); setAt(0);
    fetch(`/bridge/${selected}.receipt.json`, { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error("This recorded run could not be loaded.");
      return response.json() as Promise<Receipt>;
    }).then(result => { if (!controller.signal.aborted) setReceipt(result); }).catch(cause => { if (!controller.signal.aborted) setError(String(cause.message)); });
    return () => controller.abort();
  }, [index, selected, retry]);

  if (error) return <div className="lab-result"><p role="alert">{error} Retry to load the public record.</p><button className="lab-button" onClick={() => setRetry(value => value + 1)}>Retry loading</button></div>;
  if (!index) return <p role="status">Loading the Rust evidence…</p>;
  const frame = receipt?.result.frames[Math.min(at, receipt.result.frames.length - 1)];
  const chosen = index.cases.find(item => item.id === selected);
  return <>
    <section className="bridge-intro"><h2>Supply the right light after contact is lost.</h2><p>The spark carries one bit of information: which beacon needs its energy. A depot reports its arrival, a relay forwards the report, and the controller stores it. Later, the valve opens. The same local rules must make the right choice for either report.</p><p>Compare the complete chain with a missing part. An expected failure is evidence about that dependency; it is still a failed mission.</p></section>
    <div className="lab-field bridge-picker"><label htmlFor="bridge-case">Recorded experiment</label><select id="bridge-case" value={selected} onChange={event => setSelected(event.target.value)}>{index.cases.map(item => <option key={item.id} value={item.id}>{words(item.id)} · {item.passed ? "mission passed" : "mission failed"}</option>)}</select></div>
    {!receipt || !frame ? <p role="status">Loading the recorded run…</p> : <section className="bridge-replay" aria-label="Recorded Rust replay">
      <div><figure><Habitat receipt={receipt} frame={frame} /><figcaption>S: source · D: depot · V: valve · B: beacon · numbered circles: cells. Amber cells carry a spark; dashed links are disabled. Cells can obscure the facility beneath them.</figcaption></figure>
      <label htmlFor="bridge-tick">Recorded tick {frame.tick}{!frame.complete ? " · incomplete" : ""}</label><input id="bridge-tick" type="range" min="0" max={receipt.result.frames.length - 1} value={at} onChange={event => setAt(Number(event.target.value))} />
      <div className="lab-actions"><button className="lab-button secondary" disabled={at === 0} onClick={() => setAt(value => value - 1)}>Previous tick</button><button className="lab-button secondary" disabled={at === receipt.result.frames.length - 1} onClick={() => setAt(value => value + 1)}>Next tick</button><button className="lab-text-button" onClick={() => setAt(receipt.result.frames.length - 1)}>Jump to outcome</button></div>
      <p className="lab-note">{number(work(frame.costs))} modeled work so far. Sparks remaining at sources: {frame.state.sources.reduce((sum, item) => sum + item.sparks.length, 0)}; at depots: {frame.state.depots.reduce((sum, item) => sum + item.sparks.length, 0)}; delivered to beacons: {frame.state.delivered.length}.</p></div>
      <div className="bridge-observations"><h3>What happened at this tick?</h3>{frame.tick === 0 && <p>Initial state, before any cell acts. Step forward to follow the courier.</p>}<ul aria-label="Tick events">{frame.events.map((event, i) => <li key={`event-${i}`}>World event: {words(event.kind)}.</li>)}{frame.signals.map((event, i) => <li key={`signal-${i}`}>Signal {event.signal.id}: {words(event.outcome)}, bit {Number(event.signal.bit)}, from tick {event.signal.sent_tick}.</li>)}{frame.activations.map((action, i) => <li key={`action-${i}`}>Cell {action.cell}: {words(action.action.kind)} — {action.success ? "succeeded" : action.error || "failed"} ({action.work_after - action.work_before} work).</li>)}</ul>
      <h3>Memory and services</h3><ul>{frame.state.cells.map(cell => <li key={cell.id}>Cell {cell.id}: memory [{cell.memory.join(", ")}]; {cell.inbox.some(Boolean) ? "report in inbox" : "no current inbox report"}.</li>)}{frame.state.beacons.map(beacon => <li key={`beacon-${beacon.id}`}>Beacon {beacon.id}: {beacon.charge} charge, {beacon.delivered} deliveries{beacon.exhausted ? "; exhausted during this run" : ""}.</li>)}</ul>
      <p data-testid="bridge-outcome"><strong>Final mission: {receipt.result.outcome.passed ? "passed" : "failed"}.</strong> {chosen?.expected_pass ? "Success was required in this reference case." : "Failure was expected in this counterexample."} {receipt.result.ticks_completed} ticks completed; {number(work(receipt.result.costs))} work.</p></div>
    </section>}
    {receipt && <section className="bridge-artifacts"><h3>Take this exact experiment to your agent.</h3><div className="lab-actions"><a className="lab-button secondary" href={`/bridge/${selected}.experiment.json`} download>Download experiment</a><a className="lab-button secondary" href={`/bridge/${selected}.receipt.json`} download>Download receipt</a></div><pre tabIndex={0}><code>{`platonik run ${selected}.experiment.json\nplatonik verify ${selected}.receipt.json\nplatonik inspect ${selected}.receipt.json`}</code></pre><details className="lab-details"><summary>Artifact identity and limits</summary><p>Protocol: {receipt.protocol}. This experiment permits {receipt.experiment.ticks} ticks, {number(receipt.experiment.fuel)} total modeled work, and {receipt.experiment.activation_fuel} work per activation. Verification recomputes these records in Rust; this browser only displays them.</p><p className="bridge-hash">Experiment SHA-256: <code>{receipt.experiment_hash}</code><br />Result SHA-256: <code>{receipt.result_hash}</code></p></details></section>}
    <section className="bridge-evidence"><h2>What does the comparison establish?</h2><p data-testid="bridge-suite">Frozen suite: {index.passed ? "all declared checks passed" : "a declared check failed"}. These are public engineering cases. They establish the listed finite behaviors, not generalization to unfamiliar worlds.</p><div className="bridge-table" role="region" aria-label="All Rust experiment outcomes" tabIndex={0}><table><thead><tr><th>Experiment</th><th>Mission</th><th>Expected</th><th>Work</th></tr></thead><tbody>{index.cases.map(item => <tr key={item.id}><th scope="row"><button className="lab-text-button" onClick={() => { setSelected(item.id); document.getElementById("bridge-case")?.focus(); }}>{words(item.id)}</button></th><td>{item.passed ? "Pass" : "Fail"}</td><td>{item.expected_pass ? "Pass" : "Fail"}</td><td>{number(item.work)}</td></tr>)}</tbody></table></div><ul className="bridge-checks">{index.checks.map(check => <li key={check.id}><strong>{words(check.id)}: {check.passed ? "checked" : "failed"}.</strong> {check.detail}<details className="lab-details"><summary>Recorded comparison</summary><ul>{check.evidence.map((entry, i) => <li key={i}>{entry}</li>)}</ul></details></li>)}</ul><p className="lab-note">No in-world construction, moving ark, full campaign, ranking, or new-player study is implemented by this slice. The four older observatory experiments use their own TypeScript models.</p></section>
  </>;
}
