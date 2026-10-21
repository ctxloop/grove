import { describe, expect, it } from 'vitest';
import { isTap, joystick, knobOffset, lookDelta, sideOf } from './touch-math';

const R = 60;
const DZ = 0.15;
const SPRINT = 0.95;
const stick = (dx: number, dy: number) => joystick(dx, dy, R, DZ, SPRINT);

describe('sideOf', () => {
  it('splits at the middle, the exact middle belongs to the right', () => {
    expect(sideOf(0, 800)).toBe('left');
    expect(sideOf(399, 800)).toBe('left');
    expect(sideOf(400, 800)).toBe('right');
    expect(sideOf(799, 800)).toBe('right');
  });
});

describe('joystick', () => {
  it('is zero inside the dead zone', () => {
    expect(stick(0, 0)).toEqual({ moveX: 0, moveZ: 0, sprint: false });
    expect(stick(R * DZ * 0.9, 0)).toEqual({ moveX: 0, moveZ: 0, sprint: false });
  });

  it('grows from zero right after the dead zone', () => {
    const out = stick(R * DZ + 0.6, 0);
    expect(out.moveX).toBeGreaterThan(0);
    expect(out.moveX).toBeLessThan(0.02);
  });

  it('has the right axis signs: right is +x, up on screen is +z', () => {
    expect(stick(40, 0).moveX).toBeGreaterThan(0);
    expect(stick(-40, 0).moveX).toBeLessThan(0);
    expect(stick(0, -40).moveZ).toBeGreaterThan(0);
    expect(stick(0, 40).moveZ).toBeLessThan(0);
    expect(stick(0, -40).moveX).toBeCloseTo(0, 12);
  });

  it('clamps the length to 1 and keeps the direction', () => {
    const out = stick(600, -600);
    expect(Math.hypot(out.moveX, out.moveZ)).toBeCloseTo(1, 12);
    expect(out.moveX).toBeCloseTo(out.moveZ, 12);
  });

  it('reaches full strength at the ring edge', () => {
    const out = stick(R, 0);
    expect(out.moveX).toBeCloseTo(1, 12);
  });

  it('sprints from the sprint threshold outward, not before', () => {
    expect(stick(R * 0.9, 0).sprint).toBe(false);
    expect(stick(R * SPRINT, 0).sprint).toBe(true);
    expect(stick(R * 2, 0).sprint).toBe(true);
    expect(stick(R * 0.7, R * 0.7).sprint).toBe(true);
  });
});

describe('knobOffset', () => {
  it('follows the finger inside the ring and stops at the ring edge outside', () => {
    expect(knobOffset(10, -20, R)).toEqual({ x: 10, y: -20 });
    const k = knobOffset(300, 400, R);
    expect(k.x).toBeCloseTo(36, 12);
    expect(k.y).toBeCloseTo(48, 12);
  });
});

describe('lookDelta', () => {
  it('matches the mouse: drag right turns right (yaw down), drag up looks up (pitch up)', () => {
    const d = lookDelta(10, -20, 0.004);
    expect(d.yaw).toBeCloseTo(-0.04, 12);
    expect(d.pitch).toBeCloseTo(0.08, 12);
  });

  it('is zero for no movement', () => {
    expect(lookDelta(0, 0, 0.004)).toEqual({ yaw: -0, pitch: -0 });
  });
});

describe('isTap', () => {
  it('is a tap when short and still', () => {
    expect(isTap(120, 2, 250, 6)).toBe(true);
    expect(isTap(250, 5.9, 250, 6)).toBe(true);
  });

  it('is not a tap when held too long or dragged', () => {
    expect(isTap(251, 0, 250, 6)).toBe(false);
    expect(isTap(100, 6, 250, 6)).toBe(false);
  });
});
