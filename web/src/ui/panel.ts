import { config } from '../config';
import { el, isolatePointer } from './dom';
import { strings } from './strings';
import type { TreeInfo } from './tree-info';
import './styles.css';

export type PanelState = 'idle' | 'loading' | 'playing' | 'error';

export interface InfoPanel {
  /**
   * Fills and shows the card. Call `setState` afterwards to set the status line. The card hides
   * itself after `config.ui.panelMs`; the tree stays selected, as only the close button deselects it.
   */
  show(info: TreeInfo): void;
  hide(): void;
  setState(state: PanelState): void;
  /** Called when the player closes the card with its close button. */
  onClose(cb: () => void): () => void;
}

function link(className: string, text?: string): HTMLAnchorElement {
  const a = el('a', className, text);
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

export function createInfoPanel(root: HTMLElement): InfoPanel {
  const panel = el('section', 'panel');
  panel.hidden = true;
  panel.dataset.state = 'idle';
  panel.setAttribute('aria-label', strings.panel.region);
  panel.setAttribute('aria-live', 'polite');

  const title = el('h2', 'panel__title');
  const artist = el('p', 'panel__artist');

  const rows = el('dl', 'panel__rows');
  const albumLabel = el('dt', '', strings.panel.album);
  const album = el('dd', '');
  const biomeLabel = el('dt', '', strings.panel.biome);
  const biome = el('dd', '');
  const licenseLabel = el('dt', '', strings.panel.license);
  const license = el('dd', '');
  const licenseLink = link('panel__license');
  const licenseText = el('span', 'panel__license');
  license.append(licenseLink, licenseText);
  rows.append(albumLabel, album, biomeLabel, biome, licenseLabel, license);

  const fma = link('panel__fma', strings.panel.fmaLink);
  const status = el('p', 'panel__status', strings.panel.status.idle);
  const close = el('button', 'panel__close', strings.panel.closeGlyph);
  close.type = 'button';
  close.setAttribute('aria-label', strings.panel.close);
  isolatePointer(close);
  const closeListeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hide = (): void => {
    clearTimeout(timer);
    panel.hidden = true;
  };
  const hideLater = (): void => {
    clearTimeout(timer);
    timer = setTimeout(hide, config.ui.panelMs);
  };
  // While the pointer is over the card (pointer unlocked, e.g. to follow a link), it stays.
  panel.addEventListener('pointerenter', () => clearTimeout(timer));
  panel.addEventListener('pointerleave', () => {
    if (!panel.hidden) hideLater();
  });
  close.addEventListener('click', () => {
    hide();
    for (const cb of [...closeListeners]) cb();
  });

  panel.append(close, title, artist, rows, fma, status);
  root.append(panel);

  return {
    show(info) {
      title.textContent = info.title;
      artist.textContent = info.artist;
      albumLabel.hidden = album.hidden = info.album === null;
      album.textContent = info.album ?? '';
      biome.textContent =
        info.grove === null ? info.biome : strings.panel.place(info.biome, info.grove);
      licenseLink.hidden = info.licenseUrl === null;
      licenseText.hidden = info.licenseUrl !== null;
      if (info.licenseUrl === null) {
        licenseText.textContent = info.licenseName;
      } else {
        licenseLink.textContent = info.licenseName;
        licenseLink.href = info.licenseUrl;
      }
      fma.href = info.fmaUrl;
      panel.hidden = false;
      hideLater();
    },
    hide,
    setState(state) {
      panel.dataset.state = state;
      status.textContent = strings.panel.status[state];
    },
    onClose(cb) {
      closeListeners.add(cb);
      return () => {
        closeListeners.delete(cb);
      };
    },
  };
}
