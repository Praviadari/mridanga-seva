// Checks website/dist after a build. Exits 1 on any error.
//
//   node src/check.mjs             links, languages, page structure, headers
//   node src/check.mjs --external  also asks every outside link (https, not mailto) for a reply
//
// What it checks, per page: <html lang> matches the language folder, one <title>, a meta
// description, exactly one <h1>, a canonical link, hreflang alternates for every language plus
// x-default (and that they point back), every internal link and #fragment resolves, images have
// alt, no inline style or script (the CSP forbids them), no http:// resources. Across languages:
// the same content files and the same strings.json keys. It also lists the [TEAM] placeholders.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import config from '../site.config.mjs';
import { contentDir, loadLanguages, outDir, pagePath, pages } from './site.mjs';

const errors = [];
const warn = [];
const fail = (file, msg) => errors.push(`${file}: ${msg}`);
const languages = loadLanguages();

if (!existsSync(outDir)) {
  console.error('dist/ is missing: run npm run build first');
  process.exit(1);
}

const files = readdirSync(outDir, { recursive: true })
  .map((f) => join(outDir, f))
  .filter((f) => statSync(f).isFile());
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const rel = (f) => relative(outDir, f).split(sep).join('/');

/** Site path → file in dist, like Cloudflare Pages. */
function target(path) {
  const clean = decodeURIComponent(path.split('#')[0].split('?')[0]);
  const file = join(outDir, clean);
  if (clean.endsWith('/')) return existsSync(join(file, 'index.html')) ? join(file, 'index.html') : null;
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

const ids = new Map();
const idsOf = (file) => {
  if (!ids.has(file)) ids.set(file, new Set([...readFileSync(file, 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  return ids.get(file);
};

const external = new Set();
const placeholders = new Map();

for (const file of htmlFiles) {
  const name = rel(file);
  const html = readFileSync(file, 'utf8');
  const langCode = languages.find((l) => l.code !== config.defaultLang && name.startsWith(`${l.code}/`))?.code ?? config.defaultLang;
  const lang = languages.find((l) => l.code === langCode);
  const is404 = name.endsWith('404.html');

  const htmlLang = html.match(/<html lang="([^"]+)"/)?.[1];
  if (htmlLang !== lang.meta.bcp47) fail(name, `<html lang="${htmlLang}"> should be "${lang.meta.bcp47}"`);
  if (!/<html [^>]*dir="(ltr|rtl)"/.test(html)) fail(name, 'missing dir on <html>');
  if ((html.match(/<title>[^<]+<\/title>/g) ?? []).length !== 1) fail(name, 'needs exactly one non-empty <title>');
  if (!/<meta name="description" content="[^"]+">/.test(html)) fail(name, 'missing meta description');
  if ((html.match(/<h1[\s>]/g) ?? []).length !== 1) fail(name, 'needs exactly one <h1>');
  if (/\sstyle="/.test(html)) fail(name, 'inline style attribute (blocked by the CSP)');
  for (const m of html.matchAll(/<script([^>]*)>/g)) {
    if (!/type="application\/ld\+json"/.test(m[1])) fail(name, 'a <script> that is not JSON-LD (the site ships no JavaScript)');
  }
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\salt="/.test(m[0])) fail(name, `<img> without alt: ${m[0]}`);
  if (/(src|href)="http:\/\//.test(html)) fail(name, 'http:// link or resource');
  if (/\{\{|\}\}|\[\[|\]\]/.test(html)) fail(name, 'unfilled {{value}} or [[TEAM]] marker');
  if (/<main\b/.test(html) === false || /<header\b/.test(html) === false || /<footer\b/.test(html) === false)
    fail(name, 'missing header, main or footer landmark');

  // hreflang + canonical
  if (!is404) {
    const pageSlug = (langCode === config.defaultLang ? name : name.slice(langCode.length + 1)).replace(/\/?index\.html$/, '');
    const expected = `${config.origin}${pagePath(langCode, pageSlug)}`;
    const canonical = html.match(/<link rel="canonical" href="([^"]+)">/)?.[1];
    if (canonical !== expected) fail(name, `canonical ${canonical} should be ${expected}`);
    for (const l of languages) {
      const href = `${config.origin}${pagePath(l.code, pageSlug)}`;
      if (!html.includes(`<link rel="alternate" hreflang="${l.meta.bcp47}" href="${href}">`))
        fail(name, `missing hreflang ${l.meta.bcp47} → ${href}`);
      if (!target(pagePath(l.code, pageSlug))) fail(name, `hreflang ${l.meta.bcp47} points to a page that does not exist`);
    }
    if (!html.includes(`hreflang="x-default" href="${config.origin}${pagePath(config.defaultLang, pageSlug)}"`))
      fail(name, 'missing hreflang x-default');
  }

  // links
  for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const url = m[1];
    if (/^https?:\/\//.test(url)) {
      if (!url.startsWith(config.origin)) external.add(url);
      continue;
    }
    if (url.startsWith('mailto:')) {
      if (!Object.values(config.emails).includes(url.slice(7))) fail(name, `unknown mailto ${url}`);
      continue;
    }
    if (url.startsWith('#')) {
      if (url.length > 1 && !idsOf(file).has(url.slice(1))) fail(name, `no element with id ${url}`);
      continue;
    }
    if (!url.startsWith('/')) {
      fail(name, `relative link ${url} (use site paths starting with /)`);
      continue;
    }
    const t = target(url);
    if (!t) fail(name, `broken link ${url}`);
    else if (url.includes('#') && t.endsWith('.html') && !idsOf(t).has(url.split('#')[1]))
      fail(name, `broken fragment ${url}`);
  }

  // language switcher: every language linked with lang + hreflang
  for (const l of languages) {
    if (!new RegExp(`<a href="[^"]+" lang="${l.meta.bcp47}" hreflang="${l.meta.bcp47}"`).test(html))
      fail(name, `language switcher lacks ${l.meta.nativeName}`);
  }
}

// content parity across languages
const keys = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
const base = languages[0];
const baseKeys = new Set(keys(base.strings));
const baseFiles = readdirSync(join(contentDir, base.code)).sort();
for (const l of languages.slice(1)) {
  const lk = new Set(keys(l.strings));
  for (const k of baseKeys) if (!lk.has(k)) fail(`content/${l.code}/strings.json`, `missing key ${k}`);
  for (const k of lk) if (!baseKeys.has(k)) fail(`content/${l.code}/strings.json`, `extra key ${k}`);
  const lf = readdirSync(join(contentDir, l.code)).sort();
  for (const f of baseFiles) if (!lf.includes(f)) fail(`content/${l.code}`, `missing ${f}`);
  for (const meta of ['bcp47', 'ogLocale', 'nativeName', 'dir', 'order']) {
    if (l.meta[meta] === undefined) fail(`content/${l.code}/strings.json`, `meta.${meta} missing`);
  }
}
for (const l of languages) {
  for (const f of readdirSync(join(contentDir, l.code)).filter((x) => x.endsWith('.html'))) {
    const n = (readFileSync(join(contentDir, l.code, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '').match(/\[\[TEAM:/g) ?? []).length;
    placeholders.set(`${l.code}/${f}`, n);
  }
}

// site files
for (const f of ['robots.txt', 'sitemap.xml', '_headers', '.well-known/security.txt', 'favicon.svg', '404.html']) {
  if (!existsSync(join(outDir, f))) fail('dist', `missing ${f}`);
}
const sitemap = readFileSync(join(outDir, 'sitemap.xml'), 'utf8');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (locs.length !== pages.length * languages.length) fail('sitemap.xml', `${locs.length} URLs, expected ${pages.length * languages.length}`);
for (const loc of locs) if (!target(loc.slice(config.origin.length))) fail('sitemap.xml', `${loc} has no page`);
const headers = readFileSync(join(outDir, '_headers'), 'utf8');
for (const h of ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy', "frame-ancestors 'none'"]) {
  if (!headers.includes(h)) fail('_headers', `missing ${h}`);
}
const expires = readFileSync(join(outDir, '.well-known/security.txt'), 'utf8').match(/^Expires: (.+)$/m)?.[1];
if (!expires || new Date(expires) < new Date()) fail('security.txt', `Expires ${expires} is missing or past`);
else if (new Date(expires) - new Date() < 30 * 864e5) warn.push(`security.txt expires on ${expires}: renew it`);

// outside links
if (process.argv.includes('--external')) {
  for (const url of external) {
    try {
      const r = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15000) });
      if (r.status >= 400) fail('external', `${url} → ${r.status}`);
      else console.log(`  ok ${r.status} ${url}`);
    } catch (e) {
      fail('external', `${url} → ${e.message}`);
    }
  }
}

console.log(`Checked ${htmlFiles.length} pages in ${languages.map((l) => l.code).join(', ')}; ${external.size} outside links${process.argv.includes('--external') ? ' fetched' : ' (not fetched; use --external)'}.`);
const todo = [...placeholders].filter(([, n]) => n);
if (todo.length) console.log(`Placeholders to confirm: ${todo.map(([f, n]) => `${f} ${n}`).join(', ')}`);
for (const w of warn) console.log(`WARNING ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`ERROR ${e}`);
  process.exit(1);
}
console.log('OK');
