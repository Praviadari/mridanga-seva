-- Mridanga Seva — 0049: storage and erasure clean-up before launch (audit phase 3, brief L8: S3-02, S3-03,
-- S4-05, S4-06, S2-06). Run once, after 0048, in the Supabase SQL editor (TEST first). Why:
-- docs/DECISIONS.md #286-#287. How: docs/OPERATIONS.md "Erasure request" and "Files no announcement uses".
--
-- Nothing changes for the app's screens; old app builds keep working. No new pg_cron job: the existing
-- daily jobs do the new work. No Edge Function deploy: the function's existing daily clean-up deletes the
-- extra files (it removes whatever claim_expired_submission_files() returns from assessment-files).
--
-- 1. S2-06: erasure blanked other people's audit rows whose text merely CONTAINED the erased email
--    (erasing ram@example.com blanked sriram@example.com's history). An email now matches only as a whole
--    JSON value; ids (uuids) still match anywhere. One helper, audit_redact(), for erase_student,
--    anonymise_staff and the new erase_login.
-- 2. S3-02: recordings uploaded for an assessment but never submitted (app killed, offline, a failed
--    clean-up) and the files of an erased child stayed in Storage for ever. Files in assessment-files that
--    no assessment or submission lists, over a day old, are now deleted by the daily clean-up; erase_student
--    lists every file in the child's folder.
-- 3. S3-03: one student login could fill the free plan's 1 GB of Storage in two days (10 files of 50 MB a
--    day). A student's or coordinator's uploads to assessment-files now stop once that login stored 150 MB
--    in the last 24 hours (the 10-files-a-day limit stays).
-- 4. S4-05: erase_student left the child's name in staff inbox notices ("You are now the mentor of ...")
--    for up to a year, and in push_outbox for ever. Erasure now deletes the notices about the child; the
--    daily inbox clean-up also deletes push_outbox rows older than 30 days (the inbox keeps its own copy).
-- 5. S4-06: a sign-up that never became a student could only be deleted in Authentication -> Users, which
--    left full copies (name, phone, email, date of birth) in audit_log. erase_login() erases a waiting
--    login (role pending, no student record) with the same redaction and a tombstone, as erase_student.
--
-- Every UPDATE/DELETE has a WHERE (Supabase safeupdate). Safe to run twice.

-- ---------------------------------------------------------------- 1. audit redaction (S2-06)
-- Blanks the copied values of every audit_log row that names one of the ids (as its row id or anywhere in
-- its values: uuids are unique) or holds one of the emails as a whole JSON string value ("x@y.z"), so a
-- longer address that merely contains it is left alone. Keeps table, action, time and who. Returns the
-- number of rows blanked. Internal: the erasure functions below call it as the owner.
create or replace function audit_redact(p_ids text[], p_emails text[]) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ids    text[] := array(select lower(x) from unnest(coalesce(p_ids, '{}')) x where nullif(btrim(x), '') is not null);
  v_quoted text[] := array(select '"' || lower(btrim(x)) || '"' from unnest(coalesce(p_emails, '{}')) x
                            where nullif(btrim(x), '') is not null);
  v_rows   int;
begin
  if cardinality(v_ids) = 0 and cardinality(v_quoted) = 0 then return 0; end if;
  update audit_log a
     set old_row = null, new_row = null
   where (a.old_row is not null or a.new_row is not null)
     and (a.row_id = any (v_ids)
          or exists (select 1 from unnest(v_ids || v_quoted) n
                      where position(n in lower(coalesce(a.old_row::text, '') || coalesce(a.new_row::text, ''))) > 0));
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;

-- ---------------------------------------------------------------- 2. notices about a person (S4-05)
-- Deletes the staff inbox notices and queued pushes about a person: those whose screen is the person's
-- record or one of the given screens (an assessment to review, a nomination), and the notices (not
-- announcements) whose title or text holds the person's full name as whole words, any case. A notice
-- about another person with exactly the same name goes too (inbox notices only, never the audit trail).
-- Returns the number of inbox notices deleted. Internal.
create or replace function forget_notices_about(p_record uuid, p_name text, p_urls text[]) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_name text := lower(nullif(btrim(coalesce(p_name, '')), ''));
  v_id   text := p_record::text;
  v_urls text[] := coalesce(p_urls, '{}');
  v_word text;
  v_rows int;
begin
  -- The name as a regular expression between non-letters: "asha" never matches "ashadhi".
  if v_name is not null then
    v_word := '(^|[^[:alnum:]])' || regexp_replace(v_name, '([][(){}.*+?^$|\\-])', '\\\1', 'g') || '([^[:alnum:]]|$)';
  end if;
  delete from notifications n
   where (v_id is not null and position(v_id in n.url) > 0)
      or n.url = any (v_urls)
      or (v_word is not null and n.announcement_id is null and lower(n.title || ' ' || n.body) ~ v_word);
  get diagnostics v_rows = row_count;
  -- push_queue rows of these go with them (outbox_id, on delete cascade).
  delete from push_outbox o
   where (v_id is not null and position(v_id in o.url) > 0)
      or o.url = any (v_urls)
      or (v_word is not null and lower(o.title || ' ' || o.body) ~ v_word);
  return v_rows;
end $$;

-- ---------------------------------------------------------------- 3. erase a student (S2-06, S3-02, S4-05)
-- As 0025, plus: the files returned are every file in the child's own folder of assessment-files (also
-- recordings never submitted), not only the submitted ones; the daily clean-up deletes them within a day
-- or two, as no assessment lists them any more (section 5), so the runbook's hand deletion is a backstop.
-- The staff notices and queued pushes about the child go (forget_notices_about). Emails are matched as
-- whole values in the audit log (audit_redact). Returns { roll_no, login_deleted, audit_rows_redacted,
-- notices_deleted, files }. Error codes as 0025: not_allowed, reason_required, reason_too_long,
-- student_not_found, open_loan.
create or replace function erase_student(p_student uuid, p_reason text, p_request_ref text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s          students;
  v_reason   text := nullif(btrim(coalesce(p_reason, ''), E' \t\r\n'), '');
  v_ref      text := nullif(btrim(coalesce(p_request_ref, ''), E' \t\r\n'), '');
  v_email    text;
  v_files    jsonb;
  v_urls     text[];
  v_redacted int;
  v_notices  int;
  v_login    boolean := false;
begin
  if not privacy_caller_ok() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v_reason is null then raise exception 'reason_required'; end if;
  if char_length(v_reason) > 500 or char_length(v_ref) > 100 then raise exception 'reason_too_long'; end if;
  select * into s from students where id = p_student for update;
  if not found then raise exception 'student_not_found'; end if;
  if exists (select 1 from inventory_loans where student_id = p_student and returned_at is null) then
    raise exception 'open_loan' using detail = 'Take the lent instrument back first.';
  end if;

  select lower(email) into v_email from profiles where id = s.profile_id;
  select coalesce(jsonb_agg(distinct f), '[]'::jsonb) into v_files
    from (select s.photo_path as f where s.photo_path is not null
          union
          select x #>> '{}'
            from assessment_submissions sub
            join assessment_assignments aa on aa.id = sub.assignment_id
           cross join lateral jsonb_path_query(jsonb_build_array(sub.file, sub.voice_note), '$.**.path') x
           where aa.student_id = p_student
          union
          select o.name
            from storage.objects o
           where s.profile_id is not null
             and o.bucket_id = 'assessment-files'
             and split_part(o.name, '/', 1) = s.profile_id::text) files;
  -- The staff screens that named the child: her assessments to review, her nominations.
  v_urls := array(select '/staff/assessments/review/' || aa.id from assessment_assignments aa where aa.student_id = p_student
                  union all
                  select '/staff/promotion/' || n.id from promotion_nominations n where n.student_id = p_student);

  if s.profile_id is not null then
    delete from push_tokens where profile_id = s.profile_id;
  end if;
  delete from inventory_loans where student_id = p_student;
  delete from students where id = p_student;

  if s.profile_id is not null then
    begin
      delete from auth.users where id = s.profile_id;
      v_login := found;
    exception when insufficient_privilege then
      v_login := false;
    end;
    delete from profiles where id = s.profile_id;  -- gone already when the login was deleted
  end if;

  v_notices := forget_notices_about(p_student, s.full_name, v_urls);
  v_redacted := audit_redact(array[p_student::text, s.profile_id::text, s.qr_token::text], array[lower(s.email), v_email]);

  insert into erasures (roll_no, erased_by, reason, request_ref, audit_rows_redacted)
  values (s.roll_no, auth.uid(), v_reason, v_ref, v_redacted);

  return jsonb_build_object('roll_no', s.roll_no, 'login_deleted', v_login, 'audit_rows_redacted', v_redacted,
                            'notices_deleted', v_notices, 'files', v_files);
end $$;

-- ---------------------------------------------------------------- 4. erase a waiting sign-up (S4-06)
-- The tombstone of an erased waiting login, next to the students' and staff's (0025, 0040).
alter table erasures add column if not exists login_profile uuid;

-- Erases a login that signed up and never became a student (role pending: a waiting sign-up, an
-- Ishtagoshti subscriber), on the person's (or a parent's) request. The Guru in the app, or the owner in
-- the SQL editor. In this order:
--   1. checks: a pending login, not on any student record (use erase_student), not the caller's own;
--   2. its phones are forgotten; the login is deleted (auth.users, which removes the profile, its About
--      you details, Ishtagoshti rows and notices); if the owner may not delete from auth.users, only the
--      profile goes and the runbook deletes the login in Authentication -> Users;
--   3. ONLY THEN audit_log is redacted: every row naming the login's id, or holding its email as a value;
--   4. a tombstone row in erasures (login_profile, reason, reference).
-- Returns { login_deleted, audit_rows_redacted }. Error codes: not_allowed, reason_required,
-- reason_too_long, profile_not_found, not_pending, has_student_record, not_yourself.
create or replace function erase_login(p_profile uuid, p_reason text, p_request_ref text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p          profiles;
  v_reason   text := nullif(btrim(coalesce(p_reason, ''), E' \t\r\n'), '');
  v_ref      text := nullif(btrim(coalesce(p_request_ref, ''), E' \t\r\n'), '');
  v_auth     text;
  v_deleted  boolean := false;
  v_redacted int;
begin
  if not privacy_caller_ok() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v_reason is null then raise exception 'reason_required'; end if;
  if char_length(v_reason) > 500 or char_length(v_ref) > 100 then raise exception 'reason_too_long'; end if;
  select * into p from profiles where id = p_profile for update;
  if not found then raise exception 'profile_not_found'; end if;
  if p.role <> 'pending' then
    raise exception 'not_pending' using detail = 'A student is erased with erase_student, a staff login with anonymise_staff.';
  end if;
  if exists (select 1 from students where profile_id = p_profile) then
    raise exception 'has_student_record' using detail = 'The login is on a student record: use erase_student.';
  end if;
  if p_profile = auth.uid() then raise exception 'not_yourself'; end if;
  select lower(email) into v_auth from auth.users where id = p_profile;

  delete from push_tokens where profile_id = p_profile;
  begin
    delete from auth.users where id = p_profile;
    v_deleted := found;
  exception when insufficient_privilege then
    v_deleted := false;
  end;
  delete from profiles where id = p_profile;  -- gone already when the login was deleted

  v_redacted := audit_redact(array[p_profile::text], array[lower(p.email), v_auth]);

  insert into erasures (login_profile, erased_by, reason, request_ref, audit_rows_redacted)
  values (p_profile, auth.uid(), v_reason, v_ref, v_redacted);

  return jsonb_build_object('login_deleted', v_deleted, 'audit_rows_redacted', v_redacted);
end $$;

-- ---------------------------------------------------------------- 4b. a leaving staff login (S2-06)
-- As 0040, with the audit redaction of audit_redact (an email as a whole value only).
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
    raise exception 'not_staff' using detail = 'A student is erased with erase_student, a waiting sign-up with erase_login.';
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

  -- The profile's own rows (row id) and any row holding the old email as a value. The id is NOT matched
  -- inside other rows' values: a staff id sits in created_by / changed_by of the work it did, kept.
  update audit_log a
     set old_row = null, new_row = null
   where (a.old_row is not null or a.new_row is not null)
     and a.table_name = 'profiles' and a.row_id = p_profile::text;
  get diagnostics v_redacted = row_count;
  v_redacted := v_redacted + audit_redact('{}', array[v_email]);

  insert into erasures (staff_profile, erased_by, reason, request_ref, audit_rows_redacted)
  values (p_profile, auth.uid(), v_reason, v_ref, v_redacted);

  return jsonb_build_object('login_deleted', v_deleted, 'login_scrubbed', v_scrubbed,
                            'audit_rows_redacted', v_redacted);
end $$;

-- ---------------------------------------------------------------- 5. files no assessment lists (S3-02)
-- The bucket assessment-files holds the Guru's files on assessments (assessments.media), students'
-- recordings (assessment_submissions.file) and coordinators' voice notes (assessment_submissions.voice_note).
-- A file older than a day that none of these lists can never be shown again: the app uploads just before
-- it saves. At most 200 a day, oldest first; none while there is no assessment at all, so a half-finished
-- restore (files back, rows not yet) cannot empty the bucket. Files whose submission's keep time ran out
-- are still listed by their row, so they are not returned twice.
create or replace function orphan_assessment_files() returns setof text
language sql stable set search_path = public, pg_temp as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'assessment-files'
     and o.created_at < now() - interval '1 day'
     and exists (select 1 from assessments)
     and not exists (select 1 from assessments a
                      where a.media @> jsonb_build_array(jsonb_build_object('path', o.name)))
     and not exists (select 1 from assessment_submissions s
                      where s.file ->> 'path' = o.name or s.voice_note ->> 'path' = o.name)
   order by o.created_at
   limit 200
$$;

-- 0020's claim, plus those files with no submission (submission_id null): the Edge Function (unchanged)
-- deletes every path returned from assessment-files; if Storage refuses a batch it puts the submissions
-- back (release_submission_files ignores the nulls) and an unlisted file is simply found again next day.
create or replace function claim_expired_submission_files()
returns table (submission_id bigint, path text)
language sql volatile set search_path = public, pg_temp as $$
  with due as (
    select s.id from assessment_submissions s
     where (s.file is not null or s.voice_note is not null) and s.file_removed_at is null
       and submission_file_expired(s.id, s.reviewed_at, s.send_level_up)
     order by s.reviewed_at limit 200
     for update skip locked
  ), marked as (
    update assessment_submissions s set file_removed_at = now()
      from due where s.id = due.id
    returning s.id, s.file ->> 'path' as file_path, s.voice_note ->> 'path' as voice_path
  )
  select id, file_path from marked where file_path is not null
  union all
  select id, voice_path from marked where voice_path is not null
  union all
  select null::bigint, f from orphan_assessment_files() f
$$;

-- 0040's daily job: also asks the Edge Function when an assessment file is unlisted.
create or replace function orphan_files_daily() returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  if exists (select 1 from orphan_announcement_files()) or exists (select 1 from orphan_assessment_files()) then
    perform call_notify_function('{"cleanup": true}'::jsonb);
  end if;
end $$;

-- ---------------------------------------------------------------- 6. a daily upload cap (S3-03)
-- As 0020, and a student's or coordinator's uploads of the last 24 hours (their own folder) must total
-- under 150 MB before another one starts: with the 50 MB a file of the bucket, at most about 200 MB a day
-- per login, so one login cannot fill the 1 GB. The Guru (assessment files for everyone) has no cap.
create or replace function assessment_file_uploadable(p_name text) returns boolean
language sql stable set search_path = public, pg_temp as $$
  with mine as (
    select count(*) as n, coalesce(sum(case when (o.metadata ->> 'size') ~ '^[0-9]+$' then (o.metadata ->> 'size')::bigint end), 0) as bytes
      from storage.objects o
     where o.bucket_id = 'assessment-files'
       and split_part(o.name, '/', 1) = auth.uid()::text
       and o.created_at > now() - interval '1 day'
  )
  select split_part(p_name, '/', 1) = auth.uid()::text
     and assessment_file_kind(p_name) is not null
     and (is_guru()
          or (my_role() = 'student'
              and assessment_file_kind(p_name) in ('audio', 'video')
              and exists (select 1 from assessment_assignments a
                           where a.student_id = my_student_id() and a.status in ('assigned', 'seen', 'redo'))
              and (select n < 10 and bytes < 157286400 from mine))
          or (my_role() = 'coordinator'
              and (assessment_file_kind(p_name) = 'audio' or p_name ~ '\.webm$')
              and (select n < 10 and bytes < 157286400 from mine)))
$$;

-- ---------------------------------------------------------------- 7. push_outbox keep time (S4-05)
-- As 0015 (notices older than a year), and push_outbox rows older than 30 days: the push is long sent or
-- given up (send_due_push looks one day back) and the inbox holds its own copy. They hold children's
-- names in staff notices (D2-02).
create or replace function inbox_cleanup() returns void
language plpgsql volatile set search_path = public, pg_temp as $$
begin
  delete from notifications where visible_at < now() - interval '1 year';
  delete from push_outbox where created_at < now() - interval '30 days';
end $$;

-- ---------------------------------------------------------------- who may run the new functions
-- docs/DECISIONS.md #14. Internal: audit_redact and forget_notices_about (the erasure functions call them as
-- the owner); orphan_assessment_files for the Edge Function (service_role) and the daily job. App: the Guru's
-- erase_login (privacy_caller_ok inside), as erase_student. Replaced functions keep their grants.
revoke all on function audit_redact(text[], text[]) from public, anon, authenticated;
revoke all on function forget_notices_about(uuid, text, text[]) from public, anon, authenticated;
revoke all on function orphan_assessment_files() from public, anon, authenticated;
grant execute on function orphan_assessment_files() to service_role;
revoke all on function erase_login(uuid, text, text) from public, anon;
grant execute on function erase_login(uuid, text, text) to authenticated;

comment on function audit_redact(text[], text[]) is 'Blanks old_row/new_row of audit rows naming one of the ids, or holding one of the emails as a whole JSON value (0049, S2-06, docs/DECISIONS.md #287). Internal.';
comment on function forget_notices_about(uuid, text, text[]) is 'Deletes inbox notices and queued pushes about an erased person: by record id or screen in the url, or the full name in title/text (0049, S4-05, #287). Internal.';
comment on function erase_login(uuid, text, text) is 'Erases a waiting login (pending, no student record) on request: login, details, audit values; tombstone in erasures.login_profile (0049, S4-06, #287). Guru or SQL editor.';
comment on function orphan_assessment_files() is 'Files in assessment-files over a day old that no assessment or submission lists; at most 200; none while assessments is empty (0049, S3-02, #286). Edge Function only.';
comment on function inbox_cleanup is 'Daily (pg_cron mridanga-inbox-cleanup, 06:30 IST): deletes notices older than a year and push_outbox rows older than 30 days (0049).';
comment on column erasures.login_profile is 'The waiting login erased with erase_login (0049); null for students and staff.';
