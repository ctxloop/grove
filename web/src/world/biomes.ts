import type { Biome, World } from './schema';

function centerDistance(b: Biome, x: number, z: number): number {
  return Math.hypot(x - b.center[0], z - b.center[1]);
}

/** The biome whose circle contains the point; if several do, the one with the nearest center. */
export function biomeAt(world: World, x: number, z: number): Biome | null {
  let best: Biome | null = null;
  let bestDist = Infinity;
  for (const b of world.biomes) {
    const d = centerDistance(b, x, z);
    if (d <= b.radius && d < bestDist) {
      best = b;
      bestDist = d;
    }
  }
  return best;
}

/** Biomes whose edge is within `distance` of the point (negative edge distance means inside), nearest edge first, ties by id. */
export function biomesWithin(world: World, x: number, z: number, distance: number): Biome[] {
  return world.biomes
    .map((biome) => ({ biome, edge: centerDistance(biome, x, z) - biome.radius }))
    .filter((e) => e.edge <= distance)
    .sort((a, b) => a.edge - b.edge || a.biome.id - b.biome.id)
    .map((e) => e.biome);
}
