-- Mridanga Seva — 0016: practice tools (Phase 2, slice 3: screens S5, S6 and V1).
-- Run once, after 0014_promotion.sql, in the Supabase SQL editor. TEST project first; Phase 2 goes
-- live only when Praveen decides. The number is this branch's (main has 0013-0015); the Phase 2
-- files are renumbered in order (assessments, promotion, practice) when Phase 2 reaches main.
-- Why: docs/DECISIONS.md #49. How: docs/DATABASE.md "Practice tools (Phase 2)".
--
-- 1. taals: the rhythm cycles the taal player (S5) loops and the two-head view (V1) draws. The Guru
--    edits them in the app (taal editor); everyone signed in reads the ones switched on. Three
--    PLACEHOLDER taals are seeded, marked placeholder: the real ones are the Guru's (team input).
-- 2. practice_logs: a student's practice minutes, from the S5 timer (logs itself on Stop, at least
--    one minute) or typed in (S6). Only through log_practice() / delete_practice(), so the limits
--    hold. practice_weeks() gives the weekly totals for S4 My progress and C8 Student profile.
-- Promotion criteria (0014) do not use practice yet.

-- ---------------------------------------------------------------- 1. taals
-- One row per taal. A cycle has `beats` mātrās (beats = number of bols), split into vibhags
-- (`divisions`, beats per vibhag, summing to beats) with one mark per vibhag as the kksongs khol
-- course writes them: 'X' sam, '2' '3' ... tali (an open baya stroke), '0' khali.
-- A bol is what is played on one beat: '-' = nothing (a rest), or 1-4 strokes in the beat joined with
-- '.', e.g. 'te.re' (two half-beats). The app knows the khol bols of docs (NOTES "Bols"); other
-- syllables are shown and sounded as a plain stroke.
create table taals (
  id           bigint generated always as identity primary key,
  name         text not null,
  bols         text[] not null,
  beats        smallint generated always as (cardinality(bols)) stored,
  divisions    smallint[] not null,
  marks        text[] not null,
  level_id     smallint references levels (id),        -- null = for every level
  placeholder  boolean not null default false,          -- seeded stand-in, the Guru replaces it
  note         text,
  sort         int not null default 0,
  active       boolean not null default true,           -- switched off = only staff see it
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references profiles (id) on delete set null
);
create index taals_sort_idx on taals (sort, id);

-- Checks every write, also from the dashboard: name 1-60 characters, 2-32 beats, vibhags that add up,
-- one mark per vibhag, bols in the shape above, a note of at most 300 characters.
create or replace function guard_taal() returns trigger
language plpgsql set search_path = public as $$
declare
  v_beats int := coalesce(cardinality(new.bols), 0);
begin
  new.name := btrim(coalesce(new.name, ''));
  new.note := nullif(btrim(coalesce(new.note, '')), '');
  if char_length(new.name) not between 1 and 60 then
    raise exception 'taal_name_invalid' using detail = 'A taal name has 1-60 characters.';
  end if;
  if v_beats not between 2 and 32 then
    raise exception 'taal_beats_invalid' using detail = 'A taal has 2-32 beats.';
  end if;
  if coalesce(cardinality(new.divisions), 0) not between 1 and 16
     or exists (select 1 from unnest(new.divisions) d where d is null or d < 1)
     or (select sum(d) from unnest(new.divisions) d) <> v_beats then
    raise exception 'taal_divisions_invalid' using detail = 'The vibhags must add up to the number of beats.';
  end if;
  if coalesce(cardinality(new.marks), 0) <> cardinality(new.divisions)
     or exists (select 1 from unnest(new.marks) m where m is null or m !~ '^(X|0|[1-9])$')
     or new.marks[1] <> 'X' then
    raise exception 'taal_marks_invalid' using detail = 'One mark per vibhag: X (sam, first), 2-9 (tali) or 0 (khali).';
  end if;
  new.bols := array(select lower(btrim(b)) from unnest(new.bols) with ordinality u(b, n) order by n);
  if exists (select 1 from unnest(new.bols) b
              where b is null or b !~ '^(-|[^.[:space:]-]{1,10}(\.[^.[:space:]-]{1,10}){0,3})$') then
    raise exception 'taal_bols_invalid' using detail = 'Each beat is - (rest) or 1-4 bols joined with a dot, e.g. te.re.';
  end if;
  if char_length(coalesce(new.note, '')) > 300 then
    raise exception 'taal_note_too_long' using detail = 'A note has at most 300 characters.';
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
create trigger taals_guard before insert or update on taals
  for each row execute function guard_taal();
create trigger audit_taals after insert or update or delete on taals
  for each row execute function audit_row();

alter table taals enable row level security;
-- Students read the taals switched on; staff read all; only the Guru writes.
create policy readable on taals for select to authenticated using (
  is_staff() or (active and my_role() = 'student'));
create policy guru_insert on taals for insert to authenticated with check (is_guru());
create policy guru_update on taals for update to authenticated using (is_guru()) with check (is_guru());
create policy guru_delete on taals for delete to authenticated using (is_guru());
revoke all on taals from public, anon;
revoke truncate, references, trigger on taals from authenticated;

-- PLACEHOLDERS (marked placeholder = true): the real taals, their bols and levels come from the Guru.
-- 1. kksongs lesson 6 "elementary kirtan rhythm" (8 beats: tā – – ka tā ghe ghe –); vibhags guessed.
-- 2. Six beats: bols invented only to try the player.
-- 3. Dasapahira / "Prabhupada" tala (kksongs lesson 10: 16 mātrās, 8+4+4, khali on 9); bols as read
--    from that page, marks partly guessed: the Guru checks.
insert into taals (name, bols, divisions, marks, level_id, placeholder, note, sort)
select v.name, v.bols, v.divisions, v.marks, v.level_id, true, v.note, v.sort
  from (values
    ('Kirtan 8 beats', array['tā','-','-','ka','tā','ghe','ghe','-'], array[4,4]::smallint[], array['X','0'],
     1::smallint, 'Placeholder, the Guru replaces it. Bols from kksongs lesson 6; vibhags guessed.', 1),
    ('Six beats', array['dhā','tā','tā','ka','tā','tā'], array[3,3]::smallint[], array['X','0'],
     1::smallint, 'Placeholder, the Guru replaces it. Bols invented to try the player.', 2),
    ('Dasapahira 16 beats', array['dhā','ti','tā','tā','ra','ti','ra','ti','tā','ki','ti','ki','tā','ghe','dhā','dhin'],
     array[8,4,4]::smallint[], array['X','0','2'], null::smallint,
     'Placeholder, the Guru replaces it. From kksongs lesson 10 (8+4+4, khali on 9); bols and marks to be checked.', 3)
  ) as v(name, bols, divisions, marks, level_id, note, sort)
 where not exists (select 1 from taals t where t.name = v.name);

-- ---------------------------------------------------------------- 2. practice_logs
-- source: 'timer' (S5 timer, started_at set, today) or 'manual' (S6, a day in the last 14 days).
create table practice_logs (
  id            bigint generated always as identity primary key,
  student_id    uuid not null references students (id) on delete cascade,
  practised_on  date not null,
  minutes       smallint not null check (minutes between 1 and 240),
  source        text not null check (source in ('timer', 'manual')),
  started_at    timestamptz,
  taal_id       bigint references taals (id) on delete set null,
  note          text check (char_length(note) <= 200),
  created_by    uuid references profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  check (source <> 'timer' or started_at is not null)
);
create index practice_logs_student_idx on practice_logs (student_id, practised_on desc);

alter table practice_logs enable row level security;
-- A student reads their own; staff read everyone's (the coordinator sees a mentee's hours on C8).
create policy own_or_staff on practice_logs for select to authenticated using (
  is_staff() or student_id = my_student_id());
-- Every change goes through the functions below.
revoke all on practice_logs from public, anon, authenticated;
grant select on practice_logs to authenticated;

-- Logs practice for the signed-in student; returns the new row's id.
-- Timer: started_at within the last 6 hours, minutes not more than the time since then (+1), day =
-- today in India. Manual: a day from 13 days ago to today. Both: 1-240 minutes, at most 12 hours and
-- 20 entries a day. Errors: not_allowed (not a student), minutes_invalid, started_invalid,
-- date_invalid, taal_not_found, note_too_long, day_full, too_many.
create or replace function log_practice(p_minutes int, p_source text, p_practised_on date default null,
  p_started_at timestamptz default null, p_taal bigint default null, p_note text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := my_student_id();
  v_day     date;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_id      bigint;
begin
  if v_student is null then
    raise exception 'not_allowed' using detail = 'Only a student logs practice.';
  end if;
  if p_minutes is null or p_minutes not between 1 and 240 then
    raise exception 'minutes_invalid' using detail = '1-240 minutes.';
  end if;
  if p_source = 'timer' then
    if p_started_at is null or p_started_at > now() + interval '1 minute'
       or p_started_at < now() - interval '6 hours'
       or p_minutes > ceil(extract(epoch from (now() - p_started_at)) / 60) + 1 then
      raise exception 'started_invalid' using detail = 'The timer''s start time does not fit the minutes.';
    end if;
    v_day := today_ist();
  elsif p_source = 'manual' then
    v_day := coalesce(p_practised_on, today_ist());
    if v_day > today_ist() or v_day < today_ist() - 13 then
      raise exception 'date_invalid' using detail = 'A day from 13 days ago to today.';
    end if;
  else
    raise exception 'source_invalid';
  end if;
  if p_taal is not null and not exists (select 1 from taals where id = p_taal and active) then
    raise exception 'taal_not_found';
  end if;
  if char_length(coalesce(v_note, '')) > 200 then
    raise exception 'note_too_long' using detail = 'At most 200 characters.';
  end if;
  -- One student at a time, so two quick taps cannot both pass the limits below.
  perform 1 from students where id = v_student for update;
  if (select count(*) from practice_logs where student_id = v_student and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many' using detail = 'At most 20 entries a day.';
  end if;
  if coalesce((select sum(minutes) from practice_logs where student_id = v_student and practised_on = v_day), 0)
     + p_minutes > 720 then
    raise exception 'day_full' using detail = 'At most 12 hours of practice on one day.';
  end if;
  insert into practice_logs (student_id, practised_on, minutes, source, started_at, taal_id, note)
  values (v_student, v_day, p_minutes, p_source, case when p_source = 'timer' then p_started_at end, p_taal, v_note)
  returning id into v_id;
  return v_id;
end $$;

-- A student deletes their own entry of the last 14 days (a mistake). Errors: not_allowed, too_old.
create or replace function delete_practice(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row practice_logs;
begin
  select * into v_row from practice_logs where id = p_id;
  if v_row.id is null or my_student_id() is null or v_row.student_id <> my_student_id() then
    raise exception 'not_allowed';
  end if;
  if v_row.practised_on < today_ist() - 13 then
    raise exception 'too_old' using detail = 'Entries older than 14 days stay.';
  end if;
  delete from practice_logs where id = p_id;
end $$;

-- Weekly practice of one student, the newest week first, weeks from Monday (India), p_weeks of them
-- (1-26), empty weeks with 0. Runs as the person asking, so row-level security applies: a student
-- gets their own minutes only, staff anyone's.
create or replace function practice_weeks(p_student uuid, p_weeks int default 8)
returns table (week_start date, minutes int, entries int)
language sql stable set search_path = public as $$
  with weeks as (
    select (date_trunc('week', today_ist()::timestamp)::date - 7 * g) as week_start
      from generate_series(0, least(greatest(coalesce(p_weeks, 8), 1), 26) - 1) g
  )
  select w.week_start, coalesce(sum(p.minutes), 0)::int, count(p.id)::int
    from weeks w
    left join practice_logs p
      on p.student_id = p_student and p.practised_on >= w.week_start and p.practised_on < w.week_start + 7
   group by w.week_start
   order by w.week_start desc
$$;

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14.
revoke execute on function guard_taal(), log_practice(int, text, date, timestamptz, bigint, text),
  delete_practice(bigint), practice_weeks(uuid, int)
  from public, anon, authenticated;
grant execute on function log_practice(int, text, date, timestamptz, bigint, text), delete_practice(bigint),
  practice_weeks(uuid, int) to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on table taals is 'S5/V1: rhythm cycles for the taal player. bols = one entry per beat (- = rest, strokes in a beat joined with .), divisions = beats per vibhag, marks = X sam / 2-9 tali / 0 khali per vibhag. placeholder = seeded stand-in the Guru replaces (docs/DECISIONS.md #49).';
comment on table practice_logs is 'S6: practice minutes of a student, from the S5 timer (source timer) or typed in (manual). Written only through log_practice / delete_practice.';
comment on function log_practice is 'S5/S6: log practice for the signed-in student (timer: started_at and today; manual: last 14 days). 1-240 minutes, at most 12 h and 20 entries a day.';
comment on function delete_practice is 'S6: the student deletes an own entry of the last 14 days.';
comment on function practice_weeks is 'S4/C8: weekly practice minutes (weeks from Monday, India), newest first, as the person asking sees them.';
comment on function guard_taal is 'Checks a taal: name, 2-32 beats, vibhags that add up, one mark per vibhag (X first), bols shape, note length.';
