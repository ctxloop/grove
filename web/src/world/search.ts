// Title and artist search over attribution.json. Pure.

import { config } from '../config';
import type { Attribution } from './schema';

export interface SearchHit {
  readonly id: number;
  readonly biome: number;
  readonly title: string;
  readonly artist: string;
}

interface Entry {
  readonly hit: SearchHit;
  readonly titleWords: readonly string[];
  readonly artistWords: readonly string[];
}

/** Lowercase, strip diacritics, and split on anything that is not a letter or digit. */
export function fold(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== '');
}

const prefixOfAny = (token: string, words: readonly string[]): boolean => words.some((w) => w.startsWith(token));

export class SearchIndex {
  private readonly entries: readonly Entry[];

  constructor(attribution: Attribution) {
    this.entries = attribution.tracks.map((c) => ({
      hit: { id: c.id, biome: c.b, title: c.t, artist: c.a },
      titleWords: fold(c.t),
      artistWords: fold(c.a),
    }));
  }

  /**
   * Tracks where every query token starts a word of the title or the artist.
   * Title-only matches come first, then shorter titles, then lower ids.
   */
  search(query: string, limit: number = config.world.searchLimit): SearchHit[] {
    const tokens = fold(query);
    if (tokens.length === 0) return [];
    const matches: { e: Entry; titleOnly: boolean }[] = [];
    for (const e of this.entries) {
      let titleOnly = true;
      let ok = true;
      for (const t of tokens) {
        if (prefixOfAny(t, e.titleWords)) continue;
        if (!prefixOfAny(t, e.artistWords)) {
          ok = false;
          break;
        }
        titleOnly = false;
      }
      if (ok) matches.push({ e, titleOnly });
    }
    matches.sort(
      (a, b) =>
        Number(b.titleOnly) - Number(a.titleOnly) || a.e.hit.title.length - b.e.hit.title.length || a.e.hit.id - b.e.hit.id,
    );
    return matches.slice(0, limit).map((m) => m.e.hit);
  }
}
