-- Mridanga Seva — Rhythm Playground placeholder content for the TEST project ONLY (docs/RHYTHM_PLAYGROUND.md §19.3;
-- docs/DECISIONS.md #720, #722). NEVER run on LIVE: it switches on playground_allow_placeholders and
-- playground_enabled. Run after 0065, in the TEST project's SQL editor (or `supabase db query`). Safe to run twice:
-- a run that changes nothing publishes nothing.
--
-- Prji's first set (28-10-2026, D2): the four bīja strokes of the seed mantra te | re | khe | ta, and nothing else.
-- What it makes: those four dictionary bols, templates for Sound Detective, Missing Beat, Rhythm Builder and Tempo
-- Detective (Beginner to Advanced), and 30 exercises written only with te, re, khe, ta — all placeholder = true,
-- approved by "the SQL editor", then published. Sounds are the app's synthesised strokes ("TEST sounds"). With four
-- bols Sound Detective has four items, so its rounds are "Review practice" (§8.7) until more bols are approved.
-- A TEST project seeded before with the earlier 14-bol set: those other bols and every placeholder exercise using
-- them are retired, so the next pack has only the four. Prji's recordings replace the placeholders (§18).

-- Guard: TEST has seed.sql's fictional students (example.com); LIVE ran the seed clean-up and has none.
do $$
begin
  if not exists (select 1 from students where lower(email) = 'arjun.rao@example.com') then
    raise exception 'playground_test.sql refused: this is not the TEST project (seed.sql''s example students are missing). Nothing was changed.';
  end if;
end $$;

begin;

update settings set value = 'true' where key in ('playground_allow_placeholders', 'playground_enabled') and value <> 'true';

do $$
declare
  v_set     text[] := array['te', 're', 'khe', 'ta'];
  v_changed int := 0;
  v_n       int;
  v_sd bigint; v_mb bigint; v_rb bigint; v_td bigint;
  v_seq text[];
  v_game text; v_tpl bigint; v_skill text; v_lo int; v_hi int; v_list jsonb; v_item jsonb;
begin
  -- 1. The dictionary: the four, approved placeholders (written as the class writes them).
  insert into play_bols (id, written, head, technique, open, level_id, sounds_like, close_pairs, status, placeholder, approved_at) values
    ('te',  'te',  'dayan', 'TEST: middle finger on the black spot, closed', false, 1, '{}', '{re}', 'approved', true, now()),
    ('re',  're',  'dayan', 'TEST: index finger on the black spot, closed',  false, 1, '{}', '{te}', 'approved', true, now()),
    ('khe', 'khe', 'baya',  'TEST: flat hand on the left head, closed',      false, 1, '{}', '{}',   'approved', true, now()),
    ('ta',  'tā',  'dayan', 'TEST: index finger at the edge of the black spot', true, 1, '{}', '{}', 'approved', true, now())
  on conflict (id) do nothing;
  get diagnostics v_n = row_count; v_changed := v_changed + v_n;
  -- An earlier seed's te / re / ta carried other pairs: keep them to the four (an edit sends them back to review,
  -- so approve them again).
  update play_bols set sounds_like = '{}', close_pairs = case id when 'te' then '{re}'::text[] when 're' then '{te}'::text[] else '{}'::text[] end
   where placeholder and id = any (v_set)
     and (sounds_like <> '{}' or close_pairs <> case id when 'te' then '{re}'::text[] when 're' then '{te}'::text[] else '{}'::text[] end);
  get diagnostics v_n = row_count; v_changed := v_changed + v_n;
  update play_bols set status = 'approved' where placeholder and id = any (v_set) and status <> 'approved';

  -- 2. Everything else of an earlier seed retired: other placeholder bols, and placeholder exercises using them.
  update play_exercises set status = 'retired'
   where placeholder and status <> 'retired'
     and not (play_bols_of(coalesce(sequence, '{}') || array(select jsonb_array_elements_text(distractors))) <@ v_set);
  get diagnostics v_n = row_count; v_changed := v_changed + v_n;
  update play_bols set status = 'retired' where placeholder and status <> 'retired' and not (id = any (v_set));
  get diagnostics v_n = row_count; v_changed := v_changed + v_n;

  -- 3. Templates (one per game; kept when there).
  select id into v_sd from play_templates where placeholder and game = 'sound_detective' order by id limit 1;
  if v_sd is null then
    insert into play_templates (game, skill, response_mode, level_min, level_max, steps, params, status, placeholder, approved_at)
    values ('sound_detective', 'listen.stroke', 'choose', 1, 3,
            '[{"step":1,"choices":2,"len":[1,1],"otherHead":true},{"step":2,"choices":3,"len":[1,1]},{"step":3,"choices":4,"len":[1,1]},{"step":4,"choices":2,"len":[1,1],"closePairs":true}]',
            '{"roundLen":6}', 'approved', true, now())
    returning id into v_sd;
    v_changed := v_changed + 1;
  end if;
  select id into v_mb from play_templates where placeholder and game = 'missing_beat' order by id limit 1;
  if v_mb is null then
    insert into play_templates (game, skill, response_mode, level_min, level_max, steps, params, status, placeholder, approved_at)
    values ('missing_beat', 'listen.phrase', 'choose', 1, 3,
            '[{"step":1,"choices":3,"gaps":1,"grid":true},{"step":2,"choices":4,"gaps":1,"grid":true},{"step":3,"choices":4,"gaps":1,"grid":false},{"step":4,"choices":4,"gaps":2,"grid":true}]',
            '{"roundLen":6}', 'approved', true, now())
    returning id into v_mb;
    v_changed := v_changed + 1;
  end if;
  select id into v_rb from play_templates where placeholder and game = 'rhythm_builder' order by id limit 1;
  if v_rb is null then
    insert into play_templates (game, skill, response_mode, level_min, level_max, steps, params, status, placeholder, approved_at)
    values ('rhythm_builder', 'rhythm.sequence', 'order', 1, 3,
            '[{"step":1,"extraTiles":0,"grid":true},{"step":2,"extraTiles":1,"grid":true},{"step":3,"extraTiles":2,"grid":false}]',
            '{"roundLen":5}', 'approved', true, now())
    returning id into v_rb;
    v_changed := v_changed + 1;
  end if;
  select id into v_td from play_templates where placeholder and game = 'tempo_detective' order by id limit 1;
  if v_td is null then
    insert into play_templates (game, skill, response_mode, level_min, level_max, steps, params, status, placeholder, approved_at)
    values ('tempo_detective', 'listen.tempo', 'choose', 1, 3,
            '[{"step":1,"tempoDiff":0.25},{"step":2,"tempoDiff":0.15},{"step":3,"tempoDiff":0.08}]',
            '{"roundLen":6}', 'approved', true, now())
    returning id into v_td;
    v_changed := v_changed + 1;
  end if;

  -- 4. Exercises, only te / re / khe / ta; each added once (beats: '-' a rest, te.re two half-beats).
  for v_game, v_tpl, v_skill, v_lo, v_hi, v_list in values
    ('sound_detective', v_sd, 'listen.stroke', 60, 80, '[["te"], ["re"], ["khe"], ["ta"]]'::jsonb),
    ('missing_beat', v_mb, 'listen.phrase', 60, 80,
     '[["te","re","khe","ta"], ["ta","khe","te","re"], ["te.re","khe","ta","ta"], ["te","re","khe","ta","te","re","khe","ta"],
       ["ta","ta","khe","khe"], ["te","re","te","re"], ["khe","ta","te","re"], ["te.re","khe","ta","-"],
       ["ta","khe","ta","khe","te","re"], ["te","re","khe","ta","ta","khe"]]'::jsonb),
    ('rhythm_builder', v_rb, 'rhythm.sequence', 60, 76,
     '[["te","re","khe","ta"], ["ta","khe","te"], ["te","re","ta"], ["khe","ta","te","re"], ["te.re","khe","ta"],
       ["ta","ta","khe"], ["re","te","khe","ta"], ["te","re","khe"], ["khe","khe","ta","ta"], ["ta","te","re","khe"]]'::jsonb),
    ('tempo_detective', v_td, 'listen.tempo', 56, 100,
     '[["te","re","khe","ta"], ["ta","khe","te","re"], ["te.re","khe","ta","ta"], ["te","re","te","re"],
       ["khe","ta","khe","ta"], ["ta","ta","khe","khe"]]'::jsonb)
  loop
    for v_item in select value from jsonb_array_elements(v_list) loop
      v_seq := array(select jsonb_array_elements_text(v_item));
      if not exists (select 1 from play_exercises where placeholder and game = v_game and sequence = v_seq and status = 'approved') then
        insert into play_exercises (game, template_id, level_id, skills, sequence, bpm_min, bpm_max, status, placeholder, approved_at)
        values (v_game, v_tpl, 1, array[v_skill], v_seq, v_lo, v_hi, 'approved', true, now());
        v_changed := v_changed + 1;
      end if;
    end loop;
  end loop;
  -- 5. Publish when anything changed (also when something was retired: phones refresh by version).
  if v_changed > 0 then
    perform publish_playground('TEST placeholders: te | re | khe | ta (supabase/seed/playground_test.sql)');
  end if;
end $$;

commit;

-- Check: the latest version; 4 bols, 4 templates, 30 exercises in the pack; placeholders allowed.
select (select max(version) from play_publications) as version,
       (select string_agg(id, ' ' order by id) from play_bols where placeholder and status = 'approved' and published_in is not null) as bols,
       (select count(*) from play_templates where placeholder and published_in is not null) as templates,
       (select count(*) from play_exercises where placeholder and status = 'approved' and published_in is not null) as exercises,
       (select value from settings where key = 'playground_allow_placeholders') as placeholders_allowed;
