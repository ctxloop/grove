import { describe, expect, it } from 'vitest';
import worldFixture from '../../../contract/fixtures/world.json';
import biomeFixture from '../../../contract/fixtures/biome.json';
import { ChunkLoader, loadWorld } from './loader';
import { SCHEMA_VERSION, SchemaError, type Biome, type Tree } from './schema';
import { makeBiome, makeTree, makeWorld } from './test-util';

interface Pending {
  url: string;
  resolve: (res: Response) => void;
  reject: (err: unknown) => void;
}

/** Fake fetch whose requests stay pending until the test answers them. */
function fakeFetch() {
  const calls: Pending[] = [];
  const fetchFn = ((input: string) =>
    new Promise<Response>((resolve, reject) => {
      calls.push({ url: input, resolve, reject });
    })) as unknown as typeof fetch;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  return { fetchFn, calls, json };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const biomeBody = (id: number, n = 2) => ({ schema: SCHEMA_VERSION, biome: id, trees: Array.from({ length: n }, (_, i) => makeTree(i, i, i)) });

// Biomes at x = 0, 100, 200, 300 with radius 20: edges are 80 apart.
const world = makeWorld([makeBiome(3, 0, 0, 20), makeBiome(1, 100, 0, 20), makeBiome(8, 200, 0, 20), makeBiome(4, 300, 0, 20)]);

describe('loadWorld', () => {
  it('fetches world.json under the base and validates it', async () => {
    const { fetchFn, calls, json } = fakeFetch();
    const p = loadWorld(fetchFn, '/data/');
    expect(calls.map((c) => c.url)).toEqual(['/data/world.json']);
    calls[0]?.resolve(json(worldFixture));
    expect(await p).toEqual(worldFixture);
  });

  it('rejects on HTTP errors and invalid data', async () => {
    const a = fakeFetch();
    const p1 = loadWorld(a.fetchFn, '/d/');
    a.calls[0]?.resolve(a.json({}, 404));
    await expect(p1).rejects.toThrow(/404/);

    const b = fakeFetch();
    const p2 = loadWorld(b.fetchFn, '/d/');
    b.calls[0]?.resolve(b.json({ schema: 1 }));
    await expect(p2).rejects.toThrow(SchemaError);
  });
});

describe('ChunkLoader', () => {
  it('loads biomes within the prefetch distance, nearest first', async () => {
    const { fetchFn, calls } = fakeFetch();
    const loader = new ChunkLoader(world, fetchFn, '/d/');
    // From x=60: edges are 40 (biome 3), 20 (biome 1), 120 (biome 8). Within 120: 1, 3, 8.
    loader.update(60, 0);
    expect(calls.map((c) => c.url)).toEqual(['/d/biome-1.json', '/d/biome-3.json', '/d/biome-8.json']);
  });

  it('does not start a biome that is already in flight or loaded', async () => {
    const { fetchFn, calls, json } = fakeFetch();
    const loader = new ChunkLoader(world, fetchFn, '/d/');
    loader.update(0, 0);
    loader.update(1, 1);
    expect(calls).toHaveLength(2); // biomes 3 and 1
    calls[0]?.resolve(json(biomeBody(3)));
    await tick();
    loader.update(0, 0);
    expect(calls).toHaveLength(2);
    expect(loader.isLoaded(3)).toBe(true);
    expect(loader.isLoaded(1)).toBe(false);
  });

  it('stores trees and notifies onLoaded listeners until unsubscribed', async () => {
    const { fetchFn, calls, json } = fakeFetch();
    const loader = new ChunkLoader(world, fetchFn, '/d/');
    const seen: [number, number][] = [];
    const off = loader.onLoaded((b, trees) => seen.push([b.id, trees.length]));
    loader.update(0, 0);
    calls[0]?.resolve(json(biomeBody(3, 4)));
    await tick();
    expect(seen).toEqual([[3, 4]]);
    expect(loader.trees(3)).toHaveLength(4);
    expect(loader.trees(1)).toBeUndefined();
    off();
    calls[1]?.resolve(json(biomeBody(1)));
    await tick();
    expect(seen).toHaveLength(1);
    expect(loader.isLoaded(1)).toBe(true);
  });

  it('reports a failed fetch, does not retry on update, and retries on request', async () => {
    const { fetchFn, calls, json } = fakeFetch();
    const loader = new ChunkLoader(world, fetchFn, '/d/');
    const errors: [number, unknown][] = [];
    loader.onError((b, e) => errors.push([b.id, e]));
    loader.update(300, 0);
    expect(calls.map((c) => c.url)).toEqual(['/d/biome-4.json', '/d/biome-8.json']);
    calls[0]?.resolve(json({}, 500));
    calls[1]?.reject(new TypeError('network down'));
    await tick();
    expect(errors.map(([id]) => id)).toEqual([4, 8]);
    expect(String(errors[0]?.[1])).toMatch(/500/);
    expect(errors[1]?.[1]).toBeInstanceOf(TypeError);
    expect(loader.isLoaded(4)).toBe(false);

    loader.update(300, 0);
    expect(calls).toHaveLength(2);

    loader.retry(4);
    expect(calls).toHaveLength(3);
    expect(calls[2]?.url).toBe('/d/biome-4.json');
    loader.retry(4); // already in flight
    loader.retry(1); // never failed
    loader.retry(99); // unknown
    expect(calls).toHaveLength(3);
    calls[2]?.resolve(json(biomeBody(4)));
    await tick();
    expect(loader.isLoaded(4)).toBe(true);
    expect(errors).toHaveLength(2);
  });

  it('request loads one far biome, once, and tries a failed one again', async () => {
    const { fetchFn, calls, json } = fakeFetch();
    const loader = new ChunkLoader(world, fetchFn, '/d/');
    loader.request(4);
    loader.request(4); // in flight
    loader.request(99); // unknown
    expect(calls.map((c) => c.url)).toEqual(['/d/biome-4.json']);
    calls[0]?.reject(new TypeError('network down'));
    await tick();
    expect(loader.isLoaded(4)).toBe(false);

    loader.request(4);
    expect(calls).toHaveLength(2);
    calls[1]?.resolve(json(biomeBody(4)));
    await tick();
    expect(loader.isLoaded(4)).toBe(true);
    loader.request(4); // loaded
    expect(calls).toHaveLength(2);
  });

  it('rejects a file whose biome id differs from the requested one', async () => {
    const { fetchFn, calls, json } = fakeFetch();
    const loader = new ChunkLoader(world, fetchFn, '/d/');
    const errors: [Biome, unknown][] = [];
    loader.onError((b, e) => errors.push([b, e]));
    loader.update(0, 0);
    calls[0]?.resolve(json(biomeBody(1)));
    await tick();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.[0].id).toBe(3);
    expect(String(errors[0]?.[1])).toMatch(/biome 1, expected 3/);
    expect(loader.isLoaded(3)).toBe(false);
    expect(loader.trees(3)).toBeUndefined();
  });

  it('reports schema errors via onError', async () => {
    const { fetchFn, calls, json } = fakeFetch();
    const loader = new ChunkLoader(world, fetchFn, '/d/');
    const errors: unknown[] = [];
    loader.onError((_b, e) => errors.push(e));
    loader.update(0, 0);
    calls[0]?.resolve(json({ ...biomeBody(3), schema: SCHEMA_VERSION + 1 }));
    await tick();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(SchemaError);
    expect(loader.isLoaded(3)).toBe(false);
  });

  it('keeps loading other biomes when one fails', async () => {
    const { fetchFn, calls, json } = fakeFetch();
    const loader = new ChunkLoader(world, fetchFn, '/d/');
    loader.update(0, 0);
    calls[0]?.resolve(json({}, 500));
    calls[1]?.resolve(json(biomeBody(1)));
    await tick();
    expect(loader.isLoaded(1)).toBe(true);
    expect(loader.isLoaded(3)).toBe(false);
  });

  it('loads the contract fixture world', async () => {
    const { fetchFn, calls, json } = fakeFetch();
    const fixtureWorld = await (async () => {
      const p = loadWorld(fetchFn, '/d/');
      calls[0]?.resolve(json(worldFixture));
      return p;
    })();
    const loader = new ChunkLoader(fixtureWorld, fetchFn, '/d/');
    const got: Tree[][] = [];
    loader.onLoaded((_b, trees) => got.push([...trees]));
    loader.update(-40.5, 3.25);
    const url = calls[1]?.url;
    expect(url).toBe('/d/biome-15.json');
    calls[1]?.resolve(json(biomeFixture));
    await tick();
    expect(got[0]).toHaveLength(biomeFixture.trees.length);
  });
});
