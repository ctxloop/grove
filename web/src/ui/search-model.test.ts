import { describe, expect, it } from 'vitest';
import { createLatest, moveHighlight } from './search-model';

describe('moveHighlight', () => {
  it('moves down and up', () => {
    expect(moveHighlight(0, 1, 5)).toBe(1);
    expect(moveHighlight(3, -1, 5)).toBe(2);
  });

  it('wraps at both ends', () => {
    expect(moveHighlight(4, 1, 5)).toBe(0);
    expect(moveHighlight(0, -1, 5)).toBe(4);
  });

  it('returns -1 for an empty list', () => {
    expect(moveHighlight(0, 1, 0)).toBe(-1);
    expect(moveHighlight(-1, -1, 0)).toBe(-1);
  });

  it('starts at the first row going down and the last going up from no highlight', () => {
    expect(moveHighlight(-1, 1, 3)).toBe(0);
    expect(moveHighlight(-1, -1, 3)).toBe(2);
  });

  it('stays on the only row', () => {
    expect(moveHighlight(0, 1, 1)).toBe(0);
    expect(moveHighlight(0, -1, 1)).toBe(0);
  });

  it('recovers from an out-of-range highlight', () => {
    expect(moveHighlight(9, 1, 3)).toBe(0);
  });
});

describe('createLatest', () => {
  it('only the newest token is current', () => {
    const latest = createLatest();
    const a = latest.next();
    expect(latest.isCurrent(a)).toBe(true);
    const b = latest.next();
    expect(latest.isCurrent(a)).toBe(false);
    expect(latest.isCurrent(b)).toBe(true);
  });
});
