// The screens Expo Router knows on the web (docs/DECISIONS.md #590): every file of src/app, as Expo Router's own list
// (expo-router/_ctx.web.js) has them, except that the staff screens are stand-ins. A stand-in is in the first download
// with nothing of its screen: when opened it loads the staff area (staff-area.ts, one file for all of them) and shows
// the real screen. The two staff layouts stay in the first download, so the tabs, the header and the Back anchor
// (unstable_settings) work as before. On phones none of this is used (src/entry.ts).

import type { ComponentType } from 'react';

import { lazyStaffScreen } from './lazy-staff';
import { STAFF_SCREENS } from './staff-screens';

/** Every route file except the staff screens (the staff layouts stay); keys as './student/qr.tsx'. */
const firstDownload = require.context('../app', true, /^\.\/(?!staff\/(?!_layout\.tsx$|\(tabs\)\/_layout\.tsx$)).*\.tsx$/);

/** The staff screens' keys as Expo Router names them: './staff/register.tsx'. */
const staffKeys = new Set(STAFF_SCREENS.map((path) => `./staff/${path}`));

/** One stand-in module per staff screen, made once. */
const standIns = new Map<string, { default: ComponentType<object> }>();

function load(key: string): unknown {
  if (!staffKeys.has(key)) return firstDownload(key);
  let module = standIns.get(key);
  if (!module) {
    module = { default: lazyStaffScreen(key) };
    standIns.set(key, module);
  }
  return module;
}

/** A require.context as Expo Router expects it: call it with a key, list the keys. */
export const routeContext = Object.assign(load, {
  keys: () => [...firstDownload.keys(), ...staffKeys],
  resolve: (key: string) => key,
  id: firstDownload.id,
});
