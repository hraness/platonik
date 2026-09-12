import type { DirectionEdit, Receipt } from "./types";

export type CandidateGrade = {
  id: number;
  builder: number;
  child: number;
  blueprint: number;
  source: number;
  depot: number;
  trial_parcel: number;
  confirmation_parcel: number;
  seed_program_hash: string;
  program_hash: string | null;
  edits: DirectionEdit[];
  born: number | null;
  trial_pickup: number | null;
  trial_departed: number | null;
  trial_returned: number | null;
  trial_accepted: number | null;
  trial_serviced: number | null;
  confirmation_requested: number | null;
  confirmation_pickup: number | null;
  confirmation_accepted: number | null;
  confirmation_serviced: number | null;
  changed: boolean;
  family_passed: boolean;
  trial_passed: boolean;
  confirmation_passed: boolean;
};
export type BloomSelection = { tick: number; candidate: number; child: number; signal: number; parcel: number };
export type BloomGrade = {
  schema: "platonik-bloom-v1";
  experiment_hash: string;
  evidence_hash: string;
  result_hash: string | null;
  tick: number;
  horizon: number;
  phase: "in_progress" | "bloomed" | "finished_without_bloom";
  candidates: CandidateGrade[];
  selection: BloomSelection | null;
  generated_passed: boolean;
  trials_passed: boolean;
  selection_passed: boolean;
  confirmation_passed: boolean;
  service_passed: boolean;
  bloomed: boolean;
};

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: unknown, names: string[]): value is Record<string, unknown> => record(value)
  && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const integer = (value: unknown, maximum: number): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
const hash = (value: unknown) => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
const optionalTick = (value: unknown, tick: number) => value === null || integer(value, tick);
const milestones = ["born", "trial_pickup", "trial_departed", "trial_returned", "trial_accepted", "trial_serviced", "confirmation_requested", "confirmation_pickup", "confirmation_accepted", "confirmation_serviced"] as const;
const verdicts = ["generated_passed", "trials_passed", "selection_passed", "confirmation_passed", "service_passed", "bloomed"] as const;

export function isDirectionEdit(value: unknown, tick = 128): value is DirectionEdit {
  return exact(value, ["tick", "actor", "rule", "slot", "value", "before_hash", "after_hash", "bytes_written"])
    && integer(value.tick, tick) && value.tick > 0 && integer(value.actor, 0xffff)
    && integer(value.rule, 31) && integer(value.slot, 3) && integer(value.value, 3)
    && hash(value.before_hash) && hash(value.after_hash)
    && integer(value.bytes_written, 4096) && value.bytes_written > 0;
}
function candidate(value: unknown, tick: number): value is CandidateGrade {
  return exact(value, ["id", "builder", "child", "blueprint", "source", "depot", "trial_parcel", "confirmation_parcel", "seed_program_hash", "program_hash", "edits", ...milestones, "changed", "family_passed", "trial_passed", "confirmation_passed"])
    && integer(value.id, 1)
    && [value.builder, value.child, value.blueprint, value.source, value.depot].every(item => integer(item, 0xffff))
    && [value.trial_parcel, value.confirmation_parcel].every(item => integer(item, 0xffff_ffff))
    && hash(value.seed_program_hash) && (value.program_hash === null || hash(value.program_hash))
    && Array.isArray(value.edits) && value.edits.length <= 8 && value.edits.every(edit => isDirectionEdit(edit, tick))
    && milestones.every(name => optionalTick(value[name], tick))
    && [value.changed, value.family_passed, value.trial_passed, value.confirmation_passed].every(item => typeof item === "boolean");
}
function selection(value: unknown, tick: number): value is BloomSelection | null {
  return value === null || (exact(value, ["tick", "candidate", "child", "signal", "parcel"])
    && integer(value.tick, tick) && integer(value.candidate, 1) && integer(value.child, 0xffff)
    && integer(value.signal, Number.MAX_SAFE_INTEGER) && integer(value.parcel, 0xffff_ffff));
}

// This admits a published projection and binds it to its recorded receipt.
// Rust checks the edit derivation, physical trials, and causal selection.
export function isBloomGrade(value: unknown, receipt: Receipt): value is BloomGrade {
  if (!exact(value, ["schema", "experiment_hash", "evidence_hash", "result_hash", "tick", "horizon", "phase", "candidates", "selection", ...verdicts])
    || value.schema !== "platonik-bloom-v1" || !hash(value.evidence_hash)
    || receipt.protocol !== "platonik-habitat-v4"
    || value.experiment_hash !== receipt.experiment_hash || value.result_hash !== receipt.result_hash
    || value.tick !== receipt.result.frames.at(-1)?.tick || value.horizon !== receipt.experiment.ticks
    || !integer(value.tick, 128) || value.horizon !== 128
    || typeof value.phase !== "string" || !["bloomed", "finished_without_bloom"].includes(value.phase)
    || !verdicts.every(name => typeof value[name] === "boolean")
    || value.service_passed !== (receipt.result.status === "complete" && receipt.result.ticks_completed === 128 && receipt.result.outcome.passed)
    || !Array.isArray(value.candidates) || value.candidates.length !== 2
    || !selection(value.selection, value.tick)) return false;
  const tick = value.tick;
  if (!value.candidates.every(item => candidate(item, tick))
    || new Set(value.candidates.map(item => item.id)).size !== 2) return false;
  if (value.bloomed) return value.phase === "bloomed" && value.tick === value.horizon
    && receipt.result.status === "complete" && verdicts.every(name => value[name] === true)
    && value.selection !== null;
  return value.phase === "finished_without_bloom";
}

export function bloomAt(grade: BloomGrade, tick: number) {
  const reached = (value: number | null) => value !== null && value <= tick ? value : null;
  return {
    candidates: grade.candidates.map(item => ({
      id: item.id,
      edits: item.edits.filter(edit => edit.tick <= tick),
      born: reached(item.born),
      program_hash: item.born !== null && item.born <= tick ? item.program_hash : null,
      trial_pickup: reached(item.trial_pickup),
      trial_departed: reached(item.trial_departed),
      trial_returned: reached(item.trial_returned),
      trial_accepted: reached(item.trial_accepted),
      trial_serviced: reached(item.trial_serviced),
      confirmation_requested: reached(item.confirmation_requested),
      confirmation_pickup: reached(item.confirmation_pickup),
      confirmation_accepted: reached(item.confirmation_accepted),
      confirmation_serviced: reached(item.confirmation_serviced),
    })),
    selection: grade.selection && grade.selection.tick <= tick ? grade.selection : null,
    final: tick >= grade.tick,
  };
}
