import { describe, expect, it } from 'vitest';
import { clampToSquare, fitBounds } from './minimap-math';

const wide = { minX: -200, minZ: -50, maxX: 200, maxZ: 50 };

describe('fitBounds', () => {
  it('maps the corners inside the padding', () => {
    const fit = fitBounds(wide, 160, 10);
    const a = fit.point(wide.minX, wide.minZ);
    const b = fit.point(wide.maxX, wide.maxZ);
    for (const v of [a.x, a.y, b.x, b.y]) {
      expect(v).toBeGreaterThanOrEqual(10 - 1e-9);
      expect(v).toBeLessThanOrEqual(150 + 1e-9);
    }
    // The longer axis fills the padded square exactly.
    expect(a.x).toBeCloseTo(10);
    expect(b.x).toBeCloseTo(150);
  });

  it('preserves the aspect ratio and centers the shorter axis', () => {
    const fit = fitBounds(wide, 160, 10);
    const a = fit.point(wide.minX, wide.minZ);
    const b = fit.point(wide.maxX, wide.maxZ);
    expect((b.x - a.x) / (b.y - a.y)).toBeCloseTo(4);
    expect((a.y + b.y) / 2).toBeCloseTo(80);
  });

  it('puts world x to the right and world z downward', () => {
    const fit = fitBounds(wide, 160, 10);
    expect(fit.point(10, 0).x).toBeGreaterThan(fit.point(0, 0).x);
    expect(fit.point(0, 10).y).toBeGreaterThan(fit.point(0, 0).y);
  });

  it('scales radii with the same factor as positions', () => {
    const fit = fitBounds(wide, 160, 10);
    expect(fit.radius(100)).toBeCloseTo(fit.point(100, 0).x - fit.point(0, 0).x);
  });

  it('survives degenerate bounds', () => {
    const fit = fitBounds({ minX: 5, minZ: 5, maxX: 5, maxZ: 5 }, 100, 10);
    const p = fit.point(5, 5);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
});

describe('heading tick', () => {
  const fit = fitBounds(wide, 160, 10);
  const origin = fit.point(0, 0);

  it('points up at yaw 0', () => {
    const end = fit.tick(0, 0, 0, 10);
    expect(end.x).toBeCloseTo(origin.x);
    expect(end.y).toBeCloseTo(origin.y - 10);
  });

  it('points left at yaw pi/2', () => {
    const end = fit.tick(0, 0, Math.PI / 2, 10);
    expect(end.x).toBeCloseTo(origin.x - 10);
    expect(end.y).toBeCloseTo(origin.y);
  });

  it('points down at yaw pi and right at -pi/2', () => {
    expect(fit.tick(0, 0, Math.PI, 10).y).toBeCloseTo(origin.y + 10);
    expect(fit.tick(0, 0, -Math.PI / 2, 10).x).toBeCloseTo(origin.x + 10);
  });
});

describe('toWorld', () => {
  const fit = fitBounds(wide, 160, 10);

  it('inverts point', () => {
    for (const [x, z] of [[0, 0], [-150, 20], [199, -49]] as const) {
      const p = fit.point(x, z);
      const w = fit.toWorld(p.x, p.y);
      expect(w.x).toBeCloseTo(x);
      expect(w.z).toBeCloseTo(z);
    }
  });

  it('clamps spots in the padding to the bounds', () => {
    expect(fit.toWorld(0, 0)).toEqual({ x: wide.minX, z: wide.minZ });
    expect(fit.toWorld(160, 160)).toEqual({ x: wide.maxX, z: wide.maxZ });
  });
});

describe('clampToSquare', () => {
  it('keeps points inside and leaves inside points alone', () => {
    expect(clampToSquare({ x: -50, y: 500 }, 160, 4)).toEqual({ x: 4, y: 156 });
    expect(clampToSquare({ x: 80, y: 40 }, 160, 4)).toEqual({ x: 80, y: 40 });
  });
});
