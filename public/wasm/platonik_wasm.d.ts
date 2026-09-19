/* tslint:disable */
/* eslint-disable */

/**
 * Lightweight challenge metadata for the picker: id, family, band, editable
 * cells, and case counts — without the full case payloads.
 */
export function challenge_info(index: number): string;

/**
 * Evaluate a challenge submission in-browser. `challenge_json` is the output
 * of `generated_challenge`; `submission_json` follows the challenge submission
 * schema. The result includes per-case pass/fail, work, and full receipts.
 */
export function evaluate_challenge(challenge_json: string, submission_json: string): string;

/**
 * Apply a journal event to the campaign, returning the new state. Events are
 * re-derived from their command, so a forged or stale event fails.
 */
export function expedition_apply(state_json: string, event_json: string): string;

/**
 * Complete a pending trial with the receipt produced by `run_experiment`.
 */
export function expedition_complete(state_json: string, receipt_json: string): string;

/**
 * Start a new field expedition campaign. `ambition` is `frugal` or `resilient`.
 */
export function expedition_new(name: string, ambition: string): string;

/**
 * Plan a campaign command (`grow`, `trial`, `freeze`) against the campaign
 * state. Returns `{ "event": ..., "experiment": ... | null }`; a trial plan
 * returns the experiment to run.
 */
export function expedition_plan(state_json: string, command_json: string): string;

/**
 * Campaign progress: completed/missing cases, the next objective, and the
 * first-camp reply once the expedition is complete.
 */
export function expedition_progress(state_json: string): string;

/**
 * Render the experiment a trial command would run — useful for previewing a
 * case with a chosen pair before committing to it.
 */
export function expedition_trial_experiment(state_json: string, command_json: string): string;

/**
 * Generate one of the published challenges by index (1–9999) and return it as
 * JSON. The public `train` cases are what honest local iteration uses.
 */
export function generated_challenge(index: number): string;

/**
 * Grade an `Advance` produced in this same session against a journey. The
 * advance came from this engine, so the verified projection is safe; cold
 * receipts should go through `grade_receipt` instead. `journey` is one of
 * `answer`, `ark`, `ports`, `bloom`. `case_id` is required for `exchange`.
 */
export function grade_advance(journey: string, experiment_json: string, advance_json: string, case_id?: string | null): string;

/**
 * Grade a cold receipt JSON against a journey, verifying it first. `journey`
 * is one of `answer`, `ark`, `ports`, `bloom`, `exchange`; `exchange` needs
 * `case_id` to select its control contract.
 */
export function grade_receipt(journey: string, receipt_json: string, case_id?: string | null): string;

/**
 * Resume a paused habitat checkpoint through a later absolute tick.
 */
export function habitat_resume(checkpoint_json: string, until: number): string;

/**
 * Start a continuous habitat: run `experiment` through absolute tick `until`
 * and return an `Advance` (`paused` checkpoint or `finished` result).
 */
export function habitat_start(experiment_json: string, until: number): string;

/**
 * Journey and case catalog: every playable world, grouped by track. Mirrors
 * the dispatch order used by `platonik habitat case`.
 */
export function journey_catalog(): string;

/**
 * Load a habitat/journey world by case id, using the same module dispatch as
 * `platonik habitat case`.
 */
export function journey_experiment(case_id: string): string;

/**
 * Build a well-formed submission JSON for a challenge from per-cell program
 * JSON values (`{"1": {...}, "3": {...}}`). Keeps the schema construction in
 * the engine so the frontend cannot produce a malformed envelope.
 */
export function make_submission(challenge_json: string, programs_json: string, agent_name?: string | null): string;

/**
 * Return a named reference program as JSON. Supported names:
 * `idle`, `compact`, `resilient`, `relay`, `controller`, `switchboard-porter`,
 * `switchboard-relay`, `switchboard-keeper`, `foundry-builder`, the
 * `world-surveyor` and `world-hauler` Dustlight roles, and the
 * `world-builder-upper` or `world-builder-lower` homestead plans.
 */
export function reference_program(name: string): string;

/**
 * Parse an experiment JSON, run it, and return a full receipt JSON including
 * every frame of the run. Errors are returned as `JsError` messages.
 */
export function run_experiment(experiment_json: string): string;

/**
 * Return a frozen fixture experiment as JSON. Supported ids match
 * `platonik-core` fixtures (`opening-normal`, `ark-plan-a`, etc.).
 */
export function tutorial_experiment(id: string): string;

/**
 * Validate an experiment JSON without running it — fast editor feedback for
 * malformed programs, out-of-range fields, or exceeded bounds.
 */
export function validate_experiment(experiment_json: string): string;

/**
 * Re-check a receipt JSON produced by `run_experiment` (or the CLI). Returns
 * the verification report; a badge should only render on success.
 */
export function verify_receipt(receipt_json: string): string;

export function world_apply(world_json: string, command_json: string): string;

export function world_new(name: string): string;

export function world_report(world_json: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly challenge_info: (a: number) => [number, number, number, number];
    readonly evaluate_challenge: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly expedition_apply: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly expedition_complete: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly expedition_new: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly expedition_plan: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly expedition_progress: (a: number, b: number) => [number, number, number, number];
    readonly expedition_trial_experiment: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly generated_challenge: (a: number) => [number, number, number, number];
    readonly grade_advance: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly grade_receipt: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly habitat_resume: (a: number, b: number, c: number) => [number, number, number, number];
    readonly habitat_start: (a: number, b: number, c: number) => [number, number, number, number];
    readonly journey_catalog: () => [number, number, number, number];
    readonly journey_experiment: (a: number, b: number) => [number, number, number, number];
    readonly make_submission: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly reference_program: (a: number, b: number) => [number, number, number, number];
    readonly run_experiment: (a: number, b: number) => [number, number, number, number];
    readonly tutorial_experiment: (a: number, b: number) => [number, number, number, number];
    readonly validate_experiment: (a: number, b: number) => [number, number, number, number];
    readonly verify_receipt: (a: number, b: number) => [number, number, number, number];
    readonly world_apply: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly world_new: (a: number, b: number) => [number, number, number, number];
    readonly world_report: (a: number, b: number) => [number, number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
