-- Mridanga Seva — 0023: team tools (Phase 2, slice 8): C18 suggest material, C19 inventory,
-- C20 duty roster. Run once, after 0022 (or after 0020_media.sql while 0021 and 0022 are not on
-- main yet: nothing here depends on them), in the Supabase SQL editor.
-- Why: docs/DECISIONS.md #65. How: docs/DATABASE.md "Team tools (Phase 2)".
--
-- 1. C18: a coordinator suggests a lesson material (a YouTube link, a video-file link, a PDF or a
--    photo) with a short reason. It waits for the Guru, who adds it to the lessons (it becomes an
--    ordinary approved material, G5) or declines it with a reason. Both sides get a notice.
--    Coordinators may now upload PDFs and photos into material-files (own folder, 10 a day).
-- 2. C19: temple instruments and other items. The Guru adds and retires items; any coordinator
--    (or the Guru) lends one to a student or a coordinator and takes it back with a condition
--    check. Every condition seen is kept (inventory_checks); "damaged" tells the Guru.
-- 3. C20: duty shifts per date and centre, inside the centre's open hours, with the people on it.
--    The Guru plans; coordinators see the roster. Everyone on a shift gets a reminder the evening
--    before (18:00 India time) in the inbox and as a push.
-- Notices go through push_outbox, so the inbox has them too (0019).

-- ---------------------------------------------------------------- 0. the lines of the notices
-- The line under a notice's title, in the person's app language. Telugu and Hindi are drafts for
-- the native-speaker review (docs/TRANSLATIONS.md).
create or replace function team_push_line(p_kind text, p_lang text, p_extra text default null)
returns text language sql immutable set search_path = public as $$
  select case p_kind
    when 'suggested' then case p_lang
      when 'te' then p_extra || ' ఒక పాఠ్య సామగ్రిని సూచించారు.'
      when 'hi' then p_extra || ' ने एक पाठ सामग्री सुझाई।'
      else p_extra || ' suggested a lesson material.' end
    when 'approved' then case p_lang
      when 'te' then 'గురువుగారు మీ సూచనను పాఠాల్లో చేర్చారు.'
      when 'hi' then 'गुरुजी ने आपका सुझाव पाठों में जोड़ दिया।'
      else 'The facilitator added your suggestion to the lessons.' end
    when 'declined' then case p_lang
      when 'te' then 'చేర్చలేదు: ' || p_extra
      when 'hi' then 'नहीं जोड़ा गया: ' || p_extra
      else 'Not added: ' || p_extra end
    when 'damaged' then case p_lang
      when 'te' then 'పాడైందని గుర్తించారు: ' || p_extra
      when 'hi' then 'खराब बताया गया: ' || p_extra
      else 'Marked damaged: ' || p_extra end
    when 'duty' then case p_lang
      when 'te' then 'రేపు మీకు డ్యూటీ ఉంది: ' || p_extra
      when 'hi' then 'कल आपकी ड्यूटी है: ' || p_extra
      else 'You are on duty tomorrow: ' || p_extra end
  end
$$;

-- Queues one notice to each given active staff login, in their language; never to the person
-- whose action it is. Returns how many were queued.
create or replace function queue_team_push(p_profiles uuid[], p_kind text, p_title text, p_url text,
                                           p_extra text default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  insert into push_outbox (profile_id, title, body, url)
  select p.id, left(p_title, 120), team_push_line(p_kind, p.language, p_extra), p_url
    from profiles p
   where p.id = any (coalesce(p_profiles, '{}')) and p.active and p.role in ('guru', 'coordinator')
     and p.id is distinct from auth.uid();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- The active Gurus.
create or replace function guru_ids() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}') from profiles where role = 'guru' and active
$$;

-- ---------------------------------------------------------------- 1. C18 suggest material
-- A suggestion is a material with approved_by empty (0001). Waiting = decided_at empty;
-- declined = decided_at set and approved_by still empty.
alter table materials add column suggest_reason text;
alter table materials add column decided_at timestamptz;
alter table materials add column declined_reason text;
create index materials_waiting_idx on materials (created_at) where approved_by is null;

-- Runs after materials_guard (triggers run in name order), which has already set approved_by.
-- Error codes (src/data/suggestions.ts):
--   reason_too_long         the reason for a suggestion is at most 500 characters
--   too_many_suggestions    at most 10 suggestions a day per coordinator
--   suggestion_frozen       the decision is changed only by decide_material_suggestion
create or replace function guard_material_suggestion() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null then return new; end if;
    new.decided_at := null;
    new.declined_reason := null;
    if new.approved_by is not null then
      new.suggest_reason := null;
      return new;
    end if;
    new.suggest_reason := nullif(btrim(new.suggest_reason, E' \t\r\n'), '');
    if char_length(new.suggest_reason) > 500 then
      raise exception 'reason_too_long' using detail = 'A reason is at most 500 characters.';
    end if;
    if (select count(*) from materials m
         where m.uploaded_by = auth.uid() and m.approved_by is null
           and m.created_at > now() - interval '1 day') >= 10 then
      raise exception 'too_many_suggestions' using detail = 'At most 10 suggestions a day.';
    end if;
    return new;
  end if;
  -- The decision function sets a session flag; any other change keeps these as they were.
  if auth.uid() is not null and coalesce(current_setting('mridanga.deciding', true), '') <> 'on' and (
        new.decided_at      is distinct from old.decided_at
     or new.declined_reason is distinct from old.declined_reason
     or new.suggest_reason  is distinct from old.suggest_reason
     or (old.approved_by is null and new.approved_by is not null)) then
    raise exception 'suggestion_frozen' using detail = 'Use Add to lessons or Decline.';
  end if;
  return new;
end $$;

create trigger materials_suggestion_guard before insert or update on materials
  for each row execute function guard_material_suggestion();

-- A new suggestion tells every Guru.
create or replace function notify_material_suggestion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.approved_by is null and auth.uid() is not null then
    perform queue_team_push(guru_ids(), 'suggested', new.title, '/staff/suggestions',
                            (select full_name from profiles where id = new.uploaded_by));
  end if;
  return null;
end $$;

create trigger materials_suggestion_notify after insert on materials
  for each row execute function notify_material_suggestion();

-- A coordinator may take back their own suggestion while it waits, and remove a declined one.
create policy own_suggestion_delete on materials for delete to authenticated
  using (is_staff() and uploaded_by = auth.uid() and approved_by is null);

-- G5 / C18: the Guru adds a waiting suggestion to the lessons (p_approve true) or declines it
-- with a reason (1-500 characters). Edits to the title, level or item are saved first through
-- the material form. Errors: not_allowed, material_not_found, already_decided, reason_required,
-- reason_too_long.
create or replace function decide_material_suggestion(p_material bigint, p_approve boolean, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_m      materials;
  v_reason text := nullif(btrim(coalesce(p_reason, ''), E' \t\r\n'), '');
begin
  if not is_guru() then raise exception 'not_allowed'; end if;
  select * into v_m from materials where id = p_material for update;
  if not found then raise exception 'material_not_found'; end if;
  if v_m.approved_by is not null or v_m.decided_at is not null then raise exception 'already_decided'; end if;
  if not coalesce(p_approve, false) then
    if v_reason is null then raise exception 'reason_required'; end if;
    if char_length(v_reason) > 500 then raise exception 'reason_too_long'; end if;
  end if;
  perform set_config('mridanga.deciding', 'on', true);
  if coalesce(p_approve, false) then
    update materials set approved_by = auth.uid(), decided_at = now(), declined_reason = null where id = p_material;
  else
    update materials set decided_at = now(), declined_reason = v_reason where id = p_material;
  end if;
  perform set_config('mridanga.deciding', '', true);
  perform queue_team_push(array[v_m.uploaded_by], case when coalesce(p_approve, false) then 'approved' else 'declined' end,
                          v_m.title, '/staff/suggestions', v_reason);
end $$;

-- Upload: the Guru, or a coordinator (for a suggestion) at most 10 files a day, into their own folder.
create or replace function material_file_uploadable(p_name text) returns boolean
language sql stable set search_path = public as $$
  select split_part(p_name, '/', 1) = auth.uid()::text and announcement_file_path_ok(p_name)
     and (is_guru()
          or (my_role() = 'coordinator'
              and (select count(*) from storage.objects o
                    where o.bucket_id = 'material-files'
                      and split_part(o.name, '/', 1) = auth.uid()::text
                      and o.created_at > now() - interval '1 day') < 10))
$$;

-- ---------------------------------------------------------------- 2. C19 inventory
-- Kinds from the research table (NOTES.md "Types"): clay khol, fibreglass (Balaram / Tilak),
-- fibreglass body with skin heads, brass, kartals, other.
create table inventory_items (
  id              bigint generated always as identity primary key,
  centre_id       smallint not null default 1 references centres (id),
  kind            text not null check (kind in ('clay_khol', 'fibreglass', 'fibre_skin', 'brass', 'kartals', 'other')),
  label           text not null,
  notes           text,
  condition       text not null default 'good' check (condition in ('good', 'needs_care', 'damaged', 'in_repair')),
  condition_note  text,
  condition_at    timestamptz not null default now(),
  retired_at      timestamptz,
  created_by      uuid references profiles (id) default auth.uid(),
  created_at      timestamptz not null default now()
);
create unique index inventory_items_label_idx on inventory_items (centre_id, lower(label));

-- One lending of one item to a student (with or without a login) or to a staff member.
create table inventory_loans (
  id             bigint generated always as identity primary key,
  item_id        bigint not null references inventory_items (id),
  student_id     uuid references students (id),
  profile_id     uuid references profiles (id),
  issued_at      timestamptz not null default now(),
  issued_by      uuid not null references profiles (id),
  due_on         date,
  issue_note     text,
  condition_out  text not null,
  returned_at    timestamptz,
  returned_by    uuid references profiles (id),
  condition_in   text,
  return_note    text,
  check (num_nonnulls(student_id, profile_id) = 1)
);
create unique index inventory_loans_open_idx on inventory_loans (item_id) where returned_at is null;
create index inventory_loans_student_idx on inventory_loans (student_id) where student_id is not null;
create index inventory_loans_profile_idx on inventory_loans (profile_id) where profile_id is not null;

-- Every condition seen: when added, at a check, when lent, when back.
create table inventory_checks (
  id          bigint generated always as identity primary key,
  item_id     bigint not null references inventory_items (id) on delete cascade,
  kind        text not null check (kind in ('added', 'check', 'issue', 'return')),
  condition   text not null check (condition in ('good', 'needs_care', 'damaged', 'in_repair')),
  note        text,
  loan_id     bigint references inventory_loans (id) on delete set null,
  checked_by  uuid references profiles (id) default auth.uid(),
  checked_at  timestamptz not null default now()
);
create index inventory_checks_item_idx on inventory_checks (item_id, checked_at desc);

-- Error codes (src/data/inventory.ts):
--   label_required, label_too_long   1 to 60 characters
--   notes_too_long                   at most 500 characters
--   condition_frozen                 the condition changes only through a check, a loan or a return
--   item_out                         an item on loan cannot be retired
create or replace function guard_inventory_item() returns trigger
language plpgsql set search_path = public as $$
begin
  new.label := btrim(coalesce(new.label, ''), E' \t\r\n');
  if new.label = '' then raise exception 'label_required'; end if;
  if char_length(new.label) > 60 then raise exception 'label_too_long' using detail = 'A name is at most 60 characters.'; end if;
  new.notes := nullif(btrim(new.notes, E' \t\r\n'), '');
  if char_length(new.notes) > 500 then raise exception 'notes_too_long' using detail = 'Notes are at most 500 characters.'; end if;
  if tg_op = 'INSERT' then
    new.condition_note := nullif(btrim(new.condition_note, E' \t\r\n'), '');
    new.condition_at := now();
    if auth.uid() is not null then new.created_by := auth.uid(); new.created_at := now(); new.retired_at := null; end if;
    return new;
  end if;
  -- pg_trigger_depth() > 1: the update comes from the trigger on inventory_checks.
  if pg_trigger_depth() <= 1 and auth.uid() is not null and (
        new.condition      is distinct from old.condition
     or new.condition_note is distinct from old.condition_note
     or new.condition_at   is distinct from old.condition_at
     or new.created_by     is distinct from old.created_by
     or new.created_at     is distinct from old.created_at) then
    raise exception 'condition_frozen' using detail = 'Record a condition check instead.';
  end if;
  if new.retired_at is not null and old.retired_at is null then
    if exists (select 1 from inventory_loans l where l.item_id = old.id and l.returned_at is null) then
      raise exception 'item_out' using detail = 'Take the item back before retiring it.';
    end if;
    new.retired_at := now();
  end if;
  return new;
end $$;

create trigger inventory_items_guard before insert or update on inventory_items
  for each row execute function guard_inventory_item();
create trigger audit_inventory_items after insert or update or delete on inventory_items
  for each row execute function audit_row();

-- A new item gets its first check ("added"), with the condition the Guru gave.
create or replace function inventory_item_added() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into inventory_checks (item_id, kind, condition, note, checked_by)
  values (new.id, 'added', new.condition, new.condition_note, coalesce(auth.uid(), new.created_by));
  return null;
end $$;

create trigger inventory_items_added after insert on inventory_items
  for each row execute function inventory_item_added();

-- Each check sets the item's condition; "damaged" tells the Guru (unless the Guru recorded it).
create or replace function inventory_check_recorded() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_label text;
begin
  if new.kind = 'added' then return null; end if;
  update inventory_items
     set condition = new.condition, condition_note = new.note, condition_at = new.checked_at
   where id = new.item_id
  returning label into v_label;
  if new.condition = 'damaged' then
    perform queue_team_push(guru_ids(), 'damaged', v_label, '/staff/inventory/' || new.item_id, coalesce(new.note, ''));
  end if;
  return null;
end $$;

create trigger inventory_checks_recorded after insert on inventory_checks
  for each row execute function inventory_check_recorded();

-- Checks the condition and its note: a note is needed for anything but good. Returns the note.
create or replace function inventory_note(p_condition text, p_note text) returns text
language plpgsql immutable set search_path = public as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, ''), E' \t\r\n'), '');
begin
  if p_condition is null or p_condition not in ('good', 'needs_care', 'damaged', 'in_repair') then
    raise exception 'condition_invalid';
  end if;
  if p_condition <> 'good' and v_note is null then
    raise exception 'note_required' using detail = 'Say what is wrong with the item.';
  end if;
  if char_length(v_note) > 500 then raise exception 'note_too_long' using detail = 'A note is at most 500 characters.'; end if;
  return v_note;
end $$;

-- C19: a condition check by any staff member. Errors: not_allowed, item_not_found, item_retired,
-- condition_invalid, note_required, note_too_long.
create or replace function check_inventory_item(p_item bigint, p_condition text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_note text;
  v_item inventory_items;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select * into v_item from inventory_items where id = p_item for update;
  if not found then raise exception 'item_not_found'; end if;
  if v_item.retired_at is not null then raise exception 'item_retired'; end if;
  v_note := inventory_note(p_condition, p_note);
  insert into inventory_checks (item_id, kind, condition, note, checked_by)
  values (p_item, 'check', p_condition, v_note, auth.uid());
end $$;

-- C19: lend an item to a student (p_student) or a staff member (p_profile), with the condition
-- seen now, an optional due date and note. Only a good or needs-care item can go out.
-- Returns the loan id. Errors: not_allowed, item_not_found, item_retired, item_out,
-- item_not_lendable, borrower_required, borrower_not_found, due_past, condition_invalid,
-- note_required, note_too_long.
create or replace function issue_inventory_item(p_item bigint, p_student uuid, p_profile uuid, p_condition text,
                                                p_note text default null, p_due_on date default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_item inventory_items;
  v_note text;
  v_loan bigint;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select * into v_item from inventory_items where id = p_item for update;
  if not found then raise exception 'item_not_found'; end if;
  if v_item.retired_at is not null then raise exception 'item_retired'; end if;
  if exists (select 1 from inventory_loans where item_id = p_item and returned_at is null) then raise exception 'item_out'; end if;
  if num_nonnulls(p_student, p_profile) <> 1 then raise exception 'borrower_required'; end if;
  if p_student is not null and not exists (select 1 from students where id = p_student and status <> 'left') then
    raise exception 'borrower_not_found';
  end if;
  if p_profile is not null and not exists (select 1 from profiles where id = p_profile and active and role in ('guru', 'coordinator')) then
    raise exception 'borrower_not_found';
  end if;
  if p_due_on is not null and p_due_on < today_ist() then raise exception 'due_past'; end if;
  v_note := inventory_note(p_condition, p_note);
  if p_condition not in ('good', 'needs_care') then
    raise exception 'item_not_lendable' using detail = 'A damaged item or one in repair cannot be lent.';
  end if;
  insert into inventory_loans (item_id, student_id, profile_id, issued_by, due_on, issue_note, condition_out)
  values (p_item, p_student, p_profile, auth.uid(), p_due_on, v_note, p_condition)
  returning id into v_loan;
  insert into inventory_checks (item_id, kind, condition, note, loan_id, checked_by)
  values (p_item, 'issue', p_condition, v_note, v_loan, auth.uid());
  return v_loan;
end $$;

-- C19: take an item back with the condition seen now. Errors: not_allowed, loan_not_found,
-- already_returned, condition_invalid, note_required, note_too_long.
create or replace function return_inventory_item(p_loan bigint, p_condition text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_loan inventory_loans;
  v_note text;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select * into v_loan from inventory_loans where id = p_loan for update;
  if not found then raise exception 'loan_not_found'; end if;
  if v_loan.returned_at is not null then raise exception 'already_returned'; end if;
  v_note := inventory_note(p_condition, p_note);
  update inventory_loans
     set returned_at = now(), returned_by = auth.uid(), condition_in = p_condition, return_note = v_note
   where id = p_loan;
  insert into inventory_checks (item_id, kind, condition, note, loan_id, checked_by)
  values (v_loan.item_id, 'return', p_condition, v_note, p_loan, auth.uid());
end $$;

alter table inventory_items  enable row level security;
alter table inventory_loans  enable row level security;
alter table inventory_checks enable row level security;

-- Staff see everything; a borrower sees the items they hold and their own loans.
create policy staff_or_holder on inventory_items for select to authenticated using (
  is_staff() or exists (select 1 from inventory_loans l
                         where l.item_id = inventory_items.id and l.returned_at is null
                           and (l.student_id = my_student_id() or l.profile_id = auth.uid())));
create policy guru_insert on inventory_items for insert to authenticated with check (is_guru());
create policy guru_update on inventory_items for update to authenticated using (is_guru()) with check (is_guru());
-- Deleting is for a typing mistake: an item with loans cannot be deleted (foreign key), only retired.
create policy guru_delete on inventory_items for delete to authenticated using (is_guru());
create policy staff_or_own on inventory_loans for select to authenticated
  using (is_staff() or student_id = my_student_id() or profile_id = auth.uid());
create policy staff_read on inventory_checks for select to authenticated using (is_staff());

-- ---------------------------------------------------------------- 3. C20 duty roster
create table duty_shifts (
  id          bigint generated always as identity primary key,
  centre_id   smallint not null default 1 references centres (id),
  on_date     date not null,
  starts_at   time not null,
  ends_at     time not null,
  duty        text,
  created_by  uuid references profiles (id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create index duty_shifts_date_idx on duty_shifts (on_date, starts_at);

create table duty_assignments (
  shift_id     bigint not null references duty_shifts (id) on delete cascade,
  profile_id   uuid not null references profiles (id) on delete cascade,
  reminded_at  timestamptz,
  primary key (shift_id, profile_id)
);
create index duty_assignments_profile_idx on duty_assignments (profile_id);

-- Error codes (src/data/duty.ts):
--   time_invalid        the end is after the start
--   outside_hours       inside the centre's open hours (centres.opens_at - closes_at)
--   date_past           a new shift is today or later
--   date_too_far        at most a year ahead
--   duty_too_long       what the duty is: at most 80 characters
create or replace function guard_duty_shift() returns trigger
language plpgsql set search_path = public as $$
declare
  v_open  time;
  v_close time;
begin
  new.duty := nullif(btrim(new.duty, E' \t\r\n'), '');
  if char_length(new.duty) > 80 then raise exception 'duty_too_long' using detail = 'At most 80 characters.'; end if;
  if new.ends_at <= new.starts_at then raise exception 'time_invalid' using detail = 'The end is after the start.'; end if;
  select opens_at, closes_at into v_open, v_close from centres where id = new.centre_id;
  if new.starts_at < v_open or new.ends_at > v_close then
    raise exception 'outside_hours' using detail = 'A shift is inside the centre''s open hours.';
  end if;
  if auth.uid() is not null and (tg_op = 'INSERT' or new.on_date is distinct from old.on_date) then
    if new.on_date < today_ist() then raise exception 'date_past'; end if;
    if new.on_date > today_ist() + 366 then raise exception 'date_too_far'; end if;
  end if;
  if tg_op = 'INSERT' and auth.uid() is not null then new.created_by := auth.uid(); new.created_at := now(); end if;
  return new;
end $$;

create trigger duty_shifts_guard before insert or update on duty_shifts
  for each row execute function guard_duty_shift();

-- Only active coordinators (and the Guru) go on the roster. A changed shift is reminded again.
create or replace function guard_duty_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = new.profile_id and active and role in ('guru', 'coordinator')) then
    raise exception 'not_a_coordinator';
  end if;
  return new;
end $$;

create trigger duty_assignments_guard before insert or update on duty_assignments
  for each row execute function guard_duty_assignment();

alter table duty_shifts      enable row level security;
alter table duty_assignments enable row level security;
create policy staff_read on duty_shifts for select to authenticated using (is_staff());
create policy guru_write on duty_shifts for all to authenticated using (is_guru()) with check (is_guru());
create policy staff_read on duty_assignments for select to authenticated using (is_staff());
create policy guru_write on duty_assignments for all to authenticated using (is_guru()) with check (is_guru());

-- G2 / C20: the Guru saves a shift with its people in one go. p_id null = new; p_weeks (1-12)
-- repeats a new shift on the same weekday. People left out of an edited shift come off it; a
-- changed date or time is reminded again. Returns the ids of the shifts saved. Security invoker:
-- the policies above apply too. Errors: not_allowed, shift_not_found, people_required,
-- weeks_invalid, and those of the guards.
create or replace function save_duty_shift(p_id bigint, p_centre smallint, p_date date, p_starts time, p_ends time,
                                           p_duty text, p_people uuid[], p_weeks int default 1) returns bigint[]
language plpgsql security invoker set search_path = public as $$
declare
  v_ids    bigint[] := '{}';
  v_id     bigint;
  v_old    duty_shifts;
  v_people uuid[] := array(select distinct u from unnest(coalesce(p_people, '{}')) u where u is not null);
  i        int;
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if cardinality(v_people) = 0 then raise exception 'people_required'; end if;
  if p_id is null then
    if p_weeks is null or p_weeks not between 1 and 12 then raise exception 'weeks_invalid'; end if;
    for i in 0 .. p_weeks - 1 loop
      insert into duty_shifts (centre_id, on_date, starts_at, ends_at, duty)
      values (p_centre, p_date + 7 * i, p_starts, p_ends, p_duty) returning id into v_id;
      insert into duty_assignments (shift_id, profile_id) select v_id, u from unnest(v_people) u;
      v_ids := v_ids || v_id;
    end loop;
    return v_ids;
  end if;
  select * into v_old from duty_shifts where id = p_id for update;
  if not found then raise exception 'shift_not_found'; end if;
  update duty_shifts set centre_id = p_centre, on_date = p_date, starts_at = p_starts, ends_at = p_ends, duty = p_duty
   where id = p_id;
  delete from duty_assignments where shift_id = p_id and profile_id <> all (v_people);
  insert into duty_assignments (shift_id, profile_id) select p_id, u from unnest(v_people) u
  on conflict do nothing;
  if v_old.on_date <> p_date or v_old.starts_at <> p_starts then
    update duty_assignments set reminded_at = null where shift_id = p_id;
  end if;
  return array[p_id];
end $$;

-- Daily at 18:00 India time (12:30 UTC): a reminder to everyone on tomorrow's shifts, once.
create or replace function duty_daily() returns int
language plpgsql volatile set search_path = public as $$
declare
  v_row record;
  v_n   int := 0;
begin
  for v_row in
    select a.shift_id, a.profile_id, s.starts_at, s.ends_at, s.duty, s.on_date, c.name as centre
      from duty_assignments a
      join duty_shifts s on s.id = a.shift_id
      join centres c on c.id = s.centre_id
     where s.on_date = today_ist() + 1 and a.reminded_at is null
  loop
    if queue_team_push(array[v_row.profile_id], 'duty', v_row.centre || ' · ' || to_char(v_row.on_date, 'DD-MM-YYYY'),
                       '/staff/duty',
                       to_char(v_row.starts_at, 'HH24:MI') || '-' || to_char(v_row.ends_at, 'HH24:MI')
                       || coalesce(', ' || v_row.duty, '')) > 0 then
      v_n := v_n + 1;
    end if;
    update duty_assignments set reminded_at = now() where shift_id = v_row.shift_id and profile_id = v_row.profile_id;
  end loop;
  return v_n;
end $$;

select cron.schedule('mridanga-duty', '30 12 * * *', 'select duty_daily()');

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14: trigger and helper functions are internal.
revoke execute on function team_push_line(text, text, text), queue_team_push(uuid[], text, text, text, text), guru_ids(),
  guard_material_suggestion(), notify_material_suggestion(), guard_inventory_item(), inventory_item_added(),
  inventory_check_recorded(), inventory_note(text, text), guard_duty_shift(), guard_duty_assignment(), duty_daily()
  from public, anon, authenticated;
revoke execute on function decide_material_suggestion(bigint, boolean, text), check_inventory_item(bigint, text, text),
  issue_inventory_item(bigint, uuid, uuid, text, text, date), return_inventory_item(bigint, text, text),
  save_duty_shift(bigint, smallint, date, time, time, text, uuid[], int)
  from public, anon;
grant execute on function decide_material_suggestion(bigint, boolean, text), check_inventory_item(bigint, text, text),
  issue_inventory_item(bigint, uuid, uuid, text, text, date), return_inventory_item(bigint, text, text),
  save_duty_shift(bigint, smallint, date, time, time, text, uuid[], int)
  to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on column materials.suggest_reason is 'C18: why the coordinator suggests this material (up to 500 characters), for the Guru.';
comment on column materials.decided_at is 'C18: when the Guru added the suggestion to the lessons or declined it. Empty with approved_by empty = waiting.';
comment on column materials.declined_reason is 'C18: the Guru''s reason for declining a suggestion; the coordinator sees it.';
comment on table inventory_items is 'C19: temple instruments and other items (kind from the research table), their condition (from the latest check) and retirement (docs/DECISIONS.md #65).';
comment on table inventory_loans is 'C19: an item lent to a student or a staff member, with the condition when it went out and came back. One open loan per item.';
comment on table inventory_checks is 'C19: every condition seen (added, check, issue, return), newest sets the item''s condition. Staff only.';
comment on table duty_shifts is 'C20: a duty shift on one date at one centre, inside its open hours, with an optional duty (desk, teaching). The Guru plans (docs/DECISIONS.md #65).';
comment on table duty_assignments is 'C20: who is on a shift; reminded_at = the evening-before reminder was queued.';
comment on function decide_material_suggestion is 'C18: the Guru adds a waiting suggestion to the lessons or declines it with a reason; the coordinator gets a notice.';
comment on function check_inventory_item is 'C19: a staff member records the condition of an item (a note unless good).';
comment on function issue_inventory_item is 'C19: a staff member lends a good or needs-care item to a student or staff member; returns the loan id.';
comment on function return_inventory_item is 'C19: a staff member takes an item back and records its condition.';
comment on function save_duty_shift is 'C20: the Guru saves a duty shift with its people (new: optionally repeated weekly up to 12 weeks).';
comment on function duty_daily is 'pg_cron 18:00 IST: queues a reminder to everyone on tomorrow''s duty shifts, once.';
comment on function queue_team_push is 'Queues a team-tools notice (suggestion, damaged item, duty) to staff logins in their language.';
