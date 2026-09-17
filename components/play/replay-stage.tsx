"use client";

import { useMemo } from "react";
import { RecordedHabitat } from "@/components/recorded-habitat";
import type { Receipt } from "@/lib/bridge/types";
import { useReplay } from "@/lib/play/use-replay";

const number = (value: number) => value.toLocaleString("en-US");
const work = (costs: Record<string, number>) =>
  Object.values(costs).reduce((sum, value) => sum + value, 0);

/**
 * Animated replay of a run receipt: the habitat map plus play/pause/step/
 * scrub/speed controls and the per-tick event readout.
 */
export function ReplayStage({ receipt }: { receipt: Receipt }) {
  const frames = receipt.result.frames;
  const { at, setAt, playing, play, stop, speed, setSpeed } = useReplay(frames.length);
  const frame = frames[Math.min(at, frames.length - 1)];

  const activity = useMemo(() => {
    if (!frame) return [];
    const lines: string[] = [];
    for (const activation of frame.activations ?? []) {
      lines.push(
        `cell ${activation.cell}: ${describeAction(activation.action)}${activation.success ? "" : ` — failed (${activation.error ?? "?"})`}`
      );
    }
    for (const signal of frame.signals ?? []) {
      lines.push(`signal ${signal.signal.id}: ${signal.outcome} (link ${signal.signal.link})`);
    }
    for (const event of frame.events ?? []) {
      lines.push(describeEvent(event));
    }
    return lines;
  }, [frame]);

  if (!frame) return null;

  return (
    <div className="replay-stage">
      <figure className="replay-map">
        <RecordedHabitat receipt={receipt} frame={frame} />
        <figcaption>
          S source · D depot · V valve · B beacon · M material · A assembly · numbered circle is a
          cell — amber when carrying.
        </figcaption>
      </figure>
      <div className="replay-controls">
        <button
          className="lab-button primary"
          type="button"
          onClick={playing ? stop : play}
          aria-label={playing ? "Pause replay" : "Play replay"}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          className="lab-button secondary"
          type="button"
          disabled={at === 0}
          onClick={() => setAt((v: number) => v - 1)}
        >
          Prev
        </button>
        <button
          className="lab-button secondary"
          type="button"
          disabled={at >= frames.length - 1}
          onClick={() => setAt((v: number) => v + 1)}
        >
          Next
        </button>
        <button className="lab-text-button" type="button" onClick={() => setAt(frames.length - 1)}>
          End
        </button>
        <label className="replay-speed">
          Speed
          <select
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
            aria-label="Replay speed"
          >
            <option value={2}>½×</option>
            <option value={4}>1×</option>
            <option value={8}>2×</option>
            <option value={16}>4×</option>
            <option value={32}>8×</option>
          </select>
        </label>
      </div>
      <input
        className="replay-scrub"
        type="range"
        min={0}
        max={frames.length - 1}
        value={at}
        onChange={(event) => setAt(Number(event.target.value))}
        aria-label="Scrub replay"
      />
      <div className="replay-status">
        <span>
          Tick <strong>{frame.tick}</strong> / {frames.length - 1}
          {!frame.complete ? " · incomplete" : ""}
        </span>
        <span>
          {receipt.result.ticks_completed} ticks run · {number(work(receipt.result.costs))} modeled
          work
        </span>
      </div>
      {activity.length > 0 && (
        <ul className="replay-activity" aria-label="Events this tick">
          {activity.slice(0, 8).map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function describeAction(action: Record<string, unknown>): string {
  const kind = String(action.kind ?? "?");
  const extras = Object.entries(action)
    .filter(([key]) => key !== "kind")
    .map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : value}`)
    .join(" ");
  return extras ? `${kind} ${extras}` : kind;
}

function describeEvent(event: Record<string, unknown>): string {
  const kind = String(event.kind ?? "event");
  switch (kind) {
    case "edge_blocked":
      return `edge ${JSON.stringify(event.edge)} ${event.blocked ? "blocked" : "opened"}`;
    case "link_enabled":
      return `link ${event.id} ${event.enabled ? "enabled" : "disabled"}`;
    case "valve_enabled":
      return `valve ${event.id} ${event.enabled ? "enabled" : "disabled"}`;
    case "clear_memory":
      return `cell ${event.cell} memory cleared`;
    default:
      return kind;
  }
}
