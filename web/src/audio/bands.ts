// Band energies for the audio-reactive trees. Pure.

/** Bin ranges [start, end) for low, mid, and high, from the band edges in Hz. */
export function bandBins(sampleRate: number, fftSize: number, edges: readonly [number, number]): [number, number, number, number] {
  const hzPerBin = sampleRate / fftSize;
  const bins = fftSize / 2;
  const a = Math.min(bins - 1, Math.max(2, Math.round(edges[0] / hzPerBin)));
  const b = Math.min(bins, Math.max(a + 1, Math.round(edges[1] / hzPerBin)));
  // Bin 0 is DC and carries no musical energy.
  return [1, a, b, bins];
}

/** A band's dB window: its mean level maps from floor (0) to ceiling (1). */
export type DbRange = readonly [floor: number, ceiling: number];

/**
 * Averages a dB spectrum (AnalyserNode.getFloatFrequencyData) over the three
 * bands and maps each mean through its own dB window to 0..1. Bins below the
 * floor (including -Infinity for silence) count as the floor. Each band has
 * its own window because music carries far more energy in the bass than in
 * the treble. Writes low, mid, high into out.
 */
export function bandEnergies(
  spectrum: Float32Array,
  bins: readonly [number, number, number, number],
  ranges: readonly [DbRange, DbRange, DbRange],
  out: Float32Array,
): void {
  for (let band = 0; band < 3; band++) {
    const start = bins[band] ?? 0;
    const end = bins[band + 1] ?? 0;
    const [floor, ceiling] = ranges[band] ?? [0, 1];
    let sum = 0;
    for (let i = start; i < end; i++) sum += Math.max(spectrum[i] ?? floor, floor);
    const mean = end > start ? sum / (end - start) : floor;
    out[band] = Math.min(1, Math.max(0, (mean - floor) / (ceiling - floor)));
  }
}

/**
 * Moves each value of current toward target with exponential smoothing:
 * the attack constant when rising, the release constant when falling.
 * Frame-rate independent.
 */
export function smoothBands(current: Float32Array, target: Float32Array, dt: number, attack: number, release: number): void {
  for (let i = 0; i < current.length; i++) {
    const c = current[i] ?? 0;
    const t = target[i] ?? 0;
    const tau = t > c ? attack : release;
    current[i] = t + (c - t) * Math.exp(-dt / tau);
  }
}
