import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createKeyboardMouse } from './keyboard-mouse';

// Stand-ins for the canvas and the document's pointer lock (the tests run without a DOM).
class FakeDocument extends EventTarget {
  pointerLockElement: EventTarget | null = null;
}

let doc: FakeDocument;
let target: EventTarget & { requestPointerLock: () => Promise<void> };
/** What the next requestPointerLock does: grant the lock or refuse it. */
let grant: boolean;

beforeEach(() => {
  doc = new FakeDocument();
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', new EventTarget());
  grant = true;
  target = Object.assign(new EventTarget(), {
    requestPointerLock: vi.fn(() => {
      if (!grant) return Promise.reject(new DOMException('refused', 'SecurityError'));
      doc.pointerLockElement = target;
      doc.dispatchEvent(new Event('pointerlockchange'));
      return Promise.resolve();
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const create = () => createKeyboardMouse(target as unknown as HTMLElement);

/** The user presses Esc: the browser drops the lock. */
function escape(): void {
  doc.pointerLockElement = null;
  doc.dispatchEvent(new Event('pointerlockchange'));
}

async function click(): Promise<void> {
  target.dispatchEvent(new Event('click'));
  await Promise.resolve();
}

describe('createKeyboardMouse pointer lock', () => {
  it('locks again on a later click when the click right after Esc is refused', async () => {
    const input = create();
    input.setEnabled(true);
    input.requestLock();
    expect(input.locked).toBe(true);

    escape();
    expect(input.locked).toBe(false);
    // Browsers refuse a lock right after the user leaves it with Esc.
    grant = false;
    await click();
    expect(input.locked).toBe(false);

    grant = true;
    await click();
    expect(input.locked).toBe(true);
    expect(input.poll().select).toBe(false);
  });

  it('falls back to drag-to-look when the lock is refused before it was ever granted', async () => {
    grant = false;
    const input = create();
    input.setEnabled(true);
    input.requestLock();
    await Promise.resolve();

    await click();
    expect(target.requestPointerLock).toHaveBeenCalledTimes(1);
    expect(input.poll().select).toBe(true);
  });
});
