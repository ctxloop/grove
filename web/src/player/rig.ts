import type { PerspectiveCamera } from 'three/webgpu';
import { config } from '../config';
import type { MoveState } from './movement';

export class CameraRig {
  constructor(private readonly camera: PerspectiveCamera) {
    camera.rotation.order = 'YXZ';
  }

  apply(s: MoveState): void {
    this.camera.position.set(s.x, config.player.eyeHeight, s.z);
    this.camera.rotation.set(s.pitch, s.yaw, 0, 'YXZ');
  }
}
