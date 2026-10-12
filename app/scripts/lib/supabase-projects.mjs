// The Supabase project of each EAS build profile and update channel. Read by scripts/publish-update.mjs
// (updates) and scripts/eas-build-guard.mjs (APK builds), so both refuse the same wrong project. Uses
// nothing but plain JavaScript: the build guard runs on EAS before `npm install`.

/**
 * Supabase project of each channel. A channel's APKs and updates must always use the same one:
 * `preview` = the test project (dummy data), `production` = the live project. Change these only
 * together with the EAS environments (docs/OPERATIONS.md "Building the Android app").
 */
export const PROJECTS = {
  preview: 'fhuqykssenuhczdqbafu',
  production: 'qeozvvizcojzxcjgnaei',
};

/** The project ref in a Supabase URL (`https://<ref>.supabase.co`), or null if `url` is not one. */
export function projectRefOf(url) {
  const match = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/.exec(String(url ?? '').trim());
  return match ? match[1] : null;
}
