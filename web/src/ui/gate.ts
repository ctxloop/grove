import { config } from '../config';
import { el } from './dom';
import { strings } from './strings';
import './styles.css';

export interface Gate {
  /** Shows loading text and disables the button. */
  setProgress(text: string): void;
  /** Enables the button (and the Enter key); `onEnter` runs once. */
  setReady(onEnter: () => void): void;
  /** Shows an error, with a retry button when `retry` is given. */
  setError(message: string, retry?: () => void): void;
  /** Fades the gate out and removes it. */
  close(): void;
}

export function createGate(root: HTMLElement): Gate {
  const gate = el('div', 'gate');
  gate.setAttribute('role', 'dialog');
  gate.setAttribute('aria-modal', 'true');
  gate.setAttribute('aria-labelledby', 'gate-title');
  gate.style.setProperty('--gate-fade', `${config.ui.gateFadeMs}ms`);

  const inner = el('div', 'gate__inner');
  const title = el('h1', 'gate__title', strings.gate.title);
  title.id = 'gate-title';
  const progress = el('p', 'gate__progress', strings.gate.loading);
  progress.setAttribute('aria-live', 'polite');
  const enter = el('button', 'gate__enter', strings.gate.enter);
  enter.type = 'button';
  enter.disabled = true;
  const error = el('div', 'gate__error');
  error.setAttribute('role', 'alert');
  const message = el('p', 'gate__message');
  const retry = el('button', 'gate__retry', strings.gate.retry);
  retry.type = 'button';
  error.append(message, retry);
  inner.append(
    title,
    el('p', 'gate__tagline', strings.gate.tagline),
    el('p', 'gate__hint', strings.gate.headphones),
    progress,
    enter,
    error,
  );
  gate.append(inner);
  gate.dataset.state = 'loading';
  root.append(gate);

  let onEnter: (() => void) | null = null;

  const fire = (): void => {
    const run = onEnter;
    if (run === null) return;
    onEnter = null;
    enter.disabled = true;
    run();
  };

  // preventDefault stops a focused button from also firing a click.
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Enter' || e.repeat || onEnter === null) return;
    e.preventDefault();
    fire();
  };
  document.addEventListener('keydown', onKey);
  enter.addEventListener('click', fire);

  return {
    setProgress(text) {
      onEnter = null;
      enter.disabled = true;
      progress.textContent = text;
      gate.dataset.state = 'loading';
    },
    setReady(cb) {
      onEnter = cb;
      enter.disabled = false;
      gate.dataset.state = 'ready';
      enter.focus();
    },
    setError(text, onRetry) {
      onEnter = null;
      enter.disabled = true;
      message.textContent = text;
      retry.hidden = onRetry === undefined;
      retry.onclick = onRetry ?? null;
      gate.dataset.state = 'error';
    },
    close() {
      onEnter = null;
      document.removeEventListener('keydown', onKey);
      gate.classList.add('is-closing');
      setTimeout(() => gate.remove(), config.ui.gateFadeMs);
    },
  };
}
