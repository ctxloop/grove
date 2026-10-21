// Block textures, generated at startup. Pure: no
// three.js. Every tile is original, drawn from seeded noise; tinted tiles are
// grey so the material's tint carries their colour.

export const TILE = 16;

/** Atlas order, left to right. */
export const TILES = ['logSide', 'logTop', 'leaves', 'glow', 'grass', 'dirt'] as const;
export type Tile = (typeof TILES)[number];

export function tileIndex(t: Tile): number {
  return TILES.indexOf(t);
}

export interface Atlas {
  readonly width: number;
  readonly height: number;
  /** RGBA, row 0 at the top. */
  readonly data: Uint8Array;
}

/** Deterministic value in [0, 1) for integer coordinates. */
function hash(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

const clamp8 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

type Painter = (x: number, y: number, n: (dx?: number, dy?: number) => number) => readonly [number, number, number];

const grey = (v: number): readonly [number, number, number] => [v, v, v];

const painters: Record<Tile, Painter> = {
  // Bark: vertical grooves of uneven width, a few knots.
  logSide: (x, y, n) => {
    const groove = n(x, -1) < 0.3 ? -55 : 0;
    const knot = n(x >> 1, y >> 1) > 0.94 ? -35 : 0;
    return grey(185 + groove + knot + (n() - 0.5) * 30);
  },
  // Cut end: square growth rings around the centre, bark at the rim.
  logTop: (x, y, n) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.5) return grey(140 + (n() - 0.5) * 20);
    return grey((Math.floor(d) % 2 === 0 ? 225 : 190) + (n() - 0.5) * 18);
  },
  // Leaves: mottled, with dark gaps and a few bright highlights.
  leaves: (x, y, n) => {
    const v = n();
    if (v < 0.18) return grey(130);
    if (v > 0.93) return grey(255);
    return grey(210 + (n(x + 7, y + 3) - 0.5) * 50);
  },
  // Glow block: warm, brightest in the middle, sparks at random.
  glow: (x, y, n) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) / 8;
    const spark = n() > 0.85 ? 30 : 0;
    const k = 1 - 0.45 * d;
    return [255 * k + spark, 205 * k + spark, 120 * k + spark * 0.5];
  },
  // Grass top: fine speckles of darker and lighter blades.
  grass: (x, y, n) => {
    const v = n();
    const blade = v < 0.12 ? -45 : v > 0.9 ? 35 : 0;
    return grey(200 + blade + (n(x + 3, y + 5) - 0.5) * 25);
  },
  // Dirt: coarse clumps.
  dirt: (x, y, n) => grey(125 + (n(x >> 1, y >> 1) - 0.5) * 50 + (n() - 0.5) * 20),
};

/** One row of 16×16 tiles in TILES order. */
export function buildAtlas(seed = 1): Atlas {
  const width = TILE * TILES.length;
  const height = TILE;
  const data = new Uint8Array(width * height * 4);
  TILES.forEach((t, ti) => {
    const paint = painters[t];
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const n = (dx = x, dy = y): number => hash(dx + ti * 101, dy, seed + ti);
        const [r, g, b] = paint(x, y, n);
        const o = (y * width + ti * TILE + x) * 4;
        data[o] = clamp8(r);
        data[o + 1] = clamp8(g);
        data[o + 2] = clamp8(b);
        data[o + 3] = 255;
      }
    }
  });
  return { width, height, data };
}

/** One tile's RGBA pixels, row 0 at the top, for a texture that repeats a single tile. */
export function tilePixels(atlas: Atlas, t: Tile): Uint8Array {
  const out = new Uint8Array(TILE * TILE * 4);
  const x0 = tileIndex(t) * TILE;
  for (let y = 0; y < TILE; y++) out.set(atlas.data.subarray((y * atlas.width + x0) * 4, (y * atlas.width + x0 + TILE) * 4), y * TILE * 4);
  return out;
}
