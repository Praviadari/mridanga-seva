// Folds Expo's __common file into the area files (docs/DECISIONS.md #650), for scripts/export-web.mjs. Kept apart so
// tests/web-routes.test.mjs checks the same code the export runs.
//
// Why: when two later areas (staff-area.ts, student-area.ts) share code the entry does not hold, Expo's web export moves
// that code to __common-<hash>.js and has index.html load it at start, so every visit downloaded the student screens'
// code again (measured 27-10-2026: 368 KB of a 3,025 KB first download). The fold puts a copy of __common at the head
// of each area file instead and drops it from index.html: a student downloads it with the student file, a staff login
// with the staff file, and a signed-out visit not at all. Loading both areas is harmless: Metro's define() keeps the
// first copy of a module and ignores the second.
//
// __common only defines modules (Expo makes it a vendor file that runs nothing), and none of them is needed by the
// entry (Expo removes the entry's own modules from it first). Every changed file gets a new content hash in its name,
// and the names are replaced where they are written: the entry's table of async files and index.html. Anything not as
// expected stops the export.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const WEB = '/_expo/static/js/web/';
const AREA = /^(staff|student)-area-[0-9a-f]+\.js$/;

/** The file name with its content hash replaced by the hash of `text`. */
function rehashed(name, text) {
  return name.replace(/-[0-9a-f]+\.js$/, `-${createHash('md5').update(text).digest('hex')}.js`);
}

/** Replaces `from` with `to` in `text`, exactly `times` times, or throws. */
function replaceExactly(text, from, to, times, where) {
  const found = text.split(from).length - 1;
  if (found !== times) throw new Error(`${where} names ${from} ${found} times, expected ${times}`);
  return text.replaceAll(from, to);
}

/**
 * Folds __common into the area files of `dist` and returns what it did ({ common, kb, renamed }), or null when the
 * export made no __common. Throws when the export is not as described above.
 */
export function foldCommon(dist) {
  const dir = join(dist, '_expo', 'static', 'js', 'web');
  const names = readdirSync(dir);
  const commons = names.filter((name) => /^__common-[0-9a-f]+\.js$/.test(name));
  if (commons.length === 0) return null;
  if (commons.length > 1) throw new Error(`more than one __common file: ${commons.join(', ')}`);
  const common = readFileSync(join(dir, commons[0]), 'utf8');
  if (/sourceMappingURL/.test(common)) throw new Error('__common has a source map; fold only an export without them');
  const areas = names.filter((name) => AREA.test(name));
  if (areas.length === 0) throw new Error('__common but no area file');

  const entries = names.filter((name) => /^entry-[0-9a-f]+\.js$/.test(name));
  if (entries.length !== 1) throw new Error(`expected one entry file, found ${entries.length}`);
  // Only the entry and index.html may name these files: the entry the areas (its table of async files), index.html
  // __common and the entry.
  for (const name of names.filter((name) => name.endsWith('.js') && name !== entries[0])) {
    const text = readFileSync(join(dir, name), 'utf8');
    for (const other of [commons[0], ...areas]) if (other !== name && text.includes(other)) throw new Error(`${name} names ${other}`);
  }

  const renamed = {};
  let entryText = readFileSync(join(dir, entries[0]), 'utf8');
  if (entryText.includes(commons[0])) throw new Error('the entry names __common');
  for (const area of areas) {
    const text = `${common}\n${readFileSync(join(dir, area), 'utf8')}`;
    const name = rehashed(area, text);
    writeFileSync(join(dir, name), text);
    rmSync(join(dir, area));
    entryText = replaceExactly(entryText, `${WEB}${area}`, `${WEB}${name}`, 1, 'the entry');
    renamed[area] = name;
  }
  const entry = rehashed(entries[0], entryText);
  writeFileSync(join(dir, entry), entryText);
  rmSync(join(dir, entries[0]));
  renamed[entries[0]] = entry;

  const htmlFile = join(dist, 'index.html');
  let html = readFileSync(htmlFile, 'utf8');
  html = replaceExactly(html, `<script src="${WEB}${commons[0]}" defer></script>`, '', 1, 'index.html');
  html = replaceExactly(html, `${WEB}${entries[0]}`, `${WEB}${entry}`, 1, 'index.html');
  writeFileSync(htmlFile, html);
  rmSync(join(dir, commons[0]));
  return { common: commons[0], kb: Math.round(Buffer.byteLength(common) / 1024), renamed };
}
