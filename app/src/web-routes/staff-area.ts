// The staff area of the web version (docs/DECISIONS.md #590): every staff screen of src/app/staff except its two
// layouts, and through them everything only staff use (register, fund, inventory, reports, ...). Loaded only with
// import() from lazy-area.tsx, so the web export makes it one file of its own (staff-area-<hash>.js) that a student's
// phone never downloads; the service worker keeps it on a staff phone once it has been loaded (#513, #591).

import type { ComponentType } from 'react';

const screens = require.context('../app', true, /^\.\/staff\/(?!_layout\.tsx$|\(tabs\)\/_layout\.tsx$).*\.tsx$/);

/** The screen of a staff route, by its key in route-context.ts ('./staff/register.tsx'). */
export function screen(key: string): ComponentType<object> {
  return (screens(key) as { default: ComponentType<object> }).default;
}
