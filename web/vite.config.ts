import { createReadStream, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// The site's absolute URL for the link-preview tags in index.html. Production
// builds set it; local builds get root-relative links.
process.env.VITE_SITE_URL ??= '';

// Serves /audio/<track_id>.(mp3|m4a) from the repo-root audio/ directory in
// `vite` and `vite preview`, standing in for the audio domain locally
// (docs/architecture.md §6). Only that exact path shape is answered.
const AUDIO_DIR = resolve(import.meta.dirname, '..', 'audio');
const AUDIO_PATH = /^\/(\d+)\.(mp3|m4a)$/;
const AUDIO_TYPES: Record<string, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4' };

const serveAudio: Connect.NextHandleFunction = (req, res, next) => {
  const m = AUDIO_PATH.exec(req.url ?? '');
  if (m === null || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
  const [, id, ext] = m;
  const file = resolve(AUDIO_DIR, `${id}.${ext}`);
  let size: number;
  try {
    size = statSync(file).size;
  } catch {
    res.statusCode = 404;
    res.end();
    return;
  }
  res.setHeader('Content-Type', AUDIO_TYPES[ext ?? ''] ?? 'application/octet-stream');
  res.setHeader('Content-Length', size);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  if (req.method === 'HEAD') return void res.end();
  createReadStream(file).pipe(res);
};

const localAudio: Plugin = {
  name: 'grove-local-audio',
  configureServer(server) {
    server.middlewares.use('/audio', serveAudio);
  },
  configurePreviewServer(server) {
    server.middlewares.use('/audio', serveAudio);
  },
};

export default defineConfig({
  plugins: [localAudio],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
