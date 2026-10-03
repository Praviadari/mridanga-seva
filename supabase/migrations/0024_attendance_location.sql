-- Mridanga Seva — 0024: the phone's position is checked against the centre's area at check-in.
-- Run once, after 0023, in the Supabase SQL editor (TEST first). It only adds: two columns, one
-- trigger, and new versions of toggle_visit / scan_qr / mark_visit / class_report.
-- Why: docs/DECISIONS.md #70. How: docs/DATABASE.md "Attendance".
--
-- Praveen decided on 3 Oct 2026: when a coordinator (or the Guru) checks a student IN, by
-- scanning the QR or tapping the name, their phone reports where it is. Outside the centre's area,
-- location refused, no fix in time, or a browser without location: the visit is STILL saved, but
-- flagged, and staff see the flag (S9 visit history, C6 who is here, C21/G8 reports).
-- Privacy: the phone sends its position with the call; the database keeps only the distance to
-- the centre's point (whole metres) and the result, never the position itself.
-- Check-outs are not checked.

-- ---------------------------------------------------------------- 1. the result on the visit
--   location_check: null = not checked (visits before 0024, or an app without the check)
--     'inside'      within the area (radius + the fix's accuracy, at most 100 m of it)
--     'outside'     further away             } flagged
--     'refused'     location permission refused   } flagged
--     'no_fix'      no position in time / location switched off } flagged
--     'no_location' a browser without location         } flagged
--     'no_area'     the centre has no point yet (G9): nothing to compare, not flagged
--   location_distance_m: metres from the centre's point, for 'inside' and 'outside' only.
alter table visits
  add column location_check text
    check (location_check in ('inside', 'outside', 'refused', 'no_fix', 'no_location', 'no_area')),
  add column location_distance_m int
    check (location_distance_m is null or (location_distance_m >= 0 and location_check in ('inside', 'outside'))),
  add constraint visits_distance_with_result
    check (location_check not in ('inside', 'outside') or location_distance_m is not null);

-- Flagged visits of a period are counted by the reports.
create index visits_flagged on visits (check_in)
  where location_check in ('outside', 'refused', 'no_fix', 'no_location');

-- Staff may correct a visit's times (policy staff_update, 0001) but not its location result: it is
-- written once, at check-in, by toggle_visit. The dashboard (owner) may still change it.
create or replace function guard_visit_location() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated')
     and (new.location_check is distinct from old.location_check
          or new.location_distance_m is distinct from old.location_distance_m) then
    raise exception 'location_locked' using detail = 'The location result of a visit cannot be changed.';
  end if;
  return new;
end $$;

create trigger visits_location_guard before update on visits
  for each row execute function guard_visit_location();

-- ---------------------------------------------------------------- 2. reading the phone's report
-- p_location from the app (src/lib/attendance-location.ts):
--   {"status": "fix", "lat": 17.385, "lng": 78.4867, "accuracy": 12}   (accuracy in metres, may be null)
--   {"status": "refused"} | {"status": "no_fix"} | {"status": "no_location"}
-- Returns the result for the visit's centre: {check, distance_m}. Error: bad_location.
create or replace function visit_location_result(p_location jsonb, p_centre smallint)
returns table (location_check text, location_distance_m int)
language plpgsql stable set search_path = public as $$
declare
  c        centres;
  v_status text := p_location ->> 'status';
  v_lat    double precision;
  v_lng    double precision;
  v_acc    double precision;
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
  exception when others then
    raise exception 'bad_location';
  end;
  if v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
    raise exception 'bad_location';
  end if;

  select * into c from centres where id = p_centre;
  if not found or c.lat is null or c.lng is null then
    return query select 'no_area'::text, null::int;
    return;
  end if;

  -- Great-circle distance (haversine), Earth radius 6 371 km: within centimetres at this scale.
  v_dist := 2 * 6371000 * asin(sqrt(
              power(sin(radians(v_lat - c.lat) / 2), 2)
              + cos(radians(c.lat)) * cos(radians(v_lat)) * power(sin(radians(v_lng - c.lng) / 2), 2)));
  -- A phone indoors often reports ±30-80 m: that much benefit of the doubt, at most 100 m.
  v_acc := least(greatest(coalesce(v_acc, 0), 0), 100);
  return query select case when v_dist <= c.radius_m + v_acc then 'inside' else 'outside' end,
                      round(v_dist)::int;
end $$;

-- ---------------------------------------------------------------- 3. marking with the location
-- Same as 0001 / 0004, with p_location added (default null = not checked, as before). Only a
-- check-in stores it; the result goes back to the app as location_check / distance_m.
drop function if exists mark_visit(uuid, text, text);
drop function if exists scan_qr(uuid, text);
drop function if exists toggle_visit(uuid, visit_method, text);

create function toggle_visit(p_student uuid, p_method visit_method, p_device text default null,
                             p_location jsonb default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v visits; s students; v_check text; v_dist int;
begin
  if my_role() not in ('guru', 'coordinator', 'kiosk') then
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

create function scan_qr(p_qr uuid, p_device text default null, p_location jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s_id uuid;
begin
  select id into s_id from students where qr_token = p_qr;
  if s_id is null then return jsonb_build_object('action', 'unknown'); end if;
  return toggle_visit(s_id, 'qr', p_device, p_location);
end $$;

create function mark_visit(p_student uuid, p_action text, p_device text default null,
                           p_location jsonb default null)
returns jsonb
language plpgsql set search_path = public as $$
declare s students; is_in boolean;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  if coalesce(p_action, '') not in ('in', 'out') then
    raise exception 'bad_action' using detail = 'p_action must be ''in'' or ''out''.';
  end if;
  -- Lock the student's row until this call ends, so two phones marking the same student at the
  -- same moment are handled one after the other and the second sees the first one's change.
  select * into s from students where id = p_student for update;
  if not found then raise exception 'student_not_found'; end if;

  is_in := exists (select 1 from visits where student_id = p_student and check_out is null);
  if (p_action = 'in') = is_in then
    return jsonb_build_object('action', case when is_in then 'already_in' else 'already_out' end,
      'roll_no', s.roll_no, 'full_name', s.full_name);
  end if;
  return toggle_visit(p_student, 'manual', p_device, case when p_action = 'in' then p_location end);
end $$;

-- ---------------------------------------------------------------- 4. reports count the flags
-- class_report as in 0015, plus 'visits_flagged', 'flagged_by_reason' and a 'flagged' count on
-- each student row (C21 / G8 and the CSV file).
create or replace function class_report(p_from date, p_to date, p_mentor uuid default null) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_mentor  uuid;
  v_today   date := today_ist();
  v_rolling boolean := coalesce((select value #>> '{}' from settings where key = 'week_starts') = 'rolling7', false);
  v_from_ts timestamptz;
  v_to_ts   timestamptz;
  v_first   date;
  v_out     jsonb;
begin
  if not is_staff() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'range_invalid'; end if;
  if p_to - p_from > 366 then
    raise exception 'range_too_long' using detail = 'A report covers at most a year.';
  end if;
  if is_guru() then
    v_mentor := p_mentor;
  elsif p_mentor is null or p_mentor = auth.uid() then
    v_mentor := auth.uid();
  else
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  v_from_ts := p_from::timestamp at time zone 'Asia/Kolkata';
  v_to_ts   := (p_to + 1)::timestamp at time zone 'Asia/Kolkata';
  -- First day of the first weekly row.
  v_first := case when v_rolling then p_to - 6 - 7 * ((p_to - p_from) / 7)
                  else p_from - (extract(isodow from p_from)::int - 1) end;

  with scope as (
    select o.*, p.full_name as mentor_name
      from student_overview o
      left join profiles p on p.id = o.mentor_id
     where v_mentor is null or o.mentor_id = v_mentor
  ),
  v as (
    select vi.student_id,
           (vi.check_in at time zone 'Asia/Kolkata')::date as day,
           coalesce(extract(epoch from (vi.check_out - vi.check_in)) / 3600.0, 0) as hours,
           case when vi.location_check in ('outside', 'refused', 'no_fix', 'no_location')
                then vi.location_check end as flag
      from visits vi
      join scope sc on sc.id = vi.student_id
     where vi.check_in >= v_from_ts and vi.check_in < v_to_ts
  ),
  vw as (
    select v.*,
           case when v_rolling then p_to - 6 - 7 * ((p_to - v.day) / 7)
                else v.day - (extract(isodow from v.day)::int - 1) end as week_start,
           date_trunc('month', v.day)::date as month_start
      from v
  ),
  weeks as (
    select gs::date as start from generate_series(v_first::timestamp, p_to::timestamp, interval '7 days') gs
  ),
  months as (
    select gs::date as start from generate_series(date_trunc('month', p_from::timestamp), p_to::timestamp, interval '1 month') gs
  ),
  calls as (
    select c.student_id, c.outcome
      from call_logs c
      join scope sc on sc.id = c.student_id
     where c.called_at >= v_from_ts and c.called_at < v_to_ts
  ),
  open_tasks as (
    select t.student_id, t.due_on, t.escalated
      from follow_up_tasks t
      join scope sc on sc.id = t.student_id
     where t.done_at is null
  ),
  prog as (
    select sc.id, sc.level_id,
           (select count(*) from student_progress sp join syllabus_items i on i.id = sp.item_id
             where sp.student_id = sc.id and i.level_id = sc.level_id and i.retired_at is null) as done,
           (select count(*) from syllabus_items i where i.level_id = sc.level_id and i.retired_at is null) as total
      from scope sc
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'today', v_today,
    'week_starts', case when v_rolling then 'rolling7' else 'monday' end,
    'mentor_id', v_mentor,
    'students', (select count(*) from scope),
    'in_class', (select count(*) from scope where status <> 'left'),
    'by_status', (select jsonb_agg(jsonb_build_object('status', x.st, 'students', x.n) order by x.st)
                    from (select st, count(sc.id) as n
                            from unnest(enum_range(null::student_status)) as st
                            left join scope sc on sc.status = st
                           group by st) x),
    'new_joiners', (select count(*) from scope where joined_on between p_from and p_to),
    'left_in_range', (select count(distinct h.student_id) from status_history h
                        join scope sc on sc.id = h.student_id
                       where h.to_status = 'left' and h.changed_at >= v_from_ts and h.changed_at < v_to_ts),
    'visits', (select count(*) from v),
    'visitors', (select count(distinct student_id) from v),
    'hours', (select coalesce(round(sum(hours)::numeric, 1), 0) from v),
    'visits_flagged', (select count(*) from v where flag is not null),
    'flagged_by_reason', (select jsonb_agg(jsonb_build_object('reason', x.reason, 'visits', x.n) order by x.reason)
                            from (select r.reason, count(v.flag) as n
                                    from unnest(array['no_fix', 'no_location', 'outside', 'refused']) as r(reason)
                                    left join v on v.flag = r.reason
                                   group by r.reason) x),
    'by_week', (select jsonb_agg(jsonb_build_object('start', w.start, 'visits', w.visits, 'visitors', w.visitors, 'hours', w.hours)
                                 order by w.start)
                  from (select wk.start, count(vw.student_id) as visits, count(distinct vw.student_id) as visitors,
                               coalesce(round(sum(vw.hours)::numeric, 1), 0) as hours
                          from weeks wk left join vw on vw.week_start = wk.start
                         group by wk.start) w),
    'by_month', (select jsonb_agg(jsonb_build_object('start', m.start, 'visits', m.visits, 'visitors', m.visitors, 'hours', m.hours)
                                  order by m.start)
                   from (select mo.start, count(vw.student_id) as visits, count(distinct vw.student_id) as visitors,
                                coalesce(round(sum(vw.hours)::numeric, 1), 0) as hours
                           from months mo left join vw on vw.month_start = mo.start
                          group by mo.start) m),
    'calls_done', (select count(*) from calls),
    'calls_by_outcome', (select jsonb_agg(jsonb_build_object('outcome', x.oc, 'calls', x.n) order by x.oc)
                           from (select oc, count(c.student_id) as n
                                   from unnest(enum_range(null::call_outcome)) as oc
                                   left join calls c on c.outcome = oc
                                  group by oc) x),
    'calls_due', (select count(distinct student_id) from open_tasks where due_on <= v_today or escalated),
    'calls_escalated', (select count(distinct student_id) from open_tasks where escalated),
    'calls_planned', (select count(distinct student_id) from open_tasks where due_on > v_today and not escalated),
    'by_level', (select jsonb_agg(jsonb_build_object(
                          'level_id', x.id, 'name', x.name, 'items', x.items, 'students', x.students,
                          'avg_percent', x.avg_percent, 'complete', x.complete, 'ticks_in_range', x.ticks)
                        order by x.sort)
                   from (select l.id, l.name, l.sort,
                                (select count(*) from syllabus_items i where i.level_id = l.id and i.retired_at is null) as items,
                                count(pr.id) as students,
                                coalesce(round(avg(case when pr.total > 0 then 100.0 * pr.done / pr.total end)), 0) as avg_percent,
                                count(pr.id) filter (where pr.total > 0 and pr.done >= pr.total) as complete,
                                (select count(*) from student_progress sp
                                   join syllabus_items i on i.id = sp.item_id
                                   join scope sc on sc.id = sp.student_id
                                  where i.level_id = l.id and sp.done_on between p_from and p_to) as ticks
                           from levels l
                           left join (prog pr join scope s2 on s2.id = pr.id and s2.status <> 'left') on pr.level_id = l.id
                          group by l.id, l.name, l.sort) x),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object(
                      'id', sc.id, 'roll_no', sc.roll_no, 'full_name', sc.full_name, 'level_id', sc.level_id,
                      'status', sc.status, 'mentor_id', sc.mentor_id, 'mentor_name', sc.mentor_name,
                      'joined_on', sc.joined_on,
                      'last_visit_on', (sc.last_visit_at at time zone 'Asia/Kolkata')::date,
                      'days_since_visit', sc.days_since_visit,
                      'visits', (select count(*) from v where v.student_id = sc.id),
                      'flagged', (select count(*) from v where v.student_id = sc.id and v.flag is not null),
                      'hours', (select coalesce(round(sum(v.hours)::numeric, 1), 0) from v where v.student_id = sc.id),
                      'calls', (select count(*) from calls c where c.student_id = sc.id),
                      'syllabus_done', pr.done, 'syllabus_total', pr.total)
                    order by sc.full_name, sc.roll_no), '[]'::jsonb)
               from scope sc join prog pr on pr.id = sc.id))
    into v_out;
  return v_out;
end $$;

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14. The marking functions are new objects (new signatures), so their rights
-- are given again exactly as in 0002 / 0004; the helpers are internal.
revoke execute on function guard_visit_location(), visit_location_result(jsonb, smallint)
  from public, anon, authenticated;
revoke execute on function toggle_visit(uuid, visit_method, text, jsonb), scan_qr(uuid, text, jsonb),
  mark_visit(uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function toggle_visit(uuid, visit_method, text, jsonb), scan_qr(uuid, text, jsonb),
  mark_visit(uuid, text, text, jsonb)
  to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on column visits.location_check is 'Where the marking phone was at check-in: inside, outside, refused, no_fix, no_location, no_area; null = not checked. Set once by toggle_visit (0024).';
comment on column visits.location_distance_m is 'Metres from the centre''s point at check-in (inside / outside only). The position itself is never stored.';
comment on function toggle_visit is 'Check a student in, or out if already in. A check-in makes the student active, closes their follow-up tasks and stores the location result (0024).';
comment on function scan_qr is 'Look up a student by QR token and toggle their visit. Returns action = unknown for an unrecognised code.';
comment on function mark_visit is 'Tap-to-mark attendance: check a student in or out as asked; does nothing if they already are. Coordinators and Guru only.';
comment on function visit_location_result is 'Internal: compares a phone''s reported position with a centre''s area; returns the check and the distance only.';
comment on function guard_visit_location is 'Trigger: app users cannot change the location result of a visit.';
