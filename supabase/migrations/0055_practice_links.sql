-- Mridanga Seva — 0055: "Learn more" links under Practice (docs/DECISIONS.md #474; docs/DATABASE.md "Learn more
-- links (0055)"). Run after 0054, in the Supabase SQL editor, TEST first. Needs 0001-0054. Safe to run twice.
-- No existing row, table or function changes.
--
-- practice_links: a short list of free material elsewhere that the Guru trusts (for example the kksongs khol course or
-- a free kirtan course), each with a title, an https link and a short note, in the Guru's order. The app shows the
-- ones switched on under Practice, with the site's name, and opens them in the browser; nothing is copied into the
-- app. Lesson materials have no "link" kind and are tied to the syllabus, and an app that does not know a new kind
-- would show it wrongly, so the list has its own table. Class content: no personal data.
-- Everyone signed in with a class role reads the ones switched on; only the Guru reads all and writes.
-- Errors: link_title_invalid (1-80), link_url_invalid (https, a site name with a dot, no spaces, at most 500),
-- link_note_too_long (200).

create table if not exists practice_links (
  id          bigint generated always as identity primary key,
  title       text not null,
  url         text not null,
  note        text,
  sort        int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references profiles (id) on delete set null
);

create or replace function guard_practice_link() returns trigger
language plpgsql set search_path = public as $$
begin
  new.title := btrim(regexp_replace(coalesce(new.title, ''), '\s+', ' ', 'g'));
  if char_length(new.title) not between 1 and 80 then
    raise exception 'link_title_invalid' using detail = 'A title has 1-80 characters.';
  end if;
  new.url := btrim(coalesce(new.url, ''));
  if char_length(new.url) > 500
     or new.url !~* '^https://[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:[0-9]{1,5})?([/?#][^\s]*)?$' then
    raise exception 'link_url_invalid' using detail = 'An https link to a site, at most 500 characters, no spaces.';
  end if;
  new.note := nullif(btrim(regexp_replace(coalesce(new.note, ''), '\s+', ' ', 'g')), '');
  if char_length(coalesce(new.note, '')) > 200 then
    raise exception 'link_note_too_long' using detail = 'The note has at most 200 characters.';
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

drop trigger if exists practice_links_guard on practice_links;
create trigger practice_links_guard before insert or update on practice_links
  for each row execute function guard_practice_link();
drop trigger if exists audit_practice_links on practice_links;
create trigger audit_practice_links after insert or update or delete on practice_links
  for each row execute function audit_row();

alter table practice_links enable row level security;
drop policy if exists readable on practice_links;
create policy readable on practice_links for select to authenticated using (
  (active and (select has_class_role())) or (select is_guru()));
drop policy if exists guru_insert on practice_links;
create policy guru_insert on practice_links for insert to authenticated with check ((select is_guru()));
drop policy if exists guru_update on practice_links;
create policy guru_update on practice_links for update to authenticated
  using ((select is_guru())) with check ((select is_guru()));
drop policy if exists guru_delete on practice_links;
create policy guru_delete on practice_links for delete to authenticated using ((select is_guru()));
revoke all on practice_links from public, anon;
revoke truncate, references, trigger on practice_links from authenticated;

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14.
revoke execute on function guard_practice_link() from public, anon, authenticated;

-- ---------------------------------------------------------------- descriptions
comment on table practice_links is 'S5 "Learn more": free material elsewhere the Guru trusts (title, https link, note, order), opened in the browser. Class roles read the ones switched on; only the Guru reads all and writes (0055, docs/DECISIONS.md #474).';
comment on function guard_practice_link is 'Trigger: checks a practice link: title 1-80, an https link to a site (500, no spaces), note 200 (0055, #474).';
