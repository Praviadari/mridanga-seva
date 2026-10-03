-- Mridanga Seva — 0016: assessments (Phase 2, slice 1: screens G6, C12, C13, S7, C14).
-- Run once, after 0015_inbox_reports_centres.sql, in the Supabase SQL editor. Numbered 0012 on the
-- Phase 2 branch and run on TEST under that name; renumbered when Phase 2 merged into main
-- (docs/DECISIONS.md #55). Why: docs/DECISIONS.md #52 (#43 on the branch). How: docs/DATABASE.md "Assessments".
--
-- The flow (Screen List doc, "Assessment flow"):
-- 1. The Guru creates an assessment (G6): title, instructions, up to 3 files (photo, PDF, audio or
--    video) and a link, the type, a rubric, the level and whether it is a level-up assessment,
--    and sends it to the coordinators. Before it is sent only the Guru sees it (a draft).
-- 2. A coordinator adds notes, picks students and releases it with a due date (C12):
--    release_assessment(). Each student gets one assignment row.
-- 3. The student opens it (S7): mark_assessment_seen(); then submits a recording, an audio or
--    video file they uploaded or a link: submit_assessment().
-- 4. Coordinators follow up on the tracker (C13): Not seen / Seen / Submitted / Reviewed / Redo,
--    with a Remind button (remind_assessment()) and an automatic reminder the day before the due
--    date and on the day (the daily job assessment_daily()).
-- 5. A coordinator reviews a submission (C14): a score per rubric line, a comment, accepted or
--    redo, and for a level-up assessment "send level-up to the Guru": review_submission(). The
--    Guru's decision on that (G7, C22, C23) is slice 2.
--
-- Push notifications for releases, reminders and reviews go through a small queue, push_outbox,
-- which the Edge Function notify-announcements sends with the announcement notifications.
-- Submitted files are deleted 30 days after their review (a level-up one only after slice 2
-- decides); the Edge Function does that too, once a day. Both need the Edge Function from this
-- commit to be deployed; until then the rows wait and nothing breaks.

-- ---------------------------------------------------------------- 1. tables
create table assessments (
  id            bigint generated always as identity primary key,
  title         text not null,
  instructions  text not null default '',
  kind          text not null default 'playing' check (kind in ('playing', 'singing', 'theory', 'other')),
  level_id      smallint not null references levels (id),
  level_up      boolean not null default false,
  rubric        jsonb not null default '[]',
  media         jsonb not null default '[]',
  media_link    text,
  created_by    uuid references profiles (id) default auth.uid(),
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);

-- A release is one coordinator's handing-out of an assessment to some students, with a due date.
-- An assessment that was released cannot be deleted (on delete restrict): students' work hangs on it.
create table assessment_releases (
  id             bigint generated always as identity primary key,
  assessment_id  bigint not null references assessments (id) on delete restrict,
  notes          text,
  due_on         date not null,
  released_by    uuid references profiles (id),
  released_at    timestamptz not null default now()
);
create index assessment_releases_assessment_idx on assessment_releases (assessment_id);

-- One row per student and assessment: a student gets an assessment once, whichever release.
create table assessment_assignments (
  id                bigint generated always as identity primary key,
  release_id        bigint not null references assessment_releases (id) on delete cascade,
  assessment_id     bigint not null references assessments (id) on delete restrict,
  student_id        uuid not null references students (id) on delete cascade,
  status            text not null default 'assigned'
                      check (status in ('assigned', 'seen', 'submitted', 'reviewed', 'redo')),
  seen_at           timestamptz,
  last_reminded_at  timestamptz,
  reminders         int not null default 0,
  updated_at        timestamptz not null default now(),
  unique (assessment_id, student_id)
);
create index assessment_assignments_release_idx on assessment_assignments (release_id);
create index assessment_assignments_student_idx on assessment_assignments (student_id);
create index assessment_assignments_open_idx on assessment_assignments (status)
  where status in ('assigned', 'seen', 'redo');

-- One row per recording a student sends. A redo means a new row; the old one keeps its review.
create table assessment_submissions (
  id               bigint generated always as identity primary key,
  assignment_id    bigint not null references assessment_assignments (id) on delete cascade,
  submitted_by     uuid references profiles (id),
  file             jsonb,
  link             text,
  note             text,
  submitted_at     timestamptz not null default now(),
  reviewed_by      uuid references profiles (id),
  reviewed_at      timestamptz,
  outcome          text check (outcome in ('accepted', 'redo')),
  scores           jsonb,
  score            int,
  score_max        int,
  comment          text,
  send_level_up    boolean not null default false,
  file_removed_at  timestamptz,
  check (file is not null or link is not null)
);
create index assessment_submissions_assignment_idx on assessment_submissions (assignment_id, submitted_at desc);
create index assessment_submissions_file_idx on assessment_submissions ((file ->> 'path'));
create index assessment_submissions_expiry_idx on assessment_submissions (reviewed_at)
  where file is not null and file_removed_at is null;
create index assessments_media_idx on assessments using gin (media jsonb_path_ops);

-- ---------------------------------------------------------------- 2. files
-- The private bucket assessment-files: the Guru's photos, PDFs, audio and video on an assessment,
-- and the students' recordings. At most 50 MB a file (the free plan's Storage is 1 GB in all;
-- docs/DECISIONS.md #52). The app sends the type from the file's ending, so the list is exact.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assessment-files', 'assessment-files', false, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf',
              'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/ogg', 'audio/amr',
              'video/mp4', 'video/quicktime', 'video/3gpp', 'video/webm', 'video/x-matroska'])
on conflict (id) do update
   set public = false,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- What a file is, from its path '<login id>/<random id>.<ending>'; null for a path that is not
-- of that form. image: jpg png webp · pdf · audio: mp3 m4a aac wav ogg amr · video: mp4 mov 3gp webm mkv.
create or replace function assessment_file_kind(p_path text) returns text
language sql immutable set search_path = public as $$
  select case
    when p_path is null or p_path !~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
                                      '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$') then null
    when p_path ~ '\.(jpg|png|webp)$' then 'image'
    when p_path ~ '\.pdf$' then 'pdf'
    when p_path ~ '\.(mp3|m4a|aac|wav|ogg|amr)$' then 'audio'
    when p_path ~ '\.(mp4|mov|3gp|webm|mkv)$' then 'video'
  end
$$;

-- Checks one file entry {path, name, kind, size} and returns it tidied. A new file must be the
-- signed-in person's own upload and really in Storage; its size is then taken from Storage.
-- p_kinds: the kinds allowed here. Error codes: file_invalid, file_not_yours, file_missing.
-- Security invoker: the Storage lookup goes through its row-level security (own uploads).
create or replace function assessment_clean_file(p_item jsonb, p_kinds text[], p_is_new boolean) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v_path   text := p_item ->> 'path';
  v_name   text := btrim(coalesce(p_item ->> 'name', ''), E' \t\r\n');
  v_kind   text := p_item ->> 'kind';
  v_size   bigint;
  v_stored bigint;
begin
  if jsonb_typeof(p_item) <> 'object' then
    raise exception 'file_invalid' using detail = 'A file is a JSON object {path, name, kind, size}.';
  end if;
  v_size := case when jsonb_typeof(p_item -> 'size') = 'number' then (p_item ->> 'size')::numeric::bigint end;
  if assessment_file_kind(v_path) is null or v_kind is distinct from assessment_file_kind(v_path)
     or not (v_kind = any (p_kinds))
     or v_name = '' or char_length(v_name) > 120
     or v_size is null or v_size < 1 or v_size > 52428800 then
    raise exception 'file_invalid'
      using detail = 'A file needs a proper path, a name of 1 to 120 characters, a kind matching its ending and a size up to 50 MB.';
  end if;
  if p_is_new and auth.uid() is not null then
    if split_part(v_path, '/', 1) <> auth.uid()::text then
      raise exception 'file_not_yours' using detail = 'Only files you uploaded yourself can be added.';
    end if;
    select (o.metadata ->> 'size')::bigint into v_stored
      from storage.objects o
     where o.bucket_id = 'assessment-files' and o.name = v_path;
    if not found then
      raise exception 'file_missing' using detail = 'The file is not in Storage; upload it first.';
    end if;
    v_size := coalesce(v_stored, v_size);
  end if;
  return jsonb_build_object('path', v_path, 'name', v_name, 'kind', v_kind, 'size', v_size);
end $$;

-- A link (YouTube, Google Drive ...): https only, at most 500 characters; empty = none.
create or replace function assessment_clean_link(p_link text) returns text
language plpgsql immutable set search_path = public as $$
declare
  v text := nullif(btrim(coalesce(p_link, ''), E' \t\r\n'), '');
begin
  if v is not null and (char_length(v) > 500 or v !~ '^https://[^\s]+$') then
    raise exception 'link_invalid' using detail = 'A link starts with https:// and is at most 500 characters.';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------- 3. the Guru's assessment
-- Error codes (src/data/assessments.ts):
--   title_required / title_too_long (120)   instructions_too_long (4000)
--   rubric_required (at least 1 line)  rubric_invalid (at most 8 lines, each a criterion of 1-80
--   characters and a top score 1-10)    too_many_media (3)   file_invalid / file_not_yours /
--   file_missing   link_invalid   assessment_frozen (author or creation time)   already_sent
--   assessment_released (type, level, level-up or rubric after the first release)
create or replace function guard_assessment() returns trigger
language plpgsql set search_path = public as $$
declare
  v_line   jsonb;
  v_text   text;
  v_max    numeric;
  v_rubric jsonb := '[]';
  v_media  jsonb := '[]';
  v_item   jsonb;
  v_old    jsonb := case when tg_op = 'UPDATE' then old.media else '[]' end;
begin
  new.title := btrim(coalesce(new.title, ''), E' \t\r\n');
  new.instructions := btrim(coalesce(new.instructions, ''), E' \t\r\n');
  if new.title = '' then raise exception 'title_required'; end if;
  if char_length(new.title) > 120 then raise exception 'title_too_long'; end if;
  if char_length(new.instructions) > 4000 then raise exception 'instructions_too_long'; end if;

  -- The rubric: what is scored, each line up to its own top score.
  if jsonb_typeof(new.rubric) <> 'array' or jsonb_array_length(new.rubric) = 0 then
    raise exception 'rubric_required' using detail = 'An assessment has 1 to 8 rubric lines.';
  end if;
  if jsonb_array_length(new.rubric) > 8 then raise exception 'rubric_invalid'; end if;
  for v_line in select value from jsonb_array_elements(new.rubric) loop
    v_text := btrim(coalesce(v_line ->> 'criterion', ''), E' \t\r\n');
    v_max := case when jsonb_typeof(v_line -> 'max') = 'number' then (v_line ->> 'max')::numeric end;
    if v_text = '' or char_length(v_text) > 80 or v_max is null or v_max <> trunc(v_max) or v_max < 1 or v_max > 10 then
      raise exception 'rubric_invalid' using detail = 'Each rubric line has a criterion of 1 to 80 characters and a top score from 1 to 10.';
    end if;
    v_rubric := v_rubric || jsonb_build_array(jsonb_build_object('criterion', v_text, 'max', v_max::int));
  end loop;
  new.rubric := v_rubric;

  -- Files: at most 3; files already on it stay as they are.
  new.media := coalesce(new.media, '[]');
  if jsonb_typeof(new.media) <> 'array' then raise exception 'file_invalid'; end if;
  if jsonb_array_length(new.media) > 3 then raise exception 'too_many_media'; end if;
  for v_item in select value from jsonb_array_elements(new.media) loop
    v_item := assessment_clean_file(v_item, array['image', 'pdf', 'audio', 'video'],
                                    not v_old @> jsonb_build_array(jsonb_build_object('path', v_item ->> 'path')));
    if v_media @> jsonb_build_array(jsonb_build_object('path', v_item ->> 'path')) then
      raise exception 'file_invalid' using detail = 'The same file is listed twice.';
    end if;
    v_media := v_media || jsonb_build_array(v_item);
  end loop;
  new.media := v_media;
  new.media_link := assessment_clean_link(new.media_link);

  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
      new.created_at := now();
    end if;
    if new.sent_at is not null then new.sent_at := now(); end if;
    return new;
  end if;

  -- UPDATE from here on.
  if auth.uid() is not null and (new.created_by is distinct from old.created_by
                                 or new.created_at is distinct from old.created_at) then
    raise exception 'assessment_frozen';
  end if;
  if old.sent_at is not null and new.sent_at is distinct from old.sent_at then
    raise exception 'already_sent' using detail = 'An assessment sent to the coordinators stays sent.';
  end if;
  if old.sent_at is null and new.sent_at is not null then new.sent_at := now(); end if;
  if (new.kind, new.level_id, new.level_up, new.rubric) is distinct from (old.kind, old.level_id, old.level_up, old.rubric)
     and exists (select 1 from assessment_releases r where r.assessment_id = old.id) then
    raise exception 'assessment_released'
      using detail = 'After the first release the type, level, level-up flag and rubric stay as they are.';
  end if;
  return new;
end $$;

create trigger assessments_guard before insert or update on assessments
  for each row execute function guard_assessment();
create trigger audit_assessments after update or delete on assessments
  for each row execute function audit_row();
create trigger audit_assessment_submissions after update on assessment_submissions
  for each row execute function audit_row();

-- ---------------------------------------------------------------- 4. who may read and change
alter table assessments enable row level security;
alter table assessment_releases enable row level security;
alter table assessment_assignments enable row level security;
alter table assessment_submissions enable row level security;

-- The signed-in student's own record id (null for anyone else). Security definer: reads one row.
create or replace function my_student_id() returns uuid
language sql stable security definer set search_path = public as $$
  select s.id from students s where s.profile_id = auth.uid() and my_role() = 'student'
$$;

-- The Guru sees every assessment, drafts too; a coordinator only those sent to the coordinators;
-- a student only those given to them.
create policy readable on assessments for select to authenticated using (
  is_guru()
  or (my_role() = 'coordinator' and sent_at is not null)
  or id in (select a.assessment_id from assessment_assignments a where a.student_id = my_student_id()));
create policy guru_insert on assessments for insert to authenticated with check (is_guru());
create policy guru_update on assessments for update to authenticated using (is_guru()) with check (is_guru());
create policy guru_delete on assessments for delete to authenticated using (is_guru());

create policy readable on assessment_releases for select to authenticated using (
  is_staff() or id in (select a.release_id from assessment_assignments a where a.student_id = my_student_id()));
create policy readable on assessment_assignments for select to authenticated using (
  is_staff() or student_id = my_student_id());
create policy readable on assessment_submissions for select to authenticated using (
  is_staff() or assignment_id in (select a.id from assessment_assignments a where a.student_id = my_student_id()));

-- The app writes assessments directly (the Guru); everything else goes through the functions below.
revoke all on assessments, assessment_releases, assessment_assignments, assessment_submissions
  from public, anon, authenticated;
grant select on assessments, assessment_releases, assessment_assignments, assessment_submissions to authenticated;
grant insert (title, instructions, kind, level_id, level_up, rubric, media, media_link, sent_at),
      update (title, instructions, kind, level_id, level_up, rubric, media, media_link, sent_at),
      delete on assessments to authenticated;

-- Storage rules for the bucket, as small functions (security invoker: the lookups go through the
-- row-level security above, so "an assessment that lists the file" is one the caller may read).
-- Open: on an assessment or a submission the caller may read, or in the caller's own folder, or the Guru.
create or replace function assessment_file_readable(p_name text) returns boolean
language sql stable set search_path = public as $$
  select coalesce(my_role() in ('guru', 'coordinator', 'student'), false) and (
       is_guru()
    or split_part(p_name, '/', 1) = auth.uid()::text
    or exists (select 1 from assessments a where a.media @> jsonb_build_array(jsonb_build_object('path', p_name)))
    or exists (select 1 from assessment_submissions s where s.file ->> 'path' = p_name))
$$;
-- Upload: into one's own folder; the Guru any kind (an assessment's files); a student audio or
-- video, only while they have an assessment to send, and at most 10 files in a day (the free
-- plan's 1 GB must not fill up by accident; docs/DECISIONS.md #52).
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
                      and o.created_at > now() - interval '1 day') < 10))
$$;
-- Delete: the Guru any file; anyone else their own upload while no submission lists it.
create or replace function assessment_file_deletable(p_name text) returns boolean
language sql stable set search_path = public as $$
  select is_guru()
      or (coalesce(my_role() in ('coordinator', 'student'), false)
          and split_part(p_name, '/', 1) = auth.uid()::text
          and not exists (select 1 from assessment_submissions s where s.file ->> 'path' = p_name))
$$;

create policy "assessment files: read" on storage.objects for select to authenticated
  using (bucket_id = 'assessment-files' and public.assessment_file_readable(name));
create policy "assessment files: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'assessment-files' and public.assessment_file_uploadable(name));
create policy "assessment files: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'assessment-files' and public.assessment_file_deletable(name));

-- ---------------------------------------------------------------- 5. the push queue
-- One row per notification to one person. Written only by the functions below; sent by the Edge
-- Function notify-announcements (claim_push_outbox). Rows older than a day are never sent.
create table push_outbox (
  id          bigint generated always as identity primary key,
  profile_id  uuid not null references profiles (id) on delete cascade,
  title       text not null,
  body        text not null,
  url         text not null,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index push_outbox_waiting_idx on push_outbox (created_at) where sent_at is null;
alter table push_outbox enable row level security;
revoke all on push_outbox from public, anon, authenticated;

-- The line under the title, in the person's app language (profiles.language). The Telugu and
-- Hindi lines are drafts for the native-speaker review (docs/TRANSLATIONS.md).
create or replace function assessment_push_line(p_kind text, p_lang text, p_due date, p_extra text default null)
returns text language sql immutable set search_path = public as $$
  select case p_kind
    when 'released' then case p_lang
      when 'te' then 'కొత్త మూల్యాంకనం. గడువు ' || to_char(p_due, 'DD-MM-YYYY') || '.'
      when 'hi' then 'नया मूल्यांकन। अंतिम तिथि ' || to_char(p_due, 'DD-MM-YYYY') || '।'
      else 'New assessment. Due ' || to_char(p_due, 'DD-MM-YYYY') || '.' end
    when 'remind' then case p_lang
      when 'te' then 'గుర్తు: దయచేసి ' || to_char(p_due, 'DD-MM-YYYY') || ' లోపు మీ రికార్డింగ్ పంపండి.'
      when 'hi' then 'याद रहे: कृपया ' || to_char(p_due, 'DD-MM-YYYY') || ' तक अपनी रिकॉर्डिंग भेजें।'
      else 'Reminder: please send your recording by ' || to_char(p_due, 'DD-MM-YYYY') || '.' end
    when 'accepted' then case p_lang
      when 'te' then 'మీ రికార్డింగ్ చూశారు. స్కోరు ' || p_extra || '.'
      when 'hi' then 'आपकी रिकॉर्डिंग देख ली गई। अंक ' || p_extra || '।'
      else 'Your recording was reviewed. Score ' || p_extra || '.' end
    when 'redo' then case p_lang
      when 'te' then 'దయచేసి మళ్ళీ రికార్డ్ చేసి పంపండి. వ్యాఖ్య చూడండి.'
      when 'hi' then 'कृपया फिर से रिकॉर्ड करके भेजें। टिप्पणी देखें।'
      else 'Please record it again. See the comment.' end
    when 'submitted' then case p_lang
      when 'te' then p_extra || ' రికార్డింగ్ పంపారు.'
      when 'hi' then p_extra || ' ने रिकॉर्डिंग भेजी।'
      else p_extra || ' sent a recording.' end
  end
$$;

-- Queues one notification for the login of a student record (nothing when it has no login).
create or replace function queue_student_push(p_student uuid, p_kind text, p_title text, p_url text,
                                              p_due date, p_extra text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid;
  v_lang    text;
begin
  select p.id, p.language into v_profile, v_lang
    from students s join profiles p on p.id = s.profile_id and p.active
   where s.id = p_student;
  if v_profile is null then return false; end if;
  insert into push_outbox (profile_id, title, body, url)
  values (v_profile, p_title, assessment_push_line(p_kind, v_lang, p_due, p_extra), p_url);
  return true;
end $$;

-- ---------------------------------------------------------------- 6. what the app calls
-- C12: a coordinator (or the Guru) releases a sent assessment to students, with a due date and notes.
-- Students who already have it are left out. Returns {release_id, assigned, already, no_login}.
-- Errors: not_allowed, assessment_not_found (or not sent yet), students_required, due_required,
-- due_past, due_too_far (more than a year), notes_too_long (2000), nothing_to_assign.
create or replace function release_assessment(p_assessment bigint, p_students uuid[], p_due_on date,
                                              p_notes text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_title    text;
  v_notes    text := nullif(btrim(coalesce(p_notes, ''), E' \t\r\n'), '');
  v_release  bigint;
  v_new      uuid[];
  v_student  uuid;
  v_no_login int := 0;
  v_asg      bigint;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select title into v_title from assessments where id = p_assessment and sent_at is not null;
  if v_title is null then raise exception 'assessment_not_found'; end if;
  if p_students is null or cardinality(p_students) = 0 then raise exception 'students_required'; end if;
  if p_due_on is null then raise exception 'due_required'; end if;
  if p_due_on < today_ist() then raise exception 'due_past'; end if;
  if p_due_on > today_ist() + 365 then raise exception 'due_too_far'; end if;
  if char_length(coalesce(v_notes, '')) > 2000 then raise exception 'notes_too_long'; end if;

  select coalesce(array_agg(distinct s.id), '{}') into v_new
    from students s
   where s.id = any (p_students)
     and not exists (select 1 from assessment_assignments a where a.assessment_id = p_assessment and a.student_id = s.id);
  if cardinality(v_new) = 0 then raise exception 'nothing_to_assign' using detail = 'Every student picked has it already.'; end if;

  insert into assessment_releases (assessment_id, notes, due_on, released_by)
  values (p_assessment, v_notes, p_due_on, auth.uid()) returning id into v_release;
  foreach v_student in array v_new loop
    insert into assessment_assignments (release_id, assessment_id, student_id)
    values (v_release, p_assessment, v_student) returning id into v_asg;
    if not queue_student_push(v_student, 'released', v_title, '/student/assessments/' || v_asg, p_due_on) then
      v_no_login := v_no_login + 1;
    end if;
  end loop;
  return jsonb_build_object('release_id', v_release, 'assigned', cardinality(v_new),
    'already', (select count(distinct x)::int from unnest(p_students) x) - cardinality(v_new),
    'no_login', v_no_login);
end $$;

-- S7: the student opened it. Errors: not_allowed (not their own).
create or replace function mark_assessment_seen(p_assignment bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update assessment_assignments
     set seen_at = coalesce(seen_at, now()),
         status = case when status = 'assigned' then 'seen' else status end,
         updated_at = case when status = 'assigned' then now() else updated_at end
   where id = p_assignment and student_id = my_student_id();
  if not found then raise exception 'not_allowed'; end if;
end $$;

-- S7: the student sends a recording: an audio or video file they uploaded into their folder, or a
-- link, with an optional note. Returns the submission id. Late is allowed (the tracker shows it).
-- Errors: not_allowed, not_open (submitted and waiting, or reviewed), recording_required,
-- file_invalid, file_not_yours, file_missing, link_invalid, note_too_long (1000).
create or replace function submit_assessment(p_assignment bigint, p_file jsonb, p_link text,
                                             p_note text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_asg    assessment_assignments;
  v_file   jsonb;
  v_link   text := assessment_clean_link(p_link);
  v_note   text := nullif(btrim(coalesce(p_note, ''), E' \t\r\n'), '');
  v_id     bigint;
  v_title  text;
  v_by     uuid;
  v_lang   text;
  v_name   text;
  v_stored bigint;
begin
  select * into v_asg from assessment_assignments where id = p_assignment and student_id = my_student_id() for update;
  if not found then raise exception 'not_allowed'; end if;
  if v_asg.status not in ('assigned', 'seen', 'redo') then raise exception 'not_open'; end if;
  if p_file is not null and jsonb_typeof(p_file) <> 'null' then
    -- Checked here, not in assessment_clean_file: this function is security definer, so it must
    -- look the file up itself rather than through the caller's Storage rules.
    v_file := assessment_clean_file(p_file, array['audio', 'video'], false);
    if split_part(v_file ->> 'path', '/', 1) <> auth.uid()::text then raise exception 'file_not_yours'; end if;
    select (o.metadata ->> 'size')::bigint into v_stored
      from storage.objects o where o.bucket_id = 'assessment-files' and o.name = v_file ->> 'path';
    if not found then raise exception 'file_missing'; end if;
    if v_stored > 52428800 then raise exception 'file_invalid'; end if;
    v_file := jsonb_set(v_file, '{size}', to_jsonb(coalesce(v_stored, (v_file ->> 'size')::bigint)));
    if exists (select 1 from assessment_submissions s where s.file ->> 'path' = v_file ->> 'path') then
      raise exception 'file_invalid' using detail = 'This file was sent before.';
    end if;
  end if;
  if v_file is null and v_link is null then raise exception 'recording_required'; end if;
  if char_length(coalesce(v_note, '')) > 1000 then raise exception 'note_too_long'; end if;

  insert into assessment_submissions (assignment_id, submitted_by, file, link, note)
  values (p_assignment, auth.uid(), v_file, v_link, v_note) returning id into v_id;
  update assessment_assignments
     set status = 'submitted', seen_at = coalesce(seen_at, now()), updated_at = now()
   where id = p_assignment;

  -- Tell the coordinator who released it.
  select a.title, r.released_by, p.language into v_title, v_by, v_lang
    from assessment_releases r join assessments a on a.id = r.assessment_id
    left join profiles p on p.id = r.released_by and p.active and p.role in ('guru', 'coordinator')
   where r.id = v_asg.release_id;
  select full_name into v_name from students where id = v_asg.student_id;
  if v_by is not null and v_lang is not null then
    insert into push_outbox (profile_id, title, body, url)
    values (v_by, v_title, assessment_push_line('submitted', v_lang, null, v_name), '/staff/assessments/review/' || p_assignment);
  end if;
  return v_id;
end $$;

-- C14: a coordinator or the Guru reviews the latest submission: one score per rubric line (0 to
-- that line's top), a comment (required for a redo), accepted or redo, and for an accepted
-- level-up assessment whether to send the level-up to the Guru.
-- Errors: not_allowed, submission_not_found, already_reviewed (or not the latest), outcome_required,
-- scores_invalid, comment_required, comment_too_long (2000), level_up_not_allowed.
create or replace function review_submission(p_submission bigint, p_scores int[], p_comment text,
                                             p_outcome text, p_send_level_up boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_sub     assessment_submissions;
  v_asg     assessment_assignments;
  v_rubric  jsonb;
  v_levelup boolean;
  v_title   text;
  v_due     date;
  v_comment text := nullif(btrim(coalesce(p_comment, ''), E' \t\r\n'), '');
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
  if p_outcome = 'redo' and v_comment is null then raise exception 'comment_required'; end if;
  if char_length(coalesce(v_comment, '')) > 2000 then raise exception 'comment_too_long'; end if;
  if coalesce(p_send_level_up, false) and not (v_levelup and p_outcome = 'accepted') then
    raise exception 'level_up_not_allowed' using detail = 'Only an accepted level-up assessment can be sent to the Guru.';
  end if;

  update assessment_submissions
     set reviewed_by = auth.uid(), reviewed_at = now(), outcome = p_outcome,
         scores = to_jsonb(p_scores), score = v_total, score_max = v_max, comment = v_comment,
         send_level_up = coalesce(p_send_level_up, false)
   where id = p_submission;
  update assessment_assignments
     set status = case when p_outcome = 'accepted' then 'reviewed' else 'redo' end, updated_at = now()
   where id = v_asg.id;
  select due_on into v_due from assessment_releases where id = v_asg.release_id;
  perform queue_student_push(v_asg.student_id, p_outcome, v_title, '/student/assessments/' || v_asg.id,
                             v_due, v_total || '/' || v_max);
end $$;

-- C13: Remind. Sends a reminder to each picked student who has not sent their recording yet
-- (Not seen, Seen, Redo), at most once in 12 hours each. Returns {reminded, no_login, skipped}.
-- Errors: not_allowed.
create or replace function remind_assessment(p_assignments bigint[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row      record;
  v_reminded int := 0;
  v_no_login int := 0;
  v_skipped  int := 0;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  for v_row in
    select g.id, g.student_id, g.status, g.last_reminded_at, r.due_on, a.title
      from assessment_assignments g
      join assessment_releases r on r.id = g.release_id
      join assessments a on a.id = g.assessment_id
     where g.id = any (coalesce(p_assignments, '{}'))
     for update of g
  loop
    if v_row.status not in ('assigned', 'seen', 'redo')
       or v_row.last_reminded_at > now() - interval '12 hours' then
      v_skipped := v_skipped + 1;
    elsif queue_student_push(v_row.student_id, 'remind', v_row.title, '/student/assessments/' || v_row.id, v_row.due_on) then
      update assessment_assignments set last_reminded_at = now(), reminders = reminders + 1 where id = v_row.id;
      v_reminded := v_reminded + 1;
    else
      v_no_login := v_no_login + 1;
    end if;
  end loop;
  return jsonb_build_object('reminded', v_reminded, 'no_login', v_no_login, 'skipped', v_skipped);
end $$;

-- ---------------------------------------------------------------- 7. the tracker and the counts
-- C13: one row per student an assessment was given to, with the name, roll number, whether they
-- have the app, the status, the due date and the latest submission. security_invoker (#20).
create view assessment_tracker with (security_invoker = true) as
select g.id as assignment_id,
       g.assessment_id,
       g.release_id,
       g.student_id,
       s.full_name,
       s.roll_no,
       s.level_id,
       s.profile_id is not null as has_login,
       g.status,
       g.seen_at,
       g.last_reminded_at,
       g.reminders,
       r.due_on,
       r.released_by,
       ls.id as submission_id,
       ls.submitted_at,
       ls.score,
       ls.score_max,
       ls.send_level_up
  from assessment_assignments g
  join students s on s.id = g.student_id
  join assessment_releases r on r.id = g.release_id
  left join lateral (select x.id, x.submitted_at, x.score, x.score_max, x.send_level_up
                       from assessment_submissions x
                      where x.assignment_id = g.id
                      order by x.submitted_at desc, x.id desc limit 1) ls on true;

-- The list (C12): per assessment how many students have it in each state.
create view assessment_summary with (security_invoker = true) as
select a.id as assessment_id,
       count(g.id)::int as assigned,
       count(g.id) filter (where g.status = 'assigned')::int as not_seen,
       count(g.id) filter (where g.status = 'seen')::int as seen,
       count(g.id) filter (where g.status = 'submitted')::int as submitted,
       count(g.id) filter (where g.status = 'reviewed')::int as reviewed,
       count(g.id) filter (where g.status = 'redo')::int as redo
  from assessments a
  left join assessment_assignments g on g.assessment_id = a.id
 group by a.id;

revoke all on assessment_tracker, assessment_summary from public, anon, authenticated;
grant select on assessment_tracker, assessment_summary to authenticated;

-- ---------------------------------------------------------------- 8. sending and tidying (Edge Function)
-- Marks every waiting notification sent and returns one row per phone. Older than a day: marked, not sent.
create or replace function claim_push_outbox()
returns table (outbox_id bigint, title text, body text, url text, token text)
language sql volatile set search_path = public as $$
  with due as (
    update push_outbox o set sent_at = now()
     where o.sent_at is null
    returning o.id, o.profile_id, o.title, o.body, o.url, o.created_at
  )
  select d.id, d.title, d.body, d.url, t.token
    from due d join push_tokens t on t.profile_id = d.profile_id
   where d.created_at > now() - interval '1 day'
   order by d.id, t.token
$$;

-- Puts notifications back in the queue when nothing could be sent.
create or replace function release_push_outbox(p_ids bigint[]) returns void
language sql volatile set search_path = public as $$
  update push_outbox set sent_at = null where id = any (p_ids) and created_at > now() - interval '1 day'
$$;

-- Submitted files whose review is more than 30 days old (docs/DECISIONS.md #52), up to 200 at a
-- time, marked removed. A file sent to the Guru for a level-up stays until slice 2 decides.
-- The Edge Function deletes them from Storage; if that fails it puts them back.
create or replace function claim_expired_submission_files()
returns table (submission_id bigint, path text)
language sql volatile set search_path = public as $$
  with due as (
    select s.id from assessment_submissions s
     where s.file is not null and s.file_removed_at is null and not s.send_level_up
       and s.reviewed_at < now() - interval '30 days'
     order by s.reviewed_at limit 200
     for update skip locked
  )
  update assessment_submissions s set file_removed_at = now()
    from due where s.id = due.id
  returning s.id, s.file ->> 'path'
$$;

create or replace function release_submission_files(p_ids bigint[]) returns void
language sql volatile set search_path = public as $$
  update assessment_submissions set file_removed_at = null where id = any (p_ids)
$$;

-- Calls the Edge Function notify-announcements with a JSON body, as send_due_push (0011) did.
-- Returns 'not_set_up' or 'called'. Runs as the job's owner.
create or replace function call_notify_function(p_body jsonb) returns text
language plpgsql volatile set search_path = public as $$
declare
  v_url    text;
  v_secret text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net')
     or to_regclass('vault.decrypted_secrets') is null then
    return 'not_set_up';
  end if;
  execute $q$select max(decrypted_secret) filter (where name = 'mridanga_project_url'),
                    max(decrypted_secret) filter (where name = 'mridanga_push_secret')
               from vault.decrypted_secrets$q$
     into v_url, v_secret;
  if v_url is null or v_secret is null then
    return 'not_set_up';
  end if;
  execute $q$select net.http_post(
                url := $1 || '/functions/v1/notify-announcements',
                headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', $2),
                body := $3,
                timeout_milliseconds := 30000)$q$
    using rtrim(v_url, '/'), v_secret, p_body;
  return 'called';
end $$;

-- 0011's every-minute job, now also due when an assessment notification waits (of the last day).
create or replace function send_due_push() returns text
language plpgsql volatile set search_path = public as $$
begin
  if not exists (select 1 from announcements where notified_at is null and publish_at <= now())
     and not exists (select 1 from push_outbox where sent_at is null and created_at > now() - interval '1 day') then
    return 'nothing_due';
  end if;
  return call_notify_function('{}'::jsonb);
end $$;

-- Every day at 09:00 IST: a reminder to each student whose assessment is due tomorrow or today and
-- who has not sent it (not reminded in the last 12 hours), and, when files have expired, a call
-- to the Edge Function to delete them. Returns how many reminders were queued.
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
  if exists (select 1 from assessment_submissions
              where file is not null and file_removed_at is null and not send_level_up
                and reviewed_at < now() - interval '30 days') then
    perform call_notify_function('{"cleanup": true}'::jsonb);
  end if;
  return v_n;
end $$;

-- 03:30 UTC = 09:00 IST.
select cron.schedule('mridanga-assessments', '30 3 * * *', 'select assessment_daily()');

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14.
revoke execute on function assessment_file_kind(text), assessment_clean_file(jsonb, text[], boolean),
  assessment_clean_link(text), guard_assessment(), my_student_id(), assessment_file_readable(text),
  assessment_file_uploadable(text), assessment_file_deletable(text), assessment_push_line(text, text, date, text),
  queue_student_push(uuid, text, text, text, date, text), release_assessment(bigint, uuid[], date, text),
  mark_assessment_seen(bigint), submit_assessment(bigint, jsonb, text, text),
  review_submission(bigint, int[], text, text, boolean), remind_assessment(bigint[]),
  claim_push_outbox(), release_push_outbox(bigint[]), claim_expired_submission_files(),
  release_submission_files(bigint[]), call_notify_function(jsonb), send_due_push(), assessment_daily()
  from public, anon, authenticated;
-- Run by row-level security and the trigger as the person asking: yes/no answers or a tidied value.
grant execute on function assessment_file_kind(text), assessment_clean_file(jsonb, text[], boolean),
  assessment_clean_link(text), my_student_id(), assessment_file_readable(text),
  assessment_file_uploadable(text), assessment_file_deletable(text) to authenticated;
grant execute on function release_assessment(bigint, uuid[], date, text), mark_assessment_seen(bigint),
  submit_assessment(bigint, jsonb, text, text), review_submission(bigint, int[], text, text, boolean),
  remind_assessment(bigint[]) to authenticated;
grant execute on function claim_push_outbox(), release_push_outbox(bigint[]), claim_expired_submission_files(),
  release_submission_files(bigint[]) to service_role;

-- ---------------------------------------------------------------- descriptions
comment on table assessments is 'Assessments the Guru sets (G6): instructions, files, rubric, level, level-up flag. Coordinators see them once sent (sent_at); students only those given to them (docs/DECISIONS.md #43).';
comment on column assessments.kind is 'Type: playing, singing, theory or other.';
comment on column assessments.rubric is 'What is scored: a list of {criterion, max} (1 to 8 lines, max 1-10). Fixed after the first release.';
comment on column assessments.media is 'Up to 3 files {path, name, kind image|pdf|audio|video, size} in the private bucket assessment-files.';
comment on column assessments.media_link is 'Optional https link, e.g. an unlisted YouTube video of the piece.';
comment on column assessments.level_up is 'A level-up assessment: an accepted submission can be sent to the Guru for promotion (slice 2).';
comment on column assessments.sent_at is 'When the Guru sent it to the coordinators. Empty = draft, seen by the Guru only.';
comment on table assessment_releases is 'A coordinator''s release of an assessment to some students, with notes and a due date (C12). Written by release_assessment().';
comment on table assessment_assignments is 'One row per student and assessment. status: assigned (not seen), seen, submitted, reviewed, redo (C13).';
comment on column assessment_assignments.last_reminded_at is 'Last reminder (button or daily job); at most one in 12 hours.';
comment on table assessment_submissions is 'A student''s recording (an audio/video file or a link) and its review: scores per rubric line, comment, accepted or redo (S7, C14).';
comment on column assessment_submissions.file is '{path, name, kind audio|video, size} in assessment-files; removed from Storage 30 days after the review (file_removed_at).';
comment on column assessment_submissions.send_level_up is 'The reviewer sends this accepted level-up submission to the Guru (G7, slice 2). Its file is kept.';
comment on table push_outbox is 'Push notifications waiting to be sent by the Edge Function (assessment releases, reminders, reviews). Not readable from the app.';
comment on view assessment_tracker is 'C13: one row per student an assessment was given to, with status, due date and the latest submission. Follows row-level security.';
comment on view assessment_summary is 'Per assessment: how many students have it, and in each status. Follows row-level security.';
comment on function release_assessment is 'C12: release a sent assessment to students with a due date and notes; queues their notifications.';
comment on function mark_assessment_seen is 'S7: the student opened their assessment.';
comment on function submit_assessment is 'S7: the student sends a recording (own uploaded audio/video file, or a link) and a note.';
comment on function review_submission is 'C14: score by rubric, comment, accept or ask for a redo; optionally send an accepted level-up to the Guru.';
comment on function remind_assessment is 'C13: queue a reminder to students who have not sent their recording; once in 12 hours each.';
comment on function assessment_daily is 'Daily 09:00 IST (pg_cron mridanga-assessments): reminders for work due today or tomorrow; asks the Edge Function to delete expired files.';
comment on function claim_push_outbox is 'Edge Function only: marks waiting notifications sent and returns the phones to send to.';
comment on function claim_expired_submission_files is 'Edge Function only: submitted files 30 days past their review, marked removed, to delete from Storage.';
comment on function send_due_push is 'Every minute (pg_cron mridanga-push): calls the Edge Function when an announcement or an assessment notification is due.';
