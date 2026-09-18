"use client";

import type { LivingWorld } from "./engine";

function encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "="));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function packWorld(world: LivingWorld): string {
  return encode(JSON.stringify(world));
}

export function unpackWorld(value: string): LivingWorld {
  if (value.length > 16_384) throw new Error("World URL exceeds the compact view limit.");
  return JSON.parse(decode(value)) as LivingWorld;
}
