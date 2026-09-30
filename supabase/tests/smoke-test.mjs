// Database smoke test: runs every migration and seed.sql on an in-memory Postgres (PGlite),
// then checks the rules that protect student data: login linking, the profile guard,
// registration with consent, attendance marking, follow-up calls, syllabus ticks, announcements
// with their read receipts, edits and private replies, groups, who may run which function, and
// row-level security.
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
for (const file of migrations) {
  let sql = readFileSync(new URL(`migrations/${file}`, supabaseDir), 'utf8');
  sql = sql.replace('create extension if not exists pg_cron;', ''); // imitated above
  await db.exec(sql);
  console.log(`ran   migrations/${file}`);
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
