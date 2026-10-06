-- Mridanga Seva — 0032: sign-in leftovers of round 10. A new login keeps the language its phone
-- or browser was showing at sign-up, and a registration sent twice (the answer to the first was
-- lost, the coordinator pressed Save again) stores the student once.
-- Run once, after 0031, in the Supabase SQL editor (TEST first). The app works with or without it:
-- before it runs, the app's extra sign-up field is ignored, and the app calls register_student
-- again without the request id when the database does not know that argument yet.
-- Why: docs/DECISIONS.md #125-#126. How: docs/DATABASE.md "Registering a student", "Profiles".
--
-- 1. handle_new_user stores the language sent with the sign-up (D8-01, #125).
-- 2. students.request_id + register_student(p_request_id): a repeat of the same request returns
--    the student saved the first time (D6-08, #126).

-- ---------------------------------------------------------------- 1. language at sign-up
-- As in 0002, plus profiles.language from the sign-up's user metadata ('language'), when it is one
-- the app offers; anything else keeps the column default 'en'.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_lang text := new.raw_user_meta_data ->> 'language';
begin
  insert into profiles (id, email, full_name, role, language)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''), 'pending',
          case when v_lang in ('en', 'te', 'hi') then v_lang else 'en' end);
  if new.email_confirmed_at is not null then
    perform link_login_to_student(new.id, new.email);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- 2. one registration per request
-- The app makes a new random id for each registration form and sends it with every Save of that
-- form. NULL for students registered before 0032, by the Guru in the dashboard, or by an old app.
alter table students add column request_id uuid;
create unique index students_request_id_key on students (request_id);

-- App users cannot change it later (the dashboard, as owner, can).
create or replace function guard_student_request_id() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') and new.request_id is distinct from old.request_id then
    raise exception 'student_field_locked' using detail = 'request_id';
  end if;
  return new;
end $$;
create trigger students_request_id_guard before update on students
  for each row execute function guard_student_request_id();

-- register_student as in 0025, plus p_request_id. When a student with that request id exists, it
-- was saved by an earlier call of the same form: nothing new is stored and that student is
-- returned with repeated = true. Two calls at the same moment: the unique index makes the second
-- wait for the first and then find its student. A request id used by another person is refused.
-- New error code: request_id_used.
drop function register_student(text, date, text, text, text, text, smallint, uuid,
  text, text, text, text, text, boolean, boolean);
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
  p_request_id        uuid default null
) returns jsonb
language plpgsql set search_path = public as $$
declare
  s students;
  g_id uuid;
  minor boolean := p_dob is not null and p_dob > today_ist() - interval '18 years';
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
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
    insert into guardians (student_id, full_name, phone, email, relation)
    values (s.id, trim(p_guardian_name), trim(p_guardian_phone),
            nullif(lower(trim(p_guardian_email)), ''), nullif(trim(p_guardian_relation), ''))
    returning id into g_id;
    insert into consents (student_id, guardian_id, scope, method, id_type_checked, signed_form)
    values (s.id, g_id, 'data', 'written', p_id_type_checked, true);
    if p_photo_consent then
      insert into consents (student_id, guardian_id, scope, method, id_type_checked, signed_form)
      values (s.id, g_id, 'photo', 'written', p_id_type_checked, true);
    end if;
  end if;

  return jsonb_build_object('id', s.id, 'roll_no', s.roll_no, 'linked', s.profile_id is not null,
                            'repeated', false);
end $$;

-- ---------------------------------------------------------------- who may run them
-- docs/DECISIONS.md #14: the trigger functions are internal; register_student is for signed-in
-- staff (it checks the caller inside).
revoke execute on function handle_new_user(), guard_student_request_id() from public, anon, authenticated;
revoke execute on function register_student(text, date, text, text, text, text, smallint, uuid,
  text, text, text, text, text, boolean, boolean, uuid) from public, anon;
grant execute on function register_student(text, date, text, text, text, text, smallint, uuid,
  text, text, text, text, text, boolean, boolean, uuid) to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on column students.request_id is 'Random id of the registration form that saved this student (app, 0032); a repeated Save with it returns this student instead of a copy. NULL before 0032.';
comment on function guard_student_request_id is 'Trigger: app users cannot change students.request_id.';
comment on function handle_new_user is 'Trigger on auth.users: a new login gets a pending profile with its sign-up name and language (0032), and is linked at once when the email is already confirmed.';
comment on function register_student is 'Registers a student; for a minor also the guardian and written consent (signed-form tick required), all or nothing. A repeat with the same p_request_id returns the first student (repeated = true). Coordinators and Guru only.';
