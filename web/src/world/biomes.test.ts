import { describe, expect, it } from 'vitest';
import { biomeAt, biomesWithin } from './biomes';
import { makeBiome, makeWorld } from './test-util';

// Ids are deliberately not 0..n-1 and not in position order.
const world = makeWorld([makeBiome(7, 0, 0, 50), makeBiome(2, 100, 0, 30), makeBiome(5, 70, 0, 30), makeBiome(9, 0, 300, 20)]);

describe('biomeAt', () => {
  it('finds the biome containing the point', () => {
    expect(biomeAt(world, 10, 10)?.id).toBe(7);
    expect(biomeAt(world, 110, 5)?.id).toBe(2);
    expect(biomeAt(world, -3, 290)?.id).toBe(9);
  });

  it('treats the circle edge as inside', () => {
    expect(biomeAt(world, 0, 50)?.id).toBe(7);
    expect(biomeAt(world, 0, 50.01)).toBeNull();
  });

  it('returns null between biomes', () => {
    expect(biomeAt(world, 0, 150)).toBeNull();
    expect(biomeAt(world, -500, -500)).toBeNull();
  });

  it('prefers the nearest center where circles overlap', () => {
    // 7 spans -50..50, 5 spans 40..100, 2 spans 70..130.
    expect(biomeAt(world, 30, 0)?.id).toBe(7);
    expect(biomeAt(world, 40, 0)?.id).toBe(5);
    expect(biomeAt(world, 84, 0)?.id).toBe(5);
    expect(biomeAt(world, 86, 0)?.id).toBe(2);
  });

  it('handles an empty world', () => {
    expect(biomeAt(makeWorld([]), 0, 0)).toBeNull();
  });
});

describe('biomesWithin', () => {
  it('sorts by edge distance, inside first, then by id', () => {
    // From (60, 0): 5 is inside (edge -20), 2 inside (edge -10), 7 edge 10.
    expect(biomesWithin(world, 60, 0, 10).map((b) => b.id)).toEqual([5, 2, 7]);
  });

  it('includes a biome whose edge is exactly at the distance', () => {
    // From (0, 200): edge of 9 is 80, edge of 7 is 150.
    expect(biomesWithin(world, 0, 200, 150).map((b) => b.id)).toEqual([9, 7]);
    expect(biomesWithin(world, 0, 200, 149.9).map((b) => b.id)).toEqual([9]);
  });

  it('breaks ties by id', () => {
    const w = makeWorld([makeBiome(4, 20, 0, 10), makeBiome(1, -20, 0, 10)]);
    expect(biomesWithin(w, 0, 0, 50).map((b) => b.id)).toEqual([1, 4]);
  });

  it('returns nothing when no biome is close enough, or the world is empty', () => {
    expect(biomesWithin(world, 500, 500, 50)).toEqual([]);
    expect(biomesWithin(makeWorld([]), 0, 0, 1000)).toEqual([]);
  });
});
