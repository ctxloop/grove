import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { SPECIES } from '../world/schema';
import { buildTree } from './voxel';

// config.player.treeClearance must keep the eye out of every crown.
describe('treeClearance', () => {
  it('covers the widest block near eye height of every species', () => {
    const size = config.render.voxelSize;
    const eye = config.player.eyeHeight;
    const band = 0.25;
    let widest = 0;
    for (const species of SPECIES) {
      for (const height of [0, 0.25, 0.5, 0.75, 1]) {
        for (const rough of [0, 0.5, 1]) {
          for (let seed = 1; seed < 40; seed++) {
            for (const v of buildTree(species, height, rough, seed).voxels) {
              // A voxel spans [x - ½, x + ½] horizontally and [y, y + 1] vertically, times size.
              if ((v.y + 1) * size < eye - band || v.y * size > eye + band) continue;
              widest = Math.max(widest, Math.hypot(Math.abs(v.x) + 0.5, Math.abs(v.z) + 0.5) * size);
            }
          }
        }
      }
    }
    expect(widest).toBeGreaterThan(1);
    expect(config.player.treeClearance).toBeGreaterThanOrEqual(widest + band);
  });

  it('is kept by a search teleport', () => {
    expect(config.player.teleportDistance).toBeGreaterThanOrEqual(config.player.treeClearance);
  });
});
