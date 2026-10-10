-- Mridanga Seva — 0043: check-in / check-out emails to a minor's parent. Run once, after 0040 (and
-- 0042 if it exists; this file does not depend on it), in the Supabase SQL editor (TEST first),
-- then deploy the Edge Function notify-parents (docs/OPERATIONS.md "Parent notices by email").
-- Why: docs/DECISIONS.md #224-#231. How: docs/DATABASE.md "Parent notices (0043)".
--
-- Nothing is sent until the Guru switches parent_notices_enabled on (G10). Old app builds keep
-- working: they neither see nor need the new settings and functions.
--
-- 1. Settings: parent_notices_enabled (false), parent_notices_check_out (true: check-outs too),
--    parent_notice_contact (the class desk's phone or email for the email's last line, '').
-- 2. guardians.notices_stopped_at (the parent said stop: from the desk or the email's one-click
--    unsubscribe) and guardians.notice_language (en / te / hi; empty = the child's app language).
-- 3. parent_notices: the queue. A trigger on visits adds one row per guardian email when a minor
--    with a current data consent is checked in or out (QR, door tablet, coordinator tap, Check out
--    all) or the hourly job closes a visit nobody checked out. Never a location, never a photo
--    (#212): a row holds only the visit, the guardian, what happened and when.
-- 4. The every-minute job send_parent_notices() calls the Edge Function notify-parents when a row
--    waits; the function claims rows (claim_parent_notices), emails them through Brevo, and records
--    each (finish_parent_notices). Without a Brevo key it is a dry run: rows end as skipped.
-- 5. Staff see per guardian whether notices go (guardian_notice_status) and switch them off or on,
--    with the language (set_guardian_notices). Rows are deleted after 30 days.
-- Safe to run twice.

-- ---------------------------------------------------------------- 1. settings
insert into settings (key, value) values
  ('parent_notices_enabled', 'false'),
  ('parent_notices_check_out', 'true'),
  ('parent_notice_contact', '""')
on conflict (key) do nothing;

-- guard_setting is 0026's with the three new keys; a later migration that replaces it must keep them.
create or replace function guard_setting() returns trigger
language plpgsql set search_path = public as $$
declare
  v_int int;
  v_range int4range;
begin
  if tg_op = 'DELETE' then
    if current_user in ('anon', 'authenticated') then raise exception 'setting_required'; end if;
    return old;
  end if;
  v_range := case new.key
    when 'irregular_days'        then int4range(3, 90, '[]')
    when 'inactive_days'         then int4range(7, 365, '[]')
    when 'call_due_days'         then int4range(1, 14, '[]')
    when 'retry_days'            then int4range(1, 14, '[]')
    when 'max_retries'           then int4range(1, 10, '[]')
    when 'new_joiner_weeks'      then int4range(1, 12, '[]')
    when 'promotion_syllabus_percent' then int4range(0, 100, '[]')
    when 'promotion_min_visits'  then int4range(0, 100, '[]')
    when 'promotion_visit_weeks' then int4range(1, 52, '[]')
    when 'promotion_min_feedback' then int4range(1, 10, '[]')
    when 'fund_approval_rupees'  then int4range(0, 1000000, '[]')
    when 'fund_bill_rupees'      then int4range(0, 1000000, '[]')
  end;
  if v_range is not null then
    begin
      v_int := (new.value #>> '{}')::int;
    exception when others then
      v_int := null;
    end;
    if jsonb_typeof(new.value) <> 'number' or v_int is null or not v_range @> v_int then
      raise exception 'setting_invalid' using detail = format('%s is a whole number in %s.', new.key, v_range);
    end if;
    new.value := to_jsonb(v_int);
  elsif new.key = 'week_starts' then
    if new.value #>> '{}' not in ('monday', 'rolling7') or jsonb_typeof(new.value) <> 'string' then
      raise exception 'setting_invalid' using detail = 'week_starts is "monday" or "rolling7".';
    end if;
  elsif new.key in ('promotion_needs_level_up', 'parent_notices_enabled', 'parent_notices_check_out') then
    if jsonb_typeof(new.value) <> 'boolean' then
      raise exception 'setting_invalid' using detail = format('%s is true or false.', new.key);
    end if;
  elsif new.key = 'call_reasons' then
    if jsonb_typeof(new.value) <> 'array' then
      raise exception 'setting_invalid' using detail = 'call_reasons is a list of codes.';
    end if;
  elsif new.key in ('ig_translator', 'parent_notice_contact') then
    if jsonb_typeof(new.value) <> 'string' or char_length(btrim(new.value #>> '{}')) > 100 then
      raise exception 'setting_invalid' using detail = format('%s is a text of at most 100 characters.', new.key);
    end if;
    new.value := to_jsonb(btrim(new.value #>> '{}'));
  elsif current_user in ('anon', 'authenticated') then
    raise exception 'setting_unknown' using detail = format('%s is not a setting the app knows.', new.key);
  end if;
  return new;
end $$;

-- A yes/no setting; null when it is missing or not true/false.
create or replace function setting_flag(k text) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select case when jsonb_typeof(value) = 'boolean' then (value #>> '{}')::boolean end from settings where key = k
$$;

-- ---------------------------------------------------------------- 2. guardians
alter table guardians add column if not exists notices_stopped_at timestamptz;
alter table guardians add column if not exists notice_language text;
alter table guardians drop constraint if exists guardians_notice_language_check;
alter table guardians add constraint guardians_notice_language_check
  check (notice_language is null or notice_language in ('en', 'te', 'hi'));

-- ---------------------------------------------------------------- 3. the queue
-- Written only by the trigger and the functions below; closed to every app role. A row waits while
-- outcome is empty and next_try_at has come. outcome: sent, skipped (dry run: no Brevo key),
-- switched_off, stopped (the parent said stop), not_eligible (no email, no consent, withdrawn, now
-- an adult), expired (over 6 hours old), gave_up (5 tries), or Brevo's refusal code.
create table if not exists parent_notices (
  id           bigint generated always as identity primary key,
  visit_id     bigint not null references visits (id) on delete cascade,
  guardian_id  uuid not null references guardians (id) on delete cascade,
  kind         text not null check (kind in ('in', 'out', 'no_checkout')),
  event_at     timestamptz not null,
  created_at   timestamptz not null default now(),
  next_try_at  timestamptz not null default now(),
  claimed_by   uuid,
  tries        smallint not null default 0,
  done_at      timestamptz,
  outcome      text check (char_length(outcome) <= 40),
  unique (visit_id, guardian_id, kind)
);
create index if not exists parent_notices_waiting_idx on parent_notices (next_try_at) where outcome is null;
create index if not exists parent_notices_created_idx on parent_notices (created_at);
create index if not exists parent_notices_guardian_idx on parent_notices (guardian_id);
alter table parent_notices enable row level security;
revoke all on parent_notices from public, anon, authenticated;

-- One row: what the every-minute job and the Edge Function last did (like push_status, 0031).
create table if not exists parent_notice_status (
  id               boolean primary key default true check (id),
  last_job_at      timestamptz,
  last_job_result  text,
  last_run_at      timestamptz,
  last_run         jsonb
);
insert into parent_notice_status default values on conflict (id) do nothing;
alter table parent_notice_status enable row level security;
revoke all on parent_notice_status from public, anon, authenticated;

-- Why a guardian of this student gets no notice now: null = they do. Used by the trigger, the claim
-- and the staff view, so all three agree.
create or replace function parent_notice_block(p_student uuid, p_guardian uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when not coalesce(setting_flag('parent_notices_enabled'), false) then 'switched_off'
    when s.id is null or g.id is null then 'not_eligible'
    when s.withdrawn_at is not null then 'withdrawn'
    when not coalesce(is_minor(s), false) then 'adult'
    when not exists (select 1 from consents c where c.student_id = s.id and c.scope = 'data' and c.revoked_at is null)
      then 'no_consent'
    when nullif(btrim(g.email), '') is null then 'no_email'
    -- One address, one choice: a stop on any guardian row with this email (a parent added twice) counts.
    when exists (select 1 from guardians g2 where g2.student_id = g.student_id and g2.notices_stopped_at is not null
                   and lower(btrim(g2.email)) = lower(btrim(g.email))) then 'stopped'
  end
    from (select 1) one
    left join students s on s.id = p_student
    left join guardians g on g.id = p_guardian and g.student_id = s.id
$$;

-- Trigger on visits. A check-in queues 'in'; a check-out 'out' (when parent_notices_check_out);
-- the hourly close of a visit nobody checked out (no app user signed in, at the closing time)
-- 'no_checkout'. Not news, so nothing: a visit typed in later (check-in over 10 minutes ago), a
-- time corrected afterwards, an old day's visit closed by the next check-in. Guardians sharing one
-- email get one email, on the row of the guardian who gave the consent if that is one of them. A repeated scan (0038's 30 seconds) writes no visit, so it queues nothing.
create or replace function queue_parent_notices() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_kind text;
  v_at   timestamptz;
begin
  if not coalesce(setting_flag('parent_notices_enabled'), false) then return null; end if;
  if tg_op = 'INSERT' then
    if new.check_out is not null or new.check_in < now() - interval '10 minutes' or new.check_in > now() + interval '1 minute' then
      return null;
    end if;
    v_kind := 'in';
    v_at := new.check_in;
  else
    if old.check_out is not null or new.check_out is null
       or not coalesce(setting_flag('parent_notices_check_out'), true) then
      return null;
    end if;
    if new.check_out > now() - interval '10 minutes' and new.check_out <= now() + interval '1 minute' then
      v_kind := 'out';
    elsif auth.uid() is null and new.check_out > now() - interval '6 hours' then
      v_kind := 'no_checkout';
    else
      return null;
    end if;
    v_at := new.check_out;
  end if;

  insert into parent_notices (visit_id, guardian_id, kind, event_at)
  select distinct on (lower(btrim(g.email))) new.id, g.id, v_kind, v_at
    from guardians g
   where g.student_id = new.student_id
     and parent_notice_block(new.student_id, g.id) is null
   order by lower(btrim(g.email)),
            exists (select 1 from consents c where c.guardian_id = g.id) desc, g.id
  on conflict (visit_id, guardian_id, kind) do nothing;
  return null;
end $$;

drop trigger if exists visits_parent_notices on visits;
create trigger visits_parent_notices after insert or update of check_out on visits
  for each row execute function queue_parent_notices();

-- ---------------------------------------------------------------- 4. sending
-- For the Edge Function (service role). Each run:
--  a. deletes rows older than 30 days;
--  b. ends waiting rows that may no longer go: switched off, the parent said stop, no longer
--     eligible, over 6 hours old (expired: a late "arrived" is worse than none), or claimed 5 times;
--  c. claims up to p_limit (at most 100) waiting rows, under today's cap of 200 sent (Brevo's free
--     plan sends 300 a day, the Ishtagoshti parent codes take up to 100): a new claim id, one more
--     try, a 5-minute lease;
--  d. returns what the email needs, and nothing more: the address, the language, the student's
--     name, the centre, the local date and time, how the check-in was marked, the class contact.
create or replace function claim_parent_notices(p_limit int default 50)
returns table (claim uuid, notice_id bigint, guardian_id uuid, kind text, email text, language text,
               student_name text, centre text, event_date text, event_time text, method text, contact text)
language plpgsql volatile set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_claim uuid := gen_random_uuid();
  v_room  int;
begin
  delete from parent_notices p where p.created_at < now() - interval '30 days';

  update parent_notices p
     set done_at = now(),
         outcome = case
                     when b.block in ('switched_off', 'stopped') then b.block
                     when b.block is not null then 'not_eligible'
                     when p.event_at <= now() - interval '6 hours' then 'expired'
                     else 'gave_up'
                   end
    from (select p2.id, parent_notice_block(v.student_id, p2.guardian_id) as block
            from parent_notices p2 left join visits v on v.id = p2.visit_id
           where p2.outcome is null) b
   where p.id = b.id and p.outcome is null and p.next_try_at <= now()
     and (b.block is not null or p.event_at <= now() - interval '6 hours' or p.tries >= 5);

  v_room := greatest(0, least(coalesce(p_limit, 50), 100, 200 - (
    select count(*) from parent_notices s
     where s.outcome = 'sent' and s.done_at >= (today_ist() at time zone 'Asia/Kolkata'))::int));

  return query
  with picked as (
    select w.id from parent_notices w
     where w.outcome is null and w.next_try_at <= now()
     order by w.id
     limit v_room
     for update skip locked
  ), claimed as (
    update parent_notices q
       set claimed_by = v_claim, tries = q.tries + 1, next_try_at = now() + interval '5 minutes'
      from picked
     where q.id = picked.id
    returning q.id, q.visit_id, q.guardian_id, q.kind, q.event_at
  )
  select v_claim, c.id, c.guardian_id, c.kind, btrim(g.email),
         coalesce(g.notice_language, pr.language, 'en'),
         s.full_name, ce.name,
         to_char(c.event_at at time zone ce.time_zone, 'YYYY-MM-DD'),
         to_char(c.event_at at time zone ce.time_zone, 'HH24:MI'),
         v.method::text,
         coalesce((select st.value #>> '{}' from settings st where st.key = 'parent_notice_contact'), '')
    from claimed c
    join guardians g on g.id = c.guardian_id
    join visits v on v.id = c.visit_id
    join students s on s.id = v.student_id
    join centres ce on ce.id = v.centre_id
    left join profiles pr on pr.id = s.profile_id
   order by c.id;
end $$;

-- Records what became of the rows of one claim; rows of another claim are left alone (as 0031).
--   p_sent     Brevo accepted them.        p_skipped  dry run (no Brevo key or no sender).
--   p_retry    try again 2, 8, 18, 32 minutes after the 1st-4th try.
--   p_refused  {"<row id>": "<reason>"}: never tried again.
--   p_summary  the run's counts, kept in parent_notice_status.last_run.
create or replace function finish_parent_notices(p_claim uuid, p_sent bigint[], p_skipped bigint[], p_retry bigint[],
                                                 p_refused jsonb, p_summary jsonb) returns void
language plpgsql volatile set search_path = public, pg_temp as $$
begin
  update parent_notices set done_at = now(), outcome = 'sent'
   where id = any (coalesce(p_sent, '{}')) and claimed_by = p_claim and outcome is null;
  update parent_notices set done_at = now(), outcome = 'skipped'
   where id = any (coalesce(p_skipped, '{}')) and claimed_by = p_claim and outcome is null;
  update parent_notices
     set next_try_at = now() + tries * tries * interval '2 minutes',
         done_at = case when tries >= 5 then now() end,
         outcome = case when tries >= 5 then 'gave_up' end
   where id = any (coalesce(p_retry, '{}')) and claimed_by = p_claim and outcome is null;
  update parent_notices q set done_at = now(), outcome = left(r.value, 40)
    from jsonb_each_text(coalesce(p_refused, '{}'::jsonb)) r
   where r.key ~ '^[0-9]+$' and q.id = r.key::bigint and q.claimed_by = p_claim and q.outcome is null;
  update parent_notice_status set last_run_at = now(), last_run = p_summary where id;
end $$;

-- The email's one-click unsubscribe (the Edge Function checks the link's signature first): this
-- address gets no more notices, for any child (every guardian row with the same email is stopped),
-- and waiting ones are not sent. Returns false for an unknown id.
create or replace function stop_parent_notices(p_guardian uuid) returns boolean
language plpgsql volatile set search_path = public, pg_temp as $$
declare v_email text;
begin
  select lower(btrim(email)) into v_email from guardians where id = p_guardian;
  if not found then return false; end if;
  update guardians set notices_stopped_at = now()
   where (id = p_guardian or lower(btrim(email)) = v_email) and notices_stopped_at is null;
  update parent_notices p set done_at = now(), outcome = 'stopped'
    from guardians g
   where g.id = p.guardian_id and (g.id = p_guardian or lower(btrim(g.email)) = v_email) and p.outcome is null;
  return true;
end $$;

-- Every minute (pg_cron mridanga-parent-notices): asks the Edge Function when a row waits. Answers
-- off (switched off: waiting rows are ended by the next run once switched on, or by the purge),
-- nothing_due, not_set_up (pg_net or the Vault secrets of push step 8 missing) or called.
create or replace function send_parent_notices() returns text
language plpgsql volatile set search_path = public, pg_temp as $$
declare
  v_url    text;
  v_secret text;
  v_result text := 'not_set_up';
begin
  if not coalesce(setting_flag('parent_notices_enabled'), false) then
    v_result := 'off';
  elsif not exists (select 1 from parent_notices where outcome is null and next_try_at <= now()) then
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

select cron.schedule('mridanga-parent-notices', '* * * * *', 'select send_parent_notices()');

-- ---------------------------------------------------------------- 5. for staff (C8)
-- Per guardian of the student: whether notices go now and if not why (switched_off, withdrawn,
-- adult, no_consent, no_email, stopped), the language, and when the last one went. No name or
-- email (get_guardians gives those, logged). Staff only.
create or replace function guardian_notice_status(p_student uuid)
returns table (guardian_id uuid, block text, language text, stopped_at timestamptz, last_sent_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if not is_staff() then raise exception 'not_allowed' using errcode = '42501'; end if;
  return query
    select g.id, parent_notice_block(g.student_id, g.id), g.notice_language, g.notices_stopped_at,
           (select max(p.done_at) from parent_notices p where p.guardian_id = g.id and p.outcome = 'sent')
      from guardians g
     where g.student_id = p_student
     order by g.full_name, g.id;
end $$;

-- A coordinator or the Guru, when a parent asks: notices on or off for one guardian, and the
-- language (null = keep it; '' = the child's app language). Audited through guardians (0025).
-- Errors: not_allowed, guardian_not_found, language_invalid.
create or replace function set_guardian_notices(p_guardian uuid, p_on boolean, p_language text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_staff() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_language is not null and p_language not in ('', 'en', 'te', 'hi') then
    raise exception 'language_invalid' using detail = 'en, te, hi, or empty for the app language.';
  end if;
  update guardians
     set notices_stopped_at = case when p_on then null else coalesce(notices_stopped_at, now()) end,
         notice_language = case when p_language is null then notice_language else nullif(p_language, '') end
   where id = p_guardian;
  if not found then raise exception 'guardian_not_found'; end if;
  if p_on then
    -- The same address on another guardian row of this student (a parent added twice) is on again too.
    update guardians g set notices_stopped_at = null
      from guardians me
     where me.id = p_guardian and g.student_id = me.student_id and g.id <> me.id
       and lower(btrim(g.email)) = lower(btrim(me.email)) and g.notices_stopped_at is not null;
  else
    update parent_notices p set done_at = now(), outcome = 'stopped'
      from guardians g, guardians me
     where me.id = p_guardian and g.id = p.guardian_id and g.student_id = me.student_id
       and (g.id = me.id or lower(btrim(g.email)) = lower(btrim(me.email))) and p.outcome is null;
  end if;
end $$;

-- ---------------------------------------------------------------- who may run the new functions
-- docs/DECISIONS.md #14: the queue's functions for the Edge Function (service role) only; the job
-- and the trigger run as the owner; the two staff functions check the role inside.
revoke execute on function setting_flag(text), parent_notice_block(uuid, uuid), queue_parent_notices(),
  claim_parent_notices(int), finish_parent_notices(uuid, bigint[], bigint[], bigint[], jsonb, jsonb),
  stop_parent_notices(uuid), send_parent_notices(), guardian_notice_status(uuid),
  set_guardian_notices(uuid, boolean, text)
  from public, anon, authenticated, service_role;
grant execute on function claim_parent_notices(int), finish_parent_notices(uuid, bigint[], bigint[], bigint[], jsonb, jsonb),
  stop_parent_notices(uuid), parent_notice_block(uuid, uuid) to service_role;
grant execute on function guardian_notice_status(uuid), set_guardian_notices(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on table parent_notices is 'Check-in / check-out emails to a minor''s guardian waiting or done: visit, guardian, kind (in, out, no_checkout), when, outcome. Never a location or photo. Written by the visits trigger and the notice functions only; kept 30 days (0043, docs/DECISIONS.md #224-#231).';
comment on table parent_notice_status is 'One row: the last call of the every-minute parent-notice job and the last run of the Edge Function notify-parents (0043).';
comment on column guardians.notices_stopped_at is 'When the parent said stop to check-in / check-out emails (desk or one-click unsubscribe); null = they get them while notices are on (0043).';
comment on column guardians.notice_language is 'Language of the check-in / check-out emails: en, te, hi; null = the child''s app language, else English (0043).';
comment on function setting_flag(text) is 'Internal: a yes/no setting, null when missing (0043).';
comment on function parent_notice_block(uuid, uuid) is 'Internal: why this guardian of this student gets no check-in email now (switched_off, not_eligible, withdrawn, adult, no_consent, no_email, stopped); null = they do (0043).';
comment on function queue_parent_notices() is 'Trigger on visits: queues the check-in / check-out emails of a minor''s guardians when notices are on (0043).';
comment on function claim_parent_notices(int) is 'Edge Function only: purges rows over 30 days, ends rows that may no longer go, and claims up to p_limit waiting rows (daily cap 200 sent) with what each email needs (0043).';
comment on function finish_parent_notices(uuid, bigint[], bigint[], bigint[], jsonb, jsonb) is 'Edge Function only: records sent, skipped (dry run), retry and refused rows of one claim (0043).';
comment on function stop_parent_notices(uuid) is 'Edge Function only (signed one-click unsubscribe): the guardian gets no more check-in / check-out emails (0043).';
comment on function send_parent_notices() is 'Every minute (pg_cron mridanga-parent-notices): calls the Edge Function notify-parents when a parent notice waits; answers off, nothing_due, not_set_up or called (0043).';
comment on function guardian_notice_status(uuid) is 'C8, staff: per guardian of a student, why no check-in email goes (null = it does), the language, when stopped, the last one sent. No names or emails (0043).';
comment on function set_guardian_notices(uuid, boolean, text) is 'C8, staff: switches a guardian''s check-in / check-out emails on or off and sets their language. Errors: not_allowed, guardian_not_found, language_invalid (0043).';
