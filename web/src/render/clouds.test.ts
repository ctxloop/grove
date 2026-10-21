import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { buildClouds, type CloudArea, type CloudParams } from './clouds';

const area: CloudArea = { minX: -558, minZ: -584, maxX: 505, maxZ: 555 };
const params: CloudParams = { block: config.render.cloudBlock, scale: config.render.cloudScale, threshold: config.render.cloudThreshold, seed: config.render.cloudSeed };
const total = (layer: ReturnType<typeof buildClouds>): number => Math.ceil((area.maxZ - area.minZ) / params.block) * (layer.width / params.block);

describe('buildClouds', () => {
  it('is deterministic and depends on the seed', () => {
    expect(buildClouds(area, params).cells).toEqual(buildClouds(area, params).cells);
    expect(buildClouds(area, { ...params, seed: params.seed + 1 }).cells).not.toEqual(buildClouds(area, params).cells);
  });

  it('covers a moderate share of the area with the configured parameters', () => {
    const layer = buildClouds(area, params);
    const coverage = layer.cells.length / 2 / total(layer);
    expect(coverage).toBeGreaterThan(0.15);
    expect(coverage).toBeLessThan(0.5);
  });

  it('keeps every cell centre inside the area, on the block grid', () => {
    const layer = buildClouds(area, params);
    expect(layer.cells.length).toBeGreaterThan(0);
    for (let i = 0; i < layer.cells.length; i += 2) {
      const x = layer.cells[i] ?? NaN;
      const z = layer.cells[i + 1] ?? NaN;
      expect(x).toBeGreaterThan(area.minX);
      expect(x).toBeLessThan(layer.minX + layer.width);
      expect(z).toBeGreaterThan(area.minZ);
      expect(z).toBeLessThan(area.maxZ + params.block);
      expect((x - area.minX - params.block / 2) / params.block).toBeCloseTo(Math.round((x - area.minX - params.block / 2) / params.block), 3);
    }
  });

  it('covers more as the threshold falls, and is a whole number of noise features wide (so it tiles in x)', () => {
    const lo = buildClouds(area, { ...params, threshold: 0.45 });
    const hi = buildClouds(area, { ...params, threshold: 0.65 });
    expect(lo.cells.length).toBeGreaterThan(hi.cells.length);
    expect((lo.width / params.block) % params.scale).toBe(0);
  });
});
