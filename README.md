# grove

A music forest you navigate by ear. grove plants Creative Commons tracks from the [Free Music Archive](https://github.com/mdeff/fma) into a walkable 3D forest:

- Each top-level genre is a biome, and each tree is a track: 14,586 trees in 16 biomes.
- The closer you get to a tree, the clearer and more directional its sound. Standing at a tree, it is the one you hear.
- Trees move and light up with the music they play.
- Search by title or artist, jump anywhere from the minimap, and share where you stand with a link.

Best with headphones.

| | Desktop | Touch |
|---|---|---|
| Walk | WASD | left thumb |
| Look | mouse | drag |
| Play a tree | click | tap |
| Mute | M | Mute button |

## Status

Live at <https://grove-egt.pages.dev/>.

## How it works

- **Offline, in Go.** `grove-pipeline` reads the FMA metadata, keeps only tracks under an allowed license, packs the genres into biomes and their sub-genres into groves, and shapes each tree from the track's audio features. It writes static JSON and encodes 30-second clips to mono AAC.
- **In the browser.** The site loads a biome's trees as you approach it. The nearest three trees play through HRTF panners, and their bass, mid, and high energies drive the visuals. It renders with WebGPU where available, otherwise WebGL 2. There is no backend.

Details are in [Architecture](docs/architecture.md) and [Tech stack](docs/tech-stack.md).

## Run locally

Needs Node (version in `.nvmrc`). The world data is committed in `web/public/data/`, so the site runs on its own; the trees stay silent until the clips are encoded.

```sh
cd web
npm install
npm run dev
```

For the audio, you also need Go (version in `pipeline/go.mod`) and ffmpeg. Download `fma_metadata.zip` (342 MiB) and `fma_medium.zip` (22 GiB) from <https://os.unil.cloud.switch.ch/fma/> into `data/raw/`. The pipeline checks their SHA1 and takes absolute paths:

```sh
cd pipeline
raw=$PWD/../data/raw
# Extract the metadata CSVs, rebuild the world data, and encode the clips into audio/.
go run ./cmd/grove-pipeline extract -zip $raw/fma_metadata.zip -out $raw/fma_metadata fma_metadata/tracks.csv fma_metadata/genres.csv fma_metadata/features.csv fma_metadata/raw_tracks.csv
go run ./cmd/grove-pipeline build -subset medium -meta $raw/fma_metadata -out $PWD/../web/public/data/medium
go run ./cmd/grove-pipeline audio -subset medium -meta $raw/fma_metadata -zip $raw/fma_medium.zip -out $PWD/../audio
```

The dev server answers `/audio/<track_id>.m4a` from `audio/`. For the smaller 8-biome world, use `fma_small.zip` (7.2 GiB) and `-subset small`, and run the site with `VITE_SUBSET=small`.

## Hosting

The site and its audio are hosted together on Cloudflare Pages (free plan), as a Direct Upload project: the clips are not in the repository, so Cloudflare cannot build from it, and each deployment is built and uploaded locally with Wrangler. The rules are in [CLAUDE.md §4](CLAUDE.md#4-hosting-and-cost-red-lines).

```sh
cd web
npx wrangler@4 login
npx wrangler@4 pages project create grove --production-branch master   # once
VITE_SITE_URL=https://<project>.pages.dev npm run build
rsync -a --include='*.m4a' --exclude='*' ../audio/ dist/audio/
npx wrangler@4 pages deploy dist --project-name grove --branch master
```

- **Size.** A deployment holds at most 20,000 files of up to 25 MiB each. The medium subset is 14,586 clips (3.6 GB) plus about 40 site files. Wrangler uploads only files the project does not have yet, so only the first deployment sends the clips.
- **Caching.** `web/public/_headers` serves every clip with `Cache-Control: public, max-age=31536000, immutable`; a clip never changes for a given track id.
- **Check.** Run `web/scripts/measure.ts` against the deployed URL to confirm the payload with the real host's compression.

**Kill switch.** To take the audio offline, deploy the same build without `dist/audio/`. The site keeps loading; the trees just stay silent.

**Fallback.** If the audio has to leave Pages, put the clips on Cloudflare R2 behind a custom domain, with the protections in CLAUDE.md §4 in place first. Build with `VITE_AUDIO_BASE=https://<audio domain>/audio/`, and let the bucket's CORS policy allow `GET` from the site's origin.

## Contributing

Read [CLAUDE.md](CLAUDE.md) first: it holds the project rules, for people and coding agents alike. Before a pull request, `go test ./...` in `pipeline/` and `npm run check && npm test` in `web/` must pass.

## License

- Code: [MIT](LICENSE).
- FMA metadata: CC BY 4.0.
- Audio: each track keeps its own Creative Commons license. NonCommercial tracks must not be used commercially, including in forks.

Details and credits in [NOTICE](NOTICE).
