// Flow 1: signing in (audit 22-10-2026 fix 24). A wrong password is refused with words; the student,
// the coordinator (with the six-digit sign-in code when the login has one, 0061) and the Guru reach
// their homes. Each session is kept in .auth/ for the other flows of the same browser.

import { authFile, expect, expectHome, signInThroughScreens, test } from './helpers.mjs';

test('a wrong password is refused and the form stays', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill('e2e.student@example.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('not-the-password-' + Date.now());
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in/);
});

for (const role of ['student', 'coordinator', 'guru']) {
  test(`the ${role} signs in and reaches the home`, async ({ page, browserName }) => {
    await signInThroughScreens(page, role);
    // A reload keeps the session (it lives in the browser's storage, as on the site).
    await page.reload();
    await expectHome(page, role);
    await page.context().storageState({ path: authFile(browserName, role) });
  });
}
