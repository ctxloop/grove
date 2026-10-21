// Shareable position in the URL hash. Pure.
// Format: #x=<meters>&z=<meters>&h=<heading in whole degrees>.

import type { Bounds } from './schema';

export interface HashPosition {
  readonly x: number;
  readonly z: number;
  /** Radians, the player's yaw. */
  readonly yaw: number;
}

const NUMBER = /^-?\d+(\.\d+)?$/;
const DEG = 180 / Math.PI;

export function formatHash(p: HashPosition): string {
  const h = ((Math.round(p.yaw * DEG) % 360) + 360) % 360;
  return `#x=${p.x.toFixed(1)}&z=${p.z.toFixed(1)}&h=${h}`;
}

/** The position in `hash`, or null when it is missing, malformed, or further than `margin` outside `bounds`. */
export function parseHash(hash: string, bounds: Bounds, margin: number): HashPosition | null {
  const q = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const x = q.get('x');
  const z = q.get('z');
  const h = q.get('h') ?? '0';
  if (x === null || z === null || !NUMBER.test(x) || !NUMBER.test(z) || !NUMBER.test(h)) return null;
  const px = Number(x);
  const pz = Number(z);
  if (px < bounds.minX - margin || px > bounds.maxX + margin || pz < bounds.minZ - margin || pz > bounds.maxZ + margin) return null;
  return { x: px, z: pz, yaw: Number(h) / DEG };
}
