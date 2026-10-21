import { el, isolatePointer } from './dom';
import type { SettingsStore } from './settings';
import { strings } from './strings';
import './styles.css';

const NON_TEXT_INPUTS = ['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image'];

/** True when keystrokes on this element are text input (a range slider is not). */
export function isTextEntry(
  node: { tagName?: string; type?: string; isContentEditable?: boolean } | null,
): boolean {
  if (node === null) return false;
  if (node.isContentEditable === true) return true;
  const tag = node.tagName?.toUpperCase();
  if (tag === 'INPUT') return !NON_TEXT_INPUTS.includes(node.type?.toLowerCase() ?? '');
  return tag === 'TEXTAREA' || tag === 'SELECT';
}

/** On touch devices (`touch`) only the mute button: the hardware buttons set the level. */
export function createVolumeControl(
  root: HTMLElement,
  store: SettingsStore,
  touch: boolean,
): { dispose(): void } {
  const box = el('div', 'volume');
  isolatePointer(box);

  const mute = el('button', 'volume__mute', strings.volume.mute);
  mute.type = 'button';
  // The M key (bindMuteKey) has no use on a touch screen, so it is shown only on desktop.
  if (!touch) {
    mute.title = strings.volume.muteTip;
    mute.setAttribute('aria-keyshortcuts', 'M');
  }

  const slider = el('input', 'volume__slider');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.step = '1';
  slider.setAttribute('aria-label', strings.volume.slider);

  const render = (): void => {
    const s = store.get();
    mute.setAttribute('aria-pressed', String(s.muted));
    box.dataset.muted = String(s.muted);
    slider.value = String(Math.round(s.volume * 100));
  };

  mute.addEventListener('click', () => {
    store.set({ muted: !store.get().muted });
  });
  // Moving the slider while muted means the listener wants sound again.
  slider.addEventListener('input', () => {
    store.set({ volume: Number(slider.value) / 100, muted: false });
  });

  box.append(mute);
  if (!touch) box.append(slider);
  root.append(box);
  render();
  const off = store.onChange(render);

  return {
    dispose() {
      off();
      box.remove();
    },
  };
}

/** Toggles mute on the M key unless the user is typing. Returns the unbind function. */
export function bindMuteKey(store: SettingsStore): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key.toLowerCase() !== 'm' || e.repeat) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTextEntry(e.target as Element | null)) return;
    store.set({ muted: !store.get().muted });
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
