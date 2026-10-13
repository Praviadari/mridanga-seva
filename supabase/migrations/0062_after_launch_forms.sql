-- 0062 After-launch forms and flows (audit phase 1 of 12-10-2026: B5, B6, B7, B10; audit phase 2: F11,
-- R3-04; docs/DECISIONS.md #322, #324, #325, #326, #328, #329). PLACEHOLDER NUMBER: the lead renumbers it
-- at the merge (file name, the smoke-test block, live-replay, the checklist's probe / verify / M rows).
-- 1. B5 (#322): a create is saved once, however often Save is tapped after a lost answer. Fund entries,
--    call notes, practice, events, polls, assessments, materials, syllabus items, Ishtagoshti themes and
--    announcement replies get a request_id (uuid, unique). The app sends one per open form; a repeat
--    is refused (23505 on <table>_request_id_key) and the app reads the first row back. The three
--    functions (record_fund_entry, log_call, log_practice) get a twin with p_request_id that returns
--    the row saved earlier; the old ones stay for older apps.
-- 2. B6 P1-22 (#325): the file of an approved material can be deleted only by the Guru (the uploader
--    could delete it after approval, and "Take back" did it first).
-- 3. F11 R2-07 (#328): event attendance is changed per student (change_event_attendance), so two
--    phones marking the same event no longer undo each other's ticks.
-- 4. R3-04 (#326): the Guru deletes a student record entered by mistake (a duplicate) with a reason,
--    only when nothing hangs on it (no login, visit, call, tick, practice, loan, submission, event,
--    nomination); an Excel import can be undone the same way (import_students stamps import_id).
-- 5. B7 P1-07 (#324): phone numbers are kept in one format, E.164 (+919876543210), on student records,
--    guardians, profiles and Ishtagoshti subscribers; national Indian numbers are converted on save
--    and once now. A phone that is not a number is refused (phone_invalid).
-- 6. B10 P1-13 (#329): a parent's address gets at most 3 Ishtagoshti codes a day (all children
--    together), and the email's names are cut to letters, so the email cannot carry links or text.
-- Needs 0001-0048. Safe to run twice.

-- ---------------------------------------------------------------- 1. request ids (#322)
alter table fund_entries         add column if not exists request_id uuid;
alter table call_logs            add column if not exists request_id uuid;
alter table practice_logs        add column if not exists request_id uuid;
alter table events               add column if not exists request_id uuid;
alter table polls                add column if not exists request_id uuid;
alter table assessments          add column if not exists request_id uuid;
alter table materials            add column if not exists request_id uuid;
alter table syllabus_items       add column if not exists request_id uuid;
alter table ig_themes            add column if not exists request_id uuid;
alter table announcement_replies add column if not exists request_id uuid;
create unique index if not exists fund_entries_request_id_key         on fund_entries (request_id);
create unique index if not exists call_logs_request_id_key            on call_logs (request_id);
create unique index if not exists practice_logs_request_id_key        on practice_logs (request_id);
create unique index if not exists events_request_id_key               on events (request_id);
create unique index if not exists polls_request_id_key                on polls (request_id);
create unique index if not exists assessments_request_id_key          on assessments (request_id);
create unique index if not exists materials_request_id_key            on materials (request_id);
create unique index if not exists syllabus_items_request_id_key       on syllabus_items (request_id);
create unique index if not exists ig_themes_request_id_key            on ig_themes (request_id);
create unique index if not exists announcement_replies_request_id_key on announcement_replies (request_id);

-- The tables written with column rights (0008, 0016, 0022) take the id too; nobody may change it.
grant insert (request_id) on events to authenticated;
grant insert (request_id) on polls to authenticated;
grant insert (request_id) on assessments to authenticated;
grant insert (request_id) on announcement_replies to authenticated;

-- The three functions' rows take the id from the transaction (set by the twins below), so the
-- functions themselves stay as they are.
create or replace function stamp_request_id() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.request_id is null then
    new.request_id := nullif(current_setting('app.request_id', true), '')::uuid;
  end if;
  return new;
end $$;
drop trigger if exists fund_entries_stamp_request_id on fund_entries;
create trigger fund_entries_stamp_request_id before insert on fund_entries
  for each row execute function stamp_request_id();
drop trigger if exists call_logs_stamp_request_id on call_logs;
create trigger call_logs_stamp_request_id before insert on call_logs
  for each row execute function stamp_request_id();
drop trigger if exists practice_logs_stamp_request_id on practice_logs;
create trigger practice_logs_stamp_request_id before insert on practice_logs
  for each row execute function stamp_request_id();

-- record_fund_entry once per request: the entry saved earlier with p_request_id by the caller, else a
-- new one (0026's checks and notices). Errors: request_id_required and 0026's.
create or replace function record_fund_entry(p_request_id uuid, p_direction text, p_category smallint, p_on_date date,
                                             p_amount_paise bigint, p_party text default null, p_reference text default null,
                                             p_note text default null, p_bill_path text default null,
                                             p_bill_name text default null) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id bigint;
begin
  if p_request_id is null then raise exception 'request_id_required'; end if;
  select id into v_id from fund_entries where request_id = p_request_id and created_by = auth.uid();
  if found then return v_id; end if;
  perform set_config('app.request_id', p_request_id::text, true);
  v_id := record_fund_entry(p_direction, p_category, p_on_date, p_amount_paise, p_party, p_reference, p_note,
                            p_bill_path, p_bill_name);
  perform set_config('app.request_id', '', true);
  return v_id;
end $$;

-- log_call once per request (0037's rules: tasks, status, retries happen once).
create or replace function log_call(p_request_id uuid, p_student uuid, p_outcome call_outcome, p_reason text,
                                    p_comment text, p_next_date date default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  if p_request_id is null then raise exception 'request_id_required'; end if;
  select id into v_id from call_logs where request_id = p_request_id and coordinator_id = auth.uid();
  if found then return v_id; end if;
  perform set_config('app.request_id', p_request_id::text, true);
  v_id := log_call(p_student, p_outcome, p_reason, p_comment, p_next_date);
  perform set_config('app.request_id', '', true);
  return v_id;
end $$;

-- log_practice once per request (a Stop tapped again after a lost answer).
create or replace function log_practice(p_request_id uuid, p_minutes int, p_source text, p_practised_on date default null,
                                        p_started_at timestamptz default null, p_taal bigint default null,
                                        p_note text default null) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id bigint;
begin
  if p_request_id is null then raise exception 'request_id_required'; end if;
  select id into v_id from practice_logs where request_id = p_request_id and student_id = my_student_id();
  if found then return v_id; end if;
  perform set_config('app.request_id', p_request_id::text, true);
  v_id := log_practice(p_minutes, p_source, p_practised_on, p_started_at, p_taal, p_note);
  perform set_config('app.request_id', '', true);
  return v_id;
end $$;

-- ---------------------------------------------------------------- 2. an approved material's file (#325)
-- 0013: the uploader or the Guru. Now: the Guru, or the uploader while no approved material lists it.
create or replace function material_file_deletable(p_name text) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select is_guru()
      or (is_staff() and split_part(p_name, '/', 1) = auth.uid()::text
          and not exists (select 1 from materials m where m.storage_path = p_name and m.approved_by is not null))
$$;

-- ---------------------------------------------------------------- 3. event attendance per student (#328)
-- C16: marks the students in p_came as having come and those in p_not_came as not, and leaves every
-- other tick as it is (mark_event_attendance replaced the whole list, so a second phone undid the
-- first's ticks). Same rules as 0033's mark_event_attendance. Returns how many came now. Errors:
-- not_allowed, event_not_found, event_cancelled, too_early, student_invalid.
create or replace function change_event_attendance(p_event bigint, p_came uuid[], p_not_came uuid[]) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_event  events;
  v_came   uuid[] := array(select distinct x from unnest(coalesce(p_came, '{}')) x);
  v_gone   uuid[] := array(select distinct x from unnest(coalesce(p_not_came, '{}')) x);
  v_centre int;
  v_n      int;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select * into v_event from events where id = p_event for update;
  if not found then raise exception 'event_not_found'; end if;
  if v_event.cancelled_at is not null then raise exception 'event_cancelled'; end if;
  v_centre := coalesce(v_event.centre_id::int, person_centre(auth.uid()));
  if local_day(v_event.starts_at, v_centre) > centre_today(v_centre) then raise exception 'too_early'; end if;
  if exists (select 1 from unnest(v_came || v_gone) x where not exists (select 1 from students s where s.id = x)) then
    raise exception 'student_invalid';
  end if;
  -- A student in both lists: the tick wins.
  delete from event_attendance ea where ea.event_id = p_event and ea.student_id = any (v_gone) and not (ea.student_id = any (v_came));
  insert into event_attendance (event_id, student_id, marked_by)
  select p_event, x, auth.uid() from unnest(v_came) x
  on conflict (event_id, student_id) do nothing;
  select count(*)::int into v_n from event_attendance where event_id = p_event;
  return v_n;
end $$;

-- ---------------------------------------------------------------- 4. a record entered by mistake (#326)
-- The import a record came from (G3), so the Guru can undo an import. Only the Guru's import sets it;
-- nobody changes it later.
alter table students add column if not exists import_id uuid;
create index if not exists students_import_idx on students (import_id) where import_id is not null;

create or replace function guard_student_import_id() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.import_id is not null and not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  elsif new.import_id is distinct from old.import_id then
    raise exception 'import_id_frozen';
  end if;
  return new;
end $$;
drop trigger if exists students_import_id_guard on students;
create trigger students_import_id_guard before insert or update of import_id on students
  for each row execute function guard_student_import_id();

-- Why a student record cannot be deleted as a mistake, or null when nothing hangs on it: a login
-- (student_linked), a withdrawal (student_withdrawn: that record stays), visits (student_visited), or
-- anything recorded about the student (student_has_history: a call, a syllabus tick, practice, an
-- instrument loan, an assessment submission, an event, a promotion nomination). What is made with the
-- record (guardians, consents, About-you details, tasks, status and level history, assessments given
-- to a level) goes with it. Internal.
create or replace function student_record_in_use(p_student uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when s.profile_id is not null then 'student_linked'
    when s.withdrawn_at is not null then 'student_withdrawn'
    when exists (select 1 from visits v where v.student_id = s.id) then 'student_visited'
    when exists (select 1 from call_logs c where c.student_id = s.id)
      or exists (select 1 from student_progress p where p.student_id = s.id)
      or exists (select 1 from practice_logs p where p.student_id = s.id)
      or exists (select 1 from inventory_loans l where l.student_id = s.id)
      or exists (select 1 from assessment_submissions sub join assessment_assignments a on a.id = sub.assignment_id
                  where a.student_id = s.id)
      or exists (select 1 from event_attendance e where e.student_id = s.id)
      or exists (select 1 from event_performers e where e.student_id = s.id)
      or exists (select 1 from promotion_nominations n where n.student_id = s.id)
      then 'student_has_history'
  end
  from students s where s.id = p_student
$$;

-- Deletes one record and writes the reason on its audit-log row (the row keeps the record's copy).
-- Internal: the two functions below check the caller.
create or replace function delete_record_as_mistake(p_student uuid, p_reason text, p_kind text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_roll text;
  v_why  text := student_record_in_use(p_student);
begin
  if v_why is not null then raise exception '%', v_why; end if;
  delete from students where id = p_student returning roll_no into v_roll;
  if not found then raise exception 'student_not_found'; end if;
  update audit_log set new_row = jsonb_build_object('reason', p_reason, 'deleted_as', p_kind)
   where id = (select max(id) from audit_log where table_name = 'students' and row_id = p_student::text and action = 'DELETE');
  return v_roll;
end $$;

-- R3-04, the Guru: deletes a record entered by mistake (a duplicate). Refused when anything hangs on
-- it (student_record_in_use): then the records are kept and the Guru asks Praveen (docs/OPERATIONS.md).
-- Returns the roll number, never given again. Errors: not_allowed, reason_required, reason_too_long,
-- student_not_found, student_linked, student_withdrawn, student_visited, student_has_history.
create or replace function delete_student_record(p_student uuid, p_reason text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, ''), E' \t\r\n'), '');
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 3 then raise exception 'reason_required'; end if;
  if char_length(v_reason) > 500 then raise exception 'reason_too_long'; end if;
  perform 1 from students where id = p_student for update;
  if not found then raise exception 'student_not_found'; end if;
  return delete_record_as_mistake(p_student, v_reason, 'duplicate');
end $$;

-- R3-04, the Guru: undoes an Excel import. Every record of it that nothing hangs on is deleted; the
-- others are kept and listed with why. Returns { deleted, kept: [{ roll_no, full_name, reason }] }.
-- Errors: not_allowed, import_not_found.
create or replace function undo_import(p_import uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r       record;
  v_why   text;
  v_done  int := 0;
  v_kept  jsonb := '[]'::jsonb;
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_import is null or not exists (select 1 from students where import_id = p_import) then
    raise exception 'import_not_found';
  end if;
  for r in select id, roll_no, full_name from students where import_id = p_import order by roll_no for update loop
    v_why := student_record_in_use(r.id);
    if v_why is null then
      perform delete_record_as_mistake(r.id, 'Excel import undone', 'import_undone');
      v_done := v_done + 1;
    else
      v_kept := v_kept || jsonb_build_object('roll_no', r.roll_no, 'full_name', r.full_name, 'reason', v_why);
    end if;
  end loop;
  return jsonb_build_object('deleted', v_done, 'kept', v_kept);
end $$;

-- 0047's import_students, also keeping the import's id (each row's import_id, one per import in the
-- app) and normalising the phone (part 5). Otherwise unchanged.
create or replace function import_students(p_rows jsonb) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
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
  v_import uuid;
  v_id     uuid;
  v_roll   text;
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'too_many_rows' using detail = 'At most 500 rows in one import.';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      v_name := clean_person_name(r ->> 'full_name', 100);

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
        v_phone := phone_e164(v_phone);
        if v_phone is null then raise exception 'phone_invalid'; end if;
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

      begin
        v_import := nullif(r ->> 'import_id', '')::uuid;
      exception when others then
        v_import := null;
      end;

      insert into students (full_name, dob, phone, email, area, pincode, level_id, joined_on, import_id)
      values (v_name, v_dob, v_phone, v_email,
              nullif(left(btrim(coalesce(r ->> 'area', '')), 100), ''), v_pin, v_level, v_joined, v_import)
      returning id, roll_no into v_id, v_roll;
      v_out := v_out || jsonb_build_object('line', r -> 'line', 'id', v_id, 'roll_no', v_roll);
    exception when others then
      v_out := v_out || jsonb_build_object('line', r -> 'line', 'error',
        case when sqlerrm ~ '^[a-z_]+$' then sqlerrm else 'row_failed' end);
    end;
  end loop;
  return v_out;
end $$;

-- ---------------------------------------------------------------- 5. phones in one format (#324)
-- A phone number as E.164 ('+919876543210'), or null when it is not one. Spaces, dashes, dots and
-- brackets are dropped; 00 at the start is read as +; a national number without a country code is
-- read as an Indian one (the class's country: 10 digits, or 11 with a leading 0, or 12 starting 91).
-- The app sends E.164 since #324 (lib/phone.ts toE164, the centre's country); this catches older apps,
-- the import and the dashboard.
create or replace function phone_e164(p_phone text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case
    when v ~ '^\+[1-9][0-9]{6,14}$' then v
    when v ~ '^00[1-9][0-9]{6,14}$' then '+' || substr(v, 3)
    when v ~ '^0?[1-9][0-9]{9}$' then '+91' || right(v, 10)
    when v ~ '^91[1-9][0-9]{9}$' then '+' || v
  end
  from (select regexp_replace(btrim(coalesce(p_phone, '')), '[\s().-]', '', 'g') as v) x
$$;

-- Trigger: the row's phone is kept as E.164; empty = null; not a number = phone_invalid. An unchanged
-- old value is left as it is, so editing other fields of an old record never fails on its phone.
create or replace function keep_phone_e164() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_new text := nullif(btrim(coalesce(new.phone, '')), '');
begin
  if tg_op = 'UPDATE' and new.phone is not distinct from old.phone then return new; end if;
  if v_new is null then
    new.phone := null;
  else
    new.phone := phone_e164(v_new);
    if new.phone is null then
      raise exception 'phone_invalid' using detail = 'A phone number with its country code, e.g. +91 98765 43210.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists students_phone_e164 on students;
create trigger students_phone_e164 before insert or update of phone on students
  for each row execute function keep_phone_e164();
drop trigger if exists guardians_phone_e164 on guardians;
create trigger guardians_phone_e164 before insert or update of phone on guardians
  for each row execute function keep_phone_e164();
drop trigger if exists profiles_phone_e164 on profiles;
create trigger profiles_phone_e164 before insert or update of phone on profiles
  for each row execute function keep_phone_e164();
drop trigger if exists ig_subscribers_phone_e164 on ig_subscribers;
create trigger ig_subscribers_phone_e164 before insert or update of phone on ig_subscribers
  for each row execute function keep_phone_e164();

-- Once: the numbers already stored that can be read are written as E.164 (the rest stay as they are;
-- docs/OPERATIONS.md "Phones that are not E.164" lists them). Only rows that change are touched.
update students  set phone = phone_e164(phone) where phone_e164(phone) is not null and phone <> phone_e164(phone);
update guardians set phone = phone_e164(phone) where phone_e164(phone) is not null and phone <> phone_e164(phone);
update profiles  set phone = phone_e164(phone) where phone_e164(phone) is not null and phone <> phone_e164(phone);
update ig_subscribers set phone = phone_e164(phone) where phone_e164(phone) is not null and phone <> phone_e164(phone);

-- ---------------------------------------------------------------- 6. the parent's code email (#329)
-- A name for the parent email's text: control characters, digits and every ASCII sign but ' and -
-- dropped, white space made single spaces, at most p_max characters. So the text carries no link
-- (no : / . @) and no lines of the sender's own; letters and marks of every script stay.
create or replace function name_for_email(p_text text, p_max int) returns text
language sql immutable set search_path = public, pg_temp as $$
  select nullif(left(btrim(regexp_replace(
           regexp_replace(coalesce(p_text, ''), '[[:cntrl:]0-9!"#$%&()*+,./:;<=>?@\[\\\]^_`{|}~]', ' ', 'g'),
           '\s+', ' ', 'g')), p_max), '')
$$;

-- 0027's ig_send_parent_code, plus: at most 3 codes a day to one parent address, whoever asks
-- (code_parent_limit), and the names in the text cut to letters. Otherwise unchanged.
create or replace function ig_send_parent_code() returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_me    uuid := auth.uid();
  v_row   ig_subscribers;
  v_code  ig_parent_codes;
  v_child text;
  v_key   text;
  v_from  text;
  v_new   text;
  v_text  text;
begin
  select * into v_row from ig_subscribers where profile_id = v_me;
  if not found or coalesce(my_role() <> 'pending', true) or v_row.blocked_at is not null
     or not v_row.minor or v_row.parent_confirmed_at is not null then
    raise exception 'not_awaiting_parent' using errcode = '42501';
  end if;
  select * into v_code from ig_parent_codes where profile_id = v_me;
  if found and v_code.sent_at > now() - interval '1 minute' then raise exception 'code_too_soon'; end if;
  if found and v_code.sends_day = today_ist() and v_code.sends >= 3 then raise exception 'code_limit'; end if;
  if (select coalesce(sum(c.sends), 0) from ig_parent_codes c join ig_subscribers s on s.profile_id = c.profile_id
       where c.sends_day = today_ist() and lower(s.parent_email) = lower(v_row.parent_email)) >= 3 then
    raise exception 'code_parent_limit';
  end if;
  if (select coalesce(sum(sends), 0) from ig_parent_codes where sends_day = today_ist()) >= 100 then
    raise exception 'code_daily_cap';
  end if;

  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'net' and p.proname = 'http_post')
     or to_regclass('vault.decrypted_secrets') is null then
    return 'not_set_up';
  end if;
  -- Read through dynamic SQL, so this function can be created before the Vault is there.
  execute $q$select max(decrypted_secret) filter (where name = 'mridanga_brevo_key'),
                    max(decrypted_secret) filter (where name = 'mridanga_mail_from')
               from vault.decrypted_secrets$q$
     into v_key, v_from;
  if v_key is null or v_from is null then return 'not_set_up'; end if;

  select name_for_email(full_name, 80) into v_child from profiles where id = v_me;
  v_new := ig_new_parent_code(v_me);
  -- PLACEHOLDER wording (docs/DECISIONS.md #88): the team gives the real parent consent text.
  v_text := 'Dear ' || coalesce(name_for_email(v_row.parent_name, 100), 'parent') || E',\n\n'
    || coalesce(v_child, 'Your child') || ' (born ' || v_row.birth_year || ') has asked to join Ishtagoshti, '
    || E'the free sloka study of the Mridanga Seva app, and gave this email address as their parent''s.\n\n'
    || E'[TEST - the team''s parent consent wording comes here.]\n\n'
    || 'If you agree, give your child this code to type into the app: ' || v_new
    || E'\nIt works for 24 hours. If you do not agree, do nothing: nothing opens without the code.\n\nMridanga Seva';
  -- pg_net sends after this transaction ends; the answer stays in net._http_response for a while.
  execute $q$select net.http_post(
                url := 'https://api.brevo.com/v3/smtp/email',
                headers := jsonb_build_object('Content-Type', 'application/json', 'api-key', $1),
                body := $2,
                timeout_milliseconds := 30000)$q$
    using v_key, jsonb_build_object(
      'sender', jsonb_build_object('name', 'Mridanga Seva', 'email', v_from),
      'to', jsonb_build_array(jsonb_build_object('email', v_row.parent_email,
                                                 'name', coalesce(name_for_email(v_row.parent_name, 100), 'Parent'))),
      'subject', 'Mridanga Seva: your child asks to join Ishtagoshti',
      'textContent', v_text);
  return 'sent';
end $$;

-- ---------------------------------------------------------------- who may run them
revoke execute on function stamp_request_id(), guard_student_import_id(), keep_phone_e164(),
  student_record_in_use(uuid), delete_record_as_mistake(uuid, text, text)
  from public, anon, authenticated;
revoke execute on function
  record_fund_entry(uuid, text, smallint, date, bigint, text, text, text, text, text),
  log_call(uuid, uuid, call_outcome, text, text, date),
  log_practice(uuid, int, text, date, timestamptz, bigint, text),
  change_event_attendance(bigint, uuid[], uuid[]), delete_student_record(uuid, text), undo_import(uuid),
  phone_e164(text)
  from public, anon;
-- phone_e164 runs as the person saving (the phone trigger, the Guru's import); name_for_email only
-- inside ig_send_parent_code (the owner's).
grant execute on function
  record_fund_entry(uuid, text, smallint, date, bigint, text, text, text, text, text),
  log_call(uuid, uuid, call_outcome, text, text, date),
  log_practice(uuid, int, text, date, timestamptz, bigint, text),
  change_event_attendance(bigint, uuid[], uuid[]), delete_student_record(uuid, text), undo_import(uuid),
  phone_e164(text)
  to authenticated;
revoke execute on function name_for_email(text, int) from public, anon, authenticated;

-- ---------------------------------------------------------------- descriptions
comment on function stamp_request_id is 'Trigger: a fund entry, call note or practice row made inside a request-id call keeps that id (#322).';
comment on function record_fund_entry(uuid, text, smallint, date, bigint, text, text, text, text, text) is 'Fund: record_fund_entry once per request id: a repeat returns the entry saved first (#322).';
comment on function log_call(uuid, uuid, call_outcome, text, text, date) is 'C11: log_call once per request id: a repeat returns the call saved first and changes nothing (#322).';
comment on function log_practice(uuid, int, text, date, timestamptz, bigint, text) is 'S5/S6: log_practice once per request id: a repeat returns the entry saved first (#322).';
comment on function material_file_deletable is 'Storage rule: the Guru, or the uploader while no approved material lists the file, may delete it (#325).';
comment on function change_event_attendance is 'C16, staff: marks some students as came and some as not, leaving every other tick (#328).';
comment on function guard_student_import_id is 'Trigger: only the Guru''s import sets a record''s import_id; nobody changes it (#326).';
comment on function student_record_in_use is 'Why a record cannot be deleted as a mistake (a login, a withdrawal, a visit, anything recorded), or null (#326). Internal.';
comment on function delete_record_as_mistake is 'Deletes an unused record and writes the reason on its audit-log row (#326). Internal.';
comment on function delete_student_record is 'R3-04, the Guru: deletes a record entered by mistake (a duplicate) when nothing hangs on it, with a reason (#326).';
comment on function undo_import is 'R3-04, the Guru: deletes the records of an Excel import that nothing hangs on; lists the others (#326).';
comment on function import_students is 'G3, the Guru: imports adult students (at most 500 rows); each row''s result; keeps the import id and E.164 phones (#324, #326).';
comment on function phone_e164 is 'A phone number as E.164, or null; a national number is read as Indian (#324).';
comment on function keep_phone_e164 is 'Trigger: a changed phone is kept as E.164 (phone_invalid when it is not a number) (#324).';
comment on function name_for_email is 'A name cut to letters, marks, spaces and . '' - for an email''s text (#329).';
comment on function ig_send_parent_code is 'I14, minors: emails a new code to the parent (1 a minute, 3 a day per child and per parent address, 100 a day in all) through pg_net + Brevo; returns sent or not_set_up (#329).';
comment on column students.import_id is 'The Excel import (G3) the record came from; undo_import deletes its unused records (#326).';
