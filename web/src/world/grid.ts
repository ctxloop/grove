import { config } from '../config';

export interface TreeRef {
  biome: number;
  index: number;
  x: number;
  z: number;
}

// Cell coordinates are packed into one number key. The offset keeps negative
// coordinates positive; 16 bits per axis covers +-32768 cells.
const CELL_OFFSET = 32768;
const CELL_STRIDE = 65536;

/** Uniform-grid index over trees. Refs are allocated once in `add` and shared by all queries. */
export class SpatialGrid {
  readonly cell: number;
  private readonly cells = new Map<number, TreeRef[]>();
  private count = 0;
  private readonly scratch: TreeRef[] = [];

  constructor(cell: number = config.world.gridCell) {
    this.cell = cell;
  }

  get size(): number {
    return this.count;
  }

  /** Indexes a biome's trees; replaces the biome if it was already added. */
  add(biome: number, trees: readonly { x: number; z: number }[]): void {
    this.removeBiome(biome);
    trees.forEach((t, index) => {
      const key = this.key(Math.floor(t.x / this.cell), Math.floor(t.z / this.cell));
      const ref: TreeRef = { biome, index, x: t.x, z: t.z };
      const bucket = this.cells.get(key);
      if (bucket === undefined) this.cells.set(key, [ref]);
      else bucket.push(ref);
    });
    this.count += trees.length;
  }

  removeBiome(biome: number): void {
    for (const [key, bucket] of this.cells) {
      const kept = bucket.filter((r) => r.biome !== biome);
      this.count -= bucket.length - kept.length;
      if (kept.length === 0) this.cells.delete(key);
      else if (kept.length !== bucket.length) this.cells.set(key, kept);
    }
  }

  /** Clears `out` and fills it with every tree within `r` (inclusive) of (x, z). */
  queryRadius(x: number, z: number, r: number, out: TreeRef[]): TreeRef[] {
    out.length = 0;
    const r2 = r * r;
    const cx0 = Math.floor((x - r) / this.cell);
    const cx1 = Math.floor((x + r) / this.cell);
    const cz0 = Math.floor((z - r) / this.cell);
    const cz1 = Math.floor((z + r) / this.cell);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const bucket = this.cells.get(this.key(cx, cz));
        if (bucket === undefined) continue;
        for (const ref of bucket) {
          const dx = ref.x - x;
          const dz = ref.z - z;
          if (dx * dx + dz * dz <= r2) out.push(ref);
        }
      }
    }
    return out;
  }

  /** Up to `k` trees within `maxR`, nearest first; ties by biome, then index. */
  nearest(x: number, z: number, k: number, maxR: number): TreeRef[] {
    const found = this.queryRadius(x, z, maxR, this.scratch);
    const d2 = (r: TreeRef) => (r.x - x) ** 2 + (r.z - z) ** 2;
    found.sort((a, b) => d2(a) - d2(b) || a.biome - b.biome || a.index - b.index);
    return found.slice(0, k);
  }

  private key(cx: number, cz: number): number {
    return (cx + CELL_OFFSET) * CELL_STRIDE + (cz + CELL_OFFSET);
  }
}
