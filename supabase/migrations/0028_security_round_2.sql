-- Mridanga Seva — 0028: security round 2 (audit brief 5). A login's identity columns are frozen in
-- the app, a 'student' login without a student record gets nothing, and a file already posted on an
-- announcement, a material or a sloka cannot be swapped by deleting and uploading it again.
-- Run once, after 0027, in the Supabase SQL editor (TEST first).
-- Why: docs/DECISIONS.md #96-#98 and #100 (#99 is the app half, shipped as an update). How: docs/DATABASE.md
-- "Security round 2 (0028)".
--
-- Praveen decided on 6 Oct 2026: everyone may still edit their own name, but invisible characters
-- and the name of the Guru or a coordinator are refused; a student marked Left keeps announcements,
-- photos, materials and pushes until the Guru switches the login off; only a login with NO student
-- record loses them.
--
-- 1. A 'student' login with no student record counts as waiting (pending) everywhere my_role() is
--    asked; the announcement and event audiences need the record too; such logins become pending;
--    a login taken off a record goes back to pending; materials need a class role (#96).
-- 2. Profiles: email, created_at and centre_id are frozen for app users; email follows the sign-in
--    email (auth.users); names without invisible characters and not a staff member's name; a phone
--    has 7 to 15 digits (#97).
-- 3. A file path that an announcement, a material or a sloka lists cannot be uploaded again (#98).
-- 4. A minor on record keeps a guardian with a phone (#100).

-- ---------------------------------------------------------------- 1. a student needs a record
-- my_role() is what every rule asks ("is this a student?"). A login whose profile says 'student'
-- but that no student record points at (the record was deleted or unlinked outside the app, or the
-- role was set in the dashboard) is treated as 'pending': no announcements, files, materials,
-- events, pushes or syllabus. Security definer as before: it reads students past row-level security.
-- students.profile_id is unique, so the lookup is one index probe.
create or replace function my_role() returns app_role
language sql stable security definer set search_path = public as $$
  select case
           when p.role = 'student' and not exists (select 1 from students s where s.profile_id = p.id)
             then 'pending'::app_role
           else p.role
         end
    from profiles p
   where p.id = auth.uid() and p.active
$$;

-- The audiences are worked out for other people (pushes, inbox, "seen by"), so they read
-- profiles.role directly and need the same rule: a student counts only with a record (s.id).
-- Otherwise as in 0007 (announcements) and 0022 (events and polls).
create or replace view announcement_audience with (security_invoker = true) as
select a.id as announcement_id,
       p.id as profile_id,
       coalesce(s.full_name, p.full_name) as full_name,
       s.roll_no,
       p.role,
       r.read_at
  from announcements a
  join profiles p on p.active and p.id is distinct from a.created_by
  left join students s on s.profile_id = p.id
  left join announcement_reads r on r.announcement_id = a.id and r.profile_id = p.id
 where case a.audience
         when 'all'     then p.role = 'student' and s.id is not null
         when 'level'   then p.role = 'student' and s.level_id = a.audience_level
         when 'mentees' then p.role = 'student' and s.mentor_id = a.created_by
         when 'staff'   then p.role in ('guru', 'coordinator')
         when 'group'   then (p.role in ('guru', 'coordinator') or (p.role = 'student' and s.id is not null))
                             and exists (select 1 from group_members gm
                                          where gm.group_id = a.audience_group and gm.profile_id = p.id)
         else false
       end;

create or replace function audience_profiles(p_audience text, p_level smallint, p_group bigint, p_author uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id
    from profiles p
    left join students s on s.profile_id = p.id
   where p.active
     and case p_audience
           when 'all'     then p.role = 'student' and s.id is not null
           when 'level'   then p.role = 'student' and s.level_id = p_level
           when 'mentees' then p.role = 'student' and s.mentor_id = p_author
           when 'staff'   then p.role in ('guru', 'coordinator')
           when 'group'   then (p.role in ('guru', 'coordinator') or (p.role = 'student' and s.id is not null))
                               and exists (select 1 from group_members gm
                                            where gm.group_id = p_group and gm.profile_id = p.id)
           else false
         end
$$;

-- Logins that are 'student' today without a record go back to waiting, as 0025 does for a deleted
-- record. Their phones are forgotten: they are no longer sent anything.
delete from push_tokens t
 using profiles p
 where t.profile_id = p.id and p.role = 'student'
   and not exists (select 1 from students s where s.profile_id = p.id);
update profiles p set role = 'pending'
 where p.role = 'student' and not exists (select 1 from students s where s.profile_id = p.id);

-- When a record's login changes (the dashboard, or a linking function), the old login goes back to
-- waiting unless another record still points at it. 0025 does the same for a deleted record
-- (students_release_login) and in unlink_student_login.
create or replace function release_old_student_login() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from students s where s.profile_id = old.profile_id) then
    update profiles set role = 'pending' where id = old.profile_id and role = 'student';
    delete from push_tokens where profile_id = old.profile_id;
  end if;
  return new;
end $$;
create trigger students_release_old_login after update of profile_id on students
  for each row when (old.profile_id is not null and old.profile_id is distinct from new.profile_id)
  execute function release_old_student_login();

-- Materials (0001's policy "visible"): the student branch asked only for the level, so any login
-- (waiting, door tablet, a stranger) read the approved materials for every level, and through
-- material_file_readable their files. Now staff, or a student (with a record, Left included).
drop policy visible on materials;
create policy visible on materials for select to authenticated using (
  is_staff() or (coalesce(my_role() = 'student', false) and approved_by is not null and (level_id is null or level_id <=
    (select level_id from students where profile_id = auth.uid()))));

-- ---------------------------------------------------------------- 2. profiles
-- Extends 0013's guard. For app users (the app connects as anon or authenticated; the dashboard,
-- the SQL editor and the security definer linking functions are not checked):
--   profile_field_locked   id, email, created_at or centre_id changed (detail names the field).
--                          The email follows the sign-in email (below); the centre is set in the
--                          dashboard.
-- For a signed-in person changing a name or phone (older rows are left as they are):
--   name_required, name_too_long   1 to 80 characters
--   name_invalid                   control or invisible characters (zero-width space, direction
--                                  marks, word joiners, BOM). Zero-width joiner / non-joiner
--                                  (U+200C, U+200D) are allowed: Telugu and Hindi spelling uses them.
--   name_taken                     the name (ignoring case and repeated spaces) of the Guru or a
--                                  coordinator other than the person
--   phone_invalid                  digits, spaces and an optional leading +, with 7 to 15 digits
create or replace function staff_name_taken(p_id uuid, p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
     where p.id is distinct from p_id and p.role in ('guru', 'coordinator')
       and lower(regexp_replace(btrim(p.full_name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(p_name), '\s+', ' ', 'g')))
$$;

create or replace function guard_profile_details() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.id is distinct from old.id then
      raise exception 'profile_field_locked' using detail = 'id';
    end if;
    if new.email is distinct from old.email then
      raise exception 'profile_field_locked' using detail = 'email: it follows the sign-in email.';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception 'profile_field_locked' using detail = 'created_at';
    end if;
    if new.centre_id is distinct from old.centre_id then
      raise exception 'profile_field_locked' using detail = 'centre_id: set in the dashboard.';
    end if;
  end if;

  if auth.uid() is null then return new; end if;
  if new.full_name is distinct from old.full_name then
    new.full_name := btrim(coalesce(new.full_name, ''), E' \t\r\n');
    if new.full_name = '' then raise exception 'name_required'; end if;
    if char_length(new.full_name) > 80 then
      raise exception 'name_too_long' using detail = 'A name is at most 80 characters.';
    end if;
    if new.full_name ~ '[\u0001-\u001f\u007f-\u009f\u200b\u200e\u200f\u2028-\u202e\u2060-\u2064\ufeff]' then
      raise exception 'name_invalid' using detail = 'A name cannot hold control or invisible characters.';
    end if;
    if staff_name_taken(new.id, new.full_name) then
      raise exception 'name_taken' using detail = 'This is the name of the Guru or a coordinator. Add a surname or an initial.';
    end if;
  end if;
  if new.phone is distinct from old.phone then
    new.phone := nullif(btrim(new.phone), '');
    if new.phone !~ '^\+?[0-9 ]+$'
       or char_length(regexp_replace(new.phone, '[^0-9]', '', 'g')) not between 7 and 15 then
      raise exception 'phone_invalid' using detail = 'A phone number has 7 to 15 digits, with spaces and an optional + first.';
    end if;
  end if;
  return new;
end $$;

-- profiles.email is a copy of the sign-in email (handle_new_user, 0002). When a person changes the
-- sign-in email (Supabase changes auth.users.email once the new address is confirmed), the copy
-- follows, and a login still waiting is linked to a student record with that email, as on sign-up.
-- The old copy could go stale, and the Table Editor matched on it (docs/OPERATIONS.md now says to
-- give roles in G2 or by the login's user id).
create or replace function sync_profile_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles set email = new.email where id = new.id and email is distinct from new.email;
  if new.email_confirmed_at is not null then
    perform link_login_to_student(new.id, new.email);
  end if;
  return new;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function sync_profile_email();

-- Copies that an app user rewrote before this migration are put right now.
update profiles p set email = u.email
  from auth.users u
 where u.id = p.id and p.email is distinct from u.email;

-- ---------------------------------------------------------------- 3. posted files stay as posted
-- Storage has no update policy on these buckets, so a file cannot be replaced in place; but its
-- uploader could delete it and upload different content under the same name while an announcement
-- still listed it, with no "Edited" mark. Now a name that an announcement (0010), a material (0013,
-- 0023) or a sloka recording (0021) lists cannot be uploaded again. Deleting stays as before (the
-- app removes an announcement's files just before the announcement); a file removed from an
-- announcement by an edit is marked Edited (0010). The lookups go through the tables' row-level
-- security as the uploader, who is staff (or an Ishtagoshti editor) and sees every row.
create or replace function announcement_file_uploadable(p_name text) returns boolean
language sql stable set search_path = public as $$
  select is_staff() and split_part(p_name, '/', 1) = auth.uid()::text and announcement_file_path_ok(p_name)
     and not exists (select 1 from announcements a
                      where a.attachments @> jsonb_build_array(jsonb_build_object('path', p_name)))
$$;

create or replace function material_file_uploadable(p_name text) returns boolean
language sql stable set search_path = public as $$
  select split_part(p_name, '/', 1) = auth.uid()::text and announcement_file_path_ok(p_name)
     and not exists (select 1 from materials m where m.storage_path = p_name)
     and (is_guru()
          or (my_role() = 'coordinator'
              and (select count(*) from storage.objects o
                    where o.bucket_id = 'material-files'
                      and split_part(o.name, '/', 1) = auth.uid()::text
                      and o.created_at > now() - interval '1 day') < 10))
$$;

create or replace function ig_audio_uploadable(p_name text) returns boolean
language sql stable set search_path = public as $$
  select is_ig_editor() and split_part(p_name, '/', 1) = auth.uid()::text and ig_audio_path_ok(p_name)
     and not exists (select 1 from ig_slokas s where s.audio_path = p_name)
$$;

-- ---------------------------------------------------------------- 4. a minor's guardian keeps a phone
-- register_student (0003, 0025) refuses a minor without a guardian's name AND phone, but 0025's
-- commit-time check asked only for "a guardian", so the phone could be cleared afterwards (found by
-- the consent-edge tests, D14-02). Now a minor on record keeps at least one guardian with a phone;
-- the check also runs when a guardian's phone changes. Otherwise as 0025.
create or replace function recheck_minor_consent() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
  v_id  uuid;
  s     students;
begin
  if tg_op = 'UPDATE' then
    v_ids := array[old.student_id, new.student_id];
  else
    v_ids := array[old.student_id];
  end if;
  foreach v_id in array v_ids loop
    select * into s from students where id = v_id;
    continue when not found or s.withdrawn_at is not null or not is_minor(s);
    if not exists (select 1 from consents c
                    where c.student_id = v_id and c.scope = 'data' and c.revoked_at is null) then
      raise exception 'minor_needs_consent'
        using detail = format('Student %s is under 18 and would have no parental consent on record.', s.roll_no),
              hint = 'Record a new consent first, or use withdraw_consent (the Guru).';
    end if;
    if not exists (select 1 from guardians g where g.student_id = v_id and coalesce(btrim(g.phone), '') <> '') then
      raise exception 'minor_needs_guardian'
        using detail = format('Student %s is under 18 and would have no parent or guardian with a phone on record.', s.roll_no);
    end if;
  end loop;
  return null;
end $$;
drop trigger guardians_minor_recheck on guardians;
create constraint trigger guardians_minor_recheck
  after update of student_id, phone or delete on guardians
  deferrable initially deferred
  for each row execute function recheck_minor_consent();

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14 and #77. Triggers are internal. staff_name_taken is asked by the profile
-- guard as the person saving, so signed-in people need it; it answers yes or no about one name,
-- and staff names are no secret to the class (staff_names, 0008).
revoke execute on function release_old_student_login(), sync_profile_email() from public, anon, authenticated;
revoke execute on function staff_name_taken(uuid, text) from public, anon;
grant execute on function staff_name_taken(uuid, text) to authenticated;
revoke execute on function audience_profiles(text, smallint, bigint, uuid) from public, anon;

-- ---------------------------------------------------------------- descriptions
comment on function my_role is 'The signed-in person''s role, or null when switched off or without a profile. A student login with no student record counts as pending (docs/DECISIONS.md #96).';
comment on function audience_profiles is 'Logins an event or poll audience covers (active; a student only with a student record). Ids only.';
comment on view announcement_audience is 'One row per person an announcement is addressed to who can open it in the app (a student only with a student record), with read_at (empty = not seen). Follows row-level security.';
comment on function release_old_student_login is 'Trigger: when a student record''s login changes, the old login goes back to pending (and its phones are forgotten) unless another record points at it.';
comment on function staff_name_taken is 'True when the name (ignoring case and repeated spaces) is that of the Guru or a coordinator other than p_id. Used by guard_profile_details.';
comment on function guard_profile_details is 'Trigger: app users cannot change id, email, created_at or centre_id; a changed name is 1-80 characters, without invisible characters, and not a staff member''s name; a changed phone has 7-15 digits (docs/DECISIONS.md #97).';
comment on function sync_profile_email is 'Trigger on auth.users: profiles.email follows a changed sign-in email; a waiting login is linked to a student record with that email.';
comment on function announcement_file_uploadable is 'Storage rule: staff may upload into their own folder, under a name no announcement lists (docs/DECISIONS.md #98).';
comment on function material_file_uploadable is 'Storage rule: the Guru, or a coordinator (10 a day), into their own folder, under a name no material lists.';
comment on function recheck_minor_consent is 'Trigger at commit: a minor on record (not withdrawn) keeps a current data consent and a guardian with a phone (docs/DECISIONS.md #100).';
comment on function ig_audio_uploadable is 'Storage rule: Ishtagoshti editors, into their own folder, under a name no sloka lists.';
