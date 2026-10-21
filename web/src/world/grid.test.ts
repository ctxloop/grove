import { describe, expect, it } from 'vitest';
import { SpatialGrid, type TreeRef } from './grid';

// mulberry32, so failures are reproducible.
function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomTrees(n: number, rand: () => number, span: number) {
  return Array.from({ length: n }, () => ({ x: (rand() - 0.5) * span, z: (rand() - 0.5) * span }));
}

const key = (r: TreeRef) => `${r.biome}:${r.index}`;

describe('SpatialGrid', () => {
  const rand = prng(42);
  const biomes = [randomTrees(1500, rand, 300), randomTrees(1500, rand, 300), randomTrees(1000, rand, 300)];
  const grid = new SpatialGrid(16);
  biomes.forEach((trees, b) => grid.add(b, trees));

  const brute = (x: number, z: number, r: number) =>
    biomes.flatMap((trees, biome) =>
      trees.flatMap((t, index) => ((t.x - x) ** 2 + (t.z - z) ** 2 <= r * r ? [{ biome, index, x: t.x, z: t.z }] : [])),
    );

  it('counts trees', () => {
    expect(grid.size).toBe(4000);
  });

  it('matches a brute-force scan, including negative coordinates', () => {
    const out: TreeRef[] = [];
    for (let i = 0; i < 200; i++) {
      const x = (rand() - 0.5) * 340;
      const z = (rand() - 0.5) * 340;
      const r = rand() * 60;
      const got = grid.queryRadius(x, z, r, out).map(key).sort();
      expect(got).toEqual(brute(x, z, r).map(key).sort());
    }
  });

  it('reuses and clears the output array', () => {
    const out: TreeRef[] = [{ biome: 9, index: 9, x: 0, z: 0 }];
    expect(grid.queryRadius(1e6, 1e6, 5, out)).toBe(out);
    expect(out).toEqual([]);
  });

  it('includes trees exactly on the radius, across cell borders', () => {
    const g = new SpatialGrid(16);
    g.add(0, [
      { x: -16, z: 0 }, // on a cell border, distance 5 from (-11, 0)
      { x: -6, z: 0 }, // distance 5 on the other side
      { x: -11, z: 5 },
      { x: -11, z: -5.0001 }, // just outside
    ]);
    const got = g.queryRadius(-11, 0, 5, []).map((r) => r.index).sort();
    expect(got).toEqual([0, 1, 2]);
  });

  it('nearest is sorted, limited by k and maxR, and breaks ties by biome then index', () => {
    const g = new SpatialGrid(16);
    g.add(1, [{ x: 3, z: 0 }]);
    g.add(0, [{ x: 0, z: 3 }, { x: -3, z: 0 }, { x: 1, z: 0 }, { x: 50, z: 0 }]);
    expect(g.nearest(0, 0, 10, 10).map(key)).toEqual(['0:2', '0:0', '0:1', '1:0']);
    expect(g.nearest(0, 0, 2, 10).map(key)).toEqual(['0:2', '0:0']);
    expect(g.nearest(0, 0, 10, 2).map(key)).toEqual(['0:2']);
  });

  it('nearest matches brute force', () => {
    const x = -37.5;
    const z = 12.25;
    const expected = brute(x, z, 40)
      .sort((a, b) => (a.x - x) ** 2 + (a.z - z) ** 2 - ((b.x - x) ** 2 + (b.z - z) ** 2) || a.biome - b.biome || a.index - b.index)
      .slice(0, 8);
    expect(grid.nearest(x, z, 8, 40).map(key)).toEqual(expected.map(key));
  });

  it('removeBiome drops only that biome, and add replaces', () => {
    const g = new SpatialGrid(16);
    g.add(0, [{ x: 1, z: 1 }, { x: -20, z: -20 }]);
    g.add(1, [{ x: 2, z: 2 }]);
    expect(g.size).toBe(3);
    g.removeBiome(0);
    expect(g.size).toBe(1);
    expect(g.queryRadius(0, 0, 100, []).map(key)).toEqual(['1:0']);
    g.add(1, [{ x: 5, z: 5 }, { x: 6, z: 6 }]);
    expect(g.size).toBe(2);
    g.removeBiome(7);
    expect(g.size).toBe(2);
  });
});
