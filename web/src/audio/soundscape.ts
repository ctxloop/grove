// Ties the scheduler, the clip cache, and the voice pool together (docs/architecture.md §5).
// main.ts calls tick() at config.audio.tickHz and frame() every frame.

import { config } from '../config';
import type { ClipCache } from './clips';
import { focusGains } from './focus';
import { Scheduler, type Action, type Candidate, type ClipStatus, type SchedulerOptions } from './scheduler';
import type { Point, VoiceSink } from './voices';

/** A tree within hearing range; x, y, z place its sound source. */
export interface Heard extends Candidate, Point {}

/** What the info panel shows for a tree. */
export type TreeSound = 'idle' | 'loading' | 'playing' | 'error';

export type Clips = Pick<ClipCache, 'peek' | 'isFailed' | 'load'>;

/** Receives each lit tree's band energies; all zeros means the tree goes dark. */
export type LightFn = (tree: Heard, low: number, mid: number, high: number) => void;

/** Below this every band counts as dark once the voice is silent. */
const DARK = 0.005;

export interface SoundscapeOptions extends SchedulerOptions {
  /** Loads and voice starts carried out per frame; the rest wait for the next frames. Releases never wait. */
  actionsPerFrame: number;
}

export class Soundscape {
  private readonly scheduler: Scheduler<Heard>;
  private readonly loads = new Map<number, AbortController>();
  /** The tree each voice lights, kept through the fade-out until its light has decayed. */
  private readonly lit: (Heard | null)[];
  /** Trees whose voice was taken over before their light decayed; zeroed on the next frame. */
  private readonly dark: Heard[] = [];
  /**
   * Loads and starts not carried out yet, in order. A tick can ask for a fetch or a voice
   * start for every voice at once, each a fraction of a millisecond, so they are spread over frames.
   * Releases are cheap and never wait: the scheduler frees a voice fadeSeconds after it
   * asks for the release, and a late fade-out would still be sounding when the voice restarts.
   */
  private readonly pending: Exclude<Action<Heard>, { type: 'release' }>[] = [];
  private readonly actionsPerFrame: number;
  /** Loads and starts carried out since the last frame(). */
  private spent = 0;
  /** Per voice: its tree's distance at the last tick (null when free or fading out) and its focus gain. */
  private readonly distances: (number | null)[];
  private readonly focus: Float32Array;
  private wantsTick = false;

  constructor(
    private readonly clips: Clips,
    private readonly sink: VoiceSink,
    private readonly urlOf: (id: number) => string,
    opts: Partial<SoundscapeOptions> = {},
  ) {
    this.scheduler = new Scheduler<Heard>(opts);
    this.actionsPerFrame = opts.actionsPerFrame ?? config.audio.actionsPerFrame;
    this.lit = Array.from({ length: this.scheduler.size }, () => null);
    this.distances = Array.from({ length: this.scheduler.size }, () => null);
    this.focus = new Float32Array(this.scheduler.size).fill(1);
  }

  /** A click on a tree: pins it, or stops it if it is already pinned. */
  toggle(id: number): void {
    this.scheduler.toggle(id);
    this.wantsTick = true;
  }

  /**
   * True after a click or a finished load: the next tick can start or load something, so
   * main.ts runs it on the next frame instead of waiting up to a tick interval.
   */
  get due(): boolean {
    return this.wantsTick;
  }

  /** The pinned tree's id, or null. */
  get pinned(): number | null {
    return this.scheduler.pinned;
  }

  activeVoices(now: number): number {
    return this.scheduler.activeVoices(now);
  }

  state(id: number): TreeSound {
    if (this.scheduler.voiceOf(id) >= 0) return 'playing';
    if (this.clips.isFailed(this.urlOf(id))) return 'error';
    if (this.loads.has(id) || this.scheduler.pinned === id) return 'loading';
    return 'idle';
  }

  /** `heard`: trees within hearing range. `now` in seconds; `speed` in m/s. */
  tick(now: number, speed: number, heard: readonly Heard[]): void {
    this.wantsTick = false;
    // Whatever the last tick left is carried out first, so the scheduler and the voices agree.
    this.drain(Infinity);

    // A load for a tree the player walked away from is no longer worth the bandwidth.
    const present = new Set(heard.map((t) => t.id));
    for (const [id, ac] of this.loads) {
      if (present.has(id)) continue;
      ac.abort();
      this.loads.delete(id);
    }

    for (const a of this.scheduler.tick({ now, speed, candidates: heard, status: this.status })) {
      if (a.type === 'release') this.sink.release(a.voice);
      else this.pending.push(a);
    }
    this.refocus(heard);
    this.drain(this.actionsPerFrame - this.spent);
  }

  /** Carries out at most `limit` pending loads and starts, oldest first. */
  private drain(limit: number): void {
    for (let n = 0; n < limit; n++) {
      const a = this.pending.shift();
      if (a === undefined) return;
      this.spent++;
      switch (a.type) {
        case 'load':
          this.load(a.tree.id);
          break;
        case 'start': {
          const buffer = this.clips.peek(this.urlOf(a.tree.id));
          if (buffer === undefined) {
            this.scheduler.abort(a.voice);
            break;
          }
          const old = this.lit[a.voice];
          if (old != null && old.id !== a.tree.id) this.dark.push(old);
          this.lit[a.voice] = a.tree;
          this.sink.start(a.voice, buffer, a.tree, this.focus[a.voice] ?? 1);
          break;
        }
      }
    }
  }

  /** Per frame: reports the band energies of every lit tree. */
  frame(dt: number, light: LightFn): void {
    this.drain(this.actionsPerFrame - this.spent);
    this.spent = 0;
    for (const t of this.dark) light(t, 0, 0, 0);
    this.dark.length = 0;
    this.lit.forEach((tree, voice) => {
      if (tree === null) return;
      const l = this.sink.levels(voice, dt);
      const low = l[0] ?? 0;
      const mid = l[1] ?? 0;
      const high = l[2] ?? 0;
      if (!this.sink.sounding(voice) && Math.max(low, mid, high) < DARK) {
        light(tree, 0, 0, 0);
        this.lit[voice] = null;
        return;
      }
      light(tree, low, mid, high);
    });
  }

  /**
   * Focus gains from the voices' current distances. A voice fading out keeps the gain it had,
   * and a voice whose start is still pending gets its gain when it starts.
   */
  private refocus(heard: readonly Heard[]): void {
    for (let v = 0; v < this.distances.length; v++) {
      const id = this.scheduler.treeOf(v)?.id;
      this.distances[v] = id === undefined ? null : (heard.find((t) => t.id === id)?.distance ?? null);
    }
    focusGains(this.distances, this.focus);
    this.distances.forEach((d, v) => {
      if (d !== null) this.sink.focus(v, this.focus[v] ?? 1);
    });
  }

  private readonly status = (id: number): ClipStatus => {
    const url = this.urlOf(id);
    if (this.clips.isFailed(url)) return 'failed';
    if (this.clips.peek(url) !== undefined) return 'ready';
    return this.loads.has(id) ? 'loading' : 'none';
  };

  private load(id: number): void {
    const ac = new AbortController();
    this.loads.set(id, ac);
    const done = (): void => {
      if (this.loads.get(id) === ac) this.loads.delete(id);
    };
    this.clips.load(this.urlOf(id), ac.signal).then(() => {
      if (this.loads.get(id) === ac) this.wantsTick = true;
      done();
    }, done);
  }
}
