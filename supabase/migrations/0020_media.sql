-- Mridanga Seva — 0020: media (Phase 2, slice 4: V3 lesson-video player, in-app recording).
-- Run once, after 0019_phase2_inbox.sql, in the Supabase SQL editor. TEST already ran this file on
-- 3 Oct 2026 under its branch name 0017_media.sql (same statements; only these comments and the
-- DECISIONS number in two descriptions, #52 there, differ), so TEST needs nothing more; LIVE runs
-- it as 0020.
-- Why: docs/DECISIONS.md #56. How: docs/DATABASE.md "Media (Phase 2)".
--
-- 1. materials: a new kind 'video' = a link to the team's own video FILE (https, .mp4 / .webm /
--    .m4v / .mov), and `panes` = how many camera angles sit side by side in it (V2: left head,
--    right head, front). YouTube's terms forbid changing its player's picture, so mirror and zoom
--    work only on such files; YouTube lessons keep speed and the A-B loop (DECISIONS #56).
-- 2. assessment_submissions.voice_note: the coordinator's spoken comment on a review (C14),
--    recorded in the app and uploaded to the bucket assessment-files (50 MB a file, as #52).
--    review_submission() takes it; a redo needs a comment OR a voice note. Coordinators may now
--    upload audio (and a browser's .webm) into their own folder, at most 10 files a day.
--    The voice note is deleted with the recording (claim_expired_submission_files).
-- Students' own recordings ("Record myself", S5) stay on the phone: nothing here.

-- ---------------------------------------------------------------- 1. materials: video files
alter table materials drop constraint if exists materials_kind_check;
alter table materials add constraint materials_kind_check
  check (kind in ('youtube', 'video', 'audio', 'pdf', 'image', 'note'));
alter table materials add column panes smallint not null default 1;
alter table materials add constraint materials_panes_check check (panes between 1 and 4);

-- A link to a video file: https, at most 500 characters, the path ending in a video type
-- (a query string after it is fine: signed links and CDNs add one).
create or replace function video_link_ok(p_url text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(char_length(p_url) <= 500
                  and p_url ~* '^https://[^\s/?#]+/[^\s?#]*\.(mp4|webm|m4v|mov)([?#][^\s]*)?$', false)
$$;

-- 0013's guard with the video kind and panes added. Error codes as in 0013, and:
--   video_link_invalid   a video material needs a link to an .mp4 / .webm / .m4v / .mov file
--   panes_invalid        1 to 4 panes, only on a video
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

  if tg_op = 'INSERT' and auth.uid() is not null then
    new.uploaded_by := auth.uid();
    new.created_at := now();
    -- The Guru's own materials are approved at once; a coordinator's would wait (Phase 2, C18).
    new.approved_by := case when is_guru() then auth.uid() end;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- 2. the coordinator's voice note
alter table assessment_submissions add column voice_note jsonb;
create index assessment_submissions_voice_idx on assessment_submissions ((voice_note ->> 'path'))
  where voice_note is not null;

-- Readable also when a submission lists the file as its voice note (row-level security on
-- assessment_submissions keeps it to staff and the student it belongs to).
create or replace function assessment_file_readable(p_name text) returns boolean
language sql stable set search_path = public as $$
  select coalesce(my_role() in ('guru', 'coordinator', 'student'), false) and (
       is_guru()
    or split_part(p_name, '/', 1) = auth.uid()::text
    or exists (select 1 from assessments a where a.media @> jsonb_build_array(jsonb_build_object('path', p_name)))
    or exists (select 1 from assessment_submissions s where s.file ->> 'path' = p_name)
    or exists (select 1 from assessment_submissions s where s.voice_note ->> 'path' = p_name))
$$;

-- Upload: as 0016, and a coordinator audio (or a browser recording, .webm = 'video' by its ending)
-- for a voice note, at most 10 files a day.
create or replace function assessment_file_uploadable(p_name text) returns boolean
language sql stable set search_path = public as $$
  select split_part(p_name, '/', 1) = auth.uid()::text
     and assessment_file_kind(p_name) is not null
     and (is_guru()
          or (my_role() = 'student'
              and assessment_file_kind(p_name) in ('audio', 'video')
              and exists (select 1 from assessment_assignments a
                           where a.student_id = my_student_id() and a.status in ('assigned', 'seen', 'redo'))
              and (select count(*) from storage.objects o
                    where o.bucket_id = 'assessment-files'
                      and split_part(o.name, '/', 1) = auth.uid()::text
                      and o.created_at > now() - interval '1 day') < 10)
          or (my_role() = 'coordinator'
              and (assessment_file_kind(p_name) = 'audio' or p_name ~ '\.webm$')
              and (select count(*) from storage.objects o
                    where o.bucket_id = 'assessment-files'
                      and split_part(o.name, '/', 1) = auth.uid()::text
                      and o.created_at > now() - interval '1 day') < 10))
$$;

-- Delete: as 0016; a file a submission lists as its voice note stays too.
create or replace function assessment_file_deletable(p_name text) returns boolean
language sql stable set search_path = public as $$
  select is_guru()
      or (coalesce(my_role() in ('coordinator', 'student'), false)
          and split_part(p_name, '/', 1) = auth.uid()::text
          and not exists (select 1 from assessment_submissions s
                           where s.file ->> 'path' = p_name or s.voice_note ->> 'path' = p_name))
$$;

-- C14: 0016's review with a voice note. A redo needs a comment or a voice note.
-- Errors as 0016, and file_invalid / file_not_yours / file_missing for the voice note.
drop function if exists review_submission(bigint, int[], text, text, boolean);
create or replace function review_submission(p_submission bigint, p_scores int[], p_comment text,
                                             p_outcome text, p_send_level_up boolean default false,
                                             p_voice_note jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_sub     assessment_submissions;
  v_asg     assessment_assignments;
  v_rubric  jsonb;
  v_levelup boolean;
  v_title   text;
  v_due     date;
  v_comment text := nullif(btrim(coalesce(p_comment, ''), E' \t\r\n'), '');
  v_voice   jsonb;
  v_stored  bigint;
  v_total   int := 0;
  v_max     int := 0;
  i         int;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select * into v_sub from assessment_submissions where id = p_submission for update;
  if not found then raise exception 'submission_not_found'; end if;
  select * into v_asg from assessment_assignments where id = v_sub.assignment_id for update;
  if v_sub.reviewed_at is not null or v_asg.status <> 'submitted'
     or exists (select 1 from assessment_submissions s where s.assignment_id = v_sub.assignment_id
                  and (s.submitted_at, s.id) > (v_sub.submitted_at, v_sub.id)) then
    raise exception 'already_reviewed';
  end if;
  if p_outcome is null or p_outcome not in ('accepted', 'redo') then raise exception 'outcome_required'; end if;
  select a.rubric, a.level_up, a.title into v_rubric, v_levelup, v_title from assessments a where a.id = v_asg.assessment_id;
  if p_scores is null or cardinality(p_scores) <> jsonb_array_length(v_rubric) then raise exception 'scores_invalid'; end if;
  for i in 1 .. cardinality(p_scores) loop
    if p_scores[i] is null or p_scores[i] < 0 or p_scores[i] > (v_rubric -> (i - 1) ->> 'max')::int then
      raise exception 'scores_invalid' using detail = 'Each score is from 0 to the top score of its rubric line.';
    end if;
    v_total := v_total + p_scores[i];
    v_max := v_max + (v_rubric -> (i - 1) ->> 'max')::int;
  end loop;
  -- The voice note: the reviewer's own upload, really in Storage (security definer: checked here).
  if p_voice_note is not null and jsonb_typeof(p_voice_note) <> 'null' then
    v_voice := assessment_clean_file(p_voice_note, array['audio', 'video'], false);
    if split_part(v_voice ->> 'path', '/', 1) <> auth.uid()::text then
      raise exception 'file_not_yours' using detail = 'Only a voice note you recorded yourself can be added.';
    end if;
    select (o.metadata ->> 'size')::bigint into v_stored from storage.objects o
     where o.bucket_id = 'assessment-files' and o.name = v_voice ->> 'path';
    if not found then
      raise exception 'file_missing' using detail = 'The voice note is not in Storage; upload it first.';
    end if;
    v_voice := jsonb_set(v_voice, '{size}', to_jsonb(coalesce(v_stored, (v_voice ->> 'size')::bigint)));
  end if;
  if p_outcome = 'redo' and v_comment is null and v_voice is null then raise exception 'comment_required'; end if;
  if char_length(coalesce(v_comment, '')) > 2000 then raise exception 'comment_too_long'; end if;
  if coalesce(p_send_level_up, false) and not (v_levelup and p_outcome = 'accepted') then
    raise exception 'level_up_not_allowed' using detail = 'Only an accepted level-up assessment can be sent to the Guru.';
  end if;

  update assessment_submissions
     set reviewed_by = auth.uid(), reviewed_at = now(), outcome = p_outcome,
         scores = to_jsonb(p_scores), score = v_total, score_max = v_max, comment = v_comment,
         send_level_up = coalesce(p_send_level_up, false), voice_note = v_voice
   where id = p_submission;
  update assessment_assignments
     set status = case when p_outcome = 'accepted' then 'reviewed' else 'redo' end, updated_at = now()
   where id = v_asg.id;
  select due_on into v_due from assessment_releases where id = v_asg.release_id;
  perform queue_student_push(v_asg.student_id, p_outcome, v_title, '/student/assessments/' || v_asg.id,
                             v_due, v_total || '/' || v_max);
end $$;

-- ---------------------------------------------------------------- 3. keep time for the voice note
-- 0017's claim, also for a submission with only a voice note (a link and a spoken review): both
-- paths are returned, so the Edge Function (unchanged) deletes both. Same keep time as the recording.
create or replace function claim_expired_submission_files()
returns table (submission_id bigint, path text)
language sql volatile set search_path = public as $$
  with due as (
    select s.id from assessment_submissions s
     where (s.file is not null or s.voice_note is not null) and s.file_removed_at is null
       and submission_file_expired(s.id, s.reviewed_at, s.send_level_up)
     order by s.reviewed_at limit 200
     for update skip locked
  ), marked as (
    update assessment_submissions s set file_removed_at = now()
      from due where s.id = due.id
    returning s.id, s.file ->> 'path' as file_path, s.voice_note ->> 'path' as voice_path
  )
  select id, file_path from marked where file_path is not null
  union all
  select id, voice_path from marked where voice_path is not null
$$;

-- 0017's daily job, with the same rule for which submissions have files to delete.
create or replace function assessment_daily() returns int
language plpgsql volatile set search_path = public as $$
declare
  v_row record;
  v_n   int := 0;
begin
  for v_row in
    select g.id, g.student_id, r.due_on, a.title
      from assessment_assignments g
      join assessment_releases r on r.id = g.release_id
      join assessments a on a.id = g.assessment_id
     where g.status in ('assigned', 'seen', 'redo')
       and r.due_on between today_ist() and today_ist() + 1
       and (g.last_reminded_at is null or g.last_reminded_at < now() - interval '12 hours')
  loop
    if queue_student_push(v_row.student_id, 'remind', v_row.title, '/student/assessments/' || v_row.id, v_row.due_on) then
      update assessment_assignments set last_reminded_at = now(), reminders = reminders + 1 where id = v_row.id;
      v_n := v_n + 1;
    end if;
  end loop;
  if exists (select 1 from assessment_submissions s
              where (s.file is not null or s.voice_note is not null) and s.file_removed_at is null
                and submission_file_expired(s.id, s.reviewed_at, s.send_level_up)) then
    perform call_notify_function('{"cleanup": true}'::jsonb);
  end if;
  return v_n;
end $$;

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14.
-- video_link_ok stays callable: the guard runs as the person saving (as youtube_link_ok, 0013).
revoke execute on function review_submission(bigint, int[], text, text, boolean, jsonb),
  claim_expired_submission_files(), assessment_daily()
  from public, anon, authenticated;
grant execute on function review_submission(bigint, int[], text, text, boolean, jsonb) to authenticated;
grant execute on function claim_expired_submission_files() to service_role;

-- ---------------------------------------------------------------- descriptions
comment on column materials.panes is 'A video file: how many camera angles sit side by side in it (1-4, V2); tapping one zooms it (V3). Always 1 for other kinds.';
comment on column materials.url is 'youtube: the YouTube video link. video: an https link to the team''s own .mp4 / .webm / .m4v / .mov file (mirror and zoom are allowed only on such files, docs/DECISIONS.md #56).';
comment on column assessment_submissions.voice_note is 'C14: the reviewer''s spoken comment {path, name, kind, size} in the bucket assessment-files; deleted with the recording.';
comment on function video_link_ok is 'True for an https link of at most 500 characters to an .mp4, .webm, .m4v or .mov file.';
comment on function guard_material is 'Trigger: checks a material (title, YouTube link, video-file link with 1-4 panes, or own uploaded file of at most 10 MB); records the uploader; the Guru''s materials are approved at once (docs/DECISIONS.md #44, #56).';
comment on function review_submission is 'C14: score by rubric, comment and/or voice note, accept or ask for a redo; optionally send an accepted level-up to the Guru.';
comment on function claim_expired_submission_files is 'Edge Function only: recordings and voice notes past their keep time, marked removed, to delete from Storage.';
