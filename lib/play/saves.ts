"use client";

// Browser persistence for the game. Campaigns are stored losslessly: the
// campaign state plus every applied event, so state can always be re-derived
// by replaying the journal — the same event-sourced semantics as the CLI
// stores, with IndexedDB standing in for the filesystem.

const DB_NAME = "platonik-saves";
const DB_VERSION = 1;
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
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("campaigns")) db.createObjectStore("campaigns", { keyPath: "id" });
      if (!db.objectStoreNames.contains("habitats")) db.createObjectStore("habitats", { keyPath: "id" });
      if (!db.objectStoreNames.contains("scores")) db.createObjectStore("scores", { keyPath: "challenge" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function idb<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = run(tx.objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
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
