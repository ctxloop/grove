# Architecture

## 1. Overview

```
FMA archives ──► grove-pipeline (Go, offline)
                   ├─► web/public/data/<subset>/  world.json, biome-<id>.json, attribution.json
                   └─► audio/<track_id>.m4a

web/dist/ + audio/ ──(local build, Wrangler upload)──► Cloudflare Pages

Browser ◄── Cloudflare Pages: HTML, JS, JSON, /audio/<track_id>.m4a
```

There is no runtime backend. Every request is for a static file.

## 2. Pipeline

| Subcommand | Does |
|---|---|
| `extract` | Checks an FMA archive against its published SHA1, then copies entries out (`archive/zip` with `compress/bzip2` registered for method 12). |
| `build -subset small\|medium` | Parses the CSVs, filters licenses, computes the layout, and writes the JSON. |
| `audio -subset …` | Encodes the usable MP3s to mono AAC at 64 kbps with ffmpeg (`-format mp3` copies them instead). Skips and logs broken files. |
| `stats` | Prints the license-filter, tree, and biome counts of a subset; with `-data`, checks a build against them. |

| Package | Responsibility |
|---|---|
| `fma` | Streaming readers for `tracks.csv`, `genres.csv`, `features.csv`, and `raw_tracks.csv` (the only source of FMA page URLs), merging their multi-row headers into `section.field` keys. `BrokenAudio` lists the 12 tracks whose MP3 cannot be decoded; they are left out. |
| `license` | A fixed table of every FMA license string: allowed or not, code, name, URL. Unknown strings are rejected and counted by `stats`. |
| `layout` | Biome packing, groves, PCA, relaxation. Deterministic. |
| `export` | The JSON types and writers. |

## 3. Layout algorithm

The same input always gives the same world, so shared positions stay valid.

1. **Biomes.** Each biome is a circle of area `max(55·n, π·20²)` m², so every biome has the same density. The circles are packed by iterative relaxation until neighbours touch; the touching edges are the biome borders.
2. **Groves.** A track's grove is the level-2 ancestor of its deepest genre under the biome (ties: lower id). Tracks with only the top-level genre, and groves under 10 tracks, go to the biome's `core` grove. Seed circles sized by tree count are packed inside the biome; then one Vogel-spiral slot per tree is split between groves by a power diagram whose weights give each grove exactly its count (`partition.go`). Groves are compact and leave no gaps.
3. **Trees.** MFCC (20), spectral centroid, RMS, ZCR, and spectral contrast (7) means, standardized per biome, are reduced to 2D by PCA. Trees and slots are both sorted by distance from their centre and matched ring by ring by angle, so feature-space neighbours stay close. A repulsion pass keeps trees at least 6 m apart and 3 m inside the biome edge. Coordinates are rounded to 1 cm.
4. **Appearance.** Each value is ranked across the subset and quantized to uint8.

   | Property | Driven by | Drawn as |
   |---|---|---|
   | Hue | Biome palette | Ground tint and a share of the leaf colour |
   | Lightness | Spectral centroid | Leaf shade |
   | Height | RMS | Trunk height step |
   | Roughness | ZCR | Crown roughness step |

   The biome's species sets the tree's shape and its leaf and log colours.

## 4. Data formats

Each subset has its own directory, `web/public/data/<subset>/`. Every file carries `schema` (currently `1`), and the browser rejects other versions. `contract/fixtures/` holds the reference samples that Go and TS tests both decode.

- **`world.json`:** `schema`, `subset`, `bounds` (`minX`, `minZ`, `maxX`, `maxZ`), `fmaBase` (prefix of every tree `url`), `audio.path` (file name template such as `{id}.m4a`, appended to `VITE_AUDIO_BASE`), `licenses` (code → `name`, `url`), and `biomes[]`: `id` (FMA top-level genre id), `slug`, `name`, `center` `[x, z]`, `radius`, `palette` (`hue`, `saturation`, 0–1), `species` (`oak`, `birch`, `fir`, `kapok`, `acacia`, or `magnolia`, mapped in `internal/layout/species.go`), `trees`, `file`, and `groves[]` (`name`, `center`, `radius`, `trees`).
- **`biome-<id>.json`:** `schema`, `biome`, and `trees[]`:

  | Field | Meaning |
  |---|---|
  | `id` | Track ID |
  | `x`, `z` | Position in meters |
  | `g` | Index into the biome's `groves` |
  | `h`, `l`, `r` | Height, lightness, roughness (uint8) |
  | `t`, `a`, `al` | Title, artist, album (may be empty) |
  | `lic` | License code, a key of `licenses` |
  | `url` | FMA link, relative to `fmaBase` |

- **`attribution.json`:** `schema`, `fmaBase`, `licenses`, and `tracks[]` (`id`, `b` biome id, `t`, `a`, `lic`, `url`). Used by the credits page and by search.

## 5. Frontend (`web/src/`)

| Module | Responsibility |
|---|---|
| `main.ts` | Boot, the **Enter the grove** gate (which creates the `AudioContext`), the frame loop, the 5 Hz ticks, the URL hash, and jumps. With `?debug`, exposes `window.__grove` for `web/scripts/`. |
| `config.ts` | Every tunable value, plus `VITE_AUDIO_BASE` (`/audio/` by default) and `VITE_SUBSET` (`medium` by default). |
| `world/` | The JSON parsers, a chunk loader that prefetches neighbouring biomes, a uniform-grid spatial index, picking, audio URLs, search (diacritic-folded word prefixes), and the position hash `#x=…&z=…&h=…`. |
| `render/` | `WebGPURenderer` with its WebGL 2 fallback. Voxel trees: one `InstancedMesh` per species variant, a TSL material per biome, and per-instance shade, wind, rotation, and band energy; only playing trees are rewritten each frame. Pixel textures are generated at startup (`pixel-art.ts`). Ground and biome patches step along the block grid, under a gradient sky with blocky clouds and cube fireflies. Adaptive quality steps pixel ratio, draw distance, and particles against the display's refresh interval. Reduced motion scales all motion down. |
| `audio/` | A pool of 3 HRTF voices. A pure scheduler at 5 Hz picks the nearest trees within 20 m, with hysteresis; uncached clips are fetched only after standing still for 0.4 s, and decoded clips live in an LRU cache (16 on mobile, 32 on desktop). Each voice has two panners so a moving source never clicks (`spatial.ts`), and a focus gain lets the tree you stand at lead the rest by at least 25 dB (`focus.ts`). Band energies (low, mid, high) drive each playing tree's visuals. On Safari the audio session is `playback`, so the silent switch does not mute it. |
| `player/` | Camera rig, frame-rate-independent movement, and one input interface for keyboard and mouse (pointer lock, or drag-to-look) and touch (left-half joystick, drag-to-look, tap). Jumps land at least 2.2 m from every trunk. |
| `ui/` | Pixel UI in Pixelify Sans: gate, HUD, tree panel, notices, credits, volume and mute (touch: mute only), search, copy link, and minimap. `strings.ts` holds every UI string. |

**Dependency rule.** `world/` imports only `config.ts`. `render/`, `audio/`, `player/`, and `ui/` import only `config.ts` and `world/`, never each other. `main.ts` is the only composition root. `web/src/deps.test.ts` fails on any other edge or a cycle.

**Per frame:** input and movement, analyser reads, voice directions, instance attributes, render. **At 5 Hz:** voice scheduling, and in other frames chunk loading, aim target, biome toast, minimap, and URL hash. Clip fetches and voice starts are spread to one per frame. A hidden tab stops rendering and suspends the `AudioContext`.

## 6. Deployment

The site and the clips are one Cloudflare Pages deployment on one origin, so the default `VITE_AUDIO_BASE` of `/audio/` works there as it does locally, and no CORS is needed. The maintainer builds `web/dist/`, copies the clips into `dist/audio/`, and uploads it with Wrangler (README, Hosting). There is no deploy workflow in the repository. `web/public/_headers` gives the clips a one-year immutable cache; everything else keeps the Pages default, which revalidates by ETag.

Locally, the Vite dev server answers `/audio/<track_id>.m4a` from the repo-root `audio/` directory.

If the audio moves to R2 (the fallback in CLAUDE.md §4), only `VITE_AUDIO_BASE` changes, plus a CORS rule on the bucket.

## 7. Failure handling

- **Decode failure:** the tree stays silent for the session. No retries.
- **Biome JSON failure:** a notice with a retry button.
- **`AudioContext` suspended by the browser:** a "click to resume" prompt.
