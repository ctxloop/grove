import { describe, expect, it } from 'vitest';
import { combineInputs, NO_INPUT, type InputFrame, type InputSource } from './input';

function fake(frame: Partial<InputFrame>): InputSource & { disposed: number } {
  return {
    disposed: 0,
    poll: () => ({ ...NO_INPUT, ...frame }),
    dispose() {
      this.disposed++;
    },
  };
}

describe('combineInputs', () => {
  it('returns no input for no sources', () => {
    expect(combineInputs([]).poll()).toEqual(NO_INPUT);
  });

  it('sums look deltas', () => {
    const f = combineInputs([fake({ lookYaw: 0.1, lookPitch: -0.2 }), fake({ lookYaw: 0.05, lookPitch: 0.1 })]).poll();
    expect(f.lookYaw).toBeCloseTo(0.15, 12);
    expect(f.lookPitch).toBeCloseTo(-0.1, 12);
  });

  it('sums move and keeps vectors shorter than 1', () => {
    const f = combineInputs([fake({ moveX: 0.2 }), fake({ moveX: 0.3, moveZ: 0.1 })]).poll();
    expect(f.moveX).toBeCloseTo(0.5, 12);
    expect(f.moveZ).toBeCloseTo(0.1, 12);
  });

  it('clamps the move vector length to 1', () => {
    const f = combineInputs([fake({ moveX: 1, moveZ: 1 }), fake({ moveZ: 1 })]).poll();
    expect(Math.hypot(f.moveX, f.moveZ)).toBeCloseTo(1, 12);
    expect(f.moveZ).toBeGreaterThan(f.moveX);
  });

  it('ORs sprint and select', () => {
    const f = combineInputs([fake({}), fake({ sprint: true }), fake({ select: true })]).poll();
    expect(f.sprint).toBe(true);
    expect(f.select).toBe(true);
    expect(combineInputs([fake({}), fake({})]).poll()).toMatchObject({ sprint: false, select: false });
  });

  it('disposes every source', () => {
    const a = fake({});
    const b = fake({});
    combineInputs([a, b]).dispose();
    expect([a.disposed, b.disposed]).toEqual([1, 1]);
  });
});
