-- Mridanga Seva — 0059: a person's data rights in the app (world-class audit 22-10-2026 §2.10, fix 17, work
-- package J). Run once, after 0054, in the Supabase SQL editor (TEST first). Why: docs/DECISIONS.md #550-#556.
-- How: docs/OPERATIONS.md "Data requests", docs/DATABASE.md "Data requests (0059)".
--
-- Until now access, correction, erasure, withdrawal and complaints worked only by emailing the team, and the
-- Guru ran withdraw_consent / erase_student / erase_login in the SQL editor. Now:
-- 1. my_data_summary(): what the class holds about the signed-in person (login, record, About you, parents,
--    consents with their dates, and counts or lists of visits, practice, ticks, calls and the rest), for
--    "My data and rights" on My profile. Each read is written to the access log.
-- 2. data_requests: one row per request (correction, erasure, withdrawal of the photo or data consent, a
--    complaint, a nominee, or access asked at the desk), with type, status, made / answer-by / closed times,
--    kept as DPDP Rules 2025 Rule 8(3) and 14 require. A person reads only the requests they made
--    themselves; only the Guru reads all and acts. Nobody writes the table directly: the functions do.
-- 3. A person files with file_data_request() and may take an open one back (cancel_data_request()). A child
--    under 18 does not: the parent or guardian asks for them (DPDP Act s.9, Rule 10), at the desk or by
--    email, and the Guru records it (record_data_request()).
-- 4. The Guru answers (answer_data_request()) or acts (act_on_data_request(): withdraw the photo consent,
--    withdraw_consent, erase_student / erase_login), with the person's roll number (or email) typed as the
--    confirmation and a note. The erasure's tombstone in `erasures` carries the request's reference.
-- 5. A request is answered within 30 days (answer_by, #551). The daily job mridanga-data-requests reminds
--    the Gurus three days before, blanks a closed request's text one year after it closed and deletes the
--    bare row two years after (#553).
--
-- Every UPDATE/DELETE has a WHERE (Supabase safeupdate). Safe to run twice.

-- ---------------------------------------------------------------- 1. the requests
create table if not exists data_requests (
  id              uuid primary key default gen_random_uuid(),
  -- The reference the person and the team quote: DR-<no>.
  no              bigint generated always as identity unique,
  kind            text not null check (kind in ('access', 'correction', 'erasure', 'withdraw_photo', 'withdraw_data',
                                                'grievance', 'nominate')),
  status          text not null default 'open' check (status in ('open', 'done', 'refused', 'cancelled')),
  -- app: the person in the app; desk / email: recorded by the Guru for the person or their parent.
  source          text not null default 'app' check (source in ('app', 'desk', 'email')),
  asked_by        text not null default 'self' check (asked_by in ('self', 'parent', 'guardian')),
  -- The person it is about: their login and their record (either may be missing). Set null when the person
  -- is erased, so the request stays as the proof without them.
  profile_id      uuid references profiles (id) on delete set null,
  student_id      uuid references students (id) on delete set null,
  made_by         uuid references profiles (id) on delete set null,
  -- The person's words: for a correction the field ("Date of birth") and what is wrong.
  field           text check (char_length(field) between 1 and 80),
  body            text check (char_length(body) between 1 and 2000),
  -- The Guru's answer, shown to the person.
  answer          text check (char_length(answer) between 1 and 2000),
  action          text check (action in ('answered', 'corrected', 'refused', 'cancelled', 'withdraw_photo',
                                         'withdraw_consent', 'erase_student', 'erase_login')),
  created_at      timestamptz not null default now(),
  answer_by       timestamptz not null default now() + interval '30 days',
  reminded_at     timestamptz,
  closed_at       timestamptz,
  closed_by       uuid references profiles (id) on delete set null,
  text_purged_at  timestamptz,
  check ((status = 'open') = (closed_at is null))
);
create index if not exists data_requests_open_idx on data_requests (answer_by) where status = 'open';
create index if not exists data_requests_profile_idx on data_requests (profile_id);
create index if not exists data_requests_student_idx on data_requests (student_id);
create index if not exists data_requests_made_by_idx on data_requests (made_by);
create index if not exists data_requests_closed_by_idx on data_requests (closed_by);

alter table data_requests enable row level security;
revoke all on data_requests from public, anon, authenticated;
revoke all on sequence data_requests_no_seq from public, anon, authenticated;
grant select on data_requests to authenticated;
drop policy if exists own_read on data_requests;
drop policy if exists guru_read on data_requests;
-- A person reads the requests they made about themselves (not what a parent or the desk recorded).
create policy own_read on data_requests for select to authenticated
  using (made_by = (select auth.uid()) and profile_id = (select auth.uid()));
create policy guru_read on data_requests for select to authenticated using ((select is_guru()));

drop trigger if exists audit_data_requests on data_requests;
create trigger audit_data_requests after insert or update or delete on data_requests
  for each row execute function audit_row();

-- ---------------------------------------------------------------- 2. notices to the Gurus and the person
-- A notice in each person's language; never names the person or quotes the text (it shows in the
-- phone's notification bar). p_what: new, due (to the Gurus), answered (to the person).
create or replace function data_request_line(p_what text, p_lang text, p_ref text, p_due date) returns text
language sql stable set search_path = public as $$
  select case p_what
    when 'new' then case p_lang
      when 'te' then 'కొత్త డేటా అభ్యర్థన ' || p_ref || ': ' || to_char(p_due, 'DD-MM-YYYY') || ' లోపు జవాబివ్వండి.'
      when 'hi' then 'नया डेटा अनुरोध ' || p_ref || ': ' || to_char(p_due, 'DD-MM-YYYY') || ' तक जवाब दें।'
      else 'New data request ' || p_ref || ': answer by ' || to_char(p_due, 'DD-MM-YYYY') || '.' end
    when 'due' then case p_lang
      when 'te' then 'డేటా అభ్యర్థన ' || p_ref || ' గడువు ' || to_char(p_due, 'DD-MM-YYYY') || '.'
      when 'hi' then 'डेटा अनुरोध ' || p_ref || ' की अंतिम तिथि ' || to_char(p_due, 'DD-MM-YYYY') || ' है।'
      else 'Data request ' || p_ref || ' is due on ' || to_char(p_due, 'DD-MM-YYYY') || '.' end
    else case p_lang
      when 'te' then 'మీ డేటా అభ్యర్థన ' || p_ref || 'కు జవాబు వచ్చింది.'
      when 'hi' then 'आपके डेटा अनुरोध ' || p_ref || ' का जवाब आ गया है।'
      else 'Your data request ' || p_ref || ' has been answered.' end
  end
$$;

create or replace function data_request_ref(p_no bigint) returns text
language sql immutable set search_path = public as $$ select 'DR-' || lpad(p_no::text, 4, '0') $$;

-- Queues the notice (push and inbox) to the given active logins, never to the caller.
create or replace function queue_data_request_notice(p_profiles uuid[], p_what text, r data_requests) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  insert into push_outbox (profile_id, title, body, url)
  select p.id, left(data_request_ref(r.no), 120),
         data_request_line(p_what, p.language, data_request_ref(r.no), (r.answer_by at time zone 'Asia/Kolkata')::date),
         case when p_what = 'answered' then case when p.role = 'student' then '/student/my-data' else '/staff/my-data' end
              else '/staff/data-requests' end
    from profiles p
   where p.id = any (coalesce(p_profiles, '{}')) and p.active and p.id is distinct from auth.uid();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------- 3. what the class holds about me
-- One JSON object about the signed-in login and its record: the login (no internal keys), About you, the
-- record (no QR token), parents, consents, level and status history, visits, practice, loans, and counts of
-- the rest; plus whether the record is a minor's (the app then says the parent asks). Read as the owner,
-- for the caller only; written to the access log. Errors: not_allowed (not signed in as a student or staff).
create or replace function my_data_summary() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid  uuid := auth.uid();
  p      profiles;
  s      students;
  v_has  boolean;
  v_out  jsonb;
begin
  if v_uid is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  -- Students and staff (My profile). A waiting login or an Ishtagoshti subscriber asks by email for now.
  select * into p from profiles where id = v_uid and active and role in ('student', 'coordinator', 'guru');
  if not found then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into s from students where profile_id = v_uid;
  v_has := found;

  v_out := jsonb_build_object(
    'generated_at', now(),
    'login', to_jsonb(p) - 'referral_code',
    'about', (select to_jsonb(d) - 'id' - 'updated_by' - 'referred_by' from person_details d
               where d.profile_id = v_uid or (v_has and d.student_id = s.id) limit 1),
    'record', case when v_has then to_jsonb(s) - 'qr_token' - 'created_by' - 'mentor_id' - 'request_id' - 'import_id' end,
    'minor', v_has and is_minor(s),
    'level_name', case when v_has then (select name from levels where id = s.level_id) end,
    'centre_name', (select name from centres where id = coalesce(case when v_has then s.home_centre_id end, p.centre_id)),
    'mentor_name', case when v_has then (select full_name from profiles where id = s.mentor_id) end,
    'requests', (select coalesce(jsonb_agg(jsonb_build_object('ref', data_request_ref(r.no), 'kind', r.kind, 'status', r.status,
                   'created_at', r.created_at, 'closed_at', r.closed_at) order by r.created_at), '[]'::jsonb)
                   from data_requests r where r.made_by = v_uid and r.profile_id = v_uid),
    'devices', (select count(*) from push_tokens where profile_id = v_uid),
    'notices', (select count(*) from notifications where profile_id = v_uid),
    'replies', (select count(*) from announcement_replies where profile_id = v_uid),
    'event_answers', (select count(*) from event_rsvps where profile_id = v_uid),
    'poll_votes', (select count(*) from poll_votes where profile_id = v_uid),
    'ishtagoshti', (select to_jsonb(g) - 'blocked_by' from ig_subscribers g where g.profile_id = v_uid));

  if v_has then
    v_out := v_out || jsonb_build_object(
      'guardians', (select coalesce(jsonb_agg(jsonb_build_object('name', g.full_name, 'relation', g.relation,
                       'phone', g.phone, 'email', g.email)), '[]'::jsonb) from guardians g where g.student_id = s.id),
      'consents', (select coalesce(jsonb_agg(jsonb_build_object('scope', c.scope, 'method', c.method,
                      'given_at', c.given_at, 'revoked_at', c.revoked_at, 'id_type_checked', c.id_type_checked,
                      'notice_version', to_jsonb(c) -> 'notice_version') order by c.given_at), '[]'::jsonb)
                     from consents c where c.student_id = s.id),
      'level_history', (select coalesce(jsonb_agg(jsonb_build_object('from', h.from_level, 'to', h.to_level, 'on', h.changed_on)
                          order by h.changed_on), '[]'::jsonb) from level_history h where h.student_id = s.id),
      'status_history', (select coalesce(jsonb_agg(jsonb_build_object('from', h.from_status, 'to', h.to_status, 'at', h.changed_at)
                           order by h.changed_at), '[]'::jsonb) from status_history h where h.student_id = s.id),
      'visits', (select jsonb_build_object('count', count(*), 'first', min(v.check_in), 'last', max(v.check_in),
                   'list', coalesce(jsonb_agg(jsonb_build_object('in', v.check_in, 'out', v.check_out) order by v.check_in desc), '[]'::jsonb))
                   from visits v where v.student_id = s.id),
      'practice', (select jsonb_build_object('count', count(*), 'minutes', coalesce(sum(l.minutes), 0),
                     'list', coalesce(jsonb_agg(jsonb_build_object('on', l.practised_on, 'minutes', l.minutes, 'note', l.note)
                       order by l.practised_on desc), '[]'::jsonb))
                     from practice_logs l where l.student_id = s.id),
      'syllabus_ticks', (select count(*) from student_progress t where t.student_id = s.id),
      'follow_up_calls', (select jsonb_build_object('count', count(*), 'last', max(c.called_at)) from call_logs c where c.student_id = s.id),
      'assessments', (select count(*) from assessment_assignments a where a.student_id = s.id),
      'events', (select count(*) from event_attendance e where e.student_id = s.id),
      'loans', (select coalesce(jsonb_agg(jsonb_build_object('issued_at', l.issued_at, 'due_on', l.due_on, 'returned_at', l.returned_at)
                  order by l.issued_at), '[]'::jsonb) from inventory_loans l where l.student_id = s.id));
  end if;

  perform log_access('my_data_summary', case when v_has then s.id end, 1);
  return v_out;
end $$;

-- ---------------------------------------------------------------- 4. the person asks
-- Shared text checks. Errors: field_required (a correction names the field), field_too_long (80),
-- text_required (a correction, complaint or nominee needs words), text_too_long (2000).
create or replace function clean_request_text(p_kind text, p_field text, p_body text, out o_field text, out o_body text)
language plpgsql immutable set search_path = public as $$
begin
  o_field := nullif(btrim(coalesce(p_field, ''), E' \t\r\n'), '');
  o_body := nullif(btrim(coalesce(p_body, ''), E' \t\r\n'), '');
  if p_kind = 'correction' and o_field is null then raise exception 'field_required'; end if;
  if char_length(o_field) > 80 then raise exception 'field_too_long'; end if;
  if p_kind <> 'correction' then o_field := null; end if;
  if p_kind in ('correction', 'grievance', 'nominate') and o_body is null then raise exception 'text_required'; end if;
  if char_length(o_body) > 2000 then raise exception 'text_too_long'; end if;
end $$;

-- The signed-in person files a request about themselves (a student, or a coordinator or Guru with their own
-- login). Returns { id, ref, answer_by }. Errors: not_allowed (not signed in, a waiting login), kind_invalid,
-- parent_asks (the record is a child's: the parent or guardian asks, Rule 10), no_record (a withdrawal needs
-- a student record), no_photo_consent (nothing to withdraw), already_open (one open request of a kind),
-- too_many_requests (5 in a day), and the text errors above.
create or replace function file_data_request(p_kind text, p_field text default null, p_body text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid   uuid := auth.uid();
  v_role  app_role := my_role();
  s       students;
  v_has   boolean;
  v_text  record;
  r       data_requests;
begin
  if v_uid is null or v_role is null or v_role not in ('student', 'coordinator', 'guru') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('correction', 'erasure', 'withdraw_photo', 'withdraw_data', 'grievance', 'nominate') then
    raise exception 'kind_invalid';
  end if;
  select * into s from students where profile_id = v_uid;
  v_has := found;
  if v_has and is_minor(s) then
    raise exception 'parent_asks' using detail = 'A parent or guardian asks for a child, at the desk or by email.';
  end if;
  if p_kind in ('withdraw_photo', 'withdraw_data') and not v_has then raise exception 'no_record'; end if;
  if p_kind = 'withdraw_photo' and not exists (select 1 from consents c where c.student_id = s.id and c.scope = 'photo'
                                               and c.revoked_at is null) then
    raise exception 'no_photo_consent';
  end if;
  select * into v_text from clean_request_text(p_kind, p_field, p_body);
  -- One at a time per kind; at most 5 a day (an open form must not flood the Guru's list).
  perform 1 from profiles where id = v_uid for update;
  if exists (select 1 from data_requests where made_by = v_uid and profile_id = v_uid and kind = p_kind and status = 'open') then
    raise exception 'already_open';
  end if;
  if (select count(*) from data_requests where made_by = v_uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'too_many_requests';
  end if;

  insert into data_requests (kind, source, asked_by, profile_id, student_id, made_by, field, body)
  values (p_kind, 'app', 'self', v_uid, case when v_has then s.id end, v_uid, v_text.o_field, v_text.o_body)
  returning * into r;
  perform queue_data_request_notice(guru_ids(), 'new', r);
  return jsonb_build_object('id', r.id, 'ref', data_request_ref(r.no), 'answer_by', r.answer_by);
end $$;

-- The person takes back their own open request. Errors: not_allowed, request_not_found, not_open.
create or replace function cancel_data_request(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r data_requests;
begin
  if auth.uid() is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into r from data_requests where id = p_id and made_by = auth.uid() and profile_id = auth.uid() for update;
  if not found then raise exception 'request_not_found'; end if;
  if r.status <> 'open' then raise exception 'not_open'; end if;
  update data_requests set status = 'cancelled', action = 'cancelled', closed_at = now(), closed_by = auth.uid()
   where id = p_id;
end $$;

-- ---------------------------------------------------------------- 5. the Guru records one from the desk or an email
-- p_who: a roll number (MS-2026-0030) or a login's email. For a child the parent or guardian asks
-- (p_asked_by parent / guardian). Returns { id, ref, answer_by }. Errors: not_allowed, kind_invalid,
-- source_invalid, asked_by_invalid, person_not_found, parent_asks (a child asking for themselves), and the
-- text errors.
create or replace function record_data_request(p_who text, p_kind text, p_source text, p_asked_by text,
                                               p_field text default null, p_body text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_who   text := lower(btrim(coalesce(p_who, '')));
  s       students;
  v_has   boolean := false;
  v_login uuid;
  v_text  record;
  r       data_requests;
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('access', 'correction', 'erasure', 'withdraw_photo', 'withdraw_data', 'grievance', 'nominate') then
    raise exception 'kind_invalid';
  end if;
  if p_source is null or p_source not in ('desk', 'email') then raise exception 'source_invalid'; end if;
  if p_asked_by is null or p_asked_by not in ('self', 'parent', 'guardian') then raise exception 'asked_by_invalid'; end if;
  if v_who = '' then raise exception 'person_not_found'; end if;
  if position('@' in v_who) = 0 then
    select * into s from students where lower(roll_no) = v_who;
    v_has := found;
    if not v_has then raise exception 'person_not_found'; end if;
    v_login := s.profile_id;
  else
    select id into v_login from profiles where lower(email) = v_who;
    if v_login is null then raise exception 'person_not_found'; end if;
    select * into s from students where profile_id = v_login;
    v_has := found;
  end if;
  if v_has and is_minor(s) and p_asked_by = 'self' then
    raise exception 'parent_asks' using detail = 'For a child the parent or guardian asks; their ID is seen at the desk.';
  end if;
  select * into v_text from clean_request_text(p_kind, p_field, p_body);

  insert into data_requests (kind, source, asked_by, profile_id, student_id, made_by, field, body)
  values (p_kind, p_source, p_asked_by, v_login, case when v_has then s.id end, auth.uid(), v_text.o_field, v_text.o_body)
  returning * into r;
  return jsonb_build_object('id', r.id, 'ref', data_request_ref(r.no), 'answer_by', r.answer_by);
end $$;

-- ---------------------------------------------------------------- 6. the Guru answers or acts
-- Answers an open request: p_status done or refused, p_answer (1-2000, shown to the person), p_corrected
-- true when a correction was made in the record. Withdrawals and erasures go through act_on_data_request.
-- Errors: not_allowed, request_not_found, not_open, status_invalid, answer_required, text_too_long,
-- use_the_action (done on a withdrawal or erasure: run it instead, or refuse with a reason).
create or replace function answer_data_request(p_id uuid, p_status text, p_answer text, p_corrected boolean default false)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r        data_requests;
  v_answer text := nullif(btrim(coalesce(p_answer, ''), E' \t\r\n'), '');
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into r from data_requests where id = p_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if r.status <> 'open' then raise exception 'not_open'; end if;
  if p_status is null or p_status not in ('done', 'refused') then raise exception 'status_invalid'; end if;
  if v_answer is null then raise exception 'answer_required'; end if;
  if char_length(v_answer) > 2000 then raise exception 'text_too_long'; end if;
  if p_status = 'done' and r.kind in ('erasure', 'withdraw_photo', 'withdraw_data') then raise exception 'use_the_action'; end if;

  update data_requests
     set status = p_status, answer = v_answer, closed_at = now(), closed_by = auth.uid(),
         action = case when p_status = 'refused' then 'refused'
                       when coalesce(p_corrected, false) and r.kind = 'correction' then 'corrected' else 'answered' end
   where id = p_id
  returning * into r;
  if r.source = 'app' then perform queue_data_request_notice(array[r.profile_id], 'answered', r); end if;
end $$;

-- Carries out a withdrawal or an erasure for an open request, after the Guru typed the person's roll number
-- (or, for a login without a record, its email) as the confirmation. p_action: withdraw_photo (the current
-- photo consents are revoked), withdraw_consent (withdraw_consent(): the record is frozen, the login switched
-- off), erase (erase_student for a record, else erase_login for a waiting login). p_note (1-500) is the
-- answer and the reason; an erasure's tombstone gets the request's reference, and the request keeps only its
-- type, dates and reference (its text is blanked: the person asked to be forgotten). Returns what the
-- function run returned, with `ref`. Errors: not_allowed, request_not_found, not_open, action_invalid,
-- action_not_for_kind, confirm_mismatch, reason_required, reason_too_long, person_gone, no_photo_consent, and
-- the errors of withdraw_consent / erase_student / erase_login (already_withdrawn, open_loan,
-- staff_login_linked, not_pending, not_yourself, ...).
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
    -- The person is gone (profile_id / student_id were set null by the delete): only the bare request stays.
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

-- ---------------------------------------------------------------- 7. the daily job
-- Reminds the Gurus once of a request due within three days; blanks the text of a request closed over a
-- year ago (with its audit copies) and deletes a request closed over two years ago (#553). Open requests
-- stay until answered. Returns how many rows it changed.
create or replace function data_requests_daily() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r     data_requests;
  v_ids text[];
  v_n   int := 0;
  v_m   int;
begin
  for r in select * from data_requests where status = 'open' and reminded_at is null and answer_by < now() + interval '3 days'
           for update skip locked loop
    perform queue_data_request_notice(guru_ids(), 'due', r);
    update data_requests set reminded_at = now() where id = r.id;
    v_n := v_n + 1;
  end loop;

  v_ids := array(select id::text from data_requests where status <> 'open' and closed_at < now() - interval '1 year'
                   and (field is not null or body is not null or answer is not null));
  if cardinality(v_ids) > 0 then
    update data_requests set field = null, body = null, answer = null, text_purged_at = now() where id::text = any (v_ids);
    get diagnostics v_m = row_count;
    v_n := v_n + v_m;
    perform audit_redact(v_ids, null);
  end if;

  delete from data_requests where status <> 'open' and closed_at < now() - interval '2 years';
  get diagnostics v_m = row_count;
  return v_n + v_m;
end $$;

-- 02:30 India time (21:00 UTC), after the night's other jobs.
select cron.schedule('mridanga-data-requests', '0 21 * * *', 'select data_requests_daily()');

-- ---------------------------------------------------------------- who may run them
-- docs/DECISIONS.md #14: the person's and the Guru's functions for signed-in people (each checks the caller),
-- the rest internal.
revoke execute on function data_request_line(text, text, text, date), data_request_ref(bigint),
  queue_data_request_notice(uuid[], text, data_requests), my_data_summary(),
  clean_request_text(text, text, text), file_data_request(text, text, text), cancel_data_request(uuid),
  record_data_request(text, text, text, text, text, text), answer_data_request(uuid, text, text, boolean),
  act_on_data_request(uuid, text, text, text), data_requests_daily()
  from public, anon, authenticated, service_role;
grant execute on function my_data_summary(), file_data_request(text, text, text), cancel_data_request(uuid),
  record_data_request(text, text, text, text, text, text), answer_data_request(uuid, text, text, boolean),
  act_on_data_request(uuid, text, text, text)
  to authenticated;
