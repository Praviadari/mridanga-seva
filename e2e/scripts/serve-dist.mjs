// Serves app/dist (the TEST web export) on http://127.0.0.1:<port> the way Cloudflare Pages does
// for this single-page app: a file when it exists, otherwise index.html (DECISIONS #15), with the
// headers of dist/_headers (Content-Security-Policy and the rest), so a page the CSP would block on
// the site fails here too. Node built-ins only. Usage: node scripts/serve-dist.mjs [port]

import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

import { DIST_DIR } from './lib/env.mjs';

const port = Number(process.argv[2] ?? process.env.E2E_PORT ?? 8190);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.map': 'application/json',
};

/** The headers dist/_headers gives every path ("/*" blocks only; that is all the site uses). */
function siteHeaders() {
  const file = join(DIST_DIR, '_headers');
  if (!existsSync(file)) return {};
  const out = {};
  let inAll = false;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      inAll = line.trim() === '/*';
      continue;
    }
    if (!inAll) continue;
    const colon = line.indexOf(':');
    if (colon > 0) out[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  // HSTS means nothing on http://127.0.0.1; leave it out so the browser keeps no record of it.
  delete out['Strict-Transport-Security'];
  // This server is plain http: WebKit obeys upgrade-insecure-requests on 127.0.0.1 too (Chrome exempts
  // it) and would ask https://127.0.0.1 for every script. Everything else in the policy stays.
  const csp = 'Content-Security-Policy';
  if (out[csp]) out[csp] = out[csp].replace(/;?\s*upgrade-insecure-requests\s*(?=;|$)/, '').replace(/^;\s*/, '');
  return out;
}

if (!existsSync(join(DIST_DIR, 'index.html'))) {
  console.error('serve-dist: app/dist/index.html is missing; run npm run e2e:build first.');
  process.exit(1);
}
const headers = siteHeaders();

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  let file = normalize(join(DIST_DIR, path));
  if (!file.startsWith(DIST_DIR + sep) && file !== DIST_DIR) {
    res.writeHead(400).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    const html = file + '.html';
    file = existsSync(html) ? html : join(DIST_DIR, 'index.html');
  }
  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
  const noStore = file.endsWith('index.html') || file.endsWith('sw.js') || file.endsWith('.html');
  res.writeHead(200, { ...headers, 'Content-Type': type, 'Cache-Control': noStore ? 'no-cache' : 'public, max-age=3600' });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`serve-dist: app/dist on http://127.0.0.1:${port}`));
