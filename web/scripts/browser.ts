// Shared browser setup for the measurement scripts (measure.ts, audio-check.ts).
// Drives a locally installed Chromium-based browser.

import { chromium, type Browser, type Page } from 'playwright-core';
// main.ts declares window.__grove; importing its type brings that declaration in.
export type { GroveDebug } from '../src/main';

/** GROVE_BROWSER: path of a Chromium-based browser (Chrome, Chromium, Brave). GROVE_HEADFUL=1 shows the window. */
export function launch(): Promise<Browser> {
  const executablePath = process.env.GROVE_BROWSER;
  if (executablePath === undefined || executablePath === '') {
    throw new Error('Set GROVE_BROWSER to the executable of a Chromium-based browser.');
  }
  return chromium.launch({
    executablePath,
    headless: process.env.GROVE_HEADFUL !== '1',
    // Keep the GPU on in headless mode; --use-angle=metal only matters on macOS.
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--enable-unsafe-webgpu'],
  });
}

/** Opens the site and waits until the Enter button is ready (world and first biome loaded). */
export async function openGate(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('.gate[data-state="ready"]', { timeout: 60_000 });
}

/** Clicks Enter and waits for the debug hook. */
export async function enter(page: Page): Promise<void> {
  await page.click('.gate__enter');
  await page.waitForFunction(() => window.__grove !== undefined);
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Holds a movement key (KeyboardEvent.code, e.g. 'KeyW') for `ms`. */
export async function hold(page: Page, code: string, ms: number): Promise<void> {
  await page.keyboard.down(code);
  await sleep(ms);
  await page.keyboard.up(code);
}

/** Appends `?debug` (keeping other parameters) so the page exposes window.__grove. */
export function debugUrl(base: string, extra = ''): string {
  const u = new URL(base);
  u.searchParams.set('debug', '');
  for (const [k, v] of new URLSearchParams(extra)) u.searchParams.set(k, v);
  return u.toString();
}
