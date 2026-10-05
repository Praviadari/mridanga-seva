-- Mridanga Seva — 0026: the class fund ledger (Phase 2, slice 9). Run once, after 0025 (or after
-- 0024 while 0025 is not on main yet: nothing here depends on it), in the Supabase SQL editor.
-- Why: docs/DECISIONS.md #80. How: docs/DATABASE.md "Class fund (Phase 2)".
--
-- The fund is the Mridanga team's own (NOTES.md 28-09-2026). The app RECORDS money only: no
-- payment, no online money movement, no 80G receipts. Income and expense entries with a category,
-- a date, an amount in whole paise, who paid or was paid, a reference (UPI, cheque, temple
-- receipt number), a note and an optional bill (photo or PDF).
-- 1. Who: the Guru and treasurers (a coordinator with profiles.is_treasurer, switched by the Guru
--    in G2) record entries. Every coordinator reads the ledger. Students and parents see nothing.
-- 2. Maker-checker: an expense over settings.fund_approval_rupees (Rs 2,000) waits and counts in
--    the balance only once approved. The Guru approves; an entry the Guru made is approved by a
--    treasurer. Nobody approves their own entry. A bill is required for an expense over
--    settings.fund_bill_rupees (Rs 500).
-- 3. Entries are never deleted or changed. A mistake is undone by a reversal: a counter-entry of
--    the same kind and category with the amount negative, with a reason; a reversal over the
--    approval limit waits for approval too. Every row change also goes to the audit log.

-- ---------------------------------------------------------------- 1. the treasurer flag
-- Only the Guru switches it (0002's profiles_guard); only a coordinator can be one (error
-- treasurer_coordinator_only). For app users only, like the other profile guards.
create or replace function guard_profile_treasurer() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') or new.is_treasurer is not distinct from old.is_treasurer then
    return new;
  end if;
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if new.is_treasurer and new.role <> 'coordinator' then
    raise exception 'treasurer_coordinator_only' using detail = 'Only a coordinator is made a treasurer (the Guru always keeps the fund).';
  end if;
  return new;
end $$;
create trigger profiles_treasurer_guard before update of is_treasurer on profiles
  for each row execute function guard_profile_treasurer();

-- An active coordinator the Guru made a treasurer.
create or replace function is_treasurer() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.role = 'coordinator' and p.is_treasurer from profiles p where p.id = auth.uid() and p.active), false)
$$;

-- Who records entries: the Guru or a treasurer.
create or replace function is_fund_keeper() returns boolean
language sql stable set search_path = public as $$
  select is_guru() or is_treasurer()
$$;

-- ---------------------------------------------------------------- 2. the two limits (G10)
-- In whole rupees; 0 = every expense waits / every expense needs a bill.
insert into settings (key, value) values ('fund_approval_rupees', '2000'), ('fund_bill_rupees', '500')
on conflict (key) do nothing;

-- guard_setting is 0021's with two more keys; a later migration that replaces it must keep them.
create or replace function guard_setting() returns trigger
language plpgsql set search_path = public as $$
declare
  v_int int;
  v_range int4range;
begin
  if tg_op = 'DELETE' then
    if current_user in ('anon', 'authenticated') then raise exception 'setting_required'; end if;
    return old;
  end if;
  v_range := case new.key
    when 'irregular_days'        then int4range(3, 90, '[]')
    when 'inactive_days'         then int4range(7, 365, '[]')
    when 'call_due_days'         then int4range(1, 14, '[]')
    when 'retry_days'            then int4range(1, 14, '[]')
    when 'max_retries'           then int4range(1, 10, '[]')
    when 'new_joiner_weeks'      then int4range(1, 12, '[]')
    when 'promotion_syllabus_percent' then int4range(0, 100, '[]')
    when 'promotion_min_visits'  then int4range(0, 100, '[]')
    when 'promotion_visit_weeks' then int4range(1, 52, '[]')
    when 'promotion_min_feedback' then int4range(1, 10, '[]')
    when 'fund_approval_rupees'  then int4range(0, 1000000, '[]')
    when 'fund_bill_rupees'      then int4range(0, 1000000, '[]')
  end;
  if v_range is not null then
    begin
      v_int := (new.value #>> '{}')::int;
    exception when others then
      v_int := null;
    end;
    if jsonb_typeof(new.value) <> 'number' or v_int is null or not v_range @> v_int then
      raise exception 'setting_invalid' using detail = format('%s is a whole number in %s.', new.key, v_range);
    end if;
    new.value := to_jsonb(v_int);
  elsif new.key = 'week_starts' then
    if new.value #>> '{}' not in ('monday', 'rolling7') or jsonb_typeof(new.value) <> 'string' then
      raise exception 'setting_invalid' using detail = 'week_starts is "monday" or "rolling7".';
    end if;
  elsif new.key = 'promotion_needs_level_up' then
    if jsonb_typeof(new.value) <> 'boolean' then
      raise exception 'setting_invalid' using detail = format('%s is true or false.', new.key);
    end if;
  elsif new.key = 'call_reasons' then
    if jsonb_typeof(new.value) <> 'array' then
      raise exception 'setting_invalid' using detail = 'call_reasons is a list of codes.';
    end if;
  elsif new.key = 'ig_translator' then
    if jsonb_typeof(new.value) <> 'string' or char_length(btrim(new.value #>> '{}')) > 100 then
      raise exception 'setting_invalid' using detail = 'ig_translator is a name of at most 100 characters.';
    end if;
    new.value := to_jsonb(btrim(new.value #>> '{}'));
  elsif current_user in ('anon', 'authenticated') then
    raise exception 'setting_unknown' using detail = format('%s is not a setting the app knows.', new.key);
  end if;
  return new;
end $$;

-- A limit in paise.
create or replace function fund_limit_paise(p_key text) returns bigint
language sql stable set search_path = public as $$
  select coalesce(setting_int(p_key), 0)::bigint * 100
$$;

-- ---------------------------------------------------------------- 3. categories
-- The built-in ones have a code and are shown in the app's language; the Guru's own have a name only.
create table fund_categories (
  id          smallint generated always as identity primary key,
  direction   text not null check (direction in ('income', 'expense')),
  code        text unique,
  name        text not null,
  sort        smallint not null default 100,
  retired_at  timestamptz,
  created_by  uuid references profiles (id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create unique index fund_categories_name_idx on fund_categories (direction, lower(name));
insert into fund_categories (direction, code, name, sort) values
  ('income',  'donation',    'Donation',                      10),
  ('income',  'sponsorship', 'Sponsorship',                   20),
  ('expense', 'instruments', 'Instrument repair or purchase', 10),
  ('expense', 'prasadam',    'Prasadam',                      20),
  ('expense', 'events',      'Events and festivals',          30),
  ('expense', 'travel',      'Travel',                        40),
  ('expense', 'printing',    'Printing and stationery',       50),
  ('expense', 'other',       'Other',                         90);

-- Error codes (src/data/fund.ts):
--   category_name_required, category_name_too_long   1 to 40 characters
--   category_frozen                                  kind and code stay as they were
create or replace function guard_fund_category() returns trigger
language plpgsql set search_path = public as $$
begin
  new.name := btrim(coalesce(new.name, ''), E' \t\r\n');
  if new.name = '' then raise exception 'category_name_required'; end if;
  if char_length(new.name) > 40 then raise exception 'category_name_too_long' using detail = 'A category name is at most 40 characters.'; end if;
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    new.code := null;
    new.retired_at := null;
    new.created_by := auth.uid();
    new.created_at := now();
    return new;
  end if;
  if new.direction is distinct from old.direction or new.code is distinct from old.code
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'category_frozen' using detail = 'A category keeps its kind; add a new one instead.';
  end if;
  if new.retired_at is not null and old.retired_at is null then new.retired_at := now(); end if;
  return new;
end $$;

create trigger fund_categories_guard before insert or update on fund_categories
  for each row execute function guard_fund_category();
create trigger audit_fund_categories after insert or update or delete on fund_categories
  for each row execute function audit_row();

alter table fund_categories enable row level security;
create policy staff_read on fund_categories for select to authenticated using (is_staff());
create policy guru_insert on fund_categories for insert to authenticated with check (is_guru());
create policy guru_update on fund_categories for update to authenticated using (is_guru()) with check (is_guru());

-- ---------------------------------------------------------------- 4. entries
create table fund_entries (
  id             bigint generated always as identity primary key,
  direction      text not null check (direction in ('income', 'expense')),
  category_id    smallint not null references fund_categories (id),
  on_date        date not null,
  -- Whole paise. Negative only on a reversal. At most Rs 1 crore.
  amount_paise   bigint not null check (amount_paise <> 0 and abs(amount_paise) <= 1000000000),
  party          text,
  reference      text,
  note           text,
  bill_path      text,
  bill_name      text,
  bill_size      bigint,
  -- approved = counts in the balance; waiting = for approval; declined / withdrawn = never counts.
  status         text not null check (status in ('approved', 'waiting', 'declined', 'withdrawn')),
  reverses_id    bigint references fund_entries (id),
  created_by     uuid not null references profiles (id),
  created_at     timestamptz not null default now(),
  decided_by     uuid references profiles (id),
  decided_at     timestamptz,
  decision_note  text,
  check ((amount_paise < 0) = (reverses_id is not null)),
  check ((bill_path is null) = (bill_name is null))
);
create index fund_entries_date_idx on fund_entries (on_date, id);
create index fund_entries_waiting_idx on fund_entries (created_at) where status = 'waiting';
-- One live reversal per entry (a declined or withdrawn one may be tried again).
create unique index fund_entries_reversal_idx on fund_entries (reverses_id)
  where reverses_id is not null and status in ('approved', 'waiting');
create unique index fund_entries_bill_idx on fund_entries (bill_path) where bill_path is not null;

-- Entries are never deleted, and after saving only a decision changes them (through the
-- functions below, which set the session flag mridanga.fund_deciding). Error codes:
--   fund_entry_kept     an entry is never deleted: reverse it
--   fund_entry_frozen   an entry is not changed: reverse it, or approve / decline / withdraw it
create or replace function guard_fund_entry() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'fund_entry_kept' using detail = 'Fund entries are never deleted; record a reversal.';
  end if;
  if coalesce(current_setting('mridanga.fund_deciding', true), '') <> 'on' or old.status <> 'waiting'
     or new.direction is distinct from old.direction or new.category_id is distinct from old.category_id
     or new.on_date is distinct from old.on_date or new.amount_paise is distinct from old.amount_paise
     or new.party is distinct from old.party or new.reference is distinct from old.reference
     or new.note is distinct from old.note or new.bill_path is distinct from old.bill_path
     or new.bill_name is distinct from old.bill_name or new.bill_size is distinct from old.bill_size
     or new.reverses_id is distinct from old.reverses_id or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'fund_entry_frozen' using detail = 'A fund entry is not changed; record a reversal.';
  end if;
  return new;
end $$;

create trigger fund_entries_keep before update or delete on fund_entries
  for each row execute function guard_fund_entry();
create trigger audit_fund_entries after insert or update or delete on fund_entries
  for each row execute function audit_row();

alter table fund_entries enable row level security;
-- Every staff member reads the ledger (Praveen 05-10-2026); nobody writes it but the functions.
create policy staff_read on fund_entries for select to authenticated using (is_staff());

-- ---------------------------------------------------------------- 5. bills
-- 10 MB = as the materials (0013). Photos are made smaller on the phone first.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fund-bills', 'fund-bills', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
   set public = false,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- Read: staff, for a bill an entry lists (row-level security of fund_entries applies), or a
-- keeper's own just-uploaded file.
create or replace function fund_bill_readable(p_name text) returns boolean
language sql stable set search_path = public as $$
  select is_staff() and (exists (select 1 from fund_entries e where e.bill_path = p_name)
                         or split_part(p_name, '/', 1) = auth.uid()::text)
$$;

-- Upload: a keeper, into their own folder, at most 20 files a day.
create or replace function fund_bill_uploadable(p_name text) returns boolean
language sql stable set search_path = public as $$
  select is_fund_keeper() and split_part(p_name, '/', 1) = auth.uid()::text and announcement_file_path_ok(p_name)
     and (select count(*) from storage.objects o
           where o.bucket_id = 'fund-bills' and split_part(o.name, '/', 1) = auth.uid()::text
             and o.created_at > now() - interval '1 day') < 20
$$;

-- Delete: only the uploader's own file that no entry lists (a save that failed). A bill on an
-- entry stays as long as the entry, i.e. for ever.
create or replace function fund_bill_deletable(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select split_part(p_name, '/', 1) = auth.uid()::text
     and not exists (select 1 from fund_entries e where e.bill_path = p_name)
$$;

create policy "fund bills: read" on storage.objects for select to authenticated
  using (bucket_id = 'fund-bills' and public.fund_bill_readable(name));
create policy "fund bills: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'fund-bills' and public.fund_bill_uploadable(name));
create policy "fund bills: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'fund-bills' and public.fund_bill_deletable(name));

-- ---------------------------------------------------------------- 6. notices
-- The line under a notice's title, in the person's app language. Telugu and Hindi are drafts for
-- the native-speaker review (docs/TRANSLATIONS.md).
create or replace function fund_push_line(p_kind text, p_lang text, p_extra text default null)
returns text language sql immutable set search_path = public as $$
  select case p_kind
    when 'waiting' then case p_lang
      when 'te' then p_extra || ' నమోదు చేసిన ఖర్చుకు మీ ఆమోదం కావాలి.'
      when 'hi' then p_extra || ' द्वारा दर्ज खर्च को आपकी स्वीकृति चाहिए।'
      else 'An entry by ' || p_extra || ' needs your approval.' end
    when 'approved' then case p_lang
      when 'te' then 'మీ నమోదు ఆమోదించబడింది.'
      when 'hi' then 'आपकी प्रविष्टि स्वीकृत हो गई।'
      else 'Your entry was approved.' end
    when 'declined' then case p_lang
      when 'te' then 'ఆమోదించలేదు: ' || p_extra
      when 'hi' then 'स्वीकृत नहीं: ' || p_extra
      else 'Not approved: ' || p_extra end
  end
$$;

-- Rs 1,250.50 as "Rs 1250.50" (whole rupees without ".00"), for the title of a notice.
create or replace function fund_amount_text(p_paise bigint) returns text
language sql immutable set search_path = public as $$
  select 'Rs ' || regexp_replace(to_char(abs(p_paise) / 100.0, 'FM999999999990.00'), '\.00$', '')
$$;

-- Queues one notice to each given active staff login, in their language; never to the person
-- whose action it is.
create or replace function queue_fund_push(p_profiles uuid[], p_kind text, p_entry fund_entries, p_extra text default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
  v_title text := fund_amount_text(p_entry.amount_paise) || ' · '
                  || (select name from fund_categories where id = p_entry.category_id);
begin
  insert into push_outbox (profile_id, title, body, url)
  select p.id, left(v_title, 120), fund_push_line(p_kind, p.language, p_extra), '/staff/fund/' || p_entry.id
    from profiles p
   where p.id = any (coalesce(p_profiles, '{}')) and p.active and p.role in ('guru', 'coordinator')
     and p.id is distinct from auth.uid();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Who may decide an entry made by p_maker: the Guru, or a treasurer when the maker is a Guru.
-- Never the maker.
create or replace function fund_approvers(p_maker uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(p.id), '{}') from profiles p
   where p.active and p.id <> p_maker
     and (p.role = 'guru'
          or (p.role = 'coordinator' and p.is_treasurer
              and exists (select 1 from profiles m where m.id = p_maker and m.role = 'guru')))
$$;

-- ---------------------------------------------------------------- 7. recording, deciding, reversing
-- Checks a short text: trimmed, empty = null, at most p_max characters (else p_code).
create or replace function fund_text(p_text text, p_max int, p_code text) returns text
language plpgsql immutable set search_path = public as $$
declare
  v text := nullif(btrim(coalesce(p_text, ''), E' \t\r\n'), '');
begin
  if char_length(v) > p_max then raise exception '%', p_code; end if;
  return v;
end $$;

-- A keeper records an income or an expense. p_bill_path: a file the keeper uploaded into their
-- own folder of fund-bills, or null. Returns the entry's id. An expense over the approval limit
-- waits for approval and its approvers get a notice. Errors: not_allowed, category_invalid,
-- amount_invalid, date_future, date_too_old, party_too_long, reference_too_long, note_too_long,
-- bill_invalid, bill_not_yours, bill_missing, bill_required.
create or replace function record_fund_entry(p_direction text, p_category smallint, p_on_date date, p_amount_paise bigint,
                                             p_party text default null, p_reference text default null, p_note text default null,
                                             p_bill_path text default null, p_bill_name text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_size   bigint;
  v_name   text;
  v_status text := 'approved';
  v_entry  fund_entries;
begin
  if not is_fund_keeper() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if not exists (select 1 from fund_categories c
                  where c.id = p_category and c.direction = p_direction and c.retired_at is null) then
    raise exception 'category_invalid';
  end if;
  if p_amount_paise is null or p_amount_paise < 1 or p_amount_paise > 1000000000 then raise exception 'amount_invalid'; end if;
  if p_on_date is null or p_on_date > today_ist() then raise exception 'date_future'; end if;
  if p_on_date < today_ist() - 366 then raise exception 'date_too_old'; end if;
  if p_bill_path is not null then
    v_name := btrim(coalesce(p_bill_name, ''), E' \t\r\n');
    if not announcement_file_path_ok(p_bill_path) or v_name = '' or char_length(v_name) > 120 then
      raise exception 'bill_invalid';
    end if;
    if split_part(p_bill_path, '/', 1) <> auth.uid()::text then raise exception 'bill_not_yours'; end if;
    select (o.metadata ->> 'size')::bigint into v_size
      from storage.objects o where o.bucket_id = 'fund-bills' and o.name = p_bill_path;
    if not found then raise exception 'bill_missing'; end if;
  elsif p_direction = 'expense' and p_amount_paise > fund_limit_paise('fund_bill_rupees') then
    raise exception 'bill_required' using detail = 'An expense over the bill limit needs a photo or PDF of the bill.';
  end if;
  if p_direction = 'expense' and p_amount_paise > fund_limit_paise('fund_approval_rupees') then
    v_status := 'waiting';
  end if;
  insert into fund_entries (direction, category_id, on_date, amount_paise, party, reference, note,
                            bill_path, bill_name, bill_size, status, created_by)
  values (p_direction, p_category, p_on_date, p_amount_paise,
          fund_text(p_party, 80, 'party_too_long'), fund_text(p_reference, 60, 'reference_too_long'),
          fund_text(p_note, 500, 'note_too_long'), p_bill_path, v_name, v_size, v_status, auth.uid())
  returning * into v_entry;
  if v_status = 'waiting' then
    perform queue_fund_push(fund_approvers(auth.uid()), 'waiting', v_entry,
                            (select full_name from profiles where id = auth.uid()));
  end if;
  return v_entry.id;
end $$;

-- Approve (p_approve true) or decline (with a reason) a waiting entry. The Guru decides; an
-- entry the Guru made is decided by a treasurer (or another Guru); never by its maker. The maker
-- gets a notice. Errors: not_allowed, entry_not_found, already_decided, own_entry,
-- reason_required, note_too_long.
create or replace function decide_fund_entry(p_entry bigint, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_e    fund_entries;
  v_note text;
begin
  if not is_fund_keeper() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into v_e from fund_entries where id = p_entry for update;
  if not found then raise exception 'entry_not_found'; end if;
  if v_e.status <> 'waiting' then raise exception 'already_decided'; end if;
  if v_e.created_by = auth.uid() then
    raise exception 'own_entry' using detail = 'Someone else approves the entries you make.';
  end if;
  if not (auth.uid() = any (fund_approvers(v_e.created_by))) then raise exception 'not_allowed' using errcode = '42501'; end if;
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
end $$;

-- The maker takes back their own waiting entry (a typing mistake), with an optional note.
-- Errors: entry_not_found, already_decided, not_yours, note_too_long.
create or replace function withdraw_fund_entry(p_entry bigint, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_e fund_entries;
begin
  select * into v_e from fund_entries where id = p_entry for update;
  if not found or not is_staff() then raise exception 'entry_not_found'; end if;
  if v_e.created_by <> auth.uid() then raise exception 'not_yours'; end if;
  if v_e.status <> 'waiting' then raise exception 'already_decided'; end if;
  perform set_config('mridanga.fund_deciding', 'on', true);
  update fund_entries set status = 'withdrawn', decided_by = auth.uid(), decided_at = now(),
                          decision_note = fund_text(p_note, 500, 'note_too_long')
   where id = p_entry;
  perform set_config('mridanga.fund_deciding', '', true);
end $$;

-- A keeper undoes an approved entry by a counter-entry dated today (same kind and category,
-- amount negative) with a reason. A reversal over the approval limit waits for approval like an
-- expense. Returns the reversal's id. Errors: not_allowed, entry_not_found, cannot_reverse (not
-- approved, or itself a reversal), already_reversed, reason_required, note_too_long.
create or replace function reverse_fund_entry(p_entry bigint, p_reason text) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_e      fund_entries;
  v_r      fund_entries;
  v_reason text := fund_text(p_reason, 500, 'note_too_long');
begin
  if not is_fund_keeper() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into v_e from fund_entries where id = p_entry for update;
  if not found then raise exception 'entry_not_found'; end if;
  if v_e.status <> 'approved' or v_e.reverses_id is not null then raise exception 'cannot_reverse'; end if;
  if exists (select 1 from fund_entries r where r.reverses_id = p_entry and r.status in ('approved', 'waiting')) then
    raise exception 'already_reversed';
  end if;
  if v_reason is null then raise exception 'reason_required'; end if;
  insert into fund_entries (direction, category_id, on_date, amount_paise, note, status, reverses_id, created_by)
  values (v_e.direction, v_e.category_id, today_ist(), -v_e.amount_paise, v_reason,
          case when v_e.amount_paise > fund_limit_paise('fund_approval_rupees') then 'waiting' else 'approved' end,
          p_entry, auth.uid())
  returning * into v_r;
  if v_r.status = 'waiting' then
    perform queue_fund_push(fund_approvers(auth.uid()), 'waiting', v_r, (select full_name from profiles where id = auth.uid()));
  end if;
  return v_r.id;
end $$;

-- The balance now: approved income minus approved expense (reversals are negative), in paise.
-- Security invoker: row-level security applies, so it is 0 for anyone who may not read the ledger.
create or replace function fund_balance() returns bigint
language sql stable security invoker set search_path = public as $$
  select coalesce(sum(case direction when 'income' then amount_paise else -amount_paise end), 0)::bigint
    from fund_entries where status = 'approved'
$$;

-- ---------------------------------------------------------------- who may do what
-- docs/DECISIONS.md #14 and 0021's style: no default rights for public / anon; the app reads
-- the ledger and writes it only through the functions above.
revoke all on fund_entries from public, anon, authenticated;
grant select on fund_entries to authenticated;
revoke all on fund_categories from public, anon;
revoke delete, truncate, references, trigger on fund_categories from authenticated;

revoke execute on function guard_profile_treasurer(), guard_fund_category(), guard_fund_entry(),
  fund_push_line(text, text, text), fund_amount_text(bigint), queue_fund_push(uuid[], text, fund_entries, text),
  fund_approvers(uuid), fund_text(text, int, text), fund_limit_paise(text)
  from public, anon, authenticated;
revoke execute on function is_treasurer(), is_fund_keeper(), fund_bill_readable(text), fund_bill_uploadable(text),
  fund_bill_deletable(text), record_fund_entry(text, smallint, date, bigint, text, text, text, text, text),
  decide_fund_entry(bigint, boolean, text), withdraw_fund_entry(bigint, text), reverse_fund_entry(bigint, text),
  fund_balance()
  from public, anon;
grant execute on function is_treasurer(), is_fund_keeper(), fund_bill_readable(text), fund_bill_uploadable(text),
  fund_bill_deletable(text), record_fund_entry(text, smallint, date, bigint, text, text, text, text, text),
  decide_fund_entry(bigint, boolean, text), withdraw_fund_entry(bigint, text), reverse_fund_entry(bigint, text),
  fund_balance()
  to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on column profiles.is_treasurer is 'Phase 2 fund (0026): a coordinator who records fund entries and approves the Guru''s own big expenses. Switched by the Guru in G2; coordinators only.';
comment on table fund_categories is 'Fund categories per kind (income / expense). Built-in ones have a code (shown in the app language); the Guru adds and retires own ones (docs/DECISIONS.md #80).';
comment on table fund_entries is 'The class fund ledger (docs/DECISIONS.md #80): income and expense in whole paise; never deleted or changed, undone by a reversal (negative amount, reverses_id). Only approved entries count. Staff read; written only by record/decide/withdraw/reverse_fund_entry.';
comment on column fund_entries.status is 'approved = counts in the balance; waiting = an expense or reversal over the approval limit, for the Guru (or a treasurer when the Guru made it); declined / withdrawn = never counts.';
comment on column fund_entries.bill_path is 'Photo or PDF of the bill: <uploader login id>/<random id>.<jpg|png|webp|pdf> in the private bucket fund-bills. Required for an expense over settings.fund_bill_rupees.';
comment on function record_fund_entry is 'Fund: the Guru or a treasurer records an income or expense; an expense over the approval limit waits; returns the id.';
comment on function decide_fund_entry is 'Fund: approve or decline (with a reason) a waiting entry; never the maker''s own; the maker gets a notice.';
comment on function withdraw_fund_entry is 'Fund: the maker takes back their own waiting entry.';
comment on function reverse_fund_entry is 'Fund: a counter-entry (negative amount, dated today) undoes an approved entry, with a reason; over the limit it waits.';
comment on function fund_balance is 'Fund: approved income minus approved expense, in paise (0 for anyone who may not read the ledger).';
comment on function is_fund_keeper is 'True for the Guru and active treasurer coordinators: they record fund entries.';
