"use client";

import { useEffect, useMemo, useState } from "react";
import { RecordedHabitat } from "@/components/recorded-habitat";
import type { Receipt } from "@/lib/bridge/types";
import type { WorldReport } from "@/lib/play/engine";
import { useReplay } from "@/lib/play/use-replay";

const CELL_NAMES: Record<number, string> = {
  1: "Moth",
  2: "Ant",
  3: "Moss",
  4: "Lark",
  5: "Foundry",
};

const FACILITY_NAMES: Record<number, string> = {
  90: "West Fabricator",
  91: "Storehouse",
  92: "East Drill",
};

const FACILITY_LABELS: Record<string, string> = {
  fabricator: "fabricator",
  storehouse: "storehouse",
  miner: "drill",
  assembler: "assembler",
  crane: "crane",
};

export function WorldStage({ report }: { report: WorldReport }) {
  const frames = report.recent_frames;
  const { at, setAt, playing, play, stop, speed, setSpeed, reset } = useReplay(frames.length);
  const [selectedCell, setSelectedCell] = useState<number>();
  const frame = frames[Math.min(at, frames.length - 1)];

  useEffect(() => {
    reset();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) play();
  }, [report.world_hash]);

  const receipt = useMemo<Receipt>(() => ({
    schema: "platonik-living-world-view-v1",
    protocol: "platonik-living-world-v1",
    experiment_hash: report.world_hash,
    result_hash: report.world_hash,
    experiment: report.experiment,
    result: {
      status: "running",
      ticks_completed: report.tick,
      costs: report.costs,
      outcome: { passed: false },
      frames,
      final_state: report.state,
    },
  }), [frames, report]);

  if (!frame) return null;

  const state = frame.state;
  const selected = selectedCell == null ? undefined : state.cells.find((cell) => cell.id === selectedCell);
  const activation = selected == null ? undefined : frame.activations.find((item) => item.cell === selected.id);
  const sourceSparks = state.sources.reduce((sum, source) => sum + source.sparks.length, 0);
  const beaconCharge = state.beacons.reduce((sum, beacon) => sum + beacon.charge, 0);
  const built = state.construction?.births.length ?? 0;
  const facilities = state.facilities ?? [];
  const partsMinted = facilities.reduce(
    (sum, facility) => sum + (facility.kind === "fabricator" ? facility.minted : 0),
    0,
  );
  const framesMinted = facilities.reduce(
    (sum, facility) => sum + (facility.kind === "assembler" ? facility.minted : 0),
    0,
  );
  const itemsMoved = facilities.reduce(
    (sum, facility) => sum + (facility.kind === "crane" ? facility.minted : 0),
    0,
  );
  const activity = frame.activations
    .filter((item) => item.action.kind !== "wait" || !item.success)
    .slice(0, 5)
    .map(describeActivation);
  const routes = [
    { id: 0, name: "Dustlight home" },
    { id: 1, name: "East outpost" },
  ].map((route) => ({
    ...route,
    charge: state.beacons.find((beacon) => beacon.id === route.id)?.charge ?? 0,
    waiting: state.sources.find((source) => source.id === route.id)?.sparks.length ?? 0,
    delivered: state.delivered.filter((delivery) => delivery.beacon === route.id).length,
  }));
  const facilityRows = facilities.map((facility) => ({
    id: facility.id,
    name: report.names[String(facility.id)] ?? FACILITY_NAMES[facility.id] ?? `Facility ${facility.id}`,
    kind: facility.kind,
    ready: facility.ready,
    buffers: `${facility.materials.length}m ${facility.sparks.length}s ${facility.parts.length}p ${facility.frames?.length ?? 0}f`,
    needed: facility.ready ? "" : `needs ${facility.needed_material}m ${facility.needed_part}p ${facility.needed_frame ?? 0}f`,
    minted: facility.minted,
    production:
      facility.kind === "miner"
        ? `${facility.minted} extracted`
        : facility.kind === "crane"
          ? `${facility.minted} moved`
          : facility.kind === "assembler"
            ? `${facility.minted} frames`
            : `${facility.minted} minted`,
  }));

  function togglePlayback() {
    if (playing) {
      stop();
      return;
    }
    if (at >= frames.length - 1) setAt(0);
    play();
  }

  return (
    <div className="world-stage">
      <div className="world-viewport">
        <RecordedHabitat
          receipt={receipt}
          frame={frame}
          selectedCell={selectedCell}
          onSelectCell={setSelectedCell}
          names={report.names}
        />
        <div className="world-vitals" aria-label="World state at this moment">
          <span><strong>{state.delivered.length}</strong> delivered</span>
          <span><strong>{sourceSparks}</strong> waiting</span>
          <span><strong>{state.cells.length}</strong> creatures</span>
          <span><strong>{beaconCharge}</strong> light</span>
          <span><strong>{partsMinted}</strong> parts</span>
          <span><strong>{framesMinted}</strong> frames</span>
          <span><strong>{itemsMoved}</strong> auto-moved</span>
        </div>
      </div>

      <div className="world-timeline">
        <button className="world-transport" type="button" onClick={togglePlayback}>
          {playing ? "Pause" : at >= frames.length - 1 ? "Replay" : "Play"}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(0, frames.length - 1)}
          value={at}
          onChange={(event) => {
            stop();
            setAt(Number(event.target.value));
          }}
          aria-label="World timeline"
        />
        <span>Tick {frame.tick}</span>
        <select aria-label="Replay speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
          <option value={4}>1×</option>
          <option value={8}>2×</option>
          <option value={16}>4×</option>
          <option value={32}>8×</option>
        </select>
      </div>

      <div className="world-flows" aria-label="Supply routes at this moment">
        {routes.map((route) => (
          <div key={route.id}>
            <span className={`world-flow-light ${route.charge > 0 ? "online" : "dark"}`} aria-hidden="true" />
            <strong>{route.name}</strong>
            <span>{route.delivered} delivered</span>
            <span>{route.waiting} at source</span>
            <span>{route.charge} light</span>
          </div>
        ))}
        {facilityRows.map((facility) => (
          <div key={`facility-${facility.id}`}>
            <span className={`world-flow-light ${facility.ready ? "online" : "dark"}`} aria-hidden="true" />
            <strong>{facility.name}</strong>
            <span>{facility.ready ? FACILITY_LABELS[facility.kind] ?? facility.kind : "construction site"}</span>
            <span>{facility.ready ? facility.buffers : facility.needed}</span>
            {facility.minted > 0 && <span>{facility.production}</span>}
          </div>
        ))}
      </div>

      <div className="world-readout">
        <section aria-labelledby="world-moment-title">
          <p className="world-kicker">This moment</p>
          <h2 id="world-moment-title">{momentTitle(activity, built)}</h2>
          {activity.length > 0 ? (
            <ul className="world-activity">
              {activity.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}
            </ul>
          ) : (
            <p>The routes are quiet at this tick. Scrub the timeline to follow the work.</p>
          )}
        </section>

        <section className="world-inspector" aria-labelledby="world-inspector-title">
          <p className="world-kicker">Inspector</p>
          {selected ? (
            <>
              <h2 id="world-inspector-title">{CELL_NAMES[selected.id] ?? `Cell ${selected.id}`}</h2>
              <p>{cellState(selected, activation)}</p>
              <dl>
                <div><dt>Position</dt><dd>{selected.position.x}, {selected.position.y}</dd></div>
                <div><dt>Carrying</dt><dd>{carryingList(selected)}</dd></div>
                <div><dt>Memory</dt><dd>{selected.memory.join(" · ")}</dd></div>
              </dl>
            </>
          ) : (
            <>
              <h2 id="world-inspector-title">Choose a creature</h2>
              <p>Select a numbered creature in the world to see what it is carrying and doing.</p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function momentTitle(activity: string[], built: number): string {
  if (activity.some((line) => line.includes("joined"))) return "A new creature joins the world.";
  if (activity.some((line) => line.includes("supplied"))) return "Industry is being fed.";
  if (activity.some((line) => line.includes("gathered"))) return "Raw material is coming in.";
  if (activity.some((line) => line.includes("delivered"))) return "Light reaches a home.";
  if (activity.some((line) => line.includes("building"))) return "The foundry is assembling new capacity.";
  if (activity.some((line) => line.includes("blocked"))) return "A route has a bottleneck.";
  return built > 0 ? "Two routes are working at once." : "The first route is taking shape.";
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
    default: return `${name} ${activation.action.kind.replaceAll("_", " ")}.`;
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
  if (cell.cargo) return "Carrying light toward a home.";
  if (activation && !activation.success) {
    return activation.error === "movement_blocked" ? "Waiting because the path ahead is occupied or closed." : "Its last action did not complete.";
  }
  if (activation) return `Currently ${activation.action.kind.replaceAll("_", " ")}.`;
  return "Waiting for its next activation.";
}
