// Start page ("/"). Never shown for long: while the login is being checked it shows the splash,
// then it forwards the person to the screen a link asked for, when that screen is theirs, or else
// to the first screen of their area (see src/app/_layout.tsx and src/auth/requested-path.ts).

import { Redirect, type Href } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/auth/auth-provider';
import { forgetRequestedPath, requestedPathFor } from '@/auth/requested-path';
import type { Area } from '@/auth/types';
import { BrandSplash } from '@/components/brand';
import { useTakingLong } from '@/lib/slow-start';

/** First screen of each area. Change here when an area gets a new home screen. */
const HOME: Record<Exclude<Area, 'loading'>, Href> = {
  signedOut: '/sign-in',
  recovery: '/reset-password',
  pending: '/pending',
  // One staff home for both roles: it shows G1 or C1 (app/staff/(tabs)/index.tsx).
  guru: '/staff',
  coordinator: '/staff',
  student: '/student',
  subscriber: '/subscriber/ishtagoshti',
};

/** Areas of a signed-in person; once one is reached, a remembered link has had its chance. */
const SIGNED_IN: readonly Area[] = ['pending', 'guru', 'coordinator', 'student', 'subscriber'];

/** Splash while loading, then a redirect to the requested screen or the person's home screen. */
export default function Index() {
  const { area, profileFailed } = useAuth();
  const requested = requestedPathFor(area);
  // A start that takes long says so on the splash, with Try again (docs/DECISIONS.md #237).
  const slow = useTakingLong(area === 'loading');

  // Forget the link after this redirect, so it is used only once (docs/DECISIONS.md #30). Not
  // while the profile could not be loaded (no internet): the person waits on the pending screen,
  // and "Check again" should still lead to the link.
  useEffect(() => {
    if (SIGNED_IN.includes(area) && !profileFailed) forgetRequestedPath();
  }, [area, profileFailed]);

  if (area === 'loading') return <BrandSplash slow={slow} />;
  // withAnchor puts the role's tabs underneath (the anchor in student/_layout.tsx and
  // staff/_layout.tsx), so Back leads there, not out of the app.
  // Not for the home itself (`/staff`, `/student`): it is the anchor, and the address would only
  // get "?initial=false".
  if (requested) return <Redirect href={requested as Href} withAnchor={requested.split('/').length > 2} />;
  return <Redirect href={HOME[area]} />;
}
