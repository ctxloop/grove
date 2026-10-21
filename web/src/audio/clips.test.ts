import { describe, expect, it, vi } from 'vitest';
import { ClipCache, clipCapacity, type FetchLike } from './clips';
import { config } from '../config';

function buf(tag: string): AudioBuffer {
  return { tag } as unknown as AudioBuffer;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function okResponse(): Awaited<ReturnType<FetchLike>> {
  return { ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) };
}

/** Fetch that resolves immediately with a 4-byte body. */
function setup(opts: { capacity?: number; fetchImpl?: FetchLike; decode?: () => Promise<AudioBuffer> } = {}) {
  const fetchFn = vi.fn<FetchLike>(opts.fetchImpl ?? (() => Promise.resolve(okResponse())));
  let n = 0;
  const decodeAudioData = vi.fn(opts.decode ?? (() => Promise.resolve(buf(`b${++n}`))));
  const clips = new ClipCache({ decodeAudioData } as unknown as BaseAudioContext, fetchFn, opts.capacity ?? 4);
  return { clips, fetchFn, decodeAudioData };
}

/** Fetch that stays pending until the test settles it; rejects with AbortError when aborted. */
function pendingFetch() {
  const d = deferred<Awaited<ReturnType<FetchLike>>>();
  const signals: AbortSignal[] = [];
  const impl: FetchLike = (_url, init) => {
    const signal = init?.signal;
    if (signal) {
      signals.push(signal);
      signal.addEventListener('abort', () => d.reject(new DOMException('aborted', 'AbortError')), { once: true });
    }
    return d.promise;
  };
  return { d, signals, impl };
}

describe('clipCapacity', () => {
  it('uses the mobile and desktop config values', () => {
    expect(clipCapacity(true)).toBe(config.audio.cacheClipsMobile);
    expect(clipCapacity(false)).toBe(config.audio.cacheClipsDesktop);
    expect(config.audio.cacheClipsMobile).toBeLessThan(config.audio.cacheClipsDesktop);
  });
});

describe('ClipCache', () => {
  it('fetches and decodes a clip', async () => {
    const { clips, fetchFn, decodeAudioData } = setup();
    const b = await clips.load('/a.m4a');
    expect(b).toEqual(buf('b1'));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]?.[0]).toBe('/a.m4a');
    expect(decodeAudioData).toHaveBeenCalledTimes(1);
  });

  it('serves a cache hit without fetching again', async () => {
    const { clips, fetchFn } = setup();
    const first = await clips.load('/a.m4a');
    const second = await clips.load('/a.m4a');
    expect(second).toBe(first);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(clips.peek('/a.m4a')).toBe(first);
  });

  it('dedupes concurrent loads of the same url', async () => {
    const { clips, fetchFn, decodeAudioData } = setup();
    const [a, b] = await Promise.all([clips.load('/a.m4a'), clips.load('/a.m4a')]);
    expect(a).toBe(b);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(decodeAudioData).toHaveBeenCalledTimes(1);
  });

  it('evicts the least recently used clip beyond capacity', async () => {
    const { clips, fetchFn } = setup({ capacity: 2 });
    await clips.load('/a');
    await clips.load('/b');
    await clips.load('/a');
    await clips.load('/c');
    expect(clips.peek('/a')).toBeDefined();
    expect(clips.peek('/b')).toBeUndefined();
    await clips.load('/b');
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('remembers an HTTP failure and rejects immediately next time', async () => {
    const { clips, fetchFn } = setup({ fetchImpl: () => Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.reject(new Error('no')) }) });
    await expect(clips.load('/a')).rejects.toThrow('404');
    expect(clips.isFailed('/a')).toBe(true);
    await expect(clips.load('/a')).rejects.toThrow(/failed earlier/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(clips.isFailed('/other')).toBe(false);
  });

  it('remembers a network failure', async () => {
    const { clips, fetchFn } = setup({ fetchImpl: () => Promise.reject(new TypeError('network')) });
    await expect(clips.load('/a')).rejects.toThrow('network');
    expect(clips.isFailed('/a')).toBe(true);
    await expect(clips.load('/a')).rejects.toThrow(/failed earlier/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('remembers a decode failure', async () => {
    const { clips, fetchFn, decodeAudioData } = setup({ decode: () => Promise.reject(new Error('bad data')) });
    await expect(clips.load('/a')).rejects.toThrow('bad data');
    expect(clips.isFailed('/a')).toBe(true);
    await expect(clips.load('/a')).rejects.toThrow(/failed earlier/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(decodeAudioData).toHaveBeenCalledTimes(1);
  });

  it('rejects all concurrent callers when the shared load fails', async () => {
    const { clips, fetchFn } = setup({ fetchImpl: () => Promise.reject(new TypeError('network')) });
    const results = await Promise.allSettled([clips.load('/a'), clips.load('/a')]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('rejects at once for an already aborted signal without fetching', async () => {
    const { clips, fetchFn } = setup();
    const ac = new AbortController();
    ac.abort();
    await expect(clips.load('/a', ac.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('aborting the only caller cancels the fetch and is not remembered as a failure', async () => {
    const p = pendingFetch();
    const { clips, fetchFn } = setup({ fetchImpl: p.impl });
    const ac = new AbortController();
    const load = clips.load('/a', ac.signal);
    ac.abort();
    await expect(load).rejects.toMatchObject({ name: 'AbortError' });
    expect(p.signals[0]?.aborted).toBe(true);
    expect(clips.isFailed('/a')).toBe(false);

    // A later load starts a fresh fetch.
    fetchFn.mockImplementation(() => Promise.resolve(okResponse()));
    await expect(clips.load('/a')).resolves.toBeDefined();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('keeps the fetch alive while another caller still waits', async () => {
    const p = pendingFetch();
    const { clips, fetchFn } = setup({ fetchImpl: p.impl });
    const ac = new AbortController();
    const aborted = clips.load('/a', ac.signal);
    const kept = clips.load('/a');
    ac.abort();
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
    expect(p.signals[0]?.aborted).toBe(false);
    p.d.resolve(okResponse());
    await expect(kept).resolves.toBeDefined();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(clips.peek('/a')).toBeDefined();
  });

  it('does not cache a clip whose load was aborted while decoding', async () => {
    const dec = deferred<AudioBuffer>();
    const { clips, decodeAudioData } = setup({ decode: () => dec.promise });
    const ac = new AbortController();
    const load = clips.load('/a', ac.signal);
    await vi.waitFor(() => expect(decodeAudioData).toHaveBeenCalled());
    ac.abort();
    dec.resolve(buf('late'));
    await expect(load).rejects.toMatchObject({ name: 'AbortError' });
    await new Promise((r) => setTimeout(r, 0));
    expect(clips.peek('/a')).toBeUndefined();
    expect(clips.isFailed('/a')).toBe(false);
  });
});
