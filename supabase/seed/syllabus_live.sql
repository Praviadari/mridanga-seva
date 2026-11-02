-- Mridanga Seva — the team's Beginner and Intermediate syllabus for the LIVE project (docs/DECISIONS.md #784; team
-- mail 29-10-2026; notation key agreed 02-11-2026, docs/NOTATION.md, #782).
-- The same lessons and C/O marks as the TEST seed (supabase/seed/syllabus_beginner_test.sql), without TEST's PDF pages,
-- storage paths or example items. Paste it in the LIVE project's SQL editor ONLY on the lead's word. Needs 0072.
-- Safe to run twice: an item is added once (same level and title); an item already there is left as it is (the
-- Guru's edits in the app win) and named in a notice. It retires nothing, deletes nothing and adds no materials.
-- The lesson list below is copied from the TEST seed (step 2): change the text there, then copy it here.

-- Guard: refuses the TEST project (seed.sql's fictional example.com students live only there).
do $$
begin
  if exists (select 1 from students where lower(email) like '%@example.com') then
    raise exception 'syllabus_live.sql refused: this looks like the TEST project (seed.sql''s example students are here). On TEST run syllabus_beginner_test.sql. Nothing was changed.';
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.syllabus_items'::regclass and attname = 'section' and not attisdropped) then
    raise exception 'syllabus_live.sql refused: run migration 0072 first. Nothing was changed.';
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
  v_added   int := 0;
begin
  -- The team's items, in teaching order, each at the end of its level; each added once.
  for v_level, v_title, v_section, v_text in values
    (1::smallint, 'Lesson 1: Varnas', null::text, $t$Smaller side varnas: 1. te IIIIC  2. re /  3. ta IIIIO
Bigger side varnas: 4. khe ●  5. ga O  6. ge ▲
Combo varnas: 7. jha O+IIIIO  8. tak ●+IIIIO
Key: I = one finger of the right hand, then C = closed or O = open (IIIIC = four fingers closed, IIIIO = four fingers open). Left hand: ● khe (closed), O ga (open), ▲ ge. / = re. + = played together.$t$),
    (1, 'Lesson 2: Hastha Sadhana Mantras', null, $t$Bhija mantra: te re khe ta = IIIIC / ● IIIIO
Marks: tere IIIIC/  kheta ●IIIIO  jere (O+IIIIO)/  ghena OIIIIO  tikhi IIIIC●  takhi IIIIO●  khene ●/
HS1 – 16 Matras: tere kheta tere kheta | tere tere tere kheta | jere ghena jere ghena | jere jere jere ghena
HS2 – 16 Matras: tere kheta tere kheta | tere tere tere kheta | tikhi takhi tere kheta | kheta takhi tere kheta
(HS2: the team's page marks the first kheta of the last line ●/.)
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
Left-hand exercise 2: ge – (ga) ga ge | ga – – –
Key (Lesson 1): I = one finger, C = closed, O = open.$t$),
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
    (1, 'Lesson 4: Hatuthi Mantras', null, $t$HA 1: ghe ne re = O IIIIC /
HA1a – Translation:
jha | ghenere | ghena | jha
O+IIIIO | OIIIIC/ | OIIIIO | O+IIIIO
ghenere | ghena | jha | ghena
OIIIIC/ | OIIIIO | O+IIIIO | OIIIIO
Key: I = one finger, C = closed, O = open; ● khe, O ga, ▲ ge; / re; + together.$t$),
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
    (2::smallint, 'Notations', v_core, $t$Right hand side: ta – IO;  te – IIIC;  ri – IC;  ti – IIC
Left hand side: khe – ●;  ga – O;  ge – ● (like khe at the left side top end);  gam – ga -> ge
Both sides: Dha = ga + ta;  Dhe = ga + te;  Dhar = ge + ta;  Dher = ge + te;  Dham = gam + ta;  Dhem = gam + te
Key: I = one finger of the right hand, then C = closed or O = open (IIIC = three fingers closed, IO = index finger open). The finger count belongs to each mantra: te is IIIIC in the Beginner lessons, IIIC here.$t$),
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
Notations: ki – ● (left closed – bigger side);  gi – O (left open – bigger side);  ti – IIIC (three fingers closed – right side);  ta – IO (index finger open sound – right side)$t$),
    -- The team's Section 2 is named in the proposal; its lessons are not written yet.
    (2, 'Ārati Mantras', v_seva, $t$The team will add this lesson (Intermediate proposal, Section 2).$t$),
    (2, 'Kīrtana Mantras', v_seva, $t$The team will add this lesson (Intermediate proposal, Section 2).$t$)
  loop
    if exists (select 1 from syllabus_items where level_id = v_level and title = v_title) then
      raise notice 'syllabus_live.sql: "%" is already in level % and is left as it is', v_title, v_level;
    else
      insert into syllabus_items (level_id, title, description, section) values (v_level, v_title, v_text, v_section);
      v_added := v_added + 1;
    end if;
  end loop;
  raise notice 'syllabus_live.sql: % items added', v_added;
end $$;

commit;

-- Read-back: Beginner 10 items (Lesson 1 … Bonus), Intermediate 12 (10 in Section 1, 2 in Section 2), in order.
select l.name as level, s.sort, s.section, s.title, left(s.description, 50) as starts_with,
       char_length(s.description) as chars, s.retired_at is not null as retired
  from syllabus_items s join levels l on l.id = s.level_id
 where s.level_id in (1, 2)
 order by s.level_id, s.sort;
