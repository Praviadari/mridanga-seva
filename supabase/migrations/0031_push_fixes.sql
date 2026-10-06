-- Mridanga Seva — 0031: push fixes (audit brief 11). Every push is now one row per phone in a
-- queue, sent, retried or given up on its own, so one bad phone token no longer stops the others,
-- a run that fails or stops half-way is retried without sending anyone the same push twice, and
-- the database keeps a small record of what the push job last did.
-- Run once, after 0029 (it does not depend on 0030), in the Supabase SQL editor (TEST first), then deploy the Edge Function
-- notify-announcements again (docs/OPERATIONS.md "Push notifications", step 10). In either order:
-- the old function keeps using claim_due_push / claim_push_outbox, which stay; the new one waits
-- (answers claim_failed, nothing is lost) until this file has run.
-- Why: docs/DECISIONS.md #112-#115. How: docs/DATABASE.md "Push queue (0031)".
--
-- 1. push_queue: one row per phone and notification, filled from announcements (0011) and
--    push_outbox (0016) when they fall due (#112).
-- 2. claim_push_queue() hands the Edge Function up to 500 waiting rows under a claim id with a
--    5-minute lease; finish_push() records per row: sent, try again later, or refused. A row whose
--    run stopped is claimed again when its lease ends; a late finish of an old claim changes
--    nothing (#113).
-- 3. Only tokens Expo calls DeviceNotRegistered are deleted (#114).
-- 4. The job calls the function only with an https://<ref>.supabase.co address and a secret of at
--    least 32 characters, and push_status records the last job call and the last run (#115).

-- ---------------------------------------------------------------- 1. the queue
-- Written only by the functions below. A row is waiting while sent_at and failed are both empty;
-- next_try_at is when it may be claimed (now, after a lease, or after a failed try). Rows are
-- kept 3 days for checking (docs/OPERATIONS.md), then deleted by the next run.
create table push_queue (
  id               bigint generated always as identity primary key,
  announcement_id  bigint references announcements (id) on delete cascade,
  outbox_id        bigint references push_outbox (id) on delete cascade,
  profile_id       uuid not null references profiles (id) on delete cascade,
  token            text not null,
  title            text not null,
  body             text not null,
  role             text,
  url              text,
  created_at       timestamptz not null default now(),
  next_try_at      timestamptz not null default now(),
  claimed_by       uuid,
  tries            smallint not null default 0,
  sent_at          timestamptz,
  failed           text,
  check (num_nonnulls(announcement_id, outbox_id) = 1)
);
create index push_queue_waiting_idx on push_queue (next_try_at) where sent_at is null and failed is null;
create index push_queue_created_idx on push_queue (created_at);
alter table push_queue enable row level security;
revoke all on push_queue from public, anon, authenticated;

-- One row: what the every-minute job and the Edge Function last did (D2-07, R2G3-03).
create table push_status (
  id               boolean primary key default true check (id),
  last_job_at      timestamptz,
  last_job_result  text,
  last_run_at      timestamptz,
  last_run         jsonb
);
insert into push_status default values;
alter table push_status enable row level security;
revoke all on push_status from public, anon, authenticated;

-- ---------------------------------------------------------------- 2. claiming and finishing
-- For the Edge Function (service role). Each run:
--  a. deletes queue rows older than 3 days;
--  b. queues the due announcements (published, not yet notified; older than a day = marked, not
--     sent, as in 0011) for each phone of announcement_audience, and the waiting push_outbox
--     notices (0016) for each phone of their person;
--  c. gives up on waiting rows whose token was deleted or moved to another login since
--     (token_gone: signed out, switched off, erased), that are more than a day old (expired), or
--     that were claimed 5 times (gave_up);
--  d. claims up to 500 waiting rows: a new claim id, one more try, and a 5-minute lease.
-- Two runs at once never claim the same row (for update skip locked), and the announcement and
-- outbox updates lock their rows, so the second run finds them already queued.
create or replace function claim_push_queue()
returns table (claim uuid, message_id bigint, announcement_id bigint, title text, body text,
               token text, role text, url text)
language plpgsql volatile set search_path = public as $$
#variable_conflict use_column
declare
  v_claim uuid := gen_random_uuid();
begin
  delete from push_queue q where q.created_at < now() - interval '3 days';

  with due as (
    update announcements a set notified_at = now()
     where a.notified_at is null and a.publish_at <= now()
    returning a.id, a.title, a.body, a.publish_at
  )
  insert into push_queue (announcement_id, profile_id, token, title, body, role)
  select d.id, aa.profile_id, t.token, d.title, left(d.body, 180), aa.role::text
    from due d
    join announcement_audience aa on aa.announcement_id = d.id
    join push_tokens t on t.profile_id = aa.profile_id
   where d.publish_at > now() - interval '1 day';

  with due as (
    update push_outbox o set sent_at = now()
     where o.sent_at is null
    returning o.id, o.profile_id, o.title, o.body, o.url, o.created_at
  )
  insert into push_queue (outbox_id, profile_id, token, title, body, url)
  select d.id, d.profile_id, t.token, d.title, d.body, d.url
    from due d join push_tokens t on t.profile_id = d.profile_id
   where d.created_at > now() - interval '1 day';

  update push_queue q
     set failed = case
                    when not exists (select 1 from push_tokens t where t.token = q.token and t.profile_id = q.profile_id)
                      then 'token_gone'
                    when q.created_at <= now() - interval '1 day' then 'expired'
                    else 'gave_up'
                  end
   where q.sent_at is null and q.failed is null and q.next_try_at <= now()
     and (q.tries >= 5 or q.created_at <= now() - interval '1 day'
          or not exists (select 1 from push_tokens t where t.token = q.token and t.profile_id = q.profile_id));

  return query
  with picked as (
    select w.id from push_queue w
     where w.sent_at is null and w.failed is null and w.next_try_at <= now()
     order by w.id
     limit 500
     for update skip locked
  ), claimed as (
    update push_queue q
       set claimed_by = v_claim, tries = q.tries + 1, next_try_at = now() + interval '5 minutes'
      from picked
     where q.id = picked.id
    returning q.id, q.announcement_id, q.title, q.body, q.token, q.role, q.url
  )
  select v_claim, c.id, c.announcement_id, c.title, c.body, c.token, c.role, c.url from claimed c;
end $$;

-- Records what became of the rows of one claim. Rows of another claim (a run whose lease ended
-- and whose rows were claimed again) are left alone, so a late answer cannot re-queue or confirm
-- them (R2G3-05).
--   p_sent     Expo accepted them.
--   p_retry    to try again: 2, 8, 18, 32 minutes after the 1st-4th try; after the 5th, gave_up.
--   p_refused  {"<row id>": "<reason>"}: never tried again (for example DeviceNotRegistered,
--              OtherProject, MessageTooBig, bad_url). DeviceNotRegistered also deletes the token,
--              if it still belongs to the same login.
--   p_summary  the run's counts, kept in push_status.last_run.
create or replace function finish_push(p_claim uuid, p_sent bigint[], p_retry bigint[], p_refused jsonb,
                                       p_summary jsonb) returns void
language plpgsql volatile set search_path = public as $$
begin
  update push_queue set sent_at = now()
   where id = any (coalesce(p_sent, '{}')) and claimed_by = p_claim and sent_at is null and failed is null;

  update push_queue
     set next_try_at = now() + tries * tries * interval '2 minutes',
         failed = case when tries >= 5 then 'gave_up' end
   where id = any (coalesce(p_retry, '{}')) and claimed_by = p_claim and sent_at is null and failed is null;

  update push_queue q set failed = left(r.value, 40)
    from jsonb_each_text(coalesce(p_refused, '{}'::jsonb)) r
   where r.key ~ '^[0-9]+$' and q.id = r.key::bigint and q.claimed_by = p_claim
     and q.sent_at is null and q.failed is null;

  delete from push_tokens t
   using push_queue q
   where q.claimed_by = p_claim and q.failed = 'DeviceNotRegistered'
     and t.token = q.token and t.profile_id = q.profile_id;

  update push_status set last_run_at = now(), last_run = p_summary;
end $$;

-- ---------------------------------------------------------------- 3. the every-minute job
-- 0016's call_notify_function, now refusing an address that is not a Supabase project's https
-- address or a secret shorter than 32 characters (the secret goes in a header to that address:
-- R2G3-01), and recording each call in push_status.
create or replace function call_notify_function(p_body jsonb) returns text
language plpgsql volatile set search_path = public as $$
declare
  v_url    text;
  v_secret text;
  v_result text := 'not_set_up';
begin
  -- pg_net is there when its net.http_post is (asked as 0027 does, so the smoke test can imitate it).
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'net' and p.proname = 'http_post')
     and to_regclass('vault.decrypted_secrets') is not null then
    execute $q$select max(decrypted_secret) filter (where name = 'mridanga_project_url'),
                      max(decrypted_secret) filter (where name = 'mridanga_push_secret')
                 from vault.decrypted_secrets$q$
       into v_url, v_secret;
    if v_url ~ '^https://[a-z0-9]{20}\.supabase\.co/?$' and char_length(v_secret) >= 32 then
      execute $q$select net.http_post(
                    url := $1 || '/functions/v1/notify-announcements',
                    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', $2),
                    body := $3,
                    timeout_milliseconds := 30000)$q$
        using rtrim(v_url, '/'), v_secret, p_body;
      v_result := 'called';
    end if;
  end if;
  update push_status set last_job_at = now(), last_job_result = v_result;
  return v_result;
end $$;

-- 0016's job, now also due when a queue row waits for its next try.
create or replace function send_due_push() returns text
language plpgsql volatile set search_path = public as $$
begin
  if not exists (select 1 from announcements where notified_at is null and publish_at <= now())
     and not exists (select 1 from push_outbox where sent_at is null and created_at > now() - interval '1 day')
     and not exists (select 1 from push_queue where sent_at is null and failed is null and next_try_at <= now()
                       and created_at > now() - interval '1 day') then
    return 'nothing_due';
  end if;
  return call_notify_function('{}'::jsonb);
end $$;

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14: only the Edge Function (service role); the job runs as the owner.
revoke execute on function claim_push_queue(), finish_push(uuid, bigint[], bigint[], jsonb, jsonb),
  call_notify_function(jsonb), send_due_push() from public, anon, authenticated;
grant execute on function claim_push_queue(), finish_push(uuid, bigint[], bigint[], jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------- descriptions
comment on table push_queue is 'One push to one phone (an announcement or a push_outbox notice): waiting, sent, or failed with a reason. Written by claim_push_queue / finish_push; kept 3 days (docs/DECISIONS.md #112).';
comment on column push_queue.next_try_at is 'When the row may be claimed: now, after a run''s 5-minute lease, or after a failed try (2, 8, 18, 32 minutes).';
comment on column push_queue.claimed_by is 'The claim id of the run that last took the row; finish_push changes only rows of its own claim.';
comment on column push_queue.failed is 'Why it was not sent and never will be: DeviceNotRegistered, OtherProject, MessageTooBig, bad_url, token_gone, expired, gave_up or another Expo error code.';
comment on table push_status is 'One row: the push job''s last call (called / not_set_up) and the Edge Function''s last run with its counts (docs/OPERATIONS.md "Push notifications").';
comment on function claim_push_queue is 'Edge Function only: queues due announcements and notices per phone, gives up on stale rows, and claims up to 500 waiting rows with a 5-minute lease.';
comment on function finish_push is 'Edge Function only: marks the rows of one claim sent, to retry, or refused; deletes tokens Expo calls DeviceNotRegistered.';
comment on function call_notify_function is 'Calls the Edge Function notify-announcements through pg_net when the Vault holds an https Supabase address and a secret of 32+ characters; records the call in push_status.';
comment on function send_due_push is 'Every minute (pg_cron mridanga-push): calls the Edge Function when an announcement, a notice or a queued retry is due.';
comment on function claim_due_push is 'Before 0031 only (the Edge Function now uses claim_push_queue): marks due announcements notified and returns the tokens. Kept so an older deployed function still works.';
comment on function claim_push_outbox is 'Before 0031 only (the Edge Function now uses claim_push_queue): marks waiting notices sent and returns the phones. Kept so an older deployed function still works.';
