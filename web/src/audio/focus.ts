// The focus duck. Pure: standing at a tree, the other
// voices are turned down, so the tree you stand at is the one you hear.

import { config } from '../config';

export interface FocusOptions {
  /** Full duck when the nearest playing tree is this close, in meters. */
  near: number;
  /** No duck from this distance of the nearest playing tree on, in meters. */
  far: number;
  /** A voice is ducked fully once it is this much farther than the nearest, in meters. */
  margin: number;
  /** Duck at full closeness and margin, in dB. */
  duckDb: number;
}

const defaults = (): FocusOptions => ({
  near: config.audio.focusNear,
  far: config.audio.focusFar,
  margin: config.audio.focusMargin,
  duckDb: config.audio.focusDuckDb,
});

const clamp01 = (x: number): number => Math.min(Math.max(x, 0), 1);

/**
 * Linear focus gain per voice, written into `out`. `distances[i]` is voice i's tree
 * distance, or null for a free voice (its gain is 1).
 */
export function focusGains(distances: readonly (number | null)[], out: Float32Array, opts: FocusOptions = defaults()): Float32Array {
  let nearest = Infinity;
  for (const d of distances) if (d !== null && d < nearest) nearest = d;
  const t = clamp01((opts.far - nearest) / (opts.far - opts.near));
  const closeness = t * t * (3 - 2 * t);
  distances.forEach((d, i) => {
    const margin = d === null ? 0 : clamp01((d - nearest) / opts.margin);
    out[i] = 10 ** ((-opts.duckDb * closeness * margin) / 20);
  });
  return out;
}
