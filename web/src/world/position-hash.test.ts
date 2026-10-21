import { describe, expect, it } from 'vitest';
import { formatHash, parseHash } from './position-hash';

const bounds = { minX: -100, minZ: -50, maxX: 100, maxZ: 50 };

describe('formatHash', () => {
  it('writes x and z to 0.1 m and the heading in whole degrees, 0..359', () => {
    expect(formatHash({ x: 12.345, z: -4.56, yaw: Math.PI / 2 })).toBe('#x=12.3&z=-4.6&h=90');
    expect(formatHash({ x: 0, z: 0, yaw: -Math.PI / 2 })).toBe('#x=0.0&z=0.0&h=270');
    expect(formatHash({ x: 0, z: 0, yaw: 4 * Math.PI })).toBe('#x=0.0&z=0.0&h=0');
  });
});

describe('parseHash', () => {
  it('round-trips to within the written precision', () => {
    const p = parseHash(formatHash({ x: -37.26, z: 18.04, yaw: 1 }), bounds, 0);
    expect(p?.x).toBeCloseTo(-37.3, 6);
    expect(p?.z).toBeCloseTo(18, 6);
    expect(p?.yaw).toBeCloseTo((57 * Math.PI) / 180, 6);
  });

  it('accepts a missing heading and a hash without the leading #', () => {
    expect(parseHash('x=1&z=2', bounds, 0)).toEqual({ x: 1, z: 2, yaw: 0 });
  });

  it('rejects missing or malformed numbers', () => {
    for (const h of ['', '#', '#x=1', '#z=1', '#x=&z=1', '#x=1e3&z=0', '#x=abc&z=0', '#x=1&z=2&h=north', '#x= 1&z=2']) {
      expect(parseHash(h, bounds, 0)).toBeNull();
    }
  });

  it('rejects positions beyond the bounds plus margin', () => {
    expect(parseHash('#x=105&z=0', bounds, 10)).toEqual({ x: 105, z: 0, yaw: 0 });
    expect(parseHash('#x=111&z=0', bounds, 10)).toBeNull();
    expect(parseHash('#x=0&z=-61', bounds, 10)).toBeNull();
  });
});
