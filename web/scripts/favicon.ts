// Draws the site icon, an original 16×16 pixel tree with one lit block, and writes
// public/favicon.ico with 16, 32, and 48 px images (nearest-neighbour scaled). Usage:
//   node scripts/favicon.ts

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** RGBA per palette key; '.' is transparent. */
const PALETTE: Record<string, readonly [number, number, number, number]> = {
  '.': [0, 0, 0, 0],
  D: [11, 18, 16, 255],
  L: [143, 209, 158, 255],
  G: [79, 154, 92, 255],
  S: [47, 107, 60, 255],
  Y: [242, 200, 121, 255],
  T: [110, 74, 46, 255],
  R: [106, 168, 79, 255],
};

const TREE = [
  '................',
  '....DDDDDDDD....',
  '...DLLGGGGGGD...',
  '..DLLGGGGGYYGD..',
  '.DLGGGGGGGYYGGD.',
  '.DGGGGGGGGGGGSD.',
  '.DGGGGGGGGGGSSD.',
  '..DGGGGGGGGSSD..',
  '...DDDDTTDDDD...',
  '......DTTD......',
  '......DTTD......',
  '......DTTD......',
  '.DDDDDDTTDDDDDD.',
  '.DRRRRRRRRRRRRD.',
  '.DDDDDDDDDDDDDD.',
  '................',
];

/** One ICO entry: a 32-bit BMP (bottom-up BGRA, then an all-zero AND mask), `scale` px per pixel. */
function bmp(rows: readonly string[], scale: number): Buffer {
  const size = rows.length * scale;
  const maskRow = Math.ceil(size / 32) * 4;
  const out = Buffer.alloc(40 + size * size * 4 + maskRow * size);
  out.writeUInt32LE(40, 0);
  out.writeInt32LE(size, 4);
  out.writeInt32LE(size * 2, 8); // ICO convention: the height covers the colour and the mask
  out.writeUInt16LE(1, 12);
  out.writeUInt16LE(32, 14);
  out.writeUInt32LE(size * size * 4, 20);
  for (let y = 0; y < size; y++) {
    const row = rows[rows.length - 1 - Math.floor(y / scale)] ?? '';
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = PALETTE[row[Math.floor(x / scale)] ?? '.'] ?? [0, 0, 0, 0];
      out.set([b, g, r, a], 40 + (y * size + x) * 4);
    }
  }
  return out;
}

/** An ICO file holding `rows` at each scale. */
function encodeIco(rows: readonly string[], scales: readonly number[]): Buffer {
  const images = scales.map((s) => bmp(rows, s));
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2); // type 1: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((img, i) => {
    const size = rows.length * (scales[i] ?? 1);
    const at = 6 + 16 * i;
    header.writeUInt8(size % 256, at); // 0 means 256
    header.writeUInt8(size % 256, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(img.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += img.length;
  });
  return Buffer.concat([header, ...images]);
}

const file = resolve(import.meta.dirname, '..', 'public', 'favicon.ico');
writeFileSync(file, encodeIco(TREE, [1, 2, 3]));
console.log(`wrote ${file}`);
