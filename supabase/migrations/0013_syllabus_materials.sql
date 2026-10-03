-- Mridanga Seva — 0013: the Guru edits the syllabus (G4) and the materials library (G5);
-- students see the lessons of their level (S4); own name and phone on the profile (A3).
-- Run once, after 0011_push_notifications.sql and any migration numbered below this one, in the
-- Supabase SQL editor. It does not touch the tables of 0012 (assessments).
-- Why: docs/DECISIONS.md #44. How: docs/DATABASE.md "Syllabus editor" and "Materials".
--
-- 1. A syllabus item can be retired instead of deleted. Ticks already given (C9) stay in
--    student_progress for ever, so an item with ticks can never be deleted, only retired; a
--    retired item cannot be ticked any more and no longer counts in progress. Deleting is only
--    for an item nobody has ticked and no material points to (a typing mistake).
-- 2. Items keep their teaching order: a new one goes to the end of its level, move_syllabus_item
--    swaps one with its neighbour. Title and description are checked however a row is written.
-- 3. Materials: a YouTube link (lesson videos are unlisted YouTube), a PDF or a photo, for one
--    level or all levels, and optionally one syllabus item. PDFs and photos live in the private
--    Storage bucket material-files (10 MB a file), uploaded by the Guru; a student may open a file
--    exactly when they may read the material that lists it.
-- 4. Every change to syllabus items and materials goes to audit_log.
-- 5. A person may change their own name and phone (A3); both are checked.

-- ---------------------------------------------------------------- 1 and 2. syllabus items
alter table syllabus_items add column retired_at timestamptz;

-- Error codes (the app turns them into messages, src/data/syllabus-editor.ts):
--   title_required, title_too_long        1 to 120 characters after trimming
--   description_too_long                  at most 1000 characters
--   item_has_ticks                        moving a ticked item to another level, or deleting it
--   item_has_materials                    deleting an item that materials point to
-- Security invoker: it only checks and adjusts the row being written; the lookups read tables
-- staff may read.
create or replace function guard_syllabus_item() returns trigger
language plpgsql set search_path = public as $$
begin
  new.title := btrim(coalesce(new.title, ''), E' \t\r\n');
  if new.title = '' then raise exception 'title_required'; end if;
  if char_length(new.title) > 120 then
    raise exception 'title_too_long' using detail = 'A syllabus item''s title is at most 120 characters.';
  end if;
  new.description := nullif(btrim(new.description, E' \t\r\n'), '');
  if char_length(new.description) > 1000 then
    raise exception 'description_too_long' using detail = 'A description is at most 1000 characters.';
  end if;

  if tg_op = 'INSERT' then
    -- No position given = the end of the level, after the retired items too, so the unique
    -- (level, sort) never clashes.
    if new.sort is null then
      select coalesce(max(sort), 0) + 1 into new.sort from syllabus_items where level_id = new.level_id;
    end if;
    return new;
  end if;

  if new.level_id is distinct from old.level_id then
    if exists (select 1 from student_progress p where p.item_id = old.id) then
      raise exception 'item_has_ticks' using detail = 'A ticked item stays in its level. Retire it and add a new one instead.';
    end if;
    select coalesce(max(sort), 0) + 1 into new.sort from syllabus_items where level_id = new.level_id;
  end if;
  -- Retiring stamps the moment; the app may send any time.
  if new.retired_at is not null and old.retired_at is null then
    new.retired_at := now();
  end if;
  return new;
end $$;

create trigger syllabus_items_guard before insert or update on syllabus_items
  for each row execute function guard_syllabus_item();

-- student_progress.item_id deletes ticks with the item (0001, on delete cascade). This trigger
-- runs first and refuses, so a delete can never take ticks with it.
create or replace function protect_syllabus_item() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from student_progress p where p.item_id = old.id) then
    raise exception 'item_has_ticks' using detail = 'Students have this item ticked. Retire it instead of deleting it.';
  end if;
  if exists (select 1 from materials m where m.item_id = old.id) then
    raise exception 'item_has_materials' using detail = 'Materials point to this item. Remove them first, or retire the item.';
  end if;
  return old;
end $$;

create trigger syllabus_items_protect before delete on syllabus_items
  for each row execute function protect_syllabus_item();

-- A retired item cannot be ticked any more (an untick still works, and existing ticks stay).
create or replace function guard_progress_item_in_use() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from syllabus_items i where i.id = new.item_id and i.retired_at is not null) then
    raise exception 'item_retired' using detail = 'This syllabus item is no longer taught and cannot be ticked.';
  end if;
  return new;
end $$;

create trigger student_progress_item_in_use before insert on student_progress
  for each row execute function guard_progress_item_in_use();

-- Moves an item one place up (p_up true) or down in its level's teaching order, past the next
-- item in use (retired items keep their place and are skipped). Guru only. Returns false when
-- the item is already first or last. Security invoker: row-level security (guru_write from 0001)
-- applies as well. The unique (level, sort) is checked after every row, so the two positions are
-- swapped in three steps through a free negative one.
create or replace function move_syllabus_item(p_item bigint, p_up boolean) returns boolean
language plpgsql security invoker set search_path = public as $$
declare
  me   syllabus_items;
  them syllabus_items;
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into me from syllabus_items where id = p_item for update;
  if not found then raise exception 'item_not_found'; end if;
  if p_up then
    select * into them from syllabus_items
     where level_id = me.level_id and retired_at is null and sort < me.sort order by sort desc limit 1 for update;
  else
    select * into them from syllabus_items
     where level_id = me.level_id and retired_at is null and sort > me.sort order by sort limit 1 for update;
  end if;
  if not found then return false; end if;
  update syllabus_items set sort = -me.sort where id = me.id;
  update syllabus_items set sort = me.sort where id = them.id;
  update syllabus_items set sort = them.sort where id = me.id;
  return true;
end $$;

-- G4: how many students have each item ticked and how many materials point to it, so the editor
-- knows whether an item may be deleted. Counted here because a list of every tick would pass the
-- API's 1000-row limit with 200 students. Security invoker: a student would count only their own
-- ticks; the app asks only for staff.
create or replace function syllabus_item_counts()
returns table (item_id bigint, ticks int, materials int)
language sql stable security invoker set search_path = public as $$
  select i.id,
         (select count(*)::int from student_progress p where p.item_id = i.id),
         (select count(*)::int from materials m where m.item_id = i.id)
    from syllabus_items i
$$;

create trigger audit_syllabus_items after insert or update or delete on syllabus_items
  for each row execute function audit_row();

-- S1: progress counts the items in use only; ticks on retired items stay but do not count.
-- Same as 0009 otherwise.
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
                            and v.check_in >= week_start_ist()::timestamp at time zone 'Asia/Kolkata'),
    'syllabus_done',    (select count(*) from student_progress p
                           join syllabus_items i on i.id = p.item_id
                          where p.student_id = o.id and i.level_id = o.level_id and i.retired_at is null),
    'syllabus_total',   (select count(*) from syllabus_items i
                          where i.level_id = o.level_id and i.retired_at is null))
  from students s
  join student_overview o on o.id = s.id
  where s.profile_id = auth.uid()
$$;

-- ---------------------------------------------------------------- 3. materials
alter table materials add column file_name text;
alter table materials add column file_size bigint;

-- 10 MB = 10 * 1024 * 1024 bytes: room for a scanned notation booklet. Photos are made smaller on
-- the phone first (about 1600 pixels), as for announcements.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('material-files', 'material-files', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
   set public = false,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- True for a YouTube video link the app can open: youtube.com/watch?v=, /shorts/, /live/,
-- /embed/, or youtu.be/, each with the 11-character video id. Unlisted videos have such links too.
create or replace function youtube_link_ok(p_url text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(p_url ~ ('^https://(www\.|m\.)?(youtube\.com/(watch\?(.*&)?v=|shorts/|live/|embed/)|youtu\.be/)'
                           '[A-Za-z0-9_-]{11}([?&#/].*)?$'), false)
$$;

-- Error codes (src/data/materials.ts):
--   title_required, title_too_long   1 to 120 characters
--   note_too_long, note_required     the optional note (body) is at most 1000 characters; a note needs it
--   youtube_link_invalid             a YouTube material needs a YouTube video link
--   material_file_invalid            a PDF or photo needs a proper file path, name and size
--   material_file_not_yours          an app user named a file from someone else's folder
--   material_file_missing            the file is not in Storage
--   material_kind_not_offered        audio is not offered yet
--   material_frozen                  kind, file, uploader or time changed on an existing material
-- The dashboard and seed.sql (no signed-in user) are checked for the shape only.
create or replace function guard_material() returns trigger
language plpgsql set search_path = public as $$
declare
  v_want   text;
  v_stored bigint;
  v_level  smallint;
begin
  new.title := btrim(coalesce(new.title, ''), E' \t\r\n');
  if new.title = '' then raise exception 'title_required'; end if;
  if char_length(new.title) > 120 then
    raise exception 'title_too_long' using detail = 'A material''s title is at most 120 characters.';
  end if;
  new.body := nullif(btrim(new.body, E' \t\r\n'), '');
  if char_length(new.body) > 1000 then
    raise exception 'note_too_long' using detail = 'A note is at most 1000 characters.';
  end if;

  -- An item belongs to one level, so the material does too.
  if new.item_id is not null then
    select level_id into v_level from syllabus_items where id = new.item_id;
    new.level_id := v_level;
  end if;

  if tg_op = 'UPDATE' and auth.uid() is not null and (
        new.kind         is distinct from old.kind
     or new.storage_path is distinct from old.storage_path
     or new.uploaded_by  is distinct from old.uploaded_by
     or new.created_at   is distinct from old.created_at) then
    raise exception 'material_frozen' using detail = 'To change the file or kind, remove the material and add it again.';
  end if;

  if new.kind = 'youtube' then
    new.url := btrim(coalesce(new.url, ''));
    if not youtube_link_ok(new.url) then
      raise exception 'youtube_link_invalid' using detail = 'Give the link of one YouTube video.';
    end if;
    new.storage_path := null; new.file_name := null; new.file_size := null;
  elsif new.kind in ('pdf', 'image') then
    new.url := null;
    new.file_name := btrim(coalesce(new.file_name, ''), E' \t\r\n');
    v_want := case when new.storage_path like '%.pdf' then 'pdf' else 'image' end;
    if not announcement_file_path_ok(new.storage_path) or v_want <> new.kind
       or new.file_name = '' or char_length(new.file_name) > 120
       or new.file_size is null or new.file_size < 1 or new.file_size > 10485760 then
      raise exception 'material_file_invalid'
        using detail = 'A file needs a proper path, a name of 1 to 120 characters and a size up to 10 MB.';
    end if;
    if tg_op = 'INSERT' and auth.uid() is not null then
      if split_part(new.storage_path, '/', 1) <> auth.uid()::text then
        raise exception 'material_file_not_yours' using detail = 'Only files you uploaded yourself can be added.';
      end if;
      select (o.metadata ->> 'size')::bigint into v_stored
        from storage.objects o where o.bucket_id = 'material-files' and o.name = new.storage_path;
      if not found then
        raise exception 'material_file_missing' using detail = 'The file is not in Storage; upload it first.';
      end if;
      new.file_size := coalesce(v_stored, new.file_size);
    end if;
  elsif new.kind = 'note' then
    -- Notes come from seed.sql and the dashboard; the app shows them but does not offer them.
    if new.body is null then raise exception 'note_required' using detail = 'A note needs its text.'; end if;
    new.url := null; new.storage_path := null; new.file_name := null; new.file_size := null;
  elsif auth.uid() is not null then
    raise exception 'material_kind_not_offered' using detail = 'Audio materials come later.';
  end if;

  if tg_op = 'INSERT' and auth.uid() is not null then
    new.uploaded_by := auth.uid();
    new.created_at := now();
    -- The Guru's own materials are approved at once; a coordinator's would wait (Phase 2, C18).
    new.approved_by := case when is_guru() then auth.uid() end;
  end if;
  return new;
end $$;

create trigger materials_guard before insert or update on materials
  for each row execute function guard_material();

create trigger audit_materials after insert or update or delete on materials
  for each row execute function audit_row();

create index materials_storage_path_idx on materials (storage_path) where storage_path is not null;
create index materials_level_item_idx on materials (level_id, item_id);

-- Storage rules, as for announcement files (0010). Security invoker: the lookup in materials goes
-- through its row-level security (policy visible, 0001), so "a material that lists the file"
-- means one the caller may read: approved and up to a student's own level, or any for staff.
create or replace function material_file_readable(p_name text) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from materials m where m.storage_path = p_name)
      or (is_staff() and (split_part(p_name, '/', 1) = auth.uid()::text or is_guru()))
$$;

-- Upload: the Guru only (coordinators' suggestions are Phase 2), into their own folder.
create or replace function material_file_uploadable(p_name text) returns boolean
language sql stable set search_path = public as $$
  select is_guru() and split_part(p_name, '/', 1) = auth.uid()::text and announcement_file_path_ok(p_name)
$$;

-- Delete: the uploader or the Guru.
create or replace function material_file_deletable(p_name text) returns boolean
language sql stable set search_path = public as $$
  select is_staff() and (split_part(p_name, '/', 1) = auth.uid()::text or is_guru())
$$;

create policy "material files: read" on storage.objects for select to authenticated
  using (bucket_id = 'material-files' and public.material_file_readable(name));
create policy "material files: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'material-files' and public.material_file_uploadable(name));
create policy "material files: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'material-files' and public.material_file_deletable(name));

-- ---------------------------------------------------------------- 5. own name and phone (A3)
-- Checked only when they change and an app user changes them, so older rows and the database's own
-- functions are left as they are. Error codes (src/data/my-profile.ts):
--   name_required, name_too_long   1 to 80 characters
--   phone_invalid                  digits, spaces and an optional leading +, 7 to 20 characters
create or replace function guard_profile_details() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.full_name is distinct from old.full_name then
    new.full_name := btrim(coalesce(new.full_name, ''), E' \t\r\n');
    if new.full_name = '' then raise exception 'name_required'; end if;
    if char_length(new.full_name) > 80 then
      raise exception 'name_too_long' using detail = 'A name is at most 80 characters.';
    end if;
  end if;
  if new.phone is distinct from old.phone then
    new.phone := nullif(btrim(new.phone), '');
    if new.phone !~ '^\+?[0-9 ]{7,20}$' then
      raise exception 'phone_invalid' using detail = 'A phone number has 7 to 20 digits or spaces, with an optional + first.';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_details_guard before update on profiles
  for each row execute function guard_profile_details();

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14: trigger functions are internal. The storage rules and youtube_link_ok
-- answer only about the caller's own access; move_syllabus_item is the Guru's (checked inside).
revoke execute on function guard_syllabus_item(), protect_syllabus_item(), guard_progress_item_in_use(),
  guard_material(), guard_profile_details() from public, anon, authenticated;
revoke execute on function move_syllabus_item(bigint, boolean), syllabus_item_counts(), youtube_link_ok(text),
  material_file_readable(text), material_file_uploadable(text), material_file_deletable(text)
  from public, anon, authenticated;
grant execute on function move_syllabus_item(bigint, boolean), syllabus_item_counts(), youtube_link_ok(text),
  material_file_readable(text), material_file_uploadable(text), material_file_deletable(text)
  to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on column syllabus_items.retired_at is 'When the Guru retired the item: no longer taught, cannot be ticked, not counted in progress. Its ticks stay. Null = in use.';
comment on column materials.file_name is 'PDF or photo: the name readers see, e.g. "Kaherva notation.pdf".';
comment on column materials.file_size is 'PDF or photo: size in bytes, taken from Storage.';
comment on column materials.storage_path is 'PDF or photo: <uploader login id>/<random id>.<pdf|jpg|png|webp> in the private bucket material-files.';
comment on table materials is 'Learning material: a YouTube link, a PDF or a photo (notes from seed.sql), for one level (null = all) and optionally one syllabus item. approved_by empty = suggestion waiting for the Guru (Phase 2).';
comment on function guard_syllabus_item is 'Trigger: a syllabus item needs a title (1-120) and at most 1000 characters of description; new items go to the end of their level; a ticked item stays in its level (docs/DECISIONS.md #44).';
comment on function protect_syllabus_item is 'Trigger: an item with ticks or materials cannot be deleted; retire it instead (docs/DECISIONS.md #44).';
comment on function guard_progress_item_in_use is 'Trigger: a retired syllabus item cannot be ticked.';
comment on function move_syllabus_item is 'Guru: moves a syllabus item one place up or down among the items in use of its level. False when it is already first or last.';
comment on function guard_material is 'Trigger: checks a material (title, YouTube link or own uploaded file of at most 10 MB); records the uploader; the Guru''s materials are approved at once (docs/DECISIONS.md #44).';
comment on function syllabus_item_counts is 'G4: per syllabus item, how many ticks (that the caller may see) and how many materials.';
comment on function youtube_link_ok is 'True for the link of one YouTube video (watch, shorts, live, embed or youtu.be).';
comment on function material_file_readable is 'Storage rule: the caller may open this file (it is on a material they may read, or it is staff''s own upload, or they are the Guru).';
comment on function material_file_uploadable is 'Storage rule: the Guru may upload this file into their own folder.';
comment on function material_file_deletable is 'Storage rule: the uploader or the Guru may delete this file.';
comment on function guard_profile_details is 'Trigger: a changed name is 1-80 characters and a changed phone 7-20 digits or spaces with an optional +.';
comment on table audit_log is 'Who changed students, profiles, call logs, levels, syllabus items and ticks, or materials, and when. Guru only.';
