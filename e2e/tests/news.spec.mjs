// Flow 5: the E2E Student reads the news and what changed in the app. News tab -> the newest
// announcement opens; My profile -> What's new lists the releases, newest first, and marks the one
// this build is ("You have this"). Reads only; nothing is written except the read receipt.

import { expect, signedInAs, test } from './helpers.mjs';

test.use(signedInAs('student'));

test('an announcement opens from the News tab', async ({ page }) => {
  await page.goto('/student');
  await page.getByRole('tab', { name: /News/ }).click();
  await expect(page.getByRole('heading', { name: 'News', level: 1 })).toBeVisible();
  const first = page.getByRole('button', { name: /\d{2}-\d{2}-\d{4} \d{2}:\d{2}/ }).first();
  await expect(first).toBeVisible();
  const label = (await first.getAttribute('aria-label')) ?? '';
  // The card's spoken label starts with "New, " when unread; the title comes next.
  const title = label.replace(/^New, /, '').split(', ')[0];
  await first.click();
  await expect(page.getByRole('heading', { name: title }).first()).toBeVisible();
});

test("My profile -> What's new shows the releases and the one this build is", async ({ page }) => {
  await page.goto('/student');
  await page.getByRole('button', { name: 'My profile' }).click();
  await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();
  await page.getByRole('button', { name: /^What's new: what changed in each version/ }).click();
  await expect(page.getByRole('heading', { name: "What's new", level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Version \d+\.\d+\.\d+ · / }).first()).toBeVisible();
  await expect(page.getByText('You have this')).toBeVisible();
});
