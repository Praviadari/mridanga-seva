// Writes src/web-routes/staff-screens.ts, the list of staff screens the web version loads later (docs/DECISIONS.md
// #590). Run from app/ after adding, moving or removing a file under src/app/staff:  npm run staff-screens
// With --check it only says whether the list is current (exit code 1 when not), as export-web does.

import { writeFileSync } from 'node:fs';

import { LIST_FILE, listIsCurrent, listSource, staffScreenFiles } from './lib/staff-screens.mjs';

if (process.argv.includes('--check')) {
  if (!listIsCurrent()) {
    console.error(`staff-screens: ${LIST_FILE} does not match src/app/staff. Run: npm run staff-screens`);
    process.exit(1);
  }
  console.log('staff-screens: the list is current.');
} else {
  const paths = staffScreenFiles();
  writeFileSync(LIST_FILE, listSource(paths));
  console.log(`staff-screens: ${paths.length} staff screens written to ${LIST_FILE}.`);
}
