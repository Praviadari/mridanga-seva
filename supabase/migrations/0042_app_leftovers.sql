-- 0042 App leftovers (audit 01-10-2026, Low/Info code-quality items; docs/DECISIONS.md #219-#220).
-- 1. D13-05: students.roll_no is NOT NULL. assign_roll_no (0001) sets it on every insert, so this only writes
--    the rule down: a restore or an import without the trigger can no longer leave a student without one.
--    Stops with roll_no_missing (and changes nothing) when a student without a roll number exists.
-- 2. D13-02: the last two triggers that answered with English sentences use codes like every other
--    function (the convention in docs/DATABASE.md): roll_no_frozen, status_needs_call_log, role_guru_only.
--    toggle_visit and scan_qr switched to codes in 0037.
-- 3. D13-06: COMMENT ON for the functions the row-level security policies and storage rules call, the two
--    0001 functions the audit found without one, and the non-obvious columns of the core tables.
-- Needs 0001-0040 (0041 was never used). Safe to run twice.

-- ---------------------------------------------------------------- 1. roll_no not null (D13-05)
do $$
begin
  if exists (select 1 from students where roll_no is null) then
    raise exception 'roll_no_missing'
      using detail = 'Some students have no roll number; give them one before running 0042 again.',
            hint = 'select id, full_name, joined_on from students where roll_no is null;';
  end if;
end $$;
alter table students alter column roll_no set not null;

-- ---------------------------------------------------------------- 2. error codes (D13-02)
-- 0001's guard, with codes instead of sentences; otherwise unchanged.
create or replace function guard_student_update() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.roll_no is distinct from old.roll_no then
    raise exception 'roll_no_frozen' using detail = 'A roll number never changes once given.';
  end if;
  -- Paused / Left only through a call log (log_call sets app.via_call_log)
  if new.status is distinct from old.status
     and new.status in ('paused', 'left')
     and coalesce(current_setting('app.via_call_log', true), '') <> 'on' then
    raise exception 'status_needs_call_log'
      using detail = format('Status %s is set only by logging a call.', new.status);
  end if;
  if new.status is distinct from old.status then
    insert into status_history (student_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end $$;

-- 0002's guard, with a code instead of the sentence; otherwise unchanged.
create or replace function guard_profile_update() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user in ('anon', 'authenticated')
     and not is_guru()
     and (new.role is distinct from old.role
          or new.is_treasurer is distinct from old.is_treasurer
          or new.active is distinct from old.active) then
    raise exception 'role_guru_only' using detail = 'Only the Guru changes a role, the treasurer or whether a login is switched on.';
  end if;
  return new;
end $$;

-- Trigger functions are never called directly (D14-03 allow-list).
revoke execute on function guard_student_update() from public, anon, authenticated;
revoke execute on function guard_profile_update() from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. comments (D13-06)
comment on function guard_student_update() is
  'Trigger on students: the roll number never changes (roll_no_frozen); Paused and Left only through log_call (status_needs_call_log); every status change goes to status_history.';
comment on function guard_profile_update() is
  'Trigger on profiles: an app user who is not the Guru cannot change role, is_treasurer or active (role_guru_only). The dashboard and the owner''s functions may.';
comment on function handle_user_confirmed() is
  'Trigger on auth.users: when a login confirms its email, link_login_to_student links it to the student record with the same email.';
comment on function is_treasurer() is
  'True when the signed-in person is an active coordinator marked as treasurer (fund screens). Used by row-level security.';
comment on function my_student_id() is
  'The student record of the signed-in student login, or null for anyone else. Used by row-level security.';
comment on function guru_ids() is
  'Profile ids of the active Guru logins (push messages and fund approvals send to them).';
comment on function event_visible_to(bigint, uuid) is
  'True when the profile is in the event''s audience or performs in it. Used by row-level security on events.';
comment on function event_people(bigint) is
  'Profile ids an event concerns: its audience and its performers'' active logins (push messages).';
comment on function poll_is_closed(timestamptz, timestamptz) is
  'True when a poll was closed by hand or its closing time has passed.';
comment on function next_level(smallint) is
  'The level after the given one in levels.sort order, or null after the last (promotion).';
comment on function inventory_centre_ok(smallint) is
  'True when the signed-in staff member may handle instruments of this centre: the Guru any, a coordinator their own centre (or any when theirs is not set).';
comment on function fund_approvers(uuid) is
  'Who may approve a fund entry made by p_maker: the active Guru logins other than the maker, and for an entry by the Guru the active treasurers too.';
comment on function clean_audience(text, smallint, bigint) is
  'Checks and tidies an audience (all, level, mentees, staff, group) for announcements, events and polls: a level or group only where the audience needs it. Errors audience_invalid, level_required, group_required.';
comment on function ig_audio_path_ok(text) is
  'True when a sloka recording''s storage path has the expected form: <uuid>/<uuid>.<audio extension>.';
comment on function ig_audio_readable(text) is
  'Storage rule: an Ishtagoshti editor reads any recording; others only one a sloka uses.';
comment on function assessment_file_readable(text) is
  'Storage rule for assessment files: the Guru reads all; staff and students their own uploads and the files of an assessment or submission they can see.';
comment on function fund_bill_readable(text) is
  'Storage rule for fund bills: staff read a bill an entry lists, or their own upload before it is saved.';

comment on column students.profile_id is 'The app login linked to this student (link_login_to_student), or null while the student has none.';
comment on column students.dob is 'Date of birth. Under 18 (is_minor) means a guardian and the parent''s consent are needed.';
comment on column students.joined_on is 'Day the student joined; the roll number''s year comes from it.';
comment on column students.home_centre_id is 'The centre the student attends; check-ins are recorded there and the location check uses its area.';
comment on column students.photo_path is 'The student''s photo in Storage, or null.';
comment on column students.pincode is 'Indian PIN code: 6 digits, not starting with 0 (0038). Optional.';
comment on column students.created_by is 'Who registered the student.';
comment on column profiles.language is 'The person''s app language (en, te, hi), saved from the app (docs/DECISIONS.md #48).';
comment on column profiles.active is 'False = switched off by the Guru: no screens, no data (my_role returns null).';
comment on column profiles.centre_id is 'The person''s own centre (coordinators: where they work).';
comment on column guardians.student_id is 'The student (a minor) this parent or guardian belongs to.';
comment on column consents.otp_verified_at is 'When the email code was confirmed (method email_code); null for a written consent.';
comment on column consents.verified_by is 'The staff member who checked the form and the guardian''s ID.';
comment on column consents.revoked_at is 'When this consent was revoked; null while it holds. A data consent counts only while not revoked.';
comment on column visits.centre_id is 'Where the visit happened (the student''s home centre at check-in).';
comment on column visits.check_out is 'Null while the student is in. One open visit per student (visits_one_open).';
comment on column visits.marked_by is 'The login that recorded the check-in (a coordinator, the Guru or the door tablet).';
comment on column visits.device_id is 'Which phone or tablet recorded the check-in, as the app reports it; free text.';
comment on column call_logs.outcome is 'What the call found: returning, paused, left, not_reachable ... (call_outcome).';
comment on column call_logs.coordinator_id is 'Who made the call.';
comment on column follow_up_tasks.kind is 'call = first call after missed classes; retry = calling again after nobody answered.';
comment on column follow_up_tasks.attempt is 'Which try this is: 1 for the first call, higher for each retry.';
comment on column follow_up_tasks.escalated is 'True when the follow-up was handed to the Guru (shown on the Guru''s home).';
comment on column follow_up_tasks.done_at is 'When the task was settled (a call logged, or the student came back); null while open.';
comment on column follow_up_tasks.call_log_id is 'The call that settled the task, when one did.';
comment on column centres.opens_at is 'Class opening time, local to the centre.';
comment on column centres.closes_at is 'Class closing time, local to the centre; visits left open end then.';
comment on column roll_counters.last is 'The last roll number given in that year.';
comment on column status_history.changed_by is 'Who changed the status (null for a scheduled job).';
