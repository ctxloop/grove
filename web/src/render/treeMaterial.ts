import { MeshLambertNodeMaterial, type Color, type Node, type Texture } from 'three/webgpu';
import { attribute, clamp, cos, positionGeometry, positionLocal, sin, texture, uniform, uv, vec3, vec4 } from 'three/tsl';
import { config } from '../config';
import { ATTR_VOXEL } from './treeGeometry';

/** `emissiveNode` is defined on NodeMaterial at runtime but missing from the Lambert typings. */
class TreeMaterial extends MeshLambertNodeMaterial {
  declare emissiveNode: Node | null;
}

export type TimeUniform = ReturnType<typeof uniform<'float'>>;

/** Name of each per-instance vec4 attribute. */
export const ATTR_TREE = 'aTree'; // (leaf shade, wind phase in rad, Y rotation in rad, unused)
export const ATTR_ENERGY = 'aEnergy'; // (low, mid, high, highlight)

/**
 * Lambert node material for the voxel trees of one biome.
 * Blocks sample the pixel atlas with nearest filtering. Logs take `log`, leaves
 * take `leaf` times the tree's shade, and glow blocks keep the atlas colour.
 * Everything dynamic comes from instance attributes and `time`; `motion` (0..1)
 * scales wind and the bass bounce for reduced motion.
 */
export function createTreeMaterial(atlas: Texture, leaf: Color, log: Color, time: TimeUniform, motion: TimeUniform): MeshLambertNodeMaterial {
  const c = config.render;
  const tree = attribute(ATTR_TREE, 'vec4');
  const energy = attribute(ATTR_ENERGY, 'vec4');
  const voxel = attribute(ATTR_VOXEL, 'vec4');
  const block = voxel.w;
  const push = voxel.xyz;
  const leafColor = uniform(leaf);
  const logColor = uniform(log);

  // Block weights: exactly one is 1 per vertex.
  const glowW = clamp(block.sub(1), 0, 1);
  const leafW = clamp(block, 0, 1).sub(glowW);
  const logW = clamp(block.oneMinus(), 0, 1);
  const crownW = leafW.add(glowW);

  const tex = texture(atlas, uv()).rgb;
  const leaves = tex.mul(leafColor).mul(tree.x);
  const color = tex.mul(logColor).mul(logW).add(leaves.mul(leafW)).add(tex.mul(glowW));

  const material = new TreeMaterial();
  material.colorNode = vec4(color, 1);

  // Mid brightens the leaves, high lights the glow blocks (always faintly lit), the selected tree glows warm.
  material.emissiveNode = leaves
    .mul(energy.y.mul(c.midGlow))
    .mul(leafW)
    .add(tex.mul(glowW).mul(energy.z.mul(c.highGlow).add(c.glowBase)))
    .add(vec3(1, 0.8, 0.5).mul(energy.w.mul(c.highlightGlow)).mul(crownW));

  // Runs after the instance matrix, so positionLocal is already in the world. On bass every crown
  // block moves out from the crown centre along its own offset, which is rotated like the tree.
  const angle = tree.z;
  const cosA = cos(angle);
  const sinA = sin(angle);
  const out = vec3(push.x.mul(cosA).add(push.z.mul(sinA)), push.y, push.z.mul(cosA).sub(push.x.mul(sinA)));
  const bounced = positionLocal.add(out.mul(energy.x.mul(motion.mul(c.pulseAmount))));

  // Wind: the higher a block, the further it drifts; the trunk base stays put.
  const y = positionGeometry.y;
  const swing = time.mul(c.swaySpeed).add(tree.y).add(positionLocal.x.add(positionLocal.z).mul(0.15));
  const amplitude = y.mul(y).mul(motion.mul(c.swayAmount));
  material.positionNode = bounced.add(vec3(sin(swing), 0, sin(swing.mul(0.83).add(1.3)).mul(0.7)).mul(amplitude));

  return material;
}
