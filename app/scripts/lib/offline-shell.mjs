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

/** The site's own files the worker keeps, as addresses ('/' for index.html), and their size in bytes. */
export function shellFiles(dist) {
  const shell = [];
  let bytes = 0;
  for (const file of listFiles(dist)) {
    const path = '/' + relative(dist, file).split(sep).join('/');
    if (neverKept(path)) continue;
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
