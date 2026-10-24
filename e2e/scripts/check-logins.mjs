// npm run e2e:check: signs each E2E login in (password only) and says its role and, for the student,
// whether its record is linked: the quick check after README "One-time set-up". Also counts what a
// failed clean-up would leave on TEST. Prints no secret.

import { createClient } from '@supabase/supabase-js';

import { e2eLogins, testProject } from './lib/env.mjs';

const { url, key } = testProject();
const env = e2eLogins();
const want = { STUDENT: 'student', COORDINATOR: 'coordinator', GURU: 'guru' };
let ok = true;

for (const [role, expected] of Object.entries(want)) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: env[`E2E_${role}_EMAIL`], password: env[`E2E_${role}_PASSWORD`] });
  if (error) {
    console.log(`${role.toLowerCase()}: cannot sign in (${error.message})`);
    ok = false;
    continue;
  }
  const { data: profile } = await client.from('profiles').select('role, full_name').eq('id', data.user.id).maybeSingle();
  let extra = '';
  if (expected === 'student') {
    const { data: rec } = await client.from('students').select('full_name, roll_no').eq('profile_id', data.user.id).maybeSingle();
    extra = rec ? `, record "${rec.full_name}" ${rec.roll_no}` : ', NO linked student record';
    if (!rec) ok = false;
  }
  const right = profile?.role === expected;
  if (!right) ok = false;
  console.log(`${role.toLowerCase()}: role ${profile?.role ?? '?'}${right ? '' : ` (expected ${expected})`}, name "${profile?.full_name ?? ''}"${extra}`);
  if (expected === 'student') {
    // What the flows leave when a clean-up failed: practice notes "E2E …", the student still in class.
    const { count: notes } = await client.from('practice_logs').select('id', { count: 'exact', head: true }).like('note', 'E2E %');
    const { count: open } = await client.from('visits').select('id', { count: 'exact', head: true }).is('check_out', null);
    console.log(`  left behind: ${notes ?? '?'} E2E practice entries, ${open ?? '?'} open visits`);
    if (notes || open) ok = false;
  }
  if (expected === 'guru') {
    const { count } = await client.from('students').select('id', { count: 'exact', head: true }).like('full_name', 'Endtoend Desk %');
    console.log(`  left behind: ${count ?? '?'} "Endtoend Desk" records`);
    if (count) ok = false;
  }
  await client.auth.signOut({ scope: 'local' });
}
process.exit(ok ? 0 : 1);
