import { describe, expect, test } from "bun:test";
import type { LivingWorld } from "./engine";
import { packWorld, unpackWorld } from "./world-url";

const world: LivingWorld = {
  schema: "platonik-living-world-v1",
  name: "Compressed",
  genesis_hash: "abc",
  genesis: { programs: Array.from({ length: 64 }, (_, index) => ({ index, rules: "supply-fetch-".repeat(24) })) },
  revision: 0,
  events: [],
};

function raw(value: LivingWorld): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("living-world URL transport", () => {
  test("compresses and restores a world exactly", async () => {
    const packed = await packWorld(world);
    expect(packed.startsWith("z")).toBe(true);
    expect(packed.length).toBeLessThan(raw(world).length);
    expect(await unpackWorld(packed)).toEqual(world);
  });

  test("continues to read legacy raw links", async () => {
    const legacy = { ...world, genesis: { programs: [{ rules: "supply-fetch" }] } };
    expect(await unpackWorld(raw(legacy))).toEqual(legacy);
  });

  test("rejects an oversized packed payload before decoding", async () => {
    await expect(unpackWorld("a".repeat(16_385))).rejects.toThrow("compact view limit");
  });
});
