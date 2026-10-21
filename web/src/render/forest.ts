import { Color, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, SRGBColorSpace, Vector3, type BufferGeometry, type MeshLambertNodeMaterial, type Object3D, type Texture } from 'three/webgpu';
import { uniform } from 'three/tsl';
import { SPECIES, type Biome, type Species, type Tree } from '../world/schema';
import { config } from '../config';
import { hexRgb, hslToRgb, leafShade, mixRgb, treeSeed, variantOf } from './appearance';
import { shareGeometry, voxelGeometry } from './treeGeometry';
import { ATTR_ENERGY, ATTR_TREE, createTreeMaterial, type TimeUniform } from './treeMaterial';
import { buildTree, meshVoxels } from './voxel';

const ENERGY_STRIDE = 4; // low, mid, high, highlight
/** Above this many pending ranges the whole energy buffer is re-uploaded instead (e.g. while culled). */
const MAX_RANGES = 32;
/** Frustum-culling slack for the bass bounce and the wind, in meters. */
const CULL_PAD = 2;

/** One InstancedMesh: the trees of one biome that share a variant. */
interface Part {
  readonly mesh: InstancedMesh;
  readonly energy: InstancedBufferAttribute;
  readonly data: Float32Array;
  /** Instances whose energy changed since the last upload; `dirty` is the membership flag. */
  readonly dirty: Uint8Array;
  readonly dirtyList: Uint32Array;
  dirtyCount: number;
}

interface BiomeEntry {
  /** The biome's meshes; added to the forest once prepared. */
  readonly group: Group;
  readonly parts: Part[];
  readonly material: MeshLambertNodeMaterial;
  /** Per tree index of the biome: its part and its instance in that part. */
  readonly part: Uint16Array;
  readonly slot: Uint32Array;
  readonly count: number;
}

const matrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const unit = new Vector3(1, 1, 1);
const up = new Vector3(0, 1, 0);

function srgb(rgb: readonly [number, number, number]): Color {
  return new Color().setRGB(rgb[0], rgb[1], rgb[2], SRGBColorSpace);
}

/**
 * All trees as voxel trees. Each biome has one species; its trees
 * use the species' variants (height steps from `h`, crown roughness from `r`), each
 * variant one InstancedMesh. Variant geometry is built once per species and shared.
 */
export class Forest {
  readonly group = new Group();
  private readonly entries = new Map<number, BiomeEntry>();
  private readonly variants = new Map<string, BufferGeometry>();
  private readonly time: TimeUniform = uniform(0);
  private readonly motion: TimeUniform = uniform(1);
  private highlightBiome: number | null = null;
  private highlightIndex = -1;

  /**
   * `prepare` readies a biome's meshes for the GPU before they are shown (the renderer's
   * compileAsync). Otherwise the first frame that draws a new biome builds its shaders and
   * buffers, up to 23 ms on desktop for a species not seen yet.
   */
  constructor(
    private readonly atlas: Texture,
    private readonly prepare?: (object: Object3D) => Promise<void>,
  ) {}

  hasBiome(biomeId: number): boolean {
    return this.entries.has(biomeId);
  }

  addBiome(biome: Biome, trees: readonly Tree[]): void {
    this.removeBiome(biome.id);
    const c = config.render;
    const n = trees.length;

    const byVariant = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const t = trees[i];
      if (t === undefined) continue;
      const v = variantOf(t.h, t.r, c.voxelHeightSteps, c.voxelRoughSteps).index;
      byVariant.set(v, [...(byVariant.get(v) ?? []), i]);
    }

    const palette = hslToRgb(biome.palette.hue, biome.palette.saturation, 0.5);
    const leaf = srgb(mixRgb(hexRgb(c.speciesLeafColor[biome.species]), palette, c.leafPaletteMix));
    const log = srgb(hexRgb(c.speciesLogColor[biome.species]));
    const material = createTreeMaterial(this.atlas, leaf, log, this.time, this.motion);
    const part = new Uint16Array(n);
    const slot = new Uint32Array(n);
    const parts: Part[] = [];
    const group = new Group();

    for (const [variant, members] of [...byVariant].sort((a, b) => a[0] - b[0])) {
      const geometry = shareGeometry(this.variant(biome.species, variant));
      const m = members.length;
      const params = new InstancedBufferAttribute(new Float32Array(m * 4), 4);
      const data = new Float32Array(m * ENERGY_STRIDE);
      const energy = new InstancedBufferAttribute(data, ENERGY_STRIDE);
      geometry.setAttribute(ATTR_TREE, params);
      geometry.setAttribute(ATTR_ENERGY, energy);
      const mesh = new InstancedMesh(geometry, material, m);
      members.forEach((ti, k) => {
        const t = trees[ti];
        if (t === undefined) return;
        // Quarter turns only, so every tree stays on the block grid's axes.
        const angle = Math.floor(treeSeed(t.id, 2) * 4) * (Math.PI / 2);
        quaternion.setFromAxisAngle(up, angle);
        matrix.compose(position.set(t.x, 0, t.z), quaternion, unit);
        mesh.setMatrixAt(k, matrix);
        params.setXYZW(k, leafShade(t.l, c.leafMinShade, c.leafMaxShade), treeSeed(t.id, 3) * Math.PI * 2, angle, 0);
        part[ti] = parts.length;
        slot[ti] = k;
      });
      mesh.computeBoundingSphere();
      if (mesh.boundingSphere !== null) mesh.boundingSphere.radius += CULL_PAD;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      parts.push({ mesh, energy, data, dirty: new Uint8Array(m), dirtyList: new Uint32Array(m), dirtyCount: 0 });
    }
    const entry: BiomeEntry = { group, parts, material, part, slot, count: n };
    this.entries.set(biome.id, entry);
    // Shown once prepared, unless it was replaced or removed meanwhile.
    const show = (): void => {
      if (this.entries.get(biome.id) === entry) this.group.add(group);
    };
    if (this.prepare === undefined) show();
    else this.prepare(group).then(show, show);
  }

  removeBiome(biomeId: number): void {
    const e = this.entries.get(biomeId);
    if (e === undefined) return;
    if (this.highlightBiome === biomeId) {
      this.highlightBiome = null;
      this.highlightIndex = -1;
    }
    this.group.remove(e.group);
    for (const p of e.parts) {
      p.mesh.geometry.dispose();
      p.mesh.dispose();
    }
    e.material.dispose();
    this.entries.delete(biomeId);
  }

  /** Live band energy (each 0..1) of the tree at `index` in the biome's tree array. */
  setEnergy(biomeId: number, index: number, low: number, mid: number, high: number): void {
    const at = this.locate(biomeId, index);
    if (at === null) return;
    const [p, k] = at;
    const o = k * ENERGY_STRIDE;
    const d = p.data;
    if (d[o] === low && d[o + 1] === mid && d[o + 2] === high) return;
    d[o] = low;
    d[o + 1] = mid;
    d[o + 2] = high;
    this.markDirty(p, k);
  }

  clearEnergy(biomeId: number, index: number): void {
    this.setEnergy(biomeId, index, 0, 0, 0);
  }

  /** Highlights one tree globally; `null` clears the highlight. */
  setHighlight(biomeId: number | null, index: number): void {
    if (biomeId === this.highlightBiome && index === this.highlightIndex) return;
    this.writeHighlight(this.highlightBiome, this.highlightIndex, 0);
    this.highlightBiome = biomeId;
    this.highlightIndex = index;
    this.writeHighlight(biomeId, index, 1);
  }

  /** 0..1: scales the wind and the bass bounce (reduced motion). */
  setMotionScale(s: number): void {
    this.motion.value = Math.min(Math.max(s, 0), 1);
  }

  /** Per frame: advances the wind and uploads only the instances whose energy changed. */
  update(timeSeconds: number): void {
    this.time.value = timeSeconds;
    for (const e of this.entries.values()) {
      for (const p of e.parts) {
        if (p.dirtyCount === 0) continue;
        const attr = p.energy;
        if (attr.updateRanges.length + p.dirtyCount > MAX_RANGES) {
          attr.clearUpdateRanges();
          attr.addUpdateRange(0, p.data.length);
        } else {
          for (let i = 0; i < p.dirtyCount; i++) attr.addUpdateRange((p.dirtyList[i] ?? 0) * ENERGY_STRIDE, ENERGY_STRIDE);
        }
        for (let i = 0; i < p.dirtyCount; i++) p.dirty[p.dirtyList[i] ?? 0] = 0;
        p.dirtyCount = 0;
        attr.needsUpdate = true;
      }
    }
  }

  dispose(): void {
    for (const id of [...this.entries.keys()]) this.removeBiome(id);
    for (const g of this.variants.values()) g.dispose();
    this.variants.clear();
  }

  /** The shared geometry of one variant of a species, built on first use. */
  private variant(species: Species, index: number): BufferGeometry {
    const key = `${species}:${index}`;
    const cached = this.variants.get(key);
    if (cached !== undefined) return cached;
    const c = config.render;
    const rough = index % c.voxelRoughSteps;
    const step = (index - rough) / c.voxelRoughSteps;
    const height = c.voxelHeightSteps > 1 ? step / (c.voxelHeightSteps - 1) : 0;
    const shape = buildTree(species, height, c.voxelRoughSteps > 1 ? rough / (c.voxelRoughSteps - 1) : 0, (SPECIES.indexOf(species) + 1) * 1000 + index);
    const g = voxelGeometry(meshVoxels(shape, c.voxelSize));
    this.variants.set(key, g);
    return g;
  }

  private locate(biomeId: number | null, index: number): [Part, number] | null {
    if (biomeId === null) return null;
    const e = this.entries.get(biomeId);
    if (e === undefined || index < 0 || index >= e.count) return null;
    const p = e.parts[e.part[index] ?? 0];
    return p === undefined ? null : [p, e.slot[index] ?? 0];
  }

  private writeHighlight(biomeId: number | null, index: number, value: number): void {
    const at = this.locate(biomeId, index);
    if (at === null) return;
    const [p, k] = at;
    p.data[k * ENERGY_STRIDE + 3] = value;
    this.markDirty(p, k);
  }

  private markDirty(p: Part, k: number): void {
    if (p.dirty[k] === 1) return;
    p.dirty[k] = 1;
    p.dirtyList[p.dirtyCount++] = k;
  }
}
