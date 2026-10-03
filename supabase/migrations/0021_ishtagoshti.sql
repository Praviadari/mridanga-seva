-- Mridanga Seva — 0021: Ishtagoshti part 1, sloka study (Phase 2, slice 6: screens I1, I2, I3, I11, I12).
-- Run once, after 0020_media.sql, in the Supabase SQL editor.
-- Why: docs/DECISIONS.md #57. How: docs/DATABASE.md "Ishtagoshti (Phase 2)".
--
-- 1. Who reads, who edits. Everyone signed in with a role (Guru, coordinators, students) reads the
--    published slokas and themes: ig_reader(). The Guru edits, and so do the coordinators the Guru
--    marks as Ishtagoshti editors (profiles.ig_editor): is_ig_editor(). Slice 7 (free public
--    sign-up, needs consent wording) adds its subscribers to ig_reader() and nothing else changes:
--    notes and "memorised" ticks hang on the login (profiles), not on a student record.
-- 2. ig_slokas: the verse in Devanagari and transliteration (IAST), word meanings, and the temple
--    senior devotee's OWN translation and purport in English, Telugu and/or Hindi. No BBT text: a
--    sloka is published only when the editor confirms the text is the temple's own (own_text).
--    translator = the credit shown on the sloka ("Translation and purport: ..."); left empty it
--    takes the Guru's default from settings.ig_translator. Optional recitation audio in the private
--    bucket ishtagoshti-audio. sample = seeded stand-in, the team replaces it.
-- 3. ig_themes + ig_theme_slokas: a theme (series) with the Guru's introduction, questions to think
--    about, and its slokas in order.
-- 4. Sloka of the day: ig_sloka_of_day() picks a pinned sloka (ig_daily_pins) or else rotates
--    through the published slokas, the same for everyone on a day in India.
-- 5. ig_notes (private notes on a sloka, only the writer sees them) and ig_memorised (the person's
--    own "I have memorised it" tick; staff may read them for the later Ishtagoshti report).
-- 6. Three SAMPLE slokas and two SAMPLE themes, marked sample: Sanskrit and transliteration are
--    public domain; their sample meanings and translations are plain placeholders written for the
--    app (not BBT text). The team types the real ones in the app.

-- ---------------------------------------------------------------- 1. who reads, who edits
alter table profiles add column ig_editor boolean not null default false;

-- Signed in with a role that may read Ishtagoshti. Slice 7 adds its subscriber role here.
create or replace function ig_reader() returns boolean
language sql stable set search_path = public as $$
  select coalesce(my_role() in ('guru', 'coordinator', 'student'), false)
$$;

-- The Guru, or an active coordinator the Guru marked as an Ishtagoshti editor.
create or replace function is_ig_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.role = 'guru' or (p.role = 'coordinator' and p.ig_editor)
                     from profiles p where p.id = auth.uid() and p.active), false)
$$;

-- Only the Guru marks an editor, and only a coordinator can be one (error codes not_allowed,
-- ig_editor_coordinator_only). For app users only, like the other profile guards.
create or replace function guard_profile_ig_editor() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') or new.ig_editor is not distinct from old.ig_editor then
    return new;
  end if;
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if new.ig_editor and new.role <> 'coordinator' then
    raise exception 'ig_editor_coordinator_only' using detail = 'Only a coordinator is marked as an Ishtagoshti editor (the Guru always edits).';
  end if;
  return new;
end $$;
create trigger profiles_ig_editor_guard before update of ig_editor on profiles
  for each row execute function guard_profile_ig_editor();

-- The default translator credit (G10 Settings): text, at most 100 characters, '' = none.
-- guard_setting is 0014's with one more key; a later migration that replaces it must keep it.
create or replace function guard_setting() returns trigger
language plpgsql set search_path = public as $$
declare
  v_int int;
  v_range int4range;
begin
  if tg_op = 'DELETE' then
    if current_user in ('anon', 'authenticated') then raise exception 'setting_required'; end if;
    return old;
  end if;
  v_range := case new.key
    when 'irregular_days'        then int4range(3, 90, '[]')
    when 'inactive_days'         then int4range(7, 365, '[]')
    when 'call_due_days'         then int4range(1, 14, '[]')
    when 'retry_days'            then int4range(1, 14, '[]')
    when 'max_retries'           then int4range(1, 10, '[]')
    when 'new_joiner_weeks'      then int4range(1, 12, '[]')
    when 'promotion_syllabus_percent' then int4range(0, 100, '[]')
    when 'promotion_min_visits'  then int4range(0, 100, '[]')
    when 'promotion_visit_weeks' then int4range(1, 52, '[]')
    when 'promotion_min_feedback' then int4range(1, 10, '[]')
  end;
  if v_range is not null then
    begin
      v_int := (new.value #>> '{}')::int;
    exception when others then
      v_int := null;
    end;
    if jsonb_typeof(new.value) <> 'number' or v_int is null or not v_range @> v_int then
      raise exception 'setting_invalid' using detail = format('%s is a whole number in %s.', new.key, v_range);
    end if;
    new.value := to_jsonb(v_int);
  elsif new.key = 'week_starts' then
    if new.value #>> '{}' not in ('monday', 'rolling7') or jsonb_typeof(new.value) <> 'string' then
      raise exception 'setting_invalid' using detail = 'week_starts is "monday" or "rolling7".';
    end if;
  elsif new.key = 'promotion_needs_level_up' then
    if jsonb_typeof(new.value) <> 'boolean' then
      raise exception 'setting_invalid' using detail = format('%s is true or false.', new.key);
    end if;
  elsif new.key = 'call_reasons' then
    if jsonb_typeof(new.value) <> 'array' then
      raise exception 'setting_invalid' using detail = 'call_reasons is a list of codes.';
    end if;
  elsif new.key = 'ig_translator' then
    if jsonb_typeof(new.value) <> 'string' or char_length(btrim(new.value #>> '{}')) > 100 then
      raise exception 'setting_invalid' using detail = 'ig_translator is a name of at most 100 characters.';
    end if;
    new.value := to_jsonb(btrim(new.value #>> '{}'));
  elsif current_user in ('anon', 'authenticated') then
    raise exception 'setting_unknown' using detail = format('%s is not a setting the app knows.', new.key);
  end if;
  return new;
end $$;

insert into settings (key, value) values ('ig_translator', '""') on conflict (key) do nothing;

-- ---------------------------------------------------------------- 2. slokas
create table ig_slokas (
  id               bigint generated always as identity primary key,
  ref              text not null,               -- scripture reference, e.g. 'BG 10.9'
  devanagari       text not null,
  transliteration  text not null,               -- IAST
  word_meanings    text,                        -- one line per word: 'word — meaning'
  translation_en   text,
  translation_te   text,
  translation_hi   text,
  purport_en       text,
  purport_te       text,
  purport_hi       text,
  translator       text,                        -- credit shown with the translation and purport
  own_text         boolean not null default false, -- the editor confirms: the temple's own text, no BBT text
  audio_path       text,                        -- recitation in bucket ishtagoshti-audio
  audio_name       text,
  audio_size       bigint,
  sample           boolean not null default false, -- seeded stand-in, the team replaces it
  published        boolean not null default false, -- readers see published ones only
  sort             int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references profiles (id) on delete set null
);
create index ig_slokas_sort_idx on ig_slokas (sort, id);
create index ig_slokas_audio_idx on ig_slokas (audio_path) where audio_path is not null;

-- '<login id>/<random id>.<ending>' in the bucket ishtagoshti-audio.
create or replace function ig_audio_path_ok(p_path text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(mp3|m4a|aac|wav|ogg|webm)$', false)
$$;

-- Error codes (src/data/ishtagoshti.ts):
--   ref_invalid               the reference has 1-60 characters
--   devanagari_required, transliteration_required   the verse itself, at most 3000 characters each
--   text_too_long             word meanings 6000, a translation 4000, a purport 20000 characters
--   translation_required      a translation in at least one language
--   translator_too_long       the credit has at most 100 characters
--   own_text_needed           publishing needs the "temple's own text" confirmation
--   audio_invalid, audio_missing   the recitation: a proper path, in Storage
create or replace function guard_ig_sloka() returns trigger
language plpgsql set search_path = public as $$
declare
  v_size bigint;
begin
  new.ref := btrim(regexp_replace(coalesce(new.ref, ''), '\s+', ' ', 'g'));
  if char_length(new.ref) not between 1 and 60 then
    raise exception 'ref_invalid' using detail = 'A reference (e.g. BG 10.9) has 1-60 characters.';
  end if;
  new.devanagari := btrim(coalesce(new.devanagari, ''), E' \t\r\n');
  new.transliteration := btrim(coalesce(new.transliteration, ''), E' \t\r\n');
  if new.devanagari = '' or char_length(new.devanagari) > 3000 then
    raise exception 'devanagari_required' using detail = 'The verse in Devanagari, at most 3000 characters.';
  end if;
  if new.transliteration = '' or char_length(new.transliteration) > 3000 then
    raise exception 'transliteration_required' using detail = 'The transliteration, at most 3000 characters.';
  end if;
  new.word_meanings  := nullif(btrim(new.word_meanings,  E' \t\r\n'), '');
  new.translation_en := nullif(btrim(new.translation_en, E' \t\r\n'), '');
  new.translation_te := nullif(btrim(new.translation_te, E' \t\r\n'), '');
  new.translation_hi := nullif(btrim(new.translation_hi, E' \t\r\n'), '');
  new.purport_en     := nullif(btrim(new.purport_en,     E' \t\r\n'), '');
  new.purport_te     := nullif(btrim(new.purport_te,     E' \t\r\n'), '');
  new.purport_hi     := nullif(btrim(new.purport_hi,     E' \t\r\n'), '');
  if char_length(coalesce(new.word_meanings, '')) > 6000
     or greatest(char_length(coalesce(new.translation_en, '')), char_length(coalesce(new.translation_te, '')),
                 char_length(coalesce(new.translation_hi, ''))) > 4000
     or greatest(char_length(coalesce(new.purport_en, '')), char_length(coalesce(new.purport_te, '')),
                 char_length(coalesce(new.purport_hi, ''))) > 20000 then
    raise exception 'text_too_long' using detail = 'Word meanings 6000, a translation 4000, a purport 20000 characters at most.';
  end if;
  if coalesce(new.translation_en, new.translation_te, new.translation_hi) is null then
    raise exception 'translation_required' using detail = 'A translation in at least one language.';
  end if;
  new.translator := nullif(btrim(coalesce(new.translator, '')), '');
  if new.translator is null then
    new.translator := nullif((select value #>> '{}' from settings where key = 'ig_translator'), '');
  end if;
  if char_length(coalesce(new.translator, '')) > 100 then
    raise exception 'translator_too_long' using detail = 'The translator''s name has at most 100 characters.';
  end if;
  if new.published and not new.own_text then
    raise exception 'own_text_needed' using detail = 'Publish only the temple''s own translation and purport (no BBT text).';
  end if;

  if new.audio_path is null then
    new.audio_name := null; new.audio_size := null;
  elsif tg_op = 'INSERT' or new.audio_path is distinct from old.audio_path then
    new.audio_name := btrim(coalesce(new.audio_name, ''), E' \t\r\n');
    if not ig_audio_path_ok(new.audio_path) or new.audio_name = '' or char_length(new.audio_name) > 120 then
      raise exception 'audio_invalid' using detail = 'A recitation needs a proper path and a name of 1 to 120 characters.';
    end if;
    if auth.uid() is not null then
      select (o.metadata ->> 'size')::bigint into v_size
        from storage.objects o where o.bucket_id = 'ishtagoshti-audio' and o.name = new.audio_path;
      if not found then
        raise exception 'audio_missing' using detail = 'The recording is not in Storage; upload it first.';
      end if;
      new.audio_size := v_size;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
create trigger ig_slokas_guard before insert or update on ig_slokas
  for each row execute function guard_ig_sloka();
create trigger audit_ig_slokas after insert or update or delete on ig_slokas
  for each row execute function audit_row();

alter table ig_slokas enable row level security;
create policy readable on ig_slokas for select to authenticated using (
  (published and ig_reader()) or is_ig_editor());
create policy editor_insert on ig_slokas for insert to authenticated with check (is_ig_editor());
create policy editor_update on ig_slokas for update to authenticated using (is_ig_editor()) with check (is_ig_editor());
create policy editor_delete on ig_slokas for delete to authenticated using (is_ig_editor());
revoke all on ig_slokas from public, anon;
revoke truncate, references, trigger on ig_slokas from authenticated;

-- ---------------------------------------------------------------- 3. themes
create table ig_themes (
  id          bigint generated always as identity primary key,
  title       text not null,
  intro       text,                 -- the Guru's introduction
  questions   text,                 -- questions to think about, one a line
  sample      boolean not null default false,
  published   boolean not null default false,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references profiles (id) on delete set null
);
create index ig_themes_sort_idx on ig_themes (sort, id);

-- Error codes: theme_title_invalid (1-80 characters), text_too_long (intro and questions 4000 each).
create or replace function guard_ig_theme() returns trigger
language plpgsql set search_path = public as $$
begin
  new.title := btrim(regexp_replace(coalesce(new.title, ''), '\s+', ' ', 'g'));
  if char_length(new.title) not between 1 and 80 then
    raise exception 'theme_title_invalid' using detail = 'A theme''s title has 1-80 characters.';
  end if;
  new.intro := nullif(btrim(new.intro, E' \t\r\n'), '');
  new.questions := nullif(btrim(new.questions, E' \t\r\n'), '');
  if greatest(char_length(coalesce(new.intro, '')), char_length(coalesce(new.questions, ''))) > 4000 then
    raise exception 'text_too_long' using detail = 'The introduction and the questions have at most 4000 characters each.';
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
create trigger ig_themes_guard before insert or update on ig_themes
  for each row execute function guard_ig_theme();
create trigger audit_ig_themes after insert or update or delete on ig_themes
  for each row execute function audit_row();

alter table ig_themes enable row level security;
create policy readable on ig_themes for select to authenticated using (
  (published and ig_reader()) or is_ig_editor());
create policy editor_insert on ig_themes for insert to authenticated with check (is_ig_editor());
create policy editor_update on ig_themes for update to authenticated using (is_ig_editor()) with check (is_ig_editor());
create policy editor_delete on ig_themes for delete to authenticated using (is_ig_editor());
revoke all on ig_themes from public, anon;
revoke truncate, references, trigger on ig_themes from authenticated;

-- The slokas of a theme, in order. Written only through set_theme_slokas().
create table ig_theme_slokas (
  theme_id  bigint not null references ig_themes (id) on delete cascade,
  sloka_id  bigint not null references ig_slokas (id) on delete cascade,
  position  smallint not null,
  primary key (theme_id, sloka_id)
);
create index ig_theme_slokas_sloka_idx on ig_theme_slokas (sloka_id);

alter table ig_theme_slokas enable row level security;
-- A link is seen when both its theme and its sloka can be seen (their own rules apply inside).
create policy readable on ig_theme_slokas for select to authenticated using (
  exists (select 1 from ig_themes t where t.id = theme_id)
  and exists (select 1 from ig_slokas s where s.id = sloka_id));
revoke all on ig_theme_slokas from public, anon, authenticated;
grant select on ig_theme_slokas to authenticated;

-- I11: puts the given slokas into a theme, in that order (an empty list empties it). Editors only.
-- Errors: not_allowed, theme_not_found, sloka_not_found, too_many (at most 100).
create or replace function set_theme_slokas(p_theme bigint, p_slokas bigint[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_list bigint[] := coalesce(p_slokas, '{}');
begin
  if not is_ig_editor() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if not exists (select 1 from ig_themes where id = p_theme) then raise exception 'theme_not_found'; end if;
  if cardinality(v_list) > 100 then raise exception 'too_many' using detail = 'At most 100 slokas in a theme.'; end if;
  if exists (select 1 from unnest(v_list) x where x is null or not exists (select 1 from ig_slokas s where s.id = x)) then
    raise exception 'sloka_not_found';
  end if;
  delete from ig_theme_slokas where theme_id = p_theme;
  insert into ig_theme_slokas (theme_id, sloka_id, position)
  select p_theme, x, min(n) from unnest(v_list) with ordinality u(x, n) group by x;
end $$;

-- ---------------------------------------------------------------- 4. sloka of the day
create table ig_daily_pins (
  day        date primary key,
  sloka_id   bigint not null references ig_slokas (id) on delete cascade,
  pinned_by  uuid references profiles (id) on delete set null default auth.uid(),
  pinned_at  timestamptz not null default now()
);
create index ig_daily_pins_sloka_idx on ig_daily_pins (sloka_id);

-- Error codes: pin_day_invalid (today up to a year ahead), pin_not_published.
create or replace function guard_ig_pin() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.day < today_ist() or new.day > today_ist() + 366 then
      raise exception 'pin_day_invalid' using detail = 'A day from today up to a year ahead.';
    end if;
    new.pinned_by := auth.uid();
    new.pinned_at := now();
  end if;
  if not exists (select 1 from ig_slokas where id = new.sloka_id and published) then
    raise exception 'pin_not_published' using detail = 'Only a published sloka can be the sloka of the day.';
  end if;
  return new;
end $$;
create trigger ig_daily_pins_guard before insert or update on ig_daily_pins
  for each row execute function guard_ig_pin();

alter table ig_daily_pins enable row level security;
create policy readable on ig_daily_pins for select to authenticated using (ig_reader());
create policy editor_insert on ig_daily_pins for insert to authenticated with check (is_ig_editor());
create policy editor_update on ig_daily_pins for update to authenticated using (is_ig_editor()) with check (is_ig_editor());
create policy editor_delete on ig_daily_pins for delete to authenticated using (is_ig_editor());
revoke all on ig_daily_pins from public, anon;
revoke truncate, references, trigger on ig_daily_pins from authenticated;

-- I1: the sloka of a day in India (default today): the one pinned to that day, or else one of the
-- published slokas in turn (by sort, then id), the same for everyone. Null when none is published.
-- Runs as the person asking: a reader sees published slokas only; editors are filtered the same way.
create or replace function ig_sloka_of_day(p_day date default null) returns bigint
language sql stable set search_path = public as $$
  with d as (select coalesce(p_day, today_ist()) as day),
  pub as (
    select id, (row_number() over (order by sort, id) - 1)::int as n, count(*) over ()::int as c
      from ig_slokas where published
  )
  select coalesce(
    (select p.sloka_id from ig_daily_pins p join ig_slokas s on s.id = p.sloka_id and s.published, d where p.day = d.day),
    (select pub.id from pub, d where pub.n = (((d.day - date '2026-01-01') % pub.c) + pub.c) % pub.c))
$$;

-- ---------------------------------------------------------------- 5. own notes and memorised ticks
create table ig_notes (
  profile_id  uuid not null default auth.uid() references profiles (id) on delete cascade,
  sloka_id    bigint not null references ig_slokas (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  updated_at  timestamptz not null default now(),
  primary key (profile_id, sloka_id)
);
alter table ig_notes enable row level security;
-- Private: only the writer, on a sloka they can see.
create policy own_select on ig_notes for select to authenticated using (profile_id = auth.uid());
create policy own_insert on ig_notes for insert to authenticated with check (
  profile_id = auth.uid() and ig_reader() and exists (select 1 from ig_slokas s where s.id = sloka_id));
create policy own_update on ig_notes for update to authenticated using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and exists (select 1 from ig_slokas s where s.id = sloka_id));
create policy own_delete on ig_notes for delete to authenticated using (profile_id = auth.uid());
revoke all on ig_notes from public, anon;
revoke truncate, references, trigger on ig_notes from authenticated;

create table ig_memorised (
  profile_id    uuid not null default auth.uid() references profiles (id) on delete cascade,
  sloka_id      bigint not null references ig_slokas (id) on delete cascade,
  memorised_on  date not null default today_ist(),
  primary key (profile_id, sloka_id)
);
create index ig_memorised_sloka_idx on ig_memorised (sloka_id);
alter table ig_memorised enable row level security;
-- The person's own; staff read all (the later Ishtagoshti report, I13). A tick is set or taken away.
create policy own_or_staff on ig_memorised for select to authenticated using (profile_id = auth.uid() or is_staff());
create policy own_insert on ig_memorised for insert to authenticated with check (
  profile_id = auth.uid() and ig_reader() and memorised_on = today_ist()
  and exists (select 1 from ig_slokas s where s.id = sloka_id));
create policy own_delete on ig_memorised for delete to authenticated using (profile_id = auth.uid());
revoke all on ig_memorised from public, anon;
revoke update, truncate, references, trigger on ig_memorised from authenticated;

-- ---------------------------------------------------------------- recitation audio (Storage)
-- 10 MB: several minutes of speech. Private; links are signed by the app.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ishtagoshti-audio', 'ishtagoshti-audio', false, 10485760,
        array['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/ogg', 'audio/webm'])
on conflict (id) do update
   set public = false,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- Read: a recording on a sloka the caller can see (published, or any for editors), or any file for
-- an editor (an upload not yet saved on a sloka). Security invoker: ig_slokas' rules apply inside.
create or replace function ig_audio_readable(p_name text) returns boolean
language sql stable set search_path = public as $$
  select is_ig_editor() or exists (select 1 from ig_slokas s where s.audio_path = p_name)
$$;
-- Upload: editors, into their own folder.
create or replace function ig_audio_uploadable(p_name text) returns boolean
language sql stable set search_path = public as $$
  select is_ig_editor() and split_part(p_name, '/', 1) = auth.uid()::text and ig_audio_path_ok(p_name)
$$;

create policy "ishtagoshti audio: read" on storage.objects for select to authenticated
  using (bucket_id = 'ishtagoshti-audio' and public.ig_audio_readable(name));
create policy "ishtagoshti audio: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'ishtagoshti-audio' and public.ig_audio_uploadable(name));
create policy "ishtagoshti audio: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'ishtagoshti-audio' and public.is_ig_editor());

-- ---------------------------------------------------------------- 6. samples
-- SAMPLES, marked sample = true: the verses (Sanskrit, IAST) are public domain; the meanings and
-- translations below are short placeholders written for the app, NOT the temple's and NOT BBT's.
insert into ig_slokas (ref, devanagari, transliteration, word_meanings, translation_en, translator,
                       own_text, sample, published, sort)
select v.ref, v.dev, v.iast, v.words, v.tr, 'Sample text (placeholder, not the temple''s translation)', true, true, true, v.sort
  from (values
    ('BG 10.9',
     E'मच्चित्ता मद्गतप्राणा बोधयन्तः परस्परम् ।\nकथयन्तश्च मां नित्यं तुष्यन्ति च रमन्ति च ॥ ९ ॥',
     E'mac-cittā mad-gata-prāṇā\nbodhayantaḥ parasparam\nkathayantaś ca māṁ nityaṁ\ntuṣyanti ca ramanti ca',
     E'mat-cittāḥ — minds on Me\nmat-gata-prāṇāḥ — lives given to Me\nbodhayantaḥ — enlightening\nparasparam — one another\nkathayantaḥ — speaking\nca — and\nmām — about Me\nnityam — always\ntuṣyanti — are content\nramanti — take delight',
     'SAMPLE. With minds and lives given to the Lord, devotees enlighten one another, speak of Him always, and find contentment and joy in it.',
     1),
    ('Upadeśāmṛta 4',
     E'ददाति प्रतिगृह्णाति गुह्यमाख्याति पृच्छति ।\nभुङ्क्ते भोजयते चैव षड्विधं प्रीतिलक्षणम् ॥ ४ ॥',
     E'dadāti pratigṛhṇāti\nguhyam ākhyāti pṛcchati\nbhuṅkte bhojayate caiva\nṣaḍ-vidhaṁ prīti-lakṣaṇam',
     E'dadāti — gives\npratigṛhṇāti — accepts\nguhyam — what is in the heart\nākhyāti — tells\npṛcchati — asks\nbhuṅkte — eats\nbhojayate — feeds\nca eva — and also\nṣaṭ-vidham — six kinds\nprīti-lakṣaṇam — signs of affection',
     'SAMPLE. Giving and accepting, opening the heart and asking, eating and feeding: these are the six signs of loving exchange between devotees.',
     2),
    ('Śikṣāṣṭaka 3',
     E'तृणादपि सुनीचेन तरोरपि सहिष्णुना ।\nअमानिना मानदेन कीर्तनीयः सदा हरिः ॥ ३ ॥',
     E'tṛṇād api sunīcena\ntaror api sahiṣṇunā\namāninā mānadena\nkīrtanīyaḥ sadā hariḥ',
     E'tṛṇāt api — than a blade of grass\nsunīcena — humbler\ntaroḥ api — than a tree\nsahiṣṇunā — more tolerant\namāninā — without wanting honour\nmāna-dena — giving honour to others\nkīrtanīyaḥ — to be sung\nsadā — always\nhariḥ — the holy name of the Lord',
     'SAMPLE. Humbler than grass, more tolerant than a tree, wanting no honour and honouring everyone, one should always sing the holy name.',
     3)
  ) as v(ref, dev, iast, words, tr, sort)
 where not exists (select 1 from ig_slokas s where s.ref = v.ref);

insert into ig_themes (title, intro, questions, sample, published, sort)
select v.title, v.intro, v.questions, true, true, v.sort
  from (values
    ('Ishtagoshti itself (sample)',
     'SAMPLE theme. Why devotees meet to hear and speak about the Lord, and what makes such a meeting loving.',
     E'What do we give and receive when we meet?\nWhat helps you speak openly in a group?', 1),
    ('The mood of the kirtaniya (sample)',
     'SAMPLE theme. The humility with which a mridanga player serves the kirtan.',
     E'How does humility show in the way we play?\nWhat does tolerance mean in a kirtan group?', 2)
  ) as v(title, intro, questions, sort)
 where not exists (select 1 from ig_themes t where t.title = v.title);

insert into ig_theme_slokas (theme_id, sloka_id, position)
select t.id, s.id, v.pos
  from (values ('Ishtagoshti itself (sample)', 'BG 10.9', 1), ('Ishtagoshti itself (sample)', 'Upadeśāmṛta 4', 2),
               ('The mood of the kirtaniya (sample)', 'Śikṣāṣṭaka 3', 1)) as v(theme, ref, pos)
  join ig_themes t on t.title = v.theme
  join ig_slokas s on s.ref = v.ref
on conflict do nothing;

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14: trigger functions are internal; the rest answer about the caller only.
revoke execute on function guard_profile_ig_editor(), guard_ig_sloka(), guard_ig_theme(), guard_ig_pin()
  from public, anon, authenticated;
revoke execute on function ig_reader(), is_ig_editor(), ig_audio_path_ok(text), set_theme_slokas(bigint, bigint[]),
  ig_sloka_of_day(date), ig_audio_readable(text), ig_audio_uploadable(text)
  from public, anon, authenticated;
grant execute on function ig_reader(), is_ig_editor(), ig_audio_path_ok(text), set_theme_slokas(bigint, bigint[]),
  ig_sloka_of_day(date), ig_audio_readable(text), ig_audio_uploadable(text)
  to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on column profiles.ig_editor is 'Ishtagoshti: a coordinator the Guru lets add and edit slokas and themes (the Guru always may). docs/DECISIONS.md #57.';
comment on table ig_slokas is 'I3/I12: a sloka with Devanagari, IAST, word meanings, and the temple''s OWN translation and purport (en/te/hi; no BBT text, own_text confirmed before publishing), translator credit, optional recitation audio. sample = seeded stand-in (docs/DECISIONS.md #57).';
comment on table ig_themes is 'I2/I11: a theme (series) of slokas with an introduction and questions to think about.';
comment on table ig_theme_slokas is 'The slokas of a theme in order; written by set_theme_slokas.';
comment on table ig_daily_pins is 'I1: a sloka pinned as the sloka of the day on a date (India); other days rotate (ig_sloka_of_day).';
comment on table ig_notes is 'I3: a person''s private notes on a sloka; only the writer reads them.';
comment on table ig_memorised is 'I1/I3: "I have memorised it" ticks of a login; staff read them for the later report (I13).';
comment on function ig_reader is 'True for a signed-in role that reads Ishtagoshti (Guru, coordinator, student; slice 7 adds subscribers).';
comment on function is_ig_editor is 'True for the Guru and active coordinators marked ig_editor.';
comment on function guard_ig_sloka is 'Checks a sloka: reference, verse, lengths, a translation, translator credit (default settings.ig_translator), own_text before publishing, the recitation file.';
comment on function set_theme_slokas is 'I11, editors: the slokas of a theme in the given order.';
comment on function ig_sloka_of_day is 'I1: the pinned sloka of the day (India), else the published slokas in turn; null when none is published.';
