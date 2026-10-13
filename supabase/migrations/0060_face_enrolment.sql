-- 0060 Face scan, server side: the enrolment record (no face code) and the integrity check
-- (Phase 3: P3-2 redesigned for Gate 2, and the server half of P3-6; docs/DECISIONS.md #295-#300;
-- docs/DATABASE.md "Face scan (0060)"; docs/phase3/WORK_PLAN.md P3-2, P3-6).
--
-- PLACEHOLDER NUMBER: the lead renumbers this file when it merges (launch work uses 0047-0059).
-- BRANCH ONLY (p3-server): it runs on TEST only after the phone test day, and on LIVE only after
-- Praveen says face scan is fully tested. Face scan stays OFF (face_enabled = false) until then.
--
-- 1. The switch (#300): setting face_enabled, false. Every face function that starts or records
--    something refuses with face_off while it is false; removal, status and counts always work.
--    The face_* settings are changed in the SQL editor only (setting_owner_only for app users).
-- 2. Face consent (#298): consents scope 'face' gets the child's own yes (child_assent, read out by
--    assent_read_by) and who revoked it (revoked_by). record_face_consent (staff, at the desk) is
--    the only app path: an adult's own written consent, or for a minor the parent's (guardian, ID
--    seen) plus the child's yes. Under face_min_age (18 until the Guru and the lawyer answer) it
--    refuses: adults first.
-- 3. Gate 2 (#295): face_enrolments keeps WHO enrolled, on which phone (device_key), with which
--    model, who confirmed it, when, until when, and how it ended. There is NO face code on the
--    server: the code stays in the phone's Keystore; a new phone or a re-install means a fresh
--    supervised enrolment at the desk. No role reads the table directly.
-- 4. Supervised enrolment (#297): the student's phone asks (start_face_enrolment: a 6-digit code,
--    10 minutes), a coordinator types the code (approve_face_enrolment; never for their own
--    record; 5 wrong codes end the request), the phone completes (enrol_face, within 10 minutes of
--    the confirmation). A new enrolment replaces the old phone's. my_face_enrolment tells the phone
--    whether its enrolment is current (else the phone wipes its code). remove_face: the student's
--    one tap, or the desk (a parent, a lost phone).
-- 5. Ends (#299): withdraw_consent, a revoked or deleted face/data consent, erase_student (cascade),
--    a login taken off the record or switched off, Left for 30 days, expiry (12 months minor / 24
--    adult), a model change. Ended rows stay as the proof (no face data in them), deleted after
--    400 days. A withdrawn record cannot start one (student_withdrawn).
-- 6. Visits (#299): visits.liveness_ok; the match score in visit_face_scores (not on visits: the
--    audit_visits trigger copies the whole visit row into audit_log at every check-out, which
--    would keep the score past its 60 days), deleted after face_score_days. method 'face' and
--    liveness_ok are written only by the future self-scan path (face_visit_reserved).
-- 7. Integrity (#296, Gate 1): issue_integrity_challenge (student, single use, 60 s, bound to the
--    login, the student and the action); the Edge Function verify-integrity spends it
--    (begin_integrity_check), checks Google's verdict, and records the result
--    (finish_integrity_check), which on a pass stores the hash of a one-time pass valid 120 s.
--    use_integrity_pass is what the future self-scan RPC calls. Failures are counted per centre in
--    face_scan_failures (no student id), shown to staff by face_use_counts.
-- Every UPDATE/DELETE has a WHERE (Supabase safeupdate). Needs 0001-0048. Safe to run twice.

-- ---------------------------------------------------------------- 1. settings (#300)
insert into settings (key, value) values
  ('face_enabled', 'false'),
  ('face_min_age', '18'),
  ('face_expiry_months_minor', '12'),
  ('face_expiry_months_adult', '24'),
  ('face_score_days', '60'),
  ('face_model_version', '"sface-2021dec-int8"')
on conflict (key) do nothing;

-- 0048's guard_setting with the face settings. A later migration that replaces it must keep them.
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
  -- Face scan is switched on, and its limits changed, only in the SQL editor (#300).
  if new.key like 'face\_%' and current_user in ('anon', 'authenticated')
     and (tg_op = 'INSERT' or new.value is distinct from old.value) then
    raise exception 'setting_owner_only' using detail = format('%s is changed in the SQL editor only.', new.key);
  end if;
  v_range := case new.key
    when 'irregular_days'        then int4range(3, 90, '[]')
    when 'inactive_days'         then int4range(7, 365, '[]')
    when 'call_due_days'         then int4range(1, 14, '[]')
    when 'retry_days'            then int4range(1, 14, '[]')
    when 'max_retries'           then int4range(1, 10, '[]')
    when 'new_joiner_weeks'      then int4range(1, 12, '[]')
    when 'promotion_syllabus_percent' then int4range(0, 100, '[]')
    when 'promotion_min_visits'  then int4range(0, 100, '[]')
    when 'promotion_visit_weeks' then int4range(1, 52, '[]')
    when 'promotion_min_feedback' then int4range(1, 10, '[]')
    when 'fund_approval_rupees'  then int4range(0, 1000000, '[]')
    when 'fund_bill_rupees'      then int4range(0, 1000000, '[]')
    when 'qr_rescan_minutes'     then int4range(1, 60, '[]')
    when 'face_min_age'          then int4range(5, 18, '[]')
    when 'face_expiry_months_minor' then int4range(1, 24, '[]')
    when 'face_expiry_months_adult' then int4range(1, 36, '[]')
    when 'face_score_days'       then int4range(1, 365, '[]')
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
  elsif new.key in ('promotion_needs_level_up', 'parent_notices_enabled', 'parent_notices_check_out',
                    'parent_notices_check_in', 'parent_notices_no_checkout', 'face_enabled') then
    if jsonb_typeof(new.value) <> 'boolean' then
      raise exception 'setting_invalid' using detail = format('%s is true or false.', new.key);
    end if;
  elsif new.key = 'call_reasons' then
    if jsonb_typeof(new.value) <> 'array' then
      raise exception 'setting_invalid' using detail = 'call_reasons is a list of codes.';
    end if;
  elsif new.key in ('ig_translator', 'parent_notice_contact') then
    if jsonb_typeof(new.value) <> 'string' or char_length(btrim(new.value #>> '{}')) > 100 then
      raise exception 'setting_invalid' using detail = format('%s is a text of at most 100 characters.', new.key);
    end if;
    new.value := to_jsonb(btrim(new.value #>> '{}'));
  elsif new.key = 'face_model_version' then
    if jsonb_typeof(new.value) <> 'string' or (new.value #>> '{}') !~ '^[a-z0-9][a-z0-9._-]{0,59}$' then
      raise exception 'setting_invalid' using detail = 'face_model_version is a short lower-case name, e.g. sface-2021dec-int8.';
    end if;
  elsif current_user in ('anon', 'authenticated') then
    raise exception 'setting_unknown' using detail = format('%s is not a setting the app knows.', new.key);
  end if;
  return new;
end $$;

-- True when face scan is switched on (#300).
create or replace function face_on() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select s.value = 'true'::jsonb from settings s where s.key = 'face_enabled'), false)
$$;

-- Raises face_off unless face scan is switched on.
create or replace function face_require_on() returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not face_on() then
    raise exception 'face_off' using detail = 'Face scan is switched off; use the QR code or ask a coordinator.';
  end if;
end $$;

-- The embedding model the phones must use (a template from another model cannot be compared).
create or replace function face_model_version() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select s.value #>> '{}' from settings s where s.key = 'face_model_version'
$$;

-- ---------------------------------------------------------------- 2. face consent (#298)
alter table consents add column if not exists child_assent boolean;
alter table consents add column if not exists assent_read_by uuid references profiles (id);
alter table consents add column if not exists revoked_by uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'consents_assent_face_only' and conrelid = 'consents'::regclass) then
    alter table consents add constraint consents_assent_face_only
      check (scope = 'face' or (child_assent is null and assent_read_by is null));
  end if;
end $$;

-- A face consent is recorded at the desk through record_face_consent only: a direct insert by an
-- app user would skip the child's yes and the age rule. The dashboard may still add the paper one.
create or replace function guard_face_consent() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.scope = 'face' and current_user in ('anon', 'authenticated') then
    raise exception 'face_consent_at_desk' using detail = 'A face consent is recorded with record_face_consent.';
  end if;
  return new;
end $$;
drop trigger if exists consents_face_at_desk on consents;
create trigger consents_face_at_desk before insert on consents
  for each row execute function guard_face_consent();

-- Who revoked a consent: the signed-in person, unless the revoking function named them. Runs after
-- consents_guard (0025), which has already allowed the revocation.
create or replace function fill_consent_revoked_by() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.revoked_at is not null and old.revoked_at is null and new.revoked_by is null then
    new.revoked_by := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists consents_revoked_by on consents;
create trigger consents_revoked_by before update of revoked_at on consents
  for each row execute function fill_consent_revoked_by();

-- Why a student cannot use face scan now, or null when they can: the record, the age rule, a
-- current face consent (for a minor: the parent's, with the child's own yes).
create or replace function face_block_reason(p_student uuid) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s students;
  c consents;
begin
  select * into s from students where id = p_student;
  if not found then return 'student_not_found'; end if;
  if s.withdrawn_at is not null then return 'student_withdrawn'; end if;
  if s.status = 'left' then return 'student_left'; end if;
  if s.dob is null then return 'dob_required'; end if;
  if extract(year from age(today_ist(), s.dob)) < coalesce(setting_int('face_min_age'), 18) then
    return 'face_too_young';
  end if;
  select * into c from consents
   where student_id = p_student and scope = 'face' and revoked_at is null
   order by given_at desc limit 1;
  if not found then return 'no_face_consent'; end if;
  if is_minor(s) and (c.guardian_id is null or c.child_assent is not true or c.assent_read_by is null) then
    return 'no_face_consent';
  end if;
  return null;
end $$;

-- The desk records a face consent (staff). An adult: their own signed form. A minor: the parent's
-- signed form (p_guardian, the ID type seen) and the child's own yes, read out by the coordinator
-- (p_child_assent; assent_read_by = the coordinator). Returns the consent's id.
-- Error codes: not_allowed, face_off, student_not_found, student_withdrawn, written_consent_required,
-- notice_version_invalid, dob_required, face_too_young, minor_needs_guardian, minor_needs_id_check,
-- child_assent_required, face_consent_exists, consent_guardian_mismatch (0047).
create or replace function record_face_consent(p_student uuid, p_signed_form boolean,
  p_guardian uuid default null, p_id_type_checked text default null, p_child_assent boolean default null,
  p_notice_version text default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s        students;
  v_notice text := nullif(btrim(coalesce(p_notice_version, '')), '');
  v_minor  boolean;
  v_id     uuid := gen_random_uuid();
begin
  if not is_staff() then raise exception 'not_allowed' using errcode = '42501'; end if;
  perform face_require_on();
  select * into s from students where id = p_student for update;
  if not found then raise exception 'student_not_found'; end if;
  if s.withdrawn_at is not null then
    raise exception 'student_withdrawn' using detail = 'Consent was withdrawn: nothing new is recorded for this student.';
  end if;
  if p_signed_form is not true then
    raise exception 'written_consent_required' using detail = 'Tick that the signed face consent form is kept.';
  end if;
  if v_notice is not null and v_notice !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$' then
    raise exception 'notice_version_invalid';
  end if;
  if s.dob is null then raise exception 'dob_required'; end if;
  if extract(year from age(today_ist(), s.dob)) < coalesce(setting_int('face_min_age'), 18) then
    raise exception 'face_too_young' using detail = 'Face scan is not offered at this age yet.';
  end if;
  v_minor := is_minor(s);
  if v_minor then
    if p_guardian is null then raise exception 'minor_needs_guardian'; end if;
    if coalesce(btrim(p_id_type_checked), '') = '' then raise exception 'minor_needs_id_check'; end if;
    if p_child_assent is not true then
      raise exception 'child_assent_required' using detail = 'Read the child''s part of the form to them; they say yes themselves.';
    end if;
  end if;
  if exists (select 1 from consents where student_id = p_student and scope = 'face' and revoked_at is null) then
    raise exception 'face_consent_exists';
  end if;
  insert into consents (id, student_id, guardian_id, scope, method, id_type_checked, signed_form, notice_version,
                        verified_by, child_assent, assent_read_by)
  values (v_id, p_student, case when v_minor then p_guardian end, 'face', 'written',
          case when v_minor then btrim(p_id_type_checked) end, true, v_notice, auth.uid(),
          case when v_minor then true end, case when v_minor then auth.uid() end);
  return v_id;
end $$;

-- ---------------------------------------------------------------- 3. enrolment record, no face code (#295)
create table if not exists face_enrolments (
  id             bigint generated always as identity primary key,
  student_id     uuid not null references students (id) on delete cascade,
  -- The student's login whose phone holds the face code.
  profile_id     uuid not null references profiles (id) on delete cascade,
  -- Which phone: an id the app makes once per install (P3-4 may use the hardware-attested key's hash).
  device_key     text not null check (device_key ~ '^[A-Za-z0-9_-]{16,100}$'),
  model_version  text not null check (model_version ~ '^[a-z0-9][a-z0-9._-]{0,59}$'),
  -- The face consent it rests on (null once the Guru deleted that consent; the row is ended then).
  consent_id     uuid references consents (id) on delete set null,
  -- SHA-256 of the 6-digit desk code while it waits; null once used or ended.
  code_hash      text check (code_hash ~ '^[0-9a-f]{64}$'),
  code_tries     smallint not null default 0 check (code_tries between 0 and 5),
  requested_at   timestamptz not null default now(),
  approved_by    uuid references profiles (id),
  approved_at    timestamptz,
  enrolled_at    timestamptz,
  expires_at     timestamptz,
  revoked_at     timestamptz,
  -- Who ended it (no foreign key: the trace outlives the login); null for the nightly job.
  revoked_by     uuid,
  revoke_reason  text check (revoke_reason in ('student_off', 'desk', 'lost_phone', 'replaced', 'not_completed',
                   'code_failed', 'consent_withdrawn', 'withdrawn', 'login_changed', 'login_off', 'left',
                   'expired', 'model_changed')),
  check ((approved_at is null) = (approved_by is null)),
  check (enrolled_at is null or (approved_at is not null and expires_at > enrolled_at)),
  check ((revoked_at is null) = (revoke_reason is null))
);
create unique index if not exists face_enrolments_one_current on face_enrolments (student_id)
  where revoked_at is null and enrolled_at is not null;
create unique index if not exists face_enrolments_one_waiting on face_enrolments (student_id)
  where revoked_at is null and enrolled_at is null;
create index if not exists face_enrolments_profile_idx on face_enrolments (profile_id) where revoked_at is null;
alter table face_enrolments enable row level security;
-- No policy: nobody reads or writes it directly; the functions below do (staff read through
-- get_face_enrolments, which is logged in access_log).
revoke all on face_enrolments from public, anon, authenticated;

drop trigger if exists face_enrolments_refuse_withdrawn on face_enrolments;
create trigger face_enrolments_refuse_withdrawn before insert on face_enrolments
  for each row execute function refuse_withdrawn();

-- Ends every enrolment (and waiting request) of a student that is not ended yet; returns how many.
create or replace function revoke_face_enrolments(p_student uuid, p_reason text) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rows int;
begin
  update face_enrolments
     set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = p_reason, code_hash = null
   where student_id = p_student and revoked_at is null;
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;

-- ---------------------------------------------------------------- 4. supervised enrolment (#297)
-- Step 1, the student's phone: asks to enrol this phone with this model. Returns { request, code,
-- expires_at }: the phone shows the 6-digit code to the coordinator. A request not yet completed
-- is replaced. At most 5 requests an hour.
-- Error codes: not_allowed, face_off, device_key_invalid, face_model_outdated, too_many_requests,
-- and face_block_reason's (student_withdrawn, student_left, dob_required, face_too_young,
-- no_face_consent).
create or replace function start_face_enrolment(p_device_key text, p_model_version text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_student uuid := my_student_id();
  v_reason  text;
  v_code    text;
  v_id      bigint;
begin
  if v_student is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  perform face_require_on();
  if p_device_key is null or p_device_key !~ '^[A-Za-z0-9_-]{16,100}$' then raise exception 'device_key_invalid'; end if;
  if p_model_version is distinct from face_model_version() then
    raise exception 'face_model_outdated' using detail = 'Update the app first.';
  end if;
  perform 1 from students where id = v_student for update;  -- one request at a time per student
  v_reason := face_block_reason(v_student);
  if v_reason is not null then raise exception '%', v_reason; end if;
  if (select count(*) from face_enrolments where student_id = v_student and requested_at > now() - interval '1 hour') >= 5 then
    raise exception 'too_many_requests' using detail = 'Try again in an hour.';
  end if;
  update face_enrolments
     set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = 'not_completed', code_hash = null
   where student_id = v_student and enrolled_at is null and revoked_at is null;
  -- 6 digits from the first 32 random bits of a version 4 UUID (a strong random source; no pgcrypto).
  v_code := lpad((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint % 1000000)::text, 6, '0');
  insert into face_enrolments (student_id, profile_id, device_key, model_version, consent_id, code_hash)
  values (v_student, auth.uid(), p_device_key, p_model_version,
          (select c.id from consents c where c.student_id = v_student and c.scope = 'face' and c.revoked_at is null
            order by c.given_at desc limit 1),
          encode(sha256(convert_to(v_code, 'UTF8')), 'hex'))
  returning id into v_id;
  return jsonb_build_object('request', v_id, 'code', v_code, 'expires_at', now() + interval '10 minutes');
end $$;

-- Step 2, a coordinator (or the Guru) who sees the student: types the code shown on the student's
-- phone. Never for their own record. A wrong code answers { ok: false, reason: 'code_wrong',
-- tries_left }; the fifth wrong code ends the request (code_failed). Right: { ok: true, roll_no,
-- full_name } so the coordinator sees whom they confirmed.
-- Error codes: not_allowed, face_off, student_not_found, no_face_request, face_request_expired,
-- and face_block_reason's.
create or replace function approve_face_enrolment(p_student uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s        students;
  e        face_enrolments;
  v_reason text;
begin
  if not is_staff() then raise exception 'not_allowed' using errcode = '42501'; end if;
  perform face_require_on();
  select * into s from students where id = p_student for update;
  if not found then raise exception 'student_not_found'; end if;
  if s.profile_id = auth.uid() then
    raise exception 'not_allowed' using errcode = '42501', detail = 'Another coordinator confirms your own face scan.';
  end if;
  select * into e from face_enrolments
   where student_id = p_student and enrolled_at is null and revoked_at is null
   order by id desc limit 1;
  if not found then raise exception 'no_face_request'; end if;
  if e.approved_at is not null then
    return jsonb_build_object('ok', true, 'roll_no', s.roll_no, 'full_name', s.full_name, 'repeated', true);
  end if;
  if e.requested_at < now() - interval '10 minutes' then
    raise exception 'face_request_expired' using detail = 'The student starts again on their phone.';
  end if;
  if e.code_hash is distinct from encode(sha256(convert_to(coalesce(btrim(p_code), ''), 'UTF8')), 'hex') then
    update face_enrolments
       set code_tries    = code_tries + 1,
           code_hash     = case when code_tries + 1 >= 5 then null else code_hash end,
           revoked_at    = case when code_tries + 1 >= 5 then now() end,
           revoked_by    = case when code_tries + 1 >= 5 then auth.uid() end,
           revoke_reason = case when code_tries + 1 >= 5 then 'code_failed' end
     where id = e.id;
    return jsonb_build_object('ok', false, 'reason', 'code_wrong', 'tries_left', greatest(4 - e.code_tries, 0));
  end if;
  v_reason := face_block_reason(p_student);
  if v_reason is not null then raise exception '%', v_reason; end if;
  update face_enrolments set approved_at = now(), approved_by = auth.uid(), code_hash = null where id = e.id;
  return jsonb_build_object('ok', true, 'roll_no', s.roll_no, 'full_name', s.full_name, 'repeated', false);
end $$;

-- Step 3, the student's phone, after the coordinator confirmed (within 10 minutes): the phone has
-- kept the face code in its Keystore; the server records the enrolment. The student's earlier
-- enrolment (another phone) ends (replaced). Returns { enrolled_at, expires_at }.
-- Error codes: not_allowed, face_off, no_face_request, device_mismatch, face_not_confirmed,
-- face_confirmation_expired, face_model_outdated, and face_block_reason's.
create or replace function enrol_face(p_request bigint, p_device_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_student uuid := my_student_id();
  s         students;
  e         face_enrolments;
  v_reason  text;
  v_months  int;
begin
  if v_student is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  perform face_require_on();
  select * into s from students where id = v_student for update;
  select * into e from face_enrolments where id = p_request and student_id = v_student and profile_id = auth.uid();
  if not found or e.revoked_at is not null then raise exception 'no_face_request'; end if;
  if e.device_key is distinct from p_device_key then raise exception 'device_mismatch'; end if;
  if e.enrolled_at is not null then
    return jsonb_build_object('enrolled_at', e.enrolled_at, 'expires_at', e.expires_at, 'repeated', true);
  end if;
  if e.approved_at is null then
    raise exception 'face_not_confirmed' using detail = 'A coordinator types the code first.';
  end if;
  if e.approved_at < now() - interval '10 minutes' then raise exception 'face_confirmation_expired'; end if;
  if e.model_version is distinct from face_model_version() then raise exception 'face_model_outdated'; end if;
  v_reason := face_block_reason(v_student);
  if v_reason is not null then raise exception '%', v_reason; end if;
  update face_enrolments
     set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = 'replaced'
   where student_id = v_student and enrolled_at is not null and revoked_at is null;
  v_months := case when is_minor(s) then coalesce(setting_int('face_expiry_months_minor'), 12)
                   else coalesce(setting_int('face_expiry_months_adult'), 24) end;
  update face_enrolments set enrolled_at = now(), expires_at = now() + make_interval(months => v_months)
   where id = e.id
  returning * into e;
  return jsonb_build_object('enrolled_at', e.enrolled_at, 'expires_at', e.expires_at, 'repeated', false);
end $$;

-- The student's phone, at every start online: is face scan on, and is THIS phone's enrolment
-- current? enrolled false = the phone wipes its face code (S4F-02/06). Also answers while face scan
-- is off (the phone then keeps its code but offers no self-scan). Read by the student about
-- themselves, so not written to access_log. Error code: not_allowed.
create or replace function my_face_enrolment(p_device_key text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_student uuid := my_student_id();
  e         face_enrolments;
  w         face_enrolments;
begin
  if v_student is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into e from face_enrolments
   where student_id = v_student and enrolled_at is not null and revoked_at is null and expires_at > now();
  select * into w from face_enrolments
   where student_id = v_student and enrolled_at is null and revoked_at is null
     and profile_id = auth.uid() and device_key = p_device_key;
  return jsonb_build_object(
    'face_enabled', face_on(),
    'model_version', face_model_version(),
    'enrolled', e.id is not null and e.profile_id = auth.uid() and e.device_key = p_device_key,
    'expires_at', case when e.profile_id = auth.uid() and e.device_key = p_device_key then e.expires_at end,
    'waiting_request', w.id,
    'confirmed', w.approved_at is not null);
end $$;

-- Face scan off for a student, always allowed (also while face scan is off, and for a withdrawn
-- record). The student: their own, one tap (student_off). Staff at the desk: p_reason 'desk' (the
-- parent or the adult student says no) or 'lost_phone' (the face consent stays; re-enrol at the
-- desk). 'student_off' and 'desk' also revoke the face consent (revoked_by = the caller): face scan
-- comes back only with a new consent. Returns { removed, consent_revoked }.
-- Error codes: not_allowed, student_required, reason_invalid, student_not_found.
create or replace function remove_face(p_student uuid default null, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_own     uuid := my_student_id();
  v_student uuid;
  v_reason  text;
  v_removed int;
  v_revoked int := 0;
begin
  if v_own is not null and (p_student is null or p_student = v_own) then
    v_student := v_own;
    v_reason := 'student_off';
  elsif is_staff() then
    if p_student is null then raise exception 'student_required'; end if;
    v_student := p_student;
    v_reason := coalesce(p_reason, 'desk');
    if v_reason not in ('desk', 'lost_phone') then raise exception 'reason_invalid'; end if;
  else
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform 1 from students where id = v_student for update;
  if not found then raise exception 'student_not_found'; end if;
  v_removed := revoke_face_enrolments(v_student, v_reason);
  if v_reason in ('student_off', 'desk') then
    update consents set revoked_at = now(), revoked_by = auth.uid()
     where student_id = v_student and scope = 'face' and revoked_at is null;
    get diagnostics v_revoked = row_count;
  end if;
  return jsonb_build_object('removed', v_removed, 'consent_revoked', v_revoked > 0);
end $$;

-- A student's enrolments, newest first, for staff (C8); writes one access_log row. No device key.
-- state: waiting_code, confirmed (waiting for the phone), current, expired, ended.
-- Error codes: not_allowed, student_required.
create or replace function get_face_enrolments(p_student uuid)
returns table (id bigint, state text, model_version text, requested_at timestamptz, approved_at timestamptz,
               approved_by uuid, enrolled_at timestamptz, expires_at timestamptz, revoked_at timestamptz,
               revoke_reason text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rows int;
begin
  if not is_staff() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_student is null then raise exception 'student_required'; end if;
  return query
    select e.id,
           case when e.revoked_at is not null then 'ended'
                when e.enrolled_at is null then case when e.approved_at is null then 'waiting_code' else 'confirmed' end
                when e.expires_at <= now() then 'expired'
                else 'current' end,
           e.model_version, e.requested_at, e.approved_at, e.approved_by, e.enrolled_at, e.expires_at,
           e.revoked_at, e.revoke_reason
      from face_enrolments e
     where e.student_id = p_student
     order by e.id desc;
  get diagnostics v_rows = row_count;
  perform log_access('get_face_enrolments', p_student, v_rows);
end $$;

-- ---------------------------------------------------------------- 5. ends (#299)
-- A revoked or deleted face or data consent ends the student's enrolments (withdraw_consent too).
create or replace function end_face_on_consent() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare c consents;
begin
  if tg_op = 'DELETE' then c := old; else c := new; end if;
  if c.scope in ('face', 'data') and (tg_op = 'DELETE' or (new.revoked_at is not null and old.revoked_at is null)) then
    perform revoke_face_enrolments(c.student_id, 'consent_withdrawn');
  end if;
  return null;
end $$;
drop trigger if exists consents_end_face on consents;
create trigger consents_end_face after update of revoked_at or delete on consents
  for each row execute function end_face_on_consent();

-- A withdrawn record, or a login taken off (or put on) the record, ends its enrolments.
create or replace function end_face_on_student() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.withdrawn_at is not null and old.withdrawn_at is null then
    perform revoke_face_enrolments(new.id, 'withdrawn');
  elsif new.profile_id is distinct from old.profile_id then
    perform revoke_face_enrolments(new.id, 'login_changed');
  end if;
  return null;
end $$;
drop trigger if exists students_end_face on students;
create trigger students_end_face after update of withdrawn_at, profile_id on students
  for each row execute function end_face_on_student();

-- A login switched off ends the enrolments it holds.
create or replace function end_face_on_login_off() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.active and not new.active then
    update face_enrolments
       set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = 'login_off', code_hash = null
     where profile_id = new.id and revoked_at is null;
  end if;
  return null;
end $$;
drop trigger if exists profiles_end_face on profiles;
create trigger profiles_end_face after update of active on profiles
  for each row execute function end_face_on_login_off();

-- A new embedding model ends every enrolment made with another one (a re-enrolment at the desk).
create or replace function end_face_on_model_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.value is distinct from old.value then
    update face_enrolments
       set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = 'model_changed', code_hash = null
     where revoked_at is null and model_version is distinct from (new.value #>> '{}');
  end if;
  return null;
end $$;
drop trigger if exists settings_face_model on settings;
create trigger settings_face_model after update on settings
  for each row when (new.key = 'face_model_version') execute function end_face_on_model_change();

-- ---------------------------------------------------------------- 6. visits (#299)
alter table visits add column if not exists liveness_ok boolean;

-- The 1:1 match score of a face check-in, kept face_score_days (60) for calibration, then deleted.
-- A table of its own, without the audit trigger visits has.
create table if not exists visit_face_scores (
  visit_id    bigint primary key references visits (id) on delete cascade,
  match_score real not null check (match_score between -1 and 1),
  scored_at   timestamptz not null default now()
);
alter table visit_face_scores enable row level security;
revoke all on visit_face_scores from public, anon, authenticated;

-- method 'face' and liveness_ok are written only by the self-scan path (P3-5), which sets
-- app.face_visit for its own transaction, and only while face scan is on (S4F-01: no QR scan, desk
-- or dashboard write can claim a face check-in). Error code: face_visit_reserved.
create or replace function guard_face_visit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (new.method = 'face' and (tg_op = 'INSERT' or old.method is distinct from 'face'))
     or (new.liveness_ok is not null and (tg_op = 'INSERT' or new.liveness_ok is distinct from old.liveness_ok)) then
    if coalesce(current_setting('app.face_visit', true), '') <> 'on' or not face_on() then
      raise exception 'face_visit_reserved' using detail = 'Only the self-scan check-in records a face visit.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists visits_face_guard on visits;
create trigger visits_face_guard before insert or update on visits
  for each row execute function guard_face_visit();

-- ---------------------------------------------------------------- 7. integrity check (#296, Gate 1)
create table if not exists integrity_challenges (
  -- 32 hex characters from a version 4 UUID; the phone puts it in the Play Integrity requestHash.
  challenge       text primary key check (challenge ~ '^[0-9a-f]{32}$'),
  profile_id      uuid not null references profiles (id) on delete cascade,
  student_id      uuid not null references students (id) on delete cascade,
  action          text not null check (action in ('check_in', 'check_out')),
  issued_at       timestamptz not null default now(),
  expires_at      timestamptz not null,
  -- Spent by the Edge Function (begin_integrity_check), whatever the result.
  used_at         timestamptz,
  -- The location result the phone bound into the token (e.g. inside / outside), never coordinates.
  location        text check (location ~ '^[a-z_]{1,20}$'),
  -- 'pass', or the first rule that failed.
  result          text check (result ~ '^[a-z_]{1,40}$'),
  -- SHA-256 (hex) of the one-time pass the Edge Function gave the phone; valid 120 s, used once.
  pass_hash       text check (pass_hash ~ '^[0-9a-f]{64}$'),
  pass_expires_at timestamptz,
  pass_used_at    timestamptz,
  check ((pass_hash is null) = (pass_expires_at is null))
);
create unique index if not exists integrity_challenges_pass_idx on integrity_challenges (pass_hash) where pass_hash is not null;
create index if not exists integrity_challenges_profile_idx on integrity_challenges (profile_id, issued_at desc);
alter table integrity_challenges enable row level security;
revoke all on integrity_challenges from public, anon, authenticated;

-- Failed self-scans, counted per centre and reason. No student id: staff see counts only (#213).
create table if not exists face_scan_failures (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  centre_id  smallint references centres (id),
  reason     text not null check (reason in ('outside', 'mocked', 'offline', 'window', 'integrity', 'liveness',
               'no_match', 'not_enrolled', 'other')),
  detail     text check (detail ~ '^[a-z_]{1,40}$')
);
create index if not exists face_scan_failures_at_idx on face_scan_failures (centre_id, at);
alter table face_scan_failures enable row level security;
revoke all on face_scan_failures from public, anon, authenticated;

-- Internal: counts one failed self-scan (P3-5's self-scan RPC, the integrity check).
create or replace function note_face_failure(p_centre smallint, p_reason text, p_detail text default null) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into face_scan_failures (centre_id, reason, detail) values (p_centre, p_reason, p_detail);
$$;

-- The student's phone, right before a self-scan: a single-use challenge, valid 60 s, for this
-- login, this student and this action. Returns { challenge, expires_at, login }. The phone asks
-- Play Integrity for a token with requestHash = SHA-256 of
-- 'mrdg-selfscan-v1|<login>|<action>|<challenge>|<location result>' and sends it to verify-integrity.
-- At most 10 challenges per login in 10 minutes.
-- Error codes: not_allowed, face_off, action_invalid, face_not_enrolled, too_many_requests, and
-- face_block_reason's.
create or replace function issue_integrity_challenge(p_action text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_student   uuid := my_student_id();
  v_reason    text;
  v_challenge text := replace(gen_random_uuid()::text, '-', '');
  v_expires   timestamptz := now() + interval '60 seconds';
begin
  if v_student is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  perform face_require_on();
  if p_action is null or p_action not in ('check_in', 'check_out') then raise exception 'action_invalid'; end if;
  v_reason := face_block_reason(v_student);
  if v_reason is not null then raise exception '%', v_reason; end if;
  if not exists (select 1 from face_enrolments where student_id = v_student and profile_id = auth.uid()
                    and enrolled_at is not null and revoked_at is null and expires_at > now()) then
    raise exception 'face_not_enrolled';
  end if;
  if (select count(*) from integrity_challenges where profile_id = auth.uid() and issued_at > now() - interval '10 minutes') >= 10 then
    raise exception 'too_many_requests';
  end if;
  insert into integrity_challenges (challenge, profile_id, student_id, action, expires_at)
  values (v_challenge, auth.uid(), v_student, p_action, v_expires);
  return jsonb_build_object('challenge', v_challenge, 'expires_at', v_expires, 'login', auth.uid());
end $$;

-- The Edge Function verify-integrity (service role), first: spends the challenge, whatever comes
-- next, and checks it belongs to the signed-in login and action, is not expired, and that face scan
-- is on. Returns { ok: true, student_id, issued_at_ms } or { ok: false, reason } (reason one of
-- challenge_unknown, challenge_used, challenge_not_yours, action_mismatch, challenge_expired,
-- location_invalid, face_off). Answers instead of raising, so the spend is kept.
create or replace function begin_integrity_check(p_challenge text, p_profile uuid, p_action text, p_location text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c        integrity_challenges;
  v_reason text;
begin
  update integrity_challenges set used_at = now()
   where challenge = p_challenge and used_at is null
  returning * into c;
  if not found then
    return jsonb_build_object('ok', false, 'reason',
      case when exists (select 1 from integrity_challenges where challenge = p_challenge) then 'challenge_used'
           else 'challenge_unknown' end);
  end if;
  v_reason := case
    when c.profile_id is distinct from p_profile then 'challenge_not_yours'
    when c.action is distinct from p_action then 'action_mismatch'
    when c.expires_at < now() then 'challenge_expired'
    when p_location is null or p_location !~ '^[a-z_]{1,20}$' then 'location_invalid'
    when not face_on() then 'face_off'
  end;
  update integrity_challenges
     set location = case when p_location ~ '^[a-z_]{1,20}$' then p_location end, result = v_reason
   where challenge = p_challenge;
  if v_reason is not null then
    perform note_face_failure((select home_centre_id from students where id = c.student_id), 'integrity', v_reason);
    return jsonb_build_object('ok', false, 'reason', v_reason);
  end if;
  return jsonb_build_object('ok', true, 'student_id', c.student_id,
                            'issued_at_ms', floor(extract(epoch from c.issued_at) * 1000)::bigint);
end $$;

-- The Edge Function, second: the verdict's result for a spent challenge ('pass' or the first failed
-- rule). On a pass it stores the SHA-256 of the one-time pass it gives the phone (valid 120 s).
-- Within 60 s of begin_integrity_check, once. Returns { ok: true, pass_expires_at } or
-- { ok: false, reason: challenge_not_open | challenge_expired }.
-- Error codes: result_invalid, pass_hash_invalid.
create or replace function finish_integrity_check(p_challenge text, p_result text, p_pass_hash text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare c integrity_challenges;
begin
  if p_result is null or p_result !~ '^[a-z_]{1,40}$' then raise exception 'result_invalid'; end if;
  if p_result = 'pass' and (p_pass_hash is null or p_pass_hash !~ '^[0-9a-f]{64}$') then raise exception 'pass_hash_invalid'; end if;
  select * into c from integrity_challenges
   where challenge = p_challenge and used_at is not null and result is null
   for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'challenge_not_open'); end if;
  if c.used_at < now() - interval '60 seconds' then
    update integrity_challenges set result = 'challenge_expired' where challenge = p_challenge;
    perform note_face_failure((select home_centre_id from students where id = c.student_id), 'integrity', 'challenge_expired');
    return jsonb_build_object('ok', false, 'reason', 'challenge_expired');
  end if;
  update integrity_challenges
     set result = p_result,
         pass_hash = case when p_result = 'pass' then p_pass_hash end,
         pass_expires_at = case when p_result = 'pass' then now() + interval '120 seconds' end
   where challenge = p_challenge
  returning * into c;
  if p_result <> 'pass' then
    perform note_face_failure((select home_centre_id from students where id = c.student_id), 'integrity', p_result);
  end if;
  return jsonb_build_object('ok', true, 'pass_expires_at', c.pass_expires_at);
end $$;

-- Internal, for the future self-scan RPC (P3-5, security definer, same transaction as the visit):
-- the phone's one-time pass, for the signed-in login, this action and this location result; spent
-- here. Returns the student id. Error codes: integrity_required, integrity_pass_used,
-- integrity_pass_expired, integrity_pass_mismatch.
create or replace function use_integrity_pass(p_pass text, p_action text, p_location text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare c integrity_challenges;
begin
  select * into c from integrity_challenges
   where pass_hash = encode(sha256(convert_to(coalesce(p_pass, ''), 'UTF8')), 'hex')
   for update;
  if not found or c.profile_id is distinct from auth.uid() or c.result is distinct from 'pass' then
    raise exception 'integrity_required' using detail = 'The phone''s integrity check is missing.';
  end if;
  if c.pass_used_at is not null then raise exception 'integrity_pass_used'; end if;
  if c.pass_expires_at < now() then raise exception 'integrity_pass_expired'; end if;
  if c.action is distinct from p_action or c.location is distinct from p_location then
    raise exception 'integrity_pass_mismatch';
  end if;
  update integrity_challenges set pass_used_at = now() where challenge = c.challenge;
  return c.student_id;
end $$;

-- ---------------------------------------------------------------- 8. staff counts (P3-6)
-- Per centre (a coordinator: their own; the Guru: every active centre): how many students have a
-- current face enrolment, and the failed self-scans in the period by reason, the integrity
-- failures also by rule. Counts only: no student is named (#213, Guru item 11).
-- Returns [{ centre_id, centre, enrolled, failures: { reason: n }, integrity: { rule: n } }].
-- Error codes: not_allowed, range_invalid, range_too_long.
create or replace function face_use_counts(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_centre smallint;
  v_out    jsonb;
begin
  if not is_staff() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'range_invalid'; end if;
  if p_to - p_from > 366 then raise exception 'range_too_long' using detail = 'At most a year.'; end if;
  v_centre := case when is_guru() then null else (select p.centre_id from profiles p where p.id = auth.uid()) end;
  select coalesce(jsonb_agg(jsonb_build_object(
           'centre_id', c.id,
           'centre', c.name,
           'enrolled', (select count(*) from face_enrolments e join students s on s.id = e.student_id
                         where s.home_centre_id = c.id and e.enrolled_at is not null and e.revoked_at is null
                           and e.expires_at > now()),
           'failures', (select coalesce(jsonb_object_agg(x.reason, x.n), '{}'::jsonb)
                          from (select f.reason, count(*) as n from face_scan_failures f
                                 where f.centre_id = c.id and local_day(f.at, c.id) between p_from and p_to
                                 group by f.reason) x),
           'integrity', (select coalesce(jsonb_object_agg(x.detail, x.n), '{}'::jsonb)
                           from (select coalesce(f.detail, 'other') as detail, count(*) as n from face_scan_failures f
                                  where f.centre_id = c.id and f.reason = 'integrity'
                                    and local_day(f.at, c.id) between p_from and p_to
                                  group by 1) x))
           order by c.name), '[]'::jsonb)
    into v_out
    from centres c
   where c.active and (v_centre is null or c.id = v_centre);
  return v_out;
end $$;

-- ---------------------------------------------------------------- 9. nightly housekeeping (#299)
-- Ends expired enrolments, requests never completed (1 hour), and those of students Left for 30
-- days; deletes match scores older than face_score_days, ended enrolments and failure counts older
-- than 400 days, challenges older than a day. Runs whether face scan is on or off. Returns the counts.
create or replace function face_housekeeping() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_expired int; v_waiting int; v_left int; v_scores int; v_old int; v_challenges int; v_failures int;
begin
  update face_enrolments set revoked_at = now(), revoke_reason = 'expired'
   where revoked_at is null and enrolled_at is not null and expires_at <= now();
  get diagnostics v_expired = row_count;
  update face_enrolments set revoked_at = now(), revoke_reason = 'not_completed', code_hash = null
   where revoked_at is null and enrolled_at is null and requested_at < now() - interval '1 hour';
  get diagnostics v_waiting = row_count;
  update face_enrolments e set revoked_at = now(), revoke_reason = 'left', code_hash = null
    from students s
   where s.id = e.student_id and e.revoked_at is null and s.status = 'left'
     and coalesce((select max(h.changed_at) from status_history h where h.student_id = s.id and h.to_status = 'left'),
                  s.created_at) < now() - interval '30 days';
  get diagnostics v_left = row_count;
  delete from visit_face_scores where scored_at < now() - make_interval(days => coalesce(setting_int('face_score_days'), 60));
  get diagnostics v_scores = row_count;
  delete from face_enrolments where revoked_at < now() - interval '400 days';
  get diagnostics v_old = row_count;
  delete from integrity_challenges where issued_at < now() - interval '1 day';
  get diagnostics v_challenges = row_count;
  delete from face_scan_failures where at < now() - interval '400 days';
  get diagnostics v_failures = row_count;
  return jsonb_build_object('expired', v_expired, 'not_completed', v_waiting, 'left', v_left, 'scores_deleted', v_scores,
                            'enrolments_deleted', v_old, 'challenges_deleted', v_challenges, 'failures_deleted', v_failures);
end $$;
select cron.schedule('mridanga-face-housekeeping', '55 1 * * *', 'select face_housekeeping()');

-- ---------------------------------------------------------------- who may run them
-- docs/DECISIONS.md #14. App: the desk, the student's phone and the staff counts check the caller
-- inside. The Edge Function (service role): begin/finish_integrity_check. Internal: the rest.
revoke execute on function face_on(), face_require_on(), face_model_version(), face_block_reason(uuid),
  revoke_face_enrolments(uuid, text), note_face_failure(smallint, text, text), use_integrity_pass(text, text, text),
  face_housekeeping(), guard_face_consent(), fill_consent_revoked_by(), end_face_on_consent(), end_face_on_student(),
  end_face_on_login_off(), end_face_on_model_change(), guard_face_visit()
  from public, anon, authenticated, service_role;
revoke execute on function begin_integrity_check(text, uuid, text, text), finish_integrity_check(text, text, text)
  from public, anon, authenticated;
grant execute on function begin_integrity_check(text, uuid, text, text), finish_integrity_check(text, text, text)
  to service_role;
revoke execute on function record_face_consent(uuid, boolean, uuid, text, boolean, text),
  start_face_enrolment(text, text), approve_face_enrolment(uuid, text), enrol_face(bigint, text),
  my_face_enrolment(text), remove_face(uuid, text), get_face_enrolments(uuid), issue_integrity_challenge(text),
  face_use_counts(date, date)
  from public, anon;
grant execute on function record_face_consent(uuid, boolean, uuid, text, boolean, text),
  start_face_enrolment(text, text), approve_face_enrolment(uuid, text), enrol_face(bigint, text),
  my_face_enrolment(text), remove_face(uuid, text), get_face_enrolments(uuid), issue_integrity_challenge(text),
  face_use_counts(date, date)
  to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on table face_enrolments is 'Face scan enrolments (0060, #295): who, which phone (device_key), model, who confirmed it at the desk, when, until when, how it ended. NO face code: it stays on the phone. No direct access; ended rows deleted after 400 days.';
comment on table visit_face_scores is 'The 1:1 match score of a face check-in (0060, #299), deleted after face_score_days (60). Apart from visits so audit_log never copies it.';
comment on table integrity_challenges is 'Single-use challenges for the Play Integrity check of a self-scan (0060, #296): login, student, action, 60 s; the result and the hash of the one-time pass. Deleted after a day.';
comment on table face_scan_failures is 'Failed self-scans per centre and reason, no student id (0060); staff see counts through face_use_counts. Deleted after 400 days.';
comment on column consents.child_assent is 'Face consent of a minor: the child said yes themselves (read out at the desk) (0060, #298).';
comment on column consents.assent_read_by is 'Face consent of a minor: the staff login that read the child their part of the form (0060, #298).';
comment on column consents.revoked_by is 'The login that revoked the consent (the Guru, the desk, or the student turning face scan off); null before 0060 or from the SQL editor (0060).';
comment on column visits.liveness_ok is 'Face check-in only: the liveness check passed on the phone (0060). Null for every other method.';
comment on function guard_setting is 'Trigger: checks the value of each setting the app may change; the app cannot add or delete settings, nor change face_* (SQL editor only) (docs/DECISIONS.md #47, #289, #300).';
comment on function face_on is 'Internal: true when the setting face_enabled is true (0060, #300).';
comment on function face_require_on is 'Internal: raises face_off unless face scan is switched on (0060, #300).';
comment on function face_model_version is 'Internal: the embedding model the phones must use (setting face_model_version) (0060).';
comment on function face_block_reason is 'Internal: why a student cannot use face scan now (withdrawn, left, age, no current face consent with the child''s yes), or null (0060, #298).';
comment on function guard_face_consent is 'Trigger: app users record a face consent only through record_face_consent (face_consent_at_desk) (0060).';
comment on function fill_consent_revoked_by is 'Trigger: a revoked consent keeps who revoked it (revoked_by) (0060).';
comment on function record_face_consent is 'Staff at the desk: records a face consent; an adult''s own, or a minor''s parent with the ID seen plus the child''s own yes; refused under face_min_age (0060, #298).';
comment on function revoke_face_enrolments is 'Internal: ends every open enrolment and request of a student with a reason; returns how many (0060).';
comment on function start_face_enrolment is 'Student''s phone: asks to enrol this phone; returns a 6-digit code for the coordinator, valid 10 minutes (0060, #297).';
comment on function approve_face_enrolment is 'Staff who see the student: type the code from the student''s phone; never for their own record; 5 wrong codes end the request (0060, #297).';
comment on function enrol_face is 'Student''s phone, within 10 minutes of the coordinator''s confirmation: records the enrolment (no face code); the earlier phone''s ends (0060, #297).';
comment on function my_face_enrolment is 'Student''s phone: is face scan on, is this phone''s enrolment current (else wipe the face code), a waiting request (0060, #295).';
comment on function remove_face is 'Face scan off: the student (one tap) or staff at the desk (desk, lost_phone); student_off and desk also revoke the face consent; always allowed (0060, #298).';
comment on function get_face_enrolments is 'Staff: a student''s face enrolments with their state, no device key; writes one access_log row (0060).';
comment on function end_face_on_consent is 'Trigger: a revoked or deleted face or data consent ends the student''s face enrolments (0060, #299).';
comment on function end_face_on_student is 'Trigger: a withdrawn record, or a login taken off or put on the record, ends its face enrolments (0060, #299).';
comment on function end_face_on_login_off is 'Trigger: a switched-off login''s face enrolments end (0060, #299).';
comment on function end_face_on_model_change is 'Trigger: a new face_model_version ends the enrolments made with another model (0060, #299).';
comment on function guard_face_visit is 'Trigger: method face and liveness_ok only from the self-scan path (app.face_visit) while face scan is on (face_visit_reserved) (0060, S4F-01).';
comment on function note_face_failure is 'Internal: counts one failed self-scan for a centre (0060).';
comment on function issue_integrity_challenge is 'Student''s phone: a single-use challenge for the Play Integrity check of one self-scan, 60 s, bound to login, student and action (0060, #296).';
comment on function begin_integrity_check is 'Edge Function verify-integrity (service role): spends a challenge and checks login, action, expiry, location result and the switch (0060, #296).';
comment on function finish_integrity_check is 'Edge Function verify-integrity (service role): records the verdict; on a pass the hash of a one-time pass valid 120 s (0060, #296).';
comment on function use_integrity_pass is 'Internal, for the self-scan RPC (P3-5): spends the caller''s one-time integrity pass for this action and location result; returns the student (0060, #296).';
comment on function face_use_counts is 'Staff: per centre, students with face scan and failed self-scans by reason (integrity by rule); counts only (0060, P3-6).';
comment on function face_housekeeping is 'Nightly job (pg_cron mridanga-face-housekeeping, 01:55 UTC): ends expired, unfinished and Left+30 enrolments; deletes old scores, challenges, failures and ended enrolments (0060, #299).';
