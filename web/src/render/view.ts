import {
  Color,
  DataTexture,
  DirectionalLight,
  Fog,
  HemisphereLight,
  LinearMipmapLinearFilter,
  Mesh,
  MeshLambertNodeMaterial,
  NearestFilter,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  type Texture,
  type WebGPURenderer,
} from 'three/webgpu';
import { mix, positionWorld, positionWorldDirection, texture, uniform, vec2, vec4 } from 'three/tsl';
import type { World } from '../world/schema';
import { config } from '../config';
import { hexRgb, hslToRgb, mixRgb } from './appearance';
import { Clouds } from './cloudMesh';
import { Fireflies } from './fireflies';
import { Forest } from './forest';
import { buildAtlas, TILE, tilePixels } from './pixel-art';

/** A pixel-art texture: crisp up close (nearest), mipmapped far away so the ground does not shimmer. */
function pixelTexture(data: Uint8Array, width: number, height: number, repeat: boolean): DataTexture {
  const t = new DataTexture(data, width, height, RGBAFormat);
  t.magFilter = NearestFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/** A biome's disc: its centre and radius in meters. */
interface Disc {
  readonly cx: number;
  readonly cz: number;
  readonly r: number;
}

/**
 * Grass blocks in world space, one tile per block, so the plane and every biome patch line up. With a `disc`, every
 * block whose centre lies outside it is discarded, so the patch's edge follows the block grid.
 */
function grassMaterial(grass: Texture, tint: readonly [number, number, number], opts: ConstructorParameters<typeof MeshLambertNodeMaterial>[0] = {}, disc?: Disc): MeshLambertNodeMaterial {
  const m = new MeshLambertNodeMaterial(opts);
  const color = uniform(new Color().setRGB(tint[0], tint[1], tint[2], SRGBColorSpace));
  const cell = positionWorld.xz.div(config.render.voxelSize);
  m.colorNode = vec4(texture(grass, cell).rgb.mul(color), 1);
  if (disc !== undefined) {
    const centre = cell.floor().add(0.5).mul(config.render.voxelSize);
    m.maskNode = centre.sub(vec2(disc.cx, disc.cz)).length().lessThanEqual(disc.r);
  }
  return m;
}

/** Number of adaptive quality levels; valid arguments of `SceneView.setQuality` are 0 to this minus 1. */
export function qualityLevelCount(): number {
  return config.render.qualityLevels.length;
}

/** Scene, camera, lights, ground and biome patches. The player module positions the camera. */
export class SceneView {
  readonly camera: PerspectiveCamera;
  readonly forest: Forest;
  readonly clouds: Clouds;
  readonly fireflies = new Fireflies(Math.max(...config.render.qualityLevels.map((l) => l.fireflies)));
  private readonly fog: Fog;
  private pixelRatio = 1;
  private qualityScale = 1;
  private levelFireflies = 0;
  private motionScale = 1;
  private readonly scene = new Scene();
  private readonly disposables: { dispose(): void }[] = [];

  constructor(private readonly renderer: WebGPURenderer, world: World) {
    const c = config.render;
    const top = c.qualityLevels[c.qualityLevels.length - 1];
    if (top === undefined) throw new Error('config.render.qualityLevels is empty');
    this.camera = new PerspectiveCamera(c.fov, 1, c.near, top.drawDistance);

    // Sky: horizon to zenith by the view direction's height. The fog is the horizon colour, so far things fade into the sky.
    const horizon = uniform(new Color(c.skyHorizonColor));
    const zenith = uniform(new Color(c.skyZenithColor));
    this.scene.backgroundNode = mix(horizon, zenith, positionWorldDirection.y.max(0).pow(c.skyCurve));
    this.fog = new Fog(c.skyHorizonColor, c.fogNear, top.drawDistance);
    this.scene.fog = this.fog;

    this.scene.add(new HemisphereLight(c.hemisphereSkyColor, c.hemisphereGroundColor, c.hemisphereIntensity));
    const sun = new DirectionalLight(c.sunColor, c.sunIntensity);
    sun.position.set(...c.sunDirection);
    this.scene.add(sun);

    const atlas = buildAtlas();
    const atlasTexture = pixelTexture(new Uint8Array(atlas.data), atlas.width, atlas.height, false);
    const grass = pixelTexture(tilePixels(atlas, 'grass'), TILE, TILE, true);
    this.disposables.push(atlasTexture, grass);
    this.forest = new Forest(atlasTexture, (object) => renderer.compileAsync(object, this.camera, this.scene));

    const { minX, minZ, maxX, maxZ } = world.bounds;
    const ground = new PlaneGeometry(maxX - minX + 2 * c.groundMargin, maxZ - minZ + 2 * c.groundMargin);
    ground.rotateX(-Math.PI / 2);
    const grassColor = hexRgb(c.groundColor);
    const groundMaterial = grassMaterial(grass, grassColor);
    const groundMesh = new Mesh(ground, groundMaterial);
    groundMesh.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    this.scene.add(groundMesh);
    this.disposables.push(ground, groundMaterial);

    // One grass patch per biome, tinted towards its palette, so the borders are visible. A shared unit square, scaled to cover
    // the disc plus a block; the material discards the blocks outside the radius.
    const patch = new PlaneGeometry(1, 1);
    patch.rotateX(-Math.PI / 2);
    this.disposables.push(patch);
    for (const biome of world.biomes) {
      const tint = mixRgb(grassColor, hslToRgb(biome.palette.hue, biome.palette.saturation * c.discSaturationScale, c.discLightness), c.discPaletteMix);
      const [cx, cz] = biome.center;
      const material = grassMaterial(grass, tint, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }, { cx, cz, r: biome.radius });
      const mesh = new Mesh(patch, material);
      mesh.position.set(cx, c.discHeight, cz);
      const side = 2 * (biome.radius + c.voxelSize);
      mesh.scale.set(side, 1, side);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.scene.add(mesh);
      this.disposables.push(material);
    }

    this.clouds = new Clouds({ minX: minX - c.cloudMargin, minZ: minZ - c.cloudMargin, maxX: maxX + c.cloudMargin, maxZ: maxZ + c.cloudMargin });
    this.scene.add(this.clouds.object);
    this.scene.add(this.forest.group);
    this.scene.add(this.fireflies.object);
    this.applyLevel(c.qualityLevels.length - 1);
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.pixelRatio = pixelRatio;
    this.renderer.setPixelRatio(this.qualityScale * Math.min(pixelRatio, config.render.maxPixelRatio));
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Applies `config.render.qualityLevels[level]`: render scale, draw distance (camera far and fog end), firefly count. */
  setQuality(level: number): void {
    this.applyLevel(level);
    this.renderer.setPixelRatio(this.qualityScale * Math.min(this.pixelRatio, config.render.maxPixelRatio));
  }

  /** Per frame: advances the forest (wind, energy upload) and the fireflies. */
  update(timeSeconds: number, playerX: number, playerZ: number): void {
    this.forest.update(timeSeconds);
    this.clouds.update(timeSeconds);
    this.fireflies.update(timeSeconds, playerX, playerZ);
  }

  /** The current motion scale, 0..1. */
  get motion(): number {
    return this.motionScale;
  }

  /** 0..1: scales wind sway, bass pulse, cloud drift, firefly motion, and firefly count (reduced motion). */
  setMotionScale(s: number): void {
    this.motionScale = Math.min(Math.max(s, 0), 1);
    this.forest.setMotionScale(this.motionScale);
    this.clouds.setMotionScale(this.motionScale);
    this.fireflies.setMotionScale(this.motionScale);
    this.fireflies.setCount(Math.round(this.levelFireflies * this.motionScale));
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.forest.dispose();
    this.clouds.dispose();
    this.fireflies.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.scene.clear();
  }

  private applyLevel(level: number): void {
    const levels = config.render.qualityLevels;
    const l = levels[Math.min(Math.max(Math.round(level), 0), levels.length - 1)];
    if (l === undefined) return;
    this.qualityScale = l.pixelRatio;
    this.camera.far = l.drawDistance;
    this.camera.updateProjectionMatrix();
    this.fog.far = l.drawDistance;
    this.levelFireflies = l.fireflies;
    this.fireflies.setCount(Math.round(l.fireflies * this.motionScale));
  }
}
