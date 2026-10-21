import { config } from '../config';
import type { World } from '../world/schema';
import { el, isolatePointer } from './dom';
import { clampToSquare, fitBounds } from './minimap-math';
import { strings } from './strings';
import './styles.css';

export interface Minimap {
  update(x: number, z: number, yaw: number): void;
  dispose(): void;
}

const MARKER_RADIUS = 3.5;
const TICK_LENGTH = 9;

/** `onPick` gets the world spot under a click or tap on the map. */
export function createMinimap(root: HTMLElement, world: World, onPick: (x: number, z: number) => void): Minimap {
  const size = config.ui.minimapSize;
  const dpr = Math.max(window.devicePixelRatio || 1, 1);
  const fit = fitBounds(world.bounds, size, config.ui.minimapPadding);

  const canvas = el('canvas', 'minimap');
  canvas.width = canvas.height = Math.round(size * dpr);
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', strings.minimap.label);
  document.documentElement.style.setProperty('--g-minimap-size', `${size}px`);

  // Everything is drawn in CSS px; the transform maps it to device pixels.
  const ctx = canvas.getContext('2d');
  const layer = document.createElement('canvas');
  layer.width = layer.height = canvas.width;
  const layerCtx = layer.getContext('2d');

  if (layerCtx !== null) {
    layerCtx.scale(dpr, dpr);
    for (const biome of world.biomes) {
      const c = fit.point(biome.center[0], biome.center[1]);
      const hue = biome.palette.hue * 360;
      const sat = biome.palette.saturation * 100;
      layerCtx.beginPath();
      layerCtx.arc(c.x, c.y, fit.radius(biome.radius), 0, Math.PI * 2);
      layerCtx.fillStyle = `hsl(${hue} ${sat}% 45% / 0.55)`;
      layerCtx.fill();
      layerCtx.strokeStyle = `hsl(${hue} ${sat}% 65% / 0.8)`;
      layerCtx.lineWidth = 1;
      layerCtx.stroke();
    }
  }

  isolatePointer(canvas);
  // offsetX/Y are in the drawn box; scale them to the px the map was drawn in.
  canvas.addEventListener('click', (e) => {
    const k = size / Math.max(canvas.clientWidth, 1);
    const spot = fit.toWorld(e.offsetX * k, e.offsetY * k);
    onPick(spot.x, spot.z);
  });

  root.append(canvas);

  return {
    update(x, z, yaw) {
      if (ctx === null) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(layer, 0, 0);
      ctx.scale(dpr, dpr);
      // Outside the bounds the marker sticks to the nearest edge; the tick keeps its offset.
      const raw = fit.point(x, z);
      const p = clampToSquare(raw, size, MARKER_RADIUS + 1);
      const tip = fit.tick(x, z, yaw, TICK_LENGTH);
      const tipX = tip.x - raw.x + p.x;
      const tipY = tip.y - raw.y + p.y;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, MARKER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#fff3c4';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
    },
    dispose() {
      canvas.remove();
      document.documentElement.style.removeProperty('--g-minimap-size');
    },
  };
}
