# grove

Rules for this repository, for contributors and coding agents. They take precedence over personal or global agent rules, but never lower their safety limits.

grove turns Creative Commons tracks from the Free Music Archive (FMA) into a walkable 3D forest: each top-level genre is a biome, each tree a track, and nearby trees play spatial audio. Non-commercial and open source.

Design docs, to read before changing what they cover: `docs/architecture.md` (pipeline, layout, data contract, frontend modules) and `docs/tech-stack.md` (tools, versions, what is deliberately not used).

## 1. Layout

```
pipeline/                 Go module, offline only
  cmd/grove-pipeline/     subcommands: extract, build, audio, stats
  internal/               fma, license, layout, export
contract/fixtures/        data contract samples, decoded by Go and TS tests
web/                      Vite + TypeScript + three.js, static site
  src/                    config, world, render, audio, player, ui, main.ts
  public/data/<subset>/   pipeline output JSON, committed
  scripts/                browser measurements, kept out of npm test
data/raw/                 FMA archives and extracted CSVs, gitignored
audio/                    encoded clips, gitignored
notes/                    local working notes, gitignored
```

There is no runtime backend: Go runs offline, and the browser reads static JSON and audio files.

## 2. Code

- Everything in the repo is in English and concise: docs, comments, UI text, commit messages.
- **Go:** standard library only. **TypeScript:** `strict`, no `any`.
- **Modules:** in `web/src`, `world` imports only `config`; `render`, `audio`, `player`, and `ui` import only `config` and `world`; `main.ts` wires them together. Only `render`, `player`, and `main.ts` import three.js. `web/src/deps.test.ts` enforces this.
- Keep pure logic apart from side effects (DOM, Web Audio, three.js, network) so it can be unit-tested.
- Tunable values live in `web/src/config.ts`, UI strings only in `web/src/ui/strings.ts`. Nothing hard-codes the number of biomes.
- **Data contract:** every JSON file carries `schema`, and the browser rejects other versions. A format change updates the Go types, the TS parser, and `contract/fixtures/` together, and bumps `schema`.

## 3. Data and licensing (hard rules)

- **Source:** FMA only. No source that needs a user login or forbids redistribution.
- **Licenses:** only CC BY, BY-SA, BY-NC, BY-NC-SA, CC0, and Public Domain. NoDerivatives, missing, and non-CC licenses are excluded. The filter lives only in `pipeline/internal/license`, and its tests cover every license string in FMA.
- **Attribution:** the tree panel shows title, artist, license name and link, and FMA link; the pipeline also emits a site-wide attribution list.
- **License layers:** code is MIT, FMA metadata CC BY 4.0, and each clip keeps its track's license. `NOTICE` states that NC audio must not be used commercially, including in forks.
- **Art:** original only; block textures are generated in code. Fonts must be under the SIL OFL or a similar license and credited in `NOTICE`. Never use assets or names from any existing game, and never describe the project as styled after one.
- **Raw data:** download from `https://os.unil.cloud.switch.ch/fma/` into `data/raw/`. `grove-pipeline extract` checks the published SHA1. macOS `unzip` cannot read the bzip2 entries (exit 81); the pipeline can.

## 4. Hosting and cost (red lines)

The site and the audio are one Cloudflare Pages project on the free plan, so there is no bill. It is a Direct Upload project, built and deployed locally with Wrangler as the README describes; Cloudflare does not build from the repository.

- A deployment holds at most 20,000 files of up to 25 MiB each. Check the count before adding clips or a subset.
- Clips are served as `/audio/<track_id>.m4a` with `Cache-Control: public, max-age=31536000, immutable` (`web/public/_headers`). A track id never gets different audio.

If Cloudflare limits the audio on Pages, the fallback is Cloudflare R2 behind a custom domain. R2 has **no hard spending cap**, so the audio does not move there until all six items are in place:

1. Serve only through a custom domain on Cloudflare; disable public `r2.dev` access.
2. Cache all audio, with a cache key that ignores query strings.
3. WAF allows only `GET /audio/<track_id>.m4a`.
4. Enable the free per-IP rate limiting rule.
5. Enable a budget alert (the maintainer sets the threshold), and document the kill switch in the README.
6. Every object has the key `audio/<track_id>.m4a` and `Cache-Control: public, max-age=31536000, immutable`.

Each of these needs the maintainer's explicit approval: deployments, Cloudflare logins and project, domain, or billing changes, anything on R2, and any CI/CD config. Cloudflare credentials stay on the maintainer's machine, never in code, commits, or logs.

## 5. Targets

| Target | Checked by |
|---|---|
| Initial load ≤ 5 MB gzipped, excluding audio; each biome file ≤ 300 KB gzipped | `web/scripts/measure.ts` |
| Main-thread work per frame ≤ 4 ms on desktop, ≤ 8 ms on mobile | `measure.ts` (desktop), a real device (mobile) |
| Frame rate follows the display, never capped; adaptive quality holds it, at least 30 fps on mobile | a real device |
| At most 3 HRTF voices, scheduled at 5 Hz; a hidden tab renders nothing and suspends audio | `measure.ts` |
| Decoded audio ≤ ~200 MB on desktop, ≤ ~100 MB on mobile | LRU sizes in `config.audio` |
| ≤ 1.5 s from the dwell trigger to sound on a cache miss | the deployed site |
| The last two major versions of Chrome, Edge, Firefox, Safari, and iOS Safari | manual |
| No analytics, cookies, or third-party scripts | review |

## 6. Workflow and checks

- Plan larger changes in Plan Mode and implement only after the maintainer approves.
- Working notes (plans, progress, measurements) stay in the gitignored `notes/` of the main checkout. Never commit or link to them.
- Feature work runs in git worktrees, one module per worktree. Contract changes land on `dev` first. Raw data and audio stay in the main checkout and are passed to the pipeline as absolute paths.
- **pipeline:** `gofmt -l .` prints nothing; `go vet ./...` and `go test ./...` pass. With `GROVE_META` set, `TestSubsetCounts` pins the counts (small: 5,187 trees in 8 biomes; medium: 14,586 in 16), and `grove-pipeline stats -data` matches the committed JSON.
- **web:** `npm run check` and `npm test` pass. Run `measure.ts` after changes that can affect §5.
- Desktop browsers alone are not acceptance: remind the maintainer to test audio changes on a real iOS Safari device.

## 7. Git

- Develop on `dev`; `master` gets stable releases only. Merge with `git merge --no-ff --signoff`; no rebase or history rewrites.
- Commit messages are in English with an Angular prefix (`feat:`, `fix:`, `docs:`, …), one logical change per commit. Pipeline output JSON is committed separately from the code that produced it.
- Every commit uses `git commit -s`. No GPG signing (`commit.gpgsign` is `false` locally) and no `Co-Authored-By`.
