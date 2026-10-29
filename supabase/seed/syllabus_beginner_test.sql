-- Mridanga Seva — the team's syllabus on the TEST project ONLY (docs/DECISIONS.md #773, #775; team mail 29-10-2026:
-- "Beginner Level Lesson Plan_Working Copy" and "Intermediate Level_Hand Practice Mantras_Draft_V1").
-- NEVER run on LIVE: LIVE's syllabus is the Guru's to enter in the app (Levels and syllabus), once the team has
-- confirmed the text and the notation key (docs/NOTATION.md is a DRAFT for Sarvesh Prji and the team).
-- Needs 0072 (sections). Run in the TEST project's SQL editor, or
--   npx supabase@2.118.0 db query --linked --project-ref fhuqykssenuhczdqbafu -f supabase/seed/syllabus_beginner_test.sql
-- (that command commits every statement on its own; there is no dry run). Safe to run twice: an item is added once
-- (same level and title), a material once (same file).
--
-- What it does:
--   1. Retires seed.sql's six Beginner and five Intermediate example items (ticks stay, #44; Restore puts one back).
--   2. Adds the 9 Beginner lessons and "Bonus Hand Practice Mantras" (no sections), and the Intermediate draft under
--      the team's two sections. Titles and text are the team's own words, bols as text; only obvious typos are fixed
--      (listed in NOTES_syllabus.md). The notation symbols are NOT typed in: they wait for the agreed key.
--   3. Attaches the team's PDF pages as PDF materials where the symbols matter (Lessons 1-4, the Intermediate draft,
--      and the whole Beginner notes for the level), if those files were uploaded first to the private bucket
--      material-files as '<a Guru's login id>/<file id>.pdf' (NOTES_syllabus.md has the upload commands). A file
--      not uploaded is skipped with a notice.

-- Guard: TEST has seed.sql's fictional students (example.com); LIVE ran the seed clean-up and has none.
do $$
begin
  if not exists (select 1 from students where lower(email) = 'arjun.rao@example.com') then
    raise exception 'syllabus_beginner_test.sql refused: this is not the TEST project (seed.sql''s example students are missing). Nothing was changed.';
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.syllabus_items'::regclass and attname = 'section' and not attisdropped) then
    raise exception 'syllabus_beginner_test.sql refused: run migration 0072 first. Nothing was changed.';
  end if;
end $$;

begin;

do $$
declare
  v_core    constant text := 'Section 1: Core Practice – Hand Practice, Mantras, Tāla, Mātrās';
  v_seva    constant text := 'Section 2: Temple Seva – Ārati Mantras, Kīrtana Mantras';
  v_level   smallint;
  v_title   text;
  v_text    text;
  v_section text;
  v_file    text;
  v_name    text;
  v_path    text;
  v_size    bigint;
  v_item    bigint;
  v_owner   uuid;
begin
  -- 1. seed.sql's examples make way (retired, not deleted: they may carry ticks and lessons).
  update syllabus_items set retired_at = now()
   where retired_at is null
     and (level_id, title) in ((1, 'Holding the mridanga'), (1, 'Dayan bols'), (1, 'Baya bols'), (1, 'Combined bols'),
                               (1, 'Practice phrases'), (1, 'Elementary kirtan rhythm'),
                               (2, 'Kaherva taal'), (2, 'Prabhupada / Dasapahira taal'), (2, 'Bhajani taal'),
                               (2, 'Dadra and Khemta'), (2, 'Lopha taal'));

  -- 2. The team's items, in teaching order; each added once.
  for v_level, v_title, v_section, v_text in values
    (1::smallint, 'Lesson 1: Varnas', null::text, $t$Smaller side varnas: 1. te  2. re  3. ta
Bigger side varnas: 4. khe  5. ga  6. ge
Combo varnas: 7. jha  8. tak
The notation of each varna is on the team's page below (Lesson 1 notes).$t$),
    (1, 'Lesson 2: Hastha Sadhana Mantras', null, $t$Bhija mantra: te re khe ta
HS1 – 16 Matras: tere kheta tere kheta | tere tere tere kheta | jere ghena jere ghena | jere jere jere ghena
HS2 – 16 Matras: tere kheta tere kheta | tere tere tere kheta | tikhi takhi tere kheta | kheta takhi tere kheta
khene tere kheta:
khene tere tere kheta | khene tere kheta khene | tere kheta tere kheta
tere tere tere kheta | tere tere kheta tere | tere kheta tere kheta
khene tere tere kheta
tere tere tere kheta
khene tere kheta khene | tere kheta tere kheta
tere tere kheta tere | tere kheta tere kheta
khene tere kheta tere | kheta
tere tere kheta | tere kheta
khene tere | kheta
tere tere kheta
| tere kheta
tere kheta
Left-hand exercise 1: ga – – ge | – ga ga –
Left-hand exercise 2: ge – (ga) ga ge | ga – – –$t$),
    (1, 'Lesson 3: Three Levels of Speed Practice', null, $t$Mainly three levels of practice:
1 Guna – Vilambit laya, slow beat – you are playing bole i.e. mantra once.
2 Guna – Madhya laya, medium beat and you are playing bole i.e. mantra twice.
4 Guna – Dhrut laya, fast beat and you are playing bole i.e. four times.
8 Guna – Ati Drut laya, fast beat i.e. playing bole eight times.
A few examples:
Vilambit Laya (GUN1): 1 | 2 | 3 | 4
Madhyam Laya (GUN2): 12 | 34 | 12 | 34
Drut Laya (GUN4): 1234 | 1234 | 1234 | 1234
Ati Drut Laya (GUN8): 12341234 | 12341234 | 12341234 | 12341234
GUN1: te | re | khe | ta
GUN2: tere | kheta | tere | kheta
GUN4: terekheta | terekheta | terekheta | terekheta
GUN8: terekhetaterekheta | terekhetaterekheta | terekhetaterekheta | terekhetaterekheta$t$),
    (1, 'Lesson 4: Hatuthi Mantras', null, $t$HA 1: ghe ne re
HA1a – Translation:
jha | ghenere | ghena | jha
ghenere | ghena | jha | ghena$t$),
    (1, 'Lesson 5: Tehais', null, $t$1. ta ta ghi ta ta ghi ta ta
2. tere kheta jha
   tere kheta jha
   tere kheta
3. kheta kheta jha
   kheta kheta jha
   kheta kheta
4. khetere kheta jha
   khetere kheta jha
   khetere kheta
5. tere kheta ghena ghena dheyya
   tere kheta ghena ghena dheyya
   tere kheta ghena ghena$t$),
    (1, 'Lesson 6: Matan', null, $t$1. dhei da dhei ta kheta kheta
2. dheiya ta kheta tak dhena kheta
3. dhei tat da ta khi tat da ta khi tat da gida gida
4. dhey tadhey tadhey dhadha dhadha khi
5. dhei ta thei tak ta thei tak ta thei tak da da da
6. ja ja jhena jhena ja jhena jhenow_ ta ta thena thena ta thena thenow_
7. ja jhena jhenow_ ta thena thenow_
8. ta ghi ta ghi taghighi ta ghi
9. dha khi ta khi takhikhi ta khi takhikhi ta khi ta ghi ta ghi$t$),
    (1, 'Lesson 7: Taal (Slow Tempo)', null, $t$1. Das Pahira Taal
   khik_khi neda ghida ghida    dhei tere tat tere tere tere
   Kaharaba Taal: dha ta khi ta gha dhin
   Variation: dha ghe ta khi ta gha dhin
2. Bhajani Taal
   ghe ta gheghe ta khikhi ta khi khi ta
3. Kaharba Lohara Easy Variation 1 and 2
   dha – – khi | na ghe dhin –
   takhe – – khi | na ghe dhin –$t$),
    (1, 'Lesson 8: Dvaras', null, $t$1. tak tak tak tak
   tak gdhin tak
2. dhin tak dhin
   tak gdhin tak
3. dhadhey dhadhey dhaterekheta dhadha
4. tak tak tak tak
   ta khi ta khi tak$t$),
    (1, 'Lesson 9: Easy Variation - Kirtan Application', null, $t$Kirtan:
Hare Krishna
Hare Krishna
Krishna Krishna
Hare Hare
Hare Rama
Hare Rama
Rama Rama
Hare Hare$t$),
    (1, 'Bonus Hand Practice Mantras', null, $t$jha --  ta ghi te re ghe ta  ghe na ghe na
ti ghi ta ghi te re ghe ta  ghe na ghe na
jha --  ta khi te re khe ta  khe na khe na
ti khi ta khi te re khe ta  khe na khe na

jha --  ta ghi te re ghe ta
ti ghi ta ghi te re ghe ta
ghe ta ta ghi tere ghe ta
ghe ne* ne re ghe na ghe da

jha --  ta khi te re khe ta
ti khi ta khi te re khe ta
khe ta ta khi tere kheta
khe ne* ne re kne na khe ta$t$),
    -- Intermediate: "Hand and Finger Technique Practice (Mantras)", Draft V1, in the team's Section 1.
    (2::smallint, 'Notations', v_core, $t$Right hand side: ta – I;  te – III;  ri – I;  ti – II
Left hand side: khe – ●;  ga – O;  ge – ● (like khe at the left side top end);  gam – ga -> ge
Both sides: Dha = ga + ta;  Dhe = ga + te;  Dhar = ge + ta;  Dher = ge + te;  Dham = gam + ta;  Dhem = gam + te
In the team's draft te, ri and ti are underlined; see the draft notes below.$t$),
    (2, 'Right-hand exercise in Dadra Taal', v_core, $t$Te Ta Ta | Te Ta Ta || Te Ta Ta | Te TeTe TaTa$t$),
    (2, 'Right-hand exercise in Keharwa Taal', v_core, $t$Te Ta Te Ta | Te Ta Te Ta || Te Ta Te Ta | TeTa TeTa Te Ta$t$),
    (2, 'Right-hand exercises in Double Keharwa Taal (D-Keharwa)', v_core, $t$Te – TaTa | Te – TaTa || Te – TaTa | TeTe TaTa$t$),
    (2, 'Exercises in Garba Taal', v_core, $t$Te Ta | Ta Te | Ta – ||
Te Ta | Ta Te | Ta – ||
Te Ta | Ta Te | Ta – ||
Te Ta | Ta Te | Ta Ta$t$),
    (2, 'Left-hand exercise 1', v_core, $t$Ga – – Ge | – Ga Ga –$t$),
    (2, 'Left-hand exercise 2', v_core, $t$Ge – (Ga) Ga Ge | Ga – – –$t$),
    (2, 'Exercise for both hands – 1', v_core, $t$Te TaTa Te TaTa | Te TaTa Te TaTa ||
GeTe TaTa GeTe TaTa | GeTe TaTa GeTe TaTa$t$),
    (2, 'Exercise for both hands – 2', v_core, $t$Ga TaGe TeTa GeTe | TaGe TeTa GeTa GeTe ||
Ga TaGa TeTa GaTe | TaGa TeTa GaTa GaTe$t$),
    (2, 'Hand Practice Mantra taught by Srila Prabhupada', v_core, $t$ki ti ta –
ki ti ta –
ki ti ta –
ki ta – –
gi ti ta –
gi ti ta –
gi ti ta –
gi ta – –
Notations: ki – ● (left closed – bigger side);  gi – O (left open – bigger side);  ti – lll (three fingers closed – right side);  ta – l (index finger open sound – right side)$t$),
    -- The team's Section 2 is named in the proposal; its lessons are not written yet.
    (2, 'Ārati Mantras', v_seva, $t$The team will add this lesson (Intermediate proposal, Section 2).$t$),
    (2, 'Kīrtana Mantras', v_seva, $t$The team will add this lesson (Intermediate proposal, Section 2).$t$)
  loop
    if not exists (select 1 from syllabus_items where level_id = v_level and title = v_title) then
      insert into syllabus_items (level_id, title, description, section) values (v_level, v_title, v_text, v_section);
    end if;
  end loop;

  -- 3. The team's pages as PDF materials (approved by the Guru whose folder holds the file).
  for v_file, v_level, v_title, v_text, v_name in values
    ('31a485c1-db1d-42f1-b621-18c4a71f84b1', 1::smallint, null::text, 'Beginner class notes (team''s working copy)', 'Beginner Level Lesson Plan.pdf'),
    ('a655b1d1-e265-4c3a-905a-1b9649fc73d9', 1, 'Lesson 1: Varnas', 'Lesson 1 notes with the notation (team''s page)', 'Beginner Lesson 1 notes.pdf'),
    ('19901dcb-6292-40bd-9375-220241c43f24', 1, 'Lesson 2: Hastha Sadhana Mantras', 'Lesson 2 notes with the notation (team''s pages)', 'Beginner Lesson 2 notes.pdf'),
    ('fdd16072-12d8-482d-9419-7fb6c89098f2', 1, 'Lesson 3: Three Levels of Speed Practice', 'Lesson 3 notes (team''s page)', 'Beginner Lesson 3 notes.pdf'),
    ('8ab57e6f-393c-43a5-a742-179fe1f2feed', 1, 'Lesson 4: Hatuthi Mantras', 'Lesson 4 notes with the notation (team''s page)', 'Beginner Lesson 4 notes.pdf'),
    ('999eba97-cb94-4158-8cea-7060a8b75e19', 2, 'Notations', 'Hand practice mantras: draft notes (team''s draft V1)', 'Intermediate Hand Practice Mantras Draft V1.pdf')
  loop
    v_path := null;
    select o.name, (o.metadata ->> 'size')::bigint into v_path, v_size
      from storage.objects o
     where o.bucket_id = 'material-files' and o.name like '%/' || v_file || '.pdf'
     order by o.created_at limit 1;
    if v_path is null then
      raise notice 'syllabus_beginner_test.sql: file % (%) is not uploaded; its material is skipped', v_file, v_name;
      continue;
    end if;
    if exists (select 1 from materials where storage_path = v_path) then continue; end if;
    v_item := null;
    if v_title is not null then
      select id into v_item from syllabus_items where level_id = v_level and title = v_title;
    end if;
    v_owner := split_part(v_path, '/', 1)::uuid;
    insert into materials (title, kind, storage_path, file_name, file_size, level_id, item_id, uploaded_by, approved_by)
    values (v_text, 'pdf', v_path, v_name, v_size, v_level, v_item, v_owner,
            case when exists (select 1 from profiles where id = v_owner and role = 'guru') then v_owner end);
  end loop;
end $$;

commit;
