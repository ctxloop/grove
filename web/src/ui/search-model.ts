// Pure logic of the search UI: highlight movement and stale-result guard.

/** Moves the highlight by `delta` rows with wrap-around. Returns -1 for an empty list. */
export function moveHighlight(current: number, delta: number, count: number): number {
  if (count <= 0) return -1;
  const from = current < 0 || current >= count ? (delta >= 0 ? -1 : 0) : current;
  return (((from + delta) % count) + count) % count;
}

/** Hands out request tokens; only the newest token is current. */
export function createLatest(): { next(): number; isCurrent(token: number): boolean } {
  let latest = 0;
  return {
    next: () => ++latest,
    isCurrent: (token) => token === latest,
  };
}
