import { config } from '../config';

/** Gaps above this (tab switch, debugger) are not frames the player saw; they are ignored entirely. */
const MAX_DELTA_MS = 250;
/** A frame is missed when its delta exceeds the display interval by this factor. */
const MISS_FACTOR = 1.5;
/**
 * The display interval is the smallest window median seen so far, so sustained slowness is not mistaken for
 * the refresh rate. If the lowest level misses this many windows in a row, the display probably slowed down
 * (battery saver, another monitor) and the estimate is replaced by the current median.
 */
const FLOOR_BAD_WINDOWS = 15;
/** Deltas stored per window; 2048 covers 2 s at 1 kHz. */
const MAX_WINDOW_FRAMES = 2048;

/**
 * Adaptive quality: call `frame` once per requestAnimationFrame. Over fixed windows it counts the share
 * of missed frames against the display interval (estimated from rAF timestamps), steps one level down on
 * a bad window and one level up after several consecutive good windows.
 */
export class QualityController {
  private current: number;
  private prev = -1;
  private readonly deltas = new Float64Array(MAX_WINDOW_FRAMES);
  private frames = 0;
  private elapsed = 0;
  private interval = Infinity;
  private floorBad = 0;
  private goodWindows = 0;

  constructor(private readonly levels: number, start: number) {
    this.current = Math.min(Math.max(Math.round(start), 0), levels - 1);
  }

  get level(): number {
    return this.current;
  }

  /** `workMs` (main-thread time of the previous frame) is not needed: the timestamp delta already includes it. */
  frame(timestampMs: number, _workMs: number): number | null {
    const prev = this.prev;
    this.prev = timestampMs;
    if (prev < 0) return null;
    const dt = timestampMs - prev;
    if (dt <= 0 || dt > MAX_DELTA_MS) return null;
    if (this.frames < MAX_WINDOW_FRAMES) this.deltas[this.frames++] = dt;
    this.elapsed += dt;
    if (this.elapsed < config.render.qualityWindowMs) return null;
    return this.endWindow();
  }

  private endWindow(): number | null {
    const c = config.render;
    const sorted = this.deltas.subarray(0, this.frames).sort();
    const median = sorted[this.frames >> 1] ?? 0;
    this.interval = Math.min(this.interval, median);
    const limit = this.interval * MISS_FACTOR;
    let missed = 0;
    for (let i = 0; i < this.frames; i++) if ((this.deltas[i] ?? 0) > limit) missed++;
    const share = missed / this.frames;
    this.frames = 0;
    this.elapsed = 0;

    const before = this.current;
    if (share > c.qualityDownMissRatio) {
      this.goodWindows = 0;
      if (this.current > 0) {
        this.current--;
      } else if (++this.floorBad >= FLOOR_BAD_WINDOWS) {
        this.interval = median;
        this.floorBad = 0;
      }
    } else {
      this.floorBad = 0;
      if (share >= c.qualityUpMissRatio) this.goodWindows = 0;
      else if (++this.goodWindows >= c.qualityUpWindows && this.current < this.levels - 1) this.current++;
    }
    if (this.current === before) return null;
    this.goodWindows = 0;
    return this.current;
  }
}
