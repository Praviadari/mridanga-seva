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

// ---------------------------------------------------------------- assessments (0012, Phase 2)
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
await refuses('a coordinator cannot upload assessment files', async () => aUpload(coordinator, await filePath(coordinator, 'mp3')));
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
