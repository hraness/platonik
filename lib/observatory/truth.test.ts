import { describe, expect, test } from "bun:test";
import {
  thresholdMap, trajectory, truthStep, TRUTH_LIMITS,
  type RuleId, type Schedule, type ThresholdMapOptions,
} from "./truth";

const mapOptions: ThresholdMapOptions = {
  rule: "dualist", schedule: "simultaneous", iterations: 12,
  radius: 1, size: 3, center: [0.5, 0.5], zoom: 1,
};

describe("fuzzy Dualist trajectories", () => {
  test("reproduces the first two published simultaneous updates", () => {
    expect(trajectory([0.25, 0.25], "dualist", "simultaneous", 2)).toEqual([
      [0.25, 0.25], [1, 0.6875], [0.6875, 0.3125],
    ]);
  });

  test("sequential revision uses the new x in the y calculation", () => {
    expect(truthStep(0.25, 0.25, "dualist", "sequential")).toEqual([1, 0.75]);
    const simultaneous = truthStep(0.25, 0.25, "squared", "simultaneous");
    const sequential = truthStep(0.25, 0.25, "squared", "sequential");
    expect(simultaneous[0]).toBe(0);
    expect(simultaneous[1]).toBeCloseTo(Math.SQRT1_2, 14);
    expect(sequential[0]).toBe(0);
    expect(sequential[1]).toBeCloseTo(Math.sqrt(0.75), 14);
  });

  test("preserves the truth square for endpoints and interior seeds", () => {
    for (const rule of ["dualist", "squared"] as const) {
      for (const schedule of ["simultaneous", "sequential"] as const) {
        for (let x = 0; x <= 4; x++) {
          for (let y = 0; y <= 4; y++) {
            for (const pair of trajectory([x / 4, y / 4], rule, schedule, 64)) {
              for (const value of pair) {
                expect(Number.isFinite(value) && value >= 0 && value <= 1).toBe(true);
              }
            }
          }
        }
      }
    }
  });

  test("does not mutate the seed or alias trajectory states", () => {
    const seed: [number, number] = [0.25, 0.25];
    const points = trajectory(seed, "dualist", "simultaneous", 2);
    points[0][0] = 0;
    expect(seed).toEqual([0.25, 0.25]);
    expect(points[1]).toEqual([1, 0.6875]);
    expect(trajectory(seed, "dualist", "simultaneous", 0)).toEqual([seed]);
  });

  test("rejects invalid values, systems, and unbounded trajectory lengths", () => {
    for (const value of [NaN, Infinity, -Infinity, -0.1, 1.1]) {
      expect(() => truthStep(value, 0.5, "dualist", "simultaneous")).toThrow();
      expect(() => truthStep(0.5, value, "dualist", "simultaneous")).toThrow();
    }
    for (const steps of [-1, 0.5, NaN, Infinity, TRUTH_LIMITS.maxTrajectorySteps + 1]) {
      expect(() => trajectory([0.5, 0.5], "dualist", "simultaneous", steps)).toThrow();
    }
    expect(() => truthStep(0, 0, "unknown" as RuleId, "simultaneous")).toThrow();
    expect(() => truthStep(0, 0, "dualist", "unknown" as Schedule)).toThrow();
  });
});

describe("bounded threshold maps", () => {
  test("samples row zero at yMax and records first post-update crossing", () => {
    // Top middle: (.5, 1) -> (.5, .25) -> (.75, 1), crossing at 2.
    // Bottom middle: (.5, 0) -> (.5, .75) -> (.75, .5), still inside.
    // Corner trajectories lie exactly on radius 1 and never cross it.
    const map = thresholdMap({ ...mapOptions, iterations: 2 });
    expect([...map.counts]).toEqual([0, 2, 0, 2, 1, 2, 0, 0, 0]);
    expect(map.domain).toEqual({ xMin: 0, xMax: 1, yMin: 0, yMax: 1 });
    expect([...thresholdMap({ ...mapOptions, iterations: 1 }).counts]).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0]);
  });

  test("never confuses an iteration cap with proof of no future crossing", () => {
    expect([...thresholdMap({ ...mapOptions, radius: Math.SQRT2 }).counts]).toEqual(Array(9).fill(0));
    expect([...thresholdMap({ ...mapOptions, size: 1, iterations: 1 }).counts]).toEqual([0]);
  });

  test("keeps the full zoomed domain in the unit square near edges", () => {
    const map = thresholdMap({ ...mapOptions, center: [0, 1], zoom: 16 });
    expect(map.domain).toEqual({ xMin: 0, xMax: 1 / 16, yMin: 15 / 16, yMax: 1 });
    const middle = thresholdMap({ ...mapOptions, center: [0.5, 0.5], zoom: 2 });
    expect(middle.domain).toEqual({ xMin: 0.25, xMax: 0.75, yMin: 0.25, yMax: 0.75 });
  });

  test("has deterministic counts and bounded allocation at maximum limits", () => {
    const first = thresholdMap({ ...mapOptions, rule: "squared", schedule: "sequential" });
    const second = thresholdMap({ ...mapOptions, rule: "squared", schedule: "sequential" });
    expect(first).toEqual(second);
    expect(first.counts).not.toBe(second.counts);
    const max = thresholdMap({ ...mapOptions, size: 192, iterations: 192, radius: 0 });
    expect(max.counts.length).toBe(192 * 192);
    expect(max.counts.every((value) => value >= 0 && value <= 192)).toBe(true);
  });

  test("rejects unsafe or ambiguous map parameters before allocation", () => {
    const invalid: Partial<ThresholdMapOptions>[] = [
      { size: 0 }, { size: 193 }, { size: 1.5 }, { size: Infinity },
      { iterations: 0 }, { iterations: 193 }, { iterations: 0.5 }, { iterations: NaN },
      { radius: -1 }, { radius: Infinity }, { radius: Math.SQRT2 + 0.1 },
      { zoom: 0 }, { zoom: 17 }, { zoom: NaN },
      { center: [-0.1, 0.5] }, { center: [0.5, NaN] },
      { rule: "unknown" as RuleId }, { schedule: "unknown" as Schedule },
    ];
    for (const override of invalid) {
      expect(() => thresholdMap({ ...mapOptions, ...override })).toThrow();
    }
  });
});
