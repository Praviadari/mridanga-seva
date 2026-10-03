-- Mridanga Seva — 0014: the Guru's admin screens: coordinators and roles (G2), the whole student
-- database with an Excel import (G3), class settings (G10) and the audit log (G11); and a call
-- task follows the student's mentor.
-- Run once, after 0013_syllabus_materials.sql, in the Supabase SQL editor. It does not touch the
-- tables of 0012 (assessments).
-- Why: docs/DECISIONS.md #45-#48. How: docs/DATABASE.md "Coordinators and roles", "Importing
-- students", "Settings" and "Audit log".
--
-- 1. Roles in the app instead of the Table Editor: the Guru makes a signed-up person a
--    coordinator, or links them to a student record; switches a person off or on; writes a
--    coordinator's duty hours. Nobody changes their own role, and the Guru role stays a dashboard
--    matter. A coordinator who still mentors students cannot be switched off: move them first.
-- 2. Mentees move to another coordinator in one step (reassign_mentees). A student's open call
--    tasks follow their mentor, so the follow-up queue never says "not given to anyone" while the
--    student has one; tasks made before a mentor was set are given to the mentor now.
-- 3. import_students: the Guru imports the existing student list (adults only; under-18s need the
--    parent's consent form, C2). Each row is saved or refused on its own; roll numbers come from
--    the same trigger as always. A record entered today with an older joining date gets the usual
--    days before it counts as Irregular, so an import does not start a wave of calls.
-- 4. Settings the code reads are checked, saved together (save_settings) and logged; "this week"
--    can mean from Monday or the last 7 days. The open window is checked on centres.
-- 5. audit_log gets indexes for its filters, and settings and centres changes are logged too.

-- ---------------------------------------------------------------- 1. roles and duty hours
alter table profiles add column duty_hours text;

-- Error codes (the app turns them into messages, src/data/coordinators.ts):
--   not_allowed              only the Guru changes duty hours (role and active: guard of 0002)
--   duty_hours_too_long      at most 120 characters
--   not_own_role             nobody changes their own role or switches themselves off
--   guru_role_dashboard_only the Guru role is given and taken only in the dashboard
--   role_change_not_allowed  the app offers pending -> coordinator and pending -> student only
--   student_needs_record     a student login must be linked to a student record (link_student_login)
--   has_mentees              a coordinator who still mentors students cannot be switched off
-- Only for app users (the app connects as anon or authenticated), like guard_profile_update:
-- the dashboard and this file's security definer functions are not checked here.
create or replace function guard_profile_admin() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;

  if new.duty_hours is distinct from old.duty_hours then
    if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
    new.duty_hours := nullif(btrim(new.duty_hours, E' \t\r\n'), '');
    if char_length(new.duty_hours) > 120 then
      raise exception 'duty_hours_too_long' using detail = 'Duty hours are at most 120 characters.';
    end if;
  end if;

  if new.role is distinct from old.role or new.active is distinct from old.active then
    if new.id = auth.uid() then
      raise exception 'not_own_role' using detail = 'Nobody changes their own role or switches themselves off.';
    end if;
    if new.role is distinct from old.role then
      if 'guru' in (new.role, old.role) then
        raise exception 'guru_role_dashboard_only' using detail = 'The Guru role is given and taken in the Supabase dashboard.';
      end if;
      if not (old.role = 'pending' and new.role in ('coordinator', 'student')) then
        raise exception 'role_change_not_allowed' using detail = 'The app gives roles only to people who are waiting for one.';
      end if;
      if new.role = 'student' and not exists (select 1 from students s where s.profile_id = new.id) then
        raise exception 'student_needs_record' using detail = 'Link the login to a student record (link_student_login).';
      end if;
    end if;
    if old.active and not new.active and exists (select 1 from students s where s.mentor_id = new.id) then
      raise exception 'has_mentees' using detail = 'Move this coordinator''s mentees to someone else first.';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_admin_guard before update on profiles
  for each row execute function guard_profile_admin();

-- G2: the Guru links a signed-up person (still pending) to a student record that has no login
-- yet; the person becomes that student. The automatic link by email (0002) needs the same email
-- on both; this is for the rest, decided by the Guru, who checks who the person is.
-- Error codes: not_allowed, profile_not_pending, student_not_found, student_already_linked.
-- Security definer: profiles_guard and profiles_admin_guard are for app users; this function does
-- the same checks itself.
create or replace function link_student_login(p_profile uuid, p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_profile profiles;
  v_student students;
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into v_profile from profiles where id = p_profile for update;
  if not found or v_profile.role <> 'pending' or not v_profile.active then
    raise exception 'profile_not_pending' using detail = 'Only an active login that is waiting for a role can be linked.';
  end if;
  select * into v_student from students where id = p_student for update;
  if not found then raise exception 'student_not_found'; end if;
  if v_student.profile_id is not null then
    raise exception 'student_already_linked' using detail = 'This student record already has a login.';
  end if;
  update students set profile_id = p_profile where id = p_student;
  update profiles set role = 'student' where id = p_profile;
end $$;

-- ---------------------------------------------------------------- 2. mentors and call tasks
-- A student's mentor must be an active coordinator or the Guru (error mentor_not_staff). Checked
-- for app users only, so old rows and the dashboard are left alone.
create or replace function guard_student_mentor() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') or new.mentor_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.mentor_id is not distinct from old.mentor_id then return new; end if;
  if not exists (select 1 from profiles p
                  where p.id = new.mentor_id and p.active and p.role in ('guru', 'coordinator')) then
    raise exception 'mentor_not_staff' using detail = 'A mentor is an active coordinator or the Guru.';
  end if;
  return new;
end $$;

create trigger students_mentor_guard before insert or update of mentor_id on students
  for each row execute function guard_student_mentor();

-- When the mentor changes, the student's open call tasks that were the old mentor's, or nobody's,
-- go to the new mentor (docs/DECISIONS.md #48). Security definer: a coordinator who changes a
-- mentor on C8 may not see every task row in a future rule; this keeps the queue right anyway.
create or replace function follow_mentor_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update follow_up_tasks
     set assignee_id = new.mentor_id
   where student_id = new.id and done_at is null
     and (assignee_id is null or assignee_id = old.mentor_id);
  return new;
end $$;

create trigger students_follow_mentor after update of mentor_id on students
  for each row when (new.mentor_id is distinct from old.mentor_id)
  execute function follow_mentor_tasks();

-- Tasks made while the student had no mentor go to the mentor they have now.
update follow_up_tasks t
   set assignee_id = s.mentor_id
  from students s
 where t.student_id = s.id and t.done_at is null and t.assignee_id is null and s.mentor_id is not null;

-- G2: moves students to another mentor in one step. Guru only. Returns how many changed.
-- Security invoker: row-level security (staff_update) applies as well; the mentor guard above
-- refuses a mentor who is not an active coordinator or the Guru.
create or replace function reassign_mentees(p_students uuid[], p_to uuid) returns int
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_to is null then raise exception 'mentor_not_staff'; end if;
  update students set mentor_id = p_to
   where id = any(coalesce(p_students, '{}')) and mentor_id is distinct from p_to;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- 3. importing students
-- Days since the last visit, or since the record was made when that is later than the joining
-- date: a student entered today with an older joining date (an import, a late registration) is
-- not Irregular tomorrow. Same columns as 0005; only days_since_visit changes.
create or replace view student_overview with (security_invoker = true) as
select s.id,
       s.roll_no,
       s.full_name,
       s.level_id,
       s.status,
       s.paused_until,
       s.mentor_id,
       s.home_centre_id,
       s.joined_on,
       lv.last_visit_at,
       today_ist() - coalesce((lv.last_visit_at at time zone 'Asia/Kolkata')::date,
                              greatest(s.joined_on, (s.created_at at time zone 'Asia/Kolkata')::date))
         as days_since_visit,
       lv.here_now
  from students s
  left join lateral (
    select max(v.check_in) as last_visit_at,
           coalesce(bool_or(v.check_out is null), false) as here_now
      from visits v
     where v.student_id = s.id
  ) lv on true;

-- The daily job counts the same way as the view. Otherwise as in 0001.
create or replace function refresh_student_statuses() returns void
language plpgsql security definer set search_path = public as $$
declare r record; last_seen date;
begin
  perform set_config('app.via_call_log', 'on', true);
  update students set status = 'irregular', paused_until = null
   where status = 'paused' and paused_until < today_ist();

  for r in select * from students where status in ('new', 'active', 'irregular') loop
    select coalesce(max(check_in at time zone 'Asia/Kolkata')::date,
                    greatest(r.joined_on, (r.created_at at time zone 'Asia/Kolkata')::date))
      into last_seen from visits where student_id = r.id;
    if r.status in ('new', 'active') and last_seen <= today_ist() - setting_int('irregular_days') then
      update students set status = 'irregular' where id = r.id;
      insert into follow_up_tasks (student_id, assignee_id, kind, due_on)
      values (r.id, r.mentor_id, 'call', today_ist() + setting_int('call_due_days'));
    elsif r.status = 'irregular' and last_seen <= today_ist() - setting_int('inactive_days') then
      update students set status = 'inactive' where id = r.id;
    end if;
  end loop;

  update follow_up_tasks t set escalated = true
    from students s
   where t.student_id = s.id and t.done_at is null and s.status = 'inactive';
end $$;

-- G3: imports up to 500 students. p_rows is a JSON array of objects with line (the row number in
-- the file, given back), full_name, dob, phone, email, area, pincode, level_id, joined_on (dates
-- as 'YYYY-MM-DD'). Each row is checked and saved on its own; a refused row does not stop the
-- others. Returns a JSON array, one entry per row: {line, roll_no, id} or {line, error}.
-- Row errors: name_required, name_too_long, dob_required, dob_invalid, minor_use_form,
-- joined_invalid, phone_invalid, duplicate_phone, email_invalid, duplicate_email, pincode_invalid,
-- level_invalid, duplicate_student (same name and date of birth), row_failed (anything else).
-- Whole-call errors: not_allowed, too_many_rows.
-- Security invoker: row-level security (staff_insert) applies; the roll-number trigger and the
-- login link by email work as for C2.
create or replace function import_students(p_rows jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  r        jsonb;
  v_out    jsonb := '[]'::jsonb;
  v_name   text;
  v_dob    date;
  v_joined date;
  v_phone  text;
  v_email  text;
  v_pin    text;
  v_level  smallint;
  v_id     uuid;
  v_roll   text;
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'too_many_rows' using detail = 'At most 500 rows in one import.';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      v_name := btrim(regexp_replace(coalesce(r ->> 'full_name', ''), '\s+', ' ', 'g'));
      if v_name = '' then raise exception 'name_required'; end if;
      if char_length(v_name) > 100 then raise exception 'name_too_long'; end if;

      if coalesce(r ->> 'dob', '') = '' then raise exception 'dob_required'; end if;
      begin
        v_dob := (r ->> 'dob')::date;
      exception when others then
        raise exception 'dob_invalid';
      end;
      if v_dob > today_ist() or v_dob < today_ist() - interval '100 years' then raise exception 'dob_invalid'; end if;
      if v_dob > today_ist() - interval '18 years' then raise exception 'minor_use_form'; end if;

      v_joined := today_ist();
      if coalesce(r ->> 'joined_on', '') <> '' then
        begin
          v_joined := (r ->> 'joined_on')::date;
        exception when others then
          raise exception 'joined_invalid';
        end;
        if v_joined > today_ist() or v_joined < v_dob or v_joined < date '2000-01-01' then
          raise exception 'joined_invalid';
        end if;
      end if;

      v_phone := nullif(regexp_replace(coalesce(r ->> 'phone', ''), '[\s-]', '', 'g'), '');
      if v_phone is not null then
        if v_phone !~ '^\+?[0-9]{10,13}$' then raise exception 'phone_invalid'; end if;
        if exists (select 1 from students s
                    where right(regexp_replace(coalesce(s.phone, ''), '[^0-9]', '', 'g'), 10)
                        = right(regexp_replace(v_phone, '[^0-9]', '', 'g'), 10)) then
          raise exception 'duplicate_phone';
        end if;
      end if;

      v_email := nullif(btrim(coalesce(r ->> 'email', '')), '');
      if v_email is not null then
        if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(v_email) > 200 then raise exception 'email_invalid'; end if;
        if exists (select 1 from students s where lower(s.email) = lower(v_email)) then
          raise exception 'duplicate_email';
        end if;
      end if;

      v_pin := nullif(btrim(coalesce(r ->> 'pincode', '')), '');
      if v_pin is not null and v_pin !~ '^[0-9]{6}$' then raise exception 'pincode_invalid'; end if;

      v_level := coalesce(nullif(r ->> 'level_id', '')::smallint, 1);
      if v_level not in (select id from levels) then raise exception 'level_invalid'; end if;

      if exists (select 1 from students s where lower(s.full_name) = lower(v_name) and s.dob = v_dob) then
        raise exception 'duplicate_student';
      end if;

      insert into students (full_name, dob, phone, email, area, pincode, level_id, joined_on)
      values (v_name, v_dob, v_phone, v_email,
              nullif(left(btrim(coalesce(r ->> 'area', '')), 100), ''), v_pin, v_level, v_joined)
      returning id, roll_no into v_id, v_roll;
      v_out := v_out || jsonb_build_object('line', r -> 'line', 'id', v_id, 'roll_no', v_roll);
    exception when others then
      v_out := v_out || jsonb_build_object('line', r -> 'line', 'error',
        case when sqlerrm ~ '^[a-z_]+$' then sqlerrm else 'row_failed' end);
    end;
  end loop;
  return v_out;
end $$;

-- ---------------------------------------------------------------- 4. settings
insert into settings (key, value) values
  ('week_starts', '"monday"'),
  -- Placeholders for promotion (Phase 2, docs/DECISIONS.md #43): nothing reads them yet.
  ('promotion_whole_syllabus', 'true'),
  ('promotion_min_visits', '8'),
  ('promotion_visit_weeks', '8'),
  ('promotion_level_up_assessment', 'true')
on conflict (key) do nothing;

-- One meaning of "this week" for every screen: from Monday (as since 0009), or the last 7 days
-- including today (settings.week_starts = 'rolling7').
create or replace function week_start_ist() returns date
language sql stable set search_path = public as $$
  select case when (select value #>> '{}' from settings where key = 'week_starts') = 'rolling7'
              then today_ist() - 6
              else today_ist() - (extract(isodow from today_ist())::int - 1) end
$$;

-- Checks each setting the app may change, however it is written. Error codes:
--   setting_unknown   the app may not add new keys
--   setting_invalid   the value is out of range for its key (detail says the range)
--   setting_required  settings cannot be deleted from the app
create or replace function guard_setting() returns trigger
language plpgsql set search_path = public as $$
declare
  v_int int;
  v_range int4range;
begin
  if tg_op = 'DELETE' then
    if current_user in ('anon', 'authenticated') then raise exception 'setting_required'; end if;
    return old;
  end if;
  v_range := case new.key
    when 'irregular_days'        then int4range(3, 90, '[]')
    when 'inactive_days'         then int4range(7, 365, '[]')
    when 'call_due_days'         then int4range(1, 14, '[]')
    when 'retry_days'            then int4range(1, 14, '[]')
    when 'max_retries'           then int4range(1, 10, '[]')
    when 'new_joiner_weeks'      then int4range(1, 12, '[]')
    when 'promotion_min_visits'  then int4range(0, 100, '[]')
    when 'promotion_visit_weeks' then int4range(1, 52, '[]')
  end;
  if v_range is not null then
    begin
      v_int := (new.value #>> '{}')::int;
    exception when others then
      v_int := null;
    end;
    if jsonb_typeof(new.value) <> 'number' or v_int is null or not v_range @> v_int then
      raise exception 'setting_invalid' using detail = format('%s is a whole number in %s.', new.key, v_range);
    end if;
    new.value := to_jsonb(v_int);
  elsif new.key = 'week_starts' then
    if new.value #>> '{}' not in ('monday', 'rolling7') or jsonb_typeof(new.value) <> 'string' then
      raise exception 'setting_invalid' using detail = 'week_starts is "monday" or "rolling7".';
    end if;
  elsif new.key in ('promotion_whole_syllabus', 'promotion_level_up_assessment') then
    if jsonb_typeof(new.value) <> 'boolean' then
      raise exception 'setting_invalid' using detail = format('%s is true or false.', new.key);
    end if;
  elsif new.key = 'call_reasons' then
    if jsonb_typeof(new.value) <> 'array' then
      raise exception 'setting_invalid' using detail = 'call_reasons is a list of codes.';
    end if;
  elsif current_user in ('anon', 'authenticated') then
    raise exception 'setting_unknown' using detail = format('%s is not a setting the app knows.', new.key);
  end if;
  return new;
end $$;

create trigger settings_guard before insert or update or delete on settings
  for each row execute function guard_setting();

-- settings has no id column, so audit_row (0001) would have no row id: the key is the row id.
create or replace function audit_setting() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (table_name, row_id, action, changed_by, old_row, new_row)
  values ('settings', coalesce(new.key, old.key), tg_op, auth.uid(),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger audit_settings after insert or update or delete on settings
  for each row execute function audit_setting();

-- G10: saves several settings at once, Guru only; all or nothing. p_values is a JSON object of
-- key: value. A key not yet in settings is refused (setting_unknown), and Irregular must come
-- before Inactive (error irregular_after_inactive). Returns how many values changed.
create or replace function save_settings(p_values jsonb) returns int
language plpgsql security invoker set search_path = public as $$
declare
  k text;
  v jsonb;
  n int := 0;
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  for k, v in select * from jsonb_each(coalesce(p_values, '{}')) loop
    if not exists (select 1 from settings where key = k) then
      raise exception 'setting_unknown' using detail = format('%s is not a setting.', k);
    end if;
    update settings set value = v where key = k and value is distinct from v;
    if found then n := n + 1; end if;
  end loop;
  if setting_int('irregular_days') >= setting_int('inactive_days') then
    raise exception 'irregular_after_inactive' using detail = 'Days to Irregular must be fewer than days to Inactive.';
  end if;
  return n;
end $$;

-- The open window of a centre: opening before closing (error window_invalid). close_open_visits
-- (21:00 IST) closes visits left open at the closing time.
create or replace function guard_centre() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.opens_at >= new.closes_at then
    raise exception 'window_invalid' using detail = 'The class opens before it closes, on the same day.';
  end if;
  return new;
end $$;

create trigger centres_guard before insert or update on centres
  for each row execute function guard_centre();

create trigger audit_centres after insert or update or delete on centres
  for each row execute function audit_row();

-- ---------------------------------------------------------------- 5. audit log
create index audit_log_table_idx on audit_log (table_name, id desc);
create index audit_log_person_idx on audit_log (changed_by, id desc);
create index audit_log_time_idx on audit_log (changed_at desc);

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14: trigger functions are internal; the Guru's functions check the role
-- inside and are granted to signed-in people.
revoke execute on function guard_profile_admin(), guard_student_mentor(), follow_mentor_tasks(),
  guard_setting(), audit_setting(), guard_centre() from public, anon, authenticated;
revoke execute on function link_student_login(uuid, uuid), reassign_mentees(uuid[], uuid),
  import_students(jsonb), save_settings(jsonb) from public, anon, authenticated;
grant execute on function link_student_login(uuid, uuid), reassign_mentees(uuid[], uuid),
  import_students(jsonb), save_settings(jsonb) to authenticated;
-- 0002 revoked the daily job from the app roles; create or replace keeps that, said again here.
revoke execute on function refresh_student_statuses() from public, anon, authenticated;
-- The view was replaced: keep it for signed-in people, reading only (as in 0005).
revoke all on student_overview from public, anon, authenticated;
grant select on student_overview to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on column profiles.duty_hours is 'G2: when a coordinator is usually on duty, as the Guru writes it (e.g. "Mon, Thu 16:00-19:00"). Up to 120 characters. The duty roster (C20) comes in Phase 2.';
comment on function guard_profile_admin is 'Trigger: only the Guru writes duty hours; nobody changes their own role or switches themselves off; the app gives roles only to pending logins; a coordinator with mentees stays on (docs/DECISIONS.md #45).';
comment on function link_student_login is 'G2, Guru: links a pending login to a student record without a login; the person becomes that student.';
comment on function guard_student_mentor is 'Trigger: a new mentor is an active coordinator or the Guru.';
comment on function follow_mentor_tasks is 'Trigger: when the mentor changes, the student''s open call tasks of the old mentor or of nobody go to the new one (docs/DECISIONS.md #48).';
comment on function reassign_mentees is 'G2, Guru: moves the given students to another mentor; returns how many changed.';
comment on function import_students is 'G3, Guru: imports adult students from a list (Excel or CSV in the app); each row saved or refused on its own; returns the roll number or the error per row (docs/DECISIONS.md #46).';
comment on function week_start_ist is 'First day of "this week" in India: Monday, or 6 days ago when settings.week_starts = rolling7 (docs/DECISIONS.md #47).';
comment on function guard_setting is 'Trigger: checks the value of each setting the app may change; the app cannot add or delete settings (docs/DECISIONS.md #47).';
comment on function audit_setting is 'Trigger: copies every settings change to audit_log, with the key as the row id.';
comment on function save_settings is 'G10, Guru: saves several settings at once, all or nothing; Irregular must come before Inactive.';
comment on function guard_centre is 'Trigger: a centre opens before it closes.';
comment on column student_overview.days_since_visit is 'Whole days (India time) since the last visit, or, with none, since joining or since the record was made, whichever is later.';
comment on table audit_log is 'Who changed students, profiles, call logs, levels, syllabus items and ticks, materials, settings or centres, and when. Guru only (G11).';
