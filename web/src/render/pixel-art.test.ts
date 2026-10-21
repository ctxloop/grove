import { describe, expect, it } from 'vitest';
import { buildAtlas, TILE, TILES, tileIndex, tilePixels, type Tile } from './pixel-art';

function pixels(atlas: ReturnType<typeof buildAtlas>, t: Tile): [number, number, number][] {
  const out: [number, number, number][] = [];
  const x0 = tileIndex(t) * TILE;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const o = (y * atlas.width + x0 + x) * 4;
      out.push([atlas.data[o] ?? 0, atlas.data[o + 1] ?? 0, atlas.data[o + 2] ?? 0]);
    }
  }
  return out;
}

describe('buildAtlas', () => {
  it('is one row of opaque 16x16 tiles in TILES order', () => {
    const a = buildAtlas();
    expect(a.width).toBe(TILE * TILES.length);
    expect(a.height).toBe(TILE);
    expect(a.data.length).toBe(a.width * a.height * 4);
    for (let i = 3; i < a.data.length; i += 4) expect(a.data[i]).toBe(255);
    expect(TILES.map(tileIndex)).toEqual(TILES.map((_, i) => i));
  });

  it('is deterministic per seed', () => {
    expect(buildAtlas(7).data).toEqual(buildAtlas(7).data);
    expect(buildAtlas(7).data).not.toEqual(buildAtlas(8).data);
  });

  it('draws a pattern on every tile', () => {
    const a = buildAtlas();
    for (const t of TILES) {
      const values = new Set(pixels(a, t).map((p) => p.join(',')));
      expect(values.size, t).toBeGreaterThan(8);
    }
  });

  it('keeps tinted tiles grey and the glow tile warm', () => {
    const a = buildAtlas();
    for (const t of ['logSide', 'logTop', 'leaves', 'grass', 'dirt'] as const) {
      for (const [r, g, b] of pixels(a, t)) expect(r === g && g === b, t).toBe(true);
    }
    for (const [r, , b] of pixels(a, 'glow')) expect(r).toBeGreaterThan(b);
  });

  it('cuts single tiles out of the atlas', () => {
    const a = buildAtlas();
    const grass = tilePixels(a, 'grass');
    expect(grass.length).toBe(TILE * TILE * 4);
    const flat = pixels(a, 'grass').flatMap(([r, g, b]) => [r, g, b, 255]);
    expect([...grass]).toEqual(flat);
  });
});
