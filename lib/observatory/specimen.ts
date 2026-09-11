/** A bounded browser demonstrator. This is not the proposed Rust game VM. */
export type Direction = "north" | "east" | "south" | "west";
export type RelativeDirection = "forward" | "left" | "right" | "back";
export type Sensor =
  | "home" | "spark" | "carrying"
  | "blocked.forward" | "blocked.left" | "blocked.right" | "blocked.back";
export type Condition =
  | { sensor: Sensor; is: boolean }
  | { memory: number; equals: number }
  | { heading: Direction };
export type Action =
  | { kind: "move"; direction: RelativeDirection }
  | { kind: "turn"; direction: "left" | "right" | "back" }
  | { kind: "pickup" | "drop" | "wait" }
  | { kind: "write"; slot: number; value: number };
export type Rule = {
  when: Condition[];
  action: Action;
  remember?: { slot: number; value: number };
};
export type Program = { version: 1; rules: Rule[] };
export type Point = { x: number; y: number };
export type ProgramMetrics = {
  instructions: number;
  branches: number;
  memorySlots: number;
  sensors: number;
  bytes: number;
};
export type ExperimentStats = {
  rulesVisited: number;
  conditionChecks: number;
  sensorReads: number;
  memoryReads: number;
  memoryWrites: number;
  actionAttempts: number;
  failedActions: number;
  moves: number;
  terrainReads: number;
  stateWrites: number;
};
export type TraceFrame = Point & {
  tick: number;
  heading: Direction;
  carrying: boolean;
  delivered: number;
  sourceRemaining: number;
  action: string;
  selectedRule: number | null;
  work: number;
  deltaWork: number;
  memory: number[];
};
export type ExperimentResult = {
  model: "courier-lab-v1";
  seed: number;
  ticks: number;
  world: { width: number; height: number; walls: Point[]; source: Point; home: Point; initialSparks: number };
  trace: TraceFrame[];
  deliveries: number;
  remainingSparks: number;
  carrying: boolean;
  primitiveWork: number;
  stats: ExperimentStats;
  metrics: ProgramMetrics;
};

const DIRECTIONS: Direction[] = ["north", "east", "south", "west"];
const RELATIVE: RelativeDirection[] = ["forward", "left", "right", "back"];
const SENSORS: Sensor[] = ["home", "spark", "carrying", "blocked.forward", "blocked.left", "blocked.right", "blocked.back"];
const OFFSETS: Record<Direction, Point> = {
  north: { x: 0, y: -1 }, east: { x: 1, y: 0 }, south: { x: 0, y: 1 }, west: { x: -1, y: 0 },
};
const MAX_BYTES = 16_384;
const MAX_RULES = 24;
const MAX_CONDITIONS = 8;
const MAX_TICKS = 256;
const bytes = (text: string) => new TextEncoder().encode(text).length;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, required: string[], optional: string[] = []) =>
  required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const contains = <T extends string>(values: T[], value: unknown): value is T => typeof value === "string" && values.includes(value as T);

function validateWrite(value: unknown): value is { slot: number; value: number } {
  return isRecord(value) && exactKeys(value, ["slot", "value"]) && integer(value.slot, 0, 3) && integer(value.value, 0, 255);
}

function parseCondition(value: unknown): Condition | null {
  if (!isRecord(value)) return null;
  if (exactKeys(value, ["sensor", "is"]) && contains(SENSORS, value.sensor) && typeof value.is === "boolean") {
    return { sensor: value.sensor, is: value.is };
  }
  if (exactKeys(value, ["memory", "equals"]) && integer(value.memory, 0, 3) && integer(value.equals, 0, 255)) {
    return { memory: value.memory, equals: value.equals };
  }
  if (exactKeys(value, ["heading"]) && contains(DIRECTIONS, value.heading)) return { heading: value.heading };
  return null;
}

function parseAction(value: unknown): Action | null {
  if (!isRecord(value)) return null;
  if (exactKeys(value, ["kind", "direction"]) && value.kind === "move" && contains(RELATIVE, value.direction)) {
    return { kind: "move", direction: value.direction };
  }
  if (exactKeys(value, ["kind", "direction"]) && value.kind === "turn" && contains(["left", "right", "back"], value.direction)) {
    return { kind: "turn", direction: value.direction as "left" | "right" | "back" };
  }
  if (exactKeys(value, ["kind"]) && contains(["pickup", "drop", "wait"], value.kind)) {
    return { kind: value.kind as "pickup" | "drop" | "wait" };
  }
  if (exactKeys(value, ["kind", "slot", "value"]) && value.kind === "write" && integer(value.slot, 0, 3) && integer(value.value, 0, 255)) {
    return { kind: "write", slot: value.slot, value: value.value };
  }
  return null;
}

export function parseProgram(input: string): { ok: true; program: Program } | { ok: false; error: string } {
  if (input.length > MAX_BYTES || bytes(input) > MAX_BYTES) return { ok: false, error: "Program exceeds the 16 KiB input limit." };
  let value: unknown;
  try { value = JSON.parse(input); } catch { return { ok: false, error: "Enter valid JSON with version: 1 and a rules array." }; }
  if (!isRecord(value) || !exactKeys(value, ["version", "rules"]) || value.version !== 1 || !Array.isArray(value.rules) || value.rules.length < 1 || value.rules.length > MAX_RULES) {
    return { ok: false, error: "Expected version: 1 and between 1 and 24 rules; no extra program fields." };
  }
  const rules: Rule[] = [];
  for (const [index, raw] of value.rules.entries()) {
    const prefix = `Rule ${index + 1}: `;
    if (!isRecord(raw) || !exactKeys(raw, ["when", "action"], ["remember"]) || !Array.isArray(raw.when) || raw.when.length > MAX_CONDITIONS) {
      return { ok: false, error: prefix + "expected when (0–8 conditions), action, and optional remember." };
    }
    const when: Condition[] = [];
    for (const condition of raw.when) {
      const parsed = parseCondition(condition);
      if (!parsed) return { ok: false, error: prefix + "invalid condition. Use a local sensor/is, heading, or memory/equals pair; slots are 0–3 and values 0–255." };
      when.push(parsed);
    }
    const action = parseAction(raw.action);
    if (!action) return { ok: false, error: prefix + "invalid action. Use move, turn, pickup, drop, wait, or write; all fields are checked." };
    const rule: Rule = { when, action };
    if (Object.hasOwn(raw, "remember")) {
      if (!validateWrite(raw.remember)) return { ok: false, error: prefix + "remember requires slot 0–3 and value 0–255." };
      rule.remember = { slot: raw.remember.slot, value: raw.remember.value };
    }
    rules.push(rule);
  }
  return { ok: true, program: { version: 1, rules } };
}

/** Canonical serialization removes whitespace/key-order variation, not semantic equivalence. */
export function canonicalProgram(program: Program): string {
  const checked = parseProgram(JSON.stringify(program));
  if (!checked.ok) throw new Error(checked.error);
  return JSON.stringify(checked.program);
}

/** Syntactic counts, not Kolmogorov complexity or measurements of intelligence. */
export function describeProgram(program: Program): ProgramMetrics {
  const memory = new Set<number>();
  const sensors = new Set<string>();
  let branches = 0;
  let instructions = 0;
  for (const rule of program.rules) {
    instructions += 2 + rule.when.length + (rule.remember ? 1 : 0);
    branches += rule.when.length;
    for (const condition of rule.when) {
      if ("sensor" in condition) sensors.add(condition.sensor);
      else if ("memory" in condition) memory.add(condition.memory);
      else sensors.add("heading");
    }
    if (rule.action.kind === "write") memory.add(rule.action.slot);
    if (rule.remember) memory.add(rule.remember.slot);
  }
  return { instructions, branches, memorySlots: memory.size, sensors: sensors.size, bytes: bytes(canonicalProgram(program)) };
}

const blocked = (direction: RelativeDirection): Condition => ({ sensor: `blocked.${direction}`, is: false });
const serviceRules = (): Rule[] => [
  { when: [{ sensor: "carrying", is: true }, { sensor: "home", is: true }], action: { kind: "drop" } },
  { when: [{ sensor: "carrying", is: false }, { sensor: "spark", is: true }], action: { kind: "pickup" } },
];
const wallRules = (side: "left" | "right"): Rule[] => [
  { when: [blocked(side)], action: { kind: "move", direction: side } },
  { when: [blocked("forward")], action: { kind: "move", direction: "forward" } },
  { when: [blocked(side === "left" ? "right" : "left")], action: { kind: "move", direction: side === "left" ? "right" : "left" } },
  { when: [], action: { kind: "move", direction: "back" } },
];

export const STARTERS: { id: string; name: string; description: string; program: Program }[] = [
  {
    id: "moth", name: "Moth", description: "Keeps moving forward; turns right when blocked. Small, but easily caught in a loop.",
    program: { version: 1, rules: [...serviceRules(), { when: [blocked("forward")], action: { kind: "move", direction: "forward" } }, { when: [], action: { kind: "turn", direction: "right" } }] },
  },
  {
    id: "moss", name: "Moss", description: "Follows the right wall. A local strategy that explores this connected maze.",
    program: { version: 1, rules: [...serviceRules(), ...wallRules("right")] },
  },
  {
    id: "reed", name: "Reed", description: "Remembers a pickup, turns around, and follows the opposite wall on the way home.",
    program: {
      version: 1,
      rules: [
        { when: [{ sensor: "carrying", is: true }, { sensor: "home", is: true }], action: { kind: "drop" }, remember: { slot: 0, value: 1 } },
        { when: [{ sensor: "carrying", is: false }, { sensor: "spark", is: true }], action: { kind: "pickup" }, remember: { slot: 0, value: 1 } },
        { when: [{ memory: 0, equals: 1 }], action: { kind: "turn", direction: "back" }, remember: { slot: 0, value: 0 } },
        ...wallRules("left").map((rule): Rule => ({ ...rule, when: [{ sensor: "carrying", is: true }, ...rule.when] })),
        ...wallRules("right"),
      ],
    },
  },
];

/** One reproducible edit, never a promise of improvement; the parent remains intact. */
export function mutateProgram(program: Program, seed: number): Program {
  if (!integer(seed, 0, 0xffff_ffff)) throw new Error("Seed must be an unsigned 32-bit integer.");
  const parsed = parseProgram(canonicalProgram(program));
  if (!parsed.ok) throw new Error(parsed.error);
  const child = parsed.program;
  const mixed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b) >>> 0;
  const rule = child.rules[mixed % child.rules.length];
  const action = rule.action;
  if (action.kind === "move" || action.kind === "turn") {
    const choices = (action.kind === "move" ? RELATIVE : ["left", "right", "back"] as const).filter((direction) => direction !== action.direction);
    const direction = choices[Math.floor(mixed / child.rules.length) % choices.length];
    const previous = action.direction;
    rule.action = action.kind === "move" ? { kind: "move", direction } : { kind: "turn", direction: direction as "left" | "right" | "back" };
    rule.when = rule.when.map((condition) => "sensor" in condition && condition.sensor === `blocked.${previous}`
      ? { sensor: `blocked.${direction}`, is: condition.is } : condition);
  } else if (action.kind === "write") {
    rule.action = { ...action, value: (action.value + 1 + mixed % 255) % 256 };
  } else {
    rule.action = { kind: "turn", direction: mixed % 2 ? "left" : "right" };
  }
  return child;
}

function face(heading: Direction, direction: RelativeDirection): Direction {
  const delta = { forward: 0, right: 1, back: 2, left: 3 }[direction];
  return DIRECTIONS[(DIRECTIONS.indexOf(heading) + delta) % 4];
}

function makeWorld(seed: number): ExperimentResult["world"] {
  const width = 15;
  const height = 11;
  const cells = Array.from({ length: height }, () => Array<boolean>(width).fill(true));
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
  const home = { x: 1, y: 1 };
  const source = { x: 13, y: 9 };
  const stack: Point[] = [home];
  cells[home.y][home.x] = false;
  while (stack.length) {
    const current = stack[stack.length - 1];
    const choices = DIRECTIONS.map((direction) => ({ x: current.x + OFFSETS[direction].x * 2, y: current.y + OFFSETS[direction].y * 2 }))
      .filter(({ x, y }) => x > 0 && y > 0 && x < width - 1 && y < height - 1 && cells[y][x]);
    if (!choices.length) { stack.pop(); continue; }
    const next = choices[Math.floor(random() * choices.length)];
    cells[(current.y + next.y) / 2][(current.x + next.x) / 2] = false;
    cells[next.y][next.x] = false;
    stack.push(next);
  }
  const walls: Point[] = [];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) if (cells[y][x]) walls.push({ x, y });
  return { width, height, walls, home, source, initialSparks: 4 };
}

/** No hidden position/goal sensor is available to programs. The observer receives the map. */
export function runExperiment(program: Program, seed: number, ticks = MAX_TICKS): ExperimentResult {
  if (!integer(seed, 0, 0xffff_ffff)) throw new Error("Seed must be an unsigned 32-bit integer.");
  if (!integer(ticks, 1, MAX_TICKS)) throw new Error("Tick budget must be an integer from 1 to 256.");
  const checked = parseProgram(JSON.stringify(program));
  if (!checked.ok) throw new Error(checked.error);
  program = checked.program;
  const world = makeWorld(seed);
  const walls = new Set(world.walls.map(({ x, y }) => `${x},${y}`));
  let position: Point = { ...world.home };
  let heading: Direction = "east";
  let carrying = false;
  let delivered = 0;
  let sourceRemaining = world.initialSparks;
  let work = 0;
  const memory = [0, 0, 0, 0];
  const stats: ExperimentStats = {
    rulesVisited: 0, conditionChecks: 0, sensorReads: 0, memoryReads: 0, memoryWrites: 0,
    actionAttempts: 0, failedActions: 0, moves: 0, terrainReads: 0, stateWrites: 0,
  };
  const charge = (stat: keyof ExperimentStats) => { stats[stat] += 1; work += 1; };
  const at = (point: Point) => position.x === point.x && position.y === point.y;
  const target = (direction: RelativeDirection) => {
    const absolute = face(heading, direction);
    return { x: position.x + OFFSETS[absolute].x, y: position.y + OFFSETS[absolute].y };
  };
  const isBlocked = (point: Point) => point.x < 0 || point.y < 0 || point.x >= world.width || point.y >= world.height || walls.has(`${point.x},${point.y}`);
  const observe = (sensor: Sensor) => {
    charge("sensorReads");
    if (sensor === "home") return at(world.home);
    if (sensor === "spark") return at(world.source) && sourceRemaining > 0;
    if (sensor === "carrying") return carrying;
    return isBlocked(target(sensor.slice(8) as RelativeDirection));
  };
  const matches = (condition: Condition) => {
    charge("conditionChecks");
    if ("sensor" in condition) return observe(condition.sensor) === condition.is;
    if ("memory" in condition) { charge("memoryReads"); return memory[condition.memory] === condition.equals; }
    charge("sensorReads");
    return heading === condition.heading;
  };
  const write = (slot: number, value: number) => { charge("memoryWrites"); memory[slot] = value; };
  const trace: TraceFrame[] = [{ ...position, tick: 0, heading, carrying, delivered, sourceRemaining, action: "start", selectedRule: null, work: 0, deltaWork: 0, memory: [...memory] }];
  for (let tick = 1; tick <= ticks; tick += 1) {
    const previousWork = work;
    let selectedRule: number | null = null;
    for (let index = 0; index < program.rules.length; index += 1) {
      charge("rulesVisited");
      if (program.rules[index].when.every(matches)) { selectedRule = index; break; }
    }
    const rule = selectedRule === null ? undefined : program.rules[selectedRule];
    const action: Action = rule?.action ?? { kind: "wait" };
    charge("actionAttempts");
    let failed = false;
    if (action.kind === "move") {
      charge("terrainReads");
      const next = target(action.direction);
      if (isBlocked(next)) failed = true;
      else {
        charge("stateWrites"); position = next;
        charge("stateWrites"); heading = face(heading, action.direction);
        stats.moves += 1;
      }
    } else if (action.kind === "turn") {
      charge("stateWrites"); heading = face(heading, action.direction);
    } else if (action.kind === "pickup") {
      charge("sensorReads");
      if (!carrying && sourceRemaining > 0 && at(world.source)) {
        charge("stateWrites"); carrying = true;
        charge("stateWrites"); sourceRemaining -= 1;
      } else failed = true;
    } else if (action.kind === "drop") {
      charge("sensorReads");
      if (carrying && at(world.home)) {
        charge("stateWrites"); carrying = false;
        charge("stateWrites"); delivered += 1;
      } else failed = true;
    } else if (action.kind === "write") write(action.slot, action.value);
    if (failed) stats.failedActions += 1;
    if (rule?.remember) write(rule.remember.slot, rule.remember.value);
    const label = "direction" in action ? `${action.kind} ${action.direction}` : action.kind === "write" ? `write ${action.slot} = ${action.value}` : action.kind;
    trace.push({ ...position, tick, heading, carrying, delivered, sourceRemaining, action: failed ? `${label} (blocked)` : label, selectedRule, work, deltaWork: work - previousWork, memory: [...memory] });
  }
  return { model: "courier-lab-v1", seed, ticks, world, trace, deliveries: delivered, remainingSparks: sourceRemaining, carrying, primitiveWork: work, stats, metrics: describeProgram(program) };
}
