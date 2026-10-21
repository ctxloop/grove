import { describe, expect, it } from 'vitest';
import type { Attribution, Credit } from '../world/schema';
import { buildSections, httpUrl } from './attribution-model';

const credit = (id: number, b: number, t: string, lic = 'by'): Credit => ({
  id,
  b,
  t,
  a: `Artist ${id}`,
  lic,
  url: `/track/${id}/`,
});

function attribution(tracks: Credit[]): Attribution {
  return {
    schema: 1,
    fmaBase: 'https://freemusicarchive.org',
    licenses: { by: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' } },
    tracks,
  };
}

const names: Record<number, string> = { 0: 'Rock', 1: 'Electronic', 2: 'Folk' };
const name = (id: number): string => names[id] ?? `Biome ${id}`;

describe('buildSections', () => {
  it('groups by biome and sorts by biome name, then title', () => {
    const sections = buildSections(
      attribution([credit(1, 0, 'b'), credit(2, 1, 'z'), credit(3, 0, 'A'), credit(4, 2, 'q'), credit(5, 1, 'm')]),
      name,
    );
    expect(sections.map((s) => s.name)).toEqual(['Electronic', 'Folk', 'Rock']);
    expect(sections[0]?.rows.map((r) => r.title)).toEqual(['m', 'z']);
    expect(sections[2]?.rows.map((r) => r.title)).toEqual(['A', 'b']);
  });

  it('sorts titles case-insensitively with numbers in order, ties by id', () => {
    const rows = buildSections(
      attribution([credit(9, 0, 'Song'), credit(3, 0, 'song'), credit(5, 0, 'Track 10'), credit(6, 0, 'Track 2')]),
      name,
    )[0]?.rows;
    expect(rows?.map((r) => r.id)).toEqual([3, 9, 6, 5]);
  });

  it('keeps biomes with equal names apart, ordered by id', () => {
    const sections = buildSections(attribution([credit(1, 7, 'a'), credit(2, 3, 'b')]), () => 'Same');
    expect(sections.map((s) => s.biomeId)).toEqual([3, 7]);
  });

  it('resolves licenses and builds FMA links', () => {
    const row = buildSections(attribution([credit(1, 0, 'a')]), name)[0]?.rows[0];
    expect(row).toEqual({
      id: 1,
      title: 'a',
      artist: 'Artist 1',
      licenseName: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      fmaUrl: 'https://freemusicarchive.org/track/1/',
    });
  });

  it('falls back to the license code when the license is unknown', () => {
    const row = buildSections(attribution([credit(1, 0, 'a', 'mystery')]), name)[0]?.rows[0];
    expect(row?.licenseName).toBe('mystery');
    expect(row?.licenseUrl).toBeNull();
  });

  it('returns nothing for no tracks', () => {
    expect(buildSections(attribution([]), name)).toEqual([]);
  });

  it('handles the full-size list', () => {
    const tracks = Array.from({ length: 14598 }, (_, i) => credit(i, i % 16, `Title ${i}`));
    const sections = buildSections(attribution(tracks), name);
    expect(sections).toHaveLength(16);
    expect(sections.reduce((n, s) => n + s.rows.length, 0)).toBe(14598);
  });
});

describe('httpUrl', () => {
  it('accepts only http and https', () => {
    expect(httpUrl('https://a.example/x')).toBe('https://a.example/x');
    expect(httpUrl('http://a.example')).toBe('http://a.example');
    expect(httpUrl('javascript:alert(1)')).toBeNull();
    expect(httpUrl('/relative')).toBeNull();
  });
});
