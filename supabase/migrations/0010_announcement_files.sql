-- Mridanga Seva — 0010: photos and PDFs on announcements (screens C15 and S10).
-- Run once, after 0008_announcement_follow_ups.sql and any migration numbered below this one, in
-- the Supabase SQL editor.
-- Why: docs/DECISIONS.md #32. How: docs/DATABASE.md "Announcements" → "Photos and PDFs".
--
-- The files themselves live in Supabase Storage, in a private bucket; announcements.attachments
-- (a JSON list, there since 0001 and unused until now) says which files belong to which
-- announcement. The app uploads a file first, into a folder named after the uploader's login, and
-- then saves the announcement with the file in its list. This migration adds:
-- 1. The bucket announcement-files: private, at most 5 MB a file, only JPEG, PNG, WebP and PDF.
--    Storage refuses anything else before it is saved.
-- 2. Rules for the list, however it is written: at most 3 files, each with a proper path, name,
--    kind and size; an app user can add only files they uploaded themselves.
-- 3. Who may open a file: exactly the people who may read an announcement that lists it (the
--    announcements row-level security from 0007 decides), plus staff for the files in their own
--    folder while they post. Everyone else, including anyone without a login, gets nothing, and
--    the app shows files only through signed links that stop working after an hour.
-- 4. Who may delete a file: the uploader, the Guru, or the author of the announcement that lists
--    it. Deleting a row in SQL does NOT remove the file itself from Storage, so the app removes
--    files through the Storage API when an announcement or one of its files is deleted.
-- 5. Adding or removing a file on a published announcement counts as an edit ("Edited").

-- ---------------------------------------------------------------- 1. the bucket
-- 5 MB = 5 * 1024 * 1024 bytes. Photos are made smaller on the phone before upload (about 1600
-- pixels on the longest side), so they are usually far below the limit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('announcement-files', 'announcement-files', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
   set public = false,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------- 2. rules for the file list
-- A file path is '<login id>/<random id>.<jpg|png|webp|pdf>', both ids in the usual 36-character
-- form. The folder is the uploader's login id, which is how the policies below know who uploaded
-- it without trusting anything the app says.
create or replace function announcement_file_path_ok(p_path text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(p_path ~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
                            '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
                            '\.(jpg|png|webp|pdf)$'), false)
$$;

-- Each entry of announcements.attachments is {"path", "name", "kind", "size"}:
--   path  where the file is in the bucket (see above)
--   name  what the reader sees, e.g. "Rath Yatra route.pdf"; 1 to 120 characters
--   kind  'image' or 'pdf', matching the path's ending
--   size  in bytes; for a newly added file it is taken from Storage, not from the app
-- Other keys are dropped. Error codes (the app turns them into messages,
-- src/data/announcement-files.ts):
--   attachments_invalid    not a list, a bad entry, or the same file twice
--   too_many_attachments   more than 3 files
--   attachment_not_yours   an app user added a file from someone else's folder
--   attachment_missing     an app user added a file that is not in Storage
-- The dashboard and seed.sql (no signed-in user) are only checked for the shape.
-- Security invoker: the Storage lookup reads storage.objects as the person saving, whose
-- row-level security (below) lets staff see their own uploads.
create or replace function guard_announcement_attachments() returns trigger
language plpgsql set search_path = public as $$
declare
  v_item   jsonb;
  v_path   text;
  v_name   text;
  v_kind   text;
  v_want   text;
  v_size   bigint;
  v_stored bigint;
  v_clean  jsonb := '[]';
  v_old    jsonb := case when tg_op = 'UPDATE' then coalesce(old.attachments, '[]') else '[]' end;
begin
  new.attachments := coalesce(new.attachments, '[]');
  if jsonb_typeof(new.attachments) <> 'array' then
    raise exception 'attachments_invalid' using detail = 'attachments must be a JSON list.';
  end if;
  if jsonb_array_length(new.attachments) > 3 then
    raise exception 'too_many_attachments' using detail = 'An announcement has at most 3 files.';
  end if;

  for v_item in select value from jsonb_array_elements(new.attachments) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'attachments_invalid' using detail = 'Each file is a JSON object.';
    end if;
    v_path := v_item ->> 'path';
    v_name := btrim(coalesce(v_item ->> 'name', ''), E' \t\r\n');
    v_kind := v_item ->> 'kind';
    v_size := case when jsonb_typeof(v_item -> 'size') = 'number' then (v_item ->> 'size')::numeric::bigint end;
    -- Worked out first: inside IF, PL/pgSQL would read the CASE's THEN as the end of the test.
    v_want := case when v_path like '%.pdf' then 'pdf' else 'image' end;
    if not announcement_file_path_ok(v_path)
       or v_name = '' or char_length(v_name) > 120
       or v_kind is null or v_kind <> v_want
       or v_size is null or v_size < 1 or v_size > 5242880 then
      raise exception 'attachments_invalid'
        using detail = 'A file needs a proper path, a name of 1 to 120 characters, kind image or pdf, and a size up to 5 MB.';
    end if;
    if v_clean @> jsonb_build_array(jsonb_build_object('path', v_path)) then
      raise exception 'attachments_invalid' using detail = 'The same file is listed twice.';
    end if;

    -- A file that was already on this announcement stays as it was. A new one must be the
    -- signed-in person's own upload, and must really be in Storage.
    if auth.uid() is not null and not v_old @> jsonb_build_array(jsonb_build_object('path', v_path)) then
      if split_part(v_path, '/', 1) <> auth.uid()::text then
        raise exception 'attachment_not_yours' using detail = 'Only files you uploaded yourself can be added.';
      end if;
      select (o.metadata ->> 'size')::bigint into v_stored
        from storage.objects o
       where o.bucket_id = 'announcement-files' and o.name = v_path;
      if not found then
        raise exception 'attachment_missing' using detail = 'The file is not in Storage; upload it first.';
      end if;
      v_size := coalesce(v_stored, v_size);
    end if;

    v_clean := v_clean || jsonb_build_array(jsonb_build_object(
      'path', v_path, 'name', v_name, 'kind', v_kind, 'size', v_size));
  end loop;

  new.attachments := v_clean;
  return new;
end $$;

-- Runs before announcements_guard (triggers run in name order), which then sees the tidied list.
create trigger announcements_attachments_guard before insert or update on announcements
  for each row execute function guard_announcement_attachments();

-- Finds the announcements that list a file quickly (used by the policies below).
create index announcements_attachments_idx on announcements using gin (attachments jsonb_path_ops);

-- ---------------------------------------------------------------- 5. a file change is an edit
-- guard_announcement from 0008, with attachments added to the fields that make a published
-- announcement "Edited" (docs/DECISIONS.md #27). Everything else is unchanged.
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

  if old.publish_at <= now()
     and (new.title, new.body, new.audience, new.audience_level, new.audience_group, new.attachments)
         is distinct from (old.title, old.body, old.audience, old.audience_level, old.audience_group, old.attachments) then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- 3 and 4. who may upload, open and delete
-- Each rule is a small function so the policies stay readable, and so they run with a fixed
-- search_path whatever connection Storage uses. They are security invoker: the lookup in
-- announcements goes through its row-level security (0007), so "an announcement that lists the
-- file" means one the caller may read.

-- Open (and make a signed link for) a file: it is listed by an announcement the caller may read,
-- or the caller is staff and it is in their own folder (their upload, before it is posted), or
-- the caller is the Guru.
create or replace function announcement_file_readable(p_name text) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from announcements a
                  where a.attachments @> jsonb_build_array(jsonb_build_object('path', p_name)))
      or (is_staff() and (split_part(p_name, '/', 1) = auth.uid()::text or is_guru()))
$$;

-- Upload: coordinators and the Guru, only into their own folder, only a proper file name.
create or replace function announcement_file_uploadable(p_name text) returns boolean
language sql stable set search_path = public as $$
  select is_staff() and split_part(p_name, '/', 1) = auth.uid()::text and announcement_file_path_ok(p_name)
$$;

-- Delete: the uploader, the Guru, or the author of an announcement that lists the file (who may
-- remove a file the Guru added to their announcement). Only coordinators and the Guru.
create or replace function announcement_file_deletable(p_name text) returns boolean
language sql stable set search_path = public as $$
  select is_staff() and (
       split_part(p_name, '/', 1) = auth.uid()::text
    or is_guru()
    or exists (select 1 from announcements a
                where a.created_by = auth.uid()
                  and a.attachments @> jsonb_build_array(jsonb_build_object('path', p_name))))
$$;

-- Storage keeps one row per file in storage.objects, with row-level security on. These policies
-- are the only ones for this bucket; there is no update policy, so a file can never be replaced
-- or moved, only deleted and uploaded again. Policy names say which bucket they are for, because
-- every bucket's policies share storage.objects.
create policy "announcement files: read" on storage.objects for select to authenticated
  using (bucket_id = 'announcement-files' and public.announcement_file_readable(name));
create policy "announcement files: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'announcement-files' and public.announcement_file_uploadable(name));
create policy "announcement files: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'announcement-files' and public.announcement_file_deletable(name));

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14. The trigger function is internal. The three rule functions and the path
-- check are run by row-level security as the person asking, so signed-in people need them; they
-- answer only yes or no about that person's own access.
revoke execute on function guard_announcement_attachments(), guard_announcement() from public, anon, authenticated;
revoke execute on function announcement_file_path_ok(text), announcement_file_readable(text),
  announcement_file_uploadable(text), announcement_file_deletable(text) from public, anon, authenticated;
grant execute on function announcement_file_path_ok(text), announcement_file_readable(text),
  announcement_file_uploadable(text), announcement_file_deletable(text) to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on column announcements.attachments is 'Photos and PDFs, at most 3: a list of {path, name, kind image|pdf, size in bytes}. The files are in the private Storage bucket announcement-files (docs/DECISIONS.md #32).';
comment on function guard_announcement_attachments is 'Trigger: at most 3 files, each {path, name, kind, size}; an app user adds only files they uploaded, which must be in Storage (docs/DECISIONS.md #32).';
comment on function guard_announcement is 'Trigger: an announcement needs a title and text (at most 120 / 4000 characters) and a level or group when its audience needs one; records the signed-in person as author; sets edited_at when a published one is changed, files included; a published one keeps its publish time (docs/DECISIONS.md #25, #27, #32).';
comment on function announcement_file_path_ok is 'True for a file path of the form <login id>/<random id>.<jpg|png|webp|pdf> in the announcement-files bucket.';
comment on function announcement_file_readable is 'Storage rule: the caller may open this file (it is on an announcement they may read, or it is staff''s own upload, or they are the Guru).';
comment on function announcement_file_uploadable is 'Storage rule: the caller (staff) may upload this file into their own folder.';
comment on function announcement_file_deletable is 'Storage rule: the caller (staff) may delete this file: their upload, any file for the Guru, or a file on their own announcement.';
comment on index announcements_attachments_idx is 'Finds the announcements that list a file, for the Storage rules.';
