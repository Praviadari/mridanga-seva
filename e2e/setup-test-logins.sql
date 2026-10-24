-- E2E logins on the TEST project (e2e/README.md "One-time set-up", step 3). TEST SQL editor only.
-- Run it AFTER the three users exist (TEST dashboard: Authentication > Users > Add user > Create new
-- user, Auto Confirm User ticked, addresses and passwords from e2e/.env.e2e). Safe to run again.
-- No passwords here. It refuses to run where the three E2E users do not exist (so never on LIVE).
--
--   e2e.coordinator@example.com  role coordinator, name "E2E Coordinator" (desk + attendance flows)
--   e2e.guru@example.com         role guru, name "E2E Guru" (deletes the desk test's records afterwards)
--   e2e.student@example.com      linked to the student record "E2E Student" (adult, made here), so the
--                                login becomes a student the usual way (0002 link_student_email trigger)
do $$
begin
  if (select count(*) from profiles
       where lower(email) in ('e2e.student@example.com', 'e2e.coordinator@example.com', 'e2e.guru@example.com')) <> 3 then
    raise exception 'Make the three E2E users first (TEST dashboard, Auto Confirm). Never run this on LIVE.';
  end if;

  update profiles set full_name = 'E2E Coordinator', role = 'coordinator', active = true
   where lower(email) = 'e2e.coordinator@example.com';
  update profiles set full_name = 'E2E Guru', role = 'guru', active = true
   where lower(email) = 'e2e.guru@example.com';
  update profiles set full_name = 'E2E Student'
   where lower(email) = 'e2e.student@example.com' and coalesce(full_name, '') = '';

  -- An adult record with the student login's address: the trigger links the login and makes it a student.
  if not exists (select 1 from students where lower(email) = 'e2e.student@example.com') then
    insert into students (full_name, dob, email, area, pincode, level_id, status, joined_on)
    values ('E2E Student', '1990-01-01', 'e2e.student@example.com', 'Abids', '500001', 1, 'active', today_ist());
  end if;
end $$;

-- Expect three rows: coordinator, guru, student (the student row with roll number and linked = true).
select p.email, p.role, p.full_name, s.roll_no, s.profile_id is not null as linked
  from profiles p left join students s on s.profile_id = p.id
 where lower(p.email) like 'e2e.%@example.com'
 order by p.email;
