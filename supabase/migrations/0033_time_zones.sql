-- 0033: international basics (docs/I18N.md, docs/DECISIONS.md #132-#135).
--
-- Until now every "today", "this week" and every time of day was India time ('Asia/Kolkata'),
-- written into each function. Centres in other countries need their own clock. This migration:
--   1. gives every centre an IANA time zone (default 'Asia/Kolkata') and an ISO 3166 country code
--      (default 'IN'), checked by a trigger;
--   2. adds helpers: centre_tz, person_centre, my_time_zone, centre_today, local_day, local_stamp;
--   3. makes today_ist() "today at the caller's centre" (the name stays: 40 functions call it), and
--      redefines the functions that wrote 'Asia/Kolkata' themselves so they use the centre's zone:
--      student_overview, refresh_student_statuses, close_open_visits (now hourly, only once the
--      centre has been closed an hour), check_out_all, the three home screens, class_report,
--      mark_event_attendance, the event and poll notices, events_polls_daily, duty_daily,
--      ig_subscriber_weeks;
--   4. gives every fund entry an ISO 4217 currency code (default 'INR'); a reversal takes the
--      currency of the entry it undoes.
--
-- Additive and safe for the current app: with one centre in India every answer is the same as
-- before (the smoke test checks this), no column the app reads changes, no function signature
-- changes (event_push_line gets a 5-argument overload; the 4-argument one stays).
-- Every UPDATE/DELETE has a WHERE (Supabase safeupdate).

-- ---------------------------------------------------------------- 1. centres: zone and country
alter table centres add column if not exists time_zone text not null default 'Asia/Kolkata';
alter table centres add column if not exists country_code text not null default 'IN';

-- An IANA name such as 'Asia/Kolkata' or 'America/New_York' that Postgres knows (not an
-- abbreviation like 'IST', which is ambiguous, nor a fixed offset, which ignores summer time);
-- a country as two capital letters (ISO 3166-1 alpha-2). Errors time_zone_invalid, country_invalid.
create or replace function guard_centre_locale() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.time_zone is distinct from old.time_zone then
    if new.time_zone !~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)+$'
       or not exists (select 1 from pg_timezone_names where name = new.time_zone) then
      raise exception 'time_zone_invalid' using detail = 'Use an IANA time zone name, e.g. Asia/Kolkata or America/New_York.';
    end if;
  end if;
  if new.country_code !~ '^[A-Z]{2}$' then
    raise exception 'country_invalid' using detail = 'Use a two-letter ISO 3166 country code, e.g. IN or US.';
  end if;
  return new;
end $$;

drop trigger if exists centres_locale_guard on centres;
create trigger centres_locale_guard before insert or update on centres
  for each row execute function guard_centre_locale();

-- ---------------------------------------------------------------- 2. helpers
-- The time zone of a centre; no centre (or an unknown one) = the first centre's, else India.
-- Security definer: pending logins (Ishtagoshti subscribers) may not read centres, but their
-- "today" still needs the zone.
create or replace function centre_tz(p_centre int) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select time_zone from centres where id = p_centre),
                  (select time_zone from centres order by id limit 1),
                  'Asia/Kolkata')
$$;

-- The country of a centre, like centre_tz.
create or replace function centre_country(p_centre int) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select country_code from centres where id = p_centre),
                  (select country_code from centres order by id limit 1),
                  'IN')
$$;

-- A person's centre: a student's home centre, else the login's centre; null when neither is known.
create or replace function person_centre(p_profile uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select s.home_centre_id from students s where s.profile_id = p_profile),
                  (select p.centre_id from profiles p where p.id = p_profile))::int
$$;

-- The signed-in person's time zone; pg_cron and the dashboard (no login) get the first centre's.
create or replace function my_time_zone() returns text
language sql stable security definer set search_path = public as $$
  select centre_tz(person_centre(auth.uid()))
$$;

-- What the app needs to write dates, times and amounts for the signed-in person: their centre's
-- zone and country. An app on a database without 0033 gets PGRST202 and keeps India.
create or replace function my_centre_locale() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('time_zone', centre_tz(x.c), 'country_code', centre_country(x.c))
    from (select person_centre(auth.uid()) as c) x
$$;

-- Today at a centre.
create or replace function centre_today(p_centre int) returns date
language sql stable set search_path = public as $$
  select (now() at time zone centre_tz(p_centre))::date
$$;

-- The day a moment falls on at a centre, e.g. the attendance day of a check-in.
create or replace function local_day(p_at timestamptz, p_centre int) returns date
language sql stable set search_path = public as $$
  select (p_at at time zone centre_tz(p_centre))::date
$$;

-- A moment written for a person's notice, in their centre's zone, 24-hour: p_part 'date',
-- 'time' or 'datetime'. India keeps day-month-year (30-09-2026), as the app shows it; other
-- countries get ISO 8601 (2026-09-30), which nobody misreads as month-day.
create or replace function local_stamp(p_at timestamptz, p_profile uuid, p_part text default 'datetime') returns text
language sql stable set search_path = public as $$
  select to_char(p_at at time zone centre_tz(c.id),
                 case p_part when 'time' then 'HH24:MI'
                             when 'date' then c.df
                             else c.df || ' HH24:MI' end)
    from (select person_centre(p_profile) as id,
                 case when centre_country(person_centre(p_profile)) = 'IN' then 'DD-MM-YYYY' else 'YYYY-MM-DD' end as df) c
$$;

-- Today at the caller's centre (pg_cron: the first centre). The name is kept from 0001, when it
-- meant India; every "today" rule in the database calls it.
create or replace function today_ist() returns date
language sql stable set search_path = public as $$
  select (now() at time zone my_time_zone())::date
$$;

-- ---------------------------------------------------------------- 3a. student overview
-- 0014's view; "today" and the day of the last visit are the student's home centre's.
create or replace view student_overview with (security_invoker = true) as
select s.id,
       s.roll_no,
       s.full_name,
       s.level_id,
       s.status,
       s.paused_until,
       s.mentor_id,
       s.home_centre_id,
       s.joined_on,
       lv.last_visit_at,
       centre_today(s.home_centre_id) - coalesce(local_day(lv.last_visit_at, s.home_centre_id),
                              greatest(s.joined_on, local_day(s.created_at, s.home_centre_id)))
         as days_since_visit,
       lv.here_now
  from students s
  left join lateral (
    select max(v.check_in) as last_visit_at,
           coalesce(bool_or(v.check_out is null), false) as here_now
      from visits v
     where v.student_id = s.id
  ) lv on true;

-- ---------------------------------------------------------------- 3b. the daily status job
-- 0030's version; every "today" and every day of a visit is the student's home centre's.
create or replace function refresh_student_statuses() returns void
language plpgsql security definer set search_path = public as $$
declare
  r          record;
  last_seen  date;
  v_today    date;
  v_irregular int := setting_int('irregular_days');
  v_inactive  int := setting_int('inactive_days');
  v_call_due  int := setting_int('call_due_days');
begin
  perform set_config('app.via_call_log', 'on', true);

  for r in update students set status = 'irregular', paused_until = null
            where status = 'paused' and paused_until < centre_today(home_centre_id)
        returning id, mentor_id, home_centre_id loop
    if not exists (select 1 from follow_up_tasks where student_id = r.id and done_at is null) then
      insert into follow_up_tasks (student_id, assignee_id, kind, due_on)
      values (r.id, r.mentor_id, 'call', centre_today(r.home_centre_id) + v_call_due);
    end if;
  end loop;

  for r in select * from students where status in ('new', 'active', 'irregular') loop
    v_today := centre_today(r.home_centre_id);
    select greatest(
             coalesce(max(local_day(v.check_in, r.home_centre_id)),
                      greatest(r.joined_on, local_day(r.created_at, r.home_centre_id))),
             (select max(local_day(h.changed_at, r.home_centre_id))
                from status_history h
               where h.student_id = r.id and h.from_status = 'paused'))
      into last_seen from visits v where v.student_id = r.id;
    if r.status in ('new', 'active') and last_seen <= v_today - v_irregular then
      update students set status = 'irregular' where id = r.id;
      if not exists (select 1 from follow_up_tasks where student_id = r.id and done_at is null) then
        insert into follow_up_tasks (student_id, assignee_id, kind, due_on)
        values (r.id, r.mentor_id, 'call', v_today + v_call_due);
      end if;
    elsif r.status = 'irregular' and last_seen <= v_today - v_inactive then
      update students set status = 'inactive' where id = r.id;
    end if;
  end loop;

  update follow_up_tasks t set escalated = true
    from students s
   where t.student_id = s.id and t.done_at is null and not t.escalated
     and s.status = 'inactive' and t.due_on <= centre_today(s.home_centre_id);
end $$;

-- ---------------------------------------------------------------- 3c. closing visits
-- A visit left open ends at its centre's closing time on the day it began, in the centre's zone.
-- Only visits whose centre closed at least an hour ago (that day) are closed, so the job can run
-- every hour for every zone: for a centre in India closing at 20:00 that is the 21:00 IST run, as
-- before; a centre in New York is closed at 21:00 New York time, not in the middle of its class.
create or replace function close_open_visits() returns void
language sql security definer set search_path = public as $$
  update visits v set check_out = greatest(v.check_in + interval '1 minute',
         (local_day(v.check_in, v.centre_id) + c.closes_at) at time zone c.time_zone)
    from centres c
   where v.centre_id = c.id and v.check_out is null
     and (local_day(v.check_in, v.centre_id) + c.closes_at) at time zone c.time_zone
         <= now() - interval '1 hour'
$$;

-- Every hour at half past (was 21:00 IST only). pg_cron replaces the job of the same name.
select cron.schedule('mridanga-close-visits', '30 * * * *', 'select close_open_visits()');

-- 0004's check_out_all: "started today" and the closing time are the visit's centre's.
create or replace function check_out_all(p_centre smallint default null)
returns int
language plpgsql set search_path = public as $$
declare closed int;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
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
  return closed;
end $$;

-- ---------------------------------------------------------------- 3d. home screens
-- 0009 / 0013 versions; midnight and Monday are the caller's (today_ist, week_start_ist).
create or replace function coordinator_dashboard()
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  today       date := today_ist();
  joiner_days int  := coalesce(setting_int('new_joiner_weeks'), 4) * 7;
begin
  if not is_staff() then
    raise exception 'not_allowed' using detail = 'Only coordinators and the Guru have the coordinator dashboard.';
  end if;
  return jsonb_build_object(
    -- Same as C6: every open visit, including one the nightly job failed to close.
    'here_now',         (select count(*) from visits where check_out is null),
    -- Same as C5: check-ins since the caller's midnight, including students who have left again.
    'visits_today',     (select count(*) from visits
                          where check_in >= today::timestamp at time zone my_time_zone()),
    'my_calls_due',     (select count(distinct t.student_id)
                           from follow_up_tasks t
                           join students s on s.id = t.student_id
                          where t.done_at is null
                            and (t.due_on <= today or t.escalated)
                            and (t.assignee_id = auth.uid() or s.mentor_id = auth.uid())),
    'new_joiner_weeks', joiner_days / 7,
    'new_joiner_count', (select count(*) from students
                          where joined_on > today - joiner_days and status <> 'left'),
    'new_joiners',      coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', j.id, 'full_name', j.full_name, 'roll_no', j.roll_no, 'level_id', j.level_id,
               'joined_on', j.joined_on, 'visits', j.visits)
             order by j.joined_on desc, j.full_name)
        from (select s.id, s.full_name, s.roll_no, s.level_id, s.joined_on,
                     (select count(*) from visits v where v.student_id = s.id) as visits
                from students s
               where s.joined_on > today - joiner_days and s.status <> 'left'
               order by s.joined_on desc, s.full_name
               limit 50) j), '[]'::jsonb));
end $$;

create or replace function guru_dashboard()
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  today       date := today_ist();
  joiner_days int  := coalesce(setting_int('new_joiner_weeks'), 4) * 7;
begin
  if not is_guru() then
    raise exception 'not_allowed' using detail = 'Only the Guru has the Guru dashboard.';
  end if;
  return jsonb_build_object(
    'week_start',       week_start_ist(),
    'came_this_week',   (select count(distinct student_id) from visits
                          where check_in >= week_start_ist()::timestamp at time zone my_time_zone()),
    'in_class',         (select count(*) from students where status <> 'left'),
    'new_joiner_weeks', joiner_days / 7,
    'new_joiners',      (select count(*) from students
                          where joined_on > today - joiner_days and status <> 'left'),
    'by_level',         (select coalesce(jsonb_agg(jsonb_build_object(
                                  'level_id', x.id, 'name', x.name, 'students', x.n) order by x.sort), '[]'::jsonb)
                           from (select l.id, l.name, l.sort, count(s.id) as n
                                   from levels l
                                   left join students s on s.level_id = l.id and s.status <> 'left'
                                  group by l.id, l.name, l.sort) x),
    'by_status',        (select jsonb_agg(jsonb_build_object('status', x.st, 'students', x.n) order by x.st)
                           from (select st, count(s.id) as n
                                   from unnest(enum_range(null::student_status)) as st
                                   left join students s on s.status = st
                                  group by st) x),
    'follow_ups',       (select coalesce(jsonb_agg(jsonb_build_object(
                                  'assignee_id', x.assignee_id, 'full_name', x.full_name,
                                  'overdue', x.overdue, 'escalated', x.escalated)
                                order by x.escalated desc, x.overdue desc, x.full_name nulls last), '[]'::jsonb)
                           from (select t.assignee_id, p.full_name,
                                        count(distinct t.student_id) filter (where not t.escalated) as overdue,
                                        count(distinct t.student_id) filter (where t.escalated) as escalated
                                   from follow_up_tasks t
                                   left join profiles p on p.id = t.assignee_id
                                  where t.done_at is null and (t.escalated or t.due_on < today)
                                  group by t.assignee_id, p.full_name) x));
end $$;

create or replace function student_home()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'full_name',        o.full_name,
    'roll_no',          o.roll_no,
    'level_id',         o.level_id,
    'status',           o.status,
    'joined_on',        o.joined_on,
    'last_visit_at',    o.last_visit_at,
    'days_since_visit', o.days_since_visit,
    'here_now',         o.here_now,
    'visits_this_week', (select count(*) from visits v
                          where v.student_id = o.id
                            and v.check_in >= week_start_ist()::timestamp at time zone my_time_zone()),
    'syllabus_done',    (select count(*) from student_progress p
                           join syllabus_items i on i.id = p.item_id
                          where p.student_id = o.id and i.level_id = o.level_id and i.retired_at is null),
    'syllabus_total',   (select count(*) from syllabus_items i
                          where i.level_id = o.level_id and i.retired_at is null))
  from students s
  join student_overview o on o.id = s.id
  where s.profile_id = auth.uid()
$$;

-- ---------------------------------------------------------------- 3e. reports
-- 0024's class_report. The dates asked for are the caller's calendar (calls, leavers); a visit
-- counts on its own centre's day, so a check-in at 23:30 in New York is that day, not the next.
create or replace function class_report(p_from date, p_to date, p_mentor uuid default null) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_mentor  uuid;
  v_today   date := today_ist();
  v_tz      text := my_time_zone();
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

  v_from_ts := p_from::timestamp at time zone v_tz;
  v_to_ts   := (p_to + 1)::timestamp at time zone v_tz;
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
    -- Two days either side catch every zone (UTC-12 to UTC+14); the day decides.
    select x.* from (
      select vi.student_id,
             local_day(vi.check_in, vi.centre_id) as day,
             coalesce(extract(epoch from (vi.check_out - vi.check_in)) / 3600.0, 0) as hours,
             case when vi.location_check in ('outside', 'refused', 'no_fix', 'no_location')
                  then vi.location_check end as flag
        from visits vi
        join scope sc on sc.id = vi.student_id
       where vi.check_in >= v_from_ts - interval '2 days' and vi.check_in < v_to_ts + interval '2 days'
    ) x
     where x.day between p_from and p_to
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
                      'last_visit_on', local_day(sc.last_visit_at, sc.home_centre_id),
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

-- ---------------------------------------------------------------- 3f. events, polls, duty
-- The notice line of 0022, in the person's own zone and date style (p_profile). The 4-argument
-- version stays for any caller that has no person: it uses the caller's zone.
create or replace function event_push_line(p_kind text, p_lang text, p_at timestamptz, p_extra text, p_profile uuid)
returns text language sql stable set search_path = public as $$
  select case p_kind
    when 'event_new' then case p_lang
      when 'te' then 'కొత్త కార్యక్రమం: ' || local_stamp(p_at, p_profile) || '. మీరు వస్తారా?'
      when 'hi' then 'नया कार्यक्रम: ' || local_stamp(p_at, p_profile) || '। क्या आप आएँगे?'
      else 'New event: ' || local_stamp(p_at, p_profile) || '. Will you come?' end
    when 'event_changed' then case p_lang
      when 'te' then 'సమయం లేదా స్థలం మారింది: ' || local_stamp(p_at, p_profile) || '.'
      when 'hi' then 'समय या स्थान बदल गया: ' || local_stamp(p_at, p_profile) || '।'
      else 'The time or place changed: ' || local_stamp(p_at, p_profile) || '.' end
    when 'event_cancelled' then case p_lang
      when 'te' then local_stamp(p_at, p_profile, 'date') || ' నాటి ఈ కార్యక్రమం రద్దయింది.'
      when 'hi' then local_stamp(p_at, p_profile, 'date') || ' का यह कार्यक्रम रद्द हो गया है।'
      else 'This event on ' || local_stamp(p_at, p_profile, 'date') || ' is cancelled.' end
    when 'event_remind' then case p_lang
      when 'te' then 'గుర్తు: రేపు ' || local_stamp(p_at, p_profile, 'time') || ' కి.'
      when 'hi' then 'याद रहे: कल ' || local_stamp(p_at, p_profile, 'time') || ' बजे।'
      else 'Reminder: tomorrow at ' || local_stamp(p_at, p_profile, 'time') || '.' end
    when 'event_ask' then case p_lang
      when 'te' then 'మీరు వస్తారో లేదో దయచేసి తెలపండి (' || local_stamp(p_at, p_profile) || ').'
      when 'hi' then 'कृपया बताएँ कि आप आएँगे या नहीं (' || local_stamp(p_at, p_profile) || ')।'
      else 'Please tell us if you will come (' || local_stamp(p_at, p_profile) || ').' end
    when 'event_performer' then case p_lang
      when 'te' then 'మీ పాత్ర: ' || p_extra || '.'
      when 'hi' then 'आपकी भूमिका: ' || p_extra || '।'
      else 'Your part: ' || p_extra || '.' end
    when 'poll_new' then case p_lang
      when 'te' then 'కొత్త అభిప్రాయ సేకరణ. దయచేసి ' || local_stamp(p_at, p_profile) || ' లోపు ఓటు వేయండి.'
      when 'hi' then 'नया मतदान। कृपया ' || local_stamp(p_at, p_profile) || ' तक वोट दें।'
      else 'New poll. Please vote by ' || local_stamp(p_at, p_profile) || '.' end
    when 'poll_remind' then case p_lang
      when 'te' then 'గుర్తు: ఓటింగ్ ' || local_stamp(p_at, p_profile) || ' కి ముగుస్తుంది. దయచేసి ఓటు వేయండి.'
      when 'hi' then 'याद रहे: मतदान ' || local_stamp(p_at, p_profile) || ' को बंद होगा। कृपया वोट दें।'
      else 'Reminder: the poll closes ' || local_stamp(p_at, p_profile) || '. Please vote.' end
  end
$$;

create or replace function event_push_line(p_kind text, p_lang text, p_at timestamptz, p_extra text default null)
returns text language sql stable set search_path = public as $$
  select event_push_line(p_kind, p_lang, p_at, p_extra, auth.uid())
$$;

-- 0022's queue_people_push; each person's line is written in their own zone.
create or replace function queue_people_push(p_profiles uuid[], p_kind text, p_title text, p_screen text,
                                             p_at timestamptz, p_extra text default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  insert into push_outbox (profile_id, title, body, url)
  select p.id, left(p_title, 120), event_push_line(p_kind, p.language, p_at, p_extra, p.id),
         case when p.role = 'student' then '/student/' else '/staff/' end || p_screen
    from profiles p
   where p.id = any (coalesce(p_profiles, '{}')) and p.active and p.role in ('guru', 'coordinator', 'student');
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- 0022's mark_event_attendance: "from the event's day on" at the event's centre (no centre: the
-- caller's).
create or replace function mark_event_attendance(p_event bigint, p_students uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_event  events;
  v_ids    uuid[];
  v_centre int;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select * into v_event from events where id = p_event for update;
  if not found then raise exception 'event_not_found'; end if;
  if v_event.cancelled_at is not null then raise exception 'event_cancelled'; end if;
  v_centre := coalesce(v_event.centre_id::int, person_centre(auth.uid()));
  if local_day(v_event.starts_at, v_centre) > centre_today(v_centre) then raise exception 'too_early'; end if;
  v_ids := array(select distinct x from unnest(coalesce(p_students, '{}')) x);
  if exists (select 1 from unnest(v_ids) x where not exists (select 1 from students s where s.id = x)) then
    raise exception 'student_invalid';
  end if;
  delete from event_attendance ea where ea.event_id = p_event and not (ea.student_id = any (v_ids));
  insert into event_attendance (event_id, student_id, marked_by)
  select p_event, x, auth.uid() from unnest(v_ids) x
  on conflict (event_id, student_id) do nothing;
  return cardinality(v_ids);
end $$;

-- 0022's events_polls_daily: "tomorrow" is the event's centre's (no centre: the first centre's).
create or replace function events_polls_daily() returns int
language plpgsql volatile set search_path = public as $$
declare
  v_row record;
  v_n   int := 0;
begin
  for v_row in
    select e.id, e.title, e.starts_at from events e
     where e.cancelled_at is null and e.reminded_at is null
       and local_day(e.starts_at, e.centre_id) = centre_today(e.centre_id) + 1
     for update
  loop
    v_n := v_n + queue_people_push(
      array(select r.profile_id from event_rsvps r where r.event_id = v_row.id and r.response in ('going', 'maybe')),
      'event_remind', v_row.title, 'events/' || v_row.id, v_row.starts_at);
    update events set reminded_at = now() where id = v_row.id;
  end loop;
  for v_row in
    select pl.* from polls pl
     where pl.closed_at is null and pl.closing_reminded_at is null
       and pl.closes_at > now() and pl.closes_at <= now() + interval '24 hours'
     for update
  loop
    v_n := v_n + queue_people_push(
      array(select x from audience_profiles(v_row.audience, v_row.audience_level, v_row.audience_group, v_row.created_by) x
             where not exists (select 1 from poll_votes v where v.poll_id = v_row.id and v.profile_id = x)),
      'poll_remind', v_row.question, 'polls/' || v_row.id, v_row.closes_at);
    update polls set closing_reminded_at = now() where id = v_row.id;
  end loop;
  return v_n;
end $$;

-- 0023's duty_daily: "tomorrow" is the shift's centre's; the date as that country writes it.
create or replace function duty_daily() returns int
language plpgsql volatile set search_path = public as $$
declare
  v_row record;
  v_n   int := 0;
begin
  for v_row in
    select a.shift_id, a.profile_id, s.starts_at, s.ends_at, s.duty, s.on_date, c.name as centre, c.country_code
      from duty_assignments a
      join duty_shifts s on s.id = a.shift_id
      join centres c on c.id = s.centre_id
     where s.on_date = centre_today(s.centre_id) + 1 and a.reminded_at is null
  loop
    if queue_team_push(array[v_row.profile_id], 'duty',
                       v_row.centre || ' · ' || to_char(v_row.on_date,
                         case when v_row.country_code = 'IN' then 'DD-MM-YYYY' else 'YYYY-MM-DD' end),
                       '/staff/duty',
                       to_char(v_row.starts_at, 'HH24:MI') || '-' || to_char(v_row.ends_at, 'HH24:MI')
                       || coalesce(', ' || v_row.duty, '')) > 0 then
      v_n := v_n + 1;
    end if;
    update duty_assignments set reminded_at = now() where shift_id = v_row.shift_id and profile_id = v_row.profile_id;
  end loop;
  return v_n;
end $$;

-- 0027's ig_subscriber_weeks: weeks (from Monday) in the Guru's zone.
create or replace function ig_subscriber_weeks(p_weeks int default 12)
returns table (week_start date, joins int)
language plpgsql stable security definer set search_path = public as $$
declare v_this date := date_trunc('week', today_ist())::date;
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  return query
    select w::date, (select count(*)::int from ig_subscribers s
                      where date_trunc('week', (s.joined_at at time zone my_time_zone()))::date = w::date)
      from generate_series(v_this - 7 * (least(greatest(coalesce(p_weeks, 12), 1), 104) - 1), v_this, interval '7 days') as w
     order by 1;
end $$;

-- ---------------------------------------------------------------- 4. fund: a currency per amount
-- ISO 4217 code of amount_paise ("minor units": paise for INR, cents for USD). Every entry so far
-- is in rupees. record_fund_entry does not take a currency yet (one fund, one currency, until the
-- team decides how a fund abroad works: docs/I18N.md); a reversal copies the entry it undoes.
alter table fund_entries add column if not exists currency text not null default 'INR'
  check (currency ~ '^[A-Z]{3}$');

create or replace function fund_entry_currency() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.reverses_id is not null then
    new.currency := (select e.currency from fund_entries e where e.id = new.reverses_id);
  end if;
  return new;
end $$;

drop trigger if exists fund_entries_currency on fund_entries;
create trigger fund_entries_currency before insert on fund_entries
  for each row execute function fund_entry_currency();

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14. The zone helpers are read-only and open to signed-in people, because the
-- security-invoker view and functions above (student_overview, check_out_all, the home screens,
-- class_report) call them with the caller's rights. The helpers that take another person's id stay
-- internal; anon gets nothing (0025).
revoke execute on function guard_centre_locale(), fund_entry_currency() from public, anon, authenticated;
revoke execute on function centre_country(int), person_centre(uuid), local_stamp(timestamptz, uuid, text),
  event_push_line(text, text, timestamptz, text, uuid)
  from public, anon, authenticated;
revoke execute on function centre_tz(int), my_time_zone(), my_centre_locale(), centre_today(int), local_day(timestamptz, int),
  today_ist()
  from public, anon;
grant execute on function centre_tz(int), my_time_zone(), my_centre_locale(), centre_today(int), local_day(timestamptz, int),
  today_ist()
  to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on column centres.time_zone is 'IANA time zone of the centre (default Asia/Kolkata): its "today", closing time and attendance days (0033, docs/I18N.md).';
comment on column centres.country_code is 'ISO 3166-1 alpha-2 country of the centre (default IN): date style in notices; the app''s region for formats (0033).';
comment on column fund_entries.currency is 'ISO 4217 code of the amount (default INR); amount_paise holds minor units of it. A reversal copies it (0033).';
comment on function centre_tz is 'IANA time zone of a centre; unknown or null = the first centre''s, else Asia/Kolkata (0033).';
comment on function centre_country is 'ISO 3166 country of a centre, like centre_tz (0033).';
comment on function person_centre is 'A login''s centre: the home centre of its student record, else profiles.centre_id (0033).';
comment on function my_centre_locale is 'The signed-in person''s centre''s time_zone and country_code, for the app''s date and number formats (0033).';
comment on function my_time_zone is 'The signed-in person''s centre''s time zone; pg_cron and the dashboard get the first centre''s (0033).';
comment on function centre_today is 'Today''s date at a centre, in its time zone (0033).';
comment on function local_day is 'The day a moment falls on at a centre, e.g. the attendance day of a check-in (0033).';
comment on function local_stamp is 'A moment written for a person''s notice in their zone: day-month-year in India, ISO 8601 elsewhere; 24-hour (0033).';
comment on function today_ist() is
  'Today at the caller''s centre (my_time_zone; pg_cron: the first centre). The name is from 0001, when it meant India. Use it, not current_date: the database clock runs on UTC (0033).';
comment on function week_start_ist is 'First day of "this week" at the caller''s centre: Monday (ISO 8601), or 6 days ago when settings.week_starts = rolling7 (docs/DECISIONS.md #47, 0033).';
comment on function close_open_visits is 'Hourly job (pg_cron mridanga-close-visits, at :30): closes visits left open, at their centre''s closing time, once that centre has been closed an hour (0033).';
comment on function refresh_student_statuses is
  'Daily job (00:30 UTC = 06:00 IST): as in 0030, with every "today" and visit day at the student''s home centre (0033, docs/DECISIONS.md #107).';
