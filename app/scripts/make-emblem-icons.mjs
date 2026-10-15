// Draws the app icon, the Android adaptive icon layers, the splash image, the favicon and the web version's
// home-screen icons from the website's emblem (website/src/art.mjs emblem(): twelve gold petals round a night disc
// with a gold ring, and a clay drum with cream heads), on the website's night (docs/DECISIONS.md #364; design
// decision 7, Praveen 15-10-2026). Replaces scripts/make-placeholder-icons.mjs (the saffron placeholder). Run from app/:
//   node scripts/make-emblem-icons.mjs
// It overwrites the PNGs in assets/images/ and public/ and prints, for each Android layer, how far the drawing reaches
// from the centre: Android keeps only a circle of 66/108 of the layer on round launchers (the safe zone).
// Uses only Node's built-in zlib to write PNG files, so it needs no extra packages.

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// The website's colours (website/src/tokens.css, design/tokens.json): night, night-2, deep night, gold; the emblem's
// clay and cream (website/src/styles.css .emb-drum, .emb-head).
const NIGHT = hex('#1B1E4B');
const NIGHT_2 = hex('#262A66');
const NIGHT_DEEP = hex('#12143A');
const GOLD = hex('#E0B25C');
const CLAY = hex('#C8743F');
const CREAM = hex('#F6E7CC');
const WHITE = [255, 255, 255];

/** The drum body of the emblem (viewBox 0..64) as a polygon: two cubic Béziers joined by straight sides. */
const DRUM = (() => {
  const cubic = (p0, p1, p2, p3, n) =>
    Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n;
      const u = 1 - t;
      return [
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ];
    });
  return [...cubic([17, 25], [24, 21], [38, 21], [46, 25], 40), ...cubic([46, 39], [38, 43], [24, 43], [17, 39], 40)];
})();

function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

/**
 * Twelve petals: ellipses rx 4, ry 6 centred 24 above the centre, turned every 30 degrees (art.mjs petals()). They do
 * not overlap, so only the petal nearest the point's angle is tested.
 */
function inPetal(x, y) {
  const dx = x - 32;
  const dy = y - 32;
  const step = Math.PI / 6;
  const i = Math.round(Math.atan2(dx, -dy) / step);
  const a = -i * step;
  const rx = dx * Math.cos(a) - dy * Math.sin(a) + 32;
  const ry = dx * Math.sin(a) + dy * Math.cos(a) + 32;
  return inEllipse(rx, ry, 32, 8, 4, 6);
}
/**
 * The emblem's colour at (x, y) in its 0..64 box, as [r, g, b, alpha 0..1], or null outside it.
 * `mono` draws a white silhouette (petals, ring, drum) for Android's themed icon and the notification icon.
 */
function emblemAt(x, y, mono) {
  const d = Math.hypot(x - 32, y - 32);
  if (d > 30.1) return null; // beyond the petals' tips
  const head = inEllipse(x, y, 17, 32, 3, 7.5) || inEllipse(x, y, 46, 32, 2.2, 6);
  const drum = x >= 17 && x <= 46 && y >= 21 && y <= 43 && inPolygon(x, y, DRUM);
  if (mono) {
    if (head || drum) return [...WHITE, 1];
    if (d >= 17.25 && d <= 18.75) return [...WHITE, 1];
    if (d > 18.75 && inPetal(x, y)) return [...WHITE, 1];
    return null;
  }
  if (head) return [...CREAM, 1];
  if (drum) return [...CLAY, 1];
  if (d <= 17.25) return [...NIGHT_2, 1];
  if (d <= 18.75) return [...GOLD, 1];
  if (inPetal(x, y)) return [...GOLD, 0.85];
  return null;
}

/** The night background: a little lighter in the middle, like the home band's glow. */
function nightAt(px, py, size) {
  const d = Math.min(1, Math.hypot(px / size - 0.5, py / size - 0.5) / 0.7071);
  return NIGHT_2.map((c, k) => Math.round(c * (1 - d) + NIGHT_DEEP[k] * d));
}

/**
 * Renders one square image: an optional background (`night` or null = transparent) and the emblem `scale` wide
 * (fraction of the image), 4 x 4 samples per pixel. Returns the pixels and the farthest drawn pixel from the centre.
 */
function render(size, scale, background, mono = false) {
  const samples = 4;
  const pixels = Buffer.alloc(size * size * 4);
  let reach = 0;
  // A pixel farther than this from the emblem's centre (in emblem units) cannot touch it: background only.
  const pixel = 64 / (scale * size || 1);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const cx = (((px + 0.5) / size - 0.5) / (scale || 1) + 0.5) * 64;
      const cy = (((py + 0.5) / size - 0.5) / (scale || 1) + 0.5) * 64;
      if (!scale || Math.hypot(cx - 32, cy - 32) > 30.1 + pixel) {
        const i = (py * size + px) * 4;
        if (background) {
          const [nr, ng, nb] = nightAt(px + 0.5, py + 0.5, size);
          pixels[i] = nr;
          pixels[i + 1] = ng;
          pixels[i + 2] = nb;
          pixels[i + 3] = 255;
        }
        continue;
      }
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const ux = (px + (sx + 0.5) / samples) / size;
          const uy = (py + (sy + 0.5) / samples) / size;
          const ex = ((ux - 0.5) / scale + 0.5) * 64;
          const ey = ((uy - 0.5) / scale + 0.5) * 64;
          const base = background ? [...nightAt(ux * size, uy * size, size), 1] : [0, 0, 0, 0];
          const top = emblemAt(ex, ey, mono);
          let c = base;
          if (top) {
            const ta = top[3];
            const outA = ta + base[3] * (1 - ta);
            c = [0, 1, 2].map((k) => (top[k] * ta + base[k] * base[3] * (1 - ta)) / (outA || 1));
            c.push(outA);
          }
          r += c[0] * c[3];
          g += c[1] * c[3];
          b += c[2] * c[3];
          a += c[3];
        }
      }
      const n = samples * samples;
      const i = (py * size + px) * 4;
      const alpha = a / n;
      pixels[i] = alpha ? Math.round(r / a) : 0;
      pixels[i + 1] = alpha ? Math.round(g / a) : 0;
      pixels[i + 2] = alpha ? Math.round(b / a) : 0;
      pixels[i + 3] = Math.round(alpha * 255);
      if (!background && alpha > 0.02) reach = Math.max(reach, Math.hypot(px + 0.5 - size / 2, py + 0.5 - size / 2) / size);
    }
  }
  return { pixels, reach };
}

// ---------------------------------------------------------------- PNG writing (as make-placeholder-icons.mjs)

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
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
function png(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0;
    pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Android keeps a circle of 66/108 of an adaptive layer: drawing must stay within this radius (fraction of size). */
const SAFE = 33 / 108;

function write(file, size, scale, background, mono = false) {
  const { pixels, reach } = render(size, scale, background, mono);
  writeFileSync(file, png(size, pixels));
  const note = background ? '' : `, reaches ${(reach * 100).toFixed(1)} % of the size from the centre (safe ${(SAFE * 100).toFixed(1)} %)`;
  console.log(`wrote ${file} ${size} px${note}`);
  if (!background && (file.includes('android-icon') || file.includes('splash')) && reach > SAFE) throw new Error(`${file} leaves the safe zone`);
}

// App icon (iOS, Play Store, older Android): night with the emblem large.
write('assets/images/icon.png', 1024, 0.78, 'night');
// Android adaptive layers: night background; emblem foreground and white silhouette inside the safe zone.
write('assets/images/android-icon-background.png', 1024, 0, 'night');
write('assets/images/android-icon-foreground.png', 1024, 0.6, null);
write('assets/images/android-icon-monochrome.png', 1024, 0.6, null, true);
// Splash: the emblem alone on transparent (the night is the splash backgroundColor in app.json), inside the same safe
// circle, because Android 12 and later crop the splash icon to a circle as well.
write('assets/images/splash-icon.png', 1024, 0.64, null);
// Favicon and the web version's home-screen icons.
write('assets/images/favicon.png', 48, 0.92, 'night');
write('public/apple-touch-icon.png', 180, 0.78, 'night');
write('public/icon-192.png', 192, 0.78, 'night');
write('public/icon-512.png', 512, 0.78, 'night');
