import { describe, expect, it } from 'vitest';
import { focusGains, type FocusOptions } from './focus';

const opts: FocusOptions = { near: 2, far: 4, margin: 2, duckDb: 20 };
const db = (g: number | undefined): number => 20 * Math.log10(g ?? NaN);
const gains = (d: (number | null)[]): Float32Array => focusGains(d, new Float32Array(d.length), opts);

describe('focusGains', () => {
  it('ducks the other voices fully when standing at a tree', () => {
    const g = gains([1.5, 6, 9]);
    expect(g[0]).toBe(1);
    expect(db(g[1])).toBeCloseTo(-20);
    expect(db(g[2])).toBeCloseTo(-20);
  });

  it('ducks nothing from the far distance on', () => {
    expect([...gains([4, 8, 12])]).toEqual([1, 1, 1]);
  });

  it('eases in between near and far', () => {
    const g = gains([3, 8]);
    expect(db(g[1])).toBeCloseTo(-10);
  });

  it('scales by how much farther a voice is than the nearest', () => {
    const g = gains([1, 2, 2.5]);
    expect(db(g[1])).toBeCloseTo(-10);
    expect(db(g[2])).toBeCloseTo(-15);
  });

  it('never ducks two trees at the same distance', () => {
    expect([...gains([2, 2])]).toEqual([1, 1]);
  });

  it('leaves free voices at 1', () => {
    expect([...gains([null, 1, null])]).toEqual([1, 1, 1]);
    expect([...gains([null, null])]).toEqual([1, 1]);
  });
});
