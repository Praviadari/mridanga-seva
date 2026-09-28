-- Mridanga Seva App — Phase 1 schema
-- Run once in the Supabase SQL editor of the temple's project (or `supabase db push`).
-- Scope: centres, people, students + guardians + consent, visits (attendance), follow-up
-- (call logs, tasks, status), levels + syllabus progress, materials, announcements, settings, audit.
-- Phase 2 (assessments, promotion workflow, events, polls, practice, Ishtagoshti, fund) comes later.

create extension if not exists pgcrypto;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------- types
create type app_role as enum ('pending', 'guru', 'coordinator', 'student', 'kiosk');
create type student_status as enum ('new', 'active', 'irregular', 'inactive', 'paused', 'left');
create type visit_method as enum ('qr', 'manual', 'face', 'phone');
create type call_outcome as enum ('returning', 'paused', 'not_reachable', 'discontinued');

-- ---------------------------------------------------------------- settings
create table settings (
  key   text primary key,
  value jsonb not null
);
insert into settings (key, value) values
  ('irregular_days', '14'),
  ('inactive_days', '30'),
  ('call_due_days', '3'),
  ('retry_days', '3'),
  ('max_retries', '3'),
  ('new_joiner_weeks', '4'),
  ('call_reasons', '["Studies/exams","Work/timing clash","Moved/distance","Health","Family","Lost interest","Joined elsewhere","Travel","Other"]');

create or replace function setting_int(k text) returns int
language sql stable as $$ select (value #>> '{}')::int from settings where key = k $$;

create or replace function today_ist() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- ---------------------------------------------------------------- centres
create table centres (
  id         smallint generated always as identity primary key,
  name       text not null unique,
  lat        double precision,
  lng        double precision,
  radius_m   int not null default 150,
  opens_at   time not null default '14:30',
  closes_at  time not null default '20:00',
  active     boolean not null default true
);
insert into centres (name) values ('Abids');

-- ---------------------------------------------------------------- people
create table profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  role          app_role not null default 'pending',
  full_name     text not null default '',
  email         text,
  phone         text,
  centre_id     smallint references centres (id) default 1,
  is_treasurer  boolean not null default false,
  language      text not null default 'en' check (language in ('en', 'te', 'hi')),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create or replace function my_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active
$$;
create or replace function is_guru() returns boolean
language sql stable as $$ select coalesce(my_role() = 'guru', false) $$;
create or replace function is_staff() returns boolean
language sql stable as $$ select coalesce(my_role() in ('guru', 'coordinator'), false) $$;

-- ---------------------------------------------------------------- levels + syllabus
create table levels (
  id    smallint primary key,
  name  text not null unique,
  sort  smallint not null
);
insert into levels values (1, 'Beginner', 1), (2, 'Intermediate', 2), (3, 'Advanced', 3);

create table syllabus_items (
  id           bigint generated always as identity primary key,
  level_id     smallint not null references levels (id),
  sort         int not null,
  title        text not null,
  description  text,
  unique (level_id, sort)
);

-- ---------------------------------------------------------------- students
create table roll_counters (
  year  int primary key,
  last  int not null default 0
);

create table students (
  id              uuid primary key default gen_random_uuid(),
  roll_no         text unique,                       -- MS-2026-0001, set by trigger, frozen
  profile_id      uuid unique references profiles (id) on delete set null,  -- app login, optional
  full_name       text not null,
  dob             date,
  phone           text,
  email           text,
  area            text,
  pincode         text check (pincode ~ '^[0-9]{6}$'),
  level_id        smallint not null default 1 references levels (id),
  status          student_status not null default 'new',
  paused_until    date,
  mentor_id       uuid references profiles (id),
  home_centre_id  smallint not null default 1 references centres (id),
  joined_on       date not null default today_ist(),
  photo_path      text,
  qr_token        uuid not null unique default gen_random_uuid(),
  created_by      uuid references profiles (id) default auth.uid(),
  created_at      timestamptz not null default now()
);
create index students_mentor_idx on students (mentor_id);
create index students_status_idx on students (status);

create or replace function is_minor(s students) returns boolean
language sql stable as $$ select s.dob is not null and s.dob > today_ist() - interval '18 years' $$;

-- roll number: MS-<year joined>-<4 digits>, never reused, never changed
create or replace function assign_roll_no() returns trigger
language plpgsql as $$
declare y int := extract(year from new.joined_on); n int;
begin
  insert into roll_counters (year, last) values (y, 1)
  on conflict (year) do update set last = roll_counters.last + 1
  returning last into n;
  new.roll_no := format('MS-%s-%s', y, lpad(n::text, 4, '0'));
  return new;
end $$;
create trigger students_roll_no before insert on students
  for each row execute function assign_roll_no();

create or replace function guard_student_update() returns trigger
language plpgsql as $$
begin
  if new.roll_no is distinct from old.roll_no then
    raise exception 'roll_no is frozen once issued';
  end if;
  -- Paused / Left only through a call log (log_call sets app.via_call_log)
  if new.status is distinct from old.status
     and new.status in ('paused', 'left')
     and coalesce(current_setting('app.via_call_log', true), '') <> 'on' then
    raise exception 'status % can only be set by logging a call', new.status;
  end if;
  if new.status is distinct from old.status then
    insert into status_history (student_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end $$;

create table guardians (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students (id) on delete cascade,
  full_name   text not null,
  phone       text,
  email       text,
  relation    text
);

-- DPDP: verifiable parental consent before a minor's data / photo / face is processed
create table consents (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references students (id) on delete cascade,
  guardian_id      uuid references guardians (id),
  scope            text not null check (scope in ('data', 'photo', 'face')),
  method           text not null default 'written' check (method in ('written', 'email_code')),
                   -- Phase 1: parent writes + signs; Phase 2 adds email-code confirmation
  id_type_checked  text,               -- e.g. 'Aadhaar sighted'; the ID NUMBER is never stored
  otp_verified_at  timestamptz,
  verified_by      uuid references profiles (id) default auth.uid(),
  given_at         timestamptz not null default now(),
  revoked_at       timestamptz
);

-- ---------------------------------------------------------------- attendance = visits
create table visits (
  id          bigint generated always as identity primary key,
  student_id  uuid not null references students (id) on delete cascade,
  centre_id   smallint not null default 1 references centres (id),
  check_in    timestamptz not null default now(),
  check_out   timestamptz,
  method      visit_method not null,
  marked_by   uuid references profiles (id) default auth.uid(),
  device_id   text,
  check (check_out is null or check_out > check_in)
);
create unique index visits_one_open on visits (student_id) where check_out is null;
create index visits_student_time on visits (student_id, check_in desc);

-- ---------------------------------------------------------------- follow-up
create table call_logs (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references students (id) on delete cascade,
  coordinator_id  uuid not null references profiles (id) default auth.uid(),
  called_at       timestamptz not null default now(),
  outcome         call_outcome not null,
  reason          text,
  comment         text not null check (length(trim(comment)) > 0),
  next_date       date,
  check (outcome = 'not_reachable' or reason is not null),
  check (outcome not in ('returning', 'paused') or next_date is not null)
);

create table follow_up_tasks (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references students (id) on delete cascade,
  assignee_id  uuid references profiles (id),
  kind         text not null check (kind in ('call', 'retry')),
  due_on       date not null,
  attempt      int not null default 1,
  done_at      timestamptz,
  call_log_id  uuid references call_logs (id),
  escalated    boolean not null default false,
  created_at   timestamptz not null default now()
);
create index follow_up_open on follow_up_tasks (assignee_id, due_on) where done_at is null;

create table status_history (
  id           bigint generated always as identity primary key,
  student_id   uuid not null references students (id) on delete cascade,
  from_status  student_status,
  to_status    student_status not null,
  changed_at   timestamptz not null default now(),
  changed_by   uuid references profiles (id)
);

create trigger students_guard before update on students
  for each row execute function guard_student_update();

-- ---------------------------------------------------------------- progress
create table student_progress (
  student_id  uuid not null references students (id) on delete cascade,
  item_id     bigint not null references syllabus_items (id) on delete cascade,
  done_on     date not null default today_ist(),
  ticked_by   uuid references profiles (id) default auth.uid(),
  remark      text,
  primary key (student_id, item_id)
);

create table level_history (
  id           bigint generated always as identity primary key,
  student_id   uuid not null references students (id) on delete cascade,
  from_level   smallint references levels (id),
  to_level     smallint not null references levels (id),
  changed_on   date not null default today_ist(),
  approved_by  uuid references profiles (id) default auth.uid()
);

-- ---------------------------------------------------------------- materials + announcements
create table materials (
  id            bigint generated always as identity primary key,
  title         text not null,
  kind          text not null check (kind in ('youtube', 'audio', 'pdf', 'image', 'note')),
  url           text,
  storage_path  text,
  body          text,
  level_id      smallint references levels (id),
  item_id       bigint references syllabus_items (id),
  uploaded_by   uuid references profiles (id) default auth.uid(),
  approved_by   uuid references profiles (id),   -- null = coordinator suggestion awaiting Guru
  created_at    timestamptz not null default now()
);

-- groups replace today's WhatsApp groups (10 for events and follow-ups)
create table groups (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  purpose     text,
  created_by  uuid references profiles (id) default auth.uid(),
  active      boolean not null default true
);
create table group_members (
  group_id    bigint references groups (id) on delete cascade,
  profile_id  uuid references profiles (id) on delete cascade,
  primary key (group_id, profile_id)
);

create table announcements (
  id              bigint generated always as identity primary key,
  title           text not null,
  body            text not null,
  attachments     jsonb not null default '[]',
  audience        text not null default 'all' check (audience in ('all', 'level', 'mentees', 'staff', 'group')),
  audience_level  smallint references levels (id),
  audience_group  bigint references groups (id),
  pinned          boolean not null default false,
  publish_at      timestamptz not null default now(),
  created_by      uuid references profiles (id) default auth.uid(),
  created_at      timestamptz not null default now()
);

create table announcement_reads (
  announcement_id  bigint references announcements (id) on delete cascade,
  profile_id       uuid references profiles (id) on delete cascade default auth.uid(),
  read_at          timestamptz not null default now(),
  primary key (announcement_id, profile_id)
);

-- ---------------------------------------------------------------- audit
create table audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  row_id      text not null,
  action      text not null,
  changed_by  uuid,
  changed_at  timestamptz not null default now(),
  old_row     jsonb,
  new_row     jsonb
);

create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (table_name, row_id, action, changed_by, old_row, new_row)
  values (tg_table_name,
          coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id')),
          tg_op, auth.uid(),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
create trigger audit_students after insert or update or delete on students
  for each row execute function audit_row();
create trigger audit_profiles after update or delete on profiles
  for each row execute function audit_row();
create trigger audit_level_history after insert or update or delete on level_history
  for each row execute function audit_row();
create trigger audit_call_logs after insert or update or delete on call_logs
  for each row execute function audit_row();

-- ---------------------------------------------------------------- sign-up
-- Every new login starts as 'pending'. If the email matches a registered student,
-- it is linked and becomes 'student'. Staff roles are given by the Guru (G2).
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare s_id uuid;
begin
  select id into s_id from students
   where lower(email) = lower(new.email) and profile_id is null
   order by created_at limit 1;
  insert into profiles (id, email, full_name, role)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data ->> 'full_name', ''),
          case when s_id is null then 'pending'::app_role else 'student'::app_role end);
  if s_id is not null then
    update students set profile_id = new.id where id = s_id;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create or replace function guard_profile_update() returns trigger
language plpgsql as $$
begin
  if not is_guru() and (new.role is distinct from old.role
                        or new.is_treasurer is distinct from old.is_treasurer
                        or new.active is distinct from old.active) then
    raise exception 'only the Guru can change role, treasurer or active';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on profiles
  for each row execute function guard_profile_update();

-- ---------------------------------------------------------------- RPCs
-- Toggle a visit: check in if none open, else check out. Used by the door tablet (QR),
-- coordinator tap-to-mark, and later face / own phone.
create or replace function toggle_visit(p_student uuid, p_method visit_method, p_device text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v visits; s students;
begin
  if my_role() not in ('guru', 'coordinator', 'kiosk') then
    raise exception 'not allowed';
  end if;
  select * into s from students where id = p_student;
  if not found then raise exception 'student not found'; end if;

  update visits set check_out = now()
   where student_id = p_student and check_out is null
  returning * into v;

  if found then
    return jsonb_build_object('action', 'out', 'roll_no', s.roll_no, 'full_name', s.full_name,
      'photo_path', s.photo_path, 'at', v.check_out,
      'minutes', round(extract(epoch from v.check_out - v.check_in) / 60));
  end if;

  insert into visits (student_id, centre_id, method, device_id)
  values (p_student, s.home_centre_id, p_method, p_device) returning * into v;

  -- any visit makes the student active again (a Left student who returns is reactivated)
  if s.status <> 'active' then
    perform set_config('app.via_call_log', 'on', true);
    update students set status = 'active', paused_until = null where id = p_student;
  end if;
  update follow_up_tasks set done_at = now() where student_id = p_student and done_at is null;

  return jsonb_build_object('action', 'in', 'roll_no', s.roll_no, 'full_name', s.full_name,
    'photo_path', s.photo_path, 'at', v.check_in);
end $$;

create or replace function scan_qr(p_qr uuid, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s_id uuid;
begin
  select id into s_id from students where qr_token = p_qr;
  if s_id is null then return jsonb_build_object('action', 'unknown'); end if;
  return toggle_visit(s_id, 'qr', p_device);
end $$;

-- Log a follow-up call. The ONLY way a status becomes paused or left.
create or replace function log_call(p_student uuid, p_outcome call_outcome, p_reason text,
                                    p_comment text, p_next_date date default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare c_id uuid; tries int; s students;
begin
  if not is_staff() then raise exception 'not allowed'; end if;
  select * into s from students where id = p_student;

  insert into call_logs (student_id, outcome, reason, comment, next_date)
  values (p_student, p_outcome, p_reason, p_comment, p_next_date) returning id into c_id;

  update follow_up_tasks set done_at = now(), call_log_id = c_id
   where student_id = p_student and done_at is null;

  perform set_config('app.via_call_log', 'on', true);
  if p_outcome = 'paused' then
    update students set status = 'paused', paused_until = p_next_date where id = p_student;
  elsif p_outcome = 'discontinued' then
    update students set status = 'left', paused_until = null where id = p_student;
  elsif p_outcome = 'returning' then
    insert into follow_up_tasks (student_id, assignee_id, kind, due_on)
    values (p_student, s.mentor_id, 'call', p_next_date + 1);
  elsif p_outcome = 'not_reachable' then
    select count(*) into tries from call_logs
     where student_id = p_student and outcome = 'not_reachable'
       and called_at > coalesce((select max(called_at) from call_logs
                                  where student_id = p_student and outcome <> 'not_reachable'),
                                '-infinity');
    insert into follow_up_tasks (student_id, assignee_id, kind, due_on, attempt, escalated)
    values (p_student, s.mentor_id, 'retry', today_ist() + setting_int('retry_days'),
            tries + 1, tries >= setting_int('max_retries'));
  end if;
  return c_id;
end $$;

-- Daily job: move quiet students along and create call tasks for their mentor.
create or replace function refresh_student_statuses() returns void
language plpgsql security definer set search_path = public as $$
declare r record; last_seen date;
begin
  perform set_config('app.via_call_log', 'on', true);
  -- paused students whose date has passed come back into follow-up
  update students set status = 'irregular', paused_until = null
   where status = 'paused' and paused_until < today_ist();

  for r in select * from students where status in ('new', 'active', 'irregular') loop
    select coalesce(max(check_in)::date, r.joined_on) into last_seen from visits where student_id = r.id;
    if r.status in ('new', 'active') and last_seen <= today_ist() - setting_int('irregular_days') then
      update students set status = 'irregular' where id = r.id;
      insert into follow_up_tasks (student_id, assignee_id, kind, due_on)
      values (r.id, r.mentor_id, 'call', today_ist() + setting_int('call_due_days'));
    elsif r.status = 'irregular' and last_seen <= today_ist() - setting_int('inactive_days') then
      update students set status = 'inactive' where id = r.id;
    end if;
  end loop;

  -- no call logged by the inactive mark -> flag to the Guru
  update follow_up_tasks t set escalated = true
    from students s
   where t.student_id = s.id and t.done_at is null and s.status = 'inactive';
end $$;

-- Close visits left open after the centre closes (runs nightly).
create or replace function close_open_visits() returns void
language sql security definer set search_path = public as $$
  update visits v set check_out = greatest(v.check_in + interval '1 minute',
         ((v.check_in at time zone 'Asia/Kolkata')::date + c.closes_at) at time zone 'Asia/Kolkata')
    from centres c
   where v.centre_id = c.id and v.check_out is null
$$;

-- 06:00 IST and 21:00 IST (cron runs in UTC)
select cron.schedule('mridanga-status-refresh', '30 0 * * *', 'select refresh_student_statuses()');
select cron.schedule('mridanga-close-visits', '30 15 * * *', 'select close_open_visits()');

-- ---------------------------------------------------------------- row-level security
alter table settings            enable row level security;
alter table centres             enable row level security;
alter table profiles            enable row level security;
alter table levels              enable row level security;
alter table syllabus_items      enable row level security;
alter table roll_counters       enable row level security;
alter table students            enable row level security;
alter table guardians           enable row level security;
alter table consents            enable row level security;
alter table visits              enable row level security;
alter table call_logs           enable row level security;
alter table follow_up_tasks     enable row level security;
alter table status_history      enable row level security;
alter table student_progress    enable row level security;
alter table level_history       enable row level security;
alter table materials           enable row level security;
alter table announcements       enable row level security;
alter table announcement_reads  enable row level security;
alter table audit_log           enable row level security;

-- reference data: everyone signed in reads, Guru writes
create policy read_all on settings        for select to authenticated using (true);
create policy read_all on centres         for select to authenticated using (true);
create policy read_all on levels          for select to authenticated using (true);
create policy read_all on syllabus_items  for select to authenticated using (true);
create policy guru_write on settings       for all to authenticated using (is_guru()) with check (is_guru());
create policy guru_write on centres        for all to authenticated using (is_guru()) with check (is_guru());
create policy guru_write on levels         for all to authenticated using (is_guru()) with check (is_guru());
create policy guru_write on syllabus_items for all to authenticated using (is_guru()) with check (is_guru());

-- profiles
create policy own_or_staff on profiles for select to authenticated using (id = auth.uid() or is_staff());
create policy own_update on profiles for update to authenticated using (id = auth.uid() or is_guru());

-- students: a student sees their own record; coordinators and Guru see all
create policy own_or_staff on students for select to authenticated
  using (profile_id = auth.uid() or is_staff());
create policy staff_insert on students for insert to authenticated with check (is_staff());
create policy staff_update on students for update to authenticated using (is_staff());
create policy guru_delete on students for delete to authenticated using (is_guru());

create policy staff_all on guardians for all to authenticated using (is_staff()) with check (is_staff());
create policy staff_all on consents  for all to authenticated using (is_staff()) with check (is_staff());

-- visits: own history for students; staff read + correct; inserts go through toggle_visit()
create policy own_or_staff on visits for select to authenticated
  using (is_staff() or student_id in (select id from students where profile_id = auth.uid()));
create policy staff_update on visits for update to authenticated using (is_staff());

-- follow-up is staff-only
create policy staff_read on call_logs       for select to authenticated using (is_staff());
create policy staff_all  on follow_up_tasks for all to authenticated using (is_staff()) with check (is_staff());
create policy staff_read on status_history  for select to authenticated using (is_staff());

-- progress
create policy own_or_staff on student_progress for select to authenticated
  using (is_staff() or student_id in (select id from students where profile_id = auth.uid()));
create policy staff_write on student_progress for all to authenticated using (is_staff()) with check (is_staff());
create policy own_or_staff on level_history for select to authenticated
  using (is_staff() or student_id in (select id from students where profile_id = auth.uid()));
create policy guru_write on level_history for all to authenticated using (is_guru()) with check (is_guru());

-- materials: approved ones up to the student's level; staff see all incl. suggestions
create policy visible on materials for select to authenticated using (
  is_staff() or (approved_by is not null and (level_id is null or level_id <=
    (select level_id from students where profile_id = auth.uid()))));
create policy staff_suggest on materials for insert to authenticated
  with check (is_staff() and (approved_by is null or is_guru()));
create policy guru_manage on materials for update to authenticated using (is_guru());
create policy guru_delete on materials for delete to authenticated using (is_guru());

-- announcements
create policy audience on announcements for select to authenticated using (
  is_staff()
  or (publish_at <= now() and (
        audience = 'all'
     or (audience = 'level' and audience_level =
           (select level_id from students where profile_id = auth.uid()))
     or (audience = 'mentees' and created_by =
           (select mentor_id from students where profile_id = auth.uid()))
     or (audience = 'group' and audience_group in
           (select group_id from group_members where profile_id = auth.uid())))));

alter table groups        enable row level security;
alter table group_members enable row level security;
create policy read_all on groups for select to authenticated using (true);
create policy staff_write on groups for all to authenticated using (is_staff()) with check (is_staff());
create policy own_or_staff on group_members for select to authenticated
  using (profile_id = auth.uid() or is_staff());
create policy staff_write on group_members for all to authenticated using (is_staff()) with check (is_staff());
create policy staff_post on announcements for insert to authenticated with check (is_staff());
create policy own_edit on announcements for update to authenticated using (created_by = auth.uid() or is_guru());
create policy own_reads on announcement_reads for all to authenticated
  using (profile_id = auth.uid() or is_staff()) with check (profile_id = auth.uid());

create policy guru_read on audit_log for select to authenticated using (is_guru());

-- RPC access
revoke execute on function toggle_visit, scan_qr, log_call, refresh_student_statuses, close_open_visits from public;
grant execute on function toggle_visit, scan_qr, log_call to authenticated;
