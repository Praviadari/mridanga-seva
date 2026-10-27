// Writes src/web-routes/area-screens.ts, the lists of screens the web version loads later (docs/DECISIONS.md #590,
// #650). Run from app/ after adding, moving or removing a screen under src/app/staff, src/app/student or
// src/app/waiting:  npm run area-screens
// With --check it only says whether the lists are current (exit code 1 when not), as export-web does.

import { writeFileSync } from 'node:fs';

import { areaScreenFiles, LIST_FILE, listIsCurrent, listSource } from './lib/area-screens.mjs';

if (process.argv.includes('--check')) {
  if (!listIsCurrent()) {
    console.error(`area-screens: ${LIST_FILE} does not match src/app. Run: npm run area-screens`);
    process.exit(1);
  }
  console.log('area-screens: the lists are current.');
} else {
  const areas = areaScreenFiles();
  writeFileSync(LIST_FILE, listSource(areas));
  const counts = Object.entries(areas).map(([name, paths]) => `${paths.length} ${name}`).join(', ');
  console.log(`area-screens: ${counts} screens written to ${LIST_FILE}.`);
}
