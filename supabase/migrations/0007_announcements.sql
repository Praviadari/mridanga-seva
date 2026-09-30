-- Mridanga Seva — 0007: announcements (screens C15 Post an announcement and S10 Announcements).
-- Run once, after 0006_syllabus_progress.sql, in the Supabase SQL editor.
-- Why: docs/DECISIONS.md #25. How: docs/DATABASE.md "Announcements".
--
-- The tables come from 0001 (announcements, announcement_reads, groups, group_members). The app
-- writes announcements directly (insert = post, update = pin or unpin, delete); a student's app
-- inserts one announcement_reads row when they open an announcement. This migration adds:
-- 1. Rules that hold however a row is written: title and text are required and not too long, a
--    level or a group is required for those audiences (and dropped for the others), and the
--    author is always the signed-in person.
-- 2. Who may read: coordinators and the Guru see every announcement; a student sees the published
--    ones addressed to them. In 0001 an announcement to 'all' was open to ANY login, including
--    people who have just signed up and are still 'pending'.
-- 3. Who may change: only the author (while still staff) or the Guru may edit or delete. 0001 had
--    no delete rule, so nobody could delete from the app. Edits and deletes are kept in audit_log.
-- 4. Read receipts: only the reader writes their own, only for an announcement they can see, and
--    they cannot be changed or removed afterwards.
-- 5. "Seen by N of M": two views work out who an announcement is addressed to and who has read
--    it, so the count is the same on every phone and the app never downloads everyone's reads.

-- ---------------------------------------------------------------- tidy existing rows
-- A level or group left on an announcement for another audience means nothing; clear it so the
-- constraints below can be added. (The seed's welcome announcement has neither.)
update announcements set audience_level = null where audience <> 'level' and audience_level is not null;
update announcements set audience_group = null where audience <> 'group' and audience_group is not null;

alter table announcements
  add constraint announcements_level_target check ((audience = 'level') = (audience_level is not null)),
  add constraint announcements_group_target check ((audience = 'group') = (audience_group is not null));

-- ---------------------------------------------------------------- guard
-- Error codes (the app turns them into messages, src/data/announcements.ts):
--   title_required       the title is empty
--   title_too_long       the title is longer than 120 characters
--   body_required        the text is empty
--   body_too_long        the text is longer than 4000 characters
--   level_required       audience 'level' without a level
--   group_required       audience 'group' without a group
--   announcement_frozen  an app user tried to change the author or the creation time
-- Security invoker: it only checks and adjusts the row being written.
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
    -- An app user is always recorded as the author: "my mentees" means the author's mentees, and
    -- only the author may delete. The dashboard and seed.sql (no signed-in user) keep what they give.
    if auth.uid() is not null then
      new.created_by := auth.uid();
      new.created_at := now();
    end if;
  elsif auth.uid() is not null and (
        new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at) then
    raise exception 'announcement_frozen' using detail = 'The author and the creation time of an announcement cannot be changed.';
  end if;
  return new;
end $$;

create trigger announcements_guard before insert or update on announcements
  for each row execute function guard_announcement();

-- Edits (pin, unpin) and deletes are copied to audit_log with audit_row() from 0001, so a deleted
-- announcement can still be looked up. Posting needs no copy: the row itself records it.
create trigger audit_announcements after update or delete on announcements
  for each row execute function audit_row();

-- ---------------------------------------------------------------- who may read and change
-- Staff see every announcement, including scheduled ones. Anyone else must be a student (not a
-- 'pending' or door-tablet login) and sees only published ones addressed to them. The subqueries
-- read students and group_members as the student, so they see only their own rows.
drop policy audience on announcements;
create policy audience on announcements for select to authenticated using (
  is_staff()
  or (my_role() = 'student' and publish_at <= now() and (
        audience = 'all'
     or (audience = 'level' and audience_level =
           (select level_id from students where profile_id = auth.uid()))
     or (audience = 'mentees' and created_by =
           (select mentor_id from students where profile_id = auth.uid()))
     or (audience = 'group' and audience_group in
           (select group_id from group_members where profile_id = auth.uid())))));

-- Posting stays as in 0001 (staff_post: coordinators and the Guru). Editing and deleting: the
-- author while they are still staff, or the Guru. 0001's own_edit let a former coordinator edit.
drop policy own_edit on announcements;
create policy own_edit on announcements for update to authenticated
  using (is_staff() and (created_by = auth.uid() or is_guru()))
  with check (is_staff() and (created_by = auth.uid() or is_guru()));
create policy own_delete on announcements for delete to authenticated
  using (is_staff() and (created_by = auth.uid() or is_guru()));

-- Read receipts. 0001's own_reads allowed everything on one's own rows and let staff delete
-- anyone's. Now: a person reads their own receipts (staff read all, for "seen by"); a receipt is
-- added only by the reader, only for an announcement they can see (the subquery goes through the
-- policy above), and never changed or removed from the app. It disappears only with its
-- announcement (on delete cascade).
drop policy own_reads on announcement_reads;
create policy own_or_staff on announcement_reads for select to authenticated
  using (profile_id = auth.uid() or is_staff());
create policy own_insert on announcement_reads for insert to authenticated
  with check (profile_id = auth.uid() and announcement_id in (select id from announcements));

-- The app may send only announcement_id: profile_id is always the login (default auth.uid()) and
-- read_at always the moment of reading (default now()).
revoke all on announcement_reads from public, anon, authenticated;
grant select on announcement_reads to authenticated;
grant insert (announcement_id) on announcement_reads to authenticated;

-- ---------------------------------------------------------------- who it is addressed to
-- One row per person an announcement is addressed to who can open it in the app, with the time
-- they first opened it (empty = not seen yet). It must agree with the "audience" policy above:
--   all      every active student login
--   level    active student logins whose student record is at that level
--   mentees  active student logins whose mentor is the author
--   staff    the active Guru and coordinators
--   group    active members of the group who are students or staff
-- The author is never counted. security_invoker = true (docs/DECISIONS.md #20): it reads the
-- tables as the person asking, so staff see everyone and a student only their own row.
create view announcement_audience with (security_invoker = true) as
select a.id as announcement_id,
       p.id as profile_id,
       -- The name on the student record, which is the one coordinators know; staff have none.
       coalesce(s.full_name, p.full_name) as full_name,
       s.roll_no,
       p.role,
       r.read_at
  from announcements a
  join profiles p on p.active and p.id is distinct from a.created_by
  left join students s on s.profile_id = p.id
  left join announcement_reads r on r.announcement_id = a.id and r.profile_id = p.id
 where case a.audience
         when 'all'     then p.role = 'student'
         when 'level'   then p.role = 'student' and s.level_id = a.audience_level
         when 'mentees' then p.role = 'student' and s.mentor_id = a.created_by
         when 'staff'   then p.role in ('guru', 'coordinator')
         when 'group'   then p.role in ('guru', 'coordinator', 'student')
                             and exists (select 1 from group_members gm
                                          where gm.group_id = a.audience_group and gm.profile_id = p.id)
         else false
       end;

-- "Seen by N of M" for each announcement, counted in the database (Supabase does not allow
-- count() in app queries by default, and the phone should not download every read receipt).
-- no_login: students the announcement is meant for who have no app login and must be told in
-- class. Students who have left are not counted there.
create view announcement_seen with (security_invoker = true) as
select a.id as announcement_id,
       count(aa.profile_id)::int as addressed,
       count(aa.read_at)::int as seen,
       case when a.audience in ('all', 'level', 'mentees') then (
         select count(*)::int from students s
          where s.profile_id is null and s.status <> 'left'
            and (a.audience = 'all'
              or (a.audience = 'level' and s.level_id = a.audience_level)
              or (a.audience = 'mentees' and s.mentor_id = a.created_by)))
       else 0 end as no_login
  from announcements a
  left join announcement_audience aa on aa.announcement_id = a.id
 group by a.id;

revoke all on announcement_audience, announcement_seen from public, anon, authenticated;
grant select on announcement_audience, announcement_seen to authenticated;

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14: trigger functions are internal; no app role may call them directly.
revoke execute on function guard_announcement() from public, anon, authenticated;

-- ---------------------------------------------------------------- descriptions
comment on function guard_announcement is 'Trigger: an announcement needs a title and text (at most 120 / 4000 characters), a level or group when its audience needs one, and records the signed-in person as author (docs/DECISIONS.md #25).';
comment on column announcements.audience is 'all = all students; level = students at audience_level; mentees = the author''s mentees; staff = Guru and coordinators; group = members of audience_group. Staff see every announcement.';
comment on column announcements.audience_level is 'Level the announcement is for. Set only when audience = level.';
comment on column announcements.audience_group is 'Group the announcement is for. Set only when audience = group.';
comment on column announcements.pinned is 'Shown at the top of the list until unpinned.';
comment on column announcements.publish_at is 'When students can see it. In the future = scheduled; staff see it at once.';
comment on column announcements.created_by is 'Author. Set by the database from the login; only the author or the Guru can edit or delete.';
comment on column announcements.attachments is 'Not used yet (images and files come later). Always an empty list for now.';
comment on constraint announcements_level_target on announcements is 'audience_level is set exactly when audience = level.';
comment on constraint announcements_group_target on announcements is 'audience_group is set exactly when audience = group.';
comment on table announcement_reads is 'Who has opened which announcement, and when (for "seen by 23 of 40"). Written only by the reader.';
comment on column announcement_reads.read_at is 'When the person first opened the announcement. Set by the database.';
comment on view announcement_audience is 'One row per person an announcement is addressed to who can open it in the app, with read_at (empty = not seen). Follows row-level security.';
comment on column announcement_audience.full_name is 'Name on the student record, or the login''s name for staff.';
comment on column announcement_audience.read_at is 'When they first opened it; empty = not seen yet.';
comment on view announcement_seen is 'Seen-by counts per announcement: addressed (people who can open it), seen, and no_login (students it is meant for who have no app login).';
comment on column announcement_seen.addressed is 'People the announcement is addressed to who can open it in the app (the author is not counted).';
comment on column announcement_seen.seen is 'How many of them have opened it.';
comment on column announcement_seen.no_login is 'Students it is meant for who have no app login (not counting students who have left): tell them in class.';
comment on table audit_log is 'Who changed students, profiles, call logs, levels, syllabus ticks or announcements, and when. Guru only.';
