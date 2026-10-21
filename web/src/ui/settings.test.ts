import { describe, expect, it, vi } from 'vitest';
import { config } from '../config';
import { DEFAULT_SETTINGS, SettingsStore } from './settings';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
}

const KEY = config.ui.settingsKey;

describe('SettingsStore', () => {
  it('starts with defaults when nothing is stored', () => {
    expect(new SettingsStore(new MemoryStorage()).get()).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps volume to 0..1', () => {
    const store = new SettingsStore(null);
    expect(store.set({ volume: 3 }).volume).toBe(1);
    expect(store.set({ volume: -2 }).volume).toBe(0);
    expect(store.set({ volume: Number.NaN }).volume).toBe(DEFAULT_SETTINGS.volume);
  });

  it('merges partial patches', () => {
    const store = new SettingsStore(null);
    store.set({ volume: 0.3 });
    expect(store.set({ muted: true })).toEqual({ volume: 0.3, muted: true });
  });

  it('persists and restores', () => {
    const storage = new MemoryStorage();
    new SettingsStore(storage).set({ volume: 0.25, muted: true });
    expect(JSON.parse(storage.data.get(KEY) ?? '')).toEqual({ volume: 0.25, muted: true });
    expect(new SettingsStore(storage).get()).toEqual({ volume: 0.25, muted: true });
  });

  it('honors a custom key', () => {
    const storage = new MemoryStorage();
    new SettingsStore(storage, 'other').set({ volume: 0.5 });
    expect(storage.data.has('other')).toBe(true);
    expect(storage.data.has(KEY)).toBe(false);
  });

  it('falls back to defaults on corrupt JSON', () => {
    for (const raw of ['{nope', 'null', '42', '"x"', '[]']) {
      const storage = new MemoryStorage();
      storage.setItem(KEY, raw);
      expect(new SettingsStore(storage).get(), raw).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('keeps valid fields and defaults the invalid ones', () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, JSON.stringify({ volume: 9, muted: 'yes' }));
    expect(new SettingsStore(storage).get()).toEqual({ volume: 1, muted: false });
  });

  it('survives storage that throws', () => {
    const storage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    const store = new SettingsStore(storage);
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    expect(store.set({ volume: 0.4 }).volume).toBe(0.4);
    expect(store.get().volume).toBe(0.4);
  });

  it('works with null storage', () => {
    const store = new SettingsStore(null);
    expect(store.set({ muted: true }).muted).toBe(true);
  });

  it('reports 0 as the effective volume while muted', () => {
    const store = new SettingsStore(null);
    store.set({ volume: 0.6 });
    expect(store.effectiveVolume()).toBe(0.6);
    store.set({ muted: true });
    expect(store.effectiveVolume()).toBe(0);
    expect(store.get().volume).toBe(0.6);
  });

  it('plays touch devices at the default volume, but still mutes them', () => {
    const store = new SettingsStore(null);
    store.set({ volume: 0.1 });
    expect(store.effectiveVolume(true)).toBe(DEFAULT_SETTINGS.volume);
    store.set({ muted: true });
    expect(store.effectiveVolume(true)).toBe(0);
  });

  it('notifies listeners until they unsubscribe', () => {
    const store = new SettingsStore(null);
    const cb = vi.fn();
    const off = store.onChange(cb);
    store.set({ volume: 0.1 });
    expect(cb).toHaveBeenCalledWith({ volume: 0.1, muted: false });
    off();
    store.set({ volume: 0.2 });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('hands out copies', () => {
    const store = new SettingsStore(null);
    store.get().volume = 0;
    expect(store.get().volume).toBe(DEFAULT_SETTINGS.volume);
  });
});
