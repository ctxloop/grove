import { describe, expect, it } from 'vitest';
import biomeFixture from '../../../contract/fixtures/biome.json';
import worldFixture from '../../../contract/fixtures/world.json';
import { parseBiomeFile, parseWorld } from '../world/schema';
import type { Tree } from '../world/schema';
import { treeInfo } from './tree-info';

const world = parseWorld(structuredClone(worldFixture));
const biome = world.biomes[0];
const trees = parseBiomeFile(structuredClone(biomeFixture)).trees;
const [core, sub] = trees;

if (!biome || !core || !sub) throw new Error('fixtures changed');

describe('treeInfo', () => {
  it('maps a core-grove tree with an album', () => {
    expect(treeInfo(world, biome, core)).toEqual({
      title: 'Food',
      artist: 'AWOL',
      album: 'AWOL - A Way Of Life',
      biome: 'Electronic',
      grove: null,
      licenseName: 'CC BY-NC-SA 3.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/3.0/',
      fmaUrl: 'https://freemusicarchive.org/music/AWOL/AWOL_-_A_Way_Of_Life/Food',
    });
  });

  it('maps a named grove and an empty album to null', () => {
    const info = treeInfo(world, biome, sub);
    expect(info.grove).toBe('Techno');
    expect(info.album).toBeNull();
    expect(info.title).toBe('Héllo "quoted"');
    expect(info.licenseName).toBe('CC0 1.0');
    expect(info.fmaUrl).toBe('https://freemusicarchive.org/music/Artist/Album/Track');
  });

  it('falls back to the raw code for an unknown license', () => {
    const tree: Tree = { ...core, lic: 'mystery-9.9' };
    const info = treeInfo(world, biome, tree);
    expect(info.licenseName).toBe('mystery-9.9');
    expect(info.licenseUrl).toBeNull();
  });

  it('has no grove when the index is out of range', () => {
    expect(treeInfo(world, biome, { ...core, g: 99 }).grove).toBeNull();
  });
});
