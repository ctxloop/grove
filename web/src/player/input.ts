// Device-independent input. Movement logic only ever sees an InputFrame.

export interface InputFrame {
  /** Strafe, right is +1. */
  moveX: number;
  /** Forward is +1. */
  moveZ: number;
  /** Radians to add to yaw this frame (positive turns left). */
  lookYaw: number;
  /** Radians to add to pitch this frame (positive looks up). */
  lookPitch: number;
  sprint: boolean;
  /** Primary action happened since the last poll. */
  select: boolean;
}

export interface InputSource {
  poll(): InputFrame;
  dispose(): void;
}

export const NO_INPUT: InputFrame = Object.freeze({
  moveX: 0,
  moveZ: 0,
  lookYaw: 0,
  lookPitch: 0,
  sprint: false,
  select: false,
});

/** Sums look, sums move then clamps its length to 1, ORs the flags. */
export function combineInputs(sources: readonly InputSource[]): InputSource {
  return {
    poll(): InputFrame {
      let moveX = 0;
      let moveZ = 0;
      let lookYaw = 0;
      let lookPitch = 0;
      let sprint = false;
      let select = false;
      for (const s of sources) {
        const f = s.poll();
        moveX += f.moveX;
        moveZ += f.moveZ;
        lookYaw += f.lookYaw;
        lookPitch += f.lookPitch;
        sprint ||= f.sprint;
        select ||= f.select;
      }
      const len = Math.hypot(moveX, moveZ);
      if (len > 1) {
        moveX /= len;
        moveZ /= len;
      }
      return { moveX, moveZ, lookYaw, lookPitch, sprint, select };
    },
    dispose(): void {
      for (const s of sources) s.dispose();
    },
  };
}
