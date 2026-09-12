import type { Receipt } from "./types";
import type { FirstAnswerJourney } from "./journey";
import type { ArkGrade } from "./ark";
import type { PortsGrade } from "./ports";

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
  journey?: FirstAnswerJourney;
  ark?: ArkGrade;
  ports?: PortsGrade;
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
const costs = (value: unknown, construction: boolean) => record(value)
  && Object.keys(value).every(field => costFields.includes(field) || (construction && ["copying", "construction"].includes(field)))
  && costFields.every(field => integer(value[field], 2_000_000))
  && ["copying", "construction"].every(field => value[field] === undefined || (construction && integer(value[field], 2_000_000)));
const enabled = (value: unknown) => identified(value) && typeof value.enabled === "boolean";
const signal = (value: unknown) => record(value) && integer(value.id) && integer(value.link, 65_535)
  && typeof value.bit === "boolean" && integer(value.sent_tick, 128) && integer(value.deliver_tick, 256)
  && nullable(value.receipt_spark, item => integer(item, 0xffff_ffff));

const fields = (value: unknown, names: string[]): value is RecordValue => record(value)
  && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const id = (value: unknown) => integer(value, 65_535);
const token = (value: unknown) => integer(value, 0xffff_ffff);
const port = (value: unknown) => integer(value, 3);
const relative = (value: unknown) => typeof value === "string" && ["forward", "left", "right", "back"].includes(value);
function bit(value: unknown): boolean {
  if (!record(value)) return false;
  if (value.kind === "constant") return fields(value, ["kind", "value"]) && typeof value.value === "boolean";
  if (value.kind === "memory") return fields(value, ["kind", "slot"]) && port(value.slot);
  return value.kind === "message" && fields(value, ["kind", "port"]) && port(value.port);
}
function condition(value: unknown): boolean {
  if (!record(value) || typeof value.kind !== "string") return false;
  if (["carrying", "at_source", "at_depot", "at_beacon", "at_receiver", "has_material"].includes(String(value.kind)))
    return fields(value, ["kind", "value"]) && typeof value.value === "boolean";
  if (["has_message", "message_bit"].includes(String(value.kind)))
    return fields(value, ["kind", "port", "value"]) && port(value.port) && typeof value.value === "boolean";
  if (value.kind === "blocked") return fields(value, ["kind", "direction", "value"]) && relative(value.direction) && typeof value.value === "boolean";
  if (value.kind === "memory") return fields(value, ["kind", "slot", "value"]) && port(value.slot) && integer(value.value, 255);
  if (value.kind === "heading") return fields(value, ["kind", "direction"]) && heading(value.direction);
  return value.kind === "assembly_stage" && fields(value, ["kind", "blueprint", "stage"]) && id(value.blueprint)
    && typeof value.stage === "string" && ["absent", "copying", "wiring", "ready", "born"].includes(value.stage);
}
function action(value: unknown): boolean {
  if (!record(value) || typeof value.kind !== "string") return false;
  if (["pickup", "drop", "wait"].includes(String(value.kind))) return fields(value, ["kind"]);
  if (["move", "turn"].includes(String(value.kind))) return fields(value, ["kind", "direction"]) && relative(value.direction);
  if (value.kind === "write_memory") return fields(value, ["kind", "slot", "value"]) && port(value.slot) && integer(value.value, 255);
  if (value.kind === "take_message") return fields(value, ["kind", "port", "slot"]) && port(value.port) && port(value.slot);
  if (value.kind === "send") return fields(value, ["kind", "port", "bit"]) && port(value.port) && bit(value.bit);
  if (value.kind === "route") return fields(value, ["kind", "valve", "bit"]) && id(value.valve) && bit(value.bit);
  if (value.kind === "gather_material") return fields(value, ["kind", "stock"]) && id(value.stock);
  return ["build", "activate"].includes(String(value.kind)) && fields(value, ["kind", "blueprint"]) && id(value.blueprint);
}
const program = (value: unknown) => fields(value, ["rules"]) && list(value.rules, 32, rule =>
  fields(rule, ["when", "action", "remember"]) && list(rule.when, 8, condition) && action(rule.action)
  && nullable(rule.remember, write => fields(write, ["slot", "value"]) && port(write.slot) && integer(write.value, 255)), 1);
const constructionLink = (value: unknown) => fields(value, ["id", "from", "to_cell", "to_port", "delay", "enabled"])
  && id(value.id) && id(value.to_cell) && port(value.to_port) && integer(value.delay, 16, 1) && typeof value.enabled === "boolean"
  && record(value.from) && (value.from.kind === "cell"
    ? fields(value.from, ["kind", "id", "port"]) && id(value.from.id) && port(value.from.port)
    : value.from.kind === "depot" && fields(value.from, ["kind", "id"]) && id(value.from.id));

// Admit only the bounded projection used by the replay UI. This does not check
// program execution, conservation, signal causality, or cryptographic identity;
// the authoritative Rust receipt checker remains responsible for those claims.
export function isContinuityReceipt(value: unknown): value is Receipt {
  if (!record(value) || value.schema !== "platonik-receipt-v1" || typeof value.protocol !== "string" || !["platonik-habitat-v2", "platonik-habitat-v3"].includes(value.protocol)
    || !hash(value.experiment_hash) || !hash(value.result_hash)) return false;
  const v3 = value.protocol === "platonik-habitat-v3";
  const world = value.experiment, result = value.result;
  if (!record(world) || !record(result) || world.version !== (v3 ? 3 : 2) || result.protocol !== value.protocol
    || !integer(world.width, 32, 3) || !integer(world.height, 32, 3)
    || !integer(world.ticks, 128, 1) || !integer(world.fuel, 2_000_000)
    || !integer(world.activation_fuel, 1024, 1)) return false;
  const width = world.width, height = world.height;
  const point = (item: unknown) => record(item) && integer(item.x, width - 1) && integer(item.y, height - 1);
  const located = (item: unknown): item is RecordValue => identified(item) && point(item.position);
  const body = (item: unknown) => fields(item, ["cell", "links"])
    && fields(item.cell, ["id", "position", "heading", "mobile", "memory", "program"])
    && located(item.cell) && heading(item.cell.heading) && typeof item.cell.mobile === "boolean"
    && list(item.cell.memory, 4, byte => integer(byte, 255), 4) && program(item.cell.program)
    && list(item.links, 32, constructionLink)
    && new TextEncoder().encode(JSON.stringify(item)).byteLength <= 4096;
  const spec = (item: unknown) => fields(item, ["stocks", "blueprints"])
    && list(item.stocks, 4, stock => fields(stock, ["id", "position", "units"]) && located(stock) && list(stock.units, 32, token))
    && list(item.blueprints, 4, blueprint => fields(blueprint, ["id", "body"]) && id(blueprint.id) && body(blueprint.body), 1);
  const constructionState = (item: unknown) => fields(item, ["stocks", "assemblies", "births"])
    && list(item.stocks, 4, stock => fields(stock, ["id", "units"]) && id(stock.id) && list(stock.units, 32, token))
    && list(item.assemblies, 4, assembly => fields(assembly, ["blueprint", "parent", "material", "copied", "wired"])
      && id(assembly.blueprint) && id(assembly.parent) && token(assembly.material)
      && list(assembly.copied, 4096, byte => integer(byte, 255)) && list(assembly.wired, 32, constructionLink))
    && list(item.births, 4, birth => fields(birth, ["blueprint", "parent", "material", "tick", "body"])
      && id(birth.blueprint) && id(birth.parent) && token(birth.material) && integer(birth.tick, 128) && body(birth.body));
  if (world.construction !== undefined && (!v3 || !spec(world.construction))) return false;
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
      && nullable(cell.cargo, spark) && list(cell.inbox, 4, message => nullable(message, signal), 4)
      && (cell.material === undefined || (v3 && token(cell.material))), 1)
    && list(item.sources, 8, source => identified(source) && list(source.sparks, 128, spark))
    && list(item.depots, 8, depot => identified(depot) && list(depot.sparks, 128, spark))
    && list(item.beacons, 8, beacon => identified(beacon) && integer(beacon.charge, 0xffff_ffff)
      && integer(beacon.delivered, 128) && typeof beacon.exhausted === "boolean", 1)
    && list(item.valves, 8, enabled) && list(item.links, 32, enabled)
    && list(item.pending, 128, signal)
    && list(item.delivered, 128, delivery => record(delivery) && integer(delivery.tick, 128)
      && spark(delivery.spark) && integer(delivery.beacon, 65_535))
    && (item.closed_edges === undefined || list(item.closed_edges, 64,
      edge => record(edge) && point(edge.a) && point(edge.b)))
    && (world.construction === undefined ? item.construction === undefined : v3 && constructionState(item.construction));
  const frame = (item: unknown) => record(item) && integer(item.tick, 128) && typeof item.complete === "boolean"
    && state(item.state) && costs(item.costs, v3)
    && list(item.events, 64, event => record(event) && text(event.kind))
    && list(item.signals, 1024, event => record(event) && signal(event.signal) && text(event.outcome))
    && list(item.activations, 16, action => record(action) && integer(action.cell, 65_535)
      && record(action.action) && text(action.action.kind) && typeof action.success === "boolean"
      && nullable(action.error, error => text(error, 256)) && integer(action.work_before, 2_000_000)
      && integer(action.work_after, 2_000_000));
  return text(result.status) && ["complete", "activation_limit", "fuel_exhausted"].includes(result.status)
    && integer(result.ticks_completed, 128) && costs(result.costs, v3)
    && record(result.outcome) && typeof result.outcome.passed === "boolean"
    && list(result.frames, 129, frame, 1) && state(result.final_state);
}
