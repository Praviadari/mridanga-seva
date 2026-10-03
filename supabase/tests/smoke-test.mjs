// Database smoke test: runs every migration and seed.sql on an in-memory Postgres (PGlite),
// then checks the rules that protect student data: login linking, the profile guard,
// registration with consent, attendance marking, follow-up calls, syllabus ticks, announcements
// with their read receipts, edits and private replies, groups, the home-screen numbers, who may
// run which function, and row-level security.
//
// Run before pasting a migration into the live Supabase project:
//   cd supabase/tests && npm install && npm test
//
// PGlite is real Postgres compiled to WebAssembly, so no database server is needed. Supabase's
// own pieces are imitated at the top (auth.users, auth.uid(), the anon / authenticated roles and
// their default grants, pg_cron). The imitation is close, not exact: a pass here does not replace
// a careful first run on a test project (docs/OPERATIONS.md).

import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readdirSync, readFileSync } from 'node:fs';

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
  create function cron.schedule(name text, schedule text, command text) returns bigint
    language sql as $$ select 1::bigint $$;
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

let failures = 0;

/** Prints PASS or FAIL for one check. */
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}

/** Runs SQL as the database owner, like the Supabase SQL editor or pg_cron. */
async function asOwner(sql) {
  return (await db.query(sql)).rows;
}

/** Runs SQL as an app user: role 'anon' or 'authenticated', signed in as `userId` (or nobody). */
async function asApp(role, userId, sql, params) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${userId ?? ''}', false); set role ${role};`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

/** Passes when `fn` throws, i.e. the database refused. */
async function refuses(name, fn) {
  try {
    await fn();
    check(name, false, 'was allowed');
  } catch (error) {
    check(name, true, error.message);
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
await db.exec(readFileSync(new URL('seed.sql', supabaseDir), 'utf8'));
console.log('ran   seed.sql\n');

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
  `insert into students (full_name, level_id) values ('Late Joiner', 1) returning id, roll_no`);
check('registering a student issues a roll number', /^MS-\d{4}-\d{4}$/.test(registered.roll_no), registered.roll_no);
await asApp('authenticated', coordinator,
  `update students set email = 'late.joiner@example.com' where id = $1`, [registered.id]);
check('email added to the record later links the login', (await linkOf('late.joiner@example.com')) === late);
check('... and makes it a student', (await roleOf(late)) === 'student');

await asApp('authenticated', guru, `insert into students (full_name, email) values ('Staff Too', 'coordinator@example.com')`);
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
await refuses('minor without a guardian is refused', () =>
  register(coordinator, { p_full_name: 'Child One', p_dob: childDob }));
await refuses('minor without an ID check is refused', () =>
  register(coordinator, { p_full_name: 'Child One', p_dob: childDob,
    p_guardian_name: 'Parent One', p_guardian_phone: '9876543210' }));
const child = await register(coordinator, {
  p_full_name: 'Child One', p_dob: childDob, p_guardian_name: 'Parent One',
  p_guardian_phone: '9876543210', p_guardian_relation: 'mother', p_id_type_checked: 'aadhaar',
  p_photo_consent: true });
const consents = await asOwner(`select scope from consents where student_id = '${child.id}' order by scope`);
const guardians = await asOwner(`select full_name from guardians where student_id = '${child.id}'`);
check('minor saved with guardian and consents', guardians.length === 1 &&
  consents.map((c) => c.scope).join(',') === 'data,photo', consents.map((c) => c.scope).join(','));
await refuses('a minor added without consent is refused at commit', () =>
  asApp('authenticated', guru, `insert into students (full_name, dob) values ('Child Two', '${childDob}')`));
await refuses('a student cannot register students', () =>
  register(arjun, { p_full_name: 'Someone', p_dob: '1990-01-01' }));
await refuses('anon cannot run register_student', () =>
  asApp('anon', null, `select register_student(p_full_name => 'X', p_dob => null, p_phone => null,
    p_email => null, p_area => null, p_pincode => null, p_level => 1::smallint, p_mentor => null)`));
await signUp('new.face@example.com', true);
await refuses('registering without a date of birth is refused', () =>
  register(coordinator, { p_full_name: 'No Birthday' }));
const linked = await register(coordinator,
  { p_full_name: 'New Face', p_dob: '1995-05-05', p_email: 'New.Face@example.com' });
check('registering with a signed-up email links the login', linked.linked === true);

// ---------------------------------------------------------------- profile guard
await refuses('student cannot change their own role', () =>
  asApp('authenticated', arjun, `update profiles set role = 'guru' where id = '${arjun}'`));
const [language] = await asApp('authenticated', arjun,
  `update profiles set language = 'te' where id = '${arjun}' returning language`);
check('student can change their own language', language?.language === 'te');

// ---------------------------------------------------------------- who may run functions
await refuses('anon cannot run close_open_visits', () => asApp('anon', null, 'select close_open_visits()'));
await refuses('signed-in user cannot run close_open_visits', () =>
  asApp('authenticated', arjun, 'select close_open_visits()'));
await refuses('signed-in user cannot run refresh_student_statuses', () =>
  asApp('authenticated', arjun, 'select refresh_student_statuses()'));
await refuses('signed-in user cannot run link_login_to_student', () =>
  asApp('authenticated', arjun, `select link_login_to_student('${arjun}', 'divya.m@example.com')`));
await refuses('anon cannot run toggle_visit', () =>
  asApp('anon', null, `select toggle_visit('${registered.id}', 'manual')`));
await refuses('student cannot run toggle_visit', () =>
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
await refuses('mark_visit refuses an action other than in / out', () => mark(registered.id, 'sideways'));
await refuses('student cannot run mark_visit', () =>
  asApp('authenticated', arjun, `select mark_visit('${registered.id}', 'in')`));
await refuses('anon cannot run mark_visit', () =>
  asApp('anon', null, `select mark_visit('${registered.id}', 'in')`));

const [{ qr_token: qrToken }] = await asOwner(`select qr_token from students where id = '${registered.id}'`);
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
await refuses('student cannot run check_out_all', () =>
  asApp('authenticated', arjun, 'select check_out_all()'));
await refuses('anon cannot run check_out_all', () => asApp('anon', null, 'select check_out_all()'));
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
await refuses('anon cannot read student_overview', () => asApp('anon', null, 'select id from student_overview'));
await refuses('student_overview cannot be written to', () =>
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
/** Passes when `fn` is refused with exactly this error code (the first line of the message). */
async function refusesWith(name, code, fn) {
  try {
    await fn();
    check(name, false, 'was allowed');
  } catch (error) {
    check(name, error.message === code, error.message);
  }
}
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
await refuses('anon cannot run log_call', () =>
  asApp('anon', null, `select log_call('${divya.id}', 'not_reachable', null, 'No answer')`));
await refuses('a call log cannot be written directly, only through log_call', () =>
  asApp('authenticated', coordinator, `insert into call_logs (student_id, outcome, comment) values ('${divya.id}', 'not_reachable', 'x')`));
await refuses('status paused cannot be set by a plain edit', () =>
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
const [{ n: callCount }] = await asApp('authenticated', coordinator,
  `select count(*)::int as n from call_logs where student_id = '${suresh.id}'`);
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
await refuses('a student cannot tick their own syllabus', () =>
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
await refuses('a student cannot post an announcement', () =>
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
await refuses('a second receipt for the same announcement is refused (the app ignores it)', () =>
  asApp('authenticated', arjun, 'insert into announcement_reads (announcement_id) values ($1)', [toAll.id]));
await refuses('a receipt for an announcement not addressed to the student is refused', () =>
  asApp('authenticated', arjun, 'insert into announcement_reads (announcement_id) values ($1)', [toLevel1.id]));
await refuses('a receipt for a scheduled announcement is refused', () =>
  asApp('authenticated', arjun, 'insert into announcement_reads (announcement_id) values ($1)', [scheduled.id]));
await refuses('a receipt cannot be written in someone else\'s name', () =>
  asApp('authenticated', arjun, 'insert into announcement_reads (announcement_id, profile_id) values ($1, $2)',
    [toAll.id, meera]));
await refuses('a receipt cannot be removed from the app', () =>
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
await refuses('anon cannot read announcement_seen', () => asApp('anon', null, 'select * from announcement_seen'));

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
await refuses('anon cannot run staff_names', () => asApp('anon', null, 'select * from staff_names()'));

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
await refuses('a group name is unique whatever the capitals', () => makeGroup(coordinator, 'rath yatra TEAM'));
await refusesWith('a group needs a name', 'group_name_required', () => makeGroup(coordinator, '  '));
await refusesWith('a group name is at most 60 characters', 'group_name_too_long', () => makeGroup(coordinator, 'g'.repeat(61)));
await refusesWith('a purpose is at most 200 characters', 'group_purpose_too_long', () => makeGroup(coordinator, 'Long', 'p'.repeat(201)));
await refuses('a student cannot create a group', () => makeGroup(arjun, 'Students only'));
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
await refuses('a reply to an announcement not addressed to the student is refused', () => reply(arjun, toLevel1.id, 'Hi'));
await refuses('a pending login cannot reply', () => reply(pendingLogin, kirtan, 'Hi'));
await refuses('a reply cannot be written in someone else\'s name', () =>
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
await refuses('a reply cannot be changed', () =>
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
await refuses('anon cannot run student_home', () => asApp('anon', null, 'select student_home()'));

// C1 coordinator dashboard
await refusesWith('a student cannot open the coordinator dashboard', 'not_allowed', () => homeOf('coordinator_dashboard', arjun));
await refusesWith('a pending login cannot open it', 'not_allowed', () => homeOf('coordinator_dashboard', pendingLogin));
await refuses('anon cannot run coordinator_dashboard', () => asApp('anon', null, 'select coordinator_dashboard()'));
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
await refuses('anon cannot run guru_dashboard', () => asApp('anon', null, 'select guru_dashboard()'));
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
await refuses('... but not into someone else\'s folder', async () => upload(coordinator, await filePath(guru)));
await refuses('a student cannot upload a file', async () => upload(arjun, await filePath(arjun)));
await refuses('a file needs a proper name (random id and ending)', () => upload(coordinator, `${coordinator}/photo.exe`));
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
await refuses('anon cannot save a token', () => asApp('anon', null, 'select register_push_token($1, $2)', [token(9), 'android']));
check('a person sees only their own tokens', (await asApp('authenticated', arjun, 'select token from push_tokens'))
  .every((r) => r.token === token(1)));
await refuses('a token cannot be written straight into the table', () =>
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
await refuses('an app user cannot run claim_due_push', () => asApp('authenticated', coordinator, 'select * from claim_due_push()'));
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

await refuses('a coordinator cannot create an assessment', () => createAssessment(coordinator));
await refusesWith('an assessment needs a title', 'title_required', () => createAssessment(guru, { title: '  ' }));
await refusesWith('an assessment needs a rubric', 'rubric_required', () => createAssessment(guru, { rubric: [] }));
await refusesWith('a rubric line has a top score of 1 to 10', 'rubric_invalid', () =>
  createAssessment(guru, { rubric: [{ criterion: 'Posture', max: 20 }] }));
await refusesWith('a link must be https', 'link_invalid', () => createAssessment(guru, { link: 'http://youtube.com/x' }));

const guide = await filePath(guru, 'pdf');
const demo = await filePath(guru, 'mp3');
await aUpload(guru, guide);
await aUpload(guru, demo, 900000);
await refuses('a coordinator cannot upload assessment files (only voice notes, 0020)', async () => aUpload(coordinator, await filePath(coordinator, 'pdf')));
await refuses('a file needs a known ending', async () => aUpload(guru, await filePath(guru, 'exe')));
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
await refuses('a released assessment cannot be deleted', () =>
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
await refuses('... but not a photo', async () => aUpload(arjun, await filePath(arjun, 'jpg')));
await refuses('a student with nothing to send cannot upload', async () => aUpload(late, await filePath(late, 'mp3')));
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
await refuses('an app user cannot claim the push queue', () => asApp('authenticated', guru, 'select * from claim_push_outbox()'));

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
await refuses('the app cannot write assignments directly', () => asApp('authenticated', coordinator,
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
await refuses('a coordinator cannot add a syllabus item', () =>
  asApp('authenticated', coordinator, `insert into syllabus_items (level_id, title) values (1, 'Mine')`));
await refuses('an empty title is refused', () =>
  asApp('authenticated', guru, `update syllabus_items set title = '  ' where id = $1`, [newItem.id]));
await refuses('a title over 120 characters is refused', () =>
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
await refuses('a coordinator cannot reorder the syllabus', () =>
  asApp('authenticated', coordinator, `select move_syllabus_item($1, false)`, [newItem.id]));

// A ticked item survives: its title can change, it cannot be deleted or moved to another level.
await asApp('authenticated', coordinator, `insert into student_progress (student_id, item_id) values ($1, $2)`, [registered.id, newItem.id]);
await asApp('authenticated', guru, `update syllabus_items set title = 'Tirakita (fast)' where id = $1`, [newItem.id]);
check('editing a ticked item keeps the tick', (await asOwner(
  `select 1 from student_progress where student_id = '${registered.id}' and item_id = ${newItem.id}`)).length === 1);
const itemCounts = await asApp('authenticated', coordinator, 'select item_id, ticks from syllabus_item_counts() where item_id = $1', [newItem.id]);
check('the editor counts the ticks of an item', itemCounts.length === 1 && itemCounts[0].ticks === 1, JSON.stringify(itemCounts));
await refuses('a ticked item cannot be deleted', () =>
  asApp('authenticated', guru, `delete from syllabus_items where id = $1`, [newItem.id]));
await refuses('... not even from the dashboard (the ticks would go with it)', () =>
  asOwner(`delete from syllabus_items where id = ${newItem.id}`));
await refuses('a ticked item cannot move to another level', () =>
  asApp('authenticated', guru, `update syllabus_items set level_id = 2 where id = $1`, [newItem.id]));
await asApp('authenticated', guru, `update syllabus_items set retired_at = now() where id = $1`, [newItem.id]);
check('the Guru retires a ticked item and the tick stays', (await asOwner(
  `select 1 from student_progress p join syllabus_items i on i.id = p.item_id
    where p.student_id = '${registered.id}' and i.id = ${newItem.id} and i.retired_at is not null`)).length === 1);
await refuses('a retired item cannot be ticked', () =>
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
await refuses('a link that is not a YouTube video is refused', () =>
  addMaterial(guru, { kind: 'youtube', url: 'https://example.com/watch?v=dQw4w9WgXcQ', level: 1 }));
await refuses('audio is not offered yet', () => addMaterial(guru, { kind: 'audio', level: 1 }));
const uploadMaterial = async (userId, path, size = 4096) => asApp('authenticated', userId,
  `insert into storage.objects (bucket_id, name, owner, metadata) values ('material-files', $1, auth.uid(), $2)`,
  [path, JSON.stringify({ size, mimetype: 'application/pdf' })]);
const canOpenMaterial = async (userId, path) => (await asApp('authenticated', userId,
  `select 1 from storage.objects where bucket_id = 'material-files' and name = $1`, [path])).length === 1;
const notation = `${guru}/${await newId()}.pdf`;
await uploadMaterial(guru, notation, 900000);
await refuses('a coordinator cannot upload a material file (suggestions are Phase 2)', async () =>
  uploadMaterial(coordinator, `${coordinator}/${await newId()}.pdf`));
const pdf = await addMaterial(guru, { kind: 'pdf', path: notation, name: ' Kaherva.pdf ', size: 1, level: 3 });
check('the Guru adds a PDF; its size comes from Storage', Number(pdf.file_size) === 900000 && pdf.file_name === 'Kaherva.pdf');
await refuses('a material cannot list a file that is not in Storage', async () =>
  addMaterial(guru, { kind: 'pdf', path: `${guru}/${await newId()}.pdf`, name: 'x.pdf', size: 1, level: 1 }));
await refuses('the file of a material cannot be swapped', async () => asApp('authenticated', guru,
  `update materials set storage_path = $2 where id = $1`, [pdf.id, `${guru}/${await newId()}.pdf`]));
const [arjunLevelRow] = await asOwner(`select level_id from students where profile_id = '${arjun}'`);
const [lateLevelRow] = await asOwner(`select level_id from students where profile_id = '${late}'`);
check('a student at or above the level opens the material file', arjunLevelRow.level_id >= 3 ? await canOpenMaterial(arjun, notation) : true,
  `arjun level ${arjunLevelRow.level_id}`);
check('a student below the level cannot see the material or open its file', lateLevelRow.level_id < 3
  ? !(await canOpenMaterial(late, notation)) && (await asApp('authenticated', late, `select id from materials where id = $1`, [pdf.id])).length === 0
  : true, `late level ${lateLevelRow.level_id}`);
check('a student sees the lesson of level 1', (await asApp('authenticated', late, `select id from materials where id = $1`, [video.id])).length === 1);
await refuses('a student cannot add a material', () => addMaterial(late, { kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', level: 1 }));
const [bareItem] = await asApp('authenticated', guru, `insert into syllabus_items (level_id, title) values (2, 'With a video') returning id`);
const unTickedVideo = await addMaterial(guru, { kind: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s', item: bareItem.id });
await refuses('an unticked item with materials cannot be deleted', () => asApp('authenticated', guru,
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
await refuses('an empty name is refused', () => asApp('authenticated', late, `update profiles set full_name = ' ' where id = auth.uid()`));
await refuses('a phone with letters is refused', () => asApp('authenticated', late, `update profiles set phone = 'call me' where id = auth.uid()`));
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
await refuses('the app cannot turn a coordinator into a student', () =>
  asApp('authenticated', guru, `update profiles set role = 'student' where id = $1`, [helper]));
await refuses('the app cannot give the Guru role', () =>
  asApp('authenticated', guru, `update profiles set role = 'guru' where id = $1`, [pendingLogin]));
await refuses('the Guru cannot switch themselves off', () =>
  asApp('authenticated', guru, `update profiles set active = false where id = $1`, [guru]));
await refuses('a pending login becomes a student only with a student record', () =>
  asApp('authenticated', guru, `update profiles set role = 'student' where id = $1`, [pendingLogin]));
const walkIn = await signUp('walk.in@example.com', true);
await refuses('a coordinator cannot link a login to a student', () =>
  asApp('authenticated', coordinator, 'select link_student_login($1, $2)', [walkIn, adult.id]));
await asApp('authenticated', guru, 'select link_student_login($1, $2)', [walkIn, adult.id]);
check('the Guru links a pending login to a student record', (await roleOf(walkIn)) === 'student'
  && (await asOwner(`select profile_id from students where id = '${adult.id}'`))[0].profile_id === walkIn);
await refuses('a student record with a login cannot be linked again', () =>
  asApp('authenticated', guru, 'select link_student_login($1, $2)', [pendingLogin, adult.id]));
await refuses('only a pending login can be linked', () =>
  asApp('authenticated', guru, 'select link_student_login($1, $2)', [helper, registered.id]));
await asApp('authenticated', guru, `update profiles set duty_hours = '  Mon, Thu 16:00-19:00 ' where id = $1`, [helper]);
check('the Guru writes duty hours, trimmed',
  (await asOwner(`select duty_hours from profiles where id = '${helper}'`))[0].duty_hours === 'Mon, Thu 16:00-19:00');
await refuses('a coordinator cannot write their own duty hours', () =>
  asApp('authenticated', helper, `update profiles set duty_hours = 'Always' where id = auth.uid()`));

// Mentees and call tasks
const mentorOf = async (id) => (await asOwner(`select mentor_id from students where id = '${id}'`))[0].mentor_id;
await asOwner(`insert into follow_up_tasks (student_id, assignee_id, kind, due_on) values ('${adult.id}', null, 'call', today_ist())`);
const [{ n: movedCount }] = await asApp('authenticated', guru, 'select reassign_mentees($1, $2) as n', [[adult.id, registered.id], helper]);
check('the Guru moves two students to another mentor', movedCount === 2 && (await mentorOf(adult.id)) === helper && (await mentorOf(registered.id)) === helper);
const adultTask = await asOwner(`select assignee_id from follow_up_tasks where student_id = '${adult.id}' and done_at is null`);
check('a call task given to nobody goes to the new mentor', adultTask.length > 0 && adultTask.every((t) => t.assignee_id === helper), JSON.stringify(adultTask));
await refuses('a coordinator cannot move mentees in one step', () =>
  asApp('authenticated', coordinator, 'select reassign_mentees($1, $2)', [[adult.id], coordinator]));
await refuses('a pending login cannot become a mentor', () =>
  asApp('authenticated', guru, 'select reassign_mentees($1, $2)', [[adult.id], pendingLogin]));
await refuses('... not even when a coordinator edits the student', () =>
  asApp('authenticated', coordinator, `update students set mentor_id = $2 where id = $1`, [adult.id, pendingLogin]));
await refuses('a coordinator who still mentors students cannot be switched off', () =>
  asApp('authenticated', guru, `update profiles set active = false where id = $1`, [helper]));
await asApp('authenticated', guru, 'select reassign_mentees($1, $2)', [[adult.id, registered.id], coordinator2]);
check('... and the task follows the mentor again', (await asOwner(
  `select assignee_id from follow_up_tasks where student_id = '${adult.id}' and done_at is null`)).every((t) => t.assignee_id === coordinator2));
await asApp('authenticated', guru, `update profiles set active = false where id = $1`, [helper]);
await refuses('a switched-off coordinator loses the staff screens', () =>
  asApp('authenticated', helper, 'select coordinator_dashboard()'));
await asApp('authenticated', guru, `update profiles set active = true where id = $1`, [helper]);
check('the Guru switches a coordinator on again', (await asOwner(`select active from profiles where id = '${helper}'`))[0].active === true);

// ---------------------------------------------------------------- Guru admin: import (0014, G3)
const importRows = (rows) => asApp('authenticated', guru, 'select import_students($1) as r', [JSON.stringify(rows)]);
await refuses('a coordinator cannot import students', () =>
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
await refuses('more than 500 rows in one import are refused', () =>
  importRows(Array.from({ length: 501 }, (_, i) => ({ line: i + 2, full_name: `P${i}`, dob: '1990-01-01' }))));

// ---------------------------------------------------------------- Guru admin: settings (0014, G10)
const settingOf = async (key) => (await asOwner(`select value from settings where key = '${key}'`))[0].value;
const [{ n: savedCount }] = await asApp('authenticated', guru, 'select save_settings($1) as n',
  [JSON.stringify({ irregular_days: 10, week_starts: 'rolling7', new_joiner_weeks: 4 })]);
const [{ ws, expected }] = await asOwner(`select week_start_ist()::text as ws, (today_ist() - 6)::text as expected`);
check('the Guru saves settings; "this week" can be the last 7 days', savedCount === 2 && (await settingOf('irregular_days')) === 10 && ws === expected,
  `${savedCount} ${ws} ${expected}`);
await refuses('a coordinator cannot save settings', () =>
  asApp('authenticated', coordinator, 'select save_settings($1)', [JSON.stringify({ irregular_days: 20 })]));
check('... nor change one directly (nothing changes)', (await asApp('authenticated', coordinator,
  `update settings set value = '20' where key = 'irregular_days' returning key`)).length === 0);
await refuses('a setting out of range is refused', () =>
  asApp('authenticated', guru, 'select save_settings($1)', [JSON.stringify({ irregular_days: 1 })]));
await refuses('Irregular must come before Inactive, all or nothing', () =>
  asApp('authenticated', guru, 'select save_settings($1)', [JSON.stringify({ week_starts: 'monday', irregular_days: 40 })]));
check('... so nothing of that save stays', (await settingOf('week_starts')) === 'rolling7' && (await settingOf('irregular_days')) === 10);
await refuses('an unknown setting is refused', () =>
  asApp('authenticated', guru, 'select save_settings($1)', [JSON.stringify({ colour: 'blue' })]));
await refuses('the app cannot delete a setting', () =>
  asApp('authenticated', guru, `delete from settings where key = 'retry_days'`));
await asApp('authenticated', guru, 'select save_settings($1)', [JSON.stringify({ irregular_days: 14, week_starts: 'monday' })]);
check('settings changes go to the audit log by key', (await asOwner(
  `select count(*)::int as n from audit_log where table_name = 'settings' and row_id = 'week_starts'`))[0].n === 2);
await refuses('a centre cannot close before it opens', () =>
  asApp('authenticated', guru, `update centres set opens_at = '21:00', closes_at = '20:00' where id = 1`));
await asApp('authenticated', guru, `update centres set opens_at = '15:00', closes_at = '20:30' where id = 1`);
check('the Guru changes the open window, and it is logged', (await asOwner(
  `select count(*)::int as n from audit_log where table_name = 'centres'`))[0].n === 1);
await asApp('authenticated', guru, `update centres set opens_at = '14:30', closes_at = '20:00' where id = 1`);

// ---------------------------------------------------------------- Guru admin: audit log (0014, G11)
check('the Guru reads the audit log', (await asApp('authenticated', guru, 'select id from audit_log limit 5')).length === 5);
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
await refuses('the app cannot write a notice', () => asApp('authenticated', guru,
  `insert into notifications (profile_id, kind, title, url) values ($1, 'notice', 'Fake', '/student')`, [arjun]));
await refuses('... nor change one directly', () => asApp('authenticated', arjun, 'update notifications set read_at = now()'));
await refuses('a login without a role cannot mark notices', () => asApp('authenticated', pendingLogin, 'select mark_notifications_read(null)'));
await refuses('anon cannot count notices', () => asApp('anon', null, 'select inbox_unread_count()'));
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
await refuses('a coordinator cannot read another coordinator\'s report', () => report(coordinator2, monthAgo, todayText, coordinator));
await refuses('a student has no reports', () => report(arjun, monthAgo, todayText));
await refusesWith('a range that ends before it starts is refused', 'range_invalid', () => report(guru, todayText, monthAgo));
await refusesWith('a range longer than a year is refused', 'range_too_long', () => report(guru, '2024-01-01', todayText));

// ---------------------------------------------------------------- centres (0015, G9)
const [koti] = await asApp('authenticated', guru, `insert into centres (name, address, lat, lng, radius_m)
  values ('  Koti   Centre ', ' Near the bus stand ', 17.385044123, 78.486671987, 200) returning id, name, address, lat, lng`);
check('the Guru adds a centre with its point, cleaned up', koti.name === 'Koti Centre' && koti.address === 'Near the bus stand'
  && koti.lat === 17.385044 && koti.lng === 78.486672, JSON.stringify(koti));
await refuses('a coordinator cannot add a centre', () =>
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
await refuses('the app cannot write a nomination directly', () => asApp('authenticated', coordinator,
  `insert into promotion_nominations (student_id, from_level, to_level, reason) values ($1, 2, 3, 'x')`, [meeraStudent]));
await refuses('... nor an answer', () => asApp('authenticated', coordinator2,
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
await refuses('anon reads no taals', () => asApp('anon', null, 'select id from taals'));
const addTaal = (userId, name, bols, divisions, marks) => asApp('authenticated', userId,
  'insert into taals (name, bols, divisions, marks) values ($1, $2::text[], $3::smallint[], $4::text[]) returning id, beats, bols',
  [name, bols, divisions, marks]).then((r) => r[0]);
await refuses('a coordinator cannot add a taal', () => addTaal(coordinator, 'Mine', ['tā', 'ka'], [2], ['X']));
await refuses('a student cannot change a taal', async () => {
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
await refuses('the app cannot write practice_logs directly', () => asApp('authenticated', arjun,
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
await refuses('the app cannot write inbox rows itself', () => asApp('authenticated', meera,
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
await refuses('at most 4 panes', () => addVideo(guru, 'https://cdn.example.org/a.mp4', 5));
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
await refuses('a coordinator still cannot upload a PDF', async () => aUpload(coordinator, await filePath(coordinator, 'pdf')));
await refuses('... nor into someone else\'s folder', async () => aUpload(coordinator, await filePath(coordinator2, 'm4a')));
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

// ---------------------------------------------------------------- events and polls (0021, Phase 2)
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

await refuses('a student cannot create an event', () => addEvent(arjun));
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
await refuses('a student cannot list who answered', () => asApp('authenticated', arjun, 'select * from event_people_list($1)', [festival.id]));
const people = await asApp('authenticated', coordinator2, 'select * from event_people_list($1)', [festival.id]);
check('staff see everyone it is for with their answer', people.find((p) => p.profile_id === arjun)?.response === 'going'
  && people.find((p) => p.profile_id === meera)?.response === 'not_going' && people.some((p) => p.response === null), String(people.length));
check('counts of an event not for them are not given to a student', (await asApp('authenticated', meera,
  'select * from event_counts($1::bigint[])', [[levelEvent.id]])).length === 0);
await refuses('the app cannot write answers directly', () => asApp('authenticated', arjun,
  `insert into event_rsvps (event_id, profile_id, response) values ($1, auth.uid(), 'going')`, [festival.id]));

await refusesWith('the audience stays once people answered', 'audience_locked', () => asApp('authenticated', coordinator,
  `update events set audience = 'staff' where id = $1`, [festival.id]));
await refuses('another coordinator cannot edit the event', async () => {
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
await refuses('a student cannot pick performers', () => setPerformers(arjun, festival.id, []));
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
await refuses('a student cannot create a poll', () => addPoll(arjun));
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
await refuses('votes are never readable from the app', () => asApp('authenticated', coordinator, 'select * from poll_votes'));
const voters = await asApp('authenticated', coordinator2, 'select * from poll_voters($1)', [poll.id]);
check('staff see who voted what in a poll that is not anonymous', voters.find((v) => v.profile_id === arjun)?.choice === 1
  && voters.some((v) => v.voted_at === null), String(voters.length));
await refuses('a student cannot list the voters', () => asApp('authenticated', arjun, 'select * from poll_voters($1)', [poll.id]));
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
check('results after closing: a voter sees none while it is open; staff do', (await stateOf(arjun, secret.id)).results === null
  && JSON.stringify((await stateOf(coordinator, secret.id)).results) === '[1,0]');
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
await refuses('anon cannot read events', () => asApp('anon', null, 'select id from events'));
await refuses('anon cannot read polls', () => asApp('anon', null, 'select id from polls'));
for (const { id, language } of evLanguages) await asOwner(`update profiles set language = '${language}' where id = '${id}'`);
// ---------------------------------------------------------------- row-level security
const seen =await asApp('authenticated', arjun, 'select full_name from students');
check('student sees only their own student record', seen.length === 1 && seen[0].full_name === 'Arjun Rao');
check('student sees only their own profile',
  (await asApp('authenticated', arjun, 'select id from profiles')).length === 1);
check('anon sees no students', (await asApp('anon', null, 'select id from students')).length === 0);

// ---------------------------------------------------------------- daily jobs
await asOwner('select refresh_student_statuses()');
await asOwner('select close_open_visits()');
check('daily jobs run as the owner (pg_cron)', true);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
