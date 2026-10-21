// Voxel trees. Pure: no three.js. A tree is a set of
// integer voxels; meshVoxels() turns it into typed arrays with only the faces
// that border empty space.

import type { Species } from '../world/schema';
import { tileIndex, TILES, type Tile } from './pixel-art';

export type Block = 'log' | 'leaves' | 'glow';

export interface Voxel {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly block: Block;
}

export interface TreeShape {
  readonly voxels: readonly Voxel[];
  /** Mean position of the leaf and glow voxels, in voxel units. Leaves move out from here on bass. */
  readonly crown: { readonly x: number; readonly y: number; readonly z: number };
}

/** mulberry32: a small seeded generator in [0, 1). */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Grid {
  readonly cells = new Map<string, Voxel>();
  set(x: number, y: number, z: number, block: Block): void {
    const k = `${x},${y},${z}`;
    // Logs win: a branch running through the crown stays wood.
    if (block !== 'log' && this.cells.get(k)?.block === 'log') return;
    this.cells.set(k, { x, y, z, block });
  }
  has(x: number, y: number, z: number): boolean {
    return this.cells.has(`${x},${y},${z}`);
  }
}

const lerpInt = (a: number, b: number, t: number): number => Math.round(a + (b - a) * Math.min(Math.max(t, 0), 1));

function trunk(g: Grid, x: number, z: number, from: number, to: number): void {
  for (let y = from; y < to; y++) g.set(x, y, z, 'log');
}

/** Leaves inside an ellipsoid. Cells near the surface drop out with probability `rough`, so crowns are not perfect blobs. */
function blob(g: Grid, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, rough: number, rand: () => number): void {
  for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
        if (d > 1) continue;
        if (d > 0.55 && rand() < rough * 0.6) continue;
        g.set(x, y, z, 'leaves');
      }
    }
  }
}

/** A flat layer of leaves within radius r at height y. */
function layer(g: Grid, cx: number, y: number, cz: number, r: number, rough: number, rand: () => number): void {
  for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
      const d = ((x - cx) ** 2 + (z - cz) ** 2) / (r * r);
      if (d > 1) continue;
      // Narrow layers keep every leaf: they are what hides the trunk.
      if (r > 1.5 && d > 0.6 && rand() < rough * 0.6) continue;
      g.set(x, y, z, 'leaves');
    }
  }
}

/** Trunk height range per species, in voxels; `height` (0..1) picks within it. */
export const TRUNK_RANGE: Readonly<Record<Species, readonly [number, number]>> = {
  oak: [4, 7],
  birch: [6, 10],
  fir: [8, 13],
  kapok: [9, 14],
  acacia: [3, 5],
  magnolia: [4, 6],
};

const builders: Readonly<Record<Species, (g: Grid, t: number, rough: number, rand: () => number) => void>> = {
  // Round crown on a short trunk.
  oak: (g, t, rough, rand) => {
    trunk(g, 0, 0, 0, t + 1);
    blob(g, 0, t + 0.5, 0, 2.6, 2.2, 2.6, rough, rand);
  },
  // Tall trunk, narrow upright crown.
  birch: (g, t, rough, rand) => {
    trunk(g, 0, 0, 0, t + 1);
    blob(g, 0, t, 0, 1.7, 3, 1.7, rough, rand);
  },
  // Trunk to the top, tiers of leaves narrowing upward, every other one smaller.
  fir: (g, t, rough, rand) => {
    trunk(g, 0, 0, 0, t);
    const base = 2;
    for (let y = base; y <= t; y++) {
      // At least a plus shape around the trunk, so no bare trunk shows between tiers.
      const r = Math.max((1 - (y - base) / (t - base)) * 3.2 - ((y - base) % 2) * 0.9, 1);
      layer(g, 0, y, 0, r, rough * 0.5, rand);
    }
    g.set(0, t, 0, 'leaves');
    g.set(0, t + 1, 0, 'leaves');
  },
  // Very tall trunk, wide and flat crown with a smaller one on top.
  kapok: (g, t, rough, rand) => {
    trunk(g, 0, 0, 0, t + 1);
    blob(g, 0, t, 0, 3.6, 1.5, 3.6, rough, rand);
    blob(g, 0, t + 1.5, 0, 2, 1.2, 2, rough, rand);
  },
  // Trunk that bends sideways, then a flat two-layer crown.
  acacia: (g, t, rough, rand) => {
    trunk(g, 0, 0, 0, t);
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const;
    const [dx, dz] = dirs[Math.floor(rand() * dirs.length)] ?? [1, 0];
    let x = 0;
    let z = 0;
    let y = t;
    const bend = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < bend; i++) {
      x += dx;
      z += dz;
      g.set(x, y, z, 'log');
      y++;
      g.set(x, y, z, 'log');
    }
    layer(g, x, y + 1, z, 3.3, rough, rand);
    layer(g, x, y + 2, z, 2.1, rough, rand);
  },
  // Short trunk that forks, wide round crown.
  magnolia: (g, t, rough, rand) => {
    trunk(g, 0, 0, 0, t);
    const side = rand() < 0.5 ? 1 : -1;
    g.set(side, t, 0, 'log');
    g.set(-side, t, 0, 'log');
    g.set(side, t + 1, 0, 'log');
    g.set(-side, t + 1, 0, 'log');
    blob(g, 0, t + 1.5, 0, 3.2, 2.2, 3.2, rough, rand);
  },
};

const NEIGHBOURS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

/**
 * One tree. `height` (0..1) picks the trunk height in the species range, `rough`
 * (0..1) how ragged the crown is; `seed` sets the details and the 1–3 glow blocks.
 */
export function buildTree(species: Species, height: number, rough: number, seed: number): TreeShape {
  const rand = random(seed);
  const g = new Grid();
  const [lo, hi] = TRUNK_RANGE[species];
  builders[species](g, lerpInt(lo, hi, height), rough, rand);

  // Glow blocks replace leaves on the crown's surface, chosen in a fixed order.
  const surface = [...g.cells.values()]
    .filter((v) => v.block === 'leaves' && NEIGHBOURS.some(([dx, dy, dz]) => !g.has(v.x + dx, v.y + dy, v.z + dz)))
    .sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z);
  const glows = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < glows && surface.length > 0; i++) {
    const [v] = surface.splice(Math.floor(rand() * surface.length), 1);
    if (v !== undefined) g.cells.set(`${v.x},${v.y},${v.z}`, { ...v, block: 'glow' });
  }

  const voxels = [...g.cells.values()].sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z);
  const crownVoxels = voxels.filter((v) => v.block !== 'log');
  const n = Math.max(crownVoxels.length, 1);
  const crown = {
    x: crownVoxels.reduce((s, v) => s + v.x, 0) / n,
    y: crownVoxels.reduce((s, v) => s + v.y, 0) / n + 0.5,
    z: crownVoxels.reduce((s, v) => s + v.z, 0) / n,
  };
  return { voxels, crown };
}

/** Block kind per vertex in the mesh: 0 log, 1 leaves, 2 glow. */
export const BLOCK_CODE: Readonly<Record<Block, number>> = { log: 0, leaves: 1, glow: 2 };

export interface VoxelMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  /** BLOCK_CODE per vertex. */
  readonly blocks: Float32Array;
  /**
   * Vertex minus crown centre, in meters, for every block from the lowest leaf up (logs inside the
   * crown included); zero below. Scaling the crown along it keeps blocks touching.
   */
  readonly push: Float32Array;
  readonly indices: Uint32Array;
}

// Each face: normal, then four corners (counter-clockwise seen from outside) as offsets in [0, 1]³.
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
] as const;
const CORNER_UV = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
] as const;

function tileOf(block: Block, vertical: boolean): Tile {
  if (block === 'log') return vertical ? 'logTop' : 'logSide';
  return block;
}

/**
 * Faces of the voxels that border empty space. A voxel spans [x - ½, x + ½] and
 * [z - ½, z + ½] horizontally and [y, y + 1] vertically, times `size` meters, so
 * the tree stands on y = 0 around the origin. UVs index the atlas row from
 * pixel-art.ts, inset half a texel so nearest sampling never bleeds.
 */
export function meshVoxels(shape: TreeShape, size: number): VoxelMesh {
  const filled = new Set(shape.voxels.map((v) => `${v.x},${v.y},${v.z}`));
  const crownBase = Math.min(...shape.voxels.filter((v) => v.block !== 'log').map((v) => v.y));
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const blk: number[] = [];
  const psh: number[] = [];
  const idx: number[] = [];
  const tiles = TILES.length;
  const inset = 0.5 / 16;
  for (const v of shape.voxels) {
    for (const f of FACES) {
      if (filled.has(`${v.x + f.n[0]},${v.y + f.n[1]},${v.z + f.n[2]}`)) continue;
      const base = pos.length / 3;
      const t = tileIndex(tileOf(v.block, f.n[1] !== 0));
      const inCrown = v.y >= crownBase;
      f.c.forEach((c, i) => {
        pos.push((v.x - 0.5 + c[0]) * size, (v.y + c[1]) * size, (v.z - 0.5 + c[2]) * size);
        nrm.push(f.n[0], f.n[1], f.n[2]);
        const [cu, cv] = CORNER_UV[i] ?? [0, 0];
        uv.push((t + inset + cu * (1 - 2 * inset)) / tiles, inset + cv * (1 - 2 * inset));
        blk.push(BLOCK_CODE[v.block]);
        const px = v.x - 0.5 + c[0];
        const py = v.y + c[1];
        const pz = v.z - 0.5 + c[2];
        psh.push(inCrown ? (px - shape.crown.x) * size : 0, inCrown ? (py - shape.crown.y) * size : 0, inCrown ? (pz - shape.crown.z) * size : 0);
      });
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  return {
    positions: Float32Array.from(pos),
    normals: Float32Array.from(nrm),
    uvs: Float32Array.from(uv),
    blocks: Float32Array.from(blk),
    push: Float32Array.from(psh),
    indices: Uint32Array.from(idx),
  };
}
