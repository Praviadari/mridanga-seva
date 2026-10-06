// Email links that did not work (D6-12). Links in sign-up and password-reset emails open the web
// version of the app (src/auth/auth-actions.ts). When a link has expired or was already used,
// Supabase sends the person back with the reason in the address instead of a login, e.g.
// https://<site>/#error=access_denied&error_code=otp_expired&error_description=...
// (or in the query part, ?error=...). Supabase only reports it to the code that asked; nothing
// tells the person. This file reads the reason once at start, removes it from the address so a
// reload does not show it again, and the sign-in screen shows what happened and how to get a new
// link (docs/DECISIONS.md #124). Phones never get these addresses, so there it is always null.

import { Platform } from 'react-native';

/** What went wrong: the link expired or was used already, or another reason. */
export type EmailLinkProblem = 'expired' | 'failed';

/** Reads the reason from the address, if there is one, and removes it from the address. */
function readFromAddress(): EmailLinkProblem | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const from = hash.has('error') || hash.has('error_code') ? hash : url.searchParams;
  if (!from.has('error') && !from.has('error_code')) return null;
  const problem: EmailLinkProblem = from.get('error_code') === 'otp_expired' ? 'expired' : 'failed';
  if (from === hash) {
    url.hash = '';
  } else {
    for (const key of ['error', 'error_code', 'error_description']) url.searchParams.delete(key);
  }
  window.history.replaceState(window.history.state, '', url.toString());
  return problem;
}

// Read when this file is first loaded (src/auth/auth-provider.tsx loads it at start), before the
// router moves from the link's address to the sign-in screen.
let pending: EmailLinkProblem | null = readFromAddress();

/** The problem with the email link the app was opened from; null when none, or on phones. */
export function emailLinkProblem(): EmailLinkProblem | null {
  return pending;
}

/** Forgets the problem, once the sign-in screen has shown it, so it shows only once. */
export function clearEmailLinkProblem(): void {
  pending = null;
}
