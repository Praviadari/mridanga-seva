-- Mridanga Seva — 0011: push notifications for announcements on Android.
-- Run once, after 0010_announcement_files.sql, in the Supabase SQL editor.
-- Why: docs/DECISIONS.md #33. How: docs/DATABASE.md "Push notifications"; switching it on:
-- docs/OPERATIONS.md "Push notifications".
--
-- How a notification travels:
-- 1. The Android app asks for permission after sign-in and saves its Expo push token here
--    (register_push_token).
-- 2. Every minute a pg_cron job runs send_due_push(). When an announcement is published and has
--    not been notified yet (announcements.notified_at is empty), it calls the Edge Function
--    notify-announcements (supabase/functions/) through pg_net.
-- 3. The Edge Function calls claim_due_push(), which marks those announcements notified and
--    returns the push tokens of the people each one is addressed to (the same people as
--    announcement_audience), and sends one notification per phone through Expo's push service.
-- Scheduled announcements are covered the same way: they become due at their publish time.
--
-- Until push is switched on (pg_net enabled, the Edge Function deployed, two Vault secrets
-- saved), send_due_push() does nothing and the app works exactly as before.

-- ---------------------------------------------------------------- when an announcement was notified
-- Announcements already there are never sent: a first run must not push old news. Adding the
-- column with a default stamps every existing row without an UPDATE (so no trigger runs and the
-- audit log stays clean); the default is then removed, so new announcements start empty.
alter table announcements add column notified_at timestamptz default now();
alter table announcements alter column notified_at drop default;

-- Setting notified_at is bookkeeping, not a change anyone made: 0007's audit trigger is split so
-- that an update touching only notified_at is not copied to audit_log. Deletes are kept as before.
drop trigger audit_announcements on announcements;
create trigger audit_announcements_update after update on announcements
  for each row when ((to_jsonb(old) - 'notified_at') is distinct from (to_jsonb(new) - 'notified_at'))
  execute function audit_row();
create trigger audit_announcements_delete after delete on announcements
  for each row execute function audit_row();

-- Scheduled announcements (not published yet) do get their notification at their time.
update announcements set notified_at = null where publish_at > now();

-- Only the Edge Function (service role, no login) sets notified_at. An app user can neither set
-- it on a new announcement (to stop the notification) nor change it later.
create or replace function guard_announcement_notified() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    new.notified_at := case when tg_op = 'UPDATE' then old.notified_at end;
  end if;
  return new;
end $$;

create trigger announcements_notify_guard before insert or update on announcements
  for each row execute function guard_announcement_notified();

-- Finds announcements waiting for their notification quickly (the job asks every minute).
create index announcements_not_notified_idx on announcements (publish_at) where notified_at is null;

-- ---------------------------------------------------------------- push tokens
-- One row per phone that may receive notifications. A token belongs to the login last signed in
-- on that phone: signing in with another login on the same phone moves the token to it.
create table push_tokens (
  token       text primary key,
  profile_id  uuid not null references profiles (id) on delete cascade,
  platform    text not null check (platform in ('android', 'ios')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index push_tokens_profile_idx on push_tokens (profile_id);

-- A person may see and delete only their own tokens (the app deletes its token at sign-out).
-- Saving goes through register_push_token below, never straight into the table.
alter table push_tokens enable row level security;
create policy own_select on push_tokens for select to authenticated using (profile_id = auth.uid());
create policy own_delete on push_tokens for delete to authenticated using (profile_id = auth.uid());
revoke all on push_tokens from public, anon, authenticated;
grant select, delete on push_tokens to authenticated;

-- Saves this phone's token for the signed-in person. Security definer, so that a token saved
-- earlier for another login on the same phone can be moved to this one (row-level security
-- would hide that row). At most 5 phones per person: the oldest are dropped.
-- Error codes (src/lib/push.ts):
--   not_allowed    not a student, coordinator or Guru (a 'pending' login gets no announcements)
--   bad_token      not an Expo push token
--   bad_platform   not 'android' or 'ios'
create or replace function register_push_token(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(my_role() in ('guru', 'coordinator', 'student'), false) = false then
    raise exception 'not_allowed';
  end if;
  if p_token is null or char_length(p_token) > 200
     or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$' then
    raise exception 'bad_token' using detail = 'An Expo push token looks like ExponentPushToken[...].';
  end if;
  if p_platform is null or p_platform not in ('android', 'ios') then
    raise exception 'bad_platform';
  end if;

  insert into push_tokens (token, profile_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (token) do update
     set profile_id = excluded.profile_id, platform = excluded.platform, updated_at = now();

  delete from push_tokens
   where profile_id = auth.uid()
     and token not in (select token from push_tokens where profile_id = auth.uid()
                        order by updated_at desc limit 5);
end $$;

-- ---------------------------------------------------------------- for the Edge Function (service role)
-- Marks every published, not yet notified announcement as notified, and returns one row per
-- phone to notify: the announcement, its title and the start of its text, the token, and the
-- person's role (the app screen differs for staff and students). The people are those of
-- announcement_audience (0007): addressed, able to open it in the app, never the author.
-- An announcement published more than a day ago is marked but not sent: it is old news (for
-- example when push is switched on weeks after it was posted).
-- Two runs at once cannot both claim the same announcement: the update locks each row, and the
-- second run finds notified_at already set.
create or replace function claim_due_push()
returns table (announcement_id bigint, title text, body text, token text, role text)
language sql volatile set search_path = public as $$
  with due as (
    update announcements a
       set notified_at = now()
     where a.notified_at is null and a.publish_at <= now()
    returning a.id, a.title, a.body, a.publish_at
  )
  select d.id, d.title, left(d.body, 180), t.token, aa.role::text
    from due d
    join announcement_audience aa on aa.announcement_id = d.id
    join push_tokens t on t.profile_id = aa.profile_id
   where d.publish_at > now() - interval '1 day'
   order by d.id, t.token
$$;

-- Puts announcements back in the queue when nothing could be sent (for example Expo's service
-- was down), so the next run tries again. Only for announcements still within the one day.
create or replace function release_push_claim(p_ids bigint[]) returns void
language sql volatile set search_path = public as $$
  update announcements set notified_at = null
   where id = any (p_ids) and publish_at > now() - interval '1 day'
$$;

-- ---------------------------------------------------------------- the every-minute job
-- Calls the Edge Function when something is due. Does nothing, quietly, while push is not set
-- up: without pg_net, without the Vault, or without the two secrets
--   mridanga_project_url  e.g. https://<project ref>.supabase.co
--   mridanga_push_secret  a long random text, the same as the Edge Function's PUSH_SECRET
-- Returns what it did: 'nothing_due', 'not_set_up' or 'called'. Runs as the job's owner.
create or replace function send_due_push() returns text
language plpgsql volatile set search_path = public as $$
declare
  v_url    text;
  v_secret text;
begin
  if not exists (select 1 from announcements where notified_at is null and publish_at <= now()) then
    return 'nothing_due';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net')
     or to_regclass('vault.decrypted_secrets') is null then
    return 'not_set_up';
  end if;
  -- Read through dynamic SQL, so this function can be created before the Vault is there.
  execute $q$select max(decrypted_secret) filter (where name = 'mridanga_project_url'),
                    max(decrypted_secret) filter (where name = 'mridanga_push_secret')
               from vault.decrypted_secrets$q$
     into v_url, v_secret;
  if v_url is null or v_secret is null then
    return 'not_set_up';
  end if;
  -- pg_net sends the request after this transaction ends; the answer is kept in
  -- net._http_response for a few hours (useful when checking that it works).
  execute $q$select net.http_post(
                url := $1 || '/functions/v1/notify-announcements',
                headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', $2),
                body := '{}'::jsonb,
                timeout_milliseconds := 30000)$q$
    using rtrim(v_url, '/'), v_secret;
  return 'called';
end $$;

select cron.schedule('mridanga-push', '* * * * *', 'select send_due_push()');

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14. register_push_token: signed-in people. claim_due_push and
-- release_push_claim: only the Edge Function (service role). send_due_push and the trigger
-- function: nobody from outside (pg_cron runs as the owner).
revoke execute on function guard_announcement_notified(), register_push_token(text, text), claim_due_push(),
  release_push_claim(bigint[]), send_due_push() from public, anon, authenticated;
grant execute on function register_push_token(text, text) to authenticated;
grant execute on function claim_due_push(), release_push_claim(bigint[]) to service_role;

-- ---------------------------------------------------------------- descriptions
comment on column announcements.notified_at is 'When the push notification for this announcement went out (or was skipped as old). Empty = waiting. Set only by the Edge Function (docs/DECISIONS.md #33).';
comment on function guard_announcement_notified is 'Trigger: app users cannot set or change announcements.notified_at.';
comment on trigger audit_announcements_update on announcements is 'Copies an edit, pin or unpin to audit_log; not an update that only sets notified_at.';
comment on trigger audit_announcements_delete on announcements is 'Copies a deleted announcement to audit_log.';
comment on index announcements_not_notified_idx is 'Announcements waiting for their push notification.';
comment on table push_tokens is 'Phones that receive push notifications: the Expo push token and the login it belongs to. Saved by register_push_token; a person sees and deletes only their own (docs/DECISIONS.md #33).';
comment on column push_tokens.token is 'Expo push token of the phone, e.g. ExponentPushToken[...]. Moves to the login last signed in on that phone.';
comment on column push_tokens.platform is 'android or ios.';
comment on column push_tokens.updated_at is 'Last time the phone saved it; at most 5 phones per person, the oldest are dropped.';
comment on function register_push_token is 'Saves this phone''s Expo push token for the signed-in student, coordinator or Guru. Security definer: moves a token from another login on the same phone (docs/DECISIONS.md #33).';
comment on function claim_due_push is 'Edge Function only: marks published, not yet notified announcements as notified and returns the tokens to send to (announcement_audience). Older than a day = marked, not sent.';
comment on function release_push_claim is 'Edge Function only: puts announcements back in the push queue when nothing could be sent.';
comment on function send_due_push is 'Every minute (pg_cron mridanga-push): calls the Edge Function notify-announcements when an announcement is due. Does nothing while push is not set up (docs/OPERATIONS.md "Push notifications").';
