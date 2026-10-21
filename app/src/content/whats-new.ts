// The release notes bundled with this version (whats-new.json; how to add an entry: docs/OPERATIONS.md "Publishing an
// update"). A separate file so the helpers in src/lib/whats-new.ts can be tested without the JSON import.

import type { Release } from '@/lib/whats-new';

import notes from './whats-new.json';

/** Every release, newest first. */
export const RELEASES = notes.releases as Release[];
