// Finite qualification recipes and durable subprocess accounting. No simulator.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

export const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
export const identity = value => `sha256:${sha(JSON.stringify(value))}`;
export const binary = path.resolve("target/release/platonik");
export const training = ["bloom-left", "bloom-right", "bloom-left-delay", "bloom-right-delay"];
export const transfer = ["bloom-rotated-left", "bloom-rotated-right", "bloom-crossing-left", "bloom-crossing-right"];
export const controls = [
  { kind: "no-edits", case_id: "bloom-left" },
  { kind: "same-direction", case_id: "bloom-right" },
  { kind: "preselected", case_id: "bloom-left" },
  { kind: "false-report", case_id: "bloom-left" },
  { kind: "no-confirmation", case_id: "bloom-left" },
  { kind: "premature-confirmation", case_id: "bloom-left" },
];
const rule = (when, action) => ({ when, action, remember: null });

export function control(original, kind) {
  const world = structuredClone(original);
  assert.equal(world.version, 4);
  const cell = id => {
    const value = world.cells.find(entry => entry.id === id);
    assert(value, `Missing Bloom role ${id}`);
    return value;
  };
  if (kind === "no-edits") {
    for (const [builder, blueprint] of [[1, 50], [2, 51]]) {
      cell(builder).program.rules.unshift(rule(
        [{ kind: "assembly_stage", blueprint, stage: "ready" }],
        { kind: "activate", blueprint },
      ));
    }
  } else if (kind === "same-direction") {
    for (const builder of [1, 2]) {
      const write = cell(builder).program.rules.find(entry => entry.action.kind === "write_memory" && entry.action.slot === 1);
      assert(write, "Reference builder must write its direction register");
      write.action.value = 1;
    }
  } else if (kind === "preselected") {
    assert.equal(cell(5).memory[2], 0);
    cell(5).memory[2] = 1;
  } else if (kind === "false-report") {
    cell(6).program = { rules: [rule([], { kind: "send", port: 0, bit: { kind: "constant", value: false } })] };
  } else if (kind === "no-confirmation" || kind === "premature-confirmation") {
    const clock = world.links.find(entry => entry.id === 48);
    assert(clock, "Missing declared confirmation gate");
    clock.enabled = kind === "premature-confirmation";
    world.events = world.events.filter(entry => entry.event.kind !== "link_enabled" || entry.event.id !== 48);
  } else throw new Error(`Unknown Bloom control: ${kind}`);
  return world;
}

export function createLedger(directory, plan) {
  fs.mkdirSync(directory, { recursive: false });
  return { schema: "platonik-bloom-qualification-ledger-v1", plan,
    maximum_engine_executions: plan.maximum_engine_executions, engine_executions: 0,
    calls: [], batches: [], attempts: [], pending_call: null, pending_attempt: null,
    accounting_incomplete: false, stopped: null, finished: null };
}

export function runner(directory, ledger) {
  const root = fs.realpathSync(directory);
  const ledgerFile = path.join(root, "ledger.json");
  const save = () => {
    const temporary = `${ledgerFile}.writing`;
    fs.writeFileSync(temporary, `${JSON.stringify(ledger, null, 2)}\n`);
    fs.renameSync(temporary, ledgerFile);
  };
  const stop = (reason, unknown = false) => {
    ledger.stopped = reason;
    if (unknown) ledger.accounting_incomplete = true;
    save();
    throw new Error(reason);
  };
  assert(!ledger.stopped && !ledger.pending_call && !ledger.accounting_incomplete,
    "Reconcile preserved interrupted accounting before further execution");
  save();
  function cli(args, { reservation, accepted = [0] }) {
    assert(Number.isSafeInteger(reservation) && reservation >= 0);
    if (ledger.engine_executions + reservation > ledger.maximum_engine_executions) stop("Insufficient reserved engine allowance.");
    const index = ledger.calls.length;
    ledger.pending_call = { index, reservation, args: args.map(arg => arg.startsWith(`${root}/`) ? path.relative(root, arg) : arg) };
    save();
    const began = process.hrtime.bigint();
    const result = spawnSync(binary, ["--metrics", ...args], { encoding: "utf8", maxBuffer: 70 * 1024 * 1024, timeout: 60_000 });
    const stem = String(index).padStart(4, "0");
    const stdout = `${stem}.stdout.json`, stderr = `${stem}.stderr.jsonl`;
    fs.writeFileSync(path.join(root, stdout), result.stdout ?? "", { flag: "wx" });
    fs.writeFileSync(path.join(root, stderr), result.stderr ?? "", { flag: "wx" });
    const call = { index, executable: path.relative(process.cwd(), binary), args: ledger.pending_call.args,
      reserved_engine_executions: reservation, exit_code: result.status,
      elapsed_ms: Number(process.hrtime.bigint() - began) / 1e6,
      stdout, stderr, stdout_sha256: sha(result.stdout ?? ""), stderr_sha256: sha(result.stderr ?? ""), metrics: null };
    ledger.calls.push(call); save();
    let metrics;
    try {
      metrics = (result.stderr ?? "").trim().split("\n").filter(Boolean).map(JSON.parse)
        .filter(row => row.schema === "platonik-process-metrics-v1");
    } catch { stop(`Malformed metrics in call ${index}.`, true); }
    if (metrics.length !== 1 || !Number.isSafeInteger(metrics[0].engine_executions) || metrics[0].engine_executions < 0
      || !Number.isSafeInteger(metrics[0].elapsed_micros) || metrics[0].elapsed_micros < 0) stop(`Invalid or absent metrics in call ${index}.`, true);
    call.metrics = metrics[0];
    ledger.engine_executions += metrics[0].engine_executions;
    ledger.pending_call = null; save();
    if (result.error || result.status === null) stop(`Uncertain process completion in call ${index}.`, true);
    if (metrics[0].engine_executions > reservation || ledger.engine_executions > ledger.maximum_engine_executions) stop(`Engine reservation exceeded in call ${index}.`);
    if (!accepted.includes(result.status)) stop(`Unexpected exit ${result.status} in call ${index}; preserved outputs require review.`);
    let value;
    try { value = JSON.parse(result.stdout); }
    catch { if (result.status !== 2) stop(`Malformed JSON output in call ${index}.`); }
    return { value, call };
  }
  return { root, ledger, save, stop, cli };
}

export function sourceSnapshot(root, sequence) {
  const files = ["Cargo.toml", "Cargo.lock", "rust-toolchain.toml"];
  function visit(directory, pattern) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) visit(file, pattern);
      else if (pattern.test(file)) files.push(file);
    }
  }
  visit("crates", /\.(rs|toml)$/);
  visit("scripts/bloom", /\.mjs$/);
  for (const file of [...files].filter(file => file.endsWith(".rs"))) {
    for (const match of fs.readFileSync(file, "utf8").matchAll(/include_str!\(\s*"([^"]+)"\s*\)/g)) {
      const dependency = path.normalize(path.join(path.dirname(file), match[1]));
      assert(!dependency.startsWith("..") && !path.isAbsolute(dependency));
      files.push(dependency);
    }
  }
  const directory = `source-${sequence}`, hashes = {};
  fs.mkdirSync(path.join(root, directory));
  for (const file of [...new Set(files)].sort()) {
    const bytes = fs.readFileSync(file), destination = path.join(root, directory, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes, { flag: "wx" });
    hashes[file] = sha(bytes);
  }
  return { directory, files: hashes, binary_sha256: sha(fs.readFileSync(binary)) };
}
export function assertSource(source) {
  for (const [file, hash] of Object.entries(source.files)) assert.equal(sha(fs.readFileSync(file)), hash, `Changed qualification source: ${file}`);
  assert.equal(sha(fs.readFileSync(binary)), source.binary_sha256, "Changed qualification binary");
}
