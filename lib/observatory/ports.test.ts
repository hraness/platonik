import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { isContinuityReceipt, type ContinuityIndex } from "../bridge/continuity";
import { isPortsGrade, portsAt, type PortsGrade } from "../bridge/ports";

function projection() {
  // Synthetic metadata exercises display admission, not Rust custody semantics.
  const receipt = JSON.parse(readFileSync("public/construction/keeper-born.receipt.json", "utf8"));
  const grade: PortsGrade = {
    schema: "platonik-port-commitments-v1", experiment_hash: receipt.experiment_hash,
    evidence_hash: `sha256:${"a".repeat(64)}`, result_hash: receipt.result_hash,
    tick: 128, horizon: 128, phase: "complete",
    commitments: [0, 1].map(lane => ({
      lane, parcel: 20 + lane * 2, spare: 21 + lane * 2, bit: lane === 1,
      source: 10 + lane, courier: 5 + lane, requester: 7 + lane, depot: 20 + lane, beacon: 30 + lane,
      requested: { tick: 3 + lane, signal: 10 + lane }, picked_up: 10 + lane,
      accepted: 20 + lane, acknowledged: { tick: 40 + lane, signal: 50 + lane }, serviced: 23 + lane,
      custody_passed: true, acknowledgment_passed: true, spare_preserved: true, safety_passed: true,
      request_attempts: 9, ack_attempts: 7,
    })),
    custody_passed: true, acknowledgments_passed: true, safety_passed: true,
    service_passed: true, commitments_passed: true,
  };
  return { receipt, grade };
}

describe("recorded port commitments display", () => {
  test("separates reached custody and acknowledgment without leaking future attempts or verdicts", () => {
    const { receipt, grade } = projection();
    expect(isPortsGrade(grade, receipt)).toBe(true);
    expect(portsAt(grade, 0)).toEqual({ commitments: [0, 1].map(lane => ({ lane, requested: null, picked_up: null, accepted: null, acknowledged: null, serviced: null })), final: false });
    for (const item of grade.commitments) {
      for (const field of ["requested", "picked_up", "accepted", "acknowledged", "serviced"] as const) {
        const value = item[field]!;
        const tick = typeof value === "number" ? value : value.tick;
        expect(portsAt(grade, tick - 1).commitments[item.lane][field]).toBeNull();
        expect(portsAt(grade, tick).commitments[item.lane][field]).toEqual(value);
      }
    }
    const arrived = portsAt(grade, 24);
    expect(arrived.commitments.every(item => item.accepted !== null && item.serviced !== null)).toBe(true);
    expect(arrived.commitments.every(item => item.acknowledged === null)).toBe(true);
    expect(arrived.commitments[0]).not.toHaveProperty("request_attempts");
    expect(arrived.commitments[0]).not.toHaveProperty("safety_passed");
    expect(portsAt(grade, 127).final).toBe(false);
    expect(portsAt(grade, 128).final).toBe(true);
  });

  test("rejects mismatched identities and malformed nested grade fields before rendering", () => {
    for (const corrupt of [
      { schema: "next" }, { experiment_hash: `sha256:${"b".repeat(64)}` }, { result_hash: null },
      { evidence_hash: "bad" }, { tick: 127 }, { horizon: 129 }, { phase: "in_progress" },
      { phase: { toString: null } }, { custody_passed: "yes" }, { acknowledgments_passed: false },
      { service_passed: false }, { safety_passed: false }, { commitments: [] }, { extra: true },
    ]) {
      const { receipt, grade } = projection();
      expect(isPortsGrade({ ...grade, ...corrupt }, receipt)).toBe(false);
    }
    for (const corrupt of [
      { lane: 2 }, { parcel: -1 }, { spare: 2 ** 32 }, { bit: 1 }, { source: 65536 },
      { courier: {} }, { requester: -1 }, { depot: Infinity }, { beacon: "30" },
      { requested: {} }, { requested: { tick: 129, signal: 2 } },
      { acknowledged: { tick: 40, signal: 2 ** 53 } }, { acknowledged: { tick: 40, signal: 2, extra: true } },
      { picked_up: -1 }, { accepted: 129 }, { serviced: "23" }, { custody_passed: 1 },
      { acknowledgment_passed: null }, { spare_preserved: "yes" }, { safety_passed: [] },
      { request_attempts: 129 }, { ack_attempts: 1.5 }, { extra: true },
    ]) {
      const { receipt, grade } = projection();
      grade.commitments[0] = { ...grade.commitments[0], ...corrupt } as typeof grade.commitments[number];
      expect(isPortsGrade(grade, receipt)).toBe(false);
    }
    const { receipt, grade } = projection();
    grade.commitments[1].lane = 0;
    expect(isPortsGrade(grade, receipt)).toBe(false);
  });

  test("preserves failed acknowledgments even when parcels and physical service arrived", () => {
    const { receipt, grade } = projection();
    Object.assign(grade, { phase: "failed", commitments_passed: false, acknowledgments_passed: false });
    grade.commitments[0].acknowledged = null;
    grade.commitments[0].acknowledgment_passed = false;
    expect(isPortsGrade(grade, receipt)).toBe(true);
    expect(portsAt(grade, 128).commitments[0].accepted).toBe(20);
    expect(portsAt(grade, 128).commitments[0].acknowledged).toBeNull();
    // The display does not quietly turn a causally invalid moment into success.
    grade.commitments[0].acknowledged = { tick: 1, signal: 900 };
    expect(isPortsGrade(grade, receipt)).toBe(true);
    expect(grade.commitments_passed).toBe(false);
  });

  test("binds terminal loading or partial-frame failure to the last recorded frame", () => {
    const { receipt, grade } = projection();
    receipt.result.frames = receipt.result.frames.slice(0, 2);
    receipt.result.frames[1].complete = false;
    receipt.result.ticks_completed = 0;
    receipt.result.status = "fuel_exhausted";
    receipt.result.outcome.passed = false;
    Object.assign(grade, { tick: 1, phase: "failed", custody_passed: false, acknowledgments_passed: false, service_passed: false, commitments_passed: false });
    for (const item of grade.commitments) Object.assign(item, { requested: null, picked_up: null, accepted: null, acknowledged: null, serviced: null, custody_passed: false, acknowledgment_passed: false, request_attempts: 0, ack_attempts: 0 });
    expect(isPortsGrade(grade, receipt)).toBe(true);
    expect(isPortsGrade({ ...grade, tick: 0 }, receipt)).toBe(false);
    expect(portsAt(grade, 0).final).toBe(false);
    expect(portsAt(grade, 1).final).toBe(true);
  });

  test("admits all four required published port grades with exact recorded receipts", () => {
    const index = JSON.parse(readFileSync("public/ports/index.json", "utf8")) as ContinuityIndex;
    expect(index.cases).toHaveLength(4);
    for (const item of index.cases) {
      const receipt = JSON.parse(readFileSync(`public/ports/${item.id}.receipt.json`, "utf8"));
      expect(isContinuityReceipt(receipt)).toBe(true);
      expect(isPortsGrade(item.ports, receipt)).toBe(true);
      expect(item.result_hash).toBe(receipt.result_hash);
      expect(item.passed).toBe(item.ports?.service_passed);
      expect(portsAt(item.ports!, receipt.result.frames.at(-1).tick).final).toBe(true);
    }
  });
});
