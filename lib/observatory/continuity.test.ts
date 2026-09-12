import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isContinuityReceipt } from "../bridge/continuity";

const receipt = () => JSON.parse(readFileSync("public/habitat/remember-both.receipt.json", "utf8"));

describe("recorded habitat display admission", () => {
  test("accepts every published continuous and navigation receipt, including failed missions", () => {
    let count = 0;
    for (const directory of ["public/habitat", "public/navigation", "public/construction", "public/answer"]) {
      if (!existsSync(directory)) continue;
      for (const file of readdirSync(directory).filter(name => name.endsWith(".receipt.json"))) {
        expect(isContinuityReceipt(JSON.parse(readFileSync(`${directory}/${file}`, "utf8")))).toBe(true);
        count++;
      }
    }
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test("rejects valid JSON whose later frame would crash replay rendering", () => {
    const malformed = receipt();
    malformed.result.frames[7] = {};
    // The claimed hash remains intact: shape admission must happen before render.
    expect(isContinuityReceipt(JSON.parse(JSON.stringify(malformed)))).toBe(false);
  });

  test("rejects malformed nested fields used by the map, carried-state list and work total", () => {
    const malformed = [
      (value: ReturnType<typeof receipt>) => { value.experiment.links[0].from = null; },
      (value: ReturnType<typeof receipt>) => { value.experiment.cells[0].heading = { toString: null }; },
      (value: ReturnType<typeof receipt>) => { value.result.frames[9].state.cells[0].position = {}; },
      (value: ReturnType<typeof receipt>) => { value.result.frames[9].state.cells[0].memory = null; },
      (value: ReturnType<typeof receipt>) => { value.result.frames[9].state.cells[0].evidence = [null, {}, null, null]; },
      (value: ReturnType<typeof receipt>) => { value.result.frames[9].state.pending = [null]; },
      (value: ReturnType<typeof receipt>) => { value.result.frames[9].state.sources[0].sparks = null; },
      (value: ReturnType<typeof receipt>) => { value.result.frames[9].state.closed_edges = [{ a: null, b: null }]; },
      (value: ReturnType<typeof receipt>) => { value.result.frames[9].costs.actions = "bad"; },
      (value: ReturnType<typeof receipt>) => { value.result.final_state.cells = null; },
    ];
    for (const corrupt of malformed) {
      const value = receipt(); corrupt(value);
      expect(isContinuityReceipt(value)).toBe(false);
    }
  });

  test("bounds rendered collections and rejects non-finite or out-of-range displayed numbers", () => {
    const oversized = receipt();
    oversized.result.frames[0].state.cells = Array(17).fill(oversized.result.frames[0].state.cells[0]);
    expect(isContinuityReceipt(oversized)).toBe(false);
    const longTrace = receipt();
    longTrace.result.frames = Array(130).fill(longTrace.result.frames[0]);
    expect(isContinuityReceipt(longTrace)).toBe(false);
    const invalidNumbers = receipt(); invalidNumbers.result.frames[0].costs.actions = Infinity;
    expect(isContinuityReceipt(invalidNumbers)).toBe(false);
    const wrongRegisters = receipt(); wrongRegisters.result.frames[0].state.cells[0].memory.push(0);
    expect(isContinuityReceipt(wrongRegisters)).toBe(false);
    const wrongGrid = receipt(); wrongGrid.experiment.width = 33;
    expect(isContinuityReceipt(wrongGrid)).toBe(false);
  });

  test("does not mistake display shape for simulation or hash verification", () => {
    const forged = receipt();
    forged.result.frames[9].state.cells[0].memory[0] = 255;
    expect(isContinuityReceipt(forged)).toBe(true);
  });
});
