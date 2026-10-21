// What the copy-link button does with a link. Pure: the browser APIs come in as functions.

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'manual';

export interface ShareTargets {
  /** The system share sheet; given only on touch devices that have one. */
  readonly share?: ((url: string) => Promise<void>) | undefined;
  /** The clipboard; may throw or reject (no secure context, permission denied). */
  readonly copy: (text: string) => Promise<void>;
}

/** Hands `url` to the share sheet, else the clipboard; 'manual' means both failed and the user copies it by hand. */
export async function deliverLink(url: string, to: ShareTargets): Promise<ShareOutcome> {
  if (to.share !== undefined) {
    try {
      await to.share(url);
      return 'shared';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await to.copy(url);
    return 'copied';
  } catch {
    return 'manual';
  }
}

/** `href` with its hash replaced by `hash`. */
export function linkWith(href: string, hash: string): string {
  const u = new URL(href);
  u.hash = hash;
  return u.href;
}
