import { config } from '../config';
import type { InputFrame, InputSource } from './input';

export interface KeyboardMouseInput extends InputSource {
  readonly locked: boolean;
  onLockChange(cb: (locked: boolean) => void): () => void;
  /** Asks for pointer lock; call it from a user gesture. Falls back to drag-to-look if refused. */
  requestLock(): void;
  /** Disabled until the user passes the Enter gate. */
  setEnabled(enabled: boolean): void;
}

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const SPRINT = new Set(['ShiftLeft', 'ShiftRight']);

function isMoveKey(code: string): boolean {
  return FORWARD.has(code) || BACK.has(code) || LEFT.has(code) || RIGHT.has(code) || SPRINT.has(code);
}

function isTextField(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

export function createKeyboardMouse(target: HTMLElement): KeyboardMouseInput {
  const keys = new Set<string>();
  const listeners = new Set<(locked: boolean) => void>();
  let enabled = false;
  let locked = false;
  // Pointer lock can be refused (embedded pages, some browsers). Then the
  // mouse looks by dragging. In both modes only a click without a drag selects,
  // so releasing the button after dragging to look never picks a tree.
  let lockUnavailable = false;
  // Once the lock has been granted, a refusal is temporary: browsers refuse a lock right after
  // the user leaves it with Esc, and the next click asks again.
  let granted = false;
  let dragged = 0;
  let dYaw = 0;
  let dPitch = 0;
  let select = false;

  const any = (set: Set<string>): boolean => {
    for (const k of set) if (keys.has(k)) return true;
    return false;
  };

  const reset = (): void => {
    keys.clear();
    dYaw = 0;
    dPitch = 0;
    select = false;
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!enabled || !isMoveKey(e.code) || isTextField(e.target)) return;
    e.preventDefault();
    keys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    // Always release, even if focus moved into a text field while the key was held.
    keys.delete(e.code);
  };
  // Touch taps fire a click too; touch.ts handles those, so they must not select here.
  let lastPointerType = 'mouse';
  const onPointerDown = (e: PointerEvent): void => {
    lastPointerType = e.pointerType;
  };
  const onClick = (): void => {
    if (!enabled || lastPointerType === 'touch') return;
    if ((locked || lockUnavailable) && dragged < config.player.clickSlop) select = true;
    else if (!lockUnavailable) requestLock();
  };
  const onMouseDown = (): void => {
    dragged = 0;
  };
  const onMouseMove = (e: MouseEvent): void => {
    if (!locked && !(lockUnavailable && enabled && (e.buttons & 1) === 1)) return;
    if ((e.buttons & 1) === 1) dragged += Math.abs(e.movementX) + Math.abs(e.movementY);
    dYaw -= e.movementX * config.player.mouseSensitivity;
    dPitch -= e.movementY * config.player.mouseSensitivity;
  };
  const requestLock = (): void => {
    // iPhone Safari has no pointer lock at all.
    if (typeof target.requestPointerLock !== 'function') {
      lockUnavailable = true;
      return;
    }
    // Older browsers return undefined instead of a promise; they report
    // failure through pointerlockerror instead.
    const p: Promise<void> | undefined = target.requestPointerLock() as Promise<void> | undefined;
    p?.catch(onLockError);
  };
  const onLockError = (): void => {
    if (!granted) lockUnavailable = true;
  };
  const onLockChange = (): void => {
    const now = document.pointerLockElement === target;
    if (now === locked) return;
    locked = now;
    if (now) granted = true;
    else reset();
    for (const cb of listeners) cb(now);
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', reset);
  window.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('pointerlockerror', onLockError);
  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('mousedown', onMouseDown);
  target.addEventListener('click', onClick);

  return {
    get locked(): boolean {
      return locked;
    },
    requestLock() {
      if (!lockUnavailable) requestLock();
    },
    onLockChange(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    setEnabled(v) {
      enabled = v;
      if (!v) reset();
    },
    poll(): InputFrame {
      const frame: InputFrame = {
        moveX: (any(RIGHT) ? 1 : 0) - (any(LEFT) ? 1 : 0),
        moveZ: (any(FORWARD) ? 1 : 0) - (any(BACK) ? 1 : 0),
        lookYaw: dYaw,
        lookPitch: dPitch,
        sprint: any(SPRINT),
        select,
      };
      dYaw = 0;
      dPitch = 0;
      select = false;
      return frame;
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', reset);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('pointerlockerror', onLockError);
      target.removeEventListener('pointerdown', onPointerDown);
      target.removeEventListener('mousedown', onMouseDown);
      target.removeEventListener('click', onClick);
      listeners.clear();
      reset();
    },
  };
}
