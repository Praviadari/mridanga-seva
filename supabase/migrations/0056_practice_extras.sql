-- Mridanga Seva — 0056: practice extras (docs/DECISIONS.md #493-#495; docs/DATABASE.md "Practice extras (0056)").
-- Run after 0054 (and 0055 when it is there), in the Supabase SQL editor, TEST first. Needs 0001-0054. Safe to run
-- twice. Additive: two new columns that stay empty on every existing row, three new functions; no existing row,
-- table rule or function changes.
--
-- 1. "How did it go?" (#494): after a practice session the student may tap one of three faces (feeling 1 hard,
--    2 okay, 3 good) and say what they practised (practised: taal, lesson, free), saved with that practice entry.
--    Optional, one tap to skip: both stay null. Written only through set_practice_feeling() (the student, an own
--    entry of the last 14 days, as delete_practice); read as practice_logs is (the student, and staff: 0018).
--    New data about a child's practice (a self-rating): the privacy notice's "Learning" row names it (see NOTES).
-- 2. practice_history(student) (#493): every practice day ever with its minutes, and the student's weekly goal, for
--    the milestones on My progress and the staff Student profile. Security invoker: row-level security of 0018
--    decides (a student: own; staff: anyone's), as practice_days.
-- 3. staff_practice_week(weeks_ago) (#495): for follow-up calls, each student still in the class (not left, not
--    withdrawn) with that week's practice minutes and days, their goal, the last day they practised and how this
--    week's sessions went, least practice first. Staff only (not_allowed); security invoker, so it shows exactly the
--    students and practice row-level security gives the caller (staff: the whole class, as the Students tab). The
--    caller's own record (0053) is left out: nobody follows themselves up.

-- ---------------------------------------------------------------- 1. how did it go (#494)
alter table practice_logs add column if not exists feeling smallint;
alter table practice_logs add column if not exists practised text[];

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.practice_logs'::regclass and conname = 'practice_logs_feeling_check') then
    alter table practice_logs add constraint practice_logs_feeling_check check (feeling between 1 and 3);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.practice_logs'::regclass and conname = 'practice_logs_practised_check') then
    alter table practice_logs add constraint practice_logs_practised_check
      check (practised <@ array['taal', 'lesson', 'free']::text[] and cardinality(practised) between 1 and 3);
  end if;
end $$;

-- The signed-in student says how an own practice entry of the last 14 days went: p_feeling 1-3 or null, p_practised
-- any of taal / lesson / free (kept once each, in that order; none = null). Saying it again replaces it. Errors:
-- not_allowed (not the student's own entry, or no student), too_old, feeling_invalid, practised_invalid.
create or replace function set_practice_feeling(p_id bigint, p_feeling int, p_practised text[] default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_student uuid := my_student_id();
  v_row     practice_logs;
begin
  select * into v_row from practice_logs where id = p_id;
  if v_student is null or v_row.id is null or v_row.student_id <> v_student then
    raise exception 'not_allowed' using detail = 'Only the student says how their own practice went.';
  end if;
  if v_row.practised_on < today_ist() - 13 then
    raise exception 'too_old' using detail = 'Entries older than 14 days stay.';
  end if;
  if p_feeling is not null and p_feeling not between 1 and 3 then
    raise exception 'feeling_invalid' using detail = '1 hard, 2 okay, 3 good.';
  end if;
  if exists (select 1 from unnest(coalesce(p_practised, '{}')) x where x is null or x not in ('taal', 'lesson', 'free')) then
    raise exception 'practised_invalid' using detail = 'taal, lesson or free.';
  end if;
  update practice_logs
     set feeling = p_feeling,
         practised = nullif(array(select k from unnest(array['taal', 'lesson', 'free']) with ordinality as w(k, n)
                                   where k = any (coalesce(p_practised, '{}')) order by n), '{}')
   where id = p_id;
end $$;

-- ---------------------------------------------------------------- 2. practice_history (#493)
-- JSON {goal_days, goal_minutes, goal_own, days: [{on, minutes}]}: practice_days()'s goal, and every day with
-- practice, oldest first. A student asking about someone else gets no days and the default goal.
create or replace function practice_history(p_student uuid) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select (practice_days(p_student, 1) - 'days')
         || jsonb_build_object('days', coalesce((
              select jsonb_agg(jsonb_build_object('on', d.practised_on, 'minutes', d.minutes) order by d.practised_on)
                from (select p.practised_on, sum(p.minutes)::int as minutes
                        from practice_logs p
                       where p.student_id = p_student
                       group by p.practised_on) d), '[]'::jsonb))
$$;

-- ---------------------------------------------------------------- 3. staff_practice_week (#495)
-- The week from the Monday p_weeks_ago weeks before this one (0-8, India). Per student: minutes and days with
-- practice that week, the goal (own, else the level's, else 4 x 15), the last day with practice ever, and how many
-- of that week's entries were hard / okay / good. Least minutes first, then fewest days, then longest since practice.
create or replace function staff_practice_week(p_weeks_ago int default 0)
returns table (student_id uuid, roll_no text, full_name text, level_id smallint, status student_status, mentor_id uuid,
               week_start date, minutes int, days int, goal_days int, goal_minutes int, last_on date,
               hard int, okay int, good int)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_week date := date_trunc('week', today_ist()::timestamp)::date - 7 * least(greatest(coalesce(p_weeks_ago, 0), 0), 8);
begin
  if not coalesce(is_staff(), false) then
    raise exception 'not_allowed' using detail = 'Only coordinators and the Guru see the class''s practice.';
  end if;
  return query
  with wk as (
    select p.student_id as sid, sum(p.minutes)::int as minutes, count(distinct p.practised_on)::int as days,
           count(*) filter (where p.feeling = 1)::int as hard, count(*) filter (where p.feeling = 2)::int as okay,
           count(*) filter (where p.feeling = 3)::int as good
      from practice_logs p
     where p.practised_on >= v_week and p.practised_on < v_week + 7
     group by p.student_id
  ), lp as (
    select p.student_id as sid, max(p.practised_on) as last_on from practice_logs p group by p.student_id
  )
  select s.id, s.roll_no, s.full_name, s.level_id, s.status, s.mentor_id, v_week,
         coalesce(w.minutes, 0), coalesce(w.days, 0),
         coalesce(g.goal_days, pp.goal_days, 4)::int, coalesce(g.goal_minutes, pp.goal_minutes, 15)::int,
         l.last_on, coalesce(w.hard, 0), coalesce(w.okay, 0), coalesce(w.good, 0)
    from students s
    left join wk w on w.sid = s.id
    left join lp l on l.sid = s.id
    left join practice_goals g on g.student_id = s.id
    left join practice_plans pp on pp.level_id = s.level_id
   where s.status <> 'left' and s.withdrawn_at is null and s.profile_id is distinct from auth.uid()
   order by coalesce(w.minutes, 0), coalesce(w.days, 0), l.last_on nulls first, s.full_name, s.id;
end $$;

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14.
revoke execute on function set_practice_feeling(bigint, int, text[]), practice_history(uuid), staff_practice_week(int)
  from public, anon, authenticated;
grant execute on function set_practice_feeling(bigint, int, text[]), practice_history(uuid), staff_practice_week(int)
  to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on column practice_logs.feeling is 'How the session went, said by the student after it (#494): 1 hard, 2 okay, 3 good; null = not said. Only set_practice_feeling (0056).';
comment on column practice_logs.practised is 'What the student practised in the session (#494): taal, lesson and/or free; null = not said. Only set_practice_feeling (0056).';
comment on function set_practice_feeling(bigint, int, text[]) is 'S5/S6, student: says how an own practice entry of the last 14 days went (feeling 1-3, practised taal/lesson/free), or clears it with nulls (0056, #494).';
comment on function practice_history(uuid) is 'S4/C8 milestones: every practice day ever with minutes (oldest first) and the weekly goal, as the person asking may see them (security invoker; 0056, #493).';
comment on function staff_practice_week(int) is 'Staff: practice this week (or 1-8 weeks ago) per student still in the class, least first, with goal, last practice day and how the sessions went; for follow-up calls. Staff only, security invoker (0056, #495).';
