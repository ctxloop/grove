// Pure math for touch controls. Screen coordinates: x grows right, y grows down.

export interface JoystickOutput {
  /** Right is +1. */
  moveX: number;
  /** Up on screen is +1 (forward). */
  moveZ: number;
  sprint: boolean;
}

/** Which half of an element a touch started in. `x` is relative to the element's left edge. */
export function sideOf(x: number, width: number): 'left' | 'right' {
  return x < width / 2 ? 'left' : 'right';
}

/**
 * Joystick vector for a finger offset (dx, dy) in pixels from the origin. The length is
 * distance / radius clamped to 1, rescaled so it grows from 0 right after the dead zone.
 * Sprint is on once the finger reaches `sprintAt` of the radius (unclamped distance).
 */
export function joystick(
  dx: number,
  dy: number,
  radius: number,
  deadZone: number,
  sprintAt: number,
): JoystickOutput {
  const ratio = Math.hypot(dx, dy) / radius;
  if (ratio <= deadZone) return { moveX: 0, moveZ: 0, sprint: false };
  const strength = Math.min((ratio - deadZone) / (1 - deadZone), 1);
  const scale = strength / (ratio * radius);
  return { moveX: dx * scale, moveZ: -dy * scale, sprint: ratio >= sprintAt };
}

/** Offset of the knob from the ring center: the finger offset limited to the ring radius. */
export function knobOffset(dx: number, dy: number, radius: number): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  if (len <= radius) return { x: dx, y: dy };
  const k = radius / len;
  return { x: dx * k, y: dy * k };
}

/** Look change for a finger drag of (dx, dy) pixels. Drag right turns right, drag up looks up. */
export function lookDelta(dx: number, dy: number, sensitivity: number): { yaw: number; pitch: number } {
  return { yaw: -dx * sensitivity, pitch: -dy * sensitivity };
}

/** A touch is a tap when it was short and the finger barely moved. */
export function isTap(durationMs: number, movedPx: number, maxMs: number, slopPx: number): boolean {
  return durationMs <= maxMs && movedPx < slopPx;
}
