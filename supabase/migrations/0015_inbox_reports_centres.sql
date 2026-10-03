-- Mridanga Seva — 0015: the notifications inbox (A2), the reports (C21 coordinator, G8 Guru) and
-- the centres with their attendance area (G9).
-- Run once, after 0014_guru_admin.sql, in the Supabase SQL editor. It does not touch the tables of
-- 0012 (assessments) or of the Phase 2 promotion migration, and changes none of 0014's objects.
-- Why: docs/DECISIONS.md #49-#51. How: docs/DATABASE.md "Notifications inbox", "Reports" and
-- "Centres".
--
-- 1. notifications: one row per person per notice they were sent, filled by the database, so a
--    person without push (the web version, an iPhone, a phone that said no) has the same inbox as
--    an Android phone. Announcements fill it now (trigger on announcements); Phase 2's assessment
--    and promotion notices can add rows of their own kind later. Opening an announcement marks its
--    notice read; "mark all read" marks the notices only, never an announcement as seen.
-- 2. class_report: the numbers of C21 (a coordinator: their mentees) and G8 (the Guru: everyone,
--    or one coordinator's mentees) for a date range, counted like the home screens.
-- 3. centres: an address, and checks for the name, the GPS point and the radius of the attendance
--    area. The phone does not check the area yet: that needs expo-location, a native package, in
--    the next planned APK. A centre is switched off, never deleted from the app; the last centre
--    in use cannot be switched off.

-- ---------------------------------------------------------------- 1. notifications inbox
create table notifications (
  id               bigint generated always as identity primary key,
  profile_id       uuid not null references profiles (id) on delete cascade,
  kind             text not null check (kind in ('announcement', 'assessment', 'promotion', 'notice')),
  title            text not null,
  body             text not null default '',
  url              text not null,
  announcement_id  bigint references announcements (id) on delete cascade,
  visible_at       timestamptz not null default now(),
  read_at          timestamptz,
  created_at       timestamptz not null default now(),
  unique (profile_id, announcement_id)
);
create index notifications_inbox_idx on notifications (profile_id, visible_at desc);
create index notifications_unread_idx on notifications (profile_id) where read_at is null;

-- A person reads only their own notices, and only once they are due (a scheduled announcement's
-- notice waits for its publish time). Nobody writes them from the app: the triggers below and
-- mark_notifications_read do.
alter table notifications enable row level security;
create policy own_due on notifications for select to authenticated
  using (profile_id = auth.uid() and visible_at <= now());
revoke all on notifications from public, anon, authenticated;
grant select on notifications to authenticated;

-- Brings the notices of one announcement in line with whom it is addressed to now
-- (announcement_audience, 0007: never the author, only people who can open it): adds the missing
-- people, takes away those no longer addressed, and copies the title, the start of the text and
-- the publish time. The screen to open is the one the push opens (notify-announcements,
-- messages.ts screenFor): staff and students have different announcement screens.
-- Security definer: it writes other people's rows and reads the audience as the owner.
create or replace function inbox_sync_announcement(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  a announcements;
begin
  select * into a from announcements where id = p_id;
  if not found then return; end if;

  delete from notifications n
   where n.announcement_id = a.id
     and not exists (select 1 from announcement_audience aa
                      where aa.announcement_id = a.id and aa.profile_id = n.profile_id);

  insert into notifications (profile_id, kind, title, body, url, announcement_id, visible_at, read_at)
  select aa.profile_id, 'announcement', a.title, left(a.body, 300),
         case when aa.role in ('guru', 'coordinator') then '/staff/announcements/' else '/student/announcements/' end || a.id,
         a.id, a.publish_at, aa.read_at
    from announcement_audience aa
   where aa.announcement_id = a.id
  on conflict (profile_id, announcement_id) do update
     set title = excluded.title, body = excluded.body, url = excluded.url, visible_at = excluded.visible_at;
end $$;

-- A new announcement, or a change to its title, text, audience or publish time, updates the
-- notices. The Edge Function setting notified_at changes none of these and costs nothing.
-- A student who joins a level or group later does not get earlier notices (S10 still lists them).
create or replace function inbox_on_announcement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT'
     or (new.title, new.body, new.audience, new.audience_level, new.audience_group, new.publish_at)
        is distinct from (old.title, old.body, old.audience, old.audience_level, old.audience_group, old.publish_at) then
    perform inbox_sync_announcement(new.id);
  end if;
  return null;
end $$;

create trigger announcements_inbox after insert or update on announcements
  for each row execute function inbox_on_announcement();

-- Opening an announcement (S10, C15, from the inbox or a push) marks its notice read.
create or replace function inbox_on_read() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update notifications
     set read_at = new.read_at
   where announcement_id = new.announcement_id and profile_id = new.profile_id and read_at is null;
  return null;
end $$;

create trigger announcement_reads_inbox after insert on announcement_reads
  for each row execute function inbox_on_read();

-- A2: marks the signed-in person's notices read: the given ones, or all of them when p_ids is
-- null ("Mark all read"). Only notices already due. It does not mark an announcement as seen:
-- "seen by" (C15) counts people who opened it. Returns how many changed.
-- Error code: not_allowed (no role yet, or switched off).
create or replace function mark_notifications_read(p_ids bigint[] default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if coalesce(my_role() in ('guru', 'coordinator', 'student'), false) = false then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update notifications
     set read_at = now()
   where profile_id = auth.uid() and read_at is null and visible_at <= now()
     and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end $$;

-- The number on the bell of the home header: the signed-in person's unread notices that are due.
create or replace function inbox_unread_count() returns int
language sql stable security invoker set search_path = public as $$
  select count(*)::int from notifications
   where profile_id = auth.uid() and read_at is null and visible_at <= now()
$$;

-- Daily: notices older than a year go (the announcements themselves stay in S10 and C15).
create or replace function inbox_cleanup() returns void
language sql volatile set search_path = public as $$
  delete from notifications where visible_at < now() - interval '1 year'
$$;
select cron.schedule('mridanga-inbox-cleanup', '0 1 * * *', 'select inbox_cleanup()');

-- The inbox starts with the announcements of the last 30 days and the scheduled ones, read where
-- the person has opened them already.
do $$
declare r record;
begin
  for r in select id from announcements where publish_at > now() - interval '30 days' loop
    perform inbox_sync_announcement(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------- 2. reports
-- C21 (a coordinator) and G8 (the Guru) for the days p_from to p_to (India time, both included,
-- at most 367 days). A coordinator gets their mentees only; the Guru gets everyone, or the mentees
-- of p_mentor. Counted the same way as the home screens: a visit is a check-in; "this week" in
-- the weekly rows follows settings.week_starts (from Monday, or blocks of 7 days ending on p_to);
-- statuses and days away come from student_overview (0014); syllabus progress counts the items in
-- use at the student's current level (as S1, 0013); calls due are open tasks due by today or
-- handed to the Guru (as C1 and C10). Left students count in the statuses and in the student rows,
-- not in a level's progress.
-- Returns one JSON object: range, scope, statuses now, new joiners and Left in the range, visits
-- (totals, per week, per month), calls (done in the range by outcome; due, handed to the Guru and
-- planned now), progress per level, and one row per student for the table and the CSV file.
-- Error codes: not_allowed, range_invalid, range_too_long.
-- Security invoker: row-level security applies (staff read these tables).
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
           coalesce(extract(epoch from (vi.check_out - vi.check_in)) / 3600.0, 0) as hours
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
                      'hours', (select coalesce(round(sum(v.hours)::numeric, 1), 0) from v where v.student_id = sc.id),
                      'calls', (select count(*) from calls c where c.student_id = sc.id),
                      'syllabus_done', pr.done, 'syllabus_total', pr.total)
                    order by sc.full_name, sc.roll_no), '[]'::jsonb)
               from scope sc join prog pr on pr.id = sc.id))
    into v_out;
  return v_out;
end $$;

-- ---------------------------------------------------------------- 3. centres
alter table centres add column address text;

-- Checks a centre however it is written (the Guru's policy guru_write, 0001, decides who may).
-- Error codes (src/data/centres.ts):
--   centre_name_required, centre_name_too_long (60), centre_name_taken (same name, any case)
--   address_too_long (300)
--   location_incomplete   latitude and longitude come together, or neither
--   location_invalid      outside -90..90 / -180..180, or 0, 0
--   radius_invalid        25 to 2000 metres
--   last_centre           the last centre in use cannot be switched off
--   centre_delete_not_allowed  the app switches a centre off instead (visits and people point to it)
-- The open window is checked by centres_guard (0014).
create or replace function guard_centre_details() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if current_user in ('anon', 'authenticated') then
      raise exception 'centre_delete_not_allowed' using detail = 'Switch the centre off instead.';
    end if;
    return old;
  end if;

  new.name := btrim(regexp_replace(coalesce(new.name, ''), '\s+', ' ', 'g'));
  if new.name = '' then raise exception 'centre_name_required'; end if;
  if char_length(new.name) > 60 then raise exception 'centre_name_too_long'; end if;
  if exists (select 1 from centres c where lower(c.name) = lower(new.name) and c.id is distinct from new.id) then
    raise exception 'centre_name_taken';
  end if;

  new.address := nullif(btrim(new.address, E' \t\r\n'), '');
  if char_length(new.address) > 300 then raise exception 'address_too_long'; end if;

  if (new.lat is null) <> (new.lng is null) then raise exception 'location_incomplete'; end if;
  if new.lat is not null then
    if new.lat not between -90 and 90 or new.lng not between -180 and 180 or (new.lat = 0 and new.lng = 0) then
      raise exception 'location_invalid';
    end if;
    -- Six decimals = about 10 cm: more is noise from a pasted link.
    new.lat := round(new.lat::numeric, 6);
    new.lng := round(new.lng::numeric, 6);
  end if;
  if new.radius_m is null or new.radius_m not between 25 and 2000 then
    raise exception 'radius_invalid' using detail = 'The attendance area is 25 to 2000 metres around the point.';
  end if;

  if tg_op = 'UPDATE' and old.active and not new.active
     and not exists (select 1 from centres c where c.active and c.id <> new.id) then
    raise exception 'last_centre' using detail = 'At least one centre stays in use.';
  end if;
  return new;
end $$;

create trigger centres_details_guard before insert or update or delete on centres
  for each row execute function guard_centre_details();

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14: trigger functions and the daily job are internal; the app's functions
-- check the role inside and are granted to signed-in people.
revoke execute on function inbox_sync_announcement(bigint), inbox_on_announcement(), inbox_on_read(),
  inbox_cleanup(), guard_centre_details() from public, anon, authenticated;
revoke execute on function mark_notifications_read(bigint[]), inbox_unread_count(), class_report(date, date, uuid)
  from public, anon, authenticated;
grant execute on function mark_notifications_read(bigint[]), inbox_unread_count(), class_report(date, date, uuid)
  to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on table notifications is 'A2 inbox: one row per person per notice they were sent (announcements now; Phase 2 assessment and promotion notices later). Filled by the database, read by the person only when due (docs/DECISIONS.md #49).';
comment on column notifications.kind is 'announcement now; assessment, promotion or notice for Phase 2.';
comment on column notifications.url is 'The app screen the notice opens, the same one a push opens, e.g. /student/announcements/12.';
comment on column notifications.announcement_id is 'The announcement this notice is about; the notice goes when the announcement is deleted.';
comment on column notifications.visible_at is 'When the person sees it: the publish time of a scheduled announcement.';
comment on column notifications.read_at is 'When the person opened it or marked it read. Empty = unread.';
comment on function inbox_sync_announcement is 'Brings the inbox rows of one announcement in line with announcement_audience: adds, removes, copies title, text and time.';
comment on function inbox_on_announcement is 'Trigger: a new announcement, or a change to its title, text, audience or time, updates the inbox.';
comment on function inbox_on_read is 'Trigger: opening an announcement marks its notice read.';
comment on function mark_notifications_read is 'A2: marks the signed-in person''s due notices read (the given ids, or all when null); not the announcements as seen.';
comment on function inbox_unread_count is 'A2: the signed-in person''s unread notices that are due (the number on the home header''s bell).';
comment on function inbox_cleanup is 'Daily (pg_cron mridanga-inbox-cleanup, 06:30 IST): deletes notices older than a year.';
comment on function class_report is 'C21 / G8 reports for a date range: statuses, new joiners, Left, visits per week and month, calls, progress per level, one row per student. A coordinator gets their mentees; the Guru everyone or one coordinator''s mentees (docs/DECISIONS.md #50).';
comment on column centres.address is 'G9: the centre''s address as people use it, up to 300 characters.';
comment on column centres.radius_m is 'G9: the attendance area, in metres around lat/lng (25-2000). Checked on phones from the app version with expo-location (next planned APK).';
comment on function guard_centre_details is 'Trigger: centre name, address, GPS point and radius are checked; the last centre in use stays on; the app never deletes a centre (docs/DECISIONS.md #51).';
