import type { Biome, Tree, World } from './schema';

// Builders for synthetic worlds in tests.

export function makeBiome(id: number, cx: number, cz: number, radius: number, trees = 0): Biome {
  return {
    id,
    slug: `biome-${id}`,
    name: `Biome ${id}`,
    center: [cx, cz],
    radius,
    palette: { hue: 0.5, saturation: 0.5 },
    species: 'oak',
    trees,
    file: `biome-${id}.json`,
    groves: [],
  };
}

export function makeWorld(biomes: readonly Biome[], audioPath = '{id}.m4a'): World {
  return {
    schema: 1,
    subset: 'test',
    bounds: { minX: -1000, minZ: -1000, maxX: 1000, maxZ: 1000 },
    fmaBase: 'https://example.test/music/',
    audio: { path: audioPath },
    biomes,
    licenses: {},
  };
}

export function makeTree(id: number, x: number, z: number): Tree {
  return { id, x, z, g: 0, h: 128, l: 128, r: 128, t: `t${id}`, a: 'a', al: 'al', lic: 'cc0-1.0', url: `a/${id}` };
}
