// Local preview of website/dist, close to Cloudflare Pages: folder addresses serve index.html,
// unknown addresses get the nearest 404.html with status 404, and the headers in dist/_headers
// are sent, so a CSP mistake shows up locally too.
//
//   node src/serve.mjs [--port 4321] [--no-headers] [--axe <path to axe.min.js>]
//
// --no-headers and --axe are for the accessibility check: axe is injected into the page by hand,
// which the CSP would refuse. /__axe.js then serves the given file.

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { outDir } from './site.mjs';

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const port = Number(arg('--port') ?? 4321);
const sendHeaders = !args.includes('--no-headers');
const axePath = arg('--axe');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

/** Parses Cloudflare's _headers: a path pattern line, then indented "Name: value" lines. */
function parseHeaders() {
  const file = join(outDir, '_headers');
  if (!existsSync(file)) return [];
  const rules = [];
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const re = new RegExp(`^${line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
      rules.push({ re, headers: [] });
    } else {
      const i = line.indexOf(':');
      rules.at(-1).headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
    }
  }
  return rules;
}

function resolve(urlPath) {
  const safe = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  if (safe.startsWith('..')) return null;
  let file = join(outDir, safe);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  return existsSync(file) ? file : null;
}

function nearest404(urlPath) {
  const parts = urlPath.split('/').filter(Boolean);
  while (parts.length >= 0) {
    const file = join(outDir, ...parts, '404.html');
    if (existsSync(file)) return file;
    if (!parts.length) return null;
    parts.pop();
  }
  return null;
}

createServer((req, res) => {
  const urlPath = new URL(req.url, 'http://x').pathname;
  if (axePath && urlPath === '/__axe.js') {
    res.writeHead(200, { 'Content-Type': types['.js'] });
    return res.end(readFileSync(axePath));
  }
  // Like Pages: /classes → /classes/
  const asDir = resolve(urlPath);
  if (asDir && !urlPath.endsWith('/') && asDir.endsWith('index.html') && !urlPath.endsWith('.html')) {
    res.writeHead(308, { Location: `${urlPath}/` });
    return res.end();
  }
  let file = asDir;
  let status = 200;
  if (!file || urlPath.endsWith('/_headers')) {
    file = nearest404(urlPath);
    status = 404;
  }
  const headers = { 'Content-Type': types[extname(file ?? '')] ?? 'application/octet-stream' };
  if (sendHeaders) {
    for (const rule of parseHeaders()) {
      if (rule.re.test(urlPath)) for (const [k, v] of rule.headers) headers[k] = v;
    }
    // Not on plain http://localhost: HSTS is ignored there, and the upgrade would ask for https.
    delete headers['Strict-Transport-Security'];
    const csp = headers['Content-Security-Policy'];
    if (csp) headers['Content-Security-Policy'] = csp.replace(/;\s*upgrade-insecure-requests/, '');
  }
  res.writeHead(status, headers);
  res.end(file ? readFileSync(file) : 'Not found');
}).listen(port, () => {
  console.log(`Serving dist/ at http://localhost:${port}/ (${sendHeaders ? 'with' : 'without'} _headers)`);
});
