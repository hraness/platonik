import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { isContinuityReceipt, type ContinuityIndex } from "../bridge/continuity";
import { isFirstAnswerJourney, journeyAt, type FirstAnswerJourney } from "../bridge/journey";

function projection() {
  // Synthetic grade exercises display admission and reveal timing only; this
  // fixture does not assert that the construction receipt earned an answer.
  const receipt = JSON.parse(readFileSync("public/construction/keeper-born.receipt.json", "utf8"));
  const journey: FirstAnswerJourney = {
    schema: "platonik-first-answer-v1", experiment_hash: receipt.experiment_hash,
    evidence_hash: `sha256:${"a".repeat(64)}`, result_hash: receipt.result_hash,
    tick: 128, horizon: 128, phase: "answered", service_passed: true, answered: true,
    milestones: [
      { kind: "keeper_born", tick: 17, cell: 3, spark: null, signal: null },
      { kind: "reply_born", tick: 38, cell: 6, spark: null, signal: null },
      { kind: "crew_supplied", tick: 105, cell: 1, spark: 6, signal: null },
      { kind: "matching_reply", tick: 109, cell: 7, spark: 6, signal: 24 },
    ],
    answer: "An authored ending earned by a checked journey.",
  };
  return { receipt, journey };
}

describe("recorded First Answer display", () => {
  test("delays the authored answer until the horizon while showing only reached milestones", () => {
    const { receipt, journey } = projection();
    expect(isFirstAnswerJourney(journey, receipt)).toBe(true);
    expect(journeyAt(journey, 0)).toEqual({ milestones: [], answer: null });
    expect(journeyAt(journey, 17).milestones.map(item => item.kind)).toEqual(["keeper_born"]);
    expect(journeyAt(journey, 109).milestones).toEqual(journey.milestones);
    expect(journeyAt(journey, 109).answer).toBeNull();
    expect(journeyAt(journey, 127).answer).toBeNull();
    expect(journeyAt(journey, 128).answer).toBe(journey.answer);
  });

  test("rejects mismatched identities, invalid display fields and premature answer claims", () => {
    const corruptions = [
      { experiment_hash: `sha256:${"b".repeat(64)}` },
      { result_hash: `sha256:${"b".repeat(64)}` },
      { evidence_hash: "not-a-hash" }, { schema: "future-schema" },
      { phase: { toString: null } }, { tick: 109 }, { horizon: 129 },
      { answer: "x".repeat(513) }, { answer: null }, { service_passed: false },
      { milestones: [] }, { future: true }, { answered: "yes" },
    ];
    for (const corrupt of corruptions) {
      const { receipt, journey } = projection();
      expect(isFirstAnswerJourney({ ...journey, ...corrupt }, receipt)).toBe(false);
    }
    for (const corrupt of [{ kind: "future" }, { tick: 129 }, { cell: -1 }, { spark: 2 ** 32 }, { signal: 2 ** 53 }, { extra: true }]) {
      const { receipt, journey } = projection();
      const malformed = { ...journey, milestones: [{ ...journey.milestones[0], ...corrupt }, ...journey.milestones.slice(1)] };
      expect(isFirstAnswerJourney(malformed, receipt)).toBe(false);
    }
    const { receipt, journey } = projection();
    journey.milestones[1] = { ...journey.milestones[0] };
    expect(isFirstAnswerJourney(journey, receipt)).toBe(false);
  });

  test("retains a service-passing journey that did not earn its answer", () => {
    const { receipt, journey } = projection();
    journey.answered = false;
    journey.answer = null;
    journey.phase = "finished_without_answer";
    journey.milestones = journey.milestones.slice(0, 3);
    expect(isFirstAnswerJourney(journey, receipt)).toBe(true);
    expect(journeyAt(journey, 128).answer).toBeNull();
  });

  test("uses the final recorded tick when fuel stopped an incomplete tick", () => {
    const { receipt, journey } = projection();
    receipt.result.frames = receipt.result.frames.slice(0, 10);
    receipt.result.frames[9].complete = false;
    receipt.result.ticks_completed = 8;
    receipt.result.status = "fuel_exhausted";
    receipt.result.outcome.passed = false;
    Object.assign(journey, { tick: 9, phase: "finished_without_answer", service_passed: false, answered: false, milestones: [], answer: null });
    expect(isFirstAnswerJourney(journey, receipt)).toBe(true);
    expect(isFirstAnswerJourney({ ...journey, tick: 8 }, receipt)).toBe(false);
    expect(journeyAt(journey, 9).answer).toBeNull();
  });

  test("admits every published answer grade with its exact recorded receipt", () => {
    const index = JSON.parse(readFileSync("public/answer/index.json", "utf8")) as ContinuityIndex;
    expect(index.cases).toHaveLength(4);
    for (const item of index.cases) {
      const receipt = JSON.parse(readFileSync(`public/answer/${item.id}.receipt.json`, "utf8"));
      expect(isContinuityReceipt(receipt)).toBe(true);
      expect(isFirstAnswerJourney(item.journey, receipt)).toBe(true);
      expect(item.result_hash).toBe(receipt.result_hash);
    }
  });
});
