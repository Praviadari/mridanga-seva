-- Mridanga Seva — 0040: operations backlog (audit brief 16, Low/Info, dimensions 10 and 11). Run
-- once, after 0039, in the Supabase SQL editor (TEST first). Why: docs/DECISIONS.md #194-#196.
-- How: docs/OPERATIONS.md "Scheduled jobs: health check", "Files no announcement uses" and
-- "Staff who leave".
--
-- Nothing changes for the app's screens; old app builds keep working.
--
-- 1. pg_cron's run history is trimmed: a daily job deletes cron.job_run_details rows older than 7
--    days (D2-08, #194). The push job alone adds about 1,440 rows a day to the 500 MB database.
-- 2. Announcement files no announcement lists (an upload whose post was never saved, or a delete
--    that failed offline) are removed once a day by the Edge Function, through the Storage API
--    (D1b-07, #195). This migration adds the list and the daily job that asks the function; the
--    function must be deployed again for the files to go (until then nothing changes).
-- 3. A staff login that did any work cannot be deleted (13 columns keep who did what). The owner,
--    in the SQL editor, can now anonymise one in place: anonymise_staff() (FS1a-14, #196).

-- ---------------------------------------------------------------- 1. pg_cron's run history
-- Supabase's own advice for pg_cron: delete old run details on a schedule. Seven days keep the
-- weekly health check (OPERATIONS "Scheduled jobs: health check", failures of the last 2 days) whole.
select cron.schedule('mridanga-cron-history-purge', '15 2 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);

-- ---------------------------------------------------------------- 2. files no announcement lists
-- The bucket announcement-files holds only announcements' photos and PDFs (materials, fund bills,
-- recordings and sloka audio have buckets of their own). A file older than a day that no
-- announcement lists can never be shown again: the app uploads just before it saves the post.
-- At most 100 a day, oldest first; and none while the announcements table is empty, so a
-- half-finished restore (files back, rows not yet) cannot empty the bucket.
create or replace function orphan_announcement_files() returns setof text
language sql stable set search_path = public, pg_temp as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'announcement-files'
     and o.created_at < now() - interval '1 day'
     and exists (select 1 from announcements)
     and not exists (select 1 from announcements a
                      where a.attachments @> jsonb_build_array(jsonb_build_object('path', o.name)))
   order by o.created_at
   limit 100
$$;

-- Daily: when there is something to remove, ask the Edge Function to clean up (it already does so
-- for recordings past their keep time, 0016/0020). Storage files are deleted only through the
-- Storage API; a delete in SQL would forget the file and leave it taking space.
create or replace function orphan_files_daily() returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  if exists (select 1 from orphan_announcement_files()) then
    perform call_notify_function('{"cleanup": true}'::jsonb);
  end if;
end $$;

select cron.schedule('mridanga-orphan-files', '0 2 * * *', 'select orphan_files_daily()');

-- ---------------------------------------------------------------- 3. staff who leave
-- The tombstone of an anonymised staff login, next to the students' erasures (0025).
alter table erasures add column staff_profile uuid;

-- In this order:
--   1. checks: the owner (SQL editor; closed to every app role); a coordinator or Guru login, switched off already, not the
--      caller's own;
--   2. the login is deleted if it can be (it did no work, nothing points to it) — then the profile
--      goes with it and nothing else is needed;
--   3. otherwise the login keeps its row, but its sign-in email becomes <id>@former-staff.invalid
--      and its sign-up details go (if the owner may not change auth.users, login_scrubbed is false
--      and the runbook says what to do in the dashboard);
--   4. the profile keeps its id, so every record still says "done by" someone: the name becomes
--      "Former staff", email, phone, duty hours, gender and referral code go, the roles' extras
--      (treasurer, Ishtagoshti editor) are switched off; the phones are forgotten;
--   5. ONLY THEN audit_log is redacted: the profile's own rows, and any row holding the old email,
--      keep table, action, time and who, but lose the values (rows about others it touched stay);
--   6. a tombstone row in erasures (staff_profile, reason, reference).
-- Returns { login_deleted, login_scrubbed, audit_rows_redacted }. Error codes: not_allowed,
-- reason_required, reason_too_long, profile_not_found, not_staff, not_yourself, switch_off_first.
create or replace function anonymise_staff(p_profile uuid, p_reason text, p_request_ref text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p          profiles;
  v_reason   text := nullif(btrim(coalesce(p_reason, ''), E' \t\r\n'), '');
  v_ref      text := nullif(btrim(coalesce(p_request_ref, ''), E' \t\r\n'), '');
  v_email    text;
  v_deleted  boolean := false;
  v_scrubbed boolean := false;
  v_redacted int;
begin
  if not privacy_caller_ok() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v_reason is null then raise exception 'reason_required'; end if;
  if char_length(v_reason) > 500 or char_length(v_ref) > 100 then raise exception 'reason_too_long'; end if;
  select * into p from profiles where id = p_profile for update;
  if not found then raise exception 'profile_not_found'; end if;
  if p.role not in ('coordinator', 'guru') then
    raise exception 'not_staff' using detail = 'A student or subscriber is erased with erase_student or leaves in the app.';
  end if;
  if p_profile = auth.uid() then raise exception 'not_yourself'; end if;
  if p.active then raise exception 'switch_off_first' using detail = 'Switch the login off in the app first.'; end if;
  v_email := lower(p.email);

  delete from push_tokens where profile_id = p_profile;

  begin
    delete from auth.users where id = p_profile;
    v_deleted := found;
  exception when foreign_key_violation or insufficient_privilege then
    v_deleted := false;
  end;

  if not v_deleted then
    begin
      update auth.users
         set email = p_profile::text || '@former-staff.invalid', raw_user_meta_data = '{}'::jsonb
       where id = p_profile;
      v_scrubbed := found;
    exception when insufficient_privilege then
      v_scrubbed := false;
    end;
    update profiles
       set full_name = 'Former staff', email = null, phone = null, duty_hours = null, gender = null,
           referral_code = null, is_treasurer = false, ig_editor = false, active = false
     where id = p_profile;
  end if;

  update audit_log a
     set old_row = null, new_row = null
   where (a.old_row is not null or a.new_row is not null)
     and ((a.table_name = 'profiles' and a.row_id = p_profile::text)
          or (v_email is not null
              and position(v_email in lower(coalesce(a.old_row::text, '') || coalesce(a.new_row::text, ''))) > 0));
  get diagnostics v_redacted = row_count;

  insert into erasures (staff_profile, erased_by, reason, request_ref, audit_rows_redacted)
  values (p_profile, auth.uid(), v_reason, v_ref, v_redacted);

  return jsonb_build_object('login_deleted', v_deleted, 'login_scrubbed', v_scrubbed,
                            'audit_rows_redacted', v_redacted);
end $$;

-- ---------------------------------------------------------------- who may run the new functions
-- docs/DECISIONS.md #14. orphan_announcement_files is for the Edge Function (service_role) only;
-- the daily job and anonymise_staff run in the SQL editor or from pg_cron (the owner).
revoke execute on function orphan_announcement_files(), orphan_files_daily(),
  anonymise_staff(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function orphan_announcement_files() to service_role;

-- ---------------------------------------------------------------- descriptions
comment on function orphan_announcement_files() is
  'Edge Function only: up to 100 files in announcement-files, over a day old, that no announcement lists (none while there are no announcements at all). The function deletes them through the Storage API.';
comment on function orphan_files_daily() is
  'Daily 07:30 IST (pg_cron mridanga-orphan-files): asks the Edge Function to clean up when orphan_announcement_files() has something.';
comment on function anonymise_staff(uuid, text, text) is
  'Owner (SQL editor) only: deletes a switched-off staff login, or when its work keeps it, anonymises it in place (Former staff, no email/phone) and redacts its audit rows; writes a tombstone in erasures. Errors: not_allowed, reason_required, reason_too_long, profile_not_found, not_staff, not_yourself, switch_off_first.';
comment on column erasures.staff_profile is
  'For an anonymised staff login (0040): the profile id, which stays as "Former staff". Null for a student erasure.';
