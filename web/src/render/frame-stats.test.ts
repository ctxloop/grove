import { describe, expect, it } from 'vitest';
import { FrameStats } from './frame-stats';

describe('FrameStats', () => {
  it('is all zeros when empty', () => {
    const s = new FrameStats(8);
    expect([s.count, s.mean(), s.percentile(50), s.max()]).toEqual([0, 0, 0, 0]);
  });

  it('computes mean and max', () => {
    const s = new FrameStats(8);
    for (const v of [2, 4, 6]) s.add(v);
    expect(s.count).toBe(3);
    expect(s.mean()).toBe(4);
    expect(s.max()).toBe(6);
  });

  it('uses nearest-rank percentiles', () => {
    const s = new FrameStats(100);
    for (let i = 100; i >= 1; i--) s.add(i); // unsorted insertion
    expect(s.percentile(50)).toBe(50);
    expect(s.percentile(95)).toBe(95);
    expect(s.percentile(99)).toBe(99);
    expect(s.percentile(100)).toBe(100);
    expect(s.percentile(0)).toBe(1);
  });

  it('ranks within a partly filled window', () => {
    const s = new FrameStats(16);
    for (const v of [10, 30, 20, 40]) s.add(v);
    expect(s.percentile(50)).toBe(20);
    expect(s.percentile(75)).toBe(30);
    expect(s.percentile(76)).toBe(40);
  });

  it('keeps only the most recent capacity values', () => {
    const s = new FrameStats(3);
    for (const v of [100, 1, 2, 3]) s.add(v);
    expect(s.count).toBe(3);
    expect(s.max()).toBe(3);
    expect(s.mean()).toBe(2);
    expect(s.percentile(100)).toBe(3);
  });

  it('does not drift after many wraps', () => {
    const s = new FrameStats(4);
    for (let i = 0; i < 1000; i++) s.add(0.1);
    expect(s.mean()).toBeCloseTo(0.1, 9);
  });

  it('percentile is repeatable and leaves the window intact', () => {
    const s = new FrameStats(4);
    for (const v of [4, 1, 3, 2]) s.add(v);
    expect(s.percentile(50)).toBe(2);
    expect(s.percentile(50)).toBe(2);
    s.add(10);
    expect(s.percentile(100)).toBe(10);
    expect(s.percentile(25)).toBe(1); // the window is now 1, 3, 2, 10
  });

  it('resets', () => {
    const s = new FrameStats(4);
    s.add(5);
    s.reset();
    expect([s.count, s.mean(), s.max(), s.percentile(90)]).toEqual([0, 0, 0, 0]);
    s.add(7);
    expect(s.mean()).toBe(7);
  });
});
