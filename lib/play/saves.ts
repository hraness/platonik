"use client";

import type { LivingWorld } from "./engine";

// Browser persistence for the game. Campaigns are stored losslessly: the
// campaign state plus every applied event, so state can always be re-derived
// by replaying the journal — the same event-sourced semantics as the CLI
// stores, with IndexedDB standing in for the filesystem.

const DB_NAME = "platonik-saves";
const DB_VERSION = 4;
const MEMORY = new Map<string, unknown>();

export interface CampaignSave {
  id: string;
  kind: "expedition";
  name: string;
  ambition: "frugal" | "resilient";
  created: number;
  updated: number;
  state: unknown; // Campaign JSON value
  events: unknown[]; // applied expedition Events, in order
}

export interface HabitatSave {
  id: string;
  kind: "habitat";
  journey: string;
  caseId: string;
  created: number;
  updated: number;
  experiment: unknown;
  advance: unknown; // latest Advance (paused checkpoint or finished result)
  advances: number;
}

export interface WorldSave {
  id: string;
  kind: "world";
  updated: number;
  world: LivingWorld;
}

export interface Mark {
  key: string; // e.g. "journey:answer-0001", "opening:opening-normal"
  passed: boolean;
  updated: number;
}

export interface ChallengeScore {
  challenge: string;
  index: number;
  passed: boolean;
  cases_passed: number;
  cases_total: number;
  total_work: number;
  program_bytes: number;
  submission_hash: string;
  agent?: string;
  updated: number;
  submission: unknown;
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open(DB_NAME, DB_VERSION); }
    catch { resolve(null); return; }
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("campaigns")) db.createObjectStore("campaigns", { keyPath: "id" });
      if (!db.objectStoreNames.contains("habitats")) db.createObjectStore("habitats", { keyPath: "id" });
      if (!db.objectStoreNames.contains("worlds")) db.createObjectStore("worlds", { keyPath: "id" });
      if (!db.objectStoreNames.contains("scores")) db.createObjectStore("scores", { keyPath: "challenge" });
      if (!db.objectStoreNames.contains("marks")) db.createObjectStore("marks", { keyPath: "key" });
      if (!db.objectStoreNames.contains("last")) db.createObjectStore("last", { keyPath: "id" });
    };
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onblocked = () => {
      blocked = true;
      resolve(null);
    };
    request.onerror = () => resolve(null);
  });
}

async function idb<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction | undefined;
    let result: T;
    let settled = false;
    function fail(error: unknown) {
      if (settled) return;
      settled = true;
      db!.close();
      reject(error ?? new Error("Browser storage could not complete the transaction."));
    }
    try {
      const tx = db.transaction(store, mode);
      transaction = tx;
      tx.oncomplete = () => {
        if (settled) return;
        settled = true;
        db.close();
        resolve(result);
      };
      tx.onabort = () => fail(tx.error);
      tx.onerror = () => fail(tx.error);
      const request = run(tx.objectStore(store));
      // A successful request can still be rolled back by its transaction.
      // Only oncomplete means the complete write has committed.
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => fail(request.error);
    } catch (error) {
      try { transaction?.abort(); } catch { /* Already inactive. */ }
      fail(error);
    }
  });
}

const memKey = (store: string, id: string) => `${store}:${id}`;

export async function saveCampaign(save: CampaignSave): Promise<void> {
  save.updated = Date.now();
  const done = await idb("campaigns", "readwrite", (s) => s.put(save));
  if (done === null) MEMORY.set(memKey("campaigns", save.id), save);
}

export async function loadCampaign(id: string): Promise<CampaignSave | null> {
  const row = await idb<CampaignSave>("campaigns", "readonly", (s) => s.get(id));
  return row ?? (MEMORY.get(memKey("campaigns", id)) as CampaignSave | undefined) ?? null;
}

export async function listCampaigns(): Promise<CampaignSave[]> {
  const rows = await idb<CampaignSave[]>("campaigns", "readonly", (s) => s.getAll() as IDBRequest<CampaignSave[]>);
  const mem = [...MEMORY.entries()]
    .filter(([k]) => k.startsWith("campaigns:"))
    .map(([, v]) => v as CampaignSave);
  const merged = new Map<string, CampaignSave>();
  for (const row of [...(rows ?? []), ...mem]) merged.set(row.id, row);
  return [...merged.values()].sort((a, b) => b.updated - a.updated);
}

export async function deleteCampaign(id: string): Promise<void> {
  await idb("campaigns", "readwrite", (s) => s.delete(id));
  MEMORY.delete(memKey("campaigns", id));
}

export async function saveHabitat(save: HabitatSave): Promise<void> {
  save.updated = Date.now();
  const done = await idb("habitats", "readwrite", (s) => s.put(save));
  if (done === null) MEMORY.set(memKey("habitats", save.id), save);
}

export async function loadHabitat(id: string): Promise<HabitatSave | null> {
  const row = await idb<HabitatSave>("habitats", "readonly", (s) => s.get(id));
  return row ?? (MEMORY.get(memKey("habitats", id)) as HabitatSave | undefined) ?? null;
}

/** True only after a browser-storage commit; false means this tab's memory. */
export async function saveWorld(world: LivingWorld, id: string): Promise<boolean> {
  const value: WorldSave = { id, kind: "world", updated: Date.now(), world };
  const done = await idb("worlds", "readwrite", (store) => store.put(value));
  if (done === null) {
    MEMORY.set(memKey("worlds", id), value);
    return false;
  }
  return true;
}

export async function listWorlds(): Promise<WorldSave[]> {
  const rows = await idb<WorldSave[]>("worlds", "readonly", (store) => store.getAll() as IDBRequest<WorldSave[]>);
  const memory = [...MEMORY.entries()]
    .filter(([key]) => key.startsWith("worlds:"))
    .map(([, value]) => value as WorldSave);
  const revisions = new Map<string, WorldSave>();
  for (const row of [...(rows ?? []), ...memory]) revisions.set(row.id, row);
  return [...revisions.values()].sort((a, b) => b.updated - a.updated);
}

export async function latestWorld(): Promise<WorldSave | null> {
  return (await listWorlds())[0] ?? null;
}

export async function saveScore(score: ChallengeScore): Promise<void> {
  score.updated = Date.now();
  const done = await idb("scores", "readwrite", (s) => s.put(score));
  if (done === null) MEMORY.set(memKey("scores", score.challenge), score);
}

export async function getScore(challenge: string): Promise<ChallengeScore | null> {
  const row = await idb<ChallengeScore>("scores", "readonly", (s) => s.get(challenge));
  return row ?? (MEMORY.get(memKey("scores", challenge)) as ChallengeScore | undefined) ?? null;
}

export async function allScores(): Promise<ChallengeScore[]> {
  const rows = await idb<ChallengeScore[]>("scores", "readonly", (s) => s.getAll() as IDBRequest<ChallengeScore[]>);
  const mem = [...MEMORY.entries()]
    .filter(([k]) => k.startsWith("scores:"))
    .map(([, v]) => v as ChallengeScore);
  const merged = new Map<string, ChallengeScore>();
  for (const row of [...(rows ?? []), ...mem]) merged.set(row.challenge, row);
  return [...merged.values()];
}

export async function saveMark(mark: Mark): Promise<void> {
  mark.updated = Date.now();
  const done = await idb("marks", "readwrite", (s) => s.put(mark));
  if (done === null) MEMORY.set(memKey("marks", mark.key), mark);
}

export async function allMarks(): Promise<Mark[]> {
  const rows = await idb<Mark[]>("marks", "readonly", (s) => s.getAll() as IDBRequest<Mark[]>);
  const mem = [...MEMORY.entries()]
    .filter(([k]) => k.startsWith("marks:"))
    .map(([, v]) => v as Mark);
  const merged = new Map<string, Mark>();
  for (const row of [...(rows ?? []), ...mem]) merged.set(row.key, row);
  return [...merged.values()];
}

export interface LastPlay {
  id: "last";
  track: string;
  case?: string;
  updated: number;
}

export async function saveLastPlay(last: Omit<LastPlay, "id" | "updated">): Promise<void> {
  const value: LastPlay = { id: "last", ...last, updated: Date.now() };
  const done = await idb("last", "readwrite", (s) => s.put(value));
  if (done === null) MEMORY.set("last:last", value);
}

export async function loadLastPlay(): Promise<LastPlay | null> {
  const row = await idb<LastPlay>("last", "readonly", (s) => s.get("last"));
  return row ?? (MEMORY.get("last:last") as LastPlay | undefined) ?? null;
}
