"use client";

import { useEffect, useState } from "react";
import { RecordedHabitat } from "@/components/recorded-habitat";
import { RecordedBloom } from "@/components/recorded-bloom";
import { isBloomGrade } from "@/lib/bridge/bloom";
import { RecordedPorts } from "@/components/recorded-ports";
import { isPortsGrade } from "@/lib/bridge/ports";
import { RecordedArk } from "@/components/recorded-ark";
import { isArkGrade } from "@/lib/bridge/ark";
import { RecordedJourney } from "@/components/recorded-journey";
import type { Receipt } from "@/lib/bridge/types";
import { isContinuityReceipt, type ContinuityIndex } from "@/lib/bridge/continuity";
import { isFirstAnswerJourney } from "@/lib/bridge/journey";

const number = (value: number) => value.toLocaleString("en-US");
const work = (costs: Record<string, number>) => Object.values(costs).reduce((sum, value) => sum + value, 0);

export function ContinuityLab({ index, artifactDirectory = "habitat" }: {
  index: ContinuityIndex;
  artifactDirectory?: "habitat" | "navigation" | "construction" | "answer" | "ark" | "ports" | "bloom";
}) {
  const [selected, setSelected] = useState(index.cases[0]?.id ?? "");
  const [loaded, setLoaded] = useState<{ path: string; receipt: Receipt } | null>(null);
  const [at, setAt] = useState(0);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const chosen = index.cases.find(item => item.id === selected);
  const artifactPath = `/${artifactDirectory}/${encodeURIComponent(selected)}`;
  useEffect(() => {
    if (!chosen) return;
    const controller = new AbortController();
    setError("");
    fetch(`${artifactPath}.receipt.json`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("The recorded habitat could not be loaded.");
        const data: unknown = await response.json();
        if (!isContinuityReceipt(data) || data.result_hash !== chosen.result_hash) throw new Error("The record does not match this comparison. Reload it to try again.");
        if ((artifactDirectory === "answer" || chosen.journey !== undefined) && !isFirstAnswerJourney(chosen.journey, data)) throw new Error("The journey grade does not match this record. Reload it to try again.");
        if ((artifactDirectory === "ark" || chosen.ark !== undefined) && !isArkGrade(chosen.ark, data)) throw new Error("The ark grade does not match this record. Reload it to try again.");
        if ((artifactDirectory === "bloom" || chosen.bloom !== undefined) && !isBloomGrade(chosen.bloom, data)) throw new Error("The Bloom grade does not match this record. Reload it to try again.");
        if ((artifactDirectory === "ports" || chosen.ports !== undefined) && !isPortsGrade(chosen.ports, data)) throw new Error("The commitments grade does not match this record. Reload it to try again.");
        if (!controller.signal.aborted) setLoaded({ path: artifactPath, receipt: data });
      }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The recorded habitat could not be loaded."); });
    return () => controller.abort();
  }, [artifactDirectory, artifactPath, chosen, retry]);
  if (!chosen) return <p role="status">No continuous-habitat records have been published.</p>;
  const receipt = loaded?.path === artifactPath ? loaded.receipt : null;
  const frame = receipt?.result.frames[Math.min(at, receipt.result.frames.length - 1)];
  function select(id: string) {
    if (!index.cases.some(item => item.id === id)) return;
    setSelected(id); setAt(0); setError("");
  }
  return <>
    <div className="lab-field bridge-picker"><label htmlFor="habitat-case">Crew to follow</label><select id="habitat-case" value={selected} onChange={event => select(event.target.value)}>{index.cases.map(item => <option key={item.id} value={item.id}>{item.label}{artifactDirectory === "bloom" ? "" : <> · {artifactDirectory === "answer" ? `${item.journey?.answered ? "answer earned" : "no answer"} · ${item.passed ? "service passed" : "service failed"}` : artifactDirectory === "ark" ? `${item.ark?.control_passed ? "control passed" : "control failed"} · ${item.passed ? "service passed" : "service failed"}` : artifactDirectory === "ports" ? `${item.ports?.commitments_passed ? "commitments passed" : "commitments failed"} · ${item.passed ? "service passed" : "service failed"}` : item.passed ? "mission passed" : "mission failed"}</>}</option>)}</select></div>
    <p className="continuity-detail">{chosen.detail}</p>
    {error ? <div className="lab-result"><p role="alert">{error}</p><button className="lab-button" onClick={() => setRetry(value => value + 1)}>Retry loading</button></div> : !receipt || !frame ? <p role="status">Loading the recorded habitat…</p> : <>
      <section className="bridge-replay" aria-label="Recorded continuous habitat">
        <div><figure><RecordedHabitat receipt={receipt} frame={frame} /><figcaption>S: source · D: depot · V: valve · B: beacon. Numbered cells are the crew; amber cells carry {receipt.experiment.construction ? "a spark or material" : "a spark"}. Crosses close a route. Dashed signal links are disabled.{receipt.experiment.construction && " M marks remaining material stock; a dashed A marks an inactive assembly. A child becomes a numbered circle when activated."}</figcaption></figure>
          <label htmlFor="habitat-tick">Recorded tick {frame.tick}{!frame.complete ? " · unfinished" : ""}</label><input id="habitat-tick" type="range" min="0" max={receipt.result.frames.length - 1} value={at} onChange={event => setAt(Number(event.target.value))} />
          <div className="lab-actions"><button className="lab-button secondary" disabled={at === 0} onClick={() => setAt(value => value - 1)}>Previous tick</button><button className="lab-button secondary" disabled={at >= receipt.result.frames.length - 1} onClick={() => setAt(value => value + 1)}>Next tick</button><button className="lab-text-button" onClick={() => setAt(receipt.result.frames.length - 1)}>Jump to outcome</button></div>
          <p className="lab-note">{number(work(frame.costs))} modeled work. {frame.state.pending.length} reports in flight. {frame.state.delivered.length} sparks delivered to services.</p>
        </div>
        <div className="bridge-observations"><h2>What the crew carries forward</h2>
          <ul aria-label="Carried state">{frame.state.cells.map(cell => <li key={cell.id}>Cell {cell.id}: {cell.cargo ? `carrying spark ${cell.cargo.id}, report ${Number(cell.cargo.bit)}` : receipt.experiment.construction ? "no spark cargo" : "hands empty"}; memory [{cell.memory.join(", ")}].{cell.material !== undefined && ` Carrying material ${cell.material}.`}{cell.evidence.some(value => value !== null) && ` Memory evidence: spark ${cell.evidence.filter(value => value !== null).join(", ")}.`}</li>)}{frame.state.beacons.map(beacon => <li key={`beacon-${beacon.id}`}>Beacon {beacon.id}: {beacon.charge} charge, {beacon.delivered} deliveries{beacon.exhausted ? "; exhausted during the journey" : ""}.</li>)}</ul>
          {frame.state.construction && <div data-testid="construction-state"><h3>Building a crewmate</h3>
            <ul>{frame.state.construction.stocks.map(stock => <li key={`stock-${stock.id}`}>Stock {stock.id}: {stock.units.length ? `material ${stock.units.join(", ")} available` : "empty"}.</li>)}
              {frame.state.construction.assemblies.map(assembly => {
                const blueprint = receipt.experiment.construction?.blueprints.find(item => item.id === assembly.blueprint);
                const total = assembly.edits?.at(-1)?.bytes_written ?? (blueprint ? new TextEncoder().encode(JSON.stringify(blueprint.body)).byteLength : undefined);
                const ready = blueprint && assembly.copied.length === total && assembly.wired.length === blueprint.body.links.length;
                return <li key={`assembly-${assembly.blueprint}`}>Blueprint {assembly.blueprint}: {assembly.copied.length}{total !== undefined && ` / ${total}`} body bytes copied; {assembly.wired.length}{blueprint && ` / ${blueprint.body.links.length}`} links wired. Material {assembly.material} reserved by parent {assembly.parent}. {ready ? "Ready to activate." : "Still inactive."}</li>;
              })}
              {frame.state.construction.births.map(birth => <li key={`birth-${birth.blueprint}`}>Cell {birth.body.cell.id}: parent {birth.parent} activated blueprint {birth.blueprint} at tick {birth.tick}, using material {birth.material}. {frame.tick === birth.tick ? `First eligible activation: tick ${birth.tick + 1}.` : `Scheduled from tick ${birth.tick + 1}.`}</li>)}
            </ul>
            {!frame.state.construction.assemblies.length && !frame.state.construction.births.length && <p>No assembly has started.</p>}
            <p>{number(frame.costs.copying ?? 0)} copying work; {number(frame.costs.construction ?? 0)} construction work. These costs are included in total modeled work.</p>
          </div>}
          <h3>Reports in flight</h3>{frame.state.pending.length ? <ul>{frame.state.pending.map(signal => <li key={signal.id}>Report {signal.id}: {Number(signal.bit)}, sent at {signal.sent_tick}, due at {signal.deliver_tick}{signal.receipt_spark !== null ? `, from spark ${signal.receipt_spark}` : ""}.</li>)}</ul> : <p>No reports are in transit at this tick.</p>}
          {(artifactDirectory !== "bloom" || frame.tick === receipt.result.frames.at(-1)?.tick) && <p data-testid="habitat-outcome"><strong>Final {artifactDirectory === "answer" || artifactDirectory === "ark" || artifactDirectory === "ports" || artifactDirectory === "bloom" ? "service" : "mission"}: {chosen.passed ? "passed" : "failed"}.</strong> {chosen.ticks} completed ticks; {number(chosen.work)} modeled work.</p>}
        </div>
      </section>
      {chosen.bloom && <RecordedBloom grade={chosen.bloom} tick={frame.tick} />}
      {chosen.ports && <RecordedPorts grade={chosen.ports} tick={frame.tick} />}
      {chosen.ark && <RecordedArk grade={chosen.ark} tick={frame.tick} />}
      {chosen.journey && <RecordedJourney journey={chosen.journey} tick={frame.tick} />}
      <section className="continuity-stops" aria-labelledby="habitat-stops"><h2 id="habitat-stops">Leave at a real moment. Return to the same world.</h2><p>These buttons visit checkpoints saved by the Rust CLI. Scrubbing this replay displays recorded frames; it does not advance the simulation or spend modeled fuel.</p>
        <ol>{chosen.cuts.map(cut => <li key={cut.tick}><button className="lab-text-button" onClick={() => { setAt(cut.tick); document.getElementById("habitat-tick")?.focus(); }}>{cut.label} · tick {cut.tick}</button><p>{cut.detail}</p></li>)}</ol>
        <p data-testid="habitat-continuity">Resumed result equals uninterrupted result: <strong>{chosen.uninterrupted_equal ? "yes" : "no"}</strong>. Exported and restored result equals the original: <strong>{chosen.restored_equal ? "yes" : "no"}</strong>. Equality includes every frame, pending report, resource, cost, and outcome.</p>
      </section>
      <section className="bridge-artifacts"><h2>Give this world to your agent.</h2><div className="lab-actions"><a className="lab-button secondary" href={`${artifactPath}.experiment.json`} download>Download experiment</a><a className="lab-button secondary" href={`${artifactPath}.receipt.json`} download>Download receipt</a><a className="lab-button secondary" href={`${artifactPath}.bundle.json`} download>Download saved habitat</a></div><pre tabIndex={0}><code>{`./target/release/platonik habitat init my-habitat ${selected}.experiment.json\n./target/release/platonik habitat advance my-habitat --until 9 --expect-revision 0 --request-id first-leg\n./target/release/platonik habitat ${artifactDirectory === "answer" ? "journey" : artifactDirectory === "ark" ? "ark" : artifactDirectory === "ports" ? "ports" : artifactDirectory === "bloom" ? "bloom" : "status"} my-habitat`}</code></pre><details className="lab-details"><summary>Record identity and limits</summary><p>{receipt.protocol}; {receipt.experiment.ticks} ticks; {number(receipt.experiment.fuel)} total modeled work; {receipt.experiment.activation_fuel} work per activation.</p><p className="bridge-hash">Experiment: <code>{receipt.experiment_hash}</code><br />Result: <code>{receipt.result_hash}</code></p></details></section>
    </>}
  </>;
}
