import { describe, expect, test } from "bun:test";
import { canonicalProgram, describeProgram, mutateProgram, parseProgram, runExperiment, STARTERS, type Program } from "./specimen";

const wait: Program = { version: 1, rules: [{ when: [], action: { kind: "wait" } }] };

describe("bounded courier lab", () => {
  test("replays the full state and work ledger exactly for the same program and seed", () => {
    const first = runExperiment(STARTERS[2].program, 42);
    expect(runExperiment(STARTERS[2].program, 42)).toEqual(first);
    expect(runExperiment(STARTERS[2].program, 43).world.walls).not.toEqual(first.world.walls);
    expect(first.trace).toHaveLength(257);
  });

  test("canonical form ignores JSON key order and whitespace, but preserves rule priority", () => {
    const parsed = parseProgram('{ "rules": [{"action": {"kind": "wait"}, "when": []}], "version": 1 }');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(canonicalProgram(parsed.program)).toBe(canonicalProgram(wait));
    const different: Program = { version: 1, rules: [{ when: [], action: { kind: "turn", direction: "left" } }, ...wait.rules] };
    expect(canonicalProgram(different)).not.toBe(canonicalProgram({ ...different, rules: [...different.rules].reverse() }));
  });

  test("rejects oversized, deeply nested, unknown, and out-of-range inputs before simulation", () => {
    const invalid = [
      "[".repeat(20_000),
      JSON.stringify({ version: 1, rules: Array.from({ length: 25 }, () => wait.rules[0]) }),
      JSON.stringify({ ...wait, loop: true }),
      JSON.stringify({ version: 1, rules: [{ when: Array(9).fill({ sensor: "home", is: true }), action: { kind: "wait" } }] }),
      JSON.stringify({ version: 1, rules: [{ when: [{ memory: 4, equals: 0 }], action: { kind: "wait" } }] }),
      JSON.stringify({ version: 1, rules: [{ when: [], action: { kind: "write", slot: 0, value: 256 } }] }),
      JSON.stringify({ version: 1, rules: [{ when: [{ sensor: "goalDistance", is: true }], action: { kind: "wait" } }] }),
      JSON.stringify({ version: 1, rules: [{ when: [], action: { kind: "eval", source: "while(true){}" } }] }),
      JSON.stringify({ version: 1, rules: [{ when: [], action: { kind: "wait" }, remember: { slot: 0, value: -1 } }] }),
      '{"version":1,"rules":[{"when":[],"action":{"kind":"wait"},"__proto__":{}}]}',
      '{"version":1,"rules":[{"when":[],"action":{"kind":"wait"},"remember":null}]}',
      '{"version":1,"rules":[{"when":[],"action":{"kind":"wait"},"remember":{"slot":0,"value":1e999}}]}',
    ];
    for (const input of invalid) expect(parseProgram(input).ok).toBe(false);
    for (const ticks of [0, 257, Infinity, NaN, 1.5]) expect(() => runExperiment(wait, 42, ticks)).toThrow();
    for (const seed of [-1, 0x1_0000_0000, NaN, 1.5]) expect(() => runExperiment(wait, seed)).toThrow();
  });

  test("conserves every spark, stays out of walls, and moves at most one square per tick", () => {
    for (const starter of STARTERS) for (const seed of [0, 1, 7, 42, 0xffff_ffff]) {
      const result = runExperiment(starter.program, seed);
      const walls = new Set(result.world.walls.map(({ x, y }) => `${x},${y}`));
      for (const [index, frame] of result.trace.entries()) {
        expect(frame.sourceRemaining + frame.delivered + Number(frame.carrying)).toBe(result.world.initialSparks);
        expect(walls.has(`${frame.x},${frame.y}`)).toBe(false);
        expect(frame.memory.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)).toBe(true);
        if (index) {
          const previous = result.trace[index - 1];
          expect(Math.abs(frame.x - previous.x) + Math.abs(frame.y - previous.y)).toBeLessThanOrEqual(1);
          expect(frame.deltaWork).toBeGreaterThan(0);
          expect(frame.work).toBe(previous.work + frame.deltaWork);
        }
      }
    }
  });

  test("charges failed actions and unmatched rules rather than granting free ticks", () => {
    const pickup: Program = { version: 1, rules: [{ when: [], action: { kind: "pickup" } }] };
    const failed = runExperiment(pickup, 42, 10);
    expect(failed.deliveries).toBe(0);
    expect(failed.stats.failedActions).toBe(10);
    expect(failed.primitiveWork).toBe(30); // rule visit + action dispatch + local pickup check
    expect(runExperiment(wait, 42, 10).primitiveWork).toBe(20);
    const noMatch: Program = { version: 1, rules: [{ when: [{ sensor: "carrying", is: true }], action: { kind: "drop" } }] };
    const result = runExperiment(noMatch, 42, 10);
    expect(result.primitiveWork).toBe(40); // rule, condition, sensor, fallback wait
    expect(result.trace[1].selectedRule).toBeNull();
    expect(result.stats.actionAttempts).toBe(10);
  });

  test("short-circuits conditions and accounts for every modeled primitive, including memory", () => {
    const result = runExperiment(STARTERS[2].program, 42);
    const stats = result.stats;
    expect(stats.memoryReads).toBeGreaterThan(0);
    expect(stats.memoryWrites).toBeGreaterThan(0);
    expect(result.primitiveWork).toBe(stats.rulesVisited + stats.conditionChecks + stats.sensorReads + stats.memoryReads + stats.memoryWrites + stats.actionAttempts + stats.terrainReads + stats.stateWrites);
    const program: Program = { version: 1, rules: [{ when: [{ sensor: "carrying", is: true }, { memory: 0, equals: 0 }], action: { kind: "wait" } }] };
    expect(runExperiment(program, 42, 5).stats.memoryReads).toBe(0);
  });

  test("gives visibly different outcomes without rewarding a longer program by itself", () => {
    const [moth, moss, reed] = STARTERS.map((starter) => runExperiment(starter.program, 42));
    expect(moth.deliveries).toBe(0);
    expect(moss.deliveries).toBeGreaterThan(moth.deliveries);
    expect(reed.deliveries).toBeGreaterThan(moss.deliveries);
    const padding: Program = { version: 1, rules: [...wait.rules, ...STARTERS[2].program.rules] };
    expect(describeProgram(padding).instructions).toBeGreaterThan(describeProgram(wait).instructions);
    expect(runExperiment(padding, 42).deliveries).toBe(0);
    expect(runExperiment(padding, 42).primitiveWork).toBe(runExperiment(wait, 42).primitiveWork);
  });

  test("mutation is deterministic, valid, changes code, and preserves the parent", () => {
    for (const starter of STARTERS) {
      const original = canonicalProgram(starter.program);
      for (const seed of [0, 1, 42, 4096, 0xffff_ffff]) {
        const child = mutateProgram(starter.program, seed);
        expect(canonicalProgram(child)).toBe(canonicalProgram(mutateProgram(starter.program, seed)));
        expect(canonicalProgram(child)).not.toBe(original);
        expect(parseProgram(canonicalProgram(child)).ok).toBe(true);
        expect(canonicalProgram(starter.program)).toBe(original);
        expect(runExperiment(child, seed, 16).trace).toHaveLength(17);
      }
    }
  });
});
