// Voice scheduling for the soundscape (docs/architecture.md §5). Pure: no Web Audio,
// no DOM. main.ts calls tick() at 5 Hz and carries out the returned actions.

import { config } from '../config';

/** A tree within hearing range, with its distance from the listener. */
export interface Candidate {
  readonly id: number;
  readonly biome: number;
  readonly index: number;
  readonly distance: number;
}

/** Where a tree's clip is, as reported by the clip cache. */
export type ClipStatus = 'none' | 'loading' | 'ready' | 'failed';

export interface TickInput<T extends Candidate = Candidate> {
  /** Seconds, monotonic. */
  readonly now: number;
  /** Horizontal player speed, m/s. */
  readonly speed: number;
  /** Trees within hearing range, any order. Include the pinned tree while it is near enough to hear. */
  readonly candidates: readonly T[];
  readonly status: (id: number) => ClipStatus;
}

export type Action<T extends Candidate = Candidate> =
  | { readonly type: 'load'; readonly tree: T }
  | { readonly type: 'start'; readonly voice: number; readonly tree: T }
  | { readonly type: 'release'; readonly voice: number };

interface Ranked<T> {
  readonly tree: T;
  readonly clip: ClipStatus;
  readonly playing: boolean;
  readonly rank: number;
}

interface Voice<T> {
  tree: T | null;
  /** Busy until this time when fading out; a playing voice has fadeEnd = Infinity. */
  fadeEnd: number;
}

export interface SchedulerOptions {
  voices: number;
  dwellSeconds: number;
  settleSpeed: number;
  fadeSeconds: number;
  hysteresis: number;
}

const defaults = (): SchedulerOptions => ({
  voices: config.audio.voices,
  dwellSeconds: config.audio.dwellSeconds,
  settleSpeed: config.audio.settleSpeed,
  // A release fade starts scheduleLeadSeconds after the release (audio/voices.ts).
  fadeSeconds: config.audio.fadeSeconds + config.audio.scheduleLeadSeconds,
  hysteresis: config.audio.hysteresis,
});

/** Generic over the candidate type so actions hand back the caller's own tree objects. */
export class Scheduler<T extends Candidate = Candidate> {
  private readonly opts: SchedulerOptions;
  private readonly voices: Voice<T>[];
  private settledSince: number | null = null;
  private pinnedId: number | null = null;
  private readonly silenced = new Set<number>();

  constructor(opts: Partial<SchedulerOptions> = {}) {
    this.opts = { ...defaults(), ...opts };
    this.voices = Array.from({ length: this.opts.voices }, () => ({ tree: null, fadeEnd: 0 }));
  }

  /** The tree a click pinned, or null. A pinned tree loads without dwelling and is wanted first. */
  get pinned(): number | null {
    return this.pinnedId;
  }

  /** Pool size. */
  get size(): number {
    return this.voices.length;
  }

  /** Voices playing or still fading out. Never more than the pool size. */
  activeVoices(now: number): number {
    return this.voices.filter((v) => v.tree !== null || v.fadeEnd > now).length;
  }

  /** The tree a voice is playing (not fading), or null. */
  treeOf(voice: number): T | null {
    return this.voices[voice]?.tree ?? null;
  }

  /** Index of the voice playing a tree, or -1. */
  voiceOf(id: number): number {
    return this.voices.findIndex((v) => v.tree?.id === id);
  }

  /**
   * A click on a tree. The first click pins it, so it plays even if it
   * was already playing because it is near. A click on the pinned tree stops
   * it, and it stays silent until it leaves hearing range.
   */
  toggle(id: number): void {
    if (this.pinnedId === id) {
      this.pinnedId = null;
      this.silenced.add(id);
    } else {
      this.silenced.delete(id);
      this.pinnedId = id;
    }
  }

  tick(input: TickInput<T>): Action<T>[] {
    const { now, candidates, status } = input;
    const o = this.opts;
    const actions: Action<T>[] = [];

    if (input.speed < o.settleSpeed) this.settledSince ??= now;
    else this.settledSince = null;
    const mayFetch = this.settledSince !== null && now - this.settledSince >= o.dwellSeconds;

    const present = new Set(candidates.map((c) => c.id));
    for (const id of this.silenced) if (!present.has(id)) this.silenced.delete(id);
    if (this.pinnedId !== null && !present.has(this.pinnedId)) this.pinnedId = null;

    // Nearest first. Playing trees get a bonus so equal distances do not
    // swap voices back and forth; the pinned tree always comes first.
    // Status and rank are computed once per candidate: this runs over every
    // tree in hearing range, and the per-frame budget leaves no room for more.
    const sorted: Ranked<T>[] = [];
    for (const c of candidates) {
      if (this.silenced.has(c.id)) continue;
      const clip = status(c.id);
      if (clip === 'failed') continue;
      const playing = this.voiceOf(c.id) >= 0;
      const rank = c.id === this.pinnedId ? -Infinity : c.distance - (playing ? o.hysteresis : 0);
      sorted.push({ tree: c, clip, playing, rank });
    }
    sorted.sort((a, b) => a.rank - b.rank || a.tree.id - b.tree.id);

    // Loads: the nearest pool-size trees, once the player has stood still
    // long enough. The pinned tree loads at once.
    for (const r of sorted.slice(0, o.voices)) {
      if (r.clip === 'none' && (mayFetch || r.tree.id === this.pinnedId)) actions.push({ type: 'load', tree: r.tree });
    }

    // Wanted: the nearest ready trees, at most one per voice.
    const wanted: T[] = [];
    for (const r of sorted) {
      if (wanted.length === o.voices) break;
      if (r.clip === 'ready' || r.playing) wanted.push(r.tree);
    }
    const wantedIds = new Set(wanted.map((c) => c.id));

    this.voices.forEach((v, i) => {
      if (v.tree !== null && !wantedIds.has(v.tree.id)) {
        v.tree = null;
        v.fadeEnd = now + o.fadeSeconds;
        actions.push({ type: 'release', voice: i });
      }
    });
    for (const c of wanted) {
      if (this.voiceOf(c.id) >= 0) continue;
      const free = this.voices.findIndex((v) => v.tree === null && v.fadeEnd <= now);
      if (free < 0) break;
      const v = this.voices[free];
      if (v === undefined) break;
      v.tree = c;
      v.fadeEnd = Infinity;
      actions.push({ type: 'start', voice: free, tree: c });
    }
    return actions;
  }

  /** Called when a voice could not start (no buffer after all): frees it at once. */
  abort(voice: number): void {
    const v = this.voices[voice];
    if (v === undefined) return;
    v.tree = null;
    v.fadeEnd = 0;
  }
}
