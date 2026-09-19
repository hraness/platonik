import { afterEach, describe, expect, test } from "bun:test";
import type { LivingWorld } from "./engine";
import { listWorlds, loadCampaign, saveWorld } from "./saves";

const originalIndexedDb = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
afterEach(() => {
  if (originalIndexedDb) Object.defineProperty(globalThis, "indexedDB", originalIndexedDb);
  else Reflect.deleteProperty(globalThis, "indexedDB");
});

function install(value: unknown) {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value });
}

function world(name: string): LivingWorld {
  return {
    schema: "platonik-living-world-v1", name, genesis_hash: "same-frontier-genesis",
    genesis: {}, revision: 0, events: [],
  } as LivingWorld;
}

// Control request success separately from transaction completion: IndexedDB can
// accept a put and still abort the surrounding transaction without storing it.
function controlledDatabase(result: unknown) {
  let closed = 0;
  const ready = Promise.withResolvers<void>();
  const request = {
    result, error: null as DOMException | null,
    onsuccess: null as (() => void) | null,
    onerror: null as (() => void) | null,
  };
  const transaction = {
    error: null as DOMException | null,
    oncomplete: null as (() => void) | null,
    onabort: null as (() => void) | null,
    onerror: null as (() => void) | null,
    abort() { this.onabort?.(); },
    objectStore() {
      const operation = () => { ready.resolve(); return request; };
      return { put: operation, get: operation, getAll: operation };
    },
  };
  const database = {
    onversionchange: null,
    close() { closed++; },
    transaction() { return transaction; },
  };
  install({
    open() {
      const opening = {
        result: database,
        onsuccess: null as (() => void) | null,
      };
      queueMicrotask(() => opening.onsuccess?.());
      return opening;
    },
  });
  return {
    ready: ready.promise,
    requestSucceeded() { request.onsuccess?.(); },
    committed() { transaction.oncomplete?.(); },
    aborted() {
      transaction.error = new DOMException("Save rolled back", "AbortError");
      transaction.onabort?.();
    },
    requestFailed() {
      request.error = new DOMException("Storage quota exceeded", "QuotaExceededError");
      request.onerror?.();
    },
    get closed() { return closed; },
  };
}

describe("world save durability", () => {
  test("a successful put is pending until its transaction commits", async () => {
    const db = controlledDatabase("commit-world");
    let settled = false;
    const saving = saveWorld(world("Committed"), "commit-world").then((value) => {
      settled = true;
      return value;
    });
    await db.ready;
    db.requestSucceeded();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(db.closed).toBe(0);
    db.committed();
    expect(await saving).toBe(true);
    expect(db.closed).toBe(1);
  });

  test("transaction abort after successful put never reports a saved world", async () => {
    const db = controlledDatabase("abort-world");
    const saving = saveWorld(world("Aborted"), "abort-world");
    const outcome = saving.catch((error: unknown) => error);
    await db.ready;
    db.requestSucceeded();
    db.aborted();
    expect(await outcome).toMatchObject({ name: "AbortError", message: "Save rolled back" });
    expect(db.closed).toBe(1);
    install(undefined);
    expect((await listWorlds()).some((row) => row.id === "abort-world")).toBe(false);
  });

  test("request failures reject and close the connection exactly once", async () => {
    const db = controlledDatabase("quota-world");
    const saving = saveWorld(world("Quota"), "quota-world");
    const outcome = saving.catch((error: unknown) => error);
    await db.ready;
    db.requestFailed();
    db.aborted();
    expect(await outcome).toMatchObject({ name: "QuotaExceededError", message: "Storage quota exceeded" });
    expect(db.closed).toBe(1);
  });

  test("a committed missing read remains a valid empty result", async () => {
    const db = controlledDatabase(undefined);
    const loading = loadCampaign("absent-campaign");
    await db.ready;
    db.requestSucceeded();
    db.committed();
    expect(await loading).toBeNull();
    expect(db.closed).toBe(1);
  });

  test("unavailable storage reports memory-only and retains separate revisions", async () => {
    install(undefined);
    expect(await saveWorld(world("Copperwake"), "memory-world-r0")).toBe(false);
    expect(await saveWorld({ ...world("Copperwake"), revision: 1 }, "memory-world-r1")).toBe(false);
    expect(await saveWorld(world("Copperwake 2"), "memory-world-2")).toBe(false);
    const rows = await listWorlds();
    expect(rows.filter((row) => row.id.startsWith("memory-world"))).toHaveLength(3);
    expect(rows.find((row) => row.id === "memory-world-r0")?.world.revision).toBe(0);
    expect(rows.find((row) => row.id === "memory-world-r1")?.world.revision).toBe(1);
  });

  test("a synchronous browser denial also reports memory-only", async () => {
    install({ open() { throw new DOMException("Storage denied", "SecurityError"); } });
    expect(await saveWorld(world("Denied"), "denied-world")).toBe(false);
    expect((await listWorlds()).some((row) => row.id === "denied-world")).toBe(true);
  });
});
