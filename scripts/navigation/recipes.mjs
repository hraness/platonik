// Public finite timing/orientation neighborhood. No organism executes here.
import assert from "node:assert/strict";
import { read } from "../continuity/runner.mjs";

export function derive(recipe) {
  const world = read(recipe.source);
  if (recipe.close !== undefined) {
    const edges = world.events.filter(event => event.event.kind === "edge_blocked");
    assert.equal(edges.length, 2);
    for (const event of edges) event.tick = event.event.blocked ? recipe.close : recipe.reopen;
    world.events.sort((a, b) => a.tick - b.tick);
  }
  if (recipe.rotate) {
    const point = p => ({ x: world.width - 1 - p.x, y: world.height - 1 - p.y });
    world.walls = world.walls.map(point);
    for (const group of ["sources", "depots", "beacons", "valves", "cells"])
      for (const entity of world[group]) entity.position = point(entity.position);
    const opposite = { north: "south", south: "north", east: "west", west: "east" };
    for (const cell of world.cells) cell.heading = opposite[cell.heading];
    for (const event of world.events) if (event.event.kind === "edge_blocked") {
      const ends = [point(event.event.edge.a), point(event.event.edge.b)]
        .sort((a, b) => a.x - b.x || a.y - b.y);
      event.event.edge = { a: ends[0], b: ends[1] };
    }
  }
  return world;
}
