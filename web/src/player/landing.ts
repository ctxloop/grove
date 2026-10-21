// Where a jump lands. Pure.

export interface Point {
  readonly x: number;
  readonly z: number;
}

/** Ring spacing and the farthest ring searched, in meters. */
const RING_STEP = 0.5;
export const MAX_RADIUS = 10;

/**
 * The spot itself if no trunk in `trees` is closer than `clearance`, else the first free point on rings
 * `RING_STEP` apart around it, so the landing is as near the spot as possible. Falls back to the spot.
 */
export function clearSpot(x: number, z: number, trees: readonly Point[], clearance: number): Point {
  const c2 = clearance * clearance;
  const free = (px: number, pz: number): boolean => trees.every((t) => (t.x - px) ** 2 + (t.z - pz) ** 2 >= c2);
  if (free(x, z)) return { x, z };
  for (let r = RING_STEP; r <= MAX_RADIUS; r += RING_STEP) {
    const n = Math.max(8, Math.ceil((2 * Math.PI * r) / RING_STEP));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI;
      const px = x + r * Math.cos(a);
      const pz = z + r * Math.sin(a);
      if (free(px, pz)) return { x: px, z: pz };
    }
  }
  return { x, z };
}
