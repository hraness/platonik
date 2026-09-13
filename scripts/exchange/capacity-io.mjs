import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const METRICS_SCHEMA = 'platonik-process-metrics-v1';
const ARCHIVE_SCHEMA = 'platonik-bloom-exchange-capacity-archive-v1';
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_FILES = 1024;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const nonnegativeInteger = value => Number.isSafeInteger(value) && value >= 0;

// The time utility shares stderr with the measured process. Ignore its other
// statistics and the process's JSON lines, but never guess a missing field.
export function parseTime(text) {
  assert.equal(typeof text, 'string', 'time output must be text');
  const fields = new Map();
  const record = (name, token, integer = false) => {
    assert(!fields.has(name), `duplicate time field: ${name}`);
    assert(typeof token === 'string' && (integer ? /^\d+$/ : /^\d+(?:\.\d+)?$/).test(token), `invalid time field: ${name}`);
    const value = Number(token);
    assert(Number.isFinite(value) && value >= 0, `invalid time field: ${name}`);
    if (integer) assert(Number.isSafeInteger(value) && value > 0, 'RSS must be positive safe integer bytes');
    fields.set(name, value);
  };
  for (const line of text.split(/\r?\n/).map(value => value.trim())) {
    const timing = /^(real|user|sys)\b(.*)$/.exec(line);
    if (timing) record(timing[1], timing[2].trim());
    else if (line.includes('maximum resident set size')) {
      const rss = /^(\S+)\s+maximum resident set size$/.exec(line);
      record('rss', rss?.[1], true);
    }
  }
  for (const name of ['real', 'user', 'sys', 'rss']) assert(fields.has(name), `missing time field: ${name}`);
  return {
    wall_seconds: fields.get('real'),
    user_seconds: fields.get('user'),
    system_seconds: fields.get('sys'),
    peak_rss_bytes: fields.get('rss'),
  };
}

export function parseMetrics(text, reservation) {
  assert.equal(typeof text, 'string', 'metrics output must be text');
  assert(nonnegativeInteger(reservation), 'reservation must be a nonnegative safe integer');
  const metrics = [];
  for (const line of text.split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
    // JSON records may accompany ordinary /usr/bin/time statistics. A damaged
    // JSON record is an accounting failure even if another valid record exists.
    if (!/^[{\[]/.test(line) && !line.includes(METRICS_SCHEMA)) continue;
    let row;
    try { row = JSON.parse(line); }
    catch { throw new Error('malformed JSON in process metrics output'); }
    if (row?.schema === METRICS_SCHEMA) metrics.push(row);
  }
  assert.equal(metrics.length, 1, 'expected exactly one process metrics record');
  const metric = metrics[0];
  assert(nonnegativeInteger(metric.engine_executions), 'engine_executions must be a nonnegative safe integer');
  assert(metric.engine_executions <= reservation, 'engine executions exceed reservation');
  assert(nonnegativeInteger(metric.elapsed_micros), 'elapsed_micros must be a nonnegative safe integer');
  return metric;
}

function safeName(name) {
  assert(typeof name === 'string' && name.length > 0, 'archive names must be nonempty strings');
  assert(!name.includes('\\') && !name.includes('\0') && !path.posix.isAbsolute(name), 'archive names must be relative POSIX paths');
  assert(path.posix.normalize(name) === name && !name.split('/').some(part => part === '.' || part === '..' || part === ''), 'archive names must be normalized relative POSIX paths');
}

function readRegularFile(root, name) {
  const pieces = name.split('/');
  let current = root;
  for (const [index, piece] of pieces.entries()) {
    current = path.join(current, piece);
    const stat = fs.lstatSync(current);
    assert(!stat.isSymbolicLink(), `symlink in archive source: ${name}`);
    assert(index === pieces.length - 1 ? stat.isFile() : stat.isDirectory(), `nonregular archive source: ${name}`);
  }
  const fd = fs.openSync(current, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = fs.fstatSync(fd);
    assert(before.isFile(), `nonregular archive source: ${name}`);
    assert(before.size <= MAX_FILE_BYTES, `archive source exceeds 32 MiB: ${name}`);
    // One extra byte detects growth without letting a changing source allocate
    // an unbounded read. A source mutation stops packing rather than truncating.
    const buffer = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const bytes = fs.readSync(fd, buffer, length, buffer.length - length, null);
      if (bytes === 0) break;
      length += bytes;
    }
    const after = fs.fstatSync(fd);
    assert(length === before.size && after.size === before.size && after.mtimeMs === before.mtimeMs && after.ctimeMs === before.ctimeMs, `archive source changed while reading: ${name}`);
    return buffer.subarray(0, length);
  } finally { fs.closeSync(fd); }
}

// This is a container for retained bytes, not an extraction format. Every name
// remains mapped even when deterministic repetitions share a single blob.
export function packFiles(directory, names, archivePath) {
  assert(Array.isArray(names) && names.length <= MAX_FILES, 'archive supports at most 1024 file entries');
  for (const name of names) safeName(name);
  assert.equal(new Set(names).size, names.length, 'duplicate archive name');
  const rootStat = fs.lstatSync(directory);
  assert(!rootStat.isSymbolicLink() && rootStat.isDirectory(), 'archive root must be a real directory');
  const root = fs.realpathSync(directory);
  const files = Object.create(null), blobs = Object.create(null);
  let logicalBytes = 0, uniqueBytes = 0;
  let envelopeBytes = Buffer.byteLength(JSON.stringify({ schema: ARCHIVE_SCHEMA, files, blobs }));
  for (const name of names) {
    const raw = readRegularFile(root, name), hash = sha256(raw);
    const descriptor = { bytes: raw.length, sha256: hash };
    envelopeBytes += Buffer.byteLength(JSON.stringify(name)) + 1 + Buffer.byteLength(JSON.stringify(descriptor)) + (Object.keys(files).length ? 1 : 0);
    if (!Object.hasOwn(blobs, hash)) {
      const blob = { gzip: gzipSync(raw, { level: 9 }).toString('base64') };
      envelopeBytes += Buffer.byteLength(JSON.stringify(hash)) + 1 + Buffer.byteLength(JSON.stringify(blob)) + (Object.keys(blobs).length ? 1 : 0);
      assert(envelopeBytes <= MAX_ARCHIVE_BYTES, 'encoded archive envelope exceeds 64 MiB');
      blobs[hash] = blob;
      uniqueBytes += raw.length;
    }
    assert(envelopeBytes <= MAX_ARCHIVE_BYTES, 'encoded archive envelope exceeds 64 MiB');
    files[name] = descriptor;
    logicalBytes += raw.length;
  }
  const envelope = Buffer.from(JSON.stringify({ schema: ARCHIVE_SCHEMA, files, blobs }));
  assert.equal(envelope.length, envelopeBytes, 'archive envelope accounting mismatch');
  assert(envelope.length <= MAX_ARCHIVE_BYTES, 'encoded archive envelope exceeds 64 MiB');
  const archive = gzipSync(envelope, { level: 9 });
  assert(archive.length <= MAX_ARCHIVE_BYTES, 'compressed archive exceeds 64 MiB');
  fs.writeFileSync(archivePath, archive, { flag: 'wx', mode: 0o600 });
  return {
    sha256: sha256(archive),
    compressed_bytes: archive.length,
    logical_bytes: logicalBytes,
    unique_bytes: uniqueBytes,
    file_count: names.length,
    blob_count: Object.keys(blobs).length,
  };
}
