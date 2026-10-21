import { config } from '../config';
import { SpatialGrid, type TreeRef } from './grid';

export interface PickHit {
  biome: number;
  index: number;
  distance: number;
}

const candidates: TreeRef[] = [];

/**
 * Nearest tree hit by a ray, treating each tree as a vertical cylinder of
 * `radius` from y = 0 to config.world.pickHeight. `distance` is measured along
 * the ray to where it enters the cylinder (0 if the origin is inside).
 */
export function pickTree(
  grid: SpatialGrid,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number = config.world.pickDistance,
  radius: number = config.world.pickRadius,
): PickHit | null {
  const len = Math.hypot(dx, dy, dz);
  if (len === 0) return null;
  dx /= len;
  dy /= len;
  dz /= len;

  // Part of the ray that lies between the ground and the top of the trees.
  let tLo = 0;
  let tHi = maxDist;
  const top = config.world.pickHeight;
  if (dy === 0) {
    if (oy < 0 || oy > top) return null;
  } else {
    const t0 = (0 - oy) / dy;
    const t1 = (top - oy) / dy;
    tLo = Math.max(tLo, Math.min(t0, t1));
    tHi = Math.min(tHi, Math.max(t0, t1));
  }
  if (tLo > tHi) return null;

  // Trees that can be hit lie within `radius` of the ray's ground projection.
  // Sample it at most one cell apart and query around each sample.
  const span = (tHi - tLo) * Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(span / grid.cell));
  const reach = grid.cell / 2 + radius;
  let best: PickHit | null = null;
  for (let i = 0; i <= steps; i++) {
    const t = tLo + ((tHi - tLo) * i) / steps;
    grid.queryRadius(ox + dx * t, oz + dz * t, reach, candidates);
    for (const c of candidates) {
      const hit = hitCylinder(c.x - ox, c.z - oz, dx, dz, radius, tLo, tHi);
      if (hit !== null && (best === null || hit < best.distance)) best = { biome: c.biome, index: c.index, distance: hit };
    }
  }
  return best;
}

/** Entry distance of a ray with the infinite cylinder at (cx, cz), clipped to [tLo, tHi]; null if it misses. */
function hitCylinder(cx: number, cz: number, dx: number, dz: number, radius: number, tLo: number, tHi: number): number | null {
  // |(d_xz * t) - c|^2 = radius^2, a quadratic in t.
  const a = dx * dx + dz * dz;
  const c = cx * cx + cz * cz - radius * radius;
  let t0 = tLo;
  let t1 = tHi;
  if (a < 1e-12) {
    if (c > 0) return null; // vertical ray outside the cylinder
  } else {
    const b = -(cx * dx + cz * dz);
    const disc = b * b - a * c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    t0 = Math.max(t0, (-b - s) / a);
    t1 = Math.min(t1, (-b + s) / a);
  }
  return t0 <= t1 ? t0 : null;
}
