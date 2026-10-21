import { config } from '../config';

export interface Settings {
  /** Master volume, 0..1. */
  volume: number;
  muted: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = { volume: 0.8, muted: false };

type Listener = (settings: Settings) => void;

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_SETTINGS.volume;
}

/** Reads stored settings; anything corrupt or missing falls back per field. */
function load(storage: Pick<Storage, 'getItem'> | null, key: string): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  try {
    const raw = storage?.getItem(key);
    if (raw === null || raw === undefined) return out;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return out;
    const { volume, muted } = parsed as Record<string, unknown>;
    if (typeof volume === 'number') out.volume = clamp01(volume);
    if (typeof muted === 'boolean') out.muted = muted;
  } catch {
    // Unreadable storage or invalid JSON: use the defaults.
  }
  return out;
}

/** Volume and mute, persisted as JSON. Storage failures never throw. */
export class SettingsStore {
  private current: Settings;
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null,
    private readonly key: string = config.ui.settingsKey,
  ) {
    this.current = load(storage, key);
  }

  get(): Settings {
    return { ...this.current };
  }

  set(patch: Partial<Settings>): Settings {
    const next: Settings = {
      volume: patch.volume === undefined ? this.current.volume : clamp01(patch.volume),
      muted: patch.muted ?? this.current.muted,
    };
    this.current = next;
    try {
      this.storage?.setItem(this.key, JSON.stringify(next));
    } catch {
      // Private mode or quota: keep the in-memory value.
    }
    for (const cb of [...this.listeners]) cb(this.get());
    return this.get();
  }

  onChange(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /**
   * The gain to apply: 0 while muted. Touch devices have no slider (the hardware buttons set
   * the level), so they play at the default volume whatever was stored.
   */
  effectiveVolume(touch = false): number {
    if (this.current.muted) return 0;
    return touch ? DEFAULT_SETTINGS.volume : this.current.volume;
  }
}
