// Keeps track of who is signed in and what they may use, for the whole app.
// Wraps the app in src/app/_layout.tsx; screens read it with useAuth().
//
// Flow: Supabase restores the saved login (or not) → if signed in, the person's `profiles` row
// is fetched → its role decides the Area (src/auth/types.ts) → the root layout shows that
// area's screens. Until both are known the area is 'loading' and the splash shows, except when
// this device remembers the person's profile (src/auth/saved-profile.ts): then their area opens at
// once from that copy while the login is restored and the profile fetched behind it, and the copy
// keeps being used when the fetch fails for lack of internet (docs/DECISIONS.md #37). Without
// internet and with an expired access token, Supabase reports "no session" although the login is
// still saved; the person then keeps their area from the remembered profile until the login is
// refreshed, instead of landing on sign-in (docs/DECISIONS.md #42).
// Roles are given by the database, never chosen in the app (docs/ARCHITECTURE.md "Roles").
// A login without a class role ('pending') that joined Ishtagoshti gets the 'subscriber' area: its
// state comes from ig_my_state() (migration 0027, docs/DECISIONS.md #88).
// The profile is read again when the app comes back to the screen, when the login token is
// refreshed, and when the database refuses a call as not allowed, so a person the Guru switched
// off (or whose role changed) loses their screens and the QR scanner at once (docs/DECISIONS.md #99).

import type { Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { applyProfileLanguage, currentLanguage, hasUnsavedChoice, markLanguageSaved } from '@/i18n';
import { loadClassLocale } from '@/lib/class-locale';
import { setRefusedListener, storedLoginUserId, supabase, supabaseConfigProblem } from '@/lib/supabase';

// Loaded at start for its effect: it reads an email link's error from the address (D6-12).
import './email-link';
import { forgetSavedProfile, readSavedProfile, saveProfile } from './saved-profile';
import type { Area, IgState, Profile } from './types';

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

/** At most one re-check of the profile in this time, however many calls are refused at once. */
const RECHECK_GAP_MS = 10_000;

/** Provides AuthState to everything inside it. Use once, around the whole app. */
export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  // With no settings there is nothing to load, so the setup message can show at once.
  const [sessionLoaded, setSessionLoaded] = useState(supabaseConfigProblem !== null);
  // Set when the person arrives from a password-reset email link (web only).
  const [recovering, setRecovering] = useState(false);
  const [profileResult, setProfileResult] = useState<ProfileResult | null>(null);
  // The user id of a login that is saved on this device but could not be restored at start,
  // because its token had expired and there was no internet to refresh it. Null otherwise.
  const [offlineUserId, setOfflineUserId] = useState<string | null>(null);
  // The profile remembered from the last start, read once. Its language is applied at once, so
  // the first screen is already in the person's language.
  const [saved] = useState<Profile | null>(() => {
    const copy = supabaseConfigProblem ? null : readSavedProfile();
    if (copy && !hasUnsavedChoice()) applyProfileLanguage(copy.language);
    return copy;
  });
  // Bumped to read the profile again (see the top of this file); lastRecheck spaces them out.
  const [recheck, setRecheck] = useState(0);
  const lastRecheck = useRef(0);

  useEffect(() => {
    if (supabaseConfigProblem) return;
    const askRecheck = () => {
      const now = Date.now();
      if (now - lastRecheck.current < RECHECK_GAP_MS) return;
      lastRecheck.current = now;
      setRecheck((n) => n + 1);
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') askRecheck();
    });
    setRefusedListener(askRecheck);
    return () => {
      subscription.remove();
      setRefusedListener(null);
    };
  }, []);

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
      // "No session" at start while a login is still saved: the token could not be refreshed for
      // lack of internet. Any later event (TOKEN_REFRESHED once online, SIGNED_OUT) settles it.
      setOfflineUserId(event === 'INITIAL_SESSION' && !newSession ? storedLoginUserId() : null);
      // About hourly while the app is open: a good moment to see whether the role still holds.
      if (event === 'TOKEN_REFRESHED') setRecheck((n) => n + 1);
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
    // The centre's time zone and country for dates and amounts (docs/I18N.md); kept from the last
    // start until it arrives, India before the first.
    void loadClassLocale();
    return () => {
      cancelled = true;
    };
  }, [userId, recheck]);

  // Ignore a profile that belongs to an earlier login. While the fetch for this login runs, the
  // remembered copy stands in for it, but only when it is this same person's.
  const fetched = profileResult && profileResult.userId === userId ? profileResult : null;
  const current: ProfileResult | null =
    fetched ?? (userId && saved?.id === userId ? { userId, profile: saved, failed: false } : null);
  // Before the saved login is restored there is no session yet: the remembered profile decides.
  // The same while a saved login waits for internet to be refreshed: the remembered profile of
  // that same person stands in; without one, the pending screen says the account could not load.
  const waitingOffline = sessionLoaded && !session && offlineUserId !== null;
  const offlineProfile = waitingOffline && saved?.id === offlineUserId ? saved : null;
  const profile = !sessionLoaded ? saved : waitingOffline ? offlineProfile : (current?.profile ?? null);
  const profileFailed = sessionLoaded && (waitingOffline ? !offlineProfile : (current?.failed ?? false));

  let area: Area;
  if (!sessionLoaded) area = saved ? areaForProfile(saved) : 'loading';
  else if (waitingOffline) area = offlineProfile ? areaForProfile(offlineProfile) : 'pending';
  else area = areaFor(session, recovering, current);

  const value: AuthState = {
    area,
    session,
    profile,
    profileFailed,
    refreshProfile: async () => {
      if (userId) setProfileResult(withSavedFallback(await fetchProfile(userId)));
      // Asking for the session makes Supabase try the refresh again; when it works, its
      // TOKEN_REFRESHED event brings the session and the profile is fetched as usual.
      else if (offlineUserId) await supabase.auth.getSession();
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
    case 'pending':
      // A public login that joined Ishtagoshti reads slokas only (I14, docs/DECISIONS.md #88).
      return profile.ig_state === 'active' ? 'subscriber' : 'pending';
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
  if (data?.role === 'pending' && data.active) {
    // Before migration 0027 the function is missing: no state, and the pending screen offers no join.
    const state = await supabase.rpc('ig_my_state');
    if (state.error && state.error.code !== 'PGRST202') return { userId, profile: null, failed: true };
    if (!state.error) data.ig_state = ((state.data as { state?: IgState } | null)?.state ?? 'none') as IgState;
  }
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
 * Keeps the app language and the profile's saved language in step. The profile holds the
 * person's language, so their last choice on any device is used everywhere. A language picked on
 * this device that has not reached the profile yet (picked on the sign-in screen, or without
 * internet) is saved to it now; otherwise the profile's language is used (docs/DECISIONS.md #48).
 */
function syncLanguageWithProfile(profile: Profile): void {
  if (hasUnsavedChoice()) {
    saveProfileLanguage(profile, currentLanguage());
    return;
  }
  applyProfileLanguage(profile.language);
}

/**
 * Saves `language` as the signed-in person's language on their profile, when it differs. Used
 * when the profile loads and when the person switches language. Not awaited: the screen
 * language is already right. When the save works, the device stops marking the choice as unsaved
 * and the remembered profile gets the new language; when it fails (no internet), the next profile
 * load tries again.
 * @param profile the signed-in person's profile; its `language` is updated in place.
 * @param language the language the app now shows.
 */
export function saveProfileLanguage(profile: Profile, language: string): void {
  if (profile.language === language) {
    markLanguageSaved();
    return;
  }
  // Set at once, so a second quick switch is compared with this one and not with the old value.
  profile.language = language;
  void supabase
    .from('profiles')
    .update({ language })
    .eq('id', profile.id)
    .select('id')
    .then(({ data, error }) => {
      // A later switch has its own save; only the save of what the app shows ends the "unsaved".
      if (error || !data || data.length === 0 || currentLanguage() !== language) return;
      markLanguageSaved();
      if (readSavedProfile()?.id === profile.id) saveProfile({ ...profile });
    });
}
