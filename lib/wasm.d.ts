declare module "platonik-wasm" {
  export function tutorial_experiment(id: string): string;
  export function reference_program(name: string): string;
  export function run_experiment(json: string): string;
  export function generated_challenge(index: number): string;
  export function evaluate_challenge(challengeJson: string, submissionJson: string): string;
  export default function init(path?: string): Promise<void>;
}
