# Tech stack

Versions are pinned in `go.mod`, `.nvmrc`, and `package-lock.json`.

## Stack

| Layer | Choice | Version | Why |
|---|---|---|---|
| Pipeline | Go, standard library only | 1.27.2 | One language for all offline work, and the maintainer's main language. `go.mod` sets `toolchain go1.27.2`, so older local Go versions auto-switch. |
| Encoding | ffmpeg (called through `os/exec`) | 9.0.2 | There is no production-grade AAC encoder in pure Go. |
| Runtime | Node.js | 26.12.0 | Latest release line. It is an even-numbered release, so it becomes LTS. |
| Package manager | npm | 12.2.0 | Ships with Node. pnpm would add a tool and gain nothing at this size. |
| Build | Vite | 8.3.4 | Zero-config dev server and bundler. |
| Language | TypeScript | 7.0.2 | Used only for type checking (`tsc --noEmit`). Vite strips types itself. |
| 3D | three.js + `WebGPURenderer` + TSL | 0.186.1 (types 0.186.0) | See below. |
| Audio | Web Audio API | built in | We need direct access to the node graph. |
| UI | Plain DOM + CSS | — | A few panels do not need a framework. |
| Tests | Go `testing`; Vitest for pure TS logic | Vitest 5.0.5 | Vitest reuses the Vite config. |
| Browser checks | `playwright-core` driving a locally installed Chromium-based browser (`GROVE_BROWSER`) | 1.64.1 | Scripted measurements (payload, frame time, voice count, hidden tab) and audio checks. Kept out of `npm test`; run `node scripts/measure.ts` and `node scripts/audio-check.ts`. |
| Hosting | Cloudflare Pages, site and audio together, deployed with Wrangler 4 through `npx` | — | Free, with no domain to buy: static requests on Pages are unlimited, and the clips fit the 20,000-file limit. Cloudflare R2 behind a custom domain is the fallback (CLAUDE.md §4). |

## Key decisions

### Renderer: WebGPU and WebGL 2 through one API

three's `WebGPURenderer` uses WebGPU when the browser supports it, and otherwise falls back to a WebGL 2 backend. This was confirmed in the 0.186.1 source (`src/renderers/webgpu/WebGPURenderer.js`). So one codebase covers both.

- **The cost:** custom shading must be written in TSL (node materials). GLSL `ShaderMaterial` is not converted; the node library maps only the built-in materials. That is acceptable because TSL compiles to both WGSL and GLSL.
- **Debugging and benchmarking:** `?renderer=webgl` sets `forceWebGL: true`, to debug the fallback and compare the two backends. Earlier three.js releases were sometimes faster on WebGL, so measure both before assuming either is faster.

### Audio encoding: mono AAC-LC at 64 kbps (`.m4a`)

- **Mono:** every tree is a point source spatialized by an HRTF panner, so stereo width is discarded anyway. Mono halves the bitrate and the decoded memory (about 5.8 MB per 30 s clip at 48 kHz).
- **AAC over Opus:** Opus is about 25% smaller at equal quality. But Safari has a history of failing to decode it with `decodeAudioData` ([WebKit 226922](https://bugs.webkit.org/show_bug.cgi?id=226922)). Opus at 48 kbps can be reconsidered once mono Opus decodes in Safari, iOS Safari, and Firefox.
- **Upstream archives:** FMA's bzip2 compression is fixed by the source. Our JSON is served gzip-compressed by the host.

### Frame rate: uncapped and adaptive

- `requestAnimationFrame` already follows the display refresh rate. We never cap it.
- All motion uses delta time, so behavior is the same at 60 Hz and 120 Hz.
- `render/quality.ts` lowers pixel ratio, draw distance, and particle count when frame time exceeds the refresh interval, and raises them when there is headroom. This also keeps CPU and GPU load, and therefore battery use, in check.

### Internationalization

- The UI is English only. All UI strings live in `web/src/ui/strings.ts`, so adding a locale is a data change.

### Analytics

None in the app. The project is non-commercial, and adding tracking would mean a privacy notice and a third-party script for little value.

Aggregate request counts on the audio domain are already visible in the Cloudflare dashboard, with no user data. If that turns out to be insufficient after release, the next step is a cookieless, aggregate-only tool, which is a separate decision.

## Not used, and why

| Option | Reason |
|---|---|
| gonum | The only linear algebra needed is a 2-component PCA on about 30 dimensions: a covariance matrix plus power iteration, roughly 50 lines with tests. gonum is well maintained, so it is the fallback if numerical issues appear, but it is not worth a dependency now. |
| Python pipeline | The librosa features are already precomputed by FMA, so Python would only add a second language and a virtualenv. |
| Spotify / Deezer APIs | Spotify's Development Mode needs a Premium owner and allows 5 users, and it no longer returns audio features or previews to new apps. Deezer's preview terms are unverified and its audio is commercial. Both conflict with the CC-only rule. |
| Howler.js and similar | They wrap playback behind their own API. We need the raw graph (one `AnalyserNode` per voice, custom crossfade scheduling, our own decode cache), so we would bypass the wrapper anyway. |
| React / Vue | A handful of DOM panels does not justify a framework or its render loop competing with three.js. |
| GLSL `ShaderMaterial` | Not supported by `WebGPURenderer`. Use TSL instead. |
