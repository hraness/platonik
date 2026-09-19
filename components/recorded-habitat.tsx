import type { Frame, Point, Receipt } from "@/lib/bridge/types";

export function RecordedHabitat({
  receipt,
  frame,
  selectedCell,
  onSelectCell,
  names,
}: {
  receipt: Receipt;
  frame: Frame;
  selectedCell?: number;
  onSelectCell?: (cell: number) => void;
  names?: Record<string, string>;
}) {
  const world = receipt.experiment, state = frame.state;
  const births = state.construction?.births ?? [];
  const links = [...world.links, ...births.flatMap(birth => birth.body.links)];
  const constructedLinks = new Set(births.flatMap(birth => birth.body.links.map(link => link.id)));
  const center = (point: Point) => ({ x: point.x * 36 + 18, y: point.y * 36 + 18 });
  const label = (point: Point, text: string, fill = "var(--specimen-ink)") => <text x={center(point).x} y={center(point).y + 5} textAnchor="middle" fontSize="13" fontWeight="600" fill={fill}>{text}</text>;
  return <svg className="bridge-map" viewBox={`0 0 ${world.width * 36} ${world.height * 36}`} role="img" aria-label={`Recorded habitat at tick ${frame.tick}. ${state.delivered.length} sparks delivered to beacons. S: source, D: depot, V: valve, B: beacon, numbered circles: cells. Exact memory and service values follow below.`}>
    <defs>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
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
    {(state.facilities ?? []).map(facility => {
      const glyph = facility.kind === "fabricator" ? "F" : facility.kind === "miner" ? "D" : facility.kind === "assembler" ? "A" : facility.kind === "crane" ? "C" : "W";
      const c = center(facility.position);
      const fill = facility.ready ? "var(--specimen-ink)" : "var(--surface)";
      const held = facility.materials.length + facility.sparks.length + facility.parts.length + (facility.frames?.length ?? 0);
      const neededFrame = facility.needed_frame ?? 0;
      const name = names?.[String(facility.id)];
      return <g key={`facility-${facility.id}`} data-kind={facility.ready ? "facility" : "facility-site"} data-facility={facility.id}>
        <rect x={facility.position.x * 36 + 2} y={facility.position.y * 36 + 2} width="32" height="32" fill={fill} stroke="var(--specimen-ink)" strokeWidth="2" strokeDasharray={facility.ready ? undefined : "4 3"} />
        <text x={c.x} y={c.y + 5} textAnchor="middle" fontSize="13" fontWeight="600" fill={facility.ready ? "var(--specimen-ink-on)" : "var(--specimen-ink)"}>{glyph}</text>
        {held > 0 && <text x={c.x + 13} y={c.y - 11} textAnchor="middle" fontSize="9" fill="var(--specimen-warm)">{held}</text>}
        {!facility.ready && <text x={c.x} y={c.y + 16} textAnchor="middle" fontSize="8" fill="var(--specimen-warm)">{facility.needed_material}m {facility.needed_part}p{neededFrame > 0 ? ` ${neededFrame}f` : ""}</text>}
        {name && <text x={c.x} y={c.y + 24} textAnchor="middle" fontSize="8" fill="var(--specimen-ink)">{name}</text>}
      </g>;
    })}
    {state.cells.map(cell => {
      const active = frame.activations?.find(a => a.cell === cell.id);
      const born = births.some(birth => birth.body.cell.id === cell.id);
      const selected = selectedCell === cell.id;
      const stroke = selected ? "var(--focus)" : active ? (active.success ? "var(--accent)" : "var(--danger)") : "var(--surface)";
      const strokeWidth = selected || active ? 3 : 2;
      const select = () => onSelectCell?.(cell.id);
      const carrying = cell.cargo != null || cell.material !== undefined || cell.part !== undefined || cell.frame !== undefined;
      return <g key={cell.id} filter={active ? "url(#glow)" : undefined} data-kind={born ? "born-cell" : active ? (active.success ? "active-cell" : "failed-cell") : "cell"} data-cell={cell.id} role={onSelectCell ? "button" : undefined} tabIndex={onSelectCell ? 0 : undefined} aria-label={onSelectCell ? `Inspect cell ${cell.id}` : undefined} aria-pressed={onSelectCell ? selected : undefined} onClick={select} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } }}><circle {...{ cx: center(cell.position).x, cy: center(cell.position).y }} r={selected ? 13 : 11} fill={carrying ? "var(--specimen-warm)" : "var(--specimen-ink)"} stroke={stroke} strokeWidth={strokeWidth} />{cell.part !== undefined && <rect x={center(cell.position).x + 6} y={center(cell.position).y - 15} width="7" height="7" fill="var(--accent)" transform={`rotate(45 ${center(cell.position).x + 9.5} ${center(cell.position).y - 11.5})`} />}{cell.frame !== undefined && <rect x={center(cell.position).x - 13} y={center(cell.position).y - 15} width="8" height="8" fill="none" stroke="var(--accent)" strokeWidth="2" />}{label(cell.position, String(cell.id), carrying ? "var(--specimen-warm-on)" : "var(--specimen-ink-on)")}</g>;
    })}
  </svg>;
}
