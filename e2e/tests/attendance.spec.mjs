// Flow 3: the coordinator finds the E2E Student by name on the Check-in tab (C5) and taps Check in,
// then Check out, so the student leaves the day as they found it: not in class.

import { expect, signedInAs, test } from './helpers.mjs';

test.use(signedInAs('coordinator'));

test('a name tap checks the student in, and out again', async ({ page }) => {
  await page.goto('/staff/attendance');
  await expect(page.getByRole('heading', { name: 'Check-in' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Name or roll number' }).fill('E2E Student');

  const checkIn = page.getByRole('button', { name: /^Check in, E2E Student/ });
  const checkOut = page.getByRole('button', { name: /^Check out, E2E Student/ });
  await expect(checkIn.or(checkOut)).toBeVisible();
  // A run stopped half-way can leave the student in: start from "not in class".
  if (await checkOut.isVisible()) {
    await checkOut.click();
    await expect(checkIn).toBeVisible();
  }

  await checkIn.click();
  await expect(page.getByText(/Checked in at/)).toBeVisible();
  await expect(checkOut).toBeVisible();

  await checkOut.click();
  await expect(page.getByText(/Checked out at .*Stayed/)).toBeVisible();
  await expect(checkIn).toBeVisible();
});
