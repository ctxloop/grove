// Composition root (docs/architecture.md §5): boots the modules and passes data
// between them every frame. Modules never import each other.

import { config } from './config';
import { ClipCache, clipCapacity } from './audio/clips';
import { AudioEngine } from './audio/engine';
import { ORIGIN, setListener } from './audio/listener';
import { Soundscape, type Heard, type TreeSound } from './audio/soundscape';
import { VoicePool } from './audio/voices';
import { combineInputs } from './player/input';
import { createKeyboardMouse } from './player/keyboard-mouse';
import { clearSpot, MAX_RADIUS, type Point } from './player/landing';
import { poseOf, standNear, step, type MoveState } from './player/movement';
import { CameraRig } from './player/rig';
import { createTouchInput } from './player/touch';
import { FrameStats } from './render/frame-stats';
import { QualityController } from './render/quality';
import { createRenderer, type Backend } from './render/renderer';
import { qualityLevelCount, SceneView } from './render/view';
import { createAttributionPage, createCreditsLink } from './ui/attribution';
import { createGate } from './ui/gate';
import { createHud } from './ui/hud';
import { showNotice } from './ui/notice';
import { createMinimap } from './ui/minimap';
import { createInfoPanel } from './ui/panel';
import { createSearch } from './ui/search';
import { createShare } from './ui/share';
import { SettingsStore } from './ui/settings';
import { strings } from './ui/strings';
import { treeInfo } from './ui/tree-info';
import { bindMuteKey, createVolumeControl } from './ui/volume';
import { audioUrl } from './world/audio-url';
import { biomeAt, biomesWithin } from './world/biomes';
import { SpatialGrid, type TreeRef } from './world/grid';
import { ChunkLoader, loadWorld } from './world/loader';
import { pickTree } from './world/pick';
import { formatHash, parseHash } from './world/position-hash';
import { SearchIndex, type SearchHit } from './world/search';
import { parseAttribution, type Attribution, type Biome, type Tree, type World } from './world/schema';

/** Spatial work (chunk loading, aim target, biome toast) runs at this rate, in Hz. */
const SLOW_TICK_HZ = 5;

const root = document.body;
const canvas = document.createElement('canvas');
canvas.className = 'view';
root.append(canvas);

const gate = createGate(root);
const fetchFn = fetch.bind(globalThis);
const debug = new URLSearchParams(location.search).has('debug');

/** localStorage, or null where merely touching it throws (some privacy modes). */
function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

async function boot(): Promise<void> {
  gate.setProgress(strings.gate.loading);
  const world = await loadWorld(fetchFn);
  const forceWebGL = new URLSearchParams(location.search).has('webgl');
  const { renderer, backend } = await createRenderer(canvas, { forceWebGL });
  const view = new SceneView(renderer, world);
  const resize = (): void => view.resize(innerWidth, innerHeight, devicePixelRatio);
  resize();
  addEventListener('resize', resize);
  // The OS reduced-motion setting calms sway, pulse, and fireflies, and is followed live.
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const applyMotion = (): void => view.setMotionScale(reducedMotion.matches ? config.render.reducedMotionScale : 1);
  applyMotion();
  reducedMotion.addEventListener('change', applyMotion);

  const grid = new SpatialGrid();
  const loader = new ChunkLoader(world, fetchFn);
  const biomes = new Map(world.biomes.map((b) => [b.id, b]));
  loader.onLoaded((biome, trees) => {
    view.forest.addBiome(biome, trees);
    grid.add(biome.id, trees);
  });
  loader.onError((biome) => {
    showNotice(root, strings.notice.biomeLoadFailed(biome.name), { label: strings.notice.retry, run: () => loader.retry(biome.id) });
  });

  // Start where a shared link points, else at the world's origin, the middle of the biome packing.
  const shared = parseHash(location.hash, world.bounds, config.player.boundsMargin);
  const from = { x: shared?.x ?? 0, z: shared?.z ?? 0 };
  loader.update(from.x, from.z);
  const spawnBiome = biomesWithin(world, from.x, from.z, Infinity)[0];
  if (spawnBiome !== undefined) await biomeReady(loader, spawnBiome.id);
  const spawn = await landing(world, loader, grid, from.x, from.z);
  const move: MoveState = { x: spawn.x, z: spawn.z, vx: 0, vz: 0, yaw: shared?.yaw ?? 0, pitch: 0 };
  const rig = new CameraRig(view.camera);
  rig.apply(move);

  const keyboardMouse = createKeyboardMouse(canvas);
  const touch = createTouchInput(canvas);
  const input = combineInputs([keyboardMouse, touch]);
  const coarse = matchMedia('(pointer: coarse)').matches;
  const hud = createHud(root, coarse);
  const panel = createInfoPanel(root);
  keyboardMouse.onLockChange((locked) => hud.setLocked(locked));

  const settings = new SettingsStore(storage());
  // attribution.json is loaded once, on first use, for the credits page and search; a failure allows a retry.
  let attribution: Promise<Attribution> | null = null;
  const loadAttribution = (): Promise<Attribution> =>
    (attribution ??= (async () => {
      const res = await fetchFn(`${config.world.dataBase}attribution.json`);
      if (!res.ok) throw new Error(`attribution.json: ${res.status}`);
      return parseAttribution(await res.json());
    })().catch((err: unknown) => {
      attribution = null;
      throw err;
    }));
  const biomeName = (id: number): string => biomes.get(id)?.name ?? `Biome ${id}`;
  const credits = createAttributionPage(root, { load: loadAttribution, biomeName });
  // The search index is built on the first search; a failed load is retried by the next one.
  let searchIndex: Promise<SearchIndex> | null = null;
  const searchTracks = async (query: string): Promise<readonly SearchHit[]> => {
    searchIndex ??= loadAttribution()
      .then((a) => new SearchIndex(a))
      .catch((err: unknown) => {
        searchIndex = null;
        throw err;
      });
    return (await searchIndex).search(query);
  };
  createCreditsLink(root, credits.open);

  gate.setReady(() => {
    const engine = AudioEngine.create();
    engine.setVolume(settings.effectiveVolume(coarse));
    settings.onChange(() => engine.setVolume(settings.effectiveVolume(coarse)));
    createVolumeControl(root, settings, coarse);
    bindMuteKey(settings);
    const clips = new ClipCache(engine.ctx, fetchFn, clipCapacity(coarse));
    setListener(engine.ctx.listener, ORIGIN);
    const voices = new VoicePool(engine);
    const soundscape = new Soundscape(clips, voices, (id) => audioUrl(world, id));
    gate.close();
    keyboardMouse.setEnabled(true);
    touch.setEnabled(true);
    if (!coarse) keyboardMouse.requestLock();
    run({ world, view, backend, grid, loader, biomes, biomeName, searchTracks, rig, input, coarse, hud, panel, engine, voices, soundscape }, move);
  });
}

/** The nearest spot to (x, z) clear of every trunk (`clearSpot`), once the biomes around it are in. */
async function landing(world: World, loader: ChunkLoader, grid: SpatialGrid, x: number, z: number): Promise<Point> {
  const clearance = config.player.treeClearance;
  const reach = MAX_RADIUS + clearance;
  await Promise.all(biomesWithin(world, x, z, reach).map((b) => biomeReady(loader, b.id)));
  return clearSpot(x, z, grid.queryRadius(x, z, reach, []), clearance);
}

/** Loads one biome, wherever the player is, and resolves once it is in. */
function biomeReady(loader: ChunkLoader, id: number): Promise<void> {
  return new Promise((resolve) => {
    if (loader.isLoaded(id)) return resolve();
    const off = loader.onLoaded((b) => {
      if (b.id !== id) return;
      off();
      resolve();
    });
    loader.request(id);
  });
}

interface Parts {
  world: World;
  view: SceneView;
  backend: Backend;
  grid: SpatialGrid;
  loader: ChunkLoader;
  biomes: Map<number, Biome>;
  biomeName: (id: number) => string;
  searchTracks: (query: string) => Promise<readonly SearchHit[]>;
  rig: CameraRig;
  input: ReturnType<typeof combineInputs>;
  /** A touch-first device (`pointer: coarse`). */
  coarse: boolean;
  hud: ReturnType<typeof createHud>;
  panel: ReturnType<typeof createInfoPanel>;
  engine: AudioEngine;
  voices: VoicePool;
  soundscape: Soundscape;
}

/** Measurement hook for `web/scripts/`, exposed only with `?debug`. */
export interface GroveDebug {
  /** Main-thread time per frame, in ms. */
  readonly frameStats: FrameStats;
  readonly backend: Backend;
  /** rAF callbacks run so far; stops growing while the tab is hidden. */
  frames(): number;
  /** Voices playing or fading out. */
  voices(): number;
  audioState(): AudioContextState;
  quality(): number;
  position(): { x: number; z: number };
  /** The camera's forward direction on the ground plane, which the voices are spatialized for. */
  listenerForward(): { x: number; z: number };
  /** The selected tree's low, mid, and high energies in the last frame (zeros when it is dark). */
  selectedBands(): { low: number; mid: number; high: number };
  /** Motion scale (1, or reduced under prefers-reduced-motion) and the fireflies drawn. */
  motion(): { scale: number; fireflies: number };
  /** The context and the master bus (all voices, before the limiter), for capturing what the player hears. */
  audioTap(): { ctx: AudioContext; node: AudioNode };
}

declare global {
  interface Window {
    __grove?: GroveDebug;
  }
}

function run(p: Parts, start: MoveState): void {
  let move = start;
  let selected: { trackId: number; biome: number; index: number; sound: TreeSound } | null = null;
  let currentBiome: number | null = null;
  let last = performance.now();
  let slowTimer = 0;
  let audioTimer = 0;
  let frame = 0;
  let frames = 0;
  let active = false;
  let jumps = 0;

  const quality = new QualityController(qualityLevelCount(), qualityLevelCount() - 1);
  const frameStats = new FrameStats(config.render.frameStatsFrames);
  const selectedBands = { low: 0, mid: 0, high: 0 };
  if (debug) {
    window.__grove = {
      frameStats,
      backend: p.backend,
      frames: () => frames,
      voices: () => p.soundscape.activeVoices(performance.now() / 1000),
      audioState: () => p.engine.state,
      quality: () => quality.level,
      position: () => ({ x: move.x, z: move.z }),
      listenerForward: () => {
        const pose = poseOf(move);
        return { x: pose.fx, z: pose.fz };
      },
      selectedBands: () => ({ ...selectedBands }),
      motion: () => ({ scale: p.view.motion, fireflies: p.view.fireflies.object.count }),
      audioTap: () => ({ ctx: p.engine.ctx, node: p.engine.output }),
    };
  }

  const aim = (): { biome: number; index: number } | null => {
    const pose = poseOf(move);
    return pickTree(p.grid, pose.x, pose.y, pose.z, pose.fx, pose.fy, pose.fz);
  };

  // Closing the card deselects the tree; whatever it plays keeps playing.
  p.panel.onClose(() => {
    selected = null;
    p.view.forest.setHighlight(null, -1);
  });

  const showSound = (): void => {
    if (selected === null) return;
    const sound = p.soundscape.state(selected.trackId);
    if (sound === selected.sound) return;
    // A tree that stopped or failed is no longer highlighted; the card stays for its credits.
    if (sound === 'idle' || sound === 'error') p.view.forest.setHighlight(null, -1);
    selected.sound = sound;
    p.panel.setState(sound);
  };

  /** Shows a tree's card and highlight. `toggle` is a click; otherwise the tree is only pinned. */
  const selectTree = (biomeId: number, index: number, toggle: boolean): void => {
    const biome = p.biomes.get(biomeId);
    const tree: Tree | undefined = p.loader.trees(biomeId)?.[index];
    if (biome === undefined || tree === undefined) return;
    // A click or a pick is a user gesture, so this is a safe place to wake a suspended context.
    if (p.engine.state !== 'running') void p.engine.resume();
    if (toggle || p.soundscape.pinned !== tree.id) p.soundscape.toggle(tree.id);
    selected = { trackId: tree.id, biome: biomeId, index, sound: 'idle' };
    p.panel.show(treeInfo(p.world, biome, tree));
    p.panel.setState('idle');
    p.view.forest.setHighlight(biomeId, index);
    showSound();
  };

  const select = (): void => {
    const hit = aim();
    if (hit !== null) selectTree(hit.biome, hit.index, true);
  };

  // A search pick loads the tree's biome, stands the player next to the tree, and plays it.
  const teleport = async (hit: SearchHit): Promise<void> => {
    jumps++;
    await biomeReady(p.loader, hit.biome);
    const trees = p.loader.trees(hit.biome) ?? [];
    const index = trees.findIndex((t) => t.id === hit.id);
    const tree = trees[index];
    if (tree === undefined) return;
    move = standNear(tree, move, config.player.teleportDistance);
    p.loader.update(move.x, move.z);
    selectTree(hit.biome, index, false);
  };
  // A pasted link or a minimap click moves the player there, standing still and clear of
  // every trunk, once the biomes around the spot are in. A newer jump or search drops one still waiting.
  const jumpTo = async (x: number, z: number, yaw: number): Promise<void> => {
    const id = ++jumps;
    const spot = await landing(p.world, p.loader, p.grid, x, z);
    if (id !== jumps) return;
    move = { x: spot.x, z: spot.z, vx: 0, vz: 0, yaw, pitch: 0 };
    p.loader.update(move.x, move.z);
  };
  const minimap = createMinimap(root, p.world, (x, z) => void jumpTo(x, z, move.yaw));
  createSearch(root, { search: p.searchTracks, biomeName: p.biomeName, onPick: (hit) => void teleport(hit) });
  // The link is built from the position now; the address bar lags by up to hashIntervalMs.
  createShare(root, { hash: () => formatHash(move), touch: p.coarse });

  const near: TreeRef[] = [];
  const heard: Heard[] = [];
  const audioTick = (): void => {
    heard.length = 0;
    for (const ref of p.grid.queryRadius(move.x, move.z, config.audio.hearingRadius, near)) {
      const tree = p.loader.trees(ref.biome)?.[ref.index];
      if (tree === undefined) continue;
      heard.push({
        id: tree.id,
        biome: ref.biome,
        index: ref.index,
        distance: Math.hypot(ref.x - move.x, ref.z - move.z),
        x: ref.x,
        y: config.audio.sourceHeight,
        z: ref.z,
      });
    }
    p.soundscape.tick(performance.now() / 1000, Math.hypot(move.vx, move.vz), heard);
    showSound();
  };

  // The URL hash follows the player, rewritten at most every hashIntervalMs and only when it changes.
  let lastHash = location.hash;
  let lastHashAt = -Infinity;
  const writeHash = (now: number): void => {
    if (now - lastHashAt < config.world.hashIntervalMs) return;
    const hash = formatHash(move);
    if (hash === lastHash) return;
    history.replaceState(null, '', hash);
    lastHash = hash;
    lastHashAt = now;
  };
  // A link pasted into this tab moves the player there.
  addEventListener('hashchange', () => {
    if (location.hash === lastHash) return;
    const to = parseHash(location.hash, p.world.bounds, config.player.boundsMargin);
    if (to === null) return;
    lastHash = location.hash;
    void jumpTo(to.x, to.z, to.yaw);
  });

  const slowTick = (): void => {
    p.loader.update(move.x, move.z);
    writeHash(performance.now());
    minimap.update(move.x, move.z, move.yaw);
    p.hud.setTarget(aim() !== null);
    const b = biomeAt(p.world, move.x, move.z);
    const id = b?.id ?? null;
    if (id !== currentBiome) {
      currentBiome = id;
      if (b !== null) p.hud.showBiome(b.name);
    }
  };

  const light = (t: Heard, low: number, mid: number, high: number): void => {
    p.view.forest.setEnergy(t.biome, t.index, low, mid, high);
    if (t.id !== selected?.trackId) return;
    selectedBands.low = low;
    selectedBands.mid = mid;
    selectedBands.high = high;
  };

  const tick = (now: number): void => {
    const begin = performance.now();
    frame = requestAnimationFrame(tick);
    frames++;
    const dt = (now - last) / 1000;
    last = now;
    const f = p.input.poll();
    // Without pointer lock the lock event never fires; the first input hides the hint instead.
    if (!active && (f.moveX !== 0 || f.moveZ !== 0 || f.lookYaw !== 0 || f.lookPitch !== 0 || f.select)) {
      active = true;
      p.hud.setLocked(true);
    }
    move = step(move, f, dt, p.world.bounds);
    p.rig.apply(move);
    p.voices.follow(poseOf(move), p.engine.ctx.currentTime);
    if (f.select) select();
    // The two periodic ticks never share a frame, which keeps the slowest frame under the CPU budget.
    // A tick that is due waits at most one frame.
    slowTimer += dt;
    audioTimer += dt;
    // A click or a finished load ticks on the next frame, so the voice starts without waiting.
    if (audioTimer >= 1 / config.audio.tickHz || p.soundscape.due) {
      audioTimer = 0;
      audioTick();
    } else if (slowTimer >= 1 / SLOW_TICK_HZ) {
      slowTimer = 0;
      slowTick();
    }
    selectedBands.low = selectedBands.mid = selectedBands.high = 0;
    p.soundscape.frame(dt, light);
    p.view.update(now / 1000, move.x, move.z);
    p.view.render();
    const work = performance.now() - begin;
    frameStats.add(work);
    const level = quality.frame(now, work);
    if (level !== null) p.view.setQuality(level);
  };

  // A hidden tab renders nothing and suspends audio.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      void p.engine.suspend();
    } else {
      last = performance.now();
      frame = requestAnimationFrame(tick);
      p.engine.resume().catch(() => undefined);
    }
  });
  p.engine.onStateChange((state) => {
    if (state !== 'running' && !document.hidden) {
      const n = showNotice(root, strings.notice.audioPaused, { label: strings.notice.resume, run: () => void p.engine.resume() });
      const off = p.engine.onStateChange((s) => {
        if (s === 'running') {
          n.close();
          off();
        }
      });
    }
  });

  slowTick();
  frame = requestAnimationFrame(tick);
}

boot().catch((err: unknown) => {
  console.error(err);
  gate.setError(strings.gate.failed, () => location.reload());
});
