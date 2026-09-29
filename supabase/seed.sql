-- Mridanga Seva — dummy data for a TEST project. Never run this on the live project.
-- Run after migrations/0001_phase1.sql, in the Supabase SQL editor.
--
-- What it creates: a placeholder syllabus for the three levels, 15 fictional students (some under 18,
-- with guardians and written consent), a few weeks of visits so that every status appears, a follow-up
-- task, three groups, two materials (unapproved, so they wait for the Guru) and a welcome announcement.
--
-- What it cannot create: logins. Staff accounts need Supabase Auth, so after running this:
--   1. sign up in the app as the Guru and as two coordinators (use your own test emails);
--   2. in Table Editor -> profiles, set their role to 'guru' / 'coordinator';
--   3. run the "assign mentors" block at the bottom.
-- All names are fictional and all emails use example.com, a domain reserved for examples.

-- Statuses (including paused and left) are set on INSERT. The guard trigger that limits paused/left
-- to log_call runs only on UPDATE (docs/DECISIONS.md #4), so the seed needs no special flag.

-- ---------------------------------------------------------------- syllabus (placeholder)
-- Order follows the kksongs.org khol course (bols -> rhythms -> applications). The Guru replaces it.
insert into syllabus_items (level_id, sort, title, description) values
  (1, 1, 'Holding the mridanga', 'Sitting, lap and standing positions; strap; hand placement'),
  (1, 2, 'Dayan bols', 'Right-hand strokes: tā, nā, tī, ra, te'),
  (1, 3, 'Baya bols', 'Left-hand strokes: ka, gha, ga, gin'),
  (1, 4, 'Combined bols', 'dhā, jhā, dhin, kat'),
  (1, 5, 'Practice phrases', 'Hand exercises for evenness and speed'),
  (1, 6, 'Elementary kirtan rhythm', '8-beat cycle for a simple Hare Krishna melody'),
  (2, 1, 'Kaherva taal', '8 beats, with variations'),
  (2, 2, 'Prabhupada / Dasapahira taal', '16 beats'),
  (2, 3, 'Bhajani taal', 'For bhajans'),
  (2, 4, 'Dadra and Khemta', '6-beat cycles'),
  (2, 5, 'Lopha taal', 'For slow, meditative kirtans'),
  (3, 1, 'Fast 8- and 6-beat cycles', 'Drut lay'),
  (3, 2, 'Cadences and tihais', 'Endings that land on the first beat'),
  (3, 3, 'Mukhras', 'Introductory phrases, and applying them in kirtan');

-- ---------------------------------------------------------------- students (fictional)
-- joined_on in 2026, so roll numbers run MS-2026-0001 upwards (assigned by trigger).
insert into students (full_name, dob, email, area, pincode, level_id, status, joined_on, paused_until) values
  ('Arjun Rao',        '1998-04-12', 'arjun.rao@example.com',     'Abids',        '500001', 3, 'active',    '2026-01-10', null),
  ('Meera Iyer',       '2001-09-03', 'meera.iyer@example.com',    'Koti',         '500095', 2, 'active',    '2026-02-02', null),
  ('Karthik Reddy',    '1995-12-21', 'karthik.reddy@example.com', 'Himayatnagar', '500029', 2, 'active',    '2026-02-15', null),
  ('Sanjana Varma',    '2011-06-30', null,                        'Nampally',     '500001', 1, 'active',    '2026-03-01', null),
  ('Rohan Gupta',      '2012-01-18', null,                        'Abids',        '500001', 1, 'active',    '2026-06-20', null),
  ('Lakshmi Prasad',   '1990-07-07', 'lakshmi.p@example.com',     'Basheerbagh',  '500063', 1, 'active',    '2026-08-05', null),
  ('Vikram Joshi',     '2003-03-14', 'vikram.j@example.com',      'Koti',         '500095', 1, 'new',       '2026-09-22', null),
  ('Ananya Sharma',    '2013-11-02', null,                        'Abids',        '500001', 1, 'new',       '2026-09-25', null),
  ('Suresh Naidu',     '1987-05-25', 'suresh.n@example.com',      'Narayanguda',  '500029', 2, 'irregular', '2026-04-11', null),
  ('Divya Menon',      '2000-10-09', 'divya.m@example.com',       'Himayatnagar', '500029', 1, 'irregular', '2026-07-01', null),
  ('Harish Kumar',     '1993-08-16', 'harish.k@example.com',      'Abids',        '500001', 1, 'inactive',  '2026-05-19', null),
  ('Pooja Patel',      '2010-02-27', null,                        'Nampally',     '500001', 1, 'paused',    '2026-04-03', '2026-10-15'),
  ('Naveen Chandra',   '1999-01-05', 'naveen.c@example.com',      'Koti',         '500095', 2, 'left',      '2026-03-12', null),
  ('Gayatri Devi',     '1985-09-19', 'gayatri.d@example.com',     'Basheerbagh',  '500063', 3, 'active',    '2026-01-05', null),
  ('Bhaskar Murthy',   '2009-12-11', null,                        'Abids',        '500001', 2, 'active',    '2026-05-02', null);

-- ---------------------------------------------------------------- guardians + written consent for minors
insert into guardians (student_id, full_name, email, relation)
select id, 'Parent of ' || full_name, null, 'Parent'
from students where is_minor(students);

insert into consents (student_id, guardian_id, scope, method, id_type_checked)
select g.student_id, g.id, 'data', 'written', 'Aadhaar sighted'
from guardians g;

-- ---------------------------------------------------------------- visits
-- Active students: recent visits. Irregular: last visit ~20 days ago. Inactive: ~35 days ago.
-- Every visit is closed (has a check-out), so nobody shows as "here now".
insert into visits (student_id, check_in, check_out, method)
select s.id,
       (today_ist() - d.days_ago + time '16:00') at time zone 'Asia/Kolkata',
       (today_ist() - d.days_ago + time '17:30') at time zone 'Asia/Kolkata',
       'manual'
from students s
join (values ('active', 2), ('active', 5), ('active', 9),
             ('irregular', 20), ('irregular', 24),
             ('inactive', 35), ('paused', 40), ('left', 60)) as d(status, days_ago)
  on d.status = s.status::text;

-- ---------------------------------------------------------------- follow-up examples
-- Call logs need a coordinator (call_logs.coordinator_id is required), so they are created later
-- by logging calls in the app, not here.
insert into follow_up_tasks (student_id, kind, due_on)
select id, 'call', today_ist() + 1 from students where status = 'irregular';

-- ---------------------------------------------------------------- progress
-- Beginners who are active have ticked the first two items; intermediates all of level 1.
insert into student_progress (student_id, item_id)
select s.id, i.id from students s join syllabus_items i on i.level_id = 1 and i.sort <= 2
where s.level_id = 1 and s.status = 'active'
on conflict (student_id, item_id) do nothing;

insert into student_progress (student_id, item_id)
select s.id, i.id from students s join syllabus_items i on i.level_id = 1
where s.level_id >= 2
on conflict (student_id, item_id) do nothing;

-- ---------------------------------------------------------------- groups, materials, announcement
insert into groups (name, purpose) values
  ('Sunday Harinam', 'Street kirtan team on Sundays'),
  ('Festival kirtan', 'Performers for festival programmes'),
  ('Beginners follow-up', 'New joiners in their first four weeks');

insert into materials (title, kind, body, level_id, approved_by) values
  ('How to sit with the mridanga', 'note', 'Placeholder lesson note. The Guru replaces it.', 1, null),
  ('Kaherva taal — notation', 'note', 'Placeholder notation. The Guru replaces it.', 2, null);

insert into announcements (title, body, audience) values
  ('Welcome to Mridanga Seva', 'This is a test announcement from the dummy data.', 'all');

-- ---------------------------------------------------------------- assign mentors (run after step 2)
-- Spreads students across the coordinators who have signed up. Run this block on its own later.
-- update students s set mentor_id = c.id
-- from (select id, row_number() over (order by created_at) - 1 as n,
--              count(*) over () as total
--       from profiles where role = 'coordinator') c,
--      (select id, row_number() over (order by roll_no) - 1 as n from students) x
-- where s.id = x.id and x.n % c.total = c.n;
