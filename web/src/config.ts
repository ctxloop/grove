// Every tunable value lives here (docs/architecture.md §5). Each module owns
// one section; add keys to your own section only.

const env = import.meta.env;
const subset = (env.VITE_SUBSET as string | undefined) ?? 'medium';

export const config = {
  world: {
    /** Prepended to world.audio.path. `/audio/` locally, the audio domain in production. */
    audioBase: (env.VITE_AUDIO_BASE as string | undefined) ?? '/audio/',
    /** Directory holding world.json and biome files: `web/public/data/<VITE_SUBSET>/`. */
    dataBase: `${env.BASE_URL}data/${subset}/`,
    /** Cell size of the uniform-grid spatial index, in meters. */
    gridCell: 16,
    /** Biomes whose edge is within this distance of the player are loaded. */
    prefetchDistance: 120,
    /** Trees are picked within this distance along the view ray. */
    pickDistance: 40,
    /** Radius around a trunk that counts as a hit when picking, in meters. */
    pickRadius: 1.2,
    /** Picking treats a tree as a vertical cylinder from the ground up to this height, in meters. */
    pickHeight: 12,
    /** Search results shown at most. */
    searchLimit: 20,
    /** The URL hash is rewritten at most this often while the player moves, in ms. */
    hashIntervalMs: 1000,
  },

  player: {
    /** Eye height above the ground, in meters. */
    eyeHeight: 1.7,
    walkSpeed: 4.5,
    sprintSpeed: 10,
    /** Exponential velocity response, 1/s. Higher is snappier. */
    acceleration: 10,
    /** Radians per pixel of mouse movement. */
    mouseSensitivity: 0.0022,
    /** Pitch is clamped to ±this, in radians. */
    maxPitch: 1.45,
    /** How far the player may walk past the world bounds, in meters. */
    boundsMargin: 40,
    /** Frame time is clamped to this, in seconds, so a frozen tab does not teleport the player. */
    maxFrameDt: 0.1,
    /** A click that moved the mouse more than this many pixels while pressed is a drag, not a select. */
    clickSlop: 6,
    /** A search teleport lands this far from the tree, in meters; at least `treeClearance`. */
    teleportDistance: 2.2,
    /**
     * A jump (minimap, shared link) never lands closer than this to a trunk, in meters, so the eye is never
     * inside a crown. Covers the widest block at eye height of any species (render/clearance.test.ts).
     */
    treeClearance: 2.2,
    /** Touch joystick: ring radius in pixels, dead zone and sprint threshold as fractions of that radius. */
    joystickRadius: 60,
    joystickDeadZone: 0.15,
    joystickSprintAt: 0.95,
    /** Radians per pixel of finger drag on the right half of the screen. */
    touchLookSensitivity: 0.004,
    /** A touch shorter than this, in milliseconds, and within `clickSlop` pixels is a tap. */
    tapMaxMs: 250,
  },

  render: {
    fov: 70,
    near: 0.1,
    /** Fog fades from `fogNear` to the active quality level's `drawDistance`. */
    fogNear: 60,
    /** Sky gradient: the horizon colour (also the fog colour) blends into the zenith colour as the view direction rises; a curve below 1 widens the horizon band. */
    skyHorizonColor: 0xcfe3f5,
    skyZenithColor: 0x4f86d6,
    skyCurve: 0.6,
    /**
     * Blocky clouds: one flat layer of `cloudBlock` m squares `cloudThickness` thick at `cloudHeight`, from seeded value noise
     * (feature size `cloudScale` blocks, an even number; blocks where the noise exceeds `cloudThreshold`). The layer covers the
     * world bounds plus `cloudMargin` m, drifts along +x at `cloudSpeed` m/s (times the motion scale) and wraps. `cloudShade` is
     * the brightness of the underside; the sides sit halfway.
     */
    cloudBlock: 12,
    cloudThickness: 4,
    cloudHeight: 110,
    cloudScale: 6,
    cloudThreshold: 0.58,
    cloudSeed: 7,
    cloudMargin: 300,
    cloudSpeed: 1.5,
    cloudColor: 0xffffff,
    cloudShade: 0.8,
    maxPixelRatio: 2,
    /**
     * Adaptive quality levels, lowest first; the start level is the last one. `pixelRatio` scales
     * min(devicePixelRatio, maxPixelRatio), `drawDistance` is the camera far plane and fog end in meters.
     */
    qualityLevels: [
      { pixelRatio: 0.5, drawDistance: 200, fireflies: 0 },
      { pixelRatio: 0.75, drawDistance: 300, fireflies: 150 },
      { pixelRatio: 1, drawDistance: 450, fireflies: 300 },
      { pixelRatio: 1, drawDistance: 600, fireflies: 500 },
    ],
    /** Fireflies: cube edge in meters, colour, spin rate about y in rad/s, and half-width of the square box around the player they live in. */
    fireflySize: 0.2,
    fireflySpin: 0.8,
    fireflyColor: 0xc8ff6a,
    fireflyIntensity: 1.6,
    fireflyRadius: 40,
    /** Fireflies shrink and fade out within this distance of the camera, in meters. */
    fireflyNearFade: 4,
    /** Fireflies hover between these heights above the ground, in meters. */
    fireflyMinHeight: 0.4,
    fireflyMaxHeight: 4,
    /** Drift speed in rad/s of the slow looping path, and its horizontal radius and vertical bob in meters. */
    fireflySpeed: 0.35,
    fireflyDrift: 2.5,
    fireflyBob: 0.5,
    /** Twinkle rate in rad/s. */
    fireflyTwinkle: 1.6,
    /** Motion scale under prefers-reduced-motion: sway, bass pulse, firefly drift and count. */
    reducedMotionScale: 0.25,
    /** Frame times kept for the `?debug` measurement hook. */
    frameStatsFrames: 600,
    /** Quality is judged over windows of this length, in ms. */
    qualityWindowMs: 2000,
    /** A window with more than this share of missed frames (delta over 1.5x the display interval) steps down. */
    qualityDownMissRatio: 0.1,
    /** A window with less than this share counts as good. */
    qualityUpMissRatio: 0.01,
    /** Consecutive good windows needed to step up one level. */
    qualityUpWindows: 3,
    /** Ground plane extends this far beyond the world bounds, in meters. */
    groundMargin: 300,
    /** Biome grass patch height above the ground, in meters. */
    discHeight: 0.05,
    /** Biome patch tint: the grass colour mixed towards the palette hue (HSL, saturation scaled) by `discPaletteMix`. */
    discSaturationScale: 0.6,
    discLightness: 0.42,
    discPaletteMix: 0.35,
    /** Grass outside every biome, and the base grass colour (sRGB). */
    groundColor: 0x5f8f3e,
    hemisphereSkyColor: 0xcfe3ff,
    hemisphereGroundColor: 0x4d5a36,
    hemisphereIntensity: 1.0,
    sunColor: 0xfff1d6,
    sunIntensity: 1.7,
    /** Sun direction (towards the light), normalised by three. */
    sunDirection: [0.4, 1, 0.3],
    /** Edge length of one block, in meters, for trees and the ground texture. */
    voxelSize: 0.5,
    /** Tree variants per species: height steps (from `h`) times crown roughness steps (from `r`). */
    voxelHeightSteps: 4,
    voxelRoughSteps: 3,
    /** Leaf and log colour per species (sRGB). Leaves are mixed towards the biome palette by `leafPaletteMix`. */
    speciesLeafColor: { oak: 0x4f9a35, birch: 0x8fbf4a, fir: 0x2f6b48, kapok: 0x3fae2c, acacia: 0x8c9a33, magnolia: 0xf2a7c8 },
    speciesLogColor: { oak: 0x7a5534, birch: 0xe6e1d3, fir: 0x4f3a26, kapok: 0x6b5132, acacia: 0x8a5a3c, magnolia: 0x5c3a3a },
    leafPaletteMix: 0.08,
    /** Leaf shade range, mapped from the uint8 `l`. */
    leafMinShade: 0.8,
    leafMaxShade: 1.15,
    /** Wind: horizontal crown shift per squared meter of height, and its speed in rad/s. */
    swayAmount: 0.003,
    swaySpeed: 1.2,
    /** Bass pulse: leaf blocks move out from the crown centre by this share of their distance at low = 1. */
    pulseAmount: 0.12,
    /** Emissive strength: leaves at mid = 1, glow blocks at rest and at high = 1. */
    midGlow: 0.45,
    glowBase: 0.35,
    highGlow: 1.6,
    /** Emissive strength of the selected tree. */
    highlightGlow: 0.5,
  },

  audio: {
    /** Decoded clips kept in the LRU cache, by device class. */
    cacheClipsDesktop: 32,
    cacheClipsMobile: 16,
    /** Linear fade-in and fade-out of every voice, in seconds. */
    fadeSeconds: 0.5,
    /** HRTF voice pool size; fading voices count too. */
    voices: 3,
    /** Trees within this distance are candidates for a voice, in meters. */
    hearingRadius: 20,
    /** The player counts as standing below this horizontal speed, m/s. */
    settleSpeed: 0.6,
    /** Standing time before uncached clips are fetched, in seconds. */
    dwellSeconds: 0.4,
    /** A playing tree counts this much closer when ranking, in meters, so voices do not flip. */
    hysteresis: 1.5,
    /** Voice scheduling rate, Hz. */
    tickHz: 5,
    /** Loads and voice starts carried out per frame (audio/soundscape.ts); one fits the CPU budget. */
    actionsPerFrame: 1,
    /**
     * PannerNode inverse distance model: 0 dB within 2 m, about -16 dB at 6 m, -22 dB at 10 m,
     * -33 dB at 30 m. Standing 2 m from a tree, it leads the other voices combined by
     * at least 10 dB on both subsets (audio/audibility.test.ts).
     */
    refDistance: 2,
    rolloffFactor: 3,
    /**
     * Height of every sound source, in meters: ear height (player.eyeHeight). A source up in a
     * tall crown would be about as far from the ears as the next tree's.
     */
    sourceHeight: 1.7,
    /**
     * Focus duck (audio/focus.ts): with the nearest playing tree within focusNear, every voice at
     * least focusMargin farther is focusDuckDb quieter on top of the distance model; it eases out
     * by focusFar. Gains move with this time constant, in seconds.
     */
    focusNear: 2,
    focusFar: 4,
    focusMargin: 2,
    focusDuckDb: 18,
    focusSmoothing: 0.15,
    /** Analyser FFT size per voice. */
    fftSize: 1024,
    /** Band edges in Hz: low below the first, high above the second. */
    bandEdges: [250, 2000],
    /** Band smoothing time constants, in seconds. */
    bandAttack: 0.03,
    bandRelease: 0.25,
    /**
     * Per-band dB windows (low, mid, high): a band's mean level maps from the
     * first value (0) to the second (1). Set from the 10th-90th percentile band
     * levels of sample clips, so a typical bass line swings through the middle.
     */
    bandRangesDb: [
      [-70, -25],
      [-80, -40],
      [-115, -70],
    ],
    /**
     * Two-panner direction following (audio/spatial.ts). A moved panner stays silent for
     * followSettleSeconds (Chrome crossfades HRTF kernels over 2048 frames, about 43 ms),
     * then the pair crossfades over followFadeSeconds. Changes below the minimums are ignored.
     */
    followSettleSeconds: 0.06,
    followFadeSeconds: 0.03,
    /**
     * Gain changes on an audible path (panner crossfades, release fades) are scheduled this far
     * ahead of the audio clock, s. A ramp scheduled in the past jumps to where it should be by now.
     */
    scheduleLeadSeconds: 0.02,
    followMinAngleDeg: 1,
    followMinDistanceRatio: 0.02,
    /** Time constant of the master volume smoothing, in seconds. */
    volumeSmoothing: 0.05,
    /** Master limiter (DynamicsCompressorNode) settings. */
    limiter: {
      thresholdDb: -3,
      kneeDb: 0,
      ratio: 20,
      attackSeconds: 0.003,
      releaseSeconds: 0.25,
    },
  },

  ui: {
    /** How long the biome-name toast stays before fading, in ms. */
    toastMs: 2500,
    /** The tree card hides itself this long after it is shown, in ms; it stays while the pointer is over it. */
    panelMs: 5000,
    /** Gate fade-out time before removal, in ms. Applied as --gate-fade. */
    gateFadeMs: 500,
    /** localStorage key of the volume and mute settings. */
    settingsKey: 'grove.settings.v1',
    /** Attribution rows rendered per animation frame. */
    attributionChunk: 500,
    /** Delay between the last keystroke and the search, in ms. */
    searchDebounceMs: 150,
    /** How long the copy-link button reads "Link copied", in ms. */
    copiedMs: 2000,
    /** Minimap side length in CSS px (smaller on narrow screens via CSS). */
    minimapSize: 160,
    /** Minimap padding around the world bounds, in CSS px. */
    minimapPadding: 10,
  },
} as const;
