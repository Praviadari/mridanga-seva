// The screens Expo Router knows on the web (docs/DECISIONS.md #590, #650): every file of src/app, as Expo Router's own
// list (expo-router/_ctx.web.js) has them, except that the screens of the later areas are stand-ins: the staff screens,
// and the student and waiting screens beyond the student's tabs (area-screens.ts). A stand-in is in the first
// download with nothing of its screen: when opened it loads its area (one file for all of them) and shows the real
// screen. The layouts and the student's four tabs stay in the first download, so the tabs, the header, the Back anchor
// (unstable_settings) and the student home work as before. On phones none of this is used (src/entry.ts).

import type { ComponentType } from 'react';

import { STAFF_SCREENS, STUDENT_SCREENS } from './area-screens';
import { lazyScreen, type AreaName } from './lazy-area';

/** Every route file except the later areas' screens (layouts and student tabs stay); keys as './student/(tabs)/my-qr.tsx'. */
const firstDownload = require.context(
  '../app',
  true,
  /^\.\/(?!staff\/(?!_layout\.tsx$|\(tabs\)\/_layout\.tsx$)|student\/(?!_layout\.tsx$|\(tabs\)\/)|waiting\/(?!_layout\.tsx$)).*\.tsx$/,
);

/** The later screens' keys as Expo Router names them ('./staff/register.tsx'), and their area. */
const later = new Map<string, AreaName>([
  ...STAFF_SCREENS.map((path) => [`./${path}`, 'staff'] as const),
  ...STUDENT_SCREENS.map((path) => [`./${path}`, 'student'] as const),
]);

/** One stand-in module per later screen, made once. */
const standIns = new Map<string, { default: ComponentType<object> }>();

function load(key: string): unknown {
  const area = later.get(key);
  if (!area) return firstDownload(key);
  let module = standIns.get(key);
  if (!module) {
    module = { default: lazyScreen(area, key) };
    standIns.set(key, module);
  }
  return module;
}

/** A require.context as Expo Router expects it: call it with a key, list the keys. */
export const routeContext = Object.assign(load, {
  keys: () => [...firstDownload.keys(), ...later.keys()],
  resolve: (key: string) => key,
  id: firstDownload.id,
});
