// Keeps track of who is signed in and what they may use, for the whole app.
// Wraps the app in src/app/_layout.tsx; screens read it with useAuth().
//
// Flow: Supabase restores the saved login (or not) → if signed in, the person's `profiles` row
// is fetched → its role decides the Area (src/auth/types.ts) → the root layout shows that
// area's screens. Until both are known the area is 'loading' and the splash shows, except when
// this device remembers the person's profile (src/auth/saved-profile.ts): then their area opens at
// once from that copy while the login is restored and the profile fetched behind it, and the copy
// keeps being used when the fetch fails for lack of internet (docs/DECISIONS.md #37).
// Roles are given by the database, never chosen in the app (docs/ARCHITECTURE.md "Roles").

import type { Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';

import { applyProfileLanguage, currentLanguage, hasChosenLanguage } from '@/i18n';
import { supabase, supabaseConfigProblem } from '@/lib/supabase';

import { forgetSavedProfile, readSavedProfile, saveProfile } from './saved-profile';
import type { Area, Profile } from './types';

/** What useAuth() gives a screen. */
export type AuthState = {
  /** The part of the app this person may use now; 'loading' while that is not known yet. */
  area: Area;
  session: Session | null;
  /** Null when signed out, or when the profile could not be loaded (see profileFailed). */
  profile: Profile | null;
  /** True when signed in but the profile could not be fetched, usually no internet. */
  profileFailed: boolean;
  /** Fetches the profile again, e.g. after the Guru has given a role. Resolves when done. */
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/** The profile fetched for one login; kept with the user id so a stale result is ignored. */
type ProfileResult = { userId: string; profile: Profile | null; failed: boolean };

/** Provides AuthState to everything inside it. Use once, around the whole app. */
export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  // With no settings there is nothing to load, so the setup message can show at once.
  const [sessionLoaded, setSessionLoaded] = useState(supabaseConfigProblem !== null);
  // Set when the person arrives from a password-reset email link (web only).
  const [recovering, setRecovering] = useState(false);
  const [profileResult, setProfileResult] = useState<ProfileResult | null>(null);
  // The profile remembered from the last start, read once. Its language is applied at once, so
  // the first screen is already in the person's language.
  const [saved] = useState<Profile | null>(() => {
    const copy = supabaseConfigProblem ? null : readSavedProfile();
    if (copy && !hasChosenLanguage()) applyProfileLanguage(copy.language);
    return copy;
  });

  useEffect(() => {
    if (supabaseConfigProblem) return;
    // Fires once at start with the saved login (INITIAL_SESSION), then on every change.
    // Supabase warns against awaiting other Supabase calls inside this callback (it can lock
    // up), so the profile is fetched in the effect below instead.
    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'USER_UPDATED' || event === 'SIGNED_OUT') setRecovering(false);
      // A remembered profile must never open someone's area after they signed out.
      if (event === 'SIGNED_OUT') forgetSavedProfile();
      setSession(newSession);
      setSessionLoaded(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchProfile(userId).then((result) => {
      if (!cancelled) setProfileResult(withSavedFallback(result));
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Ignore a profile that belongs to an earlier login. While the fetch for this login runs, the
  // remembered copy stands in for it, but only when it is this same person's.
  const fetched = profileResult && profileResult.userId === userId ? profileResult : null;
  const current: ProfileResult | null =
    fetched ?? (userId && saved?.id === userId ? { userId, profile: saved, failed: false } : null);
  // Before the saved login is restored there is no session yet: the remembered profile decides.
  const profile = sessionLoaded ? (current?.profile ?? null) : saved;
  const profileFailed = sessionLoaded ? (current?.failed ?? false) : false;

  const value: AuthState = {
    area: sessionLoaded ? areaFor(session, recovering, current) : saved ? areaForProfile(saved) : 'loading',
    session,
    profile,
    profileFailed,
    refreshProfile: async () => {
      if (userId) setProfileResult(withSavedFallback(await fetchProfile(userId)));
    },
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}

/** Returns the current AuthState. Must be used inside <AuthProvider>. */
export function useAuth(): AuthState {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/**
 * Decides which part of the app the person may use. `result` is the profile fetch for the
 * current login, or null while it is still running. Kiosk screens arrive in Phase 2.
 */
function areaFor(
  session: Session | null,
  recovering: boolean,
  result: ProfileResult | null,
): Area {
  if (!session) return 'signedOut';
  if (recovering) return 'recovery';
  if (!result) return 'loading';
  // No profile (fetch failed, or not created yet) waits on the pending screen, which explains
  // why and offers to check again.
  if (!result.profile) return 'pending';
  return areaForProfile(result.profile);
}

/** The area of a person with this profile: their role's screens, or pending when switched off. */
function areaForProfile(profile: Profile): Area {
  if (!profile.active) return 'pending';
  switch (profile.role) {
    case 'guru':
    case 'coordinator':
    case 'student':
      return profile.role;
    default:
      return 'pending';
  }
}

/** Reads the signed-in person's own profile row (row-level security allows only their own). */
async function fetchProfile(userId: string): Promise<ProfileResult> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, email, language, active')
    .eq('id', userId)
    .maybeSingle<Profile>();
  if (error) return { userId, profile: null, failed: true };
  if (data) {
    syncLanguageWithProfile(data);
    saveProfile(data);
  } else {
    forgetSavedProfile();
  }
  return { userId, profile: data, failed: false };
}

/**
 * A failed fetch (usually no internet) falls back to the profile remembered for the same person,
 * so they keep their screens; without such a copy it stays a failure (pending screen).
 */
function withSavedFallback(result: ProfileResult): ProfileResult {
  if (!result.failed) return result;
  const copy = readSavedProfile();
  return copy && copy.id === result.userId ? { userId: result.userId, profile: copy, failed: false } : result;
}

/**
 * Keeps the app language and the profile's saved language in step. A language picked on this
 * device (for example on the sign-in screen) wins and is saved to the profile, so future
 * messages use it; otherwise the profile's language is used, so a person gets their language
 * on a new phone without choosing again.
 */
function syncLanguageWithProfile(profile: Profile): void {
  if (!hasChosenLanguage()) {
    applyProfileLanguage(profile.language);
    return;
  }
  saveProfileLanguage(profile, currentLanguage());
}

/**
 * Saves `language` as the signed-in person's language on their profile, when it differs. Used
 * when the profile loads and when the person switches language on a home screen.
 * Not awaited and errors ignored: the screen language is already right; the profile catches up
 * the next time the profile loads.
 * @param profile the signed-in person's profile; its `language` is updated in place.
 * @param language the language the app now shows.
 */
export function saveProfileLanguage(profile: Profile, language: string): void {
  if (profile.language === language) return;
  profile.language = language;
  void supabase.from('profiles').update({ language }).eq('id', profile.id).then(() => undefined);
}
