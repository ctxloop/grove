import { config } from '../config';
import { LruCache } from './lru';

/** Decoded-clip capacity for the device class (docs/architecture.md §5). */
export function clipCapacity(isMobile: boolean): number {
  return isMobile ? config.audio.cacheClipsMobile : config.audio.cacheClipsDesktop;
}

/** The parts of `fetch` and `BaseAudioContext` that ClipCache uses; the real ones are assignable. */
export type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal },
) => Promise<Pick<Response, 'ok' | 'status' | 'arrayBuffer'>>;
type Decoder = Pick<BaseAudioContext, 'decodeAudioData'>;

interface Inflight {
  readonly promise: Promise<AudioBuffer>;
  readonly controller: AbortController;
  waiters: number;
}

function abortError(): Error {
  return new DOMException('Clip load aborted', 'AbortError');
}

/**
 * Loads and decodes clips. Concurrent loads of one URL share a single fetch, decoded buffers are
 * kept in an LRU, and a URL that failed to fetch or decode is never retried in this session
 * (docs/architecture.md §7). Aborting is not a failure: the fetch is cancelled only when every
 * caller waiting for it has aborted, and nothing is remembered.
 */
export class ClipCache {
  private readonly cache: LruCache<string, AudioBuffer>;
  private readonly inflight = new Map<string, Inflight>();
  private readonly failed = new Set<string>();

  constructor(
    private readonly ctx: Decoder,
    private readonly fetchFn: FetchLike,
    capacity: number,
  ) {
    this.cache = new LruCache(capacity);
  }

  isFailed(url: string): boolean {
    return this.failed.has(url);
  }

  /** Returns a decoded clip if it is cached, without marking it as recently used. */
  peek(url: string): AudioBuffer | undefined {
    return this.cache.peek(url);
  }

  load(url: string, signal?: AbortSignal): Promise<AudioBuffer> {
    if (signal?.aborted) return Promise.reject(abortError());
    if (this.failed.has(url)) return Promise.reject(new Error(`Clip failed earlier in this session: ${url}`));
    const hit = this.cache.get(url);
    if (hit !== undefined) return Promise.resolve(hit);

    const shared = this.inflight.get(url) ?? this.start(url);
    shared.waiters++;

    return new Promise<AudioBuffer>((resolve, reject) => {
      const onAbort = () => {
        shared.waiters--;
        if (shared.waiters === 0) {
          shared.controller.abort();
          if (this.inflight.get(url) === shared) this.inflight.delete(url);
        }
        reject(abortError());
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      shared.promise.then(
        (buffer) => {
          signal?.removeEventListener('abort', onAbort);
          resolve(buffer);
        },
        (err: unknown) => {
          signal?.removeEventListener('abort', onAbort);
          reject(err);
        },
      );
    });
  }

  private start(url: string): Inflight {
    const controller = new AbortController();
    const entry: Inflight = { promise: this.fetchAndDecode(url, controller.signal), controller, waiters: 0 };
    this.inflight.set(url, entry);
    const done = () => {
      if (this.inflight.get(url) === entry) this.inflight.delete(url);
    };
    entry.promise.then(done, done);
    return entry;
  }

  private async fetchAndDecode(url: string, signal: AbortSignal): Promise<AudioBuffer> {
    try {
      const res = await this.fetchFn(url, { signal });
      if (!res.ok) throw new Error(`Clip fetch failed: ${res.status} ${url}`);
      const bytes = await res.arrayBuffer();
      const buffer = await this.ctx.decodeAudioData(bytes);
      if (signal.aborted) throw abortError();
      this.cache.set(url, buffer);
      return buffer;
    } catch (err) {
      if (!signal.aborted) this.failed.add(url);
      throw err;
    }
  }
}
