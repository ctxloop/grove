// Measures the non-functional targets (LIMITS below) against a
// running build. Usage:
//   GROVE_BROWSER=<path> node scripts/measure.ts <site-url> <subset>
// Prints a JSON report and exits 1 if any limit is missed.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { Page } from 'playwright-core';
import { debugUrl, enter, hold, launch, openGate, sleep } from './browser.ts';

const LIMITS = {
  initialGzipBytes: 5 * 1024 * 1024,
  biomeGzipBytes: 300 * 1024,
  /** Main-thread work per frame, so every frame, not a percentile. */
  frameMaxMs: 4,
  /** config.audio.voices. */
  voices: 3,
};

/** Every biome file of the subset as committed, gzipped at the default level (what static hosts serve). */
function biomeSizes(subset: string): { file: string; raw: number; gzip: number }[] {
  const dir = join(import.meta.dirname, '..', 'public', 'data', subset);
  return readdirSync(dir)
    .filter((f) => /^biome-\d+\.json$/.test(f))
    .map((file) => {
      const body = readFileSync(join(dir, file));
      return { file, raw: body.length, gzip: gzipSync(body).length };
    })
    .sort((a, b) => b.gzip - a.gzip);
}

interface Window5s {
  p50: number;
  p95: number;
  p99: number;
  max: number;
  n: number;
  quality: number;
}

/** Collects frame-time windows and the voice count inside the page until stopSampling(). */
async function startSampling(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = window.__grove;
    if (g === undefined) throw new Error('no debug hook');
    const w = window as unknown as { __windows: Window5s[]; __maxVoices: number; __timers: number[] };
    w.__windows = [];
    w.__maxVoices = 0;
    g.frameStats.reset();
    w.__timers = [
      window.setInterval(() => {
        w.__maxVoices = Math.max(w.__maxVoices, g.voices());
      }, 50),
      window.setInterval(() => {
        const s = g.frameStats;
        w.__windows.push({ p50: s.percentile(50), p95: s.percentile(95), p99: s.percentile(99), max: s.max(), n: s.count, quality: g.quality() });
        s.reset();
      }, 5000),
    ];
  });
}

async function stopSampling(page: Page): Promise<{ windows: Window5s[]; maxVoices: number }> {
  return page.evaluate(() => {
    const w = window as unknown as { __windows: Window5s[]; __maxVoices: number; __timers: number[] };
    for (const t of w.__timers) clearInterval(t);
    return { windows: w.__windows, maxVoices: w.__maxVoices };
  });
}

/** Walks, sprints and stands still in turn, so voices start, fade, and biomes stream in. */
async function journey(page: Page): Promise<void> {
  const stand = (ms: number) => sleep(ms);
  await stand(3000);
  await hold(page, 'KeyW', 6000);
  await stand(2500);
  await hold(page, 'KeyD', 5000);
  await stand(2500);
  await page.keyboard.down('ShiftLeft');
  await hold(page, 'KeyW', 8000);
  await page.keyboard.up('ShiftLeft');
  await stand(2500);
  await hold(page, 'KeyA', 6000);
  await stand(2500);
  await page.keyboard.down('ShiftLeft');
  await hold(page, 'KeyS', 8000);
  await page.keyboard.up('ShiftLeft');
  await stand(3000);
}

async function main(): Promise<void> {
  const [site, subset] = process.argv.slice(2);
  if (site === undefined || subset === undefined) throw new Error('usage: node scripts/measure.ts <site-url> <subset>');

  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  // A frame time means nothing if the scene failed to draw: any renderer error fails the run.
  const renderErrors: string[] = [];
  page.on('console', (m) => {
    if (m.text().includes('WebGPURenderer') || m.text().includes('THREE.')) renderErrors.push(m.text().split('\n')[0] ?? '');
  });

  // Initial load: everything fetched until the Enter button is ready, audio excluded.
  const initial: { url: string; raw: number; gzip: number }[] = [];
  let gateReady = false;
  const bodies: Promise<void>[] = [];
  page.on('response', (r) => {
    if (gateReady || r.url().includes('/audio/')) return;
    bodies.push(
      r.body().then(
        (b) => void initial.push({ url: new URL(r.url()).pathname, raw: b.length, gzip: gzipSync(b).length }),
        () => undefined,
      ),
    );
  });
  await openGate(page, debugUrl(site));
  gateReady = true;
  await Promise.all(bodies);
  await enter(page);
  const backend = await page.evaluate(() => window.__grove?.backend);

  // Shader compilation and the first biome uploads happen in the first frames; leave them out.
  await sleep(3000);
  await startSampling(page);
  await journey(page);
  const { windows, maxVoices } = await stopSampling(page);

  // Hidden tab. Automated Chromium keeps every page visible (no tab switch or
  // minimize changes document.visibilityState), so this overrides
  // document.hidden and fires visibilitychange the way the browser would, then
  // checks what the app does: rAF stops and the AudioContext is suspended.
  const setHidden = (h: boolean) =>
    page.evaluate((hide) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hide });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hide ? 'hidden' : 'visible') });
      document.dispatchEvent(new Event('visibilitychange'));
    }, h);
  const framesOf = () => page.evaluate(() => window.__grove?.frames() ?? -1);
  await setHidden(true);
  await sleep(500);
  const hiddenStart = await framesOf();
  await sleep(2000);
  const hidden = {
    documentHidden: await page.evaluate(() => document.hidden),
    framesWhileHidden: (await framesOf()) - hiddenStart,
    audioState: await page.evaluate(() => window.__grove?.audioState()),
  };
  await setHidden(false);
  await sleep(500);
  const shownStart = await framesOf();
  await sleep(1000);
  const shown = {
    framesPerSecond: (await framesOf()) - shownStart,
    audioState: await page.evaluate(() => window.__grove?.audioState()),
  };
  await browser.close();

  const biomes = biomeSizes(subset);
  const initialGzip = initial.reduce((s, r) => s + r.gzip, 0);
  const worstP95 = Math.max(...windows.map((w) => w.p95));
  const worstMax = Math.max(...windows.map((w) => w.max));
  const checks = {
    initialLoad: initialGzip <= LIMITS.initialGzipBytes,
    biomeGzip: (biomes[0]?.gzip ?? 0) <= LIMITS.biomeGzipBytes,
    frameTime: worstMax <= LIMITS.frameMaxMs,
    voices: maxVoices <= LIMITS.voices,
    hiddenTab: hidden.documentHidden && hidden.framesWhileHidden === 0 && hidden.audioState === 'suspended' && shown.audioState === 'running' && shown.framesPerSecond > 0,
    noRenderErrors: renderErrors.length === 0,
  };
  const report = {
    site,
    subset,
    backend,
    limits: LIMITS,
    checks,
    initial: { gzipBytes: initialGzip, rawBytes: initial.reduce((s, r) => s + r.raw, 0), requests: initial.length, largest: [...initial].sort((a, b) => b.gzip - a.gzip).slice(0, 5) },
    biomes: { count: biomes.length, largest: biomes.slice(0, 3) },
    frames: { worstP95, worstP99: Math.max(...windows.map((w) => w.p99)), worstMax, windows },
    voices: { max: maxVoices },
    hidden,
    shown,
    renderErrors: [...new Set(renderErrors)],
  };
  console.log(JSON.stringify(report, null, 2));
  if (Object.values(checks).includes(false)) process.exitCode = 1;
}

await main();
