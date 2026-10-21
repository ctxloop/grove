import { describe, expect, it } from 'vitest';
import attributionFixture from '../../../contract/fixtures/attribution.json';
import biomeFixture from '../../../contract/fixtures/biome.json';
import speciesFixture from '../../../contract/fixtures/species.json';
import worldFixture from '../../../contract/fixtures/world.json';
import { parseAttribution, parseBiomeFile, parseWorld, SCHEMA_VERSION, SchemaError, SPECIES } from './schema';

// Shared with pipeline/internal/export/contract_test.go.

const clone = <T>(v: T): T => structuredClone(v);

describe('contract fixtures', () => {
  it('parses world.json and keeps every value', () => {
    const w = parseWorld(clone(worldFixture));
    expect(w).toEqual(worldFixture);
    expect(w.biomes[0]?.groves[1]?.name).toBe('Techno');
    expect(w.licenses['cc0-1.0']?.url).toBe('https://creativecommons.org/publicdomain/zero/1.0/');
  });

  it('parses biome files and attribution', () => {
    expect(parseBiomeFile(clone(biomeFixture))).toEqual(biomeFixture);
    expect(parseAttribution(clone(attributionFixture))).toEqual(attributionFixture);
  });

  it('rejects older and newer schema versions in every file', () => {
    for (const schema of [SCHEMA_VERSION - 1, SCHEMA_VERSION + 1]) {
      expect(() => parseWorld({ ...clone(worldFixture), schema })).toThrow(SchemaError);
      expect(() => parseBiomeFile({ ...clone(biomeFixture), schema })).toThrow(SchemaError);
      expect(() => parseAttribution({ ...clone(attributionFixture), schema })).toThrow(SchemaError);
    }
  });

  it('rejects missing and unknown fields', () => {
    const b = clone(biomeFixture) as { trees: Record<string, unknown>[] };
    delete b.trees[0]?.lic;
    expect(() => parseBiomeFile(b)).toThrow(/lic: missing/);

    const w = clone(worldFixture) as Record<string, unknown>;
    w.extra = true;
    expect(() => parseWorld(w)).toThrow(/extra: unexpected/);
  });

  it('knows the species of the shared fixture and rejects others', () => {
    expect([...SPECIES]).toEqual(speciesFixture);
    const w = clone(worldFixture) as { biomes: Record<string, unknown>[] };
    if (w.biomes[0]) w.biomes[0].species = 'palm';
    expect(() => parseWorld(w)).toThrow(/unknown species palm/);
  });

  it('rejects out-of-range appearance values', () => {
    const b = clone(biomeFixture) as { trees: Record<string, unknown>[] };
    if (b.trees[0]) b.trees[0].h = 256;
    expect(() => parseBiomeFile(b)).toThrow(/expected 0\.\.255/);
  });
});
