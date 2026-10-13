-- 0064 Face scan: the student checks themself in and out on their own phone (Phase 3 P3-5, and the
-- server side of P3-6's staff counts from the phone; docs/DECISIONS.md #344-#349; docs/DATABASE.md
-- "Face self-scan (0064)"; docs/phase3/WORK_PLAN.md P3-5).
--
-- PLACEHOLDER NUMBER: the lead renumbers this file when it merges (after 0060's renumbering).
-- BRANCH ONLY (p3-selfscan): it runs on TEST only after the phone test day, on LIVE only after
-- Praveen says face scan is fully tested. Nothing changes while face_enabled is false (0060).
--
-- 1. self_scan_state (#344): what the student home shows: the "Check in" circle only inside the
--    centre's open hours, "Check out" while a visit of today is open, nothing while face scan is
--    off or this phone is not enrolled. Also the centre's point and radius (the phone works out the
--    location result it binds into the integrity token) and the match threshold.
-- 2. self_scan (#345): the self-scan itself. The phone has read its position once, run the
--    liveness checks and the 1:1 match with the face code it keeps, and got a one-time integrity
--    pass (0060, Gate 1) bound to the action and the location result. The server re-checks all it
--    can: the pass (this login, this action, this location result, once), face scan on, the face
--    consent and the record (face_block_reason), the enrolment of THIS phone, the location result
--    from the position (self_scan_location), the open hours, the liveness flag and the score
--    against face_match_percent. A check-in is saved with method 'face', marked_by = the student,
--    liveness_ok and the score in visit_face_scores (0060). Refused: outside the area (radius +
--    accuracy, accuracy over 100 m, a mocked position, no position), outside the open hours, no
--    pass. A check-out is never refused for the place: it is saved and flagged
--    (visits.check_out_location). The parent's check-out email follows from 0043/0044's trigger.
--    0048's rules hold: a check-in while already in answers already_in; a check-out within
--    qr_rescan_minutes of the check-in answers too_soon (the desk can still check out); a withdrawn
--    record gets nothing (student_withdrawn).
-- 3. note_self_scan_failure (#346): the phone counts a self-scan that failed on the phone (outside,
--    mocked, liveness, no match) in face_scan_failures (0060): per centre and reason, no student id.
-- 4. visits.check_out_location / check_out_distance_m / check_out_method (#347): the check-out's
--    own location result, like 0024's location_check for the check-in; locked against app edits.
-- 5. face_match_percent (#348): the 1:1 threshold, 55 (cosine 0.55; the spike's same person 0.81,
--    different 0.11-0.31, OpenCV's 0.363), SQL editor only like every face_* setting.
-- Every UPDATE/DELETE has a WHERE (Supabase safeupdate). Needs 0001-0048 and 0060. Safe to run twice.

-- ---------------------------------------------------------------- 1. the threshold (#348)
insert into settings (key, value) values ('face_match_percent', '55') on conflict (key) do nothing;

-- 0060's guard_setting with face_match_percent (30-95). A later migration that replaces it must keep
-- qr_rescan_minutes (0048), the face settings (0060) and this one.
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
    when 'face_match_percent'    then int4range(30, 95, '[]')
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

-- ---------------------------------------------------------------- 2. the check-out's location (#347)
-- Same results as 0024's location_check, plus the two only a self-scan reports: 'mocked' (the phone
-- says the position is mocked) and 'inaccurate' (no accuracy, or over 100 m).
alter table visits add column if not exists check_out_location text
  check (check_out_location in ('inside', 'outside', 'refused', 'no_fix', 'no_location', 'no_area', 'mocked', 'inaccurate'));
alter table visits add column if not exists check_out_distance_m int
  check (check_out_distance_m is null or (check_out_distance_m >= 0 and check_out_location in ('inside', 'outside')));
-- How the check-out was recorded; null = not recorded (every check-out before 0064, the desk, the
-- night job). 'face' only from the self-scan (guard_face_visit).
alter table visits add column if not exists check_out_method visit_method;

-- 0024's guard: app users cannot change either location result of a visit.
create or replace function guard_visit_location() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated')
     and (new.location_check is distinct from old.location_check
          or new.location_distance_m is distinct from old.location_distance_m
          or new.check_out_location is distinct from old.check_out_location
          or new.check_out_distance_m is distinct from old.check_out_distance_m
          or new.check_out_method is distinct from old.check_out_method) then
    raise exception 'location_locked' using detail = 'The location result of a visit cannot be changed.';
  end if;
  return new;
end $$;

-- 0060's guard_face_visit, plus check_out_method 'face': only the self-scan path writes it.
create or replace function guard_face_visit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (new.method = 'face' and (tg_op = 'INSERT' or old.method is distinct from 'face'))
     or (new.liveness_ok is not null and (tg_op = 'INSERT' or new.liveness_ok is distinct from old.liveness_ok))
     or (new.check_out_method = 'face' and (tg_op = 'INSERT' or old.check_out_method is distinct from 'face')) then
    if coalesce(current_setting('app.face_visit', true), '') <> 'on' or not face_on() then
      raise exception 'face_visit_reserved' using detail = 'Only the self-scan check-in records a face visit.';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- 3. the location result (#345)
-- The self-scan's reading of the phone's one position, for the student's centre. The phone works out
-- the same with the same rule (app src/face/self-scan-rules.ts) and binds it into the integrity
-- token; a different answer here is integrity_pass_mismatch.
--   {"status": "fix", "lat": 17.385, "lng": 78.4867, "accuracy": 12, "mocked": false}
--   {"status": "refused"} | {"status": "no_fix"} | {"status": "no_location"}
-- inside: within radius_m + accuracy (accuracy at most 100 m); mocked: the phone says so;
-- inaccurate: no accuracy or over 100 m; no_area: the centre has no point. Never stores the position.
-- Error code: bad_location.
create or replace function self_scan_location(p_location jsonb, p_centre smallint)
returns table (result text, distance_m int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  c        centres;
  v_status text := case when jsonb_typeof(p_location) = 'object' then p_location ->> 'status' end;
  v_lat    double precision;
  v_lng    double precision;
  v_acc    double precision;
  v_mocked boolean;
  v_dist   double precision;
begin
  if v_status in ('refused', 'no_fix', 'no_location') then
    return query select v_status, null::int;
    return;
  end if;
  if v_status is distinct from 'fix' then raise exception 'bad_location'; end if;
  begin
    v_lat := (p_location ->> 'lat')::double precision;
    v_lng := (p_location ->> 'lng')::double precision;
    v_acc := (p_location ->> 'accuracy')::double precision;
    v_mocked := coalesce((p_location ->> 'mocked')::boolean, false);
  exception when others then
    raise exception 'bad_location';
  end;
  if v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
    raise exception 'bad_location';
  end if;
  if v_mocked then
    return query select 'mocked'::text, null::int;
    return;
  end if;
  if v_acc is null or v_acc < 0 or v_acc > 100 then
    return query select 'inaccurate'::text, null::int;
    return;
  end if;
  select * into c from centres where id = p_centre;
  if not found or c.lat is null or c.lng is null then
    return query select 'no_area'::text, null::int;
    return;
  end if;
  -- 0024's haversine, Earth radius 6 371 km.
  v_dist := 2 * 6371000 * asin(sqrt(
              power(sin(radians(v_lat - c.lat) / 2), 2)
              + cos(radians(c.lat)) * cos(radians(v_lat)) * power(sin(radians(v_lng - c.lng) / 2), 2)));
  return query select case when v_dist <= c.radius_m + v_acc then 'inside' else 'outside' end, round(v_dist)::int;
end $$;

-- True when the centre is open now (opens_at to closes_at, its own time zone).
create or replace function centre_open_now(p_centre smallint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select (now() at time zone c.time_zone)::time >= c.opens_at
                      and (now() at time zone c.time_zone)::time < c.closes_at
                     from centres c where c.id = p_centre), false)
$$;

-- The student's current enrolment on this phone (0060), or null.
create or replace function self_scan_enrolment(p_student uuid, p_device_key text) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select e.id from face_enrolments e
   where e.student_id = p_student and e.profile_id = auth.uid() and e.device_key = p_device_key
     and e.enrolled_at is not null and e.revoked_at is null and e.expires_at > now()
$$;

-- An earlier day's open visit is closed at that day's closing time first (as toggle_visit, 0048).
create or replace function close_earlier_open_visit(p_student uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  update visits ov set check_out = greatest(ov.check_in + interval '1 minute',
         (local_day(ov.check_in, ov.centre_id) + c.closes_at) at time zone c.time_zone)
    from centres c
   where ov.student_id = p_student and ov.check_out is null and c.id = ov.centre_id
     and local_day(ov.check_in, ov.centre_id) < centre_today(ov.centre_id);
$$;

-- ---------------------------------------------------------------- 4. the home's state (#344)
-- The student's phone, when the home comes into view: whether to show "Check in" / "Check out".
-- Returns { face_enabled, enrolled, action: 'check_in' | 'check_out' | null, open_now, opens_at,
-- closes_at, checked_in_at, centre: { lat, lng, radius_m } | null, match_min, blocked }.
-- blocked = face_block_reason's code (no consent, too young, left ...) or null. Read by the student
-- about themselves: not written to access_log. Error code: not_allowed.
create or replace function self_scan_state(p_device_key text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_student uuid := my_student_id();
  s         students;
  c         centres;
  v_open    visits;
  v_blocked text;
  v_enrolled boolean;
  v_now_open boolean;
begin
  if v_student is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  if not face_on() then
    return jsonb_build_object('face_enabled', false, 'enrolled', false, 'action', null);
  end if;
  select * into s from students where id = v_student;
  select * into c from centres where id = s.home_centre_id;
  v_blocked := face_block_reason(v_student);
  v_enrolled := self_scan_enrolment(v_student, p_device_key) is not null;
  v_now_open := centre_open_now(s.home_centre_id);
  select * into v_open from visits
   where student_id = v_student and check_out is null and local_day(check_in, centre_id) = centre_today(centre_id)
   order by check_in desc limit 1;
  return jsonb_build_object(
    'face_enabled', true,
    'enrolled', v_enrolled,
    'blocked', v_blocked,
    'action', case when not v_enrolled or v_blocked is not null then null
                   when v_open.id is not null then 'check_out'
                   when v_now_open then 'check_in' end,
    'open_now', v_now_open,
    'opens_at', to_char(c.opens_at, 'HH24:MI'),
    'closes_at', to_char(c.closes_at, 'HH24:MI'),
    'checked_in_at', v_open.check_in,
    'centre', case when c.lat is not null and c.lng is not null
                   then jsonb_build_object('lat', c.lat, 'lng', c.lng, 'radius_m', c.radius_m) end,
    'match_min', coalesce(setting_int('face_match_percent'), 55) / 100.0);
end $$;

-- ---------------------------------------------------------------- 5. the self-scan (#345)
-- The student's phone, after the location read, the liveness checks, the 1:1 match and the
-- integrity check (0060: issue_integrity_challenge → verify-integrity → p_pass).
-- p_location: the phone's one position (self_scan_location's shape); p_device_key: this phone
-- (0060); p_liveness_ok: the blink/turn challenge and the real-face score passed; p_match_score:
-- cosine of the scan with the phone's face code.
-- Answers { ok: true, action: 'in' | 'already_in' | 'out' | 'already_out', at, roll_no, full_name,
-- location, flagged, minutes } or { ok: false, reason[, detail, minutes] }. A refusal is answered,
-- not raised, so the pass stays spent and the failure stays counted: reason integrity (detail: the
-- pass's code), not_enrolled, liveness, no_match, window, outside (detail: the location result),
-- mocked — counted in face_scan_failures — and not_checked_in, too_soon (not counted).
-- Error codes (raised): not_allowed, action_invalid, face_off, bad_location, and face_block_reason's
-- (student_withdrawn, student_left, dob_required, face_too_young, no_face_consent).
create or replace function self_scan(p_action text, p_location jsonb, p_pass text, p_device_key text,
  p_liveness_ok boolean, p_match_score real) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_student  uuid := my_student_id();
  s          students;
  v          visits;
  v_reason   text;
  v_loc      text;
  v_dist     int;
  v_err      text;
  v_passed   uuid;
  v_fail     text;
  v_detail   text;
  v_min      real := coalesce(setting_int('face_match_percent'), 55) / 100.0;
begin
  if v_student is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('check_in', 'check_out') then raise exception 'action_invalid'; end if;
  perform face_require_on();
  -- One self-scan at a time per student (and in step with the desk's toggle_visit).
  select * into s from students where id = v_student for update;
  v_reason := face_block_reason(v_student);
  if v_reason is not null then raise exception '%', v_reason; end if;
  select x.result, x.distance_m into v_loc, v_dist from self_scan_location(p_location, s.home_centre_id) x;

  -- Gate 1: the one-time pass for this login, action and location result. Its own block, so a bad
  -- pass is counted instead of rolling everything back.
  begin
    v_passed := use_integrity_pass(p_pass, p_action, v_loc);
  exception when others then
    v_err := sqlerrm;
  end;
  if v_err is null and v_passed is distinct from v_student then v_err := 'integrity_required'; end if;

  v_fail := case
    when v_err is not null then 'integrity'
    when self_scan_enrolment(v_student, p_device_key) is null then 'not_enrolled'
    when p_liveness_ok is not true then 'liveness'
    when p_match_score is null or p_match_score < v_min or p_match_score > 1 then 'no_match'
    when p_action = 'check_in' and not centre_open_now(s.home_centre_id) then 'window'
    when p_action = 'check_in' and v_loc = 'mocked' then 'mocked'
    when p_action = 'check_in' and v_loc <> 'inside' then 'outside'
  end;
  if v_fail is not null then
    v_detail := case v_fail when 'integrity' then left(regexp_replace(lower(v_err), '[^a-z_]', '_', 'g'), 40)
                            when 'outside' then v_loc end;
    perform note_face_failure(s.home_centre_id, v_fail, v_detail);
    return jsonb_build_object('ok', false, 'reason', v_fail, 'detail', v_detail);
  end if;

  perform close_earlier_open_visit(v_student);
  perform set_config('app.face_visit', 'on', true);

  if p_action = 'check_in' then
    select * into v from visits where student_id = v_student and check_out is null;
    if found then
      return jsonb_build_object('ok', true, 'action', 'already_in', 'at', v.check_in,
        'roll_no', s.roll_no, 'full_name', s.full_name);
    end if;
    insert into visits (student_id, centre_id, method, marked_by, location_check, location_distance_m, liveness_ok)
    values (v_student, s.home_centre_id, 'face', auth.uid(), v_loc, v_dist, true)
    returning * into v;
    insert into visit_face_scores (visit_id, match_score) values (v.id, p_match_score);
    -- Any visit makes the student active again (toggle_visit).
    if s.status <> 'active' then
      perform set_config('app.via_call_log', 'on', true);
      update students set status = 'active', paused_until = null where id = v_student;
    end if;
    update follow_up_tasks set done_at = now() where student_id = v_student and done_at is null;
    return jsonb_build_object('ok', true, 'action', 'in', 'at', v.check_in, 'roll_no', s.roll_no,
      'full_name', s.full_name, 'location', v_loc, 'flagged', false);
  end if;

  -- Check-out: never refused for the place; saved, and flagged when not inside.
  select * into v from visits where student_id = v_student and check_out is null;
  if not found then
    if exists (select 1 from visits where student_id = v_student and check_out > now() - interval '30 seconds') then
      return jsonb_build_object('ok', true, 'action', 'already_out', 'roll_no', s.roll_no, 'full_name', s.full_name);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'not_checked_in');
  end if;
  -- 0048 (#289): within qr_rescan_minutes of the check-in a scan does not check out.
  if v.check_in > now() - make_interval(mins => coalesce(setting_int('qr_rescan_minutes'), 10)) then
    return jsonb_build_object('ok', false, 'reason', 'too_soon', 'minutes', coalesce(setting_int('qr_rescan_minutes'), 10));
  end if;
  update visits set check_out = now(), check_out_location = v_loc, check_out_distance_m = v_dist, check_out_method = 'face'
   where id = v.id
  returning * into v;
  return jsonb_build_object('ok', true, 'action', 'out', 'at', v.check_out, 'roll_no', s.roll_no,
    'full_name', s.full_name, 'location', v_loc, 'flagged', v_loc <> 'inside',
    'minutes', round(extract(epoch from v.check_out - v.check_in) / 60));
end $$;

-- ---------------------------------------------------------------- 6. failures seen on the phone (#346)
-- The student's phone counts a self-scan that failed before reaching self_scan: outside the area (and
-- its detail: inaccurate, no_fix, refused ...), mocked, liveness, no_match. Per centre and reason, no
-- student id (#213). At most 200 a centre an hour from phones, so one phone cannot flood the counts.
-- Returns true when counted. Error codes: not_allowed, face_off, reason_invalid.
create or replace function note_self_scan_failure(p_reason text, p_detail text default null) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_student uuid := my_student_id();
  v_centre  smallint;
begin
  if v_student is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  perform face_require_on();
  if p_reason is null or p_reason not in ('outside', 'mocked', 'liveness', 'no_match') then raise exception 'reason_invalid'; end if;
  if p_detail is not null and p_detail !~ '^[a-z_]{1,40}$' then raise exception 'reason_invalid'; end if;
  if not exists (select 1 from face_enrolments where student_id = v_student and profile_id = auth.uid()
                    and enrolled_at is not null and revoked_at is null and expires_at > now()) then
    return false;
  end if;
  select home_centre_id into v_centre from students where id = v_student;
  if (select count(*) from face_scan_failures where centre_id = v_centre and at > now() - interval '1 hour') >= 200 then
    return false;
  end if;
  perform note_face_failure(v_centre, p_reason, p_detail);
  return true;
end $$;

-- ---------------------------------------------------------------- who may run them
-- docs/DECISIONS.md #14. App: the student's phone (each checks the caller inside). Internal: the rest.
revoke execute on function self_scan_location(jsonb, smallint), centre_open_now(smallint),
  self_scan_enrolment(uuid, text), close_earlier_open_visit(uuid), guard_face_visit(), guard_visit_location()
  from public, anon, authenticated, service_role;
revoke execute on function self_scan_state(text), self_scan(text, jsonb, text, text, boolean, real),
  note_self_scan_failure(text, text)
  from public, anon;
grant execute on function self_scan_state(text), self_scan(text, jsonb, text, text, boolean, real),
  note_self_scan_failure(text, text)
  to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on column visits.check_out_location is 'Self-scan check-out only: where the student''s phone was (inside, outside, refused, no_fix, no_location, no_area, mocked, inaccurate); not inside = flagged, never refused (0064, #347).';
comment on column visits.check_out_distance_m is 'Metres from the centre''s point at a self-scan check-out (inside / outside only). The position itself is never stored (0064).';
comment on column visits.check_out_method is 'How the check-out was recorded: face = the student''s self-scan; null = not recorded (the desk, the night job, before 0064) (0064).';
comment on function guard_setting is 'Trigger: checks the value of each setting the app may change; the app cannot add or delete settings, nor change face_* (SQL editor only) (docs/DECISIONS.md #47, #289, #300, #348).';
comment on function guard_visit_location is 'Trigger: app users cannot change the location results of a visit (check-in 0024, check-out 0064).';
comment on function guard_face_visit is 'Trigger: method face, liveness_ok and check_out_method face only from the self-scan path (app.face_visit) while face scan is on (face_visit_reserved) (0060, 0064, S4F-01).';
comment on function self_scan_location is 'Internal: the self-scan''s location result from the phone''s one position: inside, outside, mocked, inaccurate, no_area, refused, no_fix, no_location; and the distance (0064, #345).';
comment on function centre_open_now is 'Internal: true while a centre is open (opens_at to closes_at, its time zone) (0064).';
comment on function self_scan_enrolment is 'Internal: the signed-in student''s current face enrolment on this phone (device key), or null (0064).';
comment on function close_earlier_open_visit is 'Internal: closes a student''s open visit of an earlier day at that day''s closing time (0064, as toggle_visit 0048).';
comment on function self_scan_state is 'Student''s phone: whether the home shows Check in (open hours) or Check out (a visit of today open), the centre''s point and radius, the match threshold (0064, #344).';
comment on function self_scan is 'Student''s phone: the face self-scan check-in or check-out; re-checks the integrity pass, consent, enrolment of this phone, location, open hours, liveness and score; check-out outside is saved and flagged (0064, #345).';
comment on function note_self_scan_failure is 'Student''s phone: counts a self-scan that failed on the phone (outside, mocked, liveness, no_match) per centre, no student id; at most 200 a centre an hour (0064, #346).';
