-- Mridanga Seva — 0014: promotion approval (Phase 2, slice 2: screens C22, C23, G7).
-- Run once, after 0013_syllabus_materials.sql, in the Supabase SQL editor. TEST project first;
-- Phase 2 goes live only when Praveen decides (docs/DECISIONS.md #45).
-- Why: docs/DECISIONS.md #45. How: docs/DATABASE.md "Promotion approval (Phase 2)".
--
-- The flow (Screen List doc, "Promotion approval"): a student moves up a level only when the Guru
-- approves, after the coordinators who teach the student have given feedback. The app never
-- promotes anyone by itself.
-- 1. The app shows a coordinator which students meet the criteria the Guru sets in settings
--    (promotion_criteria(): the whole syllabus of the current level ticked, 8 or more visits in the
--    last 8 weeks, an accepted level-up assessment sent to the Guru).
-- 2. A coordinator nominates the student (C22) with a reason and asks other coordinators for
--    feedback: nominate_for_promotion(). The nominating coordinator's own view counts as "Ready".
-- 3. Coordinators rate the student Ready / Almost / Not yet with a comment (C23):
--    give_promotion_feedback(). When enough have answered (2 by default), the Guru is told.
-- 4. The Guru decides (G7): Promote (students.level_id + a level_history row), Not yet with
--    guidance and a date after which the student may be nominated again, or More feedback:
--    decide_promotion(). The nominator may withdraw an open nomination: withdraw_nomination().
-- Only the Guru may change a student's level at all (guard_student_level), so a coordinator's
-- phone cannot promote by editing the student record.
-- Notifications go through push_outbox (0012), sent by the Edge Function notify-announcements.

-- ---------------------------------------------------------------- 1. settings (the Guru can change them)
-- promotion_syllabus_percent: share of the current level's syllabus items in use that must be ticked.
-- promotion_min_visits / promotion_visit_weeks: visits (days in class) needed in the last N weeks.
-- promotion_needs_level_up: whether an accepted level-up assessment of the current level is needed.
-- promotion_min_feedback: coordinators' answers needed before the Guru can promote.
insert into settings (key, value) values
  ('promotion_syllabus_percent', '100'),
  ('promotion_min_visits', '8'),
  ('promotion_visit_weeks', '8'),
  ('promotion_needs_level_up', 'true'),
  ('promotion_min_feedback', '2')
on conflict (key) do nothing;

-- The level after this one (by levels.sort), or null at the top.
create or replace function next_level(p_level smallint) returns smallint
language sql stable set search_path = public as $$
  select l.id from levels l
   where l.sort > (select sort from levels where id = p_level)
   order by l.sort limit 1
$$;

-- ---------------------------------------------------------------- 2. tables
-- One row per nomination. status: open (collecting feedback, waiting for the Guru), promoted,
-- not_yet (with guidance and renominate_after), withdrawn. At most one open nomination per student.
create table promotion_nominations (
  id                 bigint generated always as identity primary key,
  student_id         uuid not null references students (id) on delete cascade,
  from_level         smallint not null references levels (id),
  to_level           smallint not null references levels (id),
  reason             text not null,
  criteria           jsonb not null default '{}',
  submission_id      bigint references assessment_submissions (id) on delete set null,
  asked              uuid[] not null default '{}',
  nominated_by       uuid references profiles (id),
  nominated_at       timestamptz not null default now(),
  status             text not null default 'open' check (status in ('open', 'promoted', 'not_yet', 'withdrawn')),
  more_asked_at      timestamptz,
  more_note          text,
  ready_notified_at  timestamptz,
  decided_by         uuid references profiles (id),
  decided_at         timestamptz,
  guidance           text,
  renominate_after   date,
  level_history_id   bigint references level_history (id),
  check (status <> 'not_yet' or (guidance is not null and renominate_after is not null))
);
create unique index promotion_one_open on promotion_nominations (student_id) where status = 'open';
create index promotion_nominations_student_idx on promotion_nominations (student_id, nominated_at desc);
create index promotion_nominations_submission_idx on promotion_nominations (submission_id);

-- One answer per coordinator and nomination; a coordinator may change it while it is open.
create table promotion_feedback (
  nomination_id   bigint not null references promotion_nominations (id) on delete cascade,
  coordinator_id  uuid not null references profiles (id) on delete cascade,
  rating          text not null check (rating in ('ready', 'almost', 'not_yet')),
  comment         text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (nomination_id, coordinator_id)
);

create trigger audit_promotion_nominations after insert or update or delete on promotion_nominations
  for each row execute function audit_row();

-- ---------------------------------------------------------------- 3. only the Guru changes a level
-- A coordinator could otherwise change students.level_id directly (policy staff_update, 0001).
-- The dashboard and the SQL editor (no signed-in user) are not stopped.
create or replace function guard_student_level() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.level_id is distinct from old.level_id and auth.uid() is not null and not is_guru() then
    raise exception 'level_guru_only' using detail = 'Only the Guru changes a student''s level (promotion approval).';
  end if;
  return new;
end $$;
create trigger students_level_guard before update of level_id on students
  for each row execute function guard_student_level();

-- ---------------------------------------------------------------- 4. who may read
alter table promotion_nominations enable row level security;
alter table promotion_feedback enable row level security;
-- Staff only: the student does not see the coordinators' comments (S8 may show a status later).
create policy staff_read on promotion_nominations for select to authenticated using (is_staff());
create policy staff_read on promotion_feedback for select to authenticated using (is_staff());
-- Every change goes through the functions below.
revoke all on promotion_nominations, promotion_feedback from public, anon, authenticated;
grant select on promotion_nominations, promotion_feedback to authenticated;

-- ---------------------------------------------------------------- 5. the criteria check
-- What the app shows on C8 and C22, and what is kept on a nomination: the current and next level,
-- syllabus ticked of the items in use at the level, visits (days in class) in the last N weeks,
-- the newest accepted level-up submission of the current level sent to the Guru, whether each
-- criterion is met (all_ok), an open nomination, the date before which a "not yet" student may not
-- be nominated again, and the coordinators who taught the student lately (to ask for feedback).
-- Errors: not_allowed (not staff), student_not_found.
create or replace function promotion_criteria(p_student uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_level     smallint;
  v_mentor    uuid;
  v_next      smallint;
  v_total     int;
  v_done      int;
  v_pct       int := coalesce(setting_int('promotion_syllabus_percent'), 100);
  v_weeks     int := coalesce(setting_int('promotion_visit_weeks'), 8);
  v_min       int := coalesce(setting_int('promotion_min_visits'), 8);
  v_needs_lu  boolean := coalesce((select (value #>> '{}')::boolean from settings where key = 'promotion_needs_level_up'), true);
  v_visits    int;
  v_sub       jsonb;
  v_open      bigint;
  v_wait      date;
  v_taught    uuid[];
  v_syll_ok   boolean;
  v_visits_ok boolean;
  v_lu_ok     boolean;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select level_id, mentor_id into v_level, v_mentor from students where id = p_student;
  if not found then raise exception 'student_not_found'; end if;
  v_next := next_level(v_level);

  select count(*)::int, count(p.item_id)::int into v_total, v_done
    from syllabus_items i
    left join student_progress p on p.item_id = i.id and p.student_id = p_student
   where i.level_id = v_level and i.retired_at is null;

  select count(distinct (v.check_in at time zone 'Asia/Kolkata')::date)::int into v_visits
    from visits v
   where v.student_id = p_student and v.check_in >= now() - make_interval(weeks => v_weeks);

  select jsonb_build_object('submission_id', s.id, 'assignment_id', g.id, 'assessment_id', a.id,
                            'title', a.title, 'score', s.score, 'score_max', s.score_max,
                            'reviewed_at', s.reviewed_at)
    into v_sub
    from assessment_submissions s
    join assessment_assignments g on g.id = s.assignment_id
    join assessments a on a.id = g.assessment_id
   where g.student_id = p_student and s.send_level_up and s.outcome = 'accepted' and a.level_id = v_level
   order by s.reviewed_at desc, s.id desc limit 1;

  select id into v_open from promotion_nominations where student_id = p_student and status = 'open';
  select max(renominate_after) into v_wait
    from promotion_nominations where student_id = p_student and status = 'not_yet';
  if v_wait <= today_ist() then v_wait := null; end if;

  -- Coordinators who ticked the student's syllabus, marked a visit or reviewed a recording in the
  -- same weeks, and the mentor: active coordinators only.
  select coalesce(array_agg(distinct x.id), '{}') into v_taught
    from (
      select p.ticked_by as id from student_progress p
       where p.student_id = p_student and p.done_on >= today_ist() - v_weeks * 7
      union select v.marked_by from visits v
       where v.student_id = p_student and v.check_in >= now() - make_interval(weeks => v_weeks)
      union select s.reviewed_by from assessment_submissions s
        join assessment_assignments g on g.id = s.assignment_id
       where g.student_id = p_student and s.reviewed_at >= now() - make_interval(weeks => v_weeks)
      union select v_mentor
    ) x
    join profiles pr on pr.id = x.id and pr.role = 'coordinator' and pr.active;

  v_syll_ok := v_done * 100 >= v_pct * v_total;
  v_visits_ok := v_visits >= v_min;
  v_lu_ok := not v_needs_lu or v_sub is not null;
  return jsonb_build_object(
    'level_id', v_level,
    'next_level_id', v_next,
    'syllabus_done', v_done,
    'syllabus_total', v_total,
    'syllabus_percent', v_pct,
    'syllabus_ok', v_syll_ok,
    'visits', v_visits,
    'visits_needed', v_min,
    'visit_weeks', v_weeks,
    'visits_ok', v_visits_ok,
    'level_up_needed', v_needs_lu,
    'level_up', v_sub,
    'level_up_ok', v_lu_ok,
    'all_ok', v_next is not null and v_syll_ok and v_visits_ok and v_lu_ok,
    'open_nomination_id', v_open,
    'renominate_after', v_wait,
    'taught_by', to_jsonb(v_taught));
end $$;

-- ---------------------------------------------------------------- 6. notifications
-- The line under the title, in the person's app language. Telugu and Hindi are drafts for the
-- native-speaker review (docs/TRANSLATIONS.md).
create or replace function promotion_push_line(p_kind text, p_lang text) returns text
language sql immutable set search_path = public as $$
  select case p_kind
    when 'asked' then case p_lang
      when 'te' then 'తర్వాతి స్థాయికి సిఫారసు చేశారు. దయచేసి మీ అభిప్రాయం ఇవ్వండి.'
      when 'hi' then 'अगले स्तर के लिए नामांकन। कृपया अपनी राय दें।'
      else 'Nominated for the next level. Please give your feedback.' end
    when 'ready' then case p_lang
      when 'te' then 'కోఆర్డినేటర్ల అభిప్రాయాలు వచ్చాయి. మీ నిర్ణయం కోసం వేచి ఉంది.'
      when 'hi' then 'कोऑर्डिनेटरों की राय आ गई है। आपके निर्णय की प्रतीक्षा है।'
      else 'The coordinators'' feedback is in. Waiting for your decision.' end
    when 'more' then case p_lang
      when 'te' then 'గురువుగారు మరింత అభిప్రాయం అడుగుతున్నారు.'
      when 'hi' then 'गुरुजी और राय माँग रहे हैं।'
      else 'The facilitator asks for more feedback.' end
    when 'promoted' then case p_lang
      when 'te' then 'అభినందనలు! మీరు తర్వాతి స్థాయికి వెళ్లారు.'
      when 'hi' then 'बधाई हो! आप अगले स्तर पर पहुँच गए हैं।'
      else 'Congratulations! You have moved up to the next level.' end
    when 'promoted_staff' then case p_lang
      when 'te' then 'గురువుగారు తర్వాతి స్థాయికి పెంచారు.'
      when 'hi' then 'गुरुजी ने अगले स्तर पर बढ़ा दिया।'
      else 'The facilitator promoted them to the next level.' end
    when 'not_yet' then case p_lang
      when 'te' then 'ఇంకా కాదు. గురువుగారి సూచనలు చూడండి.'
      when 'hi' then 'अभी नहीं। गुरुजी का मार्गदर्शन देखें।'
      else 'Not yet. See the facilitator''s guidance.' end
  end
$$;

-- Queues one notification to each given staff login (active Guru or coordinator), in their
-- language; never to the person whose action it is.
create or replace function queue_staff_push(p_profiles uuid[], p_kind text, p_title text, p_url text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  insert into push_outbox (profile_id, title, body, url)
  select p.id, p_title, promotion_push_line(p_kind, p.language), p_url
    from profiles p
   where p.id = any (coalesce(p_profiles, '{}')) and p.active and p.role in ('guru', 'coordinator')
     and p.id is distinct from auth.uid();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- After an answer: when enough coordinators have answered and the Guru was not told since the
-- nomination (or since "More feedback"), tell every active Guru.
create or replace function promotion_tell_guru(p_nomination bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_n     promotion_nominations;
  v_count int;
  v_name  text;
begin
  select * into v_n from promotion_nominations where id = p_nomination for update;
  if v_n.status <> 'open' or v_n.ready_notified_at is not null then return; end if;
  select count(*)::int into v_count from promotion_feedback where nomination_id = p_nomination;
  if v_count < coalesce(setting_int('promotion_min_feedback'), 2) then return; end if;
  select full_name into v_name from students where id = v_n.student_id;
  perform queue_staff_push((select array_agg(id) from profiles where role = 'guru' and active),
                           'ready', v_name, '/staff/promotion/' || p_nomination);
  update promotion_nominations set ready_notified_at = now() where id = p_nomination;
end $$;

-- ---------------------------------------------------------------- 7. what the app calls
-- C22: nominate a student for the next level, with a reason, asking some coordinators for
-- feedback (p_ask: their profile ids; anyone who is not an active coordinator is left out). The
-- criteria are checked and kept with the nomination; when one is not met the coordinator may
-- still nominate (the reason says why) and the Guru sees it. Returns the nomination id.
-- Errors: not_allowed, student_not_found, top_level, already_nominated, too_soon (a "not yet"
-- date still ahead), reason_required, reason_too_long (2000).
create or replace function nominate_for_promotion(p_student uuid, p_reason text, p_ask uuid[] default '{}')
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_reason   text := nullif(btrim(coalesce(p_reason, ''), E' \t\r\n'), '');
  v_criteria jsonb;
  v_ask      uuid[];
  v_id       bigint;
  v_name     text;
  v_status   student_status;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select full_name, status into v_name, v_status from students where id = p_student for update;
  if not found or v_status = 'left' then raise exception 'student_not_found'; end if;
  v_criteria := promotion_criteria(p_student);
  if v_criteria ->> 'next_level_id' is null then raise exception 'top_level'; end if;
  if v_criteria ->> 'open_nomination_id' is not null then raise exception 'already_nominated'; end if;
  if v_criteria ->> 'renominate_after' is not null then
    raise exception 'too_soon' using detail = 'The facilitator said "not yet" until ' || (v_criteria ->> 'renominate_after') || '.';
  end if;
  if v_reason is null then raise exception 'reason_required'; end if;
  if char_length(v_reason) > 2000 then raise exception 'reason_too_long'; end if;

  select coalesce(array_agg(distinct p.id), '{}') into v_ask
    from profiles p
   where p.id = any (coalesce(p_ask, '{}')) and p.role = 'coordinator' and p.active and p.id <> auth.uid();

  insert into promotion_nominations (student_id, from_level, to_level, reason, criteria, submission_id, asked, nominated_by)
  values (p_student, (v_criteria ->> 'level_id')::smallint, (v_criteria ->> 'next_level_id')::smallint, v_reason,
          v_criteria - 'taught_by' - 'open_nomination_id' - 'renominate_after',
          (v_criteria #>> '{level_up,submission_id}')::bigint, v_ask, auth.uid())
  returning id into v_id;
  -- A coordinator who nominates says "Ready"; the reason is their comment.
  if my_role() = 'coordinator' then
    insert into promotion_feedback (nomination_id, coordinator_id, rating, comment)
    values (v_id, auth.uid(), 'ready', v_reason);
  end if;
  perform queue_staff_push(v_ask, 'asked', v_name, '/staff/promotion/' || v_id);
  perform promotion_tell_guru(v_id);
  return v_id;
end $$;

-- C23: a coordinator's answer on an open nomination: ready, almost or not_yet, with a comment.
-- Answering again changes the answer. Errors: not_allowed (not a coordinator), nomination_not_found,
-- nomination_closed, rating_invalid, comment_required, comment_too_long (1000).
create or replace function give_promotion_feedback(p_nomination bigint, p_rating text, p_comment text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_comment text := nullif(btrim(coalesce(p_comment, ''), E' \t\r\n'), '');
  v_status  text;
begin
  if coalesce(my_role() <> 'coordinator', true) then raise exception 'not_allowed'; end if;
  select status into v_status from promotion_nominations where id = p_nomination;
  if not found then raise exception 'nomination_not_found'; end if;
  if v_status <> 'open' then raise exception 'nomination_closed'; end if;
  if p_rating is null or p_rating not in ('ready', 'almost', 'not_yet') then raise exception 'rating_invalid'; end if;
  if v_comment is null then raise exception 'comment_required'; end if;
  if char_length(v_comment) > 1000 then raise exception 'comment_too_long'; end if;
  insert into promotion_feedback (nomination_id, coordinator_id, rating, comment)
  values (p_nomination, auth.uid(), p_rating, v_comment)
  on conflict (nomination_id, coordinator_id)
  do update set rating = excluded.rating, comment = excluded.comment, updated_at = now();
  perform promotion_tell_guru(p_nomination);
end $$;

-- G7: the Guru decides an open nomination.
--   'promote'  needs promotion_min_feedback answers; moves the student up one level, writes
--              level_history; p_note is an optional word to the staff. Tells the student and the nominator.
--   'not_yet'  needs guidance (p_note) and a date after which the student may be nominated again
--              (tomorrow to a year ahead). Tells the nominator and those who answered.
--   'more'     asks for more feedback (p_note says what to look at); tells the active coordinators
--              who have not answered yet. The nomination stays open.
-- Errors: not_allowed, nomination_not_found, nomination_closed, decision_invalid, feedback_needed,
-- level_changed (the student's level is no longer the one nominated from), note_required,
-- note_too_long (2000), date_required, date_past, date_too_far.
create or replace function decide_promotion(p_nomination bigint, p_decision text, p_note text default null,
                                            p_renominate_after date default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_n       promotion_nominations;
  v_note    text := nullif(btrim(coalesce(p_note, ''), E' \t\r\n'), '');
  v_count   int;
  v_level   smallint;
  v_history bigint;
  v_name    text;
  v_people  uuid[];
  v_url     text := '/staff/promotion/' || p_nomination;
begin
  if not is_guru() then raise exception 'not_allowed'; end if;
  select * into v_n from promotion_nominations where id = p_nomination for update;
  if not found then raise exception 'nomination_not_found'; end if;
  if v_n.status <> 'open' then raise exception 'nomination_closed'; end if;
  if p_decision is null or p_decision not in ('promote', 'not_yet', 'more') then raise exception 'decision_invalid'; end if;
  if char_length(coalesce(v_note, '')) > 2000 then raise exception 'note_too_long'; end if;
  select full_name, level_id into v_name, v_level from students where id = v_n.student_id for update;

  if p_decision = 'promote' then
    select count(*)::int into v_count from promotion_feedback where nomination_id = p_nomination;
    if v_count < coalesce(setting_int('promotion_min_feedback'), 2) then raise exception 'feedback_needed'; end if;
    if v_level is distinct from v_n.from_level then raise exception 'level_changed'; end if;
    update students set level_id = v_n.to_level where id = v_n.student_id;
    insert into level_history (student_id, from_level, to_level, approved_by)
    values (v_n.student_id, v_n.from_level, v_n.to_level, auth.uid()) returning id into v_history;
    update promotion_nominations
       set status = 'promoted', decided_by = auth.uid(), decided_at = now(), guidance = v_note,
           level_history_id = v_history
     where id = p_nomination;
    perform queue_student_promoted(v_n.student_id);
    perform queue_staff_push(array[v_n.nominated_by]::uuid[], 'promoted_staff', v_name, v_url);

  elsif p_decision = 'not_yet' then
    if v_note is null then raise exception 'note_required'; end if;
    if p_renominate_after is null then raise exception 'date_required'; end if;
    if p_renominate_after <= today_ist() then raise exception 'date_past'; end if;
    if p_renominate_after > today_ist() + 365 then raise exception 'date_too_far'; end if;
    update promotion_nominations
       set status = 'not_yet', decided_by = auth.uid(), decided_at = now(), guidance = v_note,
           renominate_after = p_renominate_after
     where id = p_nomination;
    select array_agg(distinct x) into v_people
      from (select v_n.nominated_by as x
            union select coordinator_id from promotion_feedback where nomination_id = p_nomination) y
     where x is not null and x <> auth.uid();
    perform queue_staff_push(v_people, 'not_yet', v_name, v_url);

  else
    if v_note is null then raise exception 'note_required'; end if;
    update promotion_nominations
       set more_asked_at = now(), more_note = v_note, ready_notified_at = null
     where id = p_nomination;
    select array_agg(p.id) into v_people
      from profiles p
     where p.role = 'coordinator' and p.active
       and not exists (select 1 from promotion_feedback f where f.nomination_id = p_nomination and f.coordinator_id = p.id);
    perform queue_staff_push(v_people, 'more', v_name, v_url);
  end if;
end $$;

-- Tells a promoted student (their login, if any), in their language.
create or replace function queue_student_promoted(p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into push_outbox (profile_id, title, body, url)
  select p.id, 'Mridanga Seva', promotion_push_line('promoted', p.language), '/student/progress'
    from students s join profiles p on p.id = s.profile_id and p.active
   where s.id = p_student;
end $$;

-- The nominator or the Guru takes back an open nomination (a mistake, the student is away ...).
-- Errors: not_allowed, nomination_not_found, nomination_closed.
create or replace function withdraw_nomination(p_nomination bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_n promotion_nominations;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select * into v_n from promotion_nominations where id = p_nomination for update;
  if not found then raise exception 'nomination_not_found'; end if;
  if v_n.nominated_by is distinct from auth.uid() and not is_guru() then raise exception 'not_allowed'; end if;
  if v_n.status <> 'open' then raise exception 'nomination_closed'; end if;
  update promotion_nominations set status = 'withdrawn', decided_by = auth.uid(), decided_at = now()
   where id = p_nomination;
end $$;

-- ---------------------------------------------------------------- 8. the queue and the home counts
-- G7 and the coordinators' list: each nomination with the student, the answers so far and how many
-- are needed. security_invoker: staff only, through the policies above.
create view promotion_queue with (security_invoker = true) as
select n.id,
       n.student_id,
       s.full_name,
       s.roll_no,
       s.level_id as current_level,
       n.from_level,
       n.to_level,
       n.reason,
       n.criteria,
       n.submission_id,
       n.asked,
       n.nominated_by,
       n.nominated_at,
       n.status,
       n.more_asked_at,
       n.more_note,
       n.decided_by,
       n.decided_at,
       n.guidance,
       n.renominate_after,
       coalesce(f.answers, 0) as answers,
       coalesce(f.ready, 0) as ready,
       coalesce(f.almost, 0) as almost,
       coalesce(f.not_yet, 0) as not_yet,
       f.last_answer_at,
       coalesce(setting_int('promotion_min_feedback'), 2) as answers_needed
  from promotion_nominations n
  join students s on s.id = n.student_id
  left join lateral (select count(*)::int as answers,
                            count(*) filter (where x.rating = 'ready')::int as ready,
                            count(*) filter (where x.rating = 'almost')::int as almost,
                            count(*) filter (where x.rating = 'not_yet')::int as not_yet,
                            max(x.updated_at) as last_answer_at
                       from promotion_feedback x where x.nomination_id = n.id) f on true;

revoke all on promotion_queue from public, anon, authenticated;
grant select on promotion_queue to authenticated;

-- Students who meet every criterion and could be nominated now: for a coordinator their mentees,
-- for the Guru everyone. Not "left", no open nomination, no "not yet" date ahead.
create or replace function promotion_ready_students()
returns table (student_id uuid, full_name text, roll_no text, level_id smallint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_row record;
  v_c   jsonb;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  for v_row in
    select s.id, s.full_name, s.roll_no, s.level_id from students s
     where s.status <> 'left' and (is_guru() or s.mentor_id = auth.uid())
       and next_level(s.level_id) is not null
     order by s.full_name
  loop
    v_c := promotion_criteria(v_row.id);
    if (v_c ->> 'all_ok')::boolean and v_c ->> 'open_nomination_id' is null and v_c ->> 'renominate_after' is null then
      student_id := v_row.id; full_name := v_row.full_name; roll_no := v_row.roll_no; level_id := v_row.level_id;
      return next;
    end if;
  end loop;
end $$;

-- The numbers for the staff homes (G1, C1): open nominations waiting for the Guru (enough answers)
-- and still collecting answers; nominations the signed-in coordinator has not answered yet; and
-- how many of their students are ready to be nominated.
create or replace function promotion_home() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_min int := coalesce(setting_int('promotion_min_feedback'), 2);
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  return jsonb_build_object(
    'to_decide', (select count(*)::int from promotion_nominations n
                   where n.status = 'open'
                     and (select count(*) from promotion_feedback f where f.nomination_id = n.id) >= v_min),
    'collecting', (select count(*)::int from promotion_nominations n
                    where n.status = 'open'
                      and (select count(*) from promotion_feedback f where f.nomination_id = n.id) < v_min),
    'to_answer', case when my_role() = 'coordinator' then
                   (select count(*)::int from promotion_nominations n
                     where n.status = 'open'
                       and not exists (select 1 from promotion_feedback f
                                        where f.nomination_id = n.id and f.coordinator_id = auth.uid()))
                 else 0 end,
    'ready', (select count(*)::int from promotion_ready_students()));
end $$;

-- ---------------------------------------------------------------- 9. keeping level-up recordings
-- 0012 kept a recording sent to the Guru for a level-up "until slice 2 decides". Now: it stays
-- while a nomination using it is open, and is deleted 30 days after that nomination is decided
-- (promoted, not yet or withdrawn). One never used for a nomination goes 180 days after its review.
create or replace function submission_file_expired(p_id bigint, p_reviewed_at timestamptz, p_level_up boolean)
returns boolean
language sql stable set search_path = public as $$
  select case
    when p_reviewed_at is null then false
    when not p_level_up then p_reviewed_at < now() - interval '30 days'
    when exists (select 1 from promotion_nominations n where n.submission_id = p_id and n.status = 'open') then false
    when exists (select 1 from promotion_nominations n where n.submission_id = p_id) then
      (select max(n.decided_at) from promotion_nominations n where n.submission_id = p_id) < now() - interval '30 days'
    else p_reviewed_at < now() - interval '180 days'
  end
$$;

create or replace function claim_expired_submission_files()
returns table (submission_id bigint, path text)
language sql volatile set search_path = public as $$
  with due as (
    select s.id from assessment_submissions s
     where s.file is not null and s.file_removed_at is null
       and submission_file_expired(s.id, s.reviewed_at, s.send_level_up)
     order by s.reviewed_at limit 200
     for update skip locked
  )
  update assessment_submissions s set file_removed_at = now()
    from due where s.id = due.id
  returning s.id, s.file ->> 'path'
$$;

-- 0012's daily job with the new rule for which files have expired.
create or replace function assessment_daily() returns int
language plpgsql volatile set search_path = public as $$
declare
  v_row record;
  v_n   int := 0;
begin
  for v_row in
    select g.id, g.student_id, r.due_on, a.title
      from assessment_assignments g
      join assessment_releases r on r.id = g.release_id
      join assessments a on a.id = g.assessment_id
     where g.status in ('assigned', 'seen', 'redo')
       and r.due_on between today_ist() and today_ist() + 1
       and (g.last_reminded_at is null or g.last_reminded_at < now() - interval '12 hours')
  loop
    if queue_student_push(v_row.student_id, 'remind', v_row.title, '/student/assessments/' || v_row.id, v_row.due_on) then
      update assessment_assignments set last_reminded_at = now(), reminders = reminders + 1 where id = v_row.id;
      v_n := v_n + 1;
    end if;
  end loop;
  if exists (select 1 from assessment_submissions s
              where s.file is not null and s.file_removed_at is null
                and submission_file_expired(s.id, s.reviewed_at, s.send_level_up)) then
    perform call_notify_function('{"cleanup": true}'::jsonb);
  end if;
  return v_n;
end $$;

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14.
revoke execute on function next_level(smallint), guard_student_level(), promotion_criteria(uuid),
  promotion_push_line(text, text), queue_staff_push(uuid[], text, text, text), promotion_tell_guru(bigint),
  nominate_for_promotion(uuid, text, uuid[]), give_promotion_feedback(bigint, text, text),
  decide_promotion(bigint, text, text, date), queue_student_promoted(uuid), withdraw_nomination(bigint),
  promotion_ready_students(), promotion_home(), submission_file_expired(bigint, timestamptz, boolean),
  claim_expired_submission_files(), assessment_daily()
  from public, anon, authenticated;
grant execute on function next_level(smallint), promotion_criteria(uuid), nominate_for_promotion(uuid, text, uuid[]),
  give_promotion_feedback(bigint, text, text), decide_promotion(bigint, text, text, date),
  withdraw_nomination(bigint), promotion_ready_students(), promotion_home() to authenticated;
grant execute on function claim_expired_submission_files() to service_role;

-- ---------------------------------------------------------------- descriptions
comment on table promotion_nominations is 'A coordinator''s nomination of a student for the next level (C22) and the Guru''s decision (G7): open, promoted, not_yet (guidance + renominate_after) or withdrawn. One open per student (docs/DECISIONS.md #45).';
comment on column promotion_nominations.criteria is 'The criteria check at the time of nomination (promotion_criteria()): syllabus, visits, level-up assessment.';
comment on column promotion_nominations.submission_id is 'The accepted level-up recording sent to the Guru, shown beside the feedback. Its file is kept while the nomination is open.';
comment on column promotion_nominations.asked is 'Coordinators the nominator asked for feedback (they get a notification). Any coordinator may answer.';
comment on column promotion_nominations.more_asked_at is 'When the Guru last asked for more feedback (more_note says what about).';
comment on column promotion_nominations.renominate_after is 'After "not yet": the student may be nominated again from the day after this date.';
comment on table promotion_feedback is 'C23: one coordinator''s answer on a nomination: ready, almost or not_yet, with a comment. The nominating coordinator''s own answer is "ready".';
comment on view promotion_queue is 'G7: nominations with the student, the answers so far and the number needed. Staff only.';
comment on function promotion_criteria is 'C8/C22: the criteria check for one student, from the settings promotion_* (defaults: whole syllabus, 8 visits in 8 weeks, an accepted level-up).';
comment on function nominate_for_promotion is 'C22: nominate a student for the next level with a reason; asks the picked coordinators for feedback.';
comment on function give_promotion_feedback is 'C23: a coordinator''s answer (ready / almost / not_yet + comment); tells the Guru when enough have answered.';
comment on function decide_promotion is 'G7: the Guru promotes (level + level_history), says not yet (guidance + date) or asks for more feedback.';
comment on function withdraw_nomination is 'The nominator or the Guru takes back an open nomination.';
comment on function promotion_ready_students is 'Students who meet every criterion and could be nominated now: a coordinator''s mentees, or everyone for the Guru.';
comment on function promotion_home is 'Counts for the staff homes: to decide, collecting feedback, to answer, ready to nominate.';
comment on function guard_student_level is 'Only the Guru changes students.level_id (the dashboard is not stopped).';
