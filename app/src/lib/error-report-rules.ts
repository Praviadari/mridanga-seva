// The pure rules of the class's error log (migration 0061, docs/DECISIONS.md #585): what a report says about an error,
// so that no person can be read from it. src/lib/error-report.ts sends; unit-tested in tests/staff-mfa.test.mjs.

import type { ErrorReport } from '@/data/app-errors';

import type { RunningVersion } from './app-update';

/** Reports sent in one run of the app, at most. */
export const RUN_LIMIT = 20;

/** The error's name when it is a plain identifier (TypeError, AbortError, AuthApiError); else Error or NonError. */
export function errorName(error: unknown): string {
  if (!(error instanceof Error) && !(typeof error === 'object' && error !== null && 'name' in error)) return 'NonError';
  const name = String((error as { name?: unknown }).name ?? '');
  return /^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(name) ? name : 'Error';
}

/**
 * The screen as its route pattern, from Expo Router's segments (useSegments: the file names, so [id] stays [id]).
 * A segment that is not a plain route name (letters, -, _, brackets, parentheses, +) becomes [x]; at most 8.
 */
export function screenPattern(segments: readonly string[]): string {
  const parts = segments.slice(0, 8).map((s) => (/^[a-z_()[\]+-]{1,40}$/.test(s) ? s : '[x]'));
  return parts.length ? `/${parts.join('/')}` : '/';
}

/** The version as the log keeps it: 1.0.0 (inside the APK), 1.0.0+a1b2c3d4 (an update), web-test+244e9f8, or dev. */
export function versionTag(running: RunningVersion | null): string {
  const raw = !running
    ? 'dev'
    : running.kind === 'web'
      ? `web-${running.site}+${running.commit}`
      : running.kind === 'update'
        ? `${running.version}+${running.id}`
        : running.version;
  const clean = raw.replace(/[^A-Za-z0-9._+-]/g, '').slice(0, 40);
  return /^[A-Za-z0-9]/.test(clean) ? clean : 'unknown';
}

/** The platform as the log keeps it; null for one it does not know. */
export function platformOf(os: string): ErrorReport['platform'] | null {
  return os === 'android' || os === 'ios' || os === 'web' ? os : null;
}
