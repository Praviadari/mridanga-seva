// Start page ("/"). Never shown for long: while the login is being checked it shows the splash,
// then it forwards the person to the first screen of their area (see src/app/_layout.tsx).

import { Redirect, type Href } from 'expo-router';

import { useAuth } from '@/auth/auth-provider';
import type { Area } from '@/auth/types';
import { BrandSplash } from '@/components/brand';

/** First screen of each area. Change here when an area gets a new home screen. */
const HOME: Record<Exclude<Area, 'loading'>, Href> = {
  signedOut: '/sign-in',
  recovery: '/reset-password',
  pending: '/pending',
  guru: '/guru',
  coordinator: '/coordinator',
  student: '/student',
};

/** Splash while loading, then a redirect to the person's home screen. */
export default function Index() {
  const { area } = useAuth();
  if (area === 'loading') return <BrandSplash />;
  return <Redirect href={HOME[area]} />;
}
