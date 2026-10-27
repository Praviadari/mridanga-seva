// The student area of the web version (docs/DECISIONS.md #650): every student and waiting screen except their layouts
// and the student's four tabs (Home, My QR, Announcements, Ishtagoshti: in the first download, so the student home
// never waits). The practice tools, Echo me, the tap pad, lessons, assessments, events, polls, My profile and the rest.
// Loaded only with import() from lazy-area.tsx, so the web export makes it one file of its own
// (student-area-<hash>.js); a student's or waiting login's phone loads it soon after the first screen, and the service
// worker keeps it for offline use from the first sign-in.

import type { ComponentType } from 'react';

const screens = require.context('../app', true, /^\.\/(?:student\/(?!_layout\.tsx$|\(tabs\)\/)|waiting\/(?!_layout\.tsx$)).*\.tsx$/);

/** The screen of a student route, by its key in route-context.ts ('./student/practice.tsx'). */
export function screen(key: string): ComponentType<object> {
  return (screens(key) as { default: ComponentType<object> }).default;
}
