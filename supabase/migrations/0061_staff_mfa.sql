-- Mridanga Seva — 0061: a sign-in code (TOTP) for staff, private details behind it once the Guru asks, and a
-- client error log without personal data (audit 22-10-2026 fixes 15 and 16; docs/DECISIONS.md #580-#589;
-- docs/DATABASE.md "Staff sign-in codes and the error log (0061)"; docs/OPERATIONS.md "Staff sign-in codes" and
-- "App errors and uptime"). Run once after 0059 (it does not need 0060), in the Supabase SQL editor (TEST first).
-- Safe to run twice.
--
-- Nothing changes for anyone until the Guru switches staff_mfa_required on, and the switch refuses until every
-- active staff member has a sign-in code. Old app builds keep working while it is off; once it is on, an old
-- build signs in with the password only (aal1) and is refused the private reads below with mfa_required.
--
-- 1. Sign-in codes are Supabase Auth's own MFA (TOTP factors in auth.mfa_factors; the app enrols and asks the
--    code with supabase-js, no native module). A session that gave the code carries aal = 'aal2' in its token.
-- 2. Setting staff_mfa_required (false), changed only by set_staff_mfa_required (the Guru; audit log). On needs
--    the Guru's own aal2 session and a code for every active staff member; off needs aal2, or a Guru who has no
--    code (after a reset), so the only Guru can always get back (#582).
-- 3. While it is on, these need an aal2 session: the logged reads get_guardians, get_consents, get_call_notes,
--    get_audit_log; the Guru's direct reads of guardians, consents, call_logs and access_log; and the parent's
--    email and phone on a child's waiting sign-up (waiting_sign_ups). Error mfa_required (#583).
-- 4. staff_mfa_overview (the Guru: who has a code), my_mfa_state (staff), reset_staff_mfa (the Guru resets
--    another staff member's code; never their own; audited, #584).
-- 5. client_errors: what broke, never who. log_client_error keeps the kind, the error's name, the screen's
--    route pattern, the app version, the platform and staff/student/other; one row per hour and kind, counted;
--    at most 10 calls a login an hour and 300 new rows a day; the Guru reads it (App errors). Purged after
--    30 days by the job mridanga-client-errors-purge (#585-#587).

-- ---------------------------------------------------------------- 1. helpers
-- True when the caller's session gave the sign-in code (the token's aal claim). The SQL editor and the jobs
-- have no token: false.
create or replace function my_aal2() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
$$;

-- True when this login has a verified sign-in code (any verified factor). Null when the database may not read
-- auth.mfa_factors (then the switch treats the person as having none).
create or replace function has_sign_in_code(p_profile uuid) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return exists (select 1 from auth.mfa_factors f where f.user_id = p_profile and f.status::text = 'verified');
exception when insufficient_privilege or undefined_table then
  return null;
end $$;

-- ---------------------------------------------------------------- 2. the switch
insert into settings (key, value) values ('staff_mfa_required', 'false') on conflict (key) do nothing;

-- True when private details may be read now: the switch is off, or the caller gave the sign-in code.
create or replace function private_reads_open() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select not coalesce(setting_flag('staff_mfa_required'), false) or my_aal2()
$$;

-- The Guru's view of the sign-in codes (the screen "Sign-in codes"): the switch, the caller's own session, and
-- every active Guru and coordinator with whether they have a code and since when. No email, no factor id.
create or replace function staff_mfa_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not coalesce(is_guru(), false) then raise exception 'not_allowed' using errcode = '42501'; end if;
  return staff_mfa_list();
end $$;

-- Internal: the overview's content (its own block, so the role check above is never caught by the handler).
create or replace function staff_mfa_list() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return jsonb_build_object(
    'required', coalesce(setting_flag('staff_mfa_required'), false),
    'my_aal2', my_aal2(),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name, 'role', p.role,
                                          'has_code', has_sign_in_code(p.id), 'since', x.since)
                       order by p.role = 'coordinator', p.full_name, p.id)
        from profiles p
        left join lateral (select min(f.created_at) as since from auth.mfa_factors f
                            where f.user_id = p.id and f.status::text = 'verified') x on true
       where p.role in ('guru', 'coordinator') and p.active), '[]'));
exception when insufficient_privilege or undefined_table then
  -- auth.mfa_factors closed to the owner: the list without codes, so the switch cannot go on.
  return jsonb_build_object(
    'required', coalesce(setting_flag('staff_mfa_required'), false), 'my_aal2', my_aal2(),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name, 'role', p.role,
                                                           'has_code', null, 'since', null)
                                        order by p.role = 'coordinator', p.full_name, p.id)
                         from profiles p where p.role in ('guru', 'coordinator') and p.active), '[]'));
end $$;

-- A staff member's own state, for the screen "Sign-in code": is the switch on, do I have a code, did this
-- session give it.
create or replace function my_mfa_state() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not coalesce(is_staff(), false) then raise exception 'not_allowed' using errcode = '42501'; end if;
  return jsonb_build_object('required', coalesce(setting_flag('staff_mfa_required'), false),
                            'has_code', has_sign_in_code(auth.uid()), 'aal2', my_aal2());
end $$;

-- The Guru switches the sign-in codes on or off (#582). Errors: not_allowed; mfa_required (on: this session
-- did not give the code; off: the Guru has a code but this session did not give it); staff_without_code (on:
-- detail says how many active staff members have none yet). Every change goes to audit_log (audit_setting).
create or replace function set_staff_mfa_required(p_on boolean) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_missing int;
begin
  if not coalesce(is_guru(), false) or p_on is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_on then
    if not my_aal2() then
      raise exception 'mfa_required' using detail = 'Sign in with your own sign-in code before you switch codes on.';
    end if;
    select count(*)::int into v_missing
      from profiles p
     where p.role in ('guru', 'coordinator') and p.active and has_sign_in_code(p.id) is not true;
    if v_missing > 0 then
      raise exception 'staff_without_code' using detail = format('%s staff member(s) have no sign-in code yet.', v_missing);
    end if;
  elsif not my_aal2() and has_sign_in_code(auth.uid()) is not false then
    raise exception 'mfa_required' using detail = 'Give your sign-in code first; a Guru without one may switch codes off.';
  end if;
  update settings set value = to_jsonb(p_on) where key = 'staff_mfa_required' and value is distinct from to_jsonb(p_on);
  return staff_mfa_overview();
end $$;

-- The Guru removes another staff member's sign-in code (a lost or new phone, #584); they set up a new one at
-- their next sign-in. Never the Guru's own (not_yourself: another Guru or the project owner does that, OPERATIONS
-- "Staff sign-in codes"). One audit_log row (table mfa_factors, the login's id, how many codes went; never a
-- secret). Errors: not_allowed, profile_not_found, not_yourself, not_staff, mfa_required (the switch is on and
-- this session did not give the code), reset_in_dashboard (the database may not touch auth.mfa_factors: the
-- owner removes it in Authentication -> Users). Returns how many codes were removed.
create or replace function reset_staff_mfa(p_profile uuid) returns int
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_role app_role;
  v_rows int;
begin
  if not coalesce(is_guru(), false) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_profile is not null and p_profile = auth.uid() then raise exception 'not_yourself'; end if;
  select role into v_role from profiles where id = p_profile;
  if not found then raise exception 'profile_not_found'; end if;
  if v_role not in ('guru', 'coordinator') then raise exception 'not_staff'; end if;
  if not private_reads_open() then
    raise exception 'mfa_required' using detail = 'Give your own sign-in code before you reset someone else''s.';
  end if;
  begin
    delete from auth.mfa_factors where user_id = p_profile;
    get diagnostics v_rows = row_count;
  exception when insufficient_privilege or undefined_table then
    raise exception 'reset_in_dashboard' using detail = 'Remove the code in Supabase: Authentication -> Users -> the person -> MFA.';
  end;
  insert into audit_log (table_name, row_id, action, changed_by, old_row, new_row)
  values ('mfa_factors', p_profile::text, 'DELETE', auth.uid(), jsonb_build_object('codes', v_rows), null);
  return v_rows;
end $$;

-- ---------------------------------------------------------------- 3. private reads need the code (when on)
-- 0034's reading functions, with the check after the role check; otherwise unchanged.
create or replace function get_guardians(p_student uuid)
returns table (id uuid, full_name text, phone text, email text, relation text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rows int;
begin
  if not is_staff() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if not private_reads_open() then raise exception 'mfa_required'; end if;
  if p_student is null then raise exception 'student_required'; end if;
  return query
    select g.id, g.full_name, g.phone, g.email, g.relation
      from guardians g
     where g.student_id = p_student
     order by g.full_name, g.id;
  get diagnostics v_rows = row_count;
  perform log_access('get_guardians', p_student, v_rows);
end $$;

create or replace function get_consents(p_student uuid)
returns table (id uuid, scope text, method text, id_type_checked text, signed_form boolean,
               notice_version text, given_at timestamptz, revoked_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rows int;
begin
  if not is_staff() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if not private_reads_open() then raise exception 'mfa_required'; end if;
  if p_student is null then raise exception 'student_required'; end if;
  return query
    select c.id, c.scope, c.method, c.id_type_checked, c.signed_form, c.notice_version, c.given_at, c.revoked_at
      from consents c
     where c.student_id = p_student
     order by c.given_at desc, c.id;
  get diagnostics v_rows = row_count;
  perform log_access('get_consents', p_student, v_rows);
end $$;

create or replace function get_call_notes(p_student uuid, p_limit int default null)
returns table (id uuid, called_at timestamptz, outcome call_outcome, reason text, comment text,
               next_date date, coordinator_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rows int;
begin
  if not is_staff() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if not private_reads_open() then raise exception 'mfa_required'; end if;
  if p_student is null then raise exception 'student_required'; end if;
  return query
    select c.id, c.called_at, c.outcome, c.reason, c.comment, c.next_date, c.coordinator_id
      from call_logs c
     where c.student_id = p_student
     order by c.called_at desc, c.id
     limit case when p_limit is null then null else greatest(p_limit, 1) end;
  get diagnostics v_rows = row_count;
  perform log_access('get_call_notes', p_student, v_rows);
end $$;

create or replace function get_audit_log(p_table text default null, p_person uuid default null,
  p_action text default null, p_since timestamptz default null, p_before bigint default null,
  p_limit int default 50)
returns setof audit_log
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rows int;
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if not private_reads_open() then raise exception 'mfa_required'; end if;
  return query
    select a.*
      from audit_log a
     where (p_table is null or a.table_name = p_table)
       and (p_person is null or a.changed_by = p_person)
       and (p_action is null or a.action = p_action)
       and (p_since is null or a.changed_at >= p_since)
       and (p_before is null or a.id < p_before)
     order by a.id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
  get diagnostics v_rows = row_count;
  perform log_access('get_audit_log', null, v_rows);
end $$;

-- The Guru's direct reads (0034, in 0037's once-per-query form) get the same condition. Writes are unchanged.
alter policy "guru_read" on guardians using ((select is_guru()) and (select private_reads_open()));
alter policy "guru_read" on consents  using ((select is_guru()) and (select private_reads_open()));
alter policy "guru_read" on call_logs using ((select is_guru()) and (select private_reads_open()));
alter policy "guru_read" on access_log using ((select is_guru()) and (select private_reads_open()));

-- 0051's waiting_sign_ups, with the parent's email and phone left out while the code is needed and not given
-- (the name, the relation and the consent still show, so Accept can be prepared). Otherwise unchanged.
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
               'name', m.parent_name, 'relation', m.parent_relation,
               'email', case when private_reads_open() then m.parent_email end,
               'phone', case when private_reads_open() then m.parent_phone end,
               'consented_at', m.consented_at, 'photo_consent', m.photo_consent) end)
           order by p.created_at desc)
      from profiles p
      join auth.users u on u.id = p.id
      left join person_details d on d.profile_id = p.id and d.student_id is null
      left join minor_signups m on m.profile_id = p.id
     where p.role in ('pending', 'student') and p.active and u.email_confirmed_at is not null
       and not exists (select 1 from students s where s.profile_id = p.id)
       and not exists (select 1 from ig_subscribers i where i.profile_id = p.id)
       and (m.profile_id is null or m.consented_at is not null)
       and (is_guru() or p.centre_id = (select me.centre_id from profiles me where me.id = auth.uid()))
       and p.created_at > now() - interval '180 days'), '[]') end
$$;

-- ---------------------------------------------------------------- 5. the client error log
-- What broke, never who (#585): no login id, name, email, phone, token, message or free text. One row per UTC
-- hour and (kind, error name, screen, version, platform, area), counted.
create table if not exists client_errors (
  id           bigint generated always as identity primary key,
  hour         timestamptz not null,
  kind         text not null check (kind in ('crash', 'unhandled')),
  error_name   text not null check (error_name ~ '^[A-Za-z][A-Za-z0-9_]{0,59}$'),
  screen       text not null check (screen ~ '^(/|(/[a-z_()\[\]+-]{1,40}){1,8})$'),
  app_version  text not null check (app_version ~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$'),
  platform     text not null check (platform in ('android', 'ios', 'web')),
  area         text not null check (area in ('staff', 'student', 'other')),
  times        int not null default 1 check (times >= 1),
  first_at     timestamptz not null default now(),
  last_at      timestamptz not null default now(),
  unique (hour, kind, error_name, screen, app_version, platform, area)
);
create index if not exists client_errors_last_idx on client_errors (last_at desc);
alter table client_errors enable row level security;
drop policy if exists guru_read on client_errors;
create policy guru_read on client_errors for select to authenticated using ((select is_guru()));
revoke all on client_errors from public, anon, authenticated;
grant select on client_errors to authenticated;

-- The rate limit: calls per login per hour. Read by nobody in the app; rows go after two days.
create table if not exists client_error_quota (
  profile_id uuid not null references profiles (id) on delete cascade,
  hour       timestamptz not null,
  calls      int not null default 1,
  primary key (profile_id, hour)
);
alter table client_error_quota enable row level security;
revoke all on client_error_quota from public, anon, authenticated;

-- The limits, in one place for the function, the app and the smoke test.
create or replace function client_error_limits() returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object('per_login_hour', 10, 'new_rows_day', 300, 'keep_days', 30)
$$;

-- The app reports an error (the error boundary, an unhandled rejection). Quietly kept or dropped: over a limit
-- nothing is written and nothing is said, so a crash loop cannot fill the table or slow the app. Wrong input
-- (which the app never sends) is refused with error_report_invalid. Signed-in people only.
create or replace function log_client_error(p_kind text, p_error text, p_screen text, p_version text, p_platform text)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_me    uuid := auth.uid();
  v_hour  timestamptz := date_trunc('hour', now());
  v_area  text;
  v_calls int;
  lim     jsonb := client_error_limits();
begin
  if v_me is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('crash', 'unhandled')
     or p_error is null or p_error !~ '^[A-Za-z][A-Za-z0-9_]{0,59}$'
     or p_screen is null or p_screen !~ '^(/|(/[a-z_()\[\]+-]{1,40}){1,8})$'
     or p_version is null or p_version !~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$'
     or p_platform is null or p_platform not in ('android', 'ios', 'web') then
    raise exception 'error_report_invalid';
  end if;
  insert into client_error_quota (profile_id, hour) values (v_me, v_hour)
  on conflict (profile_id, hour) do update set calls = client_error_quota.calls + 1
  returning calls into v_calls;
  if v_calls > (lim ->> 'per_login_hour')::int then return; end if;
  select case when p.role in ('guru', 'coordinator') then 'staff' when p.role = 'student' then 'student' else 'other' end
    into v_area from profiles p where p.id = v_me;
  v_area := coalesce(v_area, 'other');
  update client_errors set times = times + 1, last_at = now()
   where hour = v_hour and kind = p_kind and error_name = p_error and screen = p_screen
     and app_version = p_version and platform = p_platform and area = v_area;
  if found then return; end if;
  if (select count(*) from client_errors where first_at >= date_trunc('day', now())) >= (lim ->> 'new_rows_day')::int then
    return;
  end if;
  insert into client_errors (hour, kind, error_name, screen, app_version, platform, area)
  values (v_hour, p_kind, p_error, p_screen, p_version, p_platform, v_area)
  on conflict (hour, kind, error_name, screen, app_version, platform, area)
  do update set times = client_errors.times + 1, last_at = now();
end $$;

-- Nightly: error rows not seen for 30 days, and rate-limit rows older than two days. Returns rows deleted.
create or replace function purge_client_errors() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_errors int; v_quota int;
begin
  delete from client_errors where last_at < now() - make_interval(days => (client_error_limits() ->> 'keep_days')::int);
  get diagnostics v_errors = row_count;
  delete from client_error_quota where hour < now() - interval '2 days';
  get diagnostics v_quota = row_count;
  return v_errors + v_quota;
end $$;
select cron.schedule('mridanga-client-errors-purge', '55 1 * * *', 'select purge_client_errors()');

-- ---------------------------------------------------------------- who may run the new functions
-- docs/DECISIONS.md #14: the helpers are internal (the functions and policies call them as the owner); the staff
-- functions check the role inside; anon gets nothing.
revoke execute on function my_aal2(), has_sign_in_code(uuid), staff_mfa_list(), client_error_limits(), purge_client_errors()
  from public, anon, authenticated;
revoke execute on function private_reads_open(), staff_mfa_overview(), my_mfa_state(), set_staff_mfa_required(boolean),
  reset_staff_mfa(uuid), log_client_error(text, text, text, text, text)
  from public, anon;
-- private_reads_open runs inside the policies as the reader, so signed-in people need it.
grant execute on function private_reads_open(), staff_mfa_overview(), my_mfa_state(), set_staff_mfa_required(boolean),
  reset_staff_mfa(uuid), log_client_error(text, text, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on table client_errors is 'App errors without personal data: kind, error name, the screen''s route pattern, app version, platform, staff/student/other, how many times in that UTC hour. Written by log_client_error; the Guru reads it (App errors); purged 30 days after last seen (0061, docs/DECISIONS.md #585).';
comment on table client_error_quota is 'Rate limit of log_client_error: calls per login per hour. No policy, read by nobody in the app; rows older than two days are purged (0061).';
comment on column client_errors.screen is 'The route pattern, e.g. /staff/students/[id]: no ids, numbers or names (the check allows letters, -, _, brackets and +) (0061).';
comment on function my_aal2 is 'Internal: true when the caller''s session gave the sign-in code (token claim aal = aal2) (0061).';
comment on function has_sign_in_code is 'Internal: true when the login has a verified MFA factor; null when auth.mfa_factors cannot be read (0061).';
comment on function private_reads_open is 'True when private details may be read now: staff_mfa_required is off, or the caller''s session gave the sign-in code (0061, #583).';
comment on function staff_mfa_overview is 'The Guru: the switch, the caller''s aal2, and every active Guru and coordinator with whether they have a sign-in code (0061, #584).';
comment on function staff_mfa_list is 'Internal: the content of staff_mfa_overview (0061).';
comment on function my_mfa_state is 'Staff: is the sign-in code switch on, do I have a code, did this session give it (0061).';
comment on function set_staff_mfa_required is 'The Guru switches staff sign-in codes on (own aal2, every active staff member has a code) or off (aal2, or a Guru without a code); audited (0061, #582). Errors: not_allowed, mfa_required, staff_without_code.';
comment on function reset_staff_mfa is 'The Guru removes another staff member''s sign-in code; never their own; audited (0061, #584). Errors: not_allowed, profile_not_found, not_yourself, not_staff, mfa_required, reset_in_dashboard.';
comment on function client_error_limits is 'Limits of the client error log: 10 calls a login an hour, 300 new rows a day, kept 30 days (0061).';
comment on function log_client_error is 'The app reports an error without personal data; quietly dropped over the limits (0061, #585). Error: error_report_invalid, not_allowed.';
comment on function purge_client_errors is 'Nightly job (pg_cron mridanga-client-errors-purge, 01:55 UTC): deletes client_errors not seen for 30 days and rate-limit rows older than two days (0061).';
comment on function get_guardians is 'A student''s parents or guardians, for active staff; needs the sign-in code while staff_mfa_required is on; writes one access_log row (0034, 0061). Error codes: not_allowed, mfa_required, student_required.';
comment on function get_consents is 'A student''s consent records, newest first, for active staff; needs the sign-in code while staff_mfa_required is on; writes one access_log row (0034, 0061).';
comment on function get_call_notes is 'A student''s follow-up calls with notes, newest first (p_limit = newest n), for active staff; needs the sign-in code while staff_mfa_required is on; writes one access_log row (0034, 0061).';
comment on function get_audit_log is 'One page of audit_log for the Guru (G11), newest first, with the screen''s filters; needs the sign-in code while staff_mfa_required is on; writes one access_log row (0034, 0061).';
