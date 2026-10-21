import { config } from '../config';
import { el, isolatePointer } from './dom';
import { deliverLink, linkWith, type ShareTargets } from './share-model';
import { strings } from './strings';
import './styles.css';

export interface ShareUi {
  dispose(): void;
}

export interface ShareOptions {
  /** The URL hash of the current position and heading. */
  hash: () => string;
  /** Touch devices get the system share sheet when there is one. */
  touch: boolean;
}

/** The copy-link button under the search button. */
export function createShare(root: HTMLElement, opts: ShareOptions): ShareUi {
  const box = el('div', 'share');
  const button = el('button', 'share__button', strings.share.copy);
  button.type = 'button';
  // Shown with the link, selected, when neither the share sheet nor the clipboard took it.
  const field = el('input', 'share__field');
  field.readOnly = true;
  field.hidden = true;
  field.setAttribute('aria-label', strings.share.field);
  const status = el('span', 'share__status');
  status.setAttribute('role', 'status');
  box.append(button, field, status);
  isolatePointer(box);
  root.append(box);

  const targets: ShareTargets = {
    share:
      opts.touch && typeof navigator.share === 'function'
        ? (url) => navigator.share({ title: strings.gate.title, url })
        : undefined,
    copy: (text) => navigator.clipboard.writeText(text),
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const confirm = (): void => {
    clearTimeout(timer);
    button.textContent = status.textContent = strings.share.copied;
    timer = setTimeout(() => {
      button.textContent = strings.share.copy;
      status.textContent = '';
    }, config.ui.copiedMs);
  };

  button.addEventListener('click', () => {
    const url = linkWith(location.href, opts.hash());
    field.hidden = true;
    void deliverLink(url, targets).then((outcome) => {
      if (outcome === 'copied') confirm();
      if (outcome !== 'manual') return;
      field.value = url;
      field.hidden = false;
      field.focus();
      field.select();
    });
  });
  field.addEventListener('blur', () => {
    field.hidden = true;
  });

  return {
    dispose() {
      clearTimeout(timer);
      box.remove();
    },
  };
}
