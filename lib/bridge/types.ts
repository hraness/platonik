// Read-only projection of the Rust receipt format. No simulation executes here.
export type Point = { x: number; y: number };
export type Signal = { id: number; link: number; bit: boolean; sent_tick: number; deliver_tick: number; receipt_spark: number | null };
export type Cell = { id: number; position: Point; heading: string; mobile: boolean };
export type CellState = { id: number; position: Point; memory: number[]; evidence: (number | null)[]; cargo: { id: number; bit: boolean } | null; inbox: (Signal | null)[] };
export type State = {
  tick: number; cells: CellState[];
  closed_edges?: { a: Point; b: Point }[];
  sources: { id: number; sparks: unknown[] }[]; depots: { id: number; sparks: unknown[] }[];
  beacons: { id: number; charge: number; delivered: number; exhausted: boolean }[];
  valves: { id: number; enabled: boolean }[]; links: { id: number; enabled: boolean }[];
  pending: Signal[]; delivered: { tick: number; spark: { id: number; bit: boolean }; beacon: number }[];
};
export type Frame = {
  tick: number; complete: boolean; state: State; costs: Record<string, number>;
  events: { kind: string }[]; signals: { signal: Signal; outcome: string }[];
  activations: { cell: number; action: { kind: string }; success: boolean; error: string | null; work_before: number; work_after: number }[];
};
export type Receipt = {
  schema: string; protocol: string; experiment_hash: string; result_hash: string;
  experiment: {
    width: number; height: number; walls: Point[]; cells: Cell[];
    sources: ({ id: number } & { position: Point })[];
    depots: ({ id: number } & { position: Point })[];
    beacons: ({ id: number; accepts: boolean } & { position: Point })[];
    valves: ({ id: number } & { position: Point })[];
    links: { id: number; from: { kind: string; id: number }; to_cell: number }[];
    ticks: number; fuel: number; activation_fuel: number;
  };
  result: { status: string; ticks_completed: number; costs: Record<string, number>; outcome: { passed: boolean }; frames: Frame[]; final_state: State };
};
export type BridgeCase = {
  id: string; expected_pass: boolean; passed: boolean; work: number;
  ticks: number; receipt_bytes: number; experiment_hash: string; result_hash: string;
};
export type BridgeIndex = {
  schema: string; protocol: string; suite: string; passed: boolean;
  cases: BridgeCase[]; checks: { id: string; passed: boolean; detail: string; evidence: string[] }[];
};
