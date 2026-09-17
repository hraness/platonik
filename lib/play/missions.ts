// Mission model for /play: a flat catalog the shell renders as tracks.
// A mission is a world + a goal + the engine call that produces a verdict.

export type Track = "opening" | "challenges" | "expedition" | "journeys";

export interface MissionRef {
  track: Track;
  /** Engine selector: fixture id, challenge index, case id, or campaign id. */
  key: string;
  title: string;
  detail: string;
}

export const OPENING_MISSIONS: MissionRef[] = [
  {
    track: "opening",
    key: "opening-normal",
    title: "First run",
    detail: "Carry the spark from the source to the depot, then light the beacon.",
  },
  {
    track: "opening",
    key: "opening-wounded",
    title: "Wounded route",
    detail: "The direct lane is unreliable — a wall-follower program survives it.",
  },
  {
    track: "opening",
    key: "ark-plan-a",
    title: "First relay",
    detail: "A valve splits the route by signal bit; the controller must steer it.",
  },
];

export const JOURNEY_DESCRIPTIONS: Record<string, { title: string; detail: string }> = {
  continuity: {
    title: "First camp",
    detail:
      "One world survives across pauses. Keep a camp light supplied, survive a closing route, then route the same stock from a remembered report.",
  },
  construction: {
    title: "Construction",
    detail:
      "Finite material becomes a new cell: gather units, copy the blueprint, wire its links, then activate the child.",
  },
  answer: {
    title: "First Answer",
    detail:
      "Build a keeper and a reply cell, supply the crew, and bring a matched report home — the construction-to-contact ending.",
  },
  ark: {
    title: "Ark control",
    detail:
      "Route a four-bit addition to the right service plan while a separate payload keeps its commitments.",
  },
  ports: {
    title: "Port commitments",
    detail:
      "Two lanes of request, custody, acknowledgment, and service — with finite spares and no silent retries.",
  },
  bloom: {
    title: "Bloom",
    detail:
      "Rewrite a growing body's program within the edit budget, run the trial, and confirm the child that earned selection.",
  },
  exchange: {
    title: "Bloom exchange",
    detail:
      "Two generated couriers, one lane: pick a winner, request the parcel, and complete the handoff under the control contract.",
  },
};

export const CHALLENGE_FAMILIES = [
  { id: "crossing", title: "Crossing", range: [1, 32] as const, detail: "One courier, closing walls, a beacon to serve." },
  { id: "switchboard", title: "Switchboard", range: [33, 64] as const, detail: "A keeper cell routes signals between lanes." },
  { id: "foundry", title: "Foundry", range: [65, 96] as const, detail: "Budgeted construction: build two runners, not the decoy." },
];

export function challengeIndex(id: string): number | null {
  const match = /^challenge-(\d{4})$/.exec(id);
  return match ? Number(match[1]) : null;
}

export function challengeId(index: number): string {
  return `challenge-${String(index).padStart(4, "0")}`;
}
