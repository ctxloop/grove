import { config } from '../config';

/** `navigator.audioSession` (Safari 16.4+). Other browsers and TypeScript's DOM types lack it. */
interface AudioSessionHost {
  audioSession?: { type: string };
}

/**
 * Asks for the `playback` audio session where the browser has one. The default session mixes
 * with other apps but is muted by the iPhone silent switch; `playback` plays through it and,
 * like any music app, pauses other apps' playback.
 */
export function preferPlaybackSession(host: AudioSessionHost): void {
  if (host.audioSession !== undefined) host.audioSession.type = 'playback';
}

/**
 * Owns the AudioContext and the master chain: master gain -> limiter -> destination.
 * Voices connect to `output`. Create it inside the Enter-gate click handler so the browser
 * allows audio to start.
 */
export class AudioEngine {
  readonly output: AudioNode;
  private readonly master: GainNode;

  private constructor(readonly ctx: AudioContext) {
    const l = config.audio.limiter;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = l.thresholdDb;
    limiter.knee.value = l.kneeDb;
    limiter.ratio.value = l.ratio;
    limiter.attack.value = l.attackSeconds;
    limiter.release.value = l.releaseSeconds;
    limiter.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.connect(limiter);
    this.output = this.master;
  }

  /** Must be called from a user gesture (the Enter-gate click). */
  static create(): AudioEngine {
    preferPlaybackSession(navigator as AudioSessionHost);
    const engine = new AudioEngine(new AudioContext({ latencyHint: 'interactive' }));
    // Some browsers (iOS Safari) create the context suspended even inside a gesture.
    void engine.resume();
    return engine;
  }

  get state(): AudioContextState {
    return this.ctx.state;
  }

  /** Sets the master volume, 0..1, with a short smoothing ramp to avoid zipper noise. */
  setVolume(v: number): void {
    const target = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, config.audio.volumeSmoothing);
  }

  suspend(): Promise<void> {
    return this.ctx.suspend();
  }

  resume(): Promise<void> {
    return this.ctx.resume();
  }

  /** Calls `cb` whenever the context state changes. Returns an unsubscribe function. */
  onStateChange(cb: (s: AudioContextState) => void): () => void {
    const handler = () => cb(this.ctx.state);
    this.ctx.addEventListener('statechange', handler);
    return () => this.ctx.removeEventListener('statechange', handler);
  }
}
