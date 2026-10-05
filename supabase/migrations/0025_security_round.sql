-- Mridanga Seva — 0025: security round. Closes staff side doors on a child's record, makes the
-- consent register trustworthy, adds erasure and consent withdrawal, and takes table and function
-- rights away from anon. Run once, after 0024, in the Supabase SQL editor (TEST first).
-- Why: docs/DECISIONS.md #72-#77. How: docs/DATABASE.md "Security round (0025)", and the runbooks
-- "Erasure request" and "Consent withdrawal" in docs/OPERATIONS.md.
--
-- Praveen decided on 5 Oct 2026: only the Guru erases a student or records a withdrawal; a
-- withdrawal FREEZES the record (login off, phones forgotten, history kept, nothing new recorded)
-- until the Guru erases it or the parent consents again; erasing removes the login too; the
-- "parent signed the paper form" tick keeps its wording and is now required by the database.
--
-- 1. Switched-off logins: toggle_visit / scan_qr check the role NULL-safely (#72).
-- 2. A child's record: profile_id, qr_token, created_by, withdrawn_* frozen for app users; links
--    only through the linking functions; a date of birth is required; the own record needs an
--    active student login; a deleted record's login goes back to pending (#73).
-- 3. Consents: insert-only for staff, server-set verified_by / given_at, a signed-form flag;
--    revoking and deleting are the Guru's; checked at commit; consents and guardians audited (#74).
-- 4. withdraw_consent() and erase_student(), with a tombstone table (#75, #76).
-- 5. anon loses every table, sequence and function right in public (#77).

-- ---------------------------------------------------------------- 1. switched-off logins
-- my_role() is NULL for a switched-off login (and for a login without a profile), and
-- `NULL not in (...)` is NULL, which an IF treats as false: 0024's toggle_visit let them through.
-- Same as 0024 otherwise. scan_qr checks first too, so a switched-off login cannot even learn
-- whether a QR code belongs to someone.
create or replace function toggle_visit(p_student uuid, p_method visit_method, p_device text default null,
                                        p_location jsonb default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v visits; s students; v_check text; v_dist int;
begin
  if not coalesce(my_role() in ('guru', 'coordinator', 'kiosk'), false) then
    raise exception 'not allowed';
  end if;
  select * into s from students where id = p_student;
  if not found then raise exception 'student not found'; end if;

  update visits set check_out = now()
   where student_id = p_student and check_out is null
  returning * into v;

  if found then
    return jsonb_build_object('action', 'out', 'roll_no', s.roll_no, 'full_name', s.full_name,
      'photo_path', s.photo_path, 'at', v.check_out,
      'minutes', round(extract(epoch from v.check_out - v.check_in) / 60));
  end if;

  if p_location is not null then
    select x.location_check, x.location_distance_m into v_check, v_dist
      from visit_location_result(p_location, s.home_centre_id) x;
  end if;

  insert into visits (student_id, centre_id, method, device_id, location_check, location_distance_m)
  values (p_student, s.home_centre_id, p_method, p_device, v_check, v_dist)
  returning * into v;

  -- any visit makes the student active again (a Left student who returns is reactivated)
  if s.status <> 'active' then
    perform set_config('app.via_call_log', 'on', true);
    update students set status = 'active', paused_until = null where id = p_student;
  end if;
  update follow_up_tasks set done_at = now() where student_id = p_student and done_at is null;

  return jsonb_build_object('action', 'in', 'roll_no', s.roll_no, 'full_name', s.full_name,
    'photo_path', s.photo_path, 'at', v.check_in,
    'location_check', v.location_check, 'distance_m', v.location_distance_m);
end $$;

create or replace function scan_qr(p_qr uuid, p_device text default null, p_location jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s_id uuid;
begin
  if not coalesce(my_role() in ('guru', 'coordinator', 'kiosk'), false) then
    raise exception 'not allowed';
  end if;
  select id into s_id from students where qr_token = p_qr;
  if s_id is null then return jsonb_build_object('action', 'unknown'); end if;
  return toggle_visit(s_id, 'qr', p_device, p_location);
end $$;

-- ---------------------------------------------------------------- 2. a child's record
-- A withdrawn record (section 4) is frozen: withdrawn_at says since when, withdrawn_note why.
alter table students
  add column withdrawn_at   timestamptz,
  add column withdrawn_note text check (char_length(withdrawn_note) <= 500);

-- For app users only (the app connects as anon or authenticated), like 0014's guards. The
-- linking paths run as the function owner and are not stopped: link_login_to_student and the
-- students_link_login trigger (0002), link_student_login (0014) and unlink_student_login below.
-- The trigger's name sorts before students_link_login (BEFORE triggers fire in name order), so it
-- judges the change the app sent, not the profile_id that the 0002 trigger fills in: saving an
-- email on a record without a login still links; changing profile_id itself is refused.
-- Error codes: student_field_locked (detail names the field), dob_required, student_withdrawn.
create or replace function guard_student_frozen() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    if new.dob is null then
      raise exception 'dob_required' using detail = 'A date of birth decides whether parental consent is needed.';
    end if;
    if new.withdrawn_at is not null or new.withdrawn_note is not null then
      raise exception 'student_field_locked' using detail = 'withdrawn_at';
    end if;
    return new;
  end if;

  if old.withdrawn_at is not null then
    raise exception 'student_withdrawn' using detail = 'Consent was withdrawn: the record is frozen until the Guru erases it or the parent consents again.';
  end if;
  if new.profile_id is distinct from old.profile_id then
    raise exception 'student_field_locked' using detail = 'profile_id: link a login with link_student_login (the Guru) or by email.';
  end if;
  if new.qr_token is distinct from old.qr_token then
    raise exception 'student_field_locked' using detail = 'qr_token';
  end if;
  if new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'student_field_locked' using detail = 'created_by';
  end if;
  if new.withdrawn_at is distinct from old.withdrawn_at or new.withdrawn_note is distinct from old.withdrawn_note then
    raise exception 'student_field_locked' using detail = 'withdrawn_at: use withdraw_consent (the Guru).';
  end if;
  if new.dob is null then
    raise exception 'dob_required' using detail = 'A date of birth decides whether parental consent is needed.';
  end if;
  return new;
end $$;

create trigger students_frozen_guard before insert or update on students
  for each row execute function guard_student_frozen();

-- 0017 makes a level change the Guru's. A change made straight on the table (not through
-- decide_promotion, which writes its own row) is now kept in level_history too. The function runs
-- as the owner (level_history has no insert policy), so the caller's role is read in the
-- trigger's WHEN clause; decide_promotion runs as the owner and is skipped there.
create or replace function note_level_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into level_history (student_id, from_level, to_level, approved_by)
  values (new.id, old.level_id, new.level_id, auth.uid());
  return new;
end $$;
create trigger students_level_history after update of level_id on students
  for each row when (new.level_id is distinct from old.level_id
                     and current_user in ('anon', 'authenticated'))
  execute function note_level_change();

-- A switched-off student login no longer reads its own record (nor, through this policy, its own
-- visits, ticks and level history, whose policies look the record up as the caller).
drop policy own_or_staff on students;
create policy own_or_staff on students for select to authenticated
  using ((profile_id = auth.uid() and coalesce(my_role() = 'student', false)) or is_staff());

-- When a student record is deleted, its login goes back to waiting (pending), so it does not stay
-- a "student" with no record.
create or replace function release_student_login() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.profile_id is not null then
    update profiles set role = 'pending' where id = old.profile_id and role = 'student';
  end if;
  return old;
end $$;
create trigger students_release_login after delete on students
  for each row execute function release_student_login();

-- G2: the Guru takes a login off a student record (a wrong link); the login goes back to waiting.
-- Error codes: not_allowed, student_not_found, student_not_linked.
create or replace function unlink_student_login(p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_profile uuid;
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select profile_id into v_profile from students where id = p_student for update;
  if not found then raise exception 'student_not_found'; end if;
  if v_profile is null then raise exception 'student_not_linked'; end if;
  update students set profile_id = null where id = p_student;
  update profiles set role = 'pending' where id = v_profile and role = 'student';
end $$;

-- ---------------------------------------------------------------- 3. consents
-- signed_form: the coordinator confirmed that the parent filled in and signed the paper form, and
-- that it is kept with the class records. NULL = recorded before 0025 (the app asked for the tick
-- but did not send it), so unknown; every consent written in the app from now on has true.
alter table consents add column signed_form boolean;

-- For app users: a new consent is verified by the person saving it, now, never revoked or
-- confirmed by code at birth, and a written one needs the signed-form tick. After that a consent
-- cannot be edited, except that the Guru may revoke it (revoked_at, once). Deleting is the
-- Guru's too (policy below). Error codes: written_consent_required, consent_locked, not_allowed.
create or replace function guard_consent() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    new.verified_by     := auth.uid();
    new.given_at        := now();
    new.revoked_at      := null;
    new.otp_verified_at := null;
    if new.method = 'written' and new.signed_form is not true then
      raise exception 'written_consent_required' using detail = 'Tick that the parent signed the paper consent form.';
    end if;
    return new;
  end if;

  if (to_jsonb(new) - 'revoked_at') is distinct from (to_jsonb(old) - 'revoked_at') then
    raise exception 'consent_locked' using detail = 'A consent is not edited: revoke it and record a new one.';
  end if;
  if new.revoked_at is distinct from old.revoked_at then
    if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
    if old.revoked_at is not null then
      raise exception 'consent_locked' using detail = 'A revoked consent stays revoked: record a new one.';
    end if;
  end if;
  return new;
end $$;
create trigger consents_guard before insert or update on consents
  for each row execute function guard_consent();

drop policy staff_all on consents;
create policy staff_read   on consents for select to authenticated using (is_staff());
create policy staff_insert on consents for insert to authenticated with check (is_staff());
create policy staff_update on consents for update to authenticated using (is_staff());  -- guard_consent decides
create policy guru_delete  on consents for delete to authenticated using (is_guru());

-- At commit, for everyone (app, dashboard, import): a student under 18 who is still on record and
-- not withdrawn keeps a current data consent and a guardian. 0003 checks this when a student is
-- added or their date of birth changes; this checks it when a consent or guardian changes or goes.
-- Only withdraw_consent (section 4) may leave a minor without consent: it marks the record
-- withdrawn first. Erasure deletes the record itself, which this check then skips.
create or replace function recheck_minor_consent() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
  v_id  uuid;
  s     students;
begin
  if tg_op = 'UPDATE' then
    v_ids := array[old.student_id, new.student_id];
  else
    v_ids := array[old.student_id];
  end if;
  foreach v_id in array v_ids loop
    select * into s from students where id = v_id;
    continue when not found or s.withdrawn_at is not null or not is_minor(s);
    if not exists (select 1 from consents c
                    where c.student_id = v_id and c.scope = 'data' and c.revoked_at is null) then
      raise exception 'minor_needs_consent'
        using detail = format('Student %s is under 18 and would have no parental consent on record.', s.roll_no),
              hint = 'Record a new consent first, or use withdraw_consent (the Guru).';
    end if;
    if not exists (select 1 from guardians g where g.student_id = v_id) then
      raise exception 'minor_needs_guardian'
        using detail = format('Student %s is under 18 and would have no parent or guardian on record.', s.roll_no);
    end if;
  end loop;
  return null;
end $$;
create constraint trigger consents_minor_recheck
  after update of revoked_at, scope, student_id or delete on consents
  deferrable initially deferred
  for each row execute function recheck_minor_consent();
create constraint trigger guardians_minor_recheck
  after update of student_id or delete on guardians
  deferrable initially deferred
  for each row execute function recheck_minor_consent();

-- Every consent and guardian change is kept in audit_log (G11).
create trigger audit_consents after insert or update or delete on consents
  for each row execute function audit_row();
create trigger audit_guardians after insert or update or delete on guardians
  for each row execute function audit_row();

-- register_student as in 0003, with p_written_consent: for a minor it must be true (the
-- coordinator ticked "the parent signed the paper form"), and it is stored on the consents.
-- New error code: written_consent_required.
drop function register_student(text, date, text, text, text, text, smallint, uuid,
  text, text, text, text, text, boolean);
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
  p_written_consent   boolean default null
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
  if minor and p_written_consent is not true then
    raise exception 'written_consent_required';
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
    insert into consents (student_id, guardian_id, scope, method, id_type_checked, signed_form)
    values (s.id, g_id, 'data', 'written', p_id_type_checked, true);
    if p_photo_consent then
      insert into consents (student_id, guardian_id, scope, method, id_type_checked, signed_form)
      values (s.id, g_id, 'photo', 'written', p_id_type_checked, true);
    end if;
  end if;

  return jsonb_build_object('id', s.id, 'roll_no', s.roll_no, 'linked', s.profile_id is not null);
end $$;

-- ---------------------------------------------------------------- 4. withdrawal and erasure
-- Who may call these: the Guru in the app, or the owner in the Supabase SQL editor (no signed-in
-- user; the session's role is not anon / authenticated). A security definer function runs as its
-- owner, but the session's role setting stays what PostgREST set for the caller.
create or replace function privacy_caller_ok() returns boolean
language sql stable set search_path = public as $$
  select is_guru() or coalesce(current_setting('role', true), 'none') not in ('anon', 'authenticated')
$$;

-- A withdrawn record is frozen: no new visits or calls (errors student_withdrawn), and the daily
-- job's call tasks for it are dropped quietly.
create or replace function refuse_withdrawn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from students where id = new.student_id and withdrawn_at is not null) then
    if tg_table_name = 'follow_up_tasks' then return null; end if;
    raise exception 'student_withdrawn' using detail = 'Consent was withdrawn: nothing new is recorded for this student.';
  end if;
  return new;
end $$;
create trigger visits_refuse_withdrawn before insert on visits
  for each row execute function refuse_withdrawn();
create trigger call_logs_refuse_withdrawn before insert on call_logs
  for each row execute function refuse_withdrawn();
create trigger follow_up_tasks_refuse_withdrawn before insert on follow_up_tasks
  for each row execute function refuse_withdrawn();
create trigger student_progress_refuse_withdrawn before insert on student_progress
  for each row execute function refuse_withdrawn();

-- D4-04: a parent (or an adult student) withdraws consent. In one step: the record is marked
-- withdrawn (kept, frozen), every consent of the student is revoked, an open visit is closed,
-- open call tasks are closed, the login is switched off and its phones forgotten. The students
-- and consents audit rows written now are the proof of the withdrawal. Returns
-- { roll_no, consents_revoked, login_switched_off }.
-- Error codes: not_allowed, student_not_found, already_withdrawn, note_too_long.
create or replace function withdraw_consent(p_student uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s       students;
  v_note  text := nullif(btrim(coalesce(p_note, ''), E' \t\r\n'), '');
  v_count int;
begin
  if not privacy_caller_ok() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if char_length(v_note) > 500 then raise exception 'note_too_long'; end if;
  select * into s from students where id = p_student for update;
  if not found then raise exception 'student_not_found'; end if;
  if s.withdrawn_at is not null then raise exception 'already_withdrawn'; end if;

  update students set withdrawn_at = now(), withdrawn_note = v_note where id = p_student;
  update consents set revoked_at = now() where student_id = p_student and revoked_at is null;
  get diagnostics v_count = row_count;
  update visits set check_out = now() where student_id = p_student and check_out is null;
  update follow_up_tasks set done_at = now() where student_id = p_student and done_at is null;
  if s.profile_id is not null then
    delete from push_tokens where profile_id = s.profile_id;
    update profiles set active = false where id = s.profile_id;
  end if;
  return jsonb_build_object('roll_no', s.roll_no, 'consents_revoked', v_count,
                            'login_switched_off', s.profile_id is not null);
end $$;

-- One row per erased student: what is kept after an erasure (DPDP Rules: proof that a request was
-- met, without the person's data). Guru only.
create table erasures (
  id           bigint generated always as identity primary key,
  roll_no      text,
  erased_at    timestamptz not null default now(),
  erased_by    uuid,
  reason       text not null check (char_length(reason) between 1 and 500),
  request_ref  text check (char_length(request_ref) <= 100),
  audit_rows_redacted int not null default 0
);
alter table erasures enable row level security;
create policy guru_read on erasures for select to authenticated using (is_guru());
revoke all on erasures from public, anon, authenticated;
grant select on erasures to authenticated;

-- D4-03: erase a student on the parent's (or the adult student's) request. In this order:
--   1. the student's phones are forgotten;
--   2. her past instrument loans go (an open loan stops the erasure: take the instrument back);
--   3. the student row is deleted, with everything keyed on it (visits, calls, tasks, history,
--      ticks, guardians, consents, practice, assessments, events, nominations);
--   4. her login is deleted (auth.users, which removes the profile, replies, read receipts,
--      group memberships, notifications); if the owner may not delete from auth.users, only the
--      profile goes and the runbook deletes the login in Authentication -> Users;
--   5. ONLY THEN audit_log is redacted: every row whose row id or copied values hold her student
--      id, login id, QR token or email keeps table, action, time and who, but loses the values;
--   6. a tombstone row in erasures.
-- Returns { roll_no, login_deleted, audit_rows_redacted, files } — files = Storage paths (photo,
-- recordings) the runbook deletes by hand. Error codes: not_allowed, reason_required,
-- reason_too_long, student_not_found, open_loan.
create or replace function erase_student(p_student uuid, p_reason text, p_request_ref text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s          students;
  v_reason   text := nullif(btrim(coalesce(p_reason, ''), E' \t\r\n'), '');
  v_ref      text := nullif(btrim(coalesce(p_request_ref, ''), E' \t\r\n'), '');
  v_email    text;
  v_files    jsonb;
  v_needles  text[];
  v_redacted int;
  v_login    boolean := false;
begin
  if not privacy_caller_ok() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v_reason is null then raise exception 'reason_required'; end if;
  if char_length(v_reason) > 500 or char_length(v_ref) > 100 then raise exception 'reason_too_long'; end if;
  select * into s from students where id = p_student for update;
  if not found then raise exception 'student_not_found'; end if;
  if exists (select 1 from inventory_loans where student_id = p_student and returned_at is null) then
    raise exception 'open_loan' using detail = 'Take the lent instrument back first.';
  end if;

  select lower(email) into v_email from profiles where id = s.profile_id;
  select coalesce(jsonb_agg(distinct f), '[]'::jsonb) into v_files
    from (select s.photo_path as f where s.photo_path is not null
          union
          select x #>> '{}'
            from assessment_submissions sub
            join assessment_assignments aa on aa.id = sub.assignment_id
           cross join lateral jsonb_path_query(jsonb_build_array(sub.file, sub.voice_note), '$.**.path') x
           where aa.student_id = p_student) files;
  v_needles := array_remove(array[p_student::text, s.profile_id::text, s.qr_token::text,
                                  lower(s.email), v_email], null);

  if s.profile_id is not null then
    delete from push_tokens where profile_id = s.profile_id;
  end if;
  delete from inventory_loans where student_id = p_student;
  delete from students where id = p_student;

  if s.profile_id is not null then
    begin
      delete from auth.users where id = s.profile_id;
      v_login := found;
    exception when insufficient_privilege then
      v_login := false;
    end;
    delete from profiles where id = s.profile_id;  -- gone already when the login was deleted
  end if;

  update audit_log a
     set old_row = null, new_row = null
   where (a.old_row is not null or a.new_row is not null)
     and (a.row_id = any (v_needles)
          or exists (select 1 from unnest(v_needles) n
                      where position(n in lower(coalesce(a.old_row::text, '') || coalesce(a.new_row::text, ''))) > 0));
  get diagnostics v_redacted = row_count;

  insert into erasures (roll_no, erased_by, reason, request_ref, audit_rows_redacted)
  values (s.roll_no, auth.uid(), v_reason, v_ref, v_redacted);

  return jsonb_build_object('roll_no', s.roll_no, 'login_deleted', v_login,
                            'audit_rows_redacted', v_redacted, 'files', v_files);
end $$;

-- ---------------------------------------------------------------- 5. anon loses its default rights
-- Supabase gives anon (no login) every right on new tables, sequences and functions in public.
-- Row-level security keeps every table closed to anon today (no policy names anon), but the rights
-- are a second door. Taken away from everything that exists now, and from new tables and sequences
-- made later by the same owner. Functions: anon also gets EXECUTE through PUBLIC, which cannot be
-- changed per schema, so the right is taken away from what exists now and the grant sweep in
-- supabase/tests catches a new function that forgets (docs/DECISIONS.md #77). Only objects this
-- migration's role owns are touched, never an extension's.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proowner = (select oid from pg_roles where rolname = current_user)
       and not exists (select 1 from pg_depend d
                        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    -- Keep what signed-in people and the Edge Functions could run; only anon (and PUBLIC) lose it.
    if has_function_privilege('authenticated', f, 'execute') then
      execute format('grant execute on function %s to authenticated', f);
    end if;
    if has_function_privilege('service_role', f, 'execute') then
      execute format('grant execute on function %s to service_role', f);
    end if;
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end $$;

-- ---------------------------------------------------------------- who may run the new functions
-- docs/DECISIONS.md #14. Internal: the triggers and the caller check. App: the Guru's three, each
-- checking the caller inside.
revoke execute on function guard_student_frozen(), note_level_change(), release_student_login(),
  guard_consent(), recheck_minor_consent(), refuse_withdrawn(), privacy_caller_ok()
  from public, anon, authenticated;
revoke execute on function unlink_student_login(uuid), withdraw_consent(uuid, text),
  erase_student(uuid, text, text),
  register_student(text, date, text, text, text, text, smallint, uuid, text, text, text, text, text, boolean, boolean)
  from public, anon;
grant execute on function unlink_student_login(uuid), withdraw_consent(uuid, text),
  erase_student(uuid, text, text),
  register_student(text, date, text, text, text, text, smallint, uuid, text, text, text, text, text, boolean, boolean)
  to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on column students.withdrawn_at is 'When consent was withdrawn (withdraw_consent, the Guru). The record is then frozen: no edits, visits or calls.';
comment on column students.withdrawn_note is 'Why or how the withdrawal came (at most 500 characters), e.g. "mother, by phone, 5 Oct".';
comment on column consents.signed_form is 'The coordinator confirmed the parent signed the paper form, kept with the class records. NULL = recorded before 0025.';
comment on table erasures is 'One row per erased student: roll number, when, by whom, why and the request reference. Nothing else about the person is kept.';
comment on function erase_student is 'D4-03: the Guru erases a student on request: record, login, phones, then redacts audit_log copies; leaves a tombstone in erasures.';
comment on function withdraw_consent is 'D4-04: the Guru records a withdrawal of consent: record frozen, consents revoked, login off, phones forgotten.';
comment on function unlink_student_login is 'G2: the Guru takes a login off a student record; the login goes back to pending.';
comment on function guard_student_frozen is 'Trigger: app users cannot change profile_id, qr_token, created_by or withdrawal fields, nor leave out the date of birth; a withdrawn record is frozen.';
comment on function guard_consent is 'Trigger: app users add consents (verified_by / given_at set here, written ones need signed_form); only the Guru revokes; nothing else changes.';
comment on function recheck_minor_consent is 'Trigger at commit: a minor on record (not withdrawn) keeps a current data consent and a guardian.';
comment on function refuse_withdrawn is 'Trigger: nothing new (visit, call, tick) for a withdrawn student; call tasks are dropped.';
comment on function release_student_login is 'Trigger: a deleted student record''s login goes back to pending.';
comment on function note_level_change is 'Trigger: a level change made straight on students (by the Guru) is kept in level_history.';
comment on function privacy_caller_ok is 'Internal: the Guru in the app, or the owner in the SQL editor.';
comment on function register_student is 'Registers a student; for a minor also the guardian and written consent (signed-form tick required), all or nothing. Coordinators and Guru only.';
