"use client";

import { useEffect, useRef, useState } from "react";
import type { FacilityKind, Frame, Point } from "@/lib/bridge/types";
import type { WorldReport } from "@/lib/play/engine";
import atlas from "@/public/art/frontier/atlas.json";
import { CELL_NAMES, facilityName } from "@/lib/play/world-view";

const SPRITE_NAMES = { miner: "drill", fabricator: "fabricator", assembler: "assembler", storehouse: "storehouse", crane: "crane", home: "outpost", beacon: "beacon", foundry: "foundry", rover: "courier", ore: "ore", spark: "spark", scrub: "scrub" } as const;
const ATLAS = "/art/frontier/industry-atlas.png";
export const SPRITES = { miner: 0, fabricator: 1, assembler: 2, storehouse: 3, crane: 4, home: 5, beacon: 6, foundry: 7, rover: 8, ore: 9, spark: 10, scrub: 11 };
export function Sprite({ kind, x = 0, y = 0, size = 1 }: { kind: keyof typeof SPRITES; x?: number; y?: number; size?: number }) {
  const crop = atlas.sprites[SPRITE_NAMES[kind]];
  return <svg x={x} y={y} width={size} height={size} viewBox={`${crop.x} ${crop.y} ${crop.width} ${crop.height}`} overflow="hidden" aria-hidden="true" className="frontier-sprite">
    <image href={ATLAS} width="1448" height="1086" />
  </svg>;
}
export function SpriteIcon({ kind }: { kind: keyof typeof SPRITES }) {
  return <svg viewBox="0 0 1 1" width="44" height="44" aria-hidden="true"><Sprite kind={kind} /></svg>;
}

type Selection = { kind: "cell" | "facility"; id: number };
type Camera = { x: number; y: number; width: number };
export function FrontierMap({ report, frame, selection, onSelect, building, target, onTarget, focusPoint, routing, routePoints }: {
  report: WorldReport; frame: Frame; selection: Selection; onSelect: (value: Selection) => void;
  building: FacilityKind | null; target: Point; onTarget: (point: Point) => void; focusPoint?: Point; routing: boolean; routePoints: Point[];
}) {
  const svg = useRef<SVGSVGElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(1.65);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, width: 19 });
  const [hover, setHover] = useState<Point>();
  const drag = useRef<{ x: number; y: number; camera: Camera; selection?: Selection } | null>(null);
  const moved = useRef(false);
  const { experiment } = report;
  const frontier = experiment.seed === 751 && experiment.width === 32 && experiment.height === 22;
  const state = frame.state;
  const height = camera.width / ratio;
  function clamp(next: Camera): Camera {
    const width = Math.min(Math.max(next.width, 7), Math.max(experiment.width + 2, (experiment.height + 2) * ratio));
    return { width, x: Math.max(-1, Math.min(next.x, experiment.width - width + 1)), y: Math.max(-1, Math.min(next.y, experiment.height - width / ratio + 1)) };
  }
  function home() {
    const center = frontier ? { x: 8, y: 6 } : { x: experiment.width / 2, y: experiment.height / 2 };
    const width = frontier ? (ratio < 1 ? 10 : 19) : experiment.width + 2;
    setCamera(clamp({ x: center.x - width / 2, y: center.y - width / ratio / 2, width }));
  }
  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(([entry]) => setRatio(entry.contentRect.width / entry.contentRect.height));
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { home(); }, [experiment.width, experiment.height, ratio]);
  useEffect(() => {
    if (focusPoint) setCamera((previous) => clamp({ ...previous, x: focusPoint.x - previous.width / 2, y: focusPoint.y - previous.width / ratio / 2 }));
  }, [focusPoint]);
  function point(clientX: number, clientY: number): Point {
    const rect = svg.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(experiment.width - 1, Math.floor(camera.x + (clientX - rect.left) / rect.width * camera.width))), y: Math.max(0, Math.min(experiment.height - 1, Math.floor(camera.y + (clientY - rect.top) / rect.height * height))) };
  }
  function zoom(factor: number) { setCamera((old) => clamp({ width: old.width * factor, x: old.x + old.width * (1 - factor) / 2, y: old.y + old.width / ratio * (1 - factor) / 2 })); }
  function select(value: Selection) { if (!moved.current && !building && !routing) onSelect(value); }
  const occupied = new Set([...experiment.walls, ...(state.facilities ?? []).map((facility) => facility.position), ...experiment.sources.map((source) => source.position), ...experiment.beacons.map((beacon) => beacon.position)].map(({ x, y }) => `${x},${y}`));
  const ghost = hover ?? target;
  const ghostBlocked = occupied.has(`${ghost.x},${ghost.y}`);
  return <div className="frontier-map-shell">
    <div className="frontier-map" ref={viewport}>
      <svg ref={svg} className={building ? "frontier-canvas is-building" : "frontier-canvas"} viewBox={`${camera.x} ${camera.y} ${camera.width} ${height}`} preserveAspectRatio="none" tabIndex={0}
        role="group" aria-label="Factory world. Drag to explore. Arrow keys pan; plus and minus zoom. Select machinery to inspect it."
        onKeyDown={(event) => {
          const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
          if (directions[event.key]) { event.preventDefault(); const [x, y] = directions[event.key]; setCamera((old) => clamp({ ...old, x: old.x + x * 2, y: old.y + y * 2 })); }
          if (event.key === "+" || event.key === "=") { event.preventDefault(); zoom(.8); }
          if (event.key === "-") { event.preventDefault(); zoom(1.25); }
        }}
        onPointerDown={(event) => { if (event.button !== 0) return; moved.current = false; const hit = (event.target as Element).closest("[data-facility], [data-cell]");
          const selected: Selection | undefined = hit?.hasAttribute("data-facility") ? { kind: "facility", id: Number(hit.getAttribute("data-facility")) } : hit?.hasAttribute("data-cell") ? { kind: "cell", id: Number(hit.getAttribute("data-cell")) } : undefined;
          drag.current = { x: event.clientX, y: event.clientY, camera, selection: selected }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={(event) => {
          if (drag.current) {
            const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y;
            if (Math.abs(dx) + Math.abs(dy) > 5) moved.current = true;
            if (moved.current) { const rect = svg.current!.getBoundingClientRect(); setCamera(clamp({ ...drag.current.camera, x: drag.current.camera.x - dx / rect.width * camera.width, y: drag.current.camera.y - dy / rect.height * height })); }
          } else if (building) setHover(point(event.clientX, event.clientY));
        }}
        onPointerUp={(event) => { if (!moved.current) {
          const position = point(event.clientX, event.clientY);
          if (building || routing) onTarget(position);
          else if (drag.current?.selection) onSelect(drag.current.selection);
          else {
            const cell = state.cells.find((entry) => entry.position.x === position.x && entry.position.y === position.y);
            const facility = state.facilities?.find((entry) => entry.position.x === position.x && entry.position.y === position.y);
            if (cell) onSelect({ kind: "cell", id: cell.id }); else if (facility) onSelect({ kind: "facility", id: facility.id });
          }
        } drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onPointerCancel={() => { drag.current = null; }} onPointerLeave={() => setHover(undefined)}>
        <defs>
          <pattern id="frontier-soil" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#a69972" /><path d="M.12 .3h.06M1.3 1.12h.13M.53 1.73h.09M1.8 .7h.08" stroke="#817c61" strokeWidth=".022" /></pattern>
          <pattern id="frontier-build-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="#3d4b40" strokeOpacity=".3" strokeWidth=".018" /></pattern>
        </defs>
        <rect x="-40" y="-40" width="160" height="160" fill="#687567" />
        <rect width={experiment.width} height={experiment.height} fill="url(#frontier-soil)" />
        {Array.from({ length: experiment.width * experiment.height }, (_, index) => {
          const x = index % experiment.width, y = Math.floor(index / experiment.width);
          const hash = (x * 73 + y * 137 + x * y * 17) % 97;
          if (hash > 5 || occupied.has(`${x},${y}`) || (frontier && x >= 5 && x <= 11 && y <= 10)) return null;
          return <g key={index} opacity={.6}><Sprite kind="scrub" x={x - .1} y={y - .15} size={1.2} /></g>;
        })}
        {frontier && <>
          <path d="M7.5 3.5H9.5V8.5H7.5Z" fill="none" stroke="#c3b18a" strokeWidth=".95" />
          <path d="M7.5 3.5H9.5V8.5H7.5Z" fill="none" stroke="#81785e" strokeOpacity=".35" strokeWidth=".055" strokeDasharray=".18 .15" />
          <text x="8.5" y="1.6" className="frontier-region">Copperwake works</text>
          <text x="25.5" y="3.8" className="frontier-region">Eastern seam</text>
          <text x="20" y="20.5" className="frontier-region">South basin</text>
        </>}
        {experiment.walls.map((wall) => <g key={`wall-${wall.x}-${wall.y}`} className="frontier-rock"><Sprite kind="ore" x={wall.x - .18} y={wall.y - .25} size={1.4} /></g>)}
        {experiment.construction?.stocks.map((stock) => {
          const units = state.construction?.stocks.find((value) => value.id === stock.id)?.units.length ?? 0;
          return <g key={`ore-${stock.id}`} opacity={units ? 1 : .4}><Sprite kind="ore" x={stock.position.x - .3} y={stock.position.y - .3} size={1.6} /><title>Ore deposit: {units} units at {stock.position.x}, {stock.position.y}</title>
            <text className="frontier-quantity" x={stock.position.x + .5} y={stock.position.y + 1.1}>{units} ore</text></g>;
        })}
        {experiment.sources.map((source) => <g key={`source-${source.id}`}><Sprite kind="spark" x={source.position.x - .3} y={source.position.y - .5} size={1.6} /><title>Spark spring: {state.sources.find((item) => item.id === source.id)?.sparks.length ?? 0} remaining</title></g>)}
        {experiment.beacons.map((beacon) => <g key={`beacon-${beacon.id}`}><Sprite kind={beacon.id === 0 ? "home" : "beacon"} x={beacon.position.x - .4} y={beacon.position.y - .65} size={1.8} /><title>Outpost {beacon.id}: {state.beacons.find((item) => item.id === beacon.id)?.charge ?? 0} light</title></g>)}
        {building && <rect width={experiment.width} height={experiment.height} fill="url(#frontier-build-grid)" pointerEvents="none" />}
        {(state.facilities ?? []).map((facility) => {
          const chosen = selection.kind === "facility" && selection.id === facility.id;
          const diagnostic = report.industry_frames.find((item) => item.tick === frame.tick)?.facilities.find((item) => item.id === facility.id);
          return <g key={facility.id} data-facility={facility.id} role="button" tabIndex={building ? -1 : 0} aria-label={`Inspect ${facilityName(facility.id, report.names)}`} aria-pressed={chosen}
            onClick={() => select({ kind: "facility", id: facility.id })}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onSelect({ kind: "facility", id: facility.id }); } }}>
            <rect x={facility.position.x - .12} y={facility.position.y - .12} width="1.24" height="1.24" rx=".12" fill={chosen ? "#d0d7b6" : "#827f64"} fillOpacity={chosen ? .8 : .3} stroke={chosen ? "#263e39" : "none"} strokeWidth=".045" />
            <g opacity={facility.ready ? 1 : .55}><Sprite kind={facility.kind} x={facility.position.x - .4} y={facility.position.y - .65} size={1.8} /></g>
            {!facility.ready && <text className="frontier-state" x={facility.position.x + .5} y={facility.position.y + 1.2}>BUILD</text>}
            {facility.ready && diagnostic?.status === "working" && <rect className="frontier-working" x={facility.position.x + .8} y={facility.position.y + .75} width=".12" height=".12" rx=".025" fill="#fbe0a5" />}
          </g>;
        })}
        {state.cells.map((cell) => {
          const chosen = selection.kind === "cell" && selection.id === cell.id;
          const mobile = experiment.cells.find((item) => item.id === cell.id)?.mobile ?? true;
          return <g key={cell.id} data-cell={cell.id} role="button" tabIndex={building ? -1 : 0} aria-label={`Inspect ${CELL_NAMES[cell.id] ?? `Courier ${cell.id}`}`} aria-pressed={chosen}
            onClick={() => select({ kind: "cell", id: cell.id })}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onSelect({ kind: "cell", id: cell.id }); } }}>
            <ellipse cx={cell.position.x + .5} cy={cell.position.y + .8} rx=".48" ry=".28" fill={chosen ? "#f0df9a" : "transparent"} stroke={chosen ? "#29433b" : "transparent"} strokeWidth=".04" />
            <Sprite kind={mobile ? "rover" : "foundry"} x={cell.position.x - .15} y={cell.position.y - .32} size={1.3} />
            {(cell.material !== undefined || cell.part !== undefined || cell.frame !== undefined || cell.cargo) && <text className="frontier-cargo" x={cell.position.x + .5} y={cell.position.y - .12}>{cell.frame !== undefined ? "FRAME" : cell.part !== undefined ? "PART" : cell.material !== undefined ? "ORE" : "SPARK"}</text>}
          </g>;
        })}
        {routing && routePoints.length > 0 && <g pointerEvents="none"><polyline points={[...routePoints, routePoints[0]].map((point) => `${point.x + .5},${point.y + .5}`).join(" ")} fill="none" stroke="#fff0b0" strokeWidth=".09" strokeDasharray=".16 .08" />{routePoints.map((point, index) => <g key={index}><circle cx={point.x + .5} cy={point.y + .5} r=".25" fill="#263e39" /><text x={point.x + .5} y={point.y + .58} textAnchor="middle" fontSize=".23" fill="#fff0b0">{index + 1}</text></g>)}</g>}
        {building && <g pointerEvents="none"><rect x={target.x} y={target.y} width="1" height="1" fill="none" stroke="#263e39" strokeWidth=".08" strokeDasharray=".12 .07" /><g opacity=".55"><Sprite kind={building} x={ghost.x - .4} y={ghost.y - .65} size={1.8} /></g><rect x={ghost.x} y={ghost.y} width="1" height="1" fill={ghostBlocked ? "#b46345" : "#e6dfb6"} fillOpacity=".2" stroke={ghostBlocked ? "#652d21" : "#263e39"} strokeWidth=".05" /></g>}
      </svg>
      <div className="frontier-map-tools" aria-label="Map camera"><button type="button" onClick={() => zoom(.8)} aria-label="Zoom in">+</button><button type="button" onClick={() => zoom(1.25)} aria-label="Zoom out">−</button><button type="button" onClick={home}>Home</button><button type="button" onClick={() => setCamera(clamp({ x: -1, y: -1, width: Math.max(experiment.width + 2, (experiment.height + 2) * ratio) }))}>Map</button></div>
      <span className="frontier-camera-hint">{routing ? "Choose route corners · drag to explore" : building ? "Choose a site · drag to explore" : "Drag to explore · + / − to zoom"}</span>
      <svg className="frontier-minimap" viewBox={`-1 -1 ${experiment.width + 2} ${experiment.height + 2}`} role="img" aria-label="World overview and current camera">
        <rect width={experiment.width} height={experiment.height} fill="#a69972" />
        {experiment.walls.map((wall) => <rect key={`${wall.x}-${wall.y}`} {...wall} width="1" height="1" fill="#625f4e" />)}
        {(state.facilities ?? []).map((facility) => <rect key={facility.id} {...facility.position} width="1" height="1" fill="#214a41" />)}
        {experiment.construction?.stocks.map((stock) => <circle key={stock.id} cx={stock.position.x + .5} cy={stock.position.y + .5} r=".7" fill="#8b3e24" />)}
        <rect x={camera.x} y={camera.y} width={camera.width} height={height} fill="none" stroke="#fff1ce" strokeWidth=".35" />
      </svg>
    </div>
  </div>;
}
