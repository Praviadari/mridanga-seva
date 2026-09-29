-- Mridanga Seva — 0003: register a student in one step, and never keep a minor without consent.
-- Run once, after 0002_login_linking.sql, in the Supabase SQL editor.
-- Why: docs/DECISIONS.md #8 and #16. How: docs/DATABASE.md "Registering a student".
--
-- 1. register_student(): the coordinator's registration screens (C2 + C3) call this. It saves the
--    student and, for a minor, the parent and their written consent, all or nothing.
-- 2. A check that runs when the transaction ends refuses any student under 18 without a current
--    'data' consent, however the row was written (app, dashboard, import). So a minor's details
--    can never be stored before the parent has agreed (India DPDP Rules, docs/DECISIONS.md #8).

-- ---------------------------------------------------------------- minor needs consent
-- Deferred: it runs at COMMIT, after the same transaction has had the chance to add the guardian
-- and the consent. Runs when a student is added, or their date of birth changes.
create or replace function check_minor_consent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_minor(new) and not exists (
       select 1 from consents
        where student_id = new.id and scope = 'data' and revoked_at is null) then
    raise exception 'minor_needs_consent'
      using detail = format('Student %s is under 18 and has no parental consent on record.', new.full_name),
            hint = 'Record the parent and their written consent in the same step (register_student).';
  end if;
  return null;
end $$;
create constraint trigger students_minor_consent
  after insert or update of dob on students
  deferrable initially deferred
  for each row execute function check_minor_consent();

-- ---------------------------------------------------------------- register_student
-- Saves one student. For a minor (under 18 on the date of birth given) the guardian's name and
-- phone, the ID the coordinator checked and a written consent are required; the consent rows
-- are created here. Name and date of birth are required (the date decides whether consent is
-- needed, so it cannot be skipped); leave out anything else that is not known.
-- Runs as the caller (not security definer), so row-level security applies.
-- Errors are short codes the app translates: not_allowed, name_required, dob_required,
-- minor_needs_guardian, minor_needs_id_check.
-- Returns { id, roll_no, linked } — linked = the student already had a confirmed login with this
-- email, which is now connected (0002, path 2).
create or replace function register_student(
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
  p_photo_consent     boolean default false
) returns jsonb
language plpgsql set search_path = public as $$
declare
  s students;
  g_id uuid;
  minor boolean := p_dob is not null and p_dob > today_ist() - interval '18 years';
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  if coalesce(trim(p_full_name), '') = '' then raise exception 'name_required'; end if;
  if p_dob is null then raise exception 'dob_required'; end if;
  if minor and (coalesce(trim(p_guardian_name), '') = '' or coalesce(trim(p_guardian_phone), '') = '') then
    raise exception 'minor_needs_guardian';
  end if;
  if minor and coalesce(trim(p_id_type_checked), '') = '' then
    raise exception 'minor_needs_id_check';
  end if;

  insert into students (full_name, dob, phone, email, area, pincode, level_id, mentor_id)
  values (trim(p_full_name), p_dob, nullif(trim(p_phone), ''), nullif(lower(trim(p_email)), ''),
          nullif(trim(p_area), ''), nullif(trim(p_pincode), ''), coalesce(p_level, 1), p_mentor)
  returning * into s;

  if minor then
    insert into guardians (student_id, full_name, phone, email, relation)
    values (s.id, trim(p_guardian_name), trim(p_guardian_phone),
            nullif(lower(trim(p_guardian_email)), ''), nullif(trim(p_guardian_relation), ''))
    returning id into g_id;
    insert into consents (student_id, guardian_id, scope, method, id_type_checked)
    values (s.id, g_id, 'data', 'written', p_id_type_checked);
    if p_photo_consent then
      insert into consents (student_id, guardian_id, scope, method, id_type_checked)
      values (s.id, g_id, 'photo', 'written', p_id_type_checked);
    end if;
  end if;

  return jsonb_build_object('id', s.id, 'roll_no', s.roll_no, 'linked', s.profile_id is not null);
end $$;

-- ---------------------------------------------------------------- who may run functions
revoke execute on function check_minor_consent() from public, anon, authenticated;
revoke execute on function register_student(text, date, text, text, text, text, smallint, uuid,
  text, text, text, text, text, boolean) from public, anon;
grant execute on function register_student(text, date, text, text, text, text, smallint, uuid,
  text, text, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on function register_student is 'Registers a student; for a minor also the guardian and written consent, all or nothing. Coordinators and Guru only.';
comment on function check_minor_consent is 'Trigger at commit: a student under 18 must have a current data consent.';
comment on column consents.scope is 'data = keep the student''s details (required for minors); photo = a photo on the record; face = face attendance (Phase 3).';
comment on column guardians.relation is 'mother, father or guardian (another adult responsible for the student).';
comment on column consents.id_type_checked is 'Which ID the coordinator saw: aadhaar, pan, driving_licence, passport, voter_id or other. The ID number is never stored.';
