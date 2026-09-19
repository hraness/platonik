"use client";

import type { FacilityKind, Frame, Receipt, State } from "@/lib/bridge/types";

// Typed client over the platonik-wasm JSON bridge. The Rust engine is
// authoritative; every function here is a thin wrapper that parses the JSON
// envelope and converts JsError throws into EngineError.

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineError";
  }
}

interface WasmModule {
  tutorial_experiment(id: string): string;
  run_experiment(json: string): string;
  validate_experiment(json: string): string;
  verify_receipt(json: string): string;
  generated_challenge(index: number): string;
  challenge_info(index: number): string;
  evaluate_challenge(challengeJson: string, submissionJson: string): string;
  make_submission(challengeJson: string, programsJson: string, agentName?: string): string;
  reference_program(name: string): string;
  journey_catalog(): string;
  journey_experiment(caseId: string): string;
  habitat_start(experimentJson: string, until: number): string;
  habitat_resume(checkpointJson: string, until: number): string;
  grade_advance(journey: string, experimentJson: string, advanceJson: string, caseId?: string): string;
  grade_receipt(journey: string, receiptJson: string, caseId?: string): string;
  expedition_new(name: string, ambition: string): string;
  expedition_plan(stateJson: string, commandJson: string): string;
  expedition_complete(stateJson: string, receiptJson: string): string;
  expedition_apply(stateJson: string, eventJson: string): string;
  expedition_progress(stateJson: string): string;
  expedition_trial_experiment(stateJson: string, commandJson: string): string;
  world_new(name: string): string;
  world_apply(worldJson: string, commandJson: string): string;
  world_report(worldJson: string): string;
}

let cached: Promise<WasmModule> | null = null;

/** Lazy-load the WASM bundle once; only the /play route calls this. */
export function loadEngine(): Promise<WasmModule> {
  if (!cached) {
    cached = import("platonik-wasm").then(async (mod: unknown) => {
      const m = mod as { default: (path?: string) => Promise<unknown> } & WasmModule;
      await m.default();
      return m;
    });
  }
  return cached;
}

function call<T>(fn: () => string): T {
  try {
    return JSON.parse(fn()) as T;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new EngineError(message);
  }
}

// ---- shared wire types (mirror crates/platonik-core serde shapes) ----

export interface Program {
  rules: Rule[];
}
export interface Rule {
  when: unknown[];
  action: Record<string, unknown>;
  remember?: { slot: number; value: number } | null;
}
export interface Point {
  x: number;
  y: number;
}

export interface ChallengeInfo {
  schema: string;
  id: string;
  index: number;
  generator: number;
  family: string;
  band: number;
  editable: number[];
  witness: string;
  train_cases: number;
  eval_cases: number;
}

export interface Challenge {
  schema: string;
  id: string;
  index: number;
  generator: number;
  family: string;
  band: number;
  editable: number[];
  witness: string;
  train: unknown[];
  eval: unknown[];
}

export interface Submission {
  schema: string;
  challenge: string;
  programs: Record<string, Program>;
  agent?: { name: string; tokens?: number; notes?: string };
}

export interface CaseResult {
  id: string;
  experiment_hash: string;
  receipt_hash: string;
  passed: boolean;
  status: string;
  work: number;
}

export interface ChallengeResult {
  schema: string;
  challenge: string;
  index: number;
  generator: number;
  passed: boolean;
  cases_passed: number;
  cases_total: number;
  total_work: number;
  program_bytes: number;
  submission_hash: string;
  cases: CaseResult[];
  receipts: unknown[];
}

export interface JourneyTrack {
  id: string;
  title: string;
  cases: string[];
  training?: string[];
  transfer?: string[];
  capacity?: string[];
}

export interface JourneyCatalog {
  schema: string;
  journeys: JourneyTrack[];
  expedition: { cases: string[]; training: string[]; transfer: string[] };
}

export type Advance =
  | { kind: "paused"; value: Checkpoint }
  | { kind: "finished"; value: unknown };

export interface Checkpoint {
  schema: string;
  experiment_hash: string;
  prefix_hash: string;
  experiment: unknown;
  frames: unknown[];
}

export interface Campaign {
  schema: string;
  name: string;
  ambition: "frugal" | "resilient";
  allowance: number;
  work: number;
  creations: Creation[];
  trials: Trial[];
  frozen: { courier: string; controller: string } | null;
  pending: Pending | null;
}

export interface Creation {
  id: string;
  name: string;
  parent: string | null;
  role: "courier" | "controller";
  program: Program;
  program_hash: string;
}

export interface Trial {
  case_id: string;
  courier: string;
  controller: string;
  experiment_hash: string;
  receipt_hash: string;
  passed: boolean;
  work: number;
  ticks: number;
}

export interface Pending {
  command: ExpeditionCommand;
  experiment_hash: string;
  reserved_work: number;
}

export type ExpeditionCommand =
  | { kind: "grow"; id: string; name: string; parent: string; program: Program }
  | { kind: "trial"; case_id: string; courier: string; controller: string }
  | { kind: "freeze"; courier: string; controller: string };

export interface ExpeditionEvent {
  kind: string;
  [key: string]: unknown;
}

export interface ExpeditionProgress {
  completed_training: string[];
  completed_transfer: string[];
  missing_training: string[];
  missing_transfer: string[];
  unattempted_transfer: string[];
  failed_transfer: string[];
  confirmation_finished: boolean;
  field_expedition_complete: boolean;
  next: string;
  reply: string | null;
}

export interface LivingWorld {
  schema: "platonik-living-world-v1";
  name: string;
  genesis_hash: string;
  genesis: unknown;
  revision: number;
  events: unknown[];
}

export type WorldCommand =
  | { kind: "advance"; ticks: number }
  | { kind: "set_program"; cell: number; program: Program }
  | { kind: "place"; structure: FacilityKind; position: Point }
  | { kind: "name"; facility: number; name: string };

export interface WorldSummary {
  cells: number;
  constructed_cells: number;
  deliveries: number;
  source_sparks: number;
  depot_sparks: number;
  carried_sparks: number;
  material_units: number;
  beacon_charge: number;
  beacons_without_charge: number;
  facilities: number;
  ready_facilities: number;
  facility_sparks: number;
  parts_minted: number;
  frames_minted: number;
  material_extracted: number;
  items_moved: number;
  carried_parts: number;
  carried_frames: number;
}

export interface WorldReport {
  schema: "platonik-living-world-report-v1";
  world_hash: string;
  name: string;
  revision: number;
  tick: number;
  maximum_tick: number;
  experiment: Receipt["experiment"];
  state: State;
  costs: Record<string, number>;
  recent_frames: Frame[];
  summary: WorldSummary;
  names: Record<string, string>;
  industry: FacilityDiagnostic[];
  industry_frames: { tick: number; facilities: FacilityDiagnostic[] }[];
}

export type IndustryItem = "material" | "spark" | "part" | "frame";
export type ItemAmount = { item: IndustryItem; quantity: number };
export interface FacilityDiagnostic {
  id: number;
  status: "construction" | "working" | "waiting_inputs" | "output_full" | "exhausted" | "ready" | "storage" | "waiting_transfer" | "mint_limit";
  remaining_ticks: number;
  missing_inputs: ItemAmount[];
  recipe: { inputs: ItemAmount[]; output: ItemAmount; ticks: number } | null;
  transfer: { source: number; destination: number; item: IndustryItem } | null;
}

export interface VerificationReport {
  schema: string;
  verified: boolean;
  passed: boolean;
  protocol: string;
  experiment_hash: string;
  result_hash: string;
  ticks_completed: number;
  work: number;
}

// ---- typed wrappers ----

export const engine = {
  worldNew(wasm: WasmModule, name: string) {
    return call<LivingWorld>(() => wasm.world_new(name));
  },
  worldApply(wasm: WasmModule, world: LivingWorld, command: WorldCommand) {
    return call<LivingWorld>(() => wasm.world_apply(JSON.stringify(world), JSON.stringify(command)));
  },
  worldReport(wasm: WasmModule, world: LivingWorld) {
    return call<WorldReport>(() => wasm.world_report(JSON.stringify(world)));
  },
  tutorialExperiment(wasm: WasmModule, id: string) {
    return call<Record<string, unknown>>(() => wasm.tutorial_experiment(id));
  },
  run(wasm: WasmModule, experiment: unknown) {
    return call<Record<string, unknown>>(() => wasm.run_experiment(JSON.stringify(experiment)));
  },
  validate(wasm: WasmModule, experiment: unknown) {
    return call<{ ok: boolean }>(() => wasm.validate_experiment(JSON.stringify(experiment)));
  },
  verifyReceipt(wasm: WasmModule, receipt: unknown) {
    return call<VerificationReport>(() => wasm.verify_receipt(JSON.stringify(receipt)));
  },
  challenge(wasm: WasmModule, index: number) {
    return call<Challenge>(() => wasm.generated_challenge(index));
  },
  challengeInfo(wasm: WasmModule, index: number) {
    return call<ChallengeInfo>(() => wasm.challenge_info(index));
  },
  makeSubmission(wasm: WasmModule, challenge: Challenge, programs: Record<string, Program>, agent?: string) {
    return call<Submission>(() =>
      wasm.make_submission(JSON.stringify(challenge), JSON.stringify(programs), agent)
    );
  },
  evaluate(wasm: WasmModule, challenge: Challenge, submission: Submission) {
    return call<ChallengeResult>(() =>
      wasm.evaluate_challenge(JSON.stringify(challenge), JSON.stringify(submission))
    );
  },
  referenceProgram(wasm: WasmModule, name: string) {
    return call<Program>(() => wasm.reference_program(name));
  },
  catalog(wasm: WasmModule) {
    return call<JourneyCatalog>(() => wasm.journey_catalog());
  },
  journeyExperiment(wasm: WasmModule, caseId: string) {
    return call<Record<string, unknown>>(() => wasm.journey_experiment(caseId));
  },
  habitatStart(wasm: WasmModule, experiment: unknown, until: number) {
    return call<Advance>(() => wasm.habitat_start(JSON.stringify(experiment), until));
  },
  habitatResume(wasm: WasmModule, checkpoint: Checkpoint, until: number) {
    return call<Advance>(() => wasm.habitat_resume(JSON.stringify(checkpoint), until));
  },
  gradeAdvance(wasm: WasmModule, journey: string, experiment: unknown, advance: Advance, caseId?: string) {
    return call<Record<string, unknown>>(() =>
      wasm.grade_advance(journey, JSON.stringify(experiment), JSON.stringify(advance), caseId)
    );
  },
  gradeReceipt(wasm: WasmModule, journey: string, receipt: unknown, caseId?: string) {
    return call<Record<string, unknown>>(() =>
      wasm.grade_receipt(journey, JSON.stringify(receipt), caseId)
    );
  },
  expeditionNew(wasm: WasmModule, name: string, ambition: "frugal" | "resilient") {
    return call<Campaign>(() => wasm.expedition_new(name, ambition));
  },
  expeditionPlan(wasm: WasmModule, state: Campaign, command: ExpeditionCommand) {
    return call<{ event: ExpeditionEvent; experiment: Record<string, unknown> | null }>(() =>
      wasm.expedition_plan(JSON.stringify(state), JSON.stringify(command))
    );
  },
  expeditionComplete(wasm: WasmModule, state: Campaign, receipt: unknown) {
    return call<ExpeditionEvent>(() =>
      wasm.expedition_complete(JSON.stringify(state), JSON.stringify(receipt))
    );
  },
  expeditionApply(wasm: WasmModule, state: Campaign, event: ExpeditionEvent) {
    return call<Campaign>(() => wasm.expedition_apply(JSON.stringify(state), JSON.stringify(event)));
  },
  expeditionProgress(wasm: WasmModule, state: Campaign) {
    return call<ExpeditionProgress>(() => wasm.expedition_progress(JSON.stringify(state)));
  },
  expeditionTrialExperiment(wasm: WasmModule, state: Campaign, command: ExpeditionCommand) {
    return call<Record<string, unknown>>(() =>
      wasm.expedition_trial_experiment(JSON.stringify(state), JSON.stringify(command))
    );
  },
};

export type { WasmModule };
