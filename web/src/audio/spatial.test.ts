import { describe, expect, it } from 'vitest';
import { PannerSwap, toListenerSpace, type Vec3 } from './spatial';

const north = { x: 0, y: 1.7, z: 0, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0 };
const east = { ...north, fx: 1, fz: 0 };
const opts = { settleSeconds: 0.06, fadeSeconds: 0.03, leadSeconds: 0.02, minAngle: (1 * Math.PI) / 180, minDistanceRatio: 0.02 };

const close = (a: Vec3, b: Vec3) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
  expect(a.z).toBeCloseTo(b.z, 9);
};

describe('toListenerSpace', () => {
  it('puts the world into the default listener frame (right +x, up +y, forward -z)', () => {
    // Facing north (-z): a tree to the west is on the left, one to the north is ahead.
    close(toListenerSpace({ x: -2, y: 1.7, z: 0 }, north), { x: -2, y: 0, z: 0 });
    close(toListenerSpace({ x: 0, y: 3.7, z: -5 }, north), { x: 0, y: 2, z: -5 });
    // Facing east (+x): the same west tree is behind, a north tree is on the left.
    close(toListenerSpace({ x: -2, y: 1.7, z: 0 }, east), { x: 0, y: 0, z: 2 });
    close(toListenerSpace({ x: 0, y: 1.7, z: -3 }, east), { x: -3, y: 0, z: 0 });
  });

  it('keeps distances', () => {
    const pose = { x: 4, y: 1.7, z: -1, fx: 0.6, fy: 0, fz: -0.8, ux: 0, uy: 1, uz: 0 };
    const p = { x: -3, y: 5, z: 2 };
    const l = toListenerSpace(p, pose);
    expect(Math.hypot(l.x, l.y, l.z)).toBeCloseTo(Math.hypot(p.x - 4, p.y - 1.7, p.z + 1), 9);
  });
});

describe('PannerSwap', () => {
  const a = { x: -2, y: 0, z: 0 };

  it('does nothing while the direction holds', () => {
    const s = new PannerSwap(a, opts);
    for (let t = 0; t < 1; t += 0.016) expect(s.update(t, a)).toEqual([]);
    expect(s.audible).toBe(0);
  });

  it('ignores changes under the minimum angle and distance', () => {
    const s = new PannerSwap(a, opts);
    const tiny = { x: -2, y: 0, z: 0.02 }; // 0.57 degrees, same distance within 0.01 %
    expect(s.update(0, tiny)).toEqual([]);
  });

  it('places the silent panner, waits for it to settle, crossfades, then swaps', () => {
    const s = new PannerSwap(a, opts);
    const b = { x: 0, y: 0, z: -2 };
    expect(s.update(1, b)).toEqual([{ type: 'place', panner: 1, at: b }]);
    // The heard panner never moves; nothing else happens while the other settles.
    expect(s.update(1.03, b)).toEqual([]);
    // The crossfade is scheduled ahead of the audio clock, never at a time that may have passed.
    const [fade] = s.update(1.06, b);
    expect(fade?.type).toBe('fade');
    if (fade?.type !== 'fade') return;
    expect(fade.to).toBe(1);
    expect(fade.start).toBeCloseTo(1.08, 9);
    expect(fade.end).toBeCloseTo(1.11, 9);
    expect(s.update(1.1, b)).toEqual([]);
    expect(s.audible).toBe(0);
    expect(s.update(1.11, b)).toEqual([]);
    expect(s.audible).toBe(1);
  });

  it('keeps following a moving source, one swap at a time', () => {
    const s = new PannerSwap(a, opts);
    const actions: string[] = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const angle = t * Math.PI; // half a turn in 1 s
      for (const x of s.update(t, { x: -2 * Math.cos(angle), y: 0, z: -2 * Math.sin(angle) })) {
        actions.push(x.type === 'place' ? `place ${x.panner}` : `fade ${x.to}`);
      }
    }
    // place and fade alternate, and the placed panner is always the one not heard.
    expect(actions.length).toBeGreaterThan(10);
    actions.forEach((x, i) => expect(x.split(' ')[0]).toBe(i % 2 === 0 ? 'place' : 'fade'));
    for (let i = 0; i + 1 < actions.length; i += 2) expect(actions[i]?.split(' ')[1]).toBe(actions[i + 1]?.split(' ')[1]);
  });

  it('reacts to a distance change alone', () => {
    const s = new PannerSwap(a, opts);
    expect(s.update(0, { x: -2.1, y: 0, z: 0 })[0]?.type).toBe('place');
  });
});
