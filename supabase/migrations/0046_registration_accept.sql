-- 0046 Registration accept (docs/DECISIONS.md #263-#266; docs/DATABASE.md "Linking a login to a student"
-- and "Registering a student"). Praveen's rule of 12 Oct 2026: a student's form is filled once, by the
-- student at sign-up; the desk does not type it again.
-- 1. accept_sign_up(profile): the Guru or a coordinator (own centre) registers an adult who signed up
--    and waits for the desk, from what the person gave (name, date of birth, phone, email, centre,
--    About you), and links the login, in one step. The mentor follows #165 (the login's gender and
--    referral, through the 0036 triggers). Saving twice gives the first record (repeated: true).
--    Errors: not_allowed, sign_up_not_found, already_registered, not_waiting, email_not_confirmed,
--    dob_required, minor_needs_desk (under 18: the desk with a parent, #150), name_required.
-- 2. A login whose role was set to 'student' by hand (dashboard) with no student record was never
--    linked: every link path asked for 'pending'. my_role() already treats it as 'pending' (#96); now
--    link_login_to_student (email confirmed), link_student_email (an email saved on a record),
--    link_student_login (the Guru, G2) and waiting_sign_ups (Register a student) take it too. Kept:
--    the email must be confirmed, a switched-off login is never linked, a login already on a record
--    is never linked again, the Guru and coordinators are never made students.
-- 3. Such logins that can be linked today (a record with their email and no login) are linked now.
-- Needs 0001-0045. Safe to run twice.

-- ---------------------------------------------------------------- 2. the link paths
-- True for a login that may be linked to a student record: switched on, waiting ('pending') or a
-- 'student' that no record points at (#96), and not yet on a record.
create or replace function login_awaits_record(p_profile uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from profiles p
                  where p.id = p_profile and p.active and p.role in ('pending', 'student')
                    and not exists (select 1 from students s where s.profile_id = p.id))
$$;

-- Path 1 (0002, 0037): the login confirms its email (also a changed email, 0028, and a login made
-- already confirmed, 0036).
create or replace function link_login_to_student(p_user uuid, p_email text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare s_id uuid;
begin
  if p_email is null or not login_awaits_record(p_user) then
    return;
  end if;
  select id into s_id from students
   where lower(email) = lower(p_email) and profile_id is null
   order by created_at limit 1;
  if s_id is null then return; end if;
  update students set profile_id = p_user where id = s_id;
  update profiles set role = 'student' where id = p_user and role <> 'student';
end $$;

-- Path 2 (0002): an email saved on a record without a login links a confirmed login with that email.
create or replace function link_student_email() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare p_id uuid;
begin
  if new.profile_id is not null or new.email is null then return new; end if;
  select p.id into p_id
    from profiles p join auth.users u on u.id = p.id
   where lower(u.email) = lower(new.email)
     and u.email_confirmed_at is not null
     and login_awaits_record(p.id)
   order by p.created_at
   limit 1;
  if p_id is null then return new; end if;
  new.profile_id := p_id;
  update profiles set role = 'student' where id = p_id and role <> 'student';
  return new;
end $$;

-- Path 3 (0014, G2): the Guru links a login to a record without a login.
-- Error codes: not_allowed, profile_not_pending, student_not_found, student_already_linked.
create or replace function link_student_login(p_profile uuid, p_student uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_student students;
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  perform 1 from profiles where id = p_profile for update;
  if not login_awaits_record(p_profile) then
    raise exception 'profile_not_pending' using detail = 'Only an active login that is waiting for a role can be linked.';
  end if;
  select * into v_student from students where id = p_student for update;
  if not found then raise exception 'student_not_found'; end if;
  if v_student.profile_id is not null then
    raise exception 'student_already_linked' using detail = 'This student record already has a login.';
  end if;
  update students set profile_id = p_profile where id = p_student;
  update profiles set role = 'student' where id = p_profile and role <> 'student';
end $$;

-- Register a student (C2): confirmed sign-ups of the last 180 days that wait for the desk, as 0036,
-- now with a hand-set 'student' login that has no record, and the centre's name for Accept's check.
-- A login that joined Ishtagoshti is on I15.
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
             'diksha_name', d.diksha_name, 'learn_interests', to_jsonb(coalesce(d.learn_interests, '{}')))
           order by p.created_at desc)
      from profiles p
      join auth.users u on u.id = p.id
      left join person_details d on d.profile_id = p.id and d.student_id is null
     where p.role in ('pending', 'student') and p.active and u.email_confirmed_at is not null
       and not exists (select 1 from students s where s.profile_id = p.id)
       and not exists (select 1 from ig_subscribers i where i.profile_id = p.id)
       and (is_guru() or p.centre_id = (select me.centre_id from profiles me where me.id = auth.uid()))
       and p.created_at > now() - interval '180 days'), '[]') end
$$;

-- ---------------------------------------------------------------- 1. accept a sign-up
-- The record gets the sign-up's name, date of birth, phone, email (the confirmed sign-in email) and
-- centre; request_id = the login's id, so a second Accept (a lost answer, or two coordinators at once:
-- the profile row is locked) finds it and answers repeated. The gender is left to the 0036 link
-- trigger, which moves the About-you row first and then copies the gender, so the mentor rule (#165)
-- sees the referral. An unlinked record that already carries the email is linked instead of making a
-- second one (existing: true).
create or replace function accept_sign_up(p_profile uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p     profiles;
  v_email text;
  v_conf  timestamptz;
  d       person_details;
  s       students;
begin
  if not coalesce(is_staff(), false) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into v_p from profiles where id = p_profile for update;
  if not found then raise exception 'sign_up_not_found'; end if;
  if not coalesce(is_guru(), false) and v_p.centre_id is distinct from (select me.centre_id from profiles me where me.id = auth.uid()) then
    raise exception 'not_allowed' using errcode = '42501', detail = 'A coordinator accepts the sign-ups of their own centre.';
  end if;

  select * into s from students where profile_id = p_profile;
  if found then
    if s.request_id = p_profile then
      return jsonb_build_object('id', s.id, 'roll_no', s.roll_no, 'full_name', s.full_name, 'linked', true,
                                'repeated', true, 'existing', false);
    end if;
    raise exception 'already_registered' using detail = 'This login is already on a student record.';
  end if;
  if not login_awaits_record(p_profile) or exists (select 1 from ig_subscribers i where i.profile_id = p_profile) then
    raise exception 'not_waiting' using detail = 'Only an active login waiting for the desk can be accepted.';
  end if;
  select lower(u.email), u.email_confirmed_at into v_email, v_conf from auth.users u where u.id = p_profile;
  if v_conf is null or v_email is null then
    raise exception 'email_not_confirmed' using detail = 'The person has not opened the link in the sign-up email yet.';
  end if;

  select * into d from person_details where profile_id = p_profile and student_id is null;
  if d.dob is null then
    raise exception 'dob_required' using detail = 'The sign-up has no date of birth: use Fill the form.';
  end if;
  if d.dob > today_ist() - interval '18 years' then
    raise exception 'minor_needs_desk' using detail = 'Under 18: the desk registers the student with a parent.';
  end if;
  if btrim(coalesce(v_p.full_name, '')) = '' then raise exception 'name_required'; end if;

  -- Registered at the desk already (the link did not happen then): link, do not make a second record.
  perform link_login_to_student(p_profile, v_email);
  select * into s from students where profile_id = p_profile;
  if found then
    return jsonb_build_object('id', s.id, 'roll_no', s.roll_no, 'full_name', s.full_name, 'linked', true,
                              'repeated', false, 'existing', true);
  end if;

  insert into students (full_name, dob, phone, email, level_id, home_centre_id, request_id, profile_id)
  values (btrim(v_p.full_name), d.dob, v_p.phone, v_email, 1,
          coalesce(v_p.centre_id, (select min(id) from centres where active), 1)::smallint, p_profile, p_profile)
  returning * into s;
  update profiles set role = 'student' where id = p_profile and role <> 'student';
  return jsonb_build_object('id', s.id, 'roll_no', s.roll_no, 'full_name', s.full_name, 'linked', true,
                            'repeated', false, 'existing', false);
end $$;

-- ---------------------------------------------------------------- 3. logins stuck today
-- A hand-set 'student' login with a confirmed email and a record carrying that email: linked now.
do $$
begin
  perform link_login_to_student(p.id, u.email)
     from profiles p join auth.users u on u.id = p.id
    where p.role = 'student' and p.active and u.email_confirmed_at is not null
      and not exists (select 1 from students s where s.profile_id = p.id);
end $$;

-- ---------------------------------------------------------------- who may run them
revoke execute on function login_awaits_record(uuid) from public, anon, authenticated;
revoke execute on function accept_sign_up(uuid) from public, anon;
grant execute on function accept_sign_up(uuid) to authenticated;

comment on function login_awaits_record(uuid) is
  'True for a login that may be linked to a student record: switched on, pending or a student without a record (#96), not on a record yet.';
comment on function accept_sign_up(uuid) is
  'Staff (a coordinator: own centre): registers an adult confirmed sign-up from its own data and links the login; a second call returns the first record (repeated).';
comment on function link_login_to_student is 'Links a confirmed login waiting for a record (pending, or a student without a record) to the student record with the same email and makes it a student.';
comment on function link_student_email is 'Trigger: when a student record gets an email, links it to a confirmed login with that email that waits for a record (pending, or a student without one).';
