// The committed layouts and the distance model together must let one song
// stand out. For every tree, the listener stands
// 2 m from it towards its nearest neighbour, the worst side; the nearest
// config.audio.voices trees play, as the scheduler picks them. The tree's level
// over the other voices, summed by power, must stay above a floor: one for the
// distance model alone, a higher one with the focus duck.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { focusGains } from './focus';
import type { BiomeFile, World } from '../world/schema';

const STAND = 2;
const FLOOR_DB = 10;
const FOCUS_FLOOR_DB = 25;

/** PannerNode's inverse distance model. */
function gain(d: number): number {
  const { refDistance: ref, rolloffFactor: k } = config.audio;
  return ref / (ref + k * (Math.max(d, ref) - ref));
}

function load(subset: string): { x: number; z: number }[] {
  const dir = new URL(`../../public/data/${subset}/`, import.meta.url);
  const world = JSON.parse(readFileSync(new URL('world.json', dir), 'utf8')) as World;
  return world.biomes.flatMap((b) => (JSON.parse(readFileSync(new URL(b.file, dir), 'utf8')) as BiomeFile).trees);
}

/** Lead of each tree over the other voices, in dB, sorted ascending. */
function leads(trees: { x: number; z: number }[], focus: boolean): number[] {
  const cell = 10;
  const grid = new Map<string, number[]>();
  const key = (i: number, j: number): string => `${i},${j}`;
  trees.forEach((t, i) => {
    const k = key(Math.floor(t.x / cell), Math.floor(t.z / cell));
    grid.set(k, [...(grid.get(k) ?? []), i]);
  });
  const nearest = (x: number, z: number, r: number): { i: number; d: number }[] => {
    const out: { i: number; d: number }[] = [];
    for (let a = Math.floor((x - r) / cell); a <= Math.floor((x + r) / cell); a++) {
      for (let b = Math.floor((z - r) / cell); b <= Math.floor((z + r) / cell); b++) {
        for (const i of grid.get(key(a, b)) ?? []) {
          const t = trees[i];
          if (t === undefined) continue;
          const d = Math.hypot(t.x - x, t.z - z);
          if (d <= r) out.push({ i, d });
        }
      }
    }
    return out.sort((p, q) => p.d - q.d);
  };
  const lift = config.audio.sourceHeight - config.player.eyeHeight;
  const power = (d: number): number => gain(Math.hypot(d, lift)) ** 2;
  const out: number[] = [];
  trees.forEach((t, i) => {
    const next = nearest(t.x, t.z, config.audio.hearingRadius)[1];
    const n = next === undefined ? undefined : trees[next.i];
    if (n === undefined || next === undefined) return;
    const x = t.x + ((n.x - t.x) / next.d) * STAND;
    const z = t.z + ((n.z - t.z) / next.d) * STAND;
    const voices = nearest(x, z, config.audio.hearingRadius).slice(0, config.audio.voices);
    const own = voices.find((v) => v.i === i);
    if (own === undefined) throw new Error(`tree ${i} is not among the nearest voices 2 m from it`);
    const g = focusGains(
      voices.map((v) => (focus ? v.d : null)),
      new Float32Array(voices.length),
    );
    const rest = voices.reduce((s, v, k) => (v.i === i ? s : s + power(v.d) * (g[k] ?? 1) ** 2), 0);
    out.push(10 * Math.log10(power(own.d) / rest));
  });
  return out.sort((a, b) => a - b);
}

describe('audibility of the tree you stand at', () => {
  for (const subset of ['small', 'medium']) {
    it(`${subset}: leads the other voices by at least ${FLOOR_DB} dB on distance alone`, () => {
      const l = leads(load(subset), false);
      expect(l.length).toBeGreaterThan(0);
      expect(l[0]).toBeGreaterThanOrEqual(FLOOR_DB);
    });
    it(`${subset}: leads them by at least ${FOCUS_FLOOR_DB} dB with the focus duck`, () => {
      const l = leads(load(subset), true);
      expect(l.length).toBeGreaterThan(0);
      expect(l[0]).toBeGreaterThanOrEqual(FOCUS_FLOOR_DB);
    });
  }
});
