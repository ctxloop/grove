import { describe, expect, it } from 'vitest';
import { SPECIES } from '../world/schema';
import { buildTree, meshVoxels, TRUNK_RANGE, type TreeShape, type Voxel } from './voxel';

const shape = (voxels: Voxel[]): TreeShape => ({ voxels, crown: { x: 0, y: 0, z: 0 } });
const faces = (m: ReturnType<typeof meshVoxels>): number => m.indices.length / 6;

describe('meshVoxels', () => {
  it('emits six faces for a lone voxel and hides shared faces', () => {
    expect(faces(meshVoxels(shape([{ x: 0, y: 0, z: 0, block: 'log' }]), 1))).toBe(6);
    const two = meshVoxels(
      shape([
        { x: 0, y: 0, z: 0, block: 'log' },
        { x: 0, y: 1, z: 0, block: 'log' },
      ]),
      1,
    );
    expect(faces(two)).toBe(10);
    expect(two.positions.length).toBe(10 * 4 * 3);
  });

  it('places a voxel on y = 0 around the origin, scaled by size', () => {
    const m = meshVoxels(shape([{ x: 0, y: 0, z: 0, block: 'leaves' }]), 0.5);
    const xs = [...m.positions].filter((_, i) => i % 3 === 0);
    const ys = [...m.positions].filter((_, i) => i % 3 === 1);
    expect(Math.min(...xs)).toBe(-0.25);
    expect(Math.max(...xs)).toBe(0.25);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(0.5);
  });

  it('winds every face so its normal points outward', () => {
    const m = meshVoxels(shape([{ x: 0, y: 0, z: 0, block: 'log' }]), 1);
    for (let f = 0; f < m.indices.length; f += 3) {
      const p = [0, 1, 2].map((k) => {
        const i = (m.indices[f + k] ?? 0) * 3;
        return [m.positions[i] ?? 0, m.positions[i + 1] ?? 0, m.positions[i + 2] ?? 0];
      });
      const [a, b, c] = p as [number[], number[], number[]];
      const u = [0, 1, 2].map((k) => (b[k] ?? 0) - (a[k] ?? 0));
      const v = [0, 1, 2].map((k) => (c[k] ?? 0) - (a[k] ?? 0));
      const cross = [(u[1] ?? 0) * (v[2] ?? 0) - (u[2] ?? 0) * (v[1] ?? 0), (u[2] ?? 0) * (v[0] ?? 0) - (u[0] ?? 0) * (v[2] ?? 0), (u[0] ?? 0) * (v[1] ?? 0) - (u[1] ?? 0) * (v[0] ?? 0)];
      const i = (m.indices[f] ?? 0) * 3;
      const n = [m.normals[i] ?? 0, m.normals[i + 1] ?? 0, m.normals[i + 2] ?? 0];
      expect(cross[0]! * n[0]! + cross[1]! * n[1]! + cross[2]! * n[2]!).toBeGreaterThan(0);
    }
  });

  it('gives each vertex from the lowest leaf up its offset from the crown centre, and none below', () => {
    const m = meshVoxels(
      { voxels: [{ x: 0, y: 0, z: 0, block: 'log' }, { x: 2, y: 3, z: 0, block: 'leaves' }], crown: { x: 2, y: 3.5, z: 0 } },
      0.5,
    );
    for (let i = 0; i < m.blocks.length; i++) {
      const p = [m.positions[i * 3] ?? 0, m.positions[i * 3 + 1] ?? 0, m.positions[i * 3 + 2] ?? 0];
      const want = m.blocks[i] === 0 ? [0, 0, 0] : [p[0]! - 1, p[1]! - 1.75, p[2]!];
      expect([m.push[i * 3], m.push[i * 3 + 1], m.push[i * 3 + 2]]).toEqual(want);
    }
  });

  it('moves logs inside the crown with it', () => {
    const m = meshVoxels(
      { voxels: [{ x: 0, y: 3, z: 0, block: 'log' }, { x: 1, y: 3, z: 0, block: 'leaves' }], crown: { x: 0, y: 0, z: 0 } },
      1,
    );
    for (let i = 0; i < m.blocks.length; i++) expect(m.push[i * 3 + 1]).toBe(m.positions[i * 3 + 1]);
  });
});

describe('buildTree', () => {
  for (const species of SPECIES) {
    it(`${species}: a trunk, leaves, and 1 to 3 glow blocks; deterministic; taller with height`, () => {
      const t = buildTree(species, 0.5, 0.5, 42);
      expect(t.voxels.some((v) => v.block === 'log' && v.x === 0 && v.y === 0 && v.z === 0)).toBe(true);
      expect(t.voxels.filter((v) => v.block === 'leaves').length).toBeGreaterThan(10);
      const glow = t.voxels.filter((v) => v.block === 'glow').length;
      expect(glow).toBeGreaterThanOrEqual(1);
      expect(glow).toBeLessThanOrEqual(3);
      expect(buildTree(species, 0.5, 0.5, 42)).toEqual(t);
      const top = (s: TreeShape) => Math.max(...s.voxels.map((v) => v.y));
      expect(top(buildTree(species, 1, 0.5, 42))).toBeGreaterThan(top(buildTree(species, 0, 0.5, 42)));
      const [lo] = TRUNK_RANGE[species];
      expect(top(buildTree(species, 0, 0, 1))).toBeGreaterThanOrEqual(lo);
    });
  }

  it('rougher crowns have fewer leaves', () => {
    const leaves = (rough: number) => buildTree('oak', 0.5, rough, 3).voxels.filter((v) => v.block !== 'log').length;
    expect(leaves(1)).toBeLessThan(leaves(0));
  });
});
