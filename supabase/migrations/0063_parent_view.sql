-- Mridanga Seva — 0063: a read-only parent page, opened from the weekly email (docs/DECISIONS.md #640-#649;
-- docs/DATABASE.md "Parent page (0063)"; docs/OPERATIONS.md "Weekly email to parents" → "The parent page").
-- Run once after 0058 (it reuses the weekly email's consent and checks), in the Supabase SQL editor (TEST first),
-- then deploy the Edge Function notify-parents from the same commit. Safe to run twice.
--
-- No parent login and no new personal data (#641): the weekly email carries a link, signed by notify-parents and
-- good for 14 days, that names one guardian row; the page asks notify-parents, which checks the signature and
-- runs parent_view() with the service role. Nothing is open to anon or to signed-in people except the staff's
-- switch and numbers.
--
-- 1. Setting parent_view_enabled (false), changed only by set_parent_view (the Guru; audit log, #646).
-- 2. parent_view(guardian): one child's page, only while that parent may get the weekly email (the parent's
--    written yes, a current data consent, an active minor, not withdrawn: parent_digest_block, #643); else
--    'not_available', never why. What it shows (#644): the level and the syllabus of that level (done of all, the
--    next items), items learnt in the last 8 weeks, visits per week for 8 weeks and the last 5 visits (day and
--    times), practice per week for 4 weeks against the goal and the current run of days, the coming events (31
--    days) and the announcements addressed to the child (30 days; text only). Never a location, a photo, a mark,
--    a remark, a call note, an event's place text or anything about another child. Each opening is in the access
--    log (function parent_view, no reader: the Guru sees it on the audit log's Reads, #645).
-- 3. stop_parent_view(guardian): the page's own "Stop" — the same as the weekly email's Unsubscribe
--    (stop_parent_digests), so the yes, the emails and the page end together (#647).
-- 4. parent_view_on() for notify-parents (does the email carry the link); parent_view_overview() for staff.

-- ---------------------------------------------------------------- 1. the switch
insert into settings (key, value) values ('parent_view_enabled', 'false') on conflict (key) do nothing;

-- Whether the weekly email carries the link (notify-parents, service role).
create or replace function parent_view_on() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(setting_flag('parent_view_enabled'), false)
$$;

-- ---------------------------------------------------------------- 2. the page
-- One child's page for one guardian row (the link names it). 'switched_off' while the Guru has it off;
-- 'not_available' for an unknown guardian or whenever the weekly email's own check (parent_digest_block, ignoring
-- the weekly email's switch) says this parent may not get it: no reason is given, so a forwarded or old link
-- learns nothing. Otherwise result 'ok' and the content (#644). Logs the opening (access_log).
create or replace function parent_view(p_guardian uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  g        guardians;
  s        students;
  v_tz     text;
  v_centre text;
  v_today  date;
  v_week   date;
  v_goal_d int;
  v_goal_m int;
  v_streak int;
  v_out    jsonb;
begin
  if not coalesce(setting_flag('parent_view_enabled'), false) then
    return jsonb_build_object('result', 'switched_off');
  end if;
  select * into g from guardians where id = p_guardian;
  if not found or parent_digest_block(g.student_id, g.id, true) is not null then
    return jsonb_build_object('result', 'not_available');
  end if;
  select * into s from students where id = g.student_id;
  select coalesce(c.time_zone, 'Asia/Kolkata'), c.name into v_tz, v_centre from centres c where c.id = s.home_centre_id;
  v_tz := coalesce(v_tz, 'Asia/Kolkata');
  v_today := (now() at time zone v_tz)::date;
  v_week := date_trunc('week', v_today::timestamp)::date;

  select coalesce(pg.goal_days, pp.goal_days, 4), coalesce(pg.goal_minutes, pp.goal_minutes, 15) into v_goal_d, v_goal_m
    from (select 1) one
    left join practice_goals pg on pg.student_id = s.id
    left join practice_plans pp on pp.level_id = s.level_id;

  -- The run of days with practice that ends today, or yesterday when today has none yet.
  with d as (select distinct pl.practised_on from practice_logs pl
              where pl.student_id = s.id and pl.practised_on between v_today - 400 and v_today),
       a as (select case when exists (select 1 from d where practised_on = v_today) then v_today else v_today - 1 end as anchor),
       r as (select d.practised_on, row_number() over (order by d.practised_on desc) as n from d, a where d.practised_on <= a.anchor)
  select count(*)::int into v_streak from r, a where r.practised_on = a.anchor - (r.n - 1)::int;

  v_out := jsonb_build_object(
    'result', 'ok',
    'student_name', s.full_name,
    'language', coalesce(g.notice_language, (select pr.language from profiles pr where pr.id = s.profile_id), 'en'),
    'contact', coalesce((select st.value #>> '{}' from settings st where st.key = 'parent_notice_contact'), ''),
    'centre', coalesce(v_centre, ''),
    'today', v_today,
    'level', s.level_id,
    'level_name', (select l.name from levels l where l.id = s.level_id),
    -- The syllabus of the child's level (items not retired): how many are done, and the next three in order.
    'syllabus', jsonb_build_object(
      'done', (select count(*)::int from syllabus_items si join student_progress sp on sp.item_id = si.id and sp.student_id = s.id
                where si.level_id = s.level_id and si.retired_at is null),
      'total', (select count(*)::int from syllabus_items si where si.level_id = s.level_id and si.retired_at is null),
      'next', coalesce((select jsonb_agg(x.title order by x.sort) from (
                 select si.title, si.sort from syllabus_items si
                  where si.level_id = s.level_id and si.retired_at is null
                    and not exists (select 1 from student_progress sp where sp.item_id = si.id and sp.student_id = s.id)
                  order by si.sort limit 3) x), '[]')),
    -- Items ticked in the last 8 weeks, newest first (title and day; never the remark).
    'learnt', coalesce((select jsonb_agg(jsonb_build_object('title', x.title, 'on', x.done_on) order by x.done_on desc, x.n) from (
                 select si.title, sp.done_on, row_number() over (order by sp.done_on desc, si.level_id, si.sort) as n
                   from student_progress sp join syllabus_items si on si.id = sp.item_id
                  where sp.student_id = s.id and sp.done_on > v_today - 56) x where x.n <= 10), '[]'),
    'level_changes', coalesce((select jsonb_agg(jsonb_build_object('on', h.changed_on, 'from', h.from_level, 'to', h.to_level,
                                                                   'to_name', lt.name) order by h.changed_on desc, h.id desc)
                 from level_history h join levels lt on lt.id = h.to_level
                where h.student_id = s.id and h.changed_on > v_today - 365), '[]'),
    -- Visits per week (Monday, the centre's day) for this week and the 7 before, and the last 5 visits.
    'attendance', jsonb_build_object(
      'weeks', (select jsonb_agg(jsonb_build_object('week', w.week, 'visits', (
                   select count(*)::int from visits vi left join centres c on c.id = vi.centre_id
                    where vi.student_id = s.id
                      and (vi.check_in at time zone coalesce(c.time_zone, v_tz))::date between w.week and w.week + 6)) order by w.week)
                  from (select (v_week - 7 * k)::date as week from generate_series(0, 7) k) w),
      'recent', coalesce((select jsonb_agg(jsonb_build_object('on', x.on_day, 'in', x.t_in, 'out', x.t_out) order by x.check_in desc) from (
                   select vi.check_in,
                          to_char(vi.check_in at time zone coalesce(c.time_zone, v_tz), 'YYYY-MM-DD') as on_day,
                          to_char(vi.check_in at time zone coalesce(c.time_zone, v_tz), 'HH24:MI') as t_in,
                          to_char(vi.check_out at time zone coalesce(c.time_zone, v_tz), 'HH24:MI') as t_out
                     from visits vi left join centres c on c.id = vi.centre_id
                    where vi.student_id = s.id
                    order by vi.check_in desc limit 5) x), '[]')),
    -- Practice per week for this week and the 3 before, against the goal (as the weekly email), and the run of days.
    'practice', jsonb_build_object(
      'goal_days', v_goal_d, 'goal_minutes', v_goal_m, 'streak', coalesce(v_streak, 0),
      'weeks', (select jsonb_agg(jsonb_build_object('week', z.week, 'minutes', z.minutes, 'days', z.days, 'days_met', z.days_met)
                                 order by z.week) from (
                  select w.week, coalesce(sum(d.minutes), 0)::int as minutes, count(d.practised_on)::int as days,
                         (count(d.practised_on) filter (where d.minutes >= v_goal_m))::int as days_met
                    from (select (v_week - 7 * k)::date as week from generate_series(0, 3) k) w
                    left join (select pl.practised_on, sum(pl.minutes)::int as minutes from practice_logs pl
                                where pl.student_id = s.id and pl.practised_on between v_week - 21 and v_week + 6
                                group by pl.practised_on) d on d.practised_on between w.week and w.week + 6
                   group by w.week) z)),
    -- Events for the child in the coming 31 days (title, day, time, centre; never the place text), at most 5.
    'events', coalesce((select jsonb_agg(jsonb_build_object('title', x.title, 'on', x.on_day, 'at', x.at_time, 'centre', x.centre)
                                         order by x.starts_at, x.id) from (
                 select e.id, e.starts_at, e.title,
                        to_char(e.starts_at at time zone coalesce(c.time_zone, v_tz), 'YYYY-MM-DD') as on_day,
                        to_char(e.starts_at at time zone coalesce(c.time_zone, v_tz), 'HH24:MI') as at_time,
                        c.name as centre
                   from events e left join centres c on c.id = e.centre_id
                  where e.cancelled_at is null and e.starts_at > now() and e.starts_at < now() + interval '31 days'
                    and s.id in (select audience_students(e.audience, e.audience_level, e.audience_group, e.created_by))
                  order by e.starts_at, e.id limit 5) x), '[]'),
    -- Announcements addressed to the child, published in the last 30 days, newest first, at most 5: the title and
    -- the text (at most 1000 characters), never a file or a reply.
    'announcements', coalesce((select jsonb_agg(jsonb_build_object('title', x.title, 'body', x.body, 'on', x.on_day) order by x.publish_at desc, x.id desc) from (
                 select a.id, a.publish_at, a.title, left(a.body, 1000) as body,
                        to_char(a.publish_at at time zone v_tz, 'YYYY-MM-DD') as on_day
                   from announcements a
                  where a.publish_at <= now() and a.publish_at > now() - interval '30 days'
                    and s.id in (select audience_students(a.audience, a.audience_level, a.audience_group, a.created_by))
                  order by a.publish_at desc, a.id desc limit 5) x), '[]'));
  perform log_access('parent_view', s.id, 1);
  return v_out;
end $$;

-- ---------------------------------------------------------------- 3. the page's Stop
-- The parent stops the weekly email, and with it this page, from the page (the link's signature is checked by
-- notify-parents first). The same as the email's one-click Unsubscribe: every 'digest' yes of this address is
-- revoked (kept, with the time) and waiting emails end as stopped. Returns false for an unknown id.
create or replace function stop_parent_view(p_guardian uuid) returns boolean
language sql volatile security definer set search_path = public, pg_temp as $$
  select stop_parent_digests(p_guardian)
$$;

-- ---------------------------------------------------------------- 4. for staff
-- The parent page at a glance (staff; the screen "Weekly email to parents"): on or off, and how often it was
-- opened, and for how many children, in the last 7 and 30 days (from the access log; no names).
create or replace function parent_view_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not coalesce(is_staff(), false) then raise exception 'not_allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'enabled', coalesce(setting_flag('parent_view_enabled'), false),
    'link_days', 14,
    'opened_7', (select count(*)::int from access_log where function_name = 'parent_view' and at > now() - interval '7 days'),
    'opened_30', (select count(*)::int from access_log where function_name = 'parent_view' and at > now() - interval '30 days'),
    'children_30', (select count(distinct student_id)::int from access_log
                     where function_name = 'parent_view' and at > now() - interval '30 days'));
end $$;

-- The Guru switches the parent page on or off (audit log through audit_setting, 0014). Off: every link stops
-- working at once and the next weekly emails carry none. Returns the overview. Errors: not_allowed.
create or replace function set_parent_view(p_on boolean) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if not coalesce(is_guru(), false) or p_on is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  update settings set value = to_jsonb(p_on) where key = 'parent_view_enabled' and value is distinct from to_jsonb(p_on);
  return parent_view_overview();
end $$;

-- ---------------------------------------------------------------- who may run the new functions
-- docs/DECISIONS.md #14: the page's functions for the Edge Function (service role) only, never anon (#642); the
-- staff functions check the role inside.
revoke execute on function parent_view_on(), parent_view(uuid), stop_parent_view(uuid), parent_view_overview(),
  set_parent_view(boolean) from public, anon, authenticated, service_role;
grant execute on function parent_view_on(), parent_view(uuid), stop_parent_view(uuid) to service_role;
grant execute on function parent_view_overview(), set_parent_view(boolean) to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on function parent_view_on() is 'Internal (notify-parents): whether the weekly parent email carries the link to the parent page (0063).';
comment on function parent_view(uuid) is 'The parent page of one guardian row (notify-parents, after checking the link''s signature): switched_off, not_available (no reason given), or one child''s level, syllabus, visits, practice, events and announcements. Logged in access_log (0063, docs/DECISIONS.md #640-#649).';
comment on function stop_parent_view(uuid) is 'The parent page''s Stop: as the weekly email''s Unsubscribe (stop_parent_digests) (0063).';
comment on function parent_view_overview() is 'Staff: the parent page on or off, link life in days, openings in 7 and 30 days and children in 30 days (0063).';
comment on function set_parent_view(boolean) is 'The Guru switches the parent page on or off (audit log); returns the overview (0063).';
