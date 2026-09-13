import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { packFiles, parseMetrics, parseTime } from './capacity-io.mjs';

const schema = 'platonik-process-metrics-v1';
const metric = { schema, engine_executions: 1, elapsed_micros: 173 };
const time = 'real 0.21\nuser 0.17\nsys 0.02\n            12345678  maximum resident set size\n';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'platonik-capacity-io-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('time parser reads macOS bytes and tolerates unrelated statistics and JSON records', () => {
  assert.deepEqual(parseTime(`${JSON.stringify(metric)}\n${time}0 page reclaims\n`), {
    wall_seconds: 0.21, user_seconds: 0.17, system_seconds: 0.02, peak_rss_bytes: 12345678,
  });
  assert.deepEqual(parseTime('  real 0\r\nuser 1.01\r\nsys 0.00\r\n1 maximum resident set size\r\n'), {
    wall_seconds: 0, user_seconds: 1.01, system_seconds: 0, peak_rss_bytes: 1,
  });
});

test('time parser rejects every missing or duplicated field', () => {
  const lines = time.trim().split('\n');
  for (const [index, line] of lines.entries()) {
    assert.throws(() => parseTime(lines.filter((_, i) => i !== index).join('\n')), /missing time field/);
    assert.throws(() => parseTime(`${time}${line}\n`), /duplicate time field/);
  }
  assert.throws(() => parseTime(''), /missing time field/);
});

test('time parser rejects malformed, negative, nonfinite and unsafe observations', () => {
  for (const value of ['-1', '-0', 'NaN', 'Infinity', '1e400', '1e-2', '.1', '0.1 extra', '']) {
    for (const label of ['real', 'user', 'sys']) {
      const changed = time.replace(new RegExp(`${label} [^\\n]+`), `${label} ${value}`);
      assert.throws(() => parseTime(changed), /invalid time field/);
    }
  }
  for (const value of ['0', '-1', 'NaN', 'Infinity', '1.1', '9007199254740992', '1 extra', '']) {
    assert.throws(() => parseTime(time.replace('12345678', value)), /invalid time field|RSS must/);
  }
  assert.throws(() => parseTime(time.replace('size\n', 'size trailing\n')), /invalid time field/);
  assert.throws(() => parseTime(null), /time output must be text/);
});

test('metrics parser admits exactly one bounded counter record from mixed stderr', () => {
  assert.deepEqual(parseMetrics(`${JSON.stringify({ schema: 'platonik-error-v1', error: 'example' })}\n${JSON.stringify(metric)}\n${time}`, 1), metric);
  const zero = { schema, engine_executions: 0, elapsed_micros: 0 };
  assert.deepEqual(parseMetrics(` \r\n ${JSON.stringify(zero)} \r\n`, 0), zero);
});

test('metrics parser rejects absent, duplicated and malformed JSON metrics', () => {
  for (const value of ['', time, '{}', 'null', '[]', JSON.stringify({ schema: 'wrong-schema' })]) {
    assert.throws(() => parseMetrics(value, 1), /exactly one process metrics record/);
  }
  assert.throws(() => parseMetrics(`${JSON.stringify(metric)}\n${JSON.stringify(metric)}`, 1), /exactly one process metrics record/);
  for (const value of ['{"schema":', '{broken', '[broken', `"schema":"${schema}"}`]) {
    assert.throws(() => parseMetrics(`${JSON.stringify(metric)}\n${value}`, 1), /malformed JSON/);
  }
});

test('metrics parser rejects invalid fields and reservation overrun', () => {
  for (const key of ['engine_executions', 'elapsed_micros']) {
    for (const value of [undefined, null, '1', -1, 0.5, 9007199254740992]) {
      assert.throws(() => parseMetrics(JSON.stringify({ ...metric, [key]: value }), 1), /nonnegative safe integer/);
    }
    assert.throws(() => parseMetrics(JSON.stringify(metric).replace(`"${key}":${metric[key]}`, `"${key}":1e400`), 1), /nonnegative safe integer/);
  }
  assert.throws(() => parseMetrics(JSON.stringify(metric), 0), /exceed reservation/);
  for (const reservation of [undefined, null, '1', -1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => parseMetrics(JSON.stringify(metric), reservation), /reservation must/);
  }
  assert.throws(() => parseMetrics(null, 1), /metrics output must be text/);
});

test('archive preserves exact bytes, all names, deduplicated blobs and byte accounting', t => {
  const root = temporary(t);
  fs.mkdirSync(path.join(root, 'nested'));
  const shared = Buffer.from([0, 255, 13, 10, 77, 0]);
  const unique = Buffer.from('a different string\n');
  const originals = { 'a.bin': shared, 'nested/b.bin': shared, '__proto__': unique, 'empty': Buffer.alloc(0) };
  // Define the prototype-like filename as an ordinary enumerable property.
  Object.defineProperty(originals, '__proto__', { value: unique, enumerable: true });
  for (const [name, bytes] of Object.entries(originals)) fs.writeFileSync(path.join(root, name), bytes);
  const destination = path.join(root, 'archive.json.gz');
  const result = packFiles(root, Object.keys(originals), destination);
  const packed = fs.readFileSync(destination);
  const archive = JSON.parse(gunzipSync(packed));
  assert.equal(archive.schema, 'platonik-bloom-exchange-capacity-archive-v1');
  assert.deepEqual(Object.keys(archive.files), Object.keys(originals));
  assert.equal(Object.keys(archive.blobs).length, 3);
  for (const [name, original] of Object.entries(originals)) {
    const descriptor = archive.files[name];
    assert.deepEqual(descriptor, { bytes: original.length, sha256: sha(original) });
    assert.deepEqual(gunzipSync(Buffer.from(archive.blobs[descriptor.sha256].gzip, 'base64')), original);
  }
  assert.deepEqual(result, {
    sha256: sha(packed), compressed_bytes: packed.length,
    logical_bytes: shared.length * 2 + unique.length,
    unique_bytes: shared.length + unique.length, file_count: 4, blob_count: 3,
  });
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
});

test('archive can retain an empty file set without creating phantom blobs', t => {
  const root = temporary(t);
  const result = packFiles(root, [], path.join(root, 'empty.gz'));
  assert.equal(result.logical_bytes, 0);
  assert.equal(result.unique_bytes, 0);
  assert.equal(result.file_count, 0);
  assert.equal(result.blob_count, 0);
});

test('archive rejects duplicate, nonnormalized, absolute and traversal paths before writing', t => {
  const root = temporary(t), destination = path.join(root, 'out.gz');
  fs.writeFileSync(path.join(root, 'file'), 'data');
  const invalid = ['', '.', '..', '../file', 'nested/../file', './file', '/file', 'a//file', 'file/', 'a\\file', 'a\0file'];
  for (const name of invalid) {
    assert.throws(() => packFiles(root, [name], destination), /archive names/);
    assert(!fs.existsSync(destination));
  }
  assert.throws(() => packFiles(root, ['file', 'file'], destination), /duplicate archive name/);
  assert.throws(() => packFiles(root, Array(1025).fill('file'), destination), /at most 1024/);
  assert.throws(() => packFiles(root, 'file', destination), /at most 1024/);
  assert.throws(() => packFiles(root, ['absent'], destination), /ENOENT/);
  assert(!fs.existsSync(destination));
});

test('archive rejects symlink sources, symlink components and nonregular sources', t => {
  const root = temporary(t), destination = path.join(root, 'out.gz');
  fs.mkdirSync(path.join(root, 'real'));
  fs.writeFileSync(path.join(root, 'real', 'file'), 'retained');
  fs.symlinkSync('real/file', path.join(root, 'leaf'));
  fs.symlinkSync('real', path.join(root, 'parent'));
  for (const name of ['leaf', 'parent/file']) assert.throws(() => packFiles(root, [name], destination), /symlink/);
  assert.throws(() => packFiles(root, ['real'], destination), /nonregular/);
  assert.throws(() => packFiles(path.join(root, 'parent'), ['file'], destination), /real directory/);
  assert(!fs.existsSync(destination));
});

test('archive rejects oversized sources before reading their bytes', t => {
  const root = temporary(t), destination = path.join(root, 'out.gz');
  const file = path.join(root, 'large');
  fs.writeFileSync(file, '');
  fs.truncateSync(file, 32 * 1024 * 1024 + 1);
  assert.throws(() => packFiles(root, ['large'], destination), /exceeds 32 MiB/);
  assert(!fs.existsSync(destination));
});

test('archive target is exclusive and existing bytes or symlinks are preserved', t => {
  const root = temporary(t), destination = path.join(root, 'out.gz');
  fs.writeFileSync(path.join(root, 'file'), 'source');
  fs.writeFileSync(destination, 'existing archive');
  assert.throws(() => packFiles(root, ['file'], destination), /EEXIST/);
  assert.equal(fs.readFileSync(destination, 'utf8'), 'existing archive');
  const linked = path.join(root, 'linked.gz');
  fs.symlinkSync('out.gz', linked);
  assert.throws(() => packFiles(root, ['file'], linked), /EEXIST/);
  assert(fs.lstatSync(linked).isSymbolicLink());
  assert.equal(fs.readFileSync(destination, 'utf8'), 'existing archive');
});
