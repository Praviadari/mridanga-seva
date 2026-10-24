-- Mridanga Seva — 0062: web push for the web version (audit 22-10-2026 fix 13, work package L; docs/DECISIONS.md
-- #596-#609; docs/DATABASE.md "Web push (0062)"; docs/OPERATIONS.md "Push notifications" part C). Run once after 0061,
-- in the Supabase SQL editor (TEST first), then deploy the Edge Function notify-announcements again. In either order:
-- the function deployed today keeps calling claim_push_queue, which keeps its shape and still hands it phones only;
-- browser rows wait for the new function and are given up after a day like any other row. Safe to run twice.
--
-- A browser that a signed-in student or staff member switched notifications on in (My profile, only on their tap)
-- receives the announcements and notices the Android app receives, through the browser maker's push service, with
-- the standard Web Push protocol (VAPID keys of the project; the text is encrypted for that browser alone).
--
-- 1. push_tokens holds browsers too (#598): platform 'web', the push service address (the "endpoint") as the token,
--    and the browser's two public keys. So every path that already forgets a login's phones forgets its browsers:
--    sign-out, a login switched off or withdrawn, erase_student / erase_login / anonymise_staff, the 90-day
--    retention of 0060 (#600) and the data-rights count of devices (0059).
-- 2. save_web_push / remove_web_push: the signed-in person saves or removes this browser (#603, #604).
-- 3. push_queue.web: claim_push_queue queues browsers beside phones but hands the function phones only (same
--    columns as 0031); claim_web_push / finish_web_push send the browser rows (#599); a push service that says the
--    address is gone (404, 410) deletes it at once (#600). push_status keeps the web part's last run apart.

-- ---------------------------------------------------------------- 1. browsers in push_tokens
alter table push_tokens add column if not exists web_p256dh text;
alter table push_tokens add column if not exists web_auth text;
alter table push_tokens drop constraint if exists push_tokens_platform_check;
alter table push_tokens add constraint push_tokens_platform_check check (platform in ('android', 'ios', 'web'));
-- A browser row has both keys, a phone row neither.
alter table push_tokens drop constraint if exists push_tokens_web_keys;
alter table push_tokens add constraint push_tokens_web_keys
  check ((platform = 'web') = (web_p256dh is not null and web_auth is not null));

-- ---------------------------------------------------------------- 2. saving and removing a browser
-- Saves this browser's push subscription for the signed-in person, or refreshes it (the app saves it again when it
-- starts, at most once a week, so the 90-day retention keeps only browsers in use). An address saved earlier for
-- another login moves to this one, as register_push_token does for a phone (the app itself never hands a browser
-- over: #604). At most 5 browsers per person: the oldest are dropped. The withdrawn-record trigger of 0048 refuses a
-- login on a withdrawn record, as for phones. Error codes (app/src/lib/web-push.web.ts):
--   not_allowed    not an active student, coordinator or Guru
--   bad_endpoint   not an https address of at most 1000 plain characters
--   bad_keys       p256dh is not a P-256 public key (65 bytes, base64url) or auth not 16 bytes (base64url)
create or replace function save_web_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(my_role() in ('guru', 'coordinator', 'student'), false) = false then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_endpoint is null or char_length(p_endpoint) > 1000
     or p_endpoint !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/[!-~]*$' then
    raise exception 'bad_endpoint' using detail = 'A push service address starts with https:// and has no spaces.';
  end if;
  -- 65 bytes (an uncompressed point, first byte 4) are 87 base64url characters starting with B; 16 bytes are 22.
  if p_p256dh is null or p_p256dh !~ '^B[A-Za-z0-9_-]{86}$' or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'bad_keys';
  end if;

  insert into push_tokens (token, profile_id, platform, web_p256dh, web_auth)
  values (p_endpoint, auth.uid(), 'web', p_p256dh, p_auth)
  on conflict (token) do update
     set profile_id = excluded.profile_id, platform = 'web', web_p256dh = excluded.web_p256dh,
         web_auth = excluded.web_auth, updated_at = now();

  delete from push_tokens
   where profile_id = auth.uid() and platform = 'web'
     and token not in (select token from push_tokens where profile_id = auth.uid() and platform = 'web'
                        order by updated_at desc limit 5);
end $$;

-- Removes this browser for the signed-in person (Turn off, and sign-out before the login ends). True when a row
-- went. Another login's browser is never touched.
create or replace function remove_web_push(p_endpoint text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  delete from push_tokens where token = p_endpoint and profile_id = auth.uid() and platform = 'web';
  return found;
end $$;

-- ---------------------------------------------------------------- 3. the queue
alter table push_queue add column if not exists web boolean not null default false;
alter table push_status add column if not exists last_web_run_at timestamptz;
alter table push_status add column if not exists last_web_run jsonb;

-- 0031's claim_push_queue, with the browsers: due announcements and notices are queued for every phone AND browser
-- of the person (web = true for a browser), the stale rows of both are given up as before, and only phone rows are
-- claimed here. Same columns as 0031, so a function deployed before 0062 keeps working and never sees a browser.
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
  insert into push_queue (announcement_id, profile_id, token, title, body, role, web)
  select d.id, aa.profile_id, t.token, d.title, left(d.body, 180), aa.role::text, t.platform = 'web'
    from due d
    join announcement_audience aa on aa.announcement_id = d.id
    join push_tokens t on t.profile_id = aa.profile_id
   where d.publish_at > now() - interval '1 day';

  with due as (
    update push_outbox o set sent_at = now()
     where o.sent_at is null
    returning o.id, o.profile_id, o.title, o.body, o.url, o.created_at
  )
  insert into push_queue (outbox_id, profile_id, token, title, body, url, web)
  select d.id, d.profile_id, t.token, d.title, d.body, d.url, t.platform = 'web'
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
     where w.sent_at is null and w.failed is null and w.next_try_at <= now() and not w.web
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

-- The browser rows, for the Edge Function after claim_push_queue (which queued them): gives up on stale browser rows
-- as claim_push_queue does (so this part is right on its own too), then claims up to 200 waiting ones under a new
-- claim id with a 5-minute lease, each with the browser's address and keys.
create or replace function claim_web_push()
returns table (claim uuid, message_id bigint, announcement_id bigint, title text, body text,
               endpoint text, p256dh text, auth_secret text, role text, url text)
language plpgsql volatile set search_path = public as $$
#variable_conflict use_column
declare
  v_claim uuid := gen_random_uuid();
begin
  update push_queue q
     set failed = case
                    when not exists (select 1 from push_tokens t where t.token = q.token and t.profile_id = q.profile_id)
                      then 'token_gone'
                    when q.created_at <= now() - interval '1 day' then 'expired'
                    else 'gave_up'
                  end
   where q.web and q.sent_at is null and q.failed is null and q.next_try_at <= now()
     and (q.tries >= 5 or q.created_at <= now() - interval '1 day'
          or not exists (select 1 from push_tokens t where t.token = q.token and t.profile_id = q.profile_id));

  return query
  with picked as (
    select w.id from push_queue w
     where w.web and w.sent_at is null and w.failed is null and w.next_try_at <= now()
     order by w.id
     limit 200
     for update skip locked
  ), claimed as (
    update push_queue q
       set claimed_by = v_claim, tries = q.tries + 1, next_try_at = now() + interval '5 minutes'
      from picked
     where q.id = picked.id
    returning q.id, q.announcement_id, q.title, q.body, q.token, q.profile_id, q.role, q.url
  )
  select v_claim, c.id, c.announcement_id, c.title, c.body, c.token, t.web_p256dh, t.web_auth, c.role, c.url
    from claimed c
    join push_tokens t on t.token = c.token and t.profile_id = c.profile_id and t.platform = 'web';
end $$;

-- 0031's finish_push for the browser rows of one claim: sent, try again (2, 8, 18, 32 minutes), or refused with a
-- reason. 'endpoint_gone' (the push service answered 404 or 410: the browser unsubscribed, the site's data was
-- cleared, the app was removed from the home screen) also deletes the address, if it still belongs to the same login.
-- The counts go to push_status.last_web_run.
create or replace function finish_web_push(p_claim uuid, p_sent bigint[], p_retry bigint[], p_refused jsonb,
                                           p_summary jsonb) returns void
language plpgsql volatile set search_path = public as $$
begin
  update push_queue set sent_at = now()
   where id = any (coalesce(p_sent, '{}')) and web and claimed_by = p_claim and sent_at is null and failed is null;

  update push_queue
     set next_try_at = now() + tries * tries * interval '2 minutes',
         failed = case when tries >= 5 then 'gave_up' end
   where id = any (coalesce(p_retry, '{}')) and web and claimed_by = p_claim and sent_at is null and failed is null;

  update push_queue q set failed = left(r.value, 40)
    from jsonb_each_text(coalesce(p_refused, '{}'::jsonb)) r
   where r.key ~ '^[0-9]+$' and q.id = r.key::bigint and q.web and q.claimed_by = p_claim
     and q.sent_at is null and q.failed is null;

  delete from push_tokens t
   using push_queue q
   where q.web and q.claimed_by = p_claim and q.failed = 'endpoint_gone'
     and t.token = q.token and t.profile_id = q.profile_id and t.platform = 'web';

  update push_status set last_web_run_at = now(), last_web_run = p_summary where id;
end $$;

-- ---------------------------------------------------------------- who may run functions
revoke execute on function save_web_push(text, text, text), remove_web_push(text) from public, anon;
grant execute on function save_web_push(text, text, text), remove_web_push(text) to authenticated;
revoke execute on function claim_web_push(), finish_web_push(uuid, bigint[], bigint[], jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function claim_web_push(), finish_web_push(uuid, bigint[], bigint[], jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------- descriptions
comment on table push_tokens is 'Phones and browsers that receive push notifications: an Expo push token (platform android/ios) or a browser''s push service address with its keys (platform web, 0062), and the login it belongs to. Saved by register_push_token / save_web_push; a person sees and deletes only their own (docs/DECISIONS.md #33, #598).';
comment on column push_tokens.token is 'Expo push token of the phone (ExponentPushToken[...]), or the push service address (endpoint) of a browser. Moves to the login that saved it last.';
comment on column push_tokens.platform is 'android or ios (Expo push), or web (Web Push, 0062).';
comment on column push_tokens.web_p256dh is 'Browsers only: the browser''s P-256 public key (base64url), which the text is encrypted for.';
comment on column push_tokens.web_auth is 'Browsers only: the browser''s 16-byte authentication secret (base64url) for the encryption.';
comment on column push_queue.web is 'True for a browser row (0062): sent by claim_web_push / finish_web_push with Web Push; false for a phone row (Expo).';
comment on column push_status.last_web_run is 'The Edge Function''s last run of the browser part (0062) with its counts; last_run is the phone part.';
comment on function save_web_push is 'The signed-in student or staff member saves or refreshes this browser''s push subscription (endpoint + keys; at most 5 browsers each). Errors: not_allowed, bad_endpoint, bad_keys (docs/DECISIONS.md #603).';
comment on function remove_web_push is 'The signed-in person removes this browser''s push subscription (Turn off, sign-out). True when a row went.';
comment on function claim_push_queue is 'Edge Function only: queues due announcements and notices per phone and browser, gives up on stale rows, and claims up to 500 waiting PHONE rows with a 5-minute lease (browsers: claim_web_push, 0062).';
comment on function claim_web_push is 'Edge Function only (0062): gives up on stale browser rows and claims up to 200 waiting ones, with the browser''s address and keys, under a 5-minute lease.';
comment on function finish_web_push is 'Edge Function only (0062): marks the browser rows of one claim sent, to retry, or refused; deletes addresses the push service calls gone (endpoint_gone).';
