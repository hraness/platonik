"use client";

import { useEffect, useMemo, useState } from "react";
import { RecordedHabitat } from "@/components/recorded-habitat";
import type { FacilityState, Receipt } from "@/lib/bridge/types";
import type { FacilityDiagnostic, WorldReport } from "@/lib/play/engine";
import { useReplay } from "@/lib/play/use-replay";
import { CELL_NAMES, FACILITY_LABELS, facilityName, facilityStatus, itemList, worldViews } from "@/lib/play/world-view";

type Selection = { kind: "cell" | "facility"; id: number };

export function WorldStage({ report, onAsk }: { report: WorldReport; onAsk: (question: string) => void }) {
  const views = useMemo(() => worldViews(report), [report]);
  const frames = useMemo(() => views.map((view) => view.frame), [views]);
  const { at, setAt, playing, play, stop, speed, setSpeed } = useReplay(frames.length);
  const [selection, setSelection] = useState<Selection>({ kind: "facility", id: report.state.facilities?.[0]?.id ?? 90 });
  const view = views[Math.min(at, views.length - 1)];
  const frame = view?.frame;

  useEffect(() => {
    stop();
    setAt(frames.length - 1);
    setSelection({ kind: "facility", id: report.state.facilities?.[0]?.id ?? 90 });
  }, [report.world_hash, frames.length, setAt, stop]);

  const receipt = useMemo<Receipt>(() => ({
    schema: "platonik-living-world-view-v1", protocol: "platonik-living-world-v1",
    experiment_hash: report.world_hash, result_hash: report.world_hash, experiment: report.experiment,
    result: { status: "running", ticks_completed: report.tick, costs: report.costs, outcome: { passed: false }, frames, final_state: report.state },
  }), [frames, report]);

  if (!frame) return null;
  const state = frame.state;
  const facilities = state.facilities ?? [];
  const selectedCell = selection.kind === "cell" ? state.cells.find((cell) => cell.id === selection.id) : undefined;
  const selectedFacility = selection.kind === "facility" ? facilities.find((facility) => facility.id === selection.id) : undefined;
  const diagnostic = selectedFacility && view.industry.find((item) => item.id === selectedFacility.id);
  const activation = selectedCell && frame.activations.find((item) => item.cell === selectedCell.id);
  const activity = frame.activations.filter((item) => item.action.kind !== "wait" || !item.success).slice(0, 3).map(describeActivation);
  const routes = [{ id: 0, name: "Dustlight home" }, { id: 1, name: "East outpost" }].map((route) => ({
    ...route,
    charge: state.beacons.find((beacon) => beacon.id === route.id)?.charge ?? 0,
    delivered: state.delivered.filter((delivery) => delivery.beacon === route.id).length,
  }));
  const parts = facilities.filter((facility) => facility.kind === "fabricator").reduce((sum, facility) => sum + facility.minted, 0);
  const madeFrames = facilities.filter((facility) => facility.kind === "assembler").reduce((sum, facility) => sum + facility.minted, 0);

  function select(value: Selection) { stop(); setSelection(value); }
  function togglePlayback() {
    if (playing) { stop(); return; }
    if (at >= frames.length - 1) setAt(0);
    play();
  }

  return (
    <div className="world-stage world-workspace">
      <div className="world-scene">
        <div className="world-viewport">
          <RecordedHabitat receipt={receipt} frame={frame}
            selectedCell={selection.kind === "cell" ? selection.id : undefined}
            onSelectCell={(id) => select({ kind: "cell", id })}
            selectedFacility={selection.kind === "facility" ? selection.id : undefined}
            onSelectFacility={(id) => select({ kind: "facility", id })}
            names={report.names} />
        </div>
        <div className="world-vitals" aria-label="World state at this moment">
          <span><strong>{state.delivered.length}</strong> light delivered</span>
          <span><strong>{state.cells.length}</strong> creatures</span>
          <span><strong>{parts}</strong> parts made</span>
          {madeFrames > 0 && <span><strong>{madeFrames}</strong> frames made</span>}
        </div>
        <div className="world-timeline">
          <button className="world-transport" type="button" onClick={togglePlayback} disabled={frames.length < 2}>
            {playing ? "Pause" : at >= frames.length - 1 ? "Replay" : "Play"}
          </button>
          <input type="range" min={0} max={Math.max(0, frames.length - 1)} value={at}
            onChange={(event) => { stop(); setAt(Number(event.target.value)); }}
            aria-label="World timeline" aria-valuetext={`Tick ${frame.tick}${view.current ? ", current revision" : ", replay"}`} />
          <span>Tick {frame.tick}{view.current ? " · now" : " · replay"}</span>
          <select aria-label="Replay speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
            <option value={4}>1×</option><option value={8}>2×</option><option value={16}>4×</option><option value={32}>8×</option>
          </select>
        </div>
        <div className="world-flows" aria-label="Light routes at this moment">
          {routes.map((route) => <div key={route.id}>
            <span className={`world-flow-light ${route.charge > 0 ? "online" : "dark"}`} aria-hidden="true" />
            <strong>{route.name}</strong><span>{route.charge} light · {route.delivered} delivered</span>
          </div>)}
        </div>
        <div className="world-observation">
          <span>At tick {frame.tick}</span>
          {activity.length > 0 ? <ul>{activity.map((line, index) => <li key={index}>{line}</li>)}</ul>
            : <p>No creature action at this recorded tick. Facility status is shown in the workshop.</p>}
        </div>
      </div>

      <aside className="world-workshop" aria-label="Workshop and inspector">
        <div className="world-workshop-heading"><h2>Workshop</h2><span>Tick {frame.tick}</span></div>
        <p className="world-workshop-hint">Follow a supply line. Select a facility to see what it needs.</p>
        <div className="world-facilities" aria-label="Facilities">
          {facilities.map((facility) => {
            const status = view.industry.find((item) => item.id === facility.id);
            return <button key={facility.id} type="button" className="world-facility"
              aria-pressed={selection.kind === "facility" && selection.id === facility.id}
              aria-controls="world-inspector" onClick={() => select({ kind: "facility", id: facility.id })}>
              <strong>{facilityName(facility.id, report.names)}</strong>
              <span>{status ? facilityStatus(status) : "Inspect facility"}</span>
            </button>;
          })}
        </div>
        <section className="world-inspector" id="world-inspector" aria-labelledby="world-inspector-title">
          {selectedFacility && diagnostic ? <>
            <h3 id="world-inspector-title">{facilityName(selectedFacility.id, report.names)}</h3>
            <p className="world-inspector-location">{FACILITY_LABELS[selectedFacility.kind]} · {selectedFacility.position.x}, {selectedFacility.position.y}</p>
            <FacilityDetails facility={selectedFacility} diagnostic={diagnostic} names={report.names} />
            <button className="lab-button secondary world-ask-facility" type="button" onClick={() => onAsk(
              `Help me improve ${facilityName(selectedFacility.id, report.names)} (facility ${selectedFacility.id}). At displayed tick ${frame.tick}, its checked status was: ${facilityStatus(diagnostic)}. Inspect the latest state first, then propose one useful supply-chain improvement while keeping the light routes served.`
            )}>Ask your agent about this</button>
          </> : selectedCell ? <>
            <h3 id="world-inspector-title">{CELL_NAMES[selectedCell.id] ?? `Cell ${selectedCell.id}`}</h3>
            <p>{cellState(selectedCell, activation)}</p>
            <dl><div><dt>Position</dt><dd>{selectedCell.position.x}, {selectedCell.position.y}</dd></div>
              <div><dt>Carrying</dt><dd>{carryingList(selectedCell)}</dd></div></dl>
            <details><summary>Working memory</summary><p>{selectedCell.memory.join(" · ")}</p></details>
          </> : <><h3 id="world-inspector-title">Select part of your world</h3>
            <p>Choose a facility above or a numbered creature on the map. A selected facility may not exist yet in an earlier replay frame.</p></>}
        </section>
      </aside>
    </div>
  );
}

function FacilityDetails({ facility, diagnostic, names }: { facility: FacilityState; diagnostic: FacilityDiagnostic; names: Record<string, string> }) {
  const { recipe, transfer } = diagnostic;
  const stock = [
    { item: "material" as const, quantity: facility.materials.length },
    { item: "spark" as const, quantity: facility.sparks.length },
    { item: "part" as const, quantity: facility.parts.length },
    { item: "frame" as const, quantity: facility.frames?.length ?? 0 },
  ].filter((item) => item.quantity > 0);
  return <>
    <p className="world-facility-status">{facilityStatus(diagnostic)}.</p>
    {diagnostic.status === "construction" && <p>Creatures must deliver the remaining bill before this site can work.</p>}
    {recipe && <div className="world-recipe" aria-label="Production recipe">
      <span>{itemList(recipe.inputs)}</span><strong>makes {itemList([recipe.output])}</strong>
      <span>{recipe.ticks} processing ticks per batch</span>
    </div>}
    {diagnostic.remaining_ticks > 0 && <p>{diagnostic.remaining_ticks} tick{diagnostic.remaining_ticks === 1 ? "" : "s"} on the current cycle clock.</p>}
    {diagnostic.status === "output_full" && <p>A hauler or crane must collect output to make room.</p>}
    {diagnostic.status === "exhausted" && <p>The deposit under this drill is empty. Stored material can still be collected.</p>}
    {facility.kind === "crane" && <>
      <p>{transfer ? `Available now: ${transfer.item} from ${facilityName(transfer.source, names)} to ${facilityName(transfer.destination, names)}.` : "Needs a neighboring facility with output and a receiving neighbor with room."}</p>
      <p className="world-mechanic-note">Transfers go from a lower-numbered facility to a higher-numbered one. Both must be ready and next to the crane. Availability is checked again when the cycle ends.</p>
    </>}
    {facility.kind === "storehouse" && <p>Holds supplies for a planned route. Your agent can assign a courier to deposit or collect them.</p>}
    {facility.kind === "miner" && diagnostic.status !== "exhausted" && <p>Extracts material from the deposit below. The deposit and buffer are checked again when the cycle ends.</p>}
    <dl><div><dt>In storage</dt><dd>{stock.length ? itemList(stock) : "Empty"}</dd></div>
      {facility.kind !== "storehouse" && <div><dt>{facility.kind === "crane" ? "Items moved" : facility.kind === "miner" ? "Material extracted" : "Total produced"}</dt><dd>{facility.minted}</dd></div>}
    </dl>
  </>;
}

function describeActivation(activation: { cell: number; action: { kind: string }; success: boolean; error: string | null }): string {
  const name = CELL_NAMES[activation.cell] ?? `Cell ${activation.cell}`;
  if (!activation.success) {
    if (activation.error === "movement_blocked") return `${name} waited at a blocked path.`;
    if (activation.error === "source_empty") return `${name} found its source empty.`;
    return `${name} could not complete ${activation.action.kind.replaceAll("_", " ")}.`;
  }
  switch (activation.action.kind) {
    case "pickup": return `${name} picked up a light spark.`;
    case "drop": return `${name} delivered light.`;
    case "gather": return `${name} gathered material from a deposit.`;
    case "supply": return `${name} supplied a facility.`;
    case "fetch": return `${name} collected from a facility.`;
    case "gather_material": return `${name} gathered a construction unit.`;
    case "build": return `${name} is building another creature.`;
    case "activate": return `${name}'s new creature joined the world.`;
    case "move": return `${name} moved along its route.`;
    default: return `${name} completed ${activation.action.kind.replaceAll("_", " ")}.`;
  }
}

function carryingList(cell: { cargo: unknown; material?: number; part?: number; frame?: number }): string {
  const items = [
    cell.cargo ? "light" : null,
    cell.material !== undefined ? "material" : null,
    cell.part !== undefined ? "a part" : null,
    cell.frame !== undefined ? "a frame" : null,
  ].filter(Boolean);
  return items.length > 0 ? items.join(", ") : "nothing";
}

function cellState(
  cell: { cargo: unknown; material?: number; part?: number; frame?: number },
  activation?: { action: { kind: string }; success: boolean; error: string | null },
): string {
  if (cell.frame !== undefined) return "Carrying an assembled frame.";
  if (cell.part !== undefined) return "Carrying a finished part.";
  if (cell.material !== undefined) return "Carrying a construction unit.";
  if (cell.cargo) return "Carrying a light spark.";
  if (activation && !activation.success) {
    return activation.error === "movement_blocked" ? "Waiting because the path ahead is occupied or closed." : "Its last action did not complete.";
  }
  if (activation) return `Currently ${activation.action.kind.replaceAll("_", " ")}.`;
  return "Waiting for its next activation.";
}
