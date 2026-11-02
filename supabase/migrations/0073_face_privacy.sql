-- 0073: face scan in a person's data summary, and an approver's login may go (DECISIONS #799).
-- Two gaps found at the face merge (release 08-11-2026), fixed before face scan is switched on anywhere real:
--   1. my_data_summary (0059, 0068) did not list what 0070/0071 keep about a student: the face consent (with the
--      child's own yes), the enrolment records (state and dates), face check-ins, the match scores kept for
--      calibration and the integrity checks. Replaced with 0068's body plus a 'face' key (only with a student record).
--      The face code itself is never on the server (#298): nothing to list.
--   2. face_enrolments.approved_by pointed at profiles without ON DELETE, so a staff login that confirmed an
--      enrolment could never be deleted. Now ON DELETE SET NULL, and the check that tied approved_by to approved_at
--      becomes one way (a confirmed enrolment may have lost its approver's login; an approver needs a time).
-- Needs 0070 and 0071 (LIVE runs 0070 -> 0071 -> 0073). Rights, logging and errors of my_data_summary unchanged.
-- Changes no stored row. Safe to run twice.

-- ---------------------------------------------------------------- 1. the approver may go
alter table face_enrolments drop constraint if exists face_enrolments_approved_by_fkey;
alter table face_enrolments add constraint face_enrolments_approved_by_fkey
  foreign key (approved_by) references profiles (id) on delete set null;

do $$
declare
  v_name text;
begin
  -- 0070's unnamed check ((approved_at is null) = (approved_by is null)).
  for v_name in
    select conname from pg_constraint
     where conrelid = 'public.face_enrolments'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) = 'CHECK (((approved_at IS NULL) = (approved_by IS NULL)))'
  loop
    execute format('alter table face_enrolments drop constraint %I', v_name);
  end loop;
end $$;
alter table face_enrolments drop constraint if exists face_enrolments_approver_has_time;
alter table face_enrolments add constraint face_enrolments_approver_has_time
  check (approved_by is null or approved_at is not null);

-- ---------------------------------------------------------------- 2. my_data_summary with face scan
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
                  order by l.issued_at), '[]'::jsonb) from inventory_loans l where l.student_id = s.id),
      -- 0068: the Rhythm Playground (0065): settings, rounds (raw for 180 days), weekly summaries, ratings.
      'playground', jsonb_build_object(
        'settings', (select to_jsonb(x) - 'student_id' - 'updated_by' from play_student_settings x where x.student_id = s.id),
        'rounds', (select jsonb_build_object('count', count(*), 'first', min(r.started_at), 'last', max(r.started_at),
                     'games', coalesce((select jsonb_object_agg(g.game, g.n) from (select r2.game, count(*) as n from play_rounds r2
                                         where r2.student_id = s.id group by r2.game) g), '{}'::jsonb))
                     from play_rounds r where r.student_id = s.id),
        'weeks', (select coalesce(jsonb_agg(jsonb_build_object('week', w.week, 'skill', w.skill, 'rounds', w.rounds,
                    'opportunities', w.opportunities, 'correct', w.correct) order by w.week desc, w.skill), '[]'::jsonb)
                    from play_skill_weeks w where w.student_id = s.id),
        'ratings', (select coalesce(jsonb_agg(jsonb_build_object('skill', r.skill, 'rating', r.rating, 'note', r.note,
                      'rated_at', r.rated_at) order by r.rated_at), '[]'::jsonb) from play_ratings r where r.student_id = s.id)),
      -- 0073: face scan (0070, 0071). The face code stays on the student's phone (#298); the server keeps records only.
      'face', jsonb_build_object(
        'consents', (select coalesce(jsonb_agg(jsonb_build_object('given_at', c.given_at, 'revoked_at', c.revoked_at,
                       'child_assent', c.child_assent) order by c.given_at), '[]'::jsonb)
                       from consents c where c.student_id = s.id and c.scope = 'face'),
        'enrolments', (select coalesce(jsonb_agg(jsonb_build_object(
                         'state', case when e.revoked_at is not null then 'ended'
                                       when e.enrolled_at is not null then 'enrolled'
                                       when e.approved_at is not null then 'confirmed' else 'waiting' end,
                         'model_version', e.model_version, 'requested_at', e.requested_at, 'confirmed_at', e.approved_at,
                         'enrolled_at', e.enrolled_at, 'expires_at', e.expires_at, 'ended_at', e.revoked_at,
                         'end_reason', e.revoke_reason) order by e.requested_at), '[]'::jsonb)
                         from face_enrolments e where e.student_id = s.id),
        'check_ins', (select count(*) from visits v where v.student_id = s.id and (v.method = 'face' or v.check_out_method = 'face')),
        'match_scores', (select count(*) from visit_face_scores f join visits v on v.id = f.visit_id where v.student_id = s.id),
        'integrity_checks', (select count(*) from integrity_challenges i where i.student_id = s.id)));
  end if;

  perform log_access('my_data_summary', case when v_has then s.id end, 1);
  return v_out;
end $$;
