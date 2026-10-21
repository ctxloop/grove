import { describe, expect, it } from 'vitest';
import type { Attribution, Credit } from './schema';
import { fold, SearchIndex } from './search';

function credit(id: number, t: string, a: string, b = 1): Credit {
  return { id, b, t, a, lic: 'by', url: `x/${id}` };
}

function index(...tracks: Credit[]): SearchIndex {
  const attribution: Attribution = { schema: 1, fmaBase: 'https://freemusicarchive.org/music/', licenses: {}, tracks };
  return new SearchIndex(attribution);
}

const ids = (hits: readonly { id: number }[]) => hits.map((h) => h.id);

describe('fold', () => {
  it('lowercases, strips diacritics, and splits on punctuation', () => {
    expect(fold('Café del Mar — São Paulo!')).toEqual(['cafe', 'del', 'mar', 'sao', 'paulo']);
    expect(fold("Rock'n'Roll 2.0")).toEqual(['rock', 'n', 'roll', '2', '0']);
    expect(fold('   ')).toEqual([]);
  });

  it('keeps non-Latin letters', () => {
    // й decomposes to и plus a breve, like any diacritic; queries fold the same way.
    expect(fold('Ангел Мой')).toEqual(['ангел', 'мои']);
    expect(fold('東京 Night')).toEqual(['東京', 'night']);
  });
});

describe('SearchIndex', () => {
  const idx = index(
    credit(1, 'Night Drive', 'Neon Coast', 4),
    credit(2, 'Nightfall', 'The Dusk', 2),
    credit(3, 'Morning', 'Nightingale Choir', 3),
    credit(4, 'Café Night', 'Ana', 5),
    credit(5, 'Drive', 'Night Riders', 6),
  );

  it('matches word prefixes in title or artist, title matches first', () => {
    // Title matches by length, then artist-only matches by title length.
    expect(ids(idx.search('night'))).toEqual([2, 4, 1, 5, 3]);
  });

  it('needs every token, possibly split across title and artist', () => {
    expect(ids(idx.search('drive neon'))).toEqual([1]);
    expect(ids(idx.search('drive riders'))).toEqual([5]);
    expect(ids(idx.search('drive dusk'))).toEqual([]);
  });

  it('does not match inside a word', () => {
    expect(ids(idx.search('ight'))).toEqual([]);
  });

  it('ignores case and diacritics on both sides', () => {
    expect(ids(idx.search('CAFE'))).toEqual([4]);
    expect(ids(idx.search('café'))).toEqual([4]);
  });

  it('returns the biome and display text of each hit', () => {
    expect(idx.search('morning')).toEqual([{ id: 3, biome: 3, title: 'Morning', artist: 'Nightingale Choir' }]);
  });

  it('returns nothing for an empty query and respects the limit', () => {
    expect(idx.search('  ')).toEqual([]);
    expect(ids(idx.search('night', 2))).toEqual([2, 4]);
  });
});
