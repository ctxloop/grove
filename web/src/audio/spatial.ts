// Voice directions without HRTF clicks (docs/architecture.md §5). Pure.
//
// Chrome's HRTF PannerNode steps its interaural delay whenever the azimuth of
// an audible source changes, which clicks. So the listener stays at the
// origin, each voice has two panners, and an audible panner never moves: a
// new direction is placed on the silent panner, which settles while silent,
// and then the two crossfade.

import { config } from '../config';
import type { ListenerPose } from './listener';

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** `p` in the camera's frame: right is +x, up is +y, forward is −z (the default AudioListener). */
export function toListenerSpace(p: Vec3, pose: ListenerPose): Vec3 {
  const dx = p.x - pose.x;
  const dy = p.y - pose.y;
  const dz = p.z - pose.z;
  // right = forward × up
  const rx = pose.fy * pose.uz - pose.fz * pose.uy;
  const ry = pose.fz * pose.ux - pose.fx * pose.uz;
  const rz = pose.fx * pose.uy - pose.fy * pose.ux;
  return {
    x: dx * rx + dy * ry + dz * rz,
    y: dx * pose.ux + dy * pose.uy + dz * pose.uz,
    z: -(dx * pose.fx + dy * pose.fy + dz * pose.fz),
  };
}

export type Panner = 0 | 1;

export type SwapAction =
  /** Move the silent panner. */
  | { readonly type: 'place'; readonly panner: Panner; readonly at: Vec3 }
  /** Crossfade from the other panner to `to` between the two times (seconds). */
  | { readonly type: 'fade'; readonly to: Panner; readonly start: number; readonly end: number };

export interface SwapOptions {
  /** Time the silent panner needs after a move before it is heard, s. Chrome crossfades kernels over 2048 frames. */
  settleSeconds: number;
  fadeSeconds: number;
  /**
   * Crossfades start this far after the frame that schedules them. Scheduling at the
   * main thread's currentTime can land in the past on the audio thread, and a ramp whose
   * start has passed jumps to where it should be by now: a step, audible as a click.
   */
  leadSeconds: number;
  /** Smaller direction changes are ignored, radians. */
  minAngle: number;
  /** Smaller relative distance changes are ignored. */
  minDistanceRatio: number;
}

const defaults = (): SwapOptions => ({
  settleSeconds: config.audio.followSettleSeconds,
  fadeSeconds: config.audio.followFadeSeconds,
  leadSeconds: config.audio.scheduleLeadSeconds,
  minAngle: (config.audio.followMinAngleDeg * Math.PI) / 180,
  minDistanceRatio: config.audio.followMinDistanceRatio,
});

function differs(a: Vec3, b: Vec3, o: SwapOptions): boolean {
  const la = Math.hypot(a.x, a.y, a.z);
  const lb = Math.hypot(b.x, b.y, b.z);
  if (la < 1e-6 || lb < 1e-6) return la !== lb;
  if (Math.abs(la - lb) > o.minDistanceRatio * Math.max(la, lb)) return true;
  const cos = (a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb);
  return Math.acos(Math.min(1, Math.max(-1, cos))) > o.minAngle;
}

/** One voice's pair of panners: which one is heard and when to swap. */
export class PannerSwap {
  private readonly opts: SwapOptions;
  private heard: Panner = 0;
  private readonly placed: [Vec3, Vec3];
  /** 'steady': only `heard` sounds. 'settling': the other was just placed. 'fading': crossfade in progress. */
  private phase: 'steady' | 'settling' | 'fading' = 'steady';
  private phaseEnd = 0;

  /** Both panners start at `at`; panner 0 is heard. */
  constructor(at: Vec3, opts: Partial<SwapOptions> = {}) {
    this.opts = { ...defaults(), ...opts };
    this.placed = [at, at];
  }

  get audible(): Panner {
    return this.heard;
  }

  /** Call every frame with the source in listener space; `now` in seconds on the audio clock. */
  update(now: number, target: Vec3): SwapAction[] {
    const o = this.opts;
    const other: Panner = this.heard === 0 ? 1 : 0;
    if (this.phase === 'fading') {
      if (now < this.phaseEnd) return [];
      this.heard = other;
      this.phase = 'steady';
      return this.update(now, target);
    }
    if (this.phase === 'settling') {
      if (now < this.phaseEnd) return [];
      this.phase = 'fading';
      const start = now + o.leadSeconds;
      this.phaseEnd = start + o.fadeSeconds;
      return [{ type: 'fade', to: other, start, end: this.phaseEnd }];
    }
    if (!differs(target, this.placed[this.heard], o)) return [];
    this.placed[other] = target;
    this.phase = 'settling';
    this.phaseEnd = now + o.settleSeconds;
    return [{ type: 'place', panner: other, at: target }];
  }
}
