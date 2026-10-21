import { describe, expect, it } from 'vitest';
import { Scheduler, type Action, type Candidate, type ClipStatus } from './scheduler';

const opts = { voices: 6, dwellSeconds: 1, settleSpeed: 0.6, fadeSeconds: 0.5, hysteresis: 1.5 };

function trees(...distances: number[]): Candidate[] {
  return distances.map((d, i) => ({ id: i + 1, biome: 1, index: i, distance: d }));
}

/** A clip cache stand-in: load actions mark clips loading; ready() finishes them. */
class FakeClips {
  readonly state = new Map<number, ClipStatus>();
  status = (id: number): ClipStatus => this.state.get(id) ?? 'none';
  apply(actions: readonly Action[]): void {
    for (const a of actions) if (a.type === 'load') this.state.set(a.tree.id, 'loading');
  }
  ready(...ids: number[]): void {
    for (const id of ids) this.state.set(id, 'ready');
  }
}

const loads = (a: readonly Action[]) => a.filter((x) => x.type === 'load').map((x) => (x.type === 'load' ? x.tree.id : 0));
const starts = (a: readonly Action[]) => a.filter((x) => x.type === 'start').map((x) => (x.type === 'start' ? x.tree.id : 0));
const releases = (a: readonly Action[]) => a.filter((x) => x.type === 'release').length;

describe('Scheduler', () => {
  it('fetches nothing while walking', () => {
    const s = new Scheduler(opts);
    const clips = new FakeClips();
    for (let t = 0; t < 10; t += 0.2) {
      const a = s.tick({ now: t, speed: 4.5, candidates: trees(2, 3, 5), status: clips.status });
      expect(a).toEqual([]);
    }
  });

  it('fetches the nearest trees after standing still for the dwell time', () => {
    const s = new Scheduler(opts);
    const clips = new FakeClips();
    const c = trees(9, 2, 5, 30, 1, 7, 8, 4);
    expect(loads(s.tick({ now: 0, speed: 0.1, candidates: c, status: clips.status }))).toEqual([]);
    expect(loads(s.tick({ now: 0.8, speed: 0.1, candidates: c, status: clips.status }))).toEqual([]);
    const a = s.tick({ now: 1.0, speed: 0.1, candidates: c, status: clips.status });
    // Six nearest, nearest first: ids by distance 1, 2, 4, 5, 7, 8.
    expect(loads(a)).toEqual([5, 2, 8, 3, 6, 7]);
    clips.apply(a);
    expect(loads(s.tick({ now: 1.2, speed: 0.1, candidates: c, status: clips.status }))).toEqual([]);
  });

  it('restarts the dwell when the player moves', () => {
    const s = new Scheduler(opts);
    const clips = new FakeClips();
    const c = trees(2);
    s.tick({ now: 0, speed: 0, candidates: c, status: clips.status });
    s.tick({ now: 0.6, speed: 2, candidates: c, status: clips.status });
    expect(loads(s.tick({ now: 1.2, speed: 0, candidates: c, status: clips.status }))).toEqual([]);
    expect(loads(s.tick({ now: 2.2, speed: 0, candidates: c, status: clips.status }))).toEqual([1]);
  });

  it('starts cached clips even while walking, nearest first', () => {
    const s = new Scheduler(opts);
    const clips = new FakeClips();
    clips.ready(1, 2, 3);
    const a = s.tick({ now: 0, speed: 4.5, candidates: trees(6, 2, 4), status: clips.status });
    expect(starts(a)).toEqual([2, 3, 1]);
    expect(loads(a)).toEqual([]);
  });

  it('never has more than six voices, counting fading ones', () => {
    const s = new Scheduler(opts);
    const clips = new FakeClips();
    const near = trees(1, 2, 3, 4, 5, 6);
    clips.ready(1, 2, 3, 4, 5, 6);
    expect(starts(s.tick({ now: 0, speed: 0, candidates: near, status: clips.status }))).toHaveLength(6);
    expect(s.activeVoices(0)).toBe(6);

    // Six new trees take over: the old voices fade, the new ones wait for free voices.
    const far = near.map((c) => ({ ...c, distance: c.distance + 20 }));
    const fresh = [7, 8, 9, 10, 11, 12].map((id, i) => ({ id, biome: 1, index: id, distance: i + 1 }));
    clips.ready(7, 8, 9, 10, 11, 12);
    const a = s.tick({ now: 1, speed: 0, candidates: [...far, ...fresh], status: clips.status });
    expect(releases(a)).toBe(6);
    expect(starts(a)).toEqual([]);
    expect(s.activeVoices(1)).toBe(6);
    expect(s.activeVoices(1.4)).toBe(6);

    const b = s.tick({ now: 1.6, speed: 0, candidates: [...far, ...fresh], status: clips.status });
    expect(starts(b)).toEqual([7, 8, 9, 10, 11, 12]);
    expect(s.activeVoices(1.6)).toBe(6);
  });

  it('releases trees that leave hearing range', () => {
    const s = new Scheduler(opts);
    const clips = new FakeClips();
    clips.ready(1, 2);
    s.tick({ now: 0, speed: 0, candidates: trees(1, 2), status: clips.status });
    const a = s.tick({ now: 0.2, speed: 0, candidates: trees(1), status: clips.status });
    expect(releases(a)).toBe(1);
    expect(s.voiceOf(2)).toBe(-1);
    expect(s.voiceOf(1)).toBeGreaterThanOrEqual(0);
  });

  it('keeps a playing tree against a slightly closer newcomer (hysteresis)', () => {
    const s = new Scheduler({ ...opts, voices: 1 });
    const clips = new FakeClips();
    clips.ready(1, 2);
    expect(starts(s.tick({ now: 0, speed: 0, candidates: [{ id: 1, biome: 1, index: 0, distance: 5 }], status: clips.status }))).toEqual([1]);
    const both = [
      { id: 1, biome: 1, index: 0, distance: 5 },
      { id: 2, biome: 1, index: 1, distance: 4 },
    ];
    expect(s.tick({ now: 0.2, speed: 0, candidates: both, status: clips.status })).toEqual([]);
    const closer = [both[0]!, { ...both[1]!, distance: 3 }];
    expect(releases(s.tick({ now: 0.4, speed: 0, candidates: closer, status: clips.status }))).toBe(1);
  });

  it('skips failed clips and lets the next tree play', () => {
    const s = new Scheduler({ ...opts, voices: 1 });
    const clips = new FakeClips();
    clips.state.set(1, 'failed');
    clips.ready(2);
    const a = s.tick({ now: 0, speed: 0, candidates: trees(1, 2), status: clips.status });
    expect(starts(a)).toEqual([2]);
  });

  it('pins a clicked tree: it loads without dwelling and plays first', () => {
    const s = new Scheduler({ ...opts, voices: 1 });
    const clips = new FakeClips();
    clips.ready(1);
    s.tick({ now: 0, speed: 3, candidates: trees(1, 9), status: clips.status });
    s.toggle(2);
    const a = s.tick({ now: 0.2, speed: 3, candidates: trees(1, 9), status: clips.status });
    expect(loads(a)).toEqual([2]);
    clips.apply(a);
    clips.ready(2);
    const b = s.tick({ now: 0.4, speed: 3, candidates: trees(1, 9), status: clips.status });
    expect(releases(b)).toBe(1);
    const c = s.tick({ now: 1, speed: 3, candidates: trees(1, 9), status: clips.status });
    expect(starts(c)).toEqual([2]);
  });

  it('a second click stops the tree until it leaves hearing range', () => {
    const s = new Scheduler(opts);
    const clips = new FakeClips();
    clips.ready(1);
    s.tick({ now: 0, speed: 0, candidates: trees(2), status: clips.status });
    expect(s.voiceOf(1)).toBe(0);
    // The tree already plays because it is near: the first click keeps it playing.
    s.toggle(1);
    expect(s.pinned).toBe(1);
    expect(releases(s.tick({ now: 0.1, speed: 0, candidates: trees(2), status: clips.status }))).toBe(0);
    s.toggle(1);
    expect(s.pinned).toBeNull();
    expect(releases(s.tick({ now: 0.2, speed: 0, candidates: trees(2), status: clips.status }))).toBe(1);
    expect(starts(s.tick({ now: 1, speed: 0, candidates: trees(2), status: clips.status }))).toEqual([]);
    s.tick({ now: 1.2, speed: 0, candidates: [], status: clips.status });
    expect(starts(s.tick({ now: 1.4, speed: 0, candidates: trees(2), status: clips.status }))).toEqual([1]);
  });

  it('drops the pin when the tree leaves hearing range', () => {
    const s = new Scheduler(opts);
    const clips = new FakeClips();
    s.toggle(1);
    s.tick({ now: 0, speed: 0, candidates: [], status: clips.status });
    expect(s.pinned).toBeNull();
  });

  it('abort frees a voice immediately', () => {
    const s = new Scheduler({ ...opts, voices: 1 });
    const clips = new FakeClips();
    clips.ready(1, 2);
    s.tick({ now: 0, speed: 0, candidates: trees(1), status: clips.status });
    s.abort(0);
    expect(s.activeVoices(0)).toBe(0);
    expect(starts(s.tick({ now: 0.2, speed: 0, candidates: trees(5, 1), status: clips.status }))).toEqual([2]);
  });
});
