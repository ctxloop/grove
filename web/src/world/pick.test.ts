import { describe, expect, it } from 'vitest';
import { SpatialGrid } from './grid';
import { pickTree } from './pick';

function gridOf(...trees: { x: number; z: number }[]): SpatialGrid {
  const g = new SpatialGrid(16);
  g.add(3, trees);
  return g;
}

describe('pickTree', () => {
  it('hits a tree straight ahead, at the cylinder surface', () => {
    const g = gridOf({ x: 0, z: -10 });
    const hit = pickTree(g, 0, 1.7, 0, 0, 0, -1, 40, 1);
    expect(hit?.biome).toBe(3);
    expect(hit?.index).toBe(0);
    expect(hit?.distance).toBeCloseTo(9, 9);
  });

  it('normalises the direction', () => {
    const g = gridOf({ x: 0, z: -10 });
    expect(pickTree(g, 0, 1.7, 0, 0, 0, -5, 40, 1)?.distance).toBeCloseTo(9, 9);
  });

  it('misses a tree to the side and grazes one at exactly the radius', () => {
    const g = gridOf({ x: 3, z: -10 });
    expect(pickTree(g, 0, 1.7, 0, 0, 0, -1, 40, 1)).toBeNull();
    const edge = gridOf({ x: 1, z: -10 });
    expect(pickTree(edge, 0, 1.7, 0, 0, 0, -1, 40, 1)).not.toBeNull();
  });

  it('returns the nearest of two trees in line, whatever their index order', () => {
    const g = gridOf({ x: 0, z: -20 }, { x: 0, z: -8 });
    const hit = pickTree(g, 0, 1.7, 0, 0, 0, -1, 40, 1);
    expect(hit?.index).toBe(1);
    expect(hit?.distance).toBeCloseTo(7, 9);
  });

  it('misses when the ray passes over the tree', () => {
    const g = gridOf({ x: 0, z: -10 });
    // Rising from y=1.7 at ~10 degrees: y at the tree is far above 12.
    expect(pickTree(g, 0, 1.7, 0, 0, 1, -0.2, 40, 1)).toBeNull();
    expect(pickTree(g, 0, 20, 0, 0, 0, -1, 40, 1)).toBeNull();
  });

  it('hits a tall tree from above, entering through the side or the top cap', () => {
    const g = gridOf({ x: 0, z: -10 });
    const hit = pickTree(g, 0, 20, 0, 0, -1, -1, 40, 1);
    expect(hit).not.toBeNull();
    // At y=12 the ray is 8 m ahead, short of the trunk (9 m), so it enters the side at y=11.
    expect(hit?.distance).toBeCloseTo(Math.hypot(9, 9), 6);
    // Steeper: enters through the top cap at y=12, 8 m down and 10 m ahead.
    expect(pickTree(g, 0, 20, 0, 0, -8, -10, 40, 1)?.distance).toBeCloseTo(Math.hypot(8, 10), 6);
  });

  it('misses below the ground', () => {
    const g = gridOf({ x: 0, z: -10 });
    expect(pickTree(g, 0, -1, 0, 0, 0, -1, 40, 1)).toBeNull();
  });

  it('respects the max distance', () => {
    const g = gridOf({ x: 0, z: -30 });
    expect(pickTree(g, 0, 1.7, 0, 0, 0, -1, 28, 1)).toBeNull();
    expect(pickTree(g, 0, 1.7, 0, 0, 0, -1, 29, 1)?.distance).toBeCloseTo(29, 9);
    expect(pickTree(g, 0, 1.7, 0, 0, 0, -1, 28.9, 1)).toBeNull();
  });

  it('ignores trees behind the origin', () => {
    const g = gridOf({ x: 0, z: 10 });
    expect(pickTree(g, 0, 1.7, 0, 0, 0, -1, 40, 1)).toBeNull();
  });

  it('returns distance 0 when the origin is inside a trunk', () => {
    const g = gridOf({ x: 0.5, z: 0 });
    expect(pickTree(g, 0, 1.7, 0, 0, 0, -1, 40, 1)?.distance).toBe(0);
  });

  it('hits looking straight down onto a trunk, not beside it', () => {
    const g = gridOf({ x: 0, z: 0 });
    expect(pickTree(g, 0.5, 5, 0, 0, -1, 0, 40, 1)?.distance).toBe(0);
    expect(pickTree(g, 2, 5, 0, 0, -1, 0, 40, 1)).toBeNull();
  });

  it('works across cell borders and negative coordinates in any direction', () => {
    const g = gridOf({ x: -33, z: -47 }, { x: -20, z: -20 });
    const dir = [-33 - -5, 0, -47 - -4];
    const hit = pickTree(g, -5, 1.7, -4, dir[0] ?? 0, 0, dir[2] ?? 0, 100, 1);
    expect(hit?.index).toBe(0);
    expect(hit?.distance).toBeCloseTo(Math.hypot(...dir) - 1, 6);
  });

  it('uses config defaults for distance and radius', () => {
    const g = gridOf({ x: 0, z: -39 });
    expect(pickTree(g, 0, 1.7, 0, 0, 0, -1)).not.toBeNull();
    expect(pickTree(gridOf({ x: 0, z: -42 }), 0, 1.7, 0, 0, 0, -1)).toBeNull();
  });
});
