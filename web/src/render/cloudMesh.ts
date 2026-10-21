import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicNodeMaterial, SRGBColorSpace } from 'three/webgpu';
import { mix, normalGeometry, positionGeometry, positionLocal, uniform, vec3, vec4 } from 'three/tsl';
import { config } from '../config';
import { buildClouds, type CloudArea } from './clouds';

/**
 * The cloud layer: one InstancedMesh of flat boxes, unlit, darker on the underside.
 * The cells are fixed instance matrices; the drift runs in the vertex shader from one uniform, wrapping
 * each block (by its centre) around the layer's width. The CPU only advances that uniform.
 */
export class Clouds {
  readonly object: InstancedMesh;
  private readonly geometry: BoxGeometry;
  private readonly material: MeshBasicNodeMaterial;
  private readonly offset = uniform(0);
  private readonly width: number;
  private motion = 1;
  private last: number | null = null;

  constructor(area: CloudArea) {
    const c = config.render;
    const layer = buildClouds(area, { block: c.cloudBlock, scale: c.cloudScale, threshold: c.cloudThreshold, seed: c.cloudSeed });
    this.width = layer.width;
    this.geometry = new BoxGeometry(c.cloudBlock, c.cloudThickness, c.cloudBlock);

    const material = new MeshBasicNodeMaterial();
    const shade = mix(c.cloudShade, 1, normalGeometry.y.mul(0.5).add(0.5));
    const white = new Color().setHex(c.cloudColor, SRGBColorSpace);
    material.colorNode = vec4(vec3(white.r, white.g, white.b).mul(shade), 1);
    // positionLocal already includes the instance matrix, so a block's centre is that minus the vertex's own offset.
    const centreX = positionLocal.x.sub(positionGeometry.x);
    const wrapped = centreX.sub(layer.minX).add(this.offset).mod(layer.width).add(layer.minX);
    material.positionNode = vec3(wrapped.add(positionGeometry.x), positionLocal.y, positionLocal.z);
    this.material = material;

    const count = layer.cells.length / 2;
    this.object = new InstancedMesh(this.geometry, material, count);
    const m = new Matrix4();
    for (let i = 0; i < count; i++) {
      m.makeTranslation(layer.cells[2 * i] ?? 0, c.cloudHeight, layer.cells[2 * i + 1] ?? 0);
      this.object.setMatrixAt(i, m);
    }
    this.object.instanceMatrix.needsUpdate = true;
    this.object.frustumCulled = false; // the drift moves blocks away from the bounds computed from the matrices
  }

  /** 0..1: scales the drift (reduced motion). */
  setMotionScale(s: number): void {
    this.motion = Math.min(Math.max(s, 0), 1);
  }

  update(timeSeconds: number): void {
    if (this.last !== null) this.offset.value = (this.offset.value + (timeSeconds - this.last) * config.render.cloudSpeed * this.motion) % this.width;
    this.last = timeSeconds;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.object.dispose();
  }
}
