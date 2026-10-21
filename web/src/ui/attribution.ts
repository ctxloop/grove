import { config } from '../config';
import type { Attribution } from '../world/schema';
import { buildSections, type CreditRow, type CreditSection } from './attribution-model';
import { el, isolatePointer } from './dom';
import { strings } from './strings';
import './styles.css';

export interface AttributionPage {
  open(): void;
  close(): void;
  readonly isOpen: boolean;
}

export interface AttributionOptions {
  load: () => Promise<Attribution>;
  biomeName: (id: number) => string;
}

const TITLE_ID = 'grove-credits-title';

function link(text: string, href: string, className: string): HTMLAnchorElement {
  const a = el('a', className, text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

function renderRow(row: CreditRow): HTMLLIElement {
  const li = el('li', 'credits__row');
  li.append(el('span', 'credits__track', row.title), el('span', 'credits__artist', row.artist));
  const meta = el('span', 'credits__meta');
  meta.append(
    row.licenseUrl === null
      ? el('span', 'credits__license', row.licenseName)
      : link(row.licenseName, row.licenseUrl, 'credits__license'),
  );
  if (row.fmaUrl !== null) meta.append(link(strings.attribution.fmaLink, row.fmaUrl, 'credits__fma'));
  li.append(meta);
  return li;
}

export function createAttributionPage(root: HTMLElement, opts: AttributionOptions): AttributionPage {
  const overlay = el('div', 'credits');
  overlay.hidden = true;
  isolatePointer(overlay);

  const dialog = el('div', 'credits__dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', TITLE_ID);
  // Focusable so a click inside keeps keyboard focus (and Esc) in the dialog.
  dialog.tabIndex = -1;

  // Zero-size focus sentinels keep Tab inside the dialog without scanning thousands of links.
  const sentinelStart = el('div', 'credits__sentinel');
  const sentinelEnd = el('div', 'credits__sentinel');
  sentinelStart.tabIndex = sentinelEnd.tabIndex = 0;

  const header = el('header', 'credits__header');
  const title = el('h2', 'credits__title', strings.attribution.title);
  title.id = TITLE_ID;
  const count = el('span', 'credits__count');
  const closeButton = el('button', 'credits__close', strings.attribution.closeGlyph);
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', strings.attribution.close);
  header.append(title, count, closeButton);

  const intro = el('p', 'credits__intro', strings.attribution.intro);
  const status = el('div', 'credits__status');
  status.setAttribute('role', 'status');
  const statusText = el('span', 'credits__status-text');
  const retryButton = el('button', 'credits__retry', strings.attribution.retry);
  retryButton.type = 'button';
  status.append(statusText, retryButton);
  const body = el('div', 'credits__body');

  dialog.append(sentinelStart, header, intro, status, body, sentinelEnd);
  overlay.append(dialog);
  root.append(overlay);

  let opened = false;
  let loading = false;
  let loaded = false;
  let renderToken = 0;
  let lastLink: HTMLElement = closeButton;
  let returnFocus: Element | null = null;

  const setStatus = (text: string | null, canRetry = false): void => {
    status.hidden = text === null;
    statusText.textContent = text ?? '';
    retryButton.hidden = !canRetry;
  };

  /** Appends rows `chunk` at a time, one slice per animation frame, so the page stays responsive. */
  const renderSections = (sections: CreditSection[]): void => {
    const token = ++renderToken;
    body.replaceChildren();
    let si = 0;
    let ri = 0;
    let list: HTMLUListElement | null = null;
    const step = (): void => {
      if (token !== renderToken) return;
      let budget = config.ui.attributionChunk;
      let lastRow: HTMLElement | null = null;
      while (budget > 0 && si < sections.length) {
        const section = sections[si];
        if (section === undefined) break;
        if (list === null) {
          const block = el('section', 'credits__section');
          const heading = el('h3', 'credits__heading', section.name);
          heading.append(el('span', 'credits__count', strings.attribution.tracks(section.rows.length)));
          list = el('ul', 'credits__list');
          block.append(heading, list);
          body.append(block);
          budget--;
        }
        const rowFrag = document.createDocumentFragment();
        for (const row of section.rows.slice(ri, ri + budget)) {
          lastRow = renderRow(row);
          rowFrag.append(lastRow);
          ri++;
          budget--;
        }
        list.append(rowFrag);
        if (ri >= section.rows.length) {
          si++;
          ri = 0;
          list = null;
        }
      }
      lastLink = lastRow?.querySelector<HTMLElement>('a:last-of-type') ?? lastLink;
      if (si < sections.length) requestAnimationFrame(step);
    };
    step();
  };

  const load = (): void => {
    if (loaded || loading) return;
    loading = true;
    setStatus(strings.attribution.loading);
    opts.load().then(
      (attribution) => {
        loading = false;
        loaded = true;
        setStatus(null);
        count.textContent = strings.attribution.tracks(attribution.tracks.length);
        renderSections(buildSections(attribution, opts.biomeName));
      },
      () => {
        loading = false;
        setStatus(strings.attribution.failed, true);
      },
    );
  };

  const close = (): void => {
    if (!opened) return;
    opened = false;
    overlay.hidden = true;
    if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus();
    returnFocus = null;
  };

  const open = (): void => {
    if (opened) return;
    opened = true;
    returnFocus = document.activeElement;
    // A locked pointer would hide the cursor over the dialog.
    if (document.pointerLockElement !== null) document.exitPointerLock();
    overlay.hidden = false;
    load();
    closeButton.focus();
  };

  closeButton.addEventListener('click', close);
  retryButton.addEventListener('click', load);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  sentinelStart.addEventListener('focus', () => lastLink.focus());
  sentinelEnd.addEventListener('focus', () => closeButton.focus());
  // Keys typed in the dialog never reach the player's window-level handlers.
  overlay.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });

  return {
    open,
    close,
    get isOpen() {
      return opened;
    },
  };
}

export function createCreditsLink(root: HTMLElement, onOpen: () => void): { dispose(): void } {
  const button = el('button', 'credits-link', strings.attribution.link);
  button.type = 'button';
  isolatePointer(button);
  button.addEventListener('click', onOpen);
  root.append(button);
  return {
    dispose() {
      button.remove();
    },
  };
}
