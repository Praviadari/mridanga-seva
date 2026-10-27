// The message for an error from Supabase Auth (sign-in, sign-up, reset, resend, new password): a translation key, so
// screens never show raw server errors (English-only, sometimes technical). Pure: no app modules, so tests drive it with
// the installed auth client's real errors (tests/launch-audit.test.mjs). Re-exported by ./auth-actions.

import {
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthWeakPasswordError,
} from '@supabase/supabase-js';
import type { ParseKeys } from 'i18next';

type MessageKey = ParseKeys;

/** Turns any error from Supabase Auth into a message the person can act on. */
export function authErrorKey(error: unknown): MessageKey {
  // Supabase Auth could not hand the email to the mail service (LA-22, #397): its answer is a 500 "Error sending
  // confirmation email" / "... recovery email" (for example once Brevo's 300 a day are used up), which supabase-js
  // reports like a lost connection. Not the person's internet: say the email could not be sent.
  if ((isAuthApiError(error) || isAuthRetryableFetchError(error)) && error.status === 500 &&
    /error sending .*e?mail/i.test(error.message)) {
    return 'authErrors.emailNotSent';
  }
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
      // The project's emails per hour (150 for the sign-up weekend): the email is what waits, not the person's tries
      // (#397). The 60 s before another email to the same address ("... only request this after 52 seconds") has the
      // same code: then a minute is enough (E5, #661).
      case 'over_email_send_rate_limit':
        return /after \d+ seconds?/i.test(error.message) ? 'authErrors.waitAMinute' : 'authErrors.emailNotSent';
      case 'over_request_rate_limit':
        return 'authErrors.rateLimited';
      // Audit D8-04: these need a new sign-in, a new link or staff help, not another try.
      case 'session_expired':
      case 'session_not_found':
      case 'refresh_token_not_found':
      case 'refresh_token_already_used':
      case 'reauthentication_needed':
        return 'authErrors.sessionEnded';
      case 'otp_expired':
      case 'flow_state_expired':
      case 'flow_state_not_found':
      case 'bad_code_verifier':
        return 'authErrors.linkExpired';
      case 'signup_disabled':
      case 'email_provider_disabled':
        return 'authErrors.signupClosed';
      case 'user_banned':
        return 'authErrors.accountOff';
    }
  }
  // A plain network failure (no internet) reaches here as a TypeError from fetch.
  if (error instanceof TypeError) return 'common.networkError';
  return 'common.genericError';
}

/**
 * The message for a failed sign-up. When the database refuses the new login (handle_new_user raises, e.g.
 * name_taken: the name of the Guru or a coordinator, 0028/0047), Supabase Auth hides the reason behind
 * "Database error saving new user" (HTTP 500), so the person gets the likely cause as a hint (R2-03, #292).
 * supabase-js reports a 500 as a retryable fetch error (like no internet) but keeps that message, so the
 * message decides, not the error's kind.
 */
export function signUpErrorKey(error: unknown): MessageKey {
  if (
    (isAuthApiError(error) || isAuthRetryableFetchError(error)) &&
    error.status === 500 &&
    /database error saving new user/i.test(error.message)
  ) {
    return 'authErrors.signUpRefused';
  }
  return authErrorKey(error);
}
