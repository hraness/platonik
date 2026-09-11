"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AUTOVERSE_LIMITS, CIRCUIT_STARTERS, assayCircuit, buildCircuit, describeCircuit, parseCircuit, runCircuit, type Circuit, type CircuitAssay, type CircuitFrame, type CircuitNode, type CircuitRun, type ConstructionResult } from "@/lib/observatory/autoverse";

function sources(node: CircuitNode): (string | null)[] {
  return node.kind === "nand" ? node.inputs : node.kind === "register" ? [node.data, node.enable, node.reset] : [];
}
const word = (outputs: Record<string, number>) => Object.entries(outputs).map(([key, value]) => `${key}=${value}`).join(" · ");
function bounded(value: string, max: number): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= max ? parsed : null;
}

function CircuitView({ circuit, frame }: { circuit: Circuit; frame: CircuitFrame }) {
  const columns = Math.min(8, Math.max(1, Math.ceil(Math.sqrt(circuit.nodes.length * 1.6))));
  const positions = new Map(circuit.nodes.map((node, index) => [node.id, { x: 48 + (index % columns) * 78, y: 48 + Math.floor(index / columns) * 78 }]));
  const width = columns * 78 + 18;
  const height = Math.max(150, Math.ceil(circuit.nodes.length / columns) * 78 + 18);
  return <svg className="autoverse-circuit" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${circuit.nodes.length} circuit nodes at tick ${frame.tick}. Filled nodes hold one; open nodes hold zero. I is input, C constant, N NAND, R register. Lines show actual connections; positions do not model physical distance.`}>
    {circuit.nodes.flatMap(node => sources(node).map((source, index) => {
      if (source === null) return null;
      const from = positions.get(source)!; const to = positions.get(node.id)!;
      const bend = Math.min(from.y, to.y) - 20 - index * 7;
      return <path key={`${node.id}-${index}`} d={`M ${from.x} ${from.y} C ${from.x} ${bend}, ${to.x} ${bend}, ${to.x} ${to.y}`} fill="none" stroke="#849981" strokeWidth="1" opacity=".45" />;
    }))}
    {circuit.nodes.map(node => {
      const point = positions.get(node.id)!; const active = frame.values[node.id] === 1;
      const broken = sources(node).some(source => source === null);
      return <g key={node.id}><title>{node.id}: {node.kind}, value {frame.values[node.id] ?? 0}{broken ? ", broken connection" : ""}</title><rect x={point.x - 18} y={point.y - 18} width="36" height="36" rx={node.kind === "register" ? 3 : 18} fill={active ? "#304f3d" : "#f9f9f6"} stroke={broken ? "#813c29" : "#304f3d"} strokeWidth={broken ? 2 : 1} strokeDasharray={broken ? "3 2" : undefined} /><text x={point.x} y={point.y + 5} textAnchor="middle" fill={active ? "#f9f9f6" : "#304f3d"} fontSize="13">{node.kind[0].toUpperCase()}</text><text x={point.x} y={point.y + 32} textAnchor="middle" fill="#262c28" fontSize="8">{node.id}</text></g>;
    })}
  </svg>;
}

const roles: Record<string, { wish: string; use: string; limit: string }> = {
  relay: { wish: "Let the next camp know the light arrived.", use: "A delivered spark could trigger a message along the trail.", limit: "This graph relays a bit. Connecting it to a courier habitat is the next integration test." },
  nand: { wish: "Give the signal a condition.", use: "The same small Boolean operation can be composed into a decision or an arithmetic circuit.", limit: "NAND is a granted primitive. Its truth table does not demonstrate a mind or a whole computer." },
  memory: { wish: "Remember the route after the signal fades.", use: "Retained state lets a later controller act on something that happened earlier.", limit: "Storage is a granted register primitive here. The check tests loading, holding, and reset; memory has not emerged from an evolved body." },
  adder: { wish: "Help the ark account for its reserves.", use: "Thirty-six NAND gates compose into four-bit addition. All 256 input pairs can be checked.", limit: "Arithmetic is one component of control. A stored-program computer still needs instruction storage, fetch, decode, branching, and a complete execution test." },
  accumulator: { wish: "Keep a running account across deliveries.", use: "The same adder now works with registers. Each timed load changes the stored total, including overflow.", limit: "The test harness supplies the load pulses. This is a sequential circuit, with no autonomous instruction fetch or self-directed discovery." },
};

export function AutoverseLab() {
  const first = CIRCUIT_STARTERS[0];
  const [starterId, setStarterId] = useState(first.id);
  const starter = CIRCUIT_STARTERS.find(item => item.id === starterId)!;
  const [circuit, setCircuit] = useState<Circuit>(first.circuit);
  const [draft, setDraft] = useState(JSON.stringify(first.circuit, null, 2));
  const [run, setRun] = useState<CircuitRun>(() => runCircuit(first.circuit, first.phases));
  const [frameIndex, setFrameIndex] = useState(0);
  const [assay, setAssay] = useState<CircuitAssay | null>(null);
  const [construction, setConstruction] = useState<ConstructionResult | null>(null);
  const [builtAssay, setBuiltAssay] = useState<CircuitAssay | null>(null);
  const [steps, setSteps] = useState("8");
  const [materials, setMaterials] = useState("3");
  const [fuel, setFuel] = useState("2000000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const job = useRef(0);
  useEffect(() => () => { job.current += 1; }, []);
  const metrics = describeCircuit(circuit);
  const frame = run.trace[Math.min(frameIndex, run.trace.length - 1)];
  const stepLimit = bounded(steps, AUTOVERSE_LIMITS.maxBuildSteps);
  const materialLimit = bounded(materials, AUTOVERSE_LIMITS.maxNodes);
  const fuelLimit = bounded(fuel, AUTOVERSE_LIMITS.maxFuel);

  function replace(next: Circuit, selected = starter) {
    job.current += 1; setBusy(false);
    const result = runCircuit(next, selected.phases);
    setCircuit(next); setDraft(JSON.stringify(next, null, 2)); setRun(result); setFrameIndex(result.trace.length - 1);
    setAssay(null); setConstruction(null); setBuiltAssay(null); setError(""); setFuel("2000000");
  }
  function restore() {
    replace(starter.circuit);
    const needed = buildCircuit(starter.circuit);
    setSteps(String(needed.stepsRequired)); setMaterials(String(needed.materialsUsed));
    setMessage("Reference circuit restored. Your specimen drawer is separate and unchanged.");
  }
  function breakWire() {
    const next = structuredClone(circuit);
    const node = next.nodes.find(item => sources(item).some(source => source !== null));
    if (node?.kind === "nand") node.inputs[node.inputs[0] !== null ? 0 : 1] = null;
    else if (node?.kind === "register") {
      if (node.data !== null) node.data = null;
      else if (node.enable !== null) node.enable = null;
      else node.reset = null;
    }
    if (node) { replace(next); setMessage(`Disconnected an input of ${node.id}. Read the trace, then check the behavior.`); }
  }
  function checkBehavior() {
    const ticket = ++job.current; setBusy(true); setError(""); setMessage("Checking the finite public cases…");
    window.setTimeout(() => {
      if (ticket !== job.current) return;
      try {
        const checked = assayCircuit(circuit, starter.id);
        setAssay(checked); setMessage(`${checked.passed} of ${checked.total} checks passed for this circuit.`);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "The check could not complete."); }
      finally { setBusy(false); }
    }, 20);
  }
  function construct() {
    if (stepLimit === null || materialLimit === null) return;
    const result = buildCircuit(circuit, { steps: stepLimit, materials: materialLimit });
    setConstruction(result); setBuiltAssay(null);
    setMessage(result.status === "complete" ? "The blueprint was assembled. Check the constructed graph to see whether it works." : "The build stopped at its limit. Its partial graph is preserved in this result.");
  }
  function exportReview() {
    const data = { format: "platonik-autoverse-review-v1", contract: starter.id, circuit, phases: starter.phases, run, assay, construction, builtAssay };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "platonik-autoverse-review.json"; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage("Review bundle exported with the circuit, stimulus, and available results.");
  }

  return <>
    <div className="lab-panel-intro"><h2>From a signal to a system.</h2><p>A small step toward the Autoverse: connect simple parts, give them memory, and build something that can do more than its parts alone.</p><p className="lab-note">A working signal-graph prototype. Courier integration, stored-program computers, self-building organisms, and the campaign remain to be built.</p></div>
    <div className="specimen-bench autoverse-bench">
      <div className="specimen-window">
        <div className="specimen-toolbar"><span>{starter.name} · tick {frame.tick}</span><span>{metrics.nodes} nodes</span></div>
        <figure><CircuitView circuit={circuit} frame={frame} /><figcaption>Actual connections and binary states. Filled = 1; open = 0. I input · C constant · N NAND · R register. Layout is an abstract diagram; wire distance has no meaning in this model.</figcaption></figure>
        <div className="lab-field"><label htmlFor="signal-tick">Inspect signal tick · {frame.tick} / {run.ticksCompleted}</label><input id="signal-tick" type="range" min="0" max={run.ticksCompleted} value={frameIndex} onChange={event => setFrameIndex(Number(event.target.value))} /></div>
        <p className="signal-output"><strong>Outputs at tick {frame.tick}</strong><span>{word(frame.outputs) || "No outputs declared"}</span></p>
        <p className="lab-note">Every node input reads the previous tick; outputs show the committed state. At tick zero, all state and displayed outputs are initialized to zero. Phase {frame.phase < 0 ? "—" : frame.phase + 1} · {frame.work.toLocaleString("en-US")} work committed in this trace · {frame.faults} broken-wire reads.</p>
      </div>
      <div className="lab-controls">
        <div className="lab-field"><label htmlFor="signal-capability">Capability to explore</label><select id="signal-capability" value={starterId} onChange={event => {
          const next = CIRCUIT_STARTERS.find(item => item.id === event.target.value)!;
          setStarterId(next.id); replace(next.circuit, next); const needed = buildCircuit(next.circuit);
          setSteps(String(needed.stepsRequired)); setMaterials(String(needed.materialsUsed)); setMessage("");
        }}>{CIRCUIT_STARTERS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <h3>“{roles[starter.id].wish}”</h3><p>{roles[starter.id].use}</p><p className="lab-note">{roles[starter.id].limit}</p>
        <div className="lab-actions"><button className="lab-button" disabled={busy} onClick={checkBehavior}>{busy ? "Checking…" : "Check behavior"}</button><button className="lab-button secondary" onClick={breakWire} disabled={!circuit.nodes.some(node => sources(node).some(source => source !== null))}>Break a connection</button></div>
        <button className="lab-text-button" onClick={restore}>Restore reference circuit</button>
        <dl className="lab-metrics"><div><dt>Demo work spent</dt><dd>{run.work.toLocaleString("en-US")}</dd></div><div><dt>Connected input wires</dt><dd>{metrics.wires}</dd></div><div><dt>Registers</dt><dd>{metrics.registers}</dd></div><div><dt>Circuit footprint</dt><dd>{metrics.bytes.toLocaleString("en-US")} bytes</dd></div></dl>
        <p className="lab-note">The demo and behavior check are separate runs. Assays use fixed public stimuli and a 2,000,000-work cap per case. They are finite engineering checks, with no ranking or novelty reward.</p>
      </div>
    </div>
    <p className="lab-status" role="status">{message}</p><p className="lab-error" role="alert">{error}</p>
    {assay && <section className="lab-result" aria-label="Behavior check result"><h3>{assay.passed === assay.total ? "The circuit meets this contract." : "A capability is missing."}</h3><p><strong data-testid="signal-assay-score">{assay.passed} / {assay.total} checks passed</strong> · {assay.work.toLocaleString("en-US")} total modeled work · {assay.faults} broken-wire reads.</p>{assay.firstFailure && <p>First failure: {assay.firstFailure.label}. {assay.firstFailure.reason ?? `Expected ${word(assay.firstFailure.expected)}; observed ${word(assay.firstFailure.observed)}.`}</p>}<p className="lab-note">{starter.id === "adder" ? "All 256 pairs are checked after 32 ticks from zero state, including carry. This does not check every transition between pairs or a faster settling deadline." : "These checks cover the named finite stimulus sequences. Passing them does not prove behavior under every possible input sequence."}</p><details className="lab-details"><summary>Inspect every check</summary><ol className="assay-checks" tabIndex={0} aria-label="Individual behavior checks">{assay.checks.map((check, index) => <li key={index}>{check.passed ? "Pass" : "Fail"}: {check.label}{!check.passed && ` · ${check.reason ?? `expected ${word(check.expected)}; observed ${word(check.observed)}`}`}</li>)}</ol></details></section>}
    <div className="lab-two-column lab-secondary">
      <section><h2>Build it from an empty bench.</h2><p>A blueprint is a description. This assembler must allocate its nodes, copy its connections, and bind its outputs before there is a working circuit.</p><div className="lab-field"><label htmlFor="signal-build-steps">Construction steps · 0–1024</label><input id="signal-build-steps" type="number" min="0" max="1024" value={steps} onChange={event => { setSteps(event.target.value); setConstruction(null); setBuiltAssay(null); }} /></div><div className="lab-field"><label htmlFor="signal-materials">Node material · 0–128</label><input id="signal-materials" type="number" min="0" max="128" value={materials} onChange={event => { setMaterials(event.target.value); setConstruction(null); setBuiltAssay(null); }} /></div>{(stepLimit === null || materialLimit === null) && <p className="lab-error">Enter whole numbers within the stated construction limits.</p>}<button className="lab-button" disabled={stepLimit === null || materialLimit === null} onClick={construct}>Assemble blueprint</button>
        {construction && <div className="lab-result" aria-label="Construction result"><strong data-testid="signal-build-status">{construction.status === "complete" ? "Assembly complete" : `Stopped: ${construction.status}`}</strong><p>{construction.nodeAllocations} nodes allocated · {construction.wireCopies} connections copied · {construction.outputBindings} outputs bound.</p><p>{construction.stepsUsed} / {construction.stepsRequired} required steps used · {construction.work} work · {construction.materialsUsed} node material · {construction.failedAttempts} failed attempts.</p>{construction.status === "complete" && <button className="lab-text-button" onClick={() => { const checked = assayCircuit(construction.circuit, starter.id); setBuiltAssay(checked); }}>Check the constructed circuit</button>}{builtAssay && <p data-testid="signal-built-score">Constructed circuit: {builtAssay.passed} / {builtAssay.total} checks passed · {builtAssay.work.toLocaleString("en-US")} additional work.</p>}<details className="lab-details"><summary>Inspect construction steps</summary><ol className="assay-checks" tabIndex={0} aria-label="Construction step log">{construction.trace.map(step => <li key={step.step}>Step {step.step}: {step.action}{step.succeeded ? "" : " — failed"}</li>)}</ol></details></div>}
        <p className="lab-note">The external assembler is granted access to the whole blueprint. One allocation, wire copy, or output binding costs one step; each node consumes one material. It does not find material, invent a design, or run inside an organism. Self-construction is a later, separate milestone.</p>
      </section>
      <section><h2>Give your agent the circuit.</h2><p>Export a review bundle, ask for a change, and paste the circuit object below. Keep the selected contract’s input and output names so the same experiment can compare designs.</p><details className="lab-details"><summary>Edit circuit JSON</summary><label htmlFor="signal-source">Circuit program · JSON</label><textarea id="signal-source" value={draft} maxLength={AUTOVERSE_LIMITS.maxBytes} rows={16} spellCheck={false} onChange={event => setDraft(event.target.value)} /><div className="lab-actions"><button className="lab-button" onClick={() => {
          const parsed = parseCircuit(draft); if (!parsed.ok) { setError(parsed.error); return; }
          try { replace(parsed.circuit); setMessage("Circuit applied. The same public stimulus has been run again."); }
          catch (cause) { setError(cause instanceof Error ? cause.message : "Could not run this circuit."); }
        }}>Apply circuit</button><button className="lab-button secondary" onClick={() => { setDraft(JSON.stringify(circuit, null, 2)); setError(""); }}>Revert circuit editor</button></div></details><button className="lab-text-button" onClick={exportReview}>Export circuit and evidence</button>
        <details className="lab-details"><summary>Stimulus and execution limit</summary><p>{starter.description} Inputs are supplied by this fixed test harness. Register reset takes precedence over load; unwired inputs read zero and record a fault. Any fault prevents an assay from passing.</p><ol className="signal-phases">{starter.phases.map((phase, index) => <li key={index}>{phase.ticks} ticks: {word(phase.inputs)}</li>)}</ol><div className="lab-field"><label htmlFor="signal-fuel">Demo work cap · 0–2000000</label><input id="signal-fuel" type="number" min="0" max="2000000" value={fuel} onChange={event => setFuel(event.target.value)} /></div>{fuelLimit === null && <p className="lab-error">Enter a whole number from 0 to 2,000,000.</p>}<button className="lab-button secondary" disabled={fuelLimit === null} onClick={() => { if (fuelLimit === null) return; const next = runCircuit(circuit, starter.phases, { fuel: fuelLimit }); setRun(next); setFrameIndex(next.trace.length - 1); setMessage(`Demo ${next.status}: ${next.ticksCompleted} of ${next.ticksRequested} ticks completed; ${next.work} work spent.`); }}>Run bounded demo</button><p className="lab-note">An unfinished tick commits no state, but attempted work is charged. This cap applies to the demo only. Building and behavior checks report their own costs. JSON validation, rendering, and test orchestration also take real time outside the modeled ledger.</p></details>
      </section>
    </div>
    <section className="lab-reading"><h2>How this becomes the Long Trail.</h2><p>Deliver a spark. Carry its signal. Remember it. Build control from small parts. Connect independent homes. Then build systems that can construct and test new ones.</p><p>These are proposed dependencies for one campaign. This workbench probes the signal, arithmetic, and assembly steps; the shared living world still needs its integration test.</p><Link href="/docs/autoverse">Read the Autoverse design contract <span aria-hidden="true">↗</span></Link><br /><Link href="/docs/design-validation">See the evidence and remaining tests <span aria-hidden="true">↗</span></Link><p className="lab-note">This bench resets when you leave its tab. Export work you want to keep. No network, AI, or hosted storage is used.</p></section>
  </>;
}
