import { describe, expect, it } from 'vitest';
import { hexRgb, hslToRgb, leafShade, mixRgb, treeSeed, variantOf } from './appearance';

describe('leafShade', () => {
  it('maps the ends linearly and is monotonic', () => {
    expect(leafShade(0, 0.8, 1.2)).toBe(0.8);
    expect(leafShade(255, 0.8, 1.2)).toBeCloseTo(1.2, 10);
    for (let v = 1; v <= 255; v++) expect(leafShade(v, 0.8, 1.2)).toBeGreaterThan(leafShade(v - 1, 0.8, 1.2));
  });
});

describe('variantOf', () => {
  it('covers every variant, with the ends of h and r at the ends of the steps', () => {
    expect(variantOf(0, 0, 4, 3)).toEqual({ height: 0, rough: 0, index: 0 });
    expect(variantOf(255, 255, 4, 3)).toEqual({ height: 1, rough: 1, index: 11 });
    const seen = new Set<number>();
    for (let h = 0; h <= 255; h += 5) for (let r = 0; r <= 255; r += 5) seen.add(variantOf(h, r, 4, 3).index);
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('is monotonic in h', () => {
    for (let h = 1; h <= 255; h++) expect(variantOf(h, 0, 4, 3).height).toBeGreaterThanOrEqual(variantOf(h - 1, 0, 4, 3).height);
  });
});

describe('treeSeed', () => {
  it('is deterministic and in [0, 1)', () => {
    for (const id of [0, 1, 2, 12345, 2 ** 31 - 1, 2 ** 32 - 1]) {
      const a = treeSeed(id);
      expect(a).toBe(treeSeed(id));
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1);
    }
  });

  it('differs between ids and salts and is roughly uniform', () => {
    expect(treeSeed(1)).not.toBe(treeSeed(2));
    expect(treeSeed(1, 0)).not.toBe(treeSeed(1, 1));
    let sum = 0;
    const n = 10000;
    for (let id = 0; id < n; id++) sum += treeSeed(id);
    expect(sum / n).toBeGreaterThan(0.48);
    expect(sum / n).toBeLessThan(0.52);
  });
});

describe('hslToRgb', () => {
  it('matches known colors', () => {
    const near = (got: number[], want: number[]) => got.forEach((v, i) => expect(v).toBeCloseTo(want[i] ?? NaN, 6));
    near(hslToRgb(0, 1, 0.5), [1, 0, 0]);
    near(hslToRgb(1 / 3, 1, 0.5), [0, 1, 0]);
    near(hslToRgb(2 / 3, 1, 0.5), [0, 0, 1]);
    near(hslToRgb(0.5, 0, 0.3), [0.3, 0.3, 0.3]);
    near(hslToRgb(0.25, 0.5, 0), [0, 0, 0]);
    near(hslToRgb(0.25, 0.5, 1), [1, 1, 1]);
  });

  it('wraps hue', () => {
    expect(hslToRgb(1.25, 0.6, 0.4)).toEqual(hslToRgb(0.25, 0.6, 0.4));
  });
});

describe('colour helpers', () => {
  it('mixes and decodes sRGB', () => {
    expect(mixRgb([0, 0, 0], [1, 0.5, 0.2], 0.5)).toEqual([0.5, 0.25, 0.1]);
    expect(hexRgb(0xff8000)).toEqual([1, 128 / 255, 0]);
  });
});
