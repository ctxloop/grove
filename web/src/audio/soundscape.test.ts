import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { Soundscape, type Clips, type Heard } from './soundscape';
import type { Point, VoiceSink } from './voices';

const opts = { voices: 2, dwellSeconds: 1, settleSpeed: 0.6, fadeSeconds: 0.5, hysteresis: 1.5, actionsPerFrame: Infinity };
const url = (id: number) => `/audio/${id}.m4a`;
const buffer = {} as AudioBuffer;

function heard(...distances: number[]): Heard[] {
  return distances.map((d, i) => ({ id: i + 1, biome: 1, index: i, distance: d, x: d, y: 2, z: 0 }));
}

/** Clip cache stand-in: loads stay pending until resolve() or reject(). */
class FakeClips implements Clips {
  readonly cached = new Map<string, AudioBuffer>();
  readonly failed = new Set<string>();
  readonly pending = new Map<string, { resolve: () => void; reject: () => void; signal: AbortSignal | undefined }>();

  peek(u: string): AudioBuffer | undefined {
    return this.cached.get(u);
  }
  isFailed(u: string): boolean {
    return this.failed.has(u);
  }
  load(u: string, signal?: AbortSignal): Promise<AudioBuffer> {
    return new Promise((resolve, reject) => {
      this.pending.set(u, {
        resolve: () => {
          this.cached.set(u, buffer);
          resolve(buffer);
        },
        reject: () => {
          this.failed.add(u);
          reject(new Error('failed'));
        },
        signal,
      });
    });
  }
}

class FakeSink implements VoiceSink {
  readonly started: { voice: number; at: Point }[] = [];
  readonly released: number[] = [];
  readonly on = new Set<number>();
  readonly gains = new Map<number, number>();
  readonly value = new Float32Array([0.5, 0.25, 0.125]);
  start(voice: number, _b: AudioBuffer, at: Point, focus: number): void {
    this.started.push({ voice, at });
    this.on.add(voice);
    this.gains.set(voice, focus);
  }
  focus(voice: number, gain: number): void {
    if (this.on.has(voice)) this.gains.set(voice, gain);
  }
  release(voice: number): void {
    this.released.push(voice);
  }
  sounding(voice: number): boolean {
    return this.on.has(voice);
  }
  levels(voice: number): Float32Array {
    return this.on.has(voice) ? this.value : new Float32Array(3);
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Soundscape', () => {
  it('loads after the dwell, then starts the voice at the tree position', async () => {
    const clips = new FakeClips();
    const sink = new FakeSink();
    const s = new Soundscape(clips, sink, url, opts);
    s.tick(0, 0, heard(3));
    expect(clips.pending.size).toBe(0);
    s.tick(1, 0, heard(3));
    expect([...clips.pending.keys()]).toEqual(['/audio/1.m4a']);
    expect(s.state(1)).toBe('loading');
    clips.pending.get('/audio/1.m4a')?.resolve();
    await flush();
    s.tick(1.2, 0, heard(3));
    expect(sink.started).toEqual([{ voice: 0, at: { id: 1, biome: 1, index: 0, distance: 3, x: 3, y: 2, z: 0 } }]);
    expect(s.state(1)).toBe('playing');
  });

  it('aborts a load when its tree leaves hearing range', () => {
    const clips = new FakeClips();
    const s = new Soundscape(clips, new FakeSink(), url, opts);
    s.tick(0, 0, heard(3));
    s.tick(1, 0, heard(3));
    const signal = clips.pending.get('/audio/1.m4a')?.signal;
    expect(signal?.aborted).toBe(false);
    s.tick(1.2, 3, []);
    expect(signal?.aborted).toBe(true);
    expect(s.state(1)).toBe('idle');
  });

  it('reports a failed clip as an error and does not retry it', async () => {
    const clips = new FakeClips();
    const s = new Soundscape(clips, new FakeSink(), url, opts);
    s.tick(0, 0, heard(3));
    s.tick(1, 0, heard(3));
    clips.pending.get('/audio/1.m4a')?.reject();
    await flush();
    clips.pending.clear();
    s.tick(1.2, 0, heard(3));
    expect(clips.pending.size).toBe(0);
    expect(s.state(1)).toBe('error');
  });

  it('a pinned tree reports loading before its first tick', () => {
    const s = new Soundscape(new FakeClips(), new FakeSink(), url, opts);
    s.toggle(7);
    expect(s.pinned).toBe(7);
    expect(s.state(7)).toBe('loading');
  });

  it('lights playing trees and darkens them after the fade', () => {
    const clips = new FakeClips();
    clips.cached.set(url(1), buffer);
    const sink = new FakeSink();
    const s = new Soundscape(clips, sink, url, opts);
    const lights: [number, number, number, number][] = [];
    const light = (t: Heard, l: number, m: number, h: number) => lights.push([t.id, l, m, h]);

    s.tick(0, 0, heard(3));
    s.frame(1 / 60, light);
    expect(lights).toEqual([[1, 0.5, 0.25, 0.125]]);

    lights.length = 0;
    s.tick(0.2, 0, []);
    expect(sink.released).toEqual([0]);
    s.frame(1 / 60, light);
    expect(lights).toEqual([[1, 0.5, 0.25, 0.125]]); // still fading out
    sink.on.delete(0);
    lights.length = 0;
    s.frame(1 / 60, light);
    s.frame(1 / 60, light);
    expect(lights).toEqual([[1, 0, 0, 0]]);
  });

  it('a voice taken over by another tree darkens the old one', () => {
    const clips = new FakeClips();
    clips.cached.set(url(1), buffer);
    clips.cached.set(url(2), buffer);
    const sink = new FakeSink();
    const s = new Soundscape(clips, sink, url, { ...opts, voices: 1 });
    const lights: number[][] = [];
    s.tick(0, 0, heard(3));
    s.tick(0.2, 0, [{ ...heard(3, 1)[1]! }]);
    s.tick(0.8, 0, [{ ...heard(3, 1)[1]! }]);
    expect(sink.started.map((x) => x.voice)).toEqual([0, 0]);
    s.frame(1 / 60, (t, l, m, h) => lights.push([t.id, l, m, h]));
    expect(lights).toEqual([
      [1, 0, 0, 0],
      [2, 0.5, 0.25, 0.125],
    ]);
  });

  it('asks for an early tick after a click and after a finished load', async () => {
    const clips = new FakeClips();
    const s = new Soundscape(clips, new FakeSink(), url, opts);
    expect(s.due).toBe(false);
    s.toggle(1);
    expect(s.due).toBe(true);
    s.tick(0, 0, heard(3));
    expect(s.due).toBe(false);
    clips.pending.get('/audio/1.m4a')?.resolve();
    await flush();
    expect(s.due).toBe(true);
  });

  it('asks for no early tick when an abandoned load finishes', async () => {
    const clips = new FakeClips();
    const s = new Soundscape(clips, new FakeSink(), url, opts);
    s.toggle(1);
    s.tick(0, 0, heard(3));
    s.tick(0.2, 0, []);
    clips.pending.get('/audio/1.m4a')?.resolve();
    await flush();
    expect(s.due).toBe(false);
  });

  it('carries out at most actionsPerFrame actions per frame, in order', () => {
    const clips = new FakeClips();
    for (const id of [1, 2, 3]) clips.cached.set(url(id), buffer);
    const sink = new FakeSink();
    const s = new Soundscape(clips, sink, url, { ...opts, voices: 3, actionsPerFrame: 1 });
    const none = () => undefined;
    s.tick(0, 0, heard(3, 4, 5));
    expect(sink.started.map((x) => x.voice)).toEqual([0]);
    s.frame(1 / 60, none); // the tick already used this frame's action
    expect(sink.started.map((x) => x.voice)).toEqual([0]);
    s.frame(1 / 60, none);
    expect(sink.started.map((x) => x.voice)).toEqual([0, 1]);
    expect(s.state(3)).toBe('playing'); // the scheduler has assigned it; the voice starts next frame
    s.frame(1 / 60, none);
    expect(sink.started.map((x) => x.at.x)).toEqual([3, 4, 5]);
  });

  it('a tick first carries out what the last tick left, and releases at once', () => {
    const clips = new FakeClips();
    for (const id of [1, 2]) clips.cached.set(url(id), buffer);
    const sink = new FakeSink();
    const s = new Soundscape(clips, sink, url, { ...opts, actionsPerFrame: 1 });
    s.tick(0, 0, heard(3, 4));
    s.frame(1 / 60, () => undefined);
    expect(sink.started.map((x) => x.voice)).toEqual([0]);
    s.tick(0.2, 0, []);
    expect(sink.started.map((x) => x.voice)).toEqual([0, 1]);
    // The scheduler frees a voice fadeSeconds after the release, so the fade-out starts now.
    expect(sink.released).toEqual([0, 1]);
  });

  it('ducks the other voices while standing at a tree, and keeps a fading voice where it was', () => {
    const clips = new FakeClips();
    for (const id of [1, 2]) clips.cached.set(url(id), buffer);
    const sink = new FakeSink();
    const s = new Soundscape(clips, sink, url, opts);
    const duck = 10 ** (-config.audio.focusDuckDb / 20);
    s.tick(0, 0, heard(1.5, 6));
    expect(sink.gains.get(0)).toBe(1);
    expect(sink.gains.get(1)).toBeCloseTo(duck);
    s.tick(0.2, 0, heard(5, 6));
    expect([sink.gains.get(0), sink.gains.get(1)]).toEqual([1, 1]);
    s.tick(0.4, 0, heard(1.5, 6));
    s.tick(0.6, 0, []);
    expect(sink.released).toEqual([0, 1]);
    expect(sink.gains.get(1)).toBeCloseTo(duck);
  });
});
