// Type declaration for the wasm-pack generated module, aliased in
// next.config.ts to public/wasm/platonik_wasm.js.
declare module "platonik-wasm" {
  const init: (path?: string) => Promise<unknown>;
  export default init;

  export function tutorial_experiment(id: string): string;
  export function run_experiment(json: string): string;
  export function validate_experiment(json: string): string;
  export function verify_receipt(json: string): string;
  export function generated_challenge(index: number): string;
  export function challenge_info(index: number): string;
  export function evaluate_challenge(challengeJson: string, submissionJson: string): string;
  export function make_submission(challengeJson: string, programsJson: string, agentName?: string): string;
  export function reference_program(name: string): string;
  export function journey_catalog(): string;
  export function journey_experiment(caseId: string): string;
  export function habitat_start(experimentJson: string, until: number): string;
  export function habitat_resume(checkpointJson: string, until: number): string;
  export function grade_advance(journey: string, experimentJson: string, advanceJson: string, caseId?: string): string;
  export function grade_receipt(journey: string, receiptJson: string, caseId?: string): string;
  export function expedition_new(name: string, ambition: string): string;
  export function expedition_plan(stateJson: string, commandJson: string): string;
  export function expedition_complete(stateJson: string, receiptJson: string): string;
  export function expedition_apply(stateJson: string, eventJson: string): string;
  export function expedition_progress(stateJson: string): string;
  export function expedition_trial_experiment(stateJson: string, commandJson: string): string;
}
