import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(directory, 'probe.rs');
const binary = path.join(directory, 'probe');
const modes = ['growth-sampled', 'reserved-sampled', 'exact-sampled', 'reuse-sampled', 'growth-batch'];
const calls = [];
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function call(command, args) {
  const started = performance.now();
  const result = spawnSync(command, args, { cwd: directory, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  const record = { command, args, status: result.status, signal: result.signal, elapsed_ms: performance.now() - started, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error?.message ?? null };
  calls.push(record);
  fs.writeFileSync(path.join(directory, 'calls.json'), JSON.stringify(calls, null, 2) + '\n');
  assert.equal(record.error, null);
  assert.equal(record.status, 0, record.stderr);
  return record;
}
assert.equal(process.platform, 'darwin');
assert(!fs.existsSync(path.join(directory, 'result.json')), 'Retain the original diagnostic; do not overwrite it.');
const metadata = {
  schema: 'platonik-zero-engine-rss-diagnostic-v1',
  source_sha256: hash(source),
  driver_sha256: hash(fileURLToPath(import.meta.url)),
  rustc: call('/opt/homebrew/bin/rustc', ['--version', '--verbose']).stdout.trim(),
  os: call('/usr/bin/sw_vers', []).stdout.trim(),
  architecture: call('/usr/bin/uname', ['-m']).stdout.trim(),
  allocator_environment: Object.fromEntries(['MallocStackLogging', 'MallocStackLoggingNoCompact', 'MallocScribble', 'MallocPreScribble', 'MallocGuardEdges', 'MallocNanoZone', 'MallocProbGuard', 'MallocZeroOnFree', 'MallocCheckHeapStart', 'DYLD_INSERT_LIBRARIES'].map(key => [key, process.env[key] ?? null])),
  modes, lengths: [4399674, 5077003], iterations_per_length: 8, engine_executions: 0,
};
call('/opt/homebrew/bin/rustc', ['--edition=2024', '-O', source, '-o', binary]);
metadata.binary_sha256 = hash(binary);
const results = modes.map(mode => {
  const output = call(binary, [mode]);
  const rows = output.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(rows.at(-1).engine_executions, 0);
  assert.equal(rows.filter(row => row.kind === 'batch').length, 2);
  fs.writeFileSync(path.join(directory, mode + '.ndjson'), output.stdout);
  return { mode, rows };
});
fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify({ ...metadata, results }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ engine_executions: 0, summary: results.flatMap(result => result.rows.filter(row => row.kind === 'batch')) }));
