// Sign-in, sign-up, sign-out and password-reset calls, used by the login screens (A1).
// Each returns the translation key of a message to show, so screens never show raw server
// errors (which are English-only and sometimes technical).
//
// Emails for sign-up and password reset go through Supabase Auth and Brevo SMTP
// (docs/OPERATIONS.md). Links in those emails open the web version of the app.

import {
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthWeakPasswordError,
} from '@supabase/supabase-js';
import type { ParseKeys } from 'i18next';
import { Platform } from 'react-native';

import { clearSavedCard } from '@/data/my-student';
import { currentLanguage } from '@/i18n';
import { unregisterPush } from '@/lib/push';
import { forgetStoredLogin, storedLoginUserId, supabase } from '@/lib/supabase';

/** A translation key, for example 'authErrors.invalidCredentials'. */
export type MessageKey = ParseKeys;

/** Result of an auth call: nothing on success, or the message to show. */
export type AuthResult = { errorKey?: MessageKey };

/** Shortest password the app accepts. Set the same in Supabase: Auth → Providers → Email. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Where links in sign-up and reset emails should send the person. On the web it is this same
 * site, so testing on http://localhost:8081 works. Phones have no web address; Supabase then
 * uses the "Site URL" set in its dashboard, which should be the web version's address.
 * Each address must be listed in Supabase: Auth → URL Configuration → Redirect URLs.
 */
function emailLinkTarget(): string | undefined {
  return Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined;
}

/** Turns any error from Supabase Auth into a message the person can act on. */
export function authErrorKey(error: unknown): MessageKey {
  if (isAuthRetryableFetchError(error)) return 'common.networkError';
  if (isAuthWeakPasswordError(error)) return 'authErrors.weakPassword';
  if (isAuthApiError(error)) {
    switch (error.code) {
      case 'invalid_credentials':
        return 'authErrors.invalidCredentials';
      case 'email_not_confirmed':
        return 'authErrors.emailNotConfirmed';
      case 'user_already_exists':
      case 'email_exists':
        return 'authErrors.userExists';
      case 'weak_password':
        return 'authErrors.weakPassword';
      case 'same_password':
        return 'authErrors.samePassword';
      case 'email_address_invalid':
        return 'validation.emailInvalid';
      case 'over_email_send_rate_limit':
      case 'over_request_rate_limit':
        return 'authErrors.rateLimited';
    }
  }
  // A plain network failure (no internet) reaches here as a TypeError from fetch.
  if (error instanceof TypeError) return 'common.networkError';
  return 'common.genericError';
}

/** Loose check that catches typing mistakes; the server does the real check. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Signs in with email and password. On success the auth provider notices the new session and
 * the app moves to the person's screens by itself.
 */
export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  return error ? { errorKey: authErrorKey(error) } : {};
}

/** What the sign-up form adds to the name (0036, docs/DECISIONS.md #162); each may be missing. */
export type SignUpDetails = {
  /** 'YYYY-MM-DD', an adult's (under 18 signs up at the desk). */
  dob?: string | null;
  /** A gender option code. */
  gender?: string | null;
  centreId?: number | null;
  /** Own mobile number in E.164. */
  phone?: string | null;
  /** The initiated (Diksha) name, optional. */
  dikshaName?: string | null;
  /** Instrument option codes the person wants to learn. */
  learn?: string[];
};

/**
 * Creates a login. The database gives it the role `pending`, or `student` when the email
 * matches a student record (docs/DATABASE.md "Linking a login to a student").
 * @returns needsConfirmation true when Supabase sent a confirmation email and the person must
 *          open it before signing in; false when they are signed in straight away.
 */
export async function signUp(
  fullName: string,
  email: string,
  password: string,
  details: SignUpDetails = {},
): Promise<AuthResult & { needsConfirmation?: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      // Read by the database function handle_new_user to fill profiles.full_name and, from 0032,
      // profiles.language: the language the app shows now (picked, or the phone's own), so the
      // first sign-in keeps it instead of the default English (docs/DECISIONS.md #125). From 0036
      // also the date of birth, gender and centre; a database before 0036 ignores them.
      data: {
        full_name: fullName.trim(),
        language: currentLanguage(),
        ...(details.dob ? { dob: details.dob } : {}),
        ...(details.gender ? { gender: details.gender } : {}),
        ...(details.centreId ? { centre_id: details.centreId } : {}),
        ...(details.phone ? { phone: details.phone } : {}),
        ...(details.dikshaName ? { diksha_name: details.dikshaName } : {}),
        ...(details.learn && details.learn.length > 0 ? { learn: details.learn } : {}),
      },
      emailRedirectTo: emailLinkTarget(),
    },
  });
  if (error) return { errorKey: authErrorKey(error) };
  return { needsConfirmation: !data.session };
}

/**
 * Emails a link to set a new password. Always reports success when the request went through,
 * even for an unknown email, so the form cannot be used to find out who has an account.
 */
export async function sendPasswordReset(email: string): Promise<AuthResult> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: emailLinkTarget(),
  });
  return error ? { errorKey: authErrorKey(error) } : {};
}

/**
 * Emails a new sign-up confirmation link, after the first one expired or was used (sign-in screen,
 * src/auth/email-link.ts). Like sendPasswordReset, success does not say whether such an account
 * exists.
 */
export async function resendConfirmation(email: string): Promise<AuthResult> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim(),
    options: { emailRedirectTo: emailLinkTarget() },
  });
  return error ? { errorKey: authErrorKey(error) } : {};
}

/** Saves a new password for the signed-in person (used after opening a reset link). */
export async function setNewPassword(password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.updateUser({ password });
  return error ? { errorKey: authErrorKey(error) } : {};
}

/**
 * Signs out on this device only. Supabase's default ('global') would also sign the person out
 * of every other phone and browser they use. Also deletes the student's QR card saved on this
 * device (src/data/my-student.ts) and this phone's push token (src/lib/push.ts), so the next
 * person on a shared phone can neither use the card nor get this person's notifications.
 *
 * Without internet and with an expired access token, Supabase's signOut cannot refresh the login
 * and returns an error while keeping it saved, so the person would stay signed in. Then the
 * saved login is deleted here and signOut runs again: with nothing saved it only clears the
 * client and tells the app (SIGNED_OUT), which forgets the saved profile (docs/DECISIONS.md #42).
 * The push token row stays on the server in that case; the phone's next sign-in replaces it.
 */
export async function signOut(): Promise<void> {
  clearSavedCard();
  // Before signing out: deleting the token needs the login.
  await unregisterPush();
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error && storedLoginUserId()) {
    forgetStoredLogin();
    await supabase.auth.signOut({ scope: 'local' });
  }
}
