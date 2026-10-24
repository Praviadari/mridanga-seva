// Flow 4: the E2E Student logs practice on My practice log (S-practice, 0018), once online and once
// with the connection gone: the entry then waits on the phone (offline queue, #593) and is saved
// when the connection is back. Each entry carries a note "E2E <time>" and is deleted at the end.

import { apiAs, expect, runMark, signedInAs, test } from './helpers.mjs';

test.use(signedInAs('student'));

// A flow stopped half-way leaves its entry: delete every "E2E …" entry of the E2E Student.
test.afterEach(async () => {
  const student = await apiAs('student');
  const { data: rows, error } = await student.from('practice_logs').select('id').like('note', 'E2E %');
  if (error) throw new Error('clean-up: ' + error.message);
  for (const row of rows ?? []) {
    const { error: delError } = await student.rpc('delete_practice', { p_id: row.id });
    if (delError) throw new Error('clean-up: ' + delError.message);
  }
  await student.auth.signOut({ scope: 'local' });
});

/** The entry row whose note is `note` (the innermost block holding the note and a Delete button). */
function entryRow(page, note) {
  return page
    .locator('div')
    .filter({ hasText: note })
    .filter({ has: page.getByRole('button', { name: /^(Delete|Yes, delete),/ }) })
    .last();
}

async function deleteEntry(page, note) {
  const row = entryRow(page, note);
  await row.getByRole('button', { name: /^Delete,/ }).click();
  // "Yes, delete" ignores taps for a moment after it appears (P2-06): click until it takes.
  await expect(async () => {
    await row.getByRole('button', { name: /^Yes, delete,/ }).click({ timeout: 2_000 });
    await expect(page.getByText('Entry deleted.')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByText(note)).toHaveCount(0);
}

async function addPractice(page, minutes, note) {
  await page.getByRole('textbox', { name: 'Minutes' }).fill(String(minutes));
  await page.getByRole('textbox', { name: 'Note (optional)' }).fill(note);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
}

test('practice typed in is saved and can be deleted', async ({ page }) => {
  const note = runMark() + ' online';
  await page.goto('/student/practice-log');
  await expect(page.getByRole('heading', { name: 'Add practice' })).toBeVisible();
  await addPractice(page, 17, note);
  await expect(page.getByText(/^Saved .*\.$/)).toBeVisible();
  await expect(entryRow(page, note)).toBeVisible();
  await deleteEntry(page, note);
});

test('practice saved without a connection waits on the phone and is sent when it is back', async ({ page, context }) => {
  const note = runMark() + ' offline';
  await page.goto('/student/practice-log');
  await expect(page.getByRole('heading', { name: 'Add practice' })).toBeVisible();

  await context.setOffline(true);
  await addPractice(page, 13, note);
  await expect(page.getByText(/^No connection: .* kept on this phone/)).toBeVisible();
  await expect(page.getByText('1 practice entry is waiting for the signal')).toBeVisible();

  await context.setOffline(false);
  // The app sends by itself when the browser is online again (no "Send now" tap: the button can go
  // while it is being clicked, and the automatic send is what phones rely on).
  await expect(page.getByText('1 practice entry is waiting for the signal')).toHaveCount(0);

  await page.reload();
  await expect(entryRow(page, note)).toBeVisible();
  await deleteEntry(page, note);
});
