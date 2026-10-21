import { BoxGeometry, InstancedMesh, MeshBasicNodeMaterial, Vector2 } from 'three/webgpu';
import { abs, color, cos, float, hash, instanceIndex, max, mix, mod, normalGeometry, positionGeometry, sin, smoothstep, uniform, varying, vec2, vec3, vec4 } from 'three/tsl';
import { config } from '../config';

const TAU = Math.PI * 2;

/**
 * Small glowing cubes drifting in a box around the player, each spinning slowly about y. One InstancedMesh:
 * each instance derives its seeds from `instanceIndex`, and the whole motion runs in the vertex shader.
 * Positions wrap around the player, so the CPU only writes the time, spin, and player uniforms per frame.
 */
export class Fireflies {
  readonly object: InstancedMesh;
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly material: MeshBasicNodeMaterial;
  private readonly time = uniform(0);
  private readonly spin = uniform(0);
  private last: number | null = null;
  private motionScale = 1;
  private readonly player = uniform(new Vector2());
  private readonly motion = uniform(1);

  constructor(private readonly maxCount: number) {
    const c = config.render;
    const side = 2 * c.fireflyRadius;
    // Independent per-instance random numbers in 0..1.
    const rnd = (k: number) => hash(instanceIndex.add(k * 104729));
    const t = this.time;

    const base = vec2(rnd(1), rnd(2)).mul(side);
    const drift = vec2(sin(t.mul(rnd(3).add(0.5).mul(c.fireflySpeed)).add(rnd(4).mul(TAU))), cos(t.mul(rnd(5).add(0.5).mul(c.fireflySpeed)).add(rnd(6).mul(TAU)))).mul(this.motion.mul(c.fireflyDrift));
    // Wrap into [-R, R) around the player: the box follows the player, fireflies stay put in the world.
    const rel = mod(base.add(drift).sub(this.player), side).sub(c.fireflyRadius);
    const bob = sin(t.mul(rnd(8).add(0.5).mul(c.fireflySpeed * 2.5)).add(rnd(9).mul(TAU))).mul(this.motion.mul(c.fireflyBob));
    const y = mix(float(c.fireflyMinHeight), float(c.fireflyMaxHeight), rnd(7)).add(bob);

    // Shrink and fade towards the box edge so the wrap-around is not visible.
    const edge = smoothstep(0.7, 1, max(abs(rel.x), abs(rel.y)).div(c.fireflyRadius)).oneMinus();
    // ...and towards the camera, so a cube that drifts past the eye does not fill the screen.
    const near = smoothstep(c.fireflyNearFade * 0.4, c.fireflyNearFade, vec3(rel.x, y.sub(config.player.eyeHeight), rel.y).length());
    const fade = edge.mul(near);
    const twinkle = mix(float(1), sin(t.mul(rnd(10).add(0.5).mul(c.fireflyTwinkle)).add(rnd(11).mul(TAU))).mul(0.5).add(0.5), this.motion.mul(0.7));
    const shade = varying(fade.mul(twinkle));

    // The cube's own vertices (not the instance matrix, which stays unset), scaled, spun about y, and placed.
    const angle = this.spin.mul(rnd(12).add(0.5)).add(rnd(13).mul(TAU));
    const cosA = cos(angle);
    const sinA = sin(angle);
    const size = fade.mul(0.5).add(0.5).mul(c.fireflySize);
    const corner = positionGeometry.mul(size);
    const spun = vec3(corner.x.mul(cosA).add(corner.z.mul(sinA)), corner.y, corner.z.mul(cosA).sub(corner.x.mul(sinA)));

    const material = new MeshBasicNodeMaterial();
    material.positionNode = spun.add(vec3(this.player.x.add(rel.x), y, this.player.y.add(rel.y)));
    // Top faces glow brightest, the underside least. The twinkle and the edge fade go into alpha, so a cube stays lime
    // against a bright sky (additive blending would turn it white there).
    const face = mix(float(0.6), float(1), normalGeometry.y.mul(0.5).add(0.5));
    material.colorNode = vec4(color(c.fireflyColor).mul(face.mul(c.fireflyIntensity)), shade);
    material.transparent = true;
    material.fog = false;
    this.material = material;

    this.object = new InstancedMesh(this.geometry, material, maxCount);
    this.object.frustumCulled = false; // positions are computed in the shader; the mesh's own bounds are meaningless
    this.object.count = 0;
    this.object.visible = false;
  }

  setCount(n: number): void {
    const count = Math.min(Math.max(Math.floor(n), 0), this.maxCount);
    this.object.count = count;
    this.object.visible = count > 0;
  }

  /** 0..1: scales the drift, bob, twinkle, and spin (reduced motion). */
  setMotionScale(s: number): void {
    this.motionScale = Math.min(Math.max(s, 0), 1);
    this.motion.value = this.motionScale;
  }

  update(timeSeconds: number, playerX: number, playerZ: number): void {
    // The spin angle is accumulated, so a change of the motion scale slows it without a jump.
    if (this.last !== null) this.spin.value += (timeSeconds - this.last) * config.render.fireflySpin * this.motionScale;
    this.last = timeSeconds;
    this.time.value = timeSeconds;
    this.player.value.set(playerX, playerZ);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.object.dispose();
  }
}
