import { describe, expect, test } from "bun:test";
import {
  AUTOVERSE_LIMITS, CIRCUIT_STARTERS, assayCircuit, buildCircuit, canonicalCircuit,
  describeCircuit, parseCircuit, runCircuit,
  type Bit, type Circuit, type CircuitNode, type CircuitStarterId, type SignalPhase,
} from "./autoverse";

const starter = (id: CircuitStarterId) => CIRCUIT_STARTERS.find(entry => entry.id === id)!;
const word = (outputs: Record<string, Bit>, prefix: string) => [0, 1, 2, 3].reduce((sum, index) => sum + outputs[`${prefix}${index}`] * 2 ** index, 0);

describe("finite synchronous circuit substrate", () => {
  test("each wire reads old state; the observer sees only committed synchronous transitions", () => {
    const fixture = starter("nand");
    const run = runCircuit(fixture.circuit, [{ ticks: 3, inputs: { a: 1, b: 1 } }]);
    expect(run.trace.map(frame => frame.outputs.out)).toEqual([0, 1, 0, 0]);
    expect(run.trace[1].values.a).toBe(1);
    expect(run.trace[1].values.gate).toBe(1); // It still read the previous zero inputs.
    expect(runCircuit(fixture.circuit, fixture.phases)).toEqual(runCircuit(fixture.circuit, fixture.phases));
    const reversed = { ...fixture.circuit, nodes: [...fixture.circuit.nodes].reverse() };
    expect(canonicalCircuit(reversed)).toBe(canonicalCircuit(fixture.circuit));
    expect(runCircuit(reversed, fixture.phases)).toEqual(runCircuit(fixture.circuit, fixture.phases));
    const ordered = parseCircuit(JSON.stringify({ version: 1, nodes: ["aa", "a_a", "a0"].map(id => ({ id, kind: "constant", value: 0 })), outputs: { aa: "aa", a_a: "a_a", a0: "a0" } }));
    if (!ordered.ok) throw new Error(ordered.error);
    expect(ordered.circuit.nodes.map(node => node.id)).toEqual(["a0", "a_a", "aa"]);
    expect(Object.keys(ordered.circuit.outputs)).toEqual(["a0", "a_a", "aa"]);
  });

  test("relay propagation follows changing inputs after a declared settling window", () => {
    const fixture = starter("relay");
    const run = runCircuit(fixture.circuit, fixture.phases);
    expect([run.trace[5].outputs.signal, run.trace[10].outputs.signal, run.trace[15].outputs.signal]).toEqual([0, 1, 0]);
    const report = assayCircuit(fixture.circuit, "relay");
    expect([report.passed, report.total, report.work]).toEqual([3, 3, 360]);
  });

  test("missing wires are charged faults even when their fallback zero produces the expected answer", () => {
    const broken = structuredClone(starter("nand").circuit);
    const gate = broken.nodes.find(node => node.kind === "nand")!;
    if (gate.kind !== "nand") throw new Error("Expected NAND");
    gate.inputs[0] = null;
    const run = runCircuit(broken, [{ ticks: 4, inputs: { a: 0, b: 0 } }]);
    expect(run.outputs.out).toBe(1);
    expect(run.faults).toBe(4);
    expect(run.stats.wireReads).toBe(8);
    expect(run.work).toBe(44);
    const report = assayCircuit(broken, "nand");
    expect(report.passed).toBe(0);
    expect(report.total).toBe(4);
    expect(report.firstFailure?.reason).toContain("broken wire");
  });

  test("fuel exhaustion keeps spent work and rolls back the unfinished tick", () => {
    const fixture = starter("nand");
    const complete = runCircuit(fixture.circuit, fixture.phases);
    expect(complete.work).toBe(44);
    const short = runCircuit(fixture.circuit, fixture.phases, { fuel: 43 });
    expect(short.status).toBe("fuel-exhausted");
    expect(short.work).toBe(43);
    expect(short.ticksCompleted).toBe(3);
    expect(short.trace).toEqual(complete.trace.slice(0, 4));
    const { nodeEvaluations, wireReads, inputReads, stateWrites, outputReads } = short.stats;
    expect(short.work).toBe(nodeEvaluations + wireReads + inputReads + stateWrites + outputReads);
    const none = runCircuit(fixture.circuit, fixture.phases, { fuel: 0 });
    expect(none.status).toBe("fuel-exhausted");
    expect(none.work).toBe(0);
    expect(none.trace).toHaveLength(1);
    expect(runCircuit(fixture.circuit, fixture.phases, { fuel: 44 }).status).toBe("complete");
  });

  test("strict parsing and run limits reject unsafe shapes, missing references, and unbounded stimuli", () => {
    const fixture = starter("nand");
    const invalid: unknown[] = [
      { ...fixture.circuit, extra: true },
      { ...fixture.circuit, nodes: [...fixture.circuit.nodes, fixture.circuit.nodes[0]] },
      { version: 1, nodes: [{ id: "x", kind: "constant", value: 2 }], outputs: { out: "x" } },
      { version: 1, nodes: [{ id: "x", kind: "nand", inputs: ["missing", null] }], outputs: { out: "x" } },
      { version: 1, nodes: [{ id: "x", kind: "input" }], outputs: { out: "missing" } },
      { version: 1, nodes: [{ id: "x", kind: "register", data: null, enable: null, reset: null, initial: 1 }], outputs: {} },
      { version: 1, nodes: [{ id: "x", kind: "eval", source: "while(true){}" }], outputs: {} },
      { version: 1, nodes: Array.from({ length: 129 }, (_, index) => ({ id: `x${index}`, kind: "input" })), outputs: {} },
      { version: 1, nodes: [], outputs: Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`x${index}`, null])) },
      { version: 1, nodes: [], outputs: { badName: null } },
    ];
    for (const value of invalid) expect(parseCircuit(JSON.stringify(value)).ok).toBe(false);
    expect(parseCircuit("[".repeat(AUTOVERSE_LIMITS.maxBytes + 1)).ok).toBe(false);
    expect(parseCircuit('{"version":1,"nodes":[],"outputs":{"__proto__":null}}').ok).toBe(false);
    expect(parseCircuit(canonicalCircuit(fixture.circuit)).ok).toBe(true);
    for (const ticks of [0, -1, 257, NaN, Infinity, 1.5]) expect(() => runCircuit(fixture.circuit, [{ ticks, inputs: { a: 0, b: 0 } }])).toThrow();
    for (const fuel of [-1, 2_000_001, Infinity, 0.5]) expect(() => runCircuit(fixture.circuit, fixture.phases, { fuel })).toThrow();
    expect(() => runCircuit(fixture.circuit, Array(33).fill({ ticks: 1, inputs: { a: 0, b: 0 } }))).toThrow();
    expect(() => runCircuit(fixture.circuit, [{ ticks: 200, inputs: { a: 0, b: 0 } }, { ticks: 100, inputs: { a: 0, b: 0 } }])).toThrow();
    expect(() => runCircuit(fixture.circuit, [{ ticks: 1, inputs: { a: 0 } }])).toThrow();
    expect(() => runCircuit(fixture.circuit, [{ ticks: 1, inputs: { a: 0, b: 0, extra: 1 } }])).toThrow();
    expect(() => runCircuit(fixture.circuit, [{ ticks: 1, inputs: { a: 2, b: 0 } } as unknown as SignalPhase])).toThrow();
  });

  test("bounded cycles are allowed and do not become recursive host execution", () => {
    const oscillator: Circuit = { version: 1, nodes: [{ id: "x", kind: "nand", inputs: ["x", "x"] }], outputs: { out: "x" } };
    const run = runCircuit(oscillator, [{ ticks: 6, inputs: {} }]);
    expect(run.trace.map(frame => frame.outputs.out)).toEqual([0, 1, 0, 1, 0, 1, 0]);
    expect(run.work).toBe(30);
  });
});

describe("composing storage and NAND arithmetic", () => {
  test("memory loads, holds without rewriting, and honors reset over simultaneous load", () => {
    const fixture = starter("memory");
    const run = runCircuit(fixture.circuit, fixture.phases);
    expect([3, 6, 10, 13, 16].map(tick => run.trace[tick].outputs.stored)).toEqual([0, 1, 1, 0, 0]);
    expect(assayCircuit(fixture.circuit, "memory").passed).toBe(5);
    const broken = structuredClone(fixture.circuit);
    broken.nodes.push({ id: "zero", kind: "constant", value: 0 });
    const register = broken.nodes.find(node => node.kind === "register")!;
    if (register.kind !== "register") throw new Error("Expected register");
    register.reset = "zero";
    const report = assayCircuit(broken, "memory");
    expect(report.faults).toBe(0);
    expect(report.passed).toBe(3);
    expect(report.firstFailure?.label).toBe("Reset wins over simultaneous load");
  });

  test("all 256 addition pairs match ordinary integer addition including carry", () => {
    const fixture = starter("adder");
    const report = assayCircuit(fixture.circuit, "adder");
    expect([report.passed, report.total, report.faults]).toEqual([256, 256, 0]);
    for (const [index, check] of report.checks.entries()) {
      const a = Math.floor(index / 16);
      const b = index % 16;
      expect(word(check.observed, "s") + 16 * check.observed.carry).toBe(a + b);
    }
    expect(describeCircuit(fixture.circuit).nodes).toBe(45);
    expect(report.work).toBe(1_433_600);
    const tooSoon = runCircuit(fixture.circuit, [{ ...fixture.phases[0], ticks: 1 }]);
    expect(word(tooSoon.outputs, "s") + 16 * tooSoon.outputs.carry).not.toBe(21);
  });

  test("a wrong carry output fails every overflowing case without being mistaken for a wiring fault", () => {
    const broken = structuredClone(starter("adder").circuit);
    broken.outputs.carry = "zero";
    const report = assayCircuit(broken, "adder");
    expect(report.total - report.passed).toBe(120);
    expect(report.faults).toBe(0);
    expect(report.firstFailure?.expected.carry).toBe(1);
    expect(report.firstFailure?.observed.carry).toBe(0);
  });

  test("the accumulator actually carries arithmetic state across timed loads before reset", () => {
    const fixture = starter("accumulator");
    const run = runCircuit(fixture.circuit, fixture.phases);
    expect([3, 22, 41, 60, 79, 82].map(tick => [word(run.trace[tick].outputs, "q"), run.trace[tick].outputs.carry])).toEqual([[0, 0], [3, 0], [8, 0], [3, 1], [2, 1], [0, 0]]);
    expect(assayCircuit(fixture.circuit, "accumulator").passed).toBe(6);
    const broken = structuredClone(fixture.circuit);
    const register = broken.nodes.find(node => node.id === "q0") as Extract<CircuitNode, { kind: "register" }>;
    register.data = "zero";
    const report = assayCircuit(broken, "accumulator");
    expect(report.passed).toBeLessThan(report.total);
    expect(report.checks.at(-1)?.passed).toBe(true); // A final reset alone would miss the arithmetic failure.
  });

  test("assays check the submitted circuit and its interface, rather than substituting the fixture", () => {
    const report = assayCircuit(starter("relay").circuit, "adder");
    expect(report.passed).toBe(0);
    expect(report.total).toBe(256);
    expect(report.work).toBe(0);
    expect(report.firstFailure?.reason).toContain("input nodes a0");
  });
});

describe("external blueprint construction", () => {
  test("copies nodes, wires, and output bindings from an initially empty graph at explicit cost", () => {
    for (const fixture of CIRCUIT_STARTERS) {
      const original = canonicalCircuit(fixture.circuit);
      const result = buildCircuit(fixture.circuit);
      const metrics = describeCircuit(fixture.circuit);
      expect(result.status).toBe("complete");
      expect(result.work).toBe(metrics.nodes + metrics.wires + metrics.outputs);
      expect(result.materialsUsed).toBe(metrics.nodes);
      expect(result.wireCopies).toBe(metrics.wires);
      expect(result.trace[0]).toMatchObject({ step: 1, nodes: 1, wires: 0, materialsUsed: 1 });
      expect(canonicalCircuit(result.circuit)).toBe(original);
      expect(runCircuit(result.circuit, fixture.phases)).toEqual(runCircuit(fixture.circuit, fixture.phases));
      expect(canonicalCircuit(fixture.circuit)).toBe(original);
    }
  });

  test("an exhausted step budget leaves a real partial graph with missing connections", () => {
    const fixture = starter("adder");
    const partial = buildCircuit(fixture.circuit, { steps: 45 });
    expect(partial.status).toBe("step-limit");
    expect([partial.nodeAllocations, partial.wireCopies, partial.work]).toEqual([45, 0, 45]);
    expect(partial.circuit.outputs).toEqual({});
    expect(parseCircuit(canonicalCircuit(partial.circuit)).ok).toBe(true);
    expect(runCircuit(partial.circuit, fixture.phases).faults).toBeGreaterThan(0);
    expect(assayCircuit(partial.circuit, "adder").passed).toBe(0);
    expect(buildCircuit(fixture.circuit, { steps: 121 }).status).toBe("step-limit");
    expect(buildCircuit(fixture.circuit, { steps: 122 }).status).toBe("complete");
    expect(buildCircuit(fixture.circuit, { steps: 45 })).toEqual(partial);
  });

  test("material and node capacity failures consume their attempted step without consuming nonexistent matter", () => {
    const fixture = starter("adder");
    const material = buildCircuit(fixture.circuit, { materials: 44 });
    expect(material.status).toBe("material-limit");
    expect([material.materialsUsed, material.nodeAllocations, material.work, material.failedAttempts]).toEqual([44, 44, 45, 1]);
    expect(material.trace.at(-1)?.succeeded).toBe(false);
    const capacity = buildCircuit(fixture.circuit, { materials: 128, maxNodes: 43 });
    expect(capacity.status).toBe("node-limit");
    expect([capacity.nodeAllocations, capacity.work, capacity.failedAttempts]).toEqual([43, 44, 1]);
    const empty = buildCircuit(fixture.circuit, { steps: 0 });
    expect(empty.circuit).toEqual({ version: 1, nodes: [], outputs: {} });
    expect(empty.work).toBe(0);
    expect(empty.status).toBe("step-limit");
    const failed = buildCircuit(fixture.circuit, { steps: 1, materials: 0 });
    expect(failed.status).toBe("material-limit");
    expect(failed.work).toBe(1);
    expect(failed.nodeAllocations).toBe(0);
    for (const options of [{ steps: -1 }, { steps: 1025 }, { steps: Infinity }, { materials: 129 }, { maxNodes: 129 }, { maxNodes: 1.5 }]) expect(() => buildCircuit(fixture.circuit, options)).toThrow();
  });
});
