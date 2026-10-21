/** Least-recently-used cache. Map iteration order is insertion order, so the first key is the oldest. */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  constructor(
    private readonly capacity: number,
    private readonly onEvict?: (key: K, value: V) => void,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('LruCache capacity must be an integer >= 1');
  }

  get size(): number {
    return this.map.size;
  }

  /** Returns the value and marks it as most recently used. */
  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key) as V;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  /** Returns the value without changing the order. */
  peek(key: K): V | undefined {
    return this.map.get(key);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  /** Inserts or replaces a value as most recently used, then evicts the oldest entries beyond capacity. */
  set(key: K, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.capacity) {
      const oldest = this.map.entries().next();
      if (oldest.done) return;
      const [k, v] = oldest.value;
      this.map.delete(k);
      this.onEvict?.(k, v);
    }
  }

  /** Removes an entry without calling onEvict. */
  delete(key: K): boolean {
    return this.map.delete(key);
  }

  /** Removes every entry without calling onEvict. */
  clear(): void {
    this.map.clear();
  }
}
