import { describe, expect, it } from 'vitest';
import { strings } from './strings';

type Fn = (...args: string[]) => string;

function walk(node: unknown, path: string, out: [string, string][]): void {
  if (typeof node === 'string') out.push([path, node]);
  else if (typeof node === 'function') out.push([path, (node as Fn)('Sample', 'Sample')]);
  else if (typeof node === 'object' && node !== null) {
    for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`, out);
  }
}

describe('strings', () => {
  const entries: [string, string][] = [];
  walk(strings, 'strings', entries);

  it('has entries', () => {
    expect(entries.length).toBeGreaterThan(10);
  });

  it('has no empty values', () => {
    for (const [path, value] of entries) expect(value.trim(), path).not.toBe('');
  });

  it('interpolates function arguments', () => {
    expect(strings.hud.enterBiome('Rock')).toBe('Entering Rock');
    expect(strings.notice.biomeLoadFailed('Rock')).toContain('Rock');
    expect(strings.attribution.tracks(1)).toBe('1 track');
    expect(strings.attribution.tracks(14598)).toBe('14,598 tracks');
    expect(strings.panel.place('Electronic', 'Techno')).toContain('Techno');
  });
});
