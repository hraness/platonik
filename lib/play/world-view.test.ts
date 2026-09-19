import { describe, expect, test } from "bun:test";
import type { Frame, State } from "../bridge/types";
import type { FacilityDiagnostic, WorldReport } from "./engine";
import { worldViews } from "./world-view";

const state: State = {
  tick: 12, cells: [], sources: [], depots: [], beacons: [], valves: [],
  links: [], pending: [], delivered: [], facilities: [],
};
const frame: Frame = { tick: 12, complete: true, state, costs: {}, events: [], signals: [], activations: [] };
const diagnostic: FacilityDiagnostic = {
  id: 93, status: "construction", remaining_ticks: 0,
  missing_inputs: [{ item: "material", quantity: 4 }, { item: "part", quantity: 2 }],
  recipe: null, transfer: null,
};
function report(current = state): WorldReport {
  return {
    tick: 12, state: current, costs: {}, recent_frames: [frame],
    industry: [], industry_frames: [{ tick: 12, facilities: [] }],
  } as unknown as WorldReport;
}

describe("world revision display", () => {
  test("an admitted site is visible before time advances without rewriting replay", () => {
    const current: State = { ...state, facilities: [{
      id: 93, kind: "assembler", position: { x: 0, y: 6 }, ready: false,
      needed_material: 4, needed_part: 2, needed_frame: 0, materials: [], sparks: [],
      parts: [], frames: [], spent_materials: [], spent_sparks: [], spent_parts: [],
      progress: 0, minted: 0,
    }] };
    const input = { ...report(current), industry: [diagnostic] };
    const original = JSON.stringify(input);
    const views = worldViews(input);
    expect(views).toHaveLength(2);
    expect(views[0].frame.state.facilities).toEqual([]);
    expect(views[0].current).toBe(false);
    expect(views[1].frame.tick).toBe(12);
    expect(views[1].frame.state.facilities?.[0].id).toBe(93);
    expect(views[1].industry).toEqual([diagnostic]);
    expect(views[1].frame.activations).toEqual([]);
    expect(views[1].current).toBe(true);
    expect(JSON.stringify(input)).toBe(original);
  });

  test("an ordinary advance keeps its final recorded activity and avoids a duplicate tick", () => {
    const input = report(structuredClone(state));
    const views = worldViews(input);
    expect(views).toHaveLength(1);
    expect(views[0].current).toBe(true);
    expect(views[0].frame).toBe(frame);
  });
});
