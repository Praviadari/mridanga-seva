// The service worker's file list and source, for scripts/export-web.mjs step 9 (docs/DECISIONS.md #513). Kept apart
// so tests/offline-shell.test.mjs checks the same code the export runs.

import { statSync } from 'node:fs';
import { relative, sep } from 'node:path';

import { listFiles } from '../bundle-checks.mjs';

/**
 * Files of the export never kept by the worker: the build id, the headers file, the worker itself, source maps,
 * Expo's metadata and the QR reader's WebAssembly (staff and scanning need the network anyway).
 */
export function neverKept(path) {
  return ['/sw.js', '/version.txt', '/_headers', '/metadata.json'].includes(path) || path.startsWith('/zxing/') || path.endsWith('.map');
}

/**
 * A Telugu or Hindi script, loaded only by the app in that language (src/i18n/locale-loaders.web.ts, #331): kept when
 * the page loads it, not at install, so nobody downloads the other two languages.
 */
export function languageChunk(path) {
  return /^\/_expo\/static\/js\/web\/(te|hi)-[0-9a-f]+\.js$/.test(path) || languageFont(path);
}

/**
 * The Telugu and Hindi heading fonts (src/theme/fonts.tsx loads only the current language's, #367): like the language
 * scripts, kept when the page loads them (#591), so an English phone does not download 340 KB of them for offline use.
 */
export function languageFont(path) {
  return /^\/assets\/assets\/fonts\/NotoSerif(Telugu|Devanagari)-SemiBold\.[0-9a-f]+\.ttf$/.test(path);
}

/**
 * The staff screens of the web version (src/web-routes/staff-area.ts, #590): kept when a staff login loads them, not at
 * install, so a student's phone never downloads them.
 */
export function staffChunk(path) {
  return /^\/_expo\/static\/js\/web\/staff-area-[0-9a-f]+\.js$/.test(path);
}

/** The site's own files the worker keeps at install, as addresses ('/' for index.html), and their size in bytes. */
export function shellFiles(dist) {
  const shell = [];
  let bytes = 0;
  for (const file of listFiles(dist)) {
    const path = '/' + relative(dist, file).split(sep).join('/');
    if (neverKept(path) || languageChunk(path) || staffChunk(path)) continue;
    shell.push(path === '/index.html' ? '/' : path);
    bytes += statSync(file).size;
  }
  shell.sort();
  return { shell, bytes };
}

/** scripts/service-worker.js with this build's id and file list filled in. */
export function serviceWorkerSource(template, build, shell) {
  if (!template.includes("'__BUILD__'") || !template.includes('__SHELL__')) {
    throw new Error('scripts/service-worker.js lost its __BUILD__ or __SHELL__ placeholder');
  }
  // The build id becomes part of the cache name: letters, digits and a few signs only.
  const id = build.replace(/[^A-Za-z0-9._-]+/g, '-');
  return template.replace("'__BUILD__'", JSON.stringify(id)).replace('__SHELL__', JSON.stringify(shell));
}
