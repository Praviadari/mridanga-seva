// Draws every app icon and the splash image from the two SVG masters in assets/images/source/ (docs/DECISIONS.md
// #806, Praveen 03-11-2026): Prji's chosen red-and-gold khol lying on a round navy cushion, royal blue, no strap.
//   app_icon_pillow.svg       the lotus version: the launcher icon, the Android adaptive layers, favicon, web icons
//   app_icon_pillow_text.svg  the "MRIDANGA SEVA" version: the splash image
// Both are written by assets/images/source/make_app_icon_pillow.py (the drawing lives there; change it there, not in
// the SVGs). Replaces scripts/make-emblem-icons.mjs (the website's emblem, #364). Run from app/, on Windows with Edge:
//   node scripts/make-app-icons.mjs
// One command for a new drawing: it runs the Python first (python -I -X utf8, when Python is on the PATH; else it uses
// the SVGs as they are), then renders each PNG with headless Microsoft Edge, then runs make-facetest-icons.mjs for the
// TEST app's badged copies. The splash's lettering is drawn with the app's own heading font (Cormorant Garamond
// SemiBold, assets/fonts/, embedded in the page as data), so the output never depends on the fonts of the PC.
// The adaptive layers and the splash keep the drawing inside Android's safe circle (66/108 of the layer; Android 12+
// crops the splash icon to a circle too): the script measures it and stops if a drawing leaves it.
// Writes assets/images/*.png and public/*.png, and prints the splash background colour (app.json splash and adaptive
// icon backgroundColor, theme/colors.ts `brand`; change them together, then a new APK).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const SOURCE = 'assets/images/source';
const ICON_SVG = join(SOURCE, 'app_icon_pillow.svg');
const SPLASH_SVG = join(SOURCE, 'app_icon_pillow_text.svg');
const FONT = 'assets/fonts/CormorantGaramond-SemiBold.ttf';
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
/** Android keeps a circle of 66/108 of an adaptive layer: drawing must stay within this radius (fraction of size). */
const SAFE = 33 / 108;
/** The masters keep the drum and cushion within r ≈ 330 of 1024; this brings them inside SAFE with a little room. */
const LAYER_SCALE = 0.85;

// ---------------------------------------------------------------- 1. the masters from the drawing
const python = spawnSync('python', ['-I', '-X', 'utf8', join(SOURCE, 'make_app_icon_pillow.py'), ICON_SVG], { encoding: 'utf8' });
if (python.status === 0) {
  const text = spawnSync('python', ['-I', '-X', 'utf8', join(SOURCE, 'make_app_icon_pillow.py'), SPLASH_SVG, 'text'], { encoding: 'utf8' });
  if (text.status !== 0) throw new Error(`make_app_icon_pillow.py text: ${text.stderr}`);
  console.log('masters drawn by make_app_icon_pillow.py');
} else {
  console.log('no Python here: the masters are used as they are');
}

// ---------------------------------------------------------------- 2. the layers as SVG
const BG_RECT = '<rect width="1024" height="1024" fill="url(#bg)"/>';
const master = readFileSync(ICON_SVG, 'utf8');
const lettered = readFileSync(SPLASH_SVG, 'utf8');
for (const [name, svg] of [['icon', master], ['splash', lettered]]) {
  if (svg.split(BG_RECT).length !== 2) throw new Error(`${name} master: expected one background rect`);
}
const [head, drawing] = master.split(BG_RECT);
const [letteredHead, letteredDrawing] = lettered.split(BG_RECT);
/** The drawing without its background, shrunk about the centre by `scale`. */
const alone = (svgHead, body, scale) =>
  `${svgHead}<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">${body.replace(/<\/svg>\s*$/, '')}</g></svg>`;
const LAYERS = {
  full: master,
  background: `${head}${BG_RECT}</svg>`,
  foreground: alone(head, drawing, LAYER_SCALE),
  splash: alone(letteredHead, letteredDrawing, LAYER_SCALE)
    // The heading font, embedded below as data; Georgia was the drawing tool's stand-in.
    .replace(/font-family="[^"]*"/, 'font-family="MsHeading"')
    .replace(/font-weight="bold"/, 'font-weight="normal"'),
};

// ---------------------------------------------------------------- 3. render with headless Edge
if (!EDGE) throw new Error('Microsoft Edge not found: the PNGs are rendered with it (headless).');
const work = mkdtempSync(join(tmpdir(), 'ms-icons-'));
const fontData = readFileSync(FONT).toString('base64');

/** Renders `svg` to a size × size PNG with a transparent page; returns the PNG bytes. */
function render(svg, size) {
  const page = join(work, `page-${size}.html`);
  const out = join(work, `out-${size}.png`);
  writeFileSync(
    page,
    '<!doctype html><html><head><meta charset="utf-8"><style>' +
      `@font-face{font-family:MsHeading;src:url(data:font/ttf;base64,${fontData}) format("truetype")}` +
      'html,body{margin:0;padding:0;background:transparent;overflow:hidden}svg{display:block;width:100vw;height:100vh}' +
      `</style></head><body>${svg.replace(/^<svg /, '<svg preserveAspectRatio="xMidYMid meet" ')}</body></html>`,
  );
  rmSync(out, { force: true });
  const run = spawnSync(
    EDGE,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--default-background-color=00000000',
      '--virtual-time-budget=3000',
      `--user-data-dir=${join(work, 'profile')}`,
      `--window-size=${size},${size}`,
      `--screenshot=${out}`,
      pathToFileURL(page).href,
    ],
    { encoding: 'utf8', timeout: 60_000 },
  );
  if (!existsSync(out)) throw new Error(`Edge wrote no screenshot (${run.status}): ${run.stderr}`);
  return readFileSync(out);
}

// ---------------------------------------------------------------- 4. PNG in and out (8-bit RGBA, what make-facetest-icons reads)
/** Decodes an 8-bit RGB or RGBA, non-interlaced PNG into RGBA bytes. */
function decode(buf) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      channels = { 2: 3, 6: 4 }[body[9]];
      if (body[8] !== 8 || !channels || body[12] !== 0) throw new Error('Edge wrote a PNG this script cannot read');
    } else if (type === 'IDAT') idat.push(body);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x];
      const a = x >= channels ? rows[y * stride + x - channels] : 0;
      const b = y > 0 ? rows[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? rows[(y - 1) * stride + x - channels] : 0;
      const paeth = () => {
        const p = a + b - c;
        const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
        return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      };
      const add = [0, a, b, (a + b) >> 1, paeth()][filter];
      rows[y * stride + x] = (value + add) & 255;
    }
  }
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    for (let k = 0; k < 3; k++) data[i * 4 + k] = rows[i * channels + k];
    data[i * 4 + 3] = channels === 4 ? rows[i * channels + 3] : 255;
  }
  return { width, height, data };
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  let crc = -1;
  for (const byte of Buffer.concat([head.subarray(4), body])) crc = CRC[(crc ^ byte) & 255] ^ (crc >>> 8);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE((crc ^ -1) >>> 0, 0);
  return Buffer.concat([head, body, tail]);
}
/** Encodes RGBA bytes as an 8-bit RGBA, non-interlaced PNG. */
function encode({ width, height, data }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) data.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** How far the visible drawing reaches from the centre, as a fraction of the size. */
function reach({ width, height, data }) {
  let far = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 5) far = Math.max(far, Math.hypot(x + 0.5 - width / 2, y + 0.5 - height / 2) / width);
    }
  }
  return far;
}

/** The size Edge renders at; smaller files are averaged down from it (headless Edge will not open a tiny window). */
const RENDER = 1024;

/** `image` averaged down to size × size (each target pixel the mean of the source pixels inside it, by alpha). */
function shrink(image, size) {
  const data = Buffer.alloc(size * size * 4);
  const step = image.width / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0, 0];
      let n = 0;
      for (let sy = Math.floor(y * step); sy < Math.floor((y + 1) * step); sy++) {
        for (let sx = Math.floor(x * step); sx < Math.floor((x + 1) * step); sx++) {
          const i = (sy * image.width + sx) * 4;
          const alpha = image.data[i + 3];
          for (let k = 0; k < 3; k++) sum[k] += image.data[i + k] * alpha;
          sum[3] += alpha;
          n++;
        }
      }
      const o = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) data[o + k] = sum[3] ? Math.round(sum[k] / sum[3]) : 0;
      data[o + 3] = Math.round(sum[3] / n);
    }
  }
  return { width: size, height: size, data };
}

/** Renders one layer at `size`, optionally changed by `paint`, writes it and checks the safe zone for `safe` layers. */
function write(file, layer, size, { safe = false, paint } = {}) {
  const rendered = decode(render(LAYERS[layer], RENDER));
  if (rendered.width !== RENDER || rendered.height !== RENDER) throw new Error(`${file}: Edge gave ${rendered.width} x ${rendered.height}`);
  const image = size === RENDER ? rendered : shrink(rendered, size);
  paint?.(image);
  writeFileSync(file, encode(image));
  const far = reach(image);
  console.log(`wrote ${file} ${size} px${safe ? `, reaches ${(far * 100).toFixed(1)} % from the centre (safe ${(SAFE * 100).toFixed(1)} %)` : ''}`);
  if (safe && far > SAFE) throw new Error(`${file} leaves the safe zone`);
  return image;
}

/**
 * The monochrome layer: one colour (white) that Android tints, shaped by alpha. The whole outline alone is a blob, so
 * the dark navy (the cushion's body, the bands, the outlines and the heads' black syahi) is cut out and the red, gold
 * and cream stay: the drum, its stripes and heads, and the cushion's gold piping and lotus read as a drum on a cushion.
 */
const silhouette = ({ data }) => {
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const light = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const navy = b >= r && light < 0.3;
    data.fill(255, i, i + 3);
    if (navy) data[i + 3] = 0;
  }
};

// ---------------------------------------------------------------- 5. the files
try {
  write('assets/images/icon.png', 'full', 1024);
  const background = write('assets/images/android-icon-background.png', 'background', 1024);
  write('assets/images/android-icon-foreground.png', 'foreground', 1024, { safe: true });
  write('assets/images/android-icon-monochrome.png', 'foreground', 1024, { safe: true, paint: silhouette });
  write('assets/images/splash-icon.png', 'splash', 1024, { safe: true });
  write('assets/images/favicon.png', 'full', 48);
  write('public/apple-touch-icon.png', 'full', 180);
  write('public/icon-192.png', 'full', 192);
  write('public/icon-512.png', 'full', 512);

  // The splash and adaptive background colour: the royal blue's average, so the flat colour matches the radial.
  const sum = [0, 0, 0];
  for (let i = 0; i < background.data.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += background.data[i + k];
  const hex = sum.map((s) => Math.round(s / (background.data.length / 4)).toString(16).padStart(2, '0')).join('').toUpperCase();
  console.log(`background colour #${hex}: app.json splash + adaptiveIcon backgroundColor, theme/colors.ts brand`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

// ---------------------------------------------------------------- 6. the TEST app's badged copies
const facetest = spawnSync(process.execPath, [resolve('scripts/make-facetest-icons.mjs')], { encoding: 'utf8', stdio: 'inherit' });
if (facetest.status !== 0) throw new Error('make-facetest-icons.mjs failed');
mkdirSync('assets/images/facetest', { recursive: true });
