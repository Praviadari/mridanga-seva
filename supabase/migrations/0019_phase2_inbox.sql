-- Mridanga Seva — 0019: Phase 2 notices in the notifications inbox (A2).
-- Run once, after 0018_practice.sql, in the Supabase SQL editor. On TEST (which ran the Phase 2
-- files as 0012, 0014_promotion and 0016_practice) this is the only file to run for the merge.
-- Why: docs/DECISIONS.md #55. How: docs/DATABASE.md "Notifications inbox".
--
-- Assessment and promotion notices are queued in push_outbox (0016, 0017) for every active login,
-- push or not. Until now only the Android push carried them; web and iPhone users saw nothing.
-- A trigger copies each new outbox row into notifications, so the inbox has the same notices as
-- the push: same person, title, line and screen. The kind follows the screen it opens.
-- The renumbered Phase 2 files stay exactly as TEST ran them; the table descriptions that named
-- their branch numbers are written again here with the numbers on main.

-- ---------------------------------------------------------------- 1. the kind of a notice
-- From the screen a push or notice opens (the screens lib/push.ts accepts).
create or replace function inbox_kind_for_url(p_url text) returns text
language sql immutable set search_path = public as $$
  select case
    when p_url ~ '^/(student|staff)/assessments/' then 'assessment'
    when p_url ~ '^/staff/promotion/' or p_url = '/student/progress' then 'promotion'
    else 'notice'
  end
$$;

-- ---------------------------------------------------------------- 2. outbox → inbox
-- Security definer: the outbox is written by the Phase 2 functions as the owner, and the inbox
-- has no write policy for the app.
create or replace function inbox_on_push_outbox() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (profile_id, kind, title, body, url, visible_at)
  values (new.profile_id, inbox_kind_for_url(new.url), new.title, left(new.body, 300), new.url, new.created_at);
  return null;
end $$;

create trigger push_outbox_inbox after insert on push_outbox
  for each row execute function inbox_on_push_outbox();

revoke execute on function inbox_on_push_outbox() from public, anon, authenticated;
revoke execute on function inbox_kind_for_url(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. the last 30 days
-- Like 0015 did for announcements: notices queued in the last 30 days join the inbox, unread.
insert into notifications (profile_id, kind, title, body, url, visible_at)
select o.profile_id, inbox_kind_for_url(o.url), o.title, left(o.body, 300), o.url, o.created_at
  from push_outbox o
 where o.created_at > now() - interval '30 days';

-- ---------------------------------------------------------------- 4. descriptions with main's numbers
comment on function inbox_on_push_outbox() is 'Copies each push_outbox row (assessment and promotion notices) into notifications, so web and iPhone users have them in the inbox too (0019, docs/DECISIONS.md #55).';
comment on function inbox_kind_for_url(text) is 'The notifications.kind for the screen a notice opens: assessment, promotion or notice.';
comment on table assessments is 'Assessments the Guru sets (G6): instructions, files, rubric, level, level-up flag. Coordinators see them once sent (sent_at); students only those given to them (docs/DECISIONS.md #52).';
comment on table promotion_nominations is 'A coordinator''s nomination of a student for the next level (C22) and the Guru''s decision (G7): open, promoted, not_yet (guidance + renominate_after) or withdrawn. One open per student (docs/DECISIONS.md #53).';
comment on table taals is 'S5/V1: rhythm cycles for the taal player. bols = one entry per beat (- = rest, strokes in a beat joined with .), divisions = beats per vibhag, marks = X sam / 2-9 tali / 0 khali per vibhag. placeholder = seeded stand-in the Guru replaces (docs/DECISIONS.md #54).';
