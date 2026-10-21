import type { Biome, Tree, World } from '../world/schema';

export interface TreeInfo {
  title: string;
  artist: string;
  /** Null when the track has no album. */
  album: string | null;
  biome: string;
  /** Null for the `core` grove. */
  grove: string | null;
  /** The license name, or the raw code when the code is not in `world.licenses`. */
  licenseName: string;
  licenseUrl: string | null;
  fmaUrl: string;
}

const CORE_GROVE = 'core';

/** Resolves a tree's display fields against the world tables. Pure, no DOM. */
export function treeInfo(world: World, biome: Biome, tree: Tree): TreeInfo {
  const groveName = biome.groves[tree.g]?.name;
  const license = world.licenses[tree.lic];
  return {
    title: tree.t,
    artist: tree.a,
    album: tree.al === '' ? null : tree.al,
    biome: biome.name,
    grove: groveName === undefined || groveName === CORE_GROVE ? null : groveName,
    licenseName: license?.name ?? tree.lic,
    licenseUrl: license?.url ?? null,
    fmaUrl: world.fmaBase + tree.url,
  };
}
