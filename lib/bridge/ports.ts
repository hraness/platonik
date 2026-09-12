import type { Receipt } from "./types";

export type PortReportMoment = { tick: number; signal: number };
export type CommitmentGrade = {
  lane: number;
  parcel: number;
  spare: number;
  bit: boolean;
  source: number;
  courier: number;
  requester: number;
  depot: number;
  beacon: number;
  requested: PortReportMoment | null;
  picked_up: number | null;
  accepted: number | null;
  acknowledged: PortReportMoment | null;
  serviced: number | null;
  custody_passed: boolean;
  acknowledgment_passed: boolean;
  spare_preserved: boolean;
  safety_passed: boolean;
  request_attempts: number;
  ack_attempts: number;
};
export type PortsGrade = {
  schema: "platonik-port-commitments-v1";
  experiment_hash: string;
  evidence_hash: string;
  result_hash: string | null;
  tick: number;
  horizon: number;
  phase: "in_progress" | "complete" | "failed";
  commitments: CommitmentGrade[];
  custody_passed: boolean;
  acknowledgments_passed: boolean;
  safety_passed: boolean;
  service_passed: boolean;
  commitments_passed: boolean;
};

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: unknown, names: string[]): value is Record<string, unknown> => record(value)
  && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const integer = (value: unknown, maximum: number): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
const hash = (value: unknown) => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
const moment = (value: unknown, tick: number) => value === null || (exact(value, ["tick", "signal"])
  && integer(value.tick, tick) && integer(value.signal, Number.MAX_SAFE_INTEGER));
const optionalTick = (value: unknown, tick: number) => value === null || integer(value, tick);

function commitment(value: unknown, tick: number): value is CommitmentGrade {
  return exact(value, ["lane", "parcel", "spare", "bit", "source", "courier", "requester", "depot", "beacon", "requested", "picked_up", "accepted", "acknowledged", "serviced", "custody_passed", "acknowledgment_passed", "spare_preserved", "safety_passed", "request_attempts", "ack_attempts"])
    && integer(value.lane, 1) && integer(value.parcel, 0xffff_ffff) && integer(value.spare, 0xffff_ffff)
    && typeof value.bit === "boolean"
    && [value.source, value.courier, value.requester, value.depot, value.beacon].every(item => integer(item, 0xffff))
    && moment(value.requested, tick) && moment(value.acknowledged, tick)
    && [value.picked_up, value.accepted, value.serviced].every(item => optionalTick(item, tick))
    && [value.custody_passed, value.acknowledgment_passed, value.spare_preserved, value.safety_passed].every(item => typeof item === "boolean")
    && integer(value.request_attempts, 128) && integer(value.ack_attempts, 128);
}

// Admit bounded published display data and bind it to the checked receipt.
// Causal custody, acknowledgment, and safety verdicts are computed in Rust.
export function isPortsGrade(value: unknown, receipt: Receipt): value is PortsGrade {
  if (!exact(value, ["schema", "experiment_hash", "evidence_hash", "result_hash", "tick", "horizon", "phase", "commitments", "custody_passed", "acknowledgments_passed", "safety_passed", "service_passed", "commitments_passed"])
    || value.schema !== "platonik-port-commitments-v1" || !hash(value.evidence_hash)
    || value.experiment_hash !== receipt.experiment_hash || value.result_hash !== receipt.result_hash
    || value.tick !== receipt.result.frames.at(-1)?.tick || value.horizon !== receipt.experiment.ticks
    || !integer(value.tick, 128) || value.horizon !== 128
    || typeof value.phase !== "string" || !["complete", "failed"].includes(value.phase)
    || ![value.custody_passed, value.acknowledgments_passed, value.safety_passed, value.service_passed, value.commitments_passed].every(item => typeof item === "boolean")
    || value.service_passed !== (receipt.result.status === "complete" && receipt.result.outcome.passed)
    || !Array.isArray(value.commitments) || value.commitments.length !== 2) return false;
  const tick = value.tick;
  if (!value.commitments.every(item => commitment(item, tick))
    || new Set(value.commitments.map(item => item.lane)).size !== 2) return false;
  if (value.commitments_passed) return value.phase === "complete" && value.tick === value.horizon
    && receipt.result.status === "complete" && value.custody_passed === true
    && value.acknowledgments_passed === true && value.safety_passed === true && value.service_passed === true;
  return value.phase === "failed";
}

export function portsAt(grade: PortsGrade, tick: number) {
  const reached = (value: number | null) => value !== null && value <= tick ? value : null;
  const report = (value: PortReportMoment | null) => value && value.tick <= tick ? value : null;
  return {
    commitments: grade.commitments.map(item => ({
      lane: item.lane,
      requested: report(item.requested),
      picked_up: reached(item.picked_up),
      accepted: reached(item.accepted),
      acknowledged: report(item.acknowledged),
      serviced: reached(item.serviced),
    })),
    final: tick >= grade.tick,
  };
}
