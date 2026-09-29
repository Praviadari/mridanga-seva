-- Mridanga Seva — 0002: let the first Guru be set up, link logins to student records safely,
-- and lock down internal functions. Run once, after 0001_phase1.sql, in the Supabase SQL editor.
-- Why: docs/DECISIONS.md #13 and #14. How linking works: docs/DATABASE.md "Linking a login to a student".
--
-- 1. 0001's profile guard also blocked the dashboard, so nobody could give the first Guru their
--    role. The guard now applies only to people using the app (roles anon and authenticated).
-- 2. A login is linked to a student record only once its email is CONFIRMED. 0001 linked at
--    sign-up, before confirmation, so anyone who typed a student's email could claim that record.
-- 3. The link is also made when a coordinator types the email on a student record AFTER the
--    person has signed up. With 0001 such a person stayed 'pending' for ever.
-- 4. On Supabase, the roles anon and authenticated can run any new function in the public
--    schema. 0001 revoked only from `public`, so anyone holding the app's public key could run
--    close_open_visits() (checking everybody out) or refresh_student_statuses().

-- ---------------------------------------------------------------- profile guard
-- App users (the app connects as anon or authenticated) cannot change role, treasurer or
-- active unless they are the Guru. The dashboard, the SQL editor and this file's own security
-- definer functions run as the database owner and are allowed: that is how the first Guru is
-- made (docs/OPERATIONS.md) and how a confirmed login becomes a student.
create or replace function guard_profile_update() returns trigger
language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated')
     and not is_guru()
     and (new.role is distinct from old.role
          or new.is_treasurer is distinct from old.is_treasurer
          or new.active is distinct from old.active) then
    raise exception 'only the Guru can change role, treasurer or active';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- path 1: login confirmed
-- Links login p_user to the oldest unlinked student record with the same email and makes it
-- a student. Only for logins still 'pending', so a coordinator never loses their role this way.
create or replace function link_login_to_student(p_user uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare s_id uuid;
begin
  if p_email is null
     or not exists (select 1 from profiles where id = p_user and role = 'pending')
     or exists (select 1 from students where profile_id = p_user) then
    return;
  end if;
  select id into s_id from students
   where lower(email) = lower(p_email) and profile_id is null
   order by created_at limit 1;
  if s_id is null then return; end if;
  update students set profile_id = p_user where id = s_id;
  update profiles set role = 'student' where id = p_user;
end $$;

-- New sign-up: every login starts 'pending'. It is linked straight away only if Supabase has
-- already confirmed the email (when "Confirm email" is switched off, or a user made in the
-- dashboard); otherwise the confirmation trigger below links it.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''), 'pending');
  if new.email_confirmed_at is not null then
    perform link_login_to_student(new.id, new.email);
  end if;
  return new;
end $$;

-- Runs when a person opens the confirmation link from their sign-up email.
create or replace function handle_user_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform link_login_to_student(new.id, new.email);
  return new;
end $$;
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function handle_user_confirmed();

-- ---------------------------------------------------------------- path 2: email added later
-- When a coordinator saves an email on a student record that has no login yet, link it to a
-- confirmed, still-pending login with that email (the person signed up first).
create or replace function link_student_email() returns trigger
language plpgsql security definer set search_path = public as $$
declare p_id uuid;
begin
  if new.profile_id is not null or new.email is null then return new; end if;
  select p.id into p_id
    from profiles p join auth.users u on u.id = p.id
   where lower(u.email) = lower(new.email)
     and u.email_confirmed_at is not null
     and p.role = 'pending' and p.active
     and not exists (select 1 from students s where s.profile_id = p.id)
   limit 1;
  if p_id is null then return new; end if;
  new.profile_id := p_id;
  update profiles set role = 'student' where id = p_id;
  return new;
end $$;
create trigger students_link_login before insert or update of email on students
  for each row execute function link_student_email();

-- ---------------------------------------------------------------- who may run functions
-- Internal functions: only triggers and the daily jobs (which run as the owner) use them.
revoke execute on function refresh_student_statuses(), close_open_visits(),
  link_login_to_student(uuid, text)
  from public, anon, authenticated;
-- App functions: signed-in people only. Each one still checks the caller's role inside.
revoke execute on function toggle_visit(uuid, visit_method, text), scan_qr(uuid, text),
  log_call(uuid, call_outcome, text, text, date)
  from public, anon;
grant execute on function toggle_visit(uuid, visit_method, text), scan_qr(uuid, text),
  log_call(uuid, call_outcome, text, text, date)
  to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on function link_login_to_student is 'Links a confirmed, pending login to the student record with the same email and makes it a student.';
comment on function link_student_email is 'Trigger: when a student record gets an email, links it to a confirmed pending login with that email.';
comment on function guard_profile_update is 'Trigger: app users other than the Guru cannot change role, treasurer or active. The dashboard can.';
