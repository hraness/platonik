"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { thresholdMap, trajectory, type RuleId, type Schedule, type TruthPair } from "@/lib/observatory/truth";

export function TruthGarden() {
  const [rule, setRule] = useState<RuleId>("squared");
  const [schedule, setSchedule] = useState<Schedule>("simultaneous");
  const [seed, setSeed] = useState<TruthPair>([.25, .25]);
  const [center, setCenter] = useState<TruthPair>([.5, .5]);
  const [zoom, setZoom] = useState(1);
  const [iterations, setIterations] = useState(96);
  const [radius, setRadius] = useState(.8);
  const [view, setView] = useState<"map" | "path">("map");
  const ref = useRef<HTMLCanvasElement>(null);
  const map = useMemo(() => thresholdMap({ rule, schedule, iterations, radius, size: 192, center, zoom }), [rule, schedule, iterations, radius, center, zoom]);
  const path = useMemo(() => trajectory(seed, rule, schedule, iterations), [seed, rule, schedule, iterations]);
  const repeatedAt = useMemo(() => {
    const seen = new Set<string>();
    for (let i = 0; i < path.length; i++) { const key = path[i].join(":"); if (seen.has(key)) return i; seen.add(key); }
    return null;
  }, [path]);
  useEffect(() => {
    const canvas = ref.current, context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.width = map.size; canvas.height = map.size;
    const pixels = context.createImageData(map.size, map.size);
    for (let i = 0; i < map.counts.length; i++) {
      const count = map.counts[i];
      const t = count ? Math.log1p(count) / Math.log1p(iterations) : 0;
      pixels.data[i * 4] = count ? 42 + 155 * t : 249;
      pixels.data[i * 4 + 1] = count ? 71 + 87 * t : 249;
      pixels.data[i * 4 + 2] = count ? 54 + 50 * t : 246;
      pixels.data[i * 4 + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
  }, [map, iterations, view]);
  const { xMin, xMax, yMin, yMax } = map.domain;
  const px = (seed[0] - xMin) / (xMax - xMin) * 100;
  const py = (yMax - seed[1]) / (yMax - yMin) * 100;
  const crossed = map.counts.reduce((sum, value) => sum + Number(value > 0), 0);
  function chooseAt(event: React.MouseEvent<HTMLButtonElement>) {
    if (event.detail === 0) { setSeed([(xMin + xMax) / 2, (yMin + yMax) / 2]); return; }
    const bounds = event.currentTarget.getBoundingClientRect();
    const fractionX = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const fractionY = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    setSeed([xMin + fractionX * (xMax - xMin), yMax - fractionY * (yMax - yMin)]);
  }
  return <>
    <div className="lab-panel-intro"><h2>A landscape made of almost true.</h2><p>Two statements revise their truth values in response to one another. Choose a starting point. Change a rule. Explore the different patterns those decisions produce.</p></div>
    <div className="specimen-bench truth-bench">
      <div>
        <div className="specimen-toolbar"><span>{view === "map" ? `Truth square · ${zoom}×` : `${iterations} revisions`}</span><div className="lab-view-switch"><button aria-pressed={view === "map"} onClick={() => setView("map")}>Landscape</button><button aria-pressed={view === "path"} onClick={() => setView("path")}>Trajectory</button></div></div>
        {view === "map" ? <div className="truth-map-wrap"><button className="truth-map" onClick={chooseAt} aria-label="Choose a seed by clicking the map; keyboard activation chooses its center. Use the x and y sliders for precise control." aria-describedby="truth-map-summary"><canvas ref={ref} role="img" aria-label={`First threshold-crossing map: ${crossed} of ${map.size * map.size} sampled seeds crossed radius ${radius} within ${iterations} revisions. Horizontal axis x ${xMin.toFixed(3)} to ${xMax.toFixed(3)}, vertical axis y ${yMin.toFixed(3)} to ${yMax.toFixed(3)}.`} />{px >= 0 && px <= 100 && py >= 0 && py <= 100 && <span className="truth-cursor" style={{ left: `${px}%`, top: `${py}%` }} aria-hidden="true" />}</button><div className="truth-axis"><span>x {xMin.toFixed(3)}</span><span>{xMax.toFixed(3)}</span></div></div> : <svg className="truth-trajectory" viewBox="0 0 400 400" role="img" aria-label={`Trajectory of ${iterations} revisions from x ${seed[0].toFixed(4)}, y ${seed[1].toFixed(4)}. Both axes run from 0 to 1.`}><rect width="400" height="400" fill="#edf0e9" /><polyline points={path.map(([x, y]) => `${12 + x * 376},${388 - y * 376}`).join(" ")} fill="none" stroke="#304f3d" strokeWidth="1" opacity=".55" /><circle cx={12 + seed[0] * 376} cy={388 - seed[1] * 376} r="5" fill="#805d2d" /><circle cx={12 + path.at(-1)![0] * 376} cy={388 - path.at(-1)![1] * 376} r="4" fill="#304f3d" /></svg>}
        {view === "map" && <p id="truth-map-summary" className="lab-note">{crossed.toLocaleString("en-US")} of {(map.size * map.size).toLocaleString("en-US")} sampled seeds crossed within {iterations} updates. The visible y range is {yMin.toFixed(3)}–{yMax.toFixed(3)}, increasing upward.</p>}
        <p className="lab-note">{view === "map" ? "Each pixel starts a separate experiment. Dark green crosses the threshold sooner; ochre crosses later. Paper-colored points have not crossed within the cap. Click to choose a seed; use Zoom here to inspect a smaller region." : "The ochre dot is the initial pair; the green dot is the final pair. Lines join successive revisions in the full [0, 1] truth square. They are a trajectory, not an organism’s path through a world."}</p>
      </div>
      <div className="lab-controls">
        <div className="lab-field"><label htmlFor="truth-rule">Coupled truth rules</label><select id="truth-rule" value={rule} onChange={event => setRule(event.target.value as RuleId)}><option value="squared">Grim’s second pair</option><option value="dualist">Grim’s first pair</option></select></div>
        <div className="truth-equations">{rule === "squared" ? <><p>x′ = (x − y)²</p><p>y′ = √|y − (1 − {schedule === "simultaneous" ? "x" : "x′"})|</p></> : <><p>x′ = 1 − |x − y|</p><p>y′ = 1 − |y − (1 − {schedule === "simultaneous" ? "x" : "x′"})²|</p></>}</div>
        <div className="lab-field"><label htmlFor="truth-schedule">Update order</label><select id="truth-schedule" value={schedule} onChange={event => setSchedule(event.target.value as Schedule)}><option value="simultaneous">Together · both use the old pair</option><option value="sequential">In sequence · y uses the new x</option></select></div>
        <div className="lab-field"><label htmlFor="truth-x">Starting x · {seed[0].toFixed(4)}</label><input id="truth-x" type="range" min="0" max="1" step="0.0001" value={seed[0]} onChange={event => setSeed([Number(event.target.value), seed[1]])} /></div>
        <div className="lab-field"><label htmlFor="truth-y">Starting y · {seed[1].toFixed(4)}</label><input id="truth-y" type="range" min="0" max="1" step="0.0001" value={seed[1]} onChange={event => setSeed([seed[0], Number(event.target.value)])} /></div>
        <div className="lab-actions"><button className="lab-button" disabled={zoom >= 16} onClick={() => { setCenter(seed); setZoom(value => Math.min(16, value * 2)); setView("map"); }}>Zoom here</button><button className="lab-button secondary" disabled={zoom === 1} onClick={() => { setCenter([.5, .5]); setZoom(1); }}>Whole square</button></div>
        <div className="lab-field"><label htmlFor="truth-radius">Threshold radius · {radius.toFixed(2)}</label><input id="truth-radius" type="range" min="0.1" max="1.4" step="0.01" value={radius} onChange={event => setRadius(Number(event.target.value))} /></div>
        <div className="lab-field"><label htmlFor="truth-iterations">Revision cap</label><select id="truth-iterations" value={iterations} onChange={event => setIterations(Number(event.target.value))}><option value="32">32 revisions</option><option value="96">96 revisions</option><option value="192">192 revisions</option></select></div>
      </div>
    </div>
    <div className="lab-two-column lab-secondary">
      <section><h2>Follow one starting point.</h2><div className="table-scroll" tabIndex={0} role="region" aria-label="First five truth revisions"><table className="lab-table"><thead><tr><th>Revision</th><th>x</th><th>y</th></tr></thead><tbody>{path.slice(0, 6).map(([x, y], i) => <tr key={i}><td>{i}</td><td>{x.toFixed(6)}</td><td>{y.toFixed(6)}</td></tr>)}</tbody></table></div><p className="lab-note">{repeatedAt === null ? "No exact pair repeated in this finite trajectory. This does not establish aperiodicity." : `An exact floating-point pair repeats at revision ${repeatedAt}.`}</p></section>
      <section><h2>A useful kind of strangeness?</h2><p>These patterns suggest future habitats where timing and analog signals matter. A player could search for a stable memory or a reliable switch, then test it against disturbances. An intricate picture alone has solved no task.</p><p className="lab-note">Two systems from <a href="https://www.pgrim.org/articles/self-referenceandchaosinfuzzylogic.pdf">Patrick Grim’s 1993 paper</a>, cited in <a href="https://doi.org/10.3390/philosophies11050161">Levin’s Ingressing Minds</a>. Truth degree is not probability. This prototype uses JavaScript Float64, no added noise, a 192 × 192 sample grid, and a finite cap. Crossing means x² + y² &gt; radius² after an update; it is not escape to infinity or proof of an infinite fractal.</p></section>
    </div>
  </>;
}
