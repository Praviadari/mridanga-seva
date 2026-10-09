-- 0038 App correctness backlog (audit 01-10-2026, dimension 6; docs/DECISIONS.md #178-#185).
-- 1. D6-09: a QR scan retried after a lost answer, or the same code scanned on two phones at once,
--    no longer undoes itself: toggle_visit locks the student's row, and a scan within 30 seconds
--    of a check-out answers 'already_out' (the check-in side has done so since 0030).
-- 2. D6-14: dates typed far ahead are refused: a pause or a "coming back on" date at most a year
--    ahead (call_logs.next_date), an announcement scheduled at most 6 months ahead.
-- 3. FS2-09, D6-21: free text and PIN codes get the bounds the screens now apply. NOT VALID: rows
--    already stored are left alone; every new or changed row is checked.
-- 4. D1a-15: a minor's record never holds a parent's email (the audit's Phase 1 default, until the
--    team decides on parent logins): a login with that email would be linked as the child.
-- Safe to run twice.

-- ---------------------------------------------------------------- 1. toggle_visit (D6-09)
-- 0037's toggle_visit, with the student's row locked first (as mark_visit does), so two calls for
-- the same student run one after the other and the second sees the first one's visit.
create or replace function toggle_visit(p_student uuid, p_method visit_method, p_device text default null,
  p_location jsonb default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v visits; s students; v_check text; v_dist int;
begin
  if not coalesce(my_role() in ('guru', 'coordinator', 'kiosk'), false) then
    raise exception 'not_allowed';
  end if;
  select * into s from students where id = p_student for update;
  if not found then raise exception 'student_not_found'; end if;

  update visits ov set check_out = greatest(ov.check_in + interval '1 minute',
         (local_day(ov.check_in, ov.centre_id) + c.closes_at) at time zone c.time_zone)
    from centres c
   where ov.student_id = p_student and ov.check_out is null and c.id = ov.centre_id
     and local_day(ov.check_in, ov.centre_id) < centre_today(ov.centre_id);

  -- A scan repeated within 30 seconds (a retry after a lost answer, a second phone) changes nothing.
  if p_method = 'qr' and exists (select 1 from visits
                                  where student_id = p_student and check_out is null
                                    and check_in > now() - interval '30 seconds') then
    return jsonb_build_object('action', 'already_in', 'roll_no', s.roll_no, 'full_name', s.full_name,
      'photo_path', s.photo_path);
  end if;
  if p_method = 'qr' and not exists (select 1 from visits where student_id = p_student and check_out is null)
     and exists (select 1 from visits
                  where student_id = p_student and check_out > now() - interval '30 seconds') then
    return jsonb_build_object('action', 'already_out', 'roll_no', s.roll_no, 'full_name', s.full_name,
      'photo_path', s.photo_path);
  end if;

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

comment on function toggle_visit(uuid, visit_method, text, jsonb) is
  'Checks a student in, or out when already in (QR scans and the door tablet). Staff and kiosk only. Locks the student row; a QR scan within 30 s of the last check-in or check-out answers already_in / already_out and changes nothing (0038, D6-09).';

-- ---------------------------------------------------------------- 2. dates far ahead (D6-14)
-- log_call (0037) writes next_date into call_logs and, for a pause, students.paused_until; checking
-- the call log row covers both without copying log_call again.
create or replace function guard_call_log_date() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.next_date is not null and new.next_date > today_ist() + 366 then
    raise exception 'next_date_too_far' using detail = 'A date at most a year ahead.';
  end if;
  return new;
end $$;
drop trigger if exists call_logs_date_horizon on call_logs;
create trigger call_logs_date_horizon before insert or update of next_date on call_logs
  for each row execute function guard_call_log_date();

-- An app user schedules an announcement at most 6 months ahead (183 days). The dashboard is free.
create or replace function guard_announcement_horizon() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and new.publish_at > now() + interval '183 days'
     and (tg_op = 'INSERT' or new.publish_at is distinct from old.publish_at) then
    raise exception 'publish_too_far' using detail = 'An announcement is scheduled at most 6 months ahead.';
  end if;
  return new;
end $$;
drop trigger if exists announcements_publish_horizon on announcements;
create trigger announcements_publish_horizon before insert or update of publish_at on announcements
  for each row execute function guard_announcement_horizon();

-- Trigger functions are never called directly (D14-03 allow-list).
revoke execute on function guard_call_log_date(), guard_announcement_horizon()
  from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. text bounds and PIN codes
-- FS2-09: call notes about children stay short (data minimisation); the area and the guardian's
-- name get the bounds the register form applies. D6-21: an Indian PIN code never starts with 0.
alter table call_logs drop constraint if exists call_logs_comment_length;
alter table call_logs add constraint call_logs_comment_length check (char_length(comment) <= 1000) not valid;
alter table students drop constraint if exists students_area_length;
alter table students add constraint students_area_length check (char_length(area) <= 100) not valid;
alter table guardians drop constraint if exists guardians_name_length;
alter table guardians add constraint guardians_name_length check (char_length(full_name) <= 120) not valid;
alter table students drop constraint if exists students_pincode_check;
alter table students add constraint students_pincode_check check (pincode ~ '^[1-9][0-9]{5}$') not valid;

-- ---------------------------------------------------------------- 4. no parent's email on a minor (D1a-15)
-- A login is linked to the student whose email it signs up with (0002). A parent's email on a
-- child's record makes the parent's login act as the child, and with siblings only the first child
-- is linked. Until parents get their own logins, a minor's email may not be any guardian's email:
-- checked when the record's email is set (students) and when a guardian is added (guardians, since
-- register_student inserts the student first). Rows already stored are left alone.
create or replace function guard_minor_email() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_student students;
begin
  if tg_table_name = 'students' then
    if new.email is null or not is_minor(new) then return new; end if;
    if exists (select 1 from guardians g where lower(g.email) = lower(new.email)) then
      raise exception 'guardian_email_on_minor' using detail = 'A child''s record cannot hold a parent''s email.';
    end if;
  else
    if new.email is null then return new; end if;
    select * into v_student from students where id = new.student_id;
    if found and v_student.email is not null and is_minor(v_student) and lower(v_student.email) = lower(new.email) then
      raise exception 'guardian_email_on_minor' using detail = 'A child''s record cannot hold a parent''s email.';
    end if;
  end if;
  return new;
end $$;
revoke execute on function guard_minor_email() from public, anon, authenticated;
drop trigger if exists students_minor_email on students;
create trigger students_minor_email before insert or update of email, dob on students
  for each row execute function guard_minor_email();
drop trigger if exists guardians_minor_email on guardians;
create trigger guardians_minor_email before insert or update of email on guardians
  for each row execute function guard_minor_email();