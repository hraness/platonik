"use client";

import type { LivingWorld } from "./engine";

const MAX_PACKED_BYTES = 16_384;
const MAX_WORLD_BYTES = 64 * 1_048_576;

function encode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit: number): Promise<Uint8Array> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const input = new Blob([copy]);
  const reader = input.stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      throw new Error("World URL expands beyond the bounded world limit.");
    }
    chunks.push(value);
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

export async function packWorld(world: LivingWorld): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(world));
  if (bytes.length > MAX_WORLD_BYTES) throw new Error("World exceeds the bounded world limit.");
  const compressed = await transform(bytes, new CompressionStream("deflate"), MAX_WORLD_BYTES);
  const packed = `z${encode(compressed)}`;
  if (packed.length > MAX_PACKED_BYTES) throw new Error("World URL exceeds the compact view limit.");
  return packed;
}

export async function unpackWorld(value: string): Promise<LivingWorld> {
  if (value.length > MAX_PACKED_BYTES) throw new Error("World URL exceeds the compact view limit.");
  const bytes = value.startsWith("z")
    ? await transform(decode(value.slice(1)), new DecompressionStream("deflate"), MAX_WORLD_BYTES)
    : decode(value);
  if (bytes.length > MAX_WORLD_BYTES) throw new Error("World URL expands beyond the bounded world limit.");
  return JSON.parse(new TextDecoder().decode(bytes)) as LivingWorld;
}
