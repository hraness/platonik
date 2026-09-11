/** Finite synchronous circuit feasibility model, separate from the proposed Rust VM. */
export type Bit = 0 | 1;
export type Wire = string | null;
export type CircuitNode =
  | { id: string; kind: "input" }
  | { id: string; kind: "constant"; value: Bit }
  | { id: string; kind: "nand"; inputs: [Wire, Wire] }
  | { id: string; kind: "register"; data: Wire; enable: Wire; reset: Wire };
export type Circuit = { version: 1; nodes: CircuitNode[]; outputs: Record<string, Wire> };
export type SignalPhase = { ticks: number; inputs: Record<string, Bit> };
export type CircuitFrame = {
  tick: number;
  phase: number;
  values: Record<string, Bit>;
  outputs: Record<string, Bit>;
  work: number;
  faults: number;
};
export type CircuitStats = {
  nodeEvaluations: number;
  wireReads: number;
  inputReads: number;
  stateWrites: number;
  outputReads: number;
  failedWireReads: number;
};
export type CircuitRun = {
  model: "autoverse-circuit-v1";
  status: "complete" | "fuel-exhausted";
  ticksRequested: number;
  ticksCompleted: number;
  fuel: number;
  work: number;
  faults: number;
  stats: CircuitStats;
  outputs: Record<string, Bit>;
  trace: CircuitFrame[];
};
export type ConstructionOptions = { steps?: number; materials?: number; maxNodes?: number };
export type ConstructionStep = { step: number; action: string; nodes: number; wires: number; materialsUsed: number; succeeded: boolean };
export type ConstructionResult = {
  status: "complete" | "step-limit" | "material-limit" | "node-limit";
  circuit: Circuit;
  stepsRequired: number;
  stepsUsed: number;
  work: number;
  nodeAllocations: number;
  wireCopies: number;
  outputBindings: number;
  materialsUsed: number;
  failedAttempts: number;
  trace: ConstructionStep[];
};
export type CircuitStarterId = "relay" | "nand" | "memory" | "adder" | "accumulator";
export type CircuitStarter = {
  id: CircuitStarterId;
  name: string;
  description: string;
  circuit: Circuit;
  phases: SignalPhase[];
};
export type AssayCheck = {
  label: string;
  passed: boolean;
  expected: Record<string, Bit>;
  observed: Record<string, Bit>;
  faults: number;
  reason?: string;
};
export type CircuitAssay = {
  id: CircuitStarterId;
  name: string;
  passed: number;
  total: number;
  work: number;
  ticksCompleted: number;
  faults: number;
  checks: AssayCheck[];
  firstFailure?: AssayCheck;
};

export const AUTOVERSE_LIMITS = {
  maxBytes: 32_768, maxNodes: 128, maxOutputs: 32, maxPhases: 32,
  maxTicks: 256, maxFuel: 2_000_000, maxBuildSteps: 1024,
} as const;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const bit = (value: unknown): value is Bit => value === 0 || value === 1;
const name = (value: unknown): value is string => typeof value === "string" && /^[a-z][a-z0-9_]{0,23}$/.test(value);
const wire = (value: unknown): value is Wire => value === null || name(value);
const keys = (value: Record<string, unknown>, expected: string[]) => Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
const integer = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const compareNames = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

function ports(node: CircuitNode): { port: string; source: Wire }[] {
  if (node.kind === "nand") return [{ port: "a", source: node.inputs[0] }, { port: "b", source: node.inputs[1] }];
  if (node.kind === "register") return [{ port: "data", source: node.data }, { port: "enable", source: node.enable }, { port: "reset", source: node.reset }];
  return [];
}

/** Null denotes an intentionally absent wire; a named wire must reference an existing node. */
export function parseCircuit(input: string): { ok: true; circuit: Circuit } | { ok: false; error: string } {
  if (input.length > AUTOVERSE_LIMITS.maxBytes || new TextEncoder().encode(input).length > AUTOVERSE_LIMITS.maxBytes) return { ok: false, error: "Circuit JSON exceeds the 32 KiB limit." };
  let value: unknown;
  try { value = JSON.parse(input); } catch { return { ok: false, error: "Enter valid circuit JSON." }; }
  if (!record(value) || !keys(value, ["version", "nodes", "outputs"]) || value.version !== 1 || !Array.isArray(value.nodes) || value.nodes.length > AUTOVERSE_LIMITS.maxNodes || !record(value.outputs) || Object.keys(value.outputs).length > AUTOVERSE_LIMITS.maxOutputs) {
    return { ok: false, error: "Expected version: 1, at most 128 nodes, and at most 32 named outputs; no extra fields." };
  }
  const nodes: CircuitNode[] = [];
  const names = new Set<string>();
  for (const raw of value.nodes) {
    if (!record(raw) || !name(raw.id) || names.has(raw.id)) return { ok: false, error: "Node IDs must be unique lowercase names of 1–24 characters." };
    names.add(raw.id);
    if (raw.kind === "input" && keys(raw, ["id", "kind"])) nodes.push({ id: raw.id, kind: "input" });
    else if (raw.kind === "constant" && keys(raw, ["id", "kind", "value"]) && bit(raw.value)) nodes.push({ id: raw.id, kind: "constant", value: raw.value });
    else if (raw.kind === "nand" && keys(raw, ["id", "kind", "inputs"]) && Array.isArray(raw.inputs) && raw.inputs.length === 2 && raw.inputs.every(wire)) nodes.push({ id: raw.id, kind: "nand", inputs: [raw.inputs[0], raw.inputs[1]] });
    else if (raw.kind === "register" && keys(raw, ["id", "kind", "data", "enable", "reset"]) && wire(raw.data) && wire(raw.enable) && wire(raw.reset)) nodes.push({ id: raw.id, kind: "register", data: raw.data, enable: raw.enable, reset: raw.reset });
    else return { ok: false, error: `Invalid node ${raw.id}. Use input, constant, nand, or register with exactly its declared fields.` };
  }
  const outputs: Record<string, Wire> = {};
  for (const [port, source] of Object.entries(value.outputs).sort(([a], [b]) => compareNames(a, b))) {
    if (!name(port) || !wire(source)) return { ok: false, error: "Outputs map lowercase names to a node ID or null." };
    outputs[port] = source;
  }
  for (const source of [...nodes.flatMap(node => ports(node).map(port => port.source)), ...Object.values(outputs)]) {
    if (source !== null && !names.has(source)) return { ok: false, error: `Wire references missing node ${source}; use null for an explicit broken connection.` };
  }
  nodes.sort((a, b) => compareNames(a.id, b.id));
  return { ok: true, circuit: { version: 1, nodes, outputs } };
}

function checkedCircuit(circuit: Circuit): Circuit {
  const parsed = parseCircuit(JSON.stringify(circuit));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.circuit;
}

export function canonicalCircuit(circuit: Circuit): string { return JSON.stringify(checkedCircuit(circuit)); }

export function describeCircuit(circuit: Circuit) {
  circuit = checkedCircuit(circuit);
  return {
    nodes: circuit.nodes.length,
    wires: circuit.nodes.reduce((sum, node) => sum + ports(node).filter(port => port.source !== null).length, 0),
    registers: circuit.nodes.filter(node => node.kind === "register").length,
    outputs: Object.keys(circuit.outputs).length,
    bytes: new TextEncoder().encode(JSON.stringify(circuit)).length,
  };
}

/**
 * Each edge reads the source's old state: one tick of delay, one charged read.
 * Named output bindings observe newly committed state; they are not extra wires.
 * This is an abstract graph, with no geometric distance, collision, or spatial-locality model.
 * Registers are granted storage primitives, not memories discovered from NAND feedback.
 * Fuel exhaustion discards the unfinished synchronous transition but retains its spent work.
 */
export function runCircuit(circuit: Circuit, phases: SignalPhase[], options: { fuel?: number } = {}): CircuitRun {
  circuit = checkedCircuit(circuit);
  if (!Array.isArray(phases) || phases.length < 1 || phases.length > AUTOVERSE_LIMITS.maxPhases) throw new Error("Use 1–32 stimulus phases.");
  const inputNames = circuit.nodes.filter(node => node.kind === "input").map(node => node.id);
  let ticksRequested = 0;
  for (const phase of phases) {
    if (!record(phase) || !keys(phase, ["ticks", "inputs"]) || !integer(phase.ticks, 1, AUTOVERSE_LIMITS.maxTicks) || !record(phase.inputs) || !keys(phase.inputs, inputNames) || !Object.values(phase.inputs).every(bit)) throw new Error("Each phase needs positive integer ticks and exactly one bit for every input node.");
    ticksRequested += phase.ticks;
  }
  if (ticksRequested > AUTOVERSE_LIMITS.maxTicks) throw new Error("The entire stimulus is limited to 256 ticks.");
  const fuel = options.fuel ?? AUTOVERSE_LIMITS.maxFuel;
  if (!integer(fuel, 0, AUTOVERSE_LIMITS.maxFuel)) throw new Error("Fuel must be an integer from 0 to 2,000,000.");
  const stats: CircuitStats = { nodeEvaluations: 0, wireReads: 0, inputReads: 0, stateWrites: 0, outputReads: 0, failedWireReads: 0 };
  let work = 0;
  let values: Record<string, Bit> = Object.fromEntries(circuit.nodes.map(node => [node.id, 0 as Bit]));
  let outputs: Record<string, Bit> = Object.fromEntries(Object.keys(circuit.outputs).map(port => [port, 0 as Bit]));
  const trace: CircuitFrame[] = [{ tick: 0, phase: -1, values: { ...values }, outputs: { ...outputs }, work: 0, faults: 0 }];
  const exhausted = Symbol("fuel-exhausted");
  const charge = (counter: Exclude<keyof CircuitStats, "failedWireReads">) => {
    if (work >= fuel) throw exhausted;
    work += 1; stats[counter] += 1;
  };
  const read = (source: Wire): Bit => {
    charge("wireReads");
    if (source === null) { stats.failedWireReads += 1; return 0; }
    return values[source];
  };
  let status: CircuitRun["status"] = "complete";
  try {
    for (const [phaseIndex, phase] of phases.entries()) for (let tick = 0; tick < phase.ticks; tick += 1) {
      const next: Record<string, Bit> = {};
      for (const node of circuit.nodes) {
        charge("nodeEvaluations");
        let result: Bit;
        if (node.kind === "input") { charge("inputReads"); result = phase.inputs[node.id]; }
        else if (node.kind === "constant") result = node.value;
        else if (node.kind === "nand") {
          const a = read(node.inputs[0]); const b = read(node.inputs[1]);
          result = a === 1 && b === 1 ? 0 : 1;
        } else {
          const data = read(node.data); const enable = read(node.enable); const reset = read(node.reset);
          result = reset === 1 ? 0 : enable === 1 ? data : values[node.id];
        }
        charge("stateWrites"); next[node.id] = result;
      }
      const nextOutputs: Record<string, Bit> = {};
      for (const [port, source] of Object.entries(circuit.outputs)) {
        charge("outputReads");
        if (source === null) { stats.failedWireReads += 1; nextOutputs[port] = 0; }
        else nextOutputs[port] = next[source];
      }
      values = next; outputs = nextOutputs;
      trace.push({ tick: trace.length, phase: phaseIndex, values: { ...values }, outputs: { ...outputs }, work, faults: stats.failedWireReads });
    }
  } catch (error) {
    if (error !== exhausted) throw error;
    status = "fuel-exhausted";
  }
  return { model: "autoverse-circuit-v1", status, ticksRequested, ticksCompleted: trace.length - 1, fuel, work, faults: stats.failedWireReads, stats, outputs: { ...outputs }, trace };
}

function stub(node: CircuitNode): CircuitNode {
  if (node.kind === "nand") return { ...node, inputs: [null, null] };
  if (node.kind === "register") return { ...node, data: null, enable: null, reset: null };
  return { ...node };
}

/** Privileged external blueprint assembly. No autonomous search or organism self-reproduction. */
export function buildCircuit(blueprint: Circuit, options: ConstructionOptions = {}): ConstructionResult {
  blueprint = checkedCircuit(blueprint);
  type Operation = { kind: "node"; node: CircuitNode } | { kind: "wire"; target: string; port: string; source: string } | { kind: "output"; port: string; source: Wire };
  const operations: Operation[] = [
    ...blueprint.nodes.map((node): Operation => ({ kind: "node", node })),
    ...blueprint.nodes.flatMap(node => ports(node).filter(port => port.source !== null).map((port): Operation => ({ kind: "wire", target: node.id, port: port.port, source: port.source as string }))),
    ...Object.entries(blueprint.outputs).map(([port, source]): Operation => ({ kind: "output", port, source })),
  ];
  const steps = options.steps ?? operations.length;
  const materials = options.materials ?? blueprint.nodes.length;
  const maxNodes = options.maxNodes ?? AUTOVERSE_LIMITS.maxNodes;
  if (!integer(steps, 0, AUTOVERSE_LIMITS.maxBuildSteps) || !integer(materials, 0, AUTOVERSE_LIMITS.maxNodes) || !integer(maxNodes, 0, AUTOVERSE_LIMITS.maxNodes)) throw new Error("Construction allows 0–1,024 steps and 0–128 materials/node capacity.");
  const circuit: Circuit = { version: 1, nodes: [], outputs: {} };
  const result: ConstructionResult = { status: "complete", circuit, stepsRequired: operations.length, stepsUsed: 0, work: 0, nodeAllocations: 0, wireCopies: 0, outputBindings: 0, materialsUsed: 0, failedAttempts: 0, trace: [] };
  for (const operation of operations) {
    if (result.stepsUsed >= steps) { result.status = "step-limit"; break; }
    result.stepsUsed += 1; result.work += 1;
    let action: string;
    let succeeded = true;
    if (operation.kind === "node") {
      action = `Allocate ${operation.node.id}`;
      if (result.materialsUsed >= materials || result.nodeAllocations >= maxNodes) {
        result.status = result.materialsUsed >= materials ? "material-limit" : "node-limit";
        result.failedAttempts += 1; succeeded = false;
      } else {
        circuit.nodes.push(stub(operation.node)); result.nodeAllocations += 1; result.materialsUsed += 1;
      }
    } else if (operation.kind === "wire") {
      action = `Wire ${operation.source} to ${operation.target}.${operation.port}`;
      const target = circuit.nodes.find(node => node.id === operation.target)!;
      if (target.kind === "nand") target.inputs[operation.port === "a" ? 0 : 1] = operation.source;
      else if (target.kind === "register") target[operation.port as "data" | "enable" | "reset"] = operation.source;
      result.wireCopies += 1;
    } else {
      action = `Bind output ${operation.port}`;
      circuit.outputs[operation.port] = operation.source; result.outputBindings += 1;
    }
    result.trace.push({ step: result.stepsUsed, action, nodes: result.nodeAllocations, wires: result.wireCopies, materialsUsed: result.materialsUsed, succeeded });
    if (!succeeded) break;
  }
  return result;
}

const bits = (value: number, prefix: string, width = 4): Record<string, Bit> => Object.fromEntries(Array.from({ length: width }, (_, index) => [`${prefix}${index}`, (Math.floor(value / 2 ** index) % 2) as Bit]));
const input = (id: string): CircuitNode => ({ id, kind: "input" });
function adderNodes(a: string[], b: string[], initialCarry: string) {
  const nodes: CircuitNode[] = [];
  const sums: string[] = [];
  let carry = initialCarry;
  for (let index = 0; index < 4; index += 1) {
    const gate = (suffix: string, left: string, right: string) => {
      const id = `bit${index}_${suffix}`;
      nodes.push({ id, kind: "nand", inputs: [left, right] });
      return id;
    };
    const both = gate("both", a[index], b[index]);
    const left = gate("left", a[index], both);
    const right = gate("right", b[index], both);
    const xor = gate("xor", left, right);
    const mix = gate("mix", xor, carry);
    const sumLeft = gate("sum_left", xor, mix);
    const sumRight = gate("sum_right", carry, mix);
    sums.push(gate("sum", sumLeft, sumRight));
    carry = gate("carry", both, mix);
  }
  return { nodes, sums, carry };
}

const relay: Circuit = { version: 1, nodes: [input("signal"), { id: "inverse", kind: "nand", inputs: ["signal", "signal"] }, { id: "relay", kind: "nand", inputs: ["inverse", "inverse"] }], outputs: { signal: "relay" } };
const nand: Circuit = { version: 1, nodes: [input("a"), input("b"), { id: "gate", kind: "nand", inputs: ["a", "b"] }], outputs: { out: "gate" } };
const memory: Circuit = { version: 1, nodes: [input("data"), input("load"), input("reset"), { id: "memory", kind: "register", data: "data", enable: "load", reset: "reset" }], outputs: { stored: "memory" } };
const aNames = Array.from({ length: 4 }, (_, index) => `a${index}`);
const bNames = Array.from({ length: 4 }, (_, index) => `b${index}`);
const qNames = Array.from({ length: 4 }, (_, index) => `q${index}`);
const combinational = adderNodes(aNames, bNames, "zero");
const adder: Circuit = { version: 1, nodes: [...aNames.map(input), ...bNames.map(input), { id: "zero", kind: "constant", value: 0 }, ...combinational.nodes], outputs: { ...Object.fromEntries(combinational.sums.map((source, index) => [`s${index}`, source])), carry: combinational.carry } };
const accumulated = adderNodes(qNames, bNames, "zero");
const accumulator: Circuit = {
  version: 1,
  nodes: [
    ...bNames.map(input), input("load"), input("reset"), { id: "zero", kind: "constant", value: 0 }, ...accumulated.nodes,
    ...qNames.map((id, index): CircuitNode => ({ id, kind: "register", data: accumulated.sums[index], enable: "load", reset: "reset" })),
    { id: "last_carry", kind: "register", data: accumulated.carry, enable: "load", reset: "reset" },
  ],
  outputs: { ...Object.fromEntries(qNames.map(id => [id, id])), carry: "last_carry" },
};
const memoryPhases: SignalPhase[] = [
  { ticks: 3, inputs: { data: 0, load: 0, reset: 1 } },
  { ticks: 3, inputs: { data: 1, load: 1, reset: 0 } },
  { ticks: 4, inputs: { data: 0, load: 0, reset: 0 } },
  { ticks: 3, inputs: { data: 1, load: 1, reset: 1 } },
  { ticks: 3, inputs: { data: 0, load: 0, reset: 0 } },
];
const additions = [3, 5, 11, 15];
const accumulatorPhases: SignalPhase[] = [
  { ticks: 3, inputs: { ...bits(0, "b"), load: 0, reset: 1 } },
  ...additions.flatMap((value): SignalPhase[] => [
    { ticks: 16, inputs: { ...bits(value, "b"), load: 0, reset: 0 } },
    { ticks: 1, inputs: { ...bits(value, "b"), load: 1, reset: 0 } },
    { ticks: 2, inputs: { ...bits(value, "b"), load: 0, reset: 0 } },
  ]),
  { ticks: 3, inputs: { ...bits(0, "b"), load: 0, reset: 1 } },
];

export const CIRCUIT_STARTERS: CircuitStarter[] = [
  { id: "relay", name: "Relay", description: "Two NAND inversions carry a changing bit after propagation delay.", circuit: checkedCircuit(relay), phases: [0, 1, 0].map(value => ({ ticks: 5, inputs: { signal: value as Bit } })) },
  { id: "nand", name: "NAND gate", description: "The four input combinations of the shared Boolean primitive.", circuit: checkedCircuit(nand), phases: [{ ticks: 4, inputs: { a: 1, b: 1 } }] },
  { id: "memory", name: "Resettable memory", description: "A granted register loads, holds, and resets a bit; reset wins over load.", circuit: checkedCircuit(memory), phases: memoryPhases },
  { id: "adder", name: "Four-bit adder", description: "Thirty-six NAND gates add two four-bit words, including the carry bit.", circuit: checkedCircuit(adder), phases: [{ ticks: 32, inputs: { ...bits(9, "a"), ...bits(12, "b") } }] },
  { id: "accumulator", name: "Sequential accumulator", description: "Registers and the NAND adder compose: 0 + 3 + 5 + 11 + 15, with timed load pulses and reset.", circuit: checkedCircuit(accumulator), phases: accumulatorPhases },
];

type AssayCase = { label: string; phases: SignalPhase[]; expected: Record<string, Bit> };
function assayCases(id: CircuitStarterId): AssayCase[] {
  if (id === "relay") return [0, 1, 0].map((value, index) => ({ label: `Signal ${value} after transition ${index + 1}`, phases: CIRCUIT_STARTERS[0].phases.slice(0, index + 1), expected: { signal: value as Bit } }));
  if (id === "nand") return [0, 1].flatMap(a => [0, 1].map(b => ({ label: `${a} NAND ${b}`, phases: [{ ticks: 4, inputs: { a: a as Bit, b: b as Bit } }], expected: { out: (1 - a * b) as Bit } })));
  if (id === "memory") return [0, 1, 1, 0, 0].map((expected, index) => ({ label: ["Reset", "Load one", "Hold despite changed data", "Reset wins over simultaneous load", "Hold cleared state"][index], phases: memoryPhases.slice(0, index + 1), expected: { stored: expected as Bit } }));
  if (id === "adder") return Array.from({ length: 16 }, (_, a) => Array.from({ length: 16 }, (_, b) => ({ label: `${a} + ${b} = ${a + b}`, phases: [{ ticks: 32, inputs: { ...bits(a, "a"), ...bits(b, "b") } }], expected: { ...bits((a + b) % 16, "s"), carry: (a + b >= 16 ? 1 : 0) as Bit } }))).flat();
  const cases: AssayCase[] = [{ label: "Reset accumulator", phases: accumulatorPhases.slice(0, 1), expected: { ...bits(0, "q"), carry: 0 } }];
  let sum = 0;
  for (const [index, operand] of additions.entries()) {
    const full = sum + operand;
    cases.push({ label: `${sum} + ${operand} = ${full % 16}, carry ${full >= 16 ? 1 : 0}`, phases: accumulatorPhases.slice(0, 1 + (index + 1) * 3), expected: { ...bits(full % 16, "q"), carry: full >= 16 ? 1 : 0 } });
    sum = full % 16;
  }
  cases.push({ label: "Reset after accumulated overflow", phases: accumulatorPhases, expected: { ...bits(0, "q"), carry: 0 } });
  return cases;
}

/** Public finite fixtures are engineering checks, not hidden competition or research validation. */
export function assayCircuit(circuit: Circuit, starterId: CircuitStarterId): CircuitAssay {
  const starter = CIRCUIT_STARTERS.find(entry => entry.id === starterId);
  if (!starter) throw new Error("Unknown circuit assay.");
  circuit = checkedCircuit(circuit);
  const cases = assayCases(starterId);
  const report: CircuitAssay = { id: starterId, name: starter.name, passed: 0, total: cases.length, work: 0, ticksCompleted: 0, faults: 0, checks: [] };
  const requiredInputs = starter.circuit.nodes.filter(node => node.kind === "input").map(node => node.id).sort();
  const actualInputs = circuit.nodes.filter(node => node.kind === "input").map(node => node.id).sort();
  const requiredOutputs = Object.keys(starter.circuit.outputs).sort();
  if (JSON.stringify(requiredInputs) !== JSON.stringify(actualInputs) || requiredOutputs.some(output => !Object.hasOwn(circuit.outputs, output))) {
    report.firstFailure = { label: "Assay interface", passed: false, expected: {}, observed: {}, faults: 0, reason: `This assay needs input nodes ${requiredInputs.join(", ")} and outputs ${requiredOutputs.join(", ")}.` };
    return report;
  }
  for (const entry of cases) {
    const result = runCircuit(circuit, entry.phases);
    const passed = result.status === "complete" && result.faults === 0 && Object.entries(entry.expected).every(([port, value]) => result.outputs[port] === value);
    const check: AssayCheck = { label: entry.label, passed, expected: entry.expected, observed: result.outputs, faults: result.faults };
    if (result.faults) check.reason = "A broken wire was read; an accidentally correct output does not pass.";
    if (result.status !== "complete") check.reason = "The transition fuel budget was exhausted.";
    report.checks.push(check); report.passed += Number(passed); report.work += result.work; report.ticksCompleted += result.ticksCompleted; report.faults += result.faults;
    if (!passed && !report.firstFailure) report.firstFailure = check;
  }
  return report;
}

export function runCircuitAssays(): CircuitAssay[] { return CIRCUIT_STARTERS.map(starter => assayCircuit(starter.circuit, starter.id)); }
