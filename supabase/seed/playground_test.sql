-- Mridanga Seva — Rhythm Playground placeholder content for the TEST project ONLY (docs/RHYTHM_PLAYGROUND.md §19.3;
-- docs/DECISIONS.md #720). NEVER run on LIVE: it switches on playground_allow_placeholders and playground_enabled.
-- Run after 0065, in the TEST project's SQL editor (or `supabase db query`). Safe to run twice (the second run adds
-- nothing and publishes nothing new).
--
-- What it makes: a dictionary of the app's 9 strokes + dhā, dhin, kat (and ke, re that sound like ka, ra),
-- templates for Sound Detective, Missing Beat, Rhythm Builder and Tempo Detective (Beginner to Advanced), and 38
-- exercises — all marked placeholder = true, approved by "the SQL editor", then published as one version. The
-- sounds are the app's synthesised strokes ("TEST sounds" badge); no recording is involved. Prji's real dictionary
-- and recordings replace all of it (§18): the placeholders are retired, never published on LIVE.

-- Guard: TEST has seed.sql's fictional students (example.com); LIVE ran the seed clean-up and has none.
do $$
begin
  if not exists (select 1 from students where lower(email) = 'arjun.rao@example.com') then
    raise exception 'playground_test.sql refused: this is not the TEST project (seed.sql''s example students are missing). Nothing was changed.';
  end if;
end $$;

begin;

update settings set value = 'true' where key in ('playground_allow_placeholders', 'playground_enabled') and value <> 'true';

insert into play_bols (id, written, head, technique, open, level_id, sounds_like, close_pairs, status, placeholder, approved_at) values
  ('ta',   'tā',   'dayan', 'TEST: index finger at the edge of the black spot',   true,  1, '{}',     '{na}',   'approved', true, now()),
  ('na',   'nā',   'dayan', 'TEST: index finger on the rim',                      true,  1, '{}',     '{ta}',   'approved', true, now()),
  ('ti',   'tī',   'dayan', 'TEST: three fingers on the black spot, closed',      false, 1, '{}',     '{te}',   'approved', true, now()),
  ('ra',   'ra',   'dayan', 'TEST: index finger on the black spot, closed',       false, 1, '{re}',   '{}',     'approved', true, now()),
  ('re',   're',   'dayan', 'TEST: as ra',                                         false, 1, '{ra}',   '{}',     'approved', true, now()),
  ('te',   'te',   'dayan', 'TEST: middle finger on the black spot, closed',      false, 1, '{}',     '{ti}',   'approved', true, now()),
  ('ka',   'ka',   'baya',  'TEST: flat hand on the left head, closed',           false, 1, '{ke}',   '{}',     'approved', true, now()),
  ('ke',   'ke',   'baya',  'TEST: as ka',                                         false, 1, '{ka}',   '{}',     'approved', true, now()),
  ('gha',  'gha',  'baya',  'TEST: fingers on the left black spot, open',         true,  1, '{}',     '{ga}',   'approved', true, now()),
  ('ga',   'ga',   'baya',  'TEST: wrist and fingers on the left head, open',     true,  1, '{}',     '{gha}',  'approved', true, now()),
  ('gin',  'gin',  'baya',  'TEST: a slide on the left head',                     true,  1, '{}',     '{}',     'approved', true, now()),
  ('dha',  'dhā',  'both',  'TEST: tā and ga together',                           true,  1, '{}',     '{dhin}', 'approved', true, now()),
  ('dhin', 'dhin', 'both',  'TEST: tī and ga together',                           true,  1, '{}',     '{dha}',  'approved', true, now()),
  ('kat',  'kat',  'both',  'TEST: ka and tī together',                           false, 1, '{}',     '{}',     'approved', true, now())
on conflict (id) do nothing;

do $$
declare
  v_sd bigint; v_mb bigint; v_rb bigint; v_td bigint;
begin
  if exists (select 1 from play_exercises where placeholder) then
    return;  -- seeded before
  end if;
  insert into play_templates (game, skill, response_mode, level_min, level_max, steps, params, status, placeholder, approved_at)
  values ('sound_detective', 'listen.stroke', 'choose', 1, 3,
          '[{"step":1,"choices":2,"len":[1,1],"otherHead":true},{"step":2,"choices":3,"len":[1,1]},{"step":3,"choices":4,"len":[1,1]},{"step":4,"choices":3,"len":[1,1],"closePairs":true}]',
          '{"roundLen":6}', 'approved', true, now())
  returning id into v_sd;
  insert into play_templates (game, skill, response_mode, level_min, level_max, steps, params, status, placeholder, approved_at)
  values ('missing_beat', 'listen.phrase', 'choose', 1, 3,
          '[{"step":1,"choices":3,"gaps":1,"grid":true},{"step":2,"choices":4,"gaps":1,"grid":true},{"step":3,"choices":4,"gaps":1,"grid":false},{"step":4,"choices":4,"gaps":2,"grid":true}]',
          '{"roundLen":6}', 'approved', true, now())
  returning id into v_mb;
  insert into play_templates (game, skill, response_mode, level_min, level_max, steps, params, status, placeholder, approved_at)
  values ('rhythm_builder', 'rhythm.sequence', 'order', 1, 3,
          '[{"step":1,"extraTiles":0,"grid":true},{"step":2,"extraTiles":1,"grid":true},{"step":3,"extraTiles":2,"grid":false}]',
          '{"roundLen":5}', 'approved', true, now())
  returning id into v_rb;
  insert into play_templates (game, skill, response_mode, level_min, level_max, steps, params, status, placeholder, approved_at)
  values ('tempo_detective', 'listen.tempo', 'choose', 1, 3,
          '[{"step":1,"tempoDiff":0.25},{"step":2,"tempoDiff":0.15},{"step":3,"tempoDiff":0.08}]',
          '{"roundLen":6}', 'approved', true, now())
  returning id into v_td;

  -- Sound Detective: one exercise per bol sound (ke, re are the same cards as ka, ra).
  insert into play_exercises (game, template_id, level_id, skills, sequence, bpm_min, bpm_max, status, placeholder, approved_at)
  select 'sound_detective', v_sd, 1, '{listen.stroke}', array[b], 60, 80, 'approved', true, now()
    from unnest(array['ta', 'na', 'ti', 'ra', 'te', 'ka', 'gha', 'ga', 'gin', 'dha', 'dhin', 'kat']) b;

  -- Missing Beat: 4-8 beats.
  insert into play_exercises (game, template_id, level_id, skills, sequence, divisions, bpm_min, bpm_max, status, placeholder, approved_at)
  select 'missing_beat', v_mb, 1, '{listen.phrase}', s, d, 60, 80, 'approved', true, now()
    from (values
      (array['ta', 'na', 'ta', 'na'], array[2, 2]::smallint[]),
      (array['te', 're', 'ka', 'ta'], array[4]::smallint[]),
      (array['dha', 'ga', 'na', 'ti'], array[2, 2]::smallint[]),
      (array['ta', '-', 'ka', 'ta', 'gha', 'gha', '-', 'ta'], array[4, 4]::smallint[]),
      (array['dha', 'dhin', 'dhin', 'dha'], array[4]::smallint[]),
      (array['ga', 'gha', 'ta', 'na', 'ka', 'ti'], array[3, 3]::smallint[]),
      (array['te.re', 'ka', 'ta', 'gin'], array[4]::smallint[]),
      (array['na', 'ti', 'na', 'ka'], array[2, 2]::smallint[]),
      (array['dha', 'ga', 'ti', 'na', 'ka', 'ta', 'gha', 'na'], array[4, 4]::smallint[]),
      (array['kat', 'ta', 'ga', 'dha'], array[4]::smallint[])
    ) x(s, d);

  -- Rhythm Builder: 3-6 beats.
  insert into play_exercises (game, template_id, level_id, skills, sequence, bpm_min, bpm_max, status, placeholder, approved_at)
  select 'rhythm_builder', v_rb, 1, '{rhythm.sequence}', s, 60, 76, 'approved', true, now()
    from (values
      (array['ta', 'na', 'ka']), (array['te', 're', 'ka', 'ta']), (array['dha', 'ga', 'na']),
      (array['ga', 'ti', 'na', 'ka']), (array['ta', 'ta', 'gha', 'na']), (array['dhin', 'na', 'ka', 'ta', 'ga']),
      (array['kat', 'ti', 'ta']), (array['gin', 'na', 'te', 'ka']), (array['dha', 'ti', 'gha', 'na', 'ta', 'ka']),
      (array['na', 'gha', 'te'])
    ) x(s);

  -- Tempo Detective: a phrase played at two tempos inside its range.
  insert into play_exercises (game, template_id, level_id, skills, sequence, bpm_min, bpm_max, status, placeholder, approved_at)
  select 'tempo_detective', v_td, 1, '{listen.tempo}', s, 56, 100, 'approved', true, now()
    from (values
      (array['ta', 'na', 'ta', 'na']), (array['dha', 'ga', 'na', 'ti']), (array['te', 're', 'ka', 'ta']),
      (array['ga', 'gha', 'ta', 'na']), (array['ta', '-', 'ka', 'ta']), (array['dhin', 'na', 'dhin', 'na'])
    ) x(s);

  perform publish_playground('TEST placeholders (supabase/seed/playground_test.sql)');
end $$;

commit;

-- Check: version 1 (or later), 14 bols, 4 templates, 38 exercises, placeholders allowed.
select (select max(version) from play_publications) as version,
       (select count(*) from play_bols where placeholder and published_in is not null) as bols,
       (select count(*) from play_templates where placeholder and published_in is not null) as templates,
       (select count(*) from play_exercises where placeholder and published_in is not null) as exercises,
       (select value from settings where key = 'playground_allow_placeholders') as placeholders_allowed;
