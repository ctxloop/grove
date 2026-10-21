// Pure, frame-rate independent movement. No three.js, no DOM.
//
// Velocity v approaches the target velocity T exponentially at rate k:
//   v(t) = T + (v0 - T) e^(-k t)
// and the position is advanced by the exact integral of that curve, so for
// constant input the result does not depend on how dt is sliced into frames.

import { config } from '../config';
import type { InputFrame } from './input';

export interface MoveState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Radians, positive turns left. Kept in (-π, π]. */
  yaw: number;
  /** Radians, positive looks up. */
  pitch: number;
}

export interface MoveBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** Eye position, forward and up unit vectors (for the audio listener). */
export interface Pose {
  x: number;
  y: number;
  z: number;
  fx: number;
  fy: number;
  fz: number;
  ux: number;
  uy: number;
  uz: number;
}

const TWO_PI = Math.PI * 2;

function wrapYaw(yaw: number): number {
  let y = yaw % TWO_PI;
  if (y > Math.PI) y -= TWO_PI;
  else if (y <= -Math.PI) y += TWO_PI;
  return y;
}

export function step(s: MoveState, input: InputFrame, dt: number, bounds: MoveBounds): MoveState {
  const { walkSpeed, sprintSpeed, acceleration, maxPitch, boundsMargin, maxFrameDt } = config.player;
  const h = Math.min(Math.max(dt, 0), maxFrameDt);

  const yaw = wrapYaw(s.yaw + input.lookYaw);
  const pitch = Math.min(maxPitch, Math.max(-maxPitch, s.pitch + input.lookPitch));

  let mx = input.moveX;
  let mz = input.moveZ;
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  const speed = input.sprint ? sprintSpeed : walkSpeed;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // forward = (-sin, -cos), right = (cos, -sin)
  const tx = (-sin * mz + cos * mx) * speed;
  const tz = (-cos * mz - sin * mx) * speed;

  const decay = Math.exp(-acceleration * h);
  const gain = (1 - decay) / acceleration; // ∫0..h e^(-k t) dt
  let x = s.x + tx * h + (s.vx - tx) * gain;
  let z = s.z + tz * h + (s.vz - tz) * gain;
  let vx = tx + (s.vx - tx) * decay;
  let vz = tz + (s.vz - tz) * decay;

  const minX = bounds.minX - boundsMargin;
  const maxX = bounds.maxX + boundsMargin;
  const minZ = bounds.minZ - boundsMargin;
  const maxZ = bounds.maxZ + boundsMargin;
  if (x < minX) {
    x = minX;
    vx = 0;
  } else if (x > maxX) {
    x = maxX;
    vx = 0;
  }
  if (z < minZ) {
    z = minZ;
    vz = 0;
  } else if (z > maxZ) {
    z = maxZ;
    vz = 0;
  }

  return { x, z, vx, vz, yaw, pitch };
}

export function poseOf(s: MoveState): Pose {
  const sinY = Math.sin(s.yaw);
  const cosY = Math.cos(s.yaw);
  const sinP = Math.sin(s.pitch);
  const cosP = Math.cos(s.pitch);
  return {
    x: s.x,
    y: config.player.eyeHeight,
    z: s.z,
    fx: -sinY * cosP,
    fy: sinP,
    fz: -cosY * cosP,
    ux: sinY * sinP,
    uy: cosP,
    uz: cosY * sinP,
  };
}

/**
 * A standing state `distance` meters from a tree, on the side of `from` (where the
 * player was), facing the tree. Used for search teleports.
 */
export function standNear(tree: { x: number; z: number }, from: { x: number; z: number }, distance: number): MoveState {
  let ux = from.x - tree.x;
  let uz = from.z - tree.z;
  const len = Math.hypot(ux, uz);
  if (len < 1e-6) {
    ux = 0;
    uz = 1;
  } else {
    ux /= len;
    uz /= len;
  }
  // Forward is (-sin yaw, -cos yaw); it must point from the player to the tree, i.e. along -u.
  return { x: tree.x + ux * distance, z: tree.z + uz * distance, vx: 0, vz: 0, yaw: Math.atan2(ux, uz), pitch: 0 };
}
