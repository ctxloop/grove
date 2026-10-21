import { config } from '../config';
import { biomesWithin } from './biomes';
import { parseBiomeFile, parseWorld, type Biome, type Tree, type World } from './schema';

async function fetchJson(fetchFn: typeof fetch, url: string): Promise<unknown> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

export async function loadWorld(fetchFn: typeof fetch, base: string = config.world.dataBase): Promise<World> {
  return parseWorld(await fetchJson(fetchFn, `${base}world.json`));
}

/**
 * Loads biome files as the player gets close. Biomes are never unloaded. A
 * failed biome stays failed until `retry` is called.
 */
export class ChunkLoader {
  private readonly loaded = new Map<number, readonly Tree[]>();
  private readonly inFlight = new Set<number>();
  private readonly failed = new Set<number>();
  private readonly loadedListeners = new Set<(biome: Biome, trees: readonly Tree[]) => void>();
  private readonly errorListeners = new Set<(biome: Biome, error: unknown) => void>();

  constructor(
    private readonly world: World,
    private readonly fetchFn: typeof fetch,
    private readonly base: string = config.world.dataBase,
  ) {}

  /** Starts loading every biome within the prefetch distance of (x, z), nearest first. */
  update(x: number, z: number): void {
    for (const biome of biomesWithin(this.world, x, z, config.world.prefetchDistance)) {
      const id = biome.id;
      if (this.loaded.has(id) || this.inFlight.has(id) || this.failed.has(id)) continue;
      void this.load(biome);
    }
  }

  /** Starts loading a failed biome again, wherever the player is. */
  retry(biomeId: number): void {
    if (!this.failed.delete(biomeId)) return;
    const biome = this.world.biomes.find((b) => b.id === biomeId);
    if (biome !== undefined) void this.load(biome);
  }

  /** Starts loading one biome wherever the player is, e.g. a teleport target. A failed biome is tried again. */
  request(biomeId: number): void {
    if (this.loaded.has(biomeId) || this.inFlight.has(biomeId)) return;
    const biome = this.world.biomes.find((b) => b.id === biomeId);
    if (biome === undefined) return;
    this.failed.delete(biomeId);
    void this.load(biome);
  }

  isLoaded(id: number): boolean {
    return this.loaded.has(id);
  }

  trees(id: number): readonly Tree[] | undefined {
    return this.loaded.get(id);
  }

  onLoaded(cb: (biome: Biome, trees: readonly Tree[]) => void): () => void {
    this.loadedListeners.add(cb);
    return () => this.loadedListeners.delete(cb);
  }

  onError(cb: (biome: Biome, error: unknown) => void): () => void {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }

  private async load(biome: Biome): Promise<void> {
    this.inFlight.add(biome.id);
    let trees: readonly Tree[];
    try {
      const file = parseBiomeFile(await fetchJson(this.fetchFn, this.base + biome.file));
      if (file.biome !== biome.id) throw new Error(`${biome.file}: contains biome ${file.biome}, expected ${biome.id}`);
      trees = file.trees;
    } catch (error) {
      this.inFlight.delete(biome.id);
      this.failed.add(biome.id);
      for (const cb of [...this.errorListeners]) cb(biome, error);
      return;
    }
    this.inFlight.delete(biome.id);
    this.loaded.set(biome.id, trees);
    for (const cb of [...this.loadedListeners]) cb(biome, trees);
  }
}
