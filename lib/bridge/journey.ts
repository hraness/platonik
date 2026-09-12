import type { Receipt } from "./types";

export const journeyKinds = ["crew_supplied", "keeper_born", "reply_born", "matching_reply"] as const;
export type JourneyKind = typeof journeyKinds[number];
export type JourneyMilestone = { kind: JourneyKind; tick: number; cell: number | null; spark: number | null; signal: number | null };
export type FirstAnswerJourney = {
  schema: "platonik-first-answer-v1";
  experiment_hash: string;
  evidence_hash: string;
  result_hash: string | null;
  tick: number;
  horizon: number;
  phase: "in_progress" | "answered" | "finished_without_answer";
  service_passed: boolean;
  answered: boolean;
  milestones: JourneyMilestone[];
  answer: string | null;
};

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: unknown, names: string[]): value is Record<string, unknown> => record(value)
  && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const integer = (value: unknown, maximum: number): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
const hash = (value: unknown) => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
const optionalId = (value: unknown, maximum: number) => value === null || integer(value, maximum);

// Display admission binds the published Rust grade to its loaded receipt.
// It does not recreate the answer predicate or claim cryptographic verification.
export function isFirstAnswerJourney(value: unknown, receipt: Receipt): value is FirstAnswerJourney {
  if (!exact(value, ["schema", "experiment_hash", "evidence_hash", "result_hash", "tick", "horizon", "phase", "service_passed", "answered", "milestones", "answer"])
    || value.schema !== "platonik-first-answer-v1" || !hash(value.evidence_hash)
    || value.experiment_hash !== receipt.experiment_hash || value.result_hash !== receipt.result_hash
    || value.tick !== receipt.result.frames.at(-1)?.tick || value.horizon !== receipt.experiment.ticks
    || !integer(value.tick, 128) || !integer(value.horizon, 128)
    || typeof value.service_passed !== "boolean" || typeof value.answered !== "boolean"
    || typeof value.phase !== "string" || !["answered", "finished_without_answer"].includes(value.phase)
    || value.service_passed !== (receipt.result.status === "complete" && receipt.result.outcome.passed)
    || !Array.isArray(value.milestones) || value.milestones.length > journeyKinds.length
    || !(value.answer === null || (typeof value.answer === "string" && value.answer.length > 0 && value.answer.length <= 512))) return false;
  const seen = new Set<string>();
  for (const milestone of value.milestones) {
    if (!exact(milestone, ["kind", "tick", "cell", "spark", "signal"])
      || typeof milestone.kind !== "string" || !journeyKinds.includes(milestone.kind as JourneyKind) || seen.has(milestone.kind)
      || !integer(milestone.tick, value.tick)
      || !optionalId(milestone.cell, 65_535) || !optionalId(milestone.spark, 0xffff_ffff)
      || !optionalId(milestone.signal, Number.MAX_SAFE_INTEGER)) return false;
    seen.add(milestone.kind);
  }
  if (value.answered) return value.phase === "answered" && value.service_passed && receipt.result.outcome.passed
    && receipt.result.status === "complete" && value.tick === value.horizon && value.answer !== null
    && journeyKinds.every(kind => seen.has(kind));
  return value.phase === "finished_without_answer" && value.answer === null;
}

export function journeyAt(journey: FirstAnswerJourney, tick: number) {
  return {
    milestones: journey.milestones.filter(milestone => milestone.tick <= tick),
    answer: journey.answered && tick >= journey.horizon ? journey.answer : null,
  };
}
