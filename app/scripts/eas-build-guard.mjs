// Stops an APK build on EAS whose Supabase settings belong to the other project (audit D3-11,
// docs/DECISIONS.md #256). EAS Build runs it as the `eas-build-pre-install` script of package.json,
// before `npm install`, with the variables of the profile's EAS environment (eas.json "environment")
// and EAS_BUILD_PROFILE set. A production APK built with the test settings would cut the class off
// from its data; a preview APK with the live settings would send testers into the class's real data.
// Profile `facetest` builds "Mridanga Seva TEST" (app.config.js, APP_VARIANT=facetest; docs/DECISIONS.md #430), the
// Phase 3 face-scan test app: TEST project only, never LIVE, and only with its variant; the class's own profiles
// only without one. Only the project refs and the profile are printed, never the key.
//
// Plain Node, no packages (node_modules does not exist yet when it runs). Exits with code 1, which
// fails the build, when the profile is unknown, a setting is missing, the URL names another project
// or the key is not a publishable one. Locally: EAS_BUILD_PROFILE=preview node scripts/eas-build-guard.mjs

import { pathToFileURL } from 'node:url';

import { PROJECTS, projectRefOf } from './lib/supabase-projects.mjs';

/**
 * The Supabase project and the app variant (app.config.js) of each APK build profile in eas.json. The class's own
 * profiles are the update channels of PROJECTS and set no variant; `facetest` is the face-scan test app on the TEST
 * project (the same EAS environment as preview).
 */
export const BUILD_PROFILES = {
  preview: { project: PROJECTS.preview, variant: null },
  production: { project: PROJECTS.production, variant: null },
  facetest: { project: PROJECTS.preview, variant: 'facetest' },
};

/** The `role` claim of a JWT, or null if `token` is not one. */
function jwtRole(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).role ?? null;
  } catch {
    return null;
  }
}

/**
 * What is wrong with the build's settings in `env`, or null if nothing is. Checks that the profile
 * is in BUILD_PROFILES with exactly its app variant (APP_VARIANT), that EXPO_PUBLIC_SUPABASE_URL names
 * exactly its project and that EXPO_PUBLIC_SUPABASE_KEY is a publishable key (sb_publishable_…) or an
 * older anon JWT.
 */
export function buildSettingsProblem(env) {
  const profile = env.EAS_BUILD_PROFILE;
  if (!profile) return 'EAS_BUILD_PROFILE is not set (this runs on EAS Build).';
  if (!Object.hasOwn(BUILD_PROFILES, profile)) {
    return `build profile "${profile}" has no Supabase project in scripts/eas-build-guard.mjs BUILD_PROFILES.`;
  }
  const { project, variant } = BUILD_PROFILES[profile];
  const askedVariant = String(env.APP_VARIANT ?? '').trim() || null;
  if (askedVariant !== variant) {
    return variant
      ? `profile "${profile}" must be built with APP_VARIANT=${variant} (eas.json "env"), not ${askedVariant ?? 'none'}.`
      : `profile "${profile}" is the class's own app and must be built without APP_VARIANT (found ${askedVariant}).`;
  }
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  if (!url) return `EXPO_PUBLIC_SUPABASE_URL is missing in the "${profile}" environment on EAS (OPERATIONS.md: env:push).`;
  const ref = projectRefOf(url);
  if (!ref) return 'EXPO_PUBLIC_SUPABASE_URL is not of the form https://<project ref>.supabase.co.';
  if (ref !== project) {
    return `profile "${profile}" must use project ${project}, but its EAS environment names ${ref}.`;
  }
  const key = String(env.EXPO_PUBLIC_SUPABASE_KEY ?? '').trim();
  if (!key) return `EXPO_PUBLIC_SUPABASE_KEY is missing in the "${profile}" environment on EAS (OPERATIONS.md: env:push).`;
  if (!/^sb_publishable_[\w-]{20,}$/.test(key) && jwtRole(key) !== 'anon') {
    return 'EXPO_PUBLIC_SUPABASE_KEY is neither a publishable key (sb_publishable_…) nor an anon JWT.';
  }
  return null;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const problem = buildSettingsProblem(process.env);
  if (problem) {
    console.error(`eas-build-guard: ${problem} Build stopped.`);
    process.exit(1);
  }
  const { project, variant } = BUILD_PROFILES[process.env.EAS_BUILD_PROFILE];
  console.log(`eas-build-guard: profile ${process.env.EAS_BUILD_PROFILE} → project ${project}${variant ? `, app variant ${variant}` : ''}, publishable key.`);
}
