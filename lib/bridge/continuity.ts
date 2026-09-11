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

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown, maximum = Number.MAX_SAFE_INTEGER, minimum = 0): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const text = (value: unknown, maximum = 128): value is string => typeof value === "string" && value.length <= maximum;
const hash = (value: unknown) => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
function list(value: unknown, maximum: number, check: (item: unknown) => boolean, minimum = 0): boolean {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) return false;
  for (const item of value) if (!check(item)) return false;
  return true;
}
const nullable = (value: unknown, check: (item: unknown) => boolean) => value === null || check(value);
const identified = (value: unknown): value is RecordValue => record(value) && integer(value.id, 65_535);
const spark = (value: unknown) => record(value) && integer(value.id, 0xffff_ffff) && typeof value.bit === "boolean";
const heading = (value: unknown) => text(value) && ["north", "east", "south", "west"].includes(value);
const costFields = ["loading", "scheduling", "conditions", "sensors", "memory_reads", "memory_writes", "actions", "messages", "transfers", "checking", "draining"];
const costs = (value: unknown) => record(value) && Object.keys(value).length === costFields.length
  && costFields.every(field => integer(value[field], 2_000_000));
const enabled = (value: unknown) => identified(value) && typeof value.enabled === "boolean";
const signal = (value: unknown) => record(value) && integer(value.id) && integer(value.link, 65_535)
  && typeof value.bit === "boolean" && integer(value.sent_tick, 128) && integer(value.deliver_tick, 256)
  && nullable(value.receipt_spark, item => integer(item, 0xffff_ffff));

// Admit only the bounded projection used by the replay UI. This does not check
// program execution, conservation, signal causality, or cryptographic identity;
// the authoritative Rust receipt checker remains responsible for those claims.
export function isContinuityReceipt(value: unknown): value is Receipt {
  if (!record(value) || value.schema !== "platonik-receipt-v1" || value.protocol !== "platonik-habitat-v2"
    || !hash(value.experiment_hash) || !hash(value.result_hash)) return false;
  const world = value.experiment, result = value.result;
  if (!record(world) || !record(result) || !integer(world.width, 32, 3) || !integer(world.height, 32, 3)
    || !integer(world.ticks, 128, 1) || !integer(world.fuel, 2_000_000)
    || !integer(world.activation_fuel, 1024, 1)) return false;
  const width = world.width, height = world.height;
  const point = (item: unknown) => record(item) && integer(item.x, width - 1) && integer(item.y, height - 1);
  const located = (item: unknown): item is RecordValue => identified(item) && point(item.position);
  if (!list(world.walls, 512, point) || !list(world.cells, 16, item => located(item)
      && heading(item.heading) && typeof item.mobile === "boolean", 1)
    || !list(world.sources, 8, located) || !list(world.depots, 8, located) || !list(world.valves, 8, located)
    || !list(world.beacons, 8, item => located(item) && typeof item.accepts === "boolean", 1)
    || !list(world.links, 32, item => identified(item) && record(item.from)
      && text(item.from.kind) && ["cell", "depot"].includes(item.from.kind) && integer(item.from.id, 65_535)
      && integer(item.to_cell, 65_535))) return false;
  const state = (item: unknown) => record(item) && integer(item.tick, 128)
    && list(item.cells, 16, cell => located(cell)
      && list(cell.memory, 4, byte => integer(byte, 255), 4)
      && list(cell.evidence, 4, evidence => nullable(evidence, id => integer(id, 0xffff_ffff)), 4)
      && nullable(cell.cargo, spark) && list(cell.inbox, 4, message => nullable(message, signal), 4), 1)
    && list(item.sources, 8, source => identified(source) && list(source.sparks, 128, spark))
    && list(item.depots, 8, depot => identified(depot) && list(depot.sparks, 128, spark))
    && list(item.beacons, 8, beacon => identified(beacon) && integer(beacon.charge, 0xffff_ffff)
      && integer(beacon.delivered, 128) && typeof beacon.exhausted === "boolean", 1)
    && list(item.valves, 8, enabled) && list(item.links, 32, enabled)
    && list(item.pending, 128, signal)
    && list(item.delivered, 128, delivery => record(delivery) && integer(delivery.tick, 128)
      && spark(delivery.spark) && integer(delivery.beacon, 65_535))
    && (item.closed_edges === undefined || list(item.closed_edges, 64,
      edge => record(edge) && point(edge.a) && point(edge.b)));
  const frame = (item: unknown) => record(item) && integer(item.tick, 128) && typeof item.complete === "boolean"
    && state(item.state) && costs(item.costs)
    && list(item.events, 64, event => record(event) && text(event.kind))
    && list(item.signals, 1024, event => record(event) && signal(event.signal) && text(event.outcome))
    && list(item.activations, 16, action => record(action) && integer(action.cell, 65_535)
      && record(action.action) && text(action.action.kind) && typeof action.success === "boolean"
      && nullable(action.error, error => text(error, 256)) && integer(action.work_before, 2_000_000)
      && integer(action.work_after, 2_000_000));
  return text(result.status) && ["complete", "activation_limit", "fuel_exhausted"].includes(result.status)
    && integer(result.ticks_completed, 128) && costs(result.costs)
    && record(result.outcome) && typeof result.outcome.passed === "boolean"
    && list(result.frames, 129, frame, 1) && state(result.final_state);
}
