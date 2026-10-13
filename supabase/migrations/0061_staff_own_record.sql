-- 0061 Coordinators are students too: a staff login's own student record (Praveen, 13-10-2026:
-- "Coordinators are students too, with more experience — that's it."; docs/DECISIONS.md #316-#321,
-- docs/DATABASE.md "Own record (0061)"). PLACEHOLDER NUMBER: the lead renumbers it at merge (after the
-- launch of 20-10-2026; the launch uses 0050-0059, 0060 is the face scan's).
-- Before: one login had one role, and every link path needs a login waiting for a record (pending, 0046's
-- login_awaits_record), so a coordinator's or the Guru's login never reached a student record of their own:
-- no My QR, My progress, My attendance, practice or face scan for them.
-- 1. #316 link_staff_record(profile, student): the Guru links an active coordinator's login (or the SQL
--    editor the Guru's own) to ONE student record without a login; the role stays. Never a withdrawn
--    record (student_withdrawn), never a second record. The automatic paths (a confirmed email, an email
--    saved on a record, Accept) still never link a staff login (0046-0048 unchanged). Unlinking is
--    unlink_student_login, as for a student; the staff role stays (it resets only 'student').
-- 2. #317 my_student_id() is the caller's own record for staff too, so practice (log_practice), the
--    student's assessment functions, events' "my part" and Phase 3's face enrolment work for an own record
--    with no change of their own.
-- 3. #318 nobody records about themselves (own_record): a check-in or check-out of one's own record
--    (the desk's name check-in, a QR scan of one's own code, Mark attendance, a visit edit), a syllabus tick
--    or untick, a level change, a promotion nomination, answer or decision, an assessment review, a call
--    log. An event's attendance list leaves the caller's own row as it is. The door tablet (its own kiosk
--    login) checks a coordinator in like any student. "Check out everyone" closes the caller's own visit
--    too (the end of the day, not a mark). The dashboard and pg_cron (nobody signed in) are not checked.
-- 4. #319 mentors: nobody is their own mentor (own_mentor), nobody changes their own mentor or level
--    (own_record); assign_mentor (0036) never picks the student's own login, and the link takes off a mentor
--    that is the login itself and gives another coordinator of the same gender (or the Guru's notice).
-- 5. #320 a record with a staff login is not withdrawn or deleted (erase_student) while linked
--    (staff_login_linked): withdraw_consent would switch the staff login off, erase_student would delete it.
--    Unlink first.
-- Every UPDATE/DELETE has a WHERE (Supabase safeupdate). Needs 0001-0048. Safe to run twice.

-- ---------------------------------------------------------------- 2. my_student_id for staff (#317)
-- 0016's, for the Guru and coordinators too. Row-level security gives staff every row anyway; what changes
-- is the functions that act for "the signed-in student": log_practice, delete_practice, submit_assessment,
-- mark_assessment_seen, event_counts. A switched-off login (my_role() null) and the door tablet get null.
create or replace function my_student_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id from students s
   where s.profile_id = auth.uid() and coalesce(my_role() in ('student', 'guru', 'coordinator'), false)
$$;

-- ---------------------------------------------------------------- 3. nobody records about themselves (#318)
-- One trigger function for every table that records something about a student. The student is the row's
-- student_id; for promotion_feedback the nomination's, for assessment_submissions the assignment's.
-- Error own_record when a staff member's own record is the one written about. Event attendance (a list saved at once) leaves the
-- caller's own row as it is, without an error. check_out_all marks its run (app.check_out_all): closing
-- one's own visit at the end of the day is allowed.
create or replace function refuse_own_record() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row     jsonb;
  v_student uuid;
begin
  -- Nobody signed in (the dashboard, pg_cron, seed.sql), and the student's own paths (a student and the
  -- door tablet record nothing here but what they may: row-level security and the functions refuse them).
  if auth.uid() is null or not coalesce(is_staff(), false) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then v_row := to_jsonb(old); else v_row := to_jsonb(new); end if;
  -- Fields read through jsonb: each table has only some of them.
  v_student := case tg_table_name
    when 'promotion_feedback' then (select n.student_id from promotion_nominations n where n.id = (v_row ->> 'nomination_id')::bigint)
    when 'assessment_submissions' then (select a.student_id from assessment_assignments a where a.id = (v_row ->> 'assignment_id')::bigint)
    else (v_row ->> 'student_id')::uuid
  end;
  if v_student is not null and exists (select 1 from students s where s.id = v_student and s.profile_id = auth.uid()) then
    if tg_table_name = 'event_attendance' then
      return null;
    end if;
    if not (tg_table_name = 'visits' and tg_op = 'UPDATE' and coalesce(current_setting('app.check_out_all', true), '') = 'on') then
      raise exception 'own_record' using detail = 'Nobody records this about themselves: a colleague does it.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists visits_refuse_own_record on visits;
create trigger visits_refuse_own_record before insert or update or delete on visits
  for each row execute function refuse_own_record();
drop trigger if exists student_progress_refuse_own_record on student_progress;
create trigger student_progress_refuse_own_record before insert or update or delete on student_progress
  for each row execute function refuse_own_record();
drop trigger if exists level_history_refuse_own_record on level_history;
create trigger level_history_refuse_own_record before insert on level_history
  for each row execute function refuse_own_record();
drop trigger if exists promotion_nominations_refuse_own_record on promotion_nominations;
create trigger promotion_nominations_refuse_own_record before insert or update on promotion_nominations
  for each row execute function refuse_own_record();
drop trigger if exists promotion_feedback_refuse_own_record on promotion_feedback;
create trigger promotion_feedback_refuse_own_record before insert or update on promotion_feedback
  for each row execute function refuse_own_record();
-- Only the review (review_submission writes reviewed_at): a student hands in their own work.
drop trigger if exists assessment_submissions_refuse_own_record on assessment_submissions;
create trigger assessment_submissions_refuse_own_record before update on assessment_submissions
  for each row when (new.reviewed_at is distinct from old.reviewed_at)
  execute function refuse_own_record();
drop trigger if exists call_logs_refuse_own_record on call_logs;
create trigger call_logs_refuse_own_record before insert on call_logs
  for each row execute function refuse_own_record();
drop trigger if exists event_attendance_refuse_own_record on event_attendance;
create trigger event_attendance_refuse_own_record before insert or delete on event_attendance
  for each row execute function refuse_own_record();

-- 0033's check_out_all ("Check out everyone" on Mark attendance), marking its run for refuse_own_record:
-- the coordinator's own open visit is closed with everyone's. Otherwise unchanged.
create or replace function check_out_all(p_centre smallint default null)
returns int
language plpgsql set search_path = public as $$
declare closed int;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  perform set_config('app.check_out_all', 'on', true);
  update visits v
     set check_out = case
           when local_day(v.check_in, v.centre_id) = centre_today(v.centre_id)
             -- "+ 1 second" keeps check_out after check_in for someone checked in this instant.
             then greatest(now(), v.check_in + interval '1 second')
           else greatest(v.check_in + interval '1 minute',
                  (local_day(v.check_in, v.centre_id) + c.closes_at) at time zone c.time_zone)
         end
    from centres c
   where c.id = v.centre_id
     and v.check_out is null
     and (p_centre is null or v.centre_id = p_centre);
  get diagnostics closed = row_count;
  perform set_config('app.check_out_all', '', true);
  return closed;
end $$;

-- ---------------------------------------------------------------- 4. mentors and the own level (#319)
-- On students, for a signed-in person: nobody is their own mentor (own_mentor, whoever sets it), and nobody
-- changes the level or the mentor of their own record (own_record). assign_mentor marks its run
-- (app.auto_mentor): a student's or a coordinator's own About-you save may give their record a mentor.
create or replace function guard_own_student() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return new; end if;
  if new.mentor_id is not null and new.mentor_id = new.profile_id and new.mentor_id is distinct from old.mentor_id then
    raise exception 'own_mentor' using detail = 'A student is never their own mentor: choose another coordinator of the same gender.';
  end if;
  if old.profile_id = auth.uid()
     and (new.level_id is distinct from old.level_id
          or (new.mentor_id is distinct from old.mentor_id and coalesce(current_setting('app.auto_mentor', true), '') <> 'on')) then
    raise exception 'own_record' using detail = 'Nobody changes the level or the mentor of their own record: a colleague or the Guru does.';
  end if;
  return new;
end $$;

drop trigger if exists students_own_guard on students;
create trigger students_own_guard before update of level_id, mentor_id on students
  for each row execute function guard_own_student();

-- 0036's assign_mentor, never picking the student's own login (a coordinator's own record), and marking
-- its run for guard_own_student. Otherwise unchanged: the referral first when the gender matches, else
-- the active coordinator of the home centre with that gender and the fewest students; nobody = the
-- Gurus' "Mentor needed" notice.
create or replace function assign_mentor(p_student uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s        students;
  v_ref    uuid;
  v_mentor uuid;
  v_url    text;
begin
  select * into s from students where id = p_student;
  if not found or s.mentor_id is not null or s.gender is null or s.status = 'left' or s.withdrawn_at is not null then
    return null;
  end if;
  select d.referred_by into v_ref from person_details d where d.student_id = p_student;
  if v_ref is not null and v_ref is distinct from s.profile_id
     and exists (select 1 from profiles p where p.id = v_ref and p.active
                   and p.role in ('guru', 'coordinator') and p.gender = s.gender) then
    v_mentor := v_ref;
  else
    select p.id into v_mentor
      from profiles p
     where p.role = 'coordinator' and p.active and p.gender = s.gender and p.centre_id = s.home_centre_id
       and p.id is distinct from s.profile_id
     order by (select count(*) from students x
                where x.mentor_id = p.id and x.status <> 'left' and x.withdrawn_at is null), p.created_at, p.id
     limit 1;
  end if;
  v_url := '/staff/students/' || p_student;
  if v_mentor is null then
    insert into notifications (profile_id, kind, title, body, url)
    select p.id, 'notice', people_notice_title('no_mentor', p.language),
           left(people_notice_line('no_mentor', p.language, s.full_name), 300), v_url
      from profiles p
     where p.role = 'guru' and p.active
       and not exists (select 1 from notifications n where n.profile_id = p.id and n.url = v_url
                          and n.created_at > now() - interval '1 day');
    return null;
  end if;
  perform set_config('app.auto_mentor', 'on', true);
  update students set mentor_id = v_mentor where id = p_student and mentor_id is null;
  perform set_config('app.auto_mentor', '', true);
  insert into notifications (profile_id, kind, title, body, url)
  select p.id, 'notice', people_notice_title('new_mentee', p.language),
         left(people_notice_line('new_mentee', p.language, s.full_name), 300), v_url
    from profiles p where p.id = v_mentor and p.id is distinct from auth.uid();
  return v_mentor;
end $$;

-- ---------------------------------------------------------------- 1. the link (#316)
-- G2, the Guru (or the SQL editor, nobody signed in): links an active coordinator's or Guru's login to a
-- student record without a login, as that person's own record. The role stays. The Guru cannot link
-- their own login in the app (own_record): Praveen runs this function in the SQL editor for the Guru's
-- own record (docs/OPERATIONS.md "A coordinator's own student record"). The login's sign-up details
-- (About you, the privacy notice) join the record through 0048's attach_person_details; a mentor that
-- is the login itself is taken off and another is given (assign_mentor).
-- Error codes: not_allowed, own_record, profile_not_staff, staff_has_record, student_not_found,
-- student_withdrawn, student_already_linked.
create or replace function link_staff_record(p_profile uuid, p_student uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_profile profiles;
  v_student students;
begin
  if not (coalesce(is_guru(), false) or auth.uid() is null) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_profile = auth.uid() then
    raise exception 'own_record' using detail = 'The Guru''s own record is linked in the SQL editor (docs/OPERATIONS.md).';
  end if;
  select * into v_profile from profiles where id = p_profile for update;
  if not found or not v_profile.active or v_profile.role not in ('guru', 'coordinator') then
    raise exception 'profile_not_staff' using detail = 'Only an active coordinator''s or the Guru''s login gets an own record; a waiting login is linked with link_student_login.';
  end if;
  if exists (select 1 from students where profile_id = p_profile) then
    raise exception 'staff_has_record' using detail = 'This login already has its own student record: take it off that one first.';
  end if;
  select * into v_student from students where id = p_student for update;
  if not found then raise exception 'student_not_found'; end if;
  if v_student.withdrawn_at is not null then
    raise exception 'student_withdrawn' using detail = 'Consent was withdrawn: the record gets no login until the person consents again.';
  end if;
  if v_student.profile_id is not null then
    raise exception 'student_already_linked' using detail = 'This student record already has a login.';
  end if;
  update students
     set profile_id = p_profile,
         mentor_id = case when mentor_id = p_profile then null else mentor_id end
   where id = p_student;
  perform assign_mentor(p_student);
end $$;

-- ---------------------------------------------------------------- 5. a staff member's record stays (#320)
-- withdraw_consent switches the record's login off and erase_student deletes it: for a staff login that
-- is the coordinator's or the Guru's own access to the class. Refused while the record has a staff login,
-- also in the dashboard; the Guru takes the login off the record first (unlink_student_login).
create or replace function guard_staff_record() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (tg_op = 'DELETE' or (new.withdrawn_at is not null and old.withdrawn_at is null))
     and old.profile_id is not null
     and exists (select 1 from profiles p where p.id = old.profile_id and p.role in ('guru', 'coordinator')) then
    raise exception 'staff_login_linked' using detail = 'This record is a staff member''s own: take the login off it first, then withdraw or erase.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists students_staff_record_kept on students;
create trigger students_staff_record_kept before update of withdrawn_at or delete on students
  for each row execute function guard_staff_record();

-- ---------------------------------------------------------------- who may run them
-- docs/DECISIONS.md #14. The trigger functions are internal; the Guru's link checks the caller inside.
revoke execute on function refuse_own_record(), guard_own_student(), guard_staff_record() from public, anon, authenticated;
revoke execute on function link_staff_record(uuid, uuid) from public, anon;
grant execute on function link_staff_record(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on function my_student_id() is 'The signed-in person''s own student record: a student''s, or a coordinator''s or the Guru''s own record (#317); null for anyone else.';
comment on function refuse_own_record is 'Trigger: nobody records about their own student record (own_record): visits, ticks, level history, promotion, assessment reviews, call logs; an event list leaves the own row as it is (#318).';
comment on function check_out_all(smallint) is 'C5 "Check out everyone": closes every open visit (of a centre), the caller''s own too; an old visit ends at its day''s closing time. Staff only (#318).';
comment on function guard_own_student is 'Trigger on students: nobody is their own mentor (own_mentor), nobody changes their own level or mentor (own_record) (#319).';
comment on function assign_mentor is 'Gives a student without a mentor a coordinator of the same gender (the referral first, else the least loaded one of the centre), never the student''s own login; nobody: the Gurus get a notice (#165, #319).';
comment on function link_staff_record is 'G2, the Guru (or the SQL editor): links an active coordinator''s or Guru''s login to one student record without a login as their own record; the role stays; never withdrawn, never the Guru''s own in the app (#316).';
comment on function guard_staff_record is 'Trigger on students: a record with a staff login is not withdrawn or deleted while linked (staff_login_linked, #320).';
