import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { NO_INPUT, type InputFrame } from './input';
import { poseOf, standNear, step, type MoveBounds, type MoveState } from './movement';

const BIG: MoveBounds = { minX: -1e6, minZ: -1e6, maxX: 1e6, maxZ: 1e6 };
const START: MoveState = { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, pitch: 0 };
const forward: InputFrame = { ...NO_INPUT, moveZ: 1 };

function run(s: MoveState, input: InputFrame, dts: readonly number[], bounds: MoveBounds = BIG): MoveState {
  return dts.reduce((acc, dt) => step(acc, input, dt, bounds), s);
}

function uniform(hz: number, seconds = 1): number[] {
  return Array.from({ length: Math.round(hz * seconds) }, () => 1 / hz);
}

describe('step: frame-rate independence', () => {
  it('gives the same position after 1 s at 60, 120 and 144 Hz', () => {
    const a = run({ ...START, yaw: 0.7 }, forward, uniform(60));
    const b = run({ ...START, yaw: 0.7 }, forward, uniform(120));
    const c = run({ ...START, yaw: 0.7 }, forward, uniform(144));
    for (const o of [b, c]) {
      expect(o.x).toBeCloseTo(a.x, 9);
      expect(o.z).toBeCloseTo(a.z, 9);
      expect(o.vx).toBeCloseTo(a.vx, 9);
      expect(o.vz).toBeCloseTo(a.vz, 9);
    }
    expect(Math.hypot(a.x, a.z)).toBeGreaterThan(1);
  });

  it('gives the same position with jittered dt that sums to 1 s', () => {
    const raw = Array.from({ length: 90 }, (_, i) => 0.5 + ((i * 37) % 11) / 10);
    const total = raw.reduce((p, q) => p + q, 0);
    const dts = raw.map((d) => d / total);
    const a = run(START, forward, uniform(60));
    const b = run(START, forward, dts);
    expect(b.z).toBeCloseTo(a.z, 9);
    expect(b.vz).toBeCloseTo(a.vz, 9);
  });

  it('matches the closed form from rest', () => {
    const k = config.player.acceleration;
    const v = config.player.walkSpeed;
    const s = run(START, forward, uniform(75));
    expect(s.z).toBeCloseTo(-(v * (1 - (1 - Math.exp(-k)) / k)), 9);
  });
});

describe('step: speed', () => {
  it('settles at walkSpeed', () => {
    const s = run(START, forward, uniform(60, 3));
    expect(Math.hypot(s.vx, s.vz)).toBeCloseTo(config.player.walkSpeed, 6);
  });

  it('settles at sprintSpeed when sprinting', () => {
    const s = run(START, { ...forward, sprint: true }, uniform(60, 3));
    expect(Math.hypot(s.vx, s.vz)).toBeCloseTo(config.player.sprintSpeed, 6);
  });

  it('is not faster on the diagonal', () => {
    const s = run(START, { ...NO_INPUT, moveX: 1, moveZ: 1 }, uniform(60, 3));
    expect(Math.hypot(s.vx, s.vz)).toBeCloseTo(config.player.walkSpeed, 6);
  });

  it('stops when input is released', () => {
    const moving = run(START, forward, uniform(60, 2));
    const stopped = run(moving, NO_INPUT, uniform(60, 3));
    expect(Math.hypot(stopped.vx, stopped.vz)).toBeLessThan(1e-6);
  });

  it('moves forward along -Z at yaw 0 and strafes right along +X', () => {
    const f = run(START, forward, uniform(60));
    expect(f.z).toBeLessThan(0);
    expect(f.x).toBeCloseTo(0, 12);
    const r = run(START, { ...NO_INPUT, moveX: 1 }, uniform(60));
    expect(r.x).toBeGreaterThan(0);
    expect(r.z).toBeCloseTo(0, 12);
  });

  it('moves along -X after turning left by 90 degrees', () => {
    const s = run({ ...START, yaw: Math.PI / 2 }, forward, uniform(60));
    expect(s.x).toBeLessThan(0);
    expect(s.z).toBeCloseTo(0, 9);
  });

  it('clamps dt to maxFrameDt', () => {
    const a = step(START, forward, 10, BIG);
    const b = step(START, forward, config.player.maxFrameDt, BIG);
    expect(a).toEqual(b);
  });

  it('ignores negative dt', () => {
    expect(step(START, forward, -1, BIG)).toEqual(START);
  });
});

describe('step: bounds', () => {
  const bounds: MoveBounds = { minX: -10, minZ: -10, maxX: 10, maxZ: 10 };
  const m = config.player.boundsMargin;

  it('clamps position to bounds plus margin and zeroes the blocked velocity', () => {
    const s = run(START, forward, uniform(60, 30), bounds);
    expect(s.z).toBe(-10 - m);
    expect(s.vz).toBe(0);
  });

  it('keeps the free axis moving while sliding along a wall', () => {
    const at: MoveState = { ...START, z: 10 + m, yaw: (3 * Math.PI) / 4 };
    const s = run(at, forward, uniform(60), bounds);
    expect(s.z).toBe(10 + m);
    expect(s.vz).toBe(0);
    expect(s.x).toBeLessThan(0);
  });

  it('clamps the other three walls', () => {
    const east = run(START, { ...NO_INPUT, moveX: 1 }, uniform(60, 30), bounds);
    expect(east.x).toBe(10 + m);
    const west = run({ ...START, yaw: Math.PI / 2 }, forward, uniform(60, 30), bounds);
    expect(west.x).toBe(-10 - m);
    const south = run(START, { ...NO_INPUT, moveZ: -1 }, uniform(60, 30), bounds);
    expect(south.z).toBe(10 + m);
  });
});

describe('step: look', () => {
  it('clamps pitch to maxPitch', () => {
    const up = step(START, { ...NO_INPUT, lookPitch: 10 }, 0.016, BIG);
    expect(up.pitch).toBe(config.player.maxPitch);
    const down = step(START, { ...NO_INPUT, lookPitch: -10 }, 0.016, BIG);
    expect(down.pitch).toBe(-config.player.maxPitch);
  });

  it('adds yaw and wraps it into (-PI, PI]', () => {
    expect(step(START, { ...NO_INPUT, lookYaw: 0.5 }, 0.016, BIG).yaw).toBeCloseTo(0.5, 12);
    const wrapped = step({ ...START, yaw: 3 }, { ...NO_INPUT, lookYaw: 0.5 }, 0.016, BIG).yaw;
    expect(wrapped).toBeCloseTo(3.5 - 2 * Math.PI, 12);
    expect(step({ ...START, yaw: -3 }, { ...NO_INPUT, lookYaw: -0.5 }, 0.016, BIG).yaw).toBeCloseTo(
      -3.5 + 2 * Math.PI,
      12,
    );
    const pi = step(START, { ...NO_INPUT, lookYaw: Math.PI }, 0.016, BIG).yaw;
    expect(pi).toBeCloseTo(Math.PI, 12);
    const many = step(START, { ...NO_INPUT, lookYaw: 20 * Math.PI + 0.25 }, 0.016, BIG).yaw;
    expect(many).toBeCloseTo(0.25, 9);
  });

  it('does not change position from look alone', () => {
    const s = step(START, { ...NO_INPUT, lookYaw: 1 }, 0.016, BIG);
    expect(s.x).toBe(0);
    expect(s.z).toBe(0);
  });
});

describe('poseOf', () => {
  const len = (a: number, b: number, c: number) => Math.hypot(a, b, c);

  it('looks down -Z with up +Y at yaw 0, pitch 0', () => {
    const p = poseOf(START);
    expect([p.fx, p.fy, p.fz]).toEqual([-0, 0, -1]);
    expect([p.ux, p.uy, p.uz]).toEqual([0, 1, 0]);
    expect(p.y).toBe(config.player.eyeHeight);
  });

  it('turns left (toward -X) with positive yaw', () => {
    const p = poseOf({ ...START, yaw: Math.PI / 2 });
    expect(p.fx).toBeCloseTo(-1, 12);
    expect(p.fz).toBeCloseTo(0, 12);
  });

  it('looks up with positive pitch', () => {
    const p = poseOf({ ...START, pitch: 0.5 });
    expect(p.fy).toBeCloseTo(Math.sin(0.5), 12);
    expect(p.uz).toBeCloseTo(Math.sin(0.5), 12);
    expect(p.uy).toBeCloseTo(Math.cos(0.5), 12);
  });

  it('has unit-length orthogonal forward and up for any yaw and pitch', () => {
    for (const yaw of [-3, -1, 0, 0.3, 2, 3.1]) {
      for (const pitch of [-1.4, -0.3, 0, 0.8, 1.45]) {
        const p = poseOf({ ...START, x: 3, z: -4, yaw, pitch });
        expect(len(p.fx, p.fy, p.fz)).toBeCloseTo(1, 12);
        expect(len(p.ux, p.uy, p.uz)).toBeCloseTo(1, 12);
        expect(p.fx * p.ux + p.fy * p.uy + p.fz * p.uz).toBeCloseTo(0, 12);
        expect([p.x, p.z]).toEqual([3, -4]);
      }
    }
  });
});

describe('standNear', () => {
  it('stands the given distance from the tree on the side the player came from, facing it', () => {
    const tree = { x: 10, z: -5 };
    for (const from of [
      { x: 40, z: 7 },
      { x: -3, z: -60 },
      { x: 10, z: 100 },
    ]) {
      const s = standNear(tree, from, 2);
      expect(Math.hypot(s.x - tree.x, s.z - tree.z)).toBeCloseTo(2, 9);
      // On the segment from the tree towards `from`.
      const along = ((s.x - tree.x) * (from.x - tree.x) + (s.z - tree.z) * (from.z - tree.z)) / Math.hypot(from.x - tree.x, from.z - tree.z);
      expect(along).toBeCloseTo(2, 9);
      const p = poseOf(s);
      expect(p.fx).toBeCloseTo((tree.x - s.x) / 2, 9);
      expect(p.fz).toBeCloseTo((tree.z - s.z) / 2, 9);
      expect([s.vx, s.vz, s.pitch]).toEqual([0, 0, 0]);
    }
  });

  it('picks a side when the player is already at the tree', () => {
    const s = standNear({ x: 3, z: 4 }, { x: 3, z: 4 }, 2);
    expect(Math.hypot(s.x - 3, s.z - 4)).toBeCloseTo(2, 9);
    expect(poseOf(s).fz).toBeCloseTo(-1, 9);
  });
});
