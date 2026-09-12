import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { isContinuityReceipt, type ContinuityIndex } from "../bridge/continuity";
import { arkAt, isArkGrade, type ArkGrade } from "../bridge/ark";

function projection() {
  // Synthetic grade tests display admission and timing only. It does not claim
  // that this construction receipt performed arithmetic or earned ark control.
  const receipt = JSON.parse(readFileSync("public/construction/keeper-born.receipt.json", "utf8"));
  const grade: ArkGrade = {
    schema: "platonik-ark-control-v1", experiment_hash: receipt.experiment_hash,
    evidence_hash: `sha256:${"a".repeat(64)}`, result_hash: receipt.result_hash,
    tick: 128, horizon: 128, phase: "complete", plan: "carry", declared_a: 9, declared_b: 7,
    expected_sum: 16, observed_sum: 16,
    outputs: [false, false, false, false, true].map((bit, index) => ({ index, bit, tick: 10 + index * 7, signal: 20 + index })),
    arithmetic_passed: true, selected: { index: 4, tick: 43, bit: true, signal: 30 },
    retained: true, decision: { tick: 52, bit: true, delivered: true }, service_passed: true, control_passed: true,
  };
  return { receipt, grade };
}

describe("recorded ark display", () => {
  test("shows reached output, consumption and decision events without an early final verdict", () => {
    const { receipt, grade } = projection();
    expect(isArkGrade(grade, receipt)).toBe(true);
    expect(arkAt(grade, 0)).toEqual({ outputs: [], selected: null, decision: null, final: false });
    expect(arkAt(grade, 9).outputs).toHaveLength(0);
    expect(arkAt(grade, 10).outputs).toEqual([grade.outputs[0]]);
    expect(arkAt(grade, 38).outputs).toEqual(grade.outputs);
    expect(arkAt(grade, 42).selected).toBeNull();
    expect(arkAt(grade, 43).selected).toEqual(grade.selected);
    expect(arkAt(grade, 51).decision).toBeNull();
    expect(arkAt(grade, 52).decision).toEqual(grade.decision);
    expect(arkAt(grade, 127).final).toBe(false);
    expect(arkAt(grade, 128).final).toBe(true);
  });

  test("rejects mismatched identities and malformed bounded display fields", () => {
    const corruptions = [
      { experiment_hash: `sha256:${"b".repeat(64)}` }, { result_hash: null }, { evidence_hash: "bad" },
      { schema: "next" }, { tick: 127 }, { horizon: 129 }, { phase: { toString: null } }, { plan: { toString: null } },
      { declared_a: 16 }, { declared_b: -1 }, { expected_sum: 31 }, { observed_sum: 32 },
      { outputs: [] }, { observed_sum: null }, { service_passed: false }, { control_passed: "yes" },
      { selected: null }, { retained: false }, { decision: null }, { extra: true },
    ];
    for (const corrupt of corruptions) {
      const { receipt, grade } = projection();
      expect(isArkGrade({ ...grade, ...corrupt }, receipt)).toBe(false);
    }
    for (const corrupt of [{ index: 1 }, { index: 128 }, { tick: 129 }, { bit: 1 }, { signal: 2 ** 53 }, { extra: true }]) {
      const { receipt, grade } = projection();
      expect(isArkGrade({ ...grade, outputs: [{ ...grade.outputs[0], ...corrupt }, ...grade.outputs.slice(1)] }, receipt)).toBe(false);
    }
    const { receipt, grade } = projection();
    expect(isArkGrade({ ...grade, selected: { ...grade.selected, index: 0 } }, receipt)).toBe(false);
    expect(isArkGrade({ ...grade, decision: { ...grade.decision, tick: 129 } }, receipt)).toBe(false);
    expect(isArkGrade({ ...grade, decision: { ...grade.decision, delivered: "yes" } }, receipt)).toBe(false);
  });

  test("keeps honest failed arithmetic even when physical service passed", () => {
    const { receipt, grade } = projection();
    Object.assign(grade, { arithmetic_passed: false, control_passed: false, phase: "failed", observed_sum: 31 });
    grade.outputs = grade.outputs.map(output => ({ ...output, bit: true }));
    expect(isArkGrade(grade, receipt)).toBe(true);
    // Extras are visible failures, not malformed records or an invented cap of five.
    grade.outputs = Array.from({ length: 128 }, (_, index) => ({ index, bit: true, tick: index, signal: index }));
    grade.observed_sum = null;
    expect(isArkGrade(grade, receipt)).toBe(true);
    expect(arkAt(grade, 127).outputs).toHaveLength(128);
    expect(isArkGrade({ ...grade, outputs: [...grade.outputs, { index: 128, bit: true, tick: 128, signal: 128 }] }, receipt)).toBe(false);
    expect(isArkGrade({ ...grade, service_passed: false }, receipt)).toBe(false);
  });

  test("binds a failed final partial tick rather than the completed tick counter", () => {
    const { receipt, grade } = projection();
    receipt.result.frames = receipt.result.frames.slice(0, 10);
    receipt.result.frames[9].complete = false;
    receipt.result.ticks_completed = 8;
    receipt.result.status = "fuel_exhausted";
    receipt.result.outcome.passed = false;
    Object.assign(grade, { tick: 9, phase: "failed", outputs: [], observed_sum: null, arithmetic_passed: false, selected: null, retained: false, decision: null, service_passed: false, control_passed: false });
    expect(isArkGrade(grade, receipt)).toBe(true);
    expect(isArkGrade({ ...grade, tick: 8 }, receipt)).toBe(false);
    expect(arkAt(grade, 8).final).toBe(false);
    expect(arkAt(grade, 9).final).toBe(true);
  });

  test("admits every published ark grade with its exact recorded receipt", () => {
    const index = JSON.parse(readFileSync("public/ark/index.json", "utf8")) as ContinuityIndex;
    expect(index.cases).toHaveLength(4);
    for (const item of index.cases) {
      const receipt = JSON.parse(readFileSync(`public/ark/${item.id}.receipt.json`, "utf8"));
      expect(isContinuityReceipt(receipt)).toBe(true);
      expect(isArkGrade(item.ark, receipt)).toBe(true);
      expect(item.result_hash).toBe(receipt.result_hash);
    }
  });
});
