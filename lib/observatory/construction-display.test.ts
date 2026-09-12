import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { isContinuityReceipt } from "../bridge/continuity";

// Synthetic display records exercise malformed-input handling only. Real
// execution and conservation belong to the Rust checker and published records.
function projection() {
  const value = JSON.parse(readFileSync("public/habitat/remember-both.receipt.json", "utf8"));
  const body = {
    cell: { id: 9, position: { x: 2, y: 3 }, heading: "north", mobile: false, memory: [0, 0, 0, 0], program: { rules: [{ when: [], action: { kind: "wait" }, remember: null }] } },
    links: [{ id: 80, from: { kind: "cell", id: 2, port: 0 }, to_cell: 9, to_port: 0, delay: 1, enabled: true }],
  };
  value.protocol = "platonik-habitat-v3";
  value.result.protocol = "platonik-habitat-v3";
  value.experiment.version = 3;
  value.experiment.construction = { stocks: [{ id: 60, position: { x: 2, y: 4 }, units: [1001] }], blueprints: [{ id: 50, body }] };
  for (const state of [...value.result.frames.map((frame: { state: unknown }) => frame.state), value.result.final_state])
    state.construction = { stocks: [{ id: 60, units: [] }], assemblies: [], births: [] };
  value.result.frames[5].state.cells[0].material = 1001;
  value.result.frames[9].state.construction.assemblies = [{ blueprint: 50, parent: 1, material: 1001, copied: [123, 34], wired: [body.links[0]] }];
  value.result.final_state.construction.births = [{ blueprint: 50, parent: 1, material: 1001, tick: 20, body }];
  value.result.costs.copying = 2;
  value.result.costs.construction = 1;
  return value;
}

describe("construction replay display admission", () => {
  test("accepts bounded v3 stock, held material, copied bytes, inactive wiring and birth records", () => {
    expect(isContinuityReceipt(projection())).toBe(true);
  });

  test("rejects malformed body, link, program and copied-byte fields before rendering", () => {
    const corruptions = [
      (value: ReturnType<typeof projection>) => { value.experiment.construction.blueprints[0].body.cell = null; },
      (value: ReturnType<typeof projection>) => { value.experiment.construction.blueprints[0].body.links[0].from = null; },
      (value: ReturnType<typeof projection>) => { value.experiment.construction.blueprints[0].body.links[0].delay = 17; },
      (value: ReturnType<typeof projection>) => { value.experiment.construction.blueprints[0].body.cell.program.rules[0].action.kind = { toString: null }; },
      (value: ReturnType<typeof projection>) => { value.experiment.construction.blueprints[0].body.cell.program.rules[0].unexpected = true; },
      (value: ReturnType<typeof projection>) => { value.result.frames[9].state.construction.assemblies[0].copied[0] = 256; },
      (value: ReturnType<typeof projection>) => { value.result.frames[9].state.construction.assemblies[0].wired[0].to_port = 4; },
      (value: ReturnType<typeof projection>) => { value.result.frames[9].state.construction.assemblies[0].free_material = 1; },
      (value: ReturnType<typeof projection>) => { value.result.final_state.construction.births[0].body.cell.memory = [0, 0, 0]; },
      (value: ReturnType<typeof projection>) => { value.result.final_state.construction.births[0].tick = 129; },
      (value: ReturnType<typeof projection>) => { value.result.frames[5].state.cells[0].material = -1; },
      (value: ReturnType<typeof projection>) => { value.result.frames[5].state.construction = null; },
      (value: ReturnType<typeof projection>) => { value.result.costs.copying = Infinity; },
      (value: ReturnType<typeof projection>) => { value.protocol = { toString: null }; },
      (value: ReturnType<typeof projection>) => { value.result.protocol = "platonik-habitat-v2"; },
      (value: ReturnType<typeof projection>) => { value.experiment.version = 2; },
      (value: ReturnType<typeof projection>) => { delete value.experiment.construction; },
    ];
    for (const corrupt of corruptions) {
      const value = projection(); corrupt(value);
      expect(isContinuityReceipt(value)).toBe(false);
    }
  });

  test("bounds material catalogs, assembly arrays and full copied payloads", () => {
    const tooMany = projection();
    tooMany.experiment.construction.stocks[0].units = Array(33).fill(1);
    expect(isContinuityReceipt(tooMany)).toBe(false);
    const tooLarge = projection();
    tooLarge.result.frames[9].state.construction.assemblies[0].copied = Array(4097).fill(0);
    expect(isContinuityReceipt(tooLarge)).toBe(false);
    const tooManyBirths = projection();
    tooManyBirths.result.final_state.construction.births = Array(5).fill(tooManyBirths.result.final_state.construction.births[0]);
    expect(isContinuityReceipt(tooManyBirths)).toBe(false);
  });

  test("does not permit construction fields or new cost categories in a v2 record", () => {
    const wrongProtocol = projection(); wrongProtocol.protocol = "platonik-habitat-v2";
    expect(isContinuityReceipt(wrongProtocol)).toBe(false);
    const legacy = JSON.parse(readFileSync("public/habitat/remember-both.receipt.json", "utf8"));
    legacy.result.costs.copying = 0;
    expect(isContinuityReceipt(legacy)).toBe(false);
  });

  test("shape admission does not claim valid copied bytes, conservation or execution", () => {
    const forged = projection();
    forged.result.frames[9].state.construction.assemblies[0].copied[0] = 0;
    expect(isContinuityReceipt(forged)).toBe(true);
  });
});
