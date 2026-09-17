"use client";

import type { Program } from "./engine";

/**
 * Content-addressable program URLs for the own-agent flow.
 *
 * A program is canonicalized as stable JSON with sorted object keys, then
 * identified by the SHA-256 hash of that canonical string. The program bytes
 * can travel in the URL itself (base64url) or be fetched from a `programUrl`
 * provided by the agent's local server.
 *
 * The hash in the path is the content address; the `?program=` query carries
 * the literal. The browser verifies that the literal matches the address before
 * running it. No server-side program storage is required.
 */

export interface ShareState {
  track: "opening" | "challenges" | "expedition" | "journeys";
  case?: string;
  program: Program;
}

/** Recursively sort object keys so the same semantic program hashes the same. */
function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const sorted = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => [k, canonicalize(v)] as const);
  return Object.fromEntries(sorted);
}

export function canonicalJson(program: Program): string {
  return JSON.stringify(canonicalize(program));
}

function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const bin = String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(text: string): string {
  const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

async function digestHex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function programHash(program: Program): Promise<string> {
  return digestHex(canonicalJson(program));
}

export function packProgram(program: Program): string {
  return base64UrlEncode(canonicalJson(program));
}

export function unpackProgram(packed: string): Program {
  const json = base64UrlDecode(packed);
  return JSON.parse(json) as Program;
}

export async function verifyProgram(
  packed: string,
  expectedHash: string,
): Promise<boolean> {
  const program = unpackProgram(packed);
  const hash = await programHash(program);
  return hash === expectedHash;
}

/** Build the canonical shareable URL for a program and a case/track. */
export async function buildPlayUrl(state: ShareState, siteUrl?: string): Promise<string> {
  const hash = await programHash(state.program);
  const params = new URLSearchParams();
  params.set("mode", state.track);
  if (state.case) params.set("case", state.case);
  params.set("program", packProgram(state.program));
  const defaultUrl =
    typeof window !== "undefined" ? window.location.origin : "https://platonik.space";
  const base = siteUrl ?? defaultUrl;
  return `${base}/play/p/${hash}?${params.toString()}`;
}

/** Parse a `?program=` or `?programUrl=` value and optional context. */
export interface UrlProgram {
  hash: string;
  packed?: string;
  programUrl?: string;
  track?: ShareState["track"];
  case?: string;
}

export function parsePlaySearch(
  programHash: string,
  search: URLSearchParams | Record<string, string | string[] | undefined>,
): UrlProgram {
  const raw = search instanceof URLSearchParams ? search : new URLSearchParams();
  if (!(search instanceof URLSearchParams)) {
    for (const [key, value] of Object.entries(search)) {
      if (value != null) raw.set(key, String(value));
    }
  }
  const track = raw.get("mode") as ShareState["track"] | undefined;
  const validTrack =
    track === "opening" || track === "challenges" || track === "expedition" || track === "journeys"
      ? track
      : undefined;
  return {
    hash: programHash,
    packed: raw.get("program") ?? undefined,
    programUrl: raw.get("programUrl") ?? undefined,
    track: validTrack,
    case: raw.get("case") ?? undefined,
  };
}
