// The lists of screens the web version loads later (src/web-routes/area-screens.ts, docs/DECISIONS.md #590, #650), one
// list per area, each loaded as one file of its own when one of its screens first opens:
// - staff: every .tsx file under src/app/staff except its two layouts;
// - student: every screen under src/app/student and src/app/waiting (practice tools, lessons, assessments, events, ...)
//   except their layouts and the student's four tabs (Home, My QR, Announcements, Ishtagoshti), which stay in the first
//   download so the student home never waits.
// Expo Router must know every route when the app starts, so the lists are in the first download while the screens are
// not. scripts/area-screens.mjs writes them; export-web and tests/web-routes.test.mjs refuse lists that no longer match
// the folders (a new screen would be missing on the web).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const APP_DIR = join('src', 'app');
export const LIST_FILE = join('src', 'web-routes', 'area-screens.ts');
const LAYOUTS = new Set(['staff/_layout.tsx', 'staff/(tabs)/_layout.tsx', 'student/_layout.tsx', 'student/(tabs)/_layout.tsx', 'waiting/_layout.tsx']);

/** Every .tsx file under `appDir` (app/)'s src/app, as paths under it ('staff/register.tsx'), sorted. */
function routeFiles(appDir) {
  const root = join(appDir, APP_DIR);
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.tsx')) found.push(relative(root, path).split(sep).join('/'));
    }
  };
  walk(root);
  return found.sort();
}

/** The area a route file belongs to ('staff' or 'student'), or null for the first download. */
export function areaOf(path) {
  if (LAYOUTS.has(path)) return null;
  if (path.startsWith('staff/')) return 'staff';
  if (path.startsWith('waiting/') || (path.startsWith('student/') && !path.startsWith('student/(tabs)/'))) return 'student';
  return null;
}

/** Each area's screens under `appDir` (app/), as paths under src/app, sorted. */
export function areaScreenFiles(appDir = '.') {
  const areas = { staff: [], student: [] };
  for (const path of routeFiles(appDir)) {
    const area = areaOf(path);
    if (area) areas[area].push(path);
  }
  return areas;
}

/** The text of src/web-routes/area-screens.ts for these lists. */
export function listSource(areas) {
  const list = (name, paths) => [`export const ${name}: readonly string[] = [`, ...paths.map((path) => `  '${path}',`), '];'];
  return [
    '// Written by scripts/area-screens.mjs (npm run area-screens): the screens the web version knows from the start and',
    '// loads later, one file per area (docs/DECISIONS.md #590, #650), as paths under src/app. export-web and the tests',
    '// refuse lists that no longer match the folders.',
    '',
    '/** Every staff screen under src/app/staff except the two layouts. */',
    ...list('STAFF_SCREENS', areas.staff),
    '',
    '/** Every student and waiting screen except the layouts and the student\'s four tabs. */',
    ...list('STUDENT_SCREENS', areas.student),
    '',
  ].join('\n');
}

/** True when the list file in `appDir` matches the folders. */
export function listIsCurrent(appDir = '.') {
  let text;
  try {
    text = readFileSync(join(appDir, LIST_FILE), 'utf8');
  } catch {
    return false;
  }
  return text.replace(/\r\n/g, '\n') === listSource(areaScreenFiles(appDir));
}
