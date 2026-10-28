-- Mridanga Seva — Rhythm Playground: recordings sent from a game (docs/RHYTHM_PLAYGROUND.md §10.4, §13.2, §13.4;
-- docs/DECISIONS.md #766, #696). A game's "Send to my facilitator" reuses the assessment path (0016): the facilitator
-- releases an assessment marked with the game (assessments.playground_game, 0065) and the student sends the take
-- through submit_assessment. This adds the limits that keep Storage inside the free plan:
--   1. A student has at most 2 game recordings waiting for review (sent, not reviewed, file not removed) at a time:
--      a third is refused with `playground_takes_full` (the game says so before the send screen; this is the rule).
--   2. A game recording is an audio file of at most 2.5 MB — the app stops a game take at 90 seconds (≈ 1.1 MB on a
--      phone, ≈ 1.5 MB in a browser); a longer or non-audio file is refused with `playground_take_too_long`.
--   3. assessments.playground_game is a game id or null (`playground_game_invalid`).
--   4. play_assets.bundled_key may also name a sound the app generates: 'synth:tone:0,2', 'synth:instrument:kartal',
--      'synth:kirtan:slow' (lib/playground/tones.ts; reference tones, and TEST stand-ins until recordings exist, #761).
-- submit_assessment itself is not replaced: a trigger on assessment_submissions checks rows for game assessments
-- only, so every other assessment works exactly as before. Needs 0065. Changes no stored row. Safe to run twice.

-- 4. Generated sounds (a bundled stroke key stays 1-10 letters).
alter table play_assets drop constraint if exists play_assets_bundled_key_check;
alter table play_assets add constraint play_assets_bundled_key_check
  check (bundled_key ~ '^[a-z]{1,10}$' or bundled_key ~ '^synth:(tone|instrument|kirtan):[a-z0-9,+_-]{1,60}$');

-- 3. Only a known game.
create or replace function guard_assessment_playground_game() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.playground_game := nullif(btrim(coalesce(new.playground_game, '')), '');
  if new.playground_game is not null and new.playground_game not in ('sound_detective', 'tap_the_beat', 'echo',
       'missing_beat', 'voice_companion', 'rhythm_builder', 'kirtan_companion', 'tempo_detective', 'sound_explorer',
       'daily_quest', 'tala_cycle', 'rhythm_switching', 'vocal_studio', 'kirtan_sync') then
    raise exception 'playground_game_invalid';
  end if;
  return new;
end $$;

drop trigger if exists assessment_playground_game_guard on assessments;
create trigger assessment_playground_game_guard before insert or update of playground_game on assessments
  for each row execute function guard_assessment_playground_game();
-- The facilitator sets the game on the assessment form: 0016 grants insert/update column by column and 0065 added the
-- column without one, so every save from the form (which always sends it) was refused as "not allowed".
grant insert (playground_game), update (playground_game) on assessments to authenticated;

-- 1-2. A recording sent to a game's assessment. Security definer: it counts the student's other submissions, which
-- the caller (submit_assessment, itself security definer) may not see through row-level security.
create or replace function guard_playground_submission() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_game    text;
  v_student uuid;
begin
  select a.playground_game, g.student_id into v_game, v_student
    from assessment_assignments g join assessments a on a.id = g.assessment_id
   where g.id = new.assignment_id;
  if v_game is null then return new; end if;
  if new.file is not null and (coalesce(new.file ->> 'kind', '') <> 'audio'
       or coalesce((new.file ->> 'size')::bigint, 0) > 2621440) then
    raise exception 'playground_take_too_long' using detail = 'A game recording is audio of at most 90 seconds (2.5 MB).';
  end if;
  -- Two sends at the same moment must not both pass the count.
  perform pg_advisory_xact_lock(hashtext('playground_takes'), hashtext(v_student::text));
  if (select count(*) from assessment_submissions s
        join assessment_assignments g on g.id = s.assignment_id
        join assessments a on a.id = g.assessment_id
       where g.student_id = v_student and a.playground_game is not null
         and s.reviewed_at is null and s.file_removed_at is null) >= 2 then
    raise exception 'playground_takes_full' using detail = 'At most 2 game recordings wait for review at a time.';
  end if;
  return new;
end $$;
revoke all on function guard_playground_submission() from public, anon, authenticated;
revoke all on function guard_assessment_playground_game() from public, anon, authenticated;

drop trigger if exists playground_submission_guard on assessment_submissions;
create trigger playground_submission_guard before insert on assessment_submissions
  for each row execute function guard_playground_submission();

comment on function guard_playground_submission is 'Rhythm Playground (0069, #766): at most 2 game recordings waiting for review per student; a game recording is audio of at most 2.5 MB (90 s in the app).';
comment on function guard_assessment_playground_game is 'Rhythm Playground (0069, #766): assessments.playground_game is a game id or null.';
