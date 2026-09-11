/**
 * Finite-precision experiments with Grim's first two fuzzy Dualist systems.
 * Source: https://www.pgrim.org/articles/self-referenceandchaosinfuzzylogic.pdf
 * IEEE Transactions on Fuzzy Systems 1(4), 237–253 (1993), pp. 246–249.
 * Values are truth degrees in a chosen semantics, not probabilities.
 */
export type RuleId = "dualist" | "squared";
export type Schedule = "simultaneous" | "sequential";
export type TruthPair = [number, number];

export const TRUTH_LIMITS = {
  maxMapSize: 192,
  maxMapIterations: 192,
  maxTrajectorySteps: 4096,
  maxZoom: 16,
  maxRadius: Math.SQRT2,
} as const;

export interface ThresholdMapOptions {
  rule: RuleId;
  schedule: Schedule;
  iterations: number;
  radius: number;
  size: number;
  center: TruthPair;
  zoom: number;
}

export interface ThresholdMapResult {
  counts: Uint16Array;
  size: number;
  iterations: number;
  domain: { xMin: number; xMax: number; yMin: number; yMax: number };
}

function bounded(value: number, min: number, max: number, name: string) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be finite and between ${min} and ${max}.`);
  }
}

function integer(value: number, min: number, max: number, name: string) {
  bounded(value, min, max, name);
  if (!Number.isInteger(value)) throw new RangeError(`${name} must be an integer.`);
}

function validatePair(pair: TruthPair, name: string) {
  if (!Array.isArray(pair) || pair.length !== 2) {
    throw new RangeError(`${name} must contain exactly two truth degrees.`);
  }
  bounded(pair[0], 0, 1, `${name} x`);
  bounded(pair[1], 0, 1, `${name} y`);
}

function validateSystem(rule: RuleId, schedule: Schedule) {
  if (rule !== "dualist" && rule !== "squared") throw new RangeError("Unknown truth rule.");
  if (schedule !== "simultaneous" && schedule !== "sequential") {
    throw new RangeError("Unknown update schedule.");
  }
}

// Inputs are validated at the public boundary. Reusing this pair keeps map
// generation bounded without allocating a new array for every iteration.
function advance(pair: TruthPair, rule: RuleId, schedule: Schedule) {
  const [x, y] = pair;
  const difference = x - y;
  const nextX = rule === "dualist" ? 1 - Math.abs(difference) : difference * difference;
  const sourceX = schedule === "simultaneous" ? x : nextX;
  const negatedX = 1 - sourceX;
  const nextY = rule === "dualist"
    ? 1 - Math.abs(y - negatedX * negatedX)
    : Math.sqrt(Math.abs(y - negatedX));
  pair[0] = nextX;
  pair[1] = nextY;
}

export function truthStep(x: number, y: number, rule: RuleId, schedule: Schedule): TruthPair {
  const pair: TruthPair = [x, y];
  validatePair(pair, "Seed");
  validateSystem(rule, schedule);
  advance(pair, rule, schedule);
  return pair;
}

/** Includes an independent copy of the seed. Uses Float64 with no added noise. */
export function trajectory(
  seed: TruthPair,
  rule: RuleId,
  schedule: Schedule,
  steps: number,
): TruthPair[] {
  validatePair(seed, "Seed");
  validateSystem(rule, schedule);
  integer(steps, 0, TRUTH_LIMITS.maxTrajectorySteps, "Steps");
  const result: TruthPair[] = [[seed[0], seed[1]]];
  for (let step = 0; step < steps; step++) {
    const previous = result[result.length - 1];
    const next: TruthPair = [previous[0], previous[1]];
    advance(next, rule, schedule);
    result.push(next);
  }
  return result;
}

/**
 * First post-update crossing of a radius about (0, 0), not escape to infinity.
 * Counts are 1..iterations, or 0 when no crossing was observed within the cap.
 * Samples include domain endpoints: row 0 is yMax, column 0 is xMin. A
 * singleton map samples that same upper-left corner. Edge windows shift to
 * retain width 1/zoom entirely within [0, 1].
 */
export function thresholdMap(options: ThresholdMapOptions): ThresholdMapResult {
  const { rule, schedule, iterations, radius, size, center, zoom } = options;
  validateSystem(rule, schedule);
  integer(iterations, 1, TRUTH_LIMITS.maxMapIterations, "Iterations");
  integer(size, 1, TRUTH_LIMITS.maxMapSize, "Size");
  bounded(radius, 0, TRUTH_LIMITS.maxRadius, "Radius");
  bounded(zoom, 1, TRUTH_LIMITS.maxZoom, "Zoom");
  validatePair(center, "Center");

  const width = 1 / zoom;
  const start = (coordinate: number) => Math.min(1 - width, Math.max(0, coordinate - width / 2));
  const xMin = start(center[0]);
  const yMin = start(center[1]);
  const xMax = Math.min(1, xMin + width);
  const yMax = Math.min(1, yMin + width);
  const counts = new Uint16Array(size * size);
  const divisions = Math.max(1, size - 1);
  const radiusSquared = radius * radius;
  const pair: TruthPair = [0, 0];

  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      pair[0] = xMin + (xMax - xMin) * column / divisions;
      pair[1] = yMax - (yMax - yMin) * row / divisions;
      for (let iteration = 1; iteration <= iterations; iteration++) {
        advance(pair, rule, schedule);
        if (pair[0] * pair[0] + pair[1] * pair[1] > radiusSquared) {
          counts[row * size + column] = iteration;
          break;
        }
      }
    }
  }

  return { counts, size, iterations, domain: { xMin, xMax, yMin, yMax } };
}
