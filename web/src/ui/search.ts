import { config } from '../config';
import type { SearchHit } from '../world/search';
import { el, isolatePointer } from './dom';
import { createLatest, moveHighlight } from './search-model';
import { strings } from './strings';
import './styles.css';
import { isTextEntry } from './volume';

export interface SearchUi {
  open(): void;
  close(): void;
  readonly isOpen: boolean;
  dispose(): void;
}

export interface SearchOptions {
  /** Resolves the hits for a query; the first call may take a moment. Rejects on load failure. */
  search: (query: string) => Promise<readonly SearchHit[]>;
  biomeName: (id: number) => string;
  /** The player picked a hit; the UI closes itself before calling this. */
  onPick: (hit: SearchHit) => void;
}

const LIST_ID = 'grove-search-results';
const optionId = (i: number): string => `grove-search-option-${i}`;

export function createSearch(root: HTMLElement, opts: SearchOptions): SearchUi {
  const button = el('button', 'search-button', strings.search.open);
  button.type = 'button';
  isolatePointer(button);

  const overlay = el('div', 'search');
  overlay.hidden = true;
  isolatePointer(overlay);

  const dialog = el('div', 'search__dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', strings.search.dialog);

  const input = el('input', 'search__input');
  input.type = 'search';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = strings.search.input;
  input.setAttribute('aria-label', strings.search.input);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', LIST_ID);
  input.setAttribute('aria-expanded', 'false');

  const status = el('div', 'search__status');
  status.setAttribute('role', 'status');
  status.hidden = true;

  const list = el('ul', 'search__list');
  list.id = LIST_ID;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', strings.search.results);
  list.hidden = true;

  const hint = el('div', 'search__hint', strings.search.hint);

  dialog.append(input, status, list, hint);
  overlay.append(dialog);
  root.append(button, overlay);

  const latest = createLatest();
  let opened = false;
  let hits: readonly SearchHit[] = [];
  let highlight = -1;
  let timer: number | undefined;
  let returnFocus: Element | null = null;

  const setStatus = (text: string | null): void => {
    status.hidden = text === null;
    status.textContent = text ?? '';
  };

  const setHighlight = (index: number): void => {
    highlight = index;
    list.querySelectorAll('.search__option').forEach((node, i) => {
      node.setAttribute('aria-selected', String(i === index));
    });
    if (index >= 0) {
      input.setAttribute('aria-activedescendant', optionId(index));
      list.children[index]?.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  };

  const render = (next: readonly SearchHit[]): void => {
    hits = next;
    list.replaceChildren(
      ...next.map((hit, i) => {
        const li = el('li', 'search__option');
        li.id = optionId(i);
        li.setAttribute('role', 'option');
        li.dataset.index = String(i);
        const text = el('span', 'search__text');
        text.append(el('span', 'search__title', hit.title), el('span', 'search__artist', hit.artist));
        li.append(text, el('span', 'search__biome', opts.biomeName(hit.biome)));
        return li;
      }),
    );
    list.hidden = next.length === 0;
    input.setAttribute('aria-expanded', String(next.length > 0));
    setHighlight(next.length > 0 ? 0 : -1);
  };

  const close = (restoreFocus = true): void => {
    if (!opened) return;
    opened = false;
    window.clearTimeout(timer);
    timer = undefined;
    latest.next();
    overlay.hidden = true;
    input.value = '';
    render([]);
    setStatus(null);
    if (restoreFocus && returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus();
    else input.blur();
    returnFocus = null;
  };

  const pick = (hit: SearchHit): void => {
    close(false);
    opts.onPick(hit);
  };

  /** Runs the search for the current text; with `pickFirst`, picks the top hit once it arrives. */
  const run = (pickFirst: boolean): void => {
    window.clearTimeout(timer);
    timer = undefined;
    const query = input.value.trim();
    const token = latest.next();
    if (query === '') {
      render([]);
      setStatus(null);
      return;
    }
    setStatus(strings.search.loading);
    opts.search(query).then(
      (found) => {
        if (!latest.isCurrent(token)) return;
        render(found);
        setStatus(found.length === 0 ? strings.search.empty : null);
        const first = found[0];
        if (pickFirst && first !== undefined) pick(first);
      },
      () => {
        if (!latest.isCurrent(token)) return;
        render([]);
        setStatus(strings.search.failed);
      },
    );
  };

  const open = (): void => {
    if (opened) return;
    opened = true;
    returnFocus = document.activeElement;
    // A locked pointer would hide the cursor over the dialog.
    if (document.pointerLockElement !== null) document.exitPointerLock();
    overlay.hidden = false;
    input.focus();
  };

  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => run(false), config.ui.searchDebounceMs);
  });

  // Keys typed here never reach the player's window-level handlers.
  overlay.addEventListener('keydown', (e) => {
    e.stopPropagation();
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault();
        setHighlight(moveHighlight(highlight, e.key === 'ArrowDown' ? 1 : -1, hits.length));
        break;
      case 'Enter': {
        e.preventDefault();
        if (timer !== undefined) {
          // The text changed after the rendered rows were computed: search first.
          run(true);
          break;
        }
        const hit = hits[highlight];
        if (hit !== undefined) pick(hit);
        break;
      }
      case 'Tab':
        // The input is the only control; keep focus in the dialog.
        e.preventDefault();
        break;
    }
  });

  const rowIndex = (e: Event): number => {
    const row = (e.target as Element).closest<HTMLElement>('.search__option');
    return row === null ? -1 : Number(row.dataset.index);
  };
  list.addEventListener('click', (e) => {
    const hit = hits[rowIndex(e)];
    if (hit !== undefined) pick(hit);
  });
  list.addEventListener('mousemove', (e) => {
    const index = rowIndex(e);
    if (index >= 0 && index !== highlight) setHighlight(index);
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  button.addEventListener('click', open);

  const onWindowKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== '/' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (opened || isTextEntry(e.target as Element | null)) return;
    e.preventDefault();
    open();
  };
  window.addEventListener('keydown', onWindowKeyDown);

  return {
    open,
    close: () => close(),
    get isOpen() {
      return opened;
    },
    dispose() {
      window.removeEventListener('keydown', onWindowKeyDown);
      window.clearTimeout(timer);
      latest.next();
      button.remove();
      overlay.remove();
    },
  };
}
