import { WebGPURenderer } from 'three/webgpu';

export type Backend = 'webgpu' | 'webgl2';

/** Creates the renderer and reports the backend that is really in use (WebGPU falls back to WebGL 2). */
export async function createRenderer(
  canvas: HTMLCanvasElement,
  opts: { forceWebGL: boolean },
): Promise<{ renderer: WebGPURenderer; backend: Backend }> {
  const renderer = new WebGPURenderer({ canvas, antialias: true, forceWebGL: opts.forceWebGL });
  await renderer.init();
  const backend: Backend = 'isWebGLBackend' in renderer.backend && renderer.backend.isWebGLBackend === true ? 'webgl2' : 'webgpu';
  return { renderer, backend };
}
