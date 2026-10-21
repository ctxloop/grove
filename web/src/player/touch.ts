import { config } from '../config';
import type { InputFrame, InputSource } from './input';
import { isTap, joystick, knobOffset, lookDelta, sideOf } from './touch-math';

export interface TouchInput extends InputSource {
  /** Disabled until the user passes the Enter gate. */
  setEnabled(enabled: boolean): void;
}

interface Stick {
  id: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
}

interface Look {
  id: number;
  x: number;
  y: number;
  startedAt: number;
  moved: number;
}

const OVERLAY_STYLE = 'position:fixed;pointer-events:none;display:none;border-radius:50%;box-sizing:border-box;z-index:10;';

function makeOverlay(parent: HTMLElement, diameter: number, extraStyle: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `${OVERLAY_STYLE}width:${diameter}px;height:${diameter}px;${extraStyle}`;
  parent.appendChild(el);
  return el;
}

function place(el: HTMLElement, centerX: number, centerY: number, diameter: number): void {
  el.style.left = `${centerX - diameter / 2}px`;
  el.style.top = `${centerY - diameter / 2}px`;
}

/**
 * Touch controls on top of `target`: a floating joystick on the left half, drag-to-look and
 * tap-to-select on the right half. Only `pointerType === 'touch'` is handled, so the mouse is untouched.
 */
export function createTouchInput(target: HTMLElement): TouchInput {
  const p = config.player;
  const ringSize = p.joystickRadius * 2;
  const knobSize = p.joystickRadius * 0.8;
  const host = target.parentElement ?? document.body;
  const ring = makeOverlay(host, ringSize, 'border:2px solid rgba(255,255,255,0.35);');
  const knob = makeOverlay(host, knobSize, 'background:rgba(255,255,255,0.35);');

  let enabled = false;
  let stick: Stick | null = null;
  let look: Look | null = null;
  let dYaw = 0;
  let dPitch = 0;
  let select = false;

  const showStick = (s: Stick | null): void => {
    ring.style.display = s ? 'block' : 'none';
    knob.style.display = s ? 'block' : 'none';
    if (!s) return;
    const k = knobOffset(s.x - s.originX, s.y - s.originY, p.joystickRadius);
    place(ring, s.originX, s.originY, ringSize);
    place(knob, s.originX + k.x, s.originY + k.y, knobSize);
  };

  const reset = (): void => {
    stick = null;
    look = null;
    dYaw = 0;
    dPitch = 0;
    select = false;
    showStick(null);
  };

  const onDown = (e: PointerEvent): void => {
    if (!enabled || e.pointerType !== 'touch') return;
    e.preventDefault();
    const rect = target.getBoundingClientRect();
    if (sideOf(e.clientX - rect.left, rect.width) === 'left') {
      if (stick) return;
      stick = { id: e.pointerId, originX: e.clientX, originY: e.clientY, x: e.clientX, y: e.clientY };
      showStick(stick);
    } else {
      if (look) return;
      look = { id: e.pointerId, x: e.clientX, y: e.clientY, startedAt: e.timeStamp, moved: 0 };
    }
  };

  const onMove = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return;
    if (stick && e.pointerId === stick.id) {
      e.preventDefault();
      stick.x = e.clientX;
      stick.y = e.clientY;
      showStick(stick);
    } else if (look && e.pointerId === look.id) {
      e.preventDefault();
      const dx = e.clientX - look.x;
      const dy = e.clientY - look.y;
      const d = lookDelta(dx, dy, p.touchLookSensitivity);
      dYaw += d.yaw;
      dPitch += d.pitch;
      look.moved += Math.hypot(dx, dy);
      look.x = e.clientX;
      look.y = e.clientY;
    }
  };

  const onUp = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return;
    if (stick && e.pointerId === stick.id) {
      stick = null;
      showStick(null);
    } else if (look && e.pointerId === look.id) {
      if (isTap(e.timeStamp - look.startedAt, look.moved, p.tapMaxMs, p.clickSlop)) select = true;
      look = null;
    }
  };

  const onCancel = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') reset();
  };

  target.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('blur', reset);

  return {
    setEnabled(v) {
      enabled = v;
      if (!v) reset();
    },
    poll(): InputFrame {
      const j = stick
        ? joystick(stick.x - stick.originX, stick.y - stick.originY, p.joystickRadius, p.joystickDeadZone, p.joystickSprintAt)
        : { moveX: 0, moveZ: 0, sprint: false };
      const frame: InputFrame = {
        moveX: j.moveX,
        moveZ: j.moveZ,
        lookYaw: dYaw,
        lookPitch: dPitch,
        sprint: j.sprint,
        select,
      };
      dYaw = 0;
      dPitch = 0;
      select = false;
      return frame;
    },
    dispose() {
      target.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', reset);
      reset();
      ring.remove();
      knob.remove();
    },
  };
}
