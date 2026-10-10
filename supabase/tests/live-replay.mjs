// LIVE go-live replay (audit brief 8 prep; docs/GO_LIVE_CHECKLIST.md). The live project ran
// migrations 0001-0011 by hand and has had real use since (Praveen's login, the guarded clean-up
// of the seed of 29 Sep 2026). Before Praveen pastes 0012-0044 into it, this proves on an
// in-memory Postgres (PGlite), with nothing sent anywhere:
//   1. a database at LIVE's state (0001-0011, then rows of the kinds LIVE can hold: logins, staff,
//      students with a minor's guardian and consents, visits open and closed, calls, ticks,
//      materials, groups, announcements published / scheduled / replied to, push tokens) takes
//      every later migration in number order, each in one transaction, and stops at the first error;
//   2. after each file, the "which migration is this project at" probe of the checklist names
//      exactly that file, so the probe Praveen runs on LIVE can be trusted;
//   3. each file run a SECOND time either changes nothing at all (schema, grants, policies, jobs
//      and every row) or is refused as a whole and is marked "Run once" in its header (a refused
//      run changes nothing: the SQL editor runs a paste as one transaction). A second run that
//      succeeds and changes something must be marked "Run once" too, and is listed;
//   4. the replayed database has the same schema, grants, policies, jobs and buckets as a fresh
//      build of every migration (what TEST and CI run), so LIVE will not drift from TEST;
//   5. the checklist's read-only verification SQL runs on the result and shows what it must.
//
// Run: cd supabase/tests && npm ci && npm run replay   (also part of `npm test`; about 20 s)
//
// The Supabase imitation is read from smoke-test.mjs (one source); its limits apply here too.
// In particular pg_cron jobs never run, and pg_net, Vault, Auth settings and Storage limits are not
// Supabase's: the checklist's dashboard steps cover those on LIVE itself.

import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readdirSync, readFileSync } from 'node:fs';

// Print a failing statement briefly instead of the client's full dump.
process.on('uncaughtException', (error) => {
  console.error(`ERROR  ${error.message}${error.query ? `\n       in: ${error.query.slice(0, 300)}` : ''}`);
  process.exit(1);
});

const supabaseDir = new URL('../', import.meta.url);
const checklist = readFileSync(new URL('../../docs/GO_LIVE_CHECKLIST.md', import.meta.url), 'utf8');

// The migrations LIVE has (by hand, Sep 2026) and the ones the go-live adds. 0012 and 0041 were
// never used on main (0012 was Phase 2's branch number, now 0016; 0041 was skipped): if a file with
// either number appears, or a file is missing or added, the runbook's list must be checked first.
const LIVE_LAST = 11;
const GO_LIVE = ['0013', '0014', '0015', '0016', '0017', '0018', '0019', '0020', '0021', '0022', '0023', '0024',
  '0025', '0026', '0027', '0028', '0029', '0030', '0031', '0032', '0033', '0034', '0035', '0036', '0037', '0038',
  '0039', '0040', '0042', '0043', '0044'];

let failures = 0;
let passes = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) passes++;
  else failures++;
}

/** The ```sql block that follows `<!-- replay: <name> -->` in the checklist. */
function checklistSql(name) {
  const m = checklist.match(new RegExp(`<!-- replay: ${name} -->\\s*\`\`\`sql\\r?\\n([\\s\\S]*?)\`\`\``));
  if (!m) throw new Error(`docs/GO_LIVE_CHECKLIST.md has no sql block marked <!-- replay: ${name} -->`);
  return m[1];
}

const smoke = readFileSync(new URL('smoke-test.mjs', import.meta.url), 'utf8');
const imitation = smoke.match(/const supabaseImitation = `([\s\S]*?)`;/)?.[1];
if (!imitation) throw new Error('could not read supabaseImitation from smoke-test.mjs');
// What the real projects have and the smoke test does not need: pg_cron's active flag, the login's
// creation time, the Vault's secret names. Only the verification SQL reads them.
const extras = `
  alter table cron.job add column active boolean not null default true;
  alter table auth.users add column created_at timestamptz not null default now();
  create schema vault;
  create table vault.secrets (name text);`;

const files = readdirSync(new URL('migrations/', supabaseDir)).filter((f) => f.endsWith('.sql')).sort();
const numberOf = (f) => f.slice(0, 4);
const read = (f) => readFileSync(new URL(`migrations/${f}`, supabaseDir), 'utf8')
  .replace('create extension if not exists pg_cron;', ''); // imitated

async function newDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(imitation + extras);
  return db;
}

// ---------------------------------------------------------------- fingerprint
// Like the drift query of docs/OPERATIONS.md (functions, grants, tables, constraints, indexes,
// policies, triggers, views, enums, jobs, buckets, comments), plus a hash of every row of every
// public table when `withRows` is set.
const schemaSql = `
with
fn as (select 'function' k, p.oid::regprocedure::text n, md5(pg_get_functiondef(p.oid)) h from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.prokind in ('f','p')
          and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')),
fng as (select 'function_grants', p.oid::regprocedure::text, md5(coalesce(p.proacl::text, 'default')) from pg_proc p
         where p.pronamespace = 'public'::regnamespace and p.prokind in ('f','p')
           and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')),
tbl as (select 'table', c.oid::regclass::text, md5(concat_ws('|', c.relrowsecurity, c.relforcerowsecurity,
          (select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || case when a.attnotnull then ' nn' else '' end
                  || coalesce(' d ' || pg_get_expr(ad.adbin, ad.adrelid), ''), ', ' order by a.attname)
             from pg_attribute a left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
            where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)))
          from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')),
relg as (select 'table_grants', c.oid::regclass::text, md5(coalesce(c.relacl::text, 'default')) from pg_class c
          where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m','S')),
con as (select 'constraint', conrelid::regclass::text || '.' || conname, md5(pg_get_constraintdef(oid) || convalidated::text)
          from pg_constraint where connamespace = 'public'::regnamespace and conrelid <> 0),
idx as (select 'index', indexname, md5(indexdef) from pg_indexes where schemaname = 'public'),
pol as (select 'policy', schemaname || '.' || tablename || '.' || policyname, md5(concat_ws('|', permissive, roles::text, cmd, qual, with_check))
          from pg_policies where schemaname in ('public','storage')),
trg as (select 'trigger', t.tgrelid::regclass::text || '.' || t.tgname, md5(pg_get_triggerdef(t.oid) || t.tgenabled::text)
          from pg_trigger t join pg_proc p on p.oid = t.tgfoid where not t.tgisinternal and p.pronamespace = 'public'::regnamespace),
vw as (select 'view', c.oid::regclass::text, md5(coalesce(array_to_string(c.reloptions, ','), '') || '|' || pg_get_viewdef(c.oid, true))
         from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v','m')),
typ as (select 'enum', t.oid::regtype::text, md5(string_agg(e.enumlabel, ',' order by e.enumsortorder))
          from pg_type t join pg_enum e on e.enumtypid = t.oid where t.typnamespace = 'public'::regnamespace group by t.oid),
jobs as (select 'cron_job', jobname, md5(concat_ws('|', schedule, command, active)) from cron.job),
bkt as (select 'bucket', id, md5(concat_ws('|', public, file_size_limit, allowed_mime_types::text)) from storage.buckets),
cmt as (select 'comment', classoid::regclass::text || ':' || objoid::text || ':' || objsubid::text, md5(description) from pg_description
          where (classoid = 'pg_proc'::regclass and objoid in (select oid from pg_proc where pronamespace = 'public'::regnamespace))
             or (classoid = 'pg_class'::regclass and objoid in (select oid from pg_class where relnamespace = 'public'::regnamespace)))
select * from fn union all select * from fng union all select * from tbl union all select * from relg union all select * from con
union all select * from idx union all select * from pol union all select * from trg union all select * from vw
union all select * from typ union all select * from jobs union all select * from bkt union all select * from cmt`;

/** Map "kind name" -> hash. Comments are keyed by oid, which differs between two databases. */
async function fingerprint(db, { withRows, comments = true } = {}) {
  const out = new Map();
  for (const r of (await db.query(schemaSql)).rows) {
    if (r.k === 'comment' && !comments) continue;
    out.set(`${r.k} ${r.n}`, r.h);
  }
  if (withRows) {
    const tables = (await db.query(`select tablename from pg_tables where schemaname in ('public') order by 1`)).rows;
    for (const { tablename } of tables) {
      const [row] = (await db.query(`select count(*)::int as c, md5(coalesce(string_agg(t::text, E'\\n' order by t::text), '')) as h
        from public.${tablename} t`)).rows;
      out.set(`rows ${tablename}`, `${row.c}:${row.h}`);
    }
    for (const t of ['auth.users', 'storage.objects', 'storage.buckets', 'cron.job']) {
      const [row] = (await db.query(`select count(*)::int as c, md5(coalesce(string_agg(t::text, E'\\n' order by t::text), '')) as h from ${t} t`)).rows;
      out.set(`rows ${t}`, `${row.c}:${row.h}`);
    }
  }
  return out;
}

function differences(a, b) {
  const diff = [];
  for (const [k, v] of a) if (b.get(k) !== v) diff.push(b.has(k) ? `changed ${k}` : `gone ${k}`);
  for (const k of b.keys()) if (!a.has(k)) diff.push(`new ${k}`);
  return diff;
}

// ---------------------------------------------------------------- 0. the file list
const present = files.map(numberOf);
check('the go-live list is exactly the migration files after 0011 (0012 and 0041 never used)',
  JSON.stringify(present.filter((n) => Number(n) > LIVE_LAST)) === JSON.stringify(GO_LIVE),
  present.filter((n) => Number(n) > LIVE_LAST).join(' '));
check('... and 0001-0011 are all there, once each',
  JSON.stringify(present.filter((n) => Number(n) <= LIVE_LAST)) === JSON.stringify(Array.from({ length: LIVE_LAST }, (_, i) => String(i + 1).padStart(4, '0'))));
const runbookOrder = [...checklist.matchAll(/^\|\s*M(\d{4})\s*\|/gm)].map((m) => m[1]);
check('the checklist runs the same files in the same order', JSON.stringify(runbookOrder) === JSON.stringify(GO_LIVE), runbookOrder.join(' '));

// ---------------------------------------------------------------- 1. LIVE's state
const live = await newDb();
const probeSql = checklistSql('probe');
const lastOf = async () => (await live.query(probeSql)).rows.find((r) => r.migration === 'LAST IN ORDER')?.present;

for (const f of files.filter((f) => Number(numberOf(f)) <= LIVE_LAST)) await live.exec(read(f));
check('the probe names 0011 on a database at LIVE\'s state', (await lastOf()) === '0011', await lastOf());

// Rows of every kind LIVE can hold at 0011. Written as the owner (SQL editor), with the 0001-0011
// triggers on, so roll numbers, audit rows and status history are made as on the real project.
await live.exec(`
  insert into auth.users (id, email, email_confirmed_at) values
    ('00000000-0000-4000-8000-000000000001', 'guru@example.org', now()),
    ('00000000-0000-4000-8000-000000000002', 'coordinator@example.org', now()),
    ('00000000-0000-4000-8000-000000000003', 'adult.student@example.org', now()),
    ('00000000-0000-4000-8000-000000000004', 'waiting@example.org', null);
  update profiles set role = 'guru', full_name = 'Guru' where id = '00000000-0000-4000-8000-000000000001';
  update profiles set role = 'coordinator', full_name = 'Coordinator' where id = '00000000-0000-4000-8000-000000000002';
  insert into students (full_name, dob, phone, email, area, pincode, mentor_id, created_by) values
    ('Adult Student', '1990-01-01', '90000 00001', 'adult.student@example.org', 'Abids', '500001',
     '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002'),
    ('Minor Student', current_date - interval '12 years', null, null, 'Koti', '500095',
     '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002'),
    ('Paused Student', '1985-05-05', '90000 00003', null, null, null, null, '00000000-0000-4000-8000-000000000001');
  insert into guardians (student_id, full_name, phone, email, relation)
    select id, 'Parent Of Minor', '90000 00002', 'parent@example.org', 'mother' from students where full_name = 'Minor Student';
  insert into consents (student_id, guardian_id, scope, id_type_checked, verified_by)
    select s.id, g.id, scope, 'ID sighted', '00000000-0000-4000-8000-000000000002'
      from students s join guardians g on g.student_id = s.id, unnest(array['data', 'photo']) scope;
  insert into consents (student_id, scope, verified_by)
    select id, 'data', '00000000-0000-4000-8000-000000000002' from students where full_name in ('Adult Student', 'Paused Student');
  insert into visits (student_id, check_in, check_out, method, marked_by)
    select id, now() - interval '8 days', now() - interval '8 days' + interval '2 hours', 'manual',
           '00000000-0000-4000-8000-000000000002' from students;
  insert into visits (student_id, check_in, method, marked_by)
    select id, now() - interval '10 minutes', 'qr', '00000000-0000-4000-8000-000000000002' from students where full_name = 'Adult Student';
  insert into call_logs (student_id, coordinator_id, outcome, reason, comment, next_date)
    select id, '00000000-0000-4000-8000-000000000002', 'paused', 'Health', 'Back after surgery', current_date + 30
      from students where full_name = 'Paused Student';
  insert into follow_up_tasks (student_id, assignee_id, kind, due_on)
    select id, '00000000-0000-4000-8000-000000000002', 'call', current_date + 1 from students where full_name = 'Minor Student';
  insert into syllabus_items (level_id, sort, title) values (1, 1, 'Holding the mridanga'), (1, 2, 'Dayan bols');
  insert into student_progress (student_id, item_id, ticked_by)
    select s.id, i.id, '00000000-0000-4000-8000-000000000001' from students s, syllabus_items i
     where s.full_name = 'Adult Student' and i.sort = 1;
  insert into materials (title, kind, url, level_id, item_id, uploaded_by, approved_by)
    select 'How to sit', 'youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 1, id,
           '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001' from syllabus_items where sort = 1;
  insert into groups (name, purpose, created_by) values ('Sunday Harinam', 'Kirtan', '00000000-0000-4000-8000-000000000001');
  insert into group_members (group_id, profile_id)
    select id, '00000000-0000-4000-8000-000000000002' from groups;
  insert into announcements (title, body, audience, created_by, publish_at) values
    ('Welcome', 'First class on Sunday', 'all', '00000000-0000-4000-8000-000000000001', now() - interval '3 days'),
    ('Later', 'Festival plan', 'staff', '00000000-0000-4000-8000-000000000001', now() + interval '2 days');
  update announcements set notified_at = now() - interval '3 days' where title = 'Welcome';
  insert into announcement_reads (announcement_id, profile_id)
    select id, '00000000-0000-4000-8000-000000000003' from announcements where title = 'Welcome';
  insert into announcement_replies (announcement_id, profile_id, body)
    select id, '00000000-0000-4000-8000-000000000003', 'Thank you' from announcements where title = 'Welcome';
  insert into push_tokens (token, profile_id, platform)
    values ('ExponentPushToken[live-replay]', '00000000-0000-4000-8000-000000000003', 'android');
`);
const [{ n: linked }] = (await live.query(`select count(*)::int as n from students where profile_id is not null`)).rows;
const [{ n: rolls }] = (await live.query(`select count(*)::int as n from students where roll_no is not null`)).rows;
check('LIVE-state rows written: the adult student\'s confirmed login is linked, every student has a roll number',
  linked === 1 && rolls === 3, `linked ${linked}, roll numbers ${rolls}`);

// ---------------------------------------------------------------- 2.-3. 0013-0044, each twice
const runOnce = [];
const rerunChanged = [];
for (const f of files.filter((f) => Number(numberOf(f)) > LIVE_LAST)) {
  const sql = read(f);
  const header = sql.split('\n').slice(0, 40).join('\n');
  // "Run once" in the header (0040 breaks the line between the words), or in the file's checklist row when an applied file's header lacks it (0034).
  const checklistRow = checklist.match(new RegExp(`^\\|\\s*M${numberOf(f)}\\s*\\|.*$`, 'm'))?.[0] ?? '';
  const markedOnce = /run\s*(?:--\s*)?once/i.test(header) || /run once/i.test(checklistRow);
  const markedTwice = /safe to run twice|to run again/i.test(header);
  try {
    await live.exec('begin');
    await live.exec(sql);
    await live.exec('commit');
  } catch (error) {
    await live.exec('rollback');
    check(`${f} runs on the LIVE-state database`, false, error.message);
    break;
  }
  const last = await lastOf();
  check(`${f} runs on the LIVE-state database; the probe then names ${numberOf(f)}`, last === numberOf(f), `probe: ${last}`);

  const before = await fingerprint(live, { withRows: true });
  await live.exec('begin');
  let second = null;
  try {
    await live.exec(sql);
    second = differences(before, await fingerprint(live, { withRows: true }));
  } catch (error) {
    second = error;
  }
  await live.exec('rollback');
  const after = await fingerprint(live, { withRows: true });
  check(`... a refused or rolled-back second run of ${numberOf(f)} leaves the database as it was`, differences(before, after).length === 0);
  if (second instanceof Error) {
    runOnce.push(`${numberOf(f)}: ${second.message}`);
    check(`... a second run of ${numberOf(f)} is refused as a whole, and the file says "Run once"`, markedOnce && !markedTwice,
      `${second.message}${markedOnce ? '' : '; header has no "Run once"'}`);
  } else if (second.length === 0) {
    check(`... a second run of ${numberOf(f)} changes nothing`, true);
  } else {
    rerunChanged.push(`${numberOf(f)}: ${second.slice(0, 6).join(', ')}${second.length > 6 ? ` (+${second.length - 6})` : ''}`);
    check(`... a second run of ${numberOf(f)} changes something, so the file must say "Run once" (and not "safe to run twice")`,
      markedOnce && !markedTwice, second.slice(0, 6).join(', '));
  }
}

// ---------------------------------------------------------------- 4. same schema as a fresh build
const fresh = await newDb();
for (const f of files) await fresh.exec(read(f));
const freshPrint = await fingerprint(fresh, { comments: false });
const drift = differences(freshPrint, await fingerprint(live, { comments: false }));
check('the replayed LIVE has the same functions, grants, tables, constraints, indexes, policies, triggers, views, jobs and buckets as a fresh build (TEST, CI)',
  drift.length === 0, drift.length ? drift.slice(0, 10).join(', ') : `${freshPrint.size} objects compared`);
const commentCount = async (db) => (await db.query(`select count(*)::int as n from pg_description d join pg_proc p on p.oid = d.objoid
  where d.classoid = 'pg_proc'::regclass and p.pronamespace = 'public'::regnamespace`)).rows[0].n;
check('... and the same number of function comments', (await commentCount(fresh)) === (await commentCount(live)),
  `${await commentCount(fresh)} / ${await commentCount(live)}`);

// ---------------------------------------------------------------- 5. the verification SQL
const verify = (await live.query(checklistSql('verify'))).rows;
const row = (name) => verify.find((r) => r.check_name === name);
const expectOk = ['last migration', 'migrations missing', 'tables without row-level security',
  'anon table rights', 'anon function rights', 'update/delete without where', 'roll numbers missing'];
for (const name of expectOk) check(`verification SQL: "${name}" is ok on the replayed LIVE`, row(name)?.ok === true, JSON.stringify(row(name)));
check('verification SQL: "scheduled jobs" counts the eleven jobs of 0001-0044',
  row('scheduled jobs')?.found === '11 of 11', JSON.stringify(row('scheduled jobs')));
check('verification SQL: Vault and pg_net are reported missing here (PGlite has neither), not hidden',
  row('vault secrets')?.ok === false && row('pg_net')?.ok === false);
check('verification SQL: the three sample logins confirmed at sign-up are flagged (what auto-confirm would leave)',
  row('logins confirmed within 2 s of sign-up (7 days)')?.found === '3', JSON.stringify(row('logins confirmed within 2 s of sign-up (7 days)')));
const markers = (sql) => sql.slice(sql.indexOf('with m(migration'), sql.indexOf('\n)') + 2);
check('the probe and the verification SQL find migrations by the same objects', markers(probeSql) === markers(checklistSql('verify')));
const rowCounts = (await live.query(checklistSql('row-counts'))).rows;
check('row-count SQL runs and counts the replayed students and logins',
  rowCounts.find((r) => r.table_name === 'students')?.rows === 3 && rowCounts.find((r) => r.table_name === '(auth.users)')?.rows === 4);
const probe = (await live.query(probeSql)).rows;
check('the probe has one row per migration 0010-0044 plus the summary rows',
  probe.length === 2 /* 0010, 0011 */ + GO_LIVE.length + 2 /* LAST IN ORDER, MISSING */, String(probe.length));

console.log(`\nSecond run refused (run-once files; a refused paste changes nothing):\n  ${runOnce.join('\n  ') || '(none)'}`);
console.log(`Second run succeeded and changed rows or objects (marked "Run once"):\n  ${rerunChanged.join('\n  ') || '(none)'}`);
console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) {
  console.log('Replay FAILED: fix the migration or the checklist before anything runs on LIVE.');
  process.exit(1);
}
console.log('Replay passed: LIVE can take the go-live migrations in this order.');
