// Objective checks of direction and clicks on the real audio graph. Clips are
// replaced by synthetic WAVs through request interception, so the signal is
// known; everything else (scheduler, voices, HRTF panners, listener) is the
// app as built. The master bus is captured with an AudioWorklet. Usage:
//   GROVE_BROWSER=<path> node scripts/audio-check.ts <site-url> <subset>
// Exits 1 if a check fails.

import type { Page } from 'playwright-core';
import type { BiomeFile, World } from '../src/world/schema.ts';
import { debugUrl, enter, hold, launch, openGate, sleep } from './browser.ts';

const RATE = 48_000;
const CLIP_SECONDS = 3;

/** A mono 32-bit float WAV. */
function wav(samples: Float32Array): Buffer {
  const data = Buffer.alloc(samples.length * 4);
  samples.forEach((v, i) => data.writeFloatLE(v, i * 4));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(3, 20); // IEEE float
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 4, 28);
  h.writeUInt16LE(4, 32);
  h.writeUInt16LE(32, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** Low sine per track: a click shows up far above its second difference. */
function sine(id: number): Buffer {
  const f = 150 + (id % 40) * 7;
  return wav(Float32Array.from({ length: RATE * CLIP_SECONDS }, (_, i) => 0.2 * Math.sin((2 * Math.PI * f * i) / RATE)));
}

/** Stationary white noise per track, so level differences come from geometry only. */
function noise(id: number): Buffer {
  let s = (id * 2654435761) >>> 0 || 1;
  return wav(
    Float32Array.from({ length: RATE * CLIP_SECONDS }, () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return 0.1 * (((s >>> 0) / 4294967296) * 2 - 1);
    }),
  );
}

async function serveClips(page: Page, clip: (id: number) => Buffer): Promise<void> {
  await page.route(/\/audio\/(\d+)\.m4a$/, (route) => {
    const id = Number(/\/(\d+)\.m4a$/.exec(route.request().url())?.[1]);
    return route.fulfill({ status: 200, contentType: 'audio/wav', body: clip(id) });
  });
}

/** Starts recording the stereo master bus in the page. */
async function startCapture(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const tap = window.__grove?.audioTap();
    if (tap === undefined) throw new Error('no debug hook');
    const code = `registerProcessor('grove-tap', class extends AudioWorkletProcessor {
      process(inputs) { const i = inputs[0]; if (i && i.length) this.port.postMessage([i[0].slice(0), (i[1] ?? i[0]).slice(0)]); return true; }
    });`;
    await tap.ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    const node = new AudioWorkletNode(tap.ctx, 'grove-tap', { channelCount: 2, channelCountMode: 'explicit' });
    const w = window as unknown as { __cap: { l: Float32Array[]; r: Float32Array[]; marks: [string, number][] } };
    w.__cap = { l: [], r: [], marks: [] };
    node.port.onmessage = (e: MessageEvent<[Float32Array, Float32Array]>) => {
      w.__cap.l.push(e.data[0]);
      w.__cap.r.push(e.data[1]);
    };
    const silent = new GainNode(tap.ctx, { gain: 0 });
    tap.node.connect(node).connect(silent).connect(tap.ctx.destination);
  });
  // The worklet starts a few render quanta later; a mark taken before that opens an empty segment.
  await page.waitForFunction(() => (window as unknown as { __cap: { l: Float32Array[] } }).__cap.l.length > 8);
}

/** Marks the current capture position with a label. */
const mark = (page: Page, label: string) =>
  page.evaluate((l) => {
    const w = window as unknown as { __cap: { l: Float32Array[]; marks: [string, number][] } };
    w.__cap.marks.push([l, w.__cap.l.reduce((n, b) => n + b.length, 0)]);
  }, label);

async function main(): Promise<void> {
  const [site, subset] = process.argv.slice(2);
  if (site === undefined || subset === undefined) throw new Error('usage: node scripts/audio-check.ts <site-url> <subset>');
  const data = `${new URL(site).pathname.replace(/\/$/, '')}/data/${subset}/`;
  const browser = await launch();
  const log: string[] = [];
  let ok = true;

  // Direction: stand 1.5 m east of a tree, then turn. The interaural level
  // difference must follow the head: the near tree is on the left facing
  // north (heading 0) and on the right facing south (180).
  {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    let only = -1;
    // Only the near tree makes sound, so the level difference is that one source's spatialization.
    await serveClips(page, (id) => (id === only ? noise(id) : wav(new Float32Array(RATE * CLIP_SECONDS))));
    await page.goto(debugUrl(site));
    const world = (await page.evaluate(async (u) => (await fetch(u)).json(), `${data}world.json`)) as World;
    const biome = world.biomes[0];
    if (biome === undefined) throw new Error('no biomes');
    const file = (await page.evaluate(async (u) => (await fetch(u)).json(), `${data}${biome.file}`)) as BiomeFile;
    const tree = file.trees[0];
    if (tree === undefined) throw new Error('no trees');
    only = tree.id;
    const at = (h: number) => `#x=${(tree.x + 1.5).toFixed(1)}&z=${tree.z.toFixed(1)}&h=${h}`;
    await openGate(page, debugUrl(site));
    await enter(page);
    // A hash change only moves the player once the app runs (a same-document navigation does not reload).
    await page.evaluate((hash) => {
      location.hash = hash;
    }, at(90));
    await sleep(4000); // dwell, load, fade in
    await startCapture(page);
    const headings = [0, 180, 90, 270, 0, 180, 90, 270];
    for (const h of headings) {
      await page.evaluate((hash) => {
        location.hash = hash;
      }, at(h));
      await sleep(300); // let the HRTF crossfade settle
      await mark(page, `h${h}`);
      await sleep(1200);
      await mark(page, 'end');
    }
    const result = await page.evaluate(() => {
      const w = window as unknown as { __cap: { l: Float32Array[]; r: Float32Array[]; marks: [string, number][] } };
      const join = (bs: Float32Array[]) => {
        const out = new Float32Array(bs.reduce((n, b) => n + b.length, 0));
        let o = 0;
        for (const b of bs) {
          out.set(b, o);
          o += b.length;
        }
        return out;
      };
      const L = join(w.__cap.l);
      const R = join(w.__cap.r);
      const rms = (x: Float32Array, a: number, b: number) => {
        let s = 0;
        for (let i = a; i < b; i++) s += (x[i] ?? 0) ** 2;
        return Math.sqrt(s / Math.max(1, b - a));
      };
      const byHeading: Record<string, number[]> = {};
      for (let i = 0; i + 1 < w.__cap.marks.length; i += 2) {
        const [label, a] = w.__cap.marks[i] ?? ['', 0];
        const b = w.__cap.marks[i + 1]?.[1] ?? a;
        (byHeading[label] ??= []).push(20 * Math.log10(rms(L, a, b) / rms(R, a, b)));
      }
      return { byHeading, voices: window.__grove?.voices() };
    });
    const mean = (h: number) => {
      const v = result.byHeading[`h${h}`] ?? [];
      return v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
    };
    const [d0, d180, d90, d270] = [mean(0), mean(180), mean(90), mean(270)];
    log.push(`Direction: left-minus-right level (dB), the only sounding tree 1.5 m to the west (${result.voices} voices active):`);
    log.push(`  facing north (tree left) ${d0.toFixed(1)}, south (tree right) ${d180.toFixed(1)}, west (tree ahead) ${d270.toFixed(1)}, east (tree behind) ${d90.toFixed(1)}`);
    log.push(`  per segment: ${JSON.stringify(Object.fromEntries(Object.entries(result.byHeading).map(([k, v]) => [k, v.map((x) => +x.toFixed(1))])))}`);
    const f06 = d0 > 3 && d180 < -3 && Math.abs(d0 + d180) < 3;
    log.push(`  ${f06 ? 'PASS' : 'FAIL'}: turning 180° flips the level difference (> 3 dB each way, mirrored within 3 dB)`);
    ok &&= f06;
    await page.context().close();
  }

  // Clicks: no clicks or pops. Clips are 3 s looping low sines; a click is a
  // jump in the second difference far above what the sines produce.
  // Phase "switch": the player does not move while voices fade in, loop, get
  // pinned and silenced (a silenced voice fades out and the next tree fades
  // in on it). Phase "move": walking and sprinting, so voices switch while
  // their directions change. A deliberate 0.02 step at the end checks the
  // detector.
  {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await serveClips(page, sine);
    await openGate(page, debugUrl(site));
    await enter(page);
    // Park the mouse at the click point now: under pointer lock, moving it there later would turn the head.
    await page.mouse.move(640, 400);
    await sleep(500);
    await startCapture(page);
    await mark(page, 'switch');
    const events: string[] = [];
    const state = () =>
      page.evaluate(() => `${document.querySelector('.panel')?.getAttribute('data-state') ?? '-'}, ${window.__grove?.voices()} voices`);
    await sleep(7000); // fade-ins, then loop restarts every 3 s
    events.push(`after 7 s standing: ${await state()}`);
    if ((await page.locator('.hud.has-target').count()) > 0) {
      await mark(page, 'pin');
      await page.mouse.click(640, 400); // pin
      await sleep(3500);
      events.push(`pinned the aimed tree: ${await state()}`);
      await mark(page, 'silence');
      await page.mouse.click(640, 400); // silence: fade out, another tree takes the voice
      await sleep(3500);
      events.push(`silenced it: ${await state()}`);
    }
    await mark(page, 'move');
    await hold(page, 'KeyW', 2500);
    await mark(page, 'stop');
    await sleep(1500);
    await mark(page, 'sprint');
    await page.keyboard.down('ShiftLeft');
    await hold(page, 'KeyD', 3000);
    await page.keyboard.up('ShiftLeft');
    await mark(page, 'stop again');
    await sleep(1500);
    await mark(page, 'control');
    await page.evaluate(() => {
      const tap = window.__grove?.audioTap();
      if (tap === undefined) return;
      const step = new ConstantSourceNode(tap.ctx, { offset: 0.02 });
      step.connect(tap.node);
      step.start();
      step.stop(tap.ctx.currentTime + 0.5);
    });
    await sleep(1000);
    await mark(page, 'end');
    const r = await page.evaluate(() => {
      const w = window as unknown as { __cap: { l: Float32Array[]; r: Float32Array[]; marks: [string, number][] } };
      const join = (bs: Float32Array[]) => {
        const out = new Float32Array(bs.reduce((n, b) => n + b.length, 0));
        let o = 0;
        for (const b of bs) {
          out.set(b, o);
          o += b.length;
        }
        return out;
      };
      // The context runs at the device rate (44.1 kHz on this Mac), not at the clips' rate.
      const rate = window.__grove?.audioTap().ctx.sampleRate;
      if (rate === undefined) throw new Error('no debug hook');
      const win = Math.round(rate / 100); // 10 ms
      const L = join(w.__cap.l);
      const R = join(w.__cap.r);
      const d: number[] = [];
      for (let a = 2; a + win <= L.length; a += win) {
        let m = 0;
        for (let i = a; i < a + win; i++) {
          m = Math.max(m, Math.abs((L[i] ?? 0) - 2 * (L[i - 1] ?? 0) + (L[i - 2] ?? 0)), Math.abs((R[i] ?? 0) - 2 * (R[i - 1] ?? 0) + (R[i - 2] ?? 0)));
        }
        d.push(m);
      }
      const at = (label: string) => Math.floor((w.__cap.marks.find(([l]) => l === label)?.[1] ?? L.length) / win);
      const phases: Record<'switch' | 'move' | 'control', [number, number]> = {
        switch: [at('switch'), at('move')],
        move: [at('move'), at('control')],
        control: [at('control'), at('end')],
      };
      const switching = d.slice(phases.switch[0], phases.switch[1]).filter((v) => v > 1e-6).sort((a, b) => a - b);
      const median = switching[Math.floor(switching.length / 2)] ?? 0;
      const stats = (range: [number, number]) => {
        const xs = d.slice(range[0], range[1]);
        return { seconds: (xs.length * win) / rate, max: Math.max(...xs), over: xs.filter((v) => v > 8 * median).length };
      };
      const label = (i: number) => {
        const m = [...w.__cap.marks].reverse().find(([, pos]) => pos <= i * win);
        return m === undefined ? '' : `${m[0]}+${((i * win - m[1]) / rate).toFixed(2)} s`;
      };
      const spikes = d
        .map((v, i) => ({ i, v }))
        .filter(({ i, v }) => i >= phases.switch[0] && i < phases.move[1] && v > 8 * median)
        .map(({ i, v }) => `${((i * win) / rate).toFixed(2)} s (${label(i)}) ${(v / median).toFixed(1)}x`);
      return { median, spikes, switch: stats(phases.switch), move: stats(phases.move), control: stats(phases.control) };
    });
    const threshold = 8 * r.median;
    const fmt = (x: { seconds: number; max: number; over: number }) =>
      `${x.seconds.toFixed(1)} s, max ${x.max.toExponential(2)} (${(x.max / r.median).toFixed(1)}x median), ${x.over} windows over the threshold`;
    log.push(`Click threshold: 8x the median 10 ms peak |second difference| while standing = ${threshold.toExponential(2)}`);
    for (const e of events) log.push(`  ${e}`);
    log.push(`  switch (fade-ins, loop restarts, pin, silence; listener still): ${fmt(r.switch)}`);
    log.push(`  move (walk and sprint, voices switching while directions change): ${fmt(r.move)}`);
    for (const sp of r.spikes) log.push(`    over the threshold at ${sp}`);
    log.push(`  positive control, a 0.02 step: ${fmt(r.control)}`);
    const f08 = r.switch.seconds > 10 && r.switch.over === 0 && r.move.over === 0 && r.control.over > 0;
    log.push(`  ${f08 ? 'PASS' : 'FAIL'}: switching and moving stay under the click threshold, and the control step crosses it`);
    ok &&= f08;
  }

  // Clicks while turning: one sine tree, the player turns in place. Nothing
  // switches and nothing walks; a moving HRTF panner would click here
  // (Chrome steps its interaural delay), the panner pairs must not.
  {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    let only = -1;
    await serveClips(page, (id) => (id === only ? sine(0) : wav(new Float32Array(RATE * CLIP_SECONDS))));
    await page.goto(debugUrl(site));
    const world = (await page.evaluate(async (u) => (await fetch(u)).json(), `${data}world.json`)) as World;
    const file = (await page.evaluate(async (u) => (await fetch(u)).json(), `${data}${world.biomes[0]?.file ?? ''}`)) as BiomeFile;
    const tree = file.trees[0];
    if (tree === undefined) throw new Error('no trees');
    only = tree.id;
    await openGate(page, debugUrl(site));
    await enter(page);
    await page.evaluate((hash) => {
      location.hash = hash;
    }, `#x=${(tree.x + 1.5).toFixed(1)}&z=${tree.z.toFixed(1)}&h=0`);
    await page.mouse.move(640, 400);
    await sleep(5000);
    await startCapture(page);
    await mark(page, 'still');
    await sleep(2000);
    const f0 = await page.evaluate(() => window.__grove?.listenerForward() ?? { x: 0, z: 0 });
    await mark(page, 'turn');
    // About 30 degrees per second for 3 s: 4 px per 16 ms at config.player.mouseSensitivity.
    for (let i = 1; i <= 188; i++) {
      await page.mouse.move(640 + 4 * i, 400);
      await sleep(16);
    }
    await mark(page, 'end');
    await sleep(500);
    const f1 = await page.evaluate(() => window.__grove?.listenerForward() ?? { x: 0, z: 0 });
    const r = await page.evaluate(() => {
      const w = window as unknown as { __cap: { l: Float32Array[]; r: Float32Array[]; marks: [string, number][] } };
      const join = (bs: Float32Array[]) => {
        const out = new Float32Array(bs.reduce((n, b) => n + b.length, 0));
        let o = 0;
        for (const b of bs) {
          out.set(b, o);
          o += b.length;
        }
        return out;
      };
      // The context runs at the device rate (44.1 kHz on this Mac), not at the clips' rate.
      const rate = window.__grove?.audioTap().ctx.sampleRate;
      if (rate === undefined) throw new Error('no debug hook');
      const win = Math.round(rate / 100); // 10 ms
      const L = join(w.__cap.l);
      const R = join(w.__cap.r);
      const d: number[] = [];
      for (let a = 2; a + win <= L.length; a += win) {
        let m = 0;
        for (let i = a; i < a + win; i++) {
          m = Math.max(m, Math.abs((L[i] ?? 0) - 2 * (L[i - 1] ?? 0) + (L[i - 2] ?? 0)), Math.abs((R[i] ?? 0) - 2 * (R[i - 1] ?? 0) + (R[i - 2] ?? 0)));
        }
        d.push(m);
      }
      const at = (label: string) => Math.floor((w.__cap.marks.find(([l]) => l === label)?.[1] ?? 0) / win);
      const still = d.slice(at('still'), at('turn'));
      const turn = d.slice(at('turn'), at('end'));
      const sorted = [...still].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      return { median, stillMax: Math.max(...still) / median, turnMax: Math.max(...turn) / median, over: turn.filter((v) => v > 8 * median).length, seconds: (turn.length * win) / rate };
    });
    const turned = (Math.acos(Math.min(1, f0.x * f1.x + f0.z * f1.z)) * 180) / Math.PI;
    log.push(`Clicks while turning (one sine tree 1.5 m away, no switching, no walking):`);
    log.push(`  standing 2 s: max ${r.stillMax.toFixed(1)}x median`);
    log.push(`  turning ${turned.toFixed(0)}° in ${r.seconds.toFixed(1)} s: max ${r.turnMax.toFixed(1)}x median, ${r.over} windows over 8x`);
    const turnOk = r.over === 0 && turned > 45;
    log.push(`  ${turnOk ? 'PASS' : 'FAIL'}: turning stays under the click threshold`);
    ok &&= turnOk;
  }

  await browser.close();
  console.log(log.join('\n'));
  if (!ok) process.exitCode = 1;
}

await main();
