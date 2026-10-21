// The Web Audio listener (docs/architecture.md §5). It stays at the origin;
// voices follow the camera through their panner pairs instead.

/** Listener position, forward and up unit vectors, in world meters. */
export interface ListenerPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly fx: number;
  readonly fy: number;
  readonly fz: number;
  readonly ux: number;
  readonly uy: number;
  readonly uz: number;
}

/** Uses the AudioParam API where it exists and the deprecated setters otherwise (older Firefox). */
export function setListener(listener: AudioListener, p: ListenerPose): void {
  if (listener.positionX !== undefined) {
    listener.positionX.value = p.x;
    listener.positionY.value = p.y;
    listener.positionZ.value = p.z;
    listener.forwardX.value = p.fx;
    listener.forwardY.value = p.fy;
    listener.forwardZ.value = p.fz;
    listener.upX.value = p.ux;
    listener.upY.value = p.uy;
    listener.upZ.value = p.uz;
  } else {
    listener.setPosition(p.x, p.y, p.z);
    listener.setOrientation(p.fx, p.fy, p.fz, p.ux, p.uy, p.uz);
  }
}

/** The fixed listener: voices are placed in the camera's frame (audio/spatial.ts), so it never moves. */
export const ORIGIN: ListenerPose = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0 };
