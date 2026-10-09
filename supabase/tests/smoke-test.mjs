// Database smoke test: runs every migration and seed.sql on an in-memory Postgres (PGlite),
// then checks the rules that protect student data: login linking, the profile guard,
// registration with consent, attendance marking, follow-up calls, syllabus ticks, announcements
// with their read receipts, edits and private replies, groups, the home-screen numbers, who may
// run which function, and row-level security. The security round (0025) adds switched-off and
// kiosk logins, the frozen record fields, the consent register, withdrawal, erasure (with a sweep
// of every table for the child's data) and a grant sweep: anon may touch nothing in public. Security round 2
// (0028) adds frozen profile identity columns, student logins without a record, posted files that cannot be
// swapped, and the consent edges (dob edits across the 18-year line, a minor's guardian phone). Round 10
// (0030) adds the follow-up rules (pause end, retry count, settings fallbacks and order), the status
// side doors, frozen visit fields and the 30-second rescan; each check names its audit finding ID.
// 0032 adds the sign-up language (D8-01) and one student per registration request (D6-08). 0033 adds a
// time zone per centre (a New York centre's days around midnight) and the currency of fund entries. 0036 adds
// account creation: option lists, the sign-up's details, About you, the desk, same-gender mentors, the report.
// The test net at the end (audit brief 12) walks the whole schema: guardians, consents and the
// audit log closed to students and pending logins, the function allow-lists, row-level security on
// every table, a student-isolation loop over every student-linked table and view, write sweeps per
// role, the roll-number / status-history / audit triggers, the two daily jobs on fixed cases and
// the pg_cron job list.
// 0034 adds the access log: guardians, consents, call notes and audit-log pages read through logging
// functions, coordinators without direct reads, the privacy-notice version on consents, the purge.
// 0037 (audit backlog) adds: no policy calls a role helper per row (the (select ...) form, with the
// rules still refusing), the faster student_overview and the lookup indexes, the closed rights
// (trigger functions, TRUNCATE, definer search path, service_role), roll numbers, student value
// checks and the small data rules, each named by its audit finding ID.
//
// Run before pasting a migration into the live Supabase project, and on every pull request (CI):
//   cd supabase/tests && npm ci && npm test        (Node 22.18 or newer, see package.json engines)
//
// How to add a check: call check(name, ok, detail) for a fact, refusesWith(name, 'exact error', fn)
// for a refusal (never "any error": D14-09). Write the negative AND the positive side (the role
// the rule is for can still do it). Name the audit finding or decision in the check. The run
// counts every check and fails if the total is not EXPECTED_CHECKS: set it to the new total.
//
// PGlite is real Postgres compiled to WebAssembly, so no database server is needed. Supabase's
// own pieces are imitated at the top (auth.users, auth.uid(), the anon / authenticated roles and
// their default grants, pg_cron). The imitation is close, not exact: a pass here does not replace
// a careful first run on a test project (docs/OPERATIONS.md). What a PASS here does NOT prove
// (D14-12), so check these by hand on TEST when a change touches them:
//   - pg_cron: jobs are recorded, never run on a schedule; only the schedule's shape and that the
//     command's functions exist are checked. The time zone of a schedule is not.
//   - pg_net / push delivery: no HTTP leaves the test; call_notify_function answers not_set_up and
//     the Edge Function is driven with a fake Expo (push-messages.test.mjs).
//   - Storage: only storage.objects rows and their policies; size and type limits, signed URLs
//     and the Storage API's upsert are not imitated.
//   - Auth: auth.users is a bare table; sign-up, email confirmation, JWT expiry and rate limits
//     are Supabase's. Supabase's safeupdate (UPDATE/DELETE need a WHERE) is checked by a sweep.
//   - Concurrency: one connection, so races between two sessions (two coordinators, the push
//     claim) are not exercised; row locks are only read in the code.
//   - Extensions and versions: PGlite's Postgres version and pgcrypto only.

import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readdirSync, readFileSync } from 'node:fs';

import { runPush } from '../functions/notify-announcements/send.ts';

const supabaseDir = new URL('../', import.meta.url);
const db = new PGlite({ extensions: { pgcrypto } });

// Supabase gives anon and authenticated rights on everything new in `public` by default; the
// migrations must take them away where needed, so the imitation must grant them too.
const supabaseImitation = `
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    email_confirmed_at timestamptz,
    raw_user_meta_data jsonb default '{}'
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant execute on function auth.uid() to anon, authenticated;
  create schema cron;
  -- pg_cron's job table, so the test net can check every scheduled command (D14-12); a job is
  -- never run here. Scheduling a name again replaces its job, as in pg_cron.
  create table cron.job (jobid bigint generated always as identity primary key, jobname text unique, schedule text, command text);
  create function cron.schedule(name text, schedule text, command text) returns bigint language sql as $$
    insert into cron.job (jobname, schedule, command) values (name, schedule, command)
    on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
  -- The Edge Functions' role: it bypasses row-level security, like Supabase's service_role.
  create role service_role nologin bypassrls;
  grant usage on schema public, auth to service_role;
  alter default privileges in schema public grant all on tables to service_role;
  alter default privileges in schema public grant all on sequences to service_role;
  alter default privileges in schema public grant execute on functions to service_role;
  -- Supabase Storage keeps one row per file in storage.objects, with row-level security on; the
  -- Storage API writes it as the signed-in person. Size and type limits of a bucket are checked
  -- by the Storage API, not the database, so they cannot be tested here.
  create schema storage;
  grant usage on schema storage to anon, authenticated, service_role;
  create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    owner uuid,
    metadata jsonb,
    created_at timestamptz default now(),
    unique (bucket_id, name));
  alter table storage.objects enable row level security;
  grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
`;

// Print a failing SQL statement briefly instead of the database client's full error dump.
process.on('uncaughtException', (error) => {
  console.error(`ERROR  ${error.message}${error.query ? `\n       in: ${error.query}` : ''}`);
  process.exit(1);
});

// D14-10: every check is counted, and the run fails when fewer (or more) checks ran than expected,
// so a block skipped by a renamed migration or a commented-out section cannot pass unseen.
// Adding or removing checks? Run the suite and set this to the new total it prints.
const EXPECTED_CHECKS = 1361; // 0035 asset labels: +38; 0036 account creation: +60; 0037 backlog: +47; 0038: +19; 0039: +15
let failures = 0;
let passes = 0;

/** Prints PASS or FAIL for one check. */
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) passes++;
  else failures++;
}

/** Runs SQL as the database owner, like the Supabase SQL editor or pg_cron: nobody signed in. */
async function asOwner(sql) {
  return (await db.query(sql)).rows;
}

/**
 * Runs SQL as an app user: role 'anon' or 'authenticated', signed in as `userId` (or nobody).
 * D14-11: the sign-in is cleared again afterwards, so owner statements never run with a leftover
 * auth.uid() (on Supabase the SQL editor and pg_cron have none). The id is a bind parameter.
 */
async function asApp(role, userId, sql, params) {
  if (!['anon', 'authenticated', 'service_role'].includes(role)) throw new Error(`asApp: unknown role ${role}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
  await db.exec(`set role ${role}`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false)`);
  }
}

/**
 * Passes when `fn` is refused for exactly this reason (D14-09): `expected` is the whole error
 * message (our own codes such as 'not_allowed', or Postgres's 'permission denied for table x',
 * 'new row violates row-level security policy for table "x"'), or a RegExp for it. A refusal for
 * another reason fails, so a check cannot pass behind some other rule's error.
 */
async function refusesWith(name, expected, fn) {
  try {
    await fn();
    check(name, false, 'was allowed');
  } catch (error) {
    const ok = expected instanceof RegExp ? expected.test(error.message) : error.message === expected;
    check(name, ok, ok ? error.message : `refused for another reason: ${error.message}; expected ${expected}`);
  }
}

/** Creates a login the way Supabase Auth does; returns its id. */
async function signUp(email, confirmed) {
  const [row] = await asOwner(
    `insert into auth.users (email, email_confirmed_at) values ('${email}', ${confirmed ? 'now()' : 'null'}) returning id`,
  );
  return row.id;
}

const roleOf = async (id) => (await asOwner(`select role from profiles where id = '${id}'`))[0].role;
const linkOf = async (email) =>
  (await asOwner(`select profile_id from students where lower(email) = lower('${email}')`))[0].profile_id;

// ---------------------------------------------------------------- set up
await db.exec(supabaseImitation);
const migrations = readdirSync(new URL('migrations/', supabaseDir)).filter((f) => f.endsWith('.sql')).sort();
// Announcements that exist before the push migration runs: it must stamp the published one as
// notified (so it is never pushed as old news) and leave the scheduled one to be pushed later.
let beforePush = null;
for (const file of migrations) {
  let sql = readFileSync(new URL(`migrations/${file}`, supabaseDir), 'utf8');
  sql = sql.replace('create extension if not exists pg_cron;', ''); // imitated above
  if (file.includes('push_notifications')) {
    const [published] = await asOwner(`insert into announcements (title, body, audience) values ('Old news', 'x', 'all') returning id`);
    const [later] = await asOwner(`insert into announcements (title, body, audience, publish_at)
      values ('Still to come', 'x', 'all', now() + interval '1 day') returning id`);
    beforePush = { published: published.id, later: later.id };
  }
  await db.exec(sql);
  console.log(`ran   migrations/${file}`);
}
if (beforePush) {
  const stamps = await asOwner(`select id, notified_at from announcements where id in (${beforePush.published}, ${beforePush.later})`);
  const stamp = (id) => stamps.find((r) => r.id === id)?.notified_at ?? null;
  const [{ n: auditRows }] = await asOwner(`select count(*)::int as n from audit_log where table_name = 'announcements'`);
  check('the push migration marks announcements already published as notified', stamp(beforePush.published) !== null);
  check('... leaves a scheduled one waiting for its notification', stamp(beforePush.later) === null);
  check('... and writes nothing to the audit log', auditRows === 0, String(auditRows));
  // Removed again so the checks below see only their own announcements.
  await asOwner(`delete from announcements where id in (${beforePush.published}, ${beforePush.later})`);
  await asOwner(`delete from audit_log where table_name = 'announcements'`);
}
const seedSql = readFileSync(new URL('seed.sql', supabaseDir), 'utf8');
await db.exec(seedSql);
console.log('ran   seed.sql\n');
{ // FS1b-02: a second run (or a run on the live project) is refused before it changes anything.
  const counts = async () => (await asOwner(`select (select count(*) from students)::int as s,
    (select count(*) from announcements)::int as a, (select count(*) from syllabus_items)::int as i`))[0];
  const before = await counts();
  let refused = '';
  try { await db.exec(seedSql); } catch (e) { refused = String(e.message); }
  try { await db.exec('rollback'); } catch { /* no transaction left open */ }
  const after = await counts();
  check('seed.sql refuses a project that already has students or announcements', refused.includes('seed.sql refused'), refused);
  check('... and changes nothing', JSON.stringify(before) === JSON.stringify(after), `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);

  // D10-11: the seed clean-up in docs/OPERATIONS.md (read from the doc, so the two cannot drift).
  const ops = readFileSync(new URL('../docs/OPERATIONS.md', supabaseDir), 'utf8');
  const cleanup = ops.match(/```sql\r?\n(\s*-- Seed clean-up \(guarded\)[\s\S]*?)```/)?.[1];
  check('OPERATIONS.md holds the guarded seed clean-up', !!cleanup);
  const [real] = await asOwner(`insert into announcements (title, body, audience) values ('Real notice', 'x', 'all') returning id`);
  let cleanupRefused = '';
  try { await db.exec(cleanup); } catch (e) { cleanupRefused = String(e.message); }
  await asOwner(`delete from announcements where id = ${real.id}`);
  const kept = await counts();
  check('the seed clean-up refuses when a record is not the seed\'s, and deletes nothing',
    cleanupRefused.includes('clean-up refused') && JSON.stringify(kept) === JSON.stringify(before), `${cleanupRefused} ${JSON.stringify(kept)}`);
  await db.exec('begin');
  let cleaned = null;
  try {
    await db.exec(cleanup);
    cleaned = await counts();
  } catch (e) { cleaned = String(e.message); }
  await db.exec('rollback');
  check('... on seed data alone it removes students, announcements and syllabus (tried, then rolled back)',
    JSON.stringify(cleaned) === JSON.stringify({ s: 0, a: 0, i: 0 }), JSON.stringify(cleaned));
  check('... and the rollback restored the seed', JSON.stringify(await counts()) === JSON.stringify(before));
}

// ---------------------------------------------------------------- first Guru and staff
const guru = await signUp('guru@example.com', true);
await asOwner(`update profiles set role = 'guru' where id = '${guru}'`);
check('dashboard can make the first Guru', (await roleOf(guru)) === 'guru');
const coordinator = await signUp('coordinator@example.com', true);
await asApp('authenticated', guru, `update profiles set role = 'coordinator' where id = '${coordinator}'`);
check('Guru can make a coordinator', (await roleOf(coordinator)) === 'coordinator');

// ---------------------------------------------------------------- linking a login to a student
const arjun = await signUp('Arjun.Rao@example.com', false);
check('unconfirmed sign-up stays pending', (await roleOf(arjun)) === 'pending');
check('unconfirmed sign-up is not linked', (await linkOf('arjun.rao@example.com')) === null);
await asOwner(`update auth.users set email_confirmed_at = now() where id = '${arjun}'`);
check('confirming the email makes a student', (await roleOf(arjun)) === 'student');
check('confirming the email links the record', (await linkOf('arjun.rao@example.com')) === arjun);

const meera = await signUp('meera.iyer@example.com', true);
check('already-confirmed sign-up is linked at once', (await linkOf('meera.iyer@example.com')) === meera);

const late = await signUp('late.joiner@example.com', true);
const [registered] = await asApp('authenticated', coordinator,
  `insert into students (full_name, dob, level_id) values ('Late Joiner', '1994-04-04', 1) returning id, roll_no`);
check('registering a student issues a roll number', /^MS-\d{4}-\d{4}$/.test(registered.roll_no), registered.roll_no);
await asApp('authenticated', coordinator,
  `update students set email = 'late.joiner@example.com' where id = $1`, [registered.id]);
check('email added to the record later links the login', (await linkOf('late.joiner@example.com')) === late);
check('... and makes it a student', (await roleOf(late)) === 'student');

await asApp('authenticated', guru, `insert into students (full_name, dob, email) values ('Staff Too', '1980-08-08', 'coordinator@example.com')`);
check('a coordinator\'s email on a student record keeps them coordinator', (await roleOf(coordinator)) === 'coordinator');

// ---------------------------------------------------------------- registering a student (0003)
/** Calls register_student with named arguments, as the app does. Returns its result. */
async function register(userId, fields) {
  const names = Object.keys(fields);
  const sql = `select register_student(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`;
  const [row] = await asApp('authenticated', userId, sql, Object.values(fields));
  return row.r;
}
const year = new Date().getUTCFullYear();
const childDob = `${year - 10}-06-15`;

const adult = await register(coordinator, { p_full_name: 'Adult Learner', p_dob: '1990-01-01', p_level: 1 });
check('coordinator registers an adult', /^MS-\d{4}-\d{4}$/.test(adult.roll_no), adult.roll_no);
await refusesWith('minor without a guardian is refused', 'minor_needs_guardian', () =>
  register(coordinator, { p_full_name: 'Child One', p_dob: childDob }));
await refusesWith('minor without an ID check is refused', 'minor_needs_id_check', () =>
  register(coordinator, { p_full_name: 'Child One', p_dob: childDob,
    p_guardian_name: 'Parent One', p_guardian_phone: '9876543210' }));
const child = await register(coordinator, {
  p_full_name: 'Child One', p_dob: childDob, p_guardian_name: 'Parent One',
  p_guardian_phone: '9876543210', p_guardian_relation: 'mother', p_id_type_checked: 'aadhaar',
  p_photo_consent: true, p_written_consent: true });
const consents = await asOwner(`select scope from consents where student_id = '${child.id}' order by scope`);
const guardians = await asOwner(`select full_name from guardians where student_id = '${child.id}'`);
check('minor saved with guardian and consents', guardians.length === 1 &&
  consents.map((c) => c.scope).join(',') === 'data,photo', consents.map((c) => c.scope).join(','));
await refusesWith('a minor added without consent is refused at commit', 'minor_needs_consent', () =>
  asApp('authenticated', guru, `insert into students (full_name, dob) values ('Child Two', '${childDob}')`));
await refusesWith('a student cannot register students', 'not_allowed', () =>
  register(arjun, { p_full_name: 'Someone', p_dob: '1990-01-01' }));
await refusesWith('anon cannot run register_student', 'permission denied for function register_student', () =>
  asApp('anon', null, `select register_student(p_full_name => 'X', p_dob => null, p_phone => null,
    p_email => null, p_area => null, p_pincode => null, p_level => 1::smallint, p_mentor => null)`));
await signUp('new.face@example.com', true);
await refusesWith('registering without a date of birth is refused', 'dob_required', () =>
  register(coordinator, { p_full_name: 'No Birthday' }));
const linked = await register(coordinator,
  { p_full_name: 'New Face', p_dob: '1995-05-05', p_email: 'New.Face@example.com' });
check('registering with a signed-up email links the login', linked.linked === true);

// ---------------------------------------------------------------- profile guard
await refusesWith('student cannot change their own role', 'not_own_role', () =>
  asApp('authenticated', arjun, `update profiles set role = 'guru' where id = '${arjun}'`));
const [language] = await asApp('authenticated', arjun,
  `update profiles set language = 'te' where id = '${arjun}' returning language`);
check('student can change their own language', language?.language === 'te');

// ---------------------------------------------------------------- who may run functions
await refusesWith('anon cannot run close_open_visits', 'permission denied for function close_open_visits', () => asApp('anon', null, 'select close_open_visits()'));
await refusesWith('signed-in user cannot run close_open_visits', 'permission denied for function close_open_visits', () =>
  asApp('authenticated', arjun, 'select close_open_visits()'));
await refusesWith('signed-in user cannot run refresh_student_statuses', 'permission denied for function refresh_student_statuses', () =>
  asApp('authenticated', arjun, 'select refresh_student_statuses()'));
await refusesWith('signed-in user cannot run link_login_to_student', 'permission denied for function link_login_to_student', () =>
  asApp('authenticated', arjun, `select link_login_to_student('${arjun}', 'divya.m@example.com')`));
await refusesWith('anon cannot run toggle_visit', 'permission denied for function toggle_visit', () =>
  asApp('anon', null, `select toggle_visit('${registered.id}', 'manual')`));
await refusesWith('student cannot run toggle_visit', 'not_allowed', () =>
  asApp('authenticated', arjun, `select toggle_visit('${registered.id}', 'manual')`));
const [visit] = await asApp('authenticated', coordinator,
  `select toggle_visit($1, 'manual') as result`, [registered.id]);
check('coordinator can check a student in', visit.result.action === 'in');

// ---------------------------------------------------------------- attendance (0004)
/** Calls mark_visit as the coordinator; returns the action it reports. */
async function mark(studentId, action) {
  const [row] = await asApp('authenticated', coordinator,
    `select mark_visit($1, $2) as r`, [studentId, action]);
  return row.r.action;
}
check('tapping "in" for a student already in changes nothing', (await mark(registered.id, 'in')) === 'already_in');
check('tapping "out" checks the student out', (await mark(registered.id, 'out')) === 'out');
check('tapping "out" again changes nothing', (await mark(registered.id, 'out')) === 'already_out');
check('tapping "in" checks the student in', (await mark(registered.id, 'in')) === 'in');
await refusesWith('mark_visit refuses an action other than in / out', 'bad_action', () => mark(registered.id, 'sideways'));
await refusesWith('student cannot run mark_visit', 'not_allowed', () =>
  asApp('authenticated', arjun, `select mark_visit('${registered.id}', 'in')`));
await refusesWith('anon cannot run mark_visit', 'permission denied for function mark_visit', () =>
  asApp('anon', null, `select mark_visit('${registered.id}', 'in')`));

const [{ qr_token: qrToken }] = await asOwner(`select qr_token from students where id = '${registered.id}'`);
// D5-11 (0030): a scan within 30 seconds of the check-in does not check out.
const [rescan] = await asApp('authenticated', coordinator, `select scan_qr($1) as r`, [qrToken]);
check('D5-11: a QR scan within 30 seconds of the check-in answers already_in', rescan.r.action === 'already_in', rescan.r.action);
const [{ n: stillIn }] = await asOwner(`select count(*)::int as n from visits where student_id = '${registered.id}' and check_out is null`);
check('... and the visit stays open', stillIn === 1);
await asOwner(`update visits set check_in = check_in - interval '1 minute' where student_id = '${registered.id}' and check_out is null`);
const [scanned] = await asApp('authenticated', coordinator, `select scan_qr($1) as r`, [qrToken]);
check('scanning the QR of a student who is in checks them out', scanned.r.action === 'out');
const [unknown] = await asApp('authenticated', coordinator,
  `select scan_qr('00000000-0000-4000-8000-000000000000') as r`);
check('an unknown QR code is reported as unknown', unknown.r.action === 'unknown');

// Two students in today, and one visit left open from three days ago (nightly job missed).
await mark(registered.id, 'in');
await mark(adult.id, 'in');
await asOwner(`insert into visits (student_id, check_in, method)
  values ('${child.id}', ((today_ist() - 3) + time '16:00') at time zone 'Asia/Kolkata', 'manual')`);
await refusesWith('student cannot run check_out_all', 'not_allowed', () =>
  asApp('authenticated', arjun, 'select check_out_all()'));
await refusesWith('anon cannot run check_out_all', 'permission denied for function check_out_all', () => asApp('anon', null, 'select check_out_all()'));
const [closedAll] = await asApp('authenticated', coordinator, 'select check_out_all() as n');
const stillOpen = await asOwner('select id from visits where check_out is null');
check('check_out_all closes every open visit', closedAll.n === 3 && stillOpen.length === 0, `closed ${closedAll.n}`);
const [stale] = await asOwner(`select (check_out at time zone 'Asia/Kolkata')::time::text as out_at
  from visits where student_id = '${child.id}' order by check_in desc limit 1`);
check('... an old open visit ends at that day\'s closing time', stale.out_at === '20:00:00', stale.out_at);

// ---------------------------------------------------------------- student overview (0005)
const [{ n: studentCount }] = await asOwner('select count(*)::int as n from students');
const overviewForStaff = await asApp('authenticated', coordinator, 'select id from student_overview');
check('coordinator sees every student in student_overview', overviewForStaff.length === studentCount,
  `${overviewForStaff.length} of ${studentCount}`);
const overviewForStudent = await asApp('authenticated', arjun, 'select full_name from student_overview');
check('student sees only their own row in student_overview',
  overviewForStudent.length === 1 && overviewForStudent[0].full_name === 'Arjun Rao');
await refusesWith('anon cannot read student_overview', 'permission denied for view student_overview', () => asApp('anon', null, 'select id from student_overview'));
await refusesWith('student_overview cannot be written to', 'cannot update view "student_overview"', () =>
  asApp('authenticated', guru, `update student_overview set full_name = 'X'`));

/** The student_overview row of a seeded student, read as the coordinator. */
async function overviewOf(fullName) {
  const [row] = await asApp('authenticated', coordinator,
    'select id, days_since_visit, last_visit_at, here_now from student_overview where full_name = $1', [fullName]);
  return row;
}
const divya = await overviewOf('Divya Menon'); // irregular: last visits 20 and 24 days ago (seed)
check('days_since_visit counts from the last visit', divya.days_since_visit === 20, String(divya.days_since_visit));
const vikram = await overviewOf('Vikram Joshi'); // new, never visited, joined 2026-09-22
const [{ d: sinceJoining }] = await asOwner(`select today_ist() - date '2026-09-22' as d`);
check('... or from joining when there is no visit', vikram.last_visit_at === null && vikram.days_since_visit === sinceJoining,
  String(vikram.days_since_visit));
await mark(adult.id, 'in');
check('here_now is true while checked in', (await overviewOf('Adult Learner')).here_now === true);
await mark(adult.id, 'out');
check('... and false after checking out', (await overviewOf('Adult Learner')).here_now === false);

// ---------------------------------------------------------------- follow-up calls (0005 log_call)
/** Calls log_call as `userId` with named arguments, as the app does; returns the call log id. */
async function logCall(userId, fields) {
  const names = Object.keys(fields);
  const sql = `select log_call(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as id`;
  const [row] = await asApp('authenticated', userId, sql, Object.values(fields));
  return row.id;
}
const statusOf = async (id) =>
  (await asOwner(`select status, paused_until::text from students where id = '${id}'`))[0];
const inAMonth = (await asOwner(`select (today_ist() + 30)::text as d`))[0].d;
const yesterday = (await asOwner(`select (today_ist() - 1)::text as d`))[0].d;

const reasons = (await asOwner(`select value from settings where key = 'call_reasons'`))[0].value;
check('call reasons are stored as codes', reasons.includes('studies') && !reasons.includes('Studies/exams'),
  reasons.join(','));

await refusesWith('log_call needs a comment', 'comment_required', () =>
  logCall(coordinator, { p_student: divya.id, p_outcome: 'paused', p_reason: 'studies', p_comment: '  ', p_next_date: inAMonth }));
await refusesWith('log_call needs a reason', 'reason_required', () =>
  logCall(coordinator, { p_student: divya.id, p_outcome: 'paused', p_reason: null, p_comment: 'Exams', p_next_date: inAMonth }));
await refusesWith('log_call refuses a reason not in the settings list', 'reason_unknown', () =>
  logCall(coordinator, { p_student: divya.id, p_outcome: 'paused', p_reason: 'Studies/exams', p_comment: 'Exams', p_next_date: inAMonth }));
await refusesWith('a pause needs its end date', 'next_date_required', () =>
  logCall(coordinator, { p_student: divya.id, p_outcome: 'paused', p_reason: 'studies', p_comment: 'Exams', p_next_date: null }));
await refusesWith('a pause cannot end in the past', 'next_date_past', () =>
  logCall(coordinator, { p_student: divya.id, p_outcome: 'paused', p_reason: 'studies', p_comment: 'Exams', p_next_date: yesterday }));
await refusesWith('log_call refuses an unknown student', 'student_not_found', () =>
  logCall(coordinator, { p_student: '00000000-0000-4000-8000-000000000000', p_outcome: 'not_reachable', p_reason: null, p_comment: 'No answer' }));
await refusesWith('a student cannot log a call', 'not_allowed', () =>
  logCall(arjun, { p_student: divya.id, p_outcome: 'not_reachable', p_reason: null, p_comment: 'No answer' }));
await refusesWith('anon cannot run log_call', 'permission denied for function log_call', () =>
  asApp('anon', null, `select log_call('${divya.id}', 'not_reachable', null, 'No answer')`));
await refusesWith('a call log cannot be written directly, only through log_call', 'new row violates row-level security policy for table "call_logs"', () =>
  asApp('authenticated', coordinator, `insert into call_logs (student_id, outcome, comment) values ('${divya.id}', 'not_reachable', 'x')`));
await refusesWith('status paused cannot be set by a plain edit', 'status paused can only be set by logging a call', () =>
  asApp('authenticated', coordinator, `update students set status = 'paused' where id = '${divya.id}'`));

await logCall(coordinator, { p_student: divya.id, p_outcome: 'paused', p_reason: 'studies', p_comment: 'Exams till next month', p_next_date: inAMonth });
const paused = await statusOf(divya.id);
check('a "paused" call pauses the student until the date', paused.status === 'paused' && paused.paused_until === inAMonth,
  `${paused.status} ${paused.paused_until}`);
const openTasks = await asOwner(`select id from follow_up_tasks where student_id = '${divya.id}' and done_at is null`);
check('... and closes their open follow-up task', openTasks.length === 0);

const harish = await overviewOf('Harish Kumar'); // inactive (seed)
await logCall(coordinator, { p_student: harish.id, p_outcome: 'discontinued', p_reason: 'moved', p_comment: 'Moved to Pune' });
check('a "discontinued" call marks the student as left', (await statusOf(harish.id)).status === 'left');

const suresh = await overviewOf('Suresh Naidu'); // irregular (seed)
for (let i = 0; i < 3; i++) {
  await logCall(coordinator, { p_student: suresh.id, p_outcome: 'not_reachable', p_reason: null, p_comment: `No answer ${i + 1}` });
}
const [retry] = await asOwner(`select attempt, escalated from follow_up_tasks
  where student_id = '${suresh.id}' and done_at is null`);
check('the third failed try escalates the retry task to the Guru', retry?.escalated === true && retry.attempt === 4,
  JSON.stringify(retry));
await logCall(coordinator, { p_student: suresh.id, p_outcome: 'returning', p_reason: 'work_timing', p_comment: 'Will come on Sunday', p_next_date: inAMonth });
const [again] = await asOwner(`select kind, due_on::text, escalated from follow_up_tasks
  where student_id = '${suresh.id}' and done_at is null`);
const [{ d: dayAfter }] = await asOwner(`select (date '${inAMonth}' + 1)::text as d`);
check('a "returning" call sets a new call for the day after the date', again?.kind === 'call' && again.due_on === dayAfter
  && again.escalated === false, JSON.stringify(again));
// Since 0034 the timeline is read through get_call_notes (logged), not from the table.
const [{ n: callCount }] = await asApp('authenticated', coordinator,
  `select count(*)::int as n from get_call_notes('${suresh.id}')`);
check('coordinator reads the call-log timeline', callCount === 4, String(callCount));
check('student cannot read call logs',
  (await asApp('authenticated', arjun, 'select id from call_logs')).length === 0);

// ---------------------------------------------------------------- syllabus tick-off (0006)
// `registered` (Late Joiner, Beginner) has the login `late`; arjun is a different student.
const [item1, item2] = await asOwner(`select id from syllabus_items where level_id = 1 order by sort limit 2`);
const progressOf = async (itemId) => (await asOwner(`select done_on::text, ticked_by, remark from student_progress
  where student_id = '${registered.id}' and item_id = ${itemId}`))[0];
const auditOf = async (itemId) => (await asOwner(`select action from audit_log
  where table_name = 'student_progress' and row_id = '${registered.id}/${itemId}' order by id`)).map((r) => r.action);

await asApp('authenticated', coordinator,
  `insert into student_progress (student_id, item_id, ticked_by, remark) values ($1, $2, $3, '  Steady tempo  ')`,
  [registered.id, item1.id, guru]);
const tick = await progressOf(item1.id);
check('a tick records the coordinator who made it, not the one the app sent', tick?.ticked_by === coordinator,
  tick?.ticked_by);
check('... dated today, with the remark trimmed', tick?.done_on === (await asOwner(`select today_ist()::text as d`))[0].d
  && tick.remark === 'Steady tempo', JSON.stringify(tick));
await refusesWith('a tick cannot be dated in the future', 'done_on_future', () =>
  asApp('authenticated', coordinator, `insert into student_progress (student_id, item_id, done_on)
    values ($1, $2, today_ist() + 1)`, [registered.id, item2.id]));
await refusesWith('a remark is at most 500 characters', 'remark_too_long', () =>
  asApp('authenticated', coordinator, `update student_progress set remark = repeat('a', 501)
    where student_id = $1 and item_id = $2`, [registered.id, item1.id]));
await asApp('authenticated', coordinator, `update student_progress set remark = '   '
  where student_id = $1 and item_id = $2`, [registered.id, item1.id]);
check('an empty remark is saved as none', (await progressOf(item1.id)).remark === null);
await refusesWith('the date of a tick cannot be changed', 'progress_frozen', () =>
  asApp('authenticated', coordinator, `update student_progress set done_on = today_ist() - 3
    where student_id = $1 and item_id = $2`, [registered.id, item1.id]));
await refusesWith('who ticked cannot be changed', 'progress_frozen', () =>
  asApp('authenticated', guru, `update student_progress set ticked_by = $3
    where student_id = $1 and item_id = $2`, [registered.id, item1.id, guru]));
await refusesWith('a student cannot tick their own syllabus', 'new row violates row-level security policy for table "student_progress"', () =>
  asApp('authenticated', late, `insert into student_progress (student_id, item_id) values ($1, $2)`,
    [registered.id, item2.id]));
check('a student reads their own ticks',
  (await asApp('authenticated', late, 'select item_id from student_progress')).length === 1);
check('... and nobody else\'s', (await asApp('authenticated', arjun,
  `select item_id from student_progress where student_id = '${registered.id}'`)).length === 0);
const unticked = await asApp('authenticated', late,
  `delete from student_progress where student_id = $1 returning item_id`, [registered.id]);
check('a student cannot untick', unticked.length === 0 && (await progressOf(item1.id)) !== undefined);
await asApp('authenticated', coordinator, `delete from student_progress where student_id = $1 and item_id = $2`,
  [registered.id, item1.id]);
const trail = await auditOf(item1.id);
check('tick, remark change and untick are kept in the audit log',
  trail.join(',') === 'INSERT,UPDATE,DELETE', trail.join(','));
const [{ ok: guardCallable }] = await asOwner(`select has_function_privilege('authenticated',
  'guard_student_progress()', 'execute') or has_function_privilege('authenticated',
  'audit_student_progress()', 'execute') as ok`);
check('app roles cannot run the syllabus trigger functions', guardCallable === false);

// ---------------------------------------------------------------- announcements (0007)
// Logins so far: arjun (Arjun Rao, level 3), meera (Meera Iyer, level 2), late (Late Joiner,
// level 1) and New Face (level 1) are students. Meera becomes the coordinator's mentee, Late
// Joiner joins a group, and a second coordinator and a still-pending login are added.
const coordinator2 = await signUp('coordinator2@example.com', true);
await asApp('authenticated', guru, `update profiles set role = 'coordinator' where id = '${coordinator2}'`);
const pendingLogin = await signUp('just.signed.up@example.com', true);
await asOwner(`update students set mentor_id = '${coordinator}' where profile_id = '${meera}'`);
const [{ id: harinamGroup }] = await asOwner(`select id from groups where name = 'Sunday Harinam'`);
await asOwner(`insert into group_members (group_id, profile_id) values (${harinamGroup}, '${late}')`);

/** Posts an announcement as `userId`; returns the saved row. */
async function post(userId, fields) {
  const names = Object.keys(fields);
  const [row] = await asApp('authenticated', userId,
    `insert into announcements (${names.join(', ')}) values (${names.map((_, i) => `$${i + 1}`).join(', ')})
     returning id, title, audience_level, audience_group, created_by`, Object.values(fields));
  return row;
}
const toAll = await post(coordinator, { title: '  Kirtan on Sunday  ', body: 'Meet at 16:00.\n', audience: 'all', created_by: guru });
check('an announcement records its real author, not the one the app sent', toAll.created_by === coordinator, toAll.created_by);
check('... with the title trimmed', toAll.title === 'Kirtan on Sunday', toAll.title);
await refusesWith('audience "level" needs a level', 'level_required', () =>
  post(coordinator, { title: 'T', body: 'B', audience: 'level' }));
await refusesWith('audience "group" needs a group', 'group_required', () =>
  post(coordinator, { title: 'T', body: 'B', audience: 'group' }));
await refusesWith('an announcement needs a title', 'title_required', () =>
  post(coordinator, { title: ' \n ', body: 'B', audience: 'all' }));
await refusesWith('the text is at most 4000 characters', 'body_too_long', () =>
  post(coordinator, { title: 'T', body: 'a'.repeat(4001), audience: 'all' }));
await refusesWith('a student cannot post an announcement', 'new row violates row-level security policy for table "announcements"', () =>
  post(arjun, { title: 'T', body: 'B', audience: 'all' }));
const toStaff = await post(coordinator, { title: 'Staff meeting', body: 'After class.', audience: 'staff', audience_level: 2 });
check('a level given with another audience is dropped', toStaff.audience_level === null);
const toLevel3 = await post(coordinator, { title: 'Advanced practice', body: 'Tihais.', audience: 'level', audience_level: 3 });
const toLevel1 = await post(coordinator, { title: 'Beginners', body: 'Bring your khol.', audience: 'level', audience_level: 1 });
const toMentees = await post(coordinator, { title: 'My mentees', body: 'Call me.', audience: 'mentees' });
const toGroup = await post(coordinator2, { title: 'Harinam team', body: 'Sunday 17:00.', audience: 'group', audience_group: harinamGroup });
const [scheduled] = await asApp('authenticated', coordinator,
  `insert into announcements (title, body, audience, publish_at) values ('Later', 'Tomorrow.', 'all', now() + interval '1 day')
   returning id`);

/** Titles of the announcements `userId` can see, sorted. */
const visibleTo = async (userId) =>
  (await asApp('authenticated', userId, 'select title from announcements order by title')).map((r) => r.title).join(', ');
check('a level-3 student sees "all" and level 3 only', (await visibleTo(arjun)) ===
  'Advanced practice, Kirtan on Sunday, Welcome to Mridanga Seva', await visibleTo(arjun));
check('a mentee sees their mentor\'s "my mentees" announcement', (await visibleTo(meera)) ===
  'Kirtan on Sunday, My mentees, Welcome to Mridanga Seva', await visibleTo(meera));
check('a group member sees the group\'s announcement', (await visibleTo(late)) ===
  'Beginners, Harinam team, Kirtan on Sunday, Welcome to Mridanga Seva', await visibleTo(late));
check('a pending login sees no announcements', (await visibleTo(pendingLogin)) === '');
check('staff see every announcement, scheduled ones too',
  (await asApp('authenticated', coordinator2, 'select id from announcements')).length === 8);

// Read receipts
await asApp('authenticated', arjun, 'insert into announcement_reads (announcement_id) values ($1)', [toAll.id]);
const [receipt] = await asOwner(`select profile_id, read_at from announcement_reads where announcement_id = ${toAll.id}`);
check('opening an announcement saves a read receipt for the reader', receipt?.profile_id === arjun && receipt.read_at !== null);
await refusesWith('a second receipt for the same announcement is refused (the app ignores it)', 'duplicate key value violates unique constraint "announcement_reads_pkey"', () =>
  asApp('authenticated', arjun, 'insert into announcement_reads (announcement_id) values ($1)', [toAll.id]));
await refusesWith('a receipt for an announcement not addressed to the student is refused', 'new row violates row-level security policy for table "announcement_reads"', () =>
  asApp('authenticated', arjun, 'insert into announcement_reads (announcement_id) values ($1)', [toLevel1.id]));
await refusesWith('a receipt for a scheduled announcement is refused', 'new row violates row-level security policy for table "announcement_reads"', () =>
  asApp('authenticated', arjun, 'insert into announcement_reads (announcement_id) values ($1)', [scheduled.id]));
await refusesWith('a receipt cannot be written in someone else\'s name', 'permission denied for table announcement_reads', () =>
  asApp('authenticated', arjun, 'insert into announcement_reads (announcement_id, profile_id) values ($1, $2)',
    [toAll.id, meera]));
await refusesWith('a receipt cannot be removed from the app', 'permission denied for table announcement_reads', () =>
  asApp('authenticated', arjun, 'delete from announcement_reads where announcement_id = $1', [toAll.id]));

// Seen by N of M
/** The announcement_seen row of one announcement, read as `userId`. */
const seenOf = async (userId, id) =>
  (await asApp('authenticated', userId, 'select addressed, seen, no_login from announcement_seen where announcement_id = $1', [id]))[0];
const [{ n: studentLogins }] = await asOwner(`select count(*)::int as n from profiles where role = 'student' and active`);
const [{ n: noLogin }] = await asOwner(`select count(*)::int as n from students where profile_id is null and status <> 'left'`);
const allSeen = await seenOf(coordinator, toAll.id);
check('"seen by" for "all" counts every student login, and who opened it',
  allSeen.addressed === studentLogins && allSeen.seen === 1 && allSeen.no_login === noLogin, JSON.stringify(allSeen));
await asApp('authenticated', arjun, 'insert into announcement_reads (announcement_id) values ($1)', [toLevel3.id]);
const levelSeen = await seenOf(coordinator, toLevel3.id);
check('... for a level, only that level\'s logins', levelSeen.addressed === 1 && levelSeen.seen === 1, JSON.stringify(levelSeen));
const staffSeen = await seenOf(coordinator, toStaff.id);
check('... for staff, the Guru and coordinators except the author', staffSeen.addressed === 2 && staffSeen.no_login === 0,
  JSON.stringify(staffSeen));
check('... for a group, its members', (await seenOf(coordinator, toGroup.id)).addressed === 1);
const notSeen = (await asApp('authenticated', coordinator,
  'select full_name from announcement_audience where announcement_id = $1 and read_at is null order by full_name', [toAll.id]))
  .map((r) => r.full_name);
check('the not-seen list names who has not opened it', notSeen.includes('Meera Iyer') && !notSeen.includes('Arjun Rao'),
  notSeen.join(', '));
check('a student sees only their own row in announcement_audience',
  (await asApp('authenticated', arjun, 'select profile_id from announcement_audience'))
    .every((r) => r.profile_id === arjun));
await refusesWith('anon cannot read announcement_seen', 'permission denied for view announcement_seen', () => asApp('anon', null, 'select * from announcement_seen'));

// Editing and deleting
const unpinnedByOther = await asApp('authenticated', coordinator2,
  'update announcements set pinned = true where id = $1 returning id', [toAll.id]);
check('a coordinator cannot pin another coordinator\'s announcement', unpinnedByOther.length === 0);
const pinned = await asApp('authenticated', coordinator,
  'update announcements set pinned = true where id = $1 returning pinned', [toAll.id]);
check('the author can pin it', pinned[0]?.pinned === true);
await refusesWith('the author of an announcement cannot be changed', 'announcement_frozen', () =>
  asApp('authenticated', guru, 'update announcements set created_by = $2 where id = $1', [toAll.id, guru]));
const deletedByOther = await asApp('authenticated', coordinator2,
  'delete from announcements where id = $1 returning id', [toAll.id]);
check('a coordinator cannot delete another coordinator\'s announcement', deletedByOther.length === 0);
check('a student cannot delete an announcement', (await asApp('authenticated', arjun,
  'delete from announcements where id = $1 returning id', [toAll.id])).length === 0);
const deletedByAuthor = await asApp('authenticated', coordinator,
  'delete from announcements where id = $1 returning id', [toAll.id]);
const receiptsLeft = await asOwner(`select 1 from announcement_reads where announcement_id = ${toAll.id}`);
check('the author can delete it, and its read receipts go with it', deletedByAuthor.length === 1 && receiptsLeft.length === 0);
const deletedByGuru = await asApp('authenticated', guru, 'delete from announcements where id = $1 returning id', [toGroup.id]);
check('the Guru can delete anyone\'s announcement', deletedByGuru.length === 1);
const announcementTrail = await asOwner(`select action from audit_log where table_name = 'announcements'
  and row_id = '${toAll.id}' order by id`);
check('pinning and deleting are kept in the audit log',
  announcementTrail.map((r) => r.action).join(',') === 'UPDATE,DELETE', announcementTrail.map((r) => r.action).join(','));
const [{ ok: announcementGuardCallable }] = await asOwner(`select has_function_privilege('authenticated',
  'guard_announcement()', 'execute') as ok`);
check('app roles cannot run the announcement trigger function', announcementGuardCallable === false);

// ---------------------------------------------------------------- announcement follow-ups (0008)
// Author names for students
const [{ n: staffCount }] = await asOwner(`select count(*)::int as n from profiles where role in ('guru', 'coordinator')`);
const namesForStudent = await asApp('authenticated', arjun, 'select * from staff_names()');
check('a student gets the name of every Guru and coordinator', namesForStudent.length === staffCount
  && namesForStudent.some((r) => r.id === coordinator), `${namesForStudent.length} of ${staffCount}`);
check('... and nothing but id and name', namesForStudent.every((r) => Object.keys(r).join(',') === 'id,full_name'),
  Object.keys(namesForStudent[0] ?? {}).join(','));
check('a pending login gets no staff names', (await asApp('authenticated', pendingLogin, 'select * from staff_names()')).length === 0);
await refusesWith('anon cannot run staff_names', 'permission denied for function staff_names', () => asApp('anon', null, 'select * from staff_names()'));

// Editing
/** The edit-related columns of one announcement, read as the owner. */
const editOf = async (id) => (await asOwner(`select title, edited_at, publish_at, publish_at <= now() as published
  from announcements where id = ${id}`))[0];
// Arjun opened toLevel3 above, so it has one read receipt.
await asApp('authenticated', coordinator, `update announcements set pinned = true where id = $1`, [toLevel3.id]);
check('pinning is not an edit', (await editOf(toLevel3.id)).edited_at === null);
await asApp('authenticated', coordinator, `update announcements set title = '  Advanced practice  ' where id = $1`, [toLevel3.id]);
check('saving the same title again (after trimming) is not an edit', (await editOf(toLevel3.id)).edited_at === null);
const edited = await asApp('authenticated', coordinator,
  `update announcements set title = 'Advanced practice: tihais', edited_at = null where id = $1 returning edited_at`, [toLevel3.id]);
check('editing a published announcement sets edited_at, whatever the app sent', edited[0]?.edited_at != null);
const [{ n: receiptsKept }] = await asOwner(`select count(*)::int as n from announcement_reads where announcement_id = ${toLevel3.id}`);
check('... and keeps its read receipts', receiptsKept === 1, String(receiptsKept));
const byOther = await asApp('authenticated', coordinator2,
  `update announcements set title = 'Hijacked' where id = $1 returning id`, [toLevel3.id]);
check('another coordinator cannot edit it', byOther.length === 0 && (await editOf(toLevel3.id)).title === 'Advanced practice: tihais');
const byGuru = await asApp('authenticated', guru,
  `update announcements set body = 'Tihais and chakradars.' where id = $1 returning id`, [toLevel3.id]);
check('the Guru can edit anyone\'s announcement', byGuru.length === 1);
await refusesWith('a published announcement keeps its publish time', 'already_published', () =>
  asApp('authenticated', coordinator, `update announcements set publish_at = now() + interval '1 day' where id = $1`, [toLevel3.id]));
await asApp('authenticated', coordinator, `update announcements set title = 'Later, changed' where id = $1`, [scheduled.id]);
check('editing a scheduled announcement is not "edited" (nobody has seen it)', (await editOf(scheduled.id)).edited_at === null);
await asApp('authenticated', coordinator, `update announcements set publish_at = now() - interval '3 days' where id = $1`, [scheduled.id]);
const movedToPast = await editOf(scheduled.id);
const [{ ok: notBackdated }] = await asOwner(`select publish_at > now() - interval '1 minute' as ok from announcements where id = ${scheduled.id}`);
check('a scheduled one moved into the past is published now, not backdated', movedToPast.published && notBackdated);
await refusesWith('audience "group" still needs its group when edited', 'group_required', () =>
  asApp('authenticated', coordinator, `update announcements set audience = 'group' where id = $1`, [toLevel1.id]));

// Groups
/** Creates a group as `userId`; returns the saved row. */
const makeGroup = async (userId, name, purpose = null) => (await asApp('authenticated', userId,
  'insert into groups (name, purpose, created_by) values ($1, $2, $3) returning id, name, purpose, created_by',
  [name, purpose, guru]))[0];
const festivalTeam = await makeGroup(coordinator, '  Rath Yatra team  ', '   ');
check('a coordinator creates a group, name trimmed, empty purpose saved as none',
  festivalTeam.name === 'Rath Yatra team' && festivalTeam.purpose === null, JSON.stringify(festivalTeam));
check('... recorded as made by them, not the one the app sent', festivalTeam.created_by === coordinator);
await refusesWith('a group name is unique whatever the capitals', 'duplicate key value violates unique constraint "groups_name_lower_key"', () => makeGroup(coordinator, 'rath yatra TEAM'));
await refusesWith('a group needs a name', 'group_name_required', () => makeGroup(coordinator, '  '));
await refusesWith('a group name is at most 60 characters', 'group_name_too_long', () => makeGroup(coordinator, 'g'.repeat(61)));
await refusesWith('a purpose is at most 200 characters', 'group_purpose_too_long', () => makeGroup(coordinator, 'Long', 'p'.repeat(201)));
await refusesWith('a student cannot create a group', 'new row violates row-level security policy for table "groups"', () => makeGroup(arjun, 'Students only'));
await asApp('authenticated', coordinator, 'insert into group_members (group_id, profile_id) values ($1, $2), ($1, $3)',
  [festivalTeam.id, arjun, coordinator2]);
const [summary] = await asApp('authenticated', coordinator, 'select members from group_summary where id = $1', [festivalTeam.id]);
check('group_summary counts the members', summary?.members === 2, JSON.stringify(summary));
check('a pending login sees no groups', (await asApp('authenticated', pendingLogin, 'select id from groups')).length === 0);
const groupsOfArjun = (await asApp('authenticated', arjun, 'select name from groups')).map((g) => g.name).join(', ');
check('a student sees only the groups they are in', groupsOfArjun === 'Rath Yatra team', groupsOfArjun);
await asApp('authenticated', coordinator2, 'update groups set active = false where id = $1', [festivalTeam.id]);
check('staff can switch a group off',
  (await asOwner(`select active from groups where id = ${festivalTeam.id}`))[0].active === false);
await asApp('authenticated', coordinator, 'delete from group_members where group_id = $1 and profile_id = $2',
  [festivalTeam.id, coordinator2]);
check('staff can remove a member', (await asApp('authenticated', coordinator,
  'select members from group_summary where id = $1', [festivalTeam.id]))[0].members === 1);

// Private replies
const [{ id: kirtan }] = await asApp('authenticated', coordinator,
  `insert into announcements (title, body, audience) values ('Kirtan practice', 'Bring kartals.', 'all') returning id`);
/** Sends a reply as `userId`; returns the saved row. */
const reply = async (userId, announcementId, body) => (await asApp('authenticated', userId,
  'insert into announcement_replies (announcement_id, body) values ($1, $2) returning id, profile_id, body',
  [announcementId, body]))[0];
const arjunReply = await reply(arjun, kirtan, '  I will bring mine.\n');
check('a student replies to an announcement addressed to them, trimmed', arjunReply?.profile_id === arjun
  && arjunReply.body === 'I will bring mine.', JSON.stringify(arjunReply));
await reply(meera, kirtan, 'Can I borrow a pair?');
await refusesWith('an empty reply is refused', 'reply_required', () => reply(arjun, kirtan, ' \n '));
await refusesWith('a reply is at most 1000 characters', 'reply_too_long', () => reply(arjun, kirtan, 'r'.repeat(1001)));
await refusesWith('a reply to an announcement not addressed to the student is refused', 'new row violates row-level security policy for table "announcement_replies"', () => reply(arjun, toLevel1.id, 'Hi'));
await refusesWith('a pending login cannot reply', 'new row violates row-level security policy for table "announcement_replies"', () => reply(pendingLogin, kirtan, 'Hi'));
await refusesWith('a reply cannot be written in someone else\'s name', 'permission denied for table announcement_replies', () =>
  asApp('authenticated', arjun, 'insert into announcement_replies (announcement_id, profile_id, body) values ($1, $2, $3)',
    [kirtan, meera, 'Fake']));
/** Bodies of the replies to `announcementId` that `userId` can read, sorted. */
const repliesSeenBy = async (userId, announcementId) => (await asApp('authenticated', userId,
  'select body from announcement_reply_list where announcement_id = $1 order by body', [announcementId]))
  .map((r) => r.body).join(' | ');
check('a student sees only their own replies', (await repliesSeenBy(arjun, kirtan)) === 'I will bring mine.',
  await repliesSeenBy(arjun, kirtan));
check('the author sees every reply to their announcement',
  (await repliesSeenBy(coordinator, kirtan)) === 'Can I borrow a pair? | I will bring mine.');
const [authorView] = await asApp('authenticated', coordinator,
  'select full_name, roll_no from announcement_reply_list where id = $1', [arjunReply.id]);
check('... with the student\'s name and roll number', authorView?.full_name === 'Arjun Rao' && /^MS-/.test(authorView.roll_no ?? ''),
  JSON.stringify(authorView));
check('another coordinator does not see them', (await repliesSeenBy(coordinator2, kirtan)) === '');
check('the Guru sees them', (await repliesSeenBy(guru, kirtan)).split(' | ').length === 2);
const [{ replies: authorCount }] = await asApp('authenticated', coordinator,
  'select replies from announcement_seen where announcement_id = $1', [kirtan]);
const [{ replies: otherCount }] = await asApp('authenticated', coordinator2,
  'select replies from announcement_seen where announcement_id = $1', [kirtan]);
check('announcement_seen counts the replies the reader may see', authorCount === 2 && otherCount === 0,
  `author ${authorCount}, other ${otherCount}`);
const [{ reloptions }] = await asOwner(`select reloptions from pg_class where relname = 'announcement_seen'`);
check('announcement_seen still reads as the person asking', String(reloptions).includes('security_invoker=true'), String(reloptions));
await refusesWith('a reply cannot be changed', 'permission denied for table announcement_replies', () =>
  asApp('authenticated', arjun, `update announcement_replies set body = 'Changed' where id = $1`, [arjunReply.id]));
check('the writer cannot delete a reply', (await asApp('authenticated', arjun,
  'delete from announcement_replies where id = $1 returning id', [arjunReply.id])).length === 0);
check('the author cannot delete a reply', (await asApp('authenticated', coordinator,
  'delete from announcement_replies where id = $1 returning id', [arjunReply.id])).length === 0);
check('the Guru can delete a reply', (await asApp('authenticated', guru,
  'delete from announcement_replies where id = $1 returning id', [arjunReply.id])).length === 1);
const replyTrail = await asOwner(`select action from audit_log where table_name = 'announcement_replies' and row_id = '${arjunReply.id}'`);
check('... and the audit log keeps it', replyTrail.map((r) => r.action).join(',') === 'DELETE');
await asApp('authenticated', coordinator, 'delete from announcements where id = $1', [kirtan]);
check('replies go with their announcement',
  (await asOwner(`select 1 from announcement_replies where announcement_id = ${kirtan}`)).length === 0);
const [{ ok: followUpGuardsCallable }] = await asOwner(`select has_function_privilege('authenticated', 'guard_group()', 'execute')
  or has_function_privilege('authenticated', 'guard_announcement_reply()', 'execute') as ok`);
check('app roles cannot run the group and reply trigger functions', followUpGuardsCallable === false);

// ---------------------------------------------------------------- home screens (0009)
const [{ monday, isodow, back }] = await asOwner(`select week_start_ist()::text as monday,
  extract(isodow from week_start_ist())::int as isodow, today_ist() - week_start_ist() as back`);
check('"this week" starts on a Monday, at most 6 days ago', isodow === 1 && back >= 0 && back <= 6, monday);

/** Runs one home-screen function as `userId`; returns its JSON result. */
async function homeOf(fn, userId) {
  const [row] = await asApp('authenticated', userId, `select ${fn}() as h`);
  return row.h;
}

// S1 student home
const [{ id: arjunId }] = await asOwner(`select id from students where profile_id = '${arjun}'`);
const weekVisitsOf = async (studentId) => (await asOwner(`select count(*)::int as n from visits
  where student_id = '${studentId}' and (check_in at time zone 'Asia/Kolkata')::date >= week_start_ist()`))[0].n;
const arjunBefore = await homeOf('student_home', arjun);
check('student_home gives the student their own name and level', arjunBefore?.full_name === 'Arjun Rao' && arjunBefore.level_id === 3,
  JSON.stringify(arjunBefore));
check('... visits this week counted from Monday', arjunBefore.visits_this_week === (await weekVisitsOf(arjunId)),
  String(arjunBefore.visits_this_week));
await mark(arjunId, 'in');
const arjunHere = await homeOf('student_home', arjun);
check('... a check-in now adds one visit this week and shows here now',
  arjunHere.visits_this_week === arjunBefore.visits_this_week + 1 && arjunHere.here_now === true && arjunHere.days_since_visit === 0);
await mark(arjunId, 'out');
const [arjunLevel] = await asOwner(`select
  (select count(*)::int from syllabus_items where level_id = 3) as total,
  (select count(*)::int from student_progress p join syllabus_items i on i.id = p.item_id
    where p.student_id = '${arjunId}' and i.level_id = 3) as done`);
check('... syllabus progress counts the current level only',
  arjunHere.syllabus_total === arjunLevel.total && arjunHere.syllabus_done === arjunLevel.done,
  `${arjunHere.syllabus_done} of ${arjunHere.syllabus_total}`);
check('student_home is empty for a login without a student record',
  (await homeOf('student_home', coordinator)) === null && (await homeOf('student_home', pendingLogin)) === null);
await refusesWith('anon cannot run student_home', 'permission denied for function student_home', () => asApp('anon', null, 'select student_home()'));

// C1 coordinator dashboard
await refusesWith('a student cannot open the coordinator dashboard', 'not_allowed', () => homeOf('coordinator_dashboard', arjun));
await refusesWith('a pending login cannot open it', 'not_allowed', () => homeOf('coordinator_dashboard', pendingLogin));
await refusesWith('anon cannot run coordinator_dashboard', 'permission denied for function coordinator_dashboard', () => asApp('anon', null, 'select coordinator_dashboard()'));
await mark(adult.id, 'in');
const [counts] = await asOwner(`select
  (select count(*)::int from visits where check_out is null) as here,
  (select count(*)::int from visits where (check_in at time zone 'Asia/Kolkata')::date = today_ist()) as today,
  (select count(*)::int from students where joined_on > today_ist() - 28 and status <> 'left') as joiners`);
const c1 = await homeOf('coordinator_dashboard', coordinator);
check('coordinator dashboard counts who is here now, as C6 does', c1.here_now === counts.here && c1.here_now >= 1, String(c1.here_now));
check('... and today\'s visits, as C5 does', c1.visits_today === counts.today, `${c1.visits_today} vs ${counts.today}`);
check('... and new joiners of the last 4 weeks (settings.new_joiner_weeks)',
  c1.new_joiner_weeks === 4 && c1.new_joiner_count === counts.joiners && c1.new_joiners.length === Math.min(counts.joiners, 50),
  `${c1.new_joiner_count} vs ${counts.joiners}`);
check('... a student registered today is listed as a new joiner, with their visits',
  c1.new_joiners.some((j) => j.full_name === 'Adult Learner' && j.visits >= 1 && /^MS-/.test(j.roll_no)));
await mark(adult.id, 'out');
// Calls due: a task for me due today counts; one due later, or for another coordinator, does not.
const [{ id: gayatriId }] = await asOwner(`select id from students where full_name = 'Gayatri Devi'`);
const [{ id: karthikId }] = await asOwner(`select id from students where full_name = 'Karthik Reddy'`);
const due2Before = (await homeOf('coordinator_dashboard', coordinator2)).my_calls_due;
await asOwner(`insert into follow_up_tasks (student_id, assignee_id, kind, due_on) values
  ('${gayatriId}', '${coordinator}', 'call', today_ist()),
  ('${karthikId}', '${coordinator}', 'call', today_ist() + 5)`);
const c1After = await homeOf('coordinator_dashboard', coordinator);
check('... a call task of mine due today adds one to my calls due, a later one does not',
  c1After.my_calls_due === c1.my_calls_due + 1, `${c1.my_calls_due} -> ${c1After.my_calls_due}`);
check('... another coordinator\'s calls due do not change',
  (await homeOf('coordinator_dashboard', coordinator2)).my_calls_due === due2Before);
check('the Guru can open the coordinator dashboard too', typeof (await homeOf('coordinator_dashboard', guru)).here_now === 'number');

// G1 Guru dashboard
await refusesWith('a coordinator cannot open the Guru dashboard', 'not_allowed', () => homeOf('guru_dashboard', coordinator));
await refusesWith('a student cannot open the Guru dashboard', 'not_allowed', () => homeOf('guru_dashboard', arjun));
await refusesWith('anon cannot run guru_dashboard', 'permission denied for function guru_dashboard', () => asApp('anon', null, 'select guru_dashboard()'));
const [{ id: bhaskarId }] = await asOwner(`select id from students where full_name = 'Bhaskar Murthy'`);
await asOwner(`insert into follow_up_tasks (student_id, assignee_id, kind, due_on, escalated) values
  ('${karthikId}', '${coordinator2}', 'call', today_ist() - 2, false),
  ('${bhaskarId}', '${coordinator2}', 'retry', today_ist() - 1, true)`);
const g1 = await homeOf('guru_dashboard', guru);
const [whole] = await asOwner(`select
  (select count(*)::int from students) as everyone,
  (select count(*)::int from students where status <> 'left') as in_class,
  (select count(distinct student_id)::int from visits
    where (check_in at time zone 'Asia/Kolkata')::date >= week_start_ist()) as came`);
check('Guru dashboard counts students who came this week, each once', g1.came_this_week === whole.came && g1.week_start === monday,
  `${g1.came_this_week} vs ${whole.came}`);
check('... students in class (not Left) and new joiners', g1.in_class === whole.in_class && g1.new_joiners === counts.joiners);
const sum = (rows) => rows.reduce((total, row) => total + row.students, 0);
check('... students per level: all three levels, adding up to the class',
  g1.by_level.map((l) => l.level_id).join() === '1,2,3' && sum(g1.by_level) === whole.in_class, JSON.stringify(g1.by_level));
check('... students per status: every status in order, adding up to everyone',
  g1.by_status.map((s) => s.status).join() === 'new,active,irregular,inactive,paused,left' && sum(g1.by_status) === whole.everyone,
  JSON.stringify(g1.by_status));
const [{ n: escalatedOpen }] = await asOwner(`select count(distinct (assignee_id, student_id))::int as n
  from follow_up_tasks where done_at is null and escalated`);
const [{ n: coordinatorOverdue }] = await asOwner(`select count(distinct student_id)::int as n from follow_up_tasks
  where done_at is null and not escalated and due_on < today_ist() and assignee_id = '${coordinator}'`);
const overdueOf = (id) => g1.follow_ups.find((f) => f.assignee_id === id)?.overdue ?? 0;
check('... overdue follow-ups per coordinator: a task past its date counts, one due today or later does not',
  overdueOf(coordinator2) === 1 && overdueOf(coordinator) === coordinatorOverdue, JSON.stringify(g1.follow_ups));
check('... escalated ones (handed to the Guru) are counted separately',
  g1.follow_ups.find((f) => f.assignee_id === coordinator2)?.escalated === 1 &&
    g1.follow_ups.reduce((total, f) => total + f.escalated, 0) === escalatedOpen, String(escalatedOpen));
const [{ definers, anonRuns }] = await asOwner(`select
  count(*) filter (where prosecdef)::int as definers,
  (has_function_privilege('anon', 'student_home()', 'execute') or has_function_privilege('anon', 'coordinator_dashboard()', 'execute')
    or has_function_privilege('anon', 'guru_dashboard()', 'execute') or has_function_privilege('anon', 'week_start_ist()', 'execute')) as "anonRuns"
  from pg_proc where proname in ('student_home', 'coordinator_dashboard', 'guru_dashboard', 'week_start_ist')`);
check('the home-screen functions read as the person asking (security invoker) and anon cannot run them',
  definers === 0 && anonRuns === false);

// ---------------------------------------------------------------- photos and PDFs (0010)
const [bucket] = await asOwner(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'announcement-files'`);
check('the announcement-files bucket is private, 5 MB, photos and PDFs only', bucket?.public === false
  && Number(bucket.file_size_limit) === 5242880 && bucket.allowed_mime_types.join(',') === 'image/jpeg,image/png,image/webp,application/pdf',
  JSON.stringify(bucket));

const newId = async () => (await asOwner('select gen_random_uuid() as id'))[0].id;
/** A file path in `userId`'s folder, as the app makes it. */
const filePath = async (userId, ext = 'jpg') => `${userId}/${await newId()}.${ext}`;
/** Uploads a file as `userId` the way the Storage API does (one storage.objects row). */
const upload = async (userId, path, size = 1234) => asApp('authenticated', userId,
  `insert into storage.objects (bucket_id, name, owner, metadata) values ('announcement-files', $1, auth.uid(), $2)`,
  [path, JSON.stringify({ size, mimetype: path.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg' })]);
/** Whether `userId` (or anon when null) can see a file, i.e. make a signed link to it. */
const canOpen = async (userId, path) => (await asApp(userId ? 'authenticated' : 'anon', userId,
  `select 1 from storage.objects where bucket_id = 'announcement-files' and name = $1`, [path])).length === 1;
/** Deletes a file as `userId` the way the Storage API does; true when it went. */
const removeFile = async (userId, path) => (await asApp('authenticated', userId,
  `delete from storage.objects where bucket_id = 'announcement-files' and name = $1 returning name`, [path])).length === 1;
const entry = (path, name = 'Route map.jpg', kind = 'image', size = 1) => ({ path, name, kind, size });
/** Posts an announcement with files as `userId`; returns id and the saved list. */
const postWithFiles = async (userId, attachments, extra = {}) => (await asApp('authenticated', userId,
  `insert into announcements (title, body, audience, audience_level, publish_at, attachments)
   values ('With files', 'See the map.', $1, $2, coalesce($3::timestamptz, now()), $4) returning id, attachments`,
  [extra.audience ?? 'all', extra.level ?? null, extra.publishAt ?? null, JSON.stringify(attachments)]))[0];

const photo = await filePath(coordinator);
await upload(coordinator, photo, 204800);
check('a coordinator uploads a photo into their own folder', await canOpen(coordinator, photo));
await refusesWith('... but not into someone else\'s folder', 'new row violates row-level security policy for table "objects"', async () => upload(coordinator, await filePath(guru)));
await refusesWith('a student cannot upload a file', 'new row violates row-level security policy for table "objects"', async () => upload(arjun, await filePath(arjun)));
await refusesWith('a file needs a proper name (random id and ending)', 'new row violates row-level security policy for table "objects"', () => upload(coordinator, `${coordinator}/photo.exe`));
check('another coordinator cannot open a file not yet posted', !(await canOpen(coordinator2, photo)));
check('... nor a student', !(await canOpen(arjun, photo)));

const withPhoto = await postWithFiles(coordinator, [{ ...entry(photo, '  Route map.jpg '), extra: 'dropped' }]);
const [saved] = withPhoto.attachments;
check('an announcement is saved with its photo, name trimmed, extra keys dropped',
  withPhoto.attachments.length === 1 && saved.name === 'Route map.jpg' && Object.keys(saved).sort().join(',') === 'kind,name,path,size',
  JSON.stringify(withPhoto.attachments));
check('... and the size taken from Storage, not from the app', saved.size === 204800, String(saved.size));
check('a student it is addressed to can open the photo', await canOpen(arjun, photo));
check('another coordinator can open it now', await canOpen(coordinator2, photo));
check('a pending login cannot open it', !(await canOpen(pendingLogin, photo)));
check('anyone without a login cannot open it', !(await canOpen(null, photo)));

const guruFile = await filePath(guru, 'pdf');
await upload(guru, guruFile);
await refusesWith('a coordinator cannot attach someone else\'s upload', 'attachment_not_yours', () =>
  postWithFiles(coordinator, [entry(guruFile, 'Guru.pdf', 'pdf')]));
await refusesWith('a file that is not in Storage cannot be attached', 'attachment_missing', async () =>
  postWithFiles(coordinator, [entry(await filePath(coordinator))]));
const four = await Promise.all([1, 2, 3, 4].map(() => filePath(coordinator)));
for (const p of four) await upload(coordinator, p);
await refusesWith('at most 3 files per announcement', 'too_many_attachments', () =>
  postWithFiles(coordinator, four.map((p) => entry(p))));
await refusesWith('the kind must match the file (a .jpg is not a pdf)', 'attachments_invalid', () =>
  postWithFiles(coordinator, [entry(four[0], 'X', 'pdf')]));
await refusesWith('a file needs a name', 'attachments_invalid', () => postWithFiles(coordinator, [entry(four[0], '  ')]));
await refusesWith('the same file cannot be listed twice', 'attachments_invalid', () =>
  postWithFiles(coordinator, [entry(four[0]), entry(four[0])]));

const level1File = await filePath(coordinator, 'pdf');
await upload(coordinator, level1File);
await postWithFiles(coordinator, [entry(level1File, 'Beginners.pdf', 'pdf')], { audience: 'level', level: 1 });
check('a student at another level cannot open that announcement\'s file', !(await canOpen(arjun, level1File)));
const laterFile = await filePath(coordinator);
await upload(coordinator, laterFile);
await postWithFiles(coordinator, [entry(laterFile)], { publishAt: new Date(Date.now() + 86400000).toISOString() });
check('a file on a scheduled announcement stays closed to students until then', !(await canOpen(arjun, laterFile)));

// Editing the list
const added = await filePath(coordinator, 'pdf');
await upload(coordinator, added);
const [afterAdd] = await asApp('authenticated', coordinator,
  `update announcements set attachments = attachments || $2::jsonb where id = $1 returning edited_at, jsonb_array_length(attachments) as n`,
  [withPhoto.id, JSON.stringify([entry(added, 'Timetable.pdf', 'pdf')])]);
check('adding a file to a published announcement marks it edited', afterAdd?.edited_at != null && afterAdd.n === 2, JSON.stringify(afterAdd));
const guruExtra = await filePath(guru);
await upload(guru, guruExtra);
const [byGuruEdit] = await asApp('authenticated', guru,
  `update announcements set attachments = attachments || $2::jsonb where id = $1 returning jsonb_array_length(attachments) as n`,
  [withPhoto.id, JSON.stringify([entry(guruExtra, 'Guru photo.jpg')])]);
check('the Guru can add their own file to a coordinator\'s announcement, keeping the others', byGuruEdit?.n === 3);

// Deleting files
check('another coordinator cannot delete the author\'s file', !(await removeFile(coordinator2, photo)));
check('a student cannot delete a file', !(await removeFile(arjun, photo)));
check('the author can delete a file the Guru added to their announcement', await removeFile(coordinator, guruExtra));
check('the uploader can delete their own file', await removeFile(coordinator, four[3]));
check('the Guru can delete any file', await removeFile(guru, four[2]));
const [{ ok: attachmentGuardCallable }] = await asOwner(`select has_function_privilege('authenticated',
  'guard_announcement_attachments()', 'execute') as ok`);
check('app roles cannot run the attachments trigger function', attachmentGuardCallable === false);

// ---------------------------------------------------------------- push notifications (0011)
// Everything posted above is due; drain it first so the checks below see only their own.
/** Runs claim_due_push as the Edge Function does (service role, no login). */
const claim = async () => asApp('service_role', null, 'select * from claim_due_push()');
await claim();
const token = (n) => `ExponentPushToken[test${n}AbCdEfGhIjKl]`;
const registerToken = (userId, tok, platform = 'android') =>
  asApp('authenticated', userId, 'select register_push_token($1, $2)', [tok, platform]);
await registerToken(arjun, token(1));
await registerToken(meera, token(2));
await registerToken(coordinator2, token(3));
await registerToken(coordinator, token(4));
check('a student saves their phone\'s push token',
  (await asOwner(`select profile_id from push_tokens where token = '${token(1)}'`))[0]?.profile_id === arjun);
await refusesWith('a token that is not an Expo push token is refused', 'bad_token', () => registerToken(arjun, 'hello'));
await refusesWith('an unknown platform is refused', 'bad_platform', () => registerToken(arjun, token(9), 'windows'));
await refusesWith('a pending login cannot save a token', 'not_allowed', () => registerToken(pendingLogin, token(9)));
await refusesWith('anon cannot save a token', 'permission denied for function register_push_token', () => asApp('anon', null, 'select register_push_token($1, $2)', [token(9), 'android']));
check('a person sees only their own tokens', (await asApp('authenticated', arjun, 'select token from push_tokens'))
  .every((r) => r.token === token(1)));
await refusesWith('a token cannot be written straight into the table', 'permission denied for table push_tokens', () =>
  asApp('authenticated', arjun, 'insert into push_tokens (token, profile_id, platform) values ($1, $2, $3)', [token(9), arjun, 'android']));
await registerToken(late, token(5));
await registerToken(meera, token(5));
check('signing in with another login on the same phone moves the token',
  (await asOwner(`select profile_id from push_tokens where token = '${token(5)}'`))[0]?.profile_id === meera);
check('the token cannot be deleted by someone else', (await asApp('authenticated', late,
  'delete from push_tokens where token = $1 returning token', [token(5)])).length === 0);
check('its owner deletes it at sign-out', (await asApp('authenticated', meera,
  'delete from push_tokens where token = $1 returning token', [token(5)])).length === 1);
for (const n of [10, 11, 12, 13, 14, 15]) await registerToken(late, token(n));
const lateTokens = (await asOwner(`select token from push_tokens where profile_id = '${late}' order by updated_at`)).map((r) => r.token);
check('at most 5 phones per person, the oldest dropped', lateTokens.length === 5 && !lateTokens.includes(token(10)), lateTokens.join(' '));

const [{ id: pushed }] = await asApp('authenticated', coordinator,
  `insert into announcements (title, body, audience, audience_level, notified_at) values ('Push me', $1, 'level', 3, now()) returning id`,
  ['p'.repeat(300)]);
check('an app user cannot mark a new announcement as notified',
  (await asOwner(`select notified_at from announcements where id = ${pushed}`))[0].notified_at === null);
await refusesWith('an app user cannot run claim_due_push', 'permission denied for function claim_due_push', () => asApp('authenticated', coordinator, 'select * from claim_due_push()'));
check('send_due_push does nothing while push is not set up (no pg_net here)',
  (await asOwner('select send_due_push() as r'))[0].r === 'not_set_up');
const claimed = await claim();
check('claim_due_push returns the phones of the people it is addressed to (level 3: Arjun)',
  claimed.length === 1 && claimed[0].token === token(1) && claimed[0].role === 'student' && claimed[0].announcement_id === pushed,
  JSON.stringify(claimed.map((r) => [r.announcement_id, r.token, r.role])));
check('... with the start of the text only', claimed[0]?.body.length === 180);
check('... and marks it notified, so a second run sends nothing', (await claim()).length === 0);
check('... and nothing due now', (await asOwner('select send_due_push() as r'))[0].r === 'nothing_due');
const [{ n: pushAudit }] = await asOwner(`select count(*)::int as n from audit_log where table_name = 'announcements' and row_id = '${pushed}'`);
check('marking it notified is not written to the audit log', pushAudit === 0, String(pushAudit));
await asApp('authenticated', coordinator, 'update announcements set notified_at = null where id = $1', [pushed]);
check('an app user cannot clear notified_at to send it again',
  (await asOwner(`select notified_at from announcements where id = ${pushed}`))[0].notified_at !== null);
await asApp('service_role', null, `select release_push_claim(array[${pushed}]::bigint[])`);
check('release_push_claim puts it back in the queue', (await claim()).length === 1);

await asApp('authenticated', coordinator, `insert into announcements (title, body, audience) values ('Staff only', 'Meeting.', 'staff')`);
const staffClaim = await claim();
check('a staff announcement goes to the other staff, never to the author or students',
  staffClaim.map((r) => r.token).join(',') === token(3) && staffClaim[0].role === 'coordinator',
  JSON.stringify(staffClaim.map((r) => [r.announcement_id, r.token])));
await asOwner(`insert into announcements (title, body, audience, publish_at, created_by)
  values ('Yesterday', 'x', 'all', now() - interval '2 days', '${coordinator}')`);
check('an announcement published more than a day ago is marked but not sent', (await claim()).length === 0
  && (await asOwner(`select notified_at from announcements where title = 'Yesterday'`))[0].notified_at !== null);
const [{ ok: pushFnsCallable }] = await asOwner(`select has_function_privilege('authenticated', 'send_due_push()', 'execute')
  or has_function_privilege('authenticated', 'release_push_claim(bigint[])', 'execute')
  or has_function_privilege('authenticated', 'guard_announcement_notified()', 'execute') as ok`);
check('app roles cannot run the push job functions', pushFnsCallable === false);

// ---------------------------------------------------------------- the push queue (0031, audit brief 11)
// The Edge Function's sending part (send.ts) runs here against the real SQL; Expo is imitated and
// records every message it delivers. FOREIGN is a token of another Expo project: Expo refuses a
// request that mixes it with ours (PUSH_TOO_MANY_EXPERIENCE_IDS).
const FOREIGN = 'ExponentPushToken[foreignAppXyz]';
const delivered = [];
function expo({ gone = [], down = false, rateLimited = [] } = {}) {
  return async (messages) => {
    if (down) return { kind: 'failed', reason: 'http_503' };
    const tokens = messages.map((m) => m.to);
    if (tokens.includes(FOREIGN) && tokens.length > 1) {
      return { kind: 'refused', status: 400, code: 'PUSH_TOO_MANY_EXPERIENCE_IDS',
        details: { '@mridanga-seva/mridanga-seva': tokens.filter((t) => t !== FOREIGN), '@someone/other-app': [FOREIGN] } };
    }
    return { kind: 'ok', tickets: messages.map((m) => {
      if (gone.includes(m.to)) return { status: 'error', details: { error: 'DeviceNotRegistered' } };
      if (rateLimited.includes(m.to)) return { status: 'error', details: { error: 'MessageRateExceeded' } };
      delivered.push(`${m.data.announcementId ?? m.data.url}:${m.to}`);
      return { status: 'ok', id: 'x' };
    }) };
  };
}
/** The Edge Function's database calls, as the service role. */
const pushRpc = async (name, args) => {
  try {
    if (name === 'claim_push_queue') {
      const rows = await asApp('service_role', null, 'select * from claim_push_queue()');
      return { data: rows.map((r) => ({ ...r, message_id: Number(r.message_id), announcement_id: r.announcement_id === null ? null : Number(r.announcement_id) })), error: null };
    }
    await asApp('service_role', null, 'select finish_push($1::uuid, $2::bigint[], $3::bigint[], $4::jsonb, $5::jsonb)',
      [args.p_claim, args.p_sent, args.p_retry, JSON.stringify(args.p_refused), JSON.stringify(args.p_summary)]);
    return { data: null, error: null };
  } catch (failure) {
    return { data: null, error: { message: String(failure.message ?? failure) } };
  }
};
const quietRun = async (post) => {
  const realError = console.error;
  console.error = () => {};
  try { return await runPush(pushRpc, post); } finally { console.error = realError; }
};
const postAll = async (title) => (await asApp('authenticated', coordinator,
  `insert into announcements (title, body, audience) values ($1, 'Sunday 17:00', 'all') returning id`, [title]))[0].id;
const deliveredFor = (id) => delivered.filter((d) => d.startsWith(`${id}:`)).map((d) => d.slice(String(id).length + 1));
const queueOf = (id) => asOwner(`select token, sent_at, failed, tries from push_queue where announcement_id = ${id} order by token`);
const makeDue = () => asOwner('update push_queue set next_try_at = now() where sent_at is null and failed is null');
await refusesWith('an app user cannot claim the push queue (0031)', 'permission denied for function claim_push_queue', () => asApp('authenticated', guru, 'select * from claim_push_queue()'));
await refusesWith('... nor read it', 'permission denied for table push_queue', () => asApp('authenticated', guru, 'select * from push_queue'));

// D2-01: one foreign token and one stale phone in the audience.
await registerToken(meera, FOREIGN);
const pq_q1 = await postAll('Queue one');
const pq_run1 = await quietRun(expo({ gone: [token(1)] }));
const pq_rows1 = await queueOf(pq_q1);
const pq_ours1 = pq_rows1.filter((r) => r.token !== FOREIGN && r.token !== token(1));
check('D2-01: a foreign token and a stale phone do not block the others: every other phone gets it once',
  pq_ours1.length >= 1 && pq_ours1.every((r) => r.sent_at !== null) && deliveredFor(pq_q1).sort().join() === pq_ours1.map((r) => r.token).sort().join(),
  JSON.stringify({ run1: pq_run1, delivered: deliveredFor(pq_q1) }));
check('... the foreign token is set aside (OtherProject), not sent and not deleted',
  pq_rows1.find((r) => r.token === FOREIGN)?.failed === 'OtherProject' && !deliveredFor(pq_q1).includes(FOREIGN)
  && (await asOwner(`select 1 from push_tokens where token = '${FOREIGN}'`)).length === 1);
check('... only the token Expo calls DeviceNotRegistered is deleted',
  pq_rows1.find((r) => r.token === token(1))?.failed === 'DeviceNotRegistered'
  && (await asOwner(`select 1 from push_tokens where token = '${token(1)}'`)).length === 0);
check('... and a second run sends nothing', (await quietRun(expo())).messages === 0);
const [pq_status1] = await asOwner('select last_run_at, last_run from push_status');
check('push_status keeps the last run\'s counts', pq_status1.last_run_at !== null && pq_status1.last_run.sent === pq_ours1.length
  && pq_status1.last_run.refused === 2, JSON.stringify(pq_status1.last_run));
await asOwner(`delete from push_tokens where token = '${FOREIGN}'`);
await registerToken(arjun, token(1));

// A failed send is tried again later, once, and never sent twice.
const pq_q2 = await postAll('Queue two');
const down = await quietRun(expo({ down: true }));
check('Expo down: nothing sent, every row waits for a later try', down.sent === 0 && down.retry === down.messages && down.messages >= 2
  && deliveredFor(pq_q2).length === 0, JSON.stringify(down));
check('... not in the next minute (it waits 2 minutes)', (await quietRun(expo())).messages === 0
  && (await asOwner('select send_due_push() as r'))[0].r === 'nothing_due');
await makeDue();
check('... the job sees the retry as due', (await asOwner('select send_due_push() as r'))[0].r === 'not_set_up');
const retried = await quietRun(expo({ rateLimited: [token(2)] }));
await makeDue();
const pq_last = await quietRun(expo());
const pq_rows2 = await queueOf(pq_q2);
check('a retried push reaches each phone exactly once; a phone Expo turned away is tried again alone',
  retried.retry === 1 && pq_last.messages === 1 && pq_last.sent === 1 && pq_rows2.every((r) => r.sent_at !== null)
  && deliveredFor(pq_q2).length === pq_rows2.length && new Set(deliveredFor(pq_q2)).size === pq_rows2.length,
  JSON.stringify({ retried, last: pq_last, delivered: deliveredFor(pq_q2) }));

// A run that stops between claim and send (D2-04), and a late answer from it (R2G3-05).
const pq_q3 = await postAll('Queue three');
const [{ claim: lostClaim }] = await asApp('service_role', null, 'select * from claim_push_queue()');
check('a claimed row is not claimed again while its run may still be sending', (await quietRun(expo())).messages === 0);
await asOwner(`delete from push_tokens where token = '${token(2)}'`);
await makeDue();
const pq_resumed = await quietRun(expo());
const pq_rows3 = await queueOf(pq_q3);
check('... after the lease it is sent by the next run, once',
  pq_resumed.sent >= 1 && pq_rows3.filter((r) => r.token !== token(2)).every((r) => r.sent_at !== null && r.tries === 2)
  && deliveredFor(pq_q3).length === pq_rows3.filter((r) => r.token !== token(2)).length, JSON.stringify({ resumed: pq_resumed, rows3: pq_rows3 }));
check('... a phone signed out meanwhile is not sent to (token_gone)', pq_rows3.find((r) => r.token === token(2))?.failed === 'token_gone'
  && !deliveredFor(pq_q3).includes(token(2)));
const pq_q3ids = (await asOwner(`select id from push_queue where announcement_id = ${pq_q3}`)).map((r) => Number(r.id));
await asApp('service_role', null, 'select finish_push($1::uuid, $2::bigint[], $3::bigint[], $4::jsonb, $5::jsonb)',
  [lostClaim, [], pq_q3ids, '{}', '{}']);
check('... and the stopped run\'s late answer changes nothing', (await queueOf(pq_q3)).every((r) => r.sent_at !== null || r.failed !== null)
  && (await quietRun(expo())).messages === 0);
await registerToken(meera, token(2));

// Notices from push_outbox (0016) go through the same queue, with their own screen.
await asOwner(`insert into push_outbox (profile_id, title, body, url) values ('${meera}', 'Kirtan', 'New event.', '/student/events/9'),
  ('${meera}', 'Odd', 'x', 'https://example.com')`);
const pq_notices = await quietRun(expo());
check('queued notices are sent with their screen; one asking for another address is refused (bad_url)',
  pq_notices.sent === 1 && pq_notices.refused === 1 && delivered.includes(`/student/events/9:${token(2)}`)
  && (await asOwner(`select failed from push_queue where url = 'https://example.com'`))[0]?.failed === 'bad_url', JSON.stringify(pq_notices));
await db.exec(`delete from notifications where profile_id = '${meera}' and url in ('/student/events/9', 'https://example.com');
  delete from push_outbox where profile_id = '${meera}' and url in ('/student/events/9', 'https://example.com');`);

// R2G3-01: the job sends the push secret only to a Supabase project's https address.
await db.exec(`create schema net;
  create table net.sent (url text, headers jsonb, body jsonb);
  create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}',
    timeout_milliseconds int default 5000) returns bigint language sql as
    $$ insert into net.sent values (url, headers, body); select 1::bigint $$;
  create schema vault;
  create table vault.decrypted_secrets (name text, decrypted_secret text);`);
const callWith = async (url, secret) => {
  await db.exec(`delete from vault.decrypted_secrets; insert into vault.decrypted_secrets values
    ('mridanga_project_url', '${url}'), ('mridanga_push_secret', '${secret}')`);
  return (await asOwner(`select call_notify_function('{}'::jsonb) as r`))[0].r;
};
const longSecret = 'a1'.repeat(32);
check('R2G3-01: an http:// or foreign address is not called', (await callWith('http://abcdefghijklmnopqrst.supabase.co', longSecret)) === 'not_set_up'
  && (await callWith('https://evil.example', longSecret)) === 'not_set_up' && (await asOwner('select * from net.sent')).length === 0);
check('... nor with a secret shorter than 32 characters', (await callWith('https://abcdefghijklmnopqrst.supabase.co', 'short')) === 'not_set_up'
  && (await asOwner('select * from net.sent')).length === 0);
check('... and push_status says so (R2G3-03)', (await asOwner('select last_job_result from push_status'))[0].last_job_result === 'not_set_up');
const pq_called = await callWith('https://abcdefghijklmnopqrst.supabase.co/', longSecret);
const [pq_call] = await asOwner('select url, headers from net.sent');
check('a project address and a long secret: the function is called', pq_called === 'called'
  && pq_call?.url === 'https://abcdefghijklmnopqrst.supabase.co/functions/v1/notify-announcements'
  && pq_call.headers['x-push-secret'] === longSecret
  && (await asOwner('select last_job_result from push_status'))[0].last_job_result === 'called');
await db.exec('drop schema net cascade; drop schema vault cascade;');

// ---------------------------------------------------------------- assessments (0016, Phase 2)
const [aBucket] = await asOwner(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'assessment-files'`);
check('the assessment-files bucket is private, 50 MB, with audio and video', aBucket?.public === false
  && Number(aBucket.file_size_limit) === 52428800 && aBucket.allowed_mime_types.includes('audio/mpeg')
  && aBucket.allowed_mime_types.includes('video/mp4'), JSON.stringify(aBucket));

/** Uploads a file into assessment-files as `userId` (one storage.objects row, as the Storage API). */
const aUpload = async (userId, path, size = 4096) => asApp('authenticated', userId,
  `insert into storage.objects (bucket_id, name, owner, metadata) values ('assessment-files', $1, auth.uid(), $2)`,
  [path, JSON.stringify({ size })]);
const aCanOpen = async (userId, path) => (await asApp('authenticated', userId,
  `select 1 from storage.objects where bucket_id = 'assessment-files' and name = $1`, [path])).length === 1;
const aRemove = async (userId, path) => (await asApp('authenticated', userId,
  `delete from storage.objects where bucket_id = 'assessment-files' and name = $1 returning name`, [path])).length === 1;
const rubric = [{ criterion: 'Rhythm (taal)', max: 5 }, { criterion: 'Clarity of bols', max: 5 }];
/** Creates an assessment as `userId`; returns its row. */
const createAssessment = async (userId, fields = {}) => (await asApp('authenticated', userId,
  `insert into assessments (title, instructions, kind, level_id, level_up, rubric, media, media_link, sent_at)
   values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id, title, rubric, media, sent_at`,
  [fields.title ?? '  Ekatala practice  ', fields.instructions ?? 'Play it four times.', fields.kind ?? 'playing',
   fields.level ?? 3, fields.levelUp ?? false, JSON.stringify(fields.rubric ?? rubric), JSON.stringify(fields.media ?? []),
   fields.link ?? null, fields.sent ? new Date().toISOString() : null]))[0];
const tomorrow = (await asOwner(`select (today_ist() + 1)::text as d`))[0].d;
const release = (userId, assessment, students, due = tomorrow, notes = 'Practise slowly first.') => asApp('authenticated', userId,
  'select release_assessment($1, $2::uuid[], $3::date, $4) as r', [assessment, students, due, notes]).then((r) => r[0].r);
const studentIdOf = async (profileId) => (await asOwner(`select id from students where profile_id = '${profileId}'`))[0].id;
const arjunStudent = await studentIdOf(arjun);
const meeraStudent = await studentIdOf(meera);
const lateStudent = await studentIdOf(late);

await refusesWith('a coordinator cannot create an assessment', 'new row violates row-level security policy for table "assessments"', () => createAssessment(coordinator));
await refusesWith('an assessment needs a title', 'title_required', () => createAssessment(guru, { title: '  ' }));
await refusesWith('an assessment needs a rubric', 'rubric_required', () => createAssessment(guru, { rubric: [] }));
await refusesWith('a rubric line has a top score of 1 to 10', 'rubric_invalid', () =>
  createAssessment(guru, { rubric: [{ criterion: 'Posture', max: 20 }] }));
await refusesWith('a link must be https', 'link_invalid', () => createAssessment(guru, { link: 'http://youtube.com/x' }));

const guide = await filePath(guru, 'pdf');
const demo = await filePath(guru, 'mp3');
await aUpload(guru, guide);
await aUpload(guru, demo, 900000);
await refusesWith('a coordinator cannot upload assessment files (only voice notes, 0020)', 'new row violates row-level security policy for table "objects"', async () => aUpload(coordinator, await filePath(coordinator, 'pdf')));
await refusesWith('a file needs a known ending', 'new row violates row-level security policy for table "objects"', async () => aUpload(guru, await filePath(guru, 'exe')));
const draft = await createAssessment(guru, {
  media: [{ path: guide, name: ' Ekatala.pdf ', kind: 'pdf', size: 1 }, { path: demo, name: 'Demo.mp3', kind: 'audio', size: 1 }],
  link: 'https://youtu.be/example',
});
check('the Guru saves a draft, title trimmed, file sizes from Storage', draft.title === 'Ekatala practice' && draft.sent_at === null
  && draft.media[1].size === 900000 && draft.media[0].name === 'Ekatala.pdf', JSON.stringify(draft.media));
await refusesWith('the Guru cannot attach a file that is not in Storage', 'file_missing', async () =>
  createAssessment(guru, { media: [{ path: await filePath(guru, 'pdf'), name: 'x.pdf', kind: 'pdf', size: 1 }] }));
await refusesWith('... nor a file from another folder', 'file_not_yours', () =>
  createAssessment(guru, { media: [{ path: photo, name: 'x.jpg', kind: 'image', size: 1 }] }));
await refusesWith('... and the kind must match the ending', 'file_invalid', () =>
  createAssessment(guru, { media: [{ path: demo, name: 'Demo.mp3', kind: 'video', size: 1 }] }));
check('a coordinator does not see a draft', (await asApp('authenticated', coordinator, 'select id from assessments')).length === 0);
await refusesWith('a draft cannot be released', 'assessment_not_found', () => release(guru, draft.id, [arjunStudent]));
await asApp('authenticated', guru, 'update assessments set sent_at = now() where id = $1', [draft.id]);
check('once sent, coordinators see it', (await asApp('authenticated', coordinator, 'select id from assessments')).length === 1);
check('a coordinator can open its files', await aCanOpen(coordinator2, demo));
check('a student it was not given to sees nothing', (await asApp('authenticated', arjun, 'select id from assessments')).length === 0
  && !(await aCanOpen(arjun, demo)));
await refusesWith('a sent assessment stays sent', 'already_sent', () =>
  asApp('authenticated', guru, 'update assessments set sent_at = null where id = $1', [draft.id]));

await refusesWith('a student cannot release an assessment', 'not_allowed', () => release(arjun, draft.id, [arjunStudent]));
await refusesWith('the due date cannot be past', 'due_past', () => release(coordinator, draft.id, [arjunStudent], yesterday));
await refusesWith('a release needs students', 'students_required', () => release(coordinator, draft.id, []));
const released = await release(coordinator, draft.id, [arjunStudent, meeraStudent, arjunStudent]);
check('a coordinator releases it to two students', released.assigned === 2 && released.already === 0 && released.no_login === 0,
  JSON.stringify(released));
await refusesWith('releasing it again to the same students assigns nothing', 'nothing_to_assign', () =>
  release(coordinator2, draft.id, [arjunStudent]));
const [{ n: queued }] = await asOwner(`select count(*)::int as n from push_outbox where sent_at is null and url like '/student/assessments/%'`);
check('... and queues a notification for each', queued === 2, String(queued));
check('the app cannot read the push queue', (await asApp('authenticated', guru, 'select id from push_outbox').catch(() => [])).length === 0);
await refusesWith('after a release the rubric stays as it is', 'assessment_released', () =>
  asApp('authenticated', guru, `update assessments set rubric = '[{"criterion":"New","max":3}]' where id = $1`, [draft.id]));
await refusesWith('a released assessment cannot be deleted', 'update or delete on table "assessments" violates RESTRICT setting of foreign key constraint "assessment_releases_assessment_id_fkey" on table "assessment_releases"', () =>
  asApp('authenticated', guru, 'delete from assessments where id = $1', [draft.id]));

const myAssignment = async (userId) => (await asApp('authenticated', userId, 'select id, status, release_id from assessment_assignments'));
const [arjunTask] = await myAssignment(arjun);
check('a student sees their own assignment only', (await myAssignment(arjun)).length === 1 && arjunTask.status === 'assigned');
check('... the assessment, its release notes and its files', (await asApp('authenticated', arjun, 'select id from assessments')).length === 1
  && (await asApp('authenticated', arjun, 'select notes from assessment_releases'))[0]?.notes === 'Practise slowly first.'
  && await aCanOpen(arjun, demo));
check('a student it was not given to sees no release or assignment', (await myAssignment(late)).length === 0
  && (await asApp('authenticated', late, 'select id from assessment_releases')).length === 0);
check('a pending login sees nothing', (await asApp('authenticated', pendingLogin, 'select id from assessments')).length === 0);
await refusesWith('a student cannot mark someone else\'s as seen', 'not_allowed', () =>
  asApp('authenticated', meera, 'select mark_assessment_seen($1)', [arjunTask.id]));
await asApp('authenticated', arjun, 'select mark_assessment_seen($1)', [arjunTask.id]);
const tracker = async (userId) => asApp('authenticated', userId,
  'select assignment_id, full_name, status, has_login, submission_id, score from assessment_tracker where assessment_id = $1 order by full_name', [draft.id]);
const t1 = await tracker(coordinator2);
check('the tracker shows each student: Arjun seen, Meera not seen', t1.length === 2 && t1[0].status === 'seen'
  && t1[1].status === 'assigned' && t1[0].has_login, JSON.stringify(t1));
const [sum1] = await asApp('authenticated', coordinator, 'select * from assessment_summary where assessment_id = $1', [draft.id]);
check('the summary counts them', sum1.assigned === 2 && sum1.seen === 1 && sum1.not_seen === 1, JSON.stringify(sum1));

// Submitting
const take1 = await filePath(arjun, 'm4a');
await aUpload(arjun, take1, 3000000);
check('a student uploads a recording into their own folder', await aCanOpen(arjun, take1));
await refusesWith('... but not a photo', 'new row violates row-level security policy for table "objects"', async () => aUpload(arjun, await filePath(arjun, 'jpg')));
await refusesWith('a student with nothing to send cannot upload', 'new row violates row-level security policy for table "objects"', async () => aUpload(late, await filePath(late, 'mp3')));
check('another student cannot open it', !(await aCanOpen(meera, take1)));
const submit = (userId, assignment, file, link = null, note = null) => asApp('authenticated', userId,
  'select submit_assessment($1, $2::jsonb, $3, $4) as id', [assignment, file ? JSON.stringify(file) : null, link, note])
  .then((r) => r[0].id);
await refusesWith('a submission needs a recording or a link', 'recording_required', () => submit(arjun, arjunTask.id, null));
await refusesWith('a file that is not in Storage cannot be sent', 'file_missing', async () =>
  submit(arjun, arjunTask.id, { path: await filePath(arjun, 'mp3'), name: 'a.mp3', kind: 'audio', size: 1 }));
await refusesWith('... nor someone else\'s file', 'file_not_yours', () =>
  submit(arjun, arjunTask.id, { path: demo, name: 'Demo.mp3', kind: 'audio', size: 1 }));
await refusesWith('a student cannot submit someone else\'s assessment', 'not_allowed', () =>
  submit(meera, arjunTask.id, null, 'https://youtu.be/x'));
const sub1 = await submit(arjun, arjunTask.id, { path: take1, name: 'Take 1.m4a', kind: 'audio', size: 1 }, null, 'First try');
check('the student sends the recording; the status becomes Submitted', (await myAssignment(arjun))[0].status === 'submitted'
  && (await asOwner(`select (file ->> 'size')::int as s from assessment_submissions where id = ${sub1}`))[0].s === 3000000);
await refusesWith('a submitted one cannot be sent again before the review', 'not_open', () =>
  submit(arjun, arjunTask.id, null, 'https://youtu.be/x'));
check('a coordinator can play the recording', await aCanOpen(coordinator2, take1));
check('the student cannot delete a file they sent', !(await aRemove(arjun, take1)));
check('the coordinator who released it is told', (await asOwner(`select count(*)::int as n from push_outbox
  where profile_id = '${coordinator}' and url = '/staff/assessments/review/${arjunTask.id}'`))[0].n === 1);

// Reviewing
const review = (userId, submission, scores, comment, outcome, levelUp = false) => asApp('authenticated', userId,
  'select review_submission($1, $2::int[], $3, $4, $5)', [submission, scores, comment, outcome, levelUp]);
await refusesWith('a student cannot review', 'not_allowed', () => review(arjun, sub1, [5, 5], 'Self', 'accepted'));
await refusesWith('one score per rubric line', 'scores_invalid', () => review(coordinator2, sub1, [5], 'x', 'accepted'));
await refusesWith('a score cannot be above the line\'s top', 'scores_invalid', () => review(coordinator2, sub1, [6, 1], 'x', 'accepted'));
await refusesWith('a redo needs a comment', 'comment_required', () => review(coordinator2, sub1, [2, 2], ' ', 'redo'));
await refusesWith('only a level-up assessment can be sent to the Guru', 'level_up_not_allowed', () =>
  review(coordinator2, sub1, [4, 4], 'Good', 'accepted', true));
await review(coordinator2, sub1, [2, 3], 'Keep the tempo steady.', 'redo');
check('a redo sets the status to Redo and tells the student', (await myAssignment(arjun))[0].status === 'redo'
  && (await asOwner(`select count(*)::int as n from push_outbox o join students s on s.profile_id = o.profile_id
       where s.id = '${arjunStudent}' and o.url = '/student/assessments/${arjunTask.id}'`))[0].n === 2);
const [seenReview] = await asApp('authenticated', arjun, 'select score, score_max, comment, outcome from assessment_submissions');
check('the student sees the score and the comment', seenReview?.score === 5 && seenReview.score_max === 10
  && seenReview.comment === 'Keep the tempo steady.', JSON.stringify(seenReview));
await refusesWith('a reviewed submission cannot be reviewed again', 'already_reviewed', () =>
  review(coordinator, sub1, [5, 5], 'x', 'accepted'));
const sub2 = await submit(arjun, arjunTask.id, null, 'https://youtu.be/arjun-take-2');
await review(coordinator, sub2, [5, 4], 'Much better.', 'accepted');
const t2 = await tracker(coordinator);
check('accepted: the tracker shows Reviewed with the latest score', t2[0].status === 'reviewed' && t2[0].score === 9
  && t2[0].submission_id === sub2, JSON.stringify(t2[0]));

// Reminders
const meeraTask = t2[1].assignment_id;
const remind = (userId, ids) => asApp('authenticated', userId, 'select remind_assessment($1::bigint[]) as r', [ids]).then((r) => r[0].r);
await refusesWith('a student cannot send reminders', 'not_allowed', () => remind(arjun, [meeraTask]));
const r1 = await remind(coordinator, [meeraTask, arjunTask.id]);
check('Remind reaches a student who has not sent it, not one who is done', r1.reminded === 1 && r1.skipped === 1, JSON.stringify(r1));
check('... and not twice within 12 hours', (await remind(coordinator2, [meeraTask])).skipped === 1);
check('the daily job skips one reminded today', (await asOwner('select assessment_daily() as n'))[0].n === 0);
await asOwner(`update assessment_assignments set last_reminded_at = now() - interval '13 hours' where id = ${meeraTask}`);
check('the daily job reminds work due tomorrow', (await asOwner('select assessment_daily() as n'))[0].n === 1);

// Sending the queue (Edge Function)
const outbox = await asApp('service_role', null, 'select * from claim_push_outbox()');
check('claim_push_outbox returns the phones to notify, with the screen to open', outbox.length >= 4
  && outbox.every((r) => r.token && /^\/(student|staff)\/assessments\//.test(r.url)), String(outbox.length));
check('... and a second run sends nothing', (await asApp('service_role', null, 'select * from claim_push_outbox()')).length === 0);
check('... nothing due now', (await asOwner('select send_due_push() as r'))[0].r === 'nothing_due');
await refusesWith('an app user cannot claim the push queue', 'permission denied for function claim_push_outbox', () => asApp('authenticated', guru, 'select * from claim_push_outbox()'));

// Level-up and keeping files
const levelUp = await createAssessment(guru, { title: 'Level-up: Intermediate', level: 2, levelUp: true, sent: true });
await release(coordinator, levelUp.id, [meeraStudent]);
const [meeraLevelUp] = (await myAssignment(meera)).filter((a) => a.id !== meeraTask);
const take2 = await filePath(meera, 'mp4');
await aUpload(meera, take2, 20000000);
const sub3 = await submit(meera, meeraLevelUp.id, { path: take2, name: 'Level-up.mp4', kind: 'video', size: 1 });
await review(coordinator, sub3, [5, 5], 'Ready.', 'accepted', true);
check('an accepted level-up is sent to the Guru', (await asOwner(`select send_level_up from assessment_submissions where id = ${sub3}`))[0].send_level_up === true);
await asOwner(`update assessment_submissions set reviewed_at = now() - interval '31 days' where id in (${sub1}, ${sub3})`);
const expired = await asApp('service_role', null, 'select * from claim_expired_submission_files()');
check('files 30 days past their review are handed for deleting, not a level-up one', expired.length === 1
  && expired[0].path === take1, JSON.stringify(expired));
check('... once', (await asApp('service_role', null, 'select * from claim_expired_submission_files()')).length === 0);
const [{ ok: assessmentFnsCallable }] = await asOwner(`select has_function_privilege('authenticated', 'assessment_daily()', 'execute')
  or has_function_privilege('authenticated', 'claim_expired_submission_files()', 'execute')
  or has_function_privilege('authenticated', 'queue_student_push(uuid, text, text, text, date, text)', 'execute')
  or has_function_privilege('authenticated', 'call_notify_function(jsonb)', 'execute') as ok`);
check('app roles cannot run the assessment job functions', assessmentFnsCallable === false);
await refusesWith('the app cannot write assignments directly', 'permission denied for table assessment_assignments', () => asApp('authenticated', coordinator,
  'insert into assessment_assignments (release_id, assessment_id, student_id) values ($1, $2, $3)',
  [released.release_id, draft.id, lateStudent]));

// ---------------------------------------------------------------- syllabus editor and materials (0013)
const levelItems = async (level) => asOwner(`select id, sort, title, retired_at from syllabus_items where level_id = ${level} order by sort`);
const [newItem] = await asApp('authenticated', guru,
  `insert into syllabus_items (level_id, title, description) values (1, '  Tirakita  ', '   ') returning id, sort, title, description`);
const beginnerBefore = await levelItems(1);
check('the Guru adds a syllabus item at the end of its level, trimmed',
  newItem.sort === beginnerBefore[beginnerBefore.length - 1].sort && newItem.title === 'Tirakita' && newItem.description === null,
  JSON.stringify(newItem));
await refusesWith('a coordinator cannot add a syllabus item', 'new row violates row-level security policy for table "syllabus_items"', () =>
  asApp('authenticated', coordinator, `insert into syllabus_items (level_id, title) values (1, 'Mine')`));
await refusesWith('an empty title is refused', 'title_required', () =>
  asApp('authenticated', guru, `update syllabus_items set title = '  ' where id = $1`, [newItem.id]));
await refusesWith('a title over 120 characters is refused', 'title_too_long', () =>
  asApp('authenticated', guru, `update syllabus_items set title = repeat('a', 121) where id = $1`, [newItem.id]));
const audited = await asOwner(`select action from audit_log where table_name = 'syllabus_items' and row_id = '${newItem.id}'`);
check('syllabus item changes go to the audit log', audited.length === 1 && audited[0].action === 'INSERT');

// Reorder: the new last item moves up one place and swaps with its neighbour.
const [prev] = beginnerBefore.slice(-2);
const [{ moved }] = await asApp('authenticated', guru, `select move_syllabus_item($1, true) as moved`, [newItem.id]);
const beginnerAfter = await levelItems(1);
check('the Guru moves an item up one place', moved === true
  && beginnerAfter.find((i) => i.id === newItem.id).sort === prev.sort
  && beginnerAfter.find((i) => i.id === prev.id).sort === newItem.sort);
const [{ first }] = await asApp('authenticated', guru, `select move_syllabus_item($1, true) as first`, [beginnerAfter[0].id]);
check('... and the first item cannot move further up', first === false);
await refusesWith('a coordinator cannot reorder the syllabus', 'not_allowed', () =>
  asApp('authenticated', coordinator, `select move_syllabus_item($1, false)`, [newItem.id]));

// A ticked item survives: its title can change, it cannot be deleted or moved to another level.
await asApp('authenticated', coordinator, `insert into student_progress (student_id, item_id) values ($1, $2)`, [registered.id, newItem.id]);
await asApp('authenticated', guru, `update syllabus_items set title = 'Tirakita (fast)' where id = $1`, [newItem.id]);
check('editing a ticked item keeps the tick', (await asOwner(
  `select 1 from student_progress where student_id = '${registered.id}' and item_id = ${newItem.id}`)).length === 1);
const itemCounts = await asApp('authenticated', coordinator, 'select item_id, ticks from syllabus_item_counts() where item_id = $1', [newItem.id]);
check('the editor counts the ticks of an item', itemCounts.length === 1 && itemCounts[0].ticks === 1, JSON.stringify(itemCounts));
await refusesWith('a ticked item cannot be deleted', 'item_has_ticks', () =>
  asApp('authenticated', guru, `delete from syllabus_items where id = $1`, [newItem.id]));
await refusesWith('... not even from the dashboard (the ticks would go with it)', 'item_has_ticks', () =>
  asOwner(`delete from syllabus_items where id = ${newItem.id}`));
await refusesWith('a ticked item cannot move to another level', 'item_has_ticks', () =>
  asApp('authenticated', guru, `update syllabus_items set level_id = 2 where id = $1`, [newItem.id]));
await asApp('authenticated', guru, `update syllabus_items set retired_at = now() where id = $1`, [newItem.id]);
check('the Guru retires a ticked item and the tick stays', (await asOwner(
  `select 1 from student_progress p join syllabus_items i on i.id = p.item_id
    where p.student_id = '${registered.id}' and i.id = ${newItem.id} and i.retired_at is not null`)).length === 1);
await refusesWith('a retired item cannot be ticked', 'item_retired', () =>
  asApp('authenticated', coordinator, `insert into student_progress (student_id, item_id) values ($1, $2)`, [adult.id, newItem.id]));
const [{ moveRetired }] = await asApp('authenticated', guru, `select move_syllabus_item($1, true) as "moveRetired"`, [beginnerAfter[beginnerAfter.length - 1].id]);
check('moving skips retired items', moveRetired === true);
const [lateHome] = await asApp('authenticated', late, `select student_home() as h`);
const [lateCount] = await asOwner(`select count(*)::int as n from syllabus_items i join students s on s.level_id = i.level_id
  where s.id = '${registered.id}' and i.retired_at is null`);
check('S1 progress counts the items in use only', lateHome.h.syllabus_total === lateCount.n, JSON.stringify(lateHome.h));
await asApp('authenticated', guru, `update syllabus_items set retired_at = null where id = $1`, [newItem.id]);
check('... and a retired item can be put back', (await asOwner(`select retired_at from syllabus_items where id = ${newItem.id}`))[0].retired_at === null);
const [spare] = await asApp('authenticated', guru, `insert into syllabus_items (level_id, title) values (2, 'Typo') returning id`);
const deleted = await asApp('authenticated', guru, `delete from syllabus_items where id = $1 returning id`, [spare.id]);
check('an item nobody ticked can be deleted', deleted.length === 1);
check('app roles cannot run the syllabus editor trigger functions', (await asOwner(`select
  has_function_privilege('authenticated', 'guard_syllabus_item()', 'execute')
  or has_function_privilege('authenticated', 'protect_syllabus_item()', 'execute')
  or has_function_privilege('authenticated', 'guard_material()', 'execute') as ok`))[0].ok === false);

// Materials
const [mbucket] = await asOwner(`select public, file_size_limit from storage.buckets where id = 'material-files'`);
check('the material-files bucket is private, 10 MB', mbucket?.public === false && Number(mbucket.file_size_limit) === 10485760);
const addMaterial = async (userId, fields) => (await asApp('authenticated', userId,
  `insert into materials (title, kind, url, storage_path, file_name, file_size, level_id, item_id)
   values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
  [fields.title ?? 'Lesson', fields.kind, fields.url ?? null, fields.path ?? null, fields.name ?? null,
   fields.size ?? null, fields.level ?? null, fields.item ?? null]))[0];
const video = await addMaterial(guru, { kind: 'youtube', url: ' https://youtu.be/dQw4w9WgXcQ ', item: item1.id, level: 3 });
check('the Guru adds a YouTube lesson to an item; approved, level taken from the item',
  video.approved_by === guru && video.level_id === 1 && video.url === 'https://youtu.be/dQw4w9WgXcQ', JSON.stringify(video));
await refusesWith('a link that is not a YouTube video is refused', 'youtube_link_invalid', () =>
  addMaterial(guru, { kind: 'youtube', url: 'https://example.com/watch?v=dQw4w9WgXcQ', level: 1 }));
await refusesWith('audio is not offered yet', 'material_kind_not_offered', () => addMaterial(guru, { kind: 'audio', level: 1 }));
const uploadMaterial = async (userId, path, size = 4096) => asApp('authenticated', userId,
  `insert into storage.objects (bucket_id, name, owner, metadata) values ('material-files', $1, auth.uid(), $2)`,
  [path, JSON.stringify({ size, mimetype: 'application/pdf' })]);
const canOpenMaterial = async (userId, path) => (await asApp('authenticated', userId,
  `select 1 from storage.objects where bucket_id = 'material-files' and name = $1`, [path])).length === 1;
const notation = `${guru}/${await newId()}.pdf`;
await uploadMaterial(guru, notation, 900000);
await refusesWith('a student cannot upload a material file (coordinators may since 0023, C18)', 'new row violates row-level security policy for table "objects"', async () =>
  uploadMaterial(late, `${late}/${await newId()}.pdf`));
const pdf = await addMaterial(guru, { kind: 'pdf', path: notation, name: ' Kaherva.pdf ', size: 1, level: 3 });
check('the Guru adds a PDF; its size comes from Storage', Number(pdf.file_size) === 900000 && pdf.file_name === 'Kaherva.pdf');
await refusesWith('a material cannot list a file that is not in Storage', 'material_file_missing', async () =>
  addMaterial(guru, { kind: 'pdf', path: `${guru}/${await newId()}.pdf`, name: 'x.pdf', size: 1, level: 1 }));
await refusesWith('the file of a material cannot be swapped', 'material_frozen', async () => asApp('authenticated', guru,
  `update materials set storage_path = $2 where id = $1`, [pdf.id, `${guru}/${await newId()}.pdf`]));
const [arjunLevelRow] = await asOwner(`select level_id from students where profile_id = '${arjun}'`);
const [lateLevelRow] = await asOwner(`select level_id from students where profile_id = '${late}'`);
check('a student at or above the level opens the material file', arjunLevelRow.level_id >= 3 ? await canOpenMaterial(arjun, notation) : true,
  `arjun level ${arjunLevelRow.level_id}`);
check('a student below the level cannot see the material or open its file', lateLevelRow.level_id < 3
  ? !(await canOpenMaterial(late, notation)) && (await asApp('authenticated', late, `select id from materials where id = $1`, [pdf.id])).length === 0
  : true, `late level ${lateLevelRow.level_id}`);
check('a student sees the lesson of level 1', (await asApp('authenticated', late, `select id from materials where id = $1`, [video.id])).length === 1);
await refusesWith('a student cannot add a material', 'new row violates row-level security policy for table "materials"', () => addMaterial(late, { kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', level: 1 }));
const [bareItem] = await asApp('authenticated', guru, `insert into syllabus_items (level_id, title) values (2, 'With a video') returning id`);
const unTickedVideo = await addMaterial(guru, { kind: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s', item: bareItem.id });
await refusesWith('an unticked item with materials cannot be deleted', 'item_has_materials', () => asApp('authenticated', guru,
  `delete from syllabus_items where id = $1`, [bareItem.id]));
await asApp('authenticated', guru, `delete from materials where id = $1`, [unTickedVideo.id]);
await asApp('authenticated', guru, `delete from syllabus_items where id = $1`, [bareItem.id]);
await asApp('authenticated', guru, `delete from materials where id = $1`, [pdf.id]);
check('the Guru deletes a material and its file', (await asApp('authenticated', guru,
  `delete from storage.objects where bucket_id = 'material-files' and name = $1 returning name`, [notation])).length === 1);
check('material changes go to the audit log', (await asOwner(
  `select count(*)::int as n from audit_log where table_name = 'materials'`))[0].n >= 3);

// Own name and phone (A3)
await asApp('authenticated', late, `update profiles set full_name = '  Late Joiner  ', phone = ' +91 98765 43210 ' where id = auth.uid()`);
const [lateProfile] = await asOwner(`select full_name, phone from profiles where id = '${late}'`);
check('a student changes their own name and phone, trimmed',
  lateProfile.full_name === 'Late Joiner' && lateProfile.phone === '+91 98765 43210', JSON.stringify(lateProfile));
await refusesWith('an empty name is refused', 'name_required', () => asApp('authenticated', late, `update profiles set full_name = ' ' where id = auth.uid()`));
await refusesWith('a phone with letters is refused', 'phone_invalid', () => asApp('authenticated', late, `update profiles set phone = 'call me' where id = auth.uid()`));
check('a student cannot change someone else\'s profile', (await asApp('authenticated', late,
  `update profiles set full_name = 'X' where id = $1 returning id`, [arjun])).length === 0);

// Attendance history (S9): a student reads only their own visits.
const lateVisits = await asApp('authenticated', late, `select distinct student_id from visits`);
check('a student reads only their own visits', lateVisits.every((v) => v.student_id === registered.id), JSON.stringify(lateVisits));

// ---------------------------------------------------------------- Guru admin: roles (0014, G2)
const helper = await signUp('helper@example.com', true);
check('a coordinator cannot give a role (nothing changes)', (await asApp('authenticated', coordinator,
  `update profiles set role = 'coordinator' where id = $1 returning id`, [helper])).length === 0 && (await roleOf(helper)) === 'pending');
await asApp('authenticated', guru, `update profiles set role = 'coordinator' where id = $1`, [helper]);
check('the Guru makes a signed-up person a coordinator', (await roleOf(helper)) === 'coordinator');
await refusesWith('the app cannot turn a coordinator into a student', 'role_change_not_allowed', () =>
  asApp('authenticated', guru, `update profiles set role = 'student' where id = $1`, [helper]));
await refusesWith('the app cannot give the Guru role', 'guru_role_dashboard_only', () =>
  asApp('authenticated', guru, `update profiles set role = 'guru' where id = $1`, [pendingLogin]));
await refusesWith('the Guru cannot switch themselves off', 'not_own_role', () =>
  asApp('authenticated', guru, `update profiles set active = false where id = $1`, [guru]));
await refusesWith('a pending login becomes a student only with a student record', 'student_needs_record', () =>
  asApp('authenticated', guru, `update profiles set role = 'student' where id = $1`, [pendingLogin]));
const walkIn = await signUp('walk.in@example.com', true);
await refusesWith('a coordinator cannot link a login to a student', 'not_allowed', () =>
  asApp('authenticated', coordinator, 'select link_student_login($1, $2)', [walkIn, adult.id]));
await asApp('authenticated', guru, 'select link_student_login($1, $2)', [walkIn, adult.id]);
check('the Guru links a pending login to a student record', (await roleOf(walkIn)) === 'student'
  && (await asOwner(`select profile_id from students where id = '${adult.id}'`))[0].profile_id === walkIn);
await refusesWith('a student record with a login cannot be linked again', 'student_already_linked', () =>
  asApp('authenticated', guru, 'select link_student_login($1, $2)', [pendingLogin, adult.id]));
await refusesWith('only a pending login can be linked', 'profile_not_pending', () =>
  asApp('authenticated', guru, 'select link_student_login($1, $2)', [helper, registered.id]));
await asApp('authenticated', guru, `update profiles set duty_hours = '  Mon, Thu 16:00-19:00 ' where id = $1`, [helper]);
check('the Guru writes duty hours, trimmed',
  (await asOwner(`select duty_hours from profiles where id = '${helper}'`))[0].duty_hours === 'Mon, Thu 16:00-19:00');
await refusesWith('a coordinator cannot write their own duty hours', 'not_allowed', () =>
  asApp('authenticated', helper, `update profiles set duty_hours = 'Always' where id = auth.uid()`));

// Mentees and call tasks
const mentorOf = async (id) => (await asOwner(`select mentor_id from students where id = '${id}'`))[0].mentor_id;
await asOwner(`insert into follow_up_tasks (student_id, assignee_id, kind, due_on) values ('${adult.id}', null, 'call', today_ist())`);
const [{ n: movedCount }] = await asApp('authenticated', guru, 'select reassign_mentees($1, $2) as n', [[adult.id, registered.id], helper]);
check('the Guru moves two students to another mentor', movedCount === 2 && (await mentorOf(adult.id)) === helper && (await mentorOf(registered.id)) === helper);
const adultTask = await asOwner(`select assignee_id from follow_up_tasks where student_id = '${adult.id}' and done_at is null`);
check('a call task given to nobody goes to the new mentor', adultTask.length > 0 && adultTask.every((t) => t.assignee_id === helper), JSON.stringify(adultTask));
await refusesWith('a coordinator cannot move mentees in one step', 'not_allowed', () =>
  asApp('authenticated', coordinator, 'select reassign_mentees($1, $2)', [[adult.id], coordinator]));
await refusesWith('a pending login cannot become a mentor', 'mentor_not_staff', () =>
  asApp('authenticated', guru, 'select reassign_mentees($1, $2)', [[adult.id], pendingLogin]));
await refusesWith('... not even when a coordinator edits the student', 'mentor_not_staff', () =>
  asApp('authenticated', coordinator, `update students set mentor_id = $2 where id = $1`, [adult.id, pendingLogin]));
await refusesWith('a coordinator who still mentors students cannot be switched off', 'has_mentees', () =>
  asApp('authenticated', guru, `update profiles set active = false where id = $1`, [helper]));
await asApp('authenticated', guru, 'select reassign_mentees($1, $2)', [[adult.id, registered.id], coordinator2]);
check('... and the task follows the mentor again', (await asOwner(
  `select assignee_id from follow_up_tasks where student_id = '${adult.id}' and done_at is null`)).every((t) => t.assignee_id === coordinator2));
await asApp('authenticated', guru, `update profiles set active = false where id = $1`, [helper]);
await refusesWith('a switched-off coordinator loses the staff screens', 'not_allowed', () =>
  asApp('authenticated', helper, 'select coordinator_dashboard()'));
await asApp('authenticated', guru, `update profiles set active = true where id = $1`, [helper]);
check('the Guru switches a coordinator on again', (await asOwner(`select active from profiles where id = '${helper}'`))[0].active === true);

// ---------------------------------------------------------------- Guru admin: import (0014, G3)
const importRows = (rows) => asApp('authenticated', guru, 'select import_students($1) as r', [JSON.stringify(rows)]);
await refusesWith('a coordinator cannot import students', 'not_allowed', () =>
  asApp('authenticated', coordinator, 'select import_students($1)', [JSON.stringify([{ line: 2, full_name: 'X', dob: '1990-01-01' }])]));
const [{ r: imported }] = await importRows([
  { line: 2, full_name: '  Kavya   Reddy ', dob: '1995-03-12', phone: '98480 22222', area: 'Abids', pincode: '500001', level_id: 2, joined_on: '2024-05-01' },
  { line: 3, full_name: '', dob: '1990-01-01' },
  { line: 4, full_name: 'Bad Date', dob: 'not a date' },
  { line: 5, full_name: 'Young One', dob: `${year - 12}-01-01` },
  { line: 6, full_name: 'Same Phone', dob: '1991-01-01', phone: '+919848022222' },
  { line: 7, full_name: 'Adult Learner', dob: '1990-01-01' },
  { line: 8, full_name: 'Bad Pin', dob: '1992-02-02', pincode: '5000' },
  { line: 9, full_name: 'No Birthday' },
  { line: 10, full_name: 'Ravi Teja', dob: '1988-08-08', email: 'ravi.teja@example.com' },
]);
const byLine = new Map(imported.map((r) => [r.line, r]));
check('the import saves the good rows with roll numbers from the database',
  /^MS-2024-\d{4}$/.test(byLine.get(2)?.roll_no ?? '') && /^MS-\d{4}-\d{4}$/.test(byLine.get(10)?.roll_no ?? ''), JSON.stringify(imported));
check('... and refuses each bad row with its reason', [
  [3, 'name_required'], [4, 'dob_invalid'], [5, 'minor_use_form'], [6, 'duplicate_phone'],
  [7, 'duplicate_student'], [8, 'pincode_invalid'], [9, 'dob_required'],
].every(([line, code]) => byLine.get(line)?.error === code), JSON.stringify(imported));
const [kavya] = await asOwner(`select full_name, level_id, area, status from students where id = '${byLine.get(2).id}'`);
check('an imported row is cleaned up and starts as New', kavya.full_name === 'Kavya Reddy' && kavya.level_id === 2 && kavya.status === 'new', JSON.stringify(kavya));
const [kavyaOverview] = await asOwner(`select days_since_visit from student_overview where id = '${byLine.get(2).id}'`);
check('an old joining date does not make an imported student Irregular at once', kavyaOverview.days_since_visit === 0, JSON.stringify(kavyaOverview));
await asOwner('select refresh_student_statuses()');
check('... not for the daily job either', (await asOwner(`select status from students where id = '${byLine.get(2).id}'`))[0].status === 'new');
await refusesWith('more than 500 rows in one import are refused', 'too_many_rows', () =>
  importRows(Array.from({ length: 501 }, (_, i) => ({ line: i + 2, full_name: `P${i}`, dob: '1990-01-01' }))));

// ---------------------------------------------------------------- Guru admin: settings (0014, G10)
const settingOf = async (key) => (await asOwner(`select value from settings where key = '${key}'`))[0].value;
const [{ n: savedCount }] = await asApp('authenticated', guru, 'select save_settings($1) as n',
  [JSON.stringify({ irregular_days: 10, week_starts: 'rolling7', new_joiner_weeks: 4 })]);
const [{ ws, expected }] = await asOwner(`select week_start_ist()::text as ws, (today_ist() - 6)::text as expected`);
check('the Guru saves settings; "this week" can be the last 7 days', savedCount === 2 && (await settingOf('irregular_days')) === 10 && ws === expected,
  `${savedCount} ${ws} ${expected}`);
await refusesWith('a coordinator cannot save settings', 'not_allowed', () =>
  asApp('authenticated', coordinator, 'select save_settings($1)', [JSON.stringify({ irregular_days: 20 })]));
check('... nor change one directly (nothing changes)', (await asApp('authenticated', coordinator,
  `update settings set value = '20' where key = 'irregular_days' returning key`)).length === 0);
await refusesWith('a setting out of range is refused', 'setting_invalid', () =>
  asApp('authenticated', guru, 'select save_settings($1)', [JSON.stringify({ irregular_days: 1 })]));
await refusesWith('Irregular must come before Inactive, all or nothing', 'irregular_after_inactive', () =>
  asApp('authenticated', guru, 'select save_settings($1)', [JSON.stringify({ week_starts: 'monday', irregular_days: 40 })]));
check('... so nothing of that save stays', (await settingOf('week_starts')) === 'rolling7' && (await settingOf('irregular_days')) === 10);
await refusesWith('an unknown setting is refused', 'setting_unknown', () =>
  asApp('authenticated', guru, 'select save_settings($1)', [JSON.stringify({ colour: 'blue' })]));
await refusesWith('the app cannot delete a setting', 'setting_required', () =>
  asApp('authenticated', guru, `delete from settings where key = 'retry_days'`));
await asApp('authenticated', guru, 'select save_settings($1)', [JSON.stringify({ irregular_days: 14, week_starts: 'monday' })]);
check('settings changes go to the audit log by key', (await asOwner(
  `select count(*)::int as n from audit_log where table_name = 'settings' and row_id = 'week_starts'`))[0].n === 2);
await refusesWith('a centre cannot close before it opens', 'window_invalid', () =>
  asApp('authenticated', guru, `update centres set opens_at = '21:00', closes_at = '20:00' where id = 1`));
await asApp('authenticated', guru, `update centres set opens_at = '15:00', closes_at = '20:30' where id = 1`);
check('the Guru changes the open window, and it is logged', (await asOwner(
  `select count(*)::int as n from audit_log where table_name = 'centres'`))[0].n === 1);
await asApp('authenticated', guru, `update centres set opens_at = '14:30', closes_at = '20:00' where id = 1`);

// ---------------------------------------------------------------- Guru admin: audit log (0014, G11)
// Since 0034 through get_audit_log (each page read is logged), not from the table.
check('the Guru reads the audit log', (await asApp('authenticated', guru, 'select id from get_audit_log(p_limit => 5)')).length === 5);
check('coordinators and students read none of it', (await asApp('authenticated', coordinator, 'select id from audit_log')).length === 0
  && (await asApp('authenticated', late, 'select id from audit_log')).length === 0);
check('app roles cannot run the admin trigger functions', (await asOwner(`select
  has_function_privilege('authenticated', 'guard_profile_admin()', 'execute')
  or has_function_privilege('authenticated', 'follow_mentor_tasks()', 'execute')
  or has_function_privilege('authenticated', 'guard_setting()', 'execute')
  or has_function_privilege('anon', 'import_students(jsonb)', 'execute') as ok`))[0].ok === false);

// ---------------------------------------------------------------- notifications inbox (0015, A2)
/** The notices `userId` can read, newest first. */
const noticesOf = async (userId) => asApp('authenticated', userId,
  'select id, kind, title, url, announcement_id, read_at from notifications order by visible_at desc, id desc');
const unreadOf = async (userId) => (await asApp('authenticated', userId, 'select inbox_unread_count() as n'))[0].n;
const inboxNews = await post(coordinator, { title: 'Inbox news', body: 'Class closes early on Friday.', audience: 'all' });
const arjunNotice = (await noticesOf(arjun)).find((n) => n.announcement_id === inboxNews.id);
check('an announcement to all puts a notice in a student\'s inbox', arjunNotice?.kind === 'announcement'
  && arjunNotice.title === 'Inbox news' && arjunNotice.url === `/student/announcements/${inboxNews.id}` && arjunNotice.read_at === null,
  JSON.stringify(arjunNotice));
check('... not in the author\'s inbox, nor in staff inboxes when it is for students',
  !(await noticesOf(coordinator)).some((n) => n.announcement_id === inboxNews.id)
  && !(await noticesOf(guru)).some((n) => n.announcement_id === inboxNews.id));
const inboxStaff = await post(coordinator, { title: 'Inbox staff', body: 'Meeting.', audience: 'staff' });
check('a staff announcement opens the staff screen from the Guru\'s inbox',
  (await noticesOf(guru)).find((n) => n.announcement_id === inboxStaff.id)?.url === `/staff/announcements/${inboxStaff.id}`);
const [inboxLater] = await asApp('authenticated', coordinator,
  `insert into announcements (title, body, audience, publish_at) values ('Inbox later', 'Soon.', 'all', now() + interval '1 day') returning id`);
const arjunUnreadBefore = await unreadOf(arjun);
check('a scheduled announcement\'s notice stays hidden until its time',
  !(await noticesOf(arjun)).some((n) => n.announcement_id === inboxLater.id)
  && (await asOwner(`select count(*)::int as n from notifications where announcement_id = ${inboxLater.id} and profile_id = '${arjun}'`))[0].n === 1);
await asApp('authenticated', arjun, 'insert into announcement_reads (announcement_id) values ($1)', [inboxNews.id]);
check('opening the announcement marks its notice read',
  (await noticesOf(arjun)).find((n) => n.announcement_id === inboxNews.id)?.read_at !== null
  && (await unreadOf(arjun)) === arjunUnreadBefore - 1, `${arjunUnreadBefore} -> ${await unreadOf(arjun)}`);
await asApp('authenticated', coordinator, `update announcements set title = 'Inbox news, edited' where id = $1`, [inboxNews.id]);
check('an edited title shows in the inbox', (await noticesOf(arjun)).find((n) => n.announcement_id === inboxNews.id)?.title === 'Inbox news, edited');
await asApp('authenticated', coordinator, `update announcements set audience = 'level', audience_level = 1 where id = $1`, [inboxLater.id]);
check('a changed audience moves the notices (level 3 student out, level 1 student in)',
  (await asOwner(`select count(*)::int as n from notifications where announcement_id = ${inboxLater.id} and profile_id = '${arjun}'`))[0].n === 0
  && (await asOwner(`select count(*)::int as n from notifications where announcement_id = ${inboxLater.id} and profile_id = '${late}'`))[0].n === 1);
const seenBeforeMarkAll = (await seenOf(coordinator, inboxStaff.id)).seen;
const [{ n: markedAll }] = await asApp('authenticated', guru, 'select mark_notifications_read(null) as n');
check('"Mark all read" empties the unread count', markedAll >= 1 && (await unreadOf(guru)) === 0, String(markedAll));
check('... without marking the announcements as seen', (await seenOf(coordinator, inboxStaff.id)).seen === seenBeforeMarkAll);
const meeraNotice = (await asOwner(`select id from notifications where profile_id = '${meera}' and read_at is null limit 1`))[0];
check('marking someone else\'s notice changes nothing', meeraNotice !== undefined
  && (await asApp('authenticated', arjun, 'select mark_notifications_read($1) as n', [[meeraNotice.id]]))[0].n === 0);
check('a person reads only their own notices', (await noticesOf(arjun)).length > 0
  && (await asApp('authenticated', arjun, `select count(*)::int as n from notifications where profile_id <> auth.uid()`))[0].n === 0);
await refusesWith('the app cannot write a notice', 'permission denied for table notifications', () => asApp('authenticated', guru,
  `insert into notifications (profile_id, kind, title, url) values ($1, 'notice', 'Fake', '/student')`, [arjun]));
await refusesWith('... nor change one directly', 'permission denied for table notifications', () => asApp('authenticated', arjun, 'update notifications set read_at = now()'));
await refusesWith('a login without a role cannot mark notices', 'not_allowed', () => asApp('authenticated', pendingLogin, 'select mark_notifications_read(null)'));
await refusesWith('anon cannot count notices', 'permission denied for function inbox_unread_count', () => asApp('anon', null, 'select inbox_unread_count()'));
await asApp('authenticated', coordinator, 'delete from announcements where id = $1', [inboxNews.id]);
check('deleting an announcement takes its notices away',
  (await asOwner(`select count(*)::int as n from notifications where announcement_id = ${inboxNews.id}`))[0].n === 0);

// ---------------------------------------------------------------- reports (0015, C21 / G8)
const [reportLearner] = await asOwner(`insert into students (full_name, dob, level_id, mentor_id)
  values ('Report Learner', '1990-05-05', 1, '${coordinator2}') returning id`);
await asOwner(`insert into visits (student_id, method, check_in, check_out)
  values ('${reportLearner.id}', 'manual', now() - interval '3 hours', now() - interval '90 minutes')`);
await asOwner(`insert into follow_up_tasks (student_id, assignee_id, kind, due_on) values ('${reportLearner.id}', '${coordinator2}', 'call', today_ist())`);
const [firstBeginnerItem] = await asOwner('select id from syllabus_items where level_id = 1 and retired_at is null order by sort limit 1');
await asOwner(`insert into student_progress (student_id, item_id) values ('${reportLearner.id}', ${firstBeginnerItem.id})`);
const report = async (userId, from, to, mentor = null) =>
  (await asApp('authenticated', userId, 'select class_report($1::date, $2::date, $3::uuid) as r', [from, to, mentor]))[0].r;
const [{ today: todayText, monthAgo }] = await asOwner(`select today_ist()::text as today, (today_ist() - 30)::text as "monthAgo"`);
const myReport = await report(coordinator2, monthAgo, todayText);
check('a coordinator\'s report holds only their mentees', myReport.rows.length > 0 && myReport.rows.every((r) => r.mentor_id === coordinator2),
  String(myReport.rows.length));
const learnerRow = myReport.rows.find((r) => r.id === reportLearner.id);
check('... with each student\'s visits, hours, calls and progress',
  learnerRow?.visits === 1 && Number(learnerRow.hours) === 1.5 && learnerRow.syllabus_done === 1 && learnerRow.syllabus_total > 0,
  JSON.stringify(learnerRow));
check('... weeks and months add up to the visits of the range',
  myReport.by_week.reduce((t, w) => t + w.visits, 0) === myReport.visits && myReport.by_month.reduce((t, m) => t + m.visits, 0) === myReport.visits
  && myReport.visits >= 1, `${myReport.visits}`);
check('... the call due and the new joiner are counted', myReport.calls_due >= 1 && myReport.new_joiners >= 1, `${myReport.calls_due} ${myReport.new_joiners}`);
check('... and the tick of the range shows under the level',
  myReport.by_level.find((l) => l.level_id === 1)?.ticks_in_range >= 1, JSON.stringify(myReport.by_level));
const everyone = await report(guru, monthAgo, todayText);
const guruBoard = (await asApp('authenticated', guru, 'select guru_dashboard() as d'))[0].d;
check('the Guru\'s report counts the class as the Guru home does',
  everyone.in_class === guruBoard.in_class
  && JSON.stringify(everyone.by_status) === JSON.stringify(guruBoard.by_status), `${everyone.in_class} vs ${guruBoard.in_class}`);
check('the Guru can narrow the report to one coordinator\'s mentees',
  (await report(guru, monthAgo, todayText, coordinator2)).rows.length === myReport.rows.length);
await refusesWith('a coordinator cannot read another coordinator\'s report', 'not_allowed', () => report(coordinator2, monthAgo, todayText, coordinator));
await refusesWith('a student has no reports', 'not_allowed', () => report(arjun, monthAgo, todayText));
await refusesWith('a range that ends before it starts is refused', 'range_invalid', () => report(guru, todayText, monthAgo));
await refusesWith('a range longer than a year is refused', 'range_too_long', () => report(guru, '2024-01-01', todayText));

// ---------------------------------------------------------------- centres (0015, G9)
const [koti] = await asApp('authenticated', guru, `insert into centres (name, address, lat, lng, radius_m)
  values ('  Koti   Centre ', ' Near the bus stand ', 17.385044123, 78.486671987, 200) returning id, name, address, lat, lng`);
check('the Guru adds a centre with its point, cleaned up', koti.name === 'Koti Centre' && koti.address === 'Near the bus stand'
  && koti.lat === 17.385044 && koti.lng === 78.486672, JSON.stringify(koti));
await refusesWith('a coordinator cannot add a centre', 'new row violates row-level security policy for table "centres"', () =>
  asApp('authenticated', coordinator, `insert into centres (name) values ('Secunderabad')`));
await refusesWith('a second centre with the same name is refused', 'centre_name_taken', () =>
  asApp('authenticated', guru, `insert into centres (name) values ('ABIDS')`));
await refusesWith('latitude without longitude is refused', 'location_incomplete', () =>
  asApp('authenticated', guru, `update centres set lat = 17.4, lng = null where id = $1`, [koti.id]));
await refusesWith('a point outside the globe is refused', 'location_invalid', () =>
  asApp('authenticated', guru, `update centres set lat = 117.4, lng = 78.4 where id = $1`, [koti.id]));
await refusesWith('a radius below 25 m is refused', 'radius_invalid', () =>
  asApp('authenticated', guru, `update centres set radius_m = 10 where id = $1`, [koti.id]));
await asApp('authenticated', guru, `update centres set active = false where id = $1`, [koti.id]);
await refusesWith('the last centre in use cannot be switched off', 'last_centre', () =>
  asApp('authenticated', guru, `update centres set active = false where id = 1`));
await refusesWith('the app never deletes a centre', 'centre_delete_not_allowed', () =>
  asApp('authenticated', guru, `delete from centres where id = $1`, [koti.id]));
check('centre changes are in the audit log', (await asOwner(
  `select count(*)::int as n from audit_log where table_name = 'centres' and row_id = '${koti.id}'`))[0].n === 2);
check('app roles cannot run the inbox and centre trigger functions', (await asOwner(`select
  has_function_privilege('authenticated', 'inbox_sync_announcement(bigint)', 'execute')
  or has_function_privilege('authenticated', 'inbox_cleanup()', 'execute')
  or has_function_privilege('authenticated', 'guard_centre_details()', 'execute')
  or has_function_privilege('anon', 'class_report(date, date, uuid)', 'execute') as ok`))[0].ok === false);
await asOwner('select inbox_cleanup()');

// ---------------------------------------------------------------- promotion approval (0017, Phase 2)
// Meera (level 2, the coordinator's mentee) has the accepted level-up recording sub3 from above.
const criteria = async (userId, studentId) =>
  (await asApp('authenticated', userId, 'select promotion_criteria($1) as c', [studentId]))[0].c;
await refusesWith('a student cannot run the criteria check', 'not_allowed', () => criteria(meera, meeraStudent));
const pc0 = await criteria(coordinator, meeraStudent);
check('criteria: level 2 → 3, the level-up recording found, 8 visits in 8 weeks needed', pc0.level_id === 2
  && pc0.next_level_id === 3 && pc0.level_up?.submission_id === sub3 && pc0.level_up_ok === true
  && pc0.visits_needed === 8 && pc0.visit_weeks === 8 && pc0.syllabus_percent === 100 && pc0.all_ok === false, JSON.stringify(pc0));
await asOwner(`insert into student_progress (student_id, item_id)
  select '${meeraStudent}', id from syllabus_items where level_id = 2 and retired_at is null on conflict do nothing`);
await asOwner(`insert into visits (student_id, check_in, check_out, method)
  select '${meeraStudent}', now() - make_interval(days => d * 5 + 1), now() - make_interval(days => d * 5 + 1) + interval '1 hour', 'manual'
    from generate_series(1, 8) d`);
const pc1 = await criteria(coordinator, meeraStudent);
check('... with the syllabus ticked and 8 visits every criterion is met', pc1.syllabus_ok && pc1.visits_ok && pc1.all_ok
  && pc1.syllabus_done === pc1.syllabus_total && pc1.visits >= 8 && pc1.taught_by.includes(coordinator), JSON.stringify(pc1));
const readyFor = async (userId) => (await asApp('authenticated', userId, 'select student_id from promotion_ready_students()'))
  .map((r) => r.student_id);
check('Meera is ready to nominate for her mentor and the Guru, not for another coordinator',
  (await readyFor(coordinator)).includes(meeraStudent) && (await readyFor(guru)).includes(meeraStudent)
  && !(await readyFor(coordinator2)).includes(meeraStudent));
check('Arjun (top level) is never on the ready list', !(await readyFor(guru)).includes(arjunStudent));
const home = async (userId) => (await asApp('authenticated', userId, 'select promotion_home() as h'))[0].h;
check('the coordinator\'s home counts one student ready', (await home(coordinator)).ready === 1);

const nominate = (userId, studentId, reason, ask = []) => asApp('authenticated', userId,
  'select nominate_for_promotion($1, $2, $3::uuid[]) as id', [studentId, reason, ask]).then((r) => r[0].id);
await refusesWith('a student cannot nominate', 'not_allowed', () => nominate(meera, meeraStudent, 'Me'));
await refusesWith('the top level cannot be nominated', 'top_level', () => nominate(coordinator, arjunStudent, 'Great'));
await refusesWith('a nomination needs a reason', 'reason_required', () => nominate(coordinator, meeraStudent, '   '));
const nom1 = await nominate(coordinator, meeraStudent, '  Steady in all taals.  ', [coordinator2, guru, meera, coordinator]);
const [n1] = await asOwner(`select * from promotion_nominations where id = ${nom1}`);
check('the coordinator nominates Meera for level 3 with the level-up recording; only other coordinators are asked',
  n1.from_level === 2 && n1.to_level === 3 && Number(n1.submission_id) === sub3 && n1.reason === 'Steady in all taals.'
  && n1.criteria.all_ok === true && n1.asked.length === 1 && n1.asked[0] === coordinator2 && n1.status === 'open',
  JSON.stringify({ ...n1, criteria: undefined }));
const answers = async (nom) => asOwner(`select coordinator_id, rating, comment from promotion_feedback where nomination_id = ${nom} order by created_at`);
const a1 = await answers(nom1);
check('... and the nominating coordinator\'s own answer is Ready', a1.length === 1 && a1[0].coordinator_id === coordinator
  && a1[0].rating === 'ready', JSON.stringify(a1));
const pushesTo = async (userId, url) => (await asOwner(`select count(*)::int as n from push_outbox
  where profile_id = '${userId}' and url = '${url}'`))[0].n;
check('the asked coordinator gets a notification', (await pushesTo(coordinator2, `/staff/promotion/${nom1}`)) === 1);
await refusesWith('one open nomination per student', 'already_nominated', () => nominate(coordinator2, meeraStudent, 'Again'));
check('a student sees no nominations or answers', (await asApp('authenticated', meera, 'select id from promotion_nominations')).length === 0
  && (await asApp('authenticated', meera, 'select rating from promotion_feedback')).length === 0);
check('another coordinator sees the nomination', (await asApp('authenticated', coordinator2, 'select id from promotion_nominations')).length >= 1);
await refusesWith('the app cannot write a nomination directly', 'permission denied for table promotion_nominations', () => asApp('authenticated', coordinator,
  `insert into promotion_nominations (student_id, from_level, to_level, reason) values ($1, 2, 3, 'x')`, [meeraStudent]));
await refusesWith('... nor an answer', 'permission denied for table promotion_feedback', () => asApp('authenticated', coordinator2,
  `insert into promotion_feedback (nomination_id, coordinator_id, rating, comment) values ($1, auth.uid(), 'ready', 'x')`, [nom1]));
await refusesWith('a coordinator cannot change a student\'s level', 'level_guru_only', () =>
  asApp('authenticated', coordinator, 'update students set level_id = 3 where id = $1', [meeraStudent]));

const decide = (userId, nom, decision, note = null, after = null) => asApp('authenticated', userId,
  'select decide_promotion($1, $2, $3, $4::date)', [nom, decision, note, after]);
await refusesWith('the Guru cannot promote before 2 coordinators answered', 'feedback_needed', () => decide(guru, nom1, 'promote'));
const answer = (userId, nom, rating, comment) => asApp('authenticated', userId,
  'select give_promotion_feedback($1, $2, $3)', [nom, rating, comment]);
await refusesWith('the Guru does not answer, the Guru decides', 'not_allowed', () => answer(guru, nom1, 'ready', 'Yes'));
await refusesWith('an answer is ready, almost or not yet', 'rating_invalid', () => answer(coordinator2, nom1, 'maybe', 'Hm'));
await refusesWith('an answer needs a comment', 'comment_required', () => answer(coordinator2, nom1, 'almost', ' '));
await answer(coordinator2, nom1, 'almost', 'Tempo drifts in the fast part.');
check('with 2 answers the Guru is told', (await pushesTo(guru, `/staff/promotion/${nom1}`)) === 1);
await answer(coordinator2, nom1, 'ready', 'Better this week.');
const a2 = await answers(nom1);
check('answering again changes the answer; the Guru is not told twice', a2.length === 2 && a2[1].rating === 'ready'
  && a2[1].comment === 'Better this week.' && (await pushesTo(guru, `/staff/promotion/${nom1}`)) === 1, JSON.stringify(a2));
const [q1] = await asApp('authenticated', guru, 'select answers, ready, almost, not_yet, answers_needed, full_name from promotion_queue where id = $1', [nom1]);
check('the queue shows the answers and how many are needed', q1?.answers === 2 && q1.ready === 2 && q1.almost === 0
  && q1.answers_needed === 2 && q1.full_name === 'Meera Iyer', JSON.stringify(q1));
check('the Guru\'s home counts one to decide', (await home(guru)).to_decide === 1);
await refusesWith('a coordinator cannot decide', 'not_allowed', () => decide(coordinator, nom1, 'promote'));
await refusesWith('a decision is promote, not yet or more', 'decision_invalid', () => decide(guru, nom1, 'maybe'));
await refusesWith('More feedback says what about', 'note_required', () => decide(guru, nom1, 'more', ' '));
await decide(guru, nom1, 'more', 'Listen to her chhanda once more.');
const [m1] = await asOwner(`select status, more_note, ready_notified_at from promotion_nominations where id = ${nom1}`);
check('More feedback keeps it open with the Guru\'s note', m1.status === 'open' && m1.more_note === 'Listen to her chhanda once more.'
  && m1.ready_notified_at === null, JSON.stringify(m1));
await answer(coordinator2, nom1, 'ready', 'Chhanda is fine.');
check('... and the next answer tells the Guru again', (await pushesTo(guru, `/staff/promotion/${nom1}`)) === 2);
await refusesWith('only the nominator or the Guru may withdraw', 'not_allowed', () =>
  asApp('authenticated', coordinator2, 'select withdraw_nomination($1)', [nom1]));

await decide(guru, nom1, 'promote', 'Well earned.');
const [meeraNow] = await asOwner(`select level_id from students where id = '${meeraStudent}'`);
const [hist] = await asOwner(`select from_level, to_level, approved_by from level_history where student_id = '${meeraStudent}' order by id desc limit 1`);
const [n1After] = await asOwner(`select status, decided_by, level_history_id from promotion_nominations where id = ${nom1}`);
check('Promote: Meera is at level 3, with a level-history row approved by the Guru', meeraNow.level_id === 3
  && hist.from_level === 2 && hist.to_level === 3 && hist.approved_by === guru && n1After.status === 'promoted'
  && n1After.decided_by === guru && n1After.level_history_id !== null, JSON.stringify({ meeraNow, hist, n1After }));
check('... Meera and the nominator are told', (await pushesTo(meera, '/student/progress')) === 1
  && (await pushesTo(coordinator, `/staff/promotion/${nom1}`)) === 1);
await refusesWith('a decided nomination takes no more answers', 'nomination_closed', () => answer(coordinator2, nom1, 'ready', 'x'));
await refusesWith('... nor a second decision', 'nomination_closed', () => decide(guru, nom1, 'promote'));

// Not yet, and nominating again after the date.
const nom2 = await nominate(guru, lateStudent, 'Ready early? Please look.');
check('the Guru may nominate too, without an answer of their own; unmet criteria are kept',
  (await answers(nom2)).length === 0 && (await asOwner(`select criteria from promotion_nominations where id = ${nom2}`))[0].criteria.all_ok === false);
await refusesWith('Not yet needs guidance', 'note_required', () => decide(guru, nom2, 'not_yet', ' ', '2099-01-01'));
await refusesWith('... and a date', 'date_required', () => decide(guru, nom2, 'not_yet', 'Practise the bols.'));
await refusesWith('... in the future', 'date_past', () => decide(guru, nom2, 'not_yet', 'Practise the bols.', yesterday));
await refusesWith('... at most a year ahead', 'date_too_far', () => decide(guru, nom2, 'not_yet', 'Practise the bols.', '2099-01-01'));
await decide(guru, nom2, 'not_yet', 'Practise the bols.', tomorrow);
const [n2] = await asOwner(`select status, guidance, renominate_after::text as d from promotion_nominations where id = ${nom2}`);
check('Not yet keeps the guidance and the date', n2.status === 'not_yet' && n2.guidance === 'Practise the bols.' && n2.d === tomorrow,
  JSON.stringify(n2));
await refusesWith('before that date the student cannot be nominated again', 'too_soon', () => nominate(coordinator, lateStudent, 'Again'));
await asOwner(`update promotion_nominations set renominate_after = today_ist() - 1 where id = ${nom2}`);
const nom3 = await nominate(coordinator, lateStudent, 'Practised the bols.');
await asApp('authenticated', coordinator, 'select withdraw_nomination($1)', [nom3]);
check('after the date a new nomination is possible, and the nominator can withdraw it',
  (await asOwner(`select status from promotion_nominations where id = ${nom3}`))[0].status === 'withdrawn');

// Keeping the level-up recording: until 30 days after the decision.
check('the level-up recording is kept right after the decision',
  (await asApp('service_role', null, 'select * from claim_expired_submission_files()')).length === 0);
await asOwner(`update promotion_nominations set decided_at = now() - interval '31 days' where id = ${nom1}`);
const expiredLevelUp = await asApp('service_role', null, 'select * from claim_expired_submission_files()');
check('... and handed for deleting 30 days after it', expiredLevelUp.length === 1 && expiredLevelUp[0].path === take2,
  JSON.stringify(expiredLevelUp));
const [{ ok: promotionFnsCallable }] = await asOwner(`select has_function_privilege('authenticated', 'queue_staff_push(uuid[], text, text, text)', 'execute')
  or has_function_privilege('authenticated', 'promotion_tell_guru(bigint)', 'execute')
  or has_function_privilege('authenticated', 'queue_student_promoted(uuid)', 'execute')
  or has_function_privilege('anon', 'promotion_criteria(uuid)', 'execute') as ok`);
check('app roles cannot run the promotion queue helpers; anon runs nothing', promotionFnsCallable === false);

// ---------------------------------------------------------------- practice tools (0018, Phase 2)
const taalsSeen = async (userId) => asApp('authenticated', userId, 'select id, name, beats, placeholder from taals order by sort');
const seededTaals = await taalsSeen(arjun);
check('three placeholder taals are seeded and a student reads them', seededTaals.length === 3
  && seededTaals.every((tl) => tl.placeholder) && seededTaals.map((tl) => tl.beats).join() === '8,6,16', JSON.stringify(seededTaals));
await refusesWith('anon reads no taals', 'permission denied for table taals', () => asApp('anon', null, 'select id from taals'));
const addTaal = (userId, name, bols, divisions, marks) => asApp('authenticated', userId,
  'insert into taals (name, bols, divisions, marks) values ($1, $2::text[], $3::smallint[], $4::text[]) returning id, beats, bols',
  [name, bols, divisions, marks]).then((r) => r[0]);
await refusesWith('a coordinator cannot add a taal', 'new row violates row-level security policy for table "taals"', () => addTaal(coordinator, 'Mine', ['tā', 'ka'], [2], ['X']));
await refusesWith('a student cannot change a taal', 'no row changed (row-level security)', async () => {
  const rows = await asApp('authenticated', arjun, `update taals set name = 'Hacked' where id = $1 returning id`, [seededTaals[0].id]);
  if (rows.length === 0) throw new Error('no row changed (row-level security)');
});
await refusesWith('vibhags must add up to the beats', 'taal_divisions_invalid', () =>
  addTaal(guru, 'Bad', ['tā', 'ka', 'tā'], [2, 2], ['X', '0']));
await refusesWith('one mark per vibhag, X first', 'taal_marks_invalid', () =>
  addTaal(guru, 'Bad', ['tā', 'ka', 'tā', 'ka'], [2, 2], ['0', 'X']));
await refusesWith('a beat is a rest or up to 4 bols joined with a dot', 'taal_bols_invalid', () =>
  addTaal(guru, 'Bad', ['tā', 'ka tā'], [2], ['X']));
await refusesWith('a taal has a name', 'taal_name_invalid', () => addTaal(guru, '  ', ['tā', 'ka'], [2], ['X']));
const newTaal = await addTaal(guru, '  Test four  ', ['Dhā', '-', 'te.re', 'ka'], [2, 2], ['X', '0']);
check('the Guru adds a taal: beats counted, bols lower-cased', newTaal.beats === 4 && newTaal.bols.join(' ') === 'dhā - te.re ka',
  JSON.stringify(newTaal));
await asApp('authenticated', guru, 'update taals set active = false where id = $1', [newTaal.id]);
check('a switched-off taal is hidden from students, not from staff',
  !(await taalsSeen(arjun)).some((tl) => tl.id === newTaal.id) && (await taalsSeen(coordinator)).some((tl) => tl.id === newTaal.id));
check('taal changes are in the audit log',
  (await asOwner(`select count(*)::int as n from audit_log where table_name = 'taals' and row_id = '${newTaal.id}'`))[0].n === 2);

const logPractice = (userId, minutes, source, day = null, startedAt = null, taal = null, note = null) => asApp('authenticated', userId,
  'select log_practice($1, $2, $3::date, $4::timestamptz, $5, $6) as id', [minutes, source, day, startedAt, taal, note]).then((r) => r[0].id);
const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
await refusesWith('a coordinator has no practice log', 'not_allowed', () => logPractice(coordinator, 10, 'manual'));
await refusesWith('practice is 1-240 minutes', 'minutes_invalid', () => logPractice(arjun, 0, 'manual'));
await refusesWith('the timer cannot claim more than the time since it started', 'started_invalid', () =>
  logPractice(arjun, 30, 'timer', null, minutesAgo(10)));
await refusesWith('... nor start more than 6 hours ago', 'started_invalid', () => logPractice(arjun, 30, 'timer', null, minutesAgo(400)));
await refusesWith('a typed entry is for the last 14 days', 'date_invalid', () => logPractice(arjun, 20, 'manual', '2020-01-01'));
await refusesWith('... not the future', 'date_invalid', () => logPractice(arjun, 20, 'manual', tomorrow));
await refusesWith('a switched-off taal cannot be logged', 'taal_not_found', () => logPractice(arjun, 20, 'manual', null, null, newTaal.id));
const timerLog = await logPractice(arjun, 25, 'timer', '2020-01-01', minutesAgo(25), seededTaals[0].id);
const [tl1] = await asOwner(`select practised_on::text as d, source, taal_id from practice_logs where id = ${timerLog}`);
const [{ d: todayIst }] = await asOwner('select today_ist()::text as d');
check('the timer logs 25 minutes today (its own day, whatever the app sends)', tl1.d === todayIst && tl1.source === 'timer'
  && Number(tl1.taal_id) === seededTaals[0].id, JSON.stringify(tl1));
await logPractice(arjun, 40, 'manual', yesterday, null, null, '  Kirtan with my brother ');
await refusesWith('at most 12 hours on one day', 'day_full', () => logPractice(arjun, 240, 'manual', yesterday)
  .then(() => logPractice(arjun, 240, 'manual', yesterday)).then(() => logPractice(arjun, 240, 'manual', yesterday)));
await refusesWith('the app cannot write practice_logs directly', 'permission denied for table practice_logs', () => asApp('authenticated', arjun,
  `insert into practice_logs (student_id, practised_on, minutes, source) values ($1, current_date, 5, 'manual')`, [arjunStudent]));
check('a student sees only their own practice', (await asApp('authenticated', meera, 'select id from practice_logs')).length === 0
  && (await asApp('authenticated', arjun, 'select id from practice_logs')).length >= 3);
const weeksOf = (userId, studentId) => asApp('authenticated', userId, 'select week_start::text as w, minutes, entries from practice_weeks($1, 4)', [studentId]);
const coordWeeks = await weeksOf(coordinator, arjunStudent);
const total = coordWeeks.reduce((sum, w) => sum + w.minutes, 0);
check('the coordinator sees Arjun\'s weekly minutes: 4 weeks, newest first, Mondays', coordWeeks.length === 4
  && coordWeeks[0].w > coordWeeks[1].w && new Date(`${coordWeeks[0].w}T00:00:00Z`).getUTCDay() === 1 && total === 25 + 40 + 240 + 240,
  JSON.stringify(coordWeeks));
check('another student gets zeros for Arjun', (await weeksOf(meera, arjunStudent)).every((w) => w.minutes === 0));
await refusesWith('a student cannot delete another\'s entry', 'not_allowed', () =>
  asApp('authenticated', meera, 'select delete_practice($1)', [timerLog]));
await asOwner(`update practice_logs set practised_on = today_ist() - 20 where id = ${timerLog}`);
await refusesWith('... nor their own after 14 days', 'too_old', () => asApp('authenticated', arjun, 'select delete_practice($1)', [timerLog]));
const [{ id: recentLog }] = await asOwner(`select id from practice_logs where student_id = '${arjunStudent}' and practised_on = '${yesterday}' limit 1`);
await asApp('authenticated', arjun, 'select delete_practice($1)', [recentLog]);
check('a student deletes their own recent entry', (await asOwner(`select id from practice_logs where id = ${recentLog}`)).length === 0);
await asApp('authenticated', guru, 'delete from taals where id = $1', [seededTaals[0].id]);
check('deleting a taal keeps the practice minutes', (await asOwner(`select taal_id from practice_logs where id = ${timerLog}`))[0].taal_id === null);
const [{ ok: practiceFnsOpen }] = await asOwner(`select has_function_privilege('anon', 'log_practice(int, text, date, timestamptz, bigint, text)', 'execute')
  or has_function_privilege('anon', 'practice_weeks(uuid, int)', 'execute')
  or has_function_privilege('authenticated', 'guard_taal()', 'execute') as ok`);
check('anon runs no practice function; the guard is not callable', practiceFnsOpen === false);

// ---------------------------------------------------------------- Phase 2 notices in the inbox (0019)
const [{ n: outboxWithoutNotice }] = await asOwner(`select count(*)::int as n from push_outbox o
  where not exists (select 1 from notifications n where n.profile_id = o.profile_id and n.url = o.url
    and n.title = o.title and n.body = left(o.body, 300) and n.visible_at = o.created_at and n.announcement_id is null)`);
const [{ n: outboxRows }] = await asOwner('select count(*)::int as n from push_outbox');
check('every queued assessment and promotion notice is also in the inbox', outboxRows > 0 && outboxWithoutNotice === 0,
  `${outboxRows} rows, ${outboxWithoutNotice} missing`);
const p2Kinds = await asOwner(`select distinct kind, url ~ '^/(student|staff)/assessments/' as a,
  url ~ '^/staff/promotion/' or url = '/student/progress' as p from notifications where announcement_id is null`);
check('assessment notices are kind assessment, promotion notices kind promotion',
  p2Kinds.length >= 2 && p2Kinds.every((r) => (r.kind === 'assessment' && r.a) || (r.kind === 'promotion' && r.p)), JSON.stringify(p2Kinds));
const kindOf = async (url) => (await asOwner(`select inbox_kind_for_url('${url}') as k`))[0].k;
check('the kind follows the screen it opens', (await kindOf('/staff/assessments/review/3')) === 'assessment'
  && (await kindOf('/student/progress')) === 'promotion' && (await kindOf('/staff/promotion/2')) === 'promotion'
  && (await kindOf('/somewhere/else')) === 'notice');
const meeraBefore = (await asApp('authenticated', meera, 'select inbox_unread_count() as n'))[0].n;
await asOwner(`insert into push_outbox (profile_id, title, body, url) values ('${meera}', 'Inbox check', 'A new assessment.', '/student/assessments/1')`);
const meeraNotices = await asApp('authenticated', meera,
  `select kind, url, read_at from notifications where title = 'Inbox check'`);
check('a student sees a new assessment notice in their own inbox, unread',
  meeraNotices.length === 1 && meeraNotices[0].kind === 'assessment' && meeraNotices[0].read_at === null
  && (await asApp('authenticated', meera, 'select inbox_unread_count() as n'))[0].n === meeraBefore + 1, JSON.stringify(meeraNotices));
check('another student does not see it', (await asApp('authenticated', arjun,
  `select id from notifications where title = 'Inbox check'`)).length === 0);
await refusesWith('the app cannot write inbox rows itself', 'permission denied for table notifications', () => asApp('authenticated', meera,
  `insert into notifications (profile_id, kind, title, url) values (auth.uid(), 'assessment', 'x', '/student/assessments/1')`));
check('app roles cannot run the outbox trigger function', (await asOwner(`select
  has_function_privilege('authenticated', 'inbox_on_push_outbox()', 'execute')
  or has_function_privilege('anon', 'inbox_kind_for_url(text)', 'execute') as ok`))[0].ok === false);
check('table descriptions carry the Phase 2 numbers used on main', (await asOwner(`select
  obj_description('assessments'::regclass) like '%#52)%' and obj_description('promotion_nominations'::regclass) like '%#53)%'
  and obj_description('taals'::regclass) like '%#54)%' as ok`))[0].ok === true);

// ---------------------------------------------------------------- media (0020, Phase 2)
const addVideo = async (userId, url, panes, kind = 'video') => (await asApp('authenticated', userId,
  `insert into materials (title, kind, url, level_id, panes) values ('Three angles', $1, $2, 1, $3) returning *`,
  [kind, url, panes]))[0];
const fileVideo = await addVideo(guru, ' https://cdn.example.org/lessons/kaherva-3-angles.mp4?v=2 ', 3);
check('the Guru adds a lesson video file with 3 panes; link trimmed', fileVideo.kind === 'video' && fileVideo.panes === 3
  && fileVideo.url === 'https://cdn.example.org/lessons/kaherva-3-angles.mp4?v=2' && fileVideo.approved_by === guru, JSON.stringify(fileVideo));
await refusesWith('a video link must point to a video file', 'video_link_invalid', () =>
  addVideo(guru, 'https://cdn.example.org/lessons/kaherva.html', 1));
await refusesWith('... over https', 'video_link_invalid', () => addVideo(guru, 'http://cdn.example.org/a.mp4', 1));
await refusesWith('a YouTube lesson has no panes (its player may not be zoomed)', 'panes_invalid', () =>
  addVideo(guru, 'https://youtu.be/dQw4w9WgXcQ', 2, 'youtube'));
await refusesWith('at most 4 panes', 'panes_invalid', () => addVideo(guru, 'https://cdn.example.org/a.mp4', 5));
check('a student of the level sees the video file', (await asApp('authenticated', late, 'select panes from materials where id = $1',
  [fileVideo.id]))[0]?.panes === 3);
await asApp('authenticated', guru, 'update materials set panes = 2 where id = $1', [fileVideo.id]);
check('the Guru changes the panes', (await asOwner(`select panes from materials where id = ${fileVideo.id}`))[0].panes === 2);
await asApp('authenticated', guru, 'delete from materials where id = $1', [fileVideo.id]);

const voiceTask = await createAssessment(guru, { title: 'Voice note check', level: 1, sent: true });
await release(coordinator, voiceTask.id, [meeraStudent]);
const [meeraVoiceTask] = (await myAssignment(meera)).filter((a) => a.release_id !== null).slice(-1);
const voiceSub = await submit(meera, meeraVoiceTask.id, null, 'https://youtu.be/meera-take-1');
const voice = await filePath(coordinator2, 'm4a');
await aUpload(coordinator2, voice, 250000);
check('a coordinator uploads a voice note into their own folder', await aCanOpen(coordinator2, voice));
const webVoice = await filePath(coordinator2, 'webm');
await aUpload(coordinator2, webVoice, 1000);
check('... also a browser recording (.webm)', await aCanOpen(coordinator2, webVoice));
check('... and deletes an unused one', await aRemove(coordinator2, webVoice));
await refusesWith('a coordinator still cannot upload a PDF', 'new row violates row-level security policy for table "objects"', async () => aUpload(coordinator, await filePath(coordinator, 'pdf')));
await refusesWith('... nor into someone else\'s folder', 'new row violates row-level security policy for table "objects"', async () => aUpload(coordinator, await filePath(coordinator2, 'm4a')));
check('another student cannot open the voice note before it is on a review', !(await aCanOpen(arjun, voice)));
const reviewVoice = (userId, submission, scores, comment, outcome, voiceNote) => asApp('authenticated', userId,
  'select review_submission($1, $2::int[], $3, $4, false, $5::jsonb)',
  [submission, scores, comment, outcome, voiceNote ? JSON.stringify(voiceNote) : null]);
await refusesWith('a voice note must be in Storage', 'file_missing', async () =>
  reviewVoice(coordinator2, voiceSub, [2, 2], null, 'redo', { path: await filePath(coordinator2, 'm4a'), name: 'Voice note.m4a', kind: 'audio', size: 1 }));
await refusesWith('... and the reviewer\'s own', 'file_not_yours', () =>
  reviewVoice(coordinator, voiceSub, [2, 2], null, 'redo', { path: voice, name: 'Voice note.m4a', kind: 'audio', size: 1 }));
await refusesWith('... and audio, not a PDF', 'file_invalid', () =>
  reviewVoice(coordinator2, voiceSub, [2, 2], null, 'redo', { path: guide, name: 'x.pdf', kind: 'pdf', size: 1 }));
await reviewVoice(coordinator2, voiceSub, [2, 3], '  ', 'redo', { path: voice, name: 'Voice note.m4a', kind: 'audio', size: 1 });
const [meeraSeesVoice] = await asApp('authenticated', meera, `select voice_note, comment, outcome from assessment_submissions where id = $1`, [voiceSub]);
check('a redo with only a voice note is saved; the student sees it', meeraSeesVoice?.outcome === 'redo'
  && meeraSeesVoice.comment === null && meeraSeesVoice.voice_note?.path === voice && meeraSeesVoice.voice_note.size === 250000,
  JSON.stringify(meeraSeesVoice));
check('the student opens the voice note; another student cannot', await aCanOpen(meera, voice) && !(await aCanOpen(arjun, voice)));
check('the coordinator cannot delete a voice note on a review', !(await aRemove(coordinator2, voice)));
await asOwner(`update assessment_submissions set reviewed_at = now() - interval '31 days' where id = ${voiceSub}`);
const expiredVoice = await asApp('service_role', null, 'select * from claim_expired_submission_files()');
check('a voice note expires with its review (a link-only submission too)', expiredVoice.some((r) => r.path === voice
  && Number(r.submission_id) === voiceSub), JSON.stringify(expiredVoice));
const [{ ok: oldReviewGone }] = await asOwner(`select not exists (select 1 from pg_proc where proname = 'review_submission'
  and pronargs = 5) and not has_function_privilege('anon', 'review_submission(bigint, int[], text, text, boolean, jsonb)', 'execute') as ok`);
check('one review_submission (with the voice note), not callable by anon', oldReviewGone);

// ---------------------------------------------------------------- Ishtagoshti (0021, Phase 2)
const igSlokas = (userId) => asApp(userId ? 'authenticated' : 'anon', userId, 'select id, ref, sample, published from ig_slokas order by sort, id');
const samples = await asOwner('select id, ref from ig_slokas where sample and published order by sort');
const [{ n: sampleThemes }] = await asOwner('select count(*)::int as n from ig_themes where sample and published');
const [{ n: sampleLinks }] = await asOwner('select count(*)::int as n from ig_theme_slokas');
check('3 sample slokas and 2 sample themes are seeded, marked sample', samples.length === 3 && sampleThemes === 2 && sampleLinks === 3,
  `${samples.length} slokas, ${sampleThemes} themes, ${sampleLinks} links`);
check('a student reads the published slokas', (await igSlokas(arjun)).length === 3);
check('a login waiting for a role reads none', (await igSlokas(pendingLogin)).length === 0);
await refusesWith('anon cannot read themes at all', 'permission denied for table ig_themes', () => asApp('anon', null, 'select id from ig_themes'));
const dayOf = async (userId, day) => (await asApp('authenticated', userId, 'select ig_sloka_of_day($1::date) as id', [day]))[0].id;
const [{ d: igToday }] = await asOwner('select today_ist()::text as d');
const todays = await dayOf(arjun, null);
check('the sloka of the day is the same for two students, and changes the next day',
  samples.some((s) => s.id === todays) && todays === (await dayOf(meera, null)) && (await dayOf(arjun, '2030-01-02')) !== (await dayOf(arjun, '2030-01-01')),
  String(todays));

const newSloka = (userId, fields = {}) => asApp('authenticated', userId,
  `insert into ig_slokas (ref, devanagari, transliteration, translation_en, translation_te, translator, own_text, published, audio_path, audio_name)
   values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
  [fields.ref ?? ' BG   9.14 ', fields.dev ?? 'सततं कीर्तयन्तो माम्', fields.iast ?? 'satataṁ kīrtayanto mām', fields.en === undefined ? 'Test translation.' : fields.en,
   fields.te ?? null, fields.translator ?? null, fields.own ?? false, fields.published ?? false, fields.audio ?? null, fields.audioName ?? null]).then((r) => r[0]);
await refusesWith('a coordinator who is not an editor cannot add a sloka', 'new row violates row-level security policy for table "ig_slokas"', () => newSloka(coordinator));
await refusesWith('a student cannot add a sloka', 'new row violates row-level security policy for table "ig_slokas"', () => newSloka(arjun));
await refusesWith('a coordinator cannot make themselves an Ishtagoshti editor', 'not_allowed', () =>
  asApp('authenticated', coordinator, 'update profiles set ig_editor = true where id = auth.uid()'));
await refusesWith('only a coordinator is marked as an editor', 'ig_editor_coordinator_only', () =>
  asApp('authenticated', guru, 'update profiles set ig_editor = true where id = $1', [arjun]));
await asApp('authenticated', guru, 'update profiles set ig_editor = true where id = $1', [coordinator]);
await asApp('authenticated', guru, `select save_settings('{"ig_translator": "  Senior devotee (test)  "}'::jsonb)`);
await refusesWith('the default translator has at most 100 characters', 'setting_invalid', () =>
  asApp('authenticated', guru, 'select save_settings($1::jsonb)', [JSON.stringify({ ig_translator: 'x'.repeat(101) })]));
const draftSloka = await newSloka(coordinator);
check('an editor coordinator adds a draft sloka; reference tidied, default translator filled in', draftSloka.ref === 'BG 9.14'
  && draftSloka.translator === 'Senior devotee (test)' && draftSloka.updated_by === coordinator && !draftSloka.published, JSON.stringify(draftSloka));
check('students do not see a draft', !(await igSlokas(arjun)).some((s) => s.id === draftSloka.id));
await refusesWith('a sloka needs a translation in some language', 'translation_required', () => newSloka(guru, { en: null }));
await refusesWith('a sloka needs its Devanagari', 'devanagari_required', () => newSloka(guru, { dev: '  ' }));
await refusesWith('publishing needs the "temple\'s own text" confirmation (no BBT text)', 'own_text_needed', () =>
  asApp('authenticated', coordinator, 'update ig_slokas set published = true where id = $1', [draftSloka.id]));
await asApp('authenticated', coordinator, 'update ig_slokas set published = true, own_text = true, translator = $2 where id = $1',
  [draftSloka.id, 'Test Prabhu']);
check('published with its own credit, students see it', (await igSlokas(arjun)).some((s) => s.id === draftSloka.id)
  && (await asOwner(`select translator from ig_slokas where id = ${draftSloka.id}`))[0].translator === 'Test Prabhu');
await asApp('authenticated', arjun, `update ig_slokas set ref = 'changed' where id = $1`, [draftSloka.id]);
check('a student cannot change a sloka', (await asOwner(`select ref from ig_slokas where id = ${draftSloka.id}`))[0].ref === 'BG 9.14');

const [{ id: sampleTheme }] = await asOwner(`select id from ig_themes where sample order by sort limit 1`);
await refusesWith('a student cannot change a theme\'s slokas', 'not_allowed', () =>
  asApp('authenticated', arjun, 'select set_theme_slokas($1, $2::bigint[])', [sampleTheme, [draftSloka.id]]));
await asApp('authenticated', coordinator, 'select set_theme_slokas($1, $2::bigint[])', [sampleTheme, [draftSloka.id, samples[0].id, draftSloka.id]]);
const themeList = await asApp('authenticated', arjun, 'select sloka_id from ig_theme_slokas where theme_id = $1 order by position', [sampleTheme]);
check('an editor sets a theme\'s slokas in order (a repeat counted once)', themeList.length === 2
  && themeList[0].sloka_id === draftSloka.id && themeList[1].sloka_id === samples[0].id, JSON.stringify(themeList));
const hiddenSloka = await newSloka(guru, { ref: 'Hidden 1.1' });
await asApp('authenticated', guru, 'select set_theme_slokas($1, $2::bigint[])', [sampleTheme, [draftSloka.id, hiddenSloka.id]]);
check('a student does not see a draft sloka in a theme', (await asApp('authenticated', arjun,
  'select sloka_id from ig_theme_slokas where theme_id = $1', [sampleTheme])).every((r) => r.sloka_id !== hiddenSloka.id));
await refusesWith('a theme needs a title', 'theme_title_invalid', () => asApp('authenticated', guru, `insert into ig_themes (title) values ('  ')`));

const pin = (userId, day, slokaId) => asApp('authenticated', userId, 'insert into ig_daily_pins (day, sloka_id) values ($1, $2)', [day, slokaId]);
await refusesWith('a student cannot pin the sloka of the day', 'new row violates row-level security policy for table "ig_daily_pins"', () => pin(arjun, igToday, draftSloka.id));
await refusesWith('only a published sloka can be pinned', 'pin_not_published', () => pin(guru, igToday, hiddenSloka.id));
await refusesWith('a pin is for today or later', 'pin_day_invalid', () => pin(guru, '2020-01-01', draftSloka.id));
await pin(coordinator, igToday, draftSloka.id);
check('a pinned sloka is everyone\'s sloka of the day', (await dayOf(arjun, null)) === draftSloka.id && (await dayOf(meera, null)) === draftSloka.id);

const note = (userId, slokaId, body) => asApp('authenticated', userId, 'insert into ig_notes (sloka_id, body) values ($1, $2)', [slokaId, body]);
await note(arjun, draftSloka.id, 'Learn the second line first.');
check('a student\'s note is private: not even the Guru reads it', (await asApp('authenticated', arjun, 'select body from ig_notes')).length === 1
  && (await asApp('authenticated', meera, 'select body from ig_notes')).length === 0
  && (await asApp('authenticated', guru, 'select body from ig_notes')).length === 0);
await refusesWith('no note on a sloka the student cannot see', 'new row violates row-level security policy for table "ig_notes"', () => note(arjun, hiddenSloka.id, 'x'));
await refusesWith('no note for someone else', 'new row violates row-level security policy for table "ig_notes"', () => asApp('authenticated', meera,
  'insert into ig_notes (profile_id, sloka_id, body) values ($1, $2, $3)', [arjun, samples[1].id, 'x']));
await asApp('authenticated', arjun, 'insert into ig_memorised (sloka_id) values ($1)', [samples[0].id]);
check('a student ticks "memorised"; staff see it, another student does not',
  (await asApp('authenticated', coordinator2, 'select 1 from ig_memorised where profile_id = $1', [arjun])).length === 1
  && (await asApp('authenticated', meera, 'select 1 from ig_memorised')).length === 0);
await refusesWith('a tick is for today, not back-dated', 'new row violates row-level security policy for table "ig_memorised"', () => asApp('authenticated', meera,
  `insert into ig_memorised (sloka_id, memorised_on) values ($1, today_ist() - 5)`, [samples[0].id]));
await refusesWith('no tick on a draft', 'new row violates row-level security policy for table "ig_memorised"', () => asApp('authenticated', meera, 'insert into ig_memorised (sloka_id) values ($1)', [hiddenSloka.id]));

const igUpload = async (userId, path, size = 300000) => asApp('authenticated', userId,
  `insert into storage.objects (bucket_id, name, owner, metadata) values ('ishtagoshti-audio', $1, auth.uid(), $2)`, [path, JSON.stringify({ size })]);
const igCanOpen = async (userId, path) => (await asApp('authenticated', userId,
  `select 1 from storage.objects where bucket_id = 'ishtagoshti-audio' and name = $1`, [path])).length === 1;
const recitation = await filePath(coordinator, 'm4a');
await igUpload(coordinator, recitation);
await refusesWith('a student cannot upload a recitation', 'new row violates row-level security policy for table "objects"', async () => igUpload(arjun, await filePath(arjun, 'm4a')));
await refusesWith('a coordinator who is not an editor cannot either', 'new row violates row-level security policy for table "objects"', async () => igUpload(coordinator2, await filePath(coordinator2, 'mp3')));
await refusesWith('a recitation is audio', 'new row violates row-level security policy for table "objects"', async () => igUpload(coordinator, await filePath(coordinator, 'pdf')));
check('a student cannot open a recitation not on a published sloka', !(await igCanOpen(arjun, recitation)));
await refusesWith('a recitation must be in Storage', 'audio_missing', async () => asApp('authenticated', coordinator,
  'update ig_slokas set audio_path = $2, audio_name = $3 where id = $1', [draftSloka.id, await filePath(coordinator, 'm4a'), 'Recitation.m4a']));
await asApp('authenticated', coordinator, 'update ig_slokas set audio_path = $2, audio_name = $3 where id = $1', [draftSloka.id, recitation, ' Recitation.m4a ']);
const [withAudio] = await asOwner(`select audio_name, audio_size from ig_slokas where id = ${draftSloka.id}`);
check('the recitation is saved with its size from Storage; students open it', withAudio.audio_name === 'Recitation.m4a'
  && Number(withAudio.audio_size) === 300000 && (await igCanOpen(arjun, recitation)), JSON.stringify(withAudio));

await asApp('authenticated', guru, 'update profiles set ig_editor = false where id = $1', [coordinator]);
await asApp('authenticated', coordinator, `update ig_slokas set ref = 'changed' where id = $1`, [draftSloka.id]);
check('when the Guru takes editing away, the coordinator can no longer change slokas',
  (await asOwner(`select ref from ig_slokas where id = ${draftSloka.id}`))[0].ref === 'BG 9.14');
await asApp('authenticated', guru, 'delete from ig_slokas where id = $1', [draftSloka.id]);
const [{ n: leftOver }] = await asOwner(`select (select count(*) from ig_notes where sloka_id = ${draftSloka.id})
  + (select count(*) from ig_daily_pins where sloka_id = ${draftSloka.id}) + (select count(*) from ig_theme_slokas where sloka_id = ${draftSloka.id}) as n`);
check('deleting a sloka takes its notes, pins and theme places with it', Number(leftOver) === 0);
check('slokas and themes changes are in the audit log', (await asOwner(`select count(*)::int as n from audit_log
  where table_name in ('ig_slokas', 'ig_themes')`))[0].n >= 3);
const [{ ok: igFnsOpen }] = await asOwner(`select has_function_privilege('anon', 'ig_sloka_of_day(date)', 'execute')
  or has_function_privilege('anon', 'set_theme_slokas(bigint, bigint[])', 'execute')
  or has_function_privilege('authenticated', 'guard_ig_sloka()', 'execute') as ok`);
check('anon runs no Ishtagoshti function; the guard is not callable', igFnsOpen === false);


// ---------------------------------------------------------------- attendance location (0024)
// The marking phone's position is compared with the centre's area at check-in; the visit is saved
// anyway and flagged when outside / refused / no fix / no location. Only distance + result are kept.
await asApp('authenticated', guru, 'select check_out_all()');
const [{ id: homeCentre }] = await asOwner(`select home_centre_id as id from students where id = '${registered.id}'`);
await asOwner(`update centres set lat = 17.385, lng = 78.4867, radius_m = 150 where id = ${homeCentre}`);
/** Marks `action` for a student as the coordinator, with the phone's report; returns the result. */
const markAt = async (studentId, action, location) => (await asApp('authenticated', coordinator,
  'select mark_visit($1, $2, null, $3::jsonb) as r', [studentId, action, location ? JSON.stringify(location) : null]))[0].r;
const lastVisit = async (studentId) => (await asOwner(`select location_check, location_distance_m from visits
  where student_id = '${studentId}' order by check_in desc, id desc limit 1`))[0];
const inside = await markAt(registered.id, 'in', { status: 'fix', lat: 17.3851, lng: 78.4867, accuracy: 15 });
check('a check-in inside the area is saved as inside, with the distance', inside.action === 'in'
  && inside.location_check === 'inside' && inside.distance_m === 11, JSON.stringify(inside));
const outAgain = await markAt(registered.id, 'out', { status: 'refused' });
const afterOut = await lastVisit(registered.id);
check('a check-out stores no location result', outAgain.action === 'out' && afterOut.location_check === 'inside',
  JSON.stringify(afterOut));
const far = await markAt(registered.id, 'in', { status: 'fix', lat: 17.395, lng: 78.4867, accuracy: 500 });
check('a check-in 1 km away is saved but flagged outside (accuracy counts at most 100 m)', far.action === 'in'
  && far.location_check === 'outside' && far.distance_m === 1112, JSON.stringify(far));
await markAt(registered.id, 'out');
// 0038 (D6-09): a scan within 30 seconds of a check-out answers already_out; this one comes later.
await asOwner(`update visits set check_in = check_in - interval '1 minute', check_out = check_out - interval '1 minute' where student_id = '${registered.id}' and check_out > now() - interval '1 minute'`);
const [refusedScan] = await asApp('authenticated', coordinator, 'select scan_qr($1, null, $2::jsonb) as r',
  [qrToken, JSON.stringify({ status: 'refused' })]);
check('a QR scan with location refused is saved and flagged refused', refusedScan.r.action === 'in'
  && refusedScan.r.location_check === 'refused' && refusedScan.r.distance_m === null, JSON.stringify(refusedScan.r));
check('... and keeps no distance', (await lastVisit(registered.id)).location_distance_m === null);
await markAt(registered.id, 'out');
for (const status of ['no_fix', 'no_location']) {
  const result = await markAt(registered.id, 'in', { status });
  check(`a check-in with ${status} is saved and flagged`, result.action === 'in' && result.location_check === status);
  await markAt(registered.id, 'out');
}
const oldApp = await markAt(registered.id, 'in');
check('a check-in without a report (older app) is saved, not checked', oldApp.action === 'in'
  && oldApp.location_check === null && (await lastVisit(registered.id)).location_check === null);
await markAt(registered.id, 'out');
await refusesWith('a malformed report is refused', 'bad_location', () =>
  markAt(registered.id, 'in', { status: 'fix', lat: 'north', lng: 78 }));
await refusesWith('... and an unknown status', 'bad_location', () => markAt(registered.id, 'in', { status: 'teleported' }));
check('... and nothing was saved for them', (await lastVisit(registered.id)).location_check === null);
await asOwner(`update centres set lat = null, lng = null where id = ${homeCentre}`);
const noArea = await markAt(registered.id, 'in', { status: 'fix', lat: 17.385, lng: 78.4867, accuracy: 5 });
check('a centre without a point gives no_area, not a flag', noArea.location_check === 'no_area' && noArea.distance_m === null);
await asOwner(`update centres set lat = 17.385, lng = 78.4867 where id = ${homeCentre}`);
const [{ id: lastVisitId }] = await asOwner(`select id from visits where student_id = '${registered.id}' order by id desc limit 1`);
await refusesWith('a coordinator cannot clear or change a location result', 'location_locked', () =>
  asApp('authenticated', coordinator, `update visits set location_check = 'inside' where id = ${lastVisitId}`));
await refusesWith('... nor its distance', 'location_locked', () =>
  asApp('authenticated', guru, `update visits set location_distance_m = 1 where id = ${lastVisitId}`));
const corrected = await asApp('authenticated', coordinator,
  `update visits set check_in = check_in - interval '1 minute' where id = ${lastVisitId} returning id`);
check('... but may still correct the times of the visit', corrected.length === 1);
await refusesWith('a student cannot change a location result', 'no row changed (row-level security)', () =>
  asApp('authenticated', late, `update visits set location_check = null where id = ${lastVisitId} returning id`).then((rows) => {
    if (rows.length === 0) throw new Error('no row changed (row-level security)');
  }));
await refusesWith('a student cannot run visit_location_result', 'permission denied for function visit_location_result', () =>
  asApp('authenticated', arjun, `select * from visit_location_result('{"status":"refused"}', 1::smallint)`));
await refusesWith('anon cannot run visit_location_result', 'permission denied for function visit_location_result', () =>
  asApp('anon', null, `select * from visit_location_result('{"status":"refused"}', 1::smallint)`));
await refusesWith('a student cannot mark with a location', 'not_allowed', () =>
  asApp('authenticated', arjun, `select mark_visit('${registered.id}', 'in', null, '{"status":"refused"}')`));
await refusesWith('anon cannot scan with a location', 'permission denied for function scan_qr', () =>
  asApp('anon', null, `select scan_qr('${qrToken}', null, '{"status":"refused"}')`));
const [{ ok: oneEach }] = await asOwner(`select (select count(*) from pg_proc where proname in ('toggle_visit', 'scan_qr', 'mark_visit')) = 3
  and not has_function_privilege('anon', 'mark_visit(uuid, text, text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'scan_qr(uuid, text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'toggle_visit(uuid, visit_method, text, jsonb)', 'execute') as ok`);
check('one version of each marking function, none callable by anon', oneEach);
const positionColumns = await asOwner(`select column_name from information_schema.columns
  where table_name = 'visits' and column_name ~ '(lat|lng|lon|position|coord)'`);
check('visits keep no position (only distance and result)', positionColumns.length === 0,
  positionColumns.map((c) => c.column_name).join(','));
const flagged = (await asApp('authenticated', guru, 'select class_report(today_ist() - 1, today_ist(), null) as r'))[0].r;
const flagReasons = Object.fromEntries(flagged.flagged_by_reason.map((x) => [x.reason, x.visits]));
const regRow = flagged.rows.find((row) => row.id === registered.id);
check('the report counts flagged visits by reason', flagged.visits_flagged === 4 && flagReasons.outside === 1
  && flagReasons.refused === 1 && flagReasons.no_fix === 1 && flagReasons.no_location === 1, JSON.stringify(flagReasons));
check('... and per student', regRow?.flagged === 4, String(regRow?.flagged));
const ownVisits = await asApp('authenticated', late, 'select location_check from visits');
check('a student reads only their own visits', ownVisits.length > 0
  && ownVisits.length === (await asOwner(`select count(*)::int as n from visits where student_id = '${registered.id}'`))[0].n);
await asApp('authenticated', guru, 'select check_out_all()');
// ---------------------------------------------------------------- events and polls (0022, Phase 2)
const inHours = (h) => new Date(Date.now() + h * 3600_000).toISOString();
const addEvent = async (userId, fields = {}) => (await asApp('authenticated', userId,
  `insert into events (title, description, starts_at, ends_at, centre_id, place, audience, audience_level, audience_group)
   values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
  [fields.title ?? 'Festival kirtan', fields.description ?? '', fields.starts ?? inHours(48), fields.ends ?? null,
   fields.centre === undefined ? 1 : fields.centre, fields.place ?? null, fields.audience ?? 'all', fields.level ?? null,
   fields.group ?? null]))[0];
const outboxFor = async (profileId, urlLike) => (await asOwner(`select title, body, url from push_outbox
  where profile_id = '${profileId}' and url like '${urlLike}' order by id`));
// The checks below read the English lines; earlier sections switched some app languages.
const evLanguages = await asOwner(`select id, language from profiles where id in ('${arjun}', '${meera}', '${late}')`);
await asOwner(`update profiles set language = 'en' where id in ('${arjun}', '${meera}', '${late}')`);
check('notices of events and polls have Telugu and Hindi lines', (await asOwner(`select
  event_push_line('event_new', 'te', now()) like 'కొత్త కార్యక్రమం:%' and event_push_line('poll_remind', 'hi', now()) like 'याद रहे: मतदान%'
  and event_push_line('event_performer', 'en', now(), 'Kartal') = 'Your part: Kartal.' as ok`))[0].ok === true);
const [{ lv: evLevelA }] = await asOwner(`select level_id as lv from students where id = '${arjunStudent}'`);
const [{ lv: evLevelM }] = await asOwner(`select level_id as lv from students where id = '${meeraStudent}'`);

await refusesWith('a student cannot create an event', 'new row violates row-level security policy for table "events"', () => addEvent(arjun));
await refusesWith('an event needs a title', 'title_required', () => addEvent(coordinator, { title: '  ' }));
await refusesWith('... a centre or a place', 'place_required', () => addEvent(coordinator, { centre: null }));
await refusesWith('... a start in the future', 'starts_past', () => addEvent(coordinator, { starts: inHours(-1) }));
await refusesWith('... not more than a year ahead', 'starts_too_far', () => addEvent(coordinator, { starts: inHours(24 * 400) }));
await refusesWith('... an end after the start', 'ends_invalid', () => addEvent(coordinator, { ends: inHours(47) }));
await refusesWith('... a level for a level audience', 'level_required', () => addEvent(coordinator, { audience: 'level' }));
await refusesWith('... an existing group for a group audience', 'group_required', () => addEvent(coordinator, { audience: 'group', group: 999999 }));
const festival = await addEvent(coordinator, { title: '  Janmashtami kirtan ', place: ' Temple hall ', ends: inHours(51) });
check('a coordinator creates an event; title and place trimmed, author recorded', festival.title === 'Janmashtami kirtan'
  && festival.place === 'Temple hall' && festival.created_by === coordinator && festival.cancelled_at === null, JSON.stringify(festival));
const arjunNew = await outboxFor(arjun, `/student/events/${festival.id}`);
check('every student it is for gets a notice that opens the event, in their language', arjunNew.length === 1
  && arjunNew[0].title === 'Janmashtami kirtan' && /^New event: \d\d-\d\d-\d{4} \d\d:\d\d\. Will you come\?$/.test(arjunNew[0].body),
  JSON.stringify(arjunNew));
check('... the author is not told', (await outboxFor(coordinator, `%/events/${festival.id}`)).length === 0);
check('... and the notice is in the inbox as an event', (await asApp('authenticated', arjun,
  `select kind from notifications where url = '/student/events/${festival.id}'`))[0]?.kind === 'event');
check('a student sees the event', (await asApp('authenticated', arjun, 'select id from events where id = $1', [festival.id])).length === 1);

// A level neither Arjun nor Meera is at, and a student login who is.
const otherLevel = [1, 2, 3].find((l) => l !== evLevelA && l !== evLevelM);
const [levelMate] = await asOwner(`select s.profile_id as id from students s join profiles p on p.id = s.profile_id and p.active
  where s.level_id = ${otherLevel} and p.role = 'student' limit 1`);
const levelEvent = await addEvent(guru, { title: 'Level yatra', audience: 'level', level: otherLevel });
const seesLevel = async (userId) => (await asApp('authenticated', userId, 'select id from events where id = $1', [levelEvent.id])).length === 1;
check('a level event is seen only by students of that level (and staff)', (await seesLevel(coordinator2))
  && (!levelMate || (await seesLevel(levelMate.id))) && !(await seesLevel(arjun)) && !(await seesLevel(meera)), `level ${otherLevel}`);
const rsvp = (userId, eventId, response) => asApp('authenticated', userId, 'select rsvp_event($1, $2)', [eventId, response]);
await refusesWith('a student cannot answer an event not for them', 'not_allowed', () => rsvp(meera, levelEvent.id, 'going'));
await refusesWith('an answer is going, maybe or not going', 'response_invalid', () => rsvp(arjun, festival.id, 'perhaps'));
await rsvp(arjun, festival.id, 'maybe');
await rsvp(arjun, festival.id, 'going');
await rsvp(meera, festival.id, 'not_going');
const countsOf = async (userId, eventId) => (await asApp('authenticated', userId, 'select * from event_counts($1::bigint[])', [[eventId]]))[0];
const arjunCounts = await countsOf(arjun, festival.id);
check('a student changes their answer; counts and their own answer come back', arjunCounts.going === 1
  && arjunCounts.not_going === 1 && arjunCounts.maybe === 0 && arjunCounts.my_response === 'going' && arjunCounts.addressed >= 3,
  JSON.stringify(arjunCounts));
check('a student sees only their own answer row', (await asApp('authenticated', meera, 'select profile_id from event_rsvps')).every((r) => r.profile_id === meera));
await refusesWith('a student cannot list who answered', 'not_allowed', () => asApp('authenticated', arjun, 'select * from event_people_list($1)', [festival.id]));
const people = await asApp('authenticated', coordinator2, 'select * from event_people_list($1)', [festival.id]);
check('staff see everyone it is for with their answer', people.find((p) => p.profile_id === arjun)?.response === 'going'
  && people.find((p) => p.profile_id === meera)?.response === 'not_going' && people.some((p) => p.response === null), String(people.length));
check('counts of an event not for them are not given to a student', (await asApp('authenticated', meera,
  'select * from event_counts($1::bigint[])', [[levelEvent.id]])).length === 0);
await refusesWith('the app cannot write answers directly', 'permission denied for table event_rsvps', () => asApp('authenticated', arjun,
  `insert into event_rsvps (event_id, profile_id, response) values ($1, auth.uid(), 'going')`, [festival.id]));

await refusesWith('the audience stays once people answered', 'audience_locked', () => asApp('authenticated', coordinator,
  `update events set audience = 'staff' where id = $1`, [festival.id]));
await refusesWith('another coordinator cannot edit the event', 'no row changed', async () => {
  const rows = await asApp('authenticated', coordinator2, `update events set title = 'x' where id = $1 returning id`, [festival.id]);
  if (rows.length === 0) throw new Error('no row changed');
});
const newStart = inHours(72);
await asApp('authenticated', guru, 'update events set starts_at = $2, ends_at = null where id = $1', [festival.id, newStart]);
const arjunChanged = await outboxFor(arjun, `/student/events/${festival.id}`);
check('the Guru moves it; people are told the new time', arjunChanged.length === 2 && arjunChanged[1].body.startsWith('The time or place changed'),
  JSON.stringify(arjunChanged));
await refusesWith('an event somebody answered is not deleted', 'event_has_answers', () =>
  asApp('authenticated', coordinator, 'delete from events where id = $1', [festival.id]));

// Performers and attendance.
const setPerformers = (userId, eventId, list) => asApp('authenticated', userId,
  'select set_event_performers($1, $2::jsonb) as r', [eventId, JSON.stringify(list)]);
await refusesWith('a student cannot pick performers', 'not_allowed', () => setPerformers(arjun, festival.id, []));
await refusesWith('a part is 1 to 60 characters', 'part_invalid', () => setPerformers(coordinator, festival.id, [{ student_id: arjunStudent, part: ' ' }]));
await refusesWith('... and a student once', 'student_invalid', () => setPerformers(coordinator, festival.id,
  [{ student_id: arjunStudent, part: 'Mridanga' }, { student_id: arjunStudent, part: 'Kartal' }]));
const [{ r: perf }] = await setPerformers(coordinator, festival.id, [{ student_id: arjunStudent, part: ' Mridanga ' }, { student_id: lateStudent, part: 'Kartal' }]);
check('staff pick performers; the ones with a login are told their part', perf.performers === 2 && perf.notified === 2,
  JSON.stringify(perf));
check('... the notice names the part', (await outboxFor(arjun, `/student/events/${festival.id}`)).at(-1).body === 'Your part: Mridanga.');
await setPerformers(coordinator, festival.id, [{ student_id: arjunStudent, part: 'Mridanga' }]);
check('an unchanged part is not told again; a dropped performer is removed', (await outboxFor(arjun, `/student/events/${festival.id}`)).length === 3
  && (await asOwner(`select count(*)::int as n from event_performers where event_id = ${festival.id}`))[0].n === 1);
check('a performer sees their part in the counts', (await countsOf(arjun, festival.id)).my_part === 'Mridanga');
await refusesWith('attendance waits for the event day', 'too_early', () => asApp('authenticated', coordinator,
  'select mark_event_attendance($1, $2::uuid[])', [festival.id, [arjunStudent]]));
const soon = await addEvent(coordinator, { title: 'Today kirtan', starts: inHours(0.05) });
// Moved into the past by hand (the guard keeps the app from doing that).
await asOwner('alter table events disable trigger events_guard');
await asOwner(`update events set starts_at = now() - interval '1 hour' where id = ${soon.id}`);
await asOwner('alter table events enable trigger events_guard');
const [{ n: ticked }] = await asApp('authenticated', coordinator2, 'select mark_event_attendance($1, $2::uuid[]) as n',
  [soon.id, [arjunStudent, lateStudent, arjunStudent]]);
check('staff tick who came on the day (students without the app too)', ticked === 2
  && (await countsOf(arjun, soon.id)).i_attended === true, String(ticked));
await refusesWith('nobody answers after the start', 'event_started', () => rsvp(arjun, soon.id, 'going'));
const listed = await asApp('authenticated', coordinator, 'select * from event_student_list($1, false)', [soon.id]);
check('the student list for an event shows the audience with attendance', listed.some((s) => s.student_id === arjunStudent && s.attended && s.in_audience)
  && listed.some((s) => s.student_id === meeraStudent && !s.attended), String(listed.length));

// Reminders and cancelling.
const [{ n: asked }] = await asApp('authenticated', coordinator, 'select remind_event($1) as n', [festival.id]);
check('Remind tells only those who have not answered', asked > 0
  && (await outboxFor(arjun, `/student/events/${festival.id}`)).length === 3
  && (await outboxFor(late, `/student/events/${festival.id}`)).some((r) => r.body.startsWith('Please tell us')), String(asked));
await refusesWith('... once in 12 hours', 'too_soon', () => asApp('authenticated', coordinator, 'select remind_event($1)', [festival.id]));
await asOwner(`update events set starts_at = (today_ist() + 1 + time '18:00') at time zone 'Asia/Kolkata' where id = ${festival.id}`);
await asOwner(`update events set reminded_at = null where id = ${festival.id}`);
await asOwner('select events_polls_daily()');
const dayBefore = (await outboxFor(arjun, `/student/events/${festival.id}`)).at(-1);
check('the day before, those going or maybe are reminded', dayBefore.body === 'Reminder: tomorrow at 18:00.', JSON.stringify(dayBefore));
check('... not those not going', !(await outboxFor(meera, `/student/events/${festival.id}`)).some((r) => r.body.startsWith('Reminder')));
const beforeAgain = (await asOwner('select count(*)::int as n from push_outbox'))[0].n;
await asOwner('select events_polls_daily()');
check('... and only once', (await asOwner('select count(*)::int as n from push_outbox'))[0].n === beforeAgain);
await asApp('authenticated', coordinator, `update events set cancelled_at = now(), cancel_reason = ' Rain ' where id = $1`, [festival.id]);
const [cancelled] = await asOwner(`select cancelled_at, cancel_reason from events where id = ${festival.id}`);
check('the author cancels with a reason; people are told', cancelled.cancelled_at !== null && cancelled.cancel_reason === 'Rain'
  && (await outboxFor(meera, `/student/events/${festival.id}`)).at(-1).body.endsWith('is cancelled.'));
await refusesWith('a cancelled event stays as it is', 'event_cancelled', () => asApp('authenticated', guru,
  'update events set cancelled_at = null where id = $1', [festival.id]));
await refusesWith('nobody answers a cancelled event', 'event_cancelled', () => rsvp(late, festival.id, 'going'));
const empty = await addEvent(coordinator, { title: 'Typo event' });
await asApp('authenticated', coordinator, 'delete from events where id = $1', [empty.id]);
check('an event nobody answered can be deleted', (await asOwner(`select id from events where id = ${empty.id}`)).length === 0);

// Polls.
const addPoll = async (userId, fields = {}) => (await asApp('authenticated', userId,
  `insert into polls (question, options, anonymous, results_when, closes_at, audience, audience_level, audience_group)
   values ($1, $2::text[], $3, $4, $5, $6, $7, $8) returning *`,
  [fields.question ?? 'Which day suits the practice?', fields.options ?? ['Saturday', 'Sunday'], fields.anonymous ?? false,
   fields.resultsWhen ?? 'after_vote', fields.closes ?? inHours(72), fields.audience ?? 'all', fields.level ?? null, fields.group ?? null]))[0];
await refusesWith('a student cannot create a poll', 'new row violates row-level security policy for table "polls"', () => addPoll(arjun));
await refusesWith('a poll has 2 to 6 answers', 'options_invalid', () => addPoll(coordinator, { options: ['Only one'] }));
await refusesWith('... all different', 'options_invalid', () => addPoll(coordinator, { options: ['Sunday', ' sunday '] }));
await refusesWith('... at most 6', 'options_invalid', () => addPoll(coordinator, { options: ['1', '2', '3', '4', '5', '6', '7'] }));
await refusesWith('... and a closing time in the future', 'closes_past', () => addPoll(coordinator, { closes: inHours(-1) }));
const poll = await addPoll(coordinator, { options: [' Saturday ', 'Sunday', 'Either'], resultsWhen: 'after_vote' });
check('a coordinator creates a poll; answers trimmed', JSON.stringify(poll.options) === '["Saturday","Sunday","Either"]', JSON.stringify(poll.options));
check('... the people it is for are told', (await outboxFor(arjun, `/student/polls/${poll.id}`))[0]?.body.startsWith('New poll. Please vote by'));
const vote = (userId, pollId, choice) => asApp('authenticated', userId, 'select vote_poll($1, $2)', [pollId, choice]);
const stateOf = async (userId, pollId) => (await asApp('authenticated', userId, 'select * from poll_state($1::bigint[])', [[pollId]]))[0];
const before = await stateOf(arjun, poll.id);
check('before voting a student sees no results (results after voting)', before.results === null && before.my_choice === null && before.can_vote,
  JSON.stringify(before));
await refusesWith('a choice must be one of the answers', 'choice_invalid', () => vote(arjun, poll.id, 3));
await vote(arjun, poll.id, 0);
await vote(arjun, poll.id, 1);
await vote(meera, poll.id, 1);
const after = await stateOf(arjun, poll.id);
check('a student changes their vote and then sees the results', after.my_choice === 1 && JSON.stringify(after.results) === '[0,2,0]'
  && after.voted === 2, JSON.stringify(after));
await refusesWith('votes are never readable from the app', 'permission denied for table poll_votes', () => asApp('authenticated', coordinator, 'select * from poll_votes'));
const voters = await asApp('authenticated', coordinator2, 'select * from poll_voters($1)', [poll.id]);
check('staff see who voted what in a poll that is not anonymous', voters.find((v) => v.profile_id === arjun)?.choice === 1
  && voters.some((v) => v.voted_at === null), String(voters.length));
await refusesWith('a student cannot list the voters', 'not_allowed', () => asApp('authenticated', arjun, 'select * from poll_voters($1)', [poll.id]));
await refusesWith('the answers stay once people voted', 'poll_has_votes', () => asApp('authenticated', coordinator,
  `update polls set options = array['A', 'B'] where id = $1`, [poll.id]));
await refusesWith('... and anonymous cannot be switched', 'poll_has_votes', () => asApp('authenticated', coordinator,
  'update polls set anonymous = true where id = $1', [poll.id]));
await refusesWith('a poll with votes is not deleted', 'poll_has_votes', () => asApp('authenticated', coordinator, 'delete from polls where id = $1', [poll.id]));

const secret = await addPoll(guru, { question: 'Anonymous check', anonymous: true, resultsWhen: 'after_close', closes: inHours(10) });
await vote(arjun, secret.id, 0);
check('in an anonymous poll staff see that a person voted, not what', (await asApp('authenticated', guru,
  'select * from poll_voters($1)', [secret.id])).every((v) => v.choice === null)
  && (await asApp('authenticated', guru, 'select * from poll_voters($1)', [secret.id])).some((v) => v.profile_id === arjun && v.voted_at !== null));
check('results after closing: a voter sees none while it is open; nor do staff in an anonymous poll',
  (await stateOf(arjun, secret.id)).results === null && (await stateOf(coordinator, secret.id)).results === null);
check('... while staff see live counts of a poll that is not anonymous', JSON.stringify((await stateOf(coordinator, poll.id)).results) === '[0,2,0]');
await asOwner('select events_polls_daily()');
check('within 24 hours of closing, those who have not voted are reminded',
  (await outboxFor(meera, `/student/polls/${secret.id}`)).some((r) => r.body.startsWith('Reminder: the poll closes'))
  && !(await outboxFor(arjun, `/student/polls/${secret.id}`)).some((r) => r.body.startsWith('Reminder')));
const [{ n: pollAsked }] = await asApp('authenticated', guru, 'select remind_poll($1) as n', [secret.id]);
await refusesWith('Remind on a poll: once in 12 hours', 'too_soon', () => asApp('authenticated', guru, 'select remind_poll($1)', [secret.id]));
await asApp('authenticated', guru, 'update polls set closed_at = now() where id = $1', [secret.id]);
check('the Guru closes it early; then everyone it is for sees the results', pollAsked > 0
  && JSON.stringify((await stateOf(arjun, secret.id)).results) === '[1,0]' && (await stateOf(arjun, secret.id)).closed);
await refusesWith('nobody votes on a closed poll', 'poll_closed', () => vote(meera, secret.id, 1));
await refusesWith('a closed poll stays closed', 'poll_closed', () => asApp('authenticated', guru,
  'update polls set closes_at = $2 where id = $1', [secret.id, inHours(48)]));

const [{ id: eventGroup }] = await asApp('authenticated', coordinator, `insert into groups (name) values ('Kirtan team') returning id`);
await asApp('authenticated', coordinator, 'insert into group_members (group_id, profile_id) values ($1, $2)', [eventGroup, meera]);
const groupPoll = await addPoll(coordinator, { question: 'Group only', audience: 'group', group: eventGroup });
check('a group poll is seen by its members only', (await asApp('authenticated', meera, 'select id from polls where id = $1', [groupPoll.id])).length === 1
  && (await asApp('authenticated', arjun, 'select id from polls where id = $1', [groupPoll.id])).length === 0);
await refusesWith('a student outside the group cannot vote', 'not_allowed', () => vote(arjun, groupPoll.id, 0));
check('poll_state gives nothing for a poll not for them', (await asApp('authenticated', arjun,
  'select * from poll_state($1::bigint[])', [[groupPoll.id]])).length === 0);
await asApp('authenticated', coordinator, 'update groups set active = false where id = $1', [eventGroup]);
const [{ n: groupAsked }] = await asApp('authenticated', coordinator, 'select remind_poll($1) as n', [groupPoll.id]);
check('a group switched off later does not block a reminder', groupAsked === 1, String(groupAsked));
await asApp('authenticated', coordinator, 'delete from polls where id = $1', [groupPoll.id]);
check('a poll nobody voted on can be deleted', (await asOwner(`select id from polls where id = ${groupPoll.id}`)).length === 0);

check('event and poll kinds in the inbox', (await kindOf('/staff/events/4')) === 'event' && (await kindOf('/student/polls/2')) === 'poll');
const [{ ok: eventFnsOpen }] = await asOwner(`select has_function_privilege('anon', 'rsvp_event(bigint, text)', 'execute')
  or has_function_privilege('anon', 'poll_state(bigint[])', 'execute') or has_function_privilege('anon', 'vote_poll(bigint, int)', 'execute')
  or has_function_privilege('authenticated', 'queue_people_push(uuid[], text, text, text, timestamptz, text)', 'execute')
  or has_function_privilege('authenticated', 'events_polls_daily()', 'execute')
  or has_function_privilege('authenticated', 'event_notify()', 'execute') as ok`);
check('anon runs no event or poll function; the queue and the daily job are not callable', eventFnsOpen === false);
await refusesWith('anon cannot read events', 'permission denied for table events', () => asApp('anon', null, 'select id from events'));
await refusesWith('anon cannot read polls', 'permission denied for table polls', () => asApp('anon', null, 'select id from polls'));
for (const { id, language } of evLanguages) await asOwner(`update profiles set language = '${language}' where id = '${id}'`);


// ---------------------------------------------------------------- team tools (0023, Phase 2)
// C18 suggest material
const teamOutboxFor = async (userId, url) => asOwner(`select title, body from push_outbox where profile_id = '${userId}' and url = '${url}' order by id`);
const suggestion = await addMaterial(coordinator, { kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', level: 1, title: 'Kaherva slow' });
check('a coordinator suggests a material; it waits for the Guru', suggestion.approved_by === null && suggestion.decided_at === null
  && suggestion.uploaded_by === coordinator, JSON.stringify(suggestion));
check('... the Guru gets a notice, in the inbox too', (await teamOutboxFor(guru, '/staff/suggestions')).some((r) => r.title === 'Kaherva slow')
  && (await asApp('authenticated', guru, `select kind from notifications where url = '/staff/suggestions'`)).length >= 1);
check('a student does not see a waiting suggestion', (await asApp('authenticated', late, 'select id from materials where id = $1', [suggestion.id])).length === 0);
await asApp('authenticated', coordinator, `update materials set suggest_reason = 'x' where id = $1`, [suggestion.id]);
check('a coordinator cannot edit a suggestion (Guru-only updates)', (await asOwner(`select suggest_reason from materials where id = ${suggestion.id}`))[0].suggest_reason === null);
await refusesWith('the Guru cannot approve by a plain update', 'suggestion_frozen', () => asApp('authenticated', guru,
  'update materials set approved_by = auth.uid() where id = $1', [suggestion.id]));
await refusesWith('a coordinator cannot decide a suggestion', 'not_allowed', () => asApp('authenticated', coordinator2,
  'select decide_material_suggestion($1, true)', [suggestion.id]));
await refusesWith('declining needs a reason', 'reason_required', () => asApp('authenticated', guru,
  `select decide_material_suggestion($1, false, '  ')`, [suggestion.id]));
await asApp('authenticated', guru, 'update materials set title = $2 where id = $1', [suggestion.id, 'Kaherva, slow']);
await asApp('authenticated', guru, 'select decide_material_suggestion($1, true)', [suggestion.id]);
const [approvedSuggestion] = await asOwner(`select approved_by, decided_at, title from materials where id = ${suggestion.id}`);
check('the Guru edits the title and adds the suggestion to the lessons', approvedSuggestion.approved_by === guru
  && approvedSuggestion.decided_at !== null && approvedSuggestion.title === 'Kaherva, slow');
check('... a student of the level sees it now', (await asApp('authenticated', late, 'select id from materials where id = $1', [suggestion.id])).length === 1);
check('... and the coordinator gets a notice', (await teamOutboxFor(coordinator, '/staff/suggestions')).some((r) => r.body.includes('added your suggestion')));
await refusesWith('a decided suggestion cannot be decided again', 'already_decided', () => asApp('authenticated', guru,
  `select decide_material_suggestion($1, false, 'No')`, [suggestion.id]));
check('the coordinator cannot delete an approved material', (await asApp('authenticated', coordinator,
  'delete from materials where id = $1 returning id', [suggestion.id])).length === 0);
const suggestedPdf = `${coordinator}/${await newId()}.pdf`;
await uploadMaterial(coordinator, suggestedPdf, 5000);
check('a coordinator uploads a PDF for a suggestion into their own folder', await canOpenMaterial(coordinator, suggestedPdf));
await refusesWith('... not into someone else\'s folder', 'new row violates row-level security policy for table "objects"', async () => uploadMaterial(coordinator, `${coordinator2}/${await newId()}.pdf`));
await refusesWith('a student cannot upload a material file', 'new row violates row-level security policy for table "objects"', async () => uploadMaterial(late, `${late}/${await newId()}.pdf`));
const [pdfSuggestion] = await asApp('authenticated', coordinator,
  `insert into materials (title, kind, storage_path, file_name, file_size, level_id, suggest_reason)
   values ('Notation', 'pdf', $1, 'Notation.pdf', 1, 2, '  Clear notation for the 8 beats.  ') returning *`, [suggestedPdf]);
check('... and suggests it with a reason, trimmed', pdfSuggestion.suggest_reason === 'Clear notation for the 8 beats.'
  && Number(pdfSuggestion.file_size) === 5000);
check('the Guru opens the suggested file; a student cannot', await canOpenMaterial(guru, suggestedPdf) && !(await canOpenMaterial(arjun, suggestedPdf)));
await asApp('authenticated', guru, `select decide_material_suggestion($1, false, ' We have this one already. ')`, [pdfSuggestion.id]);
const [declined] = await asApp('authenticated', coordinator, `select approved_by, decided_at, declined_reason from materials where id = $1`, [pdfSuggestion.id]);
check('the Guru declines with a reason; the coordinator sees it', declined.approved_by === null && declined.decided_at !== null
  && declined.declined_reason === 'We have this one already.');
check('... with a notice', (await teamOutboxFor(coordinator, '/staff/suggestions')).some((r) => r.body === 'Not added: We have this one already.'));
check('the coordinator removes the declined suggestion and its file', (await asApp('authenticated', coordinator,
  'delete from materials where id = $1 returning id', [pdfSuggestion.id])).length === 1 && (await asApp('authenticated', coordinator,
  `delete from storage.objects where bucket_id = 'material-files' and name = $1 returning name`, [suggestedPdf])).length === 1);
check('another coordinator cannot remove someone else\'s suggestion', (await (async () => {
  const s = await addMaterial(coordinator2, { kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', level: 1 });
  const gone = await asApp('authenticated', coordinator, 'delete from materials where id = $1 returning id', [s.id]);
  await asApp('authenticated', coordinator2, 'delete from materials where id = $1', [s.id]);
  return gone.length === 0;
})()));
await refusesWith('a reason is at most 500 characters', 'reason_too_long', () => asApp('authenticated', coordinator,
  `insert into materials (title, kind, url, level_id, suggest_reason) values ('x', 'youtube', 'https://youtu.be/dQw4w9WgXcQ', 1, repeat('a', 501))`));
await asApp('authenticated', guru, 'delete from materials where id = $1', [suggestion.id]);

// C19 inventory
const addItem = async (userId, label, kind = 'fibreglass', condition = 'good', note = null) => (await asApp('authenticated', userId,
  `insert into inventory_items (kind, label, condition, condition_note) values ($1, $2, $3, $4) returning *`, [kind, label, condition, note]))[0];
const khol = await addItem(guru, '  Balaram blue 3 ');
check('the Guru adds an instrument, trimmed, with its first check', khol.label === 'Balaram blue 3' && (await asOwner(
  `select kind from inventory_checks where item_id = ${khol.id}`)).map((r) => r.kind).join() === 'added');
await refusesWith('a coordinator cannot add an item', 'new row violates row-level security policy for table "inventory_items"', () => addItem(coordinator, 'Mine'));
await refusesWith('the same name twice at a centre is refused', 'duplicate key value violates unique constraint "inventory_items_label_idx"', () => addItem(guru, 'balaram BLUE 3'));
await refusesWith('a kind outside the list is refused', 'new row for relation "inventory_items" violates check constraint "inventory_items_kind_check"', () => addItem(guru, 'Mridangam', 'mridangam'));
await refusesWith('the condition is not changed directly', 'condition_frozen', () => asApp('authenticated', guru,
  `update inventory_items set condition = 'damaged' where id = $1`, [khol.id]));
const issue = (userId, item, student, profile, condition, note = null, due = null) => asApp('authenticated', userId,
  'select issue_inventory_item($1, $2, $3, $4, $5, $6) as id', [item, student, profile, condition, note, due]);
await refusesWith('a student cannot lend an item', 'not_allowed', () => issue(late, khol.id, lateStudent, null, 'good'));
await refusesWith('a borrower is needed (one)', 'borrower_required', () => issue(coordinator, khol.id, lateStudent, coordinator2, 'good'));
await refusesWith('a damaged item cannot go out', 'item_not_lendable', () => issue(coordinator, khol.id, lateStudent, null, 'damaged', 'Cracked'));
await refusesWith('needs care needs a note', 'note_required', () => issue(coordinator, khol.id, lateStudent, null, 'needs_care', ' '));
const [{ id: loan }] = await issue(coordinator, khol.id, lateStudent, null, 'needs_care', 'Strap loose', '2099-01-01');
check('a coordinator lends it to a student with the condition seen', (await asOwner(
  `select condition from inventory_items where id = ${khol.id}`))[0].condition === 'needs_care');
await refusesWith('an item out cannot be lent again', 'item_out', () => issue(coordinator2, khol.id, arjunStudent, null, 'good'));
check('the student sees the item they hold and their loan', (await asApp('authenticated', late,
  'select label from inventory_items')).map((r) => r.label).join() === 'Balaram blue 3'
  && (await asApp('authenticated', late, 'select id from inventory_loans')).length === 1);
check('another student sees neither', (await asApp('authenticated', arjun, 'select id from inventory_items')).length === 0
  && (await asApp('authenticated', arjun, 'select id from inventory_loans')).length === 0);
check('a student cannot read the condition history', (await asApp('authenticated', late, 'select id from inventory_checks')).length === 0);
await refusesWith('the app cannot write a loan itself', 'new row violates row-level security policy for table "inventory_loans"', () => asApp('authenticated', coordinator,
  `insert into inventory_loans (item_id, student_id, issued_by, condition_out) values ($1, $2, auth.uid(), 'good')`, [khol.id, lateStudent]));
await refusesWith('an item on loan cannot be retired', 'item_out', () => asApp('authenticated', guru,
  'update inventory_items set retired_at = now() where id = $1', [khol.id]));
await asApp('authenticated', coordinator2, `select return_inventory_item($1, 'damaged', 'Baya head torn')`, [loan]);
const [backItem] = await asOwner(`select condition, condition_note from inventory_items where id = ${khol.id}`);
check('a coordinator takes it back damaged; the item shows it', backItem.condition === 'damaged' && backItem.condition_note === 'Baya head torn');
check('... and the Guru is told', (await teamOutboxFor(guru, `/staff/inventory/${khol.id}`)).some((r) => r.body === 'Marked damaged: Baya head torn'));
await refusesWith('a loan is returned once', 'already_returned', () => asApp('authenticated', coordinator,
  `select return_inventory_item($1, 'good')`, [loan]));
check('the student no longer sees the item', (await asApp('authenticated', late, 'select id from inventory_items')).length === 0
  && (await asApp('authenticated', late, 'select id from inventory_loans')).length === 1);
await asApp('authenticated', coordinator, `select check_inventory_item($1, 'in_repair', 'At the drum maker')`, [khol.id]);
await asApp('authenticated', coordinator, `select check_inventory_item($1, 'good')`, [khol.id]);
check('condition checks keep the history', (await asOwner(`select string_agg(kind || ':' || condition, ',' order by id) as h
  from inventory_checks where item_id = ${khol.id}`))[0].h === 'added:good,issue:needs_care,return:damaged,check:in_repair,check:good');
const [{ id: staffLoan }] = await issue(coordinator, khol.id, null, coordinator2, 'good');
check('a coordinator can borrow an item and sees their loan', (await asApp('authenticated', coordinator2,
  'select id from inventory_loans where returned_at is null')).some((r) => Number(r.id) === staffLoan));
await asApp('authenticated', coordinator, `select return_inventory_item($1, 'good')`, [staffLoan]);
await refusesWith('an item with loans cannot be deleted', 'update or delete on table "inventory_items" violates foreign key constraint "inventory_loans_item_id_fkey" on table "inventory_loans"', () => asApp('authenticated', guru, 'delete from inventory_items where id = $1', [khol.id]));
await asApp('authenticated', guru, 'update inventory_items set retired_at = now() where id = $1', [khol.id]);
await refusesWith('a retired item cannot be lent', 'item_retired', () => issue(coordinator, khol.id, lateStudent, null, 'good'));
const typo = await addItem(guru, 'Kartal pair 1', 'kartals');
check('an item never lent can be deleted', (await asApp('authenticated', guru, 'delete from inventory_items where id = $1 returning id', [typo.id])).length === 1);
check('item changes go to the audit log', (await asOwner(`select count(*)::int as n from audit_log where table_name = 'inventory_items'`))[0].n >= 3);

// C20 duty roster
const dutyDay = (await asOwner('select (today_ist() + 1)::text as d'))[0].d;
const saveShift = (userId, id, date, from, to, duty, people, weeks = 1) => asApp('authenticated', userId,
  'select save_duty_shift($1, 1::smallint, $2::date, $3::time, $4::time, $5, $6::uuid[], $7) as ids', [id, date, from, to, duty, people, weeks]);
await refusesWith('a coordinator cannot plan a shift', 'not_allowed', () => saveShift(coordinator, null, dutyDay, '14:30', '17:00', null, [coordinator]));
await refusesWith('a shift is inside the open hours', 'outside_hours', () => saveShift(guru, null, dutyDay, '13:00', '17:00', null, [coordinator]));
await refusesWith('... ends after it starts', 'time_invalid', () => saveShift(guru, null, dutyDay, '17:00', '16:00', null, [coordinator]));
await refusesWith('... not in the past', 'date_past', () => saveShift(guru, null, '2020-01-01', '14:30', '17:00', null, [coordinator]));
await refusesWith('... has people', 'people_required', () => saveShift(guru, null, dutyDay, '14:30', '17:00', null, []));
await refusesWith('... only coordinators', 'not_a_coordinator', () => saveShift(guru, null, dutyDay, '14:30', '17:00', null, [late]));
const [{ ids: shiftIds }] = await saveShift(guru, null, dutyDay, '14:30', '17:00', '  Desk ', [coordinator, coordinator2], 3);
check('the Guru plans a shift with two coordinators, repeated for 3 weeks', shiftIds.length === 3 && (await asOwner(
  `select count(*)::int as n from duty_assignments where shift_id = any('{${shiftIds.join(',')}}')`))[0].n === 6);
check('coordinators see the roster; a student does not', (await asApp('authenticated', coordinator, 'select id from duty_shifts')).length >= 3
  && (await asApp('authenticated', late, 'select id from duty_shifts')).length === 0
  && (await asApp('authenticated', late, 'select shift_id from duty_assignments')).length === 0);
await refusesWith('a coordinator cannot change the roster', 'new row violates row-level security policy for table "duty_assignments"', () => asApp('authenticated', coordinator,
  `insert into duty_assignments (shift_id, profile_id) values ($1, auth.uid())`, [shiftIds[1]]).then((r) => r));
check('... not even deleting', (await asApp('authenticated', coordinator, 'delete from duty_shifts where id = $1 returning id', [shiftIds[2]])).length === 0);
// pg_cron runs with nobody signed in.
await asOwner(`select set_config('request.jwt.claim.sub', '', false)`);
const [{ n: dutyQueued }] = await asOwner('select duty_daily() as n');
check('the evening job reminds both on tomorrow\'s shift', dutyQueued === 2, String(dutyQueued));
check('... in their language, with the time and duty', (await teamOutboxFor(coordinator, '/staff/duty')).some((r) =>
  r.body === 'You are on duty tomorrow: 14:30-17:00, Desk'));
check('... once', (await asOwner('select duty_daily() as n'))[0].n === 0);
await saveShift(guru, shiftIds[0], dutyDay, '15:00', '18:00', 'Desk', [coordinator]);
check('an edit takes a person off and reminds again after a time change', (await asOwner(
  `select profile_id, reminded_at from duty_assignments where shift_id = ${shiftIds[0]}`)).every((r) => r.reminded_at === null)
  && (await asOwner(`select count(*)::int as n from duty_assignments where shift_id = ${shiftIds[0]}`))[0].n === 1);
await asApp('authenticated', guru, 'delete from duty_shifts where id = any($1::bigint[])', [shiftIds]);
check('app roles cannot run the team-tools helpers', (await asOwner(`select
  has_function_privilege('authenticated', 'duty_daily()', 'execute')
  or has_function_privilege('authenticated', 'queue_team_push(uuid[], text, text, text, text)', 'execute')
  or has_function_privilege('anon', 'issue_inventory_item(bigint, uuid, uuid, text, text, date)', 'execute')
  or has_function_privilege('authenticated', 'guard_material_suggestion()', 'execute') as ok`))[0].ok === false);

// ---------------------------------------------------------------- class fund (0026)
// coordinator2 becomes the treasurer; coordinator is a coordinator who only reads; late is a student.
await refusesWith('a coordinator cannot make themselves treasurer', 'only the Guru can change role, treasurer or active', () => asApp('authenticated', coordinator,
  'update profiles set is_treasurer = true where id = auth.uid()'));
await refusesWith('only a coordinator can be a treasurer', 'treasurer_coordinator_only', () => asApp('authenticated', guru,
  'update profiles set is_treasurer = true where id = $1', [late]));
await asApp('authenticated', guru, 'update profiles set is_treasurer = true where id = $1', [coordinator2]);
check('the Guru makes a coordinator treasurer', (await asApp('authenticated', coordinator2, 'select is_treasurer() as t, is_fund_keeper() as k'))[0].k === true
  && (await asApp('authenticated', coordinator, 'select is_fund_keeper() as k'))[0].k === false);
const fundToday = (await asOwner('select today_ist()::text as d'))[0].d;
const fundCat = async (code) => (await asOwner(`select id from fund_categories where code = '${code}'`))[0].id;
const [donation, repair, prasadam] = [await fundCat('donation'), await fundCat('instruments'), await fundCat('prasadam')];
const record = async (userId, direction, category, paise, extra = {}) => Number((await asApp('authenticated', userId,
  'select record_fund_entry($1, $2::smallint, $3::date, $4::bigint, $5, $6, $7, $8, $9) as id',
  [direction, category, extra.date ?? fundToday, paise, extra.party ?? null, extra.reference ?? null, extra.note ?? null,
   extra.bill ?? null, extra.bill ? (extra.billName ?? 'Bill.jpg') : null]))[0].id);
const uploadBill = async (userId, path = null, size = 2048) => {
  const name = path ?? `${userId}/${await newId()}.jpg`;
  await asApp('authenticated', userId, `insert into storage.objects (bucket_id, name, owner, metadata) values ('fund-bills', $1, auth.uid(), $2)`,
    [name, JSON.stringify({ size, mimetype: 'image/jpeg' })]);
  return name;
};
const canOpenBill = async (userId, path) => (await asApp('authenticated', userId,
  `select 1 from storage.objects where bucket_id = 'fund-bills' and name = $1`, [path])).length === 1;
const balanceAs = async (userId) => Number((await asApp('authenticated', userId, 'select fund_balance() as b'))[0].b);
const entryOf = async (id) => (await asOwner(`select status, decided_by, decision_note, amount_paise from fund_entries where id = ${id}`))[0];
const fundOutboxFor = async (userId, id) => teamOutboxFor(userId, `/staff/fund/${id}`);

check('the categories are seeded; staff read them, a student does not', (await asApp('authenticated', coordinator,
  'select id from fund_categories')).length === 8 && (await asApp('authenticated', late, 'select id from fund_categories')).length === 0);
const [{ id: melaCat }] = await asApp('authenticated', guru, `insert into fund_categories (direction, name, code) values ('expense', '  Kirtan mela ', 'x') returning id, name, code`);
check('the Guru adds a category, trimmed, without a code', (await asOwner(`select name, code from fund_categories where id = ${melaCat}`))[0].code === null);
await refusesWith('a coordinator cannot add a category', 'new row violates row-level security policy for table "fund_categories"', () => asApp('authenticated', coordinator2,
  `insert into fund_categories (direction, name) values ('income', 'Mine')`));
await refusesWith('a category keeps its kind', 'category_frozen', () => asApp('authenticated', guru,
  `update fund_categories set direction = 'income' where id = $1`, [melaCat]));
await refusesWith('a category is not deleted', 'permission denied for table fund_categories', () => asApp('authenticated', guru, 'delete from fund_categories where id = $1', [melaCat]));

const income = await record(coordinator2, 'income', donation, 1000000, { party: ' Sri Rama das ', reference: 'Temple receipt 1043' });
check('the treasurer records a donation; it counts at once', (await entryOf(income)).status === 'approved' && (await balanceAs(guru)) === 1000000);
await refusesWith('a coordinator who is not treasurer cannot record', 'not_allowed', () => record(coordinator, 'income', donation, 100));
await refusesWith('a student cannot record', 'not_allowed', () => record(late, 'income', donation, 100));
await refusesWith('the category must be of the same kind', 'category_invalid', () => record(coordinator2, 'income', repair, 100));
await refusesWith('an amount is at least one paisa', 'amount_invalid', () => record(coordinator2, 'income', donation, 0));
await refusesWith('a date is not in the future', 'date_future', () => record(coordinator2, 'income', donation, 100, { date: '2099-01-01' }));
await refusesWith('an expense over Rs 500 needs a bill', 'bill_required', () => record(coordinator2, 'expense', repair, 50001));
const small = await record(coordinator2, 'expense', prasadam, 50000, { note: 'Sunday prasadam' });
check('an expense of Rs 500 needs no bill and counts at once', (await entryOf(small)).status === 'approved' && (await balanceAs(coordinator)) === 950000);
await refusesWith('a coordinator who is not treasurer cannot upload a bill', 'new row violates row-level security policy for table "objects"', () => uploadBill(coordinator));
const bill1 = await uploadBill(coordinator2);
await refusesWith('a bill from someone else\'s folder is refused', 'bill_not_yours', () => record(guru, 'expense', repair, 150000, { bill: bill1 }));
await refusesWith('a bill must be in Storage', 'bill_missing', () => record(coordinator2, 'expense', repair, 150000, { bill: `${coordinator2}/${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}.jpg` }));
const repairEntry = await record(coordinator2, 'expense', repair, 150000, { bill: bill1, party: 'Drum maker' });
check('an expense of Rs 1,500 with its bill counts at once', (await entryOf(repairEntry)).status === 'approved' && (await balanceAs(guru)) === 800000);
check('every coordinator opens the bill; a student cannot', await canOpenBill(coordinator, bill1) && !(await canOpenBill(late, bill1)));
check('a bill on an entry cannot be deleted', (await asApp('authenticated', coordinator2,
  `delete from storage.objects where bucket_id = 'fund-bills' and name = $1 returning name`, [bill1])).length === 0);
const orphan = await uploadBill(coordinator2);
check('... a bill no entry lists can (a save that failed)', (await asApp('authenticated', coordinator2,
  `delete from storage.objects where bucket_id = 'fund-bills' and name = $1 returning name`, [orphan])).length === 1);

// Maker-checker
const big = await record(coordinator2, 'expense', repair, 250000, { bill: await uploadBill(coordinator2) });
check('an expense over Rs 2,000 waits and does not count yet', (await entryOf(big)).status === 'waiting' && (await balanceAs(guru)) === 800000);
check('... the Guru is told', (await fundOutboxFor(guru, big)).some((r) => r.title === 'Rs 2500 · Instrument repair or purchase'
  && /^An entry by .* needs your approval\.$/.test(r.body)));
await refusesWith('the maker cannot approve their own entry', 'own_entry', () => asApp('authenticated', coordinator2,
  'select decide_fund_entry($1, true)', [big]));
await refusesWith('a coordinator who is not treasurer cannot approve', 'not_allowed', () => asApp('authenticated', coordinator, 'select decide_fund_entry($1, true)', [big]));
await asApp('authenticated', guru, 'select decide_fund_entry($1, true)', [big]);
check('the Guru approves it; now it counts', (await entryOf(big)).status === 'approved' && (await entryOf(big)).decided_by === guru
  && (await balanceAs(guru)) === 550000);
check('... and the treasurer is told', (await fundOutboxFor(coordinator2, big)).some((r) => r.body === 'Your entry was approved.'));
await refusesWith('a decision is made once', 'already_decided', () => asApp('authenticated', guru, 'select decide_fund_entry($1, false, $2)', [big, 'No']));
const guruBig = await record(guru, 'expense', prasadam, 300000, { bill: await uploadBill(guru) });
await refusesWith('the Guru cannot approve the Guru\'s own entry', 'own_entry', () => asApp('authenticated', guru, 'select decide_fund_entry($1, true)', [guruBig]));
check('... the treasurer is told instead', (await fundOutboxFor(coordinator2, guruBig)).length === 1 && (await fundOutboxFor(guru, guruBig)).length === 0);
await asApp('authenticated', coordinator2, 'select decide_fund_entry($1, true)', [guruBig]);
check('... and approves it', (await entryOf(guruBig)).status === 'approved' && (await balanceAs(guru)) === 250000);
const treasurerBig = await record(coordinator2, 'expense', melaCat, 400000, { bill: await uploadBill(coordinator2) });
await refusesWith('a treasurer cannot approve another treasurer\'s or own entry', 'own_entry', () => asApp('authenticated', coordinator2,
  'select decide_fund_entry($1, true)', [treasurerBig]));
await refusesWith('declining needs a reason', 'reason_required', () => asApp('authenticated', guru, 'select decide_fund_entry($1, false, $2)', [treasurerBig, '  ']));
await asApp('authenticated', guru, 'select decide_fund_entry($1, false, $2)', [treasurerBig, ' Get a second quote. ']);
check('the Guru declines with a reason; it never counts', (await entryOf(treasurerBig)).status === 'declined'
  && (await entryOf(treasurerBig)).decision_note === 'Get a second quote.' && (await balanceAs(guru)) === 250000);
check('... the treasurer is told why', (await fundOutboxFor(coordinator2, treasurerBig)).some((r) => r.body === 'Not approved: Get a second quote.'));
const typoEntry = await record(coordinator2, 'expense', repair, 220000, { bill: await uploadBill(coordinator2) });
await refusesWith('only the maker withdraws a waiting entry', 'not_yours', () => asApp('authenticated', guru, 'select withdraw_fund_entry($1)', [typoEntry]));
await asApp('authenticated', coordinator2, 'select withdraw_fund_entry($1, $2)', [typoEntry, 'Typed 2200 for 220']);
check('the maker withdraws their own waiting entry', (await entryOf(typoEntry)).status === 'withdrawn');

// Never deleted, never changed: reversed
await refusesWith('the app cannot write the ledger directly, not even the Guru', 'permission denied for table fund_entries', () => asApp('authenticated', guru,
  `insert into fund_entries (direction, category_id, on_date, amount_paise, status, created_by) values ('income', $1, current_date, 100, 'approved', auth.uid())`, [donation]));
check('... nor change or delete it', (await asApp('authenticated', guru, 'update fund_entries set amount_paise = 1 where id = $1 returning id', [income]).catch(() => [])).length === 0
  && (await asApp('authenticated', guru, 'delete from fund_entries where id = $1 returning id', [income]).catch(() => [])).length === 0);
await refusesWith('an entry is never deleted, not even in the dashboard', 'fund_entry_kept', () => asOwner(`delete from fund_entries where id = ${income}`));
await refusesWith('... nor changed', 'fund_entry_frozen', () => asOwner(`update fund_entries set amount_paise = 1 where id = ${income}`));
await refusesWith('a reversal needs a reason', 'reason_required', () => asApp('authenticated', coordinator2, 'select reverse_fund_entry($1, $2)', [repairEntry, ' ']));
await refusesWith('a coordinator who is not treasurer cannot reverse', 'not_allowed', () => asApp('authenticated', coordinator, 'select reverse_fund_entry($1, $2)', [repairEntry, 'x']));
const [{ id: reversal }] = await asApp('authenticated', coordinator2, 'select reverse_fund_entry($1, $2) as id', [repairEntry, 'Drum maker refunded']);
check('a small entry is reversed by a negative counter-entry that counts at once', (await asOwner(
  `select amount_paise::int as a, status, direction from fund_entries where id = ${reversal}`))[0].a === -150000 && (await balanceAs(guru)) === 400000);
await refusesWith('an entry is reversed once', 'already_reversed', () => asApp('authenticated', guru, 'select reverse_fund_entry($1, $2)', [repairEntry, 'again']));
await refusesWith('a reversal is not reversed', 'cannot_reverse', () => asApp('authenticated', guru, 'select reverse_fund_entry($1, $2)', [reversal, 'x']));
await refusesWith('a declined entry is not reversed', 'cannot_reverse', () => asApp('authenticated', guru, 'select reverse_fund_entry($1, $2)', [treasurerBig, 'x']));
const [{ id: bigReversal }] = await asApp('authenticated', coordinator2, 'select reverse_fund_entry($1, $2) as id', [income, 'Cheque bounced']);
check('a big reversal waits for approval and does not count yet', (await entryOf(bigReversal)).status === 'waiting' && (await balanceAs(guru)) === 400000);
await asApp('authenticated', guru, 'select decide_fund_entry($1, false, $2)', [bigReversal, 'It cleared on Monday']);
const [{ id: reversalAgain }] = await asApp('authenticated', coordinator2, 'select reverse_fund_entry($1, $2) as id', [income, 'Cheque bounced after all']);
check('after a declined reversal a new one may be tried', (await entryOf(reversalAgain)).status === 'waiting');
await asApp('authenticated', coordinator2, 'select withdraw_fund_entry($1)', [reversalAgain]);

// Who sees what
check('every coordinator reads the ledger and the balance', (await asApp('authenticated', coordinator, 'select id from fund_entries')).length >= 9
  && (await balanceAs(coordinator)) === 400000);
check('a student sees no entry and a balance of 0', (await asApp('authenticated', late, 'select id from fund_entries')).length === 0
  && (await balanceAs(late)) === 0);
check('anon sees no entry or category', (await asApp('anon', null, 'select id from fund_entries').catch(() => [])).length === 0
  && (await asApp('anon', null, 'select id from fund_categories').catch(() => [])).length === 0);
await refusesWith('anon cannot run the fund functions', 'permission denied for function fund_balance', () => asApp('anon', null, 'select fund_balance()'));
check('fund changes go to the audit log', (await asOwner(`select count(*)::int as n from audit_log where table_name = 'fund_entries'`))[0].n >= 14);

// The limits are settings (G10)
await refusesWith('the approval limit is a whole number of rupees, not negative', 'setting_invalid', () => asApp('authenticated', guru,
  `select save_settings('{"fund_approval_rupees": -1}')`));
await asApp('authenticated', guru, `select save_settings('{"fund_approval_rupees": 0, "fund_bill_rupees": 0}')`);
await refusesWith('with the bill limit at 0 every expense needs a bill', 'bill_required', () => record(coordinator2, 'expense', prasadam, 100));
const tiny = await record(coordinator2, 'expense', prasadam, 100, { bill: await uploadBill(coordinator2) });
check('with the approval limit at 0 every expense waits', (await entryOf(tiny)).status === 'waiting');
await asApp('authenticated', coordinator2, 'select withdraw_fund_entry($1)', [tiny]);
await asApp('authenticated', guru, `select save_settings('{"fund_approval_rupees": 2000, "fund_bill_rupees": 500}')`);
check('app roles cannot run the fund helpers', (await asOwner(`select
  has_function_privilege('authenticated', 'queue_fund_push(uuid[], text, fund_entries, text)', 'execute')
  or has_function_privilege('authenticated', 'fund_approvers(uuid)', 'execute')
  or has_function_privilege('authenticated', 'guard_fund_entry()', 'execute')
  or has_function_privilege('anon', 'record_fund_entry(text, smallint, date, bigint, text, text, text, text, text)', 'execute')
  or has_table_privilege('authenticated', 'fund_entries', 'insert')
  or has_table_privilege('anon', 'fund_categories', 'select') as ok`))[0].ok === false);
await asApp('authenticated', guru, 'update profiles set is_treasurer = false where id = $1', [coordinator2]);
await refusesWith('a former treasurer can no longer record', 'not_allowed', () => record(coordinator2, 'income', donation, 100));

// ---------------------------------------------------------------- security round (0025)
// D1a-08: switched-off logins, a login without a profile, and the door tablet (kiosk).
const offCoord = await signUp('off.coordinator@example.com', true);
await asApp('authenticated', guru, `update profiles set role = 'coordinator' where id = '${offCoord}'`);
await asApp('authenticated', guru, `update profiles set active = false where id = '${offCoord}'`);
const secAdult = await register(coordinator, { p_full_name: 'Sec Round Adult', p_dob: '1999-09-09', p_email: 'sec.adult@example.com' });
const secLogin = await signUp('sec.adult@example.com', true);
check('0025: a confirmed sign-up still links to its record by email', (await linkOf('sec.adult@example.com')) === secLogin);
const [{ qr_token: secQr }] = await asOwner(`select qr_token from students where id = '${secAdult.id}'`);
await refusesWith('a switched-off coordinator cannot run toggle_visit', 'not_allowed', () =>
  asApp('authenticated', offCoord, `select toggle_visit($1, 'manual')`, [secAdult.id]));
await refusesWith('... nor scan_qr', 'not_allowed', () => asApp('authenticated', offCoord, 'select scan_qr($1)', [secQr]));
await refusesWith('... not even with an unknown code (no probing)', 'not_allowed', () =>
  asApp('authenticated', offCoord, `select scan_qr('00000000-0000-4000-8000-000000000000')`));
await refusesWith('... nor mark_visit', 'not_allowed', () => asApp('authenticated', offCoord, `select mark_visit($1, 'in')`, [secAdult.id]));
await refusesWith('... nor log_call', 'not_allowed', () =>
  logCall(offCoord, { p_student: secAdult.id, p_outcome: 'not_reachable', p_reason: null, p_comment: 'x' }));
check('... and reads no student, guardian or consent', (await asApp('authenticated', offCoord, 'select id from students')).length === 0
  && (await asApp('authenticated', offCoord, 'select id from guardians')).length === 0
  && (await asApp('authenticated', offCoord, 'select id from consents')).length === 0);
await asApp('authenticated', guru, `update profiles set active = false where id = '${secLogin}'`);
check('a switched-off student no longer reads their own record or QR token',
  (await asApp('authenticated', secLogin, 'select qr_token from students')).length === 0);
await refusesWith('... and cannot check themselves in', 'not_allowed', () => asApp('authenticated', secLogin, 'select scan_qr($1)', [secQr]));
await asApp('authenticated', guru, `update profiles set active = true where id = '${secLogin}'`);
check('switched on again, the student reads their record', (await asApp('authenticated', secLogin, 'select id from students')).length === 1);
const noProfile = await signUp('no.profile@example.com', true);
await asOwner(`delete from profiles where id = '${noProfile}'`);
await refusesWith('a login without a profile cannot run toggle_visit', 'not_allowed', () =>
  asApp('authenticated', noProfile, `select toggle_visit($1, 'manual')`, [secAdult.id]));
const kiosk = await signUp('door.tablet@example.com', true);
await asOwner(`update profiles set role = 'kiosk' where id = '${kiosk}'`);
const [kioskIn] = await asApp('authenticated', kiosk, 'select scan_qr($1) as r', [secQr]);
await asOwner(`update visits set check_in = check_in - interval '1 minute' where student_id = '${secAdult.id}' and check_out is null`);
const [kioskOut] = await asApp('authenticated', kiosk, 'select scan_qr($1) as r', [secQr]);
check('the door tablet (kiosk) checks a student in and out by QR', kioskIn.r.action === 'in' && kioskOut.r.action === 'out');
await refusesWith('... but cannot mark by name', 'not_allowed', () => asApp('authenticated', kiosk, `select mark_visit($1, 'in')`, [secAdult.id]));
check('... reads no student, guardian, consent or call', (await asApp('authenticated', kiosk, 'select id from students')).length === 0
  && (await asApp('authenticated', kiosk, 'select id from guardians')).length === 0
  && (await asApp('authenticated', kiosk, 'select id from consents')).length === 0
  && (await asApp('authenticated', kiosk, 'select id from call_logs')).length === 0);
await refusesWith('... and cannot register a student', 'not_allowed', () => register(kiosk, { p_full_name: 'Kiosk Kid', p_dob: '1990-01-01' }));

// D1a-04: profile_id, qr_token and created_by are frozen for app users; links go through the functions.
const stranger = await signUp('stranger.sec@example.com', true);
await refusesWith('a coordinator cannot attach a login to a child\'s record', 'student_field_locked', () =>
  asApp('authenticated', coordinator, 'update students set profile_id = $2 where id = $1', [child.id, stranger]));
await refusesWith('... nor swap a record to another login in one step', 'student_field_locked', () =>
  asApp('authenticated', coordinator, `update students set profile_id = null, email = 'stranger.sec@example.com' where id = $1`, [secAdult.id]));
check('... the record keeps its login', (await linkOf('sec.adult@example.com')) === secLogin && (await roleOf(stranger)) === 'pending');
await refusesWith('... nor change a QR token', 'student_field_locked', () =>
  asApp('authenticated', coordinator, 'update students set qr_token = gen_random_uuid() where id = $1', [secAdult.id]));
await refusesWith('... nor who registered the student', 'student_field_locked', () =>
  asApp('authenticated', coordinator, 'update students set created_by = $2 where id = $1', [secAdult.id, guru]));
await refusesWith('even the Guru cannot set profile_id directly', 'student_field_locked', () =>
  asApp('authenticated', guru, 'update students set profile_id = $2 where id = $1', [child.id, stranger]));
await refusesWith('a record cannot lose its date of birth', 'dob_required', () =>
  asApp('authenticated', coordinator, 'update students set dob = null where id = $1', [secAdult.id]));
await refusesWith('a record cannot be added without a date of birth', 'dob_required', () =>
  asApp('authenticated', coordinator, `insert into students (full_name) values ('No Dob')`));
const unlinked = await register(coordinator, { p_full_name: 'Sec Later Email', p_dob: '1998-08-08' });
const laterLogin = await signUp('sec.later@example.com', true);
await asApp('authenticated', coordinator, `update students set email = 'sec.later@example.com' where id = $1`, [unlinked.id]);
check('saving an email on a record without a login still links a waiting login (0002)',
  (await linkOf('sec.later@example.com')) === laterLogin && (await roleOf(laterLogin)) === 'student');
await refusesWith('a coordinator cannot unlink a login', 'not_allowed', () => asApp('authenticated', coordinator, 'select unlink_student_login($1)', [unlinked.id]));
await asApp('authenticated', guru, 'select unlink_student_login($1)', [unlinked.id]);
check('the Guru unlinks a login; it goes back to waiting', (await linkOf('sec.later@example.com')) === null && (await roleOf(laterLogin)) === 'pending');
await asApp('authenticated', guru, 'select link_student_login($1, $2)', [laterLogin, unlinked.id]);
check('... and links it again with link_student_login (0014)', (await linkOf('sec.later@example.com')) === laterLogin);
await refusesWith('a coordinator cannot change a level', 'level_guru_only', () =>
  asApp('authenticated', coordinator, 'update students set level_id = 2 where id = $1', [secAdult.id]));
await asApp('authenticated', guru, 'update students set level_id = 2 where id = $1', [secAdult.id]);
check('a level change by the Guru is kept in level_history', (await asOwner(
  `select count(*)::int as n from level_history where student_id = '${secAdult.id}' and to_level = 2 and approved_by = '${guru}'`))[0].n === 1);
const goner = await register(coordinator, { p_full_name: 'Sec Deleted', p_dob: '1997-07-07', p_email: 'sec.deleted@example.com' });
const gonerLogin = await signUp('sec.deleted@example.com', true);
await asApp('authenticated', guru, 'delete from students where id = $1', [goner.id]);
check('a deleted record\'s login goes back to waiting', (await roleOf(gonerLogin)) === 'pending');

// D1a-02, FS1a-04: the consent register. child = the minor registered above (data + photo consents).
const consentCount = async (studentId) => (await asOwner(`select count(*)::int as n from consents where student_id = '${studentId}'`))[0].n;
check('a coordinator cannot delete a minor\'s consent (0 rows)', (await asApp('authenticated', coordinator,
  'delete from consents where student_id = $1 returning id', [child.id])).length === 0 && (await consentCount(child.id)) === 2);
// Since 0034 a coordinator cannot even see a consent row, so an update finds nothing; the field
// locks are then checked with the Guru, who still reads the table.
check('... nor revoke it (0034: finds no row)', (await asApp('authenticated', coordinator,
  `update consents set revoked_at = now() where student_id = $1 and scope = 'data' returning id`, [child.id])).length === 0
  && (await asOwner(`select count(*)::int as n from consents where student_id = '${child.id}' and revoked_at is null`))[0].n === 2);
await refusesWith('... nor may the Guru turn it into a photo consent', 'consent_locked', () =>
  asApp('authenticated', guru, `update consents set scope = 'photo' where student_id = $1 and scope = 'data'`, [child.id]));
await refusesWith('... nor move it to another student', 'consent_locked', () =>
  asApp('authenticated', guru, 'update consents set student_id = $2 where student_id = $1', [child.id, secAdult.id]));
await refusesWith('... nor rewrite who verified it and when', 'consent_locked', () =>
  asApp('authenticated', guru, `update consents set verified_by = $2, given_at = now() - interval '1 year' where student_id = $1`, [child.id, guru]));
await refusesWith('... nor change the privacy-notice version it was given under (0034)', 'consent_locked', () =>
  asApp('authenticated', guru, `update consents set notice_version = '9.9' where student_id = $1`, [child.id]));
const forgedId = await newId();
await asApp('authenticated', coordinator, `insert into consents (id, student_id, scope, verified_by, given_at, method, otp_verified_at, signed_form)
  values ($3, $1, 'data', $2, '2020-01-01', 'written', now(), true)`, [child.id, guru, forgedId]);
const [forged] = await asOwner(`select verified_by, given_at, otp_verified_at from consents where id = '${forgedId}'`);
check('a new consent is verified by whoever saves it, now (not back-dated, not "by the Guru")', forged.verified_by === coordinator
  && Date.now() - new Date(forged.given_at).getTime() < 600000 && forged.otp_verified_at === null, JSON.stringify(forged));
await refusesWith('a written consent needs the signed-form tick', 'written_consent_required', () =>
  asApp('authenticated', coordinator, `insert into consents (student_id, scope) values ($1, 'photo')`, [child.id]));
await refusesWith('the Guru cannot revoke a minor\'s last data consents (checked at commit)', 'minor_needs_consent', () =>
  asApp('authenticated', guru, `update consents set revoked_at = now() where student_id = $1 and scope = 'data'`, [child.id]));
await refusesWith('... nor delete them', 'minor_needs_consent', () =>
  asApp('authenticated', guru, `delete from consents where student_id = $1 and scope = 'data'`, [child.id]));
await asApp('authenticated', guru, `update consents set revoked_at = now()
  where id = (select id from consents where student_id = $1 and scope = 'data' order by given_at desc limit 1)`, [child.id]);
check('... but may revoke one of two, which then stays revoked', (await asOwner(
  `select count(*)::int as n from consents where student_id = '${child.id}' and scope = 'data' and revoked_at is null`))[0].n === 1);
await refusesWith('a revoked consent cannot be brought back', 'consent_locked', () =>
  asApp('authenticated', guru, `update consents set revoked_at = null where student_id = $1 and revoked_at is not null`, [child.id]));
await refusesWith('a minor cannot lose her last guardian (checked at commit)', 'minor_needs_guardian', () =>
  asApp('authenticated', guru, 'update guardians set student_id = $2 where student_id = $1', [child.id, secAdult.id]));
check('consent and guardian changes are in the audit log', (await asOwner(`select count(*)::int as n from audit_log
  where table_name in ('consents', 'guardians') and (old_row ->> 'student_id' = '${child.id}' or new_row ->> 'student_id' = '${child.id}')`))[0].n >= 5);
await refusesWith('a minor is not registered without the signed-form tick', 'written_consent_required', () =>
  register(coordinator, { p_full_name: 'Sec Child', p_dob: childDob, p_guardian_name: 'Parent', p_guardian_phone: '9000012345',
    p_guardian_relation: 'father', p_id_type_checked: 'aadhaar' }));
await refusesWith('... nor with the tick false', 'written_consent_required', () =>
  register(coordinator, { p_full_name: 'Sec Child', p_dob: childDob, p_guardian_name: 'Parent', p_guardian_phone: '9000012345',
    p_guardian_relation: 'father', p_id_type_checked: 'aadhaar', p_written_consent: false }));
const [{ d: eighteen }] = await asOwner(`select (today_ist() - interval '18 years')::date::text as d`);
const [{ d: almost18 }] = await asOwner(`select (today_ist() - interval '18 years' + interval '1 day')::date::text as d`);
check('exactly 18 today needs no parent', /^MS-/.test((await register(coordinator, { p_full_name: 'Sec Eighteen', p_dob: eighteen })).roll_no));
await refusesWith('... one day short of 18 does', 'minor_needs_guardian', () => register(coordinator, { p_full_name: 'Sec Almost', p_dob: almost18 }));
await refusesWith('a date of birth that makes an adult a minor is refused', 'minor_needs_consent', () =>
  asApp('authenticated', coordinator, 'update students set dob = $2 where id = $1', [secAdult.id, childDob]));

// D4-04: withdrawal. A minor with a login, a phone, an open visit and a logged call.
const minor = await register(coordinator, { p_full_name: 'Sec Minor Child', p_dob: childDob, p_email: 'sec.minor@example.com',
  p_guardian_name: 'Sec Parent', p_guardian_phone: '9000012345', p_guardian_email: 'sec.parent@example.com',
  p_guardian_relation: 'mother', p_id_type_checked: 'aadhaar', p_written_consent: true });
const minorLogin = await signUp('sec.minor@example.com', true);
check('a registered minor\'s consent records the signed-form tick', (await asOwner(
  `select signed_form from consents where student_id = '${minor.id}'`)).every((r) => r.signed_form === true));
await registerToken(minorLogin, 'ExponentPushToken[secminor]');
await logCall(coordinator, { p_student: minor.id, p_outcome: 'not_reachable', p_reason: null, p_comment: 'Mother says Sec Minor Child is unwell' });
await asApp('authenticated', coordinator, `select toggle_visit($1, 'manual')`, [minor.id]);
await refusesWith('a coordinator cannot record a withdrawal', 'not_allowed', () => asApp('authenticated', coordinator, 'select withdraw_consent($1)', [minor.id]));
const [{ r: withdrawn }] = await asApp('authenticated', guru, 'select withdraw_consent($1, $2) as r', [minor.id, 'mother, by phone']);
check('the Guru records the withdrawal: consents revoked, login off', withdrawn.consents_revoked === 1 && withdrawn.login_switched_off === true
  && (await asOwner(`select active from profiles where id = '${minorLogin}'`))[0].active === false, JSON.stringify(withdrawn));
check('... her phones are forgotten and her open visit closed', (await asOwner(`select count(*)::int as n from push_tokens where profile_id = '${minorLogin}'`))[0].n === 0
  && (await asOwner(`select count(*)::int as n from visits where student_id = '${minor.id}' and check_out is null`))[0].n === 0);
check('... the withdrawal is in the audit log', (await asOwner(`select count(*)::int as n from audit_log
  where table_name = 'students' and row_id = '${minor.id}' and new_row ->> 'withdrawn_at' is not null`))[0].n === 1);
await refusesWith('a withdrawn student cannot be checked in', 'student_withdrawn', () =>
  asApp('authenticated', coordinator, `select toggle_visit($1, 'manual')`, [minor.id]));
await refusesWith('... nor called', 'student_withdrawn', () =>
  logCall(coordinator, { p_student: minor.id, p_outcome: 'not_reachable', p_reason: null, p_comment: 'x' }));
await refusesWith('... nor edited', 'student_withdrawn', () =>
  asApp('authenticated', coordinator, `update students set phone = '9000000404' where id = $1`, [minor.id]));
await refusesWith('... nor save a phone for pushes', 'not_allowed', () => registerToken(minorLogin, 'ExponentPushToken[secminor2]'));
check('... nor read her record', (await asApp('authenticated', minorLogin, 'select id from students')).length === 0);
await refusesWith('a withdrawal is recorded once', 'already_withdrawn', () => asApp('authenticated', guru, 'select withdraw_consent($1)', [minor.id]));

// D4-03: erasure. Afterwards nothing in any table, nor in audit_log, holds the child's data.
await refusesWith('a coordinator cannot erase a student', 'not_allowed', () => asApp('authenticated', coordinator, `select erase_student($1, 'x')`, [minor.id]));
await refusesWith('an erasure needs a reason', 'reason_required', () => asApp('authenticated', guru, `select erase_student($1, ' ')`, [minor.id]));
const [{ qr_token: minorQr }] = await asOwner(`select qr_token from students where id = '${minor.id}'`);
const [{ r: erased }] = await asApp('authenticated', guru, `select erase_student($1, 'parent asked', 'REQ-1') as r`, [minor.id]);
check('the Guru erases the student and her login', erased.roll_no === minor.roll_no && erased.login_deleted === true
  && erased.audit_rows_redacted > 0, JSON.stringify(erased));
const needles = [minor.id, minorLogin, minorQr, 'sec.minor@example.com', 'Sec Minor Child', 'sec.parent@example.com', 'Sec Parent'];
const tables = (await asOwner(`select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'`)).map((r) => r.relname);
const holding = [];
for (const table of tables) {
  const [{ n }] = (await db.query(`select count(*)::int as n from public.${table} t
    where exists (select 1 from unnest($1::text[]) x where position(lower(x) in lower(${table === 'audit_log' ? "coalesce(t.old_row::text, '') || coalesce(t.new_row::text, '')" : 't::text'})) > 0)`,
    [needles])).rows; // audit_log: the kept skeleton names her row id, by design
  if (n > 0) holding.push(`${table}:${n}`);
}
check('... no table, audit_log included, holds her name, ids, QR token, email or her parent\'s details', holding.length === 0, holding.join(' '));
check('... auth.users has no login for her', (await asOwner(`select count(*)::int as n from auth.users where id = '${minorLogin}'`))[0].n === 0);
check('... the audit log keeps the skeleton (table, action, time, who) of her rows', (await asOwner(`select count(*)::int as n from audit_log
  where row_id = '${minor.id}' and old_row is null and new_row is null`))[0].n >= 2);
check('... and a tombstone the Guru can read, a coordinator cannot', (await asApp('authenticated', guru,
  `select reason, request_ref from erasures where roll_no = $1`, [minor.roll_no]))[0]?.request_ref === 'REQ-1'
  && (await asApp('authenticated', coordinator, 'select id from erasures')).length === 0);
const loaner = await register(coordinator, { p_full_name: 'Sec Borrower', p_dob: '1996-06-06' });
const loanItem = (await addItem(guru, 'Sec khol')).id;
await issue(coordinator, loanItem, loaner.id, null, 'good');
await refusesWith('an erasure waits until a lent instrument is back', 'open_loan', () =>
  asApp('authenticated', guru, `select erase_student($1, 'parent asked')`, [loaner.id]));
// The owner in the SQL editor (no signed-in user) may record a withdrawal and erase too.
await asOwner(`select set_config('request.jwt.claim.sub', '', false)`);
check('the owner (SQL editor) records a withdrawal and erases an adult', (await asOwner(
  `select withdraw_consent('${secAdult.id}', 'by email') as r`))[0].r.login_switched_off === true
  && (await asOwner(`select erase_student('${secAdult.id}', 'asked by email') as r`))[0].r.login_deleted === true
  && (await asOwner(`select count(*)::int as n from students where id = '${secAdult.id}'`))[0].n === 0);

// Supabase refuses an UPDATE or DELETE without WHERE in calls through the API (safeupdate); PGlite
// does not, so every statement of our functions is checked here (0031's finish_push failed on TEST).
const unguarded = await asOwner(`select p.proname || ': ' || left(regexp_replace(s.stmt, '\\s+', ' ', 'g'), 80) as f
  from pg_proc p, regexp_split_to_table(regexp_replace(p.prosrc, '--[^\\n]*', '', 'g'), ';') as s(stmt)
 where p.pronamespace = 'public'::regnamespace and p.prolang in (select oid from pg_language where lanname in ('sql', 'plpgsql'))
   and s.stmt ~* '\\m(update\\s+\\w+(\\s+\\w+)?\\s+set|delete\\s+from)\\M' and s.stmt !~* '\\mwhere\\M'`);
check('every UPDATE and DELETE in our functions has a WHERE (Supabase safeupdate)', unguarded.length === 0,
  unguarded.map((r) => r.f).join(' | '));

// D1a-11, D14-03: the grant sweep. anon has no right on any table, view or sequence, and may run
// no function of ours (trigger functions cannot be called, so they are left out); internal
// functions are not open to signed-in people either.
const anonTables = await asOwner(`select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace
  and ((c.relkind in ('r', 'v', 'm', 'p') and has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'))
    or (c.relkind = 'S' and has_sequence_privilege('anon', c.oid, 'USAGE, SELECT, UPDATE')))`);
check('grant sweep: anon has no right on any table, view or sequence', anonTables.length === 0, anonTables.map((r) => r.relname).join(' '));
const anonFunctions = await asOwner(`select p.oid::regprocedure::text as f from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.prorettype <> 'trigger'::regtype
    and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
    and has_function_privilege('anon', p.oid, 'execute')
    and p.oid <> 'sign_up_choices()'::regprocedure`);
// The one exception (0036, docs/DECISIONS.md #163): the sign-up form's public centre and gender lists.
check('grant sweep: anon may run no function of ours but sign_up_choices()', anonFunctions.length === 0, anonFunctions.map((r) => r.f).join(' '));
await asOwner('create table public.zz_sweep_probe (id int)');
check('... and a table made later by the owner is not given to anon', (await asOwner(
  `select has_table_privilege('anon', 'public.zz_sweep_probe', 'SELECT') as ok`))[0].ok === false);
await asOwner('drop table public.zz_sweep_probe');
// A login still waiting for a role (pending) reads no row of any table or view, except its own
// profile and the group names open to every signed-in person. Since 0027 (slice 7) settings, centres,
// levels and the syllabus are for class roles only, so they are swept too.
const openToAll = new Set(['groups']);
const pendingReads = [];
for (const { relname } of await asOwner(`select relname from pg_class
  where relnamespace = 'public'::regnamespace and relkind in ('r', 'v', 'm', 'p') order by relname`)) {
  if (openToAll.has(relname)) continue;
  let rows = 0;
  try {
    rows = (await asApp('authenticated', stranger, `select count(*)::int as n from public.${relname}`))[0].n;
  } catch {
    rows = 0; // no table right at all: closed too
  }
  if (rows > (relname === 'profiles' ? 1 : 0)) pendingReads.push(`${relname}:${rows}`);
}
check('grant sweep: a pending login reads nothing but its own profile and the open lists', pendingReads.length === 0, pendingReads.join(' '));
const internal = ['link_login_to_student(uuid,text)', 'refresh_student_statuses()', 'close_open_visits()', 'claim_due_push()',
  'release_push_claim(bigint[])', 'send_due_push()', 'privacy_caller_ok()', 'visit_location_result(jsonb,smallint)',
  'claim_push_queue()', 'finish_push(uuid,bigint[],bigint[],jsonb,jsonb)', 'call_notify_function(jsonb)',
  'log_access(text,uuid,integer)', 'purge_access_log()'];
const openInternal = [];
for (const f of internal) {
  if ((await asOwner(`select has_function_privilege('authenticated', '${f}', 'execute') as ok`))[0].ok) openInternal.push(f);
}
check('grant sweep: internal functions are closed to signed-in people', openInternal.length === 0, openInternal.join(' '));
check('... while the app functions stay open to them', (await asOwner(`select bool_and(has_function_privilege('authenticated', f, 'execute')) as ok
  from unnest(array['erase_student(uuid,text,text)', 'withdraw_consent(uuid,text)', 'unlink_student_login(uuid)', 'scan_qr(uuid,text,jsonb)',
    'toggle_visit(uuid,visit_method,text,jsonb)', 'register_student(text,date,text,text,text,text,smallint,uuid,text,text,text,text,text,boolean,boolean,uuid,text)',
    'is_staff()', 'my_role()', 'get_guardians(uuid)', 'get_consents(uuid)', 'get_call_notes(uuid,integer)',
    'get_audit_log(text,uuid,text,timestamptz,bigint,integer)']) f`))[0].ok === true);


// ---------------------------------------------------------------- Ishtagoshti public sign-up (0027, Phase 2)
// A subscriber is a 'pending' login with an ig_subscribers row: it reads published slokas and themes
// and keeps its own notes and ticks; everything else must refuse it (the sweep at the end).
const igJoin = (userId, fields) => asApp('authenticated', userId,
  `select ig_join(p_birth_year => $1, p_terms_version => $2, p_turned_18 => $3, p_phone => $4,
     p_parent_name => $5, p_parent_email => $6, p_parent_relation => $7) as s`,
  [fields.year, fields.terms ?? 'placeholder-2026-10', fields.turned18 ?? false, fields.phone ?? null,
   fields.parent ?? null, fields.parentEmail ?? null, fields.relation ?? null]).then((r) => r[0].s);
const igState = async (userId) => (await asApp('authenticated', userId, 'select ig_my_state() as s'))[0].s;
const [{ n: publishedSlokas }] = await asOwner('select count(*)::int as n from ig_slokas where published');
const thisYear = Number((await asOwner(`select extract(year from today_ist())::int as y`))[0].y);

const unconfirmedPub = await signUp('pub.unconfirmed@example.com', false);
await refusesWith('a login whose email is not confirmed cannot join', 'email_not_confirmed', () =>
  igJoin(unconfirmedPub, { year: 1990 }));
await refusesWith('a student does not join (already reads as a student)', 'not_pending', () => igJoin(arjun, { year: 1990 }));
await refusesWith('anon cannot join', 'permission denied for function ig_join', () => asApp('anon', null, `select ig_join(1990, 'x')`));
const pubAdult = await signUp('pub.adult@example.com', true);
check('before joining, a public login reads no sloka and its state is none',
  (await igSlokas(pubAdult)).length === 0 && (await igState(pubAdult)).state === 'none');
await refusesWith('a year of birth is checked', 'birth_year_invalid', () => igJoin(pubAdult, { year: thisYear - 2 }));
await refusesWith('the terms must be agreed', 'terms_required', () => igJoin(pubAdult, { year: 1990, terms: ' ' }));
await refusesWith('a phone, when given, is a phone number', 'phone_invalid', () => igJoin(pubAdult, { year: 1990, phone: 'call me' }));
const adultState = await igJoin(pubAdult, { year: 1990, phone: ' +91 98765 43210 ' });
check('an adult joins at once: state active, phone kept, no parent asked', adultState.state === 'active'
  && adultState.minor === false && adultState.phone === '+91 98765 43210' && adultState.parent_email === null, JSON.stringify(adultState));
check('... and reads the published slokas, themes and the sloka of the day', (await igSlokas(pubAdult)).length === publishedSlokas
  && (await asApp('authenticated', pubAdult, 'select id from ig_themes')).length > 0 && (await dayOf(pubAdult, null)) !== null);
await refusesWith('joining twice is refused', 'already_joined', () => igJoin(pubAdult, { year: 1991 }));
const pubSloka = samples[1].id;
await note(pubAdult, pubSloka, 'My own note.');
await asApp('authenticated', pubAdult, 'insert into ig_memorised (sloka_id) values ($1)', [pubSloka]);
check('a subscriber keeps a private note and a memorised tick', (await asApp('authenticated', pubAdult, 'select 1 from ig_notes')).length === 1
  && (await asApp('authenticated', pubAdult, 'select 1 from ig_memorised')).length === 1);
check('a coordinator sees neither the subscriber\'s profile nor their ticks; the Guru sees both',
  (await asApp('authenticated', coordinator, 'select 1 from profiles where id = $1', [pubAdult])).length === 0
  && (await asApp('authenticated', coordinator, 'select 1 from ig_memorised where profile_id = $1', [pubAdult])).length === 0
  && (await asApp('authenticated', guru, 'select 1 from profiles where id = $1', [pubAdult])).length === 1
  && (await asApp('authenticated', guru, 'select 1 from ig_memorised where profile_id = $1', [pubAdult])).length === 1);
check('... while coordinators still see students\' ticks and profiles', (await asApp('authenticated', coordinator,
  'select 1 from profiles where id = $1', [arjun])).length === 1);
await refusesWith('a subscriber cannot write its subscription row directly', 'permission denied for table ig_subscribers', () => asApp('authenticated', pubAdult,
  `update ig_subscribers set blocked_at = null, minor = false where profile_id = auth.uid() returning 1`).then((r) => { if (r.length === 0) throw new Error('0 rows'); }));
await refusesWith('a subscriber cannot make itself a student', 'not_own_role', () =>
  asApp('authenticated', pubAdult, `update profiles set role = 'student' where id = auth.uid()`));

// A minor: parent's details, a code by email, nothing opens before it.
const pubMinor = await signUp('pub.minor@example.com', true);
await refusesWith('under 18 needs the parent\'s name', 'parent_name_invalid', () => igJoin(pubMinor, { year: thisYear - 14 }));
await refusesWith('... and a real email', 'parent_email_invalid', () => igJoin(pubMinor, { year: thisYear - 14, parent: 'Parent', parentEmail: 'nope' }));
await refusesWith('... that is not the child\'s own', 'parent_email_own', () =>
  igJoin(pubMinor, { year: thisYear - 14, parent: 'Parent', parentEmail: 'PUB.MINOR@example.com' }));
const minorState = await igJoin(pubMinor, { year: thisYear - 14, parent: '  Lakshmi Devi ', parentEmail: 'Parent.Of.Minor@example.com', relation: 'mother' });
check('a minor joins as awaiting_parent and reads nothing yet', minorState.state === 'awaiting_parent'
  && minorState.parent_email === 'parent.of.minor@example.com' && minorState.parent_name === 'Lakshmi Devi'
  && (await igSlokas(pubMinor)).length === 0 && (await dayOf(pubMinor, null)) === null, JSON.stringify(minorState));
await refusesWith('a minor waiting for the parent cannot write a note', 'new row violates row-level security policy for table "ig_notes"', () => note(pubMinor, pubSloka, 'x'));
await refusesWith('a minor cannot skip the parent by changing the year of birth', 'age_change_not_allowed', () =>
  igJoin(pubMinor, { year: 1990 }));
const turning18 = await signUp('pub.turning18@example.com', true);
check('in the year one turns 18, "not yet had the birthday" counts as under 18',
  (await igJoin(turning18, { year: thisYear - 18, parent: 'P', parentEmail: 'p18@example.com' })).minor === true);
const had18 = await signUp('pub.had18@example.com', true);
check('... and "had the birthday" as 18', (await igJoin(had18, { year: thisYear - 18, turned18: true })).minor === false);
const sendCode = async (userId) => (await asApp('authenticated', userId, 'select ig_send_parent_code() as r'))[0].r;
check('without pg_net and the mail secrets, sending the code reports not_set_up and stores nothing',
  (await sendCode(pubMinor)) === 'not_set_up' && (await asOwner(`select 1 from ig_parent_codes where profile_id = '${pubMinor}'`)).length === 0);
await refusesWith('an adult has no parent code to send', 'not_awaiting_parent', () => sendCode(pubAdult));
// Imitate pg_net and the Vault: requests are recorded instead of sent.
await db.exec(`create schema net;
  create table net.sent (url text, headers jsonb, body jsonb);
  create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}',
    timeout_milliseconds int default 5000) returns bigint language sql as
    $$ insert into net.sent values (url, headers, body); select 1::bigint $$;
  create schema vault;
  create table vault.decrypted_secrets (name text, decrypted_secret text);
  insert into vault.decrypted_secrets values ('mridanga_brevo_key', 'test-key'), ('mridanga_mail_from', 'noreply@example.com');`);
check('with them, the code is sent', (await sendCode(pubMinor)) === 'sent');
const [mail] = await asOwner('select url, headers, body from net.sent');
const mailedCode = /code to type into the app: (\d{6})/.exec(mail?.body?.textContent ?? '')?.[1];
check('... to the parent\'s email only, through Brevo, with a 6-digit code', mail.url === 'https://api.brevo.com/v3/smtp/email'
  && mail.headers['api-key'] === 'test-key' && mail.body.to.length === 1 && mail.body.to[0].email === 'parent.of.minor@example.com'
  && mailedCode !== undefined, JSON.stringify(mail?.body?.to));
check('... stored only as a hash the minor cannot read', !(await asOwner('select code_hash from ig_parent_codes'))
  .some((r) => r.code_hash.includes(mailedCode)) && (await igState(pubMinor)).code_sent_at !== null);
await refusesWith('the minor cannot read the code table', 'permission denied for table ig_parent_codes', () => asApp('authenticated', pubMinor, 'select * from ig_parent_codes'));
await refusesWith('a second code within a minute is refused', 'code_too_soon', () => sendCode(pubMinor));
const confirm = async (userId, code) => (await asApp('authenticated', userId, 'select ig_confirm_parent($1) as r', [code]))[0].r;
const wrongCode = mailedCode === '000000' ? '111111' : '000000';
check('a wrong code is counted', (await confirm(pubMinor, wrongCode)) === 'wrong'
  && (await asOwner(`select tries from ig_parent_codes where profile_id = '${pubMinor}'`))[0].tries === 1);
await asOwner(`update ig_parent_codes set tries = 5 where profile_id = '${pubMinor}'`);
check('after 5 wrong tries even the right code is refused', (await confirm(pubMinor, mailedCode)) === 'too_many');
await asOwner(`update ig_parent_codes set tries = 0, expires_at = now() - interval '1 second' where profile_id = '${pubMinor}'`);
check('an old code has expired', (await confirm(pubMinor, mailedCode)) === 'expired');
await asOwner(`update ig_parent_codes set expires_at = now() + interval '1 hour', sent_at = now() - interval '2 minutes' where profile_id = '${pubMinor}'`);
check('the parent\'s code opens Ishtagoshti for the minor', (await confirm(pubMinor, ` ${mailedCode} `)) === 'confirmed'
  && (await igState(pubMinor)).state === 'active' && (await igSlokas(pubMinor)).length === publishedSlokas
  && (await asOwner(`select 1 from ig_parent_codes where profile_id = '${pubMinor}'`)).length === 0);
await asOwner(`update ig_parent_codes set sends = 3, sent_at = now() - interval '2 minutes' where profile_id = '${turning18}'`);
await asOwner(`insert into ig_parent_codes (profile_id, code_hash, expires_at, sends, sent_at)
  values ('${turning18}', '-', now(), 3, now() - interval '2 minutes') on conflict (profile_id) do update set sends = 3, sent_at = excluded.sent_at`);
await refusesWith('at most 3 codes a day per person', 'code_limit', () => sendCode(turning18));
await asOwner(`update ig_parent_codes set sends = 0 where profile_id = '${turning18}'`);
await asOwner(`insert into ig_parent_codes (profile_id, code_hash, expires_at, sends) values ('${pubMinor}', '-', now(), 100)`);
await refusesWith('at most 100 codes a day for the whole app', 'code_daily_cap', () => sendCode(turning18));
await asOwner(`delete from ig_parent_codes where profile_id = '${pubMinor}'`);
await db.exec('drop schema net cascade; drop schema vault cascade;');

// I15: the Guru's list, block / unblock, joins per week.
await refusesWith('a coordinator cannot see the subscriber list', 'not_allowed', () => asApp('authenticated', coordinator, 'select * from ig_subscriber_list()'));
await refusesWith('... nor block', 'not_allowed', () => asApp('authenticated', coordinator, 'select ig_block_subscriber($1, true)', [pubAdult]));
await refusesWith('a subscriber cannot block itself or others', 'not_allowed', () => asApp('authenticated', pubMinor, 'select ig_block_subscriber($1, true)', [pubAdult]));
const igList = await asApp('authenticated', guru, 'select * from ig_subscriber_list()');
const adultRow = igList.find((r) => r.profile_id === pubAdult);
check('the Guru lists the subscribers with their details and activity', igList.length === 4 && adultRow?.email === 'pub.adult@example.com'
  && adultRow.memorised === 1 && adultRow.notes === 1 && adultRow.in_class === false, `${igList.length} rows`);
const weeks = await asApp('authenticated', guru, 'select week_start::text, joins from ig_subscriber_weeks(4)');
check('joins per week: 4 weeks, this week holds the 4 joins', weeks.length === 4 && weeks[3].joins === 4, JSON.stringify(weeks));
await refusesWith('a block reason has at most 200 characters', 'reason_too_long', () =>
  asApp('authenticated', guru, 'select ig_block_subscriber($1, true, $2)', [pubAdult, 'x'.repeat(201)]));
await asApp('authenticated', guru, 'select ig_block_subscriber($1, true, $2)', [pubAdult, 'Test block']);
check('a blocked subscriber reads nothing; the state says blocked without the reason',
  (await igSlokas(pubAdult)).length === 0 && (await igState(pubAdult)).state === 'blocked' && !('block_reason' in (await igState(pubAdult))));
await refusesWith('... and cannot write a note', 'new row violates row-level security policy for table "ig_notes"', () => note(pubAdult, samples[2].id, 'x'));
await refusesWith('... nor join again', 'blocked', () => igJoin(pubAdult, { year: 1990 }));
await asApp('authenticated', pubAdult, 'select ig_leave()');
const [leftBlocked] = await asOwner(`select birth_year, phone, blocked_at from ig_subscribers where profile_id = '${pubAdult}'`);
check('a blocked person who leaves: details, notes and ticks deleted, the block stays', leftBlocked?.blocked_at !== null
  && leftBlocked.birth_year === null && leftBlocked.phone === null
  && (await asOwner(`select (select count(*) from ig_notes where profile_id = '${pubAdult}') + (select count(*) from ig_memorised where profile_id = '${pubAdult}') as n`))[0].n == 0);
await asApp('authenticated', guru, 'select ig_block_subscriber($1, false)', [pubAdult]);
check('unblocking a person who left removes the row: they may join again',
  (await asOwner(`select 1 from ig_subscribers where profile_id = '${pubAdult}'`)).length === 0);
await igJoin(pubAdult, { year: 1990 });
await asApp('authenticated', guru, 'select ig_block_subscriber($1, true)', [pubAdult]);
await asApp('authenticated', guru, 'select ig_block_subscriber($1, false)', [pubAdult]);
check('unblocked, the subscriber reads again', (await igSlokas(pubAdult)).length === publishedSlokas);
await refusesWith('a student cannot "leave" (their notes are theirs as a student)', 'not_subscriber', () => asApp('authenticated', arjun, 'select ig_leave()'));
await asApp('authenticated', guru, `update profiles set active = false where id = $1`, [had18]);
check('a login the Guru switched off reads nothing, subscriber or not', (await igSlokas(had18)).length === 0);
await asApp('authenticated', guru, `update profiles set active = true where id = $1`, [had18]);

// The sweep: a reading subscriber (the confirmed minor) against EVERY table, view, bucket and callable
// function. Allowed: Ishtagoshti reading, its own notes / ticks / subscription row, its own profile.
const sweeper = pubMinor;
await note(sweeper, pubSloka, 'Sweep note.');
const relations = (await asOwner(`select c.relname as name, c.relkind as kind from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') order by 1`)).map((r) => r.name);
const igReadable = new Set(['ig_slokas', 'ig_themes', 'ig_theme_slokas', 'ig_daily_pins']);
const ownOnly = { profiles: 'id', ig_notes: 'profile_id', ig_memorised: 'profile_id', ig_subscribers: 'profile_id' };
const leaks = [];
for (const rel of relations) {
  let rows;
  try {
    rows = await asApp('authenticated', sweeper, `select * from "${rel}"`);
  } catch {
    continue; // refused outright
  }
  if (rows.length === 0 || igReadable.has(rel)) continue;
  const key = ownOnly[rel];
  if (key && rows.every((r) => r[key] === sweeper)) continue;
  leaks.push(`${rel}: ${rows.length} rows`);
}
check(`a subscriber reads nothing outside Ishtagoshti and its own rows (${relations.length} tables and views)`, leaks.length === 0, leaks.join('; '));
const objects = await asApp('authenticated', sweeper, 'select bucket_id from storage.objects');
check('... and opens no stored file but Ishtagoshti recitations', objects.every((o) => o.bucket_id === 'ishtagoshti-audio'),
  [...new Set(objects.map((o) => o.bucket_id))].join(','));
const buckets = (await asOwner('select id from storage.buckets')).map((b) => b.id);
const uploads = [];
for (const bucket of buckets) {
  try {
    await asApp('authenticated', sweeper, `insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, auth.uid(), '{"size": 10}')`,
      [bucket, `${sweeper}/${await newId()}.m4a`]);
    uploads.push(bucket);
  } catch { /* refused */ }
}
check(`... and uploads to no bucket (${buckets.length})`, uploads.length === 0, uploads.join(','));
/** Every table's rows as one fingerprint per table, to see whether anything changed. */
const tableState = async () => Object.fromEntries((await asOwner(`select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'storage') and c.relkind in ('r', 'p') order by 1`)).map((r) => [r.name, null]));
const fingerprint = async () => {
  const names = Object.keys(await tableState());
  const out = {};
  for (const name of names) {
    const schema = (await asOwner(`select n.nspname as s from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relname = '${name}' and n.nspname in ('public', 'storage') limit 1`))[0].s;
    out[name] = (await asOwner(`select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as h from "${schema}"."${name}" t`))[0].h;
  }
  return out;
};
const writes = [];
const sweepBefore = await fingerprint();
for (const rel of relations.filter((r) => !['ig_notes', 'ig_memorised'].includes(r))) {
  for (const sql of [`delete from "${rel}"`, `insert into "${rel}" default values`]) {
    try {
      await asApp('authenticated', sweeper, sql);
    } catch { /* refused */ }
  }
}
const afterWrites = await fingerprint();
for (const name of Object.keys(sweepBefore)) if (sweepBefore[name] !== afterWrites[name]) writes.push(name);
check('... and changes no table by delete or insert', writes.length === 0, writes.join(', '));
// Every function a signed-in login may run, called with empty (null) arguments. Allowed to answer:
// the Ishtagoshti reading functions and helpers that only describe the caller or the date.
const fns = await asOwner(`select p.oid::regprocedure::text as sig, p.proname as name, p.pronargs as n, p.proretset as set,
    coalesce(array_to_string(array(select format_type(t, null) from unnest(p.proargtypes) t), ','), '') as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype and p.prokind = 'f'
    and has_function_privilege('authenticated', p.oid, 'execute') order by 1`);
const skip = new Set(['ig_leave', 'ig_send_parent_code', 'ig_confirm_parent', 'ig_join']); // tested above
const mayAnswer = new Set(['my_role', 'today_ist', 'my_time_zone', 'centre_tz', 'my_centre_locale', 'is_staff', 'is_guru', 'ig_reader', 'is_ig_editor', 'ig_my_state',
  'ig_sloka_of_day', 'ig_audio_path_ok', 'ig_audio_readable', 'is_public_subscriber', 'has_class_role',
  'gen_random_uuid', // pgcrypto's, in public only here (Supabase keeps it in extensions)
  'practice_weeks', // empty weeks with 0 minutes for a null student
  'scan_qr', // {action: unknown} for a null code
  'my_about', 'sign_up_choices']); // 0036: the caller's own About you; the public sign-up lists (#163)
const answered = [];
for (const fn of fns) {
  if (skip.has(fn.name)) continue;
  const args = fn.args ? fn.args.split(',').map((t) => `null::${t}`).join(', ') : '';
  let rows;
  try {
    rows = await asApp('authenticated', sweeper, fn.set ? `select * from ${fn.name}(${args})` : `select ${fn.name}(${args}) as r`);
  } catch {
    continue; // refused or failed on empty input: nothing given away
  }
  const empty = rows.length === 0 || (!fn.set && rows.every((r) => r.r === null || r.r === false || r.r === 0
    || (Array.isArray(r.r) && r.r.length === 0) || (typeof r.r === 'object' && r.r !== null && Object.keys(r.r).length === 0)));
  if (!empty && !mayAnswer.has(fn.name)) answered.push(`${fn.name} → ${JSON.stringify(rows).slice(0, 80)}`);
}
const afterCalls = await fingerprint();
const changedByCalls = Object.keys(sweepBefore).filter((name) => afterWrites[name] !== afterCalls[name]);
check(`... and no callable function (${fns.length}) answers it with data`, answered.length === 0, answered.join('; '));
check('... or changes any table', changedByCalls.length === 0, changedByCalls.join(', '));
check('anon runs no subscriber function', (await asOwner(`select has_function_privilege('anon', 'ig_join(int, text, boolean, text, text, text, text)', 'execute')
  or has_function_privilege('anon', 'ig_subscriber_list()', 'execute') or has_function_privilege('anon', 'ig_reader()', 'execute')
  or has_function_privilege('authenticated', 'ig_new_parent_code(uuid)', 'execute') as ok`))[0].ok === false);
// ---------------------------------------------------------------- security round 2 (0028)
// D1a-01 (+R2G2-03, FS1a-19): a login's identity columns are frozen in the app; names and phones checked.
await refusesWith('0028: a student cannot rewrite their own profile email', 'profile_field_locked', () =>
  asApp('authenticated', arjun, `update profiles set email = 'new.volunteer@example.com' where id = $1`, [arjun]));
await refusesWith('... nor a pending stranger (no pre-claiming a volunteer\'s email)', 'profile_field_locked', () =>
  asApp('authenticated', stranger, `update profiles set email = 'new.volunteer@example.com' where id = $1`, [stranger]));
await refusesWith('... nor the Guru someone else\'s', 'profile_field_locked', () =>
  asApp('authenticated', guru, `update profiles set email = 'x@example.com' where id = $1`, [coordinator]));
await refusesWith('a coordinator cannot change their own sign-up time', 'profile_field_locked', () =>
  asApp('authenticated', coordinator, `update profiles set created_at = '2020-01-01' where id = $1`, [coordinator]));
await refusesWith('... nor their centre', 'profile_field_locked', () =>
  asApp('authenticated', coordinator, 'update profiles set centre_id = null where id = $1', [coordinator]));
await asOwner(`update profiles set centre_id = null where id = '${coordinator}'`);
await asOwner(`update profiles set centre_id = 1 where id = '${coordinator}'`);
check('... the dashboard still can', (await asOwner(`select centre_id from profiles where id = '${coordinator}'`))[0].centre_id === 1);
await asOwner(`update profiles set full_name = 'Guru Maharaj' where id = '${guru}'`);
await refusesWith('a coordinator cannot take the Guru\'s name (case and spaces ignored)', 'name_taken', () =>
  asApp('authenticated', coordinator2, `update profiles set full_name = '  guru   MAHARAJ ' where id = $1`, [coordinator2]));
await refusesWith('... nor a student', 'name_taken', () =>
  asApp('authenticated', arjun, `update profiles set full_name = 'Guru Maharaj' where id = $1`, [arjun]));
await refusesWith('a name with a zero-width space is refused', 'name_invalid', () =>
  asApp('authenticated', coordinator2, `update profiles set full_name = 'Guru' || chr(8203) || ' Maharaj' where id = $1`, [coordinator2]));
await refusesWith('... and one with a line break inside', 'name_invalid', () =>
  asApp('authenticated', coordinator2, `update profiles set full_name = 'Ravi' || chr(10) || 'Kumar' where id = $1`, [coordinator2]));
const [teluguName] = await asApp('authenticated', coordinator2,
  `update profiles set full_name = 'శ్రీ' || chr(8204) || 'నివాస్' where id = $1 returning full_name`, [coordinator2]);
check('... while a Telugu name with a zero-width non-joiner is kept', teluguName?.full_name?.includes(String.fromCharCode(0x200c)));
const [guruSame] = await asApp('authenticated', guru, `update profiles set full_name = 'Guru Maharaj' where id = $1 returning full_name`, [guru]);
check('the Guru keeps their own name', guruSame?.full_name === 'Guru Maharaj');
for (const bad of ['1 2 3 4', '+ 9', '1234567890123456']) {
  await refusesWith(`phone "${bad}" is refused (7 to 15 digits)`, 'phone_invalid', () =>
    asApp('authenticated', arjun, 'update profiles set phone = $2 where id = $1', [arjun, bad]));
}
const [goodPhone] = await asApp('authenticated', arjun, `update profiles set phone = '+91 98765 43210' where id = $1 returning phone`, [arjun]);
check('... and "+91 98765 43210" is kept', goodPhone?.phone === '+91 98765 43210');
await asOwner(`update auth.users set email = 'arjun.new@example.com' where id = '${arjun}'`);
check('a changed sign-in email reaches the profile (FS1a-19)',
  (await asOwner(`select email from profiles where id = '${arjun}'`))[0].email === 'arjun.new@example.com');
await register(coordinator, { p_full_name: 'Sec2 Sync Target', p_dob: '1993-03-03', p_email: 'sec2.target@example.com' });
const syncLogin = await signUp('sec2.typo@example.com', true);
await asOwner(`update auth.users set email = 'sec2.target@example.com' where id = '${syncLogin}'`);
check('... and a waiting login is linked to the record with its new email',
  (await linkOf('sec2.target@example.com')) === syncLogin && (await roleOf(syncLogin)) === 'student');
const g2Login = await signUp('sec2.g2@example.com', true);
await asApp('authenticated', guru, `update profiles set role = 'coordinator' where id = $1`, [g2Login]);
await asApp('authenticated', guru, 'update profiles set active = false where id = $1', [g2Login]);
check('G2 still works: the Guru makes a coordinator and switches them off (guard_profile_admin)',
  (await asOwner(`select role, active from profiles where id = '${g2Login}'`)).every((r) => r.role === 'coordinator' && r.active === false));

// FS1b-01 (+D1a-12, R2G2-06): a 'student' login without a student record gets nothing.
const noRecord = await signUp('sec2.noRecord@example.com', true);
await asOwner(`update profiles set role = 'student' where id = '${noRecord}'`); // e.g. set in the dashboard
const [{ r: noRecordRole }] = await asApp('authenticated', noRecord, 'select my_role()::text as r');
check('0028: a student login without a record counts as pending', noRecordRole === 'pending', noRecordRole);
check('... reads no announcement (not even one to everyone)', (await asApp('authenticated', noRecord, 'select id from announcements')).length === 0);
check('... cannot open a posted photo', !(await canOpen(noRecord, photo)));
check('... is not in an announcement\'s audience (no push, no inbox row)', (await asOwner(
  `select count(*)::int as n from announcement_audience where profile_id = '${noRecord}'`))[0].n === 0);
check('... nor in an event audience', (await asOwner(
  `select count(*)::int as n from audience_profiles('all', null, null, null) id where id = '${noRecord}'`))[0].n === 0);
check('... gets no staff names', (await asApp('authenticated', noRecord, 'select * from staff_names()')).length === 0);
await refusesWith('... cannot save a phone for pushes', 'not_allowed', () => registerToken(noRecord, 'ExponentPushToken[sec2orphan]'));
const noRecordReads = [];
for (const { relname } of await asOwner(`select relname from pg_class
  where relnamespace = 'public'::regnamespace and relkind in ('r', 'v', 'm', 'p') order by relname`)) {
  if (openToAll.has(relname)) continue;
  let rows = 0;
  try {
    rows = (await asApp('authenticated', noRecord, `select count(*)::int as n from public.${relname}`))[0].n;
  } catch {
    rows = 0;
  }
  if (rows > (relname === 'profiles' ? 1 : 0)) noRecordReads.push(`${relname}:${rows}`);
}
check('... and reads nothing but its own profile and the open lists', noRecordReads.length === 0, noRecordReads.join(' '));
const allLevels = `${guru}/${await newId()}.pdf`;
await uploadMaterial(guru, allLevels);
const allLevelPdf = await addMaterial(guru, { kind: 'pdf', path: allLevels, name: 'For everyone.pdf', size: 1 });
check('an approved all-level material: a student reads it and opens its file',
  (await asApp('authenticated', arjun, 'select id from materials where id = $1', [allLevelPdf.id])).length === 1
  && await canOpenMaterial(arjun, allLevels));
for (const [who, id] of [['a pending stranger', stranger], ['the door tablet', kiosk], ['a login without a record', noRecord]]) {
  check(`... ${who} reads no material and cannot open the file`,
    (await asApp('authenticated', id, 'select id from materials')).length === 0 && !(await canOpenMaterial(id, allLevels)));
}
await db.exec(`select set_config('app.via_call_log', 'on', false); update students set status = 'left' where profile_id = '${late}';
  select set_config('app.via_call_log', '', false);`); // as log_call does
const forLeft = await post(coordinator, { title: 'Sec2 for all', body: 'x', audience: 'all' });
const leftSees = (await asApp('authenticated', late, 'select id from announcements where id = $1', [forLeft.id])).length;
const [{ n: leftAddressed }] = await asOwner(`select count(*)::int as n from announcement_audience where profile_id = '${late}' and announcement_id = ${forLeft.id}`);
check('a Left student keeps announcements (Praveen, 6 Oct 2026)', leftSees === 1 && leftAddressed === 1, `reads ${leftSees}, addressed ${leftAddressed}`);
await asOwner(`update students set status = 'active' where profile_id = '${late}'`);
const relinked = await register(coordinator, { p_full_name: 'Sec2 Moved', p_dob: '1992-02-02', p_email: 'sec2.moved@example.com' });
const relinkedLogin = await signUp('sec2.moved@example.com', true);
await registerToken(relinkedLogin, 'ExponentPushToken[sec2moved]');
await asOwner(`update students set profile_id = null where id = '${relinked.id}'`); // the dashboard
check('a login taken off its record (dashboard) goes back to waiting, its phones forgotten', (await roleOf(relinkedLogin)) === 'pending'
  && (await asOwner(`select count(*)::int as n from push_tokens where profile_id = '${relinkedLogin}'`))[0].n === 0);

// D1b-05 (+D12a-12, D14-13): a posted file cannot be swapped by delete + upload under the same name.
await refusesWith('0028: a file deleted while an announcement lists it cannot be uploaded again', 'new row violates row-level security policy for table "objects"', () => upload(guru, guruExtra));
const swap = await filePath(coordinator);
await upload(coordinator, swap);
const swapPost = await postWithFiles(coordinator, [entry(swap, 'Poster.jpg')]);
check('... the uploader may still delete a posted file', await removeFile(coordinator, swap));
await refusesWith('... but not put different content under its name', 'new row violates row-level security policy for table "objects"', () => upload(coordinator, swap, 999));
for (const [who, id] of [['the uploader', coordinator], ['another coordinator', coordinator2], ['the Guru', guru]]) {
  check(`${who} cannot replace a posted file in place (0 rows)`, (await asApp('authenticated', id,
    `update storage.objects set metadata = '{"size": 1}' where bucket_id = 'announcement-files' and name = $1 returning name`, [photo])).length === 0);
}
await asApp('authenticated', coordinator, `update announcements set attachments = '[]' where id = $1`, [swapPost.id]);
await upload(coordinator, swap, 999);
check('once an edit (marked Edited) takes the file off, the name is free again', await canOpen(coordinator, swap));
check('a material file deleted while its material lists it cannot be uploaded again', (await asApp('authenticated', guru,
  `delete from storage.objects where bucket_id = 'material-files' and name = $1 returning name`, [allLevels])).length === 1
  && await uploadMaterial(guru, allLevels).then(() => false, () => true));

// D14-02: consent edges not covered by 0025 (dob edits across the 18-year line, guardian phone).
const edge = await register(coordinator, { p_full_name: 'Sec2 Edge Adult', p_dob: '1990-02-02' });
await refusesWith('0028 consent edges: an adult edited to one day short of 18 is refused', 'minor_needs_consent', () =>
  asApp('authenticated', coordinator, 'update students set dob = $2 where id = $1', [edge.id, almost18]));
const [edgeDob] = await asApp('authenticated', coordinator, 'update students set dob = $2 where id = $1 returning dob::text as d', [edge.id, eighteen]);
check('... edited to exactly 18 today is kept', edgeDob?.d === eighteen, edgeDob?.d);
await refusesWith('a 17-year-old added straight to the table without consent is refused at commit', 'minor_needs_consent', () =>
  asApp('authenticated', guru, `insert into students (full_name, dob) values ('Sec2 Seventeen', $1)`, [almost18]));
await refusesWith('a minor with a guardian name but a blank phone is refused', 'minor_needs_guardian', () =>
  register(coordinator, { p_full_name: 'Sec2 Child', p_dob: childDob, p_guardian_name: 'Parent', p_guardian_phone: '   ',
    p_guardian_relation: 'father', p_id_type_checked: 'aadhaar', p_written_consent: true }));
await refusesWith('... and one with a phone but no guardian name', 'minor_needs_guardian', () =>
  register(coordinator, { p_full_name: 'Sec2 Child', p_dob: childDob, p_guardian_name: ' ', p_guardian_phone: '9000012345',
    p_guardian_relation: 'father', p_id_type_checked: 'aadhaar', p_written_consent: true }));
await refusesWith('a minor\'s only guardian phone cannot be cleared later (checked at commit)', 'minor_needs_guardian', () =>
  asApp('authenticated', guru, 'update guardians set phone = null where student_id = $1', [child.id]));
await asApp('authenticated', coordinator, `insert into guardians (student_id, full_name, phone, relation) values ($1, 'Second Parent', '9000054321', 'father')`, [child.id]);
await asApp('authenticated', guru, `update guardians set phone = null where student_id = $1 and full_name = 'Parent One'`, [child.id]);
check('... but may be, when another guardian has a phone', (await asOwner(
  `select count(*)::int as n from guardians where student_id = '${child.id}' and phone is not null`))[0].n === 1);
const [grownUp] = await asApp('authenticated', coordinator, 'update students set dob = $2 where id = $1 returning dob::text as d', [child.id, eighteen]);
const [childAgain] = await asApp('authenticated', coordinator, 'update students set dob = $2 where id = $1 returning dob::text as d', [child.id, childDob]);
check('a minor\'s dob may be corrected to an adult\'s and back (consent and guardian kept)', grownUp?.d === eighteen && childAgain?.d === childDob);

// ---------------------------------------------------------------- round 10 rules (0030)
// Students made here by the owner, with dates in the past, so the daily job has something to judge.
/** Inserts an adult student as the owner; returns its id. `extra` is a list of `column = sql value`. */
async function r10Student(name, extra = {}) {
  const cols = ['full_name', 'dob', 'mentor_id', 'joined_on', 'created_at', ...Object.keys(extra)];
  const vals = [`'${name}'`, `'1990-01-01'`, `'${coordinator}'`, 'today_ist() - 200', `now() - interval '200 days'`, ...Object.values(extra)];
  const [row] = await asOwner(`insert into students (${cols.join(', ')}) values (${vals.join(', ')}) returning id`);
  return row.id;
}
const openTasksOf = async (id) =>
  asOwner(`select kind, assignee_id, escalated, due_on::text from follow_up_tasks where student_id = '${id}' and done_at is null`);

// D5-01 / D12a-10: an ended pause turns Irregular with a call task, and does not go Inactive the same morning.
const r10Paused = await r10Student('R10 Paused Long', { status: `'paused'`, paused_until: 'today_ist() - 1' });
await asOwner(`insert into visits (student_id, check_in, check_out, method)
  values ('${r10Paused}', now() - interval '90 days', now() - interval '90 days' + interval '1 hour', 'manual')`);
await asOwner('select refresh_student_statuses()');
let r10Tasks = await openTasksOf(r10Paused);
check('D5-01: an ended pause turns Irregular, not Inactive the same morning (last visit 90 days ago)',
  (await statusOf(r10Paused)).status === 'irregular', (await statusOf(r10Paused)).status);
check('D5-01: ... and the mentor gets a call task', r10Tasks.length === 1 && r10Tasks[0].kind === 'call'
  && r10Tasks[0].assignee_id === coordinator, JSON.stringify(r10Tasks));
check('D5-01: ... paused_until is cleared', (await statusOf(r10Paused)).paused_until === null);
await asOwner('select refresh_student_statuses()');
r10Tasks = await openTasksOf(r10Paused);
check('D5-01: the next run keeps them Irregular (days to Inactive count from the pause end) with one task',
  (await statusOf(r10Paused)).status === 'irregular' && r10Tasks.length === 1, JSON.stringify(r10Tasks));
await asOwner(`update status_history set changed_at = changed_at - interval '31 days'
  where student_id = '${r10Paused}' and from_status = 'paused'`);
await asOwner('select refresh_student_statuses()');
check('D5-01: inactive_days after the pause end they turn Inactive', (await statusOf(r10Paused)).status === 'inactive');

// D5-16: no second open task; only due tasks are escalated.
const r10Busy = await r10Student('R10 Has Task', { status: `'active'` });
await asOwner(`insert into follow_up_tasks (student_id, assignee_id, kind, due_on) values ('${r10Busy}', '${coordinator}', 'call', today_ist() + 5)`);
await asOwner('select refresh_student_statuses()');
r10Tasks = await openTasksOf(r10Busy);
check('D5-16: turning Irregular with an open task adds no second task',
  (await statusOf(r10Busy)).status === 'irregular' && r10Tasks.length === 1, JSON.stringify(r10Tasks));
await asOwner(`update students set status = 'inactive' where id = '${r10Busy}'`);
await asOwner('select refresh_student_statuses()');
check('D5-16: an Inactive student\'s task given a later date (a call was logged) is not escalated yet',
  (await openTasksOf(r10Busy))[0]?.escalated === false);
await asOwner(`update follow_up_tasks set due_on = today_ist() where student_id = '${r10Busy}' and done_at is null`);
await asOwner('select refresh_student_statuses()');
check('D5-16: ... and is escalated once it is due', (await openTasksOf(r10Busy))[0]?.escalated === true);

// D5-02: a visit starts the failed-try count again.
const r10Retry = await r10Student('R10 Retry', { status: `'irregular'` });
for (let i = 0; i < 3; i++) {
  await logCall(coordinator, { p_student: r10Retry, p_outcome: 'not_reachable', p_reason: null, p_comment: `No answer ${i + 1}` });
}
check('D5-02: (control) three failed tries in one absence escalate', (await openTasksOf(r10Retry))[0]?.escalated === true);
await mark(r10Retry, 'in');
await mark(r10Retry, 'out');
await logCall(coordinator, { p_student: r10Retry, p_outcome: 'not_reachable', p_reason: null, p_comment: 'No answer after the visit' });
r10Tasks = await asOwner(`select attempt, escalated from follow_up_tasks where student_id = '${r10Retry}' and done_at is null`);
check('D5-02: after a visit the first failed try plans try 2 again, not escalated',
  r10Tasks.length === 1 && r10Tasks[0].attempt === 2 && r10Tasks[0].escalated === false, JSON.stringify(r10Tasks));

// D5-03: a bad or missing follow-up number falls back; Irregular before Inactive however it is written.
const settingInt = async (k) => (await asOwner(`select setting_int('${k}') as n`))[0].n;
await asOwner(`delete from settings where key = 'retry_days'`);
check('D5-03: a missing retry_days falls back to 3', (await settingInt('retry_days')) === 3);
await logCall(coordinator, { p_student: r10Retry, p_outcome: 'not_reachable', p_reason: null, p_comment: 'Still no answer' });
check('D5-03: ... so a not-reachable call still saves its retry task',
  (await asOwner(`select due_on - today_ist() as d from follow_up_tasks where student_id = '${r10Retry}' and done_at is null`))[0]?.d === 3);
await asOwner(`insert into settings (key, value) values ('retry_days', '3')`);
await asOwner('alter table settings disable trigger settings_guard');
await asOwner(`update settings set value = '"three"' where key = 'max_retries'`);
await asOwner(`update settings set value = '14.5' where key = 'irregular_days'`);
await asOwner('alter table settings enable trigger settings_guard');
check('D5-03: a value that is not a whole number falls back to its default',
  (await settingInt('max_retries')) === 3 && (await settingInt('irregular_days')) === 14);
let r10JobRan = true;
try { await asOwner('select refresh_student_statuses()'); } catch { r10JobRan = false; }
check('D5-03: ... and the daily job still runs', r10JobRan);
await asOwner('alter table settings disable trigger settings_guard');
await asOwner(`update settings set value = '3' where key = 'max_retries'`);
await asOwner(`update settings set value = '14' where key = 'irregular_days'`);
await asOwner('alter table settings enable trigger settings_guard');
await refusesWith('D5-03: a direct UPDATE cannot put Irregular after Inactive (checked at commit)', 'irregular_after_inactive', () =>
  asApp('authenticated', guru, `update settings set value = '40' where key = 'irregular_days'`));
await refusesWith('D5-03: ... nor can the SQL editor', 'irregular_after_inactive', () =>
  db.exec(`update settings set value = '45' where key = 'inactive_days'; update settings set value = '50' where key = 'irregular_days'`));
check('D5-03: ... and nothing of that edit is kept', (await settingInt('inactive_days')) === 30 && (await settingInt('irregular_days')) === 14);
const [{ n: bothDown }] = await asApp('authenticated', guru, `select save_settings('{"irregular_days": 5, "inactive_days": 10}') as n`);
check('D5-03: save_settings may lower both numbers in one call', bothDown === 2 && (await settingInt('inactive_days')) === 10);
await asApp('authenticated', guru, `select save_settings('{"irregular_days": 14, "inactive_days": 30}')`);

// D1b-04 / D12a-04: no INSERT straight into Paused / Left; paused_until only through a call.
await refusesWith('D1b-04: a coordinator cannot insert a student as Paused', 'status_on_insert', () =>
  asApp('authenticated', coordinator, `insert into students (full_name, dob, status, paused_until) values ('R10 Side Door', '1990-01-01', 'paused', today_ist() + 400)`));
await refusesWith('D12a-04: ... nor as Left', 'status_on_insert', () =>
  asApp('authenticated', coordinator, `insert into students (full_name, dob, status) values ('R10 Side Door', '1990-01-01', 'left')`));
const [r10New] = await asApp('authenticated', coordinator,
  `insert into students (full_name, dob, paused_until) values ('R10 New Pause', '1990-01-01', today_ist() + 400) returning id, paused_until`);
check('D1b-04: a pause date on a new record is dropped', r10New.paused_until === null);
await refusesWith('D1b-04: a pause cannot be moved by a plain edit', 'student_field_locked', () =>
  asApp('authenticated', coordinator, `update students set paused_until = today_ist() + 400 where id = $1`, [divya.id]));
const r10Paused2 = await r10Student('R10 Paused Short', { status: `'paused'`, paused_until: 'today_ist() + 10' });
await asApp('authenticated', coordinator, `update students set status = 'active' where id = $1`, [r10Paused2]);
const r10Unpaused = await statusOf(r10Paused2);
check('D1b-04: leaving Paused by an edit clears the pause date', r10Unpaused.status === 'active' && r10Unpaused.paused_until === null,
  JSON.stringify(r10Unpaused));
await logCall(coordinator, { p_student: r10Paused2, p_outcome: 'paused', p_reason: 'studies', p_comment: 'Exams', p_next_date: inAMonth });
check('D1b-04: (control) a logged call still pauses', (await statusOf(r10Paused2)).paused_until === inAMonth);

// D1a-06 / FR-05: a visit's student, marker, method and centre are frozen; times may be corrected, audited.
await mark(r10Retry, 'in');
const [r10Visit] = await asOwner(`select id from visits where student_id = '${r10Retry}' and check_out is null`);
await refusesWith('D1a-06: a coordinator cannot move a visit to another student', 'visit_field_locked', () =>
  asApp('authenticated', coordinator, `update visits set student_id = $2 where id = $1`, [r10Visit.id, r10Busy]));
await refusesWith('FR-05: ... nor change who marked it', 'visit_field_locked', () =>
  asApp('authenticated', coordinator, `update visits set marked_by = $2 where id = $1`, [r10Visit.id, guru]));
await refusesWith('D1a-06: ... nor its method', 'visit_field_locked', () =>
  asApp('authenticated', coordinator, `update visits set method = 'qr' where id = $1`, [r10Visit.id]));
await refusesWith('D1a-06: ... nor put the check-in in the future', 'visit_time_future', () =>
  asApp('authenticated', coordinator, `update visits set check_in = now() + interval '1 hour' where id = $1`, [r10Visit.id]));
const [r10Fixed] = await asApp('authenticated', coordinator,
  `update visits set check_in = check_in - interval '10 minutes', check_out = now() where id = $1 returning id`, [r10Visit.id]);
const r10Audit = await asOwner(`select action, changed_by from audit_log where table_name = 'visits' and row_id = '${r10Visit.id}'`);
check('D1a-06: correcting the times is allowed and kept in the audit log',
  r10Fixed?.id === r10Visit.id && r10Audit.length === 1 && r10Audit[0].action === 'UPDATE' && r10Audit[0].changed_by === coordinator,
  JSON.stringify(r10Audit));
const r10Deleted = await asApp('authenticated', coordinator, `delete from visits where id = $1 returning id`, [r10Visit.id]);
check('D1a-06: a coordinator cannot delete a visit', r10Deleted.length === 0);
check('the round 10 trigger functions are not callable by app roles', (await asOwner(`select
  not has_function_privilege('anon', 'guard_student_status()', 'execute')
  and not has_function_privilege('authenticated', 'guard_visit_update()', 'execute')
  and not has_function_privilege('authenticated', 'check_setting_order()', 'execute')
  and not has_function_privilege('anon', 'setting_int(text)', 'execute') as ok`))[0].ok === true);

// ---------------------------------------------------------------- sign-in leftovers (0032)
// D8-01: the language the app showed at sign-up is the new profile's language; anything else is 'en'.
const [teLogin] = await asOwner(`insert into auth.users (email, email_confirmed_at, raw_user_meta_data)
  values ('telugu.phone@example.com', null, '{"full_name": "Telugu Phone", "language": "te"}') returning id`);
const [oddLogin] = await asOwner(`insert into auth.users (email, email_confirmed_at, raw_user_meta_data)
  values ('odd.language@example.com', null, '{"full_name": "Odd", "language": "fr"}') returning id`);
const langs = await asOwner(`select id, language from profiles where id in ('${teLogin.id}', '${oddLogin.id}')`);
const langOf = (id) => langs.find((r) => r.id === id)?.language;
check('D8-01: a sign-up from a Telugu phone gets a Telugu profile', langOf(teLogin.id) === 'te', langOf(teLogin.id));
check('D8-01: a language the app does not offer falls back to English', langOf(oddLogin.id) === 'en', langOf(oddLogin.id));
check('D8-01: ... and the sign-up still gets its name and stays pending', (await asOwner(
  `select full_name, role from profiles where id = '${teLogin.id}'`))[0].full_name === 'Telugu Phone' && (await roleOf(teLogin.id)) === 'pending');

// D6-08: the same form saved twice (the answer to the first was lost) stores the child once.
const d608Request = '5f0c2a6e-8d1b-4c3a-9e2f-0a1b2c3d4e5f';
const d608Child = {
  p_full_name: 'Retry Child', p_dob: childDob, p_guardian_name: 'Retry Parent', p_guardian_phone: '9876500001',
  p_guardian_relation: 'father', p_id_type_checked: 'pan', p_photo_consent: true, p_written_consent: true,
  p_request_id: d608Request };
const d608First = await register(coordinator, d608Child);
const d608Again = await register(coordinator, d608Child);
const d608Count = async (table, col = 'student_id') =>
  (await asOwner(`select count(*)::int as n from ${table} where ${col} in
    (select id from students where full_name = 'Retry Child')`))[0].n;
check('D6-08: the first Save stores the child', d608First.repeated === false && /^MS-/.test(d608First.roll_no), JSON.stringify(d608First));
check('D6-08: a repeated Save returns the same student, marked repeated',
  d608Again.id === d608First.id && d608Again.roll_no === d608First.roll_no && d608Again.repeated === true, JSON.stringify(d608Again));
check('D6-08: ... with one student, one guardian and two consents stored',
  (await asOwner(`select count(*)::int as n from students where full_name = 'Retry Child'`))[0].n === 1 &&
  (await d608Count('guardians')) === 1 && (await d608Count('consents')) === 2);
const d608Changed = await register(coordinator, { ...d608Child, p_full_name: 'Retry Child Corrected' });
check('D6-08: a repeat after editing the form still returns the first student (nothing new)',
  d608Changed.id === d608First.id && (await asOwner(`select count(*)::int as n from students where full_name like 'Retry Child%'`))[0].n === 1);
await refusesWith('D6-08: another person cannot use the same request id', 'request_id_used', () =>
  register(guru, d608Child));
const d608Other = await register(coordinator, { ...d608Child, p_request_id: '7a1e2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b' });
check('D6-08: a new form (new request id) registers a second child', d608Other.id !== d608First.id && d608Other.repeated === false);
const d608Plain = await register(coordinator, { p_full_name: 'No Request Id', p_dob: '1991-01-01' });
check('D6-08: without a request id (older app) registration works as before', /^MS-/.test(d608Plain.roll_no) && d608Plain.repeated === false);
await refusesWith('D6-08: a coordinator cannot change a student\'s request id', 'student_field_locked', () =>
  asApp('authenticated', coordinator, `update students set request_id = null where id = $1`, [d608First.id]));
check('D6-08: the request id trigger function is not callable by app roles', (await asOwner(`select
  not has_function_privilege('authenticated', 'guard_student_request_id()', 'execute')
  and not has_function_privilege('anon', 'guard_student_request_id()', 'execute')
  and not has_function_privilege('anon', 'register_student(text, date, text, text, text, text, smallint, uuid, text, text, text, text, text, boolean, boolean, uuid, text)', 'execute') as ok`))[0].ok === true);
// Clean up so the counts in the checks below stay as they were.
await asOwner(`delete from students where id in ('${d608First.id}', '${d608Other.id}', '${d608Plain.id}')`);

// ---------------------------------------------------------------- time zones and currency (0033)
// Every centre so far is Abids: nothing may change for it. A second centre in New York must count
// its own days: 23:59 there is still the same day, though India is already in the next one.
check('0033: existing centres default to Asia/Kolkata and IN', (await asOwner(
  `select bool_and(time_zone = 'Asia/Kolkata' and country_code = 'IN') as ok from centres`))[0].ok === true);
check('0033: existing fund entries are in INR', (await asOwner(
  `select coalesce(bool_and(currency = 'INR'), true) as ok from fund_entries`))[0].ok === true);
check('0033: today_ist() is still the date in India for an Abids coordinator and for pg_cron', (await asApp('authenticated', coordinator,
  `select today_ist() = (now() at time zone 'Asia/Kolkata')::date as ok`))[0].ok === true
  && (await asOwner(`select today_ist() = (now() at time zone 'Asia/Kolkata')::date as ok`))[0].ok === true);
await refusesWith('0033: an abbreviation is not a time zone', 'time_zone_invalid', () =>
  asOwner(`update centres set time_zone = 'IST' where id = 1`));
await refusesWith('0033: an unknown zone is refused', 'time_zone_invalid', () =>
  asOwner(`update centres set time_zone = 'Mars/Olympus_Mons' where id = 1`));
await refusesWith('0033: a country is two capital letters', 'country_invalid', () =>
  asOwner(`update centres set country_code = 'usa' where id = 1`));
await refusesWith('0033: a coordinator cannot change a centre\'s zone', 'no row changed (row-level security)', async () => {
  const rows = await asApp('authenticated', coordinator, `update centres set time_zone = 'Europe/London' where id = 1 returning id`);
  if (rows.length === 0) throw new Error('no row changed (row-level security)');
});
const [nyCentre] = await asOwner(`insert into centres (name, time_zone, country_code, opens_at, closes_at)
  values ('Queens', 'America/New_York', 'US', '14:30', '23:59') returning id`);
const nyStaff = await signUp('ny.coordinator@example.com', true);
await asOwner(`update profiles set role = 'coordinator', centre_id = ${nyCentre.id}, full_name = 'NY Coordinator' where id = '${nyStaff}'`);
check('0033: my_centre_locale tells the app its zone and country', JSON.stringify((await asApp('authenticated', nyStaff,
  'select my_centre_locale() as l'))[0].l) === JSON.stringify({ time_zone: 'America/New_York', country_code: 'US' }));
check('0033: today_ist() for a New York coordinator is the date in New York', (await asApp('authenticated', nyStaff,
  `select today_ist() = (now() at time zone 'America/New_York')::date and my_time_zone() = 'America/New_York' as ok`))[0].ok === true);
const days = (await asOwner(`select
    local_day(timestamptz '2026-03-11 03:59+00', ${nyCentre.id}) as ny_before,
    local_day(timestamptz '2026-03-11 04:01+00', ${nyCentre.id}) as ny_after,
    local_day(timestamptz '2026-03-11 03:59+00', 1) as in_before,
    local_day(timestamptz '2026-03-10 18:29+00', 1) as in_late,
    local_day(timestamptz '2026-03-10 18:31+00', 1) as in_next`))[0];
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d));
check('0033: around New York midnight (EDT) the attendance day is New York\'s',
  iso(days.ny_before) === '2026-03-10' && iso(days.ny_after) === '2026-03-11' && iso(days.in_before) === '2026-03-11', JSON.stringify(days));
check('0033: around India midnight (18:30 UTC) Abids keeps its day as before',
  iso(days.in_late) === '2026-03-10' && iso(days.in_next) === '2026-03-11', JSON.stringify(days));

// A New York student with a check-in at 23:30 New York time on 10 March 2026 (03:30 UTC on the 11th).
const nyStudent = (await register(nyStaff, { p_full_name: 'Queens Student', p_dob: '1990-02-02' })).id;
await asOwner(`update students set home_centre_id = ${nyCentre.id} where id = '${nyStudent}'`);
await asOwner(`insert into visits (student_id, centre_id, check_in, check_out, method)
  values ('${nyStudent}', ${nyCentre.id}, timestamp '2026-03-10 23:30' at time zone 'America/New_York',
          timestamp '2026-03-10 23:55' at time zone 'America/New_York', 'manual')`);
const reportDay = async (day) => (await asApp('authenticated', guru, `select r from jsonb_array_elements(
  (class_report('${day}', '${day}'))->'rows') r where r->>'id' = '${nyStudent}'`))[0]?.r;
const onTenth = await reportDay('2026-03-10');
const onEleventh = await reportDay('2026-03-11');
check('0033: the report counts the 23:30 New York visit on 10 March, not 11 March',
  onTenth?.visits === 1 && onEleventh?.visits === 0 && onTenth?.last_visit_on === '2026-03-10',
  JSON.stringify({ tenth: onTenth?.visits, eleventh: onEleventh?.visits, last: onTenth?.last_visit_on }));
check('0033: days since the visit count from New York\'s today', (await asOwner(`select days_since_visit =
  (now() at time zone 'America/New_York')::date - date '2026-03-10' as ok from student_overview where id = '${nyStudent}'`))[0].ok === true);

// Closing: a visit left open two days ago ends at that day's closing time in New York; a visit begun
// now is not closed before the centre has been closed an hour (closes 23:59 here).
const nyStudent2 = (await register(nyStaff, { p_full_name: 'Queens Student Two', p_dob: '1991-03-03' })).id;
await asOwner(`insert into visits (student_id, centre_id, check_in, method) values
  ('${nyStudent}', ${nyCentre.id}, ((now() at time zone 'America/New_York')::date - 2 + time '15:00') at time zone 'America/New_York', 'manual'),
  ('${nyStudent2}', ${nyCentre.id}, now() - interval '1 minute', 'manual')`);
await asOwner('select close_open_visits()');
const closed = await asOwner(`select student_id, check_out is not null as closed,
    check_out = ((now() at time zone 'America/New_York')::date - 2 + time '23:59') at time zone 'America/New_York' as at_closing
  from visits where student_id in ('${nyStudent}', '${nyStudent2}') and check_in > now() - interval '3 days'`);
check('0033: a New York visit left open ends at New York\'s closing time of its day',
  closed.find((r) => r.student_id === nyStudent)?.at_closing === true, JSON.stringify(closed));
check('0033: ... and a visit begun now stays open', closed.find((r) => r.student_id === nyStudent2)?.closed === false);

// Notices: India keeps day-month-year; New York gets ISO 8601, each in their own zone. pg_cron has
// no login (asApp leaves the last one set, so clear it): the first centre's zone.
await asOwner(`select set_config('request.jwt.claim.sub', '', false)`);
const lines = (await asOwner(`select
    event_push_line('event_new', 'en', timestamptz '2026-03-11 03:30+00', null, '${nyStaff}') as ny,
    event_push_line('event_new', 'en', timestamptz '2026-03-11 03:30+00', null, '${coordinator}') as hyd,
    event_push_line('event_remind', 'en', timestamptz '2026-03-11 03:30+00') as cron`))[0];
check('0033: an event notice is written in each person\'s zone and date style',
  lines.ny === 'New event: 2026-03-10 23:30. Will you come?' && lines.hyd === 'New event: 11-03-2026 09:00. Will you come?'
  && lines.cron === 'Reminder: tomorrow at 09:00.', JSON.stringify(lines));

// Fund: a reversal keeps the currency of the entry it undoes.
const [usd] = await asOwner(`insert into fund_entries (direction, category_id, on_date, amount_paise, status, created_by, currency)
  values ('income', (select id from fund_categories where direction = 'income' order by id limit 1), current_date, 500, 'approved',
          '${guru}', 'USD') returning id`);
const [{ id: usdReversal }] = await asApp('authenticated', guru, 'select reverse_fund_entry($1, $2) as id', [usd.id, 'Typed in the wrong fund']);
check('0033: a reversal takes the currency of the entry it undoes', (await asOwner(
  `select currency from fund_entries where id = ${usdReversal}`))[0].currency === 'USD');
await refusesWith('0033: a currency is an ISO 4217 code', 'new row for relation "fund_entries" violates check constraint "fund_entries_currency_check"', () => asOwner(`insert into fund_entries
  (direction, category_id, on_date, amount_paise, status, created_by, currency)
  values ('income', (select id from fund_categories where direction = 'income' order by id limit 1), current_date, 500, 'approved', '${guru}', 'rupees')`));
check('0033: the helpers with a person\'s id are not callable by app roles', (await asOwner(`select
  not has_function_privilege('authenticated', 'person_centre(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'local_stamp(timestamptz,uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'event_push_line(text,text,timestamptz,text,uuid)', 'execute')
  and not has_function_privilege('anon', 'today_ist()', 'execute')
  and has_function_privilege('authenticated', 'centre_today(integer)', 'execute') as ok`))[0].ok === true);
// Clean up so the counts below stay as they were.
await asOwner(`delete from visits where student_id in ('${nyStudent}', '${nyStudent2}')`);
await asOwner(`delete from students where id in ('${nyStudent}', '${nyStudent2}')`);

// ---------------------------------------------------------------- access log (0034)
// D4-06, D4-09 (part): reads of guardians, consents and call notes go through logging functions;
// coordinators lose the direct SELECT; the log is the Guru's, written by the functions only.
const alMinor = await register(coordinator, { p_full_name: 'Access Log Child', p_dob: childDob, p_mentor: coordinator,
  p_guardian_name: 'Access Parent', p_guardian_phone: '9000077777', p_guardian_relation: 'mother', p_id_type_checked: 'aadhaar',
  p_photo_consent: true, p_written_consent: true, p_notice_version: '0.1-draft' });
check('D4-05: register_student stores the privacy-notice version on each consent', (await asOwner(
  `select notice_version from consents where student_id = '${alMinor.id}'`)).map((r) => r.notice_version).join() === '0.1-draft,0.1-draft');
const alOld = await register(coordinator, { p_full_name: 'Access Old App Child', p_dob: childDob, p_guardian_name: 'Old App Parent',
  p_guardian_phone: '9000077778', p_guardian_relation: 'father', p_id_type_checked: 'aadhaar', p_written_consent: true });
check('... an app that sends none leaves it empty (NULL)', (await asOwner(
  `select notice_version from consents where student_id = '${alOld.id}'`)).every((r) => r.notice_version === null));
await refusesWith('... a malformed version is refused', 'notice_version_invalid', () => register(coordinator, {
  p_full_name: 'Access Bad', p_dob: '1990-01-01', p_notice_version: 'v1; drop table' }));
await refusesWith('... and frozen once saved, even for the Guru', 'consent_locked', () =>
  asApp('authenticated', guru, `update consents set notice_version = '0.2' where student_id = $1`, [alMinor.id]));
await logCall(coordinator, { p_student: alMinor.id, p_outcome: 'not_reachable', p_reason: null, p_comment: 'Access log call note' });
const logRows = async () => (await asOwner('select count(*)::int as n from access_log'))[0].n;
const lastLog = async () => (await asOwner('select actor_id, function_name, student_id, row_count from access_log order by id desc limit 1'))[0];
for (const [fn, expected] of [['get_guardians', 1], ['get_consents', 2], ['get_call_notes', 1]]) {
  const before = await logRows();
  const rows = await asApp('authenticated', coordinator, `select * from ${fn}($1)`, [alMinor.id]);
  const entry = await lastLog();
  check(`D4-06: a coordinator's ${fn} returns the rows and writes exactly one access_log row`, rows.length === expected
    && (await logRows()) === before + 1 && entry.actor_id === coordinator && entry.function_name === fn
    && entry.student_id === alMinor.id && entry.row_count === expected, `${rows.length} ${JSON.stringify(entry)}`);
}
check('... get_guardians gives the phone, get_consents the notice version, get_call_notes the note',
  (await asApp('authenticated', coordinator, 'select phone from get_guardians($1)', [alMinor.id]))[0]?.phone === '9000077777'
  && (await asApp('authenticated', coordinator, 'select notice_version from get_consents($1)', [alMinor.id]))[0]?.notice_version === '0.1-draft'
  && (await asApp('authenticated', coordinator, 'select comment from get_call_notes($1, 1)', [alMinor.id]))[0]?.comment === 'Access log call note');
check('... the Guru\'s reads through the functions are logged too', await (async () => {
  const before = await logRows();
  await asApp('authenticated', guru, 'select * from get_guardians($1)', [alMinor.id]);
  return (await logRows()) === before + 1 && (await lastLog()).actor_id === guru;
})());
check('D4-09: a coordinator reads no guardian, consent or call log straight from the tables',
  (await asApp('authenticated', coordinator, 'select id from guardians')).length === 0
  && (await asApp('authenticated', coordinator, 'select id from consents')).length === 0
  && (await asApp('authenticated', coordinator, 'select id from call_logs')).length === 0);
check('... nor through student_overview or any view (no view names these tables)', (await asOwner(`select count(*)::int as n
  from pg_views where schemaname = 'public' and definition ~* '\\m(guardians|consents|call_logs|access_log)\\M'`))[0].n === 0);
check('... while the Guru still does (dashboard work, revoking a consent)',
  (await asApp('authenticated', guru, 'select id from guardians where student_id = $1', [alMinor.id])).length === 1);
const alPending = await signUp('access.pending@example.com', true);
const alBefore = await logRows();
for (const [who, id] of [['a student', arjun], ['a pending login', alPending], ['a switched-off coordinator', offCoord], ['the door tablet', kiosk]]) {
  for (const fn of ['get_guardians', 'get_consents', 'get_call_notes']) {
    await refusesWith(`D4-06: ${who} cannot run ${fn}`, 'not_allowed', () =>
      asApp('authenticated', id, `select * from ${fn}($1)`, [alMinor.id]));
  }
}
check('... and a refused call writes no access_log row', (await logRows()) === alBefore);
await refusesWith('a staff call without a student is refused', 'student_required', () =>
  asApp('authenticated', coordinator, 'select * from get_guardians(null)'));
await refusesWith('anon cannot run get_guardians (no right)', 'permission denied for function get_guardians', () =>
  asApp('anon', null, 'select * from get_guardians($1)', [alMinor.id]));
check('class_report still counts a coordinator\'s calls (outcomes through call_outcomes)', await (async () => {
  const [{ r }] = await asApp('authenticated', coordinator, 'select class_report(today_ist() - 1, today_ist()) as r');
  const [{ n }] = await asOwner(`select count(*)::int as n from call_logs c join students s on s.id = c.student_id
    where s.mentor_id = '${coordinator}' and c.called_at >= now() - interval '3 days'`);
  return r.calls_done === n && n >= 1;
})());
check('... and call_outcomes gives a student nothing', (await asApp('authenticated', arjun,
  `select * from call_outcomes(now() - interval '1 year', now() + interval '1 day')`)).length === 0);
// The log itself: the Guru reads it; nobody writes or deletes it from the app.
check('access_log: the Guru reads it, a coordinator and a student read none of it',
  (await asApp('authenticated', guru, 'select id from access_log')).length > 0
  && (await asApp('authenticated', coordinator, 'select id from access_log')).length === 0
  && (await asApp('authenticated', arjun, 'select id from access_log')).length === 0);
for (const [who, id] of [['a coordinator', coordinator], ['the Guru', guru]]) {
  await refusesWith(`... ${who} cannot insert into it`, 'permission denied for table access_log', () => asApp('authenticated', id,
    `insert into access_log (actor_id, function_name, student_id) values ($1, 'forged', $1)`, [id]));
  await refusesWith(`... nor update it`, 'permission denied for table access_log', () => asApp('authenticated', id, `update access_log set function_name = 'x' where id > 0`));
  await refusesWith(`... nor delete from it`, 'permission denied for table access_log', () => asApp('authenticated', id, 'delete from access_log where id > 0'));
}
await refusesWith('... nor run log_access', 'permission denied for function log_access', () => asApp('authenticated', coordinator, `select log_access('forged', null, 0)`));
await refusesWith('... nor the purge', 'permission denied for function purge_access_log', () => asApp('authenticated', guru, 'select purge_access_log()'));
// G11: audit-log pages are read through get_audit_log and logged.
await refusesWith('a coordinator cannot run get_audit_log', 'not_allowed', () => asApp('authenticated', coordinator, 'select * from get_audit_log()'));
check('the Guru\'s audit-log page is logged, filters work', await (async () => {
  const before = await logRows();
  const page = await asApp('authenticated', guru, `select table_name, action from get_audit_log(p_table => 'consents', p_action => 'INSERT', p_limit => 3)`);
  const entry = await lastLog();
  return page.length === 3 && page.every((r) => r.table_name === 'consents' && r.action === 'INSERT')
    && (await logRows()) === before + 1 && entry.function_name === 'get_audit_log' && entry.row_count === 3 && entry.student_id === null;
})());
check('... and the table itself is closed to the Guru\'s direct reads', (await asApp('authenticated', guru, 'select id from audit_log')).length === 0);
// The purge keeps 400 days.
await asOwner(`insert into access_log (at, function_name) values (now() - interval '401 days', 'purge-old'), (now() - interval '399 days', 'purge-kept')`);
const keptBefore = await logRows();
const [{ n: purged }] = await asOwner('select purge_access_log() as n');
check('the nightly purge removes only rows older than 400 days', purged === 1 && (await logRows()) === keptBefore - 1
  && (await asOwner(`select function_name from access_log where function_name like 'purge-%'`)).map((r) => r.function_name).join() === 'purge-kept');
// Erasure leaves no student id in the log; the rows (who, when, what) stay.
const alRowsBefore = (await asOwner(`select count(*)::int as n from access_log where student_id = '${alMinor.id}'`))[0].n;
const alTotal = await logRows();
await asApp('authenticated', guru, `select erase_student($1, 'parent asked', 'REQ-AL') as r`, [alMinor.id]);
check('erasure blanks the student\'s id in access_log and keeps the rows', alRowsBefore >= 4
  && (await asOwner(`select count(*)::int as n from access_log where student_id = '${alMinor.id}'`))[0].n === 0
  && (await logRows()) === alTotal, `${alRowsBefore}`);
check('the app sends the website\'s privacy-notice version (one value in both places)', await (async () => {
  const site = readFileSync(new URL('../website/site.config.mjs', supabaseDir), 'utf8').match(/privacyNotice:\s*\{\s*version:\s*'([^']+)'/)?.[1];
  const app = readFileSync(new URL('../app/src/lib/privacy-notice.ts', supabaseDir), 'utf8').match(/PRIVACY_NOTICE_VERSION = '([^']+)'/)?.[1];
  return !!site && site === app;
})());
// ---------------------------------------------------------------- account creation (0036)
// Team MoM 05-10-2026, docs/DECISIONS.md #162-#167: option lists the Guru edits, the sign-up's date of
// birth / gender / centre, About you, the desk, same-gender coordinators by referral code and load,
// the "How students found us" report, and the one function anon may run. Kept in one block.
{
  const signUpWith = async (email, meta, confirmed = true) => (await db.query(
    `insert into auth.users (email, email_confirmed_at, raw_user_meta_data) values ($1, ${confirmed ? 'now()' : 'null'}, $2) returning id`,
    [email, JSON.stringify(meta)])).rows[0].id;
  const about = async (who, p) => (await asApp('authenticated', who, 'select save_about_me($1::jsonb) as r', [JSON.stringify(p)]))[0].r;
  const myAbout = async (who) => (await asApp('authenticated', who, 'select my_about() as r'))[0].r;
  const details = async (who, student, p) => (await asApp('authenticated', who, 'select save_student_details($1, $2::jsonb) as r',
    [student, JSON.stringify(p)]))[0].r;
  const mentorOf = async (id) => (await asOwner(`select mentor_id from students where id = '${id}'`))[0].mentor_id;
  const noRow = (rows) => { if (rows.length === 0) throw new Error('no row changed (row-level security)'); };
  const adultDob = `${year - 30}-04-05`;
  const minorDob = `${year - 12}-04-05`;

  // Option lists: seeded, read by class roles, written by the Guru only, codes frozen, audited.
  const lists = (await asOwner(`select list, count(*)::int as n from choice_options group by list order by list`))
    .map((r) => `${r.list}:${r.n}`).join(' ');
  check('0036: the six option lists are seeded', lists === 'gender:2 instrument:3 occupation:7 relation:5 service_area:11 source:9', lists);
  check('0036: a student reads the option lists; a pending login none', (await asApp('authenticated', arjun,
    'select count(*)::int as n from choice_options'))[0].n === 37 && (await asApp('authenticated', stranger,
    'select count(*)::int as n from choice_options'))[0].n === 0);
  await refusesWith('0036: a coordinator cannot add an option (Guru only)', 'new row violates row-level security policy for table "choice_options"', () =>
    asApp('authenticated', coordinator, `insert into choice_options (list, code, label_en) values ('source', 'radio', 'Radio')`));
  await refusesWith('0036: a coordinator cannot change a label', 'no row changed (row-level security)', async () =>
    noRow(await asApp('authenticated', coordinator, `update choice_options set label_en = 'X' where list = 'source' and code = 'poster' returning id`)));
  const [radio] = await asApp('authenticated', guru, `insert into choice_options (list, code, label_en, label_te, label_hi, sort)
    values ('source', 'radio', '  Radio ', 'రేడియో', 'रेडियो', 85) returning id, label_en`);
  check('0036: the Guru adds an option (label trimmed)', radio.label_en === 'Radio');
  await asApp('authenticated', guru, `update choice_options set label_en = 'Radio programme', active = false where id = $1`, [radio.id]);
  check('0036: an option edit is audited with who made it', (await asOwner(`select count(*)::int as n from audit_log
    where table_name = 'choice_options' and row_id = '${radio.id}' and changed_by = '${guru}'`))[0].n === 2);
  await refusesWith('0036: an option\'s code never changes', 'option_code_locked', () =>
    asApp('authenticated', guru, `update choice_options set code = 'fm' where id = $1`, [radio.id]));
  await refusesWith('0036: a label with an invisible character is refused', 'label_invalid', () =>
    asApp('authenticated', guru, `update choice_options set label_hi = 'रेडि\u200bयो' where id = $1`, [radio.id]));
  await refusesWith('0036: male / female, the parent relations and "other" are never deleted', 'option_required', () =>
    asApp('authenticated', guru, `delete from choice_options where list = 'relation' and code = 'mother'`));
  await asApp('authenticated', guru, `delete from choice_options where id = $1`, [radio.id]);
  check('0036: an option nobody chose can be deleted', (await asOwner(`select count(*)::int as n from choice_options where id = ${radio.id}`))[0].n === 0);

  // Anon: one function, public facts only; no table, no other function.
  const pub = (await asApp('anon', null, 'select sign_up_choices() as r'))[0].r;
  check('0036 #163: anon gets the active centres (id, name, city, country only) and gender options',
    pub.centres.length >= 1 && pub.centres.every((c) => Object.keys(c).sort().join() === 'city,country_code,id,name')
    && pub.genders.map((g) => g.code).join() === 'male,female'
    && pub.instruments.map((g) => g.code).join() === 'mridanga,kartal,harmonium', JSON.stringify(pub).slice(0, 160));
  await refusesWith('0036: anon cannot read the option table', 'permission denied for table choice_options', () =>
    asApp('anon', null, 'select 1 from choice_options'));
  await refusesWith('0036: anon cannot read person_details', 'permission denied for table person_details', () =>
    asApp('anon', null, 'select 1 from person_details'));
  await refusesWith('0036: anon cannot run my_about', 'permission denied for function my_about', () =>
    asApp('anon', null, 'select my_about()'));

  // Sign-up: date of birth (adults), gender and centre from the sign-up form; never fails on bad input.
  const [abids] = await asOwner(`select id from centres where name = 'Abids'`);
  const priya = await signUpWith('priya.ac@example.com', { full_name: 'Priya Sharma', language: 'hi', dob: adultDob, gender: 'female',
    centre_id: abids.id, phone: '+91 98765 11111', diksha_name: ' Prema Devi Dasi ', learn: ['mridanga', 'kartal', 'juggling'] });
  const priyaProfile = (await asOwner(`select gender, centre_id, language, role from profiles where id = '${priya}'`))[0];
  check('0036: a sign-up keeps its gender, centre and language (pending)', priyaProfile.gender === 'female'
    && priyaProfile.centre_id === abids.id && priyaProfile.language === 'hi' && priyaProfile.role === 'pending', JSON.stringify(priyaProfile));
  const priyaSigned = (await asOwner(`select d.dob::text as dob, d.diksha_name, d.learn_interests, p.phone
    from person_details d join profiles p on p.id = d.profile_id where d.profile_id = '${priya}'`))[0];
  check('0036: ... and its date of birth, Diksha name and instruments on the login\'s details, its mobile on the profile',
    priyaSigned?.dob === adultDob && priyaSigned.diksha_name === 'Prema Devi Dasi' && priyaSigned.phone === '+919876511111'
    && JSON.stringify(priyaSigned.learn_interests) === '["kartal","mridanga"]', JSON.stringify(priyaSigned));
  const kid = await signUpWith('kid.ac@example.com', { full_name: 'Kid Sign Up', dob: minorDob, gender: 'robot', centre_id: 999, phone: '12345' });
  const kidRow = (await asOwner(`select p.gender, p.centre_id, p.phone, (select count(*)::int from person_details d where d.profile_id = p.id) as n
    from profiles p where p.id = '${kid}'`))[0];
  check('0036: an under-18 date of birth, an unknown gender and centre are not kept (under 18 = the desk, #150)',
    kidRow.gender === null && kidRow.n === 0 && kidRow.centre_id === abids.id && kidRow.phone === null, JSON.stringify(kidRow));
  const odd = await signUpWith('odd.ac@example.com', { full_name: 'Odd Input', dob: 'yesterday', centre_id: 'x' });
  check('0036: a sign-up with nonsense in the new fields still makes the login', (await roleOf(odd)) === 'pending');

  // Staff gender (Guru on G2) and referral codes.
  const fem1 = await signUp('fem1.ac@example.com', true);
  const fem2 = await signUp('fem2.ac@example.com', true);
  const male1 = await signUp('male1.ac@example.com', true);
  for (const [id, name] of [[fem1, 'Gita Coordinator'], [fem2, 'Radha Coordinator'], [male1, 'Madhav Coordinator']]) {
    await asApp('authenticated', guru, `update profiles set role = 'coordinator', full_name = $2 where id = $1`, [id, name]);
  }
  await asApp('authenticated', guru, `update profiles set gender = 'female' where id in ($1, $2)`, [fem1, fem2]);
  await asApp('authenticated', guru, `update profiles set gender = 'male' where id = $1`, [male1]);
  const codes = await asOwner(`select id, referral_code as c from profiles where id in ('${fem1}', '${fem2}', '${male1}', '${guru}')`);
  const codeOf = (id) => codes.find((r) => r.id === id).c;
  check('0036 #165: coordinators and the Guru have a six-character referral code', codes.length === 4
    && codes.every((r) => /^[A-HJ-NP-Z2-9]{6}$/.test(r.c)), JSON.stringify(codes.map((r) => r.c)));
  await refusesWith('0036: a coordinator cannot set their own gender (the Guru does)', 'not_allowed', () =>
    asApp('authenticated', fem1, `update profiles set gender = 'male' where id = $1`, [fem1]));
  await refusesWith('0036: nobody writes a referral code', 'profile_field_locked', () =>
    asApp('authenticated', guru, `update profiles set referral_code = 'AAAAAA' where id = $1`, [fem1]));
  await refusesWith('0036: a gender is an option of the list', 'gender_unknown', () =>
    asApp('authenticated', guru, `update profiles set gender = 'robot' where id = $1`, [fem1]));
  await asApp('authenticated', priya, `update profiles set gender = 'female' where id = $1`, [priya]);
  check('0036: a waiting login may set its own gender', (await asOwner(`select gender from profiles where id = '${priya}'`))[0].gender === 'female');

  // About you (waiting login): saved as you go, codes checked, phones in E.164.
  const a0 = await myAbout(priya);
  check('0036: my_about gives a waiting login its own answers and the lists', a0.has_record === false && a0.gender === 'female'
    && a0.country_code === 'IN' && a0.options.service_area.length === 11 && a0.about_state === null, JSON.stringify(a0).slice(0, 120));
  await refusesWith('0036: a referral code nobody has is refused', 'referral_code_unknown', () => about(priya, { referral_code: 'ZZZZZZ' }));
  await refusesWith('0036: a phone must be E.164', 'phone_invalid', () => about(priya, { phone: '98765 43210' }));
  await refusesWith('0036: an unknown service area is refused', 'service_unknown', () => about(priya, { service_areas: ['kirtan', 'juggling'] }));
  await refusesWith('0036: an unknown instrument is refused', 'instrument_unknown', () => about(priya, { learn_interests: ['sitar'] }));
  const aLearn = await about(priya, { learn_interests: ['harmonium', 'mridanga', 'kartal'], diksha_name: 'Prema Devi Dasi' });
  check('0036: About you changes the instruments and keeps the Diksha name', JSON.stringify(aLearn.learn_interests) === '["harmonium","kartal","mridanga"]'
    && aLearn.diksha_name === 'Prema Devi Dasi', JSON.stringify(aLearn).slice(0, 160));
  const a1 = await about(priya, { referral_code: codeOf(fem2).toLowerCase(), phone: '+91 98765 43210' });
  const a2 = await about(priya, { occupation: 'other', occupation_other: ' Artist ', service_areas: ['kirtan', 'prasadam', 'kirtan'],
    emergency_relation: 'spouse', emergency_name: 'Ravi Sharma', emergency_phone: '+919876500000', about_state: 'done' });
  check('0036: answers are saved key by key (the referral stays when the next keys arrive)', a1.referred === true && a1.heard_via === 'referral'
    && a1.phone === '+919876543210' && a2.referred === true && a2.occupation_other === 'Artist'
    && JSON.stringify(a2.service_areas) === '["kirtan","prasadam"]' && a2.about_state === 'done', JSON.stringify(a2).slice(0, 200));
  check('0036: a later "skip" does not undo "done"', (await about(priya, { about_state: 'skipped' })).about_state === 'done');
  await refusesWith('0036: staff do not use About you', 'not_allowed', () => about(coordinator, { occupation: 'working' }));
  check('0036: a student reads no person_details row directly; a pending login none', (await asApp('authenticated', arjun,
    'select count(*)::int as n from person_details'))[0].n === 0 && (await asApp('authenticated', priya,
    'select count(*)::int as n from person_details'))[0].n === 0);
  check('0036: every About-you save is audited with who made it', (await asOwner(`select count(*)::int as n from audit_log
    where table_name = 'person_details' and action = 'UPDATE' and changed_by = '${priya}'`))[0].n >= 4);

  // The desk: sign-ups waiting, by centre; the unconfirmed are not listed.
  await signUpWith('unconfirmed.ac@example.com', { full_name: 'Not Confirmed', gender: 'male' }, false);
  const queens = (await asOwner(`select id from centres where name = 'Queens'`))[0].id;
  const far = await signUpWith('far.ac@example.com', { full_name: 'Far Away', gender: 'male', centre_id: queens });
  const deskList = (await asApp('authenticated', fem1, 'select waiting_sign_ups() as r'))[0].r;
  const guruList = (await asApp('authenticated', guru, 'select waiting_sign_ups() as r'))[0].r;
  const listed = (list, id) => list.some((r) => r.id === id);
  check('0036: a coordinator sees the confirmed sign-ups of their centre, with what they gave', listed(deskList, priya)
    && deskList.find((r) => r.id === priya).dob === adultDob && deskList.find((r) => r.id === priya).occupation === 'other'
    && !listed(deskList, far) && !deskList.some((r) => r.email === 'unconfirmed.ac@example.com'));
  check('0036: the Guru sees the sign-ups of every centre', listed(guruList, priya) && listed(guruList, far));
  check('0036: a student gets no waiting list', (await asApp('authenticated', arjun, 'select waiting_sign_ups() as r'))[0].r === null);

  // Auto-assignment: the referral first (same gender), else the least loaded same-gender coordinator.
  const loadStudent = (await register(fem2, { p_full_name: 'Load For Radha', p_dob: '1990-01-01', p_mentor: fem2 })).id;
  const priyaRec = (await register(fem1, { p_full_name: 'Priya Sharma', p_dob: adultDob, p_email: 'priya.ac@example.com' })).id;
  const moved = (await asOwner(`select student_id, profile_id, dob from person_details where profile_id = '${priya}'`))[0];
  check('0036: linking moves the login\'s details to the record and drops the sign-up date of birth',
    moved.student_id === priyaRec && moved.dob === null && (await roleOf(priya)) === 'student');
  check('0036 #165: the login\'s gender fills the record and the referring coordinator (same gender) becomes the mentor, before load',
    (await mentorOf(priyaRec)) === fem2, String(await mentorOf(priyaRec)));
  check('0036: the new mentor gets an inbox notice', (await asOwner(`select count(*)::int as n from notifications
    where profile_id = '${fem2}' and url = '/staff/students/${priyaRec}'`))[0].n === 1);
  const desk1 = (await register(male1, { p_full_name: 'Desk Woman', p_dob: '1985-05-05' })).id;
  const d1 = await details(male1, desk1, { gender: 'female', referred_by: male1, occupation: 'working', service_areas: ['tech'] });
  check('0036 #165: a referral from a coordinator of another gender is kept for the report but the least loaded woman mentors',
    d1.mentor_id === fem1 && d1.referred_by === male1 && d1.gender === 'female', JSON.stringify(d1).slice(0, 160));
  const desk2 = (await register(fem1, { p_full_name: 'Desk Man', p_dob: '1985-06-06' })).id;
  await details(fem1, desk2, { gender: 'male' });
  check('0036 #165: a man gets the male coordinator', (await mentorOf(desk2)) === male1);
  check('0036: a coordinator reads no person_details row directly (as guardians since 0034)', (await asApp('authenticated', fem1,
    'select count(*)::int as n from person_details'))[0].n === 0 && (await asApp('authenticated', guru,
    'select count(*)::int as n from person_details'))[0].n > 0);
  const viaFn = (await asApp('authenticated', fem1, 'select get_student_details($1) as r', [desk1]))[0].r;
  check('0036: ... and reads a student\'s details through get_student_details (no sign-up date of birth)', viaFn.gender === 'female'
    && viaFn.details.occupation === 'working' && !('dob' in viaFn.details) && !('profile_id' in viaFn.details), JSON.stringify(viaFn).slice(0, 120));
  check('0036 + 0034: the coordinator\'s read of a student\'s details is in the access log', (await asOwner(`select count(*)::int as n
    from access_log where function_name = 'get_student_details' and actor_id = '${fem1}' and student_id = '${desk1}' and row_count = 1`))[0].n === 1);
  await refusesWith('0036: a student cannot read details through get_student_details', 'not_allowed', () =>
    asApp('authenticated', arjun, 'select get_student_details($1)', [desk1]));
  const chosen = (await register(fem1, { p_full_name: 'Chosen Mentor', p_dob: '1985-07-07', p_mentor: fem1 })).id;
  await details(fem1, chosen, { gender: 'male' });
  check('0036: a mentor chosen at the desk is kept', (await mentorOf(chosen)) === fem1);
  // No coordinator of that gender: no mentor, one notice to the Guru (not one per save).
  await asApp('authenticated', guru, `insert into choice_options (list, code, label_en) values ('gender', 'not_said', 'Prefer not to say')`);
  const nobody = (await register(fem1, { p_full_name: 'No Match', p_dob: '1985-08-08' })).id;
  await details(fem1, nobody, { gender: 'not_said' });
  await details(fem1, nobody, { occupation: 'retired' });
  await asApp('authenticated', fem1, `update students set home_centre_id = home_centre_id where id = $1`, [nobody]);
  await details(fem1, nobody, { centre: abids.id, gender: 'not_said' });
  check('0036 #165: no same-gender coordinator leaves the mentor empty', (await mentorOf(nobody)) === null);
  check('0036 #165: ... and tells the Guru once in the inbox', (await asOwner(`select count(*)::int as n from notifications
    where profile_id = '${guru}' and url = '/staff/students/${nobody}' and kind = 'notice'`))[0].n === 1);
  await refusesWith('0036: an unknown gender is refused at the desk', 'gender_unknown', () => details(fem1, nobody, { gender: 'robot' }));
  await refusesWith('0036: a student cannot use the desk function', 'not_allowed', () => details(arjun, nobody, { occupation: 'working' }));

  // Under 18: the guardian is the emergency contact; a minor's contact is a parent or guardian.
  await refusesWith('0036: a minor needs a guardian contact at the desk (emergency contact)', 'minor_needs_guardian', () =>
    register(fem1, { p_full_name: 'Minor No Contact', p_dob: minorDob, p_id_type_checked: 'aadhaar', p_written_consent: true }));
  const minorLogin = await signUp('minor.ac@example.com', true);
  const minorRec = (await register(fem1, { p_full_name: 'Minor With Login', p_dob: minorDob, p_email: 'minor.ac@example.com',
    p_guardian_name: 'Minor Parent', p_guardian_phone: '9876511111', p_guardian_relation: 'father', p_id_type_checked: 'aadhaar',
    p_written_consent: true })).id;
  const mm = await myAbout(minorLogin);
  check('0036: a minor\'s About you knows the guardian is on record', mm.minor === true && mm.has_guardian === true && mm.has_record === true);
  check('0036: ... so the minor can finish About you', (await about(minorLogin, { occupation: 'school_student', about_state: 'done' })).about_state === 'done');
  await refusesWith('0036: a minor\'s emergency contact is a parent or guardian', 'minor_contact_relation', () =>
    about(minorLogin, { emergency_relation: 'spouse', emergency_name: 'Not A Parent', emergency_phone: '+919876522222' }));
  check('0036: a guardian with a phone counts as the minor\'s emergency contact (helper)', (await asOwner(`select minor_without_contact('${minorRec}',
    row(null, null, null, null, null, null, null, null, null, null, null, null, '{}', null, null, '{}', null, now(), now(), null)::person_details) as a`))[0].a === false);

  // Report: by source and by coordinator, Guru only.
  const today = (await asOwner(`select today_ist()::text as d`))[0].d;
  const rep = (await asApp('authenticated', guru, `select heard_about_report($1, $1) as r`, [today]))[0].r;
  const src = (code) => rep.by_source.find((r) => r.code === code)?.people ?? 0;
  const by = (id) => rep.by_coordinator.find((r) => r.id === id)?.people ?? 0;
  check('0036: the report counts how people found us, by source and by referring coordinator', rep.people >= 3 && src('referral') === 2
    && by(fem2) === 1 && by(male1) === 1 && rep.by_coordinator.every((r) => typeof r.name === 'string'), JSON.stringify(rep).slice(0, 200));
  check('0036: ... and the instruments people want to learn', rep.by_interest.find((r) => r.code === 'harmonium')?.people === 1,
    JSON.stringify(rep.by_interest));
  await refusesWith('0036: a coordinator gets no report', 'not_allowed', () =>
    asApp('authenticated', fem1, `select heard_about_report($1, $1)`, [today]));
  await refusesWith('0036: the report covers at most a year', 'range_too_long', () =>
    asApp('authenticated', guru, `select heard_about_report('2024-01-01', '2026-01-01')`));

  // Clean up so the counts below stay as they were.
  await asOwner(`delete from students where id in ('${loadStudent}', '${priyaRec}', '${desk1}', '${desk2}', '${chosen}', '${nobody}', '${minorRec}')`);
  await asOwner(`update profiles set role = 'pending' where id in ('${fem1}', '${fem2}', '${male1}')`);
  await asOwner(`delete from choice_options where list = 'gender' and code = 'not_said'`);
  for (const id of [priya, kid, odd, far, fem1, fem2, male1, minorLogin]) await asOwner(`delete from auth.users where id = '${id}'`);
  await asOwner(`delete from auth.users where email = 'unconfirmed.ac@example.com'`);
}

// ================================================================ test net (audit brief 12)
// Checks that walk the whole schema, so a new table, view, policy or function is covered without
// writing a new check for it. Each names the audit finding it closes. Kept in one block, apart
// from the per-migration sections above.

{ // one block scope, so its names cannot clash with the sections above
  /**
   * Runs `sql` as an app user inside a transaction that is always rolled back, so nothing it does is
   * kept (the rollback also undoes the role and the sign-in). Returns { rows } with the number of
   * rows the statement returned, or { error } with the refusal message.
   */
  async function tryAs(role, userId, sql, params) {
    await db.exec('begin');
    try {
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
      await db.exec(`set role ${role}`);
      return { rows: (await db.query(sql, params)).rows.length };
    } catch (error) {
      return { error: error.message };
    } finally {
      await db.exec('rollback');
    }
  }
  /**
   * How many rows a write got past the policies: the rows it changed, or 1 when only a foreign key
   * stopped it (the policy let it through; another table's rows happened to hang on it).
   */
  const passedPolicy = (r) => r.rows ?? (/violates (foreign key constraint|RESTRICT setting)/.test(r.error) ? 1 : 0);
  /** Rows of `sql` that `userId` (signed in) can see; a refused read counts as none. */
  const rowsAs = async (userId, sql) => (await tryAs('authenticated', userId, sql)).rows ?? 0;
  const tn = { student: arjun, studentId: await studentIdOf(arjun), pending: stranger, coordinator, guru };
  check('test net: the people it uses still have their roles', (await roleOf(tn.student)) === 'student'
    && (await roleOf(tn.pending)) === 'pending' && (await roleOf(tn.coordinator)) === 'coordinator' && (await roleOf(tn.guru)) === 'guru');
  { // tryAs leaves nothing behind
    await tryAs('authenticated', tn.coordinator, 'select 1/0');
    const [s] = await asOwner(`select current_user as u, coalesce(current_setting('request.jwt.claim.sub', true), '') as sub`);
    check('test net: a rolled-back try leaves the owner signed out', s.sub === '' && s.u !== 'authenticated', JSON.stringify(s));
  }

  // D14-01: parents' contact data, consent records, call notes and the logs. Since 0034 (D4-06) a
  // coordinator reads none of them straight from the table (only through the logging functions);
  // the Guru reads guardians, consents, call_logs and access_log, and the audit log only through
  // get_audit_log.
  for (const rel of ['guardians', 'consents', 'call_logs', 'audit_log', 'access_log']) {
    const [{ n: total }] = await asOwner(`select count(*)::int as n from ${rel}`);
    const seen = {};
    for (const who of ['student', 'pending', 'coordinator', 'guru']) seen[who] = await rowsAs(tn[who], `select 1 from ${rel}`);
    check(`D14-01: a student and a pending login read no ${rel} row`, total > 0 && seen.student === 0 && seen.pending === 0,
      `${total} rows; ${JSON.stringify(seen)}`);
    if (rel === 'audit_log') {
      check('D14-01: nobody reads audit_log straight from the table, the Guru neither (0034: get_audit_log)', seen.coordinator === 0 && seen.guru === 0,
        `${total} rows; ${JSON.stringify(seen)}`);
    } else {
      check(`D14-01: a coordinator reads no ${rel} row from the table; the Guru reads them all (0034)`, seen.coordinator === 0 && seen.guru === total,
        `${total} rows; ${JSON.stringify(seen)}`);
    }
  }

  // D14-03 / D12a-18: the function sweep. anon may run no function of ours, signed-in people only
  // the ones on this list. A new function that the app calls goes on the list in the same change
  // (and is revoked from anon); an internal one is revoked from authenticated too (CONTRIBUTING.md).
  // 0036 (#163): the sign-up form's public lists (active centres' name, city, country; gender options).
  const ANON_MAY_RUN = ['sign_up_choices()'];
  const SIGNED_IN_MAY_RUN = [
    'announcement_file_deletable(text)', 'announcement_file_path_ok(text)', 'announcement_file_readable(text)',
    'announcement_file_uploadable(text)', 'assessment_clean_file(jsonb,text[],boolean)', 'assessment_clean_link(text)',
    'assessment_file_deletable(text)', 'assessment_file_kind(text)', 'assessment_file_readable(text)',
    'assessment_file_uploadable(text)', 'audience_profiles(text,smallint,bigint,uuid)',
    'check_inventory_item(bigint,text,text)', 'check_out_all(smallint)', 'class_report(date,date,uuid)',
    'clean_audience(text,smallint,bigint)', 'coordinator_dashboard()', 'decide_fund_entry(bigint,boolean,text)',
    'decide_material_suggestion(bigint,boolean,text)', 'decide_promotion(bigint,text,text,date)',
    'delete_practice(bigint)', 'erase_student(uuid,text,text)', 'event_counts(bigint[])', 'event_people_list(bigint)',
    'event_student_list(bigint,boolean)', 'event_visible_to(bigint,uuid)', 'fund_balance()',
    'fund_bill_deletable(text)', 'fund_bill_readable(text)', 'fund_bill_uploadable(text)',
    'give_promotion_feedback(bigint,text,text)', 'guru_dashboard()', 'has_class_role()', 'ig_audio_path_ok(text)',
    'ig_audio_readable(text)', 'ig_audio_uploadable(text)', 'ig_block_subscriber(uuid,boolean,text)',
    'ig_confirm_parent(text)', 'ig_join(integer,text,boolean,text,text,text,text)', 'ig_leave()', 'ig_my_state()',
    'ig_reader()', 'ig_send_parent_code()', 'ig_sloka_of_day(date)', 'ig_subscriber_list()',
    'ig_subscriber_weeks(integer)', 'import_students(jsonb)', 'inbox_unread_count()', 'is_fund_keeper()', 'is_guru()',
    'is_ig_editor()', 'is_minor(students)', 'is_public_subscriber(uuid)', 'is_staff()', 'is_treasurer()',
    'issue_inventory_item(bigint,uuid,uuid,text,text,date)', 'link_student_login(uuid,uuid)',
    'log_call(uuid,call_outcome,text,text,date)',
    'log_practice(integer,text,date,timestamp with time zone,bigint,text)', 'mark_assessment_seen(bigint)',
    'mark_event_attendance(bigint,uuid[])', 'mark_notifications_read(bigint[])', 'mark_visit(uuid,text,text,jsonb)',
    'material_file_deletable(text)', 'material_file_readable(text)', 'material_file_uploadable(text)',
    'move_syllabus_item(bigint,boolean)', 'my_role()', 'my_student_id()', 'next_level(smallint)',
    'nominate_for_promotion(uuid,text,uuid[])', 'poll_is_closed(timestamp with time zone,timestamp with time zone)',
    'poll_state(bigint[])', 'poll_voters(bigint)', 'practice_weeks(uuid,integer)', 'promotion_criteria(uuid)',
    'promotion_home()', 'promotion_ready_students()', 'reassign_mentees(uuid[],uuid)',
    'record_fund_entry(text,smallint,date,bigint,text,text,text,text,text)', 'register_push_token(text,text)',
    'register_student(text,date,text,text,text,text,smallint,uuid,text,text,text,text,text,boolean,boolean,uuid,text)',
    'release_assessment(bigint,uuid[],date,text)', 'remind_assessment(bigint[])', 'remind_event(bigint)',
    'remind_poll(bigint)', 'return_inventory_item(bigint,text,text)', 'reverse_fund_entry(bigint,text)',
    'review_submission(bigint,integer[],text,text,boolean,jsonb)', 'rsvp_event(bigint,text)',
    'save_duty_shift(bigint,smallint,date,time without time zone,time without time zone,text,uuid[],integer)',
    'save_settings(jsonb)', 'scan_qr(uuid,text,jsonb)', 'set_event_performers(bigint,jsonb)',
    'set_theme_slokas(bigint,bigint[])', 'setting_int(text)', 'staff_name_taken(uuid,text)', 'staff_names()',
    'student_home()', 'submit_assessment(bigint,jsonb,text,text)', 'syllabus_item_counts()', 'today_ist()',
    'toggle_visit(uuid,visit_method,text,jsonb)', 'unlink_student_login(uuid)', 'video_link_ok(text)',
    'vote_poll(bigint,integer)', 'week_start_ist()', 'withdraw_consent(uuid,text)', 'withdraw_fund_entry(bigint,text)',
    'withdraw_nomination(bigint)', 'youtube_link_ok(text)',
    // 0033: a centre's own time zone and formats
    'centre_today(integer)', 'centre_tz(integer)', 'local_day(timestamp with time zone,integer)', 'my_centre_locale()', 'my_time_zone()',
    // 0034: logged reads of parents' details, consents, call notes and the audit log
    'call_outcomes(timestamp with time zone,timestamp with time zone)', 'get_audit_log(text,uuid,text,timestamp with time zone,bigint,integer)',
    'get_call_notes(uuid,integer)', 'get_consents(uuid)', 'get_guardians(uuid)',
    // 0035: asset labels and stocktake (staff only inside; DECISIONS #161)
    'finish_stocktake(bigint,text)', 'mark_labels_printed(bigint[])', 'resolve_asset(text)', 'start_stocktake(smallint)',
    'stocktake_see(bigint,text,bigint)',
    // 0036: account creation, About you, the desk, the report; option_ok for the guard triggers
    'heard_about_report(date,date)', 'my_about()', 'option_ok(text,text,boolean)', 'save_about_me(jsonb)',
    'save_student_details(uuid,jsonb)', 'sign_up_choices()', 'waiting_sign_ups()', 'get_student_details(uuid)',
    // 0039: the staff student search by POST (ENT-08)
    'search_students(text,integer,boolean)',
  ];
  const runnableBy = async (role) => (await asOwner(`select p.oid::regprocedure::text as f from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
      and has_function_privilege('${role}', p.oid, 'execute') order by 1`)).map((r) => r.f);
  const diffList = (got, allowed) => {
    const extra = got.filter((f) => !allowed.includes(f));
    const missing = allowed.filter((f) => !got.includes(f));
    return { ok: extra.length === 0 && missing.length === 0, detail: `open but not on the list: ${extra.join(' ') || '-'}; on the list but closed or gone: ${missing.join(' ') || '-'}` };
  };
  const anonRuns = diffList(await runnableBy('anon'), ANON_MAY_RUN);
  check('D14-03: anon may run exactly the functions on its allow-list (sign_up_choices only), trigger functions included', anonRuns.ok, anonRuns.detail);
  // 0037 closed 0001's six trigger functions (assign_roll_no, audit_row, ...) too: no exception left.
  const signedInRuns = diffList(await runnableBy('authenticated'), SIGNED_IN_MAY_RUN);
  check('D14-03: signed-in people may run exactly the functions on the allow-list, trigger functions included', signedInRuns.ok, signedInRuns.detail);
  const directTrigger = await tryAs('authenticated', tn.student, 'select audit_row()');
  check('D14-03: ... and a trigger function cannot be called directly (brief 12 leftover, 0037)', directTrigger.error === 'permission denied for function audit_row',
    directTrigger.error ?? 'was allowed');  const definerNoPath = await asOwner(`select p.oid::regprocedure::text as f from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
  check('D14-03: every security definer function fixes its search_path', definerNoPath.length === 0, definerNoPath.map((r) => r.f).join(' '));
  const noRls = await asOwner(`select relname from pg_class where relnamespace = 'public'::regnamespace
    and relkind in ('r', 'p') and not relrowsecurity order by 1`);
  check('D14-03: every public table has row-level security on', noRls.length === 0, noRls.map((r) => r.relname).join(' '));
  const definerViews = await asOwner(`select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'v'
    and not coalesce('security_invoker=true' = any (reloptions), false) order by 1`);
  check('D14-03: every public view runs with the reader\'s rights (security_invoker)', definerViews.length === 0,
    definerViews.map((r) => r.relname).join(' '));
  { // D12a-18: the role helpers the policies stand on, for a switched-off coordinator (active = false).
    const helpers = `select my_role()::text as role, is_staff() as staff, is_guru() as guru, has_class_role() as cls`;
    const offId = await signUp('switched.off.tn@example.com', true);
    await asApp('authenticated', tn.guru, `update profiles set role = 'coordinator' where id = $1`, [offId]);
    const on = (await asApp('authenticated', offId, helpers))[0];
    await asApp('authenticated', tn.guru, `update profiles set active = false where id = $1`, [offId]);
    const off = (await asApp('authenticated', offId, helpers))[0];
    check('D12a-18: (control) an active coordinator is staff', on.role === 'coordinator' && on.staff === true && on.guru === false, JSON.stringify(on));
    check('D12a-18: switched off, my_role() is null and every helper says no', off.role === null && off.staff === false
      && off.guru === false && off.cls === false, JSON.stringify(off));
    check('D12a-18: ... so the switched-off login reads no student and no settings',
      (await rowsAs(offId, 'select 1 from students')) === 0 && (await rowsAs(offId, 'select 1 from settings')) === 0);
  }

  // D14-06: student-side isolation. For every table and view with a student_id or profile_id column,
  // a student sees only their own rows and changes none of anybody else's. A table or view whose
  // other people's rows a student may see on purpose is listed here with the reason.
  const STUDENT_MAY_SEE_OTHERS = {}; // none today: replies are private, rosters and votes are staff-only
  // Rows of other people in the two tables the earlier sections leave without any.
  await asOwner(`insert into practice_logs (student_id, practised_on, minutes, source) values ('${child.id}', today_ist(), 20, 'manual')`);
  await asOwner(`insert into announcement_reads (announcement_id, profile_id)
    select id, '${tn.coordinator}' from announcements order by id limit 1 on conflict do nothing`);
  const linkedCols = await asOwner(`select c.table_name as rel, c.column_name as col, t.table_type as kind
    from information_schema.columns c join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name in ('student_id', 'profile_id') order by 1, 2`);
  const others = (col) => (col === 'student_id' ? `student_id is distinct from '${tn.studentId}'` : `profile_id is distinct from '${tn.student}'`);
  const leaks = [];
  const writes = [];
  const withOthers = [];
  for (const { rel, col, kind } of linkedCols) {
    const [{ n }] = await asOwner(`select count(*)::int as n from public.${rel} where ${others(col)}`);
    if (n > 0) withOthers.push(rel);
    if (!STUDENT_MAY_SEE_OTHERS[`${rel}.${col}`]) {
      const seen = await rowsAs(tn.student, `select 1 from public.${rel} where ${others(col)}`);
      if (seen > 0) leaks.push(`${rel}.${col}:${seen}/${n}`);
    }
    if (kind !== 'BASE TABLE') continue;
    for (const sql of [`update public.${rel} set ${col} = ${col} where ${others(col)} returning 1`,
      `delete from public.${rel} where ${others(col)} returning 1`]) {
      const r = await tryAs('authenticated', tn.student, sql);
      if (passedPolicy(r) > 0) writes.push(`${sql.split(' ')[0]} ${rel}.${col}:${passedPolicy(r)}`);
    }
  }
  check(`D14-06: a student sees no one else's row in the ${linkedCols.length} student-linked columns`, leaks.length === 0, leaks.join(' '));
  check('D14-06: ... and can change or delete none of them', writes.length === 0, writes.join(' '));
  const mustHaveOthers = ['visits', 'follow_up_tasks', 'status_history', 'announcement_reads', 'group_members', 'call_logs',
    'guardians', 'consents', 'student_progress', 'practice_logs', 'assessment_assignments', 'notifications'];
  const noOthers = mustHaveOthers.filter((rel) => !withOthers.includes(rel));
  check('D14-06: (control) other students\' rows exist in the tables the loop must hide', noOthers.length === 0, `empty: ${noOthers.join(' ')}`);

  // D14-07: write-side policies. The sweep tries a no-op UPDATE and a DELETE on every table as each
  // role, in a transaction that is rolled back, and counts the rows the database let through.
  const baseTables = (await asOwner(`select c.relname as rel,
      (select a.attname from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
         and a.attidentity = '' and a.attgenerated = '' order by a.attnum limit 1) as col,
      exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'profile_id') as has_profile,
      exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'student_id') as has_student
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') order by 1`));
  /** The rows `userId` could UPDATE (no-op) and DELETE in each table, leaving out their own rows. */
  async function writableBy(userId, onlyTables = null) {
    const hits = [];
    for (const { rel, col, has_profile: hasProfile } of baseTables) {
      if (onlyTables && !onlyTables.includes(rel)) continue;
      const notOwn = rel === 'profiles' ? `id <> '${userId}'` : hasProfile ? `profile_id is distinct from '${userId}'` : 'true';
      for (const sql of [`update public.${rel} set ${col} = ${col} where ${notOwn} returning 1`, `delete from public.${rel} where ${notOwn} returning 1`]) {
        const r = await tryAs('authenticated', userId, sql);
        if (passedPolicy(r) > 0) hits.push(`${sql.split(' ')[0]} ${rel}:${passedPolicy(r)}`);
      }
    }
    return hits;
  }
  const pendingWrites = await writableBy(tn.pending);
  check(`D14-07: a pending login changes or deletes no row in any of the ${baseTables.length} tables (own profile aside)`,
    pendingWrites.length === 0, pendingWrites.join(' '));
  const studentWrites = await writableBy(tn.student);
  check('D14-07: a student changes or deletes no row in any table (own profile, tokens and Ishtagoshti rows aside)',
    studentWrites.length === 0, studentWrites.join(' '));
  // Tables whose every write policy asks for the Guru (or an Ishtagoshti editor); profiles: only
  // your own, or the Guru. A coordinator changes nothing in them.
  const GURU_ONLY = ['settings', 'syllabus_items', 'level_history', 'levels', 'centres', 'taals', 'inventory_items', 'fund_categories',
    'duty_shifts', 'duty_assignments', 'assessments', 'audit_log', 'profiles', 'status_history', 'call_logs', 'fund_entries',
    'poll_votes', 'event_rsvps', 'promotion_nominations', 'promotion_feedback', 'push_queue', 'push_outbox',
    'guardians', 'access_log']; // 0034: a coordinator adds a guardian, the Guru edits; nobody writes access_log
  const coordinatorWrites = await writableBy(tn.coordinator, GURU_ONLY);
  check('D14-07: a coordinator changes or deletes nothing in the Guru-only tables (settings, syllabus, levels, roster, ...)',
    coordinatorWrites.length === 0, coordinatorWrites.join(' '));
  const coordDeletes = [];
  for (const rel of ['students', 'consents', 'announcement_replies', 'materials']) {
    const r = await tryAs('authenticated', tn.coordinator, `delete from public.${rel} where ${rel === 'materials' ? `uploaded_by is distinct from '${tn.coordinator}'` : 'true'} returning 1`);
    if (passedPolicy(r) > 0) coordDeletes.push(`${rel}:${passedPolicy(r)}`);
  }
  check('D14-07: a coordinator deletes no student, consent, reply or approved material (Guru only)', coordDeletes.length === 0, coordDeletes.join(' '));
  // The positive side: the role a policy is written for can still write (a no-op update, rolled back).
  const positive = [];
  for (const [who, rels] of [['guru', ['settings', 'syllabus_items', 'levels', 'centres', 'taals', 'fund_categories', 'students', 'profiles', 'materials',
    'guardians', 'consents']], // 0034: guardians and consents moved from coordinator to Guru (no coordinator SELECT)
    ['coordinator', ['students', 'follow_up_tasks', 'student_progress', 'visits', 'groups', 'group_members']]]) {
    for (const rel of rels) {
      const { col } = baseTables.find((t) => t.rel === rel);
      const r = await tryAs('authenticated', tn[who], `update public.${rel} set ${col} = ${col} returning 1`);
      if (!(r.rows > 0)) positive.push(`${who} ${rel}: ${r.error ?? '0 rows'}`);
    }
  }
  check('D14-07: (control) the Guru and staff can still write where their policies allow', positive.length === 0, positive.join(' | '));
  // Inserts are not swept (every table needs its own columns): the ones the audit named, by hand.
  const childId = child.id;
  for (const [name, who, sql, msg] of [
    ['a student cannot write their own level history', 'student', `insert into level_history (student_id, from_level, to_level) values ('${tn.studentId}', 1, 2)`, 'new row violates row-level security policy for table "level_history"'],
    ['a coordinator cannot write level history either (Guru only)', 'coordinator', `insert into level_history (student_id, from_level, to_level) values ('${tn.studentId}', 1, 2)`, 'new row violates row-level security policy for table "level_history"'],
    ['a coordinator cannot add a level (Guru only)', 'coordinator', `insert into levels (id, name, sort) values (9, 'TN Probe', 9)`, 'new row violates row-level security policy for table "levels"'],
    ['a student cannot add a guardian', 'student', `insert into guardians (student_id, full_name) values ('${childId}', 'Not A Parent')`, 'new row violates row-level security policy for table "guardians"'],
    ['a student cannot add a consent', 'student', `insert into consents (student_id, scope, signed_form) values ('${tn.studentId}', 'photo', true)`, 'new row violates row-level security policy for table "consents"'],
    ['a student cannot give themselves a follow-up task', 'student', `insert into follow_up_tasks (student_id, kind, due_on) values ('${tn.studentId}', 'call', today_ist())`, 'new row violates row-level security policy for table "follow_up_tasks"'],
    ['a pending login cannot add a student', 'pending', `insert into students (full_name, dob) values ('Pending Adds', '1990-01-01')`, 'new row violates row-level security policy for table "students"'],
  ]) {
    const r = await tryAs('authenticated', tn[who], sql);
    check(`D14-07: ${name}`, r.error === msg, r.error ?? `was allowed (${r.rows})`);
  }

  // D14-08: the roll number is frozen, a status change leaves one history row, an edit one audit row
  // naming who made it.
  const tnStudent = await r10Student('TN Trigger Probe');
  await refusesWith('D14-08: a coordinator cannot change a roll number', 'roll_no is frozen once issued', () =>
    asApp('authenticated', tn.coordinator, `update students set roll_no = 'MS-2026-9999' where id = $1`, [tnStudent]));
  await refusesWith('D14-08: ... nor can the dashboard', 'roll_no is frozen once issued', () =>
    asOwner(`update students set roll_no = 'MS-2026-9999' where id = '${tnStudent}'`));
  const auditCount = async (table, rowId) => (await asOwner(`select count(*)::int as n from audit_log
    where table_name = '${table}' and row_id = '${rowId}' and action = 'UPDATE' and changed_by = '${tn.coordinator}'`))[0].n;
  await asApp('authenticated', tn.coordinator, `update students set status = 'active' where id = $1`, [tnStudent]);
  const tnHistory = await asOwner(`select from_status::text as f, to_status::text as t, changed_by from status_history where student_id = '${tnStudent}'`);
  check('D14-08: new -> active writes one status_history row naming the coordinator', tnHistory.length === 1
    && tnHistory[0].f === 'new' && tnHistory[0].t === 'active' && tnHistory[0].changed_by === tn.coordinator, JSON.stringify(tnHistory));
  check('D14-08: ... and one audit_log row for the student, by the coordinator', (await auditCount('students', tnStudent)) === 1);
  await asApp('authenticated', tn.coordinator, `update students set area = 'Koti' where id = $1`, [tnStudent]);
  check('D14-08: an edit with no status change adds an audit row and no history row', (await auditCount('students', tnStudent)) === 2
    && (await asOwner(`select count(*)::int as n from status_history where student_id = '${tnStudent}'`))[0].n === 1);
  await asApp('authenticated', tn.coordinator, `update profiles set language = 'hi' where id = $1`, [tn.coordinator]);
  check('D1a-13: a profile edit that only switches the language is not audited (0037)', (await auditCount('profiles', tn.coordinator)) === 0);
  await asApp('authenticated', tn.coordinator, `update profiles set full_name = 'Coordinator Tn' where id = $1`, [tn.coordinator]);
  check('D14-08: a profile edit is audited with who made it', (await auditCount('profiles', tn.coordinator)) === 1);
  const [{ n: loginAudit }] = await asOwner(`select count(*)::int as n from audit_log where table_name = 'profiles'
    and row_id = '${tn.coordinator}' and action = 'INSERT' and new_row ->> 'email' is not null`);
  check('D1a-13: a new login is audited when it appears, with its email (0037)', loginAudit === 1, String(loginAudit));
  const tnCall = await logCall(tn.coordinator, { p_student: tnStudent, p_outcome: 'not_reachable', p_reason: null, p_comment: 'Test net call' });
  const [{ n: callAudit }] = await asOwner(`select count(*)::int as n from audit_log where table_name = 'call_logs'
    and row_id = '${tnCall}' and action = 'INSERT' and changed_by = '${tn.coordinator}'`);
  check('D14-08: a logged call is audited with who logged it', callAudit === 1, String(callAudit));
  await asOwner(`delete from students where id = '${tnStudent}'`);

  // D14-05: the two daily jobs on fixed cases (replaces the old "daily jobs run" check, which could
  // not fail). irregular_days = 14 and inactive_days = 30 (seed); the D5-01 / D5-16 checks above
  // cover the ended pause and the escalation.
  const tnVisitAgo = (id, days) => asOwner(`insert into visits (student_id, check_in, check_out, method)
    values ('${id}', ((today_ist() - ${days}) + time '17:00') at time zone 'Asia/Kolkata',
            ((today_ist() - ${days}) + time '18:00') at time zone 'Asia/Kolkata', 'manual')`);
  const tnCases = {};
  for (const [name, status, days] of [['13', 'active', 13], ['14', 'active', 14], ['29', 'irregular', 29], ['30', 'irregular', 30]]) {
    tnCases[name] = await r10Student(`TN Daily ${name}`, { status: `'${status}'` });
    await tnVisitAgo(tnCases[name], days);
  }
  await asOwner(`insert into follow_up_tasks (student_id, assignee_id, kind, due_on) values ('${tnCases['30']}', '${tn.coordinator}', 'call', today_ist())`);
  tnCases.open = await r10Student('TN Daily Open Visit', { status: `'active'` });
  tnCases.late = await r10Student('TN Daily Late Visit', { status: `'active'` });
  const [tnOpen] = await asOwner(`insert into visits (student_id, check_in, method, centre_id)
    values ('${tnCases.open}', ((today_ist() - 1) + time '16:00') at time zone 'Asia/Kolkata', 'manual', 1) returning id`);
  const [tnLate] = await asOwner(`insert into visits (student_id, check_in, method, centre_id)
    values ('${tnCases.late}', ((today_ist() - 2) + time '20:30') at time zone 'Asia/Kolkata', 'manual', 1) returning id`);
  await asOwner('select refresh_student_statuses()');
  await asOwner('select close_open_visits()');
  const tnStatus = async (k) => (await statusOf(tnCases[k])).status;
  check('D14-05: last visit 13 days ago stays Active', (await tnStatus('13')) === 'active', await tnStatus('13'));
  check('D14-05: 14 days ago turns Irregular', (await tnStatus('14')) === 'irregular', await tnStatus('14'));
  const tnTasks14 = await openTasksOf(tnCases['14']);
  check('D14-05: ... with one call task for the mentor, due after call_due_days', tnTasks14.length === 1 && tnTasks14[0].kind === 'call'
    && tnTasks14[0].assignee_id === tn.coordinator && tnTasks14[0].due_on === (await asOwner(
      `select (today_ist() + setting_int('call_due_days'))::text as d`))[0].d, JSON.stringify(tnTasks14));
  check('D14-05: Active at 13 days gets no task', (await openTasksOf(tnCases['13'])).length === 0);
  check('D14-05: Irregular, 29 days ago stays Irregular', (await tnStatus('29')) === 'irregular', await tnStatus('29'));
  check('D14-05: 30 days ago turns Inactive', (await tnStatus('30')) === 'inactive', await tnStatus('30'));
  check('D14-05: ... and its due task is escalated to the Guru', (await openTasksOf(tnCases['30']))[0]?.escalated === true);
  const tnClosed = (await asOwner(`select v.id,
      v.check_out = ((v.check_in at time zone 'Asia/Kolkata')::date + c.closes_at) at time zone 'Asia/Kolkata' as at_closing,
      v.check_out = v.check_in + interval '1 minute' as one_minute
    from visits v join centres c on c.id = v.centre_id where v.id in ('${tnOpen.id}', '${tnLate.id}')`));
  const tnVisit = (id) => tnClosed.find((r) => r.id === id) ?? {};
  check('D14-05: a visit left open yesterday is closed at the centre\'s closing time', tnVisit(tnOpen.id).at_closing === true, JSON.stringify(tnClosed));
  check('D14-05: a check-in after closing time is closed one minute later', tnVisit(tnLate.id).one_minute === true, JSON.stringify(tnClosed));
  check('D14-05: no visit is left open after the night job', (await asOwner(`select count(*)::int as n from visits v join centres c on c.id = v.centre_id
    where v.check_out is null and v.check_in < (today_ist() + time '00:00') at time zone 'Asia/Kolkata'`))[0].n === 0);
  await asOwner(`delete from students where id in (${Object.values(tnCases).map((id) => `'${id}'`).join(', ')})`);

  // D14-12: pg_cron is imitated, so a scheduled command is never run here. At least every job must
  // have a five-field schedule and call a function that exists (EXPLAIN plans it without running it).
  const cronJobs = await asOwner('select jobname, schedule, command from cron.job order by jobname');
  const badJobs = [];
  for (const { jobname, schedule, command } of cronJobs) {
    if (!/^(\S+\s+){4}\S+$/.test(schedule)) badJobs.push(`${jobname}: schedule '${schedule}'`);
    try { await asOwner(`explain ${command}`); } catch (e) { badJobs.push(`${jobname}: ${e.message}`); }
  }
  check(`D14-12: the ${cronJobs.length} pg_cron jobs have a valid schedule and call existing functions`, cronJobs.length >= 7 && badJobs.length === 0,
    badJobs.join(' | ') || cronJobs.map((j) => j.jobname).join(' '));
}
// ================================================================ end of test net (audit brief 12)
// ---------------------------------------------------------------- asset labels and stocktake (0035)
// Every item has a frozen, unguessable label token and a per-centre code; the token finds the item
// only for staff of its centre; a count lists what was not seen. nyCentre / nyStaff come from 0033.
{
  const tokenFormat = /^[A-Za-z0-9_-]{22}$/;
  const existing = await asOwner('select id, code, asset_token from inventory_items order by id');
  check('0035: every item has a code and a token', existing.length > 0
    && existing.every((r) => /^[A-Z]{3,4}-\d{3,}$/.test(r.code) && tokenFormat.test(r.asset_token)), JSON.stringify(existing));
  check('0035: tokens are all different', new Set(existing.map((r) => r.asset_token)).size === existing.length);
  const add = async (label, kind, centre = 1) => (await asApp('authenticated', guru,
    `insert into inventory_items (kind, label, centre_id, category, asset_token, code) values ($1, $2, $3, $4, 'AAAAAAAAAAAAAAAAAAAAAA', 'X-1') returning *`,
    [kind, label, centre, '  Mixer  ']))[0];
  const harmonium = await add('Harmonium 1', 'harmonium');
  const speaker = await add('Speaker left', 'sound');
  const speaker2 = await add('Speaker right', 'sound');
  check('0035: new kinds are accepted; the database sets the code and token, not the app', harmonium.code === 'HARM-001'
    && speaker.code === 'SND-001' && speaker2.code === 'SND-002' && harmonium.asset_token !== 'AAAAAAAAAAAAAAAAAAAAAA'
    && tokenFormat.test(harmonium.asset_token) && harmonium.category === 'Mixer', JSON.stringify([harmonium.code, speaker2.code, harmonium.category]));
  const kholBefore = (await asOwner(`select coalesce(max(split_part(code, '-', 2)::int), 0) as n from inventory_items where centre_id = 1 and code like 'KHOL-%'`))[0].n;
  const drum = await add('Tilak red 2', 'fibreglass');
  check('0035: the four mridanga kinds share KHOL numbering', drum.code === `KHOL-${String(kholBefore + 1).padStart(3, '0')}`, drum.code);
  await refusesWith('0035: the token is frozen for app users', 'asset_locked', () => asApp('authenticated', guru,
    `update inventory_items set asset_token = 'BBBBBBBBBBBBBBBBBBBBBB' where id = $1`, [harmonium.id]));
  await refusesWith('0035: the code is frozen for app users', 'asset_locked', () => asApp('authenticated', guru,
    `update inventory_items set code = 'HARM-099' where id = $1`, [harmonium.id]));
  await asApp('authenticated', guru, `update inventory_items set kind = 'instrument' where id = $1`, [harmonium.id]);
  check('0035: a kind correction keeps the printed code', (await asOwner(`select code from inventory_items where id = ${harmonium.id}`))[0].code === 'HARM-001');
  await refusesWith('0035: a category is at most 40 characters', 'category_too_long', () => asApp('authenticated', guru,
    `update inventory_items set category = repeat('a', 41) where id = $1`, [harmonium.id]));
  await refusesWith('0035: a kind outside the list is still refused', /violates check constraint "inventory_items_kind_check"/, () => add('Tanpura', 'tanpura'));
  const nyBook = await add('Gita 1', 'book', nyCentre.id);
  check('0035: codes count per centre', nyBook.code === 'BOOK-001');

  const resolve = (userId, token) => asApp('authenticated', userId, 'select resolve_asset($1) as r', [token]).then((rows) => rows[0].r);
  check('0035: a coordinator resolves a label of their centre', (await resolve(coordinator, speaker.asset_token)).id == speaker.id);
  check('0035: an unknown token says unknown', (await resolve(coordinator, 'zzzzzzzzzzzzzzzzzzzzzz')).result === 'unknown'
    && (await resolve(coordinator, "x' or 1=1 --")).result === 'unknown');
  const other = await resolve(nyStaff, speaker.asset_token);
  check('0035: another centre\'s coordinator is refused with the centre named', other.result === 'other_centre' && !('id' in other), JSON.stringify(other));
  check('0035: the Guru resolves every centre', (await resolve(guru, nyBook.asset_token)).result === 'ok');
  await refusesWith('0035: a student cannot resolve a token', 'not_allowed', () => resolve(late, speaker.asset_token));
  await refusesWith('0035: anon cannot resolve a token', 'permission denied for function resolve_asset', () => asApp('anon', null, 'select resolve_asset($1)', [speaker.asset_token]));
  await refusesWith('0035: anon cannot read items by token', 'permission denied for table inventory_items', () => asApp('anon', null, 'select id from inventory_items where asset_token = $1', [speaker.asset_token]));
  check('0035: a student does not find an item by its token', (await asApp('authenticated', arjun,
    'select id from inventory_items where asset_token = $1', [speaker.asset_token])).length === 0);
  await refusesWith('0035: nobody in the app reads the code counters', 'permission denied for table inventory_code_counters', () => asApp('authenticated', guru, 'select * from inventory_code_counters'));

  check('0035: staff mark labels printed, only their centre\'s', (await asApp('authenticated', coordinator,
    'select mark_labels_printed($1::bigint[]) as n', [[speaker.id, nyBook.id]]))[0].n === 1
    && (await asOwner(`select labelled_at is not null as ok from inventory_items where id = ${nyBook.id}`))[0].ok === false);
  await asOwner(`update inventory_items set centre_id = ${nyCentre.id} where id = ${speaker2.id}`);
  const moved = (await asOwner(`select code, labelled_at, asset_token from inventory_items where id = ${speaker2.id}`))[0];
  check('0035: a move to another centre gives a code there and keeps the token', moved.code === 'SND-001'
    && moved.asset_token === speaker2.asset_token && moved.labelled_at === null, JSON.stringify(moved));
  await asOwner(`update inventory_items set centre_id = 1 where id = ${speaker2.id}`);

  // Stocktake at centre 1: seen by scan and tap, one lent out, the rest missing.
  await refusesWith('0035: a student cannot start a count', 'not_allowed', () => asApp('authenticated', late, 'select start_stocktake(1::smallint)'));
  await refusesWith('0035: a coordinator cannot count another centre', 'not_allowed', () => asApp('authenticated', nyStaff, 'select start_stocktake(1::smallint)'));
  const [{ id: st }] = await asApp('authenticated', coordinator, 'select start_stocktake(1::smallint) as id');
  check('0035: a second person joins the open count', Number((await asApp('authenticated', guru, 'select start_stocktake(1::smallint) as id'))[0].id) === Number(st));
  const see = (userId, token, item = null) => asApp('authenticated', userId, 'select stocktake_see($1, $2, $3) as r', [st, token, item]).then((rows) => rows[0].r);
  check('0035: a scan marks an item seen, a second scan says already', (await see(coordinator, speaker.asset_token)).result === 'seen'
    && (await see(guru, speaker.asset_token)).result === 'already');
  check('0035: a tap marks one seen too', (await see(coordinator, null, harmonium.id)).result === 'seen');
  check('0035: another centre\'s item is not counted', (await see(coordinator, nyBook.asset_token)).result === 'other_centre');
  check('0035: an unknown label is not counted', (await see(coordinator, 'zzzzzzzzzzzzzzzzzzzzzz')).result === 'unknown');
  await refusesWith('0035: a coordinator of another centre cannot mark in this count', 'not_allowed', () => see(nyStaff, speaker2.asset_token));
  await refusesWith('0035: the app cannot write a count itself', 'permission denied for table inventory_stocktake_items', () => asApp('authenticated', coordinator,
    `insert into inventory_stocktake_items (stocktake_id, item_id, how, seen_by) values ($1, $2, 'tap', auth.uid())`, [st, drum.id]));
  const [{ id: drumLoan }] = await asApp('authenticated', coordinator, 'select issue_inventory_item($1, $2, null, $3) as id', [drum.id, lateStudent, 'good']);
  const [expected] = await asOwner(`select count(*)::int as n, count(*) filter (where exists (select 1 from inventory_loans l
    where l.item_id = i.id and l.returned_at is null))::int as out from inventory_items i where centre_id = 1 and retired_at is null`);
  const [{ r: summary }] = await asApp('authenticated', coordinator, `select finish_stocktake($1, ' Shelf A done ') as r`, [st]);
  const missingIds = summary.missing.map((m) => Number(m.id));
  const lentDrum = summary.lent.find((l) => Number(l.id) === Number(drum.id));
  check('0035: the count saves expected / seen / lent / missing', summary.expected === expected.n && summary.seen === 2
    && summary.lent.length === expected.out && lentDrum?.holder && summary.missing.length === expected.n - 2 - expected.out
    && missingIds.includes(Number(speaker2.id)) && !missingIds.includes(Number(drum.id)),
    JSON.stringify({ e: summary.expected, s: summary.seen, l: summary.lent.length, m: summary.missing.length, out: expected.out }));
  const [saved] = await asApp('authenticated', guru, 'select finished_by, note, expected, seen, lent, missing from inventory_stocktakes where id = $1', [st]);
  check('0035: ... with who finished it and the note', saved.finished_by === coordinator && saved.note === 'Shelf A done'
    && saved.seen === 2 && saved.lent === expected.out && saved.missing === expected.n - 2 - expected.out, JSON.stringify(saved));
  await refusesWith('0035: a finished count is closed', 'stocktake_closed', () => see(coordinator, speaker2.asset_token));
  check('0035: a finished count cannot be deleted', (await asApp('authenticated', guru, 'delete from inventory_stocktakes where id = $1 returning id', [st])).length === 0);
  check('0035: a student reads no counts', (await asApp('authenticated', late, 'select id from inventory_stocktakes')).length === 0
    && (await asApp('authenticated', late, 'select item_id from inventory_stocktake_items')).length === 0);
  check('0035: counts are audited', (await asOwner(`select count(*)::int as n from audit_log where table_name = 'inventory_stocktakes' and row_id = '${st}'`))[0].n >= 2);
  const [{ id: st2 }] = await asApp('authenticated', guru, 'select start_stocktake(1::smallint) as id');
  check('0035: the Guru may delete an open count', (await asApp('authenticated', guru, 'delete from inventory_stocktakes where id = $1 returning id', [st2])).length === 1);
  check('0035: helpers are closed to app roles; the app functions are open to signed-in people only', (await asOwner(`select
    not has_function_privilege('authenticated', 'inventory_next_code(smallint,text)', 'execute')
    and not has_function_privilege('authenticated', 'inventory_centre_ok(smallint)', 'execute')
    and not has_function_privilege('anon', 'stocktake_see(bigint,text,bigint)', 'execute')
    and has_function_privilege('authenticated', 'finish_stocktake(bigint,text)', 'execute') as ok`))[0].ok === true);
  // Clean up so the counts below stay as they were.
  await asApp('authenticated', coordinator, `select return_inventory_item($1, 'good')`, [drumLoan]);
}

// ---------------------------------------------------------------- 0037 database and performance backlog
{
  // D9-01: every policy calls its helpers as (select f()), so they run once per statement.
  const HELPERS = 'is_staff|is_guru|my_role|my_student_id|has_class_role|is_ig_editor|ig_reader|today_ist|is_treasurer|is_fund_keeper';
  const bare = new RegExp(`(?<!SELECT )\\b(?:${HELPERS})\\(\\)|(?<!SELECT )auth\\.uid\\(\\)`);
  const pols = await asOwner(`select schemaname || '.' || tablename || '.' || policyname as p, coalesce(qual, '') || ' ' || coalesce(with_check, '') as e
    from pg_policies where schemaname in ('public', 'storage')`);
  const unwrapped = pols.filter((r) => bare.test(r.e)).map((r) => r.p);
  check('D9-01: no policy calls a role helper or auth.uid() per row (all wrapped as (select ...))', unwrapped.length === 0 && pols.length > 120,
    `${pols.length} policies; unwrapped: ${unwrapped.join(' ') || '-'}`);
  // The planner runs the wrapped helper once (an InitPlan) instead of once per row.
  await db.exec(`select set_config('request.jwt.claim.sub', '${coordinator}', false); set role authenticated`);
  const plan = (await db.query('explain (costs off) select id from students')).rows.map((r) => r['QUERY PLAN']).join('\n');
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false)`);
  check('D9-01: a staff read of students checks the role once per query (InitPlan, no per-row my_role)', /InitPlan/.test(plan) && !/Filter:.*\bis_staff\(\)/.test(plan), plan.replace(/\n/g, ' | '));
  // The rules still hold after the rewrite (the whole suite above runs on the wrapped policies too).
  await refusesWith('D9-01: a student still cannot post an announcement', 'new row violates row-level security policy for table "announcements"', () =>
    asApp('authenticated', arjun, `insert into announcements (title, body, audience) values ('x', 'y', 'all')`));
  check('D9-01: a student still reads only their own record and no call notes', (await asApp('authenticated', arjun, 'select id from students')).length === 1
    && (await asApp('authenticated', arjun, 'select id from call_logs')).length === 0
    && (await asApp('authenticated', arjun, 'select id from follow_up_tasks')).length === 0);

  // D9-02: the faster student_overview gives the same answers as an aggregate over every visit.
  const viewRows = await asApp('authenticated', coordinator, 'select id, last_visit_at, here_now from student_overview order by id');
  const plain = await asOwner(`select s.id, lv.last_visit_at, lv.here_now from students s left join lateral (select max(v.check_in) as last_visit_at,
    coalesce(bool_or(v.check_out is null), false) as here_now from visits v where v.student_id = s.id) lv on true order by s.id`); // 0033's way
  check('D9-02: student_overview (index reads) matches the full aggregate for every student', viewRows.length === plain.length
    && JSON.stringify(viewRows) === JSON.stringify(plain), `${viewRows.length} rows`);

  // D9-07: the per-student lookups can use an index (shown with sequential scans switched off,
  // as the seeded tables are too small for the planner to bother).
  const want = ['call_logs_student_idx', 'consents_student_idx', 'guardians_student_idx', 'follow_up_tasks_student_idx',
    'status_history_student_idx', 'level_history_student_idx', 'student_progress_item_idx', 'materials_item_idx',
    'visits_check_in_idx', 'announcement_reads_profile_idx', 'group_members_profile_idx', 'notifications_announcement_idx'];
  const have = (await asOwner(`select indexname from pg_indexes where schemaname = 'public'`)).map((r) => r.indexname);
  check('D9-07: the 12 lookup indexes exist', want.every((i) => have.includes(i)), want.filter((i) => !have.includes(i)).join(' '));
  await db.exec('set enable_seqscan = off');
  const usesIndex = async (sql) => (await db.query(`explain (costs off) ${sql}`)).rows.map((r) => r['QUERY PLAN']).join(' ');
  const [{ id: anyStudent }] = await asOwner('select id from students limit 1');
  const callPlan = await usesIndex(`select * from call_logs where student_id = '${anyStudent}'`);
  const visitPlan = await usesIndex(`select count(*) from visits where check_in >= now() - interval '1 day'`);
  await db.exec('reset enable_seqscan');
  check('D9-07: a student\'s calls and today\'s visits are read through an index', /call_logs_student_idx/.test(callPlan)
    && /visits_check_in_idx/.test(visitPlan), `${callPlan} | ${visitPlan}`);

  // D1a-11, D1a-10, D1b-10: rights.
  const [{ n: strayRights }] = await asOwner(`select count(*)::int as n from pg_class c cross join (values ('anon'), ('authenticated')) r(role)
    cross join (values ('truncate'), ('references'), ('trigger')) p(priv)
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'p') and has_table_privilege(r.role, c.oid, p.priv)`);
  check('D1a-11: no app role may TRUNCATE, REFERENCE or put a TRIGGER on any table', strayRights === 0, String(strayRights));
  await refusesWith('D1a-11: a signed-in person cannot empty the audit log with TRUNCATE', 'permission denied for table audit_log', () =>
    asApp('authenticated', guru, 'truncate audit_log'));
  const loosePath = await asOwner(`select p.oid::regprocedure::text as f from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
      and not ('search_path=public, pg_temp' = any (coalesce(p.proconfig, '{}')))`);
  check('D1a-10: every security definer function searches public, then pg_temp', loosePath.length === 0, loosePath.map((r) => r.f).join(' '));
  check('D1b-10: service_role may not run the internal jobs, but still runs what the Edge Function calls', (await asOwner(`select
    not has_function_privilege('service_role', 'refresh_student_statuses()', 'execute')
    and not has_function_privilege('service_role', 'close_open_visits()', 'execute')
    and not has_function_privilege('service_role', 'send_due_push()', 'execute')
    and not has_function_privilege('service_role', 'link_login_to_student(uuid,text)', 'execute')
    and has_function_privilege('service_role', 'claim_push_queue()', 'execute')
    and has_function_privilege('service_role', 'finish_push(uuid,bigint[],bigint[],jsonb,jsonb)', 'execute')
    and has_function_privilege('service_role', 'claim_expired_submission_files()', 'execute') as ok`))[0].ok === true);

  // A fresh adult student for the checks below (the dashboard way: nobody signed in).
  const [{ id: s37 }] = await asOwner(`insert into students (full_name, dob, joined_on) values ('Backlog Test 37', '1990-01-01', '2026-01-05') returning id`);

  // Brief 12 leftover: toggle_visit says student_not_found like mark_visit.
  await refusesWith('toggle_visit answers student_not_found in snake_case (0037)', 'student_not_found', () =>
    asApp('authenticated', coordinator, `select toggle_visit(gen_random_uuid(), 'manual')`));

  // D5-18: a visit left open from an earlier day is closed at that day's closing time; "In" checks in.
  const [stale] = await asOwner(`insert into visits (student_id, centre_id, method, check_in)
    select '${s37}', 1, 'manual', ((centre_today(1) - 1) + time '18:00') at time zone centre_tz(1) returning id`);
  const markIn = (await asApp('authenticated', coordinator, `select mark_visit($1, 'in') as r`, [s37]))[0].r;
  const [closed] = await asOwner(`select v.check_out = ((centre_today(1) - 1) + c.closes_at) at time zone c.time_zone as at_closing
    from visits v join centres c on c.id = v.centre_id where v.id = ${stale.id}`);
  const [{ n: openNow }] = await asOwner(`select count(*)::int as n from visits where student_id = '${s37}' and check_out is null
    and local_day(check_in, 1) = centre_today(1)`);
  check('D5-18: "In" with a visit open since yesterday checks the student in today', markIn.action === 'in' && openNow === 1, JSON.stringify(markIn));
  check('D5-18: ... and the old visit is closed at yesterday\'s closing time, not now', closed.at_closing === true);
  await asApp('authenticated', coordinator, `select mark_visit($1, 'out')`, [s37]);

  // D5-07, FS1a-18: roll numbers.
  const [given] = await asOwner(`insert into students (full_name, dob, joined_on, roll_no) values ('Import 37 A', '1990-01-01', '1999-06-01', 'MS-1999-0042') returning id, roll_no`);
  const [next] = await asOwner(`insert into students (full_name, dob, joined_on) values ('Import 37 B', '1990-01-01', '1999-07-01') returning id, roll_no`);
  check('FS1a-18: a roll number the owner gives (import, restore) is kept, and the next one follows it', given.roll_no === 'MS-1999-0042'
    && next.roll_no === 'MS-1999-0043', `${given.roll_no} ${next.roll_no}`);
  const [byApp] = await asApp('authenticated', coordinator, `insert into students (full_name, dob, joined_on, roll_no)
    values ('App 37', '1990-01-01', '1999-08-01', 'MS-1999-0500') returning id, roll_no`);
  check('FS1a-18: ... an app user\'s roll number is still made by the database', byApp.roll_no === 'MS-1999-0044', byApp.roll_no);
  await asOwner(`insert into roll_counters (year, last) values (1998, 9999)`);
  const [big] = await asOwner(`insert into students (full_name, dob, joined_on) values ('Import 37 C', '1990-01-01', '1998-03-01') returning id, roll_no`);
  check('D5-07: the 10,000th number of a year is MS-1998-10000, not a duplicate MS-1998-1000', big.roll_no === 'MS-1998-10000', big.roll_no);
  await asOwner(`delete from students where id in ('${given.id}', '${next.id}', '${byApp.id}', '${big.id}')`);
  await asOwner(`delete from roll_counters where year in (1998, 1999)`);

  // D1b-08, FS1a-17: impossible values are refused when written; plausible ones pass.
  const setStudent = (col, value) => () => asApp('authenticated', coordinator, `update students set ${col} = $1 where id = $2`, [value, s37]);
  await refusesWith('D1b-08: a joining date in 2099 is refused (it would make roll number MS-2099-...)', 'joined_on_invalid', setStudent('joined_on', '2099-01-01'));
  await refusesWith('FS1a-17: a date of birth before 1900 is refused', 'dob_invalid', setStudent('dob', '1850-01-01'));
  await refusesWith('FS1a-17: a date of birth in the future is refused', 'dob_invalid', setStudent('dob', '2999-01-01'));
  await refusesWith('FS1a-17: an email without @ is refused', 'email_invalid', setStudent('email', 'not an email'));
  await refusesWith('FS1a-17: a name over 120 characters is refused', 'name_too_long', setStudent('full_name', 'N'.repeat(121)));
  await refusesWith('FS1a-17: a phone over 30 characters is refused', 'phone_invalid', setStudent('phone', '9'.repeat(31)));
  await asApp('authenticated', coordinator, `update students set phone = '98480 12345', email = 'Backlog.37@Example.com', joined_on = '2026-01-06' where id = $1`, [s37]);
  check('FS1a-17: ... plausible values still save', (await asOwner(`select phone = '98480 12345' as ok from students where id = '${s37}'`))[0].ok === true);

  // D1b-09: a switched-off sign-up is not linked when its email is confirmed.
  await asOwner(`insert into students (full_name, dob, email) values ('Linked 37', '1990-01-01', 'off.signup.37@example.com')`);
  const offLogin = await signUp('off.signup.37@example.com', false);
  await asApp('authenticated', guru, `update profiles set active = false where id = $1`, [offLogin]);
  await asOwner(`update auth.users set email_confirmed_at = now() where id = '${offLogin}'`);
  check('D1b-09: confirming a switched-off sign-up does not link it or make it a student', (await roleOf(offLogin)) === 'pending'
    && (await linkOf('off.signup.37@example.com')) === null);

  // D5-09: an app user cannot backdate a new post.
  const [back] = await asApp('authenticated', coordinator, `insert into announcements (title, body, audience, publish_at)
    values ('Backdated 37', 'x', 'all', now() - interval '3 days') returning id, publish_at >= now() - interval '1 minute' as fresh`);
  check('D5-09: a post sent with a past time is published now (so it is pushed and listed first)', back.fresh === true);

  // D5-10: a student whose login is switched off counts as "no login" in Seen by.
  const noLogin = async () => (await asApp('authenticated', coordinator, 'select no_login from announcement_seen where announcement_id = $1', [back.id]))[0].no_login;
  const before = await noLogin();
  await asApp('authenticated', guru, `update profiles set active = false where id = $1`, [arjun]);
  const offCount = await noLogin();
  await asApp('authenticated', guru, `update profiles set active = true where id = $1`, [arjun]);
  check('D5-10: switching a student\'s login off moves them to "no login" (told in class)', offCount === before + 1, `${before} -> ${offCount}`);
  await asOwner(`delete from announcements where id = ${back.id}`);

  // D5-13, FS1b-08, FR-10: groups.
  const [{ id: g37 }] = await asApp('authenticated', coordinator, `insert into groups (name) values ('Sunday  Harinam 37') returning id`);
  check('FS1b-08: runs of spaces in a group name become one', (await asOwner(`select name from groups where id = ${g37}`))[0].name === 'Sunday Harinam 37');
  await refusesWith('FS1b-08: a look-alike name with a no-break space is the same group', /^duplicate key value violates unique constraint "groups_name(_lower)?_key"$/, () =>
    asApp('authenticated', coordinator, `insert into groups (name) values ('Sunday Harinam 37')`));
  const pending37 = await signUp('pending.group.37@example.com', true);
  await refusesWith('D5-13: a pending login cannot be put in a group', 'member_not_allowed', () =>
    asApp('authenticated', coordinator, 'insert into group_members (group_id, profile_id) values ($1, $2)', [g37, pending37]));
  await asApp('authenticated', coordinator, 'insert into group_members (group_id, profile_id) values ($1, $2)', [g37, arjun]);
  check('D5-13: ... a student with a record can', (await asOwner(`select count(*)::int as n from group_members where group_id = ${g37}`))[0].n === 1);
  await asApp('authenticated', coordinator, 'update groups set active = false where id = $1', [g37]);
  await refusesWith('D5-13: a new post cannot go to a switched-off group', 'group_inactive', () => asApp('authenticated', coordinator,
    `insert into announcements (title, body, audience, audience_group) values ('To a closed group', 'x', 'group', $1)`, [g37]));
  check('FR-10: a coordinator cannot delete a group (switch it off instead)', (await asApp('authenticated', coordinator,
    'delete from groups where id = $1 returning id', [g37])).length === 0);
  check('FR-10: ... the Guru still can', (await asApp('authenticated', guru, 'delete from groups where id = $1 returning id', [g37])).length === 1);

  // FS1a-15: a null in call_reasons no longer lets any reason through.
  await asOwner(`update settings set value = value || 'null'::jsonb where key = 'call_reasons'`);
  await refusesWith('FS1a-15: with a null in call_reasons, a made-up reason is still refused', 'reason_unknown', () => asApp('authenticated', coordinator,
    `select log_call($1, 'paused', 'made-up reason', 'test', current_date + 7)`, [s37]));
  await asOwner(`update settings set value = (select jsonb_agg(e) from jsonb_array_elements(value) e where e <> 'null'::jsonb) where key = 'call_reasons'`);

  // FS1b-05: attachment sizes.
  const filePath = `${coordinator}/0b1e2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.png`;
  await refusesWith('FS1b-05: a size beyond any number is attachments_invalid (not a raw bigint error)', 'attachments_invalid', () => asApp('authenticated', coordinator,
    `insert into announcements (title, body, audience, attachments) values ('Huge', 'x', 'all', $1::jsonb)`,
    [JSON.stringify([{ path: filePath, name: 'p.png', kind: 'image', size: 1e30 }])]));
  const [{ id: filePost }] = await asOwner(`insert into announcements (title, body, audience, created_by, attachments)
    values ('With a file 37', 'x', 'all', '${coordinator}', '${JSON.stringify([{ path: filePath, name: 'p.png', kind: 'image', size: 4000000 }])}') returning id`);
  await asApp('authenticated', coordinator, `update announcements set attachments = $1::jsonb where id = $2`,
    [JSON.stringify([{ path: filePath, name: 'p.png', kind: 'image', size: 1 }]), filePost]);
  check('FS1b-05: a kept file keeps its stored size (the app sent 1)', (await asOwner(`select attachments -> 0 ->> 'size' as s from announcements where id = ${filePost}`))[0].s === '4000000');
  await asOwner(`delete from announcements where id = ${filePost}`);

  // FS1b-07: a remark of tabs and newlines is no remark.
  const [{ id: item1 }] = await asOwner(`select id from syllabus_items where level_id = 1 and retired_at is null order by sort limit 1`);
  await asApp('authenticated', coordinator, `insert into student_progress (student_id, item_id, remark) values ($1, $2, E'\\n\\t\\n')`, [s37, item1]);
  check('FS1b-07: a remark of only tabs and line breaks is stored as none', (await asOwner(`select remark from student_progress where student_id = '${s37}'`))[0].remark === null);
  await asApp('authenticated', coordinator, 'delete from student_progress where student_id = $1 and item_id = $2', [s37, item1]);

  // FS1b-09: "my calls due" counts like C10's Mine: by the most urgent open task.
  const callsDue = async (id) => (await asApp('authenticated', id, 'select coordinator_dashboard() as d'))[0].d.my_calls_due;
  const [cBefore, gBefore] = [await callsDue(coordinator), await callsDue(guru)];
  await asOwner(`insert into follow_up_tasks (student_id, assignee_id, kind, due_on, escalated) values
    ('${s37}', '${guru}', 'call', current_date - 2, true), ('${s37}', '${coordinator}', 'call', current_date - 1, false)`);
  const [cAfter, gAfter] = [await callsDue(coordinator), await callsDue(guru)];
  check('FS1b-09: a student whose most urgent task is the Guru\'s is not in the coordinator\'s "calls due"', cAfter === cBefore, `${cBefore} -> ${cAfter}`);
  check('FS1b-09: ... but is in the Guru\'s', gAfter === gBefore + 1, `${gBefore} -> ${gAfter}`);
  await asOwner(`delete from follow_up_tasks where student_id = '${s37}'`);

  // FS1a-22: materials by the levels' order, not their ids.
  const [{ id: lvl0 }] = await asOwner(`insert into levels (id, name, sort) select max(id) + 1, 'Foundation 37', 0 from levels returning id`);
  const stuLogin = await signUp('level.order.37@example.com', true);
  await asOwner(`insert into students (full_name, dob, email, level_id) values ('Level Order 37', '1990-01-01', 'level.order.37@example.com', ${lvl0})`);
  const [{ id: m3 }] = await asOwner(`insert into materials (kind, title, body, level_id, approved_by) values ('note', 'Advanced note 37', 'x', 3, '${guru}') returning id`);
  const [{ id: m0 }] = await asOwner(`insert into materials (kind, title, body, level_id, approved_by) values ('note', 'Foundation note 37', 'x', ${lvl0}, '${guru}') returning id`);
  const visible = (await asApp('authenticated', stuLogin, 'select id from materials where id in ($1, $2)', [m3, m0])).map((r) => Number(r.id));
  check('FS1a-22: a student of a level added later (higher id, first in order) does not see Advanced materials', visible.length === 1 && visible[0] === Number(m0), JSON.stringify(visible));
  await asOwner(`delete from materials where id in (${m3}, ${m0})`);

  // R2G2-02, R2G2-04: syllabus items and their materials.
  const [{ id: it37 }] = await asApp('authenticated', guru, `insert into syllabus_items (level_id, title) values (1, 'Moving item 37') returning id`);
  const [{ id: mat37 }] = await asOwner(`insert into materials (kind, title, body, item_id, approved_by) values ('note', 'Item note 37', 'x', ${it37}, '${guru}') returning id`);
  await asApp('authenticated', guru, 'update syllabus_items set level_id = 2 where id = $1', [it37]);
  check('R2G2-02: an item moved to another level takes its materials along', (await asOwner(`select level_id from materials where id = ${mat37}`))[0].level_id === 2);
  await asApp('authenticated', guru, 'update syllabus_items set retired_at = now() where id = $1', [it37]);
  await asApp('authenticated', guru, `update syllabus_items set retired_at = '1999-01-01' where id = $1`, [it37]);
  check('R2G2-04: a retired item keeps its first retirement time', (await asOwner(`select retired_at > now() - interval '1 hour' as ok from syllabus_items where id = ${it37}`))[0].ok === true);
  const [{ ok: insertStamp }] = await asApp('authenticated', guru, `insert into syllabus_items (level_id, title, retired_at) values (1, 'Born retired 37', '2001-01-01')
    returning retired_at > now() - interval '1 hour' as ok`);
  check('R2G2-04: an item added already retired gets the time of now, not a made-up date', insertStamp === true);
  check('R2G2-04: a YouTube link with a line break is refused; a plain one passes', (await asOwner(`select
    not youtube_link_ok(E'https://youtu.be/abcdefghijk?\\nx') and youtube_link_ok('https://youtu.be/abcdefghijk?t=3') as ok`))[0].ok === true);
  await asOwner(`delete from materials where id = ${mat37}`);
}

// ---------------------------------------------------------------- 0038 app correctness (D6-09, D6-14, FS2-09, D6-21)
{
  const [s38] = await asOwner(`insert into students (full_name, dob) values ('Scan Twice 38', '1990-01-01') returning id, qr_token`);
  const scan38 = async () => (await asApp('authenticated', coordinator, 'select scan_qr($1) as r', [s38.qr_token]))[0].r.action;
  const visits38 = async () => (await asOwner(`select count(*)::int as n, count(*) filter (where check_out is null)::int as open from visits where student_id = '${s38.id}'`))[0];
  check('D6-09: (control) a first scan checks in', (await scan38()) === 'in');
  await asOwner(`update visits set check_in = check_in - interval '1 minute' where student_id = '${s38.id}'`);
  check('D6-09: (control) a scan a minute later checks out', (await scan38()) === 'out');
  const retried = await scan38();
  const after = await visits38();
  check('D6-09: the same scan again within 30 seconds (a retry, a second phone) answers already_out', retried === 'already_out', retried);
  check('D6-09: ... and checks nobody back in', after.n === 1 && after.open === 0, JSON.stringify(after));
  check('D6-09: toggle_visit locks the student row', (await asOwner(`select prosrc ~ 'for update' as ok from pg_proc where proname = 'toggle_visit'`))[0].ok === true);

  const reason38 = (await asOwner(`select value ->> 0 as r from settings where key = 'call_reasons'`))[0].r;
  const ahead = async (days) => (await asOwner(`select (today_ist() + ${days})::text as d`))[0].d;
  await refusesWith('D6-14: a pause more than a year ahead is refused', 'next_date_too_far', async () =>
    logCall(coordinator, { p_student: s38.id, p_outcome: 'paused', p_reason: reason38, p_comment: 'Typo 2062', p_next_date: await ahead(400) }));
  await logCall(coordinator, { p_student: s38.id, p_outcome: 'paused', p_reason: reason38, p_comment: 'Exams', p_next_date: await ahead(300) });
  check('D6-14: (control) a pause 300 days ahead is saved', (await statusOf(s38.id)).status === 'paused');
  await refusesWith('D6-14: an announcement scheduled more than 6 months ahead is refused', 'publish_too_far', () =>
    asApp('authenticated', coordinator, `insert into announcements (title, body, audience, publish_at) values ('Far 38', 'x', 'all', now() + interval '200 days')`));
  const [{ id: soon38 }] = await asApp('authenticated', coordinator,
    `insert into announcements (title, body, audience, publish_at) values ('Soon 38', 'x', 'all', now() + interval '30 days') returning id`);
  check('D6-14: (control) one scheduled a month ahead is saved', !!soon38);
  await refusesWith('D6-14: ... and cannot be moved past 6 months later', 'publish_too_far', () =>
    asApp('authenticated', coordinator, `update announcements set publish_at = now() + interval '1 year' where id = $1`, [soon38]));
  await asOwner(`delete from announcements where id = ${soon38}`);

  await refusesWith('FS2-09: a call note over 1000 characters is refused', /call_logs_comment_length/, () =>
    logCall(coordinator, { p_student: s38.id, p_outcome: 'not_reachable', p_reason: null, p_comment: 'x'.repeat(1001) }));
  await refusesWith('FS2-09: an area over 100 characters is refused', /students_area_length/, () =>
    asApp('authenticated', coordinator, `update students set area = repeat('a', 101) where id = $1`, [s38.id]));
  await refusesWith('D6-21: a PIN code starting with 0 is refused', /students_pincode_check/, () =>
    asApp('authenticated', coordinator, `update students set pincode = '012345' where id = $1`, [s38.id]));
  await asApp('authenticated', coordinator, `update students set pincode = '500001', area = 'Abids' where id = $1`, [s38.id]);
  check('D6-21: (control) a real PIN code is saved', (await asOwner(`select pincode from students where id = '${s38.id}'`))[0].pincode === '500001');
  check('FS2-09: the guardian name has its bound', (await asOwner(`select count(*)::int as n from pg_constraint where conname = 'guardians_name_length'`))[0].n === 1);

  // D1a-15: a minor's record never holds a parent's email.
  const kid = (email, name) => asApp('authenticated', coordinator, `select register_student(p_full_name => $1, p_dob => (current_date - interval '10 years')::date,
    p_email => $2, p_guardian_name => 'Parent 38', p_guardian_phone => '9876543210', p_guardian_email => 'parent.38@example.com',
    p_guardian_relation => 'mother', p_id_type_checked => 'school_id', p_written_consent => true) as r`, [name, email]);
  await refusesWith('D1a-15: a child registered with the parent\'s own email is refused', 'guardian_email_on_minor', () => kid('parent.38@example.com', 'Child A 38'));
  const [{ r: childB }] = await kid('child.b.38@example.com', 'Child B 38');
  check('D1a-15: (control) a child with their own email is registered', !!childB.id);
  await refusesWith('D1a-15: a sibling given the parent\'s email (a guardian elsewhere) is refused', 'guardian_email_on_minor', () =>
    asApp('authenticated', coordinator, `update students set email = 'PARENT.38@example.com' where id = $1`, [childB.id]));
  await asApp('authenticated', coordinator, `update students set email = 'parent.38@example.com' where id = $1`, [s38.id]);
  check('D1a-15: (control) an adult student may use the same email (a parent learning too)',
    (await asOwner(`select email from students where id = '${s38.id}'`))[0].email === 'parent.38@example.com');
}
// ---------------------------------------------------------------- 0039 security backlog (D4-17, D2-06, ENT-08)
{
  // D4-17: the refusal for a minor without consent names the roll number, never the child's name.
  let detail39 = null;
  try {
    await asApp('authenticated', coordinator, `insert into students (full_name, dob) values ('Secret Child 39', current_date - interval '9 years')`);
  } catch (error) {
    detail39 = `${error.message} | ${error.detail ?? ''}`;
  }
  check('D4-17: a minor without consent is still refused (control)', detail39?.startsWith('minor_needs_consent') === true, detail39 ?? 'was allowed');
  check('D4-17: ... and the error detail holds the roll number, not the name', !!detail39 && !detail39.includes('Secret Child') && /MS-\d{4}-\d+/.test(detail39), detail39 ?? '');

  // D2-06: phones of a person switched off, or given no class role, are forgotten at once.
  const tok39 = (n) => `ExponentPushToken[sec39x${n}]`;
  const phoneOf = async (n) => (await asOwner(`select count(*)::int as n from push_tokens where token = '${tok39(n)}'`))[0].n;
  const staff39 = await signUp('staff.39@example.com', true);
  const other39 = await signUp('other.39@example.com', true);
  await asOwner(`update profiles set role = 'coordinator' where id in ('${staff39}', '${other39}')`);
  await asApp('authenticated', staff39, 'select register_push_token($1, $2)', [tok39(1), 'android']);
  await asApp('authenticated', other39, 'select register_push_token($1, $2)', [tok39(2), 'android']);
  check('D2-06: (control) both coordinators have a phone saved', (await phoneOf(1)) === 1 && (await phoneOf(2)) === 1);
  await asOwner(`update profiles set active = false where id = '${staff39}'`);
  check('D2-06: switching a person off deletes their phones', (await phoneOf(1)) === 0);
  check('D2-06: ... and leaves everyone else\'s', (await phoneOf(2)) === 1);
  await asOwner(`update profiles set role = 'pending' where id = '${other39}'`);
  check('D2-06: a person put back to waiting (no class role) loses their phones too', (await phoneOf(2)) === 0);
  await asOwner(`update profiles set active = true, role = 'coordinator' where id = '${staff39}'`);
  await asApp('authenticated', staff39, 'select register_push_token($1, $2)', [tok39(1), 'android']);
  check('D2-06: (control) switched on again, the phone can be saved again', (await phoneOf(1)) === 1);
  const stray = (await asOwner(`select count(*)::int as n from push_tokens t join profiles p on p.id = t.profile_id
    where not p.active or p.role::text not in ('guru', 'coordinator', 'student')`))[0].n;
  check('D2-06: no saved phone belongs to a person switched off or without a class role', stray === 0, String(stray));

  // ENT-08: the staff search is a function call (POST body), with the C5 search's rules.
  const find39 = async (who, text, limit, withLeft) => (await asApp('authenticated', who,
    'select full_name, roll_no, status::text from search_students($1, $2, $3)', [text, limit ?? 20, withLeft ?? true]));
  await asOwner(`insert into students (full_name, dob, status) values ('Kalyani Sri Devi 39', '1990-01-01', 'active'),
    ('Sri Kalyan Left 39', '1990-01-01', 'left'), ('Percent 100% Shah 39', '1990-01-01', 'active')`);
  const words = (await find39(coordinator, 'sri kaly')).map((r) => r.full_name);
  check('ENT-08: every word of the name, in any order, finds the student', words.includes('Kalyani Sri Devi 39') && words.includes('Sri Kalyan Left 39'), words.join(', '));
  const noLeft = (await find39(coordinator, 'sri kaly', 20, false)).map((r) => r.full_name);
  check('ENT-08: Left students can be left out (lending)', noLeft.includes('Kalyani Sri Devi 39') && !noLeft.includes('Sri Kalyan Left 39'), noLeft.join(', '));
  const [{ roll_no: roll39 }] = await asOwner(`select roll_no from students where full_name = 'Kalyani Sri Devi 39'`);
  check('ENT-08: the roll number finds the student', (await find39(coordinator, roll39)).some((r) => r.full_name === 'Kalyani Sri Devi 39'));
  check('ENT-08: % and _ are searched as letters, not as wildcards', (await find39(coordinator, '0%')).every((r) => r.full_name.includes('%'))
    && (await find39(coordinator, 'a_a')).length === 0);
  check('ENT-08: one letter finds nothing; at most 50 rows', (await find39(coordinator, 'a')).length === 0
    && (await find39(coordinator, ' 39', 500)).length <= 50);
  await refusesWith('ENT-08: a student cannot use the search', 'not_allowed', () => find39(arjun, 'rao'));
  await refusesWith('ENT-08: anon cannot run it', 'permission denied for function search_students', () =>
    asApp('anon', null, `select * from search_students('rao')`));
}// ---------------------------------------------------------------- row-level security
const seen =await asApp('authenticated', arjun, 'select full_name from students');
check('student sees only their own student record', seen.length === 1 && seen[0].full_name === 'Arjun Rao');
check('student sees only their own profile',
  (await asApp('authenticated', arjun, 'select id from profiles')).length === 1);
// 0025: anon has no table rights at all, so it is refused before row-level security is asked.
await refusesWith('anon cannot read students', 'permission denied for table students', () => asApp('anon', null, 'select id from students'));

const ran = passes + failures;
if (ran !== EXPECTED_CHECKS) {
  console.log(`\nFAIL  ${ran} checks ran, ${EXPECTED_CHECKS} expected: a block was skipped or checks were added (set EXPECTED_CHECKS)`);
  failures++;
}
console.log(failures ? `\n${failures} check(s) FAILED (${passes}/${ran} passed)` : `\nAll ${passes}/${EXPECTED_CHECKS} checks passed`);
process.exit(failures ? 1 : 0);
