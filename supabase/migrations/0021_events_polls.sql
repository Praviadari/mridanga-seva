-- Mridanga Seva — 0021: events and polls (Phase 2, slice 5: screens C16, C17, S11, S12).
-- Run once, after 0020_media.sql, in the Supabase SQL editor.
-- Why: docs/DECISIONS.md #57. How: docs/DATABASE.md "Events and polls".
--
-- Events (C16, S11):
-- 1. A coordinator or the Guru creates an event: title, start (and end), a centre or a place, who it
--    is for (the announcement audiences: all students, a level, the author's mentees, staff, a
--    group), a description. Everyone it is for gets a notice (push + inbox). Changing the time or
--    place tells them again; cancelling (with a reason) tells them it is off.
-- 2. Each of them answers Going / Maybe / Not going until it starts: rsvp_event(). Students see
--    the counts; staff see the names (event_people_list) and can remind those who have not
--    answered (remind_event, once in 12 hours). The day before, at 09:00 IST, those going or
--    maybe get a reminder (events_polls_daily).
-- 3. Staff pick performers with a part (set_event_performers: they get a notice) and, from the
--    event day on, tick who came (mark_event_attendance). Both are student records, so students
--    without the app count too.
-- Polls (C17, S12):
-- 4. Staff create a poll: a question, 2 to 6 answers, one choice each, who it is for, a closing
--    time, anonymous or not, and whether results show after voting or only after closing.
-- 5. Each person it is for votes once and may change the vote until it closes: vote_poll().
--    Results follow the poll's rule (poll_state). Staff see who has voted (poll_voters); in an
--    anonymous poll nobody in the app sees what a person chose. Votes are never readable directly.
-- 6. Staff can remind those who have not voted (remind_poll, once in 12 hours); on the closing day
--    the daily job reminds them too.
-- Notices go through push_outbox (0016), so 0019's trigger puts them into the inbox as well. The
-- push itself needs the Edge Function from this commit (it now accepts the event and poll screens).

-- ---------------------------------------------------------------- 0. inbox kinds
-- Event and poll notices get their own kind (and icon) in the inbox.
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('announcement', 'assessment', 'promotion', 'notice', 'event', 'poll'));

create or replace function inbox_kind_for_url(p_url text) returns text
language sql immutable set search_path = public as $$
  select case
    when p_url ~ '^/(student|staff)/assessments/' then 'assessment'
    when p_url ~ '^/staff/promotion/' or p_url = '/student/progress' then 'promotion'
    when p_url ~ '^/(student|staff)/events/' then 'event'
    when p_url ~ '^/(student|staff)/polls/' then 'poll'
    else 'notice'
  end
$$;

-- ---------------------------------------------------------------- 1. who an event or poll is for
-- The same audiences as announcements (0007's announcement_audience), for active logins that can
-- open the app: all = every student; level = students at that level; mentees = students whose
-- mentor is the author; staff = the Guru and coordinators; group = members who are students or
-- staff. Unlike announcements the author is counted when they fit (they may go too).
-- Security definer: it reads other people's records; it returns ids only.
create or replace function audience_profiles(p_audience text, p_level smallint, p_group bigint, p_author uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id
    from profiles p
    left join students s on s.profile_id = p.id
   where p.active
     and case p_audience
           when 'all'     then p.role = 'student'
           when 'level'   then p.role = 'student' and s.level_id = p_level
           when 'mentees' then p.role = 'student' and s.mentor_id = p_author
           when 'staff'   then p.role in ('guru', 'coordinator')
           when 'group'   then p.role in ('guru', 'coordinator', 'student')
                               and exists (select 1 from group_members gm
                                            where gm.group_id = p_group and gm.profile_id = p.id)
           else false
         end
$$;

-- The student records an audience covers (for performers and attendance), logins or not, without
-- those who have left. Staff audiences cover no student records.
create or replace function audience_students(p_audience text, p_level smallint, p_group bigint, p_author uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select s.id
    from students s
   where s.status <> 'left'
     and case p_audience
           when 'all'     then true
           when 'level'   then s.level_id = p_level
           when 'mentees' then s.mentor_id = p_author
           when 'group'   then exists (select 1 from group_members gm
                                        where gm.group_id = p_group and gm.profile_id = s.profile_id)
           else false
         end
$$;

-- Checks and tidies an audience on a row (used by both guards). Errors: audience_invalid,
-- level_required, group_required (the group must exist and be active).
create or replace function clean_audience(inout p_audience text, inout p_level smallint, inout p_group bigint)
language plpgsql stable set search_path = public as $$
begin
  if p_audience is null or p_audience not in ('all', 'level', 'mentees', 'staff', 'group') then
    raise exception 'audience_invalid';
  end if;
  if p_audience = 'level' then
    if p_level is null or not exists (select 1 from levels where id = p_level) then raise exception 'level_required'; end if;
  else
    p_level := null;
  end if;
  if p_audience = 'group' then
    if p_group is null or not exists (select 1 from groups where id = p_group and active) then
      raise exception 'group_required';
    end if;
  else
    p_group := null;
  end if;
end $$;

-- ---------------------------------------------------------------- 2. events
create table events (
  id               bigint generated always as identity primary key,
  title            text not null,
  description      text not null default '',
  starts_at        timestamptz not null,
  ends_at          timestamptz,
  centre_id        smallint references centres (id),
  place            text,
  audience         text not null default 'all',
  audience_level   smallint references levels (id),
  audience_group   bigint references groups (id),
  created_by       uuid references profiles (id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  cancelled_at     timestamptz,
  cancel_reason    text,
  reminded_at      timestamptz,
  last_reminded_at timestamptz,
  check ((audience = 'level') = (audience_level is not null)),
  check ((audience = 'group') = (audience_group is not null))
);
create index events_starts_idx on events (starts_at);

create table event_rsvps (
  event_id     bigint not null references events (id) on delete cascade,
  profile_id   uuid not null references profiles (id) on delete cascade,
  response     text not null check (response in ('going', 'maybe', 'not_going')),
  answered_at  timestamptz not null default now(),
  primary key (event_id, profile_id)
);
create index event_rsvps_profile_idx on event_rsvps (profile_id);

create table event_performers (
  event_id     bigint not null references events (id) on delete cascade,
  student_id   uuid not null references students (id) on delete cascade,
  part         text not null,
  assigned_by  uuid references profiles (id),
  assigned_at  timestamptz not null default now(),
  primary key (event_id, student_id)
);
create index event_performers_student_idx on event_performers (student_id);

create table event_attendance (
  event_id    bigint not null references events (id) on delete cascade,
  student_id  uuid not null references students (id) on delete cascade,
  marked_by   uuid references profiles (id),
  marked_at   timestamptz not null default now(),
  primary key (event_id, student_id)
);
create index event_attendance_student_idx on event_attendance (student_id);

-- Who may open an event: everyone it is for, and its performers (who may be picked from outside
-- the audience). Staff open every event (RLS below). Security definer: reads other records.
create or replace function event_visible_to(p_event bigint, p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from events e
                  where e.id = p_event
                    and (p_profile in (select audience_profiles(e.audience, e.audience_level, e.audience_group, e.created_by))
                      or exists (select 1 from event_performers ep join students s on s.id = ep.student_id
                                  where ep.event_id = e.id and s.profile_id = p_profile)))
$$;

-- Everyone an event's notices go to: its audience and its performers with a login (active).
create or replace function event_people(p_event bigint) returns setof uuid
language sql stable security definer set search_path = public as $$
  select audience_profiles(e.audience, e.audience_level, e.audience_group, e.created_by) from events e where e.id = p_event
  union
  select s.profile_id from event_performers ep join students s on s.id = ep.student_id
    join profiles p on p.id = s.profile_id and p.active
   where ep.event_id = p_event
$$;

-- Error codes (src/data/events.ts):
--   title_required / title_too_long (120)   description_too_long (4000)   place_required (a centre
--   or a place)   place_too_long (200)   centre_invalid (not an active centre)   starts_required
--   starts_past   starts_too_far (more than a year)   ends_invalid (before the start, or more than 14
--   days after it)   audience_invalid / level_required / group_required   audience_locked (people
--   have answered)   event_cancelled (a cancelled event stays as it is)   event_over (cancelling
--   after it ended)   reason_too_long (500)   event_frozen (author or creation time)
create or replace function guard_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_aud record;
begin
  new.title := btrim(coalesce(new.title, ''), E' \t\r\n');
  new.description := btrim(coalesce(new.description, ''), E' \t\r\n');
  new.place := nullif(btrim(coalesce(new.place, ''), E' \t\r\n'), '');
  new.cancel_reason := nullif(btrim(coalesce(new.cancel_reason, ''), E' \t\r\n'), '');

  if tg_op = 'UPDATE' and old.cancelled_at is not null then
    raise exception 'event_cancelled' using detail = 'A cancelled event stays as it is.';
  end if;
  if new.title = '' then raise exception 'title_required'; end if;
  if char_length(new.title) > 120 then raise exception 'title_too_long'; end if;
  if char_length(new.description) > 4000 then raise exception 'description_too_long'; end if;
  if char_length(coalesce(new.place, '')) > 200 then raise exception 'place_too_long'; end if;
  if new.centre_id is null and new.place is null then raise exception 'place_required'; end if;
  if new.centre_id is not null and (tg_op = 'INSERT' or new.centre_id is distinct from old.centre_id)
     and not exists (select 1 from centres c where c.id = new.centre_id and c.active) then
    raise exception 'centre_invalid';
  end if;
  if new.starts_at is null then raise exception 'starts_required'; end if;
  if (tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at) and new.starts_at <= now() then
    raise exception 'starts_past';
  end if;
  if new.starts_at > now() + interval '1 year' then raise exception 'starts_too_far'; end if;
  if new.ends_at is not null and (new.ends_at <= new.starts_at or new.ends_at > new.starts_at + interval '14 days') then
    raise exception 'ends_invalid' using detail = 'An event ends after it starts, within 14 days.';
  end if;
  -- Checked when set or changed only: a group switched off later must not block reminders.
  if tg_op = 'INSERT' or (new.audience, new.audience_level, new.audience_group)
                         is distinct from (old.audience, old.audience_level, old.audience_group) then
    select * into v_aud from clean_audience(new.audience, new.audience_level, new.audience_group);
    new.audience := v_aud.p_audience;
    new.audience_level := v_aud.p_level;
    new.audience_group := v_aud.p_group;
  end if;
  if char_length(coalesce(new.cancel_reason, '')) > 500 then raise exception 'reason_too_long'; end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
    new.created_at := now();
    new.updated_at := now();
    new.cancelled_at := null;
    new.cancel_reason := null;
    new.reminded_at := null;
    new.last_reminded_at := null;
    return new;
  end if;

  -- UPDATE from here on.
  if auth.uid() is not null and (new.created_by is distinct from old.created_by
                                 or new.created_at is distinct from old.created_at) then
    raise exception 'event_frozen';
  end if;
  if (new.audience, new.audience_level, new.audience_group) is distinct from (old.audience, old.audience_level, old.audience_group)
     and exists (select 1 from event_rsvps r where r.event_id = old.id) then
    raise exception 'audience_locked' using detail = 'People have answered; the audience stays as it is.';
  end if;
  if new.cancelled_at is not null then
    if coalesce(old.ends_at, old.starts_at) < now() then raise exception 'event_over'; end if;
    new.cancelled_at := now();
  else
    new.cancel_reason := null;
  end if;
  -- A new time gets its own day-before reminder.
  if new.starts_at is distinct from old.starts_at then new.reminded_at := null; end if;
  new.updated_at := now();
  return new;
end $$;

-- An event somebody answered, or with performers or attendance, is cancelled, not deleted.
create or replace function guard_event_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from event_rsvps where event_id = old.id)
     or exists (select 1 from event_performers where event_id = old.id)
     or exists (select 1 from event_attendance where event_id = old.id) then
    raise exception 'event_has_answers' using detail = 'People have answered; cancel it instead.';
  end if;
  return old;
end $$;

create trigger events_guard before insert or update on events
  for each row execute function guard_event();
create trigger events_guard_delete before delete on events
  for each row execute function guard_event_delete();
create trigger audit_events after update or delete on events
  for each row execute function audit_row();

-- ---------------------------------------------------------------- 3. polls
create table polls (
  id                   bigint generated always as identity primary key,
  question             text not null,
  options              text[] not null,
  anonymous            boolean not null default false,
  results_when         text not null default 'after_vote' check (results_when in ('after_vote', 'after_close')),
  closes_at            timestamptz not null,
  closed_at            timestamptz,
  audience             text not null default 'all',
  audience_level       smallint references levels (id),
  audience_group       bigint references groups (id),
  created_by           uuid references profiles (id) default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  closing_reminded_at  timestamptz,
  last_reminded_at     timestamptz,
  check ((audience = 'level') = (audience_level is not null)),
  check ((audience = 'group') = (audience_group is not null))
);
create index polls_closes_idx on polls (closes_at);

-- One vote per person and poll; changed in place until the poll closes. Never readable from the
-- app (no grant): the functions below give counts, one's own choice, and who voted.
create table poll_votes (
  poll_id     bigint not null references polls (id) on delete cascade,
  profile_id  uuid not null references profiles (id) on delete cascade,
  choice      smallint not null,
  voted_at    timestamptz not null default now(),
  primary key (poll_id, profile_id)
);
create index poll_votes_profile_idx on poll_votes (profile_id);

-- Closed: closed early by staff, or past its closing time.
create or replace function poll_is_closed(p_closed_at timestamptz, p_closes_at timestamptz) returns boolean
language sql stable set search_path = public as $$
  select p_closed_at is not null or p_closes_at <= now()
$$;

-- Error codes (src/data/polls.ts):
--   question_required / question_too_long (200)   options_invalid (2 to 6 different answers of 1-80
--   characters)   closes_required   closes_past   closes_too_far (more than a year)
--   audience_invalid / level_required / group_required   poll_has_votes (answers, anonymous, results
--   rule or audience after the first vote)   poll_closed (a closed poll stays as it is)   poll_frozen
-- The four guards are security definer: they look at everyone's answers and votes, which the
-- person editing may not read (votes are readable by nobody); auth.uid() still names that person.
create or replace function guard_poll() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_aud     record;
  v_options text[] := '{}';
  v_option  text;
begin
  if tg_op = 'UPDATE' and poll_is_closed(old.closed_at, old.closes_at) then
    raise exception 'poll_closed' using detail = 'A closed poll stays as it is.';
  end if;
  new.question := btrim(coalesce(new.question, ''), E' \t\r\n');
  if new.question = '' then raise exception 'question_required'; end if;
  if char_length(new.question) > 200 then raise exception 'question_too_long'; end if;
  if new.options is null or cardinality(new.options) not between 2 and 6 then raise exception 'options_invalid'; end if;
  foreach v_option in array new.options loop
    v_option := btrim(coalesce(v_option, ''), E' \t\r\n');
    if v_option = '' or char_length(v_option) > 80
       or lower(v_option) = any (select lower(x) from unnest(v_options) x) then
      raise exception 'options_invalid' using detail = 'A poll has 2 to 6 different answers of 1 to 80 characters.';
    end if;
    v_options := v_options || v_option;
  end loop;
  new.options := v_options;
  if new.closes_at is null then raise exception 'closes_required'; end if;
  if (tg_op = 'INSERT' or new.closes_at is distinct from old.closes_at) and new.closes_at <= now() then
    raise exception 'closes_past';
  end if;
  if new.closes_at > now() + interval '1 year' then raise exception 'closes_too_far'; end if;
  if tg_op = 'INSERT' or (new.audience, new.audience_level, new.audience_group)
                         is distinct from (old.audience, old.audience_level, old.audience_group) then
    select * into v_aud from clean_audience(new.audience, new.audience_level, new.audience_group);
    new.audience := v_aud.p_audience;
    new.audience_level := v_aud.p_level;
    new.audience_group := v_aud.p_group;
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
    new.created_at := now();
    new.updated_at := now();
    new.closed_at := null;
    new.closing_reminded_at := null;
    new.last_reminded_at := null;
    return new;
  end if;

  if auth.uid() is not null and (new.created_by is distinct from old.created_by
                                 or new.created_at is distinct from old.created_at) then
    raise exception 'poll_frozen';
  end if;
  if (new.options, new.anonymous, new.results_when, new.audience, new.audience_level, new.audience_group)
       is distinct from (old.options, old.anonymous, old.results_when, old.audience, old.audience_level, old.audience_group)
     and exists (select 1 from poll_votes v where v.poll_id = old.id) then
    raise exception 'poll_has_votes' using detail = 'After the first vote only the question wording and the closing time can change.';
  end if;
  if new.closed_at is not null then new.closed_at := now(); end if;
  if new.closes_at is distinct from old.closes_at then new.closing_reminded_at := null; end if;
  new.updated_at := now();
  return new;
end $$;

-- A poll with votes is closed, not deleted.
create or replace function guard_poll_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from poll_votes where poll_id = old.id) then
    raise exception 'poll_has_votes' using detail = 'People have voted; close it instead.';
  end if;
  return old;
end $$;

create trigger polls_guard before insert or update on polls
  for each row execute function guard_poll();
create trigger polls_guard_delete before delete on polls
  for each row execute function guard_poll_delete();
create trigger audit_polls after update or delete on polls
  for each row execute function audit_row();

-- ---------------------------------------------------------------- 4. who may read and change
alter table events enable row level security;
alter table event_rsvps enable row level security;
alter table event_performers enable row level security;
alter table event_attendance enable row level security;
alter table polls enable row level security;
alter table poll_votes enable row level security;

-- Staff see every event and poll; anyone else (students; staff too, through is_staff) only those
-- for them. Creating: staff. Changing, cancelling, closing, deleting: the author while still
-- staff, or the Guru (as announcements, 0007).
create policy readable on events for select to authenticated using (
  is_staff() or (my_role() = 'student' and event_visible_to(id, auth.uid())));
create policy staff_insert on events for insert to authenticated with check (is_staff());
create policy own_edit on events for update to authenticated
  using (is_staff() and (created_by = auth.uid() or is_guru()))
  with check (is_staff() and (created_by = auth.uid() or is_guru()));
create policy own_delete on events for delete to authenticated
  using (is_staff() and (created_by = auth.uid() or is_guru()));

create policy readable on polls for select to authenticated using (
  is_staff() or (my_role() = 'student'
                 and auth.uid() in (select audience_profiles(audience, audience_level, audience_group, created_by))));
create policy staff_insert on polls for insert to authenticated with check (is_staff());
create policy own_edit on polls for update to authenticated
  using (is_staff() and (created_by = auth.uid() or is_guru()))
  with check (is_staff() and (created_by = auth.uid() or is_guru()));
create policy own_delete on polls for delete to authenticated
  using (is_staff() and (created_by = auth.uid() or is_guru()));

-- Answers: staff see all (names, docs/DECISIONS.md #57); a student only their own. Performers and
-- attendance: staff all, a student their own rows.
create policy readable on event_rsvps for select to authenticated using (is_staff() or profile_id = auth.uid());
create policy readable on event_performers for select to authenticated using (
  is_staff() or student_id = my_student_id());
create policy readable on event_attendance for select to authenticated using (
  is_staff() or student_id = my_student_id());

revoke all on events, event_rsvps, event_performers, event_attendance, polls, poll_votes
  from public, anon, authenticated;
grant select on events, event_rsvps, event_performers, event_attendance, polls to authenticated;
grant insert (title, description, starts_at, ends_at, centre_id, place, audience, audience_level, audience_group),
      update (title, description, starts_at, ends_at, centre_id, place, audience, audience_level, audience_group,
              cancelled_at, cancel_reason),
      delete on events to authenticated;
grant insert (question, options, anonymous, results_when, closes_at, audience, audience_level, audience_group),
      update (question, options, anonymous, results_when, closes_at, closed_at, audience, audience_level, audience_group),
      delete on polls to authenticated;

-- ---------------------------------------------------------------- 5. notices
-- The line under the title, in the person's app language. Times are India time, 24-hour, as the
-- app writes them. The Telugu and Hindi lines are drafts for the native-speaker review
-- (docs/TRANSLATIONS.md).
create or replace function event_push_line(p_kind text, p_lang text, p_at timestamptz, p_extra text default null)
returns text language sql stable set search_path = public as $$
  select case p_kind
    when 'event_new' then case p_lang
      when 'te' then 'కొత్త కార్యక్రమం: ' || to_char(p_at at time zone 'Asia/Kolkata', 'DD-MM-YYYY HH24:MI') || '. మీరు వస్తారా?'
      when 'hi' then 'नया कार्यक्रम: ' || to_char(p_at at time zone 'Asia/Kolkata', 'DD-MM-YYYY HH24:MI') || '। क्या आप आएँगे?'
      else 'New event: ' || to_char(p_at at time zone 'Asia/Kolkata', 'DD-MM-YYYY HH24:MI') || '. Will you come?' end
    when 'event_changed' then case p_lang
      when 'te' then 'సమయం లేదా స్థలం మారింది: ' || to_char(p_at at time zone 'Asia/Kolkata', 'DD-MM-YYYY HH24:MI') || '.'
      when 'hi' then 'समय या स्थान बदल गया: ' || to_char(p_at at time zone 'Asia/Kolkata', 'DD-MM-YYYY HH24:MI') || '।'
      else 'The time or place changed: ' || to_char(p_at at time zone 'Asia/Kolkata', 'DD-MM-YYYY HH24:MI') || '.' end
    when 'event_cancelled' then case p_lang
      when 'te' then to_char(p_at at time zone 'Asia/Kolkata', 'DD-MM-YYYY') || ' నాటి ఈ కార్యక్రమం రద్దయింది.'
      when 'hi' then to_char(p_at at time zone 'Asia/Kolkata', 'DD-MM-YYYY') || ' का यह कार्यक्रम रद्द हो गया है।'
      else 'This event on ' || to_char(p_at at time zone 'Asia/Kolkata', 'DD-MM-YYYY') || ' is cancelled.' end
    when 'event_remind' then case p_lang
      when 'te' then 'గుర్తు: రేపు ' || to_char(p_at at time zone 'Asia/Kolkata', 'HH24:MI') || ' కి.'
      when 'hi' then 'याद रहे: कल ' || to_char(p_at at time zone 'Asia/Kolkata', 'HH24:MI') || ' बजे।'
      else 'Reminder: tomorrow at ' || to_char(p_at at time zone 'Asia/Kolkata', 'HH24:MI') || '.' end
    when 'event_ask' then case p_lang
      when 'te' then 'మీరు వస్తారో లేదో దయచేసి తెలపండి (' || to_char(p_at at time zone 'Asia/Kolkata', 'DD-MM-YYYY HH24:MI') || ').'
      when 'hi' then 'कृपया बताएँ कि आप आएँगे या नहीं (' || to_char(p_at at time zone 'Asia/Kolkata', 'DD-MM-YYYY HH24:MI') || ')।'
      else 'Please tell us if you will come (' || to_char(p_at at time zone 'Asia/Kolkata', 'DD-MM-YYYY HH24:MI') || ').' end
    when 'event_performer' then case p_lang
      when 'te' then 'మీ పాత్ర: ' || p_extra || '.'
      when 'hi' then 'आपकी भूमिका: ' || p_extra || '।'
      else 'Your part: ' || p_extra || '.' end
    when 'poll_new' then case p_lang
      when 'te' then 'కొత్త అభిప్రాయ సేకరణ. దయచేసి ' || to_char(p_at at time zone 'Asia/Kolkata', 'DD-MM-YYYY HH24:MI') || ' లోపు ఓటు వేయండి.'
      when 'hi' then 'नया मतदान। कृपया ' || to_char(p_at at time zone 'Asia/Kolkata', 'DD-MM-YYYY HH24:MI') || ' तक वोट दें।'
      else 'New poll. Please vote by ' || to_char(p_at at time zone 'Asia/Kolkata', 'DD-MM-YYYY HH24:MI') || '.' end
    when 'poll_remind' then case p_lang
      when 'te' then 'గుర్తు: ఓటింగ్ ' || to_char(p_at at time zone 'Asia/Kolkata', 'DD-MM-YYYY HH24:MI') || ' కి ముగుస్తుంది. దయచేసి ఓటు వేయండి.'
      when 'hi' then 'याद रहे: मतदान ' || to_char(p_at at time zone 'Asia/Kolkata', 'DD-MM-YYYY HH24:MI') || ' को बंद होगा। कृपया वोट दें।'
      else 'Reminder: the poll closes ' || to_char(p_at at time zone 'Asia/Kolkata', 'DD-MM-YYYY HH24:MI') || '. Please vote.' end
  end
$$;

-- Queues one notice for each login in p_profiles (active ones; nobody twice), opening
-- /<student|staff>/<p_screen>, e.g. p_screen 'events/12'. Returns how many were queued.
create or replace function queue_people_push(p_profiles uuid[], p_kind text, p_title text, p_screen text,
                                             p_at timestamptz, p_extra text default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  insert into push_outbox (profile_id, title, body, url)
  select p.id, left(p_title, 120), event_push_line(p_kind, p.language, p_at, p_extra),
         case when p.role = 'student' then '/student/' else '/staff/' end || p_screen
    from profiles p
   where p.id = any (coalesce(p_profiles, '{}')) and p.active and p.role in ('guru', 'coordinator', 'student');
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- A new event, a new time or place, a cancellation, or a new audience (before anyone answered)
-- tells the people concerned. The person making the change is not told.
create or replace function event_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := coalesce(auth.uid(), new.created_by);
  v_people uuid[];
begin
  if tg_op = 'INSERT' then
    v_people := array(select x from audience_profiles(new.audience, new.audience_level, new.audience_group, new.created_by) x
                       where x is distinct from v_me);
    perform queue_people_push(v_people, 'event_new', new.title, 'events/' || new.id, new.starts_at);
  elsif old.cancelled_at is null and new.cancelled_at is not null then
    v_people := array(select x from event_people(new.id) x where x is distinct from v_me);
    perform queue_people_push(v_people, 'event_cancelled', new.title, 'events/' || new.id, new.starts_at);
  elsif (new.starts_at, new.ends_at, new.centre_id, new.place) is distinct from (old.starts_at, old.ends_at, old.centre_id, old.place) then
    v_people := array(select x from event_people(new.id) x where x is distinct from v_me);
    perform queue_people_push(v_people, 'event_changed', new.title, 'events/' || new.id, new.starts_at);
  elsif (new.audience, new.audience_level, new.audience_group) is distinct from (old.audience, old.audience_level, old.audience_group) then
    v_people := array(select x from audience_profiles(new.audience, new.audience_level, new.audience_group, new.created_by) x
                       where x is distinct from v_me
                         and x not in (select audience_profiles(old.audience, old.audience_level, old.audience_group, old.created_by)));
    perform queue_people_push(v_people, 'event_new', new.title, 'events/' || new.id, new.starts_at);
  end if;
  return null;
end $$;

create trigger events_notify after insert or update on events
  for each row execute function event_notify();

-- A new poll (or a new audience before the first vote) tells the people it is for.
create or replace function poll_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := coalesce(auth.uid(), new.created_by);
  v_people uuid[];
begin
  if tg_op = 'INSERT' then
    v_people := array(select x from audience_profiles(new.audience, new.audience_level, new.audience_group, new.created_by) x
                       where x is distinct from v_me);
  elsif (new.audience, new.audience_level, new.audience_group) is distinct from (old.audience, old.audience_level, old.audience_group) then
    v_people := array(select x from audience_profiles(new.audience, new.audience_level, new.audience_group, new.created_by) x
                       where x is distinct from v_me
                         and x not in (select audience_profiles(old.audience, old.audience_level, old.audience_group, old.created_by)));
  end if;
  if v_people is not null then
    perform queue_people_push(v_people, 'poll_new', new.question, 'polls/' || new.id, new.closes_at);
  end if;
  return null;
end $$;

create trigger polls_notify after insert or update on polls
  for each row execute function poll_notify();

-- ---------------------------------------------------------------- 6. what the app calls: events
-- S11: Going / Maybe / Not going, changeable until the event starts. Errors: not_allowed (not for
-- them), event_not_found, event_cancelled, event_started, response_invalid.
create or replace function rsvp_event(p_event bigint, p_response text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_event events;
begin
  if coalesce(my_role() in ('guru', 'coordinator', 'student'), false) is false then raise exception 'not_allowed'; end if;
  select * into v_event from events where id = p_event;
  if not found then raise exception 'event_not_found'; end if;
  if not event_visible_to(p_event, auth.uid()) then raise exception 'not_allowed'; end if;
  if v_event.cancelled_at is not null then raise exception 'event_cancelled'; end if;
  if v_event.starts_at <= now() then raise exception 'event_started'; end if;
  if p_response is null or p_response not in ('going', 'maybe', 'not_going') then raise exception 'response_invalid'; end if;
  insert into event_rsvps (event_id, profile_id, response) values (p_event, auth.uid(), p_response)
  on conflict (event_id, profile_id) do update set response = excluded.response, answered_at = now();
end $$;

-- Per event the caller may open: how many it is for, the answers, performers and attendance, and
-- the caller's own answer, part and attendance. Students see these counts, never names.
create or replace function event_counts(p_ids bigint[])
returns table (event_id bigint, addressed int, going int, maybe int, not_going int, performers int, attended int,
               my_response text, my_part text, i_attended boolean)
language sql stable security definer set search_path = public as $$
  select e.id,
         (select count(*)::int from event_people(e.id)),
         (select count(*)::int from event_rsvps r where r.event_id = e.id and r.response = 'going'),
         (select count(*)::int from event_rsvps r where r.event_id = e.id and r.response = 'maybe'),
         (select count(*)::int from event_rsvps r where r.event_id = e.id and r.response = 'not_going'),
         (select count(*)::int from event_performers ep where ep.event_id = e.id),
         (select count(*)::int from event_attendance ea where ea.event_id = e.id),
         (select r.response from event_rsvps r where r.event_id = e.id and r.profile_id = auth.uid()),
         (select ep.part from event_performers ep where ep.event_id = e.id and ep.student_id = my_student_id()),
         exists (select 1 from event_attendance ea where ea.event_id = e.id and ea.student_id = my_student_id())
    from events e
   where e.id = any (coalesce(p_ids, '{}'))
     and coalesce(my_role() in ('guru', 'coordinator', 'student'), false)
     and (is_staff() or event_visible_to(e.id, auth.uid()))
$$;

-- C16: everyone an event is for (and anyone else who answered), with their answer. Staff only.
create or replace function event_people_list(p_event bigint)
returns table (profile_id uuid, full_name text, roll_no text, role text, response text, answered_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  return query
  select p.id, coalesce(s.full_name, p.full_name), s.roll_no, p.role::text, r.response, r.answered_at
    from profiles p
    left join students s on s.profile_id = p.id
    left join event_rsvps r on r.event_id = p_event and r.profile_id = p.id
   where p.id in (select event_people(p_event)) or r.profile_id is not null
   order by coalesce(s.full_name, p.full_name);
end $$;

-- C16: the student records to pick performers and attendance from: those the event is for (or
-- every student who has not left, p_everyone), plus anyone already picked or ticked. Staff only.
create or replace function event_student_list(p_event bigint, p_everyone boolean default false)
returns table (student_id uuid, full_name text, roll_no text, level_id smallint, has_login boolean,
               in_audience boolean, response text, part text, attended boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_event events;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select * into v_event from events where id = p_event;
  if not found then raise exception 'event_not_found'; end if;
  return query
  with aud as (select audience_students(v_event.audience, v_event.audience_level, v_event.audience_group, v_event.created_by) as id)
  select s.id, s.full_name, s.roll_no, s.level_id, s.profile_id is not null,
         s.id in (select id from aud),
         r.response, ep.part, ea.student_id is not null
    from students s
    left join event_rsvps r on r.event_id = p_event and r.profile_id = s.profile_id
    left join event_performers ep on ep.event_id = p_event and ep.student_id = s.id
    left join event_attendance ea on ea.event_id = p_event and ea.student_id = s.id
   where s.id in (select id from aud)
      or ep.student_id is not null or ea.student_id is not null
      or (coalesce(p_everyone, false) and s.status <> 'left')
   order by s.full_name;
end $$;

-- C16: the performers, as a list [{student_id, part}] that replaces the old one. New performers
-- and changed parts are told (with a login). Returns {performers, notified, no_login}.
-- Errors: not_allowed, event_not_found, event_cancelled, event_over, too_many (40),
-- student_invalid (unknown, left, or twice), part_invalid (1-60 characters).
create or replace function set_event_performers(p_event bigint, p_performers jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_event    events;
  v_item     jsonb;
  v_student  uuid;
  v_part     text;
  v_seen     uuid[] := '{}';
  v_old      text;
  v_profile  uuid;
  v_notified int := 0;
  v_no_login int := 0;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select * into v_event from events where id = p_event for update;
  if not found then raise exception 'event_not_found'; end if;
  if v_event.cancelled_at is not null then raise exception 'event_cancelled'; end if;
  if coalesce(v_event.ends_at, v_event.starts_at) < now() then raise exception 'event_over'; end if;
  if p_performers is null or jsonb_typeof(p_performers) <> 'array' then raise exception 'student_invalid'; end if;
  if jsonb_array_length(p_performers) > 40 then raise exception 'too_many'; end if;

  for v_item in select value from jsonb_array_elements(p_performers) loop
    begin
      v_student := (v_item ->> 'student_id')::uuid;
    exception when others then
      raise exception 'student_invalid';
    end;
    if v_student is null or v_student = any (v_seen)
       or not exists (select 1 from students s where s.id = v_student and s.status <> 'left') then
      raise exception 'student_invalid';
    end if;
    v_part := btrim(coalesce(v_item ->> 'part', ''), E' \t\r\n');
    if v_part = '' or char_length(v_part) > 60 then raise exception 'part_invalid'; end if;
    v_seen := v_seen || v_student;

    select ep.part into v_old from event_performers ep where ep.event_id = p_event and ep.student_id = v_student;
    if v_old is distinct from v_part then
      insert into event_performers (event_id, student_id, part, assigned_by)
      values (p_event, v_student, v_part, auth.uid())
      on conflict (event_id, student_id) do update set part = excluded.part, assigned_by = excluded.assigned_by, assigned_at = now();
      select s.profile_id into v_profile from students s join profiles p on p.id = s.profile_id and p.active where s.id = v_student;
      if v_profile is null then
        v_no_login := v_no_login + 1;
      else
        v_notified := v_notified + queue_people_push(array[v_profile], 'event_performer', v_event.title,
                                                     'events/' || p_event, v_event.starts_at, v_part);
      end if;
    end if;
  end loop;
  delete from event_performers ep where ep.event_id = p_event and not (ep.student_id = any (v_seen));
  return jsonb_build_object('performers', cardinality(v_seen), 'notified', v_notified, 'no_login', v_no_login);
end $$;

-- C16: who came, as the full list of student records (replaces the old one). From the event's
-- day (India) on. Returns how many are ticked. Errors: not_allowed, event_not_found,
-- event_cancelled, too_early, student_invalid.
create or replace function mark_event_attendance(p_event bigint, p_students uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_event events;
  v_ids   uuid[];
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select * into v_event from events where id = p_event for update;
  if not found then raise exception 'event_not_found'; end if;
  if v_event.cancelled_at is not null then raise exception 'event_cancelled'; end if;
  if (v_event.starts_at at time zone 'Asia/Kolkata')::date > today_ist() then raise exception 'too_early'; end if;
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

-- C16: Remind those who have not answered yet; once in 12 hours per event. Returns how many were
-- told. Errors: not_allowed, event_not_found, event_cancelled, event_started, too_soon.
create or replace function remind_event(p_event bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_event  events;
  v_people uuid[];
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select * into v_event from events where id = p_event for update;
  if not found then raise exception 'event_not_found'; end if;
  if v_event.cancelled_at is not null then raise exception 'event_cancelled'; end if;
  if v_event.starts_at <= now() then raise exception 'event_started'; end if;
  if v_event.last_reminded_at > now() - interval '12 hours' then raise exception 'too_soon'; end if;
  v_people := array(select x from event_people(p_event) x
                     where x is distinct from auth.uid()
                       and not exists (select 1 from event_rsvps r where r.event_id = p_event and r.profile_id = x));
  update events set last_reminded_at = now() where id = p_event;
  return queue_people_push(v_people, 'event_ask', v_event.title, 'events/' || p_event, v_event.starts_at);
end $$;

-- ---------------------------------------------------------------- 7. what the app calls: polls
-- S12: vote, or change the vote, while the poll is open. p_choice counts from 0.
-- Errors: not_allowed (not for them), poll_not_found, poll_closed, choice_invalid.
create or replace function vote_poll(p_poll bigint, p_choice int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_poll polls;
begin
  if coalesce(my_role() in ('guru', 'coordinator', 'student'), false) is false then raise exception 'not_allowed'; end if;
  select * into v_poll from polls where id = p_poll;
  if not found then raise exception 'poll_not_found'; end if;
  if auth.uid() not in (select audience_profiles(v_poll.audience, v_poll.audience_level, v_poll.audience_group, v_poll.created_by)) then
    raise exception 'not_allowed';
  end if;
  if poll_is_closed(v_poll.closed_at, v_poll.closes_at) then raise exception 'poll_closed'; end if;
  if p_choice is null or p_choice < 0 or p_choice >= cardinality(v_poll.options) then raise exception 'choice_invalid'; end if;
  insert into poll_votes (poll_id, profile_id, choice) values (p_poll, auth.uid(), p_choice)
  on conflict (poll_id, profile_id) do update set choice = excluded.choice, voted_at = now();
end $$;

-- Per poll the caller may open: how many it is for and have voted, whether it is closed, the
-- caller's own choice, whether they may vote, and the votes per answer when the caller may see
-- them (staff always; others after voting or after closing, as the poll says; else null).
create or replace function poll_state(p_ids bigint[])
returns table (poll_id bigint, addressed int, voted int, closed boolean, can_vote boolean, my_choice smallint, results int[])
language sql stable security definer set search_path = public as $$
  select q.id, q.addressed, q.voted, q.closed, q.can_vote, q.my_choice,
         case when is_staff() or q.closed or (q.results_when = 'after_vote' and q.my_choice is not null)
              -- generate_subscripts counts 1..n; a stored choice counts from 0.
              then array(select (select count(*)::int from poll_votes v where v.poll_id = q.id and v.choice = i - 1)
                           from generate_subscripts(q.options, 1) i order by i)
         end
    from (select pl.id, pl.options, pl.results_when,
                 (select count(*)::int from audience_profiles(pl.audience, pl.audience_level, pl.audience_group, pl.created_by)) as addressed,
                 (select count(*)::int from poll_votes v where v.poll_id = pl.id) as voted,
                 poll_is_closed(pl.closed_at, pl.closes_at) as closed,
                 auth.uid() in (select audience_profiles(pl.audience, pl.audience_level, pl.audience_group, pl.created_by)) as can_vote,
                 (select v.choice from poll_votes v where v.poll_id = pl.id and v.profile_id = auth.uid()) as my_choice
            from polls pl
           where pl.id = any (coalesce(p_ids, '{}'))
             and coalesce(my_role() in ('guru', 'coordinator', 'student'), false)
             and (is_staff() or auth.uid() in (select audience_profiles(pl.audience, pl.audience_level, pl.audience_group, pl.created_by)))) q
$$;

-- C17: who a poll is for (and anyone else who voted) and whether they voted; the choice only in a
-- poll that is not anonymous (docs/DECISIONS.md #57). Staff only.
create or replace function poll_voters(p_poll bigint)
returns table (profile_id uuid, full_name text, roll_no text, role text, voted_at timestamptz, choice smallint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_poll polls;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select * into v_poll from polls where id = p_poll;
  if not found then raise exception 'poll_not_found'; end if;
  return query
  select p.id, coalesce(s.full_name, p.full_name), s.roll_no, p.role::text, v.voted_at,
         case when v_poll.anonymous then null else v.choice end
    from profiles p
    left join students s on s.profile_id = p.id
    left join poll_votes v on v.poll_id = p_poll and v.profile_id = p.id
   where p.id in (select audience_profiles(v_poll.audience, v_poll.audience_level, v_poll.audience_group, v_poll.created_by))
      or v.profile_id is not null
   order by coalesce(s.full_name, p.full_name);
end $$;

-- C17: Remind those who have not voted; once in 12 hours per poll. Returns how many were told.
-- Errors: not_allowed, poll_not_found, poll_closed, too_soon.
create or replace function remind_poll(p_poll bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_poll   polls;
  v_people uuid[];
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select * into v_poll from polls where id = p_poll for update;
  if not found then raise exception 'poll_not_found'; end if;
  if poll_is_closed(v_poll.closed_at, v_poll.closes_at) then raise exception 'poll_closed'; end if;
  if v_poll.last_reminded_at > now() - interval '12 hours' then raise exception 'too_soon'; end if;
  v_people := array(select x from audience_profiles(v_poll.audience, v_poll.audience_level, v_poll.audience_group, v_poll.created_by) x
                     where x is distinct from auth.uid()
                       and not exists (select 1 from poll_votes v where v.poll_id = p_poll and v.profile_id = x));
  update polls set last_reminded_at = now() where id = p_poll;
  return queue_people_push(v_people, 'poll_remind', v_poll.question, 'polls/' || p_poll, v_poll.closes_at);
end $$;

-- ---------------------------------------------------------------- 8. the daily reminders
-- Every day at 09:00 IST: events starting tomorrow remind those going or maybe; polls closing in
-- the next 24 hours remind those who have not voted. Each only once (reminded_at,
-- closing_reminded_at; a new time or closing time resets it). Returns how many notices were queued.
create or replace function events_polls_daily() returns int
language plpgsql volatile set search_path = public as $$
declare
  v_row record;
  v_n   int := 0;
begin
  for v_row in
    select e.id, e.title, e.starts_at from events e
     where e.cancelled_at is null and e.reminded_at is null
       and (e.starts_at at time zone 'Asia/Kolkata')::date = today_ist() + 1
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

-- 03:30 UTC = 09:00 IST.
select cron.schedule('mridanga-events-polls', '30 3 * * *', 'select events_polls_daily()');

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14.
revoke execute on function audience_profiles(text, smallint, bigint, uuid), audience_students(text, smallint, bigint, uuid),
  clean_audience(text, smallint, bigint), event_visible_to(bigint, uuid), event_people(bigint), guard_event(),
  guard_event_delete(), poll_is_closed(timestamptz, timestamptz), guard_poll(), guard_poll_delete(),
  event_push_line(text, text, timestamptz, text), queue_people_push(uuid[], text, text, text, timestamptz, text),
  event_notify(), poll_notify(), rsvp_event(bigint, text), event_counts(bigint[]), event_people_list(bigint),
  event_student_list(bigint, boolean), set_event_performers(bigint, jsonb), mark_event_attendance(bigint, uuid[]),
  remind_event(bigint), vote_poll(bigint, int), poll_state(bigint[]), poll_voters(bigint), remind_poll(bigint),
  events_polls_daily()
  from public, anon, authenticated;
-- Run by row-level security and the guards as the person asking: yes/no answers, ids or a tidied value.
grant execute on function audience_profiles(text, smallint, bigint, uuid), clean_audience(text, smallint, bigint),
  event_visible_to(bigint, uuid), poll_is_closed(timestamptz, timestamptz) to authenticated;
grant execute on function rsvp_event(bigint, text), event_counts(bigint[]), event_people_list(bigint),
  event_student_list(bigint, boolean), set_event_performers(bigint, jsonb), mark_event_attendance(bigint, uuid[]),
  remind_event(bigint), vote_poll(bigint, int), poll_state(bigint[]), poll_voters(bigint), remind_poll(bigint)
  to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on table events is 'C16/S11: class events (festival kirtans, yatras, programmes) with time, centre or place, audience (as announcements) and description; cancelled_at = called off (docs/DECISIONS.md #57).';
comment on column events.audience is 'all, level (audience_level), mentees (of the author), staff, group (audience_group). Fixed once someone answered.';
comment on column events.reminded_at is 'When the day-before reminder went to those going or maybe (events_polls_daily); reset by a new time.';
comment on column events.last_reminded_at is 'Last "Remind" by staff (people who have not answered); at most once in 12 hours.';
comment on table event_rsvps is 'S11: one answer per person and event: going, maybe, not_going. Written only by rsvp_event(); students read their own, staff all.';
comment on table event_performers is 'C16: students playing at an event, with their part (e.g. mridanga, kartal, lead singer). Written by set_event_performers().';
comment on table event_attendance is 'C16: students who came to an event, ticked from the event day on. Written by mark_event_attendance().';
comment on table polls is 'C17/S12: a question with 2-6 answers, one choice each, for an audience, until closes_at (or closed_at, closed early). anonymous = nobody in the app sees what a person chose; results_when = after_vote or after_close (docs/DECISIONS.md #57).';
comment on table poll_votes is 'One vote per person and poll (choice counts from 0). Not readable from the app; only through poll_state() and poll_voters().';
comment on function audience_profiles is 'Active logins an event or poll is for (announcement audiences; the author counted when they fit).';
comment on function audience_students is 'Student records (not left) an audience covers, logins or not; none for a staff audience.';
comment on function rsvp_event is 'S11: answer going, maybe or not_going until the event starts.';
comment on function event_counts is 'Per event: people it is for, answers, performers, attendance, and the caller''s own answer, part and attendance. Counts only.';
comment on function event_people_list is 'C16 (staff): everyone an event is for, with their answer.';
comment on function event_student_list is 'C16 (staff): student records to pick performers and attendance from.';
comment on function set_event_performers is 'C16: replace the performers [{student_id, part}]; new ones are told.';
comment on function mark_event_attendance is 'C16: replace the list of students who came, from the event day on.';
comment on function remind_event is 'C16: remind those who have not answered; once in 12 hours.';
comment on function vote_poll is 'S12: vote or change the vote while the poll is open (choice from 0).';
comment on function poll_state is 'Per poll: people it is for, votes, closed, the caller''s choice, and the votes per answer when the caller may see them.';
comment on function poll_voters is 'C17 (staff): who a poll is for and whether they voted; their choice only when the poll is not anonymous.';
comment on function remind_poll is 'C17: remind those who have not voted; once in 12 hours.';
comment on function events_polls_daily is 'Daily 09:00 IST (pg_cron mridanga-events-polls): event reminders the day before (going or maybe) and poll reminders within 24 hours of closing (not voted).';
