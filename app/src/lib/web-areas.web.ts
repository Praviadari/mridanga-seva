// The web version loads the staff screens and the student screens beyond the student's tabs as one file per area
// (src/web-routes/lazy-area.tsx, docs/DECISIONS.md #590, #650); the root layout starts the download a login needs as
// soon as it is known. A staff login's file starts at once, as before (its home is in it). A student's or waiting
// login's file starts a moment later, so the home's own requests go first on a slow line; by the time Practice or a
// lesson is tapped it is in (and from the first sign-in the service worker keeps it for offline use).

import { loadArea, preloadArea } from '@/web-routes/lazy-area';

/** How long after the first screen a student's or waiting login's file starts loading. */
const STUDENT_DELAY_MS = 1500;

let studentTimer: ReturnType<typeof setTimeout> | null = null;

/** Starts loading the screens a login of this area uses (the auth area: 'guru', 'student', 'pending', ...). */
export function preloadAreasFor(area: string): void {
  if (area === 'guru' || area === 'coordinator') preloadArea('staff');
  else if ((area === 'student' || area === 'pending') && !studentTimer) {
    studentTimer = setTimeout(() => preloadArea('student'), STUDENT_DELAY_MS);
  }
}

/**
 * Resolves once the student screens' file is in. Code a first-download screen loads with import() may use modules the
 * export put in that file, so it waits for it: a direct load of /student/my-practice asked for the Daily Sādhana
 * Quest before the file came and stopped with "Requiring unknown module" (28-10-2026).
 */
export function studentAreaReady(): Promise<void> {
  return loadArea('student').then(() => undefined);
}
