import type { Receipt } from "./types";

export type ArkOutput = { index: number; tick: number; bit: boolean; signal: number };
export type ArkGrade = {
  schema: "platonik-ark-control-v1";
  experiment_hash: string;
  evidence_hash: string;
  result_hash: string | null;
  tick: number;
  horizon: number;
  phase: "in_progress" | "complete" | "failed";
  plan: "sum_lsb" | "carry";
  declared_a: number;
  declared_b: number;
  expected_sum: number;
  observed_sum: number | null;
  outputs: ArkOutput[];
  arithmetic_passed: boolean;
  selected: ArkOutput | null;
  retained: boolean;
  decision: { tick: number; bit: boolean; delivered: boolean } | null;
  service_passed: boolean;
  control_passed: boolean;
};

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: unknown, names: string[]): value is Record<string, unknown> => record(value)
  && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const integer = (value: unknown, maximum: number): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
const hash = (value: unknown) => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
const output = (value: unknown, tick: number): value is ArkOutput => exact(value, ["index", "tick", "bit", "signal"])
  && integer(value.index, 127) && integer(value.tick, tick) && typeof value.bit === "boolean" && integer(value.signal, Number.MAX_SAFE_INTEGER);

// Bounded display admission binds the published Rust grade to its receipt.
// Arithmetic and causal execution are checked in Rust, not recreated here.
export function isArkGrade(value: unknown, receipt: Receipt): value is ArkGrade {
  if (!exact(value, ["schema", "experiment_hash", "evidence_hash", "result_hash", "tick", "horizon", "phase", "plan", "declared_a", "declared_b", "expected_sum", "observed_sum", "outputs", "arithmetic_passed", "selected", "retained", "decision", "service_passed", "control_passed"])
    || value.schema !== "platonik-ark-control-v1" || !hash(value.evidence_hash)
    || value.experiment_hash !== receipt.experiment_hash || value.result_hash !== receipt.result_hash
    || value.tick !== receipt.result.frames.at(-1)?.tick || value.horizon !== receipt.experiment.ticks
    || !integer(value.tick, 128) || value.horizon !== 128
    || typeof value.phase !== "string" || !["complete", "failed"].includes(value.phase)
    || typeof value.plan !== "string" || !["sum_lsb", "carry"].includes(value.plan)
    || !integer(value.declared_a, 15) || !integer(value.declared_b, 15) || !integer(value.expected_sum, 30)
    || !(value.observed_sum === null || integer(value.observed_sum, 31))
    || ![value.arithmetic_passed, value.retained, value.service_passed, value.control_passed].every(item => typeof item === "boolean")
    || value.service_passed !== (receipt.result.status === "complete" && receipt.result.outcome.passed)
    || !Array.isArray(value.outputs) || value.outputs.length > 128) return false;
  const tick = value.tick;
  if (!value.outputs.every((item, index) => output(item, tick) && item.index === index)
    || (value.outputs.length === 5) !== (value.observed_sum !== null)
    || (value.arithmetic_passed && (value.outputs.length !== 5 || value.observed_sum === null))) return false;
  if (value.selected !== null && (!output(value.selected, tick) || value.selected.index !== (value.plan === "carry" ? 4 : 0))) return false;
  if (value.decision !== null && (!exact(value.decision, ["tick", "bit", "delivered"])
    || !integer(value.decision.tick, tick) || typeof value.decision.bit !== "boolean" || typeof value.decision.delivered !== "boolean")) return false;
  if (value.control_passed) return value.phase === "complete" && value.tick === value.horizon
    && receipt.result.status === "complete" && value.arithmetic_passed === true && value.service_passed === true
    && value.retained === true && value.selected !== null && value.decision !== null && value.decision.delivered === true;
  return value.phase === "failed";
}

export function arkAt(grade: ArkGrade, tick: number) {
  return {
    outputs: grade.outputs.filter(output => output.tick <= tick),
    selected: grade.selected && grade.selected.tick <= tick ? grade.selected : null,
    decision: grade.decision && grade.decision.tick <= tick ? grade.decision : null,
    final: tick >= grade.tick,
  };
}
