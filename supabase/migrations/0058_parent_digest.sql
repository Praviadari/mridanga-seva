-- Mridanga Seva — 0058: a weekly email to a minor's parent about their child's week at the class
-- (docs/DECISIONS.md #530-#539; docs/DATABASE.md "Parent digest (0058)"; docs/OPERATIONS.md "Weekly email to
-- parents"). Run once after 0054 (it does not need 0055-0057), in the Supabase SQL editor (TEST first), then
-- deploy the Edge Function notify-parents from the same commit. Safe to run twice.
--
-- Nothing is sent until the Guru switches parent_digest_enabled on (the screen "Weekly email to parents",
-- G10), and then only to a parent who agreed to it in writing (opt-in, #531). Old app builds keep working:
-- they neither see nor need the new setting, scope and functions.
--
-- 1. Setting parent_digest_enabled (false), changed only by set_parent_digest (the Guru; audit log).
-- 2. consents.scope 'digest': the parent's own written yes to the weekly email (form line D, #531), per
--    guardian. Withdrawn by the email's one-click Unsubscribe or at the desk (revoked_at), as easily as given.
-- 3. parent_digests: the queue. One row per child, parent address and week (Monday to Sunday, India), made
--    by the job after Sunday 20:30 IST; or by staff's "Send again". A row holds ids, the week and the outcome,
--    never a text: what the email says is read when it goes (parent_digest_content), so a withdrawal,
--    an erasure, an unsubscribe or a switch-off stops it at once.
-- 4. What it says (#532): that week's visits (days, check-in and check-out times), practice minutes and
--    days against the goal, newly ticked syllabus items, a level change, and the next event for the child.
--    Never a location, a photo, a mark, a remark or anything about another child; the child's full name as
--    on the record (#228).
-- 5. Sending (#533): the every-5-minutes job send_parent_digests() queues the week and calls notify-parents
--    while rows wait; the function claims at most 10 a run (claim_parent_digests), between 07:00 and 21:30
--    IST, under two ceilings: 100 digests a day, and 240 parent emails a day for the whole app (check-out
--    and consent-code emails counted too; Brevo's free plan sends 300 a day, the rest is left for sign-up
--    and password emails). A row not sent within 48 hours expires. Without BREVO_API_KEY it is a dry run.
-- 6. For staff: per guardian status, record or withdraw the parent's yes, "Send again", the overview and
--    a preview of exactly the email a parent would get (the Edge Function builds it from preview_parent_digest).

-- ---------------------------------------------------------------- 1. the switch and the limits
insert into settings (key, value) values ('parent_digest_enabled', 'false') on conflict (key) do nothing;

-- The limits, in one place for the functions, the app and the smoke test (#533).
create or replace function parent_digest_limits() returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object('per_run', 10, 'digest_day', 100, 'app_day', 240, 'send_from', '07:00', 'send_until', '21:30',
                            'expire_hours', 48, 'again_hours', 24, 'keep_days', 30)
$$;

-- ---------------------------------------------------------------- 2. the parent's yes
alter table consents drop constraint if exists consents_scope_check;
alter table consents add constraint consents_scope_check check (scope in ('data', 'photo', 'face', 'digest'));

-- ---------------------------------------------------------------- 3. the queue
-- Written only by the functions below; closed to every app role. A row waits while outcome is empty and
-- next_try_at has come. again: made by staff's "Send again" (requested_by), not by the weekly run.
-- outcome: sent, skipped (dry run), switched_off, stopped (the parent's yes withdrawn), not_eligible
-- (withdrawn, left, now an adult, no data consent, no email), expired (48 hours), gave_up (5 tries), or
-- Brevo's refusal code.
create table if not exists parent_digests (
  id            bigint generated always as identity primary key,
  student_id    uuid not null references students (id) on delete cascade,
  guardian_id   uuid not null references guardians (id) on delete cascade,
  week_start    date not null check (extract(isodow from week_start) = 1),
  again         boolean not null default false,
  requested_by  uuid references profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  next_try_at   timestamptz not null default now(),
  claimed_by    uuid,
  tries         smallint not null default 0,
  done_at       timestamptz,
  outcome       text check (char_length(outcome) <= 40)
);
create unique index if not exists parent_digests_weekly_idx on parent_digests (student_id, guardian_id, week_start) where not again;
create index if not exists parent_digests_waiting_idx on parent_digests (next_try_at) where outcome is null;
create index if not exists parent_digests_created_idx on parent_digests (created_at);
create index if not exists parent_digests_guardian_idx on parent_digests (guardian_id);
alter table parent_digests enable row level security;
revoke all on parent_digests from public, anon, authenticated;

-- What the digest job and the Edge Function last did, next to the notices' (0043).
alter table parent_notice_status add column if not exists digest_job_at timestamptz;
alter table parent_notice_status add column if not exists digest_job_result text;
alter table parent_notice_status add column if not exists digest_run_at timestamptz;
alter table parent_notice_status add column if not exists digest_run jsonb;

-- Why this guardian of this student gets no digest now: null = they do. Used by the job, the claim, the
-- staff lines and the overview, so all agree. p_ignore_switch: as if the Guru had switched it on (the
-- overview counts who would get one before it is on).
create or replace function parent_digest_block(p_student uuid, p_guardian uuid, p_ignore_switch boolean default false) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when not p_ignore_switch and not coalesce(setting_flag('parent_digest_enabled'), false) then 'switched_off'
    when s.id is null or g.id is null then 'not_eligible'
    when s.withdrawn_at is not null then 'withdrawn'
    when s.status in ('left', 'inactive', 'paused') then 'not_active'
    when not coalesce(is_minor(s), false) then 'adult'
    when not exists (select 1 from consents c where c.student_id = s.id and c.scope = 'data' and c.revoked_at is null)
      then 'no_consent'
    when nullif(btrim(g.email), '') is null then 'no_email'
    -- One address, one choice: the yes given on any guardian row of this student with this email counts.
    when not exists (select 1 from consents c join guardians g2 on g2.id = c.guardian_id
                      where c.student_id = s.id and c.scope = 'digest' and c.revoked_at is null
                        and lower(btrim(g2.email)) = lower(btrim(g.email))) then 'no_digest_consent'
  end
    from (select 1) one
    left join students s on s.id = p_student
    left join guardians g on g.id = p_guardian and g.student_id = s.id
$$;

-- The clock of the weekly email is India's (the class's; LIVE's only centre is Abids). Each helper takes the
-- moment to judge (now by default), so the smoke test can check the edges.
-- The week the latest digest covers: the Monday of the last week whose Sunday 20:30 IST has passed.
create or replace function parent_digest_week(p_at timestamptz default now()) returns date
language sql stable set search_path = public, pg_temp as $$
  select (date_trunc('week', (p_at at time zone 'Asia/Kolkata') + interval '3 hours 30 minutes'))::date - 7
$$;

-- True from Sunday 20:30 to Monday 20:30 IST: the job queues the week's digests then (also a late run).
create or replace function parent_digest_queue_open(p_at timestamptz default now()) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select (p_at at time zone 'Asia/Kolkata') + interval '3 hours 30 minutes'
         < date_trunc('week', (p_at at time zone 'Asia/Kolkata') + interval '3 hours 30 minutes') + interval '1 day'
$$;

-- True between 07:00 and 21:30 IST: no digest arrives at night (#533).
create or replace function parent_digest_send_open(p_at timestamptz default now()) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select (p_at at time zone 'Asia/Kolkata')::time >= (parent_digest_limits() ->> 'send_from')::time
     and (p_at at time zone 'Asia/Kolkata')::time < (parent_digest_limits() ->> 'send_until')::time
$$;

-- Parent emails handed to Brevo today (India time) by the whole app: consent codes (0051), check-in and
-- check-out notices (0043) and digests. Brevo's free plan sends 300 a day, sign-up and password emails included.
create or replace function app_parent_mails_today() returns int
language sql stable security definer set search_path = public, pg_temp as $$
  with d as (select date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata' as since)
  select parent_mails_today()
       + (select count(*)::int from parent_notices p, d where p.outcome = 'sent' and p.done_at >= d.since)
       + (select count(*)::int from parent_digests p, d where p.outcome = 'sent' and p.done_at >= d.since)
$$;

-- How many digests may still go today under both ceilings (#533).
create or replace function parent_digest_room() returns int
language sql stable security definer set search_path = public, pg_temp as $$
  with d as (select date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata' as since)
  select greatest(0, least(
    (parent_digest_limits() ->> 'digest_day')::int
      - (select count(*)::int from parent_digests p, d where p.outcome = 'sent' and p.done_at >= d.since),
    (parent_digest_limits() ->> 'app_day')::int - app_parent_mails_today()))
$$;

-- ---------------------------------------------------------------- 4. what the email says
-- One student's week (p_week = its Monday), only what the email needs (#532): the home centre and level,
-- each visit's day with its check-in and check-out time at the centre (never where), the practice minutes
-- and days against the goal (the student's own goal, else the level's, else 4 x 15, as practice_days),
-- the syllabus items ticked that week (titles, at most 8, and how many), a level change that week, and the
-- next event for the student in the coming 31 days (title, day, time, centre; never the place text).
create or replace function parent_digest_content(p_student uuid, p_week date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s        students;
  v_tz     text;
  v_centre text;
  v_end    date := p_week + 6;
  v_visits jsonb;
  v_days   jsonb;
  v_goal_d int;
  v_goal_m int;
  v_ticks  jsonb;
  v_nticks int;
  v_level  jsonb;
  v_event  jsonb;
begin
  select * into s from students where id = p_student;
  if not found then return null; end if;
  select coalesce(c.time_zone, 'Asia/Kolkata'), c.name into v_tz, v_centre from centres c where c.id = s.home_centre_id;
  v_tz := coalesce(v_tz, 'Asia/Kolkata');

  select coalesce(jsonb_agg(jsonb_build_object('on', x.on_day, 'in', x.t_in, 'out', x.t_out) order by x.check_in), '[]')
    into v_visits
    from (select vi.check_in,
                 to_char(vi.check_in at time zone coalesce(c.time_zone, v_tz), 'YYYY-MM-DD') as on_day,
                 to_char(vi.check_in at time zone coalesce(c.time_zone, v_tz), 'HH24:MI') as t_in,
                 to_char(vi.check_out at time zone coalesce(c.time_zone, v_tz), 'HH24:MI') as t_out
            from visits vi left join centres c on c.id = vi.centre_id
           where vi.student_id = p_student
             and (vi.check_in at time zone coalesce(c.time_zone, v_tz))::date between p_week and v_end) x;

  select coalesce(g.goal_days, pp.goal_days, 4), coalesce(g.goal_minutes, pp.goal_minutes, 15) into v_goal_d, v_goal_m
    from (select 1) one
    left join practice_goals g on g.student_id = p_student
    left join practice_plans pp on pp.level_id = s.level_id;
  select coalesce(jsonb_agg(jsonb_build_object('on', d.practised_on, 'minutes', d.minutes) order by d.practised_on), '[]')
    into v_days
    from (select pl.practised_on, sum(pl.minutes)::int as minutes from practice_logs pl
           where pl.student_id = p_student and pl.practised_on between p_week and v_end
           group by pl.practised_on) d;

  select count(*)::int, coalesce((jsonb_agg(t.title order by t.level_id, t.sort) filter (where t.n <= 8)), '[]')
    into v_nticks, v_ticks
    from (select si.title, si.level_id, si.sort, row_number() over (order by si.level_id, si.sort) as n
            from student_progress sp join syllabus_items si on si.id = sp.item_id
           where sp.student_id = p_student and sp.done_on between p_week and v_end) t;

  select jsonb_build_object('from', h.from_level, 'from_name', lf.name, 'to', h.to_level, 'to_name', lt.name) into v_level
    from level_history h
    left join levels lf on lf.id = h.from_level
    join levels lt on lt.id = h.to_level
   where h.student_id = p_student and h.changed_on between p_week and v_end
   order by h.changed_on desc, h.id desc
   limit 1;

  select jsonb_build_object('title', e.title,
                            'on', to_char(e.starts_at at time zone coalesce(c.time_zone, v_tz), 'YYYY-MM-DD'),
                            'at', to_char(e.starts_at at time zone coalesce(c.time_zone, v_tz), 'HH24:MI'),
                            'centre', c.name)
    into v_event
    from events e left join centres c on c.id = e.centre_id
   where e.cancelled_at is null and e.starts_at > now() and e.starts_at < now() + interval '31 days'
     and p_student in (select audience_students(e.audience, e.audience_level, e.audience_group, e.created_by))
   order by e.starts_at, e.id
   limit 1;

  return jsonb_build_object(
    'week_start', p_week, 'week_end', v_end, 'centre', coalesce(v_centre, ''),
    'level', s.level_id, 'level_name', (select l.name from levels l where l.id = s.level_id),
    'visits', v_visits,
    'practice', jsonb_build_object(
      'minutes', coalesce((select sum((d ->> 'minutes')::int) from jsonb_array_elements(v_days) d), 0),
      'days', jsonb_array_length(v_days),
      'days_met', (select count(*)::int from jsonb_array_elements(v_days) d where (d ->> 'minutes')::int >= v_goal_m),
      'goal_days', v_goal_d, 'goal_minutes', v_goal_m),
    'ticks', v_ticks, 'ticks_count', coalesce(v_nticks, 0),
    'level_change', v_level,
    'next_event', v_event);
end $$;

-- ---------------------------------------------------------------- 5. sending
-- Queues one week's digests (p_week: its Monday): one per child and parent address that may get one now,
-- on the guardian row that gave the yes first; never twice for a week (a later run adds only the new ones).
-- Returns how many were added.
create or replace function queue_parent_digests(p_week date) returns int
language plpgsql volatile set search_path = public, pg_temp as $$
declare v_n int;
begin
  insert into parent_digests (student_id, guardian_id, week_start)
  select distinct on (s.id, lower(btrim(g.email))) s.id, g.id, p_week
    from students s join guardians g on g.student_id = s.id
   where s.withdrawn_at is null and s.status not in ('left', 'inactive', 'paused')
     and parent_digest_block(s.id, g.id) is null
   order by s.id, lower(btrim(g.email)),
            exists (select 1 from consents c where c.guardian_id = g.id and c.scope = 'digest' and c.revoked_at is null) desc, g.id
  on conflict (student_id, guardian_id, week_start) where not again do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Every 5 minutes (pg_cron mridanga-parent-digests). While switched on: from Sunday 20:30 to Monday 20:30
-- IST it queues the week's digests (one per child and parent address; the guardian row that gave the yes
-- first; again after a missed run, never twice); then it calls notify-parents when a row waits, the
-- sending hours are open and today's ceilings have room. Answers off, nothing_due, night (outside
-- 07:00-21:30 IST), cap_reached, not_set_up (pg_net or the push Vault secrets missing) or called.
create or replace function send_parent_digests() returns text
language plpgsql volatile set search_path = public, pg_temp as $$
declare
  v_url    text;
  v_secret text;
  v_result text := 'not_set_up';
begin
  if not coalesce(setting_flag('parent_digest_enabled'), false) then
    v_result := 'off';
  else
    if parent_digest_queue_open() then
      perform queue_parent_digests(parent_digest_week());
    end if;
    if not exists (select 1 from parent_digests where outcome is null and next_try_at <= now()) then
      v_result := 'nothing_due';
    elsif not parent_digest_send_open() then
      v_result := 'night';
    elsif parent_digest_room() = 0 then
      v_result := 'cap_reached';
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
  end if;
  -- Only a change is written, so a quiet run costs no row version.
  update parent_notice_status set digest_job_at = now(), digest_job_result = v_result
   where id and (digest_job_result is distinct from v_result or v_result = 'called');
  return v_result;
end $$;

select cron.schedule('mridanga-parent-digests', '*/5 * * * *', 'select send_parent_digests()');

-- For the Edge Function (service role). Each run: deletes rows older than 30 days; ends waiting rows that may
-- no longer go (switched off, the yes withdrawn = stopped, not eligible, over 48 hours old = expired, 5 tries =
-- gave_up); then, between 07:00 and 21:30 IST and under today's ceilings, claims up to p_limit (at most 10)
-- with a new claim id, one more try and a 5-minute lease, and returns what each email needs: the address,
-- the language (the guardian's, else the child's app language, else English), the child's full name, the
-- class contact and the week's content.
create or replace function claim_parent_digests(p_limit int default 10)
returns table (claim uuid, digest_id bigint, guardian_id uuid, email text, language text, student_name text,
               contact text, content jsonb)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_claim uuid := gen_random_uuid();
  v_room  int;
  lim     jsonb := parent_digest_limits();
begin
  delete from parent_digests p where p.created_at < now() - (lim ->> 'keep_days')::int * interval '1 day';

  update parent_digests p
     set done_at = now(),
         outcome = case
                     when b.block = 'switched_off' then 'switched_off'
                     when b.block = 'no_digest_consent' then 'stopped'
                     when b.block is not null then 'not_eligible'
                     when p.created_at <= now() - (lim ->> 'expire_hours')::int * interval '1 hour' then 'expired'
                     else 'gave_up'
                   end
    from (select p2.id, parent_digest_block(p2.student_id, p2.guardian_id) as block
            from parent_digests p2 where p2.outcome is null) b
   where p.id = b.id and p.outcome is null
     and (b.block is not null
          or p.created_at <= now() - (lim ->> 'expire_hours')::int * interval '1 hour'
          or (p.tries >= 5 and p.next_try_at <= now()));

  if not parent_digest_send_open() then return; end if;
  v_room := greatest(0, least(coalesce(p_limit, 10), (lim ->> 'per_run')::int, parent_digest_room()));

  return query
  with picked as (
    select w.id from parent_digests w
     where w.outcome is null and w.next_try_at <= now()
     order by w.again desc, w.id
     limit v_room
     for update skip locked
  ), claimed as (
    update parent_digests q
       set claimed_by = v_claim, tries = q.tries + 1, next_try_at = now() + interval '5 minutes'
      from picked
     where q.id = picked.id
    returning q.id, q.student_id, q.guardian_id, q.week_start
  )
  select v_claim, c.id, c.guardian_id, btrim(g.email),
         coalesce(g.notice_language, pr.language, 'en'),
         s.full_name,
         coalesce((select st.value #>> '{}' from settings st where st.key = 'parent_notice_contact'), ''),
         parent_digest_content(c.student_id, c.week_start)
    from claimed c
    join guardians g on g.id = c.guardian_id
    join students s on s.id = c.student_id
    left join profiles pr on pr.id = s.profile_id
   order by c.id;
end $$;

-- Records what became of the rows of one claim, as 0043's finish_parent_notices:
--   p_sent  Brevo accepted them · p_skipped  dry run · p_retry  2, 8, 18, 32 minutes after the 1st-4th try ·
--   p_refused  {"<row id>": "<reason>"} · p_summary  the run's counts, kept in parent_notice_status.digest_run.
create or replace function finish_parent_digests(p_claim uuid, p_sent bigint[], p_skipped bigint[], p_retry bigint[],
                                                 p_refused jsonb, p_summary jsonb) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  update parent_digests set done_at = now(), outcome = 'sent'
   where id = any (coalesce(p_sent, '{}')) and claimed_by = p_claim and outcome is null;
  update parent_digests set done_at = now(), outcome = 'skipped'
   where id = any (coalesce(p_skipped, '{}')) and claimed_by = p_claim and outcome is null;
  update parent_digests
     set next_try_at = now() + tries * tries * interval '2 minutes',
         done_at = case when tries >= 5 then now() end,
         outcome = case when tries >= 5 then 'gave_up' end
   where id = any (coalesce(p_retry, '{}')) and claimed_by = p_claim and outcome is null;
  update parent_digests q set done_at = now(), outcome = left(r.value, 40)
    from jsonb_each_text(coalesce(p_refused, '{}'::jsonb)) r
   where r.key ~ '^[0-9]+$' and q.id = r.key::bigint and q.claimed_by = p_claim and q.outcome is null;
  update parent_notice_status set digest_run_at = now(), digest_run = p_summary where id;
end $$;

-- The digest's one-click unsubscribe (the Edge Function checks the link's signature first): this address's
-- yes to the weekly email is withdrawn for every child (revoked_at on each 'digest' consent of a guardian row
-- with this email), and waiting digests to it are not sent. Check-out emails are not touched (they have their
-- own Unsubscribe). Returns false for an unknown id.
create or replace function stop_parent_digests(p_guardian uuid) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_email text;
begin
  select lower(btrim(email)) into v_email from guardians where id = p_guardian;
  if not found then return false; end if;
  update consents c set revoked_at = now()
    from guardians g
   where g.id = c.guardian_id and c.scope = 'digest' and c.revoked_at is null
     and (g.id = p_guardian or lower(btrim(g.email)) = v_email);
  update parent_digests p set done_at = now(), outcome = 'stopped'
    from guardians g
   where g.id = p.guardian_id and (g.id = p_guardian or lower(btrim(g.email)) = v_email) and p.outcome is null;
  return true;
end $$;

-- ---------------------------------------------------------------- 6. for staff
-- The Guru switches the weekly email on or off (the screen "Weekly email to parents"). The change goes to the
-- audit log (audit_setting, 0014). Off ends every waiting digest at once (switched_off). Returns the overview.
-- Errors: not_allowed.
create or replace function set_parent_digest(p_on boolean) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if not coalesce(is_guru(), false) or p_on is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  update settings set value = to_jsonb(p_on) where key = 'parent_digest_enabled' and value is distinct from to_jsonb(p_on);
  if not p_on then
    update parent_digests set done_at = now(), outcome = 'switched_off' where outcome is null;
  end if;
  return parent_digest_overview();
end $$;

-- Per guardian of the student (staff, the student's page): why no digest goes now (null = it does), when
-- the parent's yes was recorded (null = none), when the last one went and what became of the latest. No
-- name or email (get_guardians gives those, logged).
create or replace function guardian_digest_status(p_student uuid)
returns table (guardian_id uuid, block text, consent_at timestamptz, last_sent_at timestamptz, last_outcome text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if not coalesce(is_staff(), false) then raise exception 'not_allowed' using errcode = '42501'; end if;
  return query
    select g.id, parent_digest_block(g.student_id, g.id),
           (select max(c.given_at) from consents c join guardians g2 on g2.id = c.guardian_id
             where c.student_id = g.student_id and c.scope = 'digest' and c.revoked_at is null
               and lower(btrim(g2.email)) = lower(btrim(g.email))),
           (select max(p.done_at) from parent_digests p where p.guardian_id = g.id and p.outcome = 'sent'),
           (select p.outcome from parent_digests p where p.guardian_id = g.id order by p.id desc limit 1)
      from guardians g
     where g.student_id = p_student
     order by g.full_name, g.id;
end $$;

-- A coordinator or the Guru records the parent's written yes to the weekly email (form line D signed, #531),
-- or withdraws it when the parent says stop. On: a 'digest' consent (written, signed form, verified by the
-- caller, now, the notice version shown) for this guardian, unless this address already has one for this
-- child. Off: every 'digest' consent of this address for this child is revoked and waiting digests to it
-- end as stopped. Audited through consents (0025). Errors: not_allowed, guardian_not_found, no_email,
-- not_a_minor, student_withdrawn, data_consent_required, notice_version_invalid.
create or replace function set_guardian_digest(p_guardian uuid, p_on boolean, p_notice_version text default null)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  g        guardians;
  s        students;
  v_email  text;
  v_notice text := nullif(btrim(coalesce(p_notice_version, '')), '');
begin
  if not coalesce(is_staff(), false) or p_on is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into g from guardians where id = p_guardian;
  if not found then raise exception 'guardian_not_found'; end if;
  v_email := lower(nullif(btrim(coalesce(g.email, '')), ''));
  if not p_on then
    update consents c set revoked_at = now()
      from guardians g2
     where g2.id = c.guardian_id and c.student_id = g.student_id and c.scope = 'digest' and c.revoked_at is null
       and (g2.id = g.id or lower(btrim(g2.email)) = v_email);
    update parent_digests p set done_at = now(), outcome = 'stopped'
      from guardians g2
     where g2.id = p.guardian_id and p.student_id = g.student_id and p.outcome is null
       and (g2.id = g.id or lower(btrim(g2.email)) = v_email);
    return;
  end if;
  select * into s from students where id = g.student_id;
  if v_email is null then raise exception 'no_email' using detail = 'The parent has no email on record.'; end if;
  if s.withdrawn_at is not null then raise exception 'student_withdrawn'; end if;
  if not coalesce(is_minor(s), false) then raise exception 'not_a_minor' using detail = 'The weekly email is for parents of students under 18.'; end if;
  if not exists (select 1 from consents c where c.student_id = s.id and c.scope = 'data' and c.revoked_at is null) then
    raise exception 'data_consent_required';
  end if;
  if v_notice !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$' then raise exception 'notice_version_invalid'; end if;
  if exists (select 1 from consents c join guardians g2 on g2.id = c.guardian_id
              where c.student_id = s.id and c.scope = 'digest' and c.revoked_at is null and lower(btrim(g2.email)) = v_email) then
    return;
  end if;
  insert into consents (student_id, guardian_id, scope, method, signed_form, verified_by, given_at, notice_version)
  values (s.id, g.id, 'digest', 'written', true, auth.uid(), now(), v_notice);
end $$;

-- Staff's "Send again" (a parent lost the email, or asks for it now): the latest week's digest (the week
-- parent_digest_week names) is queued once more for this guardian; it goes within the sending hours and
-- ceilings. Errors: not_allowed, guardian_not_found, digest_blocked (detail: the reason, as
-- guardian_digest_status), digest_again_too_soon (one "Send again" per guardian in 24 hours).
create or replace function resend_parent_digest(p_guardian uuid) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  g       guardians;
  v_block text;
begin
  if not coalesce(is_staff(), false) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into g from guardians where id = p_guardian;
  if not found then raise exception 'guardian_not_found'; end if;
  v_block := parent_digest_block(g.student_id, g.id);
  if v_block is not null then raise exception 'digest_blocked' using detail = v_block; end if;
  if exists (select 1 from parent_digests p where p.guardian_id = g.id and p.again
                and p.created_at > now() - (parent_digest_limits() ->> 'again_hours')::int * interval '1 hour') then
    raise exception 'digest_again_too_soon';
  end if;
  insert into parent_digests (student_id, guardian_id, week_start, again, requested_by)
  values (g.student_id, g.id, parent_digest_week(), true, auth.uid());
end $$;

-- What a parent of this student would get (staff): the week's content (p_week: a Monday; default this
-- week so far, the week the next digest covers), the child's full name and app language, the class contact,
-- whether the weekly email is switched on, and per guardian the reason none goes (null = it goes) and the
-- language. The Edge Function builds the email from this with the same code that sends it. Errors:
-- not_allowed, student_not_found, week_invalid.
create or replace function preview_parent_digest(p_student uuid, p_week date default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s      students;
  v_week date := coalesce(p_week, (date_trunc('week', now() at time zone 'Asia/Kolkata'))::date);
begin
  if not coalesce(is_staff(), false) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into s from students where id = p_student;
  if not found then raise exception 'student_not_found'; end if;
  if extract(isodow from v_week) <> 1 or v_week > now()::date + 7 or v_week < now()::date - 400 then
    raise exception 'week_invalid';
  end if;
  return jsonb_build_object(
    'enabled', coalesce(setting_flag('parent_digest_enabled'), false),
    'student_name', s.full_name,
    'app_language', coalesce((select pr.language from profiles pr where pr.id = s.profile_id), 'en'),
    'contact', coalesce((select st.value #>> '{}' from settings st where st.key = 'parent_notice_contact'), ''),
    'content', parent_digest_content(s.id, v_week),
    'guardians', coalesce((
      select jsonb_agg(jsonb_build_object('guardian_id', g.id, 'block', parent_digest_block(s.id, g.id),
                                          'language', g.notice_language) order by g.full_name, g.id)
        from guardians g where g.student_id = s.id), '[]'));
end $$;

-- The weekly email at a glance (staff; the screen "Weekly email to parents"): switched on or not, the
-- limits, the weeks, how many parent addresses would get one now (or why not, by reason), the latest
-- week's rows by outcome, today's emails against the ceilings, and what the job and the function last did.
create or replace function parent_digest_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_week date := parent_digest_week();
  v_since timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  st parent_notice_status;
begin
  if not coalesce(is_staff(), false) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into st from parent_notice_status where id;
  return jsonb_build_object(
    'enabled', coalesce(setting_flag('parent_digest_enabled'), false),
    'limits', parent_digest_limits(),
    'last_week', v_week,
    'this_week', (date_trunc('week', now() at time zone 'Asia/Kolkata'))::date,
    'parents', coalesce((
      select jsonb_object_agg(coalesce(b.block, 'gets_it'), b.n)
        from (select x.block, count(*)::int as n
                from (select distinct on (s.id, lower(btrim(g.email)))
                             parent_digest_block(s.id, g.id, true) as block
                        from students s join guardians g on g.student_id = s.id
                       where s.withdrawn_at is null and s.status not in ('left', 'inactive', 'paused')
                         and coalesce(is_minor(s), false) and nullif(btrim(g.email), '') is not null
                       order by s.id, lower(btrim(g.email)), parent_digest_block(s.id, g.id, true) nulls first) x
               group by x.block) b), '{}'),
    'week_rows', coalesce((
      select jsonb_object_agg(o.outcome, o.n)
        from (select coalesce(p.outcome, 'waiting') as outcome, count(*)::int as n
                from parent_digests p where p.week_start = v_week group by 1) o), '{}'),
    'digests_today', (select count(*)::int from parent_digests p where p.outcome = 'sent' and p.done_at >= v_since),
    'app_mails_today', app_parent_mails_today(),
    'job_at', st.digest_job_at, 'job_result', st.digest_job_result,
    'run_at', st.digest_run_at, 'run', st.digest_run);
end $$;

-- ---------------------------------------------------------------- who may run the new functions
-- docs/DECISIONS.md #14: the queue's functions for the Edge Function (service role) only; the job runs as
-- the owner; the staff functions check the role inside.
revoke execute on function parent_digest_limits(), parent_digest_block(uuid, uuid, boolean), parent_digest_week(timestamptz),
  parent_digest_queue_open(timestamptz), parent_digest_send_open(timestamptz), app_parent_mails_today(), parent_digest_room(),
  parent_digest_content(uuid, date), queue_parent_digests(date), send_parent_digests(), claim_parent_digests(int),
  finish_parent_digests(uuid, bigint[], bigint[], bigint[], jsonb, jsonb), stop_parent_digests(uuid),
  set_parent_digest(boolean), guardian_digest_status(uuid), set_guardian_digest(uuid, boolean, text),
  resend_parent_digest(uuid), preview_parent_digest(uuid, date), parent_digest_overview()
  from public, anon, authenticated, service_role;
grant execute on function claim_parent_digests(int), finish_parent_digests(uuid, bigint[], bigint[], bigint[], jsonb, jsonb),
  stop_parent_digests(uuid) to service_role;
grant execute on function set_parent_digest(boolean), guardian_digest_status(uuid), set_guardian_digest(uuid, boolean, text),
  resend_parent_digest(uuid), preview_parent_digest(uuid, date), parent_digest_overview() to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on table parent_digests is 'Weekly emails to a minor''s parent waiting or done: student, guardian, week (Monday), again (staff''s Send again), outcome. Never a text: the content is read when it goes. Written by the digest functions only; kept 30 days (0058, docs/DECISIONS.md #530-#539).';
comment on column parent_notice_status.digest_job_at is 'When the digest job last changed its answer or called notify-parents (0058).';
comment on column parent_notice_status.digest_job_result is 'The digest job''s last answer: off, nothing_due, night, cap_reached, not_set_up or called (0058).';
comment on column parent_notice_status.digest_run_at is 'When notify-parents last recorded a digest run (0058).';
comment on column parent_notice_status.digest_run is 'The counts of notify-parents'' last digest run (0058).';
comment on column guardians.notice_language is 'Language of the emails to this parent (check-out notices, weekly digest): en, te, hi; null = the child''s app language, else English (0043, 0058).';
comment on function parent_digest_limits() is 'The weekly parent email''s limits (0058): per run, digests a day, parent emails a day app-wide, sending hours (IST), hours before expiry and between Send again, days kept.';
comment on function parent_digest_block(uuid, uuid, boolean) is 'Internal: why this guardian of this student gets no weekly email now (switched_off, not_eligible, withdrawn, not_active, adult, no_consent, no_email, no_digest_consent); null = they do (0058).';
comment on function parent_digest_week(timestamptz) is 'Internal: the Monday of the week the latest weekly parent email covers at a moment (its Sunday 20:30 IST has passed) (0058).';
comment on function parent_digest_queue_open(timestamptz) is 'Internal: true from Sunday 20:30 to Monday 20:30 IST, when the week''s parent emails are queued (0058).';
comment on function parent_digest_send_open(timestamptz) is 'Internal: true during the sending hours of the weekly parent email (07:00-21:30 IST) (0058).';
comment on function app_parent_mails_today() is 'Internal: parent emails handed to Brevo today (IST) by the whole app: consent codes, notices, digests (0058).';
comment on function parent_digest_room() is 'Internal: how many weekly parent emails may still go today under the digest and app-wide ceilings (0058).';
comment on function parent_digest_content(uuid, date) is 'Internal: what a student''s weekly parent email says for one week: visits (day, times), practice against the goal, ticks, level change, next event; never a location (0058).';
comment on function queue_parent_digests(date) is 'Internal: queues one week''s parent emails, one per child and parent address that may get one; never twice (0058).';
comment on function send_parent_digests() is 'Every 5 minutes (pg_cron mridanga-parent-digests): queues the week''s parent emails after Sunday 20:30 IST and calls notify-parents while one waits; answers off, nothing_due, night, cap_reached, not_set_up or called (0058).';
comment on function claim_parent_digests(int) is 'Edge Function only: purges, ends rows that may no longer go, and claims up to 10 weekly parent emails within the sending hours and ceilings, with what each email needs (0058).';
comment on function finish_parent_digests(uuid, bigint[], bigint[], bigint[], jsonb, jsonb) is 'Edge Function only: records sent, skipped (dry run), retry and refused weekly parent emails of one claim (0058).';
comment on function stop_parent_digests(uuid) is 'Edge Function only (signed one-click unsubscribe): withdraws this address''s yes to the weekly email for every child and ends waiting ones (0058).';
comment on function set_parent_digest(boolean) is 'The Guru: switches the weekly parent email on or off (audit log); off ends waiting ones. Returns the overview (0058).';
comment on function guardian_digest_status(uuid) is 'Staff: per guardian of a student, why no weekly email goes (null = it does), when the yes was recorded, the last one sent and the latest outcome. No names or emails (0058).';
comment on function set_guardian_digest(uuid, boolean, text) is 'Staff: records a parent''s written yes to the weekly email (a digest consent) or withdraws it. Errors: not_allowed, guardian_not_found, no_email, not_a_minor, student_withdrawn, data_consent_required, notice_version_invalid (0058).';
comment on function resend_parent_digest(uuid) is 'Staff: Send again: queues the latest week''s parent email once more for this guardian. Errors: not_allowed, guardian_not_found, digest_blocked, digest_again_too_soon (0058).';
comment on function preview_parent_digest(uuid, date) is 'Staff: what a parent of this student would get for a week (default this week so far), per guardian whether and in which language; notify-parents builds the email from it (0058).';
comment on function parent_digest_overview() is 'Staff: the weekly parent email at a glance: on or off, limits, parents who would get it, the latest week by outcome, today''s emails against the ceilings, the job''s last answer (0058).';
