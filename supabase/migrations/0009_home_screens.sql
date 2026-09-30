-- Mridanga Seva — 0009: the numbers on the three home screens (S1 student home, C1 coordinator
-- dashboard, G1 Guru dashboard).
-- Run once, after 0008_announcement_follow_ups.sql, in the Supabase SQL editor.
-- Why: docs/DECISIONS.md #31. How: docs/DATABASE.md "Home screens".
--
-- Each home screen gets one function that returns every number it shows as one small JSON
-- object, so the screen opens with one request and the phone never downloads every student and
-- visit just to count them. The functions are security invoker (Postgres's default, written out
-- here so nobody changes it by accident): they read the tables as the person asking, so
-- row-level security decides what they count, as it does for the views (docs/DECISIONS.md #20).
-- They only read; nothing is written.
--
-- Words used below, the same on every screen:
--   this week   Monday to today, India time (week_start_ist)
--   new joiner  joined in the last settings.new_joiner_weeks weeks (4), and not Left
--   in class    every student who is not Left
--   overdue     an open follow-up task whose due date has passed; "escalated" = handed to the Guru

-- ---------------------------------------------------------------- this week
-- One definition of "this week" for every screen. isodow: Monday = 1 ... Sunday = 7.
create or replace function week_start_ist() returns date
language sql stable set search_path = public as $$
  select today_ist() - (extract(isodow from today_ist())::int - 1)
$$;

-- ---------------------------------------------------------------- S1 student home
-- The signed-in student's own numbers. Row-level security lets a student read only their own
-- students, visits and student_progress rows, so the where clause is a convenience, not the
-- guard. Returns null when the login is not linked to a student record.
create or replace function student_home()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'full_name',        o.full_name,
    'roll_no',          o.roll_no,
    'level_id',         o.level_id,
    'status',           o.status,
    'joined_on',        o.joined_on,
    -- Same meaning as in student_overview (0005): days since the last visit, or since joining.
    'last_visit_at',    o.last_visit_at,
    'days_since_visit', o.days_since_visit,
    'here_now',         o.here_now,
    'visits_this_week', (select count(*) from visits v
                          where v.student_id = o.id
                            and v.check_in >= week_start_ist()::timestamp at time zone 'Asia/Kolkata'),
    -- Progress on the student's current level only; earlier levels are done by definition.
    'syllabus_done',    (select count(*) from student_progress p
                           join syllabus_items i on i.id = p.item_id
                          where p.student_id = o.id and i.level_id = o.level_id),
    'syllabus_total',   (select count(*) from syllabus_items i where i.level_id = o.level_id))
  from students s
  join student_overview o on o.id = s.id
  where s.profile_id = auth.uid()
$$;

-- ---------------------------------------------------------------- C1 coordinator dashboard
-- Staff only. "Mine" follows the follow-up queue (C10, isMine in app/src/data/follow-up.ts): the
-- task is assigned to me, or I am the student's mentor. "Due" = due today or earlier, or already
-- handed to the Guru, i.e. the "needs the Guru" and "call due" groups of C10.
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
    -- Same as C5: check-ins since midnight in India, including students who have left again.
    'visits_today',     (select count(*) from visits
                          where check_in >= today::timestamp at time zone 'Asia/Kolkata'),
    'my_calls_due',     (select count(distinct t.student_id)
                           from follow_up_tasks t
                           join students s on s.id = t.student_id
                          where t.done_at is null
                            and (t.due_on <= today or t.escalated)
                            and (t.assignee_id = auth.uid() or s.mentor_id = auth.uid())),
    'new_joiner_weeks', joiner_days / 7,
    'new_joiner_count', (select count(*) from students
                          where joined_on > today - joiner_days and status <> 'left'),
    -- The newest 50 at most; a class rarely gets more in four weeks, and the list is a greeting
    -- aid, not a report.
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

-- ---------------------------------------------------------------- G1 Guru dashboard
-- Guru only: the whole class at a glance.
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
    -- Students, not visits: one student coming three times counts once.
    'came_this_week',   (select count(distinct student_id) from visits
                          where check_in >= week_start_ist()::timestamp at time zone 'Asia/Kolkata'),
    'in_class',         (select count(*) from students where status <> 'left'),
    'new_joiner_weeks', joiner_days / 7,
    'new_joiners',      (select count(*) from students
                          where joined_on > today - joiner_days and status <> 'left'),
    -- Every level, also one with nobody in it; Left students are no longer in a level's class.
    'by_level',         (select coalesce(jsonb_agg(jsonb_build_object(
                                  'level_id', x.id, 'name', x.name, 'students', x.n) order by x.sort), '[]'::jsonb)
                           from (select l.id, l.name, l.sort, count(s.id) as n
                                   from levels l
                                   left join students s on s.level_id = l.id and s.status <> 'left'
                                  group by l.id, l.name, l.sort) x),
    -- Every status in the order of the student_status type (new ... left), also those at 0.
    'by_status',        (select jsonb_agg(jsonb_build_object('status', x.st, 'students', x.n) order by x.st)
                           from (select st, count(s.id) as n
                                   from unnest(enum_range(null::student_status)) as st
                                   left join students s on s.status = st
                                  group by st) x),
    -- Per person the task is assigned to (the mentor when the task was made); no assignee =
    -- the student had no mentor. Counts students, not tasks. Only people with something open.
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

-- ---------------------------------------------------------------- who may run them
-- docs/DECISIONS.md #14. Signed-in people only; each dashboard checks the role inside, and
-- row-level security limits what student_home counts. week_start_ist is granted too, because
-- security-invoker functions call it with the caller's rights.
revoke execute on function week_start_ist(), student_home(), coordinator_dashboard(), guru_dashboard()
  from public, anon, authenticated;
grant execute on function week_start_ist(), student_home(), coordinator_dashboard(), guru_dashboard()
  to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on function week_start_ist is 'Monday of this week in India: the start of "this week" on every home screen (docs/DECISIONS.md #31).';
comment on function student_home is 'S1 student home: the signed-in student''s visits this week, last visit, level and syllabus progress, as one JSON object; null when the login has no student record. Security invoker (docs/DECISIONS.md #31).';
comment on function coordinator_dashboard is 'C1 coordinator dashboard: here now, visits today, calls due for my students, new joiners, as one JSON object. Staff only; security invoker (docs/DECISIONS.md #31).';
comment on function guru_dashboard is 'G1 Guru dashboard: came this week, in class, new joiners, students per level and status, overdue and escalated follow-ups per coordinator, as one JSON object. Guru only; security invoker (docs/DECISIONS.md #31).';
