-- 0051 Under-18 sign-up at home, with the parent's consent by email (docs/DECISIONS.md #399;
-- docs/DATABASE.md "Under-18 sign-up at home (0051)"; docs/OPERATIONS.md "Parent consent by email").
-- Before: a child under 18 could not sign up at all (the app said "come to the desk with a parent";
-- handle_new_user dropped a minor's date of birth; Accept answered minor_needs_desk).
-- 1. The child signs up as an adult does, plus the parent's name, relation (mother, father or
--    guardian), email and mobile number. handle_new_user keeps them in minor_signups and keeps the
--    child's date of birth. Nothing more about the child is processed until the parent consents:
--    About you refuses (minor_awaits_parent) and the app hides it.
-- 2. Once the child's email is confirmed, the parent gets one email with a 6-digit code and the
--    address of the consent page (/parent-consent on the web app; never the code in a link). The
--    Edge Function notify-parents sends it through Brevo (claim_consent_codes /
--    finish_consent_codes; the every-minute job send_parent_notices now also calls it for these,
--    whether or not check-out emails are on). Without BREVO_API_KEY it is a dry run: no email.
--    Limits (audit S3-01, the open-relay finding of 0027): 5 emails per sign-up, 3 a day per parent
--    address across all sign-ups, 60 a day for the whole app, one request every 10 minutes; names
--    in the email follow the name rule (letters only, 0047). The code is stored hashed, lives 7
--    days, allows 5 wrong tries, and is never returned to the app.
-- 3. The parent opens the page, types their email and the code, declares they are the parent or
--    guardian and 18 or over, and ticks the data consent (photos separately, unticked):
--    give_parent_consent, the one function anon may run besides sign_up_choices. Wrong code, no such
--    request or an unknown email all answer 'wrong'.
-- 4. The desk (Register a student) sees the sign-up with "parent consented by email, ID not yet
--    seen". Its Accept (accept_minor_sign_up) takes the ID the coordinator saw and writes the
--    student, the guardian and the consents (scope data, and photo if given; method email_code;
--    given_at and otp_verified_at = the parent's time) in one step, and links the child's own login
--    (the login the parent consented for; an exception to #276's "never by email", made explicitly
--    by staff). Without the parent's consent it answers minor_needs_desk (no request) or
--    parent_not_consented. accept_sign_up (adults) is not changed.
-- 5. A request the parent does not answer in 30 days is deleted (the parent's details with it) by
--    the daily job mridanga-minor-signups; a consented one that the desk never accepted goes after
--    180 days, when the sign-up leaves the desk list.
-- Needs 0001-0050. Safe to run twice.

-- ---------------------------------------------------------------- 1. the request
create table if not exists minor_signups (
  profile_id             uuid primary key references profiles (id) on delete cascade,
  parent_name            text not null check (char_length(parent_name) between 2 and 100),
  parent_relation        text not null check (parent_relation in ('mother', 'father', 'guardian')),
  parent_email           text not null check (parent_email = lower(parent_email) and char_length(parent_email) <= 254),
  parent_phone           text not null check (parent_phone ~ '^\+[1-9][0-9]{6,14}$'),
  created_at             timestamptz not null default now(),
  -- The email to the parent: wanted (waits to go once the child's email is confirmed), claimed by a
  -- run of notify-parents, and what became of the last one. mails_sent counts every email handed to Brevo.
  mail_wanted_at         timestamptz,
  mail_claim             uuid,
  mail_tries             smallint not null default 0,
  mail_next_try_at       timestamptz,
  mail_outcome           text,
  mail_done_at           timestamptz,
  mails_sent             smallint not null default 0,
  -- The code: sha256 of '<profile id>:<code>'. Read by no app user.
  code_hash              text,
  code_expires_at        timestamptz,
  code_tries             smallint not null default 0,
  -- The parent's answer.
  consented_at           timestamptz,
  photo_consent          boolean,
  consent_notice_version text check (consent_notice_version is null or consent_notice_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$')
);
create index if not exists minor_signups_email_idx on minor_signups (parent_email);
alter table minor_signups enable row level security;
-- No policy: only the functions below read or write it.
revoke all on minor_signups from public, anon, authenticated;

-- Emails handed to Brevo in the last two days, for the per-address and app-wide daily limits. The
-- address is kept as a hash only.
create table if not exists parent_mail_log (
  id           bigint generated always as identity primary key,
  sent_at      timestamptz not null default now(),
  address_hash text not null
);
create index if not exists parent_mail_log_sent_idx on parent_mail_log (sent_at);
alter table parent_mail_log enable row level security;
revoke all on parent_mail_log from public, anon, authenticated;

-- The limits, in one place for the functions and the smoke test.
create or replace function minor_mail_limits() returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object('per_signup', 5, 'per_address_day', 3, 'app_day', 60, 'gap_minutes', 10,
                            'code_days', 7, 'code_tries', 5, 'unanswered_days', 30)
$$;

/* sha256 hex of an email address, lower case. */
create or replace function parent_address_hash(p_email text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select encode(sha256(convert_to(lower(btrim(coalesce(p_email, ''))), 'UTF8')), 'hex')
$$;

-- Today's emails (India time) to one address, and to everyone.
create or replace function parent_mails_today(p_email text default null) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int from parent_mail_log
   where sent_at >= (today_ist() at time zone 'Asia/Kolkata')
     and (p_email is null or address_hash = parent_address_hash(p_email))
$$;

-- The parent's details, checked and cleaned: the same rules for the sign-up and for a correction.
-- Errors: parent_name_invalid (the name rule of 0047), parent_relation_invalid, parent_email_invalid,
-- parent_email_own (the child's own sign-in email), parent_phone_invalid.
create or replace function clean_parent_details(p_name text, p_relation text, p_email text, p_phone text, p_child_email text)
returns minor_signups
language plpgsql stable set search_path = public, pg_temp as $$
declare
  r minor_signups;
begin
  begin
    r.parent_name := clean_person_name(p_name, 100);
  exception when raise_exception then
    raise exception 'parent_name_invalid' using detail = 'The parent''s name: letters only, as on their ID.';
  end;
  r.parent_relation := nullif(btrim(coalesce(p_relation, '')), '');
  if r.parent_relation is null or r.parent_relation not in ('mother', 'father', 'guardian') then
    raise exception 'parent_relation_invalid' using detail = 'mother, father or guardian.';
  end if;
  r.parent_email := lower(nullif(btrim(coalesce(p_email, '')), ''));
  if r.parent_email is null or char_length(r.parent_email) > 254 or r.parent_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'parent_email_invalid';
  end if;
  if r.parent_email = lower(btrim(coalesce(p_child_email, ''))) then
    raise exception 'parent_email_own' using detail = 'The parent''s email must be the parent''s own, not the one this account signs in with.';
  end if;
  r.parent_phone := regexp_replace(coalesce(p_phone, ''), '[\s-]', '', 'g');
  if r.parent_phone !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'parent_phone_invalid';
  end if;
  return r;
end $$;

-- ---------------------------------------------------------------- 2. the sign-up
-- 0047's handle_new_user. New: a date of birth under 18 is kept when the parent's details come with
-- it (parent_name, parent_relation, parent_email, parent_phone), and the request is stored with its
-- first email wanted; wrong parent details refuse the sign-up (the app checks the same rules first).
-- Without parent details a minor's date of birth is dropped, as before (an older app never sends one).
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_meta   jsonb := coalesce(new.raw_user_meta_data, '{}');
  v_lang   text := v_meta ->> 'language';
  v_gender text := v_meta ->> 'gender';
  v_name   text := coalesce(v_meta ->> 'full_name', '');
  v_centre int;
  v_dob    date;
  v_phone  text := regexp_replace(coalesce(v_meta ->> 'phone', ''), '[\s-]', '', 'g');
  v_diksha text := nullif(btrim(coalesce(v_meta ->> 'diksha_name', '')), '');
  v_notice text := nullif(btrim(coalesce(v_meta ->> 'notice_version', '')), '');
  v_learn  text[];
  v_parent minor_signups;
  v_minor  boolean := false;
begin
  if btrim(v_name, E' \t\r\n') <> '' then
    v_name := clean_person_name(v_name, 80);
    if staff_name_taken(new.id, v_name) then
      raise exception 'name_taken' using detail = 'This is the name of the Guru or a coordinator. Add a surname or an initial.';
    end if;
  else
    v_name := '';
  end if;
  begin
    v_dob := (v_meta ->> 'dob')::date;
    if v_dob > current_date or v_dob < date '1900-01-01' then
      v_dob := null;
    end if;
  exception when others then v_dob := null;
  end;
  if v_dob > current_date - interval '18 years' then
    if nullif(btrim(coalesce(v_meta ->> 'parent_email', '')), '') is not null then
      v_parent := clean_parent_details(v_meta ->> 'parent_name', v_meta ->> 'parent_relation',
                                       v_meta ->> 'parent_email', v_meta ->> 'parent_phone', new.email);
      v_minor := true;
    else
      v_dob := null;
    end if;
  end if;
  begin
    v_centre := (v_meta ->> 'centre_id')::int;
  exception when others then v_centre := null;
  end;
  if v_centre is not null and not exists (select 1 from centres where id = v_centre and active) then
    v_centre := null;
  end if;
  if v_gender is not null and not option_ok('gender', v_gender) then v_gender := null; end if;
  if v_phone !~ '^\+[1-9][0-9]{6,14}$' then v_phone := null; end if;
  if v_diksha is not null then
    begin v_diksha := clean_person_name(v_diksha, 80); exception when raise_exception then v_diksha := null; end;
  end if;
  if v_notice !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$' then v_notice := null; end if;
  if jsonb_typeof(v_meta -> 'learn') = 'array' then
    select coalesce(array_agg(distinct x), '{}') into v_learn
      from jsonb_array_elements_text(v_meta -> 'learn') x where option_ok('instrument', x);
  end if;

  insert into profiles (id, email, full_name, role, language, gender, centre_id, phone)
  values (new.id, new.email, v_name, 'pending',
          case when v_lang in ('en', 'te', 'hi') then v_lang else 'en' end, v_gender,
          coalesce(v_centre, (select min(id) from centres where active), 1), v_phone);
  if v_dob is not null or v_diksha is not null or cardinality(v_learn) > 0 or v_notice is not null then
    insert into person_details (profile_id, dob, diksha_name, learn_interests, notice_version, notice_accepted_at)
    values (new.id, v_dob, v_diksha, coalesce(v_learn, '{}'), v_notice, case when v_notice is not null then now() end);
  end if;
  if v_minor then
    insert into minor_signups (profile_id, parent_name, parent_relation, parent_email, parent_phone, mail_wanted_at)
    values (new.id, v_parent.parent_name, v_parent.parent_relation, v_parent.parent_email, v_parent.parent_phone, now());
  end if;
  if new.email_confirmed_at is not null then
    perform link_login_to_student(new.id, new.email);
  end if;
  return new;
end $$;

-- About you is refused for a child whose parent has not consented yet (nothing beyond the sign-up
-- is processed). The sign-up itself (no one signed in) and staff are not affected.
create or replace function guard_minor_signup_details() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and new.student_id is null and new.profile_id = auth.uid()
     and exists (select 1 from minor_signups m where m.profile_id = auth.uid() and m.consented_at is null) then
    raise exception 'minor_awaits_parent' using detail = 'Your parent''s consent comes first.';
  end if;
  return new;
end $$;
drop trigger if exists person_details_minor_signup on person_details;
create trigger person_details_minor_signup before insert or update on person_details
  for each row execute function guard_minor_signup_details();

-- ---------------------------------------------------------------- 3. the child
-- The caller's request, for the waiting screen: null when the caller is not a child who signed up
-- (an adult, staff, a student). state: 'needs_parent' (under 18, no request: an old sign-up, or one
-- that expired), 'awaiting_parent' or 'consented'. mail: 'waiting' (to go, or waiting for the
-- confirmed email), 'sent', 'not_set_up' (dry run: parent emails are not switched on), 'failed'.
create or replace function my_parent_consent() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_me  uuid := auth.uid();
  v_dob date;
  m     minor_signups;
begin
  if v_me is null or coalesce(my_role() <> 'pending', true)
     or exists (select 1 from students s where s.profile_id = v_me) then
    return null;
  end if;
  select * into m from minor_signups where profile_id = v_me;
  if not found then
    select d.dob into v_dob from person_details d where d.profile_id = v_me and d.student_id is null;
    if v_dob is null or v_dob <= today_ist() - interval '18 years' then return null; end if;
    return jsonb_build_object('state', 'needs_parent');
  end if;
  return jsonb_build_object(
    'state', case when m.consented_at is not null then 'consented' else 'awaiting_parent' end,
    'parent_name', m.parent_name, 'parent_relation', m.parent_relation,
    'parent_email', m.parent_email, 'parent_phone', m.parent_phone,
    'mail', case when m.mail_wanted_at is not null then 'waiting'
                 when m.mail_outcome = 'sent' then 'sent'
                 when m.mail_outcome = 'skipped' then 'not_set_up'
                 when m.mail_outcome is not null then 'failed' end,
    'mail_at', m.mail_done_at, 'mails_left', greatest(0, (minor_mail_limits() ->> 'per_signup')::int - m.mails_sent),
    'consented_at', m.consented_at, 'photo_consent', m.photo_consent,
    'expires_at', m.created_at + ((minor_mail_limits() ->> 'unanswered_days')::int * interval '1 day'));
end $$;

-- Asks for the email to the parent again (a new code). Errors: not_awaiting_parent, mail_too_soon
-- (10 minutes after the last one), mail_limit (5 for this sign-up, or 3 today to this address).
-- Returns my_parent_consent().
create or replace function resend_parent_email() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_me uuid := auth.uid();
  m    minor_signups;
  lim  jsonb := minor_mail_limits();
begin
  select * into m from minor_signups where profile_id = v_me for update;
  if not found or coalesce(my_role() <> 'pending', true) or m.consented_at is not null then
    raise exception 'not_awaiting_parent' using errcode = '42501';
  end if;
  if m.mail_wanted_at is not null then return my_parent_consent(); end if;
  if m.mail_done_at > now() - (lim ->> 'gap_minutes')::int * interval '1 minute' then
    raise exception 'mail_too_soon';
  end if;
  if m.mails_sent >= (lim ->> 'per_signup')::int or parent_mails_today(m.parent_email) >= (lim ->> 'per_address_day')::int then
    raise exception 'mail_limit';
  end if;
  update minor_signups
     set mail_wanted_at = now(), mail_tries = 0, mail_next_try_at = null, mail_outcome = null, mail_claim = null
   where profile_id = v_me;
  return my_parent_consent();
end $$;

-- Gives or corrects the parent's details before the parent consents (a typing mistake, or a request
-- that expired), and asks for a new email to the new address. Only a waiting login under 18 with no
-- student record. Errors: not_a_minor_signup, already_consented, mail_too_soon, mail_limit, and those
-- of clean_parent_details. Returns my_parent_consent().
create or replace function set_parent_details(p_name text, p_relation text, p_email text, p_phone text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_me    uuid := auth.uid();
  v_dob   date;
  v_email text;
  m       minor_signups;
  r       minor_signups;
  lim     jsonb := minor_mail_limits();
begin
  select d.dob into v_dob from person_details d where d.profile_id = v_me and d.student_id is null;
  if v_me is null or coalesce(my_role() <> 'pending', true) or v_dob is null or v_dob <= today_ist() - interval '18 years'
     or exists (select 1 from students s where s.profile_id = v_me)
     or not exists (select 1 from profiles p where p.id = v_me and p.active) then
    raise exception 'not_a_minor_signup' using errcode = '42501';
  end if;
  select lower(email) into v_email from auth.users where id = v_me;
  r := clean_parent_details(p_name, p_relation, p_email, p_phone, v_email);
  select * into m from minor_signups where profile_id = v_me for update;
  if found and m.consented_at is not null then raise exception 'already_consented'; end if;
  if m.mail_done_at > now() - (lim ->> 'gap_minutes')::int * interval '1 minute' then
    raise exception 'mail_too_soon';
  end if;
  if coalesce(m.mails_sent, 0) >= (lim ->> 'per_signup')::int or parent_mails_today(r.parent_email) >= (lim ->> 'per_address_day')::int then
    raise exception 'mail_limit';
  end if;
  insert into minor_signups (profile_id, parent_name, parent_relation, parent_email, parent_phone, mail_wanted_at)
  values (v_me, r.parent_name, r.parent_relation, r.parent_email, r.parent_phone, now())
  on conflict (profile_id) do update
     set parent_name = excluded.parent_name, parent_relation = excluded.parent_relation,
         parent_email = excluded.parent_email, parent_phone = excluded.parent_phone,
         mail_wanted_at = now(), mail_tries = 0, mail_next_try_at = null, mail_outcome = null, mail_claim = null,
         -- A code sent to the old address no longer counts.
         code_hash = null, code_expires_at = null, code_tries = 0;
  return my_parent_consent();
end $$;

-- ---------------------------------------------------------------- 4. the email (Edge Function)
-- True for a request whose email may go now: wanted, not consented, retry time come, the child's
-- email confirmed and the login on, under the per-sign-up and per-address limits.
create or replace function consent_mail_ready(m minor_signups) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select m.mail_wanted_at is not null and m.consented_at is null
     and (m.mail_next_try_at is null or m.mail_next_try_at <= now())
     and m.mails_sent < (minor_mail_limits() ->> 'per_signup')::int
     and exists (select 1 from auth.users u join profiles p on p.id = u.id
                  where u.id = m.profile_id and u.email_confirmed_at is not null and p.active and p.role = 'pending')
     and parent_mails_today(m.parent_email) < (minor_mail_limits() ->> 'per_address_day')::int
$$;

-- True when a consent email waits and today's app-wide limit has room (the job's question).
create or replace function consent_mails_due() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select parent_mails_today() < (minor_mail_limits() ->> 'app_day')::int
     and exists (select 1 from minor_signups m where m.mail_wanted_at is not null and consent_mail_ready(m))
$$;

-- For the Edge Function (service role). Each run: forgets the mail log after two days; ends requests
-- claimed 5 times (gave_up); claims up to p_limit (at most 20) ready requests under today's app-wide
-- limit, makes each a NEW code (stored hashed, 7 days, 5 tries) and returns what the email needs:
-- the parent's address and name, the child's name, date of birth, centre and app language, the code
-- and the day it ends. The code is in this answer only; nothing else ever returns it.
create or replace function claim_consent_codes(p_limit int default 20)
returns table (claim uuid, profile_id uuid, email text, language text, parent_name text, child_name text,
               child_dob text, centre text, code text, expires_on text)
language plpgsql volatile set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_claim uuid := gen_random_uuid();
  v_room  int;
  v_id    uuid;
  v_code  text;
  lim     jsonb := minor_mail_limits();
begin
  delete from parent_mail_log l where l.sent_at < now() - interval '2 days';
  update minor_signups m
     set mail_wanted_at = null, mail_outcome = 'gave_up', mail_done_at = now()
   where m.mail_wanted_at is not null and m.mail_tries >= 5 and (m.mail_next_try_at is null or m.mail_next_try_at <= now());

  v_room := greatest(0, least(coalesce(p_limit, 20), 20, (lim ->> 'app_day')::int - parent_mails_today()));
  for v_id in
    select m.profile_id from minor_signups m
     where m.mail_wanted_at is not null and consent_mail_ready(m)
     order by m.mail_wanted_at
     limit v_room
     for update skip locked
  loop
    v_code := lpad(((('x' || substr(md5(gen_random_uuid()::text), 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0');
    update minor_signups m
       set mail_claim = v_claim, mail_tries = m.mail_tries + 1, mail_next_try_at = now() + interval '5 minutes',
           code_hash = encode(sha256(convert_to(m.profile_id::text || ':' || v_code, 'UTF8')), 'hex'),
           code_expires_at = now() + (lim ->> 'code_days')::int * interval '1 day', code_tries = 0
     where m.profile_id = v_id;
    return query
      select v_claim, m.profile_id, m.parent_email, coalesce(p.language, 'en'), m.parent_name, p.full_name,
             to_char(d.dob, 'YYYY-MM-DD'), coalesce(c.name, ''), v_code,
             to_char(m.code_expires_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD')
        from minor_signups m
        join profiles p on p.id = m.profile_id
        left join person_details d on d.profile_id = m.profile_id and d.student_id is null
        left join centres c on c.id = p.centre_id
       where m.profile_id = v_id;
  end loop;
end $$;

-- Records what became of one claim (rows of another claim are left alone, as 0043):
--   p_sent     Brevo accepted it: counted for the limits.    p_skipped  dry run: no email went.
--   p_retry    try again 2, 8, 18, 32 minutes after the 1st-4th try (a new code each time).
--   p_refused  {"<profile id>": "<reason>"}: not tried again until the child asks.
create or replace function finish_consent_codes(p_claim uuid, p_sent uuid[], p_skipped uuid[], p_retry uuid[], p_refused jsonb)
returns void
language plpgsql volatile set search_path = public, pg_temp as $$
begin
  insert into parent_mail_log (address_hash)
  select parent_address_hash(m.parent_email) from minor_signups m
   where m.profile_id = any (coalesce(p_sent, '{}')) and m.mail_claim = p_claim and m.mail_wanted_at is not null;
  update minor_signups set mail_wanted_at = null, mail_outcome = 'sent', mail_done_at = now(), mails_sent = mails_sent + 1
   where profile_id = any (coalesce(p_sent, '{}')) and mail_claim = p_claim and mail_wanted_at is not null;
  update minor_signups set mail_wanted_at = null, mail_outcome = 'skipped', mail_done_at = now()
   where profile_id = any (coalesce(p_skipped, '{}')) and mail_claim = p_claim and mail_wanted_at is not null;
  update minor_signups
     set mail_next_try_at = now() + mail_tries * mail_tries * interval '2 minutes',
         mail_wanted_at = case when mail_tries >= 5 then null else mail_wanted_at end,
         mail_outcome = case when mail_tries >= 5 then 'gave_up' end,
         mail_done_at = case when mail_tries >= 5 then now() end
   where profile_id = any (coalesce(p_retry, '{}')) and mail_claim = p_claim and mail_wanted_at is not null;
  update minor_signups m set mail_wanted_at = null, mail_outcome = left(r.value, 40), mail_done_at = now()
    from jsonb_each_text(coalesce(p_refused, '{}'::jsonb)) r
   where r.key ~ '^[0-9a-f-]{36}$' and m.profile_id = r.key::uuid and m.mail_claim = p_claim and m.mail_wanted_at is not null;
end $$;

-- 0043's every-minute job, now also for consent emails: it calls notify-parents when a check-in or
-- check-out email waits (only while the Guru has them on) or a consent email waits (always: a child
-- waits for it). Answers off, nothing_due, not_set_up or called, as before.
create or replace function send_parent_notices() returns text
language plpgsql volatile set search_path = public, pg_temp as $$
declare
  v_url     text;
  v_secret  text;
  v_result  text := 'not_set_up';
  v_notices boolean := coalesce(setting_flag('parent_notices_enabled'), false);
  v_consent boolean := consent_mails_due();
begin
  if not v_notices and not v_consent then
    v_result := 'off';
  elsif not v_consent and not exists (select 1 from parent_notices where outcome is null and next_try_at <= now()) then
    v_result := 'nothing_due';
  elsif exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'net' and p.proname = 'http_post')
        and to_regclass('vault.decrypted_secrets') is not null then
    execute $q$select max(decrypted_secret) filter (where name = 'mridanga_project_url'),
                      max(decrypted_secret) filter (where name = 'mridanga_push_secret')
                 from vault.decrypted_secrets$q$
       into v_url, v_secret;
    if v_url ~ '^https://[a-z0-9]{20}\.supabase\.co/?$' and char_length(v_secret) >= 32 then
      execute $q$select net.http_post(
                    url := $1 || '/functions/v1/notify-parents',
                    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', $2),
                    body := '{}'::jsonb,
                    timeout_milliseconds := 30000)$q$
        using rtrim(v_url, '/'), v_secret;
      v_result := 'called';
    end if;
  end if;
  -- Only a change is written, so a quiet minute costs no row version.
  update parent_notice_status set last_job_at = now(), last_job_result = v_result
   where id and (last_job_result is distinct from v_result or v_result = 'called');
  return v_result;
end $$;

-- ---------------------------------------------------------------- 5. the parent (consent page)
-- /parent-consent on the web app, open to anyone (anon). The parent types the email the code went
-- to and the code, and declares (p_parent_ok: "I am the parent or legal guardian and 18 or over",
-- p_data_ok: the data consent; both needed) and chooses photos (p_photo_ok). Answers, never raises
-- for a wrong try, so each wrong try is counted:
--   consented (with the child's name and the photo choice) · already (this code was used: the same)
--   · wrong (wrong code, or no request for this email: the two are not told apart) · too_many (5
--   wrong tries on every request of this email: the child asks for a new code) · expired · closed
--   (the sign-up is no longer waiting) · child_signed_in (the child's own login is signed in on this
--   device: the parent uses their own) · declaration_required.
create or replace function give_parent_consent(p_email text, p_code text, p_parent_ok boolean, p_data_ok boolean,
                                               p_photo_ok boolean default false, p_notice_version text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_code   text := btrim(coalesce(p_code, ''));
  v_notice text := nullif(btrim(coalesce(p_notice_version, '')), '');
  m        minor_signups;
  v_known  boolean := false;
  v_live   int;
  v_name   text;
  lim      jsonb := minor_mail_limits();
begin
  if not coalesce(p_parent_ok, false) or not coalesce(p_data_ok, false) then
    return jsonb_build_object('result', 'declaration_required');
  end if;
  if v_code !~ '^[0-9]{6}$' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    return jsonb_build_object('result', 'wrong');
  end if;
  if v_notice !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$' then v_notice := null; end if;

  for m in select * from minor_signups where parent_email = v_email and code_hash is not null order by created_at for update loop
    v_known := true;
    if encode(sha256(convert_to(m.profile_id::text || ':' || v_code, 'UTF8')), 'hex') = m.code_hash then
      select nullif(btrim(full_name), '') into v_name from profiles where id = m.profile_id;
      if m.consented_at is not null then
        return jsonb_build_object('result', 'already', 'child_name', v_name, 'photo_consent', m.photo_consent);
      end if;
      if m.code_tries >= (lim ->> 'code_tries')::int then return jsonb_build_object('result', 'too_many'); end if;
      if m.code_expires_at < now() then return jsonb_build_object('result', 'expired'); end if;
      if auth.uid() = m.profile_id then return jsonb_build_object('result', 'child_signed_in'); end if;
      if not exists (select 1 from profiles p where p.id = m.profile_id and p.active and p.role = 'pending')
         or exists (select 1 from students s where s.profile_id = m.profile_id) then
        return jsonb_build_object('result', 'closed');
      end if;
      update minor_signups
         set consented_at = now(), photo_consent = coalesce(p_photo_ok, false), consent_notice_version = v_notice,
             code_tries = 0, mail_wanted_at = null
       where profile_id = m.profile_id;
      return jsonb_build_object('result', 'consented', 'child_name', v_name, 'photo_consent', coalesce(p_photo_ok, false));
    end if;
  end loop;

  -- A wrong code: one more try on every open request of this address.
  update minor_signups set code_tries = code_tries + 1
   where parent_email = v_email and code_hash is not null and consented_at is null
     and code_tries < (lim ->> 'code_tries')::int and code_expires_at >= now();
  select count(*)::int into v_live from minor_signups
   where parent_email = v_email and code_hash is not null and consented_at is null
     and code_tries < (lim ->> 'code_tries')::int and code_expires_at >= now();
  if v_known and v_live = 0 and exists (select 1 from minor_signups where parent_email = v_email and consented_at is null
                                          and code_hash is not null and code_tries >= (lim ->> 'code_tries')::int) then
    return jsonb_build_object('result', 'too_many');
  end if;
  return jsonb_build_object('result', 'wrong');
end $$;

-- ---------------------------------------------------------------- 6. the desk
-- 0047's waiting list, with the parent's part of a child's home sign-up: parent = null (an adult,
-- or a child without a request) or {state: awaiting_parent | consented, name, relation, email,
-- phone, consented_at, photo_consent}.
create or replace function waiting_sign_ups() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when not is_staff() then null else coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'full_name', p.full_name, 'email', p.email, 'phone', p.phone, 'gender', p.gender,
             'centre_id', p.centre_id, 'centre_name', (select c.name from centres c where c.id = p.centre_id),
             'dob', d.dob, 'created_at', p.created_at,
             'emergency_relation', d.emergency_relation, 'emergency_name', d.emergency_name,
             'emergency_phone', d.emergency_phone, 'heard_via', d.heard_via, 'referred_by', d.referred_by,
             'heard_other', d.heard_other, 'occupation', d.occupation, 'occupation_other', d.occupation_other,
             'service_areas', to_jsonb(coalesce(d.service_areas, '{}')), 'service_other', d.service_other,
             'diksha_name', d.diksha_name, 'learn_interests', to_jsonb(coalesce(d.learn_interests, '{}')),
             'notice_version', d.notice_version,
             'parent', case when m.profile_id is not null then jsonb_build_object(
               'state', case when m.consented_at is not null then 'consented' else 'awaiting_parent' end,
               'name', m.parent_name, 'relation', m.parent_relation, 'email', m.parent_email, 'phone', m.parent_phone,
               'consented_at', m.consented_at, 'photo_consent', m.photo_consent) end)
           order by p.created_at desc)
      from profiles p
      join auth.users u on u.id = p.id
      left join person_details d on d.profile_id = p.id and d.student_id is null
      left join minor_signups m on m.profile_id = p.id
     where p.role in ('pending', 'student') and p.active and u.email_confirmed_at is not null
       and not exists (select 1 from students s where s.profile_id = p.id)
       and not exists (select 1 from ig_subscribers i where i.profile_id = p.id)
       and (is_guru() or p.centre_id = (select me.centre_id from profiles me where me.id = auth.uid()))
       and p.created_at > now() - interval '180 days'), '[]') end
$$;

-- A consent by email code is written only by accept_minor_sign_up (below), which says so for its own
-- transaction (a setting no app request can set).
create or replace function guard_consent_guardian() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- auth.uid(), not current_user: this function runs as its owner.
  if tg_op = 'INSERT' and new.method = 'email_code' and auth.uid() is not null
     and coalesce(current_setting('mridanga.email_consent', true), '') <> 'on' then
    raise exception 'consent_method_not_allowed' using detail = 'A consent by email code is recorded only by accept_minor_sign_up on a sign-up the parent consented to.';
  end if;
  if new.guardian_id is not null
     and not exists (select 1 from guardians g where g.id = new.guardian_id and g.student_id = new.student_id) then
    raise exception 'consent_guardian_mismatch' using detail = 'The consent''s guardian is not a guardian of this student.';
  end if;
  return new;
end $$;

-- Accept for a child under 18 whose parent consented by email (Register a student; 0048's
-- accept_sign_up stays as it is for adults and still answers minor_needs_desk for a child, so old
-- apps keep working). p_id_type_checked names the ID the coordinator saw, the parent's or the
-- child's (id_type_required). The student (linked to the child's own login), the guardian and the
-- consents (data, and photo when given; method email_code; given_at and otp_verified_at = when the
-- parent consented; verified_by = the coordinator) are written together, then the request is
-- deleted. Errors as accept_sign_up, and not_a_minor (an adult: use accept_sign_up),
-- minor_needs_desk (no request), parent_not_consented, id_type_required.
create or replace function accept_minor_sign_up(p_profile uuid, p_id_type_checked text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p      profiles;
  v_email  text;
  v_conf   timestamptz;
  d        person_details;
  s        students;
  m        minor_signups;
  v_id     text := nullif(btrim(coalesce(p_id_type_checked, '')), '');
  v_guard  uuid;
begin
  if not coalesce(is_staff(), false) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into v_p from profiles where id = p_profile for update;
  if not found then raise exception 'sign_up_not_found'; end if;
  if not coalesce(is_guru(), false) and v_p.centre_id is distinct from (select me.centre_id from profiles me where me.id = auth.uid()) then
    raise exception 'not_allowed' using errcode = '42501', detail = 'A coordinator accepts the sign-ups of their own centre.';
  end if;

  select * into s from students where profile_id = p_profile;
  if found then
    if s.request_id = p_profile then
      return jsonb_build_object('id', s.id, 'roll_no', s.roll_no, 'full_name', s.full_name, 'linked', true,
                                'repeated', true, 'existing', false);
    end if;
    raise exception 'already_registered' using detail = 'This login is already on a student record.';
  end if;
  if not login_awaits_record(p_profile) or exists (select 1 from ig_subscribers i where i.profile_id = p_profile) then
    raise exception 'not_waiting' using detail = 'Only an active login waiting for the desk can be accepted.';
  end if;
  select lower(u.email), u.email_confirmed_at into v_email, v_conf from auth.users u where u.id = p_profile;
  if v_conf is null or v_email is null then
    raise exception 'email_not_confirmed' using detail = 'The person has not opened the link in the sign-up email yet.';
  end if;

  select * into d from person_details where profile_id = p_profile and student_id is null;
  if d.dob is null then
    raise exception 'dob_required' using detail = 'The sign-up has no date of birth: use Fill the form.';
  end if;
  if d.dob <= today_ist() - interval '18 years' then
    raise exception 'not_a_minor' using detail = '18 or over: use Accept for adults.';
  end if;
  select * into m from minor_signups where profile_id = p_profile for update;
  if not found then
    raise exception 'minor_needs_desk' using detail = 'Under 18 without a parent''s consent by email: the desk registers the student with a parent.';
  end if;
  if m.consented_at is null then
    raise exception 'parent_not_consented' using detail = 'The parent has not given consent on the consent page yet.';
  end if;
  if v_id is null or v_id not in ('aadhaar', 'pan', 'driving_licence', 'passport', 'voter_id', 'other') then
    raise exception 'id_type_required' using detail = 'Choose the ID you saw (the parent''s or the child''s).';
  end if;
  if btrim(coalesce(v_p.full_name, '')) = '' then raise exception 'name_required'; end if;
  if exists (select 1 from students w where lower(w.email) = v_email and w.withdrawn_at is not null) then
    raise exception 'student_withdrawn' using detail = 'A record with this email had its consent withdrawn: the Guru decides.';
  end if;

  insert into students (full_name, dob, phone, email, level_id, home_centre_id, request_id, profile_id)
  values (btrim(v_p.full_name), d.dob, v_p.phone, v_email, 1,
          coalesce(v_p.centre_id, (select min(id) from centres where active), 1)::smallint, p_profile, p_profile)
  returning * into s;
  insert into guardians (student_id, full_name, phone, email, relation)
  values (s.id, m.parent_name, m.parent_phone, m.parent_email, m.parent_relation)
  returning id into v_guard;
  perform set_config('mridanga.email_consent', 'on', true);
  insert into consents (student_id, guardian_id, scope, method, id_type_checked, otp_verified_at, verified_by, given_at, notice_version)
  values (s.id, v_guard, 'data', 'email_code', v_id, m.consented_at, auth.uid(), m.consented_at, m.consent_notice_version);
  if m.photo_consent then
    insert into consents (student_id, guardian_id, scope, method, id_type_checked, otp_verified_at, verified_by, given_at, notice_version)
    values (s.id, v_guard, 'photo', 'email_code', v_id, m.consented_at, auth.uid(), m.consented_at, m.consent_notice_version);
  end if;
  perform set_config('mridanga.email_consent', '', true);
  delete from minor_signups where profile_id = p_profile;
  update profiles set role = 'student' where id = p_profile and role <> 'student';
  return jsonb_build_object('id', s.id, 'roll_no', s.roll_no, 'full_name', s.full_name, 'linked', true,
                            'repeated', false, 'existing', false);
end $$;

-- ---------------------------------------------------------------- 7. expiry (daily)
-- A request the parent did not answer in 30 days goes (the parent's details and the code with it):
-- the sign-up then waits as an under-18 sign-up without a request (the desk with a parent, or the
-- child gives the parent's details again). A consented request the desk never accepted goes after
-- 180 days, when the sign-up leaves the desk list. The mail log keeps two days.
create or replace function expire_minor_signups() returns int
language plpgsql volatile set search_path = public, pg_temp as $$
declare v_n int;
begin
  delete from minor_signups m
   where (m.consented_at is null and m.created_at < now() - (minor_mail_limits() ->> 'unanswered_days')::int * interval '1 day')
      or (m.consented_at is not null and m.created_at < now() - interval '180 days');
  get diagnostics v_n = row_count;
  delete from parent_mail_log l where l.sent_at < now() - interval '2 days';
  return v_n;
end $$;

-- 02:15 India time (20:45 UTC), after the night's other jobs.
select cron.schedule('mridanga-minor-signups', '45 20 * * *', 'select expire_minor_signups()');

-- ---------------------------------------------------------------- who may run them
-- docs/DECISIONS.md #14: the child's functions for signed-in people (each checks the caller), the
-- consent page for anyone, the email queue for the Edge Function (service role), the rest internal.
revoke execute on function minor_mail_limits(), parent_address_hash(text), parent_mails_today(text),
  clean_parent_details(text, text, text, text, text), guard_minor_signup_details(), my_parent_consent(),
  resend_parent_email(), set_parent_details(text, text, text, text), consent_mail_ready(minor_signups),
  consent_mails_due(), claim_consent_codes(int), finish_consent_codes(uuid, uuid[], uuid[], uuid[], jsonb),
  send_parent_notices(), give_parent_consent(text, text, boolean, boolean, boolean, text),
  accept_minor_sign_up(uuid, text), expire_minor_signups()
  from public, anon, authenticated, service_role;
grant execute on function my_parent_consent(), resend_parent_email(), set_parent_details(text, text, text, text),
  accept_minor_sign_up(uuid, text) to authenticated;
grant execute on function give_parent_consent(text, text, boolean, boolean, boolean, text) to anon, authenticated;
grant execute on function claim_consent_codes(int), finish_consent_codes(uuid, uuid[], uuid[], uuid[], jsonb) to service_role;
-- What those two use (they run as the service role, as 0043's queue functions do).
grant execute on function minor_mail_limits(), parent_address_hash(text), parent_mails_today(text), consent_mail_ready(minor_signups)
  to service_role;

-- ---------------------------------------------------------------- descriptions
comment on table minor_signups is 'A child''s sign-up at home (under 18): the parent''s name, relation, email and phone, the email with the hashed 6-digit code, and the parent''s consent from the consent page. Deleted at Accept (then guardians + consents), after 30 days unanswered, or 180 days unaccepted (0051, docs/DECISIONS.md #399).';
comment on table parent_mail_log is 'Consent emails handed to Brevo in the last two days (address hashed), for the per-address and app-wide daily limits (0051).';
comment on function minor_mail_limits() is 'The limits of the parent consent emails and codes (0051): per sign-up, per address a day, app-wide a day, minutes between requests, code days and tries, days unanswered.';
comment on function parent_address_hash(text) is 'Internal: sha256 of a lower-case email address (0051).';
comment on function parent_mails_today(text) is 'Internal: consent emails sent today (India time) to one address, or to everyone (0051).';
comment on function clean_parent_details(text, text, text, text, text) is 'Internal: checks and cleans a parent''s name, relation, email and phone for a child''s sign-up (0051).';
comment on function handle_new_user() is 'Trigger on auth.users: a new login gets a pending profile with its sign-up details; a child under 18 who gave a parent''s details keeps the date of birth and a parent-consent request (0051); linked at once when the email is already confirmed.';
comment on function guard_minor_signup_details() is 'Trigger: About you is refused for a child whose parent has not consented yet (0051).';
comment on function my_parent_consent() is 'The waiting child: the parent-consent request (needs_parent, awaiting_parent, consented) with the email''s state; null for anyone else (0051).';
comment on function resend_parent_email() is 'The waiting child: asks for a new email with a new code to the parent (limits: 10 minutes apart, 5 per sign-up, 3 a day per address) (0051).';
comment on function set_parent_details(text, text, text, text) is 'The waiting child under 18: gives or corrects the parent''s details before consent, and asks for a new email (0051).';
comment on function consent_mail_ready(minor_signups) is 'Internal: the consent email of this request may go now (0051).';
comment on function consent_mails_due() is 'Internal: a consent email may go now and today''s app-wide limit has room (0051).';
comment on function claim_consent_codes(int) is 'Edge Function only: claims ready consent emails, makes a new hashed code for each, and returns what each email needs, the code included (0051).';
comment on function finish_consent_codes(uuid, uuid[], uuid[], uuid[], jsonb) is 'Edge Function only: records sent, skipped (dry run), retry and refused consent emails of one claim (0051).';
comment on function send_parent_notices() is 'Every minute (pg_cron mridanga-parent-notices): calls the Edge Function notify-parents when a parent notice waits (while switched on) or a consent email waits (0043, 0051); answers off, nothing_due, not_set_up or called.';
comment on function give_parent_consent(text, text, boolean, boolean, boolean, text) is 'The consent page (anyone): the parent''s email, the code, the two declarations and the photo choice; answers consented, already, wrong, too_many, expired, closed, child_signed_in or declaration_required (0051).';
comment on function waiting_sign_ups() is 'C2 (staff): confirmed sign-ups waiting for the desk, with what they gave, the notice version they ticked (#280) and a child''s parent-consent request (0051).';
comment on function guard_consent_guardian() is 'Trigger: a consent''s guardian belongs to the same student (#272); an email-code consent only from accept_minor_sign_up (0051).';
comment on function accept_minor_sign_up(uuid, text) is 'Staff (a coordinator: own centre): registers a child under 18 whose parent consented by email, with the ID seen: the student linked to the child''s login, the guardian and the email-code consents; a second call returns the first record (repeated) (0051).';
comment on function expire_minor_signups() is 'Daily (pg_cron mridanga-minor-signups): deletes parent-consent requests unanswered for 30 days, or consented and not accepted for 180 days (0051).';
