// Draws the placeholder app icon, Android adaptive icon layers, splash image, favicon and the
// web version's home-screen icons: a plain mridanga (khol) outline in white on saffron. Run
// from app/ with
//   node scripts/make-placeholder-icons.mjs
// It overwrites the PNGs in assets/images/ and public/. Replace them with real artwork once the team
// chooses a logo (docs/OPERATIONS.md "App icon and splash screen").
//
// Uses only Node's built-in zlib to write PNG files, so it needs no extra packages.

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// Keep in step with `brand` in src/theme/colors.ts.
const SAFFRON = [0xb4, 0x53, 0x09];
const WHITE = [0xff, 0xff, 0xff];

/**
 * Coverage of the drum shape at point (x, y), both in units where the drum spans x = -1..1.
 * Returns 'body', 'head' or null. The left head (baya, bass) is larger than the right head
 * (dayan, treble), and the body bulges in the middle, as on a real khol.
 */
function drumPart(x, y) {
  const leftR = 0.36; // baya head radius
  const rightR = 0.24; // dayan head radius
  const bulge = 0.26;
  const headDepth = 0.1; // how round the drum heads look from the side
  // The heads: ellipses at each end, seen from the side.
  const inHead = (cx, r) => ((x - cx) / headDepth) ** 2 + (y / r) ** 2 <= 1;
  if (inHead(-0.9, leftR) && x < -0.9) return 'head';
  if (inHead(0.9, rightR) && x > 0.9) return 'head';
  if (x < -0.9 || x > 0.9) return null;
  const t = (x + 0.9) / 1.8;
  const radius = leftR * (1 - t) + rightR * t + bulge * Math.sin(Math.PI * t);
  if (Math.abs(y) > radius) return null;
  // Straps (tasma) run the length of the body from head to head, so they follow its curve.
  for (const k of [-0.62, -0.25, 0.25, 0.62]) {
    if (Math.abs(y - k * radius) < 0.022) return 'strap';
  }
  return 'body';
}

/**
 * Renders one square image.
 * @param size       width and height in pixels
 * @param drumWidth  fraction of the image width the drum spans (0..1)
 * @param background RGB array, or null for a transparent background
 * @param colour     RGB array for the drum
 */
function render(size, drumWidth, background, colour) {
  const samples = 4; // 4x4 supersampling for smooth edges
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let covered = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = ((px + (sx + 0.5) / samples) / size - 0.5) * (2 / drumWidth);
          const y = ((py + (sy + 0.5) / samples) / size - 0.5) * (2 / drumWidth);
          const part = drumPart(x, y);
          if (part === 'body') covered++;
          // The heads are drawn a little lighter than the body so they show on any background.
          if (part === 'head') covered += 0.55;
        }
      }
      const a = covered / (samples * samples);
      const i = (py * size + px) * 4;
      if (background) {
        for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(background[c] * (1 - a) + colour[c] * a);
        pixels[i + 3] = 255;
      } else {
        for (let c = 0; c < 3; c++) pixels[i + c] = colour[c];
        pixels[i + 3] = Math.round(a * 255);
      }
    }
  }
  return encodePng(size, size, pixels);
}

/** Solid colour square, used for the Android adaptive icon background layer. */
function solid(size, rgb) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) pixels.set([...rgb, 255], i * 4);
  return encodePng(size, size, pixels);
}

// ---------------------------------------------------------------- minimal PNG writer
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type RGBA
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    rows[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- outputs
const dir = 'assets/images/';
writeFileSync(dir + 'icon.png', render(1024, 0.7, SAFFRON, WHITE));
writeFileSync(dir + 'favicon.png', render(48, 0.84, SAFFRON, WHITE));
writeFileSync(dir + 'splash-icon.png', render(512, 0.95, null, WHITE));
// Android adaptive icons: the launcher crops to a circle or squircle, so the drum stays inside
// the middle ~60% (the "safe zone").
writeFileSync(dir + 'android-icon-foreground.png', render(512, 0.52, null, WHITE));
writeFileSync(dir + 'android-icon-background.png', solid(512, SAFFRON));
writeFileSync(dir + 'android-icon-monochrome.png', render(432, 0.52, null, WHITE));
// Web version: icons for "Add to Home Screen" (public/index.html, public/manifest.json).
// Expo copies public/ into the web export as it is. iPhones round the corners themselves.
const web = 'public/';
writeFileSync(web + 'apple-touch-icon.png', render(180, 0.7, SAFFRON, WHITE));
writeFileSync(web + 'icon-192.png', render(192, 0.7, SAFFRON, WHITE));
writeFileSync(web + 'icon-512.png', render(512, 0.7, SAFFRON, WHITE));
console.log('Placeholder icons written to ' + dir + ' and ' + web);
