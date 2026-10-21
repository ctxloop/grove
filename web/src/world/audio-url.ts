import { config } from '../config';
import type { World } from './schema';

/** URL of a track's audio file: `base` + `world.audio.path` with `{id}` replaced. */
export function audioUrl(world: World, trackId: number, base: string = config.world.audioBase): string {
  return base + world.audio.path.replaceAll('{id}', String(trackId));
}
