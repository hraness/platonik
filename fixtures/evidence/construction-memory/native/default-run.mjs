import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const directory = path.dirname(fileURLToPath(import.meta.url));
const original = JSON.parse(fs.readFileSync(path.join(directory, 'result.json')));
const binary = path.join(directory, 'probe');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(hash(binary), original.binary_sha256);
assert(!fs.existsSync(path.join(directory, 'default-result.json')));
const environment = { ...process.env };
delete environment.MallocNanoZone;
const modes = ['growth-sampled', 'reserved-sampled'];
const calls = [];
for (const mode of modes) {
  const started = performance.now();
  const result = spawnSync(binary, [mode], { cwd: directory, env: environment, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  const call = { mode, elapsed_ms: performance.now() - started, status: result.status, signal: result.signal, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error?.message ?? null };
  calls.push(call);
  fs.writeFileSync(path.join(directory, 'default-calls.json'), JSON.stringify(calls, null, 2) + '\n');
  assert.equal(call.error, null);
  assert.equal(call.status, 0, call.stderr);
  const rows = call.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(rows.at(-1).engine_executions, 0);
  assert.equal(rows.filter(row => row.kind === 'batch').length, 2);
  fs.writeFileSync(path.join(directory, 'default-' + mode + '.ndjson'), call.stdout, { flag: 'wx' });
}
const record = { schema: 'platonik-zero-engine-rss-default-pair-v1', driver_sha256: hash(fileURLToPath(import.meta.url)), original_result_sha256: hash(path.join(directory, 'result.json')), binary_sha256: hash(binary), rustc: original.rustc, os: original.os, architecture: original.architecture, parent_malloc_nano_zone: process.env.MallocNanoZone ?? null, child_malloc_nano_zone: null, other_environment: 'Unchanged from the scheduled parent', modes, iterations_per_length: 8, lengths: [4399674, 5077003], engine_executions: 0, results: calls.map(call => ({ mode: call.mode, rows: call.stdout.trim().split('\n').map(line => JSON.parse(line)) })) };
fs.writeFileSync(path.join(directory, 'default-result.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ engine_executions: 0, summary: record.results.flatMap(result => result.rows.filter(row => row.kind === 'batch')) }));
