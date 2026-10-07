-- Mridanga Seva — 0036: account creation and new-student details (team MoM 05-10-2026).
-- Run once, after 0035, in the Supabase SQL editor (TEST first). Additive: no column or function the
-- published app uses changes its meaning, so old builds keep working; a new build on a database
-- without 0036 hides the new fields (it gets PGRST202 for the new functions).
-- Why: docs/DECISIONS.md #162-#167. How: docs/DATABASE.md "Account creation and About you (0036)".
--
-- 1. choice_options: the option lists (gender, how they heard of us, education / occupation, service
--    areas, relation of an emergency contact, instruments to learn) as data the Guru edits, en/te/hi.
-- 2. centres.city, profiles.gender, profiles.referral_code, students.gender.
-- 3. person_details: what a person tells about themselves ("About you") or the desk records.
-- 4. Sign-up: handle_new_user keeps the date of birth, gender, centre, mobile number, Diksha name and
--    instruments of interest sent with the sign-up (team list of 07-10-2026);
--    sign_up_choices() is the one function anon may run (public centre and gender lists only).
-- 5. About you: my_about(), save_about_me(); the desk: save_student_details(), waiting_sign_ups().
-- 6. Coordinator auto-assignment by gender, referral code and load; an inbox notice to the Guru
--    when no coordinator of the same gender is free.
-- 7. Report: heard_about_report() — how people found the class.
-- Face scan and blood group are NOT here (#167).

-- ---------------------------------------------------------------- 1. option lists
create table choice_options (
  id        bigint generated always as identity primary key,
  list      text not null check (list in ('gender', 'source', 'occupation', 'service_area', 'relation', 'instrument')),
  code      text not null check (code ~ '^[a-z][a-z0-9_]{0,39}$'),
  label_en  text not null check (char_length(label_en) between 1 and 80),
  label_te  text check (char_length(label_te) between 1 and 80),
  label_hi  text check (char_length(label_hi) between 1 and 80),
  sort      smallint not null default 100 check (sort between 0 and 9999),
  active    boolean not null default true,
  created_at timestamptz not null default now(),
  unique (list, code)
);

insert into choice_options (list, code, label_en, label_te, label_hi, sort) values
  ('gender', 'male', 'Male', 'పురుషుడు', 'पुरुष', 10),
  ('gender', 'female', 'Female', 'స్త్రీ', 'महिला', 20),
  ('source', 'friend_family', 'Friend or family', 'స్నేహితులు లేదా కుటుంబం', 'दोस्त या परिवार', 10),
  ('source', 'temple', 'Temple programme', 'ఆలయ కార్యక్రమం', 'मंदिर का कार्यक्रम', 20),
  ('source', 'kirtan', 'Kirtan event', 'కీర్తన కార్యక్రమం', 'कीर्तन कार्यक्रम', 30),
  ('source', 'instagram', 'Instagram', 'ఇన్‌స్టాగ్రామ్', 'इंस्टाग्राम', 40),
  ('source', 'youtube', 'YouTube', 'యూట్యూబ్', 'यूट्यूब', 50),
  ('source', 'whatsapp', 'WhatsApp', 'వాట్సాప్', 'व्हाट्सऐप', 60),
  ('source', 'website', 'Website', 'వెబ్‌సైట్', 'वेबसाइट', 70),
  ('source', 'poster', 'Poster', 'పోస్టర్', 'पोस्टर', 80),
  ('source', 'other', 'Other', 'ఇతర', 'अन्य', 999),
  ('occupation', 'school_student', 'School student', 'పాఠశాల విద్యార్థి', 'स्कूल का छात्र', 10),
  ('occupation', 'college_student', 'College student', 'కళాశాల విద్యార్థి', 'कॉलेज का छात्र', 20),
  ('occupation', 'working', 'Working', 'ఉద్యోగం', 'नौकरी', 30),
  ('occupation', 'business', 'Business', 'వ్యాపారం', 'व्यवसाय', 40),
  ('occupation', 'homemaker', 'Homemaker', 'గృహిణి', 'गृहिणी', 50),
  ('occupation', 'retired', 'Retired', 'పదవీ విరమణ', 'सेवानिवृत्त', 60),
  ('occupation', 'other', 'Other', 'ఇతర', 'अन्य', 999),
  ('service_area', 'kirtan', 'Kirtan', 'కీర్తన', 'कीर्तन', 10),
  ('service_area', 'prasadam', 'Prasadam / cooking', 'ప్రసాదం / వంట', 'प्रसादम / रसोई', 20),
  ('service_area', 'cleaning', 'Cleaning', 'శుభ్రపరచడం', 'सफ़ाई', 30),
  ('service_area', 'deity_decoration', 'Deity decoration', 'విగ్రహ అలంకరణ', 'विग्रह श्रृंगार', 40),
  ('service_area', 'book_distribution', 'Book distribution', 'పుస్తక పంపిణీ', 'पुस्तक वितरण', 50),
  ('service_area', 'media', 'Media / photos', 'మీడియా / ఫోటోలు', 'मीडिया / फ़ोटो', 60),
  ('service_area', 'teaching', 'Teaching', 'బోధన', 'पढ़ाना', 70),
  ('service_area', 'events', 'Events', 'కార్యక్రమాలు', 'कार्यक्रम', 80),
  ('service_area', 'tech', 'Tech', 'టెక్నాలజీ', 'तकनीक', 90),
  ('service_area', 'driving', 'Driving', 'డ్రైవింగ్', 'ड्राइविंग', 100),
  ('service_area', 'other', 'Other', 'ఇతర', 'अन्य', 999),
  ('relation', 'mother', 'Mother', 'తల్లి', 'माँ', 10),
  ('relation', 'father', 'Father', 'తండ్రి', 'पिता', 20),
  ('relation', 'guardian', 'Other guardian', 'ఇతర సంరక్షకులు', 'अन्य अभिभावक', 30),
  ('relation', 'spouse', 'Spouse', 'జీవిత భాగస్వామి', 'जीवनसाथी', 40),
  ('relation', 'other', 'Other', 'ఇతర', 'अन्य', 999),
  -- "Interested in learning" (team list of 07-10-2026); "All" is a tick in the app that ticks every one.
  ('instrument', 'mridanga', 'Mṛdaṅga', 'మృదంగం', 'मृदंग', 10),
  ('instrument', 'kartal', 'Kartāl', 'కరతాళాలు', 'करताल', 20),
  ('instrument', 'harmonium', 'Harmonium', 'హార్మోనియం', 'हारमोनियम', 30);

-- True when `code` is an option of `list` (an inactive one only when p_any).
create or replace function option_ok(p_list text, p_code text, p_any boolean default false) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from choice_options o
                  where o.list = p_list and o.code = p_code and (p_any or o.active))
$$;

-- Error codes for the Guru's edits (G12 option lists, src/data/options.ts):
--   option_code_locked   the list and code of an option never change (rows point at the code)
--   label_invalid        a label is 1-80 characters without control or invisible characters
--   option_in_use        an option somebody chose cannot be deleted; switch it off instead
--   option_required      male/female, the parent relations and "other" stay (switch off only)
create or replace function guard_choice_option() returns trigger
language plpgsql set search_path = public as $$
declare
  v_label text;
begin
  if tg_op = 'DELETE' then
    if (old.list = 'gender' and old.code in ('male', 'female'))
       or (old.list = 'relation' and old.code in ('mother', 'father', 'guardian')) or old.code = 'other' then
      raise exception 'option_required' using detail = 'This option is used by the app''s rules; switch it off instead.';
    end if;
    if exists (select 1 from profiles where old.list = 'gender' and gender = old.code)
       or exists (select 1 from students where old.list = 'gender' and gender = old.code)
       or exists (select 1 from person_details d where
            (old.list = 'source' and d.heard_via = old.code) or (old.list = 'occupation' and d.occupation = old.code)
         or (old.list = 'service_area' and old.code = any (d.service_areas))
         or (old.list = 'relation' and d.emergency_relation = old.code)
         or (old.list = 'instrument' and old.code = any (d.learn_interests))) then
      raise exception 'option_in_use' using detail = 'Somebody chose this option; switch it off instead.';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and (new.list is distinct from old.list or new.code is distinct from old.code) then
    raise exception 'option_code_locked';
  end if;
  new.label_en := btrim(coalesce(new.label_en, ''), E' \t\r\n');
  new.label_te := nullif(btrim(coalesce(new.label_te, ''), E' \t\r\n'), '');
  new.label_hi := nullif(btrim(coalesce(new.label_hi, ''), E' \t\r\n'), '');
  foreach v_label in array array[new.label_en, coalesce(new.label_te, 'x'), coalesce(new.label_hi, 'x')] loop
    if v_label = '' or char_length(v_label) > 80
       or v_label ~ '[\u0001-\u001f\u007f-\u009f\u200b\u200e\u200f\u2028-\u202e\u2060-\u2064\ufeff]' then
      raise exception 'label_invalid' using detail = 'A label is 1 to 80 characters without invisible characters.';
    end if;
  end loop;
  return new;
end $$;
create trigger choice_options_guard before insert or update or delete on choice_options
  for each row execute function guard_choice_option();
create trigger audit_choice_options after insert or update or delete on choice_options
  for each row execute function audit_row();

-- Students and staff read the lists (the forms); a waiting login gets them through my_about()
-- and a visitor the gender list through sign_up_choices(). Only the Guru writes.
alter table choice_options enable row level security;
create policy class_read on choice_options for select to authenticated using (has_class_role());
create policy guru_insert on choice_options for insert to authenticated with check (is_guru());
create policy guru_update on choice_options for update to authenticated using (is_guru()) with check (is_guru());
create policy guru_delete on choice_options for delete to authenticated using (is_guru());
revoke all on choice_options from public, anon, authenticated;
grant select, insert, update, delete on choice_options to authenticated;

-- ---------------------------------------------------------------- 2. new columns
-- The city groups centres in the sign-up's country → city → centre choice (the MoM's "region").
alter table centres add column city text check (char_length(city) between 1 and 60);

-- A person's gender (an option code): the Guru sets it for staff on G2; a new login gives it at
-- sign-up. Coordinators are matched with students of the same gender (#165).
alter table profiles add column gender text;
-- A short code each coordinator (and the Guru) can give to people they bring; the person types
-- it under "How did you hear about us?". Never a list of names (#165).
alter table profiles add column referral_code text unique check (referral_code ~ '^[A-HJ-NP-Z2-9]{6}$');
alter table students add column gender text;

-- Error codes for app users (G2, A3):
--   gender_unknown        not an active option of the gender list
--   not_allowed           only the Guru sets another person's gender; a person their own while
--                         still waiting for a role (a student's gender is on the student record)
--   profile_field_locked  the referral code is made by the database
create or replace function guard_profile_people() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if new.referral_code is distinct from old.referral_code then
    raise exception 'profile_field_locked' using detail = 'referral_code: made by the database.';
  end if;
  if new.gender is distinct from old.gender then
    if not (is_guru() or (new.id = auth.uid() and old.role = 'pending')) then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    if new.gender is not null and not option_ok('gender', new.gender) then
      raise exception 'gender_unknown';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_people_guard before update on profiles
  for each row execute function guard_profile_people();

-- Six letters and digits without the look-alikes I, O, 0 and 1.
create or replace function new_referral_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from profiles where referral_code = v_code);
  end loop;
  return v_code;
end $$;

-- Staff get a code when they become staff (runs after profiles_people_guard: name order). Security
-- definer: the code must be unique over every profile, whatever the person giving the role may read.
create or replace function give_referral_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role in ('guru', 'coordinator') and new.referral_code is null then
    new.referral_code := new_referral_code();
  end if;
  return new;
end $$;
create trigger profiles_referral_code before insert or update of role on profiles
  for each row execute function give_referral_code();
update profiles set referral_code = new_referral_code()
 where role in ('guru', 'coordinator') and referral_code is null;

-- A student's gender: an option code, checked for app users (staff write it through
-- save_student_details; the dashboard is not stopped).
create or replace function guard_student_gender() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') or new.gender is null then return new; end if;
  if tg_op = 'UPDATE' and new.gender is not distinct from old.gender then return new; end if;
  if not option_ok('gender', new.gender) then raise exception 'gender_unknown'; end if;
  return new;
end $$;
create trigger students_gender_guard before insert or update of gender on students
  for each row execute function guard_student_gender();

-- ---------------------------------------------------------------- 3. person_details
-- One row per person: before a student record exists it hangs on the login (profile_id); the
-- desk's records without a login hang on the student (student_id); a linked student has both.
-- Each column has a purpose stated in the privacy notice (docs/DECISIONS.md #164).
create table person_details (
  id                  bigint generated always as identity primary key,
  profile_id          uuid unique references profiles (id) on delete cascade,
  student_id          uuid unique references students (id) on delete cascade,
  dob                 date,
  emergency_relation  text,
  emergency_name      text check (char_length(emergency_name) between 1 and 80),
  emergency_phone     text check (emergency_phone ~ '^\+[1-9][0-9]{6,14}$'),
  heard_via           text,
  referred_by         uuid references profiles (id) on delete set null,
  heard_other         text check (char_length(heard_other) between 1 and 80),
  occupation          text,
  occupation_other    text check (char_length(occupation_other) between 1 and 80),
  service_areas       text[] not null default '{}' check (cardinality(service_areas) <= 20),
  service_other       text check (char_length(service_other) between 1 and 80),
  diksha_name         text check (char_length(diksha_name) between 1 and 80),
  learn_interests     text[] not null default '{}' check (cardinality(learn_interests) <= 20),
  about_state         text check (about_state in ('skipped', 'done')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references profiles (id) on delete set null,
  check (profile_id is not null or student_id is not null)
);
create index person_details_referred_idx on person_details (referred_by);
create trigger audit_person_details after insert or update or delete on person_details
  for each row execute function audit_row();

-- The Guru reads them directly; coordinators through get_student_details (C8) and waiting_sign_ups
-- (C2), which write each read to the access log once 0034 is on the database, as for a parent's
-- contact (0034, briefs 6/6b); a person reads their own through my_about(). Nobody writes directly:
-- save_about_me, save_student_details and the sign-up trigger do, as the owner.
alter table person_details enable row level security;
create policy guru_read on person_details for select to authenticated using (is_guru());
revoke all on person_details from public, anon, authenticated;
grant select on person_details to authenticated;

-- ---------------------------------------------------------------- 4. sign-up
-- As in 0032, plus what the sign-up form sends (#162): dob (YYYY-MM-DD; an adult's only — under 18
-- signs up at the desk, #150), gender (an active option), centre_id (an active centre), phone (E.164),
-- diksha_name (the initiated name, optional) and learn (instrument option codes).
-- Anything else is ignored: a sign-up never fails because of these fields.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_meta   jsonb := coalesce(new.raw_user_meta_data, '{}');
  v_lang   text := v_meta ->> 'language';
  v_gender text := v_meta ->> 'gender';
  v_centre int;
  v_dob    date;
  v_phone  text := regexp_replace(coalesce(v_meta ->> 'phone', ''), '[\s-]', '', 'g');
  v_diksha text := nullif(left(btrim(coalesce(v_meta ->> 'diksha_name', ''), E' \t\r\n'), 80), '');
  v_learn  text[];
begin
  begin
    v_dob := (v_meta ->> 'dob')::date;
    if v_dob > current_date or v_dob < date '1900-01-01' or v_dob > current_date - interval '18 years' then
      v_dob := null;
    end if;
  exception when others then v_dob := null;
  end;
  begin
    v_centre := (v_meta ->> 'centre_id')::int;
  exception when others then v_centre := null;
  end;
  if v_centre is not null and not exists (select 1 from centres where id = v_centre and active) then
    v_centre := null;
  end if;
  if v_gender is not null and not option_ok('gender', v_gender) then v_gender := null; end if;
  if v_phone !~ '^\+[1-9][0-9]{6,14}$' then v_phone := null; end if;
  if v_diksha ~ '[\u0001-\u001f\u007f-\u009f\u200b\u200e\u200f\u2028-\u202e\u2060-\u2064\ufeff]' then v_diksha := null; end if;
  if jsonb_typeof(v_meta -> 'learn') = 'array' then
    select coalesce(array_agg(distinct x), '{}') into v_learn
      from jsonb_array_elements_text(v_meta -> 'learn') x where option_ok('instrument', x);
  end if;

  insert into profiles (id, email, full_name, role, language, gender, centre_id, phone)
  values (new.id, new.email, left(btrim(coalesce(v_meta ->> 'full_name', '')), 80), 'pending',
          case when v_lang in ('en', 'te', 'hi') then v_lang else 'en' end, v_gender,
          coalesce(v_centre, (select min(id) from centres where active), 1), v_phone);
  if v_dob is not null or v_diksha is not null or cardinality(v_learn) > 0 then
    insert into person_details (profile_id, dob, diksha_name, learn_interests)
    values (new.id, v_dob, v_diksha, coalesce(v_learn, '{}'));
  end if;
  if new.email_confirmed_at is not null then
    perform link_login_to_student(new.id, new.email);
  end if;
  return new;
end $$;

-- The one function a visitor (anon) may run: the active centres (name, city, country; no address,
-- position or hours), the gender options and the instruments, for the sign-up form (#163).
create or replace function sign_up_choices() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'centres', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'city', c.city,
                                                             'country_code', c.country_code) order by c.name)
                           from centres c where c.active), '[]'),
    'genders', coalesce((select jsonb_agg(jsonb_build_object('code', o.code, 'en', o.label_en, 'te', o.label_te,
                                                             'hi', o.label_hi) order by o.sort, o.id)
                           from choice_options o where o.list = 'gender' and o.active), '[]'),
    'instruments', coalesce((select jsonb_agg(jsonb_build_object('code', o.code, 'en', o.label_en, 'te', o.label_te,
                                                                 'hi', o.label_hi) order by o.sort, o.id)
                               from choice_options o where o.list = 'instrument' and o.active), '[]'))
$$;

-- ---------------------------------------------------------------- link: details follow the login
-- When a login is linked to a student record, its details row moves to the record (a record that
-- has its own row keeps its answers and takes only the missing ones), the sign-up date of birth is
-- dropped (the record's own is the one kept) and the login's gender fills an empty one. When the
-- login is taken off, the row stays with the record.
create or replace function attach_person_details() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d person_details;
begin
  if tg_op = 'UPDATE' and old.profile_id is not null and old.profile_id is distinct from new.profile_id then
    update person_details set profile_id = null where student_id = new.id and profile_id = old.profile_id;
  end if;
  if new.profile_id is null or (tg_op = 'UPDATE' and new.profile_id is not distinct from old.profile_id) then
    return null;
  end if;
  select * into d from person_details where profile_id = new.profile_id and student_id is null;
  if found then
    if exists (select 1 from person_details where student_id = new.id) then
      update person_details t set
        emergency_relation = coalesce(t.emergency_relation, d.emergency_relation),
        emergency_name = coalesce(t.emergency_name, d.emergency_name),
        emergency_phone = coalesce(t.emergency_phone, d.emergency_phone),
        heard_via = coalesce(t.heard_via, d.heard_via),
        referred_by = coalesce(t.referred_by, d.referred_by),
        heard_other = coalesce(t.heard_other, d.heard_other),
        occupation = coalesce(t.occupation, d.occupation),
        occupation_other = coalesce(t.occupation_other, d.occupation_other),
        service_areas = case when cardinality(t.service_areas) = 0 then d.service_areas else t.service_areas end,
        service_other = coalesce(t.service_other, d.service_other),
        diksha_name = coalesce(t.diksha_name, d.diksha_name),
        learn_interests = case when cardinality(t.learn_interests) = 0 then d.learn_interests else t.learn_interests end,
        about_state = coalesce(t.about_state, d.about_state),
        updated_at = now()
       where t.student_id = new.id;
      delete from person_details where id = d.id;
      update person_details set profile_id = new.profile_id where student_id = new.id;
    else
      update person_details set student_id = new.id, dob = null, updated_at = now() where id = d.id;
    end if;
  end if;
  update students s set gender = p.gender
    from profiles p
   where s.id = new.id and p.id = new.profile_id and s.gender is null and p.gender is not null;
  return null;
end $$;
create trigger students_attach_details after insert or update of profile_id on students
  for each row execute function attach_person_details();

-- ---------------------------------------------------------------- 6. coordinator auto-assignment
-- Inbox notices of this migration (the app opens the student's page). No push: the Edge Function
-- sends only the screens it knows; the inbox (A2) shows these on every device.
create or replace function people_notice_line(p_kind text, p_lang text, p_name text) returns text
language sql immutable set search_path = public as $$
  select case p_kind
    when 'no_mentor' then case p_lang
      when 'te' then p_name || ' కోసం అదే లింగానికి చెందిన కోఆర్డినేటర్ లేరు. దయచేసి మెంటార్‌ను ఎంచుకోండి.'
      when 'hi' then p_name || ' के लिए उसी लिंग का कोई कोऑर्डिनेटर नहीं है। कृपया मेंटर चुनें।'
      else 'No coordinator of the same gender for ' || p_name || '. Please choose a mentor.' end
    when 'new_mentee' then case p_lang
      when 'te' then 'మీరు ఇప్పుడు ' || p_name || ' కి మెంటార్.'
      when 'hi' then 'अब आप ' || p_name || ' के मेंटर हैं।'
      else 'You are now the mentor of ' || p_name || '.' end
  end
$$;

create or replace function people_notice_title(p_kind text, p_lang text) returns text
language sql immutable set search_path = public as $$
  select case p_kind
    when 'no_mentor' then case p_lang when 'te' then 'మెంటార్ అవసరం' when 'hi' then 'मेंटर चाहिए' else 'Mentor needed' end
    else case p_lang when 'te' then 'కొత్త విద్యార్థి' when 'hi' then 'नया विद्यार्थी' else 'New mentee' end
  end
$$;

-- Gives a student without a mentor a coordinator of the same gender (#165):
--   1. the coordinator (or the Guru) whose referral code the person gave, when the gender matches;
--   2. else the active coordinator of the student's home centre with that gender and the fewest
--      students in class (not Left, not withdrawn); ties go to the one who became staff first.
-- Nobody: the mentor stays empty and the active Gurus get an inbox notice (once a day per student).
-- Returns the mentor given, or null. A student with a mentor, without a gender, Left or withdrawn
-- is left alone. Internal (triggers).
create or replace function assign_mentor(p_student uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s        students;
  v_ref    uuid;
  v_mentor uuid;
  v_url    text;
begin
  select * into s from students where id = p_student;
  if not found or s.mentor_id is not null or s.gender is null or s.status = 'left' or s.withdrawn_at is not null then
    return null;
  end if;
  select d.referred_by into v_ref from person_details d where d.student_id = p_student;
  if v_ref is not null and exists (select 1 from profiles p where p.id = v_ref and p.active
                                     and p.role in ('guru', 'coordinator') and p.gender = s.gender) then
    v_mentor := v_ref;
  else
    select p.id into v_mentor
      from profiles p
     where p.role = 'coordinator' and p.active and p.gender = s.gender and p.centre_id = s.home_centre_id
     order by (select count(*) from students x
                where x.mentor_id = p.id and x.status <> 'left' and x.withdrawn_at is null), p.created_at, p.id
     limit 1;
  end if;
  v_url := '/staff/students/' || p_student;
  if v_mentor is null then
    insert into notifications (profile_id, kind, title, body, url)
    select p.id, 'notice', people_notice_title('no_mentor', p.language),
           left(people_notice_line('no_mentor', p.language, s.full_name), 300), v_url
      from profiles p
     where p.role = 'guru' and p.active
       and not exists (select 1 from notifications n where n.profile_id = p.id and n.url = v_url
                          and n.created_at > now() - interval '1 day');
    return null;
  end if;
  update students set mentor_id = v_mentor where id = p_student and mentor_id is null;
  insert into notifications (profile_id, kind, title, body, url)
  select p.id, 'notice', people_notice_title('new_mentee', p.language),
         left(people_notice_line('new_mentee', p.language, s.full_name), 300), v_url
    from profiles p where p.id = v_mentor and p.id is distinct from auth.uid();
  return v_mentor;
end $$;

create or replace function assign_mentor_on_student() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.mentor_id is null and new.gender is not null then
    perform assign_mentor(new.id);
  end if;
  return null;
end $$;
create trigger students_assign_mentor after insert or update of gender, home_centre_id on students
  for each row execute function assign_mentor_on_student();

create or replace function assign_mentor_on_details() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.student_id is not null then perform assign_mentor(new.student_id); end if;
  return null;
end $$;
create trigger person_details_assign_mentor after insert or update of referred_by, student_id on person_details
  for each row execute function assign_mentor_on_details();

-- ---------------------------------------------------------------- 5. About you and the desk
-- Checks and writes the "about" keys of p (each key present is saved; a missing key is left as it
-- is, so the form saves as you go) into the details row d. Shared by save_about_me and
-- save_student_details. Error codes (src/data/about.ts):
--   relation_unknown, source_unknown, occupation_unknown, service_unknown   not an active option
--   name_required, name_too_long, name_invalid    the emergency contact's name (as 0028's names)
--   phone_invalid                 a phone in E.164: + and 7 to 15 digits, no leading 0
--   referral_code_unknown         no active coordinator or Guru has this code
--   text_too_long                 an "other" text is at most 80 characters
--   too_many_services             at most 20 service areas
--   instrument_unknown            not an active instrument option
create or replace function apply_about(d person_details, p jsonb, p_staff boolean) returns person_details
language plpgsql security definer set search_path = public as $$
declare
  v_text  text;
  v_code  text;
  v_list  text[];
begin
  if p ? 'emergency_relation' then
    v_code := nullif(btrim(coalesce(p ->> 'emergency_relation', '')), '');
    if v_code is not null and not option_ok('relation', v_code, v_code = d.emergency_relation) then
      raise exception 'relation_unknown';
    end if;
    d.emergency_relation := v_code;
  end if;
  if p ? 'emergency_name' then
    v_text := nullif(btrim(coalesce(p ->> 'emergency_name', ''), E' \t\r\n'), '');
    if char_length(v_text) > 80 then raise exception 'name_too_long'; end if;
    if v_text ~ '[\u0001-\u001f\u007f-\u009f\u200b\u200e\u200f\u2028-\u202e\u2060-\u2064\ufeff]' then
      raise exception 'name_invalid';
    end if;
    d.emergency_name := v_text;
  end if;
  if p ? 'emergency_phone' then
    v_text := nullif(regexp_replace(coalesce(p ->> 'emergency_phone', ''), '[\s-]', '', 'g'), '');
    if v_text !~ '^\+[1-9][0-9]{6,14}$' then raise exception 'phone_invalid'; end if;
    d.emergency_phone := v_text;
  end if;
  if p ? 'heard_via' then
    v_code := nullif(btrim(coalesce(p ->> 'heard_via', '')), '');
    if v_code is not null and v_code <> 'referral'
       and not option_ok('source', v_code, v_code = d.heard_via) then
      raise exception 'source_unknown';
    end if;
    d.heard_via := v_code;
    if v_code is distinct from 'referral' then d.referred_by := null; end if;
    if v_code is distinct from 'other' then d.heard_other := null; end if;
  end if;
  if p ? 'referral_code' then
    v_code := upper(nullif(regexp_replace(coalesce(p ->> 'referral_code', ''), '\s', '', 'g'), ''));
    if v_code is null then
      d.referred_by := null;
    else
      select id into d.referred_by from profiles
       where referral_code = v_code and active and role in ('guru', 'coordinator');
      if d.referred_by is null then raise exception 'referral_code_unknown'; end if;
      d.heard_via := 'referral';
      d.heard_other := null;
    end if;
  end if;
  if p_staff and p ? 'referred_by' then
    if p ->> 'referred_by' is null then
      d.referred_by := null;
    else
      select id into d.referred_by from profiles
       where id = (p ->> 'referred_by')::uuid and role in ('guru', 'coordinator');
      if d.referred_by is null then raise exception 'referral_code_unknown'; end if;
      d.heard_via := 'referral';
      d.heard_other := null;
    end if;
  end if;
  if p ? 'heard_other' then
    v_text := nullif(btrim(coalesce(p ->> 'heard_other', ''), E' \t\r\n'), '');
    if char_length(v_text) > 80 then raise exception 'text_too_long'; end if;
    d.heard_other := case when d.heard_via = 'other' then v_text end;
  end if;
  if p ? 'occupation' then
    v_code := nullif(btrim(coalesce(p ->> 'occupation', '')), '');
    if v_code is not null and not option_ok('occupation', v_code, v_code = d.occupation) then
      raise exception 'occupation_unknown';
    end if;
    d.occupation := v_code;
    if v_code is distinct from 'other' then d.occupation_other := null; end if;
  end if;
  if p ? 'occupation_other' then
    v_text := nullif(btrim(coalesce(p ->> 'occupation_other', ''), E' \t\r\n'), '');
    if char_length(v_text) > 80 then raise exception 'text_too_long'; end if;
    d.occupation_other := case when d.occupation = 'other' then v_text end;
  end if;
  if p ? 'service_areas' then
    if jsonb_typeof(p -> 'service_areas') is distinct from 'array' then raise exception 'service_unknown'; end if;
    select coalesce(array_agg(distinct x), '{}') into v_list from jsonb_array_elements_text(p -> 'service_areas') x;
    if cardinality(v_list) > 20 then raise exception 'too_many_services'; end if;
    foreach v_code in array v_list loop
      if not option_ok('service_area', v_code, v_code = any (d.service_areas)) then raise exception 'service_unknown'; end if;
    end loop;
    d.service_areas := v_list;
    if not ('other' = any (v_list)) then d.service_other := null; end if;
  end if;
  if p ? 'diksha_name' then
    v_text := nullif(btrim(coalesce(p ->> 'diksha_name', ''), E' \t\r\n'), '');
    if char_length(v_text) > 80 then raise exception 'name_too_long'; end if;
    if v_text ~ '[\u0001-\u001f\u007f-\u009f\u200b\u200e\u200f\u2028-\u202e\u2060-\u2064\ufeff]' then
      raise exception 'name_invalid';
    end if;
    d.diksha_name := v_text;
  end if;
  if p ? 'learn_interests' then
    if jsonb_typeof(p -> 'learn_interests') is distinct from 'array' then raise exception 'instrument_unknown'; end if;
    select coalesce(array_agg(distinct x), '{}') into v_list from jsonb_array_elements_text(p -> 'learn_interests') x;
    foreach v_code in array v_list loop
      if not option_ok('instrument', v_code, v_code = any (d.learn_interests)) then raise exception 'instrument_unknown'; end if;
    end loop;
    d.learn_interests := v_list;
  end if;
  if p ? 'service_other' then
    v_text := nullif(btrim(coalesce(p ->> 'service_other', ''), E' \t\r\n'), '');
    if char_length(v_text) > 80 then raise exception 'text_too_long'; end if;
    d.service_other := case when 'other' = any (d.service_areas) then v_text end;
  end if;
  return d;
end $$;

-- True when the student must have an emergency contact and has none: under 18 without a guardian
-- with a phone (a minor registered at the desk always has one, 0028).
create or replace function minor_without_contact(p_student uuid, d person_details) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_minor(s) from students s where s.id = p_student), false)
     and not exists (select 1 from guardians g where g.student_id = p_student and coalesce(btrim(g.phone), '') <> '')
     and (d.emergency_name is null or d.emergency_phone is null or d.emergency_relation is null)
$$;

-- The signed-in person's own details for About you (S/pending), with the option lists, as one
-- object: a waiting login reads no table, so this is its only way in. Null for staff and others.
create or replace function my_about() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_role    app_role := my_role();
  v_student students;
  d         person_details;
  v_profile profiles;
begin
  if v_role is null or v_role not in ('pending', 'student') then return null; end if;
  select * into v_profile from profiles where id = auth.uid();
  select * into v_student from students where profile_id = auth.uid();
  if v_student.id is not null then
    select * into d from person_details where student_id = v_student.id;
  else
    select * into d from person_details where profile_id = auth.uid();
  end if;
  return jsonb_build_object(
    'has_record', v_student.id is not null,
    'gender', coalesce(v_student.gender, v_profile.gender),
    'phone', coalesce(v_profile.phone, v_student.phone),
    'minor', coalesce(is_minor(v_student), false),
    'has_guardian', v_student.id is not null and exists (select 1 from guardians g where g.student_id = v_student.id),
    'country_code', centre_country(coalesce(v_student.home_centre_id, v_profile.centre_id)::int),
    'emergency_relation', d.emergency_relation, 'emergency_name', d.emergency_name,
    'emergency_phone', d.emergency_phone,
    'heard_via', d.heard_via, 'referred', d.referred_by is not null, 'heard_other', d.heard_other,
    'occupation', d.occupation, 'occupation_other', d.occupation_other,
    'service_areas', to_jsonb(coalesce(d.service_areas, '{}')), 'service_other', d.service_other,
    'diksha_name', d.diksha_name, 'learn_interests', to_jsonb(coalesce(d.learn_interests, '{}')),
    'about_state', d.about_state,
    'options', (select coalesce(jsonb_object_agg(l.list, l.items), '{}') from (
      select o.list, jsonb_agg(jsonb_build_object('code', o.code, 'en', o.label_en, 'te', o.label_te, 'hi', o.label_hi)
                               order by o.sort, o.id) as items
        from choice_options o where o.active group by o.list) l));
end $$;

-- Saves the signed-in person's own answers (About you): the keys of apply_about, plus gender (while
-- waiting for a role, or on one's own student record), phone (E.164, onto the login's profile and an
-- empty phone of the record) and about_state ('skipped' or 'done'). A waiting login or a student
-- only; staff and switched-off logins get not_allowed. Under 18 without a guardian, 'done' and
-- clearing the contact need an emergency contact (minor_needs_emergency_contact), and the contact
-- is a parent or guardian (minor_contact_relation). Returns my_about().
create or replace function save_about_me(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role    app_role := my_role();
  v_student students;
  d         person_details;
  v_text    text;
  v_state   text;
begin
  if v_role is null or v_role not in ('pending', 'student') or p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into v_student from students where profile_id = auth.uid();
  if v_student.withdrawn_at is not null then raise exception 'student_withdrawn'; end if;
  if v_student.id is not null then
    select * into d from person_details where student_id = v_student.id for update;
    if not found then
      insert into person_details (student_id, profile_id) values (v_student.id, auth.uid()) returning * into d;
    end if;
  else
    select * into d from person_details where profile_id = auth.uid() for update;
    if not found then insert into person_details (profile_id) values (auth.uid()) returning * into d; end if;
  end if;

  d := apply_about(d, p, false);
  if p ? 'about_state' then
    v_state := nullif(p ->> 'about_state', '');
    if v_state is not null and v_state not in ('skipped', 'done') then raise exception 'not_allowed' using errcode = '42501'; end if;
    -- "Done" wins over a later "skip" (a skip only means: do not open the form by itself again).
    d.about_state := case when d.about_state = 'done' and v_state = 'skipped' then 'done' else v_state end;
  end if;
  if v_student.id is not null and is_minor(v_student) then
    if d.emergency_relation is not null and d.emergency_relation not in ('mother', 'father', 'guardian') then
      raise exception 'minor_contact_relation';
    end if;
    if (d.about_state = 'done' or p ? 'emergency_name' or p ? 'emergency_phone' or p ? 'emergency_relation')
       and minor_without_contact(v_student.id, d) then
      raise exception 'minor_needs_emergency_contact';
    end if;
  end if;

  update person_details set
    emergency_relation = d.emergency_relation, emergency_name = d.emergency_name, emergency_phone = d.emergency_phone,
    heard_via = d.heard_via, referred_by = d.referred_by, heard_other = d.heard_other,
    occupation = d.occupation, occupation_other = d.occupation_other,
    service_areas = d.service_areas, service_other = d.service_other,
    diksha_name = d.diksha_name, learn_interests = d.learn_interests, about_state = d.about_state,
    updated_at = now(), updated_by = auth.uid()
   where id = d.id;

  if p ? 'phone' then
    v_text := nullif(regexp_replace(coalesce(p ->> 'phone', ''), '[\s-]', '', 'g'), '');
    if v_text !~ '^\+[1-9][0-9]{6,14}$' then raise exception 'phone_invalid'; end if;
    update profiles set phone = v_text where id = auth.uid();
    if v_student.id is not null and v_text is not null then
      update students set phone = v_text where id = v_student.id and phone is null;
    end if;
  end if;
  if p ? 'gender' then
    v_text := nullif(btrim(coalesce(p ->> 'gender', '')), '');
    if v_text is not null and not option_ok('gender', v_text) then raise exception 'gender_unknown'; end if;
    if v_student.id is not null then
      update students set gender = v_text where id = v_student.id;
    else
      update profiles set gender = v_text where id = auth.uid();
    end if;
  end if;
  return my_about();
end $$;

-- The desk and C8 (staff): the same answers for a student record, plus gender, home centre and,
-- instead of a code, the referring coordinator (referred_by). Errors as save_about_me, and
-- student_not_found, student_withdrawn, centre_unknown. Returns the details row as JSON.
create or replace function save_student_details(p_student uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_student students;
  d         person_details;
  v_text    text;
  v_centre  int;
begin
  if not is_staff() or p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into v_student from students where id = p_student for update;
  if not found then raise exception 'student_not_found'; end if;
  if v_student.withdrawn_at is not null then raise exception 'student_withdrawn'; end if;
  select * into d from person_details where student_id = p_student for update;
  if not found then
    insert into person_details (student_id, profile_id) values (p_student, v_student.profile_id) returning * into d;
  end if;
  d := apply_about(d, p, true);
  update person_details set
    emergency_relation = d.emergency_relation, emergency_name = d.emergency_name, emergency_phone = d.emergency_phone,
    heard_via = d.heard_via, referred_by = d.referred_by, heard_other = d.heard_other,
    occupation = d.occupation, occupation_other = d.occupation_other,
    service_areas = d.service_areas, service_other = d.service_other,
    diksha_name = d.diksha_name, learn_interests = d.learn_interests,
    updated_at = now(), updated_by = auth.uid()
   where id = d.id;
  if p ? 'centre' then
    v_centre := (p ->> 'centre')::int;
    if not exists (select 1 from centres where id = v_centre and active) then raise exception 'centre_unknown'; end if;
    update students set home_centre_id = v_centre where id = p_student and home_centre_id is distinct from v_centre;
  end if;
  if p ? 'gender' then
    v_text := nullif(btrim(coalesce(p ->> 'gender', '')), '');
    if v_text is not null and not option_ok('gender', v_text, v_text = v_student.gender) then
      raise exception 'gender_unknown';
    end if;
    update students set gender = v_text where id = p_student and gender is distinct from v_text;
  end if;
  select * into d from person_details where id = d.id;
  return to_jsonb(d) - 'dob' || jsonb_build_object(
    'gender', (select gender from students where id = p_student),
    'mentor_id', (select mentor_id from students where id = p_student));
end $$;

-- C2: people who signed up and wait for the desk (confirmed email, no student record, not a public
-- Ishtagoshti subscriber), newest first: what they gave at sign-up and in About you, so the
-- coordinator fills the form from it and checks the name against the ID. Staff only. A coordinator
-- sees the sign-ups of their own centre; the Guru all.
create or replace function waiting_sign_ups() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not is_staff() then null else coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'full_name', p.full_name, 'email', p.email, 'phone', p.phone, 'gender', p.gender,
             'centre_id', p.centre_id, 'dob', d.dob, 'created_at', p.created_at,
             'emergency_relation', d.emergency_relation, 'emergency_name', d.emergency_name,
             'emergency_phone', d.emergency_phone, 'heard_via', d.heard_via, 'referred_by', d.referred_by,
             'heard_other', d.heard_other, 'occupation', d.occupation, 'occupation_other', d.occupation_other,
             'service_areas', to_jsonb(coalesce(d.service_areas, '{}')), 'service_other', d.service_other,
             'diksha_name', d.diksha_name, 'learn_interests', to_jsonb(coalesce(d.learn_interests, '{}')))
           order by p.created_at desc)
      from profiles p
      join auth.users u on u.id = p.id
      left join person_details d on d.profile_id = p.id and d.student_id is null
     where p.role = 'pending' and p.active and u.email_confirmed_at is not null
       and not exists (select 1 from students s where s.profile_id = p.id)
       and not is_public_subscriber(p.id)
       and (is_guru() or p.centre_id = (select me.centre_id from profiles me where me.id = auth.uid()))
       and p.created_at > now() - interval '180 days'), '[]') end
$$;

-- C8 (staff): one student's details, with the record's gender. Each read goes to the access log
-- when the database has 0034's log_access (called by name, so this works before and after 0034).
-- Errors: not_allowed, student_not_found. Null when the student has no details yet.
create or replace function get_student_details(p_student uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_gender text;
  d        person_details;
begin
  if not is_staff() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select gender into v_gender from students where id = p_student;
  if not found then raise exception 'student_not_found'; end if;
  select * into d from person_details where student_id = p_student;
  if to_regprocedure('public.log_access(text,uuid,integer)') is not null then
    execute 'select public.log_access($1, $2, $3)' using 'get_student_details', p_student, case when d.id is null then 0 else 1 end;
  end if;
  return jsonb_build_object('gender', v_gender, 'details', case when d.id is null then null else to_jsonb(d) - 'dob' - 'profile_id' end);
end $$;

-- ---------------------------------------------------------------- 7. report
-- G13 "How students found us" (Guru): the answers given between p_from and p_to (by when the
-- person's details row was made, in the Guru's centre's days), counted by source and by the
-- coordinator whose code they gave; with how many of them have a student record now.
-- Errors: not_allowed, range_invalid, range_too_long (more than 367 days).
create or replace function heard_about_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_zone text := my_time_zone();
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'range_invalid'; end if;
  if p_to - p_from > 366 then raise exception 'range_too_long'; end if;
  return (
    with rows as (
      select d.* from person_details d
       where (d.created_at at time zone v_zone)::date between p_from and p_to
         and (d.profile_id is null or not exists (select 1 from ig_subscribers i where i.profile_id = d.profile_id)
              or d.student_id is not null))
    select jsonb_build_object(
      'from', p_from, 'to', p_to,
      'people', (select count(*) from rows),
      'answered', (select count(*) from rows where heard_via is not null),
      'students', (select count(*) from rows where student_id is not null),
      'by_source', coalesce((select jsonb_agg(jsonb_build_object('code', heard_via, 'people', n, 'students', st)
                                              order by n desc, heard_via)
                               from (select heard_via, count(*) as n, count(student_id) as st from rows
                                      where heard_via is not null group by heard_via) x), '[]'),
      'by_interest', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'people', n) order by n desc, code)
                                 from (select unnest(learn_interests) as code, count(*) as n from rows
                                        group by 1) x), '[]'),
      'by_coordinator', coalesce((select jsonb_agg(jsonb_build_object('id', x.referred_by, 'name', p.full_name,
                                                                      'people', x.n, 'students', x.st)
                                                   order by x.n desc, p.full_name)
                                    from (select referred_by, count(*) as n, count(student_id) as st from rows
                                           where referred_by is not null group by referred_by) x
                                    join profiles p on p.id = x.referred_by), '[]'))
  );
end $$;

-- ---------------------------------------------------------------- who may run them
revoke execute on function guard_choice_option(), guard_profile_people(),
  new_referral_code(), give_referral_code(), guard_student_gender(), attach_person_details(),
  people_notice_line(text, text, text), people_notice_title(text, text), assign_mentor(uuid),
  assign_mentor_on_student(), assign_mentor_on_details(), apply_about(person_details, jsonb, boolean),
  minor_without_contact(uuid, person_details)
  from public, anon, authenticated;
revoke execute on function my_about(), save_about_me(jsonb), save_student_details(uuid, jsonb),
  get_student_details(uuid), waiting_sign_ups(), heard_about_report(date, date) from public, anon;
grant execute on function my_about(), save_about_me(jsonb), save_student_details(uuid, jsonb),
  get_student_details(uuid), waiting_sign_ups(), heard_about_report(date, date) to authenticated;
-- The guards above run as the signed-in person and ask option_ok (yes or no about a public list).
revoke execute on function option_ok(text, text, boolean) from public, anon;
grant execute on function option_ok(text, text, boolean) to authenticated;
-- #163: the sign-up form's lists, before anyone is signed in.
revoke execute on function sign_up_choices() from public;
grant execute on function sign_up_choices() to anon, authenticated;

-- ---------------------------------------------------------------- descriptions
comment on table choice_options is 'Option lists the Guru edits (G12): gender, source (how they heard of us), occupation (education / occupation), service_area, relation (emergency contact), instrument (interested in learning). Rows store the code; labels in en/te/hi; switched off = not offered. 0036, docs/DECISIONS.md #166.';
comment on column centres.city is 'City of the centre: the sign-up groups centres country → city → centre (0036).';
comment on column profiles.gender is 'Gender (choice_options gender code). Staff: set by the Guru on G2, used to match coordinators with students. New login: given at sign-up (0036).';
comment on column profiles.referral_code is 'Coordinator''s (or the Guru''s) short code that people they bring type under "How did you hear about us?" (0036, #165). Made by the database.';
comment on column students.gender is 'Gender (choice_options gender code). A student without a mentor gets a coordinator of the same gender (assign_mentor, 0036).';
comment on table person_details is 'What a person tells at sign-up, in About you or the desk records: Diksha (initiated) name, instruments to learn, emergency contact, how they heard of the class (source or referring coordinator), education / occupation, service areas of interest. On the login before a student record exists, then on the record. The Guru reads directly, coordinators through get_student_details / waiting_sign_ups; written only through save_about_me / save_student_details. 0036, #164.';
comment on column person_details.dob is 'Date of birth given at sign-up (adults only), kept until a student record exists; then dropped (the record''s dob counts).';
comment on column person_details.about_state is 'skipped = the person closed About you (it does not open by itself again); done = finished. Null = never seen.';
comment on function option_ok is 'True when the code is an option of the list (active, or any with p_any). Internal.';
comment on function guard_choice_option is 'Trigger: codes never change, labels 1-80 characters, an option in use or needed by the rules is never deleted.';
comment on function guard_profile_people is 'Trigger: the referral code is the database''s; only the Guru sets another person''s gender, a waiting login its own; a gender is an active option.';
comment on function new_referral_code is 'A free six-character referral code without look-alike characters.';
comment on function give_referral_code is 'Trigger: a coordinator or Guru gets a referral code.';
comment on function guard_student_gender is 'Trigger: a student''s gender set by an app user is an active option.';
comment on function sign_up_choices is 'Sign-up form (anon allowed, #163): active centres (id, name, city, country) and gender options. Nothing else.';
comment on function attach_person_details is 'Trigger: when a login is linked to a student record, its details move to the record and its gender fills an empty one.';
comment on function people_notice_line is 'Inbox line of an 0036 notice in the person''s language.';
comment on function people_notice_title is 'Inbox title of an 0036 notice in the person''s language.';
comment on function assign_mentor is 'Gives a student without a mentor a same-gender coordinator: the referring one, else the least loaded at the home centre; else tells the Guru. #165.';
comment on function assign_mentor_on_student is 'Trigger: try assign_mentor when a student''s gender or home centre is set.';
comment on function assign_mentor_on_details is 'Trigger: try assign_mentor when a referral reaches a student''s details.';
comment on function apply_about is 'Checks and applies the About-you keys of a JSON object to a details row. Internal.';
comment on function minor_without_contact is 'True for an under-18 with neither a guardian with a phone nor an emergency contact. Internal.';
comment on function my_about is 'About you: the signed-in waiting login''s or student''s own details and the option lists. Null for others.';
comment on function save_about_me is 'About you: saves the person''s own answers (keys present only), gender, phone and about_state.';
comment on function save_student_details is 'C2/C8 (staff): saves a student''s details, gender and home centre.';
comment on function get_student_details is 'C8 (staff): one student''s details and gender; logged in access_log once 0034 is there.';
comment on function waiting_sign_ups is 'C2 (staff): confirmed sign-ups waiting for the desk, with what they gave; coordinators see their centre''s.';
comment on function heard_about_report is 'G13 (Guru): how people found the class, by source and referring coordinator, for a date range.';
