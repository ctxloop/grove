import { config } from '../config';
import { el } from './dom';
import { strings } from './strings';
import './styles.css';

export interface Hud {
  /** Unlocked shows the controls hint; locked shows the crosshair. */
  setLocked(locked: boolean): void;
  /** Shows a biome-name toast; a repeated call restarts it. */
  showBiome(name: string): void;
  /** Grows the crosshair while a tree is under it. */
  setTarget(hasTarget: boolean): void;
  dispose(): void;
}

/** `touch` picks the touch-controls hint instead of the keyboard and mouse one. */
export function createHud(root: HTMLElement, touch = false): Hud {
  const hud = el('div', 'hud');
  const controls = el('div', 'hud__controls', touch ? strings.hud.touchControls : strings.hud.controls);
  const crosshair = el('div', 'hud__crosshair');
  crosshair.setAttribute('aria-hidden', 'true');
  const toast = el('div', 'hud__toast');
  toast.setAttribute('role', 'status');
  hud.append(controls, crosshair, toast);
  root.append(hud);

  let timer: ReturnType<typeof setTimeout> | undefined;

  return {
    setLocked(locked) {
      hud.classList.toggle('is-locked', locked);
    },
    showBiome(name) {
      clearTimeout(timer);
      toast.textContent = strings.hud.enterBiome(name);
      toast.classList.add('is-visible');
      timer = setTimeout(() => toast.classList.remove('is-visible'), config.ui.toastMs);
    },
    setTarget(hasTarget) {
      hud.classList.toggle('has-target', hasTarget);
    },
    dispose() {
      clearTimeout(timer);
      hud.remove();
    },
  };
}
