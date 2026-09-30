-- Mridanga Seva — 0008: announcement follow-ups (screens C15, S10) and the groups screen.
-- Run once, after 0007_announcements.sql, in the Supabase SQL editor.
-- Why: docs/DECISIONS.md #26-#29. How: docs/DATABASE.md "Announcements" and "Groups".
--
-- 1. Author names for students: staff_names() gives the names of the Guru and the coordinators,
--    and nothing else about them. Row-level security on profiles lets a student read only their
--    own row, so a student could not see who posted an announcement.
-- 2. Editing: announcements.edited_at, set by the database when the title, text or audience of a
--    published announcement changes (not for pin or unpin). Once published, the publish time
--    stays. Read receipts are kept.
-- 3. Groups: checks on the name and purpose, names unique whatever the capitals, and only staff
--    and a group's own members can see a group (0001 let any login, even 'pending', list them).
--    The view group_summary counts the members of each group.
-- 4. Private replies: announcement_replies. A person replies to an announcement they can see;
--    only they, the announcement's author and the Guru can read the reply. Students never see
--    each other's replies (many are minors). Only the Guru can delete one.

-- ---------------------------------------------------------------- 1. staff names
-- Security definer: it reads profiles as its owner, past row-level security, so it returns
-- only what everyone who may read announcements may know: the id and name of each Guru and
-- coordinator, active or not (old announcements keep their author). No email, phone or role.
-- A 'pending' login or the door tablet gets nothing (docs/DECISIONS.md #26).
create or replace function staff_names()
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name
    from profiles p
   where p.role in ('guru', 'coordinator')
     and my_role() in ('guru', 'coordinator', 'student')
   order by p.full_name
$$;

-- ---------------------------------------------------------------- 2. editing announcements
alter table announcements add column edited_at timestamptz;

-- Replaces the guard from 0007. New rules, on update only:
--   - edited_at is set to now when the title, text, audience, level or group of an announcement
--     that was already published changes. Editing a scheduled one is not "edited": nobody has
--     seen it yet. Pin and unpin never count. The app cannot set edited_at itself.
--   - Once published, the publish time cannot be changed by an app user: students may already
--     have read it, and it cannot go back to being scheduled.
--   - A scheduled announcement moved to a time already past is published now, not backdated.
-- Error codes, in addition to those of 0007:
--   already_published    an app user tried to change the publish time of a published announcement
create or replace function guard_announcement() returns trigger
language plpgsql set search_path = public as $$
begin
  -- Trim spaces and blank lines at both ends, as the app does before sending.
  new.title := btrim(new.title, E' \t\r\n');
  new.body  := btrim(new.body, E' \t\r\n');
  if coalesce(new.title, '') = '' then raise exception 'title_required'; end if;
  if char_length(new.title) > 120 then
    raise exception 'title_too_long' using detail = 'A title is at most 120 characters.';
  end if;
  if coalesce(new.body, '') = '' then raise exception 'body_required'; end if;
  if char_length(new.body) > 4000 then
    raise exception 'body_too_long' using detail = 'The text of an announcement is at most 4000 characters.';
  end if;

  -- The level belongs only to audience 'level', the group only to audience 'group'.
  if new.audience = 'level' then
    if new.audience_level is null then raise exception 'level_required'; end if;
  else
    new.audience_level := null;
  end if;
  if new.audience = 'group' then
    if new.audience_group is null then raise exception 'group_required'; end if;
  else
    new.audience_group := null;
  end if;

  -- No publish time given = publish now. A time in the future keeps it from students until then.
  new.publish_at := coalesce(new.publish_at, now());

  if tg_op = 'INSERT' then
    new.edited_at := null;
    -- An app user is always recorded as the author: "my mentees" means the author's mentees, and
    -- only the author may delete. The dashboard and seed.sql (no signed-in user) keep what they give.
    if auth.uid() is not null then
      new.created_by := auth.uid();
      new.created_at := now();
    end if;
    return new;
  end if;

  -- UPDATE from here on.
  if auth.uid() is not null and (
        new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at) then
    raise exception 'announcement_frozen' using detail = 'The author and the creation time of an announcement cannot be changed.';
  end if;

  if auth.uid() is not null and new.publish_at is distinct from old.publish_at then
    if old.publish_at <= now() then
      raise exception 'already_published' using detail = 'An announcement that students can already see keeps its publish time.';
    end if;
    if new.publish_at < now() then
      new.publish_at := now();
    end if;
  end if;

  if old.publish_at <= now() and (new.title, new.body, new.audience, new.audience_level, new.audience_group)
       is distinct from (old.title, old.body, old.audience, old.audience_level, old.audience_group) then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- 3. groups
-- Error codes (the app turns them into messages, src/data/groups.ts):
--   group_name_required     the name is empty
--   group_name_too_long     the name is longer than 60 characters
--   group_purpose_too_long  the purpose is longer than 200 characters
--   23505 (unique_violation) another group already has this name, whatever the capitals
-- Security invoker: it only checks and adjusts the row being written.
create or replace function guard_group() returns trigger
language plpgsql set search_path = public as $$
begin
  new.name := btrim(new.name, E' \t\r\n');
  new.purpose := nullif(btrim(new.purpose, E' \t\r\n'), '');
  if coalesce(new.name, '') = '' then raise exception 'group_name_required'; end if;
  if char_length(new.name) > 60 then
    raise exception 'group_name_too_long' using detail = 'A group name is at most 60 characters.';
  end if;
  if char_length(new.purpose) > 200 then
    raise exception 'group_purpose_too_long' using detail = 'The purpose of a group is at most 200 characters.';
  end if;
  -- The person who made the group, from the login; it never changes afterwards. The dashboard
  -- and seed.sql (no signed-in user) keep what they give.
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
    else
      new.created_by := old.created_by;
    end if;
  end if;
  return new;
end $$;

create trigger groups_guard before insert or update on groups
  for each row execute function guard_group();

-- 0001 made names unique only with the same capitals, so "Sunday Harinam" and "sunday harinam"
-- could both exist and look the same in a list.
create unique index groups_name_lower_key on groups (lower(name));

-- Who may see a group: staff, and the members of that group (a student needs the name of their
-- own group to read "Group: Sunday Harinam"). Writing stays as in 0001 (staff_write). The app
-- offers no delete: a group an announcement was sent to cannot be deleted (foreign key), so a
-- group is switched off (active = false) instead.
drop policy read_all on groups;
create policy staff_or_member on groups for select to authenticated using (
  is_staff() or id in (select group_id from group_members where profile_id = auth.uid()));

-- One row per group with its number of members, for the groups list. Counted in the database
-- because Supabase does not allow count() in app queries by default. security_invoker = true
-- (docs/DECISIONS.md #20): it reads groups and group_members as the person asking.
create view group_summary with (security_invoker = true) as
select g.id, g.name, g.purpose, g.active, g.created_by,
       (select count(*)::int from group_members gm where gm.group_id = g.id) as members
  from groups g;

revoke all on group_summary from public, anon, authenticated;
grant select on group_summary to authenticated;

-- ---------------------------------------------------------------- 4. private replies
create table announcement_replies (
  id               bigint generated always as identity primary key,
  announcement_id  bigint not null references announcements (id) on delete cascade,
  profile_id       uuid not null references profiles (id) on delete cascade default auth.uid(),
  body             text not null,
  created_at       timestamptz not null default now()
);
create index announcement_replies_announcement_idx on announcement_replies (announcement_id);

-- Error codes (the app turns them into messages, src/data/announcements.ts):
--   reply_required   the reply is empty
--   reply_too_long   the reply is longer than 1000 characters
-- Security invoker: it only checks and adjusts the row being written.
create or replace function guard_announcement_reply() returns trigger
language plpgsql set search_path = public as $$
begin
  new.body := btrim(new.body, E' \t\r\n');
  if coalesce(new.body, '') = '' then raise exception 'reply_required'; end if;
  if char_length(new.body) > 1000 then
    raise exception 'reply_too_long' using detail = 'A reply is at most 1000 characters.';
  end if;
  -- The writer and the time come from the database for app users, whatever was sent.
  if auth.uid() is not null then
    new.profile_id := auth.uid();
    new.created_at := now();
  end if;
  return new;
end $$;

create trigger announcement_replies_guard before insert on announcement_replies
  for each row execute function guard_announcement_reply();

-- A reply removed by the Guru (moderation), or with its announcement, stays readable in audit_log.
create trigger audit_announcement_replies after delete on announcement_replies
  for each row execute function audit_row();

-- Who may write: anyone, for an announcement they can see (the subquery goes through the
-- announcements policy of 0007, so a 'pending' login or a student it is not addressed to cannot).
-- Who may read: the writer, the author of the announcement while still staff, and the Guru.
-- Nobody may change a reply; only the Guru may delete one.
alter table announcement_replies enable row level security;
create policy own_insert on announcement_replies for insert to authenticated
  with check (profile_id = auth.uid() and announcement_id in (select id from announcements));
create policy own_author_or_guru on announcement_replies for select to authenticated using (
  profile_id = auth.uid()
  or is_guru()
  or (is_staff() and announcement_id in (select id from announcements where created_by = auth.uid())));
create policy guru_delete on announcement_replies for delete to authenticated using (is_guru());

-- The app may send only announcement_id and body: profile_id is always the login and
-- created_at always the moment of writing.
revoke all on announcement_replies from public, anon, authenticated;
grant select, delete on announcement_replies to authenticated;
grant insert (announcement_id, body) on announcement_replies to authenticated;

-- Replies with the writer's name, for the author's list and a student's own replies. The name on
-- the student record comes first, as in announcement_audience. security_invoker = true: a
-- student sees only their own replies, a coordinator only the replies to their announcements.
create view announcement_reply_list with (security_invoker = true) as
select r.id,
       r.announcement_id,
       r.profile_id,
       coalesce(s.full_name, p.full_name) as full_name,
       s.roll_no,
       p.role,
       r.body,
       r.created_at
  from announcement_replies r
  left join profiles p on p.id = r.profile_id
  left join students s on s.profile_id = r.profile_id;

-- announcement_seen from 0007, with one more column at the end: how many replies the person
-- asking may read (all of them for the author and the Guru, only their own for anyone else).
create or replace view announcement_seen with (security_invoker = true) as
select a.id as announcement_id,
       count(aa.profile_id)::int as addressed,
       count(aa.read_at)::int as seen,
       case when a.audience in ('all', 'level', 'mentees') then (
         select count(*)::int from students s
          where s.profile_id is null and s.status <> 'left'
            and (a.audience = 'all'
              or (a.audience = 'level' and s.level_id = a.audience_level)
              or (a.audience = 'mentees' and s.mentor_id = a.created_by)))
       else 0 end as no_login,
       (select count(*)::int from announcement_replies r where r.announcement_id = a.id) as replies
  from announcements a
  left join announcement_audience aa on aa.announcement_id = a.id
 group by a.id;

revoke all on announcement_reply_list, announcement_seen from public, anon, authenticated;
grant select on announcement_reply_list, announcement_seen to authenticated;

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14: trigger functions are internal; no app role may call them directly.
revoke execute on function guard_announcement(), guard_group(), guard_announcement_reply()
  from public, anon, authenticated;
revoke execute on function staff_names() from public, anon, authenticated;
grant execute on function staff_names() to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on function staff_names is 'Ids and names of the Guru and coordinators (active or not), for "posted by". Returns nothing to pending or kiosk logins. Security definer (docs/DECISIONS.md #26).';
comment on function guard_announcement is 'Trigger: an announcement needs a title and text (at most 120 / 4000 characters) and a level or group when its audience needs one; records the signed-in person as author; sets edited_at when a published one is changed; a published one keeps its publish time (docs/DECISIONS.md #25, #27).';
comment on column announcements.edited_at is 'When the title, text or audience was last changed after it was published. Set by the database; empty = never edited. Pin and unpin do not count.';
comment on function guard_group is 'Trigger: a group name is required (at most 60 characters), purpose at most 200; records who made the group (docs/DECISIONS.md #28).';
comment on index groups_name_lower_key is 'Group names are unique whatever the capitals.';
comment on column groups.name is 'Shown in the compose screen and on announcements ("Group: Sunday Harinam"). Unique, at most 60 characters.';
comment on column groups.purpose is 'Optional note on what the group is for, at most 200 characters.';
comment on column groups.active is 'Switched off = no longer offered when posting. Groups are switched off, not deleted, so old announcements keep their group.';
comment on column groups.created_by is 'Who made the group. Set by the database from the login.';
comment on table group_members is 'Who is in which group: student logins and staff. Members see the group and its announcements.';
comment on view group_summary is 'One row per group the person asking may see, with its number of members. Follows row-level security.';
comment on column group_summary.members is 'How many people are in the group.';
comment on table announcement_replies is 'Private replies to an announcement. Read only by the writer, the announcement''s author and the Guru; deleted only by the Guru (docs/DECISIONS.md #29).';
comment on column announcement_replies.profile_id is 'Who wrote the reply. Set by the database from the login.';
comment on column announcement_replies.body is 'The reply, trimmed, 1 to 1000 characters.';
comment on column announcement_replies.created_at is 'When the reply was sent. Set by the database.';
comment on function guard_announcement_reply is 'Trigger: a reply is 1 to 1000 characters after trimming; records the signed-in person and the time (docs/DECISIONS.md #29).';
comment on view announcement_reply_list is 'Replies with the writer''s name (from the student record for students). Follows row-level security.';
comment on column announcement_reply_list.full_name is 'Name on the student record, or the login''s name for staff.';
comment on column announcement_seen.replies is 'How many replies the person asking may read: all of them for the author and the Guru.';
comment on table audit_log is 'Who changed students, profiles, call logs, levels, syllabus ticks or announcements, or deleted a reply, and when. Guru only.';
