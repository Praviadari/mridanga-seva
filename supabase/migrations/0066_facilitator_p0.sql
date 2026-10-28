-- Mridanga Seva — 0066: the facilitator's P0 safeguards (Sarvesh's Facilitator Module 360° review, 27-10-2026, §4
-- and the §8 test matrix; docs/DECISIONS.md #710-#719; docs/DATABASE.md "Facilitator safeguards (0066)"). Run once
-- after 0064, in the Supabase SQL editor (TEST first), before the app update that uses it. 0065 is reserved for the
-- Rhythm Playground engine; nothing here needs it. Safe to run twice. Changes no stored row.
--
-- 1. FUND-01 (#710): nobody decides their own fund entry, now also as a rule on the table itself; a refused try is
--    written to the change log (audit_log, action REFUSED). decide_fund_entry returns { status } or { refused }
--    instead of raising for those two refusals, so the log row is kept (a raised error would undo it).
-- 2. PRIV-01 (#712, #713): an erasure needs two staff members. approve_data_erasure() records how the person asking
--    was checked and who approved; act_on_data_request() erases only an approved request, and never by the
--    approver. erase_student / erase_login are no longer called from the app directly (the request path, the
--    retention jobs and the SQL editor still call them).
-- 3. STU-01/02 (#714): import_all_or_none(p_rows, p_dry_run): every row of an import or none, and a dry run against
--    the database that keeps nothing. import_students (each row on its own) is unchanged.
-- 4. AUTH-02 (#715): a login switched off has its sessions and refresh tokens ended at once.
-- 5. AUD-02 (#716): the error log keeps an error's name only when it reads as an error class (TypeError,
--    AuthApiError ...); any other name is kept as "Error", so a name or a number can never be stored.

-- ---------------------------------------------------------------- 1. fund: no self-approval, refusals logged (#710)
-- An entry that was approved or declined by a person was decided by someone other than its maker. A withdrawal is
-- the maker's own (decided_by = created_by); an entry under the limit is approved with nobody deciding.
alter table fund_entries drop constraint if exists fund_entries_not_own_decision;
alter table fund_entries add constraint fund_entries_not_own_decision
  check (status not in ('approved', 'declined') or decided_by is null or decided_by <> created_by);

-- 0026's decide_fund_entry, now returning what happened. Refused (and logged, not raised): own_entry (the maker),
-- not_approver (a treasurer for a coordinator's entry). Still raised: not_allowed (not a fund keeper),
-- entry_not_found, already_decided, reason_required, note_too_long.
-- 0026's returned nothing: dropped once (a second run keeps this one, so it changes nothing).
do $$
begin
  if (select p.prorettype from pg_proc p where p.oid = to_regprocedure('decide_fund_entry(bigint,boolean,text)')) = 'void'::regtype then
    drop function decide_fund_entry(bigint, boolean, text);
  end if;
end $$;
create or replace function decide_fund_entry(p_entry bigint, p_approve boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_e    fund_entries;
  v_note text;
  v_why  text;
begin
  if not is_fund_keeper() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into v_e from fund_entries where id = p_entry for update;
  if not found then raise exception 'entry_not_found'; end if;
  if v_e.status <> 'waiting' then raise exception 'already_decided'; end if;
  if v_e.created_by = auth.uid() then
    v_why := 'own_entry';
  elsif not (auth.uid() = any (fund_approvers(v_e.created_by))) then
    v_why := 'not_approver';
  end if;
  if v_why is not null then
    insert into audit_log (table_name, row_id, action, changed_by, new_row)
    values ('fund_entries', p_entry::text, 'REFUSED', auth.uid(),
            jsonb_build_object('refused', v_why, 'tried', case when coalesce(p_approve, false) then 'approve' else 'decline' end));
    return jsonb_build_object('refused', v_why);
  end if;
  v_note := fund_text(p_note, 500, 'note_too_long');
  if not coalesce(p_approve, false) and v_note is null then raise exception 'reason_required'; end if;
  perform set_config('mridanga.fund_deciding', 'on', true);
  update fund_entries
     set status = case when coalesce(p_approve, false) then 'approved' else 'declined' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = v_note
   where id = p_entry
  returning * into v_e;
  perform set_config('mridanga.fund_deciding', '', true);
  perform queue_fund_push(array[v_e.created_by], case when coalesce(p_approve, false) then 'approved' else 'declined' end,
                          v_e, coalesce(v_note, ''));
  return jsonb_build_object('status', v_e.status);
end $$;

-- ---------------------------------------------------------------- 2. erasure by two people (#712, #713)
-- How the person asking was checked (a code, never the document's number):
--   own_login        filed in the app from the person's own signed-in login
--   id_seen          an identity document of the person (or, for a child, the parent's) seen at the desk
--   registered_email the request came from the email address already on the record or login
--   phone_callback   the team called back the phone number already on the record and the person confirmed
alter table data_requests add column if not exists identity_check text;
alter table data_requests add column if not exists approved_by uuid references profiles (id) on delete set null;
alter table data_requests add column if not exists approved_at timestamptz;
alter table data_requests drop constraint if exists data_requests_identity_check_check;
alter table data_requests add constraint data_requests_identity_check_check
  check (identity_check in ('own_login', 'id_seen', 'registered_email', 'phone_callback'));
alter table data_requests drop constraint if exists data_requests_approval_whole;
alter table data_requests add constraint data_requests_approval_whole
  check ((approved_by is null) = (approved_at is null) and (approved_at is null or identity_check is not null));
create index if not exists data_requests_approved_by_idx on data_requests (approved_by);

-- The first of the two: a Guru approves an open erasure request after checking who asked. Not the person who
-- recorded or filed it (made_by). own_login only for a request filed in the app by the person themselves.
-- Errors: not_allowed, request_not_found, not_open, not_erasure, already_approved, identity_invalid,
-- not_the_recorder (the Guru who recorded it at the desk asks another Guru to approve).
create or replace function approve_data_erasure(p_id uuid, p_identity text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r data_requests;
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into r from data_requests where id = p_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if r.status <> 'open' then raise exception 'not_open'; end if;
  if r.kind <> 'erasure' then raise exception 'not_erasure'; end if;
  if r.approved_by is not null then raise exception 'already_approved'; end if;
  if p_identity is null or p_identity not in ('own_login', 'id_seen', 'registered_email', 'phone_callback')
     or (p_identity = 'own_login' and not (r.source = 'app' and r.made_by is not null and r.made_by = r.profile_id)) then
    raise exception 'identity_invalid';
  end if;
  if r.made_by = auth.uid() then
    raise exception 'not_the_recorder' using detail = 'Another Guru approves an erasure you recorded or asked for.';
  end if;
  update data_requests set identity_check = p_identity, approved_by = auth.uid(), approved_at = now() where id = p_id;
end $$;

-- 0059's act_on_data_request, plus (#712): an erasure is carried out only on an approved request, and not by the
-- approver (second_approval_needed, approver_cannot_erase). Otherwise unchanged.
create or replace function act_on_data_request(p_id uuid, p_action text, p_confirm text, p_note text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r        data_requests;
  s        students;
  v_email  text;
  v_note   text := nullif(btrim(coalesce(p_note, ''), E' \t\r\n'), '');
  v_ref    text;
  v_result jsonb;
  v_count  int;
  v_done   text;
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into r from data_requests where id = p_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if r.status <> 'open' then raise exception 'not_open'; end if;
  if p_action is null or p_action not in ('withdraw_photo', 'withdraw_consent', 'erase') then raise exception 'action_invalid'; end if;
  if (p_action = 'withdraw_photo' and r.kind <> 'withdraw_photo') or (p_action = 'withdraw_consent' and r.kind <> 'withdraw_data')
     or (p_action = 'erase' and r.kind <> 'erasure') then
    raise exception 'action_not_for_kind';
  end if;
  if p_action = 'erase' then
    if r.approved_by is null then
      raise exception 'second_approval_needed' using detail = 'Another Guru approves the erasure first (approve_data_erasure).';
    end if;
    if r.approved_by = auth.uid() then
      raise exception 'approver_cannot_erase' using detail = 'The Guru who approved does not also carry the erasure out.';
    end if;
  end if;
  if v_note is null then raise exception 'reason_required'; end if;
  if char_length(v_note) > 500 then raise exception 'reason_too_long'; end if;
  v_ref := data_request_ref(r.no);

  if r.student_id is not null then
    select * into s from students where id = r.student_id;
  end if;
  if r.student_id is null and r.profile_id is null then raise exception 'person_gone'; end if;
  if r.student_id is not null then
    if upper(btrim(coalesce(p_confirm, ''))) <> upper(s.roll_no) then raise exception 'confirm_mismatch'; end if;
  else
    select lower(email) into v_email from profiles where id = r.profile_id;
    if lower(btrim(coalesce(p_confirm, ''))) <> coalesce(v_email, '') or v_email is null then raise exception 'confirm_mismatch'; end if;
  end if;

  if p_action = 'withdraw_photo' then
    if r.student_id is null then raise exception 'no_record'; end if;
    update consents set revoked_at = now() where student_id = r.student_id and scope = 'photo' and revoked_at is null;
    get diagnostics v_count = row_count;
    if v_count = 0 then raise exception 'no_photo_consent'; end if;
    v_result := jsonb_build_object('consents_revoked', v_count);
    v_done := 'withdraw_photo';
  elsif p_action = 'withdraw_consent' then
    if r.student_id is null then raise exception 'no_record'; end if;
    v_result := withdraw_consent(r.student_id, left(v_ref || ': ' || v_note, 500));
    v_done := 'withdraw_consent';
  elsif r.student_id is not null then
    v_result := erase_student(r.student_id, v_note, v_ref);
    v_done := 'erase_student';
  else
    v_result := erase_login(r.profile_id, v_note, v_ref);
    v_done := 'erase_login';
  end if;

  if p_action = 'erase' then
    -- The person is gone (profile_id / student_id were set null by the delete): only the bare request stays, with
    -- who approved, who carried it out, when, and how the person asking was checked.
    update data_requests
       set status = 'done', action = v_done, closed_at = now(), closed_by = auth.uid(),
           field = null, body = null, answer = null, text_purged_at = now()
     where id = p_id;
    perform audit_redact(array[p_id::text], null);
  else
    update data_requests
       set status = 'done', action = v_done, answer = v_note, closed_at = now(), closed_by = auth.uid()
     where id = p_id
    returning * into r;
    -- A withdrawn data consent switches the login off: the answer then goes by phone or email.
    if r.source = 'app' then perform queue_data_request_notice(array[r.profile_id], 'answered', r); end if;
  end if;
  return v_result || jsonb_build_object('ref', v_ref);
end $$;

-- ---------------------------------------------------------------- 3. the import: all or none, dry run (#714)
-- import_students (0054) saves each row on its own ("partial"). import_all_or_none runs it inside a step that is
-- undone when any row is refused (nothing kept; the good rows come back as { line, held: true }), or always when
-- p_dry_run (nothing kept; { line, ok: true } or { line, error }). Rows are tried in one transaction, so a
-- duplicate inside the file is found as in a real import; roll numbers of an undone step are not used up.
-- Errors: not_allowed, too_many_rows (500, from import_students).
create or replace function import_all_or_none(p_rows jsonb, p_dry_run boolean default false) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_out  jsonb := '[]'::jsonb;
  v_undo boolean := false;
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  begin
    v_out := import_students(p_rows);
    v_undo := coalesce(p_dry_run, false) or exists (select 1 from jsonb_array_elements(v_out) x where x ? 'error');
    if v_undo then raise exception 'import_undone'; end if;
  exception when others then
    if sqlerrm <> 'import_undone' then raise; end if;
  end;
  if v_undo then
    select coalesce(jsonb_agg(case when x ? 'error' then x
                                   when coalesce(p_dry_run, false) then jsonb_build_object('line', x -> 'line', 'ok', true)
                                   else jsonb_build_object('line', x -> 'line', 'held', true) end order by n), '[]'::jsonb)
      into v_out
      from jsonb_array_elements(v_out) with ordinality as e(x, n);
  end if;
  return v_out;
end $$;

-- ---------------------------------------------------------------- 4. a login switched off is signed out (#715)
-- Since 0039 its phones and browsers are forgotten and every rule already refuses it (my_role() is null). Now its
-- sessions end too: Supabase Auth refuses the next token refresh and the app signs out (the short-lived access
-- token it holds still opens nothing). When this database may not touch auth (a copy without it), nothing is done.
create or replace function end_switched_off_sessions() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    delete from auth.refresh_tokens where user_id = new.id::text;
    delete from auth.sessions where user_id = new.id;
  exception when insufficient_privilege or undefined_table then
    null;
  end;
  return new;
end $$;
revoke execute on function end_switched_off_sessions() from public, anon, authenticated;

drop trigger if exists profiles_end_sessions on profiles;
create trigger profiles_end_sessions after update of active on profiles
  for each row when (old.active and not new.active)
  execute function end_switched_off_sessions();

-- ---------------------------------------------------------------- 5. error names that cannot hold data (#716)
-- An error class name: a capital, letters only, ending in Error or Exception (TypeError, AuthApiError), or the
-- app's own NonError. Anything else is kept as "Error".
create or replace function client_error_name(p_name text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case when p_name ~ '^[A-Z][A-Za-z]{0,50}(Error|Exception)$' or p_name in ('Error', 'NonError') then p_name else 'Error' end
$$;

-- 0061's log_client_error, keeping client_error_name(p_error) instead of p_error. Otherwise unchanged.
create or replace function log_client_error(p_kind text, p_error text, p_screen text, p_version text, p_platform text)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_me    uuid := auth.uid();
  v_hour  timestamptz := date_trunc('hour', now());
  v_area  text;
  v_calls int;
  v_name  text;
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
  v_name := client_error_name(p_error);
  insert into client_error_quota (profile_id, hour) values (v_me, v_hour)
  on conflict (profile_id, hour) do update set calls = client_error_quota.calls + 1
  returning calls into v_calls;
  if v_calls > (lim ->> 'per_login_hour')::int then return; end if;
  select case when p.role in ('guru', 'coordinator') then 'staff' when p.role = 'student' then 'student' else 'other' end
    into v_area from profiles p where p.id = v_me;
  v_area := coalesce(v_area, 'other');
  update client_errors set times = times + 1, last_at = now()
   where hour = v_hour and kind = p_kind and error_name = v_name and screen = p_screen
     and app_version = p_version and platform = p_platform and area = v_area;
  if found then return; end if;
  if (select count(*) from client_errors where first_at >= date_trunc('day', now())) >= (lim ->> 'new_rows_day')::int then
    return;
  end if;
  insert into client_errors (hour, kind, error_name, screen, app_version, platform, area)
  values (v_hour, p_kind, v_name, p_screen, p_version, p_platform, v_area)
  on conflict (hour, kind, error_name, screen, app_version, platform, area)
  do update set times = client_errors.times + 1, last_at = now();
end $$;

-- ---------------------------------------------------------------- who may run them
-- docs/DECISIONS.md #14. #713: erase_student / erase_login only through act_on_data_request (two people), the
-- retention jobs or the SQL editor; the app may no longer call them on its own.
revoke execute on function erase_student(uuid, text, text), erase_login(uuid, text, text) from public, anon, authenticated;
revoke execute on function client_error_name(text) from public, anon, authenticated;
revoke execute on function decide_fund_entry(bigint, boolean, text), approve_data_erasure(uuid, text),
  import_all_or_none(jsonb, boolean)
  from public, anon, service_role;
grant execute on function decide_fund_entry(bigint, boolean, text), approve_data_erasure(uuid, text),
  import_all_or_none(jsonb, boolean)
  to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on constraint fund_entries_not_own_decision on fund_entries is 'FUND-01 (#710): an approved or declined entry was decided by someone other than its maker (0066).';
comment on function decide_fund_entry(bigint, boolean, text) is 'Fund: approve or decline (with a reason) a waiting entry; returns { status }. Its maker, or a treasurer for a coordinator''s entry, gets { refused } and the try is logged in audit_log (REFUSED) (0026, 0066 #710).';
comment on column data_requests.identity_check is 'How the person asking for an erasure was checked: own_login, id_seen, registered_email, phone_callback (0066, #712). A code only, never a document number.';
comment on column data_requests.approved_by is 'The Guru who approved an erasure (the first of two people); the one who carries it out is closed_by and differs (0066, #712).';
comment on function approve_data_erasure(uuid, text) is 'The Guru approves an open erasure request after checking who asked (identity_check); not the Guru who recorded it. Another Guru then carries it out (0066, #712). Errors: not_allowed, request_not_found, not_open, not_erasure, already_approved, identity_invalid, not_the_recorder.';
comment on function act_on_data_request(uuid, text, text, text) is 'The Guru carries out a withdrawal or an erasure for an open request, with the roll number (or email) typed; an erasure needs another Guru''s approval first (0059, 0066 #712). Errors as 0059 plus second_approval_needed, approver_cannot_erase.';
comment on function import_all_or_none(jsonb, boolean) is 'G3, the Guru: import_students for every row or none; p_dry_run tries every row and keeps nothing (0066, #714).';
comment on function end_switched_off_sessions() is 'Trigger: a login switched off has its Supabase Auth sessions and refresh tokens deleted (0066, #715).';
comment on function client_error_name(text) is 'The error name the log keeps: an error class name (…Error, …Exception, NonError), else Error (0066, #716).';
comment on function log_client_error is 'The app reports an error without personal data; the name is kept only as an error class name; quietly dropped over the limits (0061 #585, 0066 #716). Error: error_report_invalid, not_allowed.';
