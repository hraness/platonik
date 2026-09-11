import type { Frame, Point, Receipt } from "@/lib/bridge/types";

export function RecordedHabitat({ receipt, frame }: { receipt: Receipt; frame: Frame }) {
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
    {(state.closed_edges ?? []).map(edge => {
      const a = center(edge.a), b = center(edge.b), x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      return <g key={`${edge.a.x},${edge.a.y}:${edge.b.x},${edge.b.y}`} stroke="#805d2d" strokeWidth="3"><line x1={x - 5} y1={y - 5} x2={x + 5} y2={y + 5} /><line x1={x + 5} y1={y - 5} x2={x - 5} y2={y + 5} /></g>;
    })}
    {world.sources.map(item => <g key={`source-${item.id}`}>{label(item.position, "S", "#805d2d")}</g>)}
    {world.depots.map(item => <g key={`depot-${item.id}`}>{label(item.position, "D")}</g>)}
    {world.valves.map(item => <g key={`valve-${item.id}`}>{label(item.position, "V")}</g>)}
    {world.beacons.map(item => <g key={`beacon-${item.id}`}>{label(item.position, `B${item.id}`)}</g>)}
    {state.cells.map(cell => <g key={cell.id}><circle {...{ cx: center(cell.position).x, cy: center(cell.position).y }} r="11" fill={cell.cargo ? "#805d2d" : "#304f3d"} stroke="#f9f9f6" strokeWidth="2" />{label(cell.position, String(cell.id), "#ffffff")}</g>)}
  </svg>;
}
