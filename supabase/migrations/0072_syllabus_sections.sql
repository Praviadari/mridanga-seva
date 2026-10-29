-- Mridanga Seva — 0072: sections in the syllabus (docs/DECISIONS.md #773).
-- The team's Intermediate level is taught in sections ("Section 1: Core Practice – Hand Practice, Mantras, Tāla,
-- Mātrās", "Section 2: Temple Seva – Ārati Mantras, Kīrtana Mantras", team mail 29-10-2026). A syllabus item may now
-- name its section; items without one show as before. Run after 0069 (0070/0071 are the face branch's and may be
-- missing). Changes no stored row. Safe to run twice.
--
-- Why a text column and not a table of sections: ticks (student_progress), materials and the Playground point to
-- syllabus_items by id and stay exactly as they are; a section is only a heading over items that sit together in the
-- teaching order (sort), so it needs no id, no order of its own and no rights of its own. The app shows a heading
-- wherever the section changes in teaching order. Renaming a section = changing the text on its items.
--
-- Rights: syllabus_items has no column-by-column grants (0001 table rights, row-level security guru_write / read_all,
-- 0027/0037), so the new column is written and read exactly as title and description are: the Guru writes, every
-- class member reads. The smoke test writes it as the Guru through the app's own insert and update (not as owner).

alter table syllabus_items add column if not exists section text;

comment on column syllabus_items.section is
  'Optional section heading of the item within its level (1-100 characters, spaces collapsed); null = no section. Items of one section sit together in teaching order (#773).';

-- 0037's guard with the section: trimmed, inner spaces and line breaks collapsed to one space (so the same section
-- typed twice groups as one), empty = none, at most 100 characters. Error codes as in 0013, and:
--   section_too_long   a section is at most 100 characters
create or replace function guard_syllabus_item() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.title := btrim(coalesce(new.title, ''), E' \t\r\n');
  if new.title = '' then raise exception 'title_required'; end if;
  if char_length(new.title) > 120 then
    raise exception 'title_too_long' using detail = 'A syllabus item''s title is at most 120 characters.';
  end if;
  new.description := nullif(btrim(new.description, E' \t\r\n'), '');
  if char_length(new.description) > 1000 then
    raise exception 'description_too_long' using detail = 'A description is at most 1000 characters.';
  end if;
  new.section := nullif(btrim(regexp_replace(coalesce(new.section, ''), '\s+', ' ', 'g')), '');
  if char_length(new.section) > 100 then
    raise exception 'section_too_long' using detail = 'A section is at most 100 characters.';
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null and new.retired_at is not null then
      new.retired_at := now();
    end if;
    -- No position given = the end of the level, after the retired items too, so the unique
    -- (level, sort) never clashes.
    if new.sort is null then
      select coalesce(max(sort), 0) + 1 into new.sort from syllabus_items where level_id = new.level_id;
    end if;
    return new;
  end if;

  if new.level_id is distinct from old.level_id then
    if exists (select 1 from student_progress p where p.item_id = old.id) then
      raise exception 'item_has_ticks' using detail = 'A ticked item stays in its level. Retire it and add a new one instead.';
    end if;
    select coalesce(max(sort), 0) + 1 into new.sort from syllabus_items where level_id = new.level_id;
  end if;
  -- Retiring stamps the moment; the app may send any time. A retired item keeps its first time.
  if new.retired_at is not null and old.retired_at is null then
    new.retired_at := now();
  elsif auth.uid() is not null and new.retired_at is not null then
    new.retired_at := old.retired_at;
  end if;
  return new;
end $$;

comment on function guard_syllabus_item is 'Trigger: a syllabus item needs a title (1-120), at most 1000 characters of description and an optional section (1-100, spaces collapsed); new items go to the end of their level; a ticked item stays in its level (docs/DECISIONS.md #44, #773).';
