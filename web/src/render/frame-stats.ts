/** Fixed-size window of the most recent frame times, in milliseconds. */
export class FrameStats {
  private readonly values: Float64Array;
  /** Reused by `percentile`; unused slots are filled with Infinity so they sort last. */
  private readonly scratch: Float64Array;
  private next = 0;
  private size = 0;
  private sum = 0;

  constructor(private readonly capacity: number) {
    this.values = new Float64Array(capacity);
    this.scratch = new Float64Array(capacity);
  }

  get count(): number {
    return this.size;
  }

  add(ms: number): void {
    if (this.size === this.capacity) this.sum -= this.values[this.next] ?? 0;
    else this.size++;
    this.values[this.next] = ms;
    this.sum += ms;
    this.next = (this.next + 1) % this.capacity;
  }

  /** 0 when empty. */
  mean(): number {
    return this.size === 0 ? 0 : this.sum / this.size;
  }

  /** Nearest-rank percentile (`p` in 0..100) of the current window; 0 when empty. */
  percentile(p: number): number {
    const n = this.size;
    if (n === 0) return 0;
    this.scratch.set(this.values);
    this.scratch.fill(Infinity, n);
    this.scratch.sort();
    const rank = Math.min(n, Math.max(1, Math.ceil((p / 100) * n)));
    return this.scratch[rank - 1] ?? 0;
  }

  max(): number {
    let m = 0;
    for (let i = 0; i < this.size; i++) m = Math.max(m, this.values[i] ?? 0);
    return m;
  }

  reset(): void {
    this.next = 0;
    this.size = 0;
    this.sum = 0;
  }
}
