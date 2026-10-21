import { describe, expect, it } from 'vitest';
import { clearSpot, type Point } from './landing';

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.z - b.z);

describe('clearSpot', () => {
  it('keeps a spot that is already clear', () => {
    expect(clearSpot(10, -4, [{ x: 0, z: 0 }], 2.2)).toEqual({ x: 10, z: -4 });
    expect(clearSpot(3, 3, [], 2.2)).toEqual({ x: 3, z: 3 });
  });

  it('moves off a trunk to the nearest free ring', () => {
    const trees = [{ x: 0, z: 0 }];
    const p = clearSpot(0.3, 0, trees, 2.2);
    expect(dist(p, trees[0]!)).toBeGreaterThanOrEqual(2.2);
    // Rings are 0.5 m apart, so it lands within one ring step of the closest free point (1.9 m away).
    expect(dist(p, { x: 0.3, z: 0 })).toBeLessThanOrEqual(1.9 + 0.5);
  });

  it('clears every tree of a 7 m lattice, wherever it starts', () => {
    const trees: Point[] = [];
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) trees.push({ x: i * 7, z: j * 7 });
    for (const [x, z] of [[0, 0], [7.1, 6.9], [3.5, 3.5], [-13.8, 0.4]] as const) {
      const p = clearSpot(x, z, trees, 2.2);
      for (const t of trees) expect(dist(p, t)).toBeGreaterThanOrEqual(2.2 - 1e-9);
      expect(dist(p, { x, z })).toBeLessThan(3);
    }
  });

  it('falls back to the spot when nothing nearby is free', () => {
    const trees: Point[] = [];
    for (let i = -30; i <= 30; i++) for (let j = -30; j <= 30; j++) trees.push({ x: i, z: j });
    expect(clearSpot(0.2, 0.1, trees, 2.2)).toEqual({ x: 0.2, z: 0.1 });
  });
});
