-- 0048 Withdrawn records stay frozen, audience and staff-name leaks closed, a QR re-scan does not
-- check out, the sign-up's privacy notice is kept (audit phase 3 of 12-10-2026: S2-02, S1-01, S1-02;
-- audit phase 2 R2-05/R5-12; 0047 leftovers; docs/DECISIONS.md #281, #288, #289, #290;
-- docs/DATABASE.md "Withdrawn records (0048)").
-- 1. S2-02 (#281): a record whose consent was withdrawn is never linked to a login again: the two
--    automatic paths (a login confirming its email, an email saved on a record) skip it, the Guru's
--    link_student_login and Accept refuse it (student_withdrawn). A login on a withdrawn record
--    cannot be switched on again (the parent consents again first: docs/OPERATIONS.md). Nothing new
--    is recorded about the student: practice, phones for pushes, promotion (nomination, feedback,
--    the level change), instrument loans refuse (student_withdrawn); event attendance, performers
--    and assessments given to a list leave the withdrawn student out. Logins already on a withdrawn
--    record that are still switched on are switched off now, their phones forgotten.
-- 2. S1-01 (#288): who is in an event's or poll's audience is answered for the person asking only.
--    audience_profiles (every active student's and staff member's login id, per level, per mentor)
--    is no longer open to app users; the polls rule asks in_audience() (the caller) instead, and
--    event_visible_to answers about another login only for staff. S1-02: staff_name_taken answers
--    only for the caller's own name (sign-up, a name change) and for the Guru.
-- 3. R2-05/R5-12 (#289): a QR scan within qr_rescan_minutes (10) of the student's check-in answers
--    already_in: a re-scan after a lost answer no longer checks the student out (and the parent got
--    a "left" email). Before: 30 seconds.
-- 4. #290: the privacy notice a person ticked at sign-up stays on their record when the login is
--    linked to a record that already has About-you details; Fill the form records the notice the
--    desk showed an adult (record_desk_notice).
-- Needs 0001-0047. Safe to run twice.

-- ---------------------------------------------------------------- 1. withdrawn records (#281)
-- Path 1 (0047): the login confirms its email. A withdrawn record is skipped, like a minor's.
create or replace function link_login_to_student(p_user uuid, p_email text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare s_id uuid;
begin
  if p_email is null or not login_awaits_record(p_user) then
    return;
  end if;
  select s.id into s_id from students s
   where lower(s.email) = lower(p_email) and s.profile_id is null and not is_minor(s) and s.withdrawn_at is null
   order by s.created_at limit 1;
  if s_id is null then return; end if;
  update students set profile_id = p_user where id = s_id;
  update profiles set role = 'student' where id = p_user and role <> 'student';
end $$;

-- Path 2 (0047): an email saved on a record. A withdrawn record is skipped.
create or replace function link_student_email() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare p_id uuid;
begin
  if new.profile_id is not null or new.email is null or is_minor(new) or new.withdrawn_at is not null then
    return new;
  end if;
  select p.id into p_id
    from profiles p join auth.users u on u.id = p.id
   where lower(u.email) = lower(new.email)
     and u.email_confirmed_at is not null
     and login_awaits_record(p.id)
   order by p.created_at
   limit 1;
  if p_id is null then return new; end if;
  new.profile_id := p_id;
  update profiles set role = 'student' where id = p_id and role <> 'student';
  return new;
end $$;

-- Path 3 (0046, G2): the Guru links a login to a record. New error: student_withdrawn.
-- Error codes: not_allowed, profile_not_pending, student_not_found, student_withdrawn, student_already_linked.
create or replace function link_student_login(p_profile uuid, p_student uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_student students;
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  perform 1 from profiles where id = p_profile for update;
  if not login_awaits_record(p_profile) then
    raise exception 'profile_not_pending' using detail = 'Only an active login that is waiting for a role can be linked.';
  end if;
  select * into v_student from students where id = p_student for update;
  if not found then raise exception 'student_not_found'; end if;
  if v_student.withdrawn_at is not null then
    raise exception 'student_withdrawn' using detail = 'Consent was withdrawn: the record gets no login until the parent consents again.';
  end if;
  if v_student.profile_id is not null then
    raise exception 'student_already_linked' using detail = 'This student record already has a login.';
  end if;
  update students set profile_id = p_profile where id = p_student;
  update profiles set role = 'student' where id = p_profile and role <> 'student';
end $$;

-- Accept (0047), refusing a sign-up whose email is on a withdrawn record (student_withdrawn): it
-- would otherwise make a second, unfrozen record of the same person. Otherwise unchanged.
create or replace function accept_sign_up(p_profile uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p     profiles;
  v_email text;
  v_conf  timestamptz;
  d       person_details;
  s       students;
begin
  if not coalesce(is_staff(), false) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into v_p from profiles where id = p_profile for update;
  if not found then raise exception 'sign_up_not_found'; end if;
  if not coalesce(is_guru(), false) and v_p.centre_id is distinct from (select me.centre_id from profiles me where me.id = auth.uid()) then
    raise exception 'not_allowed' using errcode = '42501', detail = 'A coordinator accepts the sign-ups of their own centre.';
  end if;

  select * into s from students where profile_id = p_profile;
  if found then
    if s.request_id = p_profile then
      return jsonb_build_object('id', s.id, 'roll_no', s.roll_no, 'full_name', s.full_name, 'linked', true,
                                'repeated', true, 'existing', false);
    end if;
    raise exception 'already_registered' using detail = 'This login is already on a student record.';
  end if;
  if not login_awaits_record(p_profile) or exists (select 1 from ig_subscribers i where i.profile_id = p_profile) then
    raise exception 'not_waiting' using detail = 'Only an active login waiting for the desk can be accepted.';
  end if;
  select lower(u.email), u.email_confirmed_at into v_email, v_conf from auth.users u where u.id = p_profile;
  if v_conf is null or v_email is null then
    raise exception 'email_not_confirmed' using detail = 'The person has not opened the link in the sign-up email yet.';
  end if;

  select * into d from person_details where profile_id = p_profile and student_id is null;
  if d.dob is null then
    raise exception 'dob_required' using detail = 'The sign-up has no date of birth: use Fill the form.';
  end if;
  if d.dob > today_ist() - interval '18 years' then
    raise exception 'minor_needs_desk' using detail = 'Under 18: the desk registers the student with a parent.';
  end if;
  if d.notice_version is null then
    raise exception 'notice_not_accepted' using detail = 'The sign-up did not tick the privacy notice: use Fill the form.';
  end if;
  if btrim(coalesce(v_p.full_name, '')) = '' then raise exception 'name_required'; end if;
  if exists (select 1 from students w where lower(w.email) = v_email and w.withdrawn_at is not null) then
    raise exception 'student_withdrawn' using detail = 'A record with this email had its consent withdrawn: the Guru decides.';
  end if;

  -- Registered at the desk already (the link did not happen then): link, do not make a second record.
  perform link_login_to_student(p_profile, v_email);
  select * into s from students where profile_id = p_profile;
  if found then
    return jsonb_build_object('id', s.id, 'roll_no', s.roll_no, 'full_name', s.full_name, 'linked', true,
                              'repeated', false, 'existing', true);
  end if;

  insert into students (full_name, dob, phone, email, level_id, home_centre_id, request_id, profile_id)
  values (btrim(v_p.full_name), d.dob, v_p.phone, v_email, 1,
          coalesce(v_p.centre_id, (select min(id) from centres where active), 1)::smallint, p_profile, p_profile)
  returning * into s;
  update profiles set role = 'student' where id = p_profile and role <> 'student';
  return jsonb_build_object('id', s.id, 'roll_no', s.roll_no, 'full_name', s.full_name, 'linked', true,
                            'repeated', false, 'existing', false);
end $$;

-- 0025's trigger for every table that records something new about a student. The student is the
-- row's student_id; for push_tokens the student record of the login, for promotion_feedback the
-- nomination's student. A withdrawn student's row is refused (student_withdrawn), except where a
-- whole list is written at once: the daily job's call tasks (0025), assessments given to an
-- audience, event attendance and performers leave the withdrawn student out without an error.
create or replace function refuse_withdrawn() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row     jsonb := to_jsonb(new);
  v_student uuid;
begin
  -- Fields read through jsonb: each table has only some of them.
  v_student := case tg_table_name
    when 'push_tokens' then (select s.id from students s where s.profile_id = (v_row ->> 'profile_id')::uuid)
    when 'promotion_feedback' then (select n.student_id from promotion_nominations n where n.id = (v_row ->> 'nomination_id')::bigint)
    else (v_row ->> 'student_id')::uuid
  end;
  if v_student is not null and exists (select 1 from students where id = v_student and withdrawn_at is not null) then
    if tg_table_name in ('follow_up_tasks', 'assessment_assignments', 'event_attendance', 'event_performers') then
      return null;
    end if;
    raise exception 'student_withdrawn' using detail = 'Consent was withdrawn: nothing new is recorded for this student.';
  end if;
  return new;
end $$;

drop trigger if exists practice_logs_refuse_withdrawn on practice_logs;
create trigger practice_logs_refuse_withdrawn before insert on practice_logs
  for each row execute function refuse_withdrawn();
drop trigger if exists push_tokens_refuse_withdrawn on push_tokens;
create trigger push_tokens_refuse_withdrawn before insert or update of profile_id on push_tokens
  for each row execute function refuse_withdrawn();
drop trigger if exists promotion_nominations_refuse_withdrawn on promotion_nominations;
create trigger promotion_nominations_refuse_withdrawn before insert on promotion_nominations
  for each row execute function refuse_withdrawn();
drop trigger if exists promotion_feedback_refuse_withdrawn on promotion_feedback;
create trigger promotion_feedback_refuse_withdrawn before insert or update on promotion_feedback
  for each row execute function refuse_withdrawn();
-- The Guru's "promote" writes level_history (decide_promotion, and 0025's trigger on a level change):
-- refused for a withdrawn record. "Not yet" and "more feedback" still close or keep a nomination.
drop trigger if exists level_history_refuse_withdrawn on level_history;
create trigger level_history_refuse_withdrawn before insert on level_history
  for each row execute function refuse_withdrawn();
drop trigger if exists inventory_loans_refuse_withdrawn on inventory_loans;
create trigger inventory_loans_refuse_withdrawn before insert on inventory_loans
  for each row execute function refuse_withdrawn();
drop trigger if exists assessment_assignments_refuse_withdrawn on assessment_assignments;
create trigger assessment_assignments_refuse_withdrawn before insert on assessment_assignments
  for each row execute function refuse_withdrawn();
drop trigger if exists event_attendance_refuse_withdrawn on event_attendance;
create trigger event_attendance_refuse_withdrawn before insert on event_attendance
  for each row execute function refuse_withdrawn();
drop trigger if exists event_performers_refuse_withdrawn on event_performers;
create trigger event_performers_refuse_withdrawn before insert on event_performers
  for each row execute function refuse_withdrawn();

-- withdraw_consent switches the record's login off. It stays off while the record is withdrawn (G2,
-- the dashboard and every function alike): the parent consents again first, then the login is
-- switched on (docs/OPERATIONS.md "Withdrawal of consent").
create or replace function guard_withdrawn_login() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.active and not old.active
     and exists (select 1 from students s where s.profile_id = new.id and s.withdrawn_at is not null) then
    raise exception 'student_withdrawn' using detail = 'Consent was withdrawn: the login stays off until the parent consents again.';
  end if;
  return new;
end $$;
drop trigger if exists profiles_withdrawn_stay_off on profiles;
create trigger profiles_withdrawn_stay_off before update of active on profiles
  for each row execute function guard_withdrawn_login();

-- Logins on a withdrawn record that are switched on today (linked after the withdrawal, before
-- this migration) are switched off and their phones forgotten, as withdraw_consent does.
delete from push_tokens t
 using students s
 where s.profile_id = t.profile_id and s.withdrawn_at is not null;
update profiles p set active = false
  from students s
 where s.profile_id = p.id and s.withdrawn_at is not null and p.active;

-- ---------------------------------------------------------------- 2. audiences and staff names (#288)
-- True when the signed-in person is in this audience (events and polls; the same rule as
-- audience_profiles). Asks about the caller only.
create or replace function in_audience(p_audience text, p_level smallint, p_group bigint, p_author uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null
     and auth.uid() in (select audience_profiles(p_audience, p_level, p_group, p_author))
$$;

alter policy "readable" on polls
  using ((( SELECT is_staff()) OR ((( SELECT my_role()) = 'student'::app_role)
         AND in_audience(polls.audience, polls.audience_level, polls.audience_group, polls.created_by))));

-- 0022's, answering about another login only for staff (and with nobody signed in: pg_cron, the
-- dashboard). Row-level security on events and rsvp_event ask about the caller.
create or replace function event_visible_to(p_event bigint, p_profile uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select (p_profile = auth.uid() or auth.uid() is null or coalesce(is_staff(), false))
     and exists (select 1 from events e
                  where e.id = p_event
                    and (p_profile in (select audience_profiles(e.audience, e.audience_level, e.audience_group, e.created_by))
                      or exists (select 1 from event_performers ep join students s on s.id = ep.student_id
                                  where ep.event_id = e.id and s.profile_id = p_profile)))
$$;

-- 0028's: the name check of guard_profile_details and handle_new_user. Answers for the person's
-- own name (p_id = the caller; a sign-up has nobody signed in) and for the Guru, who names
-- coordinators; any other caller gets false, so it is no list of who teaches here.
create or replace function staff_name_taken(p_id uuid, p_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select (auth.uid() is null or p_id = auth.uid() or coalesce(is_guru(), false))
     and exists (
    select 1 from profiles p
     where p.id is distinct from p_id and p.role in ('guru', 'coordinator')
       and lower(regexp_replace(btrim(p.full_name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(p_name), '\s+', ' ', 'g')))
$$;

-- ---------------------------------------------------------------- 3. QR re-scan (#289)
insert into settings (key, value) values ('qr_rescan_minutes', '10') on conflict (key) do nothing;

-- 0044's guard_setting with qr_rescan_minutes (1-60). A later migration that replaces it must keep it.
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
    when 'promotion_syllabus_percent' then int4range(0, 100, '[]')
    when 'promotion_min_visits'  then int4range(0, 100, '[]')
    when 'promotion_visit_weeks' then int4range(1, 52, '[]')
    when 'promotion_min_feedback' then int4range(1, 10, '[]')
    when 'fund_approval_rupees'  then int4range(0, 1000000, '[]')
    when 'fund_bill_rupees'      then int4range(0, 1000000, '[]')
    when 'qr_rescan_minutes'     then int4range(1, 60, '[]')
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
                    'parent_notices_check_in', 'parent_notices_no_checkout') then
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
  elsif current_user in ('anon', 'authenticated') then
    raise exception 'setting_unknown' using detail = format('%s is not a setting the app knows.', new.key);
  end if;
  return new;
end $$;

-- 0038's toggle_visit: a QR scan within qr_rescan_minutes (default 10) of the open visit's check-in
-- (it is today's: an earlier day's visit was closed just before) answers already_in and changes
-- nothing. The app gives up on an answer after 15 seconds; a coordinator scanning again a minute
-- later checked the student out, and the parent got a "left" email. A student who really leaves
-- within those minutes is checked out by a tap on Mark attendance, or at the centre's closing time.
-- The 30 seconds after a check-out (already_out) are unchanged.
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

  -- A scan repeated soon after the check-in (a retry after a lost answer, a second phone) changes nothing.
  if p_method = 'qr' and exists (select 1 from visits
                                  where student_id = p_student and check_out is null
                                    and check_in > now() - make_interval(mins => coalesce(setting_int('qr_rescan_minutes'), 10))) then
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

-- ---------------------------------------------------------------- 4. the notice stays (#290)
-- 0036's trigger: when a login is linked to a record that already has About-you details, the
-- sign-up's row is merged into it. The notice the person ticked at sign-up (0047) is now merged
-- too: the record's own notice is kept when it has one, else the sign-up's, with its time.
create or replace function attach_person_details() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d person_details;
begin
  if tg_op = 'UPDATE' and old.profile_id is not null and old.profile_id is distinct from new.profile_id then
    update person_details set profile_id = null where student_id = new.id and profile_id = old.profile_id;
  end if;
  if new.profile_id is null or (tg_op = 'UPDATE' and new.profile_id is not distinct from old.profile_id) then
    return null;
  end if;
  select * into d from person_details where profile_id = new.profile_id and student_id is null;
  if found then
    if exists (select 1 from person_details where student_id = new.id) then
      update person_details t set
        emergency_relation = coalesce(t.emergency_relation, d.emergency_relation),
        emergency_name = coalesce(t.emergency_name, d.emergency_name),
        emergency_phone = coalesce(t.emergency_phone, d.emergency_phone),
        heard_via = coalesce(t.heard_via, d.heard_via),
        referred_by = coalesce(t.referred_by, d.referred_by),
        heard_other = coalesce(t.heard_other, d.heard_other),
        occupation = coalesce(t.occupation, d.occupation),
        occupation_other = coalesce(t.occupation_other, d.occupation_other),
        service_areas = case when cardinality(t.service_areas) = 0 then d.service_areas else t.service_areas end,
        service_other = coalesce(t.service_other, d.service_other),
        diksha_name = coalesce(t.diksha_name, d.diksha_name),
        learn_interests = case when cardinality(t.learn_interests) = 0 then d.learn_interests else t.learn_interests end,
        about_state = coalesce(t.about_state, d.about_state),
        notice_version = coalesce(t.notice_version, d.notice_version),
        notice_accepted_at = case when t.notice_version is null then d.notice_accepted_at else t.notice_accepted_at end,
        updated_at = now()
       where t.student_id = new.id;
      delete from person_details where id = d.id;
      update person_details set profile_id = new.profile_id where student_id = new.id;
    else
      update person_details set student_id = new.id, dob = null, updated_at = now() where id = d.id;
    end if;
  end if;
  update students s set gender = p.gender
    from profiles p
   where s.id = new.id and p.id = new.profile_id and s.gender is null and p.gender is not null;
  return null;
end $$;

-- Fill the form (C2) for an adult: the privacy-notice version the desk showed, kept on the record's
-- About-you row with the time (a minor's goes on the parent's consent, register_student). A notice
-- already on the record (ticked at sign-up and moved there by the link) is kept. Staff only.
-- Errors: not_allowed, notice_version_invalid, student_not_found, student_withdrawn.
create or replace function record_desk_notice(p_student uuid, p_notice_version text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_notice text := nullif(btrim(coalesce(p_notice_version, '')), '');
  s students;
begin
  if not coalesce(is_staff(), false) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v_notice is null or v_notice !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$' then
    raise exception 'notice_version_invalid';
  end if;
  select * into s from students where id = p_student;
  if not found then raise exception 'student_not_found'; end if;
  if s.withdrawn_at is not null then raise exception 'student_withdrawn'; end if;
  insert into person_details (student_id, profile_id, notice_version, notice_accepted_at)
  values (p_student, s.profile_id, v_notice, now())
  on conflict (student_id) do update
     set notice_version = coalesce(person_details.notice_version, excluded.notice_version),
         notice_accepted_at = case when person_details.notice_version is null then excluded.notice_accepted_at
                                   else person_details.notice_accepted_at end,
         updated_at = case when person_details.notice_version is null then now() else person_details.updated_at end;
end $$;

-- 0034's register_student (still runs as the caller), now also keeping the notice for an adult
-- through record_desk_notice. Otherwise unchanged.
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
  p_photo_consent     boolean default false,
  p_written_consent   boolean default null,
  p_request_id        uuid default null,
  p_notice_version    text default null
) returns jsonb
language plpgsql set search_path = public as $$
declare
  s students;
  g_id uuid := gen_random_uuid();
  v_notice text := nullif(btrim(coalesce(p_notice_version, '')), '');
  minor boolean := p_dob is not null and p_dob > today_ist() - interval '18 years';
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  if v_notice is not null and v_notice !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$' then
    raise exception 'notice_version_invalid';
  end if;
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
    insert into guardians (id, student_id, full_name, phone, email, relation)
    values (g_id, s.id, trim(p_guardian_name), trim(p_guardian_phone),
            nullif(lower(trim(p_guardian_email)), ''), nullif(trim(p_guardian_relation), ''));
    insert into consents (student_id, guardian_id, scope, method, id_type_checked, signed_form, notice_version)
    values (s.id, g_id, 'data', 'written', p_id_type_checked, true, v_notice);
    if p_photo_consent then
      insert into consents (student_id, guardian_id, scope, method, id_type_checked, signed_form, notice_version)
      values (s.id, g_id, 'photo', 'written', p_id_type_checked, true, v_notice);
    end if;
  elsif v_notice is not null then
    perform record_desk_notice(s.id, v_notice);
  end if;

  return jsonb_build_object('id', s.id, 'roll_no', s.roll_no, 'linked', s.profile_id is not null,
                            'repeated', false);
end $$;

-- ---------------------------------------------------------------- who may run them
-- audience_profiles is used only inside the owner's functions (poll_state, poll_voters, event_people,
-- the notices) and pg_cron's events_polls_daily; app users ask in_audience / event_visible_to.
revoke execute on function audience_profiles(text, smallint, bigint, uuid) from public, anon, authenticated;
revoke execute on function in_audience(text, smallint, bigint, uuid), record_desk_notice(uuid, text) from public, anon;
grant execute on function in_audience(text, smallint, bigint, uuid), record_desk_notice(uuid, text) to authenticated;
revoke execute on function guard_withdrawn_login(), refuse_withdrawn() from public, anon, authenticated;

-- ---------------------------------------------------------------- descriptions
comment on function link_login_to_student is 'Links a confirmed login waiting for a record (pending, or a student without one) to the ADULT, not withdrawn student record with the same email and makes it a student; a minor''s record is linked only by the Guru (#276, #281).';
comment on function link_student_email is 'Trigger: when an ADULT, not withdrawn student record gets an email, links it to a confirmed login with that email that waits for a record (#276, #281).';
comment on function link_student_login is 'G2, Guru: links a login waiting for a record to a student record without a login; never a withdrawn record (student_withdrawn, #281).';
comment on function accept_sign_up(uuid) is 'Staff (a coordinator: own centre): registers an adult confirmed sign-up that ticked the privacy notice from its own data and links the login; a second call returns the first record (repeated); refused when a withdrawn record has the email (#281).';
comment on function refuse_withdrawn is 'Trigger: nothing new is recorded about a withdrawn student (student_withdrawn); lists written at once leave them out (#281).';
comment on function guard_withdrawn_login is 'Trigger on profiles: the login of a withdrawn record stays switched off (student_withdrawn, #281).';
comment on function in_audience is 'True when the signed-in person is in an event or poll audience (#288).';
comment on function audience_profiles is 'Active logins an event or poll audience covers (a student only with a student record). Internal: the owner''s functions only (#288).';
comment on function event_visible_to(bigint, uuid) is 'True when the profile is in the event''s audience or performs in it; about another login only for staff (#288). Used by row-level security on events.';
comment on function staff_name_taken is 'True when the name is the Guru''s or a coordinator''s (name_taken); answers only for the caller''s own name or the Guru (#288).';
comment on function toggle_visit(uuid, visit_method, text, jsonb) is 'Checks a student in, or out when already in (QR scans and the door tablet). Staff and kiosk only. Locks the student row; a QR scan within qr_rescan_minutes (10) of the check-in answers already_in, within 30 s of a check-out already_out, and changes nothing (0038, #289).';
comment on function guard_setting is 'Trigger: checks the value of each setting the app may change; the app cannot add or delete settings (docs/DECISIONS.md #47, qr_rescan_minutes #289).';
comment on function attach_person_details is 'Trigger: a linked login''s About-you row moves to the record, or is merged into the record''s row, with the privacy notice ticked at sign-up (#290).';
comment on function record_desk_notice is 'Staff: keeps the privacy-notice version the desk showed an adult on the record (a notice already there stays) (#290).';
comment on function register_student is 'C2, staff: registers a student; a minor with a guardian and their written consent, an adult''s notice kept on the record (#290).';
