-- 0034: access log for the most sensitive reads, and the privacy-notice version on consents
-- (audit briefs 6 and 6b: D4-06, D4-09 in part, D4-05 notice part; docs/DECISIONS.md #146-#151).
--
-- Until now nobody's reads were written down: a coordinator could read every parent's phone, every
-- consent and every call note, and nothing showed it afterwards. A breach could then be neither
-- noticed nor scoped (DPDP Rules 2025, Rule 6: logs kept a year). This migration:
--   1. adds access_log: one row per read of a student's guardians, consents or call notes, and per
--      page of the G11 audit log. Written only by the functions below; read by the Guru only;
--      rows older than 400 days are purged every night (a year plus a margin);
--   2. adds the reading functions get_guardians, get_consents, get_call_notes (signed-in staff:
--      is_staff(), as before; D4-09's mentor-plus-Guru rule is still a team decision) and
--      get_audit_log (the Guru). Each writes one access_log row, then returns the rows;
--   3. takes away the coordinators' direct SELECT on guardians, consents and call_logs. The Guru
--      keeps it (the dashboard, revoking a consent, editing a guardian); the app reads through the
--      functions for everyone. audit_log loses its direct SELECT: G11 reads through get_audit_log;
--   4. keeps what read those tables as the caller working: register_student no longer reads the
--      new guardian back (RETURNING needs SELECT), and class_report counts call outcomes through
--      call_outcomes(), which gives outcomes only, never the notes;
--   5. adds consents.notice_version: the privacy notice the parent was shown (the website's
--      privacyNotice.version), sent by the app to register_student; NULL for older consents.
--      Frozen like the other consent fields (guard_consent, 0025);
--   6. blanks a deleted student's id in access_log (erasure leaves no id behind).
--
-- Old app builds read guardians, consents and call notes straight from the tables: after this
-- migration a coordinator on an old build sees no guardian, consent or call history until the
-- update arrives. Run it on the day the matching update is published (docs/OPERATIONS.md
-- "Releasing a change: database first"). Every UPDATE/DELETE has a WHERE (Supabase safeupdate).

-- ---------------------------------------------------------------- 1. access_log
create table access_log (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  -- The login that read (auth.uid()); null when run from the SQL editor or a job.
  actor_id       uuid,
  function_name  text not null,
  -- No foreign key: the trace must outlive the record. Blanked when the student is deleted.
  student_id     uuid,
  row_count      int not null default 0
);
create index access_log_at_idx on access_log (at desc);
create index access_log_student_idx on access_log (student_id, at desc);
create index access_log_actor_idx on access_log (actor_id, at desc);
alter table access_log enable row level security;
create policy guru_read on access_log for select to authenticated using (is_guru());
-- Nobody writes it from the app: no insert, update or delete right, no policy for them.
revoke all on access_log from public, anon, authenticated;
grant select on access_log to authenticated;

-- Writes one row. Internal: only the reading functions below (they run as the owner) call it.
create or replace function log_access(p_function text, p_student uuid, p_rows int) returns void
language sql security definer set search_path = public as $$
  insert into access_log (actor_id, function_name, student_id, row_count)
  values (auth.uid(), p_function, p_student, coalesce(p_rows, 0));
$$;

-- A deleted student (erase_student, or the Guru deleting a record) leaves no id in access_log:
-- the rows keep who read, when, what and how many, as audit_log keeps its skeleton.
create or replace function forget_student_access() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update access_log set student_id = null where student_id = old.id;
  return null;
end $$;
create trigger students_forget_access after delete on students
  for each row execute function forget_student_access();

-- Nightly purge: rows older than 400 days (one year kept, plus a margin). A plain age in hours,
-- so no centre's time zone matters (0033).
create or replace function purge_access_log() returns int
language plpgsql security definer set search_path = public as $$
declare v_rows int;
begin
  delete from access_log where at < now() - interval '400 days';
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;
select cron.schedule('mridanga-access-log-purge', '45 1 * * *', 'select purge_access_log()');

-- ---------------------------------------------------------------- 2. the reading functions
-- Error codes: not_allowed (42501: not signed in as active staff), student_required.

-- A student's parents or guardians (screens C8 Student profile and the call screen).
create or replace function get_guardians(p_student uuid)
returns table (id uuid, full_name text, phone text, email text, relation text)
language plpgsql security definer set search_path = public as $$
declare v_rows int;
begin
  if not is_staff() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_student is null then raise exception 'student_required'; end if;
  return query
    select g.id, g.full_name, g.phone, g.email, g.relation
      from guardians g
     where g.student_id = p_student
     order by g.full_name, g.id;
  get diagnostics v_rows = row_count;
  perform log_access('get_guardians', p_student, v_rows);
end $$;

-- A student's consent records, newest first (C8).
create or replace function get_consents(p_student uuid)
returns table (id uuid, scope text, method text, id_type_checked text, signed_form boolean,
               notice_version text, given_at timestamptz, revoked_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_rows int;
begin
  if not is_staff() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_student is null then raise exception 'student_required'; end if;
  return query
    select c.id, c.scope, c.method, c.id_type_checked, c.signed_form, c.notice_version, c.given_at, c.revoked_at
      from consents c
     where c.student_id = p_student
     order by c.given_at desc, c.id;
  get diagnostics v_rows = row_count;
  perform log_access('get_consents', p_student, v_rows);
end $$;

-- A student's follow-up calls with their notes, newest first; p_limit = the newest n (null = all).
create or replace function get_call_notes(p_student uuid, p_limit int default null)
returns table (id uuid, called_at timestamptz, outcome call_outcome, reason text, comment text,
               next_date date, coordinator_id uuid)
language plpgsql security definer set search_path = public as $$
declare v_rows int;
begin
  if not is_staff() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_student is null then raise exception 'student_required'; end if;
  return query
    select c.id, c.called_at, c.outcome, c.reason, c.comment, c.next_date, c.coordinator_id
      from call_logs c
     where c.student_id = p_student
     order by c.called_at desc, c.id
     limit case when p_limit is null then null else greatest(p_limit, 1) end;
  get diagnostics v_rows = row_count;
  perform log_access('get_call_notes', p_student, v_rows);
end $$;

-- One page of the audit log (G11), newest first, filtered like the screen; the Guru only.
-- p_before = the smallest id already shown (null = from the newest); p_limit 1-200, default 50.
create or replace function get_audit_log(p_table text default null, p_person uuid default null,
  p_action text default null, p_since timestamptz default null, p_before bigint default null,
  p_limit int default 50)
returns setof audit_log
language plpgsql security definer set search_path = public as $$
declare v_rows int;
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  return query
    select a.*
      from audit_log a
     where (p_table is null or a.table_name = p_table)
       and (p_person is null or a.changed_by = p_person)
       and (p_action is null or a.action = p_action)
       and (p_since is null or a.changed_at >= p_since)
       and (p_before is null or a.id < p_before)
     order by a.id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
  get diagnostics v_rows = row_count;
  perform log_access('get_audit_log', null, v_rows);
end $$;

-- Call outcomes in a period, for class_report's call counts. Outcomes only: no notes, no
-- reasons, no dates, so nothing to log. Staff only; anyone else gets no rows.
create or replace function call_outcomes(p_from timestamptz, p_to timestamptz)
returns table (student_id uuid, outcome call_outcome)
language sql stable security definer set search_path = public as $$
  select c.student_id, c.outcome
    from call_logs c
   where is_staff() and c.called_at >= p_from and c.called_at < p_to
$$;

-- ---------------------------------------------------------------- 3. direct reads closed
-- guardians: 0001's staff_all (every command) becomes: staff add (register_student, as the
-- caller), the Guru reads, edits and deletes. A coordinator's UPDATE or DELETE could not find a
-- row without SELECT anyway; now the rule says so.
drop policy staff_all on guardians;
create policy guru_read    on guardians for select to authenticated using (is_guru());
create policy staff_insert on guardians for insert to authenticated with check (is_staff());
create policy guru_update  on guardians for update to authenticated using (is_guru()) with check (is_guru());
create policy guru_delete  on guardians for delete to authenticated using (is_guru());

-- consents: 0025's staff_read becomes the Guru's; insert, update (guard_consent decides) and the
-- Guru's delete stay.
drop policy staff_read on consents;
create policy guru_read on consents for select to authenticated using (is_guru());

-- call_logs: written only by log_call (security definer); read through get_call_notes.
drop policy staff_read on call_logs;
create policy guru_read on call_logs for select to authenticated using (is_guru());

-- audit_log: read only through get_audit_log, so every page read is logged.
drop policy guru_read on audit_log;

-- ---------------------------------------------------------------- 4. notice version on consents
-- The version of the privacy notice the parent was shown (website/site.config.mjs
-- privacyNotice.version, e.g. '0.1-draft'). NULL = recorded before 0034, or by an app that did not
-- send it. guard_consent (0025) already refuses any later change to it.
alter table consents add column notice_version text
  check (notice_version is null or notice_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$');

-- 0032's register_student with p_notice_version, and the guardian's id made here instead of read
-- back with RETURNING: a coordinator may add a guardian but no longer read one (section 3). Still
-- runs as the caller (row-level security applies). New error code: notice_version_invalid.
drop function register_student(text, date, text, text, text, text, smallint, uuid,
  text, text, text, text, text, boolean, boolean, uuid);
create function register_student(
  p_full_name         text,
  p_dob               date default null,
  p_phone             text default null,
  p_email             text default null,
  p_area              text default null,
  p_pincode           text default null,
  p_level             smallint default 1,
  p_mentor            uuid default null,
  p_guardian_name     text default null,
  p_guardian_phone    text default null,
  p_guardian_email    text default null,
  p_guardian_relation text default null,
  p_id_type_checked   text default null,
  p_photo_consent     boolean default false,
  p_written_consent   boolean default null,
  p_request_id        uuid default null,
  p_notice_version    text default null
) returns jsonb
language plpgsql set search_path = public as $$
declare
  s students;
  g_id uuid := gen_random_uuid();
  v_notice text := nullif(btrim(coalesce(p_notice_version, '')), '');
  minor boolean := p_dob is not null and p_dob > today_ist() - interval '18 years';
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  if v_notice is not null and v_notice !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$' then
    raise exception 'notice_version_invalid';
  end if;
  if p_request_id is not null then
    select * into s from students where request_id = p_request_id;
    if found then
      if s.created_by is distinct from auth.uid() then raise exception 'request_id_used'; end if;
      return jsonb_build_object('id', s.id, 'roll_no', s.roll_no, 'linked', s.profile_id is not null,
                                'repeated', true);
    end if;
  end if;
  if coalesce(trim(p_full_name), '') = '' then raise exception 'name_required'; end if;
  if p_dob is null then raise exception 'dob_required'; end if;
  if minor and (coalesce(trim(p_guardian_name), '') = '' or coalesce(trim(p_guardian_phone), '') = '') then
    raise exception 'minor_needs_guardian';
  end if;
  if minor and coalesce(trim(p_id_type_checked), '') = '' then
    raise exception 'minor_needs_id_check';
  end if;
  if minor and p_written_consent is not true then
    raise exception 'written_consent_required';
  end if;

  begin
    insert into students (full_name, dob, phone, email, area, pincode, level_id, mentor_id, request_id)
    values (trim(p_full_name), p_dob, nullif(trim(p_phone), ''), nullif(lower(trim(p_email)), ''),
            nullif(trim(p_area), ''), nullif(trim(p_pincode), ''), coalesce(p_level, 1), p_mentor,
            p_request_id)
    returning * into s;
  exception when unique_violation then
    -- The same request saved by a call running at the same moment.
    select * into s from students where request_id = p_request_id;
    if not found then raise; end if;
    if s.created_by is distinct from auth.uid() then raise exception 'request_id_used'; end if;
    return jsonb_build_object('id', s.id, 'roll_no', s.roll_no, 'linked', s.profile_id is not null,
                              'repeated', true);
  end;

  if minor then
    insert into guardians (id, student_id, full_name, phone, email, relation)
    values (g_id, s.id, trim(p_guardian_name), trim(p_guardian_phone),
            nullif(lower(trim(p_guardian_email)), ''), nullif(trim(p_guardian_relation), ''));
    insert into consents (student_id, guardian_id, scope, method, id_type_checked, signed_form, notice_version)
    values (s.id, g_id, 'data', 'written', p_id_type_checked, true, v_notice);
    if p_photo_consent then
      insert into consents (student_id, guardian_id, scope, method, id_type_checked, signed_form, notice_version)
      values (s.id, g_id, 'photo', 'written', p_id_type_checked, true, v_notice);
    end if;
  end if;

  return jsonb_build_object('id', s.id, 'roll_no', s.roll_no, 'linked', s.profile_id is not null,
                            'repeated', false);
end $$;

-- ---------------------------------------------------------------- 5. class_report
-- 0033's class_report, with the calls read through call_outcomes() (section 2): it runs as the
-- caller, and a coordinator may no longer read call_logs.
create or replace function class_report(p_from date, p_to date, p_mentor uuid default null) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_mentor  uuid;
  v_today   date := today_ist();
  v_tz      text := my_time_zone();
  v_rolling boolean := coalesce((select value #>> '{}' from settings where key = 'week_starts') = 'rolling7', false);
  v_from_ts timestamptz;
  v_to_ts   timestamptz;
  v_first   date;
  v_out     jsonb;
begin
  if not is_staff() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'range_invalid'; end if;
  if p_to - p_from > 366 then
    raise exception 'range_too_long' using detail = 'A report covers at most a year.';
  end if;
  if is_guru() then
    v_mentor := p_mentor;
  elsif p_mentor is null or p_mentor = auth.uid() then
    v_mentor := auth.uid();
  else
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  v_from_ts := p_from::timestamp at time zone v_tz;
  v_to_ts   := (p_to + 1)::timestamp at time zone v_tz;
  -- First day of the first weekly row.
  v_first := case when v_rolling then p_to - 6 - 7 * ((p_to - p_from) / 7)
                  else p_from - (extract(isodow from p_from)::int - 1) end;

  with scope as (
    select o.*, p.full_name as mentor_name
      from student_overview o
      left join profiles p on p.id = o.mentor_id
     where v_mentor is null or o.mentor_id = v_mentor
  ),
  v as (
    -- Two days either side catch every zone (UTC-12 to UTC+14); the day decides.
    select x.* from (
      select vi.student_id,
             local_day(vi.check_in, vi.centre_id) as day,
             coalesce(extract(epoch from (vi.check_out - vi.check_in)) / 3600.0, 0) as hours,
             case when vi.location_check in ('outside', 'refused', 'no_fix', 'no_location')
                  then vi.location_check end as flag
        from visits vi
        join scope sc on sc.id = vi.student_id
       where vi.check_in >= v_from_ts - interval '2 days' and vi.check_in < v_to_ts + interval '2 days'
    ) x
     where x.day between p_from and p_to
  ),
  vw as (
    select v.*,
           case when v_rolling then p_to - 6 - 7 * ((p_to - v.day) / 7)
                else v.day - (extract(isodow from v.day)::int - 1) end as week_start,
           date_trunc('month', v.day)::date as month_start
      from v
  ),
  weeks as (
    select gs::date as start from generate_series(v_first::timestamp, p_to::timestamp, interval '7 days') gs
  ),
  months as (
    select gs::date as start from generate_series(date_trunc('month', p_from::timestamp), p_to::timestamp, interval '1 month') gs
  ),
  calls as (
    select c.student_id, c.outcome
      from call_outcomes(v_from_ts, v_to_ts) c
      join scope sc on sc.id = c.student_id
  ),
  open_tasks as (
    select t.student_id, t.due_on, t.escalated
      from follow_up_tasks t
      join scope sc on sc.id = t.student_id
     where t.done_at is null
  ),
  prog as (
    select sc.id, sc.level_id,
           (select count(*) from student_progress sp join syllabus_items i on i.id = sp.item_id
             where sp.student_id = sc.id and i.level_id = sc.level_id and i.retired_at is null) as done,
           (select count(*) from syllabus_items i where i.level_id = sc.level_id and i.retired_at is null) as total
      from scope sc
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'today', v_today,
    'week_starts', case when v_rolling then 'rolling7' else 'monday' end,
    'mentor_id', v_mentor,
    'students', (select count(*) from scope),
    'in_class', (select count(*) from scope where status <> 'left'),
    'by_status', (select jsonb_agg(jsonb_build_object('status', x.st, 'students', x.n) order by x.st)
                    from (select st, count(sc.id) as n
                            from unnest(enum_range(null::student_status)) as st
                            left join scope sc on sc.status = st
                           group by st) x),
    'new_joiners', (select count(*) from scope where joined_on between p_from and p_to),
    'left_in_range', (select count(distinct h.student_id) from status_history h
                        join scope sc on sc.id = h.student_id
                       where h.to_status = 'left' and h.changed_at >= v_from_ts and h.changed_at < v_to_ts),
    'visits', (select count(*) from v),
    'visitors', (select count(distinct student_id) from v),
    'hours', (select coalesce(round(sum(hours)::numeric, 1), 0) from v),
    'visits_flagged', (select count(*) from v where flag is not null),
    'flagged_by_reason', (select jsonb_agg(jsonb_build_object('reason', x.reason, 'visits', x.n) order by x.reason)
                            from (select r.reason, count(v.flag) as n
                                    from unnest(array['no_fix', 'no_location', 'outside', 'refused']) as r(reason)
                                    left join v on v.flag = r.reason
                                   group by r.reason) x),
    'by_week', (select jsonb_agg(jsonb_build_object('start', w.start, 'visits', w.visits, 'visitors', w.visitors, 'hours', w.hours)
                                 order by w.start)
                  from (select wk.start, count(vw.student_id) as visits, count(distinct vw.student_id) as visitors,
                               coalesce(round(sum(vw.hours)::numeric, 1), 0) as hours
                          from weeks wk left join vw on vw.week_start = wk.start
                         group by wk.start) w),
    'by_month', (select jsonb_agg(jsonb_build_object('start', m.start, 'visits', m.visits, 'visitors', m.visitors, 'hours', m.hours)
                                  order by m.start)
                   from (select mo.start, count(vw.student_id) as visits, count(distinct vw.student_id) as visitors,
                                coalesce(round(sum(vw.hours)::numeric, 1), 0) as hours
                           from months mo left join vw on vw.month_start = mo.start
                          group by mo.start) m),
    'calls_done', (select count(*) from calls),
    'calls_by_outcome', (select jsonb_agg(jsonb_build_object('outcome', x.oc, 'calls', x.n) order by x.oc)
                           from (select oc, count(c.student_id) as n
                                   from unnest(enum_range(null::call_outcome)) as oc
                                   left join calls c on c.outcome = oc
                                  group by oc) x),
    'calls_due', (select count(distinct student_id) from open_tasks where due_on <= v_today or escalated),
    'calls_escalated', (select count(distinct student_id) from open_tasks where escalated),
    'calls_planned', (select count(distinct student_id) from open_tasks where due_on > v_today and not escalated),
    'by_level', (select jsonb_agg(jsonb_build_object(
                          'level_id', x.id, 'name', x.name, 'items', x.items, 'students', x.students,
                          'avg_percent', x.avg_percent, 'complete', x.complete, 'ticks_in_range', x.ticks)
                        order by x.sort)
                   from (select l.id, l.name, l.sort,
                                (select count(*) from syllabus_items i where i.level_id = l.id and i.retired_at is null) as items,
                                count(pr.id) as students,
                                coalesce(round(avg(case when pr.total > 0 then 100.0 * pr.done / pr.total end)), 0) as avg_percent,
                                count(pr.id) filter (where pr.total > 0 and pr.done >= pr.total) as complete,
                                (select count(*) from student_progress sp
                                   join syllabus_items i on i.id = sp.item_id
                                   join scope sc on sc.id = sp.student_id
                                  where i.level_id = l.id and sp.done_on between p_from and p_to) as ticks
                           from levels l
                           left join (prog pr join scope s2 on s2.id = pr.id and s2.status <> 'left') on pr.level_id = l.id
                          group by l.id, l.name, l.sort) x),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object(
                      'id', sc.id, 'roll_no', sc.roll_no, 'full_name', sc.full_name, 'level_id', sc.level_id,
                      'status', sc.status, 'mentor_id', sc.mentor_id, 'mentor_name', sc.mentor_name,
                      'joined_on', sc.joined_on,
                      'last_visit_on', local_day(sc.last_visit_at, sc.home_centre_id),
                      'days_since_visit', sc.days_since_visit,
                      'visits', (select count(*) from v where v.student_id = sc.id),
                      'flagged', (select count(*) from v where v.student_id = sc.id and v.flag is not null),
                      'hours', (select coalesce(round(sum(v.hours)::numeric, 1), 0) from v where v.student_id = sc.id),
                      'calls', (select count(*) from calls c where c.student_id = sc.id),
                      'syllabus_done', pr.done, 'syllabus_total', pr.total)
                    order by sc.full_name, sc.roll_no), '[]'::jsonb)
               from scope sc join prog pr on pr.id = sc.id))
    into v_out;
  return v_out;
end $$;

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14. The reading functions check the caller inside; log_access, the trigger
-- function and the purge are internal; anon gets nothing (0025).
revoke execute on function log_access(text, uuid, int), forget_student_access(), purge_access_log()
  from public, anon, authenticated;
revoke execute on function get_guardians(uuid), get_consents(uuid), get_call_notes(uuid, int),
  get_audit_log(text, uuid, text, timestamptz, bigint, int), call_outcomes(timestamptz, timestamptz),
  register_student(text, date, text, text, text, text, smallint, uuid, text, text, text, text, text,
    boolean, boolean, uuid, text)
  from public, anon;
grant execute on function get_guardians(uuid), get_consents(uuid), get_call_notes(uuid, int),
  get_audit_log(text, uuid, text, timestamptz, bigint, int), call_outcomes(timestamptz, timestamptz),
  register_student(text, date, text, text, text, text, smallint, uuid, text, text, text, text, text,
    boolean, boolean, uuid, text)
  to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on table access_log is 'One row per read of a student''s guardians, consents or call notes, and per G11 audit-log page: who (actor_id), when, which function, which student, how many rows. Written only by the reading functions; the Guru reads it; purged after 400 days (0034, docs/DECISIONS.md #146).';
comment on column access_log.student_id is 'The student read about; null for audit-log pages and after the student was deleted or erased (0034).';
comment on column consents.notice_version is 'Version of the privacy notice the parent was shown (website privacyNotice.version), sent by the app; null = recorded before 0034. Frozen (0034).';
comment on function log_access is 'Internal: writes one access_log row for the signed-in reader (0034).';
comment on function forget_student_access is 'Trigger: blanks a deleted student''s id in access_log (0034).';
comment on function purge_access_log is 'Nightly job (pg_cron mridanga-access-log-purge, 01:45 UTC): deletes access_log rows older than 400 days; returns how many (0034).';
comment on function get_guardians is 'A student''s parents or guardians, for active staff; writes one access_log row (0034). Error codes: not_allowed, student_required.';
comment on function get_consents is 'A student''s consent records, newest first, for active staff; writes one access_log row (0034).';
comment on function get_call_notes is 'A student''s follow-up calls with notes, newest first (p_limit = newest n), for active staff; writes one access_log row (0034).';
comment on function get_audit_log is 'One page of audit_log for the Guru (G11), newest first, with the screen''s filters; writes one access_log row (0034).';
comment on function call_outcomes is 'Call outcomes (no notes) in a period, for class_report; staff only, others get no rows (0034).';
comment on function register_student is 'C2/C3: a coordinator or the Guru registers a student; for a minor also the guardian and the written consents, with the privacy-notice version shown (p_notice_version). One student per p_request_id (0032, 0034).';
