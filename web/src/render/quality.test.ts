import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { QualityController } from './quality';

const r = config.render;
const LEVELS = 4;

/** Feeds frames with synthetic timestamps; `deltaOf(i)` is the delta before frame i. Returns the level changes. */
class Clock {
  t = 1000;
  i = 0;
  changes: number[] = [];
  constructor(readonly q: QualityController, readonly interval: number) {
    q.frame(this.t, 0); // first call only records the timestamp
  }
  run(ms: number, deltaOf: (i: number) => number = () => this.interval): void {
    const end = this.t + ms;
    while (this.t < end) {
      this.t += deltaOf(this.i++);
      const change = this.q.frame(this.t, 1);
      if (change !== null) this.changes.push(change);
    }
  }
  /** Every `period`-th frame takes `late` ms instead of the interval. */
  run_missing(ms: number, period: number, late: number): void {
    this.run(ms, (i) => (i % period === 0 ? late : this.interval));
  }
}

const windows = (n: number): number => n * r.qualityWindowMs + 50;

describe('QualityController', () => {
  it('starts at the requested level, clamped', () => {
    expect(new QualityController(LEVELS, 3).level).toBe(3);
    expect(new QualityController(LEVELS, 99).level).toBe(3);
    expect(new QualityController(LEVELS, -2).level).toBe(0);
  });

  for (const hz of [30, 60, 120, 144]) {
    it(`stays at the top for a steady ${hz} Hz`, () => {
      const c = new Clock(new QualityController(LEVELS, LEVELS - 1), 1000 / hz);
      c.run(windows(10));
      expect(c.changes).toEqual([]);
      expect(c.q.level).toBe(LEVELS - 1);
    });

    it(`steps down one level per window under sustained misses at ${hz} Hz`, () => {
      const c = new Clock(new QualityController(LEVELS, LEVELS - 1), 1000 / hz);
      c.run(windows(1)); // establishes the interval
      c.run_missing(windows(5), 4, (1000 / hz) * 2.2); // 25 % of frames late
      expect(c.changes).toEqual([2, 1, 0]);
      expect(c.q.level).toBe(0);
    });
  }

  it('does not step down on a few isolated late frames', () => {
    const c = new Clock(new QualityController(LEVELS, LEVELS - 1), 1000 / 60);
    c.run(windows(1));
    c.run_missing(windows(6), 100, 40); // 1 % late frames
    expect(c.changes).toEqual([]);
  });

  it('counts a frame as missed only above 1.5x the interval', () => {
    const c = new Clock(new QualityController(LEVELS, LEVELS - 1), 10);
    c.run(windows(1));
    c.run_missing(windows(4), 2, 14.9); // half the frames at 1.49x
    expect(c.changes).toEqual([]);
    c.run_missing(windows(2), 2, 15.5); // 1.55x
    expect(c.changes.length).toBeGreaterThan(0);
  });

  it('steps up only after the required number of consecutive good windows', () => {
    const c = new Clock(new QualityController(LEVELS, 1), 1000 / 60);
    c.run(windows(r.qualityUpWindows - 1));
    expect(c.changes).toEqual([]);
    c.run(windows(1));
    expect(c.changes).toEqual([2]);
    c.run(windows(r.qualityUpWindows));
    expect(c.changes).toEqual([2, 3]);
    c.run(windows(5));
    expect(c.changes).toEqual([2, 3]); // already at the top
  });

  it('a middling window breaks the run of good windows', () => {
    const c = new Clock(new QualityController(LEVELS, 1), 1000 / 60);
    c.run(windows(r.qualityUpWindows - 1));
    // About 3 % late frames: neither good nor bad.
    c.run_missing(windows(1), 33, 40);
    c.run(windows(r.qualityUpWindows - 1));
    expect(c.changes).toEqual([]);
    c.run(windows(1));
    expect(c.changes).toEqual([2]);
  });

  it('a bad window resets the good-window count', () => {
    const c = new Clock(new QualityController(LEVELS, 2), 1000 / 60);
    c.run(windows(r.qualityUpWindows - 1));
    c.run_missing(windows(1), 3, 40);
    expect(c.changes).toEqual([1]);
    c.run(windows(r.qualityUpWindows - 1));
    expect(c.changes).toEqual([1]);
    c.run(windows(1));
    expect(c.changes).toEqual([1, 2]);
  });

  it('ignores gaps over 250 ms entirely', () => {
    const c = new Clock(new QualityController(LEVELS, LEVELS - 1), 1000 / 60);
    c.run(windows(1));
    for (let k = 0; k < 20; k++) {
      c.t += 5000; // tab hidden
      c.q.frame(c.t, 0);
      c.run(300);
    }
    expect(c.changes).toEqual([]);
    expect(c.q.level).toBe(LEVELS - 1);
  });

  it('gaps do not advance the window', () => {
    const c = new Clock(new QualityController(LEVELS, 1), 1000 / 60);
    // Alternating 1 s gaps and one frame never fill a 2 s window of real frames.
    for (let k = 0; k < 50; k++) {
      c.t += 1000;
      c.q.frame(c.t, 0);
      c.t += 1000 / 60;
      c.q.frame(c.t, 0);
    }
    expect(c.changes).toEqual([]);
    expect(c.q.level).toBe(1);
  });

  it('keeps the display interval when the whole window runs slow', () => {
    const c = new Clock(new QualityController(LEVELS, LEVELS - 1), 1000 / 60);
    c.run(windows(1));
    c.run(windows(4), () => 1000 / 30); // sustained 30 fps on a 60 Hz display
    expect(c.changes).toEqual([2, 1, 0]);
  });

  it('adopts a slower display interval after many bad windows at the lowest level', () => {
    const c = new Clock(new QualityController(LEVELS, 1), 1000 / 120);
    c.run(windows(1));
    c.run(windows(4), () => 1000 / 30); // display dropped from 120 Hz to 30 Hz
    expect(c.q.level).toBe(0);
    c.changes.length = 0;
    c.run(windows(14), () => 1000 / 30);
    expect(c.changes).toEqual([]);
    c.run(windows(1 + r.qualityUpWindows), () => 1000 / 30); // re-estimated, so the windows are good again
    expect(c.changes).toEqual([1]);
  });

  it('never leaves [0, levels - 1]', () => {
    const c = new Clock(new QualityController(LEVELS, LEVELS - 1), 1000 / 60);
    c.run(windows(1));
    c.run(windows(12), () => 80);
    expect(c.q.level).toBe(0);
    c.run(windows(30), () => 1000 / 60);
    expect(c.q.level).toBe(LEVELS - 1);
    c.run(windows(40), () => 80);
    expect(c.q.level).toBeGreaterThanOrEqual(0);
    for (const l of c.changes) expect(l).toBeGreaterThanOrEqual(0);
    for (const l of c.changes) expect(l).toBeLessThanOrEqual(LEVELS - 1);
  });

  it('works with a single level', () => {
    const c = new Clock(new QualityController(1, 0), 1000 / 60);
    c.run(windows(4), () => 80);
    expect(c.changes).toEqual([]);
    expect(c.q.level).toBe(0);
  });
});
