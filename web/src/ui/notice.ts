import { el } from './dom';
import { strings } from './strings';
import './styles.css';

export interface NoticeAction {
  label: string;
  run: () => void;
}

/** Shows a dismissable banner at the top center. Running the action closes it. */
export function showNotice(
  root: HTMLElement,
  message: string,
  action?: NoticeAction,
): { close(): void } {
  let stack = root.querySelector<HTMLElement>(':scope > .notice-stack');
  if (stack === null) {
    stack = el('div', 'notice-stack');
    root.append(stack);
  }

  const notice = el('div', 'notice');
  notice.setAttribute('role', 'status');
  notice.append(el('span', 'notice__message', message));

  const close = (): void => {
    notice.remove();
  };

  if (action) {
    const button = el('button', 'notice__action', action.label);
    button.type = 'button';
    button.addEventListener('click', () => {
      close();
      action.run();
    });
    notice.append(button);
  }

  const dismiss = el('button', 'notice__close', strings.notice.dismissGlyph);
  dismiss.type = 'button';
  dismiss.setAttribute('aria-label', strings.notice.dismiss);
  dismiss.addEventListener('click', close);
  notice.append(dismiss);

  stack.append(notice);
  return { close };
}
