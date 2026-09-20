import { describe, expect, test } from "bun:test";
import { clampCamera, homeCamera, overviewCamera, resizeCamera, zoomCamera } from "./map-camera";

const world = { width: 32, height: 22 };

describe("frontier camera", () => {
  test("panning stops at the world border with one tile of margin", () => {
    expect(clampCamera({ x: -100, y: -100, width: 10 }, world, 2)).toEqual({ x: -1, y: -1, width: 10 });
    expect(clampCamera({ x: 100, y: 100, width: 10 }, world, 2)).toEqual({ x: 23, y: 18, width: 10 });
  });

  test("the whole map stays centered in landscape and portrait viewports", () => {
    for (const ratio of [2, .5]) {
      const camera = overviewCamera(world, ratio);
      expect(camera.x + camera.width / 2).toBe(world.width / 2);
      expect(camera.y + camera.width / ratio / 2).toBe(world.height / 2);
      expect(camera.x).toBeLessThanOrEqual(-1);
      expect(camera.y).toBeLessThanOrEqual(-1);
      expect(camera.x + camera.width).toBeGreaterThanOrEqual(world.width + 1);
      expect(camera.y + camera.width / ratio).toBeGreaterThanOrEqual(world.height + 1);
    }
  });

  test("resizing preserves the explored center and zoom instead of going home", () => {
    const explored = { x: 8, y: 6, width: 12 };
    const resized = resizeCamera(explored, world, 1.5, 2.4);
    expect(resized.width).toBe(explored.width);
    expect(resized.x + resized.width / 2).toBe(explored.x + explored.width / 2);
    expect(resized.y + resized.width / 2.4 / 2).toBe(explored.y + explored.width / 1.5 / 2);
    expect(resizeCamera(resized, world, 2.4, 1.5)).toEqual(explored);
  });

  test("a taller viewport keeps the camera within the bottom world border", () => {
    const resized = resizeCamera({ x: 19, y: 13, width: 12 }, world, 1.5, .6);
    expect(resized).toEqual({ x: 19, y: 3, width: 12 });
    expect(resized.y + resized.width / .6).toBe(world.height + 1);
  });

  test("zooming at either limit does not drift the camera", () => {
    const closest = { x: 10, y: 8, width: 7 };
    expect(zoomCamera(closest, world, 2, .8)).toEqual(closest);
    const farthest = overviewCamera(world, 2);
    expect(zoomCamera(farthest, world, 2, 1.25)).toEqual(farthest);
  });

  test("zoom keeps the same point at the center until a world border is reached", () => {
    const camera = { x: 8, y: 6, width: 12 };
    const zoomed = zoomCamera(camera, world, 2, .8);
    expect(zoomed.x + zoomed.width / 2).toBeCloseTo(camera.x + camera.width / 2);
    expect(zoomed.y + zoomed.width / 2 / 2).toBeCloseTo(camera.y + camera.width / 2 / 2);
  });

  test("home gives the starter settlement a useful scale on narrow screens", () => {
    expect(homeCamera(world, .75, true).width).toBe(10);
    expect(homeCamera(world, 1.1, true, true).width).toBe(10);
    expect(homeCamera(world, 1.65, true).width).toBe(19);
  });
});
