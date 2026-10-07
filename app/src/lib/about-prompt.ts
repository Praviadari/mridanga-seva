// Opens About you by itself once, right after the first sign-in (docs/DECISIONS.md #164): on the
// waiting screen and on the student home, when the person has never finished or skipped it. Once per
// login per app start, so Back from About you does not bring it up again; "Skip for now" is stored
// in the database, so it does not come back on the next start or another device either.

import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';

import { fetchMyAbout } from '@/data/about';

/** Logins that were already offered About you since the app started. */
const offered = new Set<string>();

/**
 * Pushes `path` once when the signed-in person (`profileId`) has About you still open. Returns
 * whether About you is unfinished (to show a card that opens it), or null while not known. Asks
 * again each time the screen comes back into view, so the card goes once About you is done.
 */
export function useAboutPrompt(profileId: string | null | undefined, path: Href, enabled = true): boolean | null {
  const [open, setOpen] = useState<boolean | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!profileId || !enabled) return;
      let cancelled = false;
      void fetchMyAbout().then((about) => {
        if (cancelled || !about || about === 'missing') return;
        setOpen(about.aboutState !== 'done');
        if (about.aboutState === null && !offered.has(profileId)) {
          offered.add(profileId);
          router.push(path);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [profileId, path, enabled]),
  );
  return open;
}
