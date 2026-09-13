import type { Frame, Point, Receipt } from "@/lib/bridge/types";

export function RecordedHabitat({ receipt, frame }: { receipt: Receipt; frame: Frame }) {
  const world = receipt.experiment, state = frame.state;
  const births = state.construction?.births ?? [];
  const links = [...world.links, ...births.flatMap(birth => birth.body.links)];
  const constructedLinks = new Set(births.flatMap(birth => birth.body.links.map(link => link.id)));
  const center = (point: Point) => ({ x: point.x * 36 + 18, y: point.y * 36 + 18 });
  const label = (point: Point, text: string, fill = "var(--specimen-ink)") => <text x={center(point).x} y={center(point).y + 5} textAnchor="middle" fontSize="13" fontWeight="600" fill={fill}>{text}</text>;
  return <svg className="bridge-map" viewBox={`0 0 ${world.width * 36} ${world.height * 36}`} role="img" aria-label={`Recorded habitat at tick ${frame.tick}. ${state.delivered.length} sparks delivered to beacons. S: source, D: depot, V: valve, B: beacon, numbered circles: cells. Exact memory and service values follow below.`}>
    <rect width="100%" height="100%" fill="var(--surface)" />
    {world.walls.map(point => <rect key={`${point.x},${point.y}`} x={point.x * 36 + 2} y={point.y * 36 + 2} width="32" height="32" fill="var(--specimen-wall)" />)}
    {links.map(link => {
      const from = link.from.kind === "cell" ? state.cells.find(cell => cell.id === link.from.id) : world.depots.find(depot => depot.id === link.from.id);
      const to = state.cells.find(cell => cell.id === link.to_cell);
      if (!from || !to) return null;
      const a = center(from.position), b = center(to.position);
      const enabled = state.links.find(item => item.id === link.id)?.enabled;
      return <line key={link.id} data-kind={constructedLinks.has(link.id) ? "constructed-link" : "link"} data-link={link.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={enabled ? "var(--specimen-ink)" : "var(--specimen-warm)"} strokeWidth="3" strokeDasharray={enabled ? undefined : "3 4"} />;
    })}
    {(state.closed_edges ?? []).map(edge => {
      const a = center(edge.a), b = center(edge.b), x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      return <g key={`${edge.a.x},${edge.a.y}:${edge.b.x},${edge.b.y}`} stroke="var(--specimen-warm)" strokeWidth="3"><line x1={x - 5} y1={y - 5} x2={x + 5} y2={y + 5} /><line x1={x + 5} y1={y - 5} x2={x - 5} y2={y + 5} /></g>;
    })}
    {world.sources.map(item => <g key={`source-${item.id}`}>{label(item.position, "S", "var(--specimen-warm)")}</g>)}
    {world.depots.map(item => <g key={`depot-${item.id}`}>{label(item.position, "D")}</g>)}
    {world.valves.map(item => <g key={`valve-${item.id}`}>{label(item.position, "V")}</g>)}
    {world.beacons.map(item => <g key={`beacon-${item.id}`}>{label(item.position, `B${item.id}`)}</g>)}
    {world.construction?.stocks.map(stock => <g key={`stock-${stock.id}`} data-kind="material-stock" data-stock={stock.id}><rect x={stock.position.x * 36 + 2} y={stock.position.y * 36 + 2} width="32" height="32" fill="none" stroke="var(--specimen-warm)" strokeWidth="1" /><text x={stock.position.x * 36 + 3} y={stock.position.y * 36 + 33} fontSize="9" fill="var(--specimen-warm)">M{state.construction?.stocks.find(item => item.id === stock.id)?.units.length ?? 0}</text></g>)}
    {state.construction?.assemblies.map(assembly => {
      const blueprint = world.construction?.blueprints.find(item => item.id === assembly.blueprint);
      if (!blueprint) return null;
      const position = blueprint.body.cell.position;
      return <g key={`assembly-${assembly.blueprint}`} data-kind="assembly" data-blueprint={assembly.blueprint}><rect x={position.x * 36 + 3} y={position.y * 36 + 3} width="30" height="30" fill="var(--surface)" stroke="var(--specimen-warm)" strokeWidth="2" strokeDasharray="4 3" />{label(position, `A${blueprint.body.cell.id}`, "var(--specimen-warm)")}</g>;
    })}
    {state.cells.map(cell => <g key={cell.id} data-kind={births.some(birth => birth.body.cell.id === cell.id) ? "born-cell" : "cell"} data-cell={cell.id}><circle {...{ cx: center(cell.position).x, cy: center(cell.position).y }} r="11" fill={cell.cargo || cell.material !== undefined ? "var(--specimen-warm)" : "var(--specimen-ink)"} stroke="var(--surface)" strokeWidth="2" />{label(cell.position, String(cell.id), cell.cargo || cell.material !== undefined ? "var(--specimen-warm-on)" : "var(--specimen-ink-on)")}</g>)}
  </svg>;
}
