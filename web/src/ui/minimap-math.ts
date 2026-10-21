// Pure geometry of the minimap. World x maps to map right, world z to map down,
// so a player facing forward at yaw 0 (world -z) points up on the map.

import type { Bounds } from '../world/schema';

export interface MapPoint {
  readonly x: number;
  readonly y: number;
}

export interface MapFit {
  /** Map px per world metre. */
  readonly scale: number;
  point(x: number, z: number): MapPoint;
  /** A world length in metres as map px. */
  radius(r: number): number;
  /** End of a heading tick of `length` map px drawn from the player at (x, z). */
  tick(x: number, z: number, yaw: number, length: number): MapPoint;
  /** The world spot under map px (mx, my), the inverse of `point`, clamped to the bounds. */
  toWorld(mx: number, my: number): { x: number; z: number };
}

/** Fits the bounds into a `size` x `size` square with `padding` px on every side, keeping the aspect ratio. */
export function fitBounds(bounds: Bounds, size: number, padding: number): MapFit {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxZ - bounds.minZ;
  const inner = Math.max(size - 2 * padding, 1);
  const span = Math.max(w, h);
  const scale = span > 0 ? inner / span : 1;
  // Center the shorter axis in the square.
  const offsetX = padding + (inner - w * scale) / 2;
  const offsetY = padding + (inner - h * scale) / 2;
  const point = (x: number, z: number): MapPoint => ({
    x: offsetX + (x - bounds.minX) * scale,
    y: offsetY + (z - bounds.minZ) * scale,
  });
  return {
    scale,
    point,
    radius: (r) => r * scale,
    tick(x, z, yaw, length) {
      const p = point(x, z);
      return { x: p.x - Math.sin(yaw) * length, y: p.y - Math.cos(yaw) * length };
    },
    toWorld(mx, my) {
      const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);
      return {
        x: clamp(bounds.minX + (mx - offsetX) / scale, bounds.minX, bounds.maxX),
        z: clamp(bounds.minZ + (my - offsetY) / scale, bounds.minZ, bounds.maxZ),
      };
    },
  };
}

/** Keeps a point at least `margin` px inside a `size` x `size` square. */
export function clampToSquare(p: MapPoint, size: number, margin: number): MapPoint {
  const clamp = (v: number): number => Math.min(Math.max(v, margin), size - margin);
  return { x: clamp(p.x), y: clamp(p.y) };
}
