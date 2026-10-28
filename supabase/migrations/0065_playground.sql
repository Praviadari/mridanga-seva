-- Mridanga Seva — 0065: the Rhythm Playground engine (docs/RHYTHM_PLAYGROUND.md §8-§9, §12.2, §13.4, §19;
-- docs/DECISIONS.md #720-#729; docs/DATABASE.md "Rhythm Playground (0065)"). Run once after 0064, in the Supabase
-- SQL editor (TEST first), before the app update with the Playground. Safe to run twice. Changes no stored row:
-- new tables, settings, a bucket, a column on assessments (empty), one function replaced (submission_file_expired,
-- same rules plus the 60-day one below).
--
-- 1. Settings (written only in the SQL editor: guard_setting refuses the app): playground_enabled (false — the
--    Playground card stays hidden), playground_pilot_group (null), playground_allow_placeholders (false; TEST only,
--    §19.3: placeholder content can never be published or shown while it is off), playground_labels (the label
--    thresholds of §12.2; Prji changes them after the pilot).
-- 2. Content: play_bols (the approved bol dictionary), play_assets (sound files, bucket playground-audio),
--    play_templates (challenge rules), play_exercises (the exercise bank, taal notation of 0018 with dictionary ids),
--    play_publications (one version number per publish). Coordinators write drafts and submit them; only the Guru
--    (Prji's login) approves, retires and publishes (#720). Editing an approved row sends it back to review with
--    revision + 1 and takes it out of the next pack; students see only approved, published, non-placeholder rows,
--    and the app reads them through playground_pack (the whole pack, or null while the version is unchanged).
-- 3. Students: play_assignments, play_student_settings (staff write; students read theirs through
--    my_playground_state), play_rounds (one row per round, written only by record_round, which re-marks every
--    recognition answer, refuses unpublished content and is idempotent by the round's id), play_skill_weeks
--    (weekly per-skill summaries), play_ratings (a facilitator's 0-3 rating of a performance skill).
-- 4. Retention (§13.4, lead 28-10-2026): job mridanga-playground (playground_daily, 03:00 IST) folds rounds older
--    than 180 days into play_skill_weeks and deletes them; summaries stay while the account exists; every student
--    row goes with the record (on delete cascade: erase_student, retention_daily). A recording sent from a game
--    (assessments.playground_game) is removed 60 days after sending when nobody reviewed it (the existing
--    clean-up removes reviewed ones after 30 days): submission_file_expired gains that rule.
--
-- Error codes (src/data/playground.ts): not_allowed, approval_guru_only, content_frozen, bol_invalid,
-- asset_invalid, asset_file_missing, asset_licence_incomplete, template_invalid, exercise_invalid,
-- exercise_bol_not_approved, exercise_asset_not_approved, exercise_template_invalid, placeholders_not_allowed,
-- content_not_found, status_invalid, kind_invalid, round_invalid, round_id_taken, round_limit,
-- round_content_unknown, student_withdrawn, student_not_found.

-- ---------------------------------------------------------------- 1. settings
insert into settings (key, value) values
  ('playground_enabled', 'false'),
  ('playground_pilot_group', 'null'),
  ('playground_allow_placeholders', 'false'),
  ('playground_labels', '{"practisingItems":10,"steadyShare":0.8,"steadyItems":20,"steadyDays":2,"steadyMaxReplays":1,"timingRounds":3,"timingMedianMs":60,"timingSpreadMs":50,"timingDays":2,"windowDays":30}')
on conflict (key) do nothing;

-- TEST only: may placeholder content be published and shown? (§19.3)
create or replace function play_placeholders_ok() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select value = 'true'::jsonb from settings where key = 'playground_allow_placeholders'), false)
$$;

-- ---------------------------------------------------------------- 2. content tables
create table if not exists play_assets (
  id                 bigint generated always as identity primary key,
  kind               text not null check (kind in ('stroke', 'phrase', 'tempo', 'kirtan', 'instrument', 'voice', 'tone')),
  path               text unique,
  bundled_key        text check (bundled_key ~ '^[a-z]{1,10}$'),
  mime               text check (mime in ('audio/wav', 'audio/mp4', 'audio/mpeg')),
  duration_ms        int check (duration_ms between 50 and 180000),
  bytes              int check (bytes between 1 and 15728640),
  sha256             text check (sha256 ~ '^[0-9a-f]{64}$'),
  bpm                numeric(5,1) check (bpm between 30 and 240),
  beat_grid          jsonb check (beat_grid is null or jsonb_typeof(beat_grid) = 'object'),
  instruments        text[] not null default '{}',
  licence            text not null check (licence in ('own', 'permission', 'cc_by', 'public_domain')),
  performer          text check (char_length(performer) <= 120),
  permission_ref     text check (char_length(permission_ref) <= 200),
  credit             text check (char_length(credit) <= 200),
  status             text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'retired')),
  placeholder        boolean not null default false,
  revision           int not null default 1,
  published_in       int,
  first_published_in int,
  approved_by        uuid references profiles (id) on delete set null,
  approved_at        timestamptz,
  created_by         uuid references profiles (id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references profiles (id) on delete set null,
  check (path is not null or bundled_key is not null),
  check (status <> 'approved' or approved_at is not null)
);

create table if not exists play_bols (
  id                 text primary key check (id ~ '^[a-z]{1,10}$'),
  written            text not null check (char_length(written) between 1 and 12),
  telugu             text check (char_length(telugu) <= 12),
  head               text not null check (head in ('dayan', 'baya', 'both')),
  technique          text check (char_length(technique) <= 200),
  open               boolean,
  level_id           smallint not null references levels (id),
  sounds_like        text[] not null default '{}',
  close_pairs        text[] not null default '{}',
  asset_id           bigint references play_assets (id),
  transcription      text check (char_length(transcription) <= 60),
  status             text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'retired')),
  placeholder        boolean not null default false,
  revision           int not null default 1,
  published_in       int,
  first_published_in int,
  approved_by        uuid references profiles (id) on delete set null,
  approved_at        timestamptz,
  created_by         uuid references profiles (id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references profiles (id) on delete set null,
  check (status <> 'approved' or approved_at is not null)
);

create table if not exists play_templates (
  id                 bigint generated always as identity primary key,
  game               text not null check (game in ('sound_detective', 'tap_the_beat', 'echo', 'missing_beat',
                       'voice_companion', 'rhythm_builder', 'kirtan_companion', 'tempo_detective', 'sound_explorer',
                       'daily_quest', 'tala_cycle', 'rhythm_switching', 'vocal_studio', 'kirtan_sync')),
  skill              text not null,
  response_mode      text not null check (response_mode in ('choose', 'order', 'tap', 'count', 'record', 'self_check')),
  level_min          smallint not null references levels (id),
  level_max          smallint not null references levels (id),
  steps              jsonb not null,
  params             jsonb not null default '{}',
  status             text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'retired')),
  placeholder        boolean not null default false,
  revision           int not null default 1,
  published_in       int,
  first_published_in int,
  approved_by        uuid references profiles (id) on delete set null,
  approved_at        timestamptz,
  created_by         uuid references profiles (id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references profiles (id) on delete set null,
  check (level_min <= level_max),
  check (status <> 'approved' or approved_at is not null)
);

create table if not exists play_exercises (
  id                 bigint generated always as identity primary key,
  game               text not null check (game in ('sound_detective', 'tap_the_beat', 'echo', 'missing_beat',
                       'voice_companion', 'rhythm_builder', 'kirtan_companion', 'tempo_detective', 'sound_explorer',
                       'daily_quest', 'tala_cycle', 'rhythm_switching', 'vocal_studio', 'kirtan_sync')),
  template_id        bigint references play_templates (id),
  level_id           smallint not null references levels (id),
  skills             text[] not null,
  taal_id            bigint references taals (id) on delete restrict,
  sequence           text[],
  divisions          smallint[],
  answer             jsonb not null default '{}',
  distractors        jsonb not null default '[]',
  prompt_assets      bigint[] not null default '{}',
  bpm_min            numeric(5,1) check (bpm_min between 30 and 240),
  bpm_max            numeric(5,1) check (bpm_max between 30 and 240),
  guna               smallint[] not null default '{1}' check (guna <@ array[1, 2, 3, 4, 8]::smallint[] and cardinality(guna) >= 1),
  requires_item      bigint references syllabus_items (id),
  locale             text not null default 'en' check (locale in ('en', 'te', 'hi')),
  attribution        text check (char_length(attribution) <= 200),
  status             text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'retired')),
  placeholder        boolean not null default false,
  revision           int not null default 1,
  published_in       int,
  first_published_in int,
  approved_by        uuid references profiles (id) on delete set null,
  approved_at        timestamptz,
  created_by         uuid references profiles (id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references profiles (id) on delete set null,
  check (bpm_min is null or bpm_max is null or bpm_min <= bpm_max),
  check (status <> 'approved' or approved_at is not null)
);
create index if not exists play_exercises_pool_idx on play_exercises (game, level_id) where status = 'approved';

create table if not exists play_publications (
  version       int primary key,
  published_at  timestamptz not null default now(),
  published_by  uuid references profiles (id) on delete set null,
  note          text check (char_length(note) <= 300),
  counts        jsonb not null
);

-- ---------------------------------------------------------------- 3. student tables
create table if not exists play_assignments (
  id          bigint generated always as identity primary key,
  game        text not null check (game in ('sound_detective', 'tap_the_beat', 'echo', 'missing_beat',
                'voice_companion', 'rhythm_builder', 'kirtan_companion', 'tempo_detective', 'sound_explorer',
                'daily_quest', 'tala_cycle', 'rhythm_switching', 'vocal_studio', 'kirtan_sync')),
  skill       text,
  level_id    smallint references levels (id),
  group_id    bigint references groups (id) on delete cascade,
  student_id  uuid references students (id) on delete cascade,
  step_min    smallint check (step_min between 1 and 20),
  step_max    smallint check (step_max between 1 and 20),
  from_day    date not null default today_ist(),
  due_day     date,
  note        text check (char_length(note) <= 200),
  created_by  uuid references profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  check (num_nonnulls(level_id, group_id, student_id) = 1),
  check (step_min is null or step_max is null or step_min <= step_max),
  check (due_day is null or due_day >= from_day)
);
create index if not exists play_assignments_student_idx on play_assignments (student_id) where student_id is not null;

create table if not exists play_student_settings (
  student_id      uuid primary key references students (id) on delete cascade,
  surprise        boolean not null default true,
  relaxed_timing  boolean not null default false,
  level_up_ok     boolean not null default false,
  steps           jsonb not null default '{}' check (jsonb_typeof(steps) = 'object'),
  updated_by      uuid references profiles (id) on delete set null,
  updated_at      timestamptz not null default now()
);

create table if not exists play_rounds (
  id              uuid primary key,
  student_id      uuid not null references students (id) on delete cascade,
  game            text not null,
  skill           text not null,
  mode            text not null check (mode in ('play', 'review', 'daily', 'surprise', 'assigned')),
  level_id        smallint references levels (id),
  step            smallint not null check (step between 1 and 20),
  seed            bigint not null check (seed between 0 and 4294967295),
  content_version int not null,
  started_at      timestamptz not null,
  finished_at     timestamptz,
  items           jsonb not null,
  n_items         smallint not null check (n_items between 1 and 40),
  n_correct       smallint,
  timing          jsonb,
  device          text check (device in ('android', 'ios', 'web')),
  created_at      timestamptz not null default now()
);
create index if not exists play_rounds_student_idx on play_rounds (student_id, created_at desc);
create index if not exists play_rounds_started_idx on play_rounds (started_at);

create table if not exists play_skill_weeks (
  student_id        uuid not null references students (id) on delete cascade,
  week              date not null,
  skill             text not null,
  opportunities     int not null,
  correct           int,
  timing_median_ms  int,
  timing_spread_ms  int,
  rounds            int not null,
  primary key (student_id, week, skill)
);

create table if not exists play_ratings (
  id             bigint generated always as identity primary key,
  student_id     uuid not null references students (id) on delete cascade,
  skill          text not null,
  rating         smallint not null check (rating between 0 and 3),
  note           text check (char_length(note) <= 300),
  submission_id  bigint references assessment_submissions (id) on delete set null,
  rated_by       uuid references profiles (id) on delete set null default auth.uid(),
  rated_at       timestamptz not null default now()
);
create index if not exists play_ratings_student_idx on play_ratings (student_id, rated_at desc);

-- Recordings sent from a game reuse assessments (§10.4, #694): which game an assessment belongs to.
alter table assessments add column if not exists playground_game text;

-- ---------------------------------------------------------------- 4. checks (triggers)
-- The skill ids of §8.2.
create or replace function play_skill_ok(p_skill text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select p_skill = any (array['listen.stroke', 'listen.phrase', 'listen.tempo', 'listen.instrument', 'listen.kirtan',
    'rhythm.pulse', 'rhythm.matra', 'rhythm.cycle_sam', 'rhythm.guna', 'rhythm.sequence', 'rhythm.recall', 'vocal.pitch',
    'vocal.steady', 'vocal.bol_recite', 'vocal.call_response', 'kirtan.entry', 'kirtan.keep', 'kirtan.recover'])
$$;

-- One beat in the Playground's notation: '-' or 1-4 dictionary ids joined with '.'.
create or replace function play_beat_ok(p_beat text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(p_beat ~ '^(-|[a-z]{1,10}(\.[a-z]{1,10}){0,3})$', false)
$$;

-- The dictionary ids a list of beats (or space-separated answer keys) uses.
create or replace function play_bols_of(p_beats text[]) returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(array_agg(distinct b), '{}') from unnest(coalesce(p_beats, '{}')) beat,
    regexp_split_to_table(beat, '[ .]') b where b <> '-' and b <> ''
$$;

-- Status, revision and publication of the four content tables (#720):
--   - approve, retire, or take a row out of "approved" or "retired": the Guru only (or the SQL editor);
--   - coordinators write drafts and move them between draft and in_review;
--   - editing an approved row sends it back to in_review with revision + 1 (re-approval and a new publish needed);
--   - published_in / first_published_in are set only by publish_playground; the revision, approver and creator
--     cannot be written by hand.
create or replace function guard_play_status() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_meta       text[] := array['status', 'revision', 'published_in', 'first_published_in', 'approved_by', 'approved_at',
                               'created_by', 'created_at', 'updated_at', 'updated_by'];
  v_owner      boolean := auth.uid() is null;
  v_guru       boolean := auth.uid() is null or coalesce(is_guru(), false);
  -- Set only inside publish_playground, which runs as the owner (an app login cannot pass as it).
  v_publishing boolean := coalesce(current_setting('mridanga.play_publish', true), '') = 'on'
                          and current_user not in ('authenticated', 'anon');
  v_changed    boolean;
begin
  if tg_op = 'INSERT' then
    if new.status in ('approved', 'retired') and not v_guru then
      raise exception 'approval_guru_only' using detail = 'Only the head facilitator approves and retires.';
    end if;
    if not v_owner then
      new.revision := 1;
      new.published_in := null;
      new.first_published_in := null;
      new.created_by := auth.uid();
      new.created_at := now();
    end if;
    if new.status = 'approved' then
      new.approved_by := coalesce(auth.uid(), new.approved_by);
      new.approved_at := coalesce(new.approved_at, now());
    else
      new.approved_by := null;
      new.approved_at := null;
    end if;
    new.updated_at := now();
    new.updated_by := auth.uid();
    return new;
  end if;

  if v_publishing then
    return new;  -- publish_playground sets published_in / first_published_in only
  end if;
  new.published_in := old.published_in;
  new.first_published_in := old.first_published_in;
  new.revision := old.revision;
  new.approved_by := old.approved_by;
  new.approved_at := old.approved_at;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  v_changed := (to_jsonb(new) - v_meta) is distinct from (to_jsonb(old) - v_meta);

  if new.status is distinct from old.status
     and (new.status in ('approved', 'retired') or old.status in ('approved', 'retired')) and not v_guru then
    raise exception 'approval_guru_only' using detail = 'Only the head facilitator approves, retires or withdraws.';
  end if;
  if v_changed and old.status = 'approved' and new.status = 'approved' then
    new.status := 'in_review';
  end if;
  if v_changed and old.status = 'approved' then
    new.revision := old.revision + 1;
  end if;
  if new.status = 'approved' and old.status is distinct from 'approved' then
    new.approved_by := auth.uid();
    new.approved_at := now();
    new.published_in := null;
  elsif new.status <> 'approved' then
    new.approved_by := null;
    new.approved_at := null;
    new.published_in := null;
  end if;
  if not v_changed and new.status is not distinct from old.status then
    return new;  -- nothing but updated_* asked: leave them
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), old.updated_by);
  return new;
end $$;

-- A bol of the dictionary. Errors: bol_invalid.
create or replace function guard_play_bol() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.written := btrim(coalesce(new.written, ''));
  new.technique := nullif(btrim(coalesce(new.technique, '')), '');
  new.transcription := nullif(btrim(coalesce(new.transcription, '')), '');
  new.sounds_like := array(select distinct x from unnest(coalesce(new.sounds_like, '{}')) x where x <> new.id order by x);
  new.close_pairs := array(select distinct x from unnest(coalesce(new.close_pairs, '{}')) x where x <> new.id order by x);
  if char_length(new.written) not between 1 and 12
     or exists (select 1 from unnest(new.sounds_like || new.close_pairs) x where x is null or x !~ '^[a-z]{1,10}$')
     or new.sounds_like && new.close_pairs then
    raise exception 'bol_invalid' using detail = 'A written form of 1-12 characters; sounds-alike and close pairs are other bol ids, never both.';
  end if;
  if new.asset_id is not null and not exists (select 1 from play_assets a where a.id = new.asset_id and a.kind = 'stroke') then
    raise exception 'bol_invalid' using detail = 'A bol''s recording is a stroke sound.';
  end if;
  return new;
end $$;

-- A sound file. Path in the bucket playground-audio: <kind>/<uuid>.<wav|m4a|mp3>. Approving needs the file in
-- Storage and the licence's details (cc_by: a credit; permission: where the signed permission is kept).
-- Errors: asset_invalid, asset_file_missing, asset_licence_incomplete.
create or replace function guard_play_asset() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.performer := nullif(btrim(coalesce(new.performer, '')), '');
  new.permission_ref := nullif(btrim(coalesce(new.permission_ref, '')), '');
  new.credit := nullif(btrim(coalesce(new.credit, '')), '');
  new.instruments := array(select distinct lower(btrim(x)) from unnest(coalesce(new.instruments, '{}')) x where btrim(coalesce(x, '')) <> '' order by 1);
  if new.path is not null and new.path !~ ('^' || new.kind || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(wav|m4a|mp3)$') then
    raise exception 'asset_invalid' using detail = 'A file path is <kind>/<random id>.<wav|m4a|mp3>.';
  end if;
  if cardinality(new.instruments) > 8 or exists (select 1 from unnest(new.instruments) x where x !~ '^[a-z][a-z_ ]{1,29}$') then
    raise exception 'asset_invalid' using detail = 'At most 8 instrument names of 2-30 letters.';
  end if;
  if new.status = 'approved' then
    if new.path is not null and not exists (select 1 from storage.objects o where o.bucket_id = 'playground-audio' and o.name = new.path) then
      raise exception 'asset_file_missing';
    end if;
    if (new.licence = 'cc_by' and new.credit is null) or (new.licence = 'permission' and new.permission_ref is null) then
      raise exception 'asset_licence_incomplete' using detail = 'CC BY needs the credit; permission needs where the signed form is kept.';
    end if;
  end if;
  return new;
end $$;

-- A template. steps: 1-20 objects, each with a distinct whole "step" 1-20. Errors: template_invalid.
create or replace function guard_play_template() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ok boolean := play_skill_ok(new.skill) and jsonb_typeof(new.params) = 'object'
                  and jsonb_typeof(new.steps) = 'array' and jsonb_array_length(new.steps) between 1 and 20;
begin
  -- One check at a time: the step checks read the steps as a list only once it is one.
  if v_ok then
    v_ok := not exists (select 1 from jsonb_array_elements(new.steps) e
                         where jsonb_typeof(e) <> 'object' or jsonb_typeof(e -> 'step') <> 'number');
  end if;
  if v_ok then
    v_ok := not exists (select 1 from jsonb_array_elements(new.steps) e
                         where (e ->> 'step')::numeric not in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20))
        and (select count(distinct e ->> 'step') from jsonb_array_elements(new.steps) e) = jsonb_array_length(new.steps);
  end if;
  if not v_ok then
    raise exception 'template_invalid' using detail = 'A known skill; 1-20 steps, each {"step": 1-20, ...} once; params an object.';
  end if;
  return new;
end $$;

-- An exercise. Errors: exercise_invalid, exercise_template_invalid, and when it is approved:
-- exercise_bol_not_approved (every bol of its sequence and distractors is an approved dictionary bol),
-- exercise_asset_not_approved (every prompt sound approved).
create or replace function guard_play_exercise() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_keys text[] := '{}';
  v_ok   boolean;
begin
  new.attribution := nullif(btrim(coalesce(new.attribution, '')), '');
  if new.sequence is not null then
    new.sequence := array(select lower(btrim(b)) from unnest(new.sequence) with ordinality u(b, n) order by n);
  end if;
  -- One check at a time: a list is read as a list only once its type is known.
  v_ok := cardinality(new.skills) between 1 and 5 and not exists (select 1 from unnest(new.skills) s where not play_skill_ok(s))
      and jsonb_typeof(new.answer) = 'object' and jsonb_typeof(new.distractors) = 'array'
      and jsonb_array_length(new.distractors) <= 12
      and (new.sequence is not null or cardinality(new.prompt_assets) > 0);
  if v_ok and new.sequence is not null then
    v_ok := cardinality(new.sequence) between 1 and 32 and not exists (select 1 from unnest(new.sequence) b where not play_beat_ok(b));
  end if;
  if v_ok and new.divisions is not null then
    v_ok := new.sequence is not null and not exists (select 1 from unnest(new.divisions) d where d is null or d < 1)
        and (select sum(d) from unnest(new.divisions) d) = cardinality(new.sequence);
  end if;
  if v_ok then
    v_ok := not exists (select 1 from jsonb_object_keys(new.answer) k where k not in ('bols', 'order', 'tempo', 'instruments'))
        and not exists (select 1 from jsonb_array_elements(new.distractors) d where jsonb_typeof(d) <> 'string')
        and coalesce(jsonb_typeof(new.answer -> 'bols'), 'array') = 'array'
        and coalesce(jsonb_typeof(new.answer -> 'order'), 'array') = 'array'
        and coalesce(jsonb_typeof(new.answer -> 'instruments'), 'array') = 'array'
        and coalesce(new.answer ->> 'tempo', 'same') in ('faster', 'slower', 'same')
        and not exists (select 1 from unnest(new.prompt_assets) a where not exists (select 1 from play_assets x where x.id = a));
  end if;
  if v_ok then
    v_keys := array(select jsonb_array_elements_text(new.distractors));
    v_ok := not exists (select 1 from unnest(v_keys) k
                         where k !~ '^(-|[a-z]{1,10}(\.[a-z]{1,10}){0,3})( (-|[a-z]{1,10}(\.[a-z]{1,10}){0,3})){0,31}$')
        and not exists (select 1 from jsonb_array_elements(coalesce(new.answer -> 'bols', '[]') || coalesce(new.answer -> 'order', '[]')) b
                         where jsonb_typeof(b) <> 'string' or not play_beat_ok(b #>> '{}'))
        and not exists (select 1 from jsonb_array_elements(coalesce(new.answer -> 'instruments', '[]')) i
                         where jsonb_typeof(i) <> 'string' or (i #>> '{}') !~ '^[a-z][a-z_ ]{1,29}$');
  end if;
  if not v_ok then
    raise exception 'exercise_invalid' using detail = 'Skills known; beats - or 1-4 bol ids joined with "."; vibhags adding up; an answer and distractors in the same notation; a sequence or recorded prompts.';
  end if;
  if new.template_id is not null and not exists (select 1 from play_templates t where t.id = new.template_id and t.game = new.game) then
    raise exception 'exercise_template_invalid' using detail = 'The template is one of the same game.';
  end if;
  if new.status = 'approved' then
    if exists (select 1 from unnest(play_bols_of(coalesce(new.sequence, '{}') || v_keys
                 || array(select jsonb_array_elements_text(coalesce(new.answer -> 'bols', '[]') || coalesce(new.answer -> 'order', '[]'))))) b
                where not exists (select 1 from play_bols d where d.id = b and d.status = 'approved')) then
      raise exception 'exercise_bol_not_approved' using detail = 'Approve every bol it uses in the dictionary first.';
    end if;
    if exists (select 1 from unnest(new.prompt_assets) a where not exists (select 1 from play_assets x where x.id = a and x.status = 'approved')) then
      raise exception 'exercise_asset_not_approved';
    end if;
  end if;
  return new;
end $$;

-- Per-table checks run first ("check" sorts before "status").
drop trigger if exists play_bols_check on play_bols;
create trigger play_bols_check before insert or update on play_bols for each row execute function guard_play_bol();
drop trigger if exists play_assets_check on play_assets;
create trigger play_assets_check before insert or update on play_assets for each row execute function guard_play_asset();
drop trigger if exists play_templates_check on play_templates;
create trigger play_templates_check before insert or update on play_templates for each row execute function guard_play_template();
drop trigger if exists play_exercises_check on play_exercises;
create trigger play_exercises_check before insert or update on play_exercises for each row execute function guard_play_exercise();
drop trigger if exists play_bols_status on play_bols;
create trigger play_bols_status before insert or update on play_bols for each row execute function guard_play_status();
drop trigger if exists play_assets_status on play_assets;
create trigger play_assets_status before insert or update on play_assets for each row execute function guard_play_status();
drop trigger if exists play_templates_status on play_templates;
create trigger play_templates_status before insert or update on play_templates for each row execute function guard_play_status();
drop trigger if exists play_exercises_status on play_exercises;
create trigger play_exercises_status before insert or update on play_exercises for each row execute function guard_play_status();

-- A facilitator never rates themselves (#318, 0053's trigger).
drop trigger if exists play_ratings_refuse_own_record on play_ratings;
create trigger play_ratings_refuse_own_record before insert or update or delete on play_ratings
  for each row execute function refuse_own_record();
-- Ratings: the note trimmed; the rater is the one signed in.
create or replace function guard_play_rating() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not play_skill_ok(new.skill) then raise exception 'skill_invalid'; end if;
  new.note := nullif(btrim(coalesce(new.note, '')), '');
  if tg_op = 'UPDATE' then
    new.rated_by := old.rated_by;
    new.student_id := old.student_id;
  else
    new.rated_by := coalesce(auth.uid(), new.rated_by);
  end if;
  new.rated_at := now();
  return new;
end $$;
drop trigger if exists play_ratings_guard on play_ratings;
create trigger play_ratings_guard before insert or update on play_ratings for each row execute function guard_play_rating();

-- Assignments and settings: skills and steps checked; who changed the settings.
create or replace function guard_play_assignment() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.skill is not null and not play_skill_ok(new.skill) then raise exception 'skill_invalid'; end if;
  new.note := nullif(btrim(coalesce(new.note, '')), '');
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists play_assignments_guard on play_assignments;
create trigger play_assignments_guard before insert or update on play_assignments for each row execute function guard_play_assignment();

create or replace function guard_play_settings() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if exists (select 1 from jsonb_each(new.steps) e
              where jsonb_typeof(e.value) <> 'object'
                 or exists (select 1 from jsonb_each(e.value) l where l.key not in ('min', 'max') or jsonb_typeof(l.value) <> 'number'
                              or (l.value #>> '{}')::numeric not between 1 and 20)) then
    raise exception 'steps_invalid' using detail = '{"<game>": {"min": 1-20, "max": 1-20}}';
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists play_student_settings_guard on play_student_settings;
create trigger play_student_settings_guard before insert or update on play_student_settings
  for each row execute function guard_play_settings();

-- The change log (audit_row) for the content, assignments and ratings; rounds are not logged (volume); settings have
-- no id column for the log (who changed them last is on the row).
drop trigger if exists audit_play_bols on play_bols;
create trigger audit_play_bols after insert or update or delete on play_bols for each row execute function audit_row();
drop trigger if exists audit_play_assets on play_assets;
create trigger audit_play_assets after insert or update or delete on play_assets for each row execute function audit_row();
drop trigger if exists audit_play_templates on play_templates;
create trigger audit_play_templates after insert or update or delete on play_templates for each row execute function audit_row();
drop trigger if exists audit_play_exercises on play_exercises;
create trigger audit_play_exercises after insert or update or delete on play_exercises for each row execute function audit_row();
drop trigger if exists audit_play_assignments on play_assignments;
create trigger audit_play_assignments after insert or update or delete on play_assignments for each row execute function audit_row();
drop trigger if exists audit_play_ratings on play_ratings;
create trigger audit_play_ratings after insert or update or delete on play_ratings for each row execute function audit_row();

-- ---------------------------------------------------------------- 5. row-level security
-- Content: staff read all and write (the triggers above decide what); a student reads approved, published,
-- non-placeholder rows (the app reads the pack through playground_pack). Deleting: a draft never published, by the
-- Guru or its author.
alter table play_bols enable row level security;
alter table play_assets enable row level security;
alter table play_templates enable row level security;
alter table play_exercises enable row level security;

drop policy if exists readable on play_bols;
create policy readable on play_bols for select to authenticated using (
  (select is_staff()) or ((select my_role()) = 'student' and status = 'approved' and published_in is not null and not placeholder));
drop policy if exists staff_insert on play_bols;
create policy staff_insert on play_bols for insert to authenticated with check ((select is_staff()));
drop policy if exists staff_update on play_bols;
create policy staff_update on play_bols for update to authenticated using ((select is_staff())) with check ((select is_staff()));
drop policy if exists draft_delete on play_bols;
create policy draft_delete on play_bols for delete to authenticated using (
  first_published_in is null and status = 'draft' and ((select is_guru()) or ((select is_staff()) and created_by = (select auth.uid()))));

drop policy if exists readable on play_assets;
create policy readable on play_assets for select to authenticated using (
  (select is_staff()) or ((select my_role()) = 'student' and status = 'approved' and published_in is not null and not placeholder));
drop policy if exists staff_insert on play_assets;
create policy staff_insert on play_assets for insert to authenticated with check ((select is_staff()));
drop policy if exists staff_update on play_assets;
create policy staff_update on play_assets for update to authenticated using ((select is_staff())) with check ((select is_staff()));
drop policy if exists draft_delete on play_assets;
create policy draft_delete on play_assets for delete to authenticated using (
  first_published_in is null and status = 'draft' and ((select is_guru()) or ((select is_staff()) and created_by = (select auth.uid()))));

drop policy if exists readable on play_templates;
create policy readable on play_templates for select to authenticated using (
  (select is_staff()) or ((select my_role()) = 'student' and status = 'approved' and published_in is not null and not placeholder));
drop policy if exists staff_insert on play_templates;
create policy staff_insert on play_templates for insert to authenticated with check ((select is_staff()));
drop policy if exists staff_update on play_templates;
create policy staff_update on play_templates for update to authenticated using ((select is_staff())) with check ((select is_staff()));
drop policy if exists draft_delete on play_templates;
create policy draft_delete on play_templates for delete to authenticated using (
  first_published_in is null and status = 'draft' and ((select is_guru()) or ((select is_staff()) and created_by = (select auth.uid()))));

drop policy if exists readable on play_exercises;
create policy readable on play_exercises for select to authenticated using (
  (select is_staff()) or ((select my_role()) = 'student' and status = 'approved' and published_in is not null and not placeholder));
drop policy if exists staff_insert on play_exercises;
create policy staff_insert on play_exercises for insert to authenticated with check ((select is_staff()));
drop policy if exists staff_update on play_exercises;
create policy staff_update on play_exercises for update to authenticated using ((select is_staff())) with check ((select is_staff()));
drop policy if exists draft_delete on play_exercises;
create policy draft_delete on play_exercises for delete to authenticated using (
  first_published_in is null and status = 'draft' and ((select is_guru()) or ((select is_staff()) and created_by = (select auth.uid()))));

-- Publications: everyone with a class role reads them; written only by publish_playground.
alter table play_publications enable row level security;
drop policy if exists readable on play_publications;
create policy readable on play_publications for select to authenticated using ((select has_class_role()));

-- Assignments and settings: staff; a student reads theirs through my_playground_state.
alter table play_assignments enable row level security;
drop policy if exists staff_all on play_assignments;
create policy staff_all on play_assignments for all to authenticated using ((select is_staff())) with check ((select is_staff()));
alter table play_student_settings enable row level security;
drop policy if exists staff_all on play_student_settings;
create policy staff_all on play_student_settings for all to authenticated using ((select is_staff())) with check ((select is_staff()));

-- Rounds and weekly summaries: a student reads their own, staff all (as practice logs, #495); written only by
-- record_round and the nightly job.
alter table play_rounds enable row level security;
drop policy if exists readable on play_rounds;
create policy readable on play_rounds for select to authenticated using (
  student_id = (select my_student_id()) or (select is_staff()));
alter table play_skill_weeks enable row level security;
drop policy if exists readable on play_skill_weeks;
create policy readable on play_skill_weeks for select to authenticated using (
  student_id = (select my_student_id()) or (select is_staff()));

-- Ratings: a student reads their own; staff read all and add; the rater (or the Guru) changes; the Guru deletes.
alter table play_ratings enable row level security;
drop policy if exists readable on play_ratings;
create policy readable on play_ratings for select to authenticated using (
  student_id = (select my_student_id()) or (select is_staff()));
drop policy if exists staff_insert on play_ratings;
create policy staff_insert on play_ratings for insert to authenticated with check ((select is_staff()));
drop policy if exists rater_update on play_ratings;
create policy rater_update on play_ratings for update to authenticated
  using ((select is_guru()) or ((select is_staff()) and rated_by = (select auth.uid())))
  with check ((select is_guru()) or ((select is_staff()) and rated_by = (select auth.uid())));
drop policy if exists guru_delete on play_ratings;
create policy guru_delete on play_ratings for delete to authenticated using ((select is_guru()));

revoke all on play_bols, play_assets, play_templates, play_exercises, play_publications, play_assignments,
  play_student_settings, play_rounds, play_skill_weeks, play_ratings from public, anon;
revoke truncate, references, trigger on play_bols, play_assets, play_templates, play_exercises, play_publications,
  play_assignments, play_student_settings, play_rounds, play_skill_weeks, play_ratings from authenticated;
revoke insert, update, delete on play_publications, play_rounds, play_skill_weeks from authenticated;

-- ---------------------------------------------------------------- 6. the sound files
-- Private bucket; 15 MB; audio only. Read: staff any file; a student a file an approved, published asset lists.
-- Upload: staff, into <kind>/<uuid>.<ext>. Delete: staff, a file no approved asset lists.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('playground-audio', 'playground-audio', false, 15728640, array['audio/wav', 'audio/mp4', 'audio/mpeg'])
on conflict (id) do update
   set public = false,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

create or replace function play_audio_readable(p_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(is_staff(), false)
      or (coalesce(my_role() = 'student', false) and exists (select 1 from play_assets a where a.path = p_name
            and a.status = 'approved' and a.published_in is not null and (not a.placeholder or play_placeholders_ok())))
$$;

create or replace function play_audio_uploadable(p_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(is_staff(), false)
     and coalesce(p_name ~ '^(stroke|phrase|tempo|kirtan|instrument|voice|tone)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(wav|m4a|mp3)$', false)
     and not exists (select 1 from play_assets a where a.path = p_name)
$$;

create or replace function play_audio_deletable(p_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(is_staff(), false)
     and not exists (select 1 from play_assets a where a.path = p_name and (a.status = 'approved' or a.first_published_in is not null))
$$;

drop policy if exists "playground audio: read" on storage.objects;
create policy "playground audio: read" on storage.objects for select to authenticated
  using (bucket_id = 'playground-audio' and public.play_audio_readable(name));
drop policy if exists "playground audio: upload" on storage.objects;
create policy "playground audio: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'playground-audio' and public.play_audio_uploadable(name));
drop policy if exists "playground audio: delete" on storage.objects;
create policy "playground audio: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'playground-audio' and public.play_audio_deletable(name));

-- ---------------------------------------------------------------- 7. answers (the same rules as src/lib/playground/check.ts)
-- Two dictionary bols sound the same: equal, or either lists the other as sounding alike (approved bols).
create or replace function play_same_bol(p_a text, p_b text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_a = p_b or exists (select 1 from play_bols d where d.status = 'approved'
    and ((d.id = p_a and p_b = any (d.sounds_like)) or (d.id = p_b and p_a = any (d.sounds_like))))
$$;

-- Is the given answer right? Bol games beat by beat and bol by bol by sound; Sound Explorer as a set; else equal.
create or replace function play_same_answer(p_game text, p_expected text, p_given text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_e text[]; v_g text[]; v_eb text[]; v_gb text[];
begin
  if p_expected is null or p_given is null then return false; end if;
  if p_expected = p_given then return true; end if;
  if p_game = 'sound_explorer' then
    return p_expected = (select string_agg(x, ' ' order by x) from unnest(string_to_array(p_given, ' ')) x);
  end if;
  if p_game not in ('sound_detective', 'missing_beat', 'rhythm_builder', 'echo') then return false; end if;
  v_e := string_to_array(p_expected, ' ');
  v_g := string_to_array(p_given, ' ');
  if cardinality(v_e) <> cardinality(v_g) then return false; end if;
  for i in 1 .. cardinality(v_e) loop
    if v_e[i] = '-' or v_g[i] = '-' then
      if v_e[i] <> v_g[i] then return false; end if;
      continue;
    end if;
    v_eb := string_to_array(v_e[i], '.');
    v_gb := string_to_array(v_g[i], '.');
    if cardinality(v_eb) <> cardinality(v_gb) then return false; end if;
    for j in 1 .. cardinality(v_eb) loop
      if not play_same_bol(v_eb[j], v_gb[j]) then return false; end if;
    end loop;
  end loop;
  return true;
end $$;

-- The right answer of an exercise for a saved question, or null when it cannot be told.
create or replace function play_expected(p_game text, p_ex play_exercises, p_q jsonb) returns text
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_a numeric; v_b numeric; v_gaps int[];
begin
  if p_game = 'sound_detective' then
    if jsonb_typeof(p_ex.answer -> 'bols') = 'array' and jsonb_array_length(p_ex.answer -> 'bols') > 0 then
      return (select string_agg(x, ' ' order by n) from jsonb_array_elements_text(p_ex.answer -> 'bols') with ordinality u(x, n));
    end if;
    return array_to_string(p_ex.sequence, ' ');
  elsif p_game = 'missing_beat' then
    if jsonb_typeof(p_q -> 'gap') <> 'array' or jsonb_array_length(p_q -> 'gap') = 0
       or exists (select 1 from jsonb_array_elements(p_q -> 'gap') g where jsonb_typeof(g) <> 'number'
                    or (g #>> '{}')::numeric <> trunc((g #>> '{}')::numeric)
                    or (g #>> '{}')::numeric < 0 or (g #>> '{}')::numeric >= coalesce(cardinality(p_ex.sequence), 0)) then
      return null;
    end if;
    v_gaps := array(select (g #>> '{}')::int from jsonb_array_elements(p_q -> 'gap') g order by 1);
    return (select string_agg(p_ex.sequence[g + 1], ' ' order by n) from unnest(v_gaps) with ordinality u(g, n));
  elsif p_game = 'rhythm_builder' then
    if jsonb_typeof(p_ex.answer -> 'order') = 'array' and jsonb_array_length(p_ex.answer -> 'order') > 0 then
      return (select string_agg(x, ' ' order by n) from jsonb_array_elements_text(p_ex.answer -> 'order') with ordinality u(x, n));
    end if;
    return array_to_string(p_ex.sequence, ' ');
  elsif p_game = 'tempo_detective' then
    if jsonb_typeof(p_q -> 'bpm') <> 'array' or jsonb_array_length(p_q -> 'bpm') <> 2
       or jsonb_typeof(p_q -> 'bpm' -> 0) <> 'number' or jsonb_typeof(p_q -> 'bpm' -> 1) <> 'number' then
      return null;
    end if;
    v_a := (p_q -> 'bpm' ->> 0)::numeric;
    v_b := (p_q -> 'bpm' ->> 1)::numeric;
    return case when v_b > v_a then 'faster' when v_b < v_a then 'slower' else 'same' end;
  elsif p_game = 'sound_explorer' then
    if jsonb_typeof(p_ex.answer -> 'instruments') <> 'array' then return null; end if;
    return (select string_agg(x, ' ' order by x) from jsonb_array_elements_text(p_ex.answer -> 'instruments') x);
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------- 8. the app's functions
-- The published pack, or null when the caller has it already (p_have_version = the current version). Students
-- and staff (staff open games in preview). Placeholders only while playground_allow_placeholders is on (TEST).
create or replace function playground_pack(p_have_version int default 0) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_version int;
  v_at      timestamptz;
  v_ph      boolean := play_placeholders_ok();
begin
  if not coalesce(my_role() in ('student', 'coordinator', 'guru'), false) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select version, published_at into v_version, v_at from play_publications order by version desc limit 1;
  if v_version is null or v_version = p_have_version then return null; end if;
  return jsonb_build_object(
    'version', v_version,
    'published_at', v_at,
    'placeholders', v_ph,
    'labels', coalesce((select value from settings where key = 'playground_labels'), '{}'::jsonb),
    'bols', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'written', b.written, 'head', b.head,
               'technique', b.technique, 'open', b.open, 'level_id', b.level_id, 'sounds_like', to_jsonb(b.sounds_like),
               'close_pairs', to_jsonb(b.close_pairs), 'asset_id', b.asset_id, 'placeholder', b.placeholder) order by b.id), '[]'::jsonb)
               from play_bols b where b.status = 'approved' and b.published_in is not null and (not b.placeholder or v_ph)),
    'assets', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'path', a.path,
                 'bundled_key', a.bundled_key, 'mime', a.mime, 'duration_ms', a.duration_ms, 'bpm', a.bpm,
                 'beat_grid', a.beat_grid, 'instruments', to_jsonb(a.instruments), 'licence', a.licence,
                 'performer', a.performer, 'credit', a.credit, 'placeholder', a.placeholder) order by a.id), '[]'::jsonb)
                 from play_assets a where a.status = 'approved' and a.published_in is not null and (not a.placeholder or v_ph)),
    'templates', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'game', t.game, 'skill', t.skill,
                    'response_mode', t.response_mode, 'level_min', t.level_min, 'level_max', t.level_max,
                    'steps', t.steps, 'params', t.params, 'revision', t.revision) order by t.id), '[]'::jsonb)
                    from play_templates t where t.status = 'approved' and t.published_in is not null and (not t.placeholder or v_ph)),
    'exercises', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'game', e.game, 'template_id', e.template_id,
                    'level_id', e.level_id, 'skills', to_jsonb(e.skills), 'taal_id', e.taal_id, 'sequence', to_jsonb(e.sequence),
                    'divisions', to_jsonb(e.divisions), 'answer', e.answer, 'distractors', e.distractors,
                    'prompt_assets', to_jsonb(e.prompt_assets), 'bpm_min', e.bpm_min, 'bpm_max', e.bpm_max,
                    'guna', to_jsonb(e.guna), 'requires_item', e.requires_item, 'locale', e.locale,
                    'attribution', e.attribution, 'placeholder', e.placeholder, 'revision', e.revision) order by e.id), '[]'::jsonb)
                    from play_exercises e where e.status = 'approved' and e.published_in is not null and (not e.placeholder or v_ph)));
end $$;

-- One student's state as jsonb (my_playground_state for the student, staff_playground_progress for staff).
create or replace function play_state_of(p_student uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'student_id', s.id,
    'level_id', s.level_id,
    'ticked', (select coalesce(jsonb_agg(p.item_id order by p.item_id), '[]'::jsonb) from student_progress p where p.student_id = s.id),
    'groups', (select coalesce(jsonb_agg(m.group_id order by m.group_id), '[]'::jsonb) from group_members m
                 join groups g on g.id = m.group_id and g.active where s.profile_id is not null and m.profile_id = s.profile_id),
    'settings', (select to_jsonb(x) - 'student_id' - 'updated_by' - 'updated_at' from play_student_settings x where x.student_id = s.id),
    'assignments', (select coalesce(jsonb_agg(to_jsonb(a) - 'created_by' - 'created_at' order by a.id), '[]'::jsonb)
                      from play_assignments a
                     where (a.due_day is null or a.due_day >= today_ist()) and a.from_day <= today_ist()
                       and (a.student_id = s.id or a.level_id = s.level_id
                            or a.group_id in (select m.group_id from group_members m where s.profile_id is not null and m.profile_id = s.profile_id))),
    'rounds', (select coalesce(jsonb_agg(to_jsonb(r) - 'student_id' - 'created_at' order by r.started_at desc), '[]'::jsonb)
                 from play_rounds r where r.student_id = s.id and r.started_at > now() - interval '30 days'))
  from students s where s.id = p_student
$$;

-- The signed-in student's own state. Errors: not_allowed (no student record).
create or replace function my_playground_state() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_student uuid := my_student_id();
begin
  if v_student is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  return play_state_of(v_student);
end $$;

-- The student switches Surprise me on or off (the only setting a student changes).
create or replace function play_set_surprise(p_on boolean) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_student uuid := my_student_id();
begin
  if v_student is null or p_on is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  insert into play_student_settings (student_id, surprise) values (v_student, p_on)
  on conflict (student_id) do update set surprise = excluded.surprise;
  return p_on;
end $$;

-- Saves one round (the offline queue's request id is the round's id). Checks: the caller's own student record (not
-- withdrawn); a known game, skill, mode, step 1-20, seed, a published content version; started in the last 14
-- days; 1-40 items, each of an exercise of this game that has been published (in this version or before) and is
-- not a placeholder (unless TEST allows it); Tempo Detective's tempos inside the range. Every recognition answer is
-- marked again here (play_expected, play_same_answer): a changed "ok" does not count. At most 200 rounds a day.
-- The same id again: {"result":"duplicate"} and nothing changes. Returns {"result":"saved","n_correct":...}.
create or replace function record_round(p_round jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_student  uuid := my_student_id();
  s          students;
  v_id       uuid;
  v_game     text := p_round ->> 'game';
  v_skill    text := p_round ->> 'skill';
  v_mode     text := p_round ->> 'mode';
  v_step     int;
  v_seed     bigint;
  v_version  int;
  v_started  timestamptz;
  v_finished timestamptz;
  v_device   text := p_round ->> 'device';
  v_items    jsonb := '[]'::jsonb;
  v_item     jsonb;
  v_ex       play_exercises;
  v_expected text;
  v_ok       boolean;
  v_correct  int := 0;
  v_marked   int := 0;
  v_timing   jsonb;
  v_ph       boolean := play_placeholders_ok();
  v_owner    uuid;
begin
  if v_student is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into s from students where id = v_student;
  if s.withdrawn_at is not null then raise exception 'student_withdrawn'; end if;
  if jsonb_typeof(p_round) <> 'object' then raise exception 'round_invalid'; end if;
  begin
    v_id := (p_round ->> 'id')::uuid;
    v_step := (p_round ->> 'step')::int;
    v_seed := (p_round ->> 'seed')::bigint;
    v_version := (p_round ->> 'content_version')::int;
    v_started := (p_round ->> 'started_at')::timestamptz;
    v_finished := (p_round ->> 'finished_at')::timestamptz;
  exception when others then
    raise exception 'round_invalid' using detail = 'id, step, seed, content_version, started_at, finished_at';
  end;

  select student_id into v_owner from play_rounds where id = v_id;
  if found then
    if v_owner <> v_student then raise exception 'round_id_taken'; end if;
    return jsonb_build_object('result', 'duplicate', 'id', v_id);
  end if;

  if v_id is null or v_game is null
     or v_game not in ('sound_detective', 'tap_the_beat', 'echo', 'missing_beat', 'voice_companion', 'rhythm_builder',
                       'kirtan_companion', 'tempo_detective', 'sound_explorer', 'daily_quest', 'tala_cycle',
                       'rhythm_switching', 'vocal_studio', 'kirtan_sync')
     or not coalesce(play_skill_ok(v_skill), false)
     or coalesce(v_mode, '') not in ('play', 'review', 'daily', 'surprise', 'assigned')
     or v_step is null or v_step not between 1 and 20
     or v_seed is null or v_seed not between 0 and 4294967295
     or v_version is null or not exists (select 1 from play_publications where version = v_version)
     or v_started is null or v_started < now() - interval '14 days' or v_started > now() + interval '10 minutes'
     or (v_finished is not null and (v_finished < v_started or v_finished > now() + interval '10 minutes'))
     or (v_device is not null and v_device not in ('android', 'ios', 'web'))
     or jsonb_typeof(p_round -> 'items') <> 'array' or jsonb_array_length(p_round -> 'items') not between 1 and 40 then
    raise exception 'round_invalid';
  end if;
  if (select count(*) from play_rounds where student_id = v_student
        and created_at >= (today_ist()::timestamp at time zone 'Asia/Kolkata')) >= 200 then
    raise exception 'round_limit' using detail = 'At most 200 rounds a day.';
  end if;

  for v_item in select value from jsonb_array_elements(p_round -> 'items') loop
    if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item -> 'e') <> 'number' then raise exception 'round_invalid'; end if;
    select * into v_ex from play_exercises where id = (v_item ->> 'e')::bigint;
    if not found or v_ex.game <> v_game or v_ex.first_published_in is null or v_ex.first_published_in > v_version
       or (v_ex.placeholder and not v_ph) then
      raise exception 'round_content_unknown' using detail = format('exercise %s', v_item ->> 'e');
    end if;
    if (v_item ? 'a' and (jsonb_typeof(v_item -> 'a') <> 'string' or char_length(v_item ->> 'a') > 300))
       or (v_item ? 'q' and (jsonb_typeof(v_item -> 'q') <> 'object' or char_length((v_item -> 'q')::text) > 1000))
       or (v_item ? 'rp' and (jsonb_typeof(v_item -> 'rp') <> 'number' or (v_item ->> 'rp')::numeric not between 0 and 99))
       or (v_item ? 'ms' and (jsonb_typeof(v_item -> 'ms') <> 'number' or (v_item ->> 'ms')::numeric not between 0 and 3600000))
       or (v_item ? 'tr' and (jsonb_typeof(v_item -> 'tr') <> 'number' or (v_item ->> 'tr')::numeric not between 0 and 9))
       or (v_item ? 'ok' and jsonb_typeof(v_item -> 'ok') <> 'boolean')
       or (v_item ? 'rv' and jsonb_typeof(v_item -> 'rv') <> 'boolean') then
      raise exception 'round_invalid';
    end if;
    if v_game = 'tempo_detective' and jsonb_typeof(v_item -> 'q' -> 'bpm') = 'array' and exists (
         select 1 from jsonb_array_elements(v_item -> 'q' -> 'bpm') b
          where jsonb_typeof(b) <> 'number' or (b #>> '{}')::numeric not between 30 and 240
             or (b #>> '{}')::numeric < coalesce(v_ex.bpm_min, 30) or (b #>> '{}')::numeric > coalesce(v_ex.bpm_max, 240)) then
      raise exception 'round_invalid' using detail = 'A tempo outside the exercise''s range.';
    end if;
    v_ok := case when v_item ? 'ok' then (v_item ->> 'ok')::boolean end;
    if v_game in ('sound_detective', 'missing_beat', 'rhythm_builder', 'tempo_detective', 'sound_explorer') then
      v_expected := play_expected(v_game, v_ex, v_item -> 'q');
      v_ok := v_item ? 'a' and v_expected is not null and play_same_answer(v_game, v_expected, v_item ->> 'a');
    end if;
    if v_ok is not null then
      v_marked := v_marked + 1;
      if v_ok then v_correct := v_correct + 1; end if;
    end if;
    -- The revision played (offline, it may be older than today's); never a later one.
    v_items := v_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'e', v_ex.id,
      'r', case when jsonb_typeof(v_item -> 'r') = 'number' and (v_item ->> 'r')::numeric in (select generate_series(1, v_ex.revision))
                then (v_item ->> 'r')::int else v_ex.revision end,
      'q', v_item -> 'q', 'a', v_item -> 'a', 'ok', v_ok,
      'rp', v_item -> 'rp', 'ms', v_item -> 'ms', 'rv', v_item -> 'rv', 'tr', v_item -> 'tr')));
  end loop;

  if jsonb_typeof(p_round -> 'timing') = 'object' then
    v_timing := p_round -> 'timing';
    if jsonb_typeof(v_timing -> 'median_ms') <> 'number' or (v_timing ->> 'median_ms')::numeric not between -10000 and 10000
       or jsonb_typeof(v_timing -> 'spread_ms') <> 'number' or (v_timing ->> 'spread_ms')::numeric not between 0 and 10000
       or jsonb_typeof(v_timing -> 'calibrated') <> 'boolean'
       or (v_timing ? 'offset_ms' and (jsonb_typeof(v_timing -> 'offset_ms') <> 'number'
           or (v_timing ->> 'offset_ms')::numeric not between -5000 and 5000)) then
      raise exception 'round_invalid' using detail = 'timing';
    end if;
    v_timing := jsonb_strip_nulls(jsonb_build_object('median_ms', round((v_timing ->> 'median_ms')::numeric),
      'spread_ms', round((v_timing ->> 'spread_ms')::numeric), 'calibrated', (v_timing ->> 'calibrated')::boolean,
      'offset_ms', round((v_timing ->> 'offset_ms')::numeric)));
  end if;

  insert into play_rounds (id, student_id, game, skill, mode, level_id, step, seed, content_version, started_at,
                           finished_at, items, n_items, n_correct, timing, device)
  values (v_id, v_student, v_game, v_skill, v_mode, s.level_id, v_step, v_seed, v_version, v_started, v_finished,
          v_items, jsonb_array_length(v_items), case when v_marked > 0 then v_correct end, v_timing, v_device);
  return jsonb_build_object('result', 'saved', 'id', v_id, 'n_correct', case when v_marked > 0 then v_correct end, 'items', v_items);
end $$;

-- The Guru approves, retires or sends back a row (the triggers check the rest). p_kind: bol, asset, template,
-- exercise. Errors: not_allowed, kind_invalid, status_invalid, content_not_found (+ the guards' errors).
create or replace function play_set_status(p_kind text, p_id text, p_status text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row jsonb;
begin
  if auth.uid() is not null and not coalesce(is_staff(), false) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('draft', 'in_review', 'approved', 'retired') then raise exception 'status_invalid'; end if;
  if p_kind = 'bol' then
    update play_bols set status = p_status where id = p_id returning to_jsonb(play_bols.*) into v_row;
  elsif p_kind in ('asset', 'template', 'exercise') then
    if p_id !~ '^[0-9]{1,18}$' then raise exception 'content_not_found'; end if;
    if p_kind = 'asset' then
      update play_assets set status = p_status where id = p_id::bigint returning to_jsonb(play_assets.*) into v_row;
    elsif p_kind = 'template' then
      update play_templates set status = p_status where id = p_id::bigint returning to_jsonb(play_templates.*) into v_row;
    else
      update play_exercises set status = p_status where id = p_id::bigint returning to_jsonb(play_exercises.*) into v_row;
    end if;
  else
    raise exception 'kind_invalid';
  end if;
  if v_row is null then raise exception 'content_not_found'; end if;
  return jsonb_build_object('status', v_row ->> 'status', 'revision', (v_row ->> 'revision')::int);
end $$;

-- Publishes every approved row not yet in a version: one new version number. The Guru (or the SQL editor). Refuses
-- placeholder content unless playground_allow_placeholders is on (TEST only, §19.3). Returns {version, counts}.
-- Errors: not_allowed, placeholders_not_allowed, note_too_long.
create or replace function publish_playground(p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_version int;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_counts  jsonb;
begin
  if auth.uid() is not null and not coalesce(is_guru(), false) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if char_length(v_note) > 300 then raise exception 'note_too_long'; end if;
  if not play_placeholders_ok() and (
       exists (select 1 from play_bols where status = 'approved' and placeholder)
    or exists (select 1 from play_assets where status = 'approved' and placeholder)
    or exists (select 1 from play_templates where status = 'approved' and placeholder)
    or exists (select 1 from play_exercises where status = 'approved' and placeholder)) then
    raise exception 'placeholders_not_allowed' using detail = 'Placeholder (TEST) content cannot be published here.';
  end if;
  perform pg_advisory_xact_lock(hashtext('publish_playground'));
  select coalesce(max(version), 0) + 1 into v_version from play_publications;
  perform set_config('mridanga.play_publish', 'on', true);
  update play_bols set published_in = v_version, first_published_in = coalesce(first_published_in, v_version)
   where status = 'approved' and published_in is null;
  update play_assets set published_in = v_version, first_published_in = coalesce(first_published_in, v_version)
   where status = 'approved' and published_in is null;
  update play_templates set published_in = v_version, first_published_in = coalesce(first_published_in, v_version)
   where status = 'approved' and published_in is null;
  update play_exercises set published_in = v_version, first_published_in = coalesce(first_published_in, v_version)
   where status = 'approved' and published_in is null;
  perform set_config('mridanga.play_publish', '', true);
  v_counts := jsonb_build_object(
    'bols', (select count(*) from play_bols where status = 'approved' and published_in is not null),
    'assets', (select count(*) from play_assets where status = 'approved' and published_in is not null),
    'templates', (select count(*) from play_templates where status = 'approved' and published_in is not null),
    'exercises', (select coalesce(jsonb_object_agg(game, n), '{}'::jsonb) from (select game, count(*) as n from play_exercises
                    where status = 'approved' and published_in is not null group by game) x));
  insert into play_publications (version, published_by, note, counts) values (v_version, auth.uid(), v_note, v_counts);
  return jsonb_build_object('version', v_version, 'counts', v_counts);
end $$;

-- Staff: one student's Playground (state, weekly summaries, ratings). Errors: not_allowed, student_not_found.
create or replace function staff_playground_progress(p_student uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not coalesce(is_staff(), false) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if not exists (select 1 from students where id = p_student) then raise exception 'student_not_found'; end if;
  return play_state_of(p_student) || jsonb_build_object(
    'weeks', (select coalesce(jsonb_agg(to_jsonb(w) - 'student_id' order by w.week desc, w.skill), '[]'::jsonb)
                from play_skill_weeks w where w.student_id = p_student and w.week > today_ist() - 366),
    'ratings', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'skill', r.skill, 'rating', r.rating, 'note', r.note,
                  'submission_id', r.submission_id, 'rated_at', r.rated_at, 'rated_by_name', p.full_name) order by r.rated_at desc), '[]'::jsonb)
                  from play_ratings r left join profiles p on p.id = r.rated_by where r.student_id = p_student));
end $$;

-- Staff: the students of a level or a group (not withdrawn) with their rounds of the last 30 days, for Class
-- progress (labels are worked out in the app, src/lib/playground/labels.ts). At most 300 students.
-- Errors: not_allowed, filter_required (a level or a group).
create or replace function staff_playground_class(p_level smallint default null, p_group bigint default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not coalesce(is_staff(), false) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_level is null and p_group is null then raise exception 'filter_required'; end if;
  return (select coalesce(jsonb_agg(x.j order by x.name), '[]'::jsonb) from (
    select s.full_name as name, jsonb_build_object('student_id', s.id, 'full_name', s.full_name, 'level_id', s.level_id,
      'rounds', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'game', r.game, 'skill', r.skill, 'mode', r.mode,
                   'level_id', r.level_id, 'step', r.step, 'seed', r.seed, 'content_version', r.content_version,
                   'started_at', r.started_at, 'finished_at', r.finished_at, 'items', r.items, 'timing', r.timing,
                   'device', r.device) order by r.started_at desc), '[]'::jsonb)
                   from play_rounds r where r.student_id = s.id and r.started_at > now() - interval '30 days')) as j
      from students s
     where s.withdrawn_at is null
       and (p_level is null or s.level_id = p_level)
       and (p_group is null or exists (select 1 from group_members m where m.group_id = p_group and m.profile_id = s.profile_id))
     order by s.full_name
     limit 300) x);
end $$;

-- ---------------------------------------------------------------- 9. retention (§13.4)
-- Nightly: rounds older than 180 days folded into the weekly per-skill summaries (Monday weeks, India time) and
-- deleted. Returns the rounds folded.
create or replace function playground_daily() returns int
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  with old as (
    delete from play_rounds where started_at < now() - interval '180 days'
    returning student_id, skill, started_at, n_items, n_correct, timing
  ), weekly as (
    select student_id, date_trunc('week', started_at at time zone 'Asia/Kolkata')::date as week, skill,
           sum(n_items)::int as opportunities, sum(n_correct)::int as correct,
           round(avg((timing ->> 'median_ms')::numeric) filter (where (timing ->> 'calibrated')::boolean))::int as tm,
           round(avg((timing ->> 'spread_ms')::numeric) filter (where (timing ->> 'calibrated')::boolean))::int as ts,
           count(*)::int as rounds
      from old group by 1, 2, 3
  ), folded as (
    insert into play_skill_weeks as w (student_id, week, skill, opportunities, correct, timing_median_ms, timing_spread_ms, rounds)
    select student_id, week, skill, opportunities, correct, tm, ts, rounds from weekly
    on conflict (student_id, week, skill) do update
       set opportunities = w.opportunities + excluded.opportunities,
           correct = case when w.correct is null and excluded.correct is null then null
                          else coalesce(w.correct, 0) + coalesce(excluded.correct, 0) end,
           timing_median_ms = coalesce(excluded.timing_median_ms, w.timing_median_ms),
           timing_spread_ms = coalesce(excluded.timing_spread_ms, w.timing_spread_ms),
           rounds = w.rounds + excluded.rounds
    returning 1
  )
  select coalesce((select sum(rounds) from weekly), 0)::int into v_n from (select count(*) from folded) f;
  return v_n;
end $$;
select cron.schedule('mridanga-playground', '30 21 * * *', 'select playground_daily()');

-- 0017's keep times, plus: a recording sent from a game (its assessment has playground_game) that nobody reviewed
-- is removed 60 days after it was sent (§13.2, §9.4). The clean-up (assessment_daily → the Edge Function →
-- claim_expired_submission_files) does the rest, as for every recording.
create or replace function submission_file_expired(p_id bigint, p_reviewed_at timestamptz, p_level_up boolean)
returns boolean
language sql stable set search_path = public as $$
  select case
    when p_reviewed_at is null then exists (
      select 1 from assessment_submissions s
        join assessment_assignments g on g.id = s.assignment_id
        join assessments a on a.id = g.assessment_id
       where s.id = p_id and a.playground_game is not null and s.submitted_at < now() - interval '60 days')
    when not p_level_up then p_reviewed_at < now() - interval '30 days'
    when exists (select 1 from promotion_nominations n where n.submission_id = p_id and n.status = 'open') then false
    when exists (select 1 from promotion_nominations n where n.submission_id = p_id) then
      (select max(n.decided_at) from promotion_nominations n where n.submission_id = p_id) < now() - interval '30 days'
    else p_reviewed_at < now() - interval '180 days'
  end
$$;

-- ---------------------------------------------------------------- 10. who may run functions
-- docs/DECISIONS.md #14.
revoke execute on function play_placeholders_ok(), play_skill_ok(text), play_beat_ok(text), play_bols_of(text[]),
  guard_play_status(), guard_play_bol(), guard_play_asset(), guard_play_template(), guard_play_exercise(),
  guard_play_rating(), guard_play_assignment(), guard_play_settings(),
  play_audio_readable(text), play_audio_uploadable(text), play_audio_deletable(text),
  play_same_bol(text, text), play_same_answer(text, text, text), play_expected(text, play_exercises, jsonb),
  playground_pack(int), play_state_of(uuid), my_playground_state(), play_set_surprise(boolean), record_round(jsonb),
  play_set_status(text, text, text), publish_playground(text), staff_playground_progress(uuid),
  staff_playground_class(smallint, bigint), playground_daily()
  from public, anon, authenticated;
-- The Storage rules run these as the reader; the app calls the rest (roles checked inside).
grant execute on function play_audio_readable(text), play_audio_uploadable(text), play_audio_deletable(text),
  playground_pack(int), my_playground_state(), play_set_surprise(boolean), record_round(jsonb),
  play_set_status(text, text, text), publish_playground(text), staff_playground_progress(uuid),
  staff_playground_class(smallint, bigint)
  to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on table play_bols is 'Rhythm Playground: the approved bol dictionary; id = the plain form (lib/bols.ts plainBol). Staff write drafts; the Guru approves and publishes (0065, #720).';
comment on table play_assets is 'Rhythm Playground: approved sound files (bucket playground-audio) with licence, performer and approval (0065, #720).';
comment on table play_templates is 'Rhythm Playground: the rule of a challenge type per game, skill and level, with difficulty steps (0065, #720).';
comment on table play_exercises is 'Rhythm Playground: the exercise bank, in the taal notation with dictionary ids; only approved and published rows reach students (0065, #720).';
comment on table play_publications is 'Rhythm Playground: one version number per publish; phones refresh their pack when it changes (0065, #720).';
comment on table play_assignments is 'Rhythm Playground: a facilitator assigns a game or skill to a level, a group or one student (0065, #720).';
comment on table play_student_settings is 'Rhythm Playground: per-student settings (Surprise me, relaxed timing, one level up, step limits) (0065, #720).';
comment on table play_rounds is 'Rhythm Playground: one row per round, written only by record_round; kept 180 days, then folded into play_skill_weeks (0065, #721, #729).';
comment on table play_skill_weeks is 'Rhythm Playground: weekly per-skill summaries of folded rounds, kept while the record exists (0065, #729).';
comment on table play_ratings is 'Rhythm Playground: a facilitator''s 0-3 rating of a performance skill (0065, #727).';
comment on column assessments.playground_game is 'Rhythm Playground: the game a recording assessment belongs to; unreviewed takes are removed 60 days after sending (0065, #729).';
comment on function play_placeholders_ok() is 'Internal: the TEST-only setting playground_allow_placeholders (0065, #720).';
comment on function guard_play_status() is 'Trigger: status, revision and publication of Playground content; approval is the Guru''s (0065, #720).';
comment on function guard_play_bol() is 'Trigger: checks a dictionary bol (0065).';
comment on function guard_play_asset() is 'Trigger: checks a sound file; approving needs the file and the licence details (0065).';
comment on function guard_play_template() is 'Trigger: checks a challenge template (0065).';
comment on function guard_play_exercise() is 'Trigger: checks an exercise''s notation; approving needs approved bols and sounds (0065).';
comment on function guard_play_rating() is 'Trigger: checks a facilitator rating (0065).';
comment on function guard_play_assignment() is 'Trigger: checks an assignment (0065).';
comment on function guard_play_settings() is 'Trigger: checks per-student Playground settings (0065).';
comment on function play_audio_readable(text) is 'Storage rule: staff any Playground sound; a student one of an approved, published asset (0065).';
comment on function play_audio_uploadable(text) is 'Storage rule: staff upload a Playground sound as <kind>/<uuid>.<ext> (0065).';
comment on function play_audio_deletable(text) is 'Storage rule: staff delete a Playground sound no approved asset lists (0065).';
comment on function play_same_answer(text, text, text) is 'Internal: is an answer right (bols by sound) — the rule of src/lib/playground/check.ts (0065, #723).';
comment on function play_expected(text, play_exercises, jsonb) is 'Internal: the right answer of an exercise for a saved question (0065, #723).';
comment on function playground_pack(int) is 'The published Playground pack, or null when the caller has this version (0065, #728).';
comment on function my_playground_state() is 'The signed-in student''s Playground state: level, ticks, groups, settings, assignments, rounds of 30 days (0065).';
comment on function play_set_surprise(boolean) is 'The student switches Surprise me on or off (0065).';
comment on function record_round(jsonb) is 'Saves one Playground round: re-marks every recognition answer, refuses unpublished content, idempotent by id (0065, #721).';
comment on function play_set_status(text, text, text) is 'Staff move content between draft and review; the Guru approves and retires (0065, #720).';
comment on function publish_playground(text) is 'The Guru publishes every approved row as a new version; placeholders only on TEST (0065, #720).';
comment on function staff_playground_progress(uuid) is 'Staff: one student''s Playground state, weekly summaries and ratings (0065).';
comment on function staff_playground_class(smallint, bigint) is 'Staff: a level''s or group''s students with their rounds of 30 days (0065).';
comment on function playground_daily() is 'Daily (pg_cron mridanga-playground, 03:00 IST): rounds older than 180 days folded into play_skill_weeks and deleted (0065, #729).';
