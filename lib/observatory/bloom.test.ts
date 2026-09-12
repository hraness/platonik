import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { bloomAt, isBloomGrade, type BloomGrade } from "../bridge/bloom";
import { isContinuityReceipt, type ContinuityIndex } from "../bridge/continuity";

const digest = (value: string) => `sha256:${value.repeat(64)}`;
function projection() {
  // Synthetic metadata tests display admission and event visibility, not Rust semantics.
  const receipt = JSON.parse(readFileSync("public/construction/keeper-born.receipt.json", "utf8"));
  receipt.protocol = receipt.result.protocol = "platonik-habitat-v4";
  receipt.experiment.version = 4;
  const grade: BloomGrade = {
    schema: "platonik-bloom-v1", experiment_hash: receipt.experiment_hash,
    evidence_hash: digest("a"), result_hash: receipt.result_hash,
    tick: 128, horizon: 128, phase: "bloomed",
    candidates: [0, 1].map(id => ({
      id, builder: id + 1, child: id + 3, blueprint: id + 50, source: id + 10, depot: id + 20,
      trial_parcel: id * 100 + 100, confirmation_parcel: id * 100 + 101,
      seed_program_hash: digest("b"), program_hash: digest(id ? "c" : "d"),
      edits: [{ tick: 8 + id, actor: id + 1, rule: 0, slot: 1, value: id + 1,
        before_hash: digest("e"), after_hash: digest("f"), bytes_written: 2048 }],
      born: 12 + id, trial_pickup: 14 + id, trial_departed: 16 + id,
      trial_returned: 21 + id, trial_accepted: 20 + id, trial_serviced: 22 + id,
      confirmation_requested: id ? null : 97, confirmation_pickup: id ? null : 98,
      confirmation_accepted: id ? null : 104, confirmation_serviced: id ? null : 106,
      changed: true, family_passed: true, trial_passed: true, confirmation_passed: !id,
    })),
    selection: { tick: 24, candidate: 0, child: 3, signal: 100, parcel: 100 },
    generated_passed: true, trials_passed: true, selection_passed: true,
    confirmation_passed: true, service_passed: true, bloomed: true,
  };
  return { receipt, grade };
}

describe("recorded Bloom display", () => {
  test("reveals edits, birth, physical moments and selection only when reached", () => {
    const { receipt, grade } = projection();
    expect(isBloomGrade(grade, receipt)).toBe(true);
    const initial = bloomAt(grade, 0);
    expect(initial.final).toBe(false);
    expect(initial.selection).toBeNull();
    for (const item of grade.candidates) {
      expect(initial.candidates[item.id].edits).toEqual([]);
      expect(initial.candidates[item.id].program_hash).toBeNull();
      for (const field of ["born", "trial_pickup", "trial_departed", "trial_returned", "trial_accepted", "trial_serviced", "confirmation_requested", "confirmation_pickup", "confirmation_accepted", "confirmation_serviced"] as const) {
        const tick = item[field];
        if (tick === null) continue;
        expect(bloomAt(grade, tick - 1).candidates[item.id][field]).toBeNull();
        expect(bloomAt(grade, tick).candidates[item.id][field]).toBe(tick);
      }
      expect(bloomAt(grade, item.edits[0].tick - 1).candidates[item.id].edits).toEqual([]);
      expect(bloomAt(grade, item.edits[0].tick).candidates[item.id].edits).toEqual(item.edits);
      expect(bloomAt(grade, item.born! - 1).candidates[item.id].program_hash).toBeNull();
      expect(bloomAt(grade, item.born!).candidates[item.id].program_hash).toBe(item.program_hash);
    }
    expect(bloomAt(grade, 23).selection).toBeNull();
    expect(bloomAt(grade, 24).selection).toEqual(grade.selection);
    expect(bloomAt(grade, 96).candidates[0].confirmation_requested).toBeNull();
    expect(bloomAt(grade, 100).candidates[0]).not.toHaveProperty("confirmation_passed");
    expect(bloomAt(grade, 100).candidates[0]).not.toHaveProperty("changed");
    expect(bloomAt(grade, 127).final).toBe(false);
    expect(bloomAt(grade, 128).final).toBe(true);
  });

  test("rejects grade identity, nested edit and selection corruption before rendering", () => {
    for (const corrupt of [
      { schema: "future" }, { experiment_hash: digest("f") }, { result_hash: null },
      { evidence_hash: "bad" }, { tick: 127 }, { horizon: 129 }, { phase: "in_progress" },
      { candidates: [] }, { selection: {} }, { service_passed: false }, { bloomed: "yes" },
      { generated_passed: false }, { trials_passed: false }, { selection_passed: false },
      { confirmation_passed: false }, { extra: true },
    ]) {
      const { receipt, grade } = projection();
      expect(isBloomGrade({ ...grade, ...corrupt }, receipt)).toBe(false);
    }
    for (const corrupt of [
      { id: 2 }, { builder: -1 }, { child: 65536 }, { blueprint: {} }, { source: Infinity },
      { depot: "20" }, { trial_parcel: 2 ** 32 }, { confirmation_parcel: -1 },
      { seed_program_hash: null }, { program_hash: "bad" }, { edits: {} }, { born: 129 },
      { confirmation_requested: "97" }, { trial_departed: -1 }, { changed: 1 },
      { family_passed: null }, { confirmation_passed: "yes" }, { extra: true },
    ]) {
      const { receipt, grade } = projection();
      grade.candidates[0] = { ...grade.candidates[0], ...corrupt } as typeof grade.candidates[number];
      expect(isBloomGrade(grade, receipt)).toBe(false);
    }
    for (const corrupt of [
      { tick: 0 }, { tick: 129 }, { actor: 65536 }, { rule: 32 }, { slot: 4 }, { value: 4 },
      { before_hash: "bad" }, { after_hash: null }, { bytes_written: 0 }, { bytes_written: 4097 },
      { extra: true },
    ]) {
      const { receipt, grade } = projection();
      grade.candidates[0].edits[0] = { ...grade.candidates[0].edits[0], ...corrupt } as typeof grade.candidates[number]["edits"][number];
      expect(isBloomGrade(grade, receipt)).toBe(false);
    }
    for (const corrupt of [{ tick: 129 }, { candidate: 2 }, { child: 65536 }, { signal: 2 ** 53 }, { parcel: -1 }, { extra: true }]) {
      const { receipt, grade } = projection();
      grade.selection = { ...grade.selection!, ...corrupt };
      expect(isBloomGrade(grade, receipt)).toBe(false);
    }
    const { receipt, grade } = projection();
    grade.candidates[1].id = 0;
    expect(isBloomGrade(grade, receipt)).toBe(false);
    grade.candidates[1].id = 1;
    grade.candidates[0].edits = Array(9).fill(grade.candidates[0].edits[0]);
    expect(isBloomGrade(grade, receipt)).toBe(false);
  });

  test("keeps an honestly failed confirmation separate from successful service", () => {
    const { receipt, grade } = projection();
    Object.assign(grade, { phase: "finished_without_bloom", bloomed: false, confirmation_passed: false });
    Object.assign(grade.candidates[0], { confirmation_requested: null, confirmation_pickup: null, confirmation_accepted: null, confirmation_serviced: null, confirmation_passed: false });
    expect(isBloomGrade(grade, receipt)).toBe(true);
    expect(bloomAt(grade, 128).selection).not.toBeNull();
    expect(bloomAt(grade, 128).candidates[0].confirmation_serviced).toBeNull();
    expect(grade.service_passed).toBe(true);
    receipt.result.frames = receipt.result.frames.slice(0, 2);
    receipt.result.frames[1].complete = false;
    receipt.result.status = "fuel_exhausted";
    receipt.result.outcome.passed = false;
    Object.assign(grade, { tick: 1, selection: null, generated_passed: false, trials_passed: false, selection_passed: false, service_passed: false });
    for (const item of grade.candidates) Object.assign(item, {
      edits: [], born: null, program_hash: null, trial_pickup: null, trial_departed: null,
      trial_returned: null, trial_accepted: null, trial_serviced: null, changed: false,
      family_passed: false, trial_passed: false,
    });
    expect(isBloomGrade(grade, receipt)).toBe(true);
    expect(bloomAt(grade, 0).final).toBe(false);
    expect(bloomAt(grade, 1).final).toBe(true);
  });

  test("admits optional v4 edit records without accepting them in historical protocols", () => {
    const { receipt, grade } = projection();
    expect(isContinuityReceipt(receipt)).toBe(true);
    const birth = receipt.result.final_state.construction.births[0];
    birth.edits = grade.candidates[0].edits;
    expect(isContinuityReceipt(receipt)).toBe(true);
    for (const corrupt of [{ slot: 4 }, { rule: 32 }, { value: 4 }, { bytes_written: 4097 }, { before_hash: "bad" }, { extra: true }]) {
      birth.edits = [{ ...grade.candidates[0].edits[0], ...corrupt }];
      expect(isContinuityReceipt(receipt)).toBe(false);
    }
    birth.edits = grade.candidates[0].edits;
    receipt.protocol = receipt.result.protocol = "platonik-habitat-v3";
    receipt.experiment.version = 3;
    expect(isContinuityReceipt(receipt)).toBe(false);
    delete birth.edits;
    expect(isContinuityReceipt(receipt)).toBe(true);
    expect(isBloomGrade(grade, receipt)).toBe(false);
  });

  test("admits bounded v4 edit actions and sensors only in that protocol", () => {
    const { receipt } = projection();
    const rules = receipt.experiment.construction.blueprints[0].body.cell.program.rules;
    rules[0] = { when: [{ kind: "assembly_edits", blueprint: 50, count: 2 }], action: { kind: "edit_direction", blueprint: 50, rule: 1, slot: 1 }, remember: null };
    expect(isContinuityReceipt(receipt)).toBe(true);
    rules[0].action.slot = 4;
    expect(isContinuityReceipt(receipt)).toBe(false);
    rules[0].action.slot = 1;
    rules[0].when[0].count = 9;
    expect(isContinuityReceipt(receipt)).toBe(false);
    rules[0].when[0].count = 2;
    receipt.protocol = receipt.result.protocol = "platonik-habitat-v3";
    receipt.experiment.version = 3;
    expect(isContinuityReceipt(receipt)).toBe(false);
  });

  test("admits every required published Bloom grade against its recorded receipt", () => {
    const index = JSON.parse(readFileSync("public/bloom/index.json", "utf8")) as ContinuityIndex;
    expect(index.cases.length).toBeGreaterThanOrEqual(2);
    for (const item of index.cases) {
      const receipt = JSON.parse(readFileSync(`public/bloom/${item.id}.receipt.json`, "utf8"));
      expect(isContinuityReceipt(receipt)).toBe(true);
      const grade = item.bloom;
      expect(isBloomGrade(grade, receipt)).toBe(true);
      if (!grade) throw new Error(`Missing Bloom grade for ${item.id}`);
      expect(item.result_hash).toBe(receipt.result_hash);
      expect(item.passed).toBe(grade.service_passed);
      expect(bloomAt(grade, receipt.result.frames.at(-1).tick).final).toBe(true);
    }
  });
});
