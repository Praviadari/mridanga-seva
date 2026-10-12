-- 0047 Form rules in SQL (audit phase 1 of 12-10-2026, brief B1: P1-01, P1-08, P1-12, P1-05, P1-06;
-- docs/DECISIONS.md #271-#274; docs/DATABASE.md "Names" and "Registering a student").
-- 1. P1-01: a student under 18 needs a parent or guardian WITH A PHONE on record, and a current data
--    consent given through a guardian OF THE SAME STUDENT. Checked at commit when a student is added,
--    the date of birth changes (an adult made a minor through the API was not checked before) or a
--    withdrawn record comes back, and, as since 0025/0028, when a consent or guardian changes or goes.
--    A consent naming another student's guardian is refused (consent_guardian_mismatch).
-- 2. P1-08: one name rule, clean_person_name() (#271): NFC, typographic apostrophes made ', blanks
--    made one space; letters of the Latin (with IAST marks), Cyrillic and Indian scripts with their
--    vowel signs, ZWJ/ZWNJ inside a word, space . ' - ; no digits of any of these scripts, no
--    symbols, no control or invisible characters. Used by the sign-up (handle_new_user, which only
--    trimmed), a name change (guard_profile_details), and by triggers on every other person-name
--    column written by an app user: students, guardians, the emergency contact, the Ishtagoshti
--    parent. The staff-name clash (name_taken) stays for logins' names only.
-- 3. P1-12: a student's own About you no longer changes a gender already on their record; staff do.
-- 4. P1-05: a student added at the desk (or by the import) gets the registering coordinator's centre,
--    not centre 1.
-- 5. P1-06: possible_duplicates(name, dob, phone), staff only, for a "Possible duplicate" warning.
-- Rows already stored are not re-checked: the name rules run when a name is written or changed, the
-- minor rule when the student, a consent or a guardian changes.
-- Needs 0001-0045 (0046 is not used). Safe to run twice.

-- ---------------------------------------------------------------- 2. the name rule (#271)
-- The characters a person's name may hold, as the inside of a regular-expression bracket. The app
-- mirrors this list exactly (lib, forms-fix); change both together.
--   Latin        A-Z a-z, U+00C0-U+024F letters (not × ÷), U+1E00-U+1EFF (IAST ā ṛ ṣ ṇ ḍ ṭ ḥ ṁ),
--                U+0300-U+036F combining accents
--   Cyrillic     U+0400-U+0481, U+048A-U+04FF
--   Indian       U+0900-U+0DFF (Devanagari, Bengali, Gurmukhi, Gujarati, Oriya, Tamil, Telugu,
--                Kannada, Malayalam, Sinhala) WITHOUT their digits, fraction and number signs,
--                dandas, abbreviation and currency signs
--   Joiners      U+200C ZWNJ, U+200D ZWJ (only between two letters, checked apart)
--   Punctuation  space . ' -
create or replace function person_name_chars() returns text
language sql immutable set search_path = public, pg_temp as $$
  select 'A-Za-z .''\-'
      || '\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u024f\u1e00-\u1eff\u0300-\u036f'
      || '\u0400-\u0481\u048a-\u04ff'
      || '\u0900-\u0963\u0971-\u097f'                          -- Devanagari: not ।॥ ०-९ ॰
      || '\u0980-\u09e5\u09f0\u09f1\u09fc\u09fe'               -- Bengali: not ০-৯, ৲-৻, ৽
      || '\u0a00-\u0a65\u0a70-\u0a75'                          -- Gurmukhi: not ੦-੯, ੶
      || '\u0a80-\u0ae5\u0af9-\u0aff'                          -- Gujarati: not ૦-૯, ૰ ૱
      || '\u0b00-\u0b65\u0b71'                                 -- Oriya: not ୦-୯, ୰, ୲-୷
      || '\u0b80-\u0be5'                                       -- Tamil: not ௦-௺
      || '\u0c00-\u0c65'                                       -- Telugu: not ౦-౯, ౷-౿
      || '\u0c80-\u0c83\u0c85-\u0ce5\u0cf1-\u0cf3'             -- Kannada: not ಄, ೦-೯
      || '\u0d00-\u0d4e\u0d54-\u0d57\u0d5f-\u0d63\u0d7a-\u0d7f' -- Malayalam: not ൏, ൘-൞, ൦-൹
      || '\u0d80-\u0de5\u0df0-\u0df3'                          -- Sinhala: not ෦-෯, ෴
      || '\u200c\u200d'
$$;

-- Cleans and checks one person's name; returns the name to store. Errors (the codes the app knows):
--   name_required   nothing left after cleaning
--   name_too_long   more than p_max characters after cleaning (80 for a login, 100 for a student
--                   record or a parent, as before)
--   name_invalid    a character outside person_name_chars() (a digit, a symbol, a control or
--                   invisible character), a joiner not between two letters, or no letter at all
-- Cleaning, in this order: Unicode NFC; the apostrophes U+2018 U+2019 U+02BC become U+0027; every
-- run of spaces inside (also the no-break spaces U+00A0 U+2007 U+202F) becomes one space; spaces,
-- tabs and line breaks at both ends go. A tab or line break INSIDE a name is refused, as before.
create or replace function clean_person_name(p_name text, p_max integer default 80) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v text := coalesce(p_name, '');
begin
  v := normalize(v);
  v := translate(v, chr(8216) || chr(8217) || chr(700), '''''''');
  v := btrim(regexp_replace(v, '[ \u00a0\u2007\u202f]+', ' ', 'g'), E' \t\r\n');
  if v = '' then raise exception 'name_required'; end if;
  if char_length(v) > p_max then
    raise exception 'name_too_long' using detail = format('A name is at most %s characters.', p_max);
  end if;
  if v ~ ('[^' || person_name_chars() || ']') then
    raise exception 'name_invalid'
      using detail = 'A name holds letters, spaces and . '' - only: no digits, symbols or hidden characters.';
  end if;
  if v ~ E'(^|[ .''\\-\u200c\u200d])[\u200c\u200d]' or v ~ E'[\u200c\u200d]($|[ .''\\-])' then
    raise exception 'name_invalid' using detail = 'A joiner (ZWJ, ZWNJ) belongs between two letters.';
  end if;
  if v !~ E'[A-Za-z\u00c0-\u024f\u1e00-\u1eff\u0400-\u04ff\u0900-\u0dff]' then
    raise exception 'name_invalid' using detail = 'A name holds at least one letter.';
  end if;
  return v;
end $$;

-- Trigger: the name column tg_argv[0] of a row written by an app user (signed in: auth.uid() is
-- set, also inside the app's own functions) is cleaned and checked, at most tg_argv[1] characters;
-- tg_argv[2], when given, replaces the error code (the Ishtagoshti form's parent_name_invalid). Null
-- stays null (whether a name is required is decided where it is written); an unchanged name is not
-- checked again, so names stored before 0047 stay as they are until edited. The dashboard and
-- pg_cron (nobody signed in) are not checked.
create or replace function clean_name_column() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_col  text := tg_argv[0];
  v_new  text := to_jsonb(new) ->> tg_argv[0];
  v_name text;
begin
  if auth.uid() is null or v_new is null then return new; end if;
  if tg_op = 'UPDATE' and v_new is not distinct from (to_jsonb(old) ->> v_col) then return new; end if;
  begin
    v_name := clean_person_name(v_new, tg_argv[1]::int);
  exception when raise_exception then
    if tg_nargs > 2 then raise exception '%', tg_argv[2]; end if;
    raise;
  end;
  if v_name is distinct from v_new then
    new := jsonb_populate_record(new, jsonb_build_object(v_col, v_name));
  end if;
  return new;
end $$;

drop trigger if exists students_name_clean on students;
create trigger students_name_clean before insert or update of full_name on students
  for each row execute function clean_name_column('full_name', '100');
drop trigger if exists guardians_name_clean on guardians;
create trigger guardians_name_clean before insert or update of full_name on guardians
  for each row execute function clean_name_column('full_name', '100');
drop trigger if exists person_details_name_clean on person_details;
create trigger person_details_name_clean before insert or update of emergency_name on person_details
  for each row execute function clean_name_column('emergency_name', '80');
drop trigger if exists ig_subscribers_name_clean on ig_subscribers;
create trigger ig_subscribers_name_clean before insert or update of parent_name on ig_subscribers
  for each row execute function clean_name_column('parent_name', '100', 'parent_name_invalid');

-- A login's name: 0028's guard, with the name rule above (it refused only control and invisible
-- characters) and the staff-name clash as before. Otherwise unchanged.
create or replace function guard_profile_details() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.id is distinct from old.id then
      raise exception 'profile_field_locked' using detail = 'id';
    end if;
    if new.email is distinct from old.email then
      raise exception 'profile_field_locked' using detail = 'email: it follows the sign-in email.';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception 'profile_field_locked' using detail = 'created_at';
    end if;
    if new.centre_id is distinct from old.centre_id then
      raise exception 'profile_field_locked' using detail = 'centre_id: set in the dashboard.';
    end if;
  end if;

  if auth.uid() is null then return new; end if;
  if new.full_name is distinct from old.full_name then
    new.full_name := clean_person_name(new.full_name, 80);
    if staff_name_taken(new.id, new.full_name) then
      raise exception 'name_taken' using detail = 'This is the name of the Guru or a coordinator. Add a surname or an initial.';
    end if;
  end if;
  if new.phone is distinct from old.phone then
    new.phone := nullif(btrim(new.phone), '');
    if new.phone !~ '^\+?[0-9 ]+$'
       or char_length(regexp_replace(new.phone, '[^0-9]', '', 'g')) not between 7 and 15 then
      raise exception 'phone_invalid' using detail = 'A phone number has 7 to 15 digits, with spaces and an optional + first.';
    end if;
  end if;
  return new;
end $$;

-- Sign-up: 0036's handle_new_user, with the name rule and the staff-name clash for a name given at
-- sign-up (it only trimmed and cut at 80). A login made without a name (the dashboard) keeps an
-- empty one, as before. A refused name refuses the sign-up; the app checks the same rule first.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_meta   jsonb := coalesce(new.raw_user_meta_data, '{}');
  v_lang   text := v_meta ->> 'language';
  v_gender text := v_meta ->> 'gender';
  v_name   text := coalesce(v_meta ->> 'full_name', '');
  v_centre int;
  v_dob    date;
  v_phone  text := regexp_replace(coalesce(v_meta ->> 'phone', ''), '[\s-]', '', 'g');
  v_diksha text := nullif(left(btrim(coalesce(v_meta ->> 'diksha_name', ''), E' \t\r\n'), 80), '');
  v_learn  text[];
begin
  if btrim(v_name, E' \t\r\n') <> '' then
    v_name := clean_person_name(v_name, 80);
    if staff_name_taken(new.id, v_name) then
      raise exception 'name_taken' using detail = 'This is the name of the Guru or a coordinator. Add a surname or an initial.';
    end if;
  else
    v_name := '';
  end if;
  begin
    v_dob := (v_meta ->> 'dob')::date;
    if v_dob > current_date or v_dob < date '1900-01-01' or v_dob > current_date - interval '18 years' then
      v_dob := null;
    end if;
  exception when others then v_dob := null;
  end;
  begin
    v_centre := (v_meta ->> 'centre_id')::int;
  exception when others then v_centre := null;
  end;
  if v_centre is not null and not exists (select 1 from centres where id = v_centre and active) then
    v_centre := null;
  end if;
  if v_gender is not null and not option_ok('gender', v_gender) then v_gender := null; end if;
  if v_phone !~ '^\+[1-9][0-9]{6,14}$' then v_phone := null; end if;
  if v_diksha ~ '[\u0001-\u001f\u007f-\u009f\u200b\u200e\u200f\u2028-\u202e\u2060-\u2064\ufeff]' then v_diksha := null; end if;
  if jsonb_typeof(v_meta -> 'learn') = 'array' then
    select coalesce(array_agg(distinct x), '{}') into v_learn
      from jsonb_array_elements_text(v_meta -> 'learn') x where option_ok('instrument', x);
  end if;

  insert into profiles (id, email, full_name, role, language, gender, centre_id, phone)
  values (new.id, new.email, v_name, 'pending',
          case when v_lang in ('en', 'te', 'hi') then v_lang else 'en' end, v_gender,
          coalesce(v_centre, (select min(id) from centres where active), 1), v_phone);
  if v_dob is not null or v_diksha is not null or cardinality(v_learn) > 0 then
    insert into person_details (profile_id, dob, diksha_name, learn_interests)
    values (new.id, v_dob, v_diksha, coalesce(v_learn, '{}'));
  end if;
  if new.email_confirmed_at is not null then
    perform link_login_to_student(new.id, new.email);
  end if;
  return new;
end $$;

-- The Excel/CSV import (G3): 0014's import_students with the name rule (100 characters, as before)
-- before the duplicate check, so "same name and date of birth" compares cleaned names. Otherwise
-- unchanged; a refused name is the row's error (name_required, name_too_long, name_invalid).
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

-- ---------------------------------------------------------------- 1. a minor's guardian (#272)
-- Why a student's record breaks the minor rule, or null when it does not (adults, withdrawn records,
-- records gone). A minor needs a guardian with a phone, and a current data consent whose guardian is
-- one of this student's guardians (0003's consent alone could name nobody, or another child's parent).
create or replace function minor_rule_gap(p_student uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when not exists (select 1 from consents c where c.student_id = s.id and c.scope = 'data' and c.revoked_at is null)
      then 'minor_needs_consent'
    when not exists (select 1 from guardians g where g.student_id = s.id and coalesce(btrim(g.phone), '') <> '')
      then 'minor_needs_guardian'
    when not exists (select 1 from consents c join guardians g on g.id = c.guardian_id and g.student_id = c.student_id
                      where c.student_id = s.id and c.scope = 'data' and c.revoked_at is null)
      then 'minor_needs_consent'
  end
    from students s
   where s.id = p_student and s.withdrawn_at is null and is_minor(s)
$$;

-- At commit, when a student is added, the date of birth changes or a withdrawal is undone (0003's
-- trigger, now also on withdrawn_at). Refusals name the roll number only (0039, D4-17).
create or replace function check_minor_consent() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_gap text := minor_rule_gap(new.id);
begin
  if v_gap = 'minor_needs_guardian' then
    raise exception 'minor_needs_guardian'
      using detail = format('Student %s is under 18 and has no parent or guardian with a phone on record.', coalesce(new.roll_no, 'without roll number')),
            hint = 'Record the parent and their written consent in the same step (register_student).';
  elsif v_gap = 'minor_needs_consent' then
    raise exception 'minor_needs_consent'
      using detail = format('Student %s is under 18 and has no parental consent on record.', coalesce(new.roll_no, 'without roll number')),
            hint = 'Record the parent and their written consent in the same step (register_student).';
  end if;
  return null;
end $$;
drop trigger if exists students_minor_consent on students;
create constraint trigger students_minor_consent
  after insert or update of dob, withdrawn_at on students
  deferrable initially deferred
  for each row execute function check_minor_consent();

-- At commit, when a consent or guardian changes or goes (0025, 0028), with the same rule.
create or replace function recheck_minor_consent() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ids uuid[];
  v_id  uuid;
  v_gap text;
begin
  if tg_op = 'UPDATE' then
    v_ids := array[old.student_id, new.student_id];
  else
    v_ids := array[old.student_id];
  end if;
  foreach v_id in array v_ids loop
    v_gap := minor_rule_gap(v_id);
    if v_gap = 'minor_needs_consent' then
      raise exception 'minor_needs_consent'
        using detail = format('Student %s is under 18 and would have no parental consent on record.', (select roll_no from students where id = v_id)),
              hint = 'Record a new consent first, or use withdraw_consent (the Guru).';
    elsif v_gap = 'minor_needs_guardian' then
      raise exception 'minor_needs_guardian'
        using detail = format('Student %s is under 18 and would have no parent or guardian with a phone on record.', (select roll_no from students where id = v_id));
    end if;
  end loop;
  return null;
end $$;

-- A consent names a guardian of its own student, or none (an adult's own consent).
create or replace function guard_consent_guardian() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.guardian_id is not null
     and not exists (select 1 from guardians g where g.id = new.guardian_id and g.student_id = new.student_id) then
    raise exception 'consent_guardian_mismatch' using detail = 'The consent''s guardian is not a guardian of this student.';
  end if;
  return new;
end $$;
drop trigger if exists consents_guardian_check on consents;
create trigger consents_guardian_check before insert or update of guardian_id, student_id on consents
  for each row execute function guard_consent_guardian();

-- ---------------------------------------------------------------- 3. gender set once by the student (#273)
-- 0036's guard, plus: a student's own write (About you) cannot change a gender already on their
-- record; it is kept. Staff change it (save_student_details); an empty one is filled as before.
create or replace function guard_student_gender() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.gender is not null and new.gender is distinct from old.gender
     and auth.uid() is not null and auth.uid() = old.profile_id then
    new.gender := old.gender;
    return new;
  end if;
  if current_user not in ('anon', 'authenticated') or new.gender is null then return new; end if;
  if tg_op = 'UPDATE' and new.gender is not distinct from old.gender then return new; end if;
  if not option_ok('gender', new.gender) then raise exception 'gender_unknown'; end if;
  return new;
end $$;

-- ---------------------------------------------------------------- 4. the desk's centre (#274)
-- A student record written without a home centre gets the signed-in Guru's or coordinator's own
-- (active) centre; else the lowest active centre; else 1 (the old default). The desk form, the
-- import and the API all go through this column default; accept_sign_up (0046) names the
-- sign-up's centre itself.
create or replace function default_home_centre() returns smallint
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select p.centre_id from profiles p join centres c on c.id = p.centre_id and c.active
      where p.id = auth.uid() and p.active and p.role in ('guru', 'coordinator')),
    (select min(id) from centres where active),
    1)::smallint
$$;
alter table students alter column home_centre_id set default default_home_centre();

-- ---------------------------------------------------------------- 5. possible duplicates (#274)
-- Name key for matching: NFC, lower case, . ' - and blanks as one space. Internal.
create or replace function person_name_key(p_name text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select btrim(regexp_replace(lower(normalize(coalesce(p_name, ''))), E'[\\s.''\u2019\\-]+', ' ', 'g'))
$$;

-- Staff: student records and waiting sign-ups that may be the person being typed in at the desk:
-- the same name and date of birth, or the same phone (its last 10 digits, when 7 or more are
-- given). A coordinator sees the sign-ups of their own centre (as on the waiting list), the Guru
-- all; student records of every centre. At most 10, students first. Each entry: kind ('student' or
-- 'sign_up'), id, roll_no (students), full_name, centre (name), since (joined or signed up),
-- withdrawn (students), matched (['name_dob'] and/or ['phone']). Error: not_allowed.
create or replace function possible_duplicates(p_full_name text, p_dob date default null, p_phone text default null)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_key    text := nullif(person_name_key(p_full_name), '');
  v_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_phone  text;
  v_centre smallint;
begin
  if not coalesce(is_staff(), false) then raise exception 'not_allowed' using errcode = '42501'; end if;
  v_phone := case when char_length(v_digits) >= 7 then right(v_digits, 10) end;
  if (v_key is null or p_dob is null) and v_phone is null then return '[]'::jsonb; end if;
  select centre_id into v_centre from profiles where id = auth.uid();
  return coalesce((
    select jsonb_agg(y.j order by y.k, y.since desc)
      from (select x.* from (
        select 1 as k, s.joined_on::timestamptz as since,
               jsonb_build_object('kind', 'student', 'id', s.id, 'roll_no', s.roll_no, 'full_name', s.full_name,
                 'centre', (select c.name from centres c where c.id = s.home_centre_id), 'since', s.joined_on,
                 'withdrawn', s.withdrawn_at is not null,
                 'matched', to_jsonb(array_remove(array[
                   case when v_key is not null and p_dob is not null and s.dob = p_dob
                         and person_name_key(s.full_name) = v_key then 'name_dob' end,
                   case when v_phone is not null
                         and right(regexp_replace(coalesce(s.phone, ''), '[^0-9]', '', 'g'), 10) = v_phone then 'phone' end],
                   null))) as j
          from students s
         where (v_key is not null and p_dob is not null and s.dob = p_dob and person_name_key(s.full_name) = v_key)
            or (v_phone is not null and right(regexp_replace(coalesce(s.phone, ''), '[^0-9]', '', 'g'), 10) = v_phone)
        union all
        select 2, p.created_at,
               jsonb_build_object('kind', 'sign_up', 'id', p.id, 'roll_no', null, 'full_name', p.full_name,
                 'centre', (select c.name from centres c where c.id = p.centre_id), 'since', (p.created_at at time zone 'Asia/Kolkata')::date,
                 'withdrawn', false,
                 'matched', to_jsonb(array_remove(array[
                   case when v_key is not null and p_dob is not null and d.dob = p_dob
                         and person_name_key(p.full_name) = v_key then 'name_dob' end,
                   case when v_phone is not null
                         and right(regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g'), 10) = v_phone then 'phone' end],
                   null)))
          from profiles p
          left join person_details d on d.profile_id = p.id and d.student_id is null
         where p.role in ('pending', 'student') and p.active
           and not exists (select 1 from students s where s.profile_id = p.id)
           and not exists (select 1 from ig_subscribers i where i.profile_id = p.id)
           and (is_guru() or p.centre_id = v_centre)
           and ((v_key is not null and p_dob is not null and d.dob = p_dob and person_name_key(p.full_name) = v_key)
                or (v_phone is not null and right(regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g'), 10) = v_phone))
      ) x order by x.k, x.since desc limit 10) y), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- who may run them
-- The name rule is pure and runs as the person saving (register_student and the import run as the
-- caller); the column default runs as the person inserting. Triggers and helpers are internal.
revoke execute on function person_name_chars(), clean_person_name(text, integer), default_home_centre(),
  possible_duplicates(text, date, text) from public, anon;
grant execute on function person_name_chars(), clean_person_name(text, integer), default_home_centre(),
  possible_duplicates(text, date, text) to authenticated;
revoke execute on function clean_name_column(), minor_rule_gap(uuid), guard_consent_guardian(),
  person_name_key(text) from public, anon, authenticated;
revoke execute on function check_minor_consent(), recheck_minor_consent(), guard_student_gender()
  from public, anon, authenticated;

-- ---------------------------------------------------------------- descriptions
comment on function person_name_chars is 'The characters a person''s name may hold, as a regex bracket body (#271). The app mirrors it.';
comment on function clean_person_name is 'Cleans (NFC, apostrophes, blanks) and checks a person''s name; returns it or raises name_required / name_too_long / name_invalid (#271).';
comment on function clean_name_column is 'Trigger: applies clean_person_name to a name column written by a signed-in app user (#271).';
comment on function minor_rule_gap is 'Why a student breaks the minor rule (minor_needs_guardian / minor_needs_consent), or null (#272). Internal.';
comment on function check_minor_consent is 'Trigger at commit: a minor added, made a minor or brought back needs a guardian with a phone and that guardian''s data consent (#272).';
comment on function recheck_minor_consent is 'Trigger at commit: a consent or guardian change keeps every minor''s guardian with a phone and data consent (#272).';
comment on function guard_consent_guardian is 'Trigger: a consent''s guardian belongs to the same student (#272).';
comment on function guard_student_gender is 'Trigger: a student''s gender set by an app user is an active option; the student''s own write keeps a gender already set (#273).';
comment on function default_home_centre is 'Default home centre of a new student: the signed-in staff member''s active centre, else the lowest active centre (#274).';
comment on function person_name_key is 'Name key for duplicate matching (NFC, lower case, punctuation as space). Internal.';
comment on function possible_duplicates is 'Staff: student records and waiting sign-ups with the same name and date of birth or the same phone, for a "Possible duplicate" warning (#274).';
comment on function import_students is 'G3, Guru: imports adult students from a list (Excel or CSV in the app); each row saved or refused on its own; returns the roll number or the error per row (docs/DECISIONS.md #46, names #271).';
