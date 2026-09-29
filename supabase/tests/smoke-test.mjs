// Database smoke test: runs every migration and seed.sql on an in-memory Postgres (PGlite),
// then checks the rules that protect student data: login linking, the profile guard,
// registration with consent, attendance marking, who may run which function, and row-level
// security.
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

// ---------------------------------------------------------------- row-level security
const seen = await asApp('authenticated', arjun, 'select full_name from students');
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
