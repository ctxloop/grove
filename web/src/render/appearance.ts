// Pure mapping from tree data to numbers used by the forest material.
// No three.js here, so everything is unit-testable.

const U8 = 255;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Leaf shade multiplier from the uint8 `l`. */
export function leafShade(l: number, minShade: number, maxShade: number): number {
  return lerp(minShade, maxShade, l / U8);
}

/**
 * The voxel variant a tree uses: the uint8 `h` picks one of `heightSteps`
 * trunk heights and `r` one of `roughSteps` crown roughnesses. `height` and
 * `rough` are the step positions in 0..1; `index` numbers the variants of a
 * species from 0 to heightSteps · roughSteps - 1.
 */
export function variantOf(h: number, r: number, heightSteps: number, roughSteps: number): { height: number; rough: number; index: number } {
  const hs = Math.min(heightSteps - 1, Math.round((h / U8) * (heightSteps - 1)));
  const rs = Math.min(roughSteps - 1, Math.floor((r / (U8 + 1)) * roughSteps));
  return {
    height: heightSteps > 1 ? hs / (heightSteps - 1) : 0,
    rough: roughSteps > 1 ? rs / (roughSteps - 1) : 0,
    index: hs * roughSteps + rs,
  };
}

/**
 * Deterministic value in [0, 1) from a tree id. `salt` gives independent
 * streams for the same id (rotation, width, wind phase).
 */
export function treeSeed(id: number, salt = 0): number {
  let x = (Math.imul(id | 0, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 0x100000000;
}

/** HSL (each 0..1) to sRGB (each 0..1). Hue wraps. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = (n + (h - Math.floor(h)) * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

/** sRGB `a` mixed towards `b` by `t`, each channel 0..1. */
export function mixRgb(a: readonly [number, number, number], b: readonly [number, number, number], t: number): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** sRGB channels 0..1 of a 0xRRGGBB number. */
export function hexRgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / U8, ((hex >> 8) & 255) / U8, (hex & 255) / U8];
}
