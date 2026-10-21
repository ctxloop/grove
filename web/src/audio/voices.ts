// The HRTF voice pool (docs/architecture.md §5). Carries out
// the scheduler's start and release actions and PannerSwap's direction changes
// on Web Audio nodes; decides nothing itself.

import { config } from '../config';
import { bandBins, bandEnergies, smoothBands } from './bands';
import type { AudioEngine } from './engine';
import type { ListenerPose } from './listener';
import { PannerSwap, toListenerSpace, type Panner } from './spatial';

export interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** What the soundscape needs from a voice pool; a fake stands in for it in tests. */
export interface VoiceSink {
  /** `focus`: the voice's focus gain (audio/focus.ts) to start at. */
  start(voice: number, buffer: AudioBuffer, at: Point, focus: number): void;
  release(voice: number): void;
  /** Moves a playing voice's focus gain smoothly towards `gain`. */
  focus(voice: number, gain: number): void;
  /** True while the voice has a source, playing or fading out. */
  sounding(voice: number): boolean;
  /** Smoothed low, mid, high in 0..1, advanced by dt seconds. Falls to zero once the voice is silent. */
  levels(voice: number, dt: number): Float32Array;
}

/** Sets an AudioParam-backed position, with the deprecated setPosition fallback (older Firefox and Safari). */
function place(panner: PannerNode, p: Point): void {
  if (panner.positionX !== undefined) {
    panner.positionX.value = p.x;
    panner.positionY.value = p.y;
    panner.positionZ.value = p.z;
  } else {
    panner.setPosition(p.x, p.y, p.z);
  }
}

class Voice {
  /** The clip's own envelope: fade-in and fade-out of every loop (play()). */
  readonly gain: GainNode;
  /**
   * The release fade, after the envelope. It holds 1 while the voice plays, so a release never
   * cancels a ramp in progress: cancelling the envelope's loop fade-out and holding the value
   * the main thread last saw left the gain where it was a render quantum ago, a click.
   */
  readonly out: GainNode;
  /** The focus duck (audio/focus.ts), after the release gain; `focusTarget` is where it is heading. */
  readonly focus: GainNode;
  focusTarget = 1;
  /** Two HRTF panners, each behind its own gain; only one is heard outside a crossfade. New ones on every start(). */
  panners: [PannerNode, PannerNode];
  readonly sides: [GainNode, GainNode];
  readonly analyser: AnalyserNode;
  readonly spectrum: Float32Array<ArrayBuffer>;
  readonly target = new Float32Array(3);
  readonly level = new Float32Array(3);
  source: AudioBufferSourceNode | null = null;
  /** Set while the voice should keep looping its buffer. */
  buffer: AudioBuffer | null = null;
  /** The tree's world position and its panner pair, from start() on. */
  at: Point | null = null;
  swap: PannerSwap | null = null;

  constructor(ctx: AudioContext, output: AudioNode) {
    const a = config.audio;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.out = new GainNode(ctx, { gain: 1 });
    this.gain.connect(this.out);
    this.focus = new GainNode(ctx, { gain: 1 });
    this.out.connect(this.focus);
    this.panners = [this.panner(ctx), this.panner(ctx)];
    this.sides = [new GainNode(ctx, { gain: 1 }), new GainNode(ctx, { gain: 0 })];
    this.analyser = new AnalyserNode(ctx, { fftSize: a.fftSize, smoothingTimeConstant: 0 });
    this.spectrum = new Float32Array(this.analyser.frequencyBinCount);
    // Bands are read after the envelope and release gains, so a fading tree dims with its sound, but
    // before the focus duck and the panners, so a tree's light does not depend on where the listener stands.
    for (const i of [0, 1] as const) this.focus.connect(this.panners[i]).connect(this.sides[i]).connect(output);
    this.out.connect(this.analyser);
  }

  /**
   * Swaps in two new panners. Chrome stops processing a node whose input has been silent past its
   * tail, so a panner moved while its voice is silent does not crossfade to the new direction then:
   * it does so when the next clip begins, stepping its interaural delay under the fade-in, a click.
   * A new HRTF panner takes its first position without a crossfade.
   */
  renewPanners(ctx: AudioContext): void {
    for (const i of [0, 1] as const) {
      this.focus.disconnect(this.panners[i]);
      this.panners[i].disconnect();
      this.panners[i] = this.panner(ctx);
      this.focus.connect(this.panners[i]).connect(this.sides[i]);
    }
  }

  private panner(ctx: AudioContext): PannerNode {
    const a = config.audio;
    return new PannerNode(ctx, {
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      refDistance: a.refDistance,
      rolloffFactor: a.rolloffFactor,
    });
  }
}

export class VoicePool implements VoiceSink {
  private readonly voices: Voice[];
  private readonly bins: [number, number, number, number];
  private readonly raw = new Float32Array(3);
  /** The camera pose of the last follow(); voices are placed relative to it. */
  private pose: ListenerPose | null = null;

  constructor(
    private readonly engine: AudioEngine,
    count: number = config.audio.voices,
  ) {
    this.voices = Array.from({ length: count }, () => new Voice(engine.ctx, engine.output));
    this.bins = bandBins(engine.ctx.sampleRate, config.audio.fftSize, config.audio.bandEdges);
  }

  start(voice: number, buffer: AudioBuffer, at: Point, focus: number): void {
    const v = this.voices[voice];
    if (v === undefined) return;
    this.stopSource(v, 0);
    // The voice is silent here (stopped, and play() starts the envelope at 0), so the release gain may jump.
    const now = this.engine.ctx.currentTime;
    v.out.gain.cancelScheduledValues(now);
    v.out.gain.setValueAtTime(1, now);
    v.focus.gain.cancelScheduledValues(now);
    v.focus.gain.setValueAtTime(focus, now);
    v.focusTarget = focus;
    v.renewPanners(this.engine.ctx);
    v.at = at;
    v.swap = null;
    this.aim(v);
    v.buffer = buffer;
    v.level.fill(0);
    this.play(v);
  }

  release(voice: number): void {
    const v = this.voices[voice];
    if (v === undefined) return;
    v.buffer = null;
    this.stopSource(v, config.audio.fadeSeconds);
  }

  focus(voice: number, gain: number): void {
    const v = this.voices[voice];
    if (v === undefined || v.source === null || Math.abs(gain - v.focusTarget) < 1e-3) return;
    v.focusTarget = gain;
    const a = config.audio;
    v.focus.gain.setTargetAtTime(gain, this.engine.ctx.currentTime + a.scheduleLeadSeconds, a.focusSmoothing);
  }

  /**
   * Per frame: the camera pose (the AudioListener itself stays at the origin) and the
   * audio clock. Each sounding voice follows its tree through its panner pair.
   */
  follow(pose: ListenerPose, now: number): void {
    this.pose = pose;
    for (const v of this.voices) {
      if (v.source === null || v.at === null) continue;
      if (v.swap === null) {
        this.aim(v);
        continue;
      }
      for (const a of v.swap.update(now, toListenerSpace(v.at, pose))) {
        if (a.type === 'place') {
          place(v.panners[a.panner], a.at);
        } else {
          const from: Panner = a.to === 0 ? 1 : 0;
          const rise = v.sides[a.to].gain;
          const fall = v.sides[from].gain;
          rise.setValueAtTime(0, a.start);
          rise.linearRampToValueAtTime(1, a.end);
          fall.setValueAtTime(1, a.start);
          fall.linearRampToValueAtTime(0, a.end);
        }
      }
    }
  }

  /** Points both panners of a voice that is not heard yet at its tree, with panner 0 heard. */
  private aim(v: Voice): void {
    if (v.at === null || this.pose === null) return;
    const local = toListenerSpace(v.at, this.pose);
    const now = this.engine.ctx.currentTime;
    place(v.panners[0], local);
    place(v.panners[1], local);
    v.sides[0].gain.cancelScheduledValues(now);
    v.sides[1].gain.cancelScheduledValues(now);
    v.sides[0].gain.setValueAtTime(1, now);
    v.sides[1].gain.setValueAtTime(0, now);
    v.swap = new PannerSwap(local);
  }

  sounding(voice: number): boolean {
    return this.voices[voice]?.source != null;
  }

  levels(voice: number, dt: number): Float32Array {
    const v = this.voices[voice];
    if (v === undefined) return this.raw.fill(0);
    if (v.source === null) {
      v.target.fill(0);
    } else {
      v.analyser.getFloatFrequencyData(v.spectrum);
      bandEnergies(v.spectrum, this.bins, config.audio.bandRangesDb, v.target);
    }
    smoothBands(v.level, v.target, dt, config.audio.bandAttack, config.audio.bandRelease);
    return v.level;
  }

  /** Plays the voice's buffer once with a fade-in and a fade-out; when it ends and is still wanted, plays it again. */
  private play(v: Voice): void {
    const buffer = v.buffer;
    if (buffer === null) return;
    const ctx = this.engine.ctx;
    const fade = Math.min(config.audio.fadeSeconds, buffer.duration / 2);
    const now = ctx.currentTime;
    const end = now + buffer.duration;
    const g = v.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(0, now);
    g.linearRampToValueAtTime(1, now + fade);
    g.setValueAtTime(1, end - fade);
    g.linearRampToValueAtTime(0, end);

    const source = new AudioBufferSourceNode(ctx, { buffer });
    source.connect(v.gain);
    source.onended = () => {
      source.disconnect();
      if (v.source !== source) return;
      v.source = null;
      this.play(v);
    };
    v.source = source;
    source.start(now);
  }

  /**
   * Fades the current source out over `fade` seconds on the release gain, starting
   * scheduleLeadSeconds from now, and stops it. With `fade` 0 it stops at once.
   */
  private stopSource(v: Voice, fade: number): void {
    const source = v.source;
    if (source === null) return;
    const now = this.engine.ctx.currentTime;
    // The ended handler sees a replaced or released voice and only disconnects.
    source.onended = () => {
      source.disconnect();
      if (v.source === source) v.source = null;
    };
    if (fade === 0) {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(0, now);
      v.source = null;
      source.stop(now);
      return;
    }
    const at = now + config.audio.scheduleLeadSeconds;
    v.out.gain.setValueAtTime(1, at);
    v.out.gain.linearRampToValueAtTime(0, at + fade);
    source.stop(at + fade);
  }
}
