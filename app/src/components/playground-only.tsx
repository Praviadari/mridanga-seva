// The Rhythm Playground's switch on screens (docs/DECISIONS.md #781; lib/playground-switch.ts): usePlaygroundOn for the
// ways in (Practice card, Daily Quest, staff Teaching row, a student's Playground panel), and PlaygroundOnly around
// every Playground route, so an address typed or kept from before sends back instead of opening a game: a student to
// the Practice tab, staff to the Teaching module.

import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';

import { useAuth } from '@/auth/auth-provider';
import { playgroundOnFor, usePlaygroundSwitch } from '@/lib/playground-switch';

/** Does the signed-in login see the Playground now? */
export function usePlaygroundOn(): boolean {
  const { profile } = useAuth();
  const s = usePlaygroundSwitch(profile?.id ?? '');
  return profile ? playgroundOnFor(s, profile.role) : false;
}

/** A Playground screen while it is on for this login; otherwise back to Practice (students) or Teaching (staff). */
export function PlaygroundOnly({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const on = usePlaygroundOn();
  if (on) return children;
  return <Redirect href={profile?.role === 'student' ? '/student/my-practice' : '/staff/modules/teaching'} />;
}
