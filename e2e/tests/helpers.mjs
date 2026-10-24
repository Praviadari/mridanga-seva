// Shared steps of the E2E flows (e2e/README.md). Selectors are what a screen reader hears: roles and
// accessible names from the English texts (app/src/i18n/locales/en.json), so a test breaks when a
// person would notice the change, not when markup moves.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test as base } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { E2E_DIR, e2eLogins, testProject } from '../scripts/lib/env.mjs';
import { freshTotp } from '../scripts/lib/totp.mjs';

export const env = e2eLogins();
const project = testProject();

/** Email, password and (optional) sign-in code key of an E2E login. */
export function login(role) {
  const up = role.toUpperCase();
  return {
    email: env[`E2E_${up}_EMAIL`],
    password: env[`E2E_${up}_PASSWORD`],
    totpSecret: env[`E2E_${up}_TOTP_SECRET`] || null,
  };
}

/** Where a role's signed-in session is kept between the sign-in project and the flows. */
export function authFile(browserName, role) {
  const dir = join(E2E_DIR, '.auth');
  mkdirSync(dir, { recursive: true });
  return join(dir, `${browserName}-${role}.json`);
}

/** A short mark that names this run in everything it writes ("E2E" + time), for finding and clean-up. */
export function runMark() {
  return 'E2E ' + new Date().toISOString().replace(/\D/g, '').slice(4, 14);
}

/** The same mark in letters only, for a person's name (names take letters and spaces only). */
export function nameMark() {
  const digits = new Date().toISOString().replace(/\D/g, '').slice(4, 14);
  return 'Endtoend Desk ' + [...digits].map((d) => 'abcdefghij'[Number(d)]).join('').replace(/^./, (c) => c.toUpperCase());
}

/**
 * Signs in through the screens: email, password, and the six-digit code when the login has one.
 * Ends on the role's home.
 */
export async function signInThroughScreens(page, role) {
  const who = login(role);
  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill(who.email);
  await page.getByRole('textbox', { name: 'Password' }).fill(who.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  if (who.totpSecret) {
    await expect(page.getByRole('heading', { name: 'Sign-in code' })).toBeVisible();
    await page.getByRole('textbox', { name: '6-digit code' }).fill(await freshTotp(who.totpSecret));
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await expectHome(page, role);
}

/** The role's home: the student's or staff tab bar is there and the sign-in form is gone. */
export async function expectHome(page, role) {
  await expect(page).not.toHaveURL(/\/(sign-in|sign-in-code)(\?|$)/);
  const tab = role === 'student' ? 'My QR' : 'Check-in';
  await expect(page.getByRole('tab', { name: new RegExp(tab) }).first()).toBeVisible();
}

/** A Supabase client signed in as an E2E login, for set-up and clean-up the screens do not offer. */
export async function apiAs(role) {
  const who = login(role);
  const client = createClient(project.url, project.key, { auth: { persistSession: false, autoRefreshToken: false } });
  // Clean-up must not be lost to one dropped connection (seen on the office network): a network error is
  // tried again twice; a refused password is not.
  let error = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    ({ error } = await client.auth.signInWithPassword({ email: who.email, password: who.password }));
    if (!error || !/fetch failed|network|timed? ?out/i.test(error.message)) break;
    await new Promise((r) => setTimeout(r, 2_000 * attempt));
  }
  if (error) throw new Error(`sign-in of the E2E ${role} for clean-up failed: ${error.message}`);
  if (who.totpSecret) {
    const { data: factors } = await client.auth.mfa.listFactors();
    const factor = factors?.totp?.find((f) => f.status === 'verified');
    if (factor) {
      const { error: mfaError } = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: await freshTotp(who.totpSecret) });
      if (mfaError) throw new Error(`sign-in code of the E2E ${role} refused: ${mfaError.message}`);
    }
  }
  return client;
}

/**
 * Use in a spec file: `test.use(signedInAs('student'))` opens every page of that file with the session
 * the sign-in project kept for this browser, so a flow never signs in again.
 */
export function signedInAs(role) {
  return { storageState: async ({ browserName }, use) => use(authFile(browserName, role)) };
}

export { base as test, expect };
