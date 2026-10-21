import { describe, expect, it } from 'vitest';
import { bandBins, bandEnergies, smoothBands } from './bands';

describe('bandBins', () => {
  it('splits a 1024-point FFT at 48 kHz at 250 Hz and 2 kHz', () => {
    // 46.875 Hz per bin.
    expect(bandBins(48000, 1024, [250, 2000])).toEqual([1, 5, 43, 512]);
  });

  it('keeps every band non-empty and inside the spectrum', () => {
    for (const [rate, size] of [
      [44100, 256],
      [48000, 2048],
      [8000, 32],
    ] as const) {
      const b = bandBins(rate, size, [250, 2000]);
      expect(b[0]).toBeLessThan(b[1]);
      expect(b[1]).toBeLessThan(b[2]);
      expect(b[2]).toBeLessThanOrEqual(b[3]);
      expect(b[3]).toBe(size / 2);
    }
  });
});

describe('bandEnergies', () => {
  const ranges = [
    [-70, -25],
    [-80, -40],
    [-110, -70],
  ] as const;

  it('maps each band mean through its own dB window and clamps', () => {
    const spectrum = new Float32Array(16).fill(-200);
    spectrum.fill(-10, 1, 4); // low band 1..4: above the ceiling
    spectrum.fill(-60, 4, 8); // mid band 4..8: halfway
    const out = new Float32Array(3);
    bandEnergies(spectrum, [1, 4, 8, 16], ranges, out);
    expect(out[0]).toBe(1);
    expect(out[1]).toBeCloseTo(0.5);
    expect(out[2]).toBe(0);
  });

  it('treats silence (-Infinity) as the floor', () => {
    const spectrum = new Float32Array(8).fill(-Infinity);
    spectrum[3] = -90; // high band: halfway through its window
    const out = new Float32Array(3);
    bandEnergies(spectrum, [1, 2, 3, 4], ranges, out);
    expect([...out]).toEqual([0, 0, 0.5]);
  });

  it('ignores the DC bin', () => {
    const spectrum = new Float32Array(8).fill(-Infinity);
    spectrum[0] = 0;
    const out = new Float32Array(3);
    bandEnergies(spectrum, [1, 2, 3, 4], ranges, out);
    expect([...out]).toEqual([0, 0, 0]);
  });
});

describe('smoothBands', () => {
  it('rises with attack and falls with release, independent of frame rate', () => {
    const run = (steps: number) => {
      const cur = new Float32Array(1);
      const target = new Float32Array([1]);
      for (let i = 0; i < steps; i++) smoothBands(cur, target, 0.1 / steps, 0.05, 0.5);
      return cur[0] ?? 0;
    };
    expect(run(6)).toBeCloseTo(run(12), 6);
    expect(run(6)).toBeCloseTo(1 - Math.exp(-2), 5);

    const cur = new Float32Array([1]);
    smoothBands(cur, new Float32Array([0]), 0.5, 0.05, 0.5);
    expect(cur[0]).toBeCloseTo(Math.exp(-1), 5);
  });
});
