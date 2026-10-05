-- Mridanga Seva — 0027: Ishtagoshti part 2, free public sign-up (Phase 2, slice 7: screens I14, I15).
-- Run once, after 0026 (slice 9, the fund), in the Supabase SQL editor. Numbers reserved by the lead 05-10-2026.
-- Why: docs/DECISIONS.md #88. How: docs/DATABASE.md "Ishtagoshti subscribers (Phase 2)".
--
-- 1. A subscriber is NOT a new role. Anyone may already create a login (A1); it stays role 'pending',
--    which every rule of the app refuses. Joining Ishtagoshti (I14) adds a row to ig_subscribers, and
--    ig_reader() lets such a login read published slokas and themes and keep its own notes and ticks
--    — nothing else. So no existing policy has to learn a new role, and a subscriber who later joins
--    the class with the same email becomes a student by the usual link (0002) and keeps the notes.
-- 2. Age: the year of birth (and, in the year one turns 18, "have you had your 18th birthday?").
--    Under 18 needs the parent: name, email, relation; a 6-digit code goes to the parent's email and
--    reading opens only when the code is typed in (DPDP Rules 2025, rule 10: verifiable consent).
--    The email goes out from the database through pg_net to Brevo's mail API (like 0011's push
--    call); without the Vault secrets mridanga_brevo_key + mridanga_mail_from it reports not_set_up.
-- 3. I15 for the Guru only: the list, block / unblock, joins per week.
-- 4. Data kept to the minimum: subscribers are hidden from coordinators (profiles, memorised ticks);
--    leaving deletes the details, notes and ticks. The consent and notice texts are PLACEHOLDERS
--    until the team gives the wording (terms_version records which text the person agreed to).

-- ---------------------------------------------------------------- 1. tables
create table ig_subscribers (
  profile_id          uuid primary key references profiles (id) on delete cascade,
  birth_year          smallint,
  phone               text,
  minor               boolean not null,
  terms_version       text not null,
  joined_at           timestamptz not null default now(),
  parent_name         text,
  parent_email        text,
  parent_relation     text,
  parent_confirmed_at timestamptz,
  blocked_at          timestamptz,
  blocked_by          uuid references profiles (id) on delete set null,
  block_reason        text,
  -- A minor's parent details are required, unless they were wiped when a blocked person left.
  check (not minor or blocked_at is not null or (parent_name is not null and parent_email is not null)),
  check (blocked_at is not null or birth_year is not null)
);
create index ig_subscribers_joined_idx on ig_subscribers (joined_at);
alter table ig_subscribers enable row level security;
-- Read: the person's own row, and the Guru. Written only by the functions below.
create policy own_or_guru on ig_subscribers for select to authenticated using (profile_id = auth.uid() or is_guru());
revoke all on ig_subscribers from public, anon;
revoke insert, update, delete, truncate, references, trigger on ig_subscribers from authenticated;

-- The parent's code, hashed. Nobody outside the functions below reads it (no policy, no grant).
create table ig_parent_codes (
  profile_id  uuid primary key references ig_subscribers (profile_id) on delete cascade,
  code_hash   text not null,
  sent_at     timestamptz not null default now(),
  expires_at  timestamptz not null,
  tries       smallint not null default 0,
  sends_day   date not null default today_ist(),
  sends       smallint not null default 1
);
alter table ig_parent_codes enable row level security;
revoke all on ig_parent_codes from public, anon, authenticated;

-- ---------------------------------------------------------------- 2. who reads
-- A public subscriber: a login with no class role ('pending', switched on) that joined Ishtagoshti.
create or replace function is_public_subscriber(p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ig_subscribers s join profiles p on p.id = s.profile_id
                  where s.profile_id = p_profile and p.role = 'pending')
$$;

-- Guru, coordinators and students as before (0021); now also a subscriber who is not blocked and,
-- when under 18, whose parent has confirmed. Security definer: it reads ig_subscribers.
create or replace function ig_reader() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_role() in ('guru', 'coordinator', 'student'), false)
      or coalesce(my_role() = 'pending' and exists (
           select 1 from ig_subscribers s
            where s.profile_id = auth.uid() and s.blocked_at is null
              and (not s.minor or s.parent_confirmed_at is not null)), false)
$$;

-- Coordinators no longer see public subscribers: not their profile (name, email, phone) and not
-- their memorised ticks. The person and the Guru still do.
drop policy own_or_staff on profiles;
create policy own_or_staff on profiles for select to authenticated using (
  id = auth.uid() or is_guru() or (is_staff() and not is_public_subscriber(id)));
drop policy own_or_staff on ig_memorised;
create policy own_or_staff on ig_memorised for select to authenticated using (
  profile_id = auth.uid() or is_guru() or (is_staff() and not is_public_subscriber(profile_id)));

-- 0001 let ANY signed-in login read settings, centres, levels and the syllabus (using true), so also a
-- login still waiting for a role, and now the public. Only logins with a class role read them now
-- (found by the smoke test's subscriber sweep). The kiosk role is kept for the door tablet.
create or replace function has_class_role() returns boolean
language sql stable set search_path = public as $$
  select coalesce(my_role() in ('guru', 'coordinator', 'student', 'kiosk'), false)
$$;
drop policy read_all on settings;
drop policy read_all on centres;
drop policy read_all on levels;
drop policy read_all on syllabus_items;
create policy read_all on settings       for select to authenticated using (has_class_role());
create policy read_all on centres        for select to authenticated using (has_class_role());
create policy read_all on levels         for select to authenticated using (has_class_role());
create policy read_all on syllabus_items for select to authenticated using (has_class_role());

-- ---------------------------------------------------------------- 3. joining (I14)
-- The caller's state: none, awaiting_parent, active or blocked, with what the join screen shows.
-- The block reason is for the Guru only.
create or replace function ig_my_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object(
             'state', case when s.blocked_at is not null then 'blocked'
                           when s.minor and s.parent_confirmed_at is null then 'awaiting_parent'
                           else 'active' end,
             'minor', s.minor, 'birth_year', s.birth_year, 'phone', s.phone, 'joined_at', s.joined_at,
             'parent_name', s.parent_name, 'parent_email', s.parent_email, 'parent_relation', s.parent_relation,
             'code_sent_at', c.sent_at)
      from ig_subscribers s left join ig_parent_codes c on c.profile_id = s.profile_id
     where s.profile_id = auth.uid()), jsonb_build_object('state', 'none'))
$$;

-- I14: join, or correct the details while the parent has not confirmed yet. Only a login without a
-- class role whose email is confirmed. Error codes: not_pending, email_not_confirmed, blocked,
-- already_joined, age_change_not_allowed, birth_year_invalid, phone_invalid, terms_required, parent_name_invalid,
-- parent_email_invalid, parent_email_own, parent_relation_invalid. Returns ig_my_state().
create or replace function ig_join(
  p_birth_year      int,
  p_terms_version   text,
  p_turned_18       boolean default false,
  p_phone           text default null,
  p_parent_name     text default null,
  p_parent_email    text default null,
  p_parent_relation text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_year  int := extract(year from today_ist())::int;
  v_age   int;
  v_minor boolean;
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_pname text := nullif(btrim(coalesce(p_parent_name, '')), '');
  v_pmail text := lower(nullif(btrim(coalesce(p_parent_email, '')), ''));
  v_prel  text := nullif(btrim(coalesce(p_parent_relation, '')), '');
  v_own   text;
  v_row   ig_subscribers;
begin
  if coalesce(my_role() <> 'pending', true) then raise exception 'not_pending' using errcode = '42501'; end if;
  select lower(email) into v_own from auth.users where id = v_me and email_confirmed_at is not null;
  if v_own is null then raise exception 'email_not_confirmed' using errcode = '42501'; end if;
  select * into v_row from ig_subscribers where profile_id = v_me;
  if v_row.blocked_at is not null then raise exception 'blocked' using errcode = '42501'; end if;
  if found and (not v_row.minor or v_row.parent_confirmed_at is not null) then
    raise exception 'already_joined';
  end if;
  if p_birth_year is null or p_birth_year < v_year - 120 or p_birth_year > v_year - 5 then
    raise exception 'birth_year_invalid';
  end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9][0-9 -]{5,18}[0-9]$' then raise exception 'phone_invalid'; end if;
  if nullif(btrim(coalesce(p_terms_version, '')), '') is null or char_length(p_terms_version) > 40 then
    raise exception 'terms_required';
  end if;
  v_age := v_year - p_birth_year;
  v_minor := v_age < 18 or (v_age = 18 and not coalesce(p_turned_18, false));
  -- Once under 18 was given, a new year of birth cannot skip the parent (the Guru can help).
  if v_row.minor and not v_minor then raise exception 'age_change_not_allowed'; end if;
  if v_minor then
    if v_pname is null or char_length(v_pname) > 100 then raise exception 'parent_name_invalid'; end if;
    if v_pmail is null or char_length(v_pmail) > 254 or v_pmail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'parent_email_invalid';
    end if;
    if v_pmail = v_own then raise exception 'parent_email_own'; end if;
    if v_prel is not null and char_length(v_prel) > 40 then raise exception 'parent_relation_invalid'; end if;
  else
    v_pname := null; v_pmail := null; v_prel := null;
  end if;

  insert into ig_subscribers (profile_id, birth_year, phone, minor, terms_version,
                              parent_name, parent_email, parent_relation)
  values (v_me, p_birth_year, v_phone, v_minor, btrim(p_terms_version), v_pname, v_pmail, v_prel)
  on conflict (profile_id) do update
     set birth_year = excluded.birth_year, phone = excluded.phone, minor = excluded.minor,
         terms_version = excluded.terms_version, parent_name = excluded.parent_name,
         parent_email = excluded.parent_email, parent_relation = excluded.parent_relation;
  -- Changed details: an old code (perhaps sent to another address) no longer counts. The day's
  -- send count is kept, so changing the address does not reset the limit.
  update ig_parent_codes set code_hash = '-', expires_at = now() where profile_id = v_me;
  return ig_my_state();
end $$;

-- Makes a new 6-digit code for a subscriber, stores its hash for 24 hours and returns it. Internal:
-- only ig_send_parent_code (and the smoke test, as the owner) calls it.
create or replace function ig_new_parent_code(p_profile uuid) returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_code text := lpad(((('x' || substr(md5(gen_random_uuid()::text), 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0');
  v_hash text := encode(sha256(convert_to(p_profile::text || ':' || v_code, 'UTF8')), 'hex');
begin
  insert into ig_parent_codes (profile_id, code_hash, expires_at)
  values (p_profile, v_hash, now() + interval '24 hours')
  on conflict (profile_id) do update
     set code_hash = excluded.code_hash, expires_at = excluded.expires_at, sent_at = now(), tries = 0,
         sends = case when ig_parent_codes.sends_day = today_ist() then ig_parent_codes.sends + 1 else 1 end,
         sends_day = today_ist();
  return v_code;
end $$;

-- I14, a minor: emails a new code to the parent. At most one a minute and 3 a day per person, and
-- 100 a day for the whole app (Brevo's free plan sends 300). Returns 'sent', or 'not_set_up' when
-- pg_net or the Vault secrets are missing (nothing is stored then). Error codes: not_awaiting_parent,
-- code_too_soon, code_limit, code_daily_cap. The code itself never goes back to the app.
create or replace function ig_send_parent_code() returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_row   ig_subscribers;
  v_code  ig_parent_codes;
  v_child text;
  v_key   text;
  v_from  text;
  v_new   text;
  v_text  text;
begin
  select * into v_row from ig_subscribers where profile_id = v_me;
  if not found or coalesce(my_role() <> 'pending', true) or v_row.blocked_at is not null
     or not v_row.minor or v_row.parent_confirmed_at is not null then
    raise exception 'not_awaiting_parent' using errcode = '42501';
  end if;
  select * into v_code from ig_parent_codes where profile_id = v_me;
  if found and v_code.sent_at > now() - interval '1 minute' then raise exception 'code_too_soon'; end if;
  if found and v_code.sends_day = today_ist() and v_code.sends >= 3 then raise exception 'code_limit'; end if;
  if (select coalesce(sum(sends), 0) from ig_parent_codes where sends_day = today_ist()) >= 100 then
    raise exception 'code_daily_cap';
  end if;

  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'net' and p.proname = 'http_post')
     or to_regclass('vault.decrypted_secrets') is null then
    return 'not_set_up';
  end if;
  -- Read through dynamic SQL, so this function can be created before the Vault is there.
  execute $q$select max(decrypted_secret) filter (where name = 'mridanga_brevo_key'),
                    max(decrypted_secret) filter (where name = 'mridanga_mail_from')
               from vault.decrypted_secrets$q$
     into v_key, v_from;
  if v_key is null or v_from is null then return 'not_set_up'; end if;

  select nullif(btrim(full_name), '') into v_child from profiles where id = v_me;
  v_new := ig_new_parent_code(v_me);
  -- PLACEHOLDER wording (docs/DECISIONS.md #88): the team gives the real parent consent text.
  v_text := 'Dear ' || v_row.parent_name || E',\n\n'
    || coalesce(v_child, 'Your child') || ' (born ' || v_row.birth_year || ') has asked to join Ishtagoshti, '
    || E'the free sloka study of the Mridanga Seva app, and gave this email address as their parent''s.\n\n'
    || E'[TEST - the team''s parent consent wording comes here.]\n\n'
    || 'If you agree, give your child this code to type into the app: ' || v_new
    || E'\nIt works for 24 hours. If you do not agree, do nothing: nothing opens without the code.\n\nMridanga Seva';
  -- pg_net sends after this transaction ends; the answer stays in net._http_response for a while.
  execute $q$select net.http_post(
                url := 'https://api.brevo.com/v3/smtp/email',
                headers := jsonb_build_object('Content-Type', 'application/json', 'api-key', $1),
                body := $2,
                timeout_milliseconds := 30000)$q$
    using v_key, jsonb_build_object(
      'sender', jsonb_build_object('name', 'Mridanga Seva', 'email', v_from),
      'to', jsonb_build_array(jsonb_build_object('email', v_row.parent_email, 'name', v_row.parent_name)),
      'subject', 'Mridanga Seva: your child asks to join Ishtagoshti',
      'textContent', v_text);
  return 'sent';
end $$;

-- I14, a minor: types the parent's code. Returns 'confirmed', 'wrong', 'expired', 'too_many' (5 wrong
-- tries: ask for a new code) or 'no_code'. Answers instead of raising, so a wrong try is counted.
create or replace function ig_confirm_parent(p_code text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me   uuid := auth.uid();
  v_row  ig_subscribers;
  v_code ig_parent_codes;
begin
  select * into v_row from ig_subscribers where profile_id = v_me;
  if not found or coalesce(my_role() <> 'pending', true) or v_row.blocked_at is not null
     or not v_row.minor or v_row.parent_confirmed_at is not null then
    raise exception 'not_awaiting_parent' using errcode = '42501';
  end if;
  select * into v_code from ig_parent_codes where profile_id = v_me for update;
  if not found or v_code.code_hash = '-' then return 'no_code'; end if;
  if v_code.tries >= 5 then return 'too_many'; end if;
  if v_code.expires_at < now() then return 'expired'; end if;
  if encode(sha256(convert_to(v_me::text || ':' || btrim(coalesce(p_code, '')), 'UTF8')), 'hex') <> v_code.code_hash then
    update ig_parent_codes set tries = tries + 1 where profile_id = v_me;
    return 'wrong';
  end if;
  update ig_subscribers set parent_confirmed_at = now() where profile_id = v_me;
  delete from ig_parent_codes where profile_id = v_me;
  return 'confirmed';
end $$;

-- Leave Ishtagoshti: the details, notes and ticks are deleted. A blocked person's row stays with
-- only the block (so leaving does not undo it); their details, notes and ticks still go.
-- Only for public subscribers (a student's notes are theirs as a student). Error code: not_subscriber.
create or replace function ig_leave() returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if coalesce(my_role() <> 'pending', true) or not exists (select 1 from ig_subscribers where profile_id = v_me) then
    raise exception 'not_subscriber' using errcode = '42501';
  end if;
  delete from ig_notes where profile_id = v_me;
  delete from ig_memorised where profile_id = v_me;
  delete from ig_parent_codes where profile_id = v_me;
  delete from ig_subscribers where profile_id = v_me and blocked_at is null;
  update ig_subscribers
     set birth_year = null, phone = null, parent_name = null, parent_email = null, parent_relation = null
   where profile_id = v_me;
end $$;

-- ---------------------------------------------------------------- 4. the Guru's list (I15)
-- Newest first. in_class = the login has since become a student (or staff) and reads as such.
create or replace function ig_subscriber_list()
returns table (profile_id uuid, full_name text, email text, phone text, birth_year smallint, minor boolean,
               joined_at timestamptz, parent_name text, parent_email text, parent_relation text,
               parent_confirmed_at timestamptz, blocked_at timestamptz, block_reason text,
               in_class boolean, memorised int, notes int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  return query
    select s.profile_id, p.full_name, coalesce(p.email, u.email)::text, s.phone, s.birth_year, s.minor,
           s.joined_at, s.parent_name, s.parent_email, s.parent_relation, s.parent_confirmed_at,
           s.blocked_at, s.block_reason, p.role <> 'pending',
           (select count(*)::int from ig_memorised m where m.profile_id = s.profile_id),
           (select count(*)::int from ig_notes n where n.profile_id = s.profile_id)
      from ig_subscribers s
      join profiles p on p.id = s.profile_id
      left join auth.users u on u.id = s.profile_id
     order by s.joined_at desc;
end $$;

-- Joins per week (weeks start on Monday, India time), the last p_weeks weeks including empty ones.
create or replace function ig_subscriber_weeks(p_weeks int default 12)
returns table (week_start date, joins int)
language plpgsql stable security definer set search_path = public as $$
declare v_this date := date_trunc('week', today_ist())::date;
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  return query
    select w::date, (select count(*)::int from ig_subscribers s
                      where date_trunc('week', (s.joined_at at time zone 'Asia/Kolkata'))::date = w::date)
      from generate_series(v_this - 7 * (least(greatest(coalesce(p_weeks, 12), 1), 104) - 1), v_this, interval '7 days') as w
     order by 1;
end $$;

-- Block (with an optional reason, at most 200 characters) or unblock. Guru only.
-- Error codes: not_allowed, not_found, reason_too_long.
create or replace function ig_block_subscriber(p_profile uuid, p_blocked boolean, p_reason text default null) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if char_length(v_reason) > 200 then raise exception 'reason_too_long'; end if;
  if not exists (select 1 from ig_subscribers where profile_id = p_profile) then raise exception 'not_found'; end if;
  if p_blocked then
    update ig_subscribers set blocked_at = coalesce(blocked_at, now()), blocked_by = auth.uid(), block_reason = v_reason
     where profile_id = p_profile;
  else
    update ig_subscribers set blocked_at = null, blocked_by = null, block_reason = null
     where profile_id = p_profile and birth_year is not null;
    -- A blocked person who left has no details any more: unblocking removes the row (they may join again).
    delete from ig_subscribers where profile_id = p_profile and birth_year is null;
  end if;
end $$;

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14. ig_new_parent_code: nobody from outside. The rest: signed-in people; each
-- checks the caller inside.
revoke execute on function has_class_role(), is_public_subscriber(uuid), ig_new_parent_code(uuid), ig_my_state(),
  ig_join(int, text, boolean, text, text, text, text), ig_send_parent_code(), ig_confirm_parent(text), ig_leave(),
  ig_subscriber_list(), ig_subscriber_weeks(int), ig_block_subscriber(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function has_class_role(), is_public_subscriber(uuid), ig_my_state(),
  ig_join(int, text, boolean, text, text, text, text), ig_send_parent_code(), ig_confirm_parent(text), ig_leave(),
  ig_subscriber_list(), ig_subscriber_weeks(int), ig_block_subscriber(uuid, boolean, text)
  to authenticated;
-- ig_reader was replaced above; keep it out of anon's reach as 0021 did.
revoke execute on function ig_reader() from public, anon;
grant execute on function ig_reader() to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on table ig_subscribers is 'I14/I15: a public login (role pending) that joined Ishtagoshti for free: year of birth, optional phone, the terms version agreed, a minor''s parent and when the parent confirmed by the emailed code, the Guru''s block. docs/DECISIONS.md #88.';
comment on table ig_parent_codes is 'I14: the hashed 6-digit code emailed to a minor''s parent (24 hours, 5 tries, 3 sends a day). Read by no app user.';
comment on function has_class_role is 'True for a signed-in login with a class role (Guru, coordinator, student, door tablet): reads settings, centres, levels, syllabus.';
comment on function is_public_subscriber is 'True when the login joined Ishtagoshti and has no class role (pending).';
comment on function ig_reader is 'True for a signed-in login that reads Ishtagoshti: Guru, coordinator, student, or a public subscriber not blocked whose parent confirmed when under 18 (0027).';
comment on function ig_my_state is 'I14: the caller''s Ishtagoshti subscription: none, awaiting_parent, active or blocked, with the details they gave.';
comment on function ig_join is 'I14: a login without a class role and with a confirmed email joins Ishtagoshti (year of birth, optional phone, terms version; a minor''s parent).';
comment on function ig_new_parent_code is 'Internal: a new 6-digit parent code, stored hashed for 24 hours; returns the code.';
comment on function ig_send_parent_code is 'I14, minors: emails a new code to the parent through pg_net + Brevo (Vault secrets mridanga_brevo_key, mridanga_mail_from); returns sent or not_set_up.';
comment on function ig_confirm_parent is 'I14, minors: checks the parent''s code; confirmed, wrong, expired, too_many or no_code.';
comment on function ig_leave is 'I14: a public subscriber leaves; details, notes and ticks are deleted (a block stays).';
comment on function ig_subscriber_list is 'I15, Guru: every subscriber with their details, state and activity counts.';
comment on function ig_subscriber_weeks is 'I15, Guru: Ishtagoshti joins per week (Monday, India time).';
comment on function ig_block_subscriber is 'I15, Guru: block or unblock a subscriber, with an optional reason.';
