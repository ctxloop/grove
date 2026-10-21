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

Feature-complete, not live yet: the audio hosting below comes first.

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

The site is static and hosted on Cloudflare Pages, connected to this repository:

- **Build settings.** Root directory `web`, build command `npm run build`, output directory `dist`.
- **Environment variables.** `NODE_VERSION=26.12.0` (the Pages default is older), `VITE_AUDIO_BASE=https://<audio domain>/audio/`, and `VITE_SITE_URL=https://<site domain>` for the link-preview image.

Audio is served from Cloudflare R2 behind that custom domain. R2 has no spending cap, so the site does not go public until the six protections in [CLAUDE.md §4](CLAUDE.md#4-audio-hosting-and-cost-red-lines) are in place. Also:

- **CORS.** The site and the audio are on different origins, so the bucket must allow `GET` from the site's origin. Without it no clip loads and no tree lights up.
- **Upload.** Only the `audio/*.m4a` clips, under the key `audio/<track_id>.m4a`, each with `Cache-Control: public, max-age=31536000, immutable`.
- **Check.** Run `web/scripts/measure.ts` against the deployed URL to confirm the payload with the real host's compression.

**Kill switch.** If traffic or the bill looks wrong, disable public access to the audio bucket (R2 → the bucket → Settings → Public access: disconnect the custom domain). The site keeps loading; the trees just stay silent.

## Contributing

Read [CLAUDE.md](CLAUDE.md) first: it holds the project rules, for people and coding agents alike. Before a pull request, `go test ./...` in `pipeline/` and `npm run check && npm test` in `web/` must pass.

## License

- Code: [MIT](LICENSE).
- FMA metadata: CC BY 4.0.
- Audio: each track keeps its own Creative Commons license. NonCommercial tracks must not be used commercially, including in forks.

Details and credits in [NOTICE](NOTICE).
