-- Mridanga Seva — 0052: more for home practice (docs/DECISIONS.md #400-#401; docs/DATABASE.md "Practice of
-- the week and the weekly goal (0052)"). Run after 0051, in the Supabase SQL
-- editor, TEST first. Needs 0001-0051. Safe to run twice. No existing row or function changes.
--
-- 1. practice_plans: per level, what the teachers ask students to practise this week: a weekly goal
--    (days a week, minutes a day; 4 x 15 when a level has no row) and up to three items, each a taal
--    at a tempo or a lesson video, with a short note. The Guru and coordinators write it (coordinators
--    are the teachers, #11); a student reads only their own level's row. Class content: no personal data.
-- 2. practice_goals + set_my_practice_goal(): a student may set their own weekly goal (Praveen 21-10-2026).
-- 3. practice_days(): a student's practice minutes per day of the last weeks with their goal (own, level's or
--    4 x 15), for the "this week" days and the weeks in a row with the goal met (S5, S4 My progress, C8). Runs
--    as the person asking: a student gets their own days only, staff anyone's (row-level security of 0018).
-- 4. practice_mantras: mantras to read before practice, written by the Guru and Ishtagoshti editors (#405).

-- ---------------------------------------------------------------- 1. practice_plans
create table if not exists practice_plans (
  id            smallint generated always as identity primary key,
  level_id      smallint not null unique references levels (id) on delete cascade,
  goal_days     smallint not null default 4,
  goal_minutes  smallint not null default 15,
  note          text,
  -- [{"taal": <taals.id>, "bpm": 30-240} | {"lesson": <materials.id>}], at most 3, in the order shown.
  items         jsonb not null default '[]',
  updated_at    timestamptz not null default now(),
  updated_by    uuid references profiles (id) on delete set null
);

-- Checks every write, also from the dashboard. Errors: plan_goal_invalid (1-7 days, 5-120 minutes),
-- plan_note_too_long (300), plan_items_invalid (not a list of at most 3 items of the shapes above),
-- plan_bpm_invalid (30-240), plan_taal_not_found (no such taal switched on), plan_lesson_not_found (no
-- approved lesson video, YouTube or the team's own file, for this level or a lower one: what its
-- students can open).
create or replace function guard_practice_plan() returns trigger
language plpgsql set search_path = public as $$
declare
  v_item  jsonb;
  v_items jsonb := '[]';
  v_id    bigint;
  v_bpm   int;
begin
  if new.goal_days is null or new.goal_days not between 1 and 7
     or new.goal_minutes is null or new.goal_minutes not between 5 and 120 then
    raise exception 'plan_goal_invalid' using detail = '1-7 days a week, 5-120 minutes a day.';
  end if;
  new.note := nullif(btrim(coalesce(new.note, '')), '');
  if char_length(coalesce(new.note, '')) > 300 then
    raise exception 'plan_note_too_long' using detail = 'At most 300 characters.';
  end if;
  if jsonb_typeof(coalesce(new.items, 'null')) <> 'array' or jsonb_array_length(new.items) > 3 then
    raise exception 'plan_items_invalid' using detail = 'A list of at most 3 items.';
  end if;
  for v_item in select value from jsonb_array_elements(new.items) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'plan_items_invalid';
    end if;
    begin
      if v_item ? 'taal' and (select count(*) from jsonb_object_keys(v_item)) = 2 and v_item ? 'bpm' then
        v_id := (v_item ->> 'taal')::bigint;
        v_bpm := (v_item ->> 'bpm')::int;
      elsif v_item ? 'lesson' and (select count(*) from jsonb_object_keys(v_item)) = 1 then
        v_id := (v_item ->> 'lesson')::bigint;
        v_bpm := null;
      else
        raise exception 'plan_items_invalid';
      end if;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'plan_items_invalid';
    end;
    if v_item ? 'taal' then
      if v_bpm is null or v_bpm not between 30 and 240 then
        raise exception 'plan_bpm_invalid' using detail = '30-240 beats a minute.';
      end if;
      if not exists (select 1 from taals where id = v_id and active) then
        raise exception 'plan_taal_not_found';
      end if;
      v_items := v_items || jsonb_build_array(jsonb_build_object('taal', v_id, 'bpm', v_bpm));
    else
      if not exists (select 1 from materials m where m.id = v_id and m.approved_by is not null
                       and m.kind in ('youtube', 'video') and (m.level_id is null or m.level_id <= new.level_id)) then
        raise exception 'plan_lesson_not_found';
      end if;
      v_items := v_items || jsonb_build_array(jsonb_build_object('lesson', v_id));
    end if;
  end loop;
  new.items := v_items;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

drop trigger if exists practice_plans_guard on practice_plans;
create trigger practice_plans_guard before insert or update on practice_plans
  for each row execute function guard_practice_plan();
drop trigger if exists audit_practice_plans on practice_plans;
create trigger audit_practice_plans after insert or update or delete on practice_plans
  for each row execute function audit_row();

alter table practice_plans enable row level security;
-- Staff read every level's plan; a student reads their own level's (a higher level's lessons stay unseen). The
-- helpers are wrapped in (select ...), so they run once per query, not per row (D9-01).
drop policy if exists readable on practice_plans;
create policy readable on practice_plans for select to authenticated using (
  (select is_staff()) or level_id = (select s.level_id from students s where s.id = (select my_student_id())));
drop policy if exists staff_insert on practice_plans;
create policy staff_insert on practice_plans for insert to authenticated with check ((select is_staff()));
drop policy if exists staff_update on practice_plans;
create policy staff_update on practice_plans for update to authenticated using ((select is_staff())) with check ((select is_staff()));
-- No delete from the app: an empty plan is a row with no items.
revoke all on practice_plans from public, anon;
revoke delete, truncate, references, trigger on practice_plans from authenticated;

-- Praveen 21-10-2026: the default goal is 4 days x 15 minutes (a TEST that ran an earlier draft of this file with 5
-- gets the new default here).
alter table practice_plans alter column goal_days set default 4;

-- ---------------------------------------------------------------- 2. practice_goals
-- A student's own weekly goal (#400), in place of their level's. Written only through set_my_practice_goal; read by
-- the student and by staff (the week card on the student's page). Gone with the record (erasure deletes the student).
create table if not exists practice_goals (
  student_id    uuid primary key references students (id) on delete cascade,
  goal_days     smallint not null check (goal_days between 1 and 7),
  goal_minutes  smallint not null check (goal_minutes between 5 and 120),
  updated_at    timestamptz not null default now()
);
-- Nothing new is recorded about a withdrawn student (#281).
drop trigger if exists practice_goals_refuse_withdrawn on practice_goals;
create trigger practice_goals_refuse_withdrawn before insert on practice_goals
  for each row execute function refuse_withdrawn();

alter table practice_goals enable row level security;
drop policy if exists own_or_staff on practice_goals;
create policy own_or_staff on practice_goals for select to authenticated using (
  (select is_staff()) or student_id = (select my_student_id()));
revoke all on practice_goals from public, anon, authenticated;
grant select on practice_goals to authenticated;

-- The signed-in student sets their own goal (1-7 days, 5-120 minutes), or goes back to the level's with null days.
-- Errors: not_allowed (no student record), plan_goal_invalid.
create or replace function set_my_practice_goal(p_days int, p_minutes int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_student uuid := my_student_id();
begin
  if v_student is null then
    raise exception 'not_allowed' using detail = 'Only a student sets their practice goal.';
  end if;
  if p_days is null then
    delete from practice_goals where student_id = v_student;
    return;
  end if;
  if p_days not between 1 and 7 or p_minutes is null or p_minutes not between 5 and 120 then
    raise exception 'plan_goal_invalid' using detail = '1-7 days a week, 5-120 minutes a day.';
  end if;
  insert into practice_goals (student_id, goal_days, goal_minutes) values (v_student, p_days, p_minutes)
  on conflict (student_id) do update set goal_days = excluded.goal_days, goal_minutes = excluded.goal_minutes, updated_at = now();
end $$;

-- ---------------------------------------------------------------- 3. practice_days
-- One row per day with practice, from the Monday p_weeks - 1 weeks before this week's (1-53 weeks, India),
-- with the student's goal: their own, else their level's, else 4 days x 15 minutes (goal_own says whether it is
-- their own). Security invoker: row-level security decides whose days come back; a student asking about someone
-- else gets no days and the default goal.
create or replace function practice_days(p_student uuid, p_weeks int default 12) returns jsonb
language sql stable set search_path = public as $$
  with goal as (
    select g.goal_days as own_days, g.goal_minutes as own_minutes, pp.goal_days as level_days, pp.goal_minutes as level_minutes
      from (select p_student as id) x
      left join practice_goals g on g.student_id = x.id
      left join students s on s.id = x.id
      left join practice_plans pp on pp.level_id = s.level_id
  )
  select jsonb_build_object(
    'goal_days', coalesce((select own_days from goal), (select level_days from goal), 4),
    'goal_minutes', coalesce((select own_minutes from goal), (select level_minutes from goal), 15),
    'goal_own', coalesce((select own_days is not null from goal), false),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('on', d.practised_on, 'minutes', d.minutes) order by d.practised_on desc)
        from (select p.practised_on, sum(p.minutes)::int as minutes
                from practice_logs p
               where p.student_id = p_student
                 and p.practised_on >= date_trunc('week', today_ist()::timestamp)::date
                                       - 7 * (least(greatest(coalesce(p_weeks, 12), 1), 53) - 1)
               group by p.practised_on) d), '[]'::jsonb))
$$;

-- ---------------------------------------------------------------- 4. practice_mantras
-- Mantras read before practice (#405, Praveen 21-10-2026), e.g. the mridanga pranam and a guru pranam. The TEXT comes
-- from the Guru in the app: nothing is seeded. Each has a title, the text in Devanagari, Telugu script and/or Roman
-- transliteration (at least one), the meaning in en/te/hi (optional), a source note and an order. Everyone signed in
-- with a class role reads the ones switched on; the Guru and Ishtagoshti editors (is_ig_editor, 0021) read all and
-- write. Errors: mantra_title_invalid (1-80), mantra_text_required, mantra_text_too_long (3000 a script, 2000 a
-- meaning), mantra_source_too_long (200).
create table if not exists practice_mantras (
  id          bigint generated always as identity primary key,
  title       text not null,
  devanagari  text,
  telugu      text,
  roman       text,
  meaning_en  text,
  meaning_te  text,
  meaning_hi  text,
  source      text,
  sort        int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references profiles (id) on delete set null
);

create or replace function guard_practice_mantra() returns trigger
language plpgsql set search_path = public as $$
begin
  new.title := btrim(regexp_replace(coalesce(new.title, ''), '\s+', ' ', 'g'));
  if char_length(new.title) not between 1 and 80 then
    raise exception 'mantra_title_invalid' using detail = 'A title has 1-80 characters.';
  end if;
  new.devanagari := nullif(btrim(new.devanagari, E' \t\r\n'), '');
  new.telugu     := nullif(btrim(new.telugu, E' \t\r\n'), '');
  new.roman      := nullif(btrim(new.roman, E' \t\r\n'), '');
  new.meaning_en := nullif(btrim(new.meaning_en, E' \t\r\n'), '');
  new.meaning_te := nullif(btrim(new.meaning_te, E' \t\r\n'), '');
  new.meaning_hi := nullif(btrim(new.meaning_hi, E' \t\r\n'), '');
  new.source     := nullif(btrim(new.source, E' \t\r\n'), '');
  if coalesce(new.devanagari, new.telugu, new.roman) is null then
    raise exception 'mantra_text_required' using detail = 'The mantra in at least one script.';
  end if;
  if greatest(char_length(coalesce(new.devanagari, '')), char_length(coalesce(new.telugu, '')), char_length(coalesce(new.roman, ''))) > 3000
     or greatest(char_length(coalesce(new.meaning_en, '')), char_length(coalesce(new.meaning_te, '')),
                 char_length(coalesce(new.meaning_hi, ''))) > 2000 then
    raise exception 'mantra_text_too_long' using detail = 'A script has at most 3000 characters, a meaning 2000.';
  end if;
  if char_length(coalesce(new.source, '')) > 200 then
    raise exception 'mantra_source_too_long' using detail = 'The source note has at most 200 characters.';
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

drop trigger if exists practice_mantras_guard on practice_mantras;
create trigger practice_mantras_guard before insert or update on practice_mantras
  for each row execute function guard_practice_mantra();
drop trigger if exists audit_practice_mantras on practice_mantras;
create trigger audit_practice_mantras after insert or update or delete on practice_mantras
  for each row execute function audit_row();

alter table practice_mantras enable row level security;
drop policy if exists readable on practice_mantras;
create policy readable on practice_mantras for select to authenticated using (
  (active and (select has_class_role())) or (select is_ig_editor()));
drop policy if exists editor_insert on practice_mantras;
create policy editor_insert on practice_mantras for insert to authenticated with check ((select is_ig_editor()));
drop policy if exists editor_update on practice_mantras;
create policy editor_update on practice_mantras for update to authenticated
  using ((select is_ig_editor())) with check ((select is_ig_editor()));
drop policy if exists editor_delete on practice_mantras;
create policy editor_delete on practice_mantras for delete to authenticated using ((select is_ig_editor()));
revoke all on practice_mantras from public, anon;
revoke truncate, references, trigger on practice_mantras from authenticated;

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14.
revoke execute on function guard_practice_plan(), guard_practice_mantra(), practice_days(uuid, int), set_my_practice_goal(int, int)
  from public, anon, authenticated;
grant execute on function practice_days(uuid, int), set_my_practice_goal(int, int) to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on table practice_plans is 'S5 practice of the week, per level: weekly goal (goal_days x goal_minutes) and up to 3 items (a taal at a bpm, or a lesson video) with a note. Staff write; a student reads own level (0052, docs/DECISIONS.md #400-#401).';
comment on function guard_practice_plan is 'Trigger: checks a practice plan: goal 1-7 days and 5-120 minutes, note 300, at most 3 items, each a switched-on taal at 30-240 bpm or an approved lesson video its level can open (0052).';
comment on function practice_days(uuid, int) is 'S5/S4/C8: a student''s practice minutes per day of the last p_weeks weeks (from Monday, India) and their weekly goal (own, else the level''s, else 4 x 15), as the person asking may see them (0052, #400).';
comment on table practice_mantras is 'S5: mantras read before practice (title, Devanagari / Telugu / Roman text, meaning en/te/hi, source, order). Text only from the Guru in the app, nothing seeded. Class roles read the ones switched on; the Guru and Ishtagoshti editors write (0052, docs/DECISIONS.md #405).';
comment on function guard_practice_mantra is 'Trigger: checks a practice mantra: title 1-80, text in at least one script (3000 each), meanings 2000, source 200 (0052, #405).';
comment on table practice_goals is 'S5: a student''s own weekly practice goal (days x minutes), in place of the level''s. Written only through set_my_practice_goal (0052, #400).';
comment on function set_my_practice_goal(int, int) is 'S5, student: sets their own weekly goal (1-7 days, 5-120 minutes), or back to the level''s with null days (0052, #400).';
