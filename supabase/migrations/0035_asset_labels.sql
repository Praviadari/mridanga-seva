-- Mridanga Seva — 0035: QR asset labels for every seva asset (C19 extended). Run once, after 0033
-- (0034 is the privacy brief's; nothing here depends on it), in the Supabase SQL editor.
-- Why: docs/DECISIONS.md #156-#161. How: docs/DATABASE.md "Asset labels and stocktake (0035)".
--
-- Additive and safe for the app already on phones: new columns have defaults or are filled by a
-- trigger, the old kinds stay, and the old inventory screens keep working (a new kind shows its
-- key there until the OTA update).
--
-- 1. Kinds: harmonium, other instruments, sound, drum covers and bags, books, furniture, altar and
--    puja items join the drum kinds, kartals and other; plus a free-text category (≤ 40).
-- 2. Every item gets asset_token: 22 random URL-safe characters (122 random bits), unique, frozen
--    for app users like students.qr_token. The QR on the label is the link
--    https://app.mridangaseva.com/i/<token>; it shows nothing without a staff sign-in.
-- 3. Every item gets a human code per centre and prefix, e.g. KHOL-007, set by the database,
--    never reused, frozen for app users (a move to another centre gives a new one there).
-- 4. resolve_asset(token): the scanner and the /i/<token> page find the item, or say unknown /
--    another centre. A coordinator works on their own centre's items; the Guru on every centre's.
-- 5. Stocktake: start a count for a centre, mark items seen (scan or tap), finish: the summary
--    (expected, seen, lent out, missing with codes) is saved with who and when.
-- 6. mark_labels_printed(ids): staff note that labels were printed (labelled_at).

-- ---------------------------------------------------------------- 1. kinds and category
alter table inventory_items drop constraint if exists inventory_items_kind_check;
alter table inventory_items add constraint inventory_items_kind_check check (kind in (
  'clay_khol', 'fibreglass', 'fibre_skin', 'brass', 'kartals', 'harmonium', 'instrument', 'sound',
  'cover_bag', 'book', 'furniture', 'altar', 'other'));

alter table inventory_items add column if not exists category text;

-- ---------------------------------------------------------------- 2. the token
-- 16 bytes of a random UUID (122 random bits: version 4 fixes 6) written as base64url without
-- padding = 22 characters [A-Za-z0-9_-]. gen_random_uuid is core Postgres, so no extension is needed.
create or replace function inventory_new_token() returns text
language sql volatile set search_path = public as $$
  select rtrim(translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/', '-_'), '=')
$$;

-- The default fills existing rows (each its own value), then goes: new rows get theirs from the
-- trigger below, so app roles never need to run the generator.
alter table inventory_items add column if not exists asset_token text default inventory_new_token();
alter table inventory_items alter column asset_token drop default;
alter table inventory_items alter column asset_token set not null;
alter table inventory_items drop constraint if exists inventory_items_asset_token_format;
alter table inventory_items add constraint inventory_items_asset_token_format check (asset_token ~ '^[A-Za-z0-9_-]{22}$');
create unique index if not exists inventory_items_asset_token_idx on inventory_items (asset_token);

-- ---------------------------------------------------------------- 3. the code
-- The prefix of a kind's code. The four mridanga kinds share KHOL, so a drum keeps its number when
-- the Guru corrects its kind.
create or replace function inventory_code_prefix(p_kind text) returns text
language sql immutable set search_path = public as $$
  select case p_kind
    when 'clay_khol' then 'KHOL' when 'fibreglass' then 'KHOL' when 'fibre_skin' then 'KHOL' when 'brass' then 'KHOL'
    when 'kartals' then 'KART' when 'harmonium' then 'HARM' when 'instrument' then 'INST' when 'sound' then 'SND'
    when 'cover_bag' then 'BAG' when 'book' then 'BOOK' when 'furniture' then 'FURN' when 'altar' then 'PUJA'
    else 'OTH' end
$$;

-- The last number used per centre and prefix. Nobody touches it directly (RLS on, no policy).
create table if not exists inventory_code_counters (
  centre_id  smallint not null references centres (id),
  prefix     text not null,
  last       int not null default 0,
  primary key (centre_id, prefix)
);
alter table inventory_code_counters enable row level security;

-- The next code at a centre for a prefix, e.g. KHOL-007 (three digits at least).
create or replace function inventory_next_code(p_centre smallint, p_prefix text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  insert into inventory_code_counters as c (centre_id, prefix, last) values (p_centre, p_prefix, 1)
  on conflict (centre_id, prefix) do update set last = c.last + 1
  returning last into v_n;
  return p_prefix || '-' || lpad(v_n::text, 3, '0');
end $$;

alter table inventory_items add column if not exists code text;
alter table inventory_items add column if not exists labelled_at timestamptz;

-- Backfill: existing items get codes in the order they were added, per centre and prefix.
with numbered as (
  select id, centre_id, inventory_code_prefix(kind) as prefix,
         row_number() over (partition by centre_id, inventory_code_prefix(kind) order by id) as n
    from inventory_items
   where code is null
)
update inventory_items i
   set code = n.prefix || '-' || lpad(n.n::text, 3, '0')
  from numbered n
 where i.id = n.id;

insert into inventory_code_counters (centre_id, prefix, last)
select centre_id, split_part(code, '-', 1), max(split_part(code, '-', 2)::int)
  from inventory_items
 group by centre_id, split_part(code, '-', 1)
on conflict (centre_id, prefix) do update set last = greatest(inventory_code_counters.last, excluded.last);

alter table inventory_items alter column code set not null;
create unique index if not exists inventory_items_code_idx on inventory_items (centre_id, code);

-- Error codes (src/data/inventory.ts):
--   category_too_long   at most 40 characters
--   asset_locked        the token and the code are set by the database
create or replace function guard_inventory_asset() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.category := nullif(btrim(coalesce(new.category, ''), E' \t\r\n'), '');
  if char_length(new.category) > 40 then
    raise exception 'category_too_long' using detail = 'A category is at most 40 characters.';
  end if;
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.asset_token := inventory_new_token();
      new.labelled_at := null;
      new.code := null;
    end if;
    if new.asset_token is null then new.asset_token := inventory_new_token(); end if;
    if new.code is null then new.code := inventory_next_code(new.centre_id, inventory_code_prefix(new.kind)); end if;
    return new;
  end if;
  if auth.uid() is not null and (new.asset_token is distinct from old.asset_token or new.code is distinct from old.code) then
    raise exception 'asset_locked' using detail = 'The QR token and the code are set by the database.';
  end if;
  -- A move to another centre: a new code there (the label shows the centre, so it is printed again).
  if new.centre_id is distinct from old.centre_id and new.code = old.code then
    new.code := inventory_next_code(new.centre_id, inventory_code_prefix(new.kind));
    new.labelled_at := null;
  end if;
  return new;
end $$;

drop trigger if exists inventory_items_asset_guard on inventory_items;
create trigger inventory_items_asset_guard before insert or update on inventory_items
  for each row execute function guard_inventory_asset();

-- ---------------------------------------------------------------- 4. finding an item by its label
-- May the signed-in person work on this centre's items? The Guru: every centre. A coordinator: the
-- centre of their login (no centre on the login: every centre, as before 0035).
create or replace function inventory_centre_ok(p_centre smallint) returns boolean
language sql stable security definer set search_path = public as $$
  select is_guru() or (is_staff() and coalesce((select p.centre_id from profiles p where p.id = auth.uid()), p_centre) = p_centre)
$$;

-- The item a label's token belongs to. Staff only (not_allowed). Returns
--   {result: 'ok', id, code, label, centre}       the item (also when retired: retired = true)
--   {result: 'unknown'}                            no such token (or not a token at all)
--   {result: 'other_centre', centre}               an item of a centre this coordinator does not work at
create or replace function resolve_asset(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v inventory_items;
  v_centre text;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{22}$' then return jsonb_build_object('result', 'unknown'); end if;
  select * into v from inventory_items where asset_token = p_token;
  if not found then return jsonb_build_object('result', 'unknown'); end if;
  select name into v_centre from centres where id = v.centre_id;
  if not inventory_centre_ok(v.centre_id) then
    return jsonb_build_object('result', 'other_centre', 'centre', v_centre);
  end if;
  return jsonb_build_object('result', 'ok', 'id', v.id, 'code', v.code, 'label', v.label, 'centre', v_centre,
                            'retired', v.retired_at is not null);
end $$;

-- Staff note that the labels of these items were printed. Returns how many were stamped (items of
-- the person's centres only). Error: not_allowed.
create or replace function mark_labels_printed(p_items bigint[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  update inventory_items set labelled_at = now()
   where id = any (coalesce(p_items, '{}')) and inventory_centre_ok(centre_id);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------- 5. stocktake
create table if not exists inventory_stocktakes (
  id           bigint generated always as identity primary key,
  centre_id    smallint not null references centres (id),
  started_by   uuid not null references profiles (id),
  started_at   timestamptz not null default now(),
  finished_by  uuid references profiles (id),
  finished_at  timestamptz,
  note         text check (char_length(note) <= 500),
  expected     int,
  seen         int,
  lent         int,
  missing      int,
  -- {missing: [{id, code, label, kind}], lent: [{id, code, label, kind, holder}]}, at the finish.
  summary      jsonb
);
create unique index if not exists inventory_stocktakes_open_idx on inventory_stocktakes (centre_id) where finished_at is null;

create table if not exists inventory_stocktake_items (
  stocktake_id  bigint not null references inventory_stocktakes (id) on delete cascade,
  item_id       bigint not null references inventory_items (id) on delete cascade,
  how           text not null check (how in ('scan', 'tap')),
  seen_by       uuid not null references profiles (id),
  seen_at       timestamptz not null default now(),
  primary key (stocktake_id, item_id)
);
create index if not exists inventory_stocktake_items_item_idx on inventory_stocktake_items (item_id);

drop trigger if exists audit_inventory_stocktakes on inventory_stocktakes;
create trigger audit_inventory_stocktakes after insert or update or delete on inventory_stocktakes
  for each row execute function audit_row();

-- Starts a count at a centre, or joins the one already open there (two people can count together).
-- Returns its id. Errors: not_allowed, centre_not_found.
create or replace function start_stocktake(p_centre smallint) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
begin
  if not is_staff() or not inventory_centre_ok(p_centre) then raise exception 'not_allowed'; end if;
  if not exists (select 1 from centres where id = p_centre) then raise exception 'centre_not_found'; end if;
  select id into v_id from inventory_stocktakes where centre_id = p_centre and finished_at is null;
  if v_id is null then
    insert into inventory_stocktakes (centre_id, started_by) values (p_centre, auth.uid()) returning id into v_id;
  end if;
  return v_id;
end $$;

-- Marks an item seen in an open count, by its label's token (a scan) or its id (a tap in the list).
-- Returns {result, id, code, label}: 'seen' (new), 'already' (seen before), 'unknown',
-- 'other_centre' (not counted), 'retired' (not counted). Errors: not_allowed, stocktake_not_found,
-- stocktake_closed.
create or replace function stocktake_see(p_stocktake bigint, p_token text default null, p_item bigint default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  st inventory_stocktakes;
  v inventory_items;
  v_new int;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select * into st from inventory_stocktakes where id = p_stocktake;
  if not found then raise exception 'stocktake_not_found'; end if;
  if not inventory_centre_ok(st.centre_id) then raise exception 'not_allowed'; end if;
  if st.finished_at is not null then raise exception 'stocktake_closed'; end if;
  if p_token is not null then
    select * into v from inventory_items where asset_token = p_token;
  else
    select * into v from inventory_items where id = p_item;
  end if;
  if v.id is null then return jsonb_build_object('result', 'unknown'); end if;
  if v.centre_id <> st.centre_id then
    return jsonb_build_object('result', 'other_centre', 'code', v.code, 'label', v.label,
                              'centre', (select name from centres where id = v.centre_id));
  end if;
  if v.retired_at is not null then
    return jsonb_build_object('result', 'retired', 'id', v.id, 'code', v.code, 'label', v.label);
  end if;
  insert into inventory_stocktake_items (stocktake_id, item_id, how, seen_by)
  values (st.id, v.id, case when p_token is not null then 'scan' else 'tap' end, auth.uid())
  on conflict (stocktake_id, item_id) do nothing;
  get diagnostics v_new = row_count;
  return jsonb_build_object('result', case when v_new = 1 then 'seen' else 'already' end,
                            'id', v.id, 'code', v.code, 'label', v.label);
end $$;

-- Finishes an open count and saves its summary: expected = the centre's items in use now; seen;
-- lent = not seen but out on loan (listed with who has it); missing = neither (listed). Returns the
-- summary with the counts. Errors: not_allowed, stocktake_not_found, stocktake_closed, note_too_long.
create or replace function finish_stocktake(p_stocktake bigint, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  st inventory_stocktakes;
  v_note text := nullif(btrim(coalesce(p_note, ''), E' \t\r\n'), '');
  v_expected int;
  v_seen int;
  v_lent jsonb;
  v_missing jsonb;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select * into st from inventory_stocktakes where id = p_stocktake for update;
  if not found then raise exception 'stocktake_not_found'; end if;
  if not inventory_centre_ok(st.centre_id) then raise exception 'not_allowed'; end if;
  if st.finished_at is not null then raise exception 'stocktake_closed'; end if;
  if char_length(v_note) > 500 then raise exception 'note_too_long' using detail = 'A note is at most 500 characters.'; end if;

  select count(*) into v_expected from inventory_items where centre_id = st.centre_id and retired_at is null;
  select count(*) into v_seen
    from inventory_stocktake_items s join inventory_items i on i.id = s.item_id
   where s.stocktake_id = st.id and i.retired_at is null;
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'code', i.code, 'label', i.label, 'kind', i.kind,
                                               'holder', coalesce(stu.full_name, pr.full_name)) order by i.code), '[]')
    into v_lent
    from inventory_items i
    join inventory_loans l on l.item_id = i.id and l.returned_at is null
    left join students stu on stu.id = l.student_id
    left join profiles pr on pr.id = l.profile_id
   where i.centre_id = st.centre_id and i.retired_at is null
     and not exists (select 1 from inventory_stocktake_items s where s.stocktake_id = st.id and s.item_id = i.id);
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'code', i.code, 'label', i.label, 'kind', i.kind) order by i.code), '[]')
    into v_missing
    from inventory_items i
   where i.centre_id = st.centre_id and i.retired_at is null
     and not exists (select 1 from inventory_stocktake_items s where s.stocktake_id = st.id and s.item_id = i.id)
     and not exists (select 1 from inventory_loans l where l.item_id = i.id and l.returned_at is null);

  update inventory_stocktakes
     set finished_at = now(), finished_by = auth.uid(), note = v_note,
         expected = v_expected, seen = v_seen, lent = jsonb_array_length(v_lent), missing = jsonb_array_length(v_missing),
         summary = jsonb_build_object('lent', v_lent, 'missing', v_missing)
   where id = st.id;
  return jsonb_build_object('expected', v_expected, 'seen', v_seen, 'lent', v_lent, 'missing', v_missing);
end $$;

alter table inventory_stocktakes enable row level security;
alter table inventory_stocktake_items enable row level security;
-- Staff read every count; only the functions write. The Guru may delete an open count started by
-- mistake (its marks go with it).
drop policy if exists staff_read on inventory_stocktakes;
create policy staff_read on inventory_stocktakes for select to authenticated using (is_staff());
drop policy if exists guru_delete_open on inventory_stocktakes;
create policy guru_delete_open on inventory_stocktakes for delete to authenticated using (is_guru() and finished_at is null);
drop policy if exists staff_read on inventory_stocktake_items;
create policy staff_read on inventory_stocktake_items for select to authenticated using (is_staff());

-- ---------------------------------------------------------------- who may run and touch what
-- docs/DECISIONS.md #14; anon gets nothing (0025).
revoke all on inventory_code_counters from public, anon, authenticated;
revoke all on inventory_stocktakes, inventory_stocktake_items from public, anon;
revoke insert, update, truncate, references, trigger on inventory_stocktakes from authenticated;
revoke insert, update, delete, truncate, references, trigger on inventory_stocktake_items from authenticated;
grant select, delete on inventory_stocktakes to authenticated;
grant select on inventory_stocktake_items to authenticated;
revoke execute on function inventory_new_token(), inventory_code_prefix(text), inventory_next_code(smallint, text), guard_inventory_asset(),
  inventory_centre_ok(smallint)
  from public, anon, authenticated;
revoke execute on function resolve_asset(text), mark_labels_printed(bigint[]),
  start_stocktake(smallint), stocktake_see(bigint, text, bigint), finish_stocktake(bigint, text)
  from public, anon;
grant execute on function resolve_asset(text), mark_labels_printed(bigint[]),
  start_stocktake(smallint), stocktake_see(bigint, text, bigint), finish_stocktake(bigint, text)
  to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on column inventory_items.category is 'Free-text category inside the kind, e.g. Mixer, Bhagavad Gita (≤ 40; 0035).';
comment on column inventory_items.asset_token is 'Unguessable label token (22 base64url characters, 122 random bits); the QR is https://app.mridangaseva.com/i/<token>. Frozen for app users (0035, docs/DECISIONS.md #157).';
comment on column inventory_items.code is 'Human code on the label, per centre and kind prefix, e.g. KHOL-007; set by the database, never reused, frozen for app users (0035).';
comment on column inventory_items.labelled_at is 'When staff last marked this item''s label printed (mark_labels_printed); cleared on a move to another centre (0035).';
comment on table inventory_code_counters is 'Last code number per centre and prefix (0035). No app access.';
comment on table inventory_stocktakes is 'A count of a centre''s items: who started and finished it, when, and the saved summary (0035).';
comment on table inventory_stocktake_items is 'Items seen in a count: by scan or tap, who and when (0035).';
comment on function resolve_asset is 'Scanner and /i/<token>: the item of a label token for staff; unknown, or another centre for a coordinator (0035).';
comment on function mark_labels_printed is 'Staff stamp labelled_at on items whose labels were printed (their centres only) (0035).';
comment on function start_stocktake is 'Starts a count at a centre, or returns the open one there (0035).';
comment on function stocktake_see is 'Marks an item seen in an open count by token or id: seen, already, unknown, other_centre, retired (0035).';
comment on function finish_stocktake is 'Closes a count and saves expected / seen / lent / missing with the lists (0035).';
comment on function inventory_code_prefix is 'Code prefix of an inventory kind: KHOL for the four mridanga kinds, KART, HARM, INST, SND, BAG, BOOK, FURN, PUJA, OTH (0035).';
