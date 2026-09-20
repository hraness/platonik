"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FrontierMap, SpriteIcon } from "./frontier-map";
import type { FacilityKind, FacilityState, Point } from "@/lib/bridge/types";
import type { FacilityDiagnostic, WorldCommand, WorldReport } from "@/lib/play/engine";
import { useReplay } from "@/lib/play/use-replay";
import { CELL_NAMES, FACILITY_LABELS, facilityName, facilityStatus, itemList, worldViews } from "@/lib/play/world-view";

type Selection = { kind: "cell" | "facility"; id: number };

const BUILDINGS: { kind: FacilityKind; description: string; cost: string }[] = [
  { kind: "miner", description: "Extract ore from a deposit.", cost: "2 material · 1 part" },
  { kind: "fabricator", description: "Turn material and sparks into parts.", cost: "3 material · 2 parts" },
  { kind: "assembler", description: "Make frames from material, parts and sparks.", cost: "4 material · 2 parts" },
  { kind: "crane", description: "Move items between adjacent machines.", cost: "1 material · 1 part · 1 frame" },
  { kind: "storehouse", description: "Store items for your freight routes.", cost: "2 material · 1 part" },
];
export function WorldStage({ report, onAsk, running, onPause, busy, animatedFrom, onCommand, onRoute }: {
  report: WorldReport; onAsk: (question: string) => void; running: boolean; onPause: () => void; busy: boolean; animatedFrom?: number;
  onCommand: (command: WorldCommand) => Promise<boolean>; onRoute: (cell: number, points: Point[]) => Promise<boolean>;
}) {
  const views = useMemo(() => worldViews(report), [report]);
  const frames = useMemo(() => views.map((view) => view.frame), [views]);
  const { at, setAt, playing, play, stop, speed, setSpeed } = useReplay(frames.length);
  const preserveReplayOnPause = useRef(false);
  const stage = useRef<HTMLDivElement>(null);
  const [building, setBuilding] = useState<FacilityKind | null>(null);
  const [target, setTarget] = useState<Point>({ x: 8, y: 8 });
  const [routing, setRouting] = useState(false);
  const [routePoints, setRoutePoints] = useState<Point[]>([]);
  const [focusPoint, setFocusPoint] = useState<Point>();
  const [selection, setSelection] = useState<Selection>({ kind: "facility", id: report.state.facilities?.[0]?.id ?? 90 });
  const view = views[Math.min(at, views.length - 1)];
  const frame = view?.frame;

  useEffect(() => {
    stop();
    if (running && animatedFrom !== undefined) {
      const start = frames.findIndex((entry) => entry.tick >= animatedFrom);
      setAt(Math.max(0, start));
      setSpeed(16);
      play();
    } else setAt(frames.length - 1);
  }, [report.world_hash]);
  useEffect(() => {
    if (!running && !preserveReplayOnPause.current) { stop(); setAt(frames.length - 1); }
    preserveReplayOnPause.current = false;
  }, [running]);

  if (!frame) return null;
  const state = frame.state;
  const facilities = state.facilities ?? [];
  const selectedCell = selection.kind === "cell" ? state.cells.find((cell) => cell.id === selection.id) : undefined;
  const selectedFacility = selection.kind === "facility" ? facilities.find((facility) => facility.id === selection.id) : undefined;
  const diagnostic = selectedFacility && view.industry.find((item) => item.id === selectedFacility.id);
  const activation = selectedCell && frame.activations.find((item) => item.cell === selectedCell.id);
  const activity = frame.activations.filter((item) => item.action.kind !== "wait" || !item.success).slice(0, 3).map(describeActivation);
  const routes = [{ id: 0, name: "Home beacon" }, { id: 1, name: "East outpost" }].map((route) => ({
    ...route,
    charge: state.beacons.find((beacon) => beacon.id === route.id)?.charge ?? 0,
    delivered: state.delivered.filter((delivery) => delivery.beacon === route.id).length,
  }));
  const parts = facilities.filter((facility) => facility.kind === "fabricator").reduce((sum, facility) => sum + facility.minted, 0);
  const madeFrames = facilities.filter((facility) => facility.kind === "assembler").reduce((sum, facility) => sum + facility.minted, 0);

  function select(value: Selection) { if (!running) stop(); setSelection(value); setRouting(false); }
  function cancelPlan() { setBuilding(null); setRouting(false); setRoutePoints([]); stage.current?.querySelector<SVGSVGElement>(".frontier-canvas")?.focus({ preventScroll: true }); }
  function locate(value: Selection) {
    const entity = value.kind === "facility" ? facilities.find((facility) => facility.id === value.id) : state.cells.find((cell) => cell.id === value.id);
    if (entity) setFocusPoint({ ...entity.position });
  }
  function chooseBuilding(kind: FacilityKind) { onPause(); stop(); setAt(frames.length - 1); setRouting(false); setBuilding(building === kind ? null : kind); }
  function chooseTarget(point: Point) { setTarget(point); if (routing && routePoints.length < 8) setRoutePoints((points) => [...points, point]); }
  const frontier = report.experiment.seed === 751 && report.experiment.width === 32 && report.experiment.height === 22;
  const crane = report.state.facilities?.find((facility) => facility.kind === "crane" && facility.ready);
  const storehouses = (report.state.facilities ?? []).filter((facility) => facility.kind === "storehouse" && !report.experiment.facilities?.some((original) => original.id === facility.id));
  const goals = [
    { title: "Make your first parts", detail: "Run the factory. The haulers feed ore and sparks to the fabricator.", done: report.summary.parts_minted > 0 },
    { title: "Assemble a frame", detail: "Parts travel to the assembler, where another spark and ore become a frame.", done: report.summary.frames_minted > 0 },
    { title: "Build a freight crane", detail: "Place a crane at 8, 8, between the fabricator and assembler. The crew delivers its bill.", done: Boolean(crane?.ready) },
    { title: "Let machines move the freight", detail: "Run the factory until the crane makes its first transfer. Your first automated chain is complete.", done: report.summary.items_moved > 0 },
    { title: "Give finished frames a home", detail: "Build a storehouse at 7, 6, on the return lane. It keeps frames moving out of the assembler.", done: storehouses.some((facility) => facility.ready) },
    { title: "Stock your new storehouse", detail: "Run the crew until a finished frame reaches storage. Then extend a freight route toward the outpost and southern ore.", done: storehouses.some((facility) => (facility.frames?.length ?? 0) > 0) },
  ];
  const nextGoal = goals.find((goal) => !goal.done);
  const crossing = report.state.cells.find((cell) => cell.position.x === target.x && cell.position.y === target.y);
  const crossingCanMove = crossing && (report.experiment.cells.find((cell) => cell.id === crossing.id) ?? report.state.construction?.births.find((birth) => birth.body.cell.id === crossing.id)?.body.cell)?.mobile;
  const build = BUILDINGS.find((item) => item.kind === building);
  const planActive = Boolean(build || routing);
  const siteIssue = building ? constructionSiteIssue(report, building, target) : null;
  const selectedEntity = selectedFacility ?? selectedCell;
  const timelineMoment = view.current ? "latest" : running ? "running" : "history";
  async function place() { if (building && await onCommand({ kind: "place", structure: building, position: target })) setBuilding(null); }
  async function assignRoute() { if (selection.kind === "cell" && await onRoute(selection.id, routePoints)) { setRouting(false); setRoutePoints([]); } }

  function pauseForReplay() { preserveReplayOnPause.current = running; onPause(); }
  function showLatest() { preserveReplayOnPause.current = false; stop(); setAt(frames.length - 1); }
  function togglePlayback() {
    if (playing) { stop(); return; }
    if (at >= frames.length - 1) setAt(0);
    play();
  }

  return (
    <div ref={stage} className="world-stage world-workspace" onKeyDown={(event) => { if (event.key === "Escape" && (building || routing)) { event.preventDefault(); cancelPlan(); } }}>
      <div className="world-scene">
        {frontier && <section className="frontier-objective" aria-label="Settlement goal"><div><strong>{nextGoal?.title ?? "Your first factory is working."}</strong><p>{nextGoal?.detail ?? "Explore the ore seams, build another workshop, and draw a freight route to connect it."}</p></div><span>{goals.filter((goal) => goal.done).length} / {goals.length}</span>{(nextGoal === goals[2] || nextGoal === goals[4]) && <button className="lab-button secondary" disabled={busy} onClick={() => { const site = nextGoal === goals[2] ? { x: 8, y: 8 } : { x: 7, y: 6 }; chooseBuilding(nextGoal === goals[2] ? "crane" : "storehouse"); setTarget(site); setFocusPoint(site); }}>{nextGoal === goals[2] ? "Plan this crane" : "Plan this storehouse"}</button>}</section>}
        <FrontierMap report={report} frame={frame} selection={selection} onSelect={select} building={building} target={target} onTarget={chooseTarget} focusPoint={focusPoint} routing={routing} routePoints={routePoints} onCancel={cancelPlan} />
        <div className="frontier-buildbar" aria-label="Build machines">{BUILDINGS.map((item) => <button type="button" key={item.kind} aria-pressed={building === item.kind} disabled={busy} onClick={() => chooseBuilding(item.kind)} title={`${item.description} Build: ${item.cost}`}><SpriteIcon kind={item.kind} /><span className="frontier-build-copy"><span>{FACILITY_LABELS[item.kind]}</span><small className="frontier-build-cost">{item.cost}</small></span></button>)}</div>
      </div>

      <aside className="world-workshop" aria-label="Workshop and inspector">
        {(build || routing) && <section className="frontier-placement" aria-label={routing ? "Freight route editor" : "Construction plan"}>
          <div><strong>{routing ? `Draw ${selectedCell ? CELL_NAMES[selectedCell.id] ?? `Courier ${selectedCell.id}` : "a courier"}'s route` : `Build: ${FACILITY_LABELS[building!]}`}</strong><p>{routing ? "Choose 4–8 corners of a closed loop, with straight horizontal or vertical sides. Include this courier’s current tile. Click the map to add corners." : `${build!.description} Construction costs ${build!.cost}. Place the site on a hauler’s route so supplies can reach it.`}</p></div>
          <div className="frontier-coordinates"><label>X<input type="number" aria-label={routing ? "Corner X" : "Site X"} min="0" max={report.experiment.width - 1} value={target.x} onChange={(event) => setTarget({ ...target, x: Number(event.target.value) })} /></label><label>Y<input type="number" aria-label={routing ? "Corner Y" : "Site Y"} min="0" max={report.experiment.height - 1} value={target.y} onChange={(event) => setTarget({ ...target, y: Number(event.target.value) })} /></label>
            {routing ? <button className="lab-button secondary" disabled={routePoints.length >= 8} onClick={() => setRoutePoints((points) => [...points, target])}>Add corner</button> : <button className="lab-button" onClick={() => void place()} disabled={busy || Boolean(crossing) || Boolean(siteIssue)}>Place site</button>}
            <button className="lab-button secondary" onClick={cancelPlan}>Cancel</button></div>
          {build && siteIssue && <p className="frontier-site-blocked" role="status">{siteIssue}</p>}
          {build && !siteIssue && crossing && <div className="frontier-site-blocked"><p>{CELL_NAMES[crossing.id] ?? `Courier ${crossing.id}`} is on this tile. {crossingCanMove ? "Let the crew move before placing the site." : "Choose another tile for this site."}</p>{crossingCanMove && <button className="lab-button secondary" disabled={busy || report.tick + 8 > report.maximum_tick} onClick={() => void onCommand({ kind: "advance", ticks: 8 })}>Let crew move</button>}</div>}
          {routing && <><ol className="frontier-route-points">{routePoints.map((point, index) => <li key={index}>{point.x}, {point.y}</li>)}</ol><div className="frontier-route-actions"><button className="lab-button" disabled={busy || routePoints.length < 4} onClick={() => void assignRoute()}>Assign freight route</button><button className="lab-button secondary" disabled={!routePoints.length} onClick={() => setRoutePoints((points) => points.slice(0, -1))}>Undo corner</button><button className="lab-button secondary" disabled={!routePoints.length} onClick={() => setRoutePoints([])}>Clear route</button>{frontier && <button className="lab-button secondary" onClick={() => { setRoutePoints([{ x: 7, y: 3 }, { x: 9, y: 3 }, { x: 9, y: 8 }, { x: 13, y: 8 }, { x: 13, y: 10 }, { x: 26, y: 10 }, { x: 26, y: 18 }, { x: 7, y: 18 }]); setFocusPoint({ x: 17, y: 11 }); }}>Sketch outpost loop</button>}</div></>}
        </section>}
        {!planActive && <>
          <div className="world-workshop-heading"><h2>Inspector</h2><span>Tick {frame.tick}</span></div>
          <label className="world-entity-picker" htmlFor="world-entity-picker">Inspect a machine or courier
            <select id="world-entity-picker" aria-controls="world-inspector" value={selectedEntity ? `${selection.kind}:${selection.id}` : ""} onChange={(event) => {
              const [kind, id] = event.target.value.split(":");
              if (kind !== "facility" && kind !== "cell") return;
              const value: Selection = { kind, id: Number(id) };
              select(value); locate(value);
            }}>
              {!selectedEntity && <option value="">Choose a machine or courier</option>}
              <optgroup label="Machines">{facilities.map((facility) => <option key={facility.id} value={`facility:${facility.id}`}>{displayFacilityName(facility, report.names)} · {facility.position.x}, {facility.position.y}</option>)}</optgroup>
              <optgroup label="Crew">{state.cells.map((cell) => <option key={cell.id} value={`cell:${cell.id}`}>{CELL_NAMES[cell.id] ?? `Cell ${cell.id}`} · {cell.position.x}, {cell.position.y}</option>)}</optgroup>
            </select>
          </label>
          <section className="world-inspector" id="world-inspector" aria-labelledby="world-inspector-title">
            {selectedFacility && diagnostic ? <>
              <h3 id="world-inspector-title">{displayFacilityName(selectedFacility, report.names)}</h3>
              <p className="world-inspector-location">{FACILITY_LABELS[selectedFacility.kind]} · {selectedFacility.position.x}, {selectedFacility.position.y}</p>
              <button className="lab-button secondary world-locate" type="button" onClick={() => locate(selection)}>Locate on map</button>
              <FacilityDetails facility={selectedFacility} diagnostic={diagnostic} names={report.names} />
              <button className="lab-button secondary world-ask-facility" type="button" onClick={() => onAsk(
                `Help me improve ${displayFacilityName(selectedFacility, report.names)} (facility ${selectedFacility.id}). At displayed tick ${frame.tick}, its checked status was: ${facilityStatus(diagnostic)}. Inspect the latest state first, then propose one useful supply-chain improvement while keeping the light routes served.`
              )}>Ask your agent about this</button>
            </> : selectedCell ? <>
              <h3 id="world-inspector-title">{CELL_NAMES[selectedCell.id] ?? `Cell ${selectedCell.id}`}</h3>
              <p>{cellState(selectedCell, activation)}</p>
              <dl><div><dt>Position</dt><dd>{selectedCell.position.x}, {selectedCell.position.y}</dd></div>
                <div><dt>Carrying</dt><dd>{carryingList(selectedCell)}</dd></div></dl>
              <button className="lab-button secondary world-locate" type="button" onClick={() => locate(selection)}>Locate on map</button>
              {(report.experiment.version ?? 5) >= 6 && report.experiment.cells.find((cell) => cell.id === selectedCell.id)?.mobile && <button className="lab-button secondary" disabled={busy} onClick={() => { onPause(); stop(); setAt(frames.length - 1); setBuilding(null); setRouting(true); setRoutePoints([]); setTarget(report.state.cells.find((cell) => cell.id === selectedCell.id)?.position ?? selectedCell.position); }}>Draw freight route</button>}
              <details><summary>Working memory</summary><p>{selectedCell.memory.join(" · ")}</p></details>
            </> : <><h3 id="world-inspector-title">Select part of your world</h3>
              <p>Choose a machine or courier from the list or map. A selected facility may not exist yet in an earlier replay frame.</p></>}
          </section>
        </>}
      </aside>
      <div className="world-history" aria-label="Factory history">
        <div className="world-vitals" aria-label="World state at this moment">
          <span><strong>{state.delivered.length}</strong> light delivered</span>
          <span><strong>{state.cells.length}</strong> creatures</span>
          <span><strong>{parts}</strong> parts made</span>
          {madeFrames > 0 && <span><strong>{madeFrames}</strong> frames made</span>}
        </div>
        <div className="world-timeline">
          <button className="world-transport" type="button" onClick={() => { pauseForReplay(); togglePlayback(); }} disabled={frames.length < 2}>
            {playing ? "Pause" : at >= frames.length - 1 ? "Replay" : "Play"}
          </button>
          <input type="range" min={0} max={Math.max(0, frames.length - 1)} value={at}
            onPointerDown={() => { pauseForReplay(); stop(); }}
            onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) { pauseForReplay(); stop(); } }}
            onChange={(event) => { pauseForReplay(); stop(); setAt(Number(event.target.value)); }}
            aria-label="World timeline" aria-valuetext={`Tick ${frame.tick}, ${timelineMoment}`} />
          <span>Tick {frame.tick} · {timelineMoment}</span>
          {!view.current && <button className="lab-button secondary world-timeline-latest" type="button" onClick={showLatest}>Latest</button>}
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
        <details className="world-observation"><summary>What the crew did</summary><div>
          <span>At tick {frame.tick}</span>
          {activity.length > 0 ? <ul>{activity.map((line, index) => <li key={index}>{line}</li>)}</ul>
            : <p>No creature action at this recorded tick. Facility status is shown in the workshop.</p>}
        </div></details>
      </div>
    </div>
  );
}

function displayFacilityName(facility: FacilityState, names: Record<string, string>): string {
  const name = facilityName(facility.id, names);
  return names[String(facility.id)] === undefined && name === `Facility ${facility.id}` ? `${FACILITY_LABELS[facility.kind]} ${facility.id}` : name;
}

// Immediate feedback for visible site constraints; Rust still admits every placement.
function constructionSiteIssue(report: WorldReport, kind: FacilityKind, point: Point): string | null {
  const { experiment, state } = report;
  const here = (position: Point) => position.x === point.x && position.y === point.y;
  if (!Number.isInteger(point.x) || !Number.isInteger(point.y) || point.x < 0 || point.y < 0 || point.x >= experiment.width || point.y >= experiment.height) return "Choose a whole-number tile inside the map.";
  if (experiment.walls.some(here)) return "This tile is blocked terrain. Choose an open tile.";
  const deposit = experiment.construction?.stocks.some((stock) => here(stock.position));
  if (kind === "miner" && !deposit) return "A drill must be placed on a material deposit.";
  if (state.facilities?.some((facility) => here(facility.position))) return "A machine or construction site already occupies this tile.";
  const reserved = experiment.construction?.blueprints.some((blueprint) => here(blueprint.body.cell.position));
  const station = [...experiment.sources, ...experiment.depots, ...experiment.beacons, ...experiment.valves, ...(experiment.construction?.stocks ?? [])].some((entry) => here(entry.position));
  if ((station || reserved) && !(kind === "miner" && deposit)) return deposit ? "Only a drill can be placed on a material deposit." : "This tile belongs to a station or reserved construction. Choose an open tile.";
  if (reserved && state.construction?.assemblies.some((assembly) => experiment.construction?.blueprints.some((blueprint) => blueprint.id === assembly.blueprint && here(blueprint.body.cell.position)))) return "This tile is reserved for a creature under construction.";
  return null;
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
    {facility.kind === "storehouse" && <p>Holds finished frames delivered by frontier haulers. Your agent can teach a courier other deposit and collection rules.</p>}
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
