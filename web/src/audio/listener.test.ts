import { describe, expect, it } from 'vitest';
import { ORIGIN, setListener } from './listener';

const pose = { x: 1, y: 1.7, z: -2, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0 };

describe('setListener', () => {
  it('sets every AudioParam', () => {
    const names = ['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ'] as const;
    const l = Object.fromEntries(names.map((n) => [n, { value: NaN }])) as Record<(typeof names)[number], { value: number }>;
    setListener(l as unknown as AudioListener, pose);
    expect(names.map((n) => l[n].value)).toEqual([1, 1.7, -2, 0, 0, -1, 0, 1, 0]);
  });

  it('falls back to setPosition and setOrientation without AudioParams', () => {
    const calls: number[][] = [];
    const l = { setPosition: (...a: number[]) => void calls.push(a), setOrientation: (...a: number[]) => void calls.push(a) };
    setListener(l as unknown as AudioListener, ORIGIN);
    expect(calls).toEqual([
      [0, 0, 0],
      [0, 0, -1, 0, 1, 0],
    ]);
  });
});
