import type { Receipt } from "./types";

export type ContinuityCase = {
  id: string;
  label: string;
  detail: string;
  passed: boolean;
  work: number;
  ticks: number;
  result_hash: string;
  uninterrupted_equal: boolean;
  restored_equal: boolean;
  cuts: { tick: number; label: string; detail: string; state_hash: string; costs_hash: string }[];
};

export type ContinuityIndex = {
  schema: "platonik-continuous-site-v1";
  cases: ContinuityCase[];
};

// This is a display boundary for committed evidence, not a Rust verifier.
export function isContinuityReceipt(value: unknown): value is Receipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<Receipt>;
  return receipt.schema === "platonik-receipt-v1" && receipt.protocol === "platonik-habitat-v2"
    && Boolean(receipt.experiment && receipt.result && Array.isArray(receipt.result.frames)
      && receipt.result.frames.length > 0 && receipt.result.frames.length <= 129);
}
