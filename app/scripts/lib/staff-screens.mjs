// The list of staff screens the web version loads later (src/web-routes/staff-screens.ts, docs/DECISIONS.md #590): every
// .tsx file under src/app/staff except its two layouts. Expo Router must know every route when the app starts, so the
// list is in the first download while the screens are not. scripts/staff-screens.mjs writes it; export-web and
// tests/web-routes.test.mjs refuse a list that no longer matches the folder (a new staff screen would be missing on the
// web).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const STAFF_DIR = join('src', 'app', 'staff');
export const LIST_FILE = join('src', 'web-routes', 'staff-screens.ts');
const LAYOUTS = new Set(['_layout.tsx', '(tabs)/_layout.tsx']);

/** The staff screens under `appDir` (app/), as paths under src/app/staff ('register.tsx'), sorted. */
export function staffScreenFiles(appDir = '.') {
  const root = join(appDir, STAFF_DIR);
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.tsx')) found.push(relative(root, path).split(sep).join('/'));
    }
  };
  walk(root);
  return found.filter((path) => !LAYOUTS.has(path)).sort();
}

/** The text of src/web-routes/staff-screens.ts for these paths. */
export function listSource(paths) {
  return [
    '// Written by scripts/staff-screens.mjs (npm run staff-screens): every staff screen under src/app/staff except the two',
    '// layouts. The web version knows these routes from the start and loads their screens later (docs/DECISIONS.md #590).',
    '// export-web and the tests refuse a list that no longer matches the folder.',
    '',
    'export const STAFF_SCREENS: readonly string[] = [',
    ...paths.map((path) => `  '${path}',`),
    '];',
    '',
  ].join('\n');
}

/** True when the list file in `appDir` matches the folder. */
export function listIsCurrent(appDir = '.') {
  let text;
  try {
    text = readFileSync(join(appDir, LIST_FILE), 'utf8');
  } catch {
    return false;
  }
  return text.replace(/\r\n/g, '\n') === listSource(staffScreenFiles(appDir));
}
