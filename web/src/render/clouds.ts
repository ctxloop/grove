// Block clouds. Pure: no three.js. A flat layer of square cells chosen by seeded value noise.

export interface CloudArea {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
}

export interface CloudParams {
  /** Edge length of one cell, in meters. */
  readonly block: number;
  /** Noise feature size in cells; an even number, since a second octave uses half of it. */
  readonly scale: number;
  /** A cell is cloud where the noise (0..1) exceeds this. */
  readonly threshold: number;
  readonly seed: number;
}

export interface CloudLayer {
  /** Cell centres as (x, z) pairs. */
  readonly cells: Float32Array;
  /** The layer wraps in x between `minX` and `minX + width`; the noise tiles over that width, so the seam is invisible. */
  readonly minX: number;
  readonly width: number;
}

/** Deterministic value in [0, 1) for integer coordinates. */
function hash(x: number, z: number, seed: number): number {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Value noise at cell (x, z) with lattice spacing `spacing` cells, periodic in x with `period` lattice steps. */
function octave(x: number, z: number, spacing: number, period: number, seed: number): number {
  const fx = x / spacing;
  const fz = z / spacing;
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const tx = smooth(fx - x0);
  const tz = smooth(fz - z0);
  const at = (ix: number, iz: number): number => hash(((ix % period) + period) % period, iz, seed);
  const top = at(x0, z0) * (1 - tx) + at(x0 + 1, z0) * tx;
  const bottom = at(x0, z0 + 1) * (1 - tx) + at(x0 + 1, z0 + 1) * tx;
  return top * (1 - tz) + bottom * tz;
}

/** The cloud cells covering `area`; the width is rounded up to a whole number of noise features. */
export function buildClouds(area: CloudArea, p: CloudParams): CloudLayer {
  const half = p.scale / 2;
  const nx = Math.ceil((area.maxX - area.minX) / p.block / p.scale) * p.scale;
  const nz = Math.ceil((area.maxZ - area.minZ) / p.block);
  const cells: number[] = [];
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const n = 0.7 * octave(ix, iz, p.scale, nx / p.scale, p.seed) + 0.3 * octave(ix, iz, half, nx / half, p.seed + 1);
      if (n > p.threshold) cells.push(area.minX + (ix + 0.5) * p.block, area.minZ + (iz + 0.5) * p.block);
    }
  }
  return { cells: new Float32Array(cells), minX: area.minX, width: nx * p.block };
}
