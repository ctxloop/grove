import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from 'three/webgpu';
import type { VoxelMesh } from './voxel';

/**
 * Per-vertex (push.x, push.y, push.z, block) of a voxel tree besides position, normal, and uv:
 * the offset from the crown centre in meters and BLOCK_CODE (0 log, 1 leaves, 2 glow). One
 * attribute, because WebGPU allows 8 vertex buffers and the instances need three more.
 */
export const ATTR_VOXEL = 'aVoxel';

/** A voxel tree variant as a geometry, base at y = 0 around the origin. */
export function voxelGeometry(m: VoxelMesh): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new Float32BufferAttribute(m.normals, 3));
  g.setAttribute('uv', new Float32BufferAttribute(m.uvs, 2));
  const voxel = new Float32Array(m.blocks.length * 4);
  for (let i = 0; i < m.blocks.length; i++) {
    voxel.set([m.push[i * 3] ?? 0, m.push[i * 3 + 1] ?? 0, m.push[i * 3 + 2] ?? 0, m.blocks[i] ?? 0], i * 4);
  }
  g.setAttribute(ATTR_VOXEL, new Float32BufferAttribute(voxel, 4));
  g.setIndex(new Uint32BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * A geometry with `base`'s vertex data and index, for one InstancedMesh that adds
 * its own instance attributes. Biomes are never unloaded, so the shared buffers
 * live as long as the forest.
 */
export function shareGeometry(base: BufferGeometry): BufferGeometry {
  const g = new BufferGeometry();
  for (const [name, attr] of Object.entries(base.attributes)) g.setAttribute(name, attr);
  g.setIndex(base.index);
  g.boundingSphere = base.boundingSphere?.clone() ?? null;
  return g;
}
