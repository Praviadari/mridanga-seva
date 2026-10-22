// Draws the icons of the "Mridanga Seva TEST" app (APP_VARIANT=facetest, app.config.js; docs/DECISIONS.md #430): the
// app's own icon and Android adaptive layers with a red "TEST" band, so a tester never mistakes the face-scan test
// app for the class's real app on the same phone. Reads the PNGs that scripts/make-emblem-icons.mjs wrote to
// assets/images/ and writes the badged copies to assets/images/facetest/. Run from app/ after the emblem changes:
//   node scripts/make-facetest-icons.mjs
// The band on an adaptive layer stays inside Android's safe zone (a circle of 66/108 of the layer). Uses only Node's
// built-in zlib (8-bit RGBA, non-interlaced PNGs: what make-emblem-icons.mjs writes).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

const RED = [198, 40, 40, 255];
const WHITE = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];

// A 5 x 7 bitmap of the three letters needed.
const GLYPHS = {
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
};

/** Decodes an 8-bit RGBA, non-interlaced PNG into { width, height, data } (data: RGBA bytes). */
function readPng(path) {
  const buf = readFileSync(path);
  let pos = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error(`${path}: not an 8-bit RGBA, non-interlaced PNG`);
    } else if (type === 'IDAT') idat.push(body);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const data = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? data[y * stride + x - 4] : 0;
      const b = y > 0 ? data[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? data[(y - 1) * stride + x - 4] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      data[y * stride + x] = v & 255;
    }
  }
  return { width, height, data };
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, body) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const tb = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tb));
  return Buffer.concat([len, tb, crc]);
}

/** Writes { width, height, data } as an 8-bit RGBA PNG (filter 0 on every line). */
function writePng(path, { width, height, data }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
}

/** Draws a rounded band (x0..x1, y0..y1) in `band` with "TEST" centred in `text`, `scale` px per font dot. */
function drawBadge(img, { x0, x1, y0, y1, scale, band, text }) {
  const r = Math.round((y1 - y0) / 4);
  const set = (x, y, rgba) => {
    const i = (y * img.width + x) * 4;
    for (let k = 0; k < 4; k++) img.data[i + k] = rgba[k];
  };
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = Math.max(x0 + r - x, 0, x - (x1 - 1 - r));
      const dy = Math.max(y0 + r - y, 0, y - (y1 - 1 - r));
      if (dx * dx + dy * dy <= r * r) set(x, y, band);
    }
  }
  const word = 'TEST';
  const w = (word.length * 5 + (word.length - 1)) * scale;
  const h = 7 * scale;
  const left = Math.round((x0 + x1 - w) / 2);
  const top = Math.round((y0 + y1 - h) / 2);
  [...word].forEach((ch, n) => {
    GLYPHS[ch].forEach((row, gy) => {
      [...row].forEach((dot, gx) => {
        if (dot !== '1') return;
        for (let y = 0; y < scale; y++) {
          for (let x = 0; x < scale; x++) set(left + (n * 6 + gx) * scale + x, top + gy * scale + y, text);
        }
      });
    });
  });
}

const OUT = 'assets/images/facetest';
mkdirSync(OUT, { recursive: true });

// The legacy square icon: a wide band near the foot.
const icon = readPng('assets/images/icon.png');
drawBadge(icon, { x0: 192, x1: 832, y0: 770, y1: 920, scale: 18, band: RED, text: WHITE });
writePng(`${OUT}/icon.png`, icon);

// Adaptive layers (1024 px, safe circle radius 1024 * 33/108 ≈ 313 round the centre): the band from y 600 to 730,
// x 330 to 694, so its corners stay about 300 px from the centre.
const adaptive = { x0: 330, x1: 694, y0: 600, y1: 730, scale: 14 };
const fg = readPng('assets/images/android-icon-foreground.png');
drawBadge(fg, { ...adaptive, band: RED, text: WHITE });
writePng(`${OUT}/android-icon-foreground.png`, fg);
// Themed (monochrome) icons use only the alpha: an opaque band with the letters cut out.
const mono = readPng('assets/images/android-icon-monochrome.png');
drawBadge(mono, { ...adaptive, band: WHITE, text: CLEAR });
writePng(`${OUT}/android-icon-monochrome.png`, mono);

const far = Math.hypot(694 - 512, 730 - 512);
console.log(`Wrote ${OUT}/icon.png, android-icon-foreground.png, android-icon-monochrome.png; band corner ${far.toFixed(0)} px from the centre (safe zone 313).`);
