-- Mridanga Seva — 0064: event details, lesson audio and notes, "Under review" (docs/DECISIONS.md #680-#689;
-- docs/DATABASE.md "Learn screens (0064)"). From the Guru's student-module specification of 27-10-2026.
-- Run once after 0063, in the Supabase SQL editor (TEST first), before the app update that shows these. Safe
-- to run twice. Changes no stored row: every new column is empty (null) on existing rows, which read as before.
--
-- 1. events: optional logistics for students — reporting time, rehearsal, dress code (and what to bring), the
--    staff member to contact, the role of those taking part, and a maps link (#681). The venue stays the
--    centre and/or place of 0022. Checked by a trigger of its own; 0022's guard_event is unchanged.
-- 2. materials: a lesson video (kind youtube or video) may carry an audio file and notes beside it (#683, #684).
--    The audio is a file in the private bucket material-files (10 MB, as PDFs and photos), read through a
--    signed link: the bucket now takes audio types, and the Storage rules know audio_path. Notes are text
--    (at most 4000 characters). guard_material (0020) is replaced with the same rules plus these.
-- 3. assessment_submissions.review_started_at: set when a staff member opens a recording to review it, so the
--    student sees "Under review" between Submitted and Reviewed (#686). start_submission_review() sets it once;
--    it never changes a status, a score or a review.

-- ---------------------------------------------------------------- 1. event details
alter table events add column if not exists reporting_at   timestamptz;
alter table events add column if not exists rehearsal      text;
alter table events add column if not exists dress_code     text;
alter table events add column if not exists coordinator_id uuid references profiles (id);
alter table events add column if not exists attendee_role  text;
alter table events add column if not exists maps_url       text;

-- Error codes (src/data/events.ts):
--   reporting_invalid      the reporting time is after the start or more than 12 hours before it
--   rehearsal_too_long     200 characters   dress_code_too_long 200   attendee_role_too_long 120
--   maps_link_invalid      an https link of at most 500 characters, no spaces
--   coordinator_invalid    not an active coordinator or Guru (checked when set or changed only)
-- Security definer: reads profiles. Runs before events_guard (triggers run in name order); both only check.
create or replace function guard_event_details() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.rehearsal := nullif(btrim(coalesce(new.rehearsal, ''), E' \t\r\n'), '');
  new.dress_code := nullif(btrim(coalesce(new.dress_code, ''), E' \t\r\n'), '');
  new.attendee_role := nullif(btrim(coalesce(new.attendee_role, ''), E' \t\r\n'), '');
  new.maps_url := nullif(btrim(coalesce(new.maps_url, ''), E' \t\r\n'), '');
  if char_length(coalesce(new.rehearsal, '')) > 200 then raise exception 'rehearsal_too_long'; end if;
  if char_length(coalesce(new.dress_code, '')) > 200 then raise exception 'dress_code_too_long'; end if;
  if char_length(coalesce(new.attendee_role, '')) > 120 then raise exception 'attendee_role_too_long'; end if;
  if new.maps_url is not null and (char_length(new.maps_url) > 500 or new.maps_url !~ '^https://[^\s/?#]+[^\s]*$') then
    raise exception 'maps_link_invalid' using detail = 'Give an https link, such as one shared from Google Maps.';
  end if;
  if new.reporting_at is not null
     and (tg_op = 'INSERT' or new.reporting_at is distinct from old.reporting_at or new.starts_at is distinct from old.starts_at)
     and (new.reporting_at > new.starts_at or new.reporting_at < new.starts_at - interval '12 hours') then
    raise exception 'reporting_invalid' using detail = 'Reporting is at or before the start, at most 12 hours before.';
  end if;
  if new.coordinator_id is not null and (tg_op = 'INSERT' or new.coordinator_id is distinct from old.coordinator_id)
     and not exists (select 1 from profiles p where p.id = new.coordinator_id and p.active and p.role in ('guru', 'coordinator')) then
    raise exception 'coordinator_invalid';
  end if;
  return new;
end $$;

drop trigger if exists events_details_guard on events;
create trigger events_details_guard before insert or update on events
  for each row execute function guard_event_details();

-- events is written with column rights (0022, 0054); the details join them. Row-level security is unchanged
-- (staff insert; the author or the Guru edits).
grant insert (reporting_at, rehearsal, dress_code, coordinator_id, attendee_role, maps_url),
      update (reporting_at, rehearsal, dress_code, coordinator_id, attendee_role, maps_url) on events to authenticated;

-- ---------------------------------------------------------------- 2. lesson audio and notes
alter table materials add column if not exists audio_path text;
alter table materials add column if not exists audio_name text;
alter table materials add column if not exists audio_size bigint;
alter table materials add column if not exists notes      text;
create index if not exists materials_audio_path_idx on materials (audio_path) where audio_path is not null;

-- The bucket takes audio as well (the app sends the type from the file's ending, as for sloka recitations).
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf',
                                  'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/ogg', 'audio/webm']
 where id = 'material-files';

-- A lesson's audio file: <login id>/<random id>.<mp3|m4a|aac|wav|ogg|webm>.
create or replace function material_audio_path_ok(p_path text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(p_path ~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
                            '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
                            '\.(mp3|m4a|aac|wav|ogg|webm)$'), false)
$$;

-- 0020's guard with a lesson's audio and notes. Error codes as in 0013 and 0020, and:
--   lesson_extras_video_only   audio and notes go with a lesson video (kind youtube or video) only
--   lesson_audio_invalid       the audio needs a proper path, a name of 1 to 120 characters and a size up to 10 MB
--   lesson_audio_not_yours     an app user named an audio file from someone else's folder
--   lesson_audio_missing       the audio file is not in Storage
--   notes_too_long             notes are at most 4000 characters
-- Unlike the PDF or photo, the audio may be added, changed or removed on an existing lesson.
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

  new.panes := coalesce(new.panes, 1);
  if new.kind <> 'video' and new.panes <> 1 then
    raise exception 'panes_invalid' using detail = 'Only a video file has panes; YouTube''s player may not be zoomed.';
  end if;
  if new.panes not between 1 and 4 then
    raise exception 'panes_invalid' using detail = 'A video has 1 to 4 camera angles side by side.';
  end if;

  if new.kind = 'youtube' then
    new.url := btrim(coalesce(new.url, ''));
    if not youtube_link_ok(new.url) then
      raise exception 'youtube_link_invalid' using detail = 'Give the link of one YouTube video.';
    end if;
    new.storage_path := null; new.file_name := null; new.file_size := null;
  elsif new.kind = 'video' then
    new.url := btrim(coalesce(new.url, ''));
    if not video_link_ok(new.url) then
      raise exception 'video_link_invalid' using detail = 'Give an https link to an .mp4, .webm, .m4v or .mov file.';
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

  -- 0064: a lesson video's audio and notes (#683, #684).
  new.notes := nullif(btrim(coalesce(new.notes, ''), E' \t\r\n'), '');
  if char_length(coalesce(new.notes, '')) > 4000 then
    raise exception 'notes_too_long' using detail = 'A lesson''s notes are at most 4000 characters.';
  end if;
  if new.audio_path is null then
    new.audio_name := null; new.audio_size := null;
  else
    new.audio_name := btrim(coalesce(new.audio_name, ''), E' \t\r\n');
    if not material_audio_path_ok(new.audio_path) or new.audio_name = '' or char_length(new.audio_name) > 120
       or new.audio_size is null or new.audio_size < 1 or new.audio_size > 10485760 then
      raise exception 'lesson_audio_invalid'
        using detail = 'An audio file needs a proper path, a name of 1 to 120 characters and a size up to 10 MB.';
    end if;
    if auth.uid() is not null and (tg_op = 'INSERT' or new.audio_path is distinct from old.audio_path) then
      if split_part(new.audio_path, '/', 1) <> auth.uid()::text then
        raise exception 'lesson_audio_not_yours' using detail = 'Only audio you uploaded yourself can be added.';
      end if;
      select (o.metadata ->> 'size')::bigint into v_stored
        from storage.objects o where o.bucket_id = 'material-files' and o.name = new.audio_path;
      if not found then
        raise exception 'lesson_audio_missing' using detail = 'The audio is not in Storage; upload it first.';
      end if;
      new.audio_size := coalesce(v_stored, new.audio_size);
    end if;
  end if;
  if new.kind not in ('youtube', 'video') and (new.audio_path is not null or new.notes is not null) then
    raise exception 'lesson_extras_video_only' using detail = 'Audio and notes go with a lesson video.';
  end if;

  if tg_op = 'INSERT' and auth.uid() is not null then
    new.uploaded_by := auth.uid();
    new.created_at := now();
    -- The Guru's own materials are approved at once; a coordinator's would wait (Phase 2, C18).
    new.approved_by := case when is_guru() then auth.uid() end;
  end if;
  return new;
end $$;

-- Storage rules (0013, 0023, 0028, 0054) with the audio: a file is a material's when it is its PDF or photo
-- (storage_path) or its lesson audio (audio_path).
create or replace function material_file_readable(p_name text) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from materials m where m.storage_path = p_name or m.audio_path = p_name)
      or (is_staff() and (split_part(p_name, '/', 1) = auth.uid()::text or is_guru()))
$$;

create or replace function material_file_uploadable(p_name text) returns boolean
language sql stable set search_path = public as $$
  select split_part(p_name, '/', 1) = auth.uid()::text
     and (announcement_file_path_ok(p_name) or material_audio_path_ok(p_name))
     and not exists (select 1 from materials m where m.storage_path = p_name or m.audio_path = p_name)
     and (is_guru()
          or (my_role() = 'coordinator'
              and (select count(*) from storage.objects o
                    where o.bucket_id = 'material-files'
                      and split_part(o.name, '/', 1) = auth.uid()::text
                      and o.created_at > now() - interval '1 day') < 10))
$$;

create or replace function material_file_deletable(p_name text) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select is_guru()
      or (is_staff() and split_part(p_name, '/', 1) = auth.uid()::text
          and not exists (select 1 from materials m where (m.storage_path = p_name or m.audio_path = p_name)
                                                    and m.approved_by is not null))
$$;

-- ---------------------------------------------------------------- 3. "Under review"
alter table assessment_submissions add column if not exists review_started_at timestamptz;

-- C14: a staff member opened this recording to review it. Sets review_started_at once, on the newest recording of
-- an assignment that waits for its review; anything else (reviewed, older, the caller's own work) is left as it
-- is, without an error, since opening the screen must always work. Errors: not_allowed, submission_not_found.
create or replace function start_submission_review(p_submission bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not coalesce(is_staff(), false) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if not exists (select 1 from assessment_submissions where id = p_submission) then
    raise exception 'submission_not_found';
  end if;
  update assessment_submissions s set review_started_at = now()
   where s.id = p_submission and s.reviewed_at is null and s.review_started_at is null
     and exists (select 1 from assessment_assignments a join students st on st.id = a.student_id
                  where a.id = s.assignment_id and a.status = 'submitted'
                    and st.profile_id is distinct from auth.uid())
     and not exists (select 1 from assessment_submissions n where n.assignment_id = s.assignment_id
                       and (n.submitted_at, n.id) > (s.submitted_at, s.id));
end $$;

-- ---------------------------------------------------------------- who may run the new functions
-- docs/DECISIONS.md #14: the trigger function for nobody; the path check for the Storage rules (security
-- invoker, so signed-in people); start_submission_review checks the role inside.
revoke execute on function guard_event_details(), material_audio_path_ok(text), start_submission_review(bigint)
  from public, anon, authenticated;
grant execute on function material_audio_path_ok(text), start_submission_review(bigint) to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on column events.reporting_at is 'When those taking part should arrive (at or before the start, at most 12 hours before); null = not given (0064).';
comment on column events.rehearsal is 'Rehearsal day, time and place as free text (at most 200 characters); null = none (0064).';
comment on column events.dress_code is 'Dress code and what to bring (at most 200 characters); null = not given (0064).';
comment on column events.coordinator_id is 'The staff member students contact about this event (active coordinator or Guru when set); null = the author (0064).';
comment on column events.attendee_role is 'The role of those taking part, e.g. kirtan accompaniment (at most 120 characters); a performer''s own part stays in event_performers (0064).';
comment on column events.maps_url is 'An https link to the venue on a map (at most 500 characters); null = none (0064).';
comment on function guard_event_details() is 'Trigger: checks an event''s optional details: reporting time, rehearsal, dress code, contact (active staff), role, maps link (0064, docs/DECISIONS.md #681).';
comment on column materials.audio_path is 'A lesson video''s audio: <uploader login id>/<random id>.<mp3|m4a|aac|wav|ogg|webm> in the private bucket material-files (0064).';
comment on column materials.notes is 'A lesson video''s notes (at most 4000 characters), shown on the lesson''s Notes tab (0064).';
comment on function material_audio_path_ok(text) is 'True for a lesson audio path of the form <login id>/<random id>.<audio ending> in material-files (0064).';
comment on function guard_material is 'Trigger: checks a material (title, YouTube link, video-file link with 1-4 panes, or own uploaded file of at most 10 MB) and a lesson video''s audio file and notes; records the uploader; the Guru''s materials are approved at once (docs/DECISIONS.md #44, #56, #683).';
comment on column assessment_submissions.review_started_at is 'When a staff member first opened this recording to review it; the student sees Under review (0064, docs/DECISIONS.md #686).';
comment on function start_submission_review(bigint) is 'C14: marks the newest recording of an assignment waiting for review as under review (once; never the caller''s own); changes no status or score (0064).';
