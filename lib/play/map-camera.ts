export type MapCamera = { x: number; y: number; width: number };
export type MapBounds = { width: number; height: number };

function cameraWidth(width: number, world: MapBounds, ratio: number): number {
  return Math.min(Math.max(width, 7), Math.max(world.width + 2, (world.height + 2) * ratio));
}

export function clampCamera(camera: MapCamera, world: MapBounds, ratio: number): MapCamera {
  const width = cameraWidth(camera.width, world, ratio);
  const height = width / ratio;
  // An overview can be larger than the world on one axis. Keep that margin even.
  const axis = (position: number, extent: number, worldExtent: number) => extent >= worldExtent + 2
    ? (worldExtent - extent) / 2
    : Math.max(-1, Math.min(position, worldExtent - extent + 1));
  return { width, x: axis(camera.x, width, world.width), y: axis(camera.y, height, world.height) };
}

export function homeCamera(world: MapBounds, ratio: number, frontier: boolean, compact = false): MapCamera {
  const center = frontier ? { x: 8, y: 6 } : { x: world.width / 2, y: world.height / 2 };
  const width = frontier ? (compact || ratio < 1 ? 10 : 19) : world.width + 2;
  return clampCamera({ x: center.x - width / 2, y: center.y - width / ratio / 2, width }, world, ratio);
}

export function overviewCamera(world: MapBounds, ratio: number): MapCamera {
  return clampCamera({ x: -1, y: -1, width: Math.max(world.width + 2, (world.height + 2) * ratio) }, world, ratio);
}

export function resizeCamera(camera: MapCamera, world: MapBounds, previousRatio: number, nextRatio: number): MapCamera {
  const width = cameraWidth(camera.width, world, nextRatio);
  return clampCamera({
    width,
    x: camera.x + camera.width / 2 - width / 2,
    y: camera.y + camera.width / previousRatio / 2 - width / nextRatio / 2,
  }, world, nextRatio);
}

export function zoomCamera(camera: MapCamera, world: MapBounds, ratio: number, factor: number): MapCamera {
  const width = cameraWidth(camera.width * factor, world, ratio);
  return clampCamera({
    width,
    x: camera.x + (camera.width - width) / 2,
    y: camera.y + (camera.width - width) / ratio / 2,
  }, world, ratio);
}
