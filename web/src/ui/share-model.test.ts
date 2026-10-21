import { describe, expect, it } from 'vitest';
import { deliverLink, linkWith } from './share-model';

const URL_ = 'https://example.org/#x=1.0&z=2.0&h=90';
const ok = async (): Promise<void> => {};
const fail = async (): Promise<void> => {
  throw new Error('denied');
};
const abort = async (): Promise<void> => {
  throw new DOMException('cancelled', 'AbortError');
};

describe('deliverLink', () => {
  it('uses the share sheet when there is one', async () => {
    const copied: string[] = [];
    const shared: string[] = [];
    const out = await deliverLink(URL_, {
      share: async (u) => void shared.push(u),
      copy: async (t) => void copied.push(t),
    });
    expect(out).toBe('shared');
    expect(shared).toEqual([URL_]);
    expect(copied).toEqual([]);
  });

  it('does nothing more when the sheet is cancelled', async () => {
    const copied: string[] = [];
    expect(await deliverLink(URL_, { share: abort, copy: async (t) => void copied.push(t) })).toBe('cancelled');
    expect(copied).toEqual([]);
  });

  it('falls back to the clipboard when the sheet fails', async () => {
    expect(await deliverLink(URL_, { share: fail, copy: ok })).toBe('copied');
  });

  it('copies when there is no share sheet', async () => {
    const copied: string[] = [];
    expect(await deliverLink(URL_, { copy: async (t) => void copied.push(t) })).toBe('copied');
    expect(copied).toEqual([URL_]);
  });

  it('asks for a manual copy when the clipboard rejects or throws', async () => {
    expect(await deliverLink(URL_, { copy: fail })).toBe('manual');
    const throws = (): Promise<void> => {
      throw new TypeError('no clipboard');
    };
    expect(await deliverLink(URL_, { share: fail, copy: throws })).toBe('manual');
  });
});

describe('linkWith', () => {
  it('replaces the hash and keeps the path and query', () => {
    expect(linkWith('http://localhost:5173/grove/?debug#x=0.0&z=0.0&h=0', '#x=5.0&z=-3.0&h=45')).toBe(
      'http://localhost:5173/grove/?debug#x=5.0&z=-3.0&h=45',
    );
    expect(linkWith('https://example.org/', '#x=1.0&z=2.0&h=0')).toBe('https://example.org/#x=1.0&z=2.0&h=0');
  });
});
