// Flow 2: the coordinator registers an adult at the welcome desk (Students tab -> Welcome desk, C2/C3).
// The record is named "Endtoend Desk <time in letters>" (names take letters only); afterwards the E2E Guru deletes it as a record entered by
// mistake (delete_student_record, 0054), so nothing is left behind. Nothing hangs on it (no visit),
// which that function requires.

import { apiAs, expect, nameMark, signedInAs, test } from './helpers.mjs';

test.use(signedInAs('coordinator'));

let created = null;

test.afterEach(async () => {
  if (!created) return;
  const guru = await apiAs('guru');
  const { data: rows, error } = await guru.from('students').select('id').eq('full_name', created);
  if (error) throw new Error('clean-up: ' + error.message);
  for (const row of rows ?? []) {
    const { error: delError } = await guru.rpc('delete_student_record', { p_student: row.id, p_reason: 'E2E test record' });
    if (delError) throw new Error('clean-up: ' + delError.message);
  }
  await guru.auth.signOut({ scope: 'local' });
  created = null;
});

test('the welcome desk registers an adult and gives a roll number', async ({ page }) => {
  const name = nameMark();
  await page.goto('/staff/students');
  await page.getByRole('button', { name: 'Welcome desk' }).click();
  await expect(page.getByRole('heading', { name: 'Who is joining' })).toBeVisible();

  await page.getByRole('textbox', { name: 'Full name' }).fill(name);
  for (const [part, value] of [['Day', '15'], ['Month', 'June'], ['Year', '1995']]) {
    await page.getByRole('button', { name: new RegExp(`^${part}:`) }).click();
    const list = page.getByRole('dialog', { name: part });
    await list.getByRole('radio', { name: value, exact: true }).click();
    await expect(list).toBeHidden();
  }
  await page.getByRole('button', { name: 'Next: more details' }).click();
  await expect(page.getByRole('heading', { name: 'More details' })).toBeVisible();

  created = name;
  await page.getByRole('button', { name: 'Save student' }).click();
  await expect(page.getByText('Student registered')).toBeVisible();
  await expect(page.getByText(new RegExp(`${name} is registered\\. Roll number: MS-\\d{4}-\\d{4}`))).toBeVisible();
});
