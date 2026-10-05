# Database

The schema is built by the migrations in [`supabase/migrations/`](../supabase/migrations/), run
in number order:

| File | Does |
|---|---|
| `0001_phase1.sql` | All Phase 1 tables, rules, functions, daily jobs and row-level security |
| `0002_login_linking.sql` | Links logins to students only after email confirmation; lets the dashboard set the first Guru; locks internal functions ([DECISIONS.md #13, #14](DECISIONS.md)) |
| `0003_register_student.sql` | `register_student` saves a student with the parent's consent in one step; no minor can be kept without consent ([DECISIONS.md #16](DECISIONS.md)) |
| `0004_attendance.sql` | `mark_visit` for tap-to-mark attendance and `check_out_all` for closing time ([DECISIONS.md #18](DECISIONS.md)) |
| `0005_students_follow_up.sql` | View `student_overview` (last visit, days since); reasons for a call become codes; `log_call` checks its inputs and answers with error codes ([DECISIONS.md #19, #20](DECISIONS.md)) |
| `0006_syllabus_progress.sql` | A syllabus tick records who really ticked it and cannot be dated in the future; every tick and untick is kept in `audit_log` ([DECISIONS.md #22](DECISIONS.md)) |
| `0007_announcements.sql` | Announcements: checks on every announcement, only students and staff can read them, the author or the Guru can delete, read receipts written only by the reader, and views for "seen by N of M" ([DECISIONS.md #25](DECISIONS.md)) |
| `0008_announcement_follow_ups.sql` | Students see who posted an announcement (`staff_names`); editing marks a published announcement "Edited"; checks on groups, which only staff and members can see; private replies to announcements ([DECISIONS.md #26–#29](DECISIONS.md)) |
| `0009_home_screens.sql` | The numbers on the three home screens: `student_home`, `coordinator_dashboard` and `guru_dashboard`, and one meaning of "this week" (`week_start_ist`) ([DECISIONS.md #31](DECISIONS.md)) |
| `0010_announcement_files.sql` | Photos and PDFs on announcements: the private Storage bucket `announcement-files`, checks on `attachments`, and who may upload, open and delete a file ([DECISIONS.md #32](DECISIONS.md)) |
| `0011_push_notifications.sql` | Push notifications: `announcements.notified_at`, `push_tokens`, `register_push_token`, and the every-minute job that calls the Edge Function `notify-announcements` ([DECISIONS.md #33](DECISIONS.md)) |
| `0013_syllabus_materials.sql` | The syllabus editor and the materials library: retiring items, their order, checks on items and materials, the bucket `material-files`, own name and phone ([DECISIONS.md #44](DECISIONS.md)). Number 0012 is unused on main (it was the Phase 2 branch's, now 0016) |
| `0014_guru_admin.sql` | The facilitator's admin screens: roles, duty hours and mentees (G2), the student import (G3), checked settings and "this week" from Monday or the last 7 days (G10), audit log indexes (G11); a call task follows the mentor ([DECISIONS.md #45-#48](DECISIONS.md)) |
| `0015_inbox_reports_centres.sql` | The notifications inbox filled by the database (A2), the reports function `class_report` (C21, G8), and checks on centres with an address and the attendance area (G9) ([DECISIONS.md #49-#51](DECISIONS.md)) |
| `0016_assessments.sql` | **Phase 2** (0012 on its branch and on TEST). Assessments, releases, assignments and submissions with their rules; the private bucket `assessment-files`; the push queue `push_outbox`; the daily reminder job ([DECISIONS.md #52](DECISIONS.md)). See "Assessments (Phase 2)" |
| `0017_promotion.sql` | **Phase 2** (0014_promotion on its branch and on TEST). Nominations, coordinators' feedback, the Guru's decision; only the Guru changes a level ([DECISIONS.md #53](DECISIONS.md)). See "Promotion approval (Phase 2)" |
| `0018_practice.sql` | **Phase 2** (0016_practice on its branch and on TEST). Taals, the practice log and weekly minutes ([DECISIONS.md #54](DECISIONS.md)). See "Practice tools (Phase 2)" |
| `0019_phase2_inbox.sql` | Every notice queued in `push_outbox` (assessments, promotion) also goes into the notifications inbox (A2) ([DECISIONS.md #55](DECISIONS.md)). See "Notifications inbox" |
| `0023_team_tools.sql` | **Phase 2 slice 8.** C18 material suggestions (coordinators suggest, the Guru adds or declines), C19 inventory (items, loans, condition checks), C20 duty roster (shifts, people, the evening-before reminder) ([DECISIONS.md #65](DECISIONS.md)). See "Team tools (Phase 2)" |
| `0025_security_round.sql` | Security round (audit fixes): NULL-safe role checks in `toggle_visit` / `scan_qr`; `profile_id`, `qr_token` and `created_by` frozen for app users (links only through the linking functions); an insert-only, commit-checked, audited consent register with the signed-form tick; `withdraw_consent`, `erase_student` and the `erasures` tombstones; anon loses every table, sequence and function right ([DECISIONS.md #72-#77](DECISIONS.md)). See "Withdrawal and erasure (0025)" |

The Phase 2 files were renumbered when Phase 2 merged into main (#55). TEST ran them under their
old numbers (0012, 0014_promotion, 0016_practice) and needs only 0019; LIVE runs 0013 to 0019 in
number order (OPERATIONS.md).

Every table and important column also carries a `COMMENT ON` description, so you can read it in
the Supabase dashboard (Table Editor → table → description).

Dummy data for a test project is in [`supabase/seed.sql`](../supabase/seed.sql): a placeholder
syllabus, 15 fictional students covering every status (some minors, with guardians and written
consent), sample visits, groups and an announcement. Never run it on the live project.

## Tables by area

| Area | Tables | Notes |
|---|---|---|
| Settings | `settings` | Day limits for follow-up, list of reasons for leaving, what "this week" means, promotion criteria for Phase 2. The facilitator changes them on G10 (see "Settings") |
| Places | `centres` | One row per class location (Abids today) with address, GPS point, radius and opening hours (G9, see "Centres") |
| People | `profiles` | One row per login: role, name, language, treasurer flag, duty hours (G2), Ishtagoshti editor flag (`ig_editor`, 0021) |
| Students | `students`, `guardians`, `consents`, `roll_counters` | A student record can exist without a login |
| Attendance | `visits` | One row per check-in; `check_out` empty while the student is still there |
| Follow-up | `call_logs`, `follow_up_tasks`, `status_history` | Every call and every status change is kept |
| Learning | `levels`, `syllabus_items`, `student_progress`, `level_history`, `materials` | Three levels; each has an ordered syllabus |
| Communication | `announcements`, `announcement_reads`, `announcement_replies`, `groups`, `group_members`, `push_tokens` | Groups replace the WhatsApp groups. Views `announcement_audience` and `announcement_seen` give "seen by", `announcement_reply_list` the replies with names, `group_summary` the member counts. `notifications` is each person's inbox (A2, see "Notifications inbox"). Photos and PDFs are files in the Storage bucket `announcement-files`, listed in `announcements.attachments` |
| Assessments (Phase 2) | `assessments`, `assessment_releases`, `assessment_assignments`, `assessment_submissions`, `push_outbox` | Views `assessment_tracker` (C13) and `assessment_summary` (counts). Files in the Storage bucket `assessment-files` |
| Promotion (Phase 2) | `promotion_nominations`, `promotion_feedback` | View `promotion_queue` (G7). See "Promotion approval (Phase 2)" |
| Practice (Phase 2) | `taals`, `practice_logs` | Taals the S5 player loops (the Guru edits them); practice minutes from the S5 timer or typed in (S6). See "Practice tools (Phase 2)" |
| Inventory (Phase 2) | `inventory_items`, `inventory_loans`, `inventory_checks` | Temple instruments and other items, who holds each, every condition seen (C19). See "Team tools (Phase 2)" |
| Duty roster (Phase 2) | `duty_shifts`, `duty_assignments` | Shifts per date and centre with the people on each (C20). Suggestions (C18) live in `materials` |
| Ishtagoshti (Phase 2) | `ig_slokas`, `ig_themes`, `ig_theme_slokas`, `ig_daily_pins`, `ig_notes`, `ig_memorised` | Sloka study (I1-I3, I11, I12): the temple's own translations, themes, the sloka of the day, private notes, memorised ticks. Recitations in the Storage bucket `ishtagoshti-audio`. See "Ishtagoshti (Phase 2)" |
| Audit | `audit_log` | Who changed a student, profile, call log, level, syllabus item or tick, material, announcement, setting, centre, sloka or Ishtagoshti theme, or deleted a reply, and when (read on G11) |

## Student status

A student's `status` follows these rules. The daily job moves students along; a logged call is the
**only** way to reach *Paused* or *Left* (enforced by a trigger — see [DECISIONS.md #4](DECISIONS.md)).

```mermaid
stateDiagram-v2
  [*] --> new: registered
  new --> active: first visit
  new --> irregular: no visit for 14 days
  active --> irregular: no visit for 14 days
  irregular --> active: visits again
  irregular --> inactive: no visit for 30 days
  irregular --> paused: call logged "paused"
  irregular --> left: call logged "discontinued"
  inactive --> paused: call logged "paused"
  inactive --> left: call logged "discontinued"
  paused --> irregular: pause date passes
  inactive --> active: visits again
  paused --> active: visits again
  left --> active: visits again (same roll number)
```

The day limits (14, 30, and 3 days to make a call) are rows in `settings`, not fixed in code.

When a student becomes *Irregular*, the daily job creates a `follow_up_tasks` row of kind `call`
for their mentor coordinator. When a call is logged as *Not reachable*, a `retry` task is created;
after `max_retries` failed tries the task is marked `escalated` so the Guru sees it.

## Roll numbers

Assigned by the trigger `students_roll_no` when a student is inserted: `MS-<year joined>-<4 digits>`,
counted per year in `roll_counters`. A roll number can never be changed (trigger
`students_guard`) and is never reused, even if the student leaves. See [DECISIONS.md #3](DECISIONS.md).

## Registering a student

Coordinators and the Guru register students with `register_student` (screens C2 + C3). It saves,
all or nothing:

- the `students` row (name and date of birth required; the roll number is added by trigger);
- for a student **under 18**: a `guardians` row (name and phone required) and a `consents` row
  with `scope = 'data'`, `method = 'written'` and the type of ID the coordinator looked at, plus a
  second `consents` row with `scope = 'photo'` if the parent agreed to a photo.

Separately, the constraint trigger `students_minor_consent` runs when each transaction ends and
refuses a student under 18 who has no current `data` consent, however the row was written
([DECISIONS.md #16](DECISIONS.md)). "Under 18" is decided by `is_minor()` on today's date in India.

Codes stored in text columns (the app translates them):

| Column | Codes |
|---|---|
| `guardians.relation` | `mother`, `father`, `guardian` (another adult responsible for the student) |
| `consents.id_type_checked` | `aadhaar`, `pan`, `driving_licence`, `passport`, `voter_id`, `other` — the ID number is never stored |

Errors from `register_student` are short codes the app turns into messages: `not_allowed`,
`name_required`, `dob_required`, `minor_needs_guardian`, `minor_needs_id_check`, and
`minor_needs_consent` from the trigger. New functions should follow the same pattern: raise a
short `snake_case` code, and put the explanation for people reading the dashboard in `detail`.

**Since 0025** ([DECISIONS.md #74](DECISIONS.md)): `register_student` takes `p_written_consent`, the
coordinator's tick that the parent signed the paper form; for a minor it must be true
(`written_consent_required`) and it is stored as `consents.signed_form` (NULL on consents written
before 0025). For app users a consent is insert-only: `verified_by` and `given_at` are set by the
server, a written one needs `signed_form = true`, nothing changes afterwards (`consent_locked`)
except that the Guru may revoke it once, and only the Guru deletes one. The deferred triggers
`consents_minor_recheck` and `guardians_minor_recheck` refuse, for everyone, a change that leaves a
minor who is still on record (and not withdrawn) without a current data consent
(`minor_needs_consent`) or a guardian (`minor_needs_guardian`). App users cannot add a student or
leave a record without a date of birth (`dob_required`). Consents and guardians are audited.

## Attendance

A visit is one row in `visits`. It is *open* (the student is here now) while `check_out` is
empty; a unique index allows only one open visit per student. There are three ways to change
visits from the app, all in database functions so that the rules sit in one place
([DECISIONS.md #18](DECISIONS.md)):

| Action in the app | Function | What happens |
|---|---|---|
| Coordinator scans a student's QR code (C5), door tablet later | `scan_qr` → `toggle_visit` | Toggles: check in if the student is out, check out if in |
| Coordinator taps *Check in* or *Check out* next to a name (C5, C6) | `mark_visit(student, 'in' / 'out')` | Does what the button says. If the student is already in that state, nothing changes and it returns `already_in` / `already_out` |
| Coordinator taps *Check out all* (C6) | `check_out_all()` | Closes every open visit: today's end now, a visit left open from an earlier day ends at that day's closing time |

Any check-in makes the student *Active* again and closes their open follow-up tasks (inside
`toggle_visit`, which `mark_visit` calls). `mark_visit` locks the student's row while it works, so
two phones marking the same student at once are handled one after the other. At 21:00 IST the
nightly job `close_open_visits` closes anything still open, at the centre's closing time.

The QR code on a student's phone holds the text `MS1:` followed by their `qr_token` in capitals
([DECISIONS.md #17](DECISIONS.md)). The app removes the prefix and sends the token to `scan_qr`.

Errors: `toggle_visit` and `scan_qr` (0001) raise `not allowed` and `student not found`, with
spaces; `mark_visit` and `check_out_all` raise `not_allowed`, `bad_action` and
`student_not_found`. The app (`app/src/data/attendance.ts`) understands both spellings.

### Location check at check-in (0024)

When a coordinator or the Guru checks a student **in** (scan, or a tap on C5 or C8), the app sends
the phone's report as `p_location` to `scan_qr` / `mark_visit` (and on to `toggle_visit`):
`{status: 'fix', lat, lng, accuracy}` or `{status: 'refused' | 'no_fix' | 'no_location'}`.
`visit_location_result` (internal) compares it with the area of the visit's centre (`centres.lat`,
`lng`, `radius_m`, set on G9) and the visit stores only the result ([DECISIONS.md #70](DECISIONS.md)):

| Column | Meaning |
|---|---|
| `location_check` | `inside` (within `radius_m` + the fix's accuracy, at most 100 m of it), `outside`, `refused` (permission refused), `no_fix` (no position within 8 s, location off), `no_location` (a browser without location), `no_area` (the centre has no point: nothing to compare); empty = not checked (visits before 0024, or an app without the check) |
| `location_distance_m` | Whole metres from the centre's point, for `inside` / `outside` only |

**Flagged** = `outside`, `refused`, `no_fix`, `no_location`. The visit is saved all the same;
staff see the flag on C5's result card, C6, S9 (staff view) and the reports (`class_report` adds
`visits_flagged`, `flagged_by_reason` and `flagged` per student row). The position itself is never
stored. A check-out stores nothing. The trigger `visits_location_guard` refuses any change to the two
columns from the app (error `location_locked`); staff may still correct the times. A malformed
report raises `bad_location`. Students can read their own visits' result through row-level
security, but their screen does not show it.

## Student overview

`student_overview` is a view: one row per student with the list columns of `students` (roll
number, name, level, status, pause date, mentor, joined) plus:

| Column | Meaning |
|---|---|
| `last_visit_at` | Check-in time of the latest visit; empty if the student has never come |
| `days_since_visit` | Whole days (India time) since that visit; with none, since joining or since the record was made, whichever is later (0014: an imported record with an old joining date is not Irregular at once); the same count the daily job uses for Irregular and Inactive |
| `here_now` | True while the student has an open visit |

The student list (C7), the profile (C8) and the follow-up queue (C10) read it. It exists because
Supabase does not let the app ask for `max(check_in)` directly (aggregate functions are off by
default in its API), and fetching every visit to the phone would grow without end.

It is created `with (security_invoker = true)`: it reads `students` and `visits` as the person
asking, so their row-level security applies — staff see every student, a student sees only their
own row, and a signed-out visitor sees nothing. Without that option a view runs as its owner and
would show every student to anyone signed in ([DECISIONS.md #20](DECISIONS.md)). Only `select` is
granted, to signed-in people.

## Follow-up calls

A coordinator records a call with `log_call(student, outcome, reason, comment, next_date)`
(screen C11). It always saves a `call_logs` row, closes the student's open follow-up tasks, and
then acts on the outcome:

| Outcome | Reason | `next_date` | What happens |
|---|---|---|---|
| `returning` (coming back) | required | required: the day they said they would come | A new `call` task for the day after that date. Their next visit closes it |
| `paused` (taking a break) | required | required: pause-until date | Status *Paused* until that date; the daily job brings them back into follow-up after it |
| `not_reachable` | none | not used | A `retry` task in `retry_days`; after `max_retries` failed tries in a row it is `escalated` to the Guru |
| `discontinued` (stopped coming) | required | not used | Status *Left*. Roll number and history are kept; a visit makes them Active again |

Reasons are codes from `settings.call_reasons`: `studies`, `work_timing`, `moved`, `health`,
`family`, `lost_interest`, `joined_elsewhere`, `travel`, `other`. The app shows them translated
(`callReasons.<code>`); a code the Guru adds later without a translation is shown as written
([DECISIONS.md #19](DECISIONS.md)). `log_call` refuses a reason that is not in the list.

Errors from `log_call` (short codes the app turns into messages): `not_allowed`,
`student_not_found`, `outcome_required`, `comment_required`, `reason_required`, `reason_unknown`,
`next_date_required`, `next_date_past` (the date is before today). A `next_date` given with an
outcome that does not use one is dropped, so reports never show a stray date.

## Syllabus progress

Each level has an ordered list of `syllabus_items` (the Guru writes it, G4). When a student shows
an item in class, a coordinator ticks it for them on screen C9: one row in `student_progress`
(student, item, `done_on`, `ticked_by`, optional `remark`). Any coordinator or the Guru may tick
for any student; students can read their own ticks and change nothing.

The app writes the table directly: insert to tick, update to change the remark, delete to untick.
The trigger `student_progress_guard` ([DECISIONS.md #22](DECISIONS.md)) makes these rules hold
however the row is written:

| Rule | Error code |
|---|---|
| `ticked_by` is the signed-in person, whatever the app sent (the dashboard and `seed.sql`, with no login, keep what they give) | — |
| `done_on` is today by default and never after today (India time) | `done_on_future` |
| After the tick only `remark` may change; student, item, date and `ticked_by` are fixed | `progress_frozen` |
| The remark is trimmed; empty becomes none; at most 500 characters | `remark_too_long` |

Every insert, update and delete is copied to `audit_log` by `audit_student_progress`, with
`row_id` = `<student id>/<item id>`, because the table has no `id` column of its own. So an untick
still shows who had ticked the item, when, and who removed it.

Items of an earlier level can still be ticked after a promotion; the screen shows every level.

## Syllabus editor

Migration 0013 ([DECISIONS.md #44](DECISIONS.md)) lets the Guru keep the syllabus on screen G4
without ever losing a tick. Levels stay fixed (Beginner, Intermediate, Advanced).

| Rule | Error code |
|---|---|
| Title trimmed, 1 to 120 characters; description at most 1000, empty becomes none | `title_required`, `title_too_long`, `description_too_long` |
| A new item without `sort` goes to the end of its level (after retired ones) | — |
| `retired_at` set = retired: no longer taught, cannot be ticked, not counted in `student_home()`; the ticks stay | `item_retired` (on a tick) |
| An item with ticks cannot be deleted (not even from the dashboard, where the cascade would take the ticks) or moved to another level | `item_has_ticks` |
| An item that materials point to cannot be deleted | `item_has_materials` |

`move_syllabus_item(item, up)` (Guru) swaps an item with the next item in use above or below it;
false when it is already first or last. `syllabus_item_counts()` gives, per item, the ticks the
caller may see and the materials, so the editor knows what may be deleted without reading every
tick (the API returns at most 1000 rows). Every change to `syllabus_items` goes to `audit_log`.

## Materials

`materials` (0001, used since 0013): a YouTube link (`kind` youtube, `url`), a PDF or a photo
(`kind` pdf / image, `storage_path`, `file_name`, `file_size`), or a note from seed.sql; for a
level (`level_id`, null = every level) and optionally one syllabus item (`item_id`; the level is
then taken from the item), with an optional note in `body`. The trigger `materials_guard` checks:

| Rule | Error code |
|---|---|
| Title 1 to 120 characters; note at most 1000 | `title_required`, `title_too_long`, `note_too_long` |
| A YouTube material has one video's link (watch, shorts, live, embed, youtu.be; `youtube_link_ok`) | `youtube_link_invalid` |
| A PDF or photo has a proper path, a name and a size up to 10 MB; a new one is the signed-in person's own upload and is in Storage (the size is taken from Storage) | `material_file_invalid`, `material_file_not_yours`, `material_file_missing` |
| Kind, file, uploader and time do not change after saving | `material_frozen` |
| Audio is not offered yet | `material_kind_not_offered` |
| The signed-in person is recorded as uploader; the Guru's materials are approved at once | — |

Files are in the private bucket **material-files** (10 MB, JPEG, PNG, WebP, PDF), path
`<uploader login id>/<random id>.<ext>` as for announcements. Storage rules: open = the file is on
a material the caller may read, or staff's own upload, or the Guru; upload = the Guru into their
own folder; delete = the uploader or the Guru. The app deletes the file before the row. Every
change to `materials` goes to `audit_log`.

## Own name and phone

A person may change their own `profiles.full_name` and `phone` (A3, policy `own_update`). The
trigger `profiles_details_guard` trims them when an app user changes them: name 1 to 80
characters (`name_required`, `name_too_long`), phone 7 to 20 digits or spaces with an optional
leading + (`phone_invalid`). The name on a student's roll (`students.full_name`) stays the
coordinators' record.

## Announcements

A coordinator or the Guru posts an announcement on screen C15: a title, the message, who it is
for, whether it is pinned, and optionally a later publish time. Students read theirs on S10. The
app writes the `announcements` table directly: insert to post, update to edit, pin or unpin,
delete.

Who it is for (`audience`):

| Audience | Goes to | Needs |
|---|---|---|
| `all` | Every student with the app | — |
| `level` | Students whose record is at that level | `audience_level` |
| `mentees` | Students whose mentor is the author | — |
| `staff` | The Guru and the coordinators only | — |
| `group` | The members of that group | `audience_group` |

Coordinators and the Guru see every announcement, whatever its audience, including scheduled
ones. A student sees an announcement only once `publish_at` has passed, and only if it is
addressed to them. A login that is still `pending`, or the door tablet, sees none
([DECISIONS.md #25](DECISIONS.md)).

The trigger `announcements_guard` makes these rules hold however the row is written:

| Rule | Error code |
|---|---|
| Title and message are trimmed; neither may be empty | `title_required`, `body_required` |
| Title at most 120 characters, message at most 4000 | `title_too_long`, `body_too_long` |
| `level` needs a level and `group` a group; for other audiences both are cleared | `level_required`, `group_required` |
| No publish time means now | — |
| The author (`created_by`) is the signed-in person, whatever the app sent, and never changes; the dashboard and `seed.sql` keep what they give | `announcement_frozen` |
| Once published, the publish time cannot be changed from the app; a scheduled one moved to a time already past is published now, not backdated (0008) | `already_published` |
| `edited_at` is set to now when the title, message, audience, level, group or files of an already published announcement change; the app cannot set it. Editing a scheduled one, and pinning, do not count (0008, files from 0010) | — |
| `notified_at` (when the push notification went out) is set only by the Edge Function; the app can neither set nor change it (0011) | — |

Only the author, while still a coordinator or the Guru, or the Guru can edit, pin, unpin or
delete an announcement; row-level security turns anyone else's attempt into "nothing changed".
Every edit and delete is copied to `audit_log`. An edit keeps the read receipts: a person who
read the first version is still counted as having seen it, and sees "Edited" with the time
([DECISIONS.md #27](DECISIONS.md)).

**Who posted it.** Students may read only their own `profiles` row, so the app gets the author's
name from `staff_names()`: the id and name of every Guru and coordinator, active or not, and
nothing else. It answers students and staff; a `pending` login or the door tablet gets nothing
([DECISIONS.md #26](DECISIONS.md)).

**Read receipts.** When a person opens an announcement, the app adds one `announcement_reads`
row. The app may send only `announcement_id`: the database fills in who (the login) and when
(now). A person can add a receipt only for an announcement they can see, only once, and cannot
change or remove it. Receipts disappear only with their announcement.

**Seen by N of M.** Two views, both `with (security_invoker = true)` like `student_overview`:

| View | One row per | Columns |
|---|---|---|
| `announcement_audience` | announcement and person it is addressed to who can open it in the app (active login; students for `all`, `level`, `mentees`; staff for `staff`; members for `group`; never the author) | `full_name` (from the student record for students), `roll_no`, `role`, `read_at` (empty = not seen yet) |
| `announcement_seen` | announcement | `addressed` (M), `seen` (N), `no_login`: students it is meant for who have no app login and are not *Left*, to be told in class; `replies`: how many replies the person asking may read (0008) |

The staff screen reads the counts and the not-seen list from these views, so the number is the
same on every phone and the phone never downloads everyone's receipts. A student reading the
views sees only their own row.

**Photos and PDFs** (0010, [DECISIONS.md #32](DECISIONS.md)). The files are in the private Storage
bucket `announcement-files` (at most 5 MB a file; JPEG, PNG, WebP and PDF only; Storage refuses
anything else). A file's path is `<uploader's login id>/<random id>.<jpg|png|webp|pdf>`.
`announcements.attachments` lists an announcement's files in order, each as
`{"path", "name", "kind", "size"}` (`kind` is `image` or `pdf`, `size` in bytes). The app uploads
the files when the announcement is saved, then saves the announcement with the list.

The trigger `announcements_attachments_guard` checks the list however it is written:

| Rule | Error code |
|---|---|
| A list of at most 3 files | `too_many_attachments` |
| Each entry has a proper path, a name of 1 to 120 characters (trimmed), `kind` matching the path's ending, a size up to 5 MB, and no file twice; other keys are dropped | `attachments_invalid` |
| A file an app user adds must be in their own folder… | `attachment_not_yours` |
| …and really in Storage; its size is then taken from Storage, not from the app | `attachment_missing` |
| Files already on the announcement stay as they are (the Guru can edit a coordinator's announcement without owning its files) | — |

Storage keeps one row per file in `storage.objects`; its row-level security decides:

| Action | Allowed for | Rule function |
|---|---|---|
| Open, or make a signed link | Anyone who may read an announcement that lists the file (the `audience` rule above); staff for files in their own folder; the Guru | `announcement_file_readable` |
| Upload | Coordinators and the Guru, only into their own folder, only a proper file name | `announcement_file_uploadable` |
| Delete | Coordinators and the Guru: their own uploads, any file for the Guru, and files on their own announcements | `announcement_file_deletable` |
| Replace or move | Nobody (no update policy) | — |

**Deleting a row in SQL does not delete the file** in Storage; it only orphans it. So the app
removes files through the Storage API: when an announcement is deleted it removes the files
first (while the announcement still lists them), and when an edit takes a file off it removes
the file once the change is saved. A file whose removal failed stays unused; OPERATIONS.md
"Files no announcement uses" shows how to find and remove such files.

**Push notifications** (0011, [DECISIONS.md #33](DECISIONS.md)). A phone that may receive
notifications has a row in `push_tokens` (its Expo push token, the login, `android` or `ios`).
The Android app saves it after sign-in with `register_push_token` and deletes it at sign-out; a
person sees and deletes only their own. A token belongs to the login last signed in on that
phone, and a person has at most 5 phones.

Every minute the job `mridanga-push` runs `send_due_push()`. When an announcement is published
and `notified_at` is still empty, it calls the Edge Function `notify-announcements`
(`supabase/functions/`) through pg_net, with the secret `mridanga_push_secret` from the Vault
in a header. The Edge Function, with the service role, calls `claim_due_push()`: it sets
`notified_at` on every waiting announcement and returns one row per phone to notify (the people
in `announcement_audience`, never the author). An announcement published more than a day before
is marked but not sent. The function sends the notifications through Expo's push service,
deletes tokens Expo no longer knows, and, if not one request reached Expo, calls
`release_push_claim()` so the next minute tries again. Until push is set up (pg_net, the Vault
secrets, the deployed function), `send_due_push()` returns `not_set_up` and nothing happens.
Setting `notified_at` is not copied to the audit log. Scheduled announcements are sent at their
publish time; an edit is not sent again.

**Private replies** (0008, [DECISIONS.md #29](DECISIONS.md)). Under an announcement a person can
send one or more replies to its author: one `announcement_replies` row each. The app may send
only `announcement_id` and `body`; the database fills in who (`profile_id`) and when
(`created_at`).

| Rule | Error code |
|---|---|
| The reply is trimmed; it may not be empty and is at most 1000 characters | `reply_required`, `reply_too_long` |
| Only for an announcement the writer can see (a `pending` login, or a student it is not addressed to, cannot reply) | row-level security (42501) |
| Read only by the writer, the author of the announcement while still staff, and the Guru. Students never see each other's replies | — |
| Nobody can change a reply; only the Guru can delete one (moderation), and the audit log keeps a copy. Replies go with their announcement | — |

The view `announcement_reply_list` (security invoker) gives the replies with the writer's name
(from the student record for students) and roll number. Replies are one-way for Phase 1: the
author answers in person or by phone.

## Groups

A group is a set of people who get the announcements sent to it (audience `group`); groups
replace the class WhatsApp groups. Coordinators and the Guru manage them on the groups screen:
`groups` (name, purpose, active) and `group_members` (group, profile). Members are logins:
students who use the app, coordinators and the Guru. The app writes both tables directly.

The trigger `groups_guard` (0008, [DECISIONS.md #28](DECISIONS.md)):

| Rule | Error code |
|---|---|
| Name trimmed, required, at most 60 characters | `group_name_required`, `group_name_too_long` |
| Purpose trimmed, empty becomes none, at most 200 characters | `group_purpose_too_long` |
| Names are unique whatever the capitals (index `groups_name_lower_key`) | 23505 |
| `created_by` is the signed-in person and never changes | — |

Only staff and the group's own members can see a group; a student needs the name of their own
groups for "Group: Sunday Harinam". A group is **switched off** (`active = false`) instead of
deleted: it is no longer offered when posting, old announcements keep it, and its members still
see them. The app offers no delete; the database refuses to delete a group an announcement was
sent to. The view `group_summary` (security invoker) gives each group with its number of members.

## Home screens

Each home screen gets all its numbers from one function (0009,
[DECISIONS.md #31](DECISIONS.md)), which returns one JSON object. The functions only read. They
are **security invoker**: they count with the rights of the person asking, so row-level security
still applies, as for the views. The app reads them in `app/src/data/home.ts`.

| Function | Screen | Who | Gives |
|---|---|---|---|
| `student_home()` | S1 student home | Anyone signed in; a login without a student record gets `null` | Own name, roll number, level, status, joined; `last_visit_at`, `days_since_visit`, `here_now` (as in `student_overview`); `visits_this_week`; `syllabus_done` and `syllabus_total` for the current level |
| `coordinator_dashboard()` | C1 coordinator dashboard | Coordinators and the Guru; others get `not_allowed` | `here_now` (open visits, as C6), `visits_today` (check-ins since midnight, as C5), `my_calls_due`, `new_joiner_weeks`, `new_joiner_count`, `new_joiners` (newest 50: id, name, roll number, level, joined, visits) |
| `guru_dashboard()` | G1 Guru dashboard | The Guru; others get `not_allowed` | `week_start`, `came_this_week` (students, each once), `in_class`, `new_joiner_weeks`, `new_joiners`, `by_level` (every level, students in class), `by_status` (every status, all students), `follow_ups` (per person the task is assigned to: `overdue`, `escalated`) |

Words these functions use, the same on every screen:

| Word | Meaning |
|---|---|
| This week | Monday to today, India time, or the last 7 days when `settings.week_starts` = `rolling7` (0014, G10): `week_start_ist()` |
| New joiner | `joined_on` within the last `settings.new_joiner_weeks` weeks (4), and not *Left* |
| In class | Status is not *Left* |
| Calls due for my students (C1) | Students with an open follow-up task due today or earlier, or escalated, that is assigned to me or whose mentor I am: the *needs the Guru* and *call due* groups of C10 for "My students" |
| Overdue (G1) | Students with an open task past its due date, not escalated. Escalated ones are counted separately. Grouped by the task's assignee (the mentor when the task was made); no assignee = the student had no mentor |

## Coordinators and roles

Screen G2 (0014, [DECISIONS.md #45](DECISIONS.md)). The Guru writes `profiles.role`, `active` and
the new `duty_hours` directly (policy `own_update` lets the Guru update any profile); the trigger
`profiles_admin_guard` checks every change an app user makes:

| Rule | Error code |
|---|---|
| Only the Guru writes duty hours; trimmed, at most 120 characters | `not_allowed`, `duty_hours_too_long` |
| Nobody changes their own role or switches themselves off | `not_own_role` |
| The Guru role is given and taken only in the dashboard | `guru_role_dashboard_only` |
| The app gives roles only to pending logins: coordinator, or student once a student record links to the login | `role_change_not_allowed`, `student_needs_record` |
| A coordinator (or the Guru) who still mentors students cannot be switched off | `has_mentees` |

The older guard `profiles_guard` (0002) still stops anyone but the Guru from changing role,
treasurer or active.

`link_student_login(profile, student)` (Guru) links a pending, active login to a student record
without a login and makes it a student, in one step; errors `not_allowed`, `profile_not_pending`,
`student_not_found`, `student_already_linked`. `reassign_mentees(students, to)` (Guru) sets the
mentor of the given students and returns how many changed.

**Mentors and call tasks.** A new mentor must be an active coordinator or the Guru (trigger
`students_mentor_guard`, error `mentor_not_staff`; app users only). When a student's mentor
changes, their open follow-up tasks that were the old mentor's, or nobody's, go to the new mentor
(trigger `students_follow_mentor`, [DECISIONS.md #48](DECISIONS.md)). 0014 also gave the open tasks
without an assignee to the student's mentor at that time.

## Importing students

Screen G3 (0014, [DECISIONS.md #46](DECISIONS.md)). The app reads the file, checks every row and
sends only the good rows to `import_students(rows)` (Guru only), which checks them again and saves
each row on its own (a refused row does not stop the others). `rows` is a JSON array of objects:
`line` (the row number in the file, given back), `full_name`, `dob`, `phone`, `email`, `area`,
`pincode`, `level_id`, `joined_on` (dates `YYYY-MM-DD`). It returns one entry per row:
`{line, id, roll_no}` or `{line, error}`.

| Rule | Row error |
|---|---|
| Name required, at most 100 characters (spaces tidied) | `name_required`, `name_too_long` |
| Date of birth required, a real date, not in the future | `dob_required`, `dob_invalid` |
| Adults only: an under-18 is registered with C2, so the parent's consent is recorded | `minor_use_form` |
| Joining date optional (today), not in the future, not before the birth or 2000 | `joined_invalid` |
| Phone: 10-13 digits after removing spaces and dashes; not already used (last 10 digits) | `phone_invalid`, `duplicate_phone` |
| Email looks like one and is not already used | `email_invalid`, `duplicate_email` |
| Pincode 6 digits; level 1-3 (default 1) | `pincode_invalid`, `level_invalid` |
| No student with the same name and date of birth | `duplicate_student` |
| Anything else the database refuses | `row_failed` |

Whole-call errors: `not_allowed`, `too_many_rows` (more than 500). The roll number comes from the
usual trigger (by the joining year), the status is *New*, and a matching confirmed login is linked
by email as for C2.

## Settings

The facilitator changes settings on G10 (0014, [DECISIONS.md #47](DECISIONS.md)) with
`save_settings(values)`: a JSON object of key and value, saved all or nothing; it refuses a key not
in the table (`setting_unknown`) and Irregular at or after Inactive (`irregular_after_inactive`).
The trigger `settings_guard` checks each value however it is written:

| Key | Value (default) | Read by |
|---|---|---|
| `irregular_days` | 3-90 (14) | daily job |
| `inactive_days` | 7-365 (30) | daily job |
| `call_due_days` | 1-14 (3) | daily job |
| `retry_days` | 1-14 (3) | `log_call` |
| `max_retries` | 1-10 (3) | `log_call` |
| `new_joiner_weeks` | 1-12 (4) | home screens |
| `week_starts` | `"monday"` or `"rolling7"` (`"monday"`) | `week_start_ist()` |
| `call_reasons` | a list of codes | C11, `log_call` (not edited in the app yet) |
| `promotion_syllabus_percent` 0-100 (100), `promotion_min_visits` 0-100 (8), `promotion_visit_weeks` 1-52 (8), `promotion_min_feedback` 1-10 (2) | whole numbers | `promotion_criteria`, `decide_promotion` (Phase 2 promotion, 0017) |
| `promotion_needs_level_up` | true / false (true) | `promotion_criteria` (Phase 2 promotion, 0017) |

Out-of-range values give `setting_invalid`; the app cannot add (`setting_unknown`) or delete
(`setting_required`) a setting. Every change goes to `audit_log` with the key as `row_id`
(`audit_setting`). The open window is on `centres` (`opens_at` before `closes_at`, trigger
`centres_guard`, error `window_invalid`); `close_open_visits` closes visits left open at the closing
time. Centre changes are logged too.

## Audit log

`audit_log` (0001) gets one row per change: `table_name`, `row_id`, `action` (`INSERT`, `UPDATE`,
`DELETE`), `changed_by` (the login; empty for the dashboard and the daily jobs), `changed_at`,
`old_row`, `new_row` (the whole row as JSON). Only the Guru reads it (policy `guru_read`); nothing
in the app writes it except the security definer triggers. Screen G11 reads it 50 rows at a time,
newest first, filtered by table, person, action and time; 0014 adds indexes for these filters.
0025 audits `consents` and `guardians` too. After an erasure (`erase_student`) the rows about the
person keep table, action, time and who, with `old_row` and `new_row` emptied.

## Notifications inbox

Screen A2 (0015, [DECISIONS.md #49](DECISIONS.md)). `notifications` holds one row per person per
notice they were sent: `kind` (`announcement`; `assessment` and `promotion` for Phase 2's notices since 0019;
`notice` for any other screen), `title`, `body` (the first 300 characters), `url` (the app screen it opens, the same one
the push opens: `/staff/announcements/N` for staff, `/student/announcements/N` for students),
`announcement_id` (the row goes with its announcement), `visible_at` (the publish time) and
`read_at`.

- **Filled by the database, not by the push.** Trigger `announcements_inbox` calls
  `inbox_sync_announcement` on every new announcement and on a change to its title, text,
  audience or publish time: it adds the people of `announcement_audience` who have no row,
  removes the rows of people no longer addressed, and copies the title, text and time. So web and
  iPhone users, and phones that refused push, have the same inbox. The Edge Function setting
  `notified_at` changes nothing here. A student who joins a level or group later gets no earlier
  notices (S10 still lists those announcements).
- **Read.** Opening an announcement adds a read receipt (0007); trigger `announcement_reads_inbox`
  then marks its notice read. `mark_notifications_read(ids)` marks the given notices, or all
  (`null`, "Mark all read"); it does **not** add read receipts, so "seen by" on C15 still counts
  only people who opened the announcement.
- **Who sees what.** A person reads only their own rows, and only from `visible_at` (a scheduled
  announcement's notice waits). The app writes nothing directly. `inbox_unread_count()` gives the
  number on the home header's bell.
- **Housekeeping.** 0015 filled the inbox with the announcements of the last 30 days (and the
  scheduled ones), read where a receipt existed. The daily job `mridanga-inbox-cleanup` deletes
  notices older than a year.
- **Phase 2's notices** (0019, [DECISIONS.md #55](DECISIONS.md)): the trigger `push_outbox_inbox`
  (`inbox_on_push_outbox`) copies every new `push_outbox` row (assessments, promotion) into
  `notifications`, same person, title, line (300 characters) and screen, `visible_at` = when it was
  queued; `inbox_kind_for_url` gives the kind from the screen. Outbox rows are made for every
  active login, push or not, so web users get them too. 0019 also copied the outbox rows of the last
  30 days. A Phase 2 notice is marked read when it is tapped in the inbox (its screen has no read
  receipt). The app opens the same screens as the push (`isNoticeScreen` in
  `src/data/notifications.ts`, used by `src/lib/push.ts`).
- **Events and polls** (0022, [DECISIONS.md #61](DECISIONS.md)) queue their notices the same way;
  0022 adds the kinds `event` and `poll` to `notifications.kind` and to `inbox_kind_for_url`
  (`/student|staff/events/<id>`, `/student|staff/polls/<id>`).

## Reports

Screens C21 and G8 (0015, [DECISIONS.md #50](DECISIONS.md)). `class_report(from, to, mentor)`
returns one JSON object for the days `from` to `to` (India time, at most 367 days): a coordinator
always gets their mentees; the Guru gets everyone, or `mentor`'s mentees. Security invoker,
staff only. It counts like the home screens:

| Number | Counted as |
|---|---|
| Statuses, in class | Now, from `student_overview`, whatever the dates (in class = not Left; the same as G1) |
| New joiners | `joined_on` within the dates |
| Left | Students whose status became Left within the dates (`status_history`) |
| Visits, students who came, hours | Check-ins within the dates; hours from finished visits |
| Per week | Weeks from Monday, or 7-day blocks ending on the last date when `week_starts` = `rolling7` |
| Per month | Calendar months |
| Calls made | `call_logs` within the dates, by outcome |
| Calls due, with the facilitator, planned | Today: students with an open task due by today or escalated (as C1 and C10), escalated, due later |
| Progress per level | Students (not Left) at each level now; the average share of the level's items in use that they have ticked, how many have all, and ticks given within the dates |
| Student rows | One per student in scope (Left too): visits, hours and calls within the dates, last visit, days away, items ticked of the current level |

Errors: `not_allowed`, `range_invalid`, `range_too_long`. The app turns the student rows into the
CSV file.

## Centres

Screen G9 (0015, [DECISIONS.md #51](DECISIONS.md)). `centres` (0001) has a name, a GPS point
(`lat`, `lng`), the radius `radius_m` of the attendance area, the open window and `active`; 0015
adds `address`. Trigger `centres_details_guard` checks every write: a name of 1-60 characters,
unique in any case; an address of at most 300; latitude and longitude together, in range, not
0, 0, rounded to 6 decimals; a radius of 25-2000 m; the last centre in use cannot be switched off;
the app never deletes a centre (visits, people and students point to it). The window is checked
by `centres_guard` (0014). Only the Guru writes (policy `guru_write`, 0001); every change is in
the audit log. **The phones do not check the area yet:** that needs `expo-location`, a native
package, in the next planned APK. New students still get centre 1 (Abids) as home centre; a
picker comes when a second centre opens.
## Assessments (Phase 2)

Migration 0016 (0012 on the branch `phase2-assessments` and on TEST; renumbered at the Phase 2
merge, [DECISIONS.md #52 and #55](DECISIONS.md)). Screens G6, C12, C13, C14, S7 (SCREENS.md).

| Table | One row per | Written by |
|---|---|---|
| `assessments` | Assessment the Guru set: `title`, `instructions`, `kind` (`playing`, `singing`, `theory`, `other`), `level_id`, `level_up`, `rubric` (list of `{criterion, max}`), `media` (up to 3 files), `media_link`, `sent_at` (empty = draft) | The Guru, directly; trigger `assessments_guard` |
| `assessment_releases` | A coordinator's handing-out: `notes`, `due_on`, `released_by` | `release_assessment` |
| `assessment_assignments` | Student and assessment (unique): `status` `assigned` (Not seen), `seen`, `submitted`, `reviewed`, `redo`; `seen_at`, `last_reminded_at`, `reminders` | The functions below |
| `assessment_submissions` | Recording a student sent: `file` (`{path, name, kind audio\|video, size}`) and/or `link`, `note`; the review: `scores` (one per rubric line), `score`, `score_max`, `comment`, `outcome` (`accepted`, `redo`), `send_level_up`, `reviewed_by`, `reviewed_at`; `file_removed_at` | `submit_assessment`, `review_submission` |
| `push_outbox` | Notification to one person: `title`, `body` (in their app language), `url` (the screen), `sent_at` | The functions below; sent by the Edge Function. No app access at all |

The trigger `assessments_guard`:

| Rule | Error code |
|---|---|
| Title trimmed, 1 to 120 characters; instructions at most 4000 | `title_required`, `title_too_long`, `instructions_too_long` |
| Rubric of 1 to 8 lines, each a criterion of 1 to 80 characters and a whole top score 1 to 10 | `rubric_required`, `rubric_invalid` |
| At most 3 files, each a proper path in the uploader's own folder that is in Storage (size taken from Storage), kind matching the ending; the link `https://`, at most 500 characters | `too_many_media`, `file_invalid`, `file_not_yours`, `file_missing`, `link_invalid` |
| The author is the signed-in person; `sent_at` set once, by the database's clock, never cleared | `assessment_frozen`, `already_sent` |
| After the first release, type, level, level-up flag and rubric stay | `assessment_released` |

The functions (all security definer, each checks who is asking):

| Function | Who | Does | Errors |
|---|---|---|---|
| `release_assessment(assessment, students[], due_on, notes)` | Guru, coordinator | For a sent assessment: one release and one assignment per picked student who does not have it yet; a notification to each with a login. Returns `{release_id, assigned, already, no_login}` | `not_allowed`, `assessment_not_found`, `students_required`, `due_required`, `due_past`, `due_too_far`, `notes_too_long`, `nothing_to_assign` |
| `mark_assessment_seen(assignment)` | The student it belongs to | `seen_at`, Not seen → Seen | `not_allowed` |
| `submit_assessment(assignment, file, link, note)` | The student it belongs to, while Not seen, Seen or Redo | Saves the recording (own uploaded audio/video, never sent before, ≤ 50 MB) or link; status Submitted; tells the coordinator who released it | `not_allowed`, `not_open`, `recording_required`, `file_invalid`, `file_not_yours`, `file_missing`, `link_invalid`, `note_too_long` |
| `review_submission(submission, scores[], comment, outcome, send_level_up)` | Guru, coordinator | Only the latest, unreviewed recording: scores within each line's top, total; comment required for a redo; `send_level_up` only for an accepted level-up assessment; status Reviewed or Redo; tells the student | `not_allowed`, `submission_not_found`, `already_reviewed`, `outcome_required`, `scores_invalid`, `comment_required`, `comment_too_long`, `level_up_not_allowed` |
| `remind_assessment(assignments[])` | Guru, coordinator | A reminder to each still to send (Not seen, Seen, Redo), at most once in 12 hours each. Returns `{reminded, no_login, skipped}` | `not_allowed` |

Who sees what (row-level security): the Guru every assessment, drafts too; a coordinator the
sent ones, and every release, assignment and submission (any coordinator may follow up or
review); a student only the assessments, releases, assignments and submissions that are theirs
(`my_student_id()`). The views `assessment_tracker` (one row per assignment with the student's
name, roll number, login yes/no, due date and latest submission) and `assessment_summary`
(counts per status) are security invoker.

**Files.** The private bucket `assessment-files`: at most 50 MB a file; JPEG, PNG, WebP, PDF,
MP3, M4A, AAC, WAV, OGG, AMR, MP4, MOV, 3GP, WebM, MKV. A path is
`<login id>/<random id>.<ending>`; `assessment_file_kind()` reads the kind from the ending.

| Action | Allowed for | Rule function |
|---|---|---|
| Open, or make a signed link | The Guru; anyone who may read an assessment or a submission that lists the file; one's own folder | `assessment_file_readable` |
| Upload | The Guru, any kind, own folder; a student audio or video into their own folder, only while an assessment waits for them, at most 10 files in a day | `assessment_file_uploadable` |
| Delete | The Guru any; anyone else their own upload while no submission lists it | `assessment_file_deletable` |

**Keeping files.** A recording is deleted 30 days after its review (`file_removed_at` is set; the
review stays), except one sent to the Guru for a level-up. The daily job `assessment_daily` calls
the Edge Function with `{"cleanup": true}`, which takes the paths from
`claim_expired_submission_files()` and deletes them through the Storage API (a batch Storage
refuses goes back with `release_submission_files`).

**Notifications.** `push_outbox` rows are written by the functions above and the daily job, in
the person's `profiles.language`, with the screen to open: `/student/assessments/<assignment>`
or `/staff/assessments/review/<assignment>`. The every-minute job calls the Edge Function while
a row of the last day waits; `claim_push_outbox()` marks them sent and returns one row per phone;
rows older than a day are never sent. The Edge Function from the same commit must be deployed;
the one deployed for 0011 ignores the queue.

## Promotion approval (Phase 2)

Migration 0017 (0014_promotion on the branch `phase2-promotion` and on TEST; renumbered at the
Phase 2 merge, [DECISIONS.md #53](DECISIONS.md)). Screens C22, C23, G7 (SCREENS.md). A student moves up only
when the Guru approves; the app never promotes by itself.

| Table | One row per | Written by |
|---|---|---|
| `promotion_nominations` | Nomination of a student for the next level: `from_level`, `to_level`, `reason`, `criteria` (the check at the time), `submission_id` (the level-up recording), `asked` (coordinators asked), `nominated_by`; `status` `open`, `promoted`, `not_yet`, `withdrawn`; `more_asked_at` + `more_note`; `decided_by`, `decided_at`, `guidance`, `renominate_after`, `level_history_id`. At most one `open` per student | The functions below; audited |
| `promotion_feedback` | Coordinator's answer on a nomination (unique per coordinator): `rating` `ready`, `almost`, `not_yet`, `comment` | `nominate_for_promotion` (the nominating coordinator's "ready"), `give_promotion_feedback` |

**Criteria** (settings the Guru can change; defaults in brackets): `promotion_syllabus_percent`
(100: every item in use at the current level ticked), `promotion_min_visits` (8) days in class in
the last `promotion_visit_weeks` (8) weeks, `promotion_needs_level_up` (true: an accepted
submission of a level-up assessment of the current level, sent to the Guru with
`send_level_up`), and `promotion_min_feedback` (2 coordinators' answers before Promote; the
nominating coordinator's own counts). The criteria tell coordinators who is ready; a coordinator
may still nominate when one is not met, and the check is kept with the nomination for the Guru.

| Function | Who | Does | Errors |
|---|---|---|---|
| `promotion_criteria(student)` | Guru, coordinator | The check: level and next level, syllabus done/total, visits, the level-up recording found, `all_ok`, an open nomination, the "not yet" date still ahead, and `taught_by` (active coordinators who ticked, marked a visit or reviewed in those weeks, and the mentor) | `not_allowed`, `student_not_found` |
| `nominate_for_promotion(student, reason, ask[])` | Guru, coordinator | A nomination to the next level with the criteria and the level-up recording; the coordinator's own answer "ready"; a notification to each asked active coordinator | `not_allowed`, `student_not_found`, `top_level`, `already_nominated`, `too_soon`, `reason_required`, `reason_too_long` |
| `give_promotion_feedback(nomination, rating, comment)` | Coordinator | Saves or changes their answer while open; tells the Guru once enough have answered | `not_allowed`, `nomination_not_found`, `nomination_closed`, `rating_invalid`, `comment_required`, `comment_too_long` |
| `decide_promotion(nomination, decision, note, renominate_after)` | Guru | `promote`: needs enough answers and the student still at `from_level`; sets `students.level_id`, writes `level_history`; tells the student (`/student/progress`) and the nominator. `not_yet`: guidance and a date (tomorrow to a year); tells the nominator and those who answered. `more`: a note; tells active coordinators who have not answered; stays open | `not_allowed`, `nomination_not_found`, `nomination_closed`, `decision_invalid`, `feedback_needed`, `level_changed`, `note_required`, `note_too_long`, `date_required`, `date_past`, `date_too_far` |
| `withdraw_nomination(nomination)` | The nominator, the Guru | Open → withdrawn | `not_allowed`, `nomination_not_found`, `nomination_closed` |
| `promotion_ready_students()` | Guru (everyone), coordinator (their mentees) | Students meeting every criterion, not left, below the top level, no open nomination, no "not yet" date ahead | `not_allowed` |
| `promotion_home()` | Guru, coordinator | `{to_decide, collecting, to_answer, ready}` for G1 and C1 | `not_allowed` |

The view `promotion_queue` (security invoker) gives each nomination with the student's name, roll
number and current level, the answers (`answers`, `ready`, `almost`, `not_yet`,
`last_answer_at`) and `answers_needed`. Staff only; students see no nominations or answers.

**Only the Guru changes a level.** The trigger `students_level_guard` (`guard_student_level`)
refuses a change of `students.level_id` by any signed-in person but the Guru (`level_guru_only`);
before 0017 a coordinator's phone could change it through the `staff_update` policy. The
dashboard and the SQL editor are not stopped.

**Keeping level-up recordings.** A recording sent to the Guru stays while a nomination using it is
open, and is deleted 30 days after that nomination is decided (promoted, not yet or withdrawn); one
never used for a nomination goes 180 days after its review (`submission_file_expired`, used by
`claim_expired_submission_files` and `assessment_daily`, both redefined in 0017).

**Notifications** go through `push_outbox` (0016), worded by `promotion_push_line` in the
person's language, to `/staff/promotion/<nomination>` or `/student/progress`; never to the person
whose action it is. The Edge Function accepts these two screens since slice 2, so it must be
deployed again from main (TEST and LIVE, OPERATIONS.md). Each one also lands in the inbox (0019).

## Practice tools (Phase 2)

Migration 0018 (0016_practice on the branch `phase2-practice` and on TEST; renumbered at the
Phase 2 merge, [DECISIONS.md #54](DECISIONS.md)). Screens S5,
V1, S6 and the taal editor (SCREENS.md).

| Table | One row per | Written by |
|---|---|---|
| `taals` | Rhythm cycle: `name`, `bols` (one per beat: `-` rest, or 1-4 bols joined with `.`), `beats` (generated = number of bols), `divisions` (beats per vibhag, adding up to `beats`), `marks` (one per vibhag: `X` first, `2`-`9` tali, `0` khali), `level_id` (null = all levels), `placeholder`, `note`, `sort`, `active`, `updated_by` | The Guru (row-level security); checked by the trigger `taals_guard` (`guard_taal`: name 1-60, 2-32 beats, divisions and marks, bol shape, note ≤ 300; bols lower-cased); audited. Three placeholder rows seeded |
| `practice_logs` | Practice entry: `student_id`, `practised_on` (India), `minutes` 1-240, `source` `timer` (with `started_at`) or `manual`, `taal_id` (set null when the taal is deleted), `note` ≤ 200, `created_by` | Only `log_practice` / `delete_practice` |

| Function | Who | Does | Errors |
|---|---|---|---|
| `log_practice(minutes, source, practised_on, started_at, taal, note)` | Student | Timer: started within 6 hours, minutes ≤ time since start + 1, day = today. Manual: a day from 13 days ago to today. At most 12 hours a day and 20 entries in 24 hours | `not_allowed`, `minutes_invalid`, `started_invalid`, `date_invalid`, `source_invalid`, `taal_not_found`, `note_too_long`, `day_full`, `too_many` |
| `delete_practice(id)` | The student | Deletes an own entry of the last 14 days | `not_allowed`, `too_old` |
| `practice_weeks(student, weeks)` | Anyone (security invoker) | Minutes and entries per week from Monday (India), newest first, 1-26 weeks, empty weeks as 0; row-level security decides whose minutes count (a student: own; staff: anyone's) | — |

Who sees what: students read the taals switched on; staff read all; only the Guru writes. A student
reads their own practice; staff read everyone's. Anon reads nothing.

## Media (Phase 2)

Migration 0020 (`0020_media.sql`; TEST ran the same statements as 0017_media.sql on 3 Oct 2026),
on the branch `phase2-media` ([DECISIONS.md #56](DECISIONS.md)); LIVE runs it after 0019. Screens V3, G5 video files, S7 and C14 recording (SCREENS.md). "Record myself" (S5)
keeps nothing in the database.

| Change | What |
|---|---|
| `materials.kind` | Adds `video`: `url` is an https link (≤ 500) to the team's own `.mp4` / `.webm` / `.m4v` / `.mov` file (`video_link_ok`); no Storage file |
| `materials.panes` | 1-4 camera angles side by side in a video file (V2), for "tap to zoom" in V3; always 1 for other kinds (a YouTube player may not be zoomed). `guard_material` redefined: errors `video_link_invalid`, `panes_invalid` |
| `assessment_submissions.voice_note` | The reviewer's spoken comment `{path, name, kind, size}` in the bucket `assessment-files` (the size taken from Storage) |
| `review_submission(…, p_voice_note)` | Replaces 0016's five-argument version: checks the voice note (own upload, in Storage, audio or a browser's .webm); a redo needs a comment **or** a voice note |
| Storage rules | `assessment_file_uploadable`: a coordinator may upload audio (or .webm) into their own folder, at most 10 files a day. `assessment_file_readable`: a file that a submission lists as its voice note opens for whoever may read the submission. `assessment_file_deletable`: such a file stays |
| Keep time | `claim_expired_submission_files` and `assessment_daily` redefined: a submission with a file **or** a voice note expires as before (30 days after the review; level-up rules of 0017); both paths are returned, so the Edge Function deletes both unchanged |

Smoke tests: section "media (0020, Phase 2)".

## Ishtagoshti (Phase 2)

Migration 0021 (`0021_ishtagoshti.sql`, [DECISIONS.md #57](DECISIONS.md)); LIVE runs it after 0020.
Screens I1, I2, I3, I11, I12 (SCREENS.md). Readers are the signed-in roles in `ig_reader()` (Guru,
coordinator, student, and since 0025 the free public subscribers: see "Ishtagoshti subscribers"). Editors are the Guru and the active
coordinators with `profiles.ig_editor` (`is_ig_editor()`); only the Guru sets that flag, and only on a
coordinator (trigger `profiles_ig_editor_guard`, errors `not_allowed`, `ig_editor_coordinator_only`).

| Table | One row per | Written by |
|---|---|---|
| `ig_slokas` | Sloka: `ref` (e.g. BG 10.9, 1-60), `devanagari`, `transliteration` (IAST), `word_meanings` (a line per word), `translation_en/te/hi` (at least one), `purport_en/te/hi`, `translator` (credit; empty = `settings.ig_translator`), `own_text` (the editor confirms: the temple's own text, no BBT; needed to publish), `audio_path` / `audio_name` / `audio_size` (recitation), `sample`, `published`, `sort`, `updated_by` | Editors (row-level security); checked by `guard_ig_sloka` (errors `ref_invalid`, `devanagari_required`, `transliteration_required`, `text_too_long`, `translation_required`, `translator_too_long`, `own_text_needed`, `audio_invalid`, `audio_missing`); audited. Three SAMPLE rows seeded |
| `ig_themes` | Theme (series): `title` 1-80, `intro`, `questions` (a line each), `sample`, `published`, `sort` | Editors; `guard_ig_theme` (`theme_title_invalid`, `text_too_long`); audited. Two SAMPLE rows seeded |
| `ig_theme_slokas` | A sloka's place in a theme (`position`) | Only `set_theme_slokas` |
| `ig_daily_pins` | A day (India) on which a sloka is the sloka of the day | Editors; `guard_ig_pin`: today up to a year ahead, published slokas only (`pin_day_invalid`, `pin_not_published`) |
| `ig_notes` | A person's private note on a sloka (`profile_id`, ≤ 2000) | The writer only; nobody else reads it, not even the Guru |
| `ig_memorised` | A person's "I have memorised it" tick, dated today | The person (insert / delete own); staff read all (for the later report I13), except, since 0025, coordinators do not read public subscribers' ticks |

| Function | Who | Does | Errors |
|---|---|---|---|
| `ig_sloka_of_day(day)` | Anyone signed in (security invoker) | The sloka pinned to that day (India, default today), else the published slokas in turn by `sort`, `id`, counted from 1 Jan 2026; the same for everyone; null when none is published | — |
| `set_theme_slokas(theme, slokas[])` | Editors (security definer, checks inside) | Puts the slokas into the theme in that order; a repeat counts once; an empty list empties it | `not_allowed`, `theme_not_found`, `sloka_not_found`, `too_many` (100) |
| `is_ig_editor()`, `ig_reader()` | Anyone signed in | Yes or no about the caller | — |

Storage: private bucket `ishtagoshti-audio`, 10 MB a file, audio only (mp3, m4a, aac, wav, ogg,
webm), path `<login id>/<random id>.<ending>`. Editors upload into their own folder and delete any; a
file opens for whoever can see a sloka that lists it, and for editors (`ig_audio_readable`,
`ig_audio_uploadable`). Settings: `ig_translator` (text ≤ 100, G10); 0021 redefines `guard_setting`
with this key (a later redefinition must keep it). Smoke tests: section "Ishtagoshti (0021, Phase 2)".

## Ishtagoshti subscribers (Phase 2)

Migration 0025 (`0025_ishtagoshti_public.sql`, [DECISIONS.md #72](DECISIONS.md)); LIVE runs it after
0024. Screens I14 (join, `app/join-ishtagoshti.tsx`) and I15 (Guru, `app/staff/ishtagoshti/subscribers.tsx`).
A **public subscriber** is a login whose role stays `pending` and that has a row in `ig_subscribers`.
`ig_reader()` lets it read when it is not blocked and, under 18, its parent confirmed; every other
rule still refuses it as `pending`. `is_public_subscriber(id)` = has a row and role `pending`.

| Table | One row per | Written by |
|---|---|---|
| `ig_subscribers` | Subscriber (`profile_id`): `birth_year`, `phone` (optional), `minor`, `terms_version` (the notice text agreed), `joined_at`, a minor's `parent_name` / `parent_email` / `parent_relation` and `parent_confirmed_at`, `blocked_at` / `blocked_by` / `block_reason` | Only the functions below. Read: the person's own row and the Guru |
| `ig_parent_codes` | A minor's current parent code: `code_hash` (sha256 of id + code), `sent_at`, `expires_at` (24 h), `tries` (5), `sends_day` / `sends` (3 a day) | Only the functions below; no app user reads it |

| Function | Who | Does | Errors |
|---|---|---|---|
| `ig_my_state()` | Anyone signed in | The caller's subscription: `state` none / awaiting_parent / active / blocked, and the details they gave (not the block reason) | — |
| `ig_join(birth_year, terms_version, turned_18, phone, parent_name, parent_email, parent_relation)` | A switched-on `pending` login with a confirmed email | Joins, or corrects the details while the parent has not confirmed (an old code stops counting). Under 18, or 18 this year without `turned_18`, needs the parent | `not_pending`, `email_not_confirmed`, `blocked`, `already_joined`, `age_change_not_allowed`, `birth_year_invalid` (5-120 years), `phone_invalid`, `terms_required`, `parent_name_invalid`, `parent_email_invalid`, `parent_email_own`, `parent_relation_invalid` |
| `ig_send_parent_code()` | The minor | Makes a new code and emails it to the parent through pg_net + Brevo; returns `sent` or `not_set_up` (no pg_net, or Vault secrets `mridanga_brevo_key` / `mridanga_mail_from` missing; nothing stored) | `not_awaiting_parent`, `code_too_soon` (1 a minute), `code_limit` (3 a day), `code_daily_cap` (100 a day app-wide) |
| `ig_confirm_parent(code)` | The minor | Answers `confirmed`, `wrong` (counted), `expired`, `too_many` or `no_code` | `not_awaiting_parent` |
| `ig_leave()` | A public subscriber | Deletes the row, notes, ticks and code; a blocked person keeps a row with only the block | `not_subscriber` |
| `ig_subscriber_list()` | Guru | Every subscriber with name, email, details, state, `in_class` (became a student since), counts of ticks and notes | `not_allowed` |
| `ig_subscriber_weeks(weeks)` | Guru | Joins per week (Monday, India), the last 1-104 weeks with empty ones | `not_allowed` |
| `ig_block_subscriber(profile, blocked, reason)` | Guru | Blocks (reason ≤ 200) or unblocks; unblocking a blocked person who left removes the row | `not_allowed`, `not_found`, `reason_too_long` |
| `has_class_role()`, `is_public_subscriber(id)` | Anyone signed in | Yes or no; used by the rules | — |

`ig_new_parent_code(profile)` is internal (no app role may run it). 0025 also replaces four rules of
0001: settings, centres, levels and syllabus items are read only with a class role (`has_class_role()`:
Guru, coordinator, student, kiosk), no longer by any signed-in login; and coordinators no longer read
public subscribers' profiles. Smoke tests: section "Ishtagoshti public sign-up (0025, Phase 2)", with a
sweep that runs as a subscriber over every table, view, bucket and callable function.
## Events and polls (Phase 2)

Migration 0022 (`0022_events_polls.sql`, [DECISIONS.md #61](DECISIONS.md)); LIVE runs it after 0021.
TEST ran it as `0021_events_polls.sql` on 5 Oct 2026, then a one-function patch (`poll_state`).
Screens C16, C17, S11, S12 (SCREENS.md). Who an event or poll is for uses the announcement audiences
(`all`, `level`, `mentees` of the author, `staff`, `group`), worked out by
`audience_profiles(audience, level, group, author)` (active logins; unlike announcements the author
counts when they fit) and `audience_students(...)` (student records not Left, logins or not; none for
`staff`). Staff see every event and poll; a student those for them (and events they perform at).

| Table | One row per | Written by |
|---|---|---|
| `events` | Event: `title` 1-120, `description` ≤ 4000, `starts_at`, `ends_at` (after the start, within 14 days), `centre_id` and/or `place` ≤ 200, the audience, `created_by`, `cancelled_at` + `cancel_reason` ≤ 500, `reminded_at` (day-before reminder), `last_reminded_at` (Remind) | Staff insert; the author or the Guru update / delete (row-level security). `guard_event`: errors `title_required`, `title_too_long`, `description_too_long`, `place_required`, `place_too_long`, `centre_invalid`, `starts_required`, `starts_past` (only when the start changes), `starts_too_far`, `ends_invalid`, `audience_invalid`, `level_required`, `group_required`, `audience_locked` (someone answered), `event_cancelled` (no change after cancelling), `event_over`, `reason_too_long`, `event_frozen`; delete only without answers, performers or attendance (`event_has_answers`); audited |
| `event_rsvps` | A person's answer: `going`, `maybe`, `not_going` | Only `rsvp_event`; students read their own, staff all |
| `event_performers` | A student record playing at an event, with `part` 1-60 | Only `set_event_performers` |
| `event_attendance` | A student record that came to an event | Only `mark_event_attendance` |
| `polls` | Poll: `question` 1-200, `options` (2-6 different, 1-80 each), `anonymous`, `results_when` (`after_vote` / `after_close`), `closes_at`, `closed_at` (closed early), the audience, `closing_reminded_at`, `last_reminded_at` | Staff insert; the author or the Guru update / delete. `guard_poll`: `question_required`, `question_too_long`, `options_invalid`, `closes_required`, `closes_past`, `closes_too_far`, the audience errors, `poll_has_votes` (answers, anonymous, results rule, audience after the first vote; delete only without votes), `poll_closed` (no change once closed), `poll_frozen`; audited |
| `poll_votes` | A person's vote (`choice` from 0), changed in place | Only `vote_poll`. **No grant to the app at all**: read only through the functions below |

| Function | Who | Does | Errors |
|---|---|---|---|
| `rsvp_event(event, response)` | Those the event is for, and its performers | Answers or changes the answer until the start | `not_allowed`, `event_not_found`, `event_cancelled`, `event_started`, `response_invalid` |
| `event_counts(ids[])` | Anyone signed in (events they may open) | Per event: `addressed`, `going`, `maybe`, `not_going`, `performers`, `attended`, and the caller's `my_response`, `my_part`, `i_attended`, `can_answer`. Counts only | — |
| `event_people_list(event)` | Staff | Everyone it is for (and anyone who answered) with name, roll number, role, answer | `not_allowed` |
| `event_student_list(event, everyone)` | Staff | Student records to pick from: the audience's (or all not Left), plus those picked or ticked, with answer, part, attended | `not_allowed`, `event_not_found` |
| `set_event_performers(event, [{student_id, part}])` | Staff | Replaces the performers; new ones and changed parts are told. Returns `{performers, notified, no_login}` | `not_allowed`, `event_not_found`, `event_cancelled`, `event_over`, `too_many` (40), `student_invalid`, `part_invalid` |
| `mark_event_attendance(event, students[])` | Staff | Replaces the list of who came, from the event's day (India). Returns how many | `not_allowed`, `event_not_found`, `event_cancelled`, `too_early`, `student_invalid` |
| `remind_event(event)` | Staff | Tells those who have not answered; once in 12 hours. Returns how many | `not_allowed`, `event_not_found`, `event_cancelled`, `event_started`, `too_soon` |
| `vote_poll(poll, choice)` | Those the poll is for | Votes or changes the vote while open | `not_allowed`, `poll_not_found`, `poll_closed`, `choice_invalid` |
| `poll_state(ids[])` | Anyone signed in (polls they may open) | Per poll: `addressed`, `voted`, `closed`, `can_vote`, `my_choice`, and `results` (votes per answer) when allowed: everyone once closed; staff while open only when not anonymous; others after voting when `results_when` = `after_vote` | — |
| `poll_voters(poll)` | Staff | Everyone it is for (and any voter) with `voted_at`; `choice` only when the poll is not anonymous | `not_allowed`, `poll_not_found` |
| `remind_poll(poll)` | Staff | Tells those who have not voted; once in 12 hours. Returns how many | `not_allowed`, `poll_not_found`, `poll_closed`, `too_soon` |

Notices (push + inbox) go through `push_outbox` (0016) and `queue_people_push`, worded by
`event_push_line` in the person's language: a new event (its audience, not the author), a new time or
place and a cancellation (its audience and performers, not the person changing it), your part, Remind,
the day-before reminder (going or maybe), a new poll, the poll reminders. The inbox gets kinds `event`
and `poll` (0022 widens `notifications_kind_check` and redefines `inbox_kind_for_url`). The Edge
Function sends them once redeployed (it accepts `/student|staff/events|polls/<id>`). Smoke tests:
section "events and polls (0022, Phase 2)".

## Team tools (Phase 2)

Migration 0023 (`0023_team_tools.sql`), on the branch `phase2-team-tools`
([DECISIONS.md #65](DECISIONS.md)). Screens C18, C19, C20 (SCREENS.md). Notices go into
`push_outbox` through `queue_team_push` (staff only, in each person's language), so they reach the
inbox (0019) and, once the Edge Function is redeployed, the phone.

**C18 suggestions** are rows of `materials` with `approved_by` empty:

| Change | What |
|---|---|
| `materials.suggest_reason` | The coordinator's reason, ≤ 500 characters (empty for the Guru's own) |
| `materials.decided_at`, `declined_reason` | Empty = waiting. Added: `approved_by` set. Declined: `decided_at` set, `approved_by` empty, reason ≤ 500 |
| `guard_material_suggestion` (trigger `materials_suggestion_guard`, runs after `materials_guard`) | At most 10 suggestions a day per coordinator (`too_many_suggestions`); the three columns and approval change only through `decide_material_suggestion` (`suggestion_frozen`) |
| `notify_material_suggestion` | A new suggestion tells every active Guru (screen `/staff/suggestions`) |
| `decide_material_suggestion(material, approve, reason)` | Guru only: adds it to the lessons or declines it with a reason (`reason_required`), once (`already_decided`); tells the coordinator |
| Policy `own_suggestion_delete` | A coordinator deletes their own material while it is not approved (take back, remove a declined one) |
| `material_file_uploadable` | Redefined: the Guru, or a coordinator into their own folder, at most 10 files a day |

The app lists approved materials only in G4 / S4 (`fetchMaterials`); suggestions show on C18.

**C19 inventory:**

| Table / function | What |
|---|---|
| `inventory_items` | Centre, `kind` (`clay_khol`, `fibreglass`, `fibre_skin`, `brass`, `kartals`, `other`), `label` (1-60, unique per centre ignoring case), notes (≤ 500), `condition` (`good`, `needs_care`, `damaged`, `in_repair`) with its note and time, `retired_at`. The Guru inserts, updates and deletes; the condition changes only through a check (`condition_frozen`); not retired while lent (`item_out`). Audited |
| `inventory_loans` | One lending: item, a student **or** a staff member, issued by / at, optional `due_on`, condition out and in, notes, `returned_at`. One open loan per item. Written only by the functions; an item with loans cannot be deleted (foreign key) |
| `inventory_checks` | Every condition seen: `added`, `check`, `issue`, `return`; the newest sets the item's condition (trigger); `damaged` tells the Guru (screen `/staff/inventory/<id>`) |
| `issue_inventory_item(item, student, profile, condition, note, due_on)` | Staff: lends a good or needs-care item (`item_not_lendable`) to a student not Left or an active staff member (`borrower_required`, `borrower_not_found`); `due_past`, `item_out`, `item_retired` |
| `return_inventory_item(loan, condition, note)` | Staff: takes it back once (`already_returned`) |
| `check_inventory_item(item, condition, note)` | Staff: a condition check. Every condition but `good` needs a note (`note_required`, ≤ 500) |

**C20 duty roster:**

| Table / function | What |
|---|---|
| `duty_shifts` | Centre, `on_date`, `starts_at`, `ends_at` (inside the centre's `opens_at`-`closes_at`: `outside_hours`, `time_invalid`), `duty` (≤ 80). New or moved: not past, ≤ 1 year ahead |
| `duty_assignments` | Shift + person (an active coordinator or the Guru: `not_a_coordinator`), `reminded_at` |
| `save_duty_shift(id, centre, date, starts, ends, duty, people, weeks)` | Guru: a new shift (repeated weekly 1-12 times) or an edit (people replaced; a new date or start time is reminded again). Errors `people_required`, `weeks_invalid`, `shift_not_found` and the guards' |
| `duty_daily()` | pg_cron `mridanga-duty`: reminds everyone on tomorrow's shifts once (screen `/staff/duty`) |

Staff read the whole roster; students nothing. Smoke tests: section "team tools (0023, Phase 2)".

## Class fund (Phase 2)

Migration 0026_fund.sql, [DECISIONS.md #80](DECISIONS.md). The Mridanga team's own fund, recorded only
(no payments). Keepers = the Guru and treasurers (`profiles.is_treasurer`, coordinators only, switched by
the Guru: trigger `profiles_treasurer_guard`, error `treasurer_coordinator_only`). Every staff member
reads; students and anon nothing.

| Table / function | What |
|---|---|
| `fund_categories` | `direction` (`income` / `expense`), `code` (built-in ones: donation, sponsorship; instruments, prasadam, events, travel, printing, other), `name` (1-40, unique per direction ignoring case), `sort`, `retired_at`. Staff read; the Guru inserts and updates (kind and code frozen: `category_frozen`); never deleted. Audited |
| `fund_entries` | `direction`, `category_id`, `on_date`, `amount_paise` (whole paise, ≠ 0, ≤ Rs 1 crore; **negative only on a reversal**, `reverses_id`), `party` (≤ 80), `reference` (≤ 60), `note` (≤ 500), bill (`bill_path`, `bill_name`, `bill_size`), `status` (`approved` counts; `waiting`, `declined`, `withdrawn` do not), maker and decider with times, `decision_note`. Staff read; **no app writes** (grants: select only). Trigger `fund_entries_keep` refuses every delete (`fund_entry_kept`) and every change but a decision of a waiting entry (`fund_entry_frozen`), even from the dashboard. One live reversal per entry. Audited |
| `record_fund_entry(direction, category, on_date, amount_paise, party, reference, note, bill_path, bill_name)` | Keeper: saves an entry; an expense over `settings.fund_approval_rupees` (2000) is `waiting` and its approvers get a notice; an expense over `fund_bill_rupees` (500) needs a bill. Errors `not_allowed`, `category_invalid`, `amount_invalid`, `date_future`, `date_too_old` (> 366 days), `party_/reference_/note_too_long`, `bill_invalid`, `bill_not_yours`, `bill_missing`, `bill_required` |
| `decide_fund_entry(entry, approve, note)` | Approve, or decline with a reason (`reason_required`). Approvers (`fund_approvers`): the Guru; for the Guru's own entry also treasurers; **never the maker** (`own_entry`). Once (`already_decided`). Tells the maker |
| `withdraw_fund_entry(entry, note)` | The maker takes back their own waiting entry (`not_yours`) |
| `reverse_fund_entry(entry, reason)` | Keeper: a counter-entry dated today (same kind and category, amount negative) undoes an approved entry that is not itself a reversal (`cannot_reverse`, `already_reversed`); over the approval limit it waits |
| `fund_balance()` | Approved income minus approved expense in paise (security invoker: 0 for anyone who may not read) |
| Bucket `fund-bills` | Private, 10 MB, JPEG / PNG / WebP / PDF. Read: staff, for a bill an entry lists or their own file; upload: keepers into their own folder, 20 a day; delete: only an own file no entry lists (a failed save) |

Notices (`fund_push_line`, `queue_fund_push`) go through `push_outbox` to `/staff/fund/<id>`: "needs your
approval" to the approvers, "approved" / "Not approved: reason" to the maker. Smoke tests: section
"class fund (0026)".

## Withdrawal and erasure (0025)

Both are the Guru's (Praveen, 5 Oct 2026), run in the app as the Guru or in the Supabase SQL
editor as the owner; a coordinator gets `not_allowed`. The runbooks are in OPERATIONS.md
("Consent withdrawal", "Erasure request"). [DECISIONS.md #75, #76](DECISIONS.md).

**`withdraw_consent(student, note)`** freezes a record: `students.withdrawn_at` and
`withdrawn_note` are set, every consent of the student is revoked, an open visit and open call
tasks are closed, the login is switched off and its push tokens deleted. Returns
`{ roll_no, consents_revoked, login_switched_off }`; errors `student_not_found`,
`already_withdrawn`, `note_too_long`. Afterwards the record refuses app edits, visits, calls and
ticks (`student_withdrawn`, triggers `*_refuse_withdrawn`), and the daily job's call tasks for it
are dropped. The deferred consent check skips a withdrawn record, so this is the only way a minor
may be left without a current consent. The students and consents audit rows it writes are the
proof of the withdrawal.

**`erase_student(student, reason, request_ref)`** removes a student, in this order: push tokens;
past instrument loans (an open loan stops it: `open_loan`); the student row, with every row keyed
on it (visits, calls, tasks, status and level history, ticks, guardians, consents, practice,
assessments and submissions, event parts, nominations); the login (`auth.users`, which removes the
profile, replies, read receipts, memberships and notices; if the owner may not delete from
`auth.users`, only the profile goes and `login_deleted` is false); then every `audit_log` row whose
row id or copied values hold the student id, the login id, the QR token or an email of hers loses
`old_row` and `new_row`, keeping table, action, time and who. Last, a tombstone in **`erasures`**:
roll number, time, who erased, reason, request reference and how many audit rows were redacted
(Guru only). Returns `{ roll_no, login_deleted, audit_rows_redacted, files }`, where `files` lists
the Storage paths (photo, recordings and voice notes) that must be deleted by hand. Errors
`reason_required`, `reason_too_long`, `student_not_found`, `open_loan`.

## Linking a login to a student

A student record can exist without a login (many students never install the app). When a person
creates a login, it starts as `pending`. It becomes that student's login, with role `student`,
when **both** are true:

- the login's email is **confirmed** (the person opened the link in the sign-up email), and
- a student record has the **same email** (not case-sensitive) and no login yet.

Whichever happens last makes the link: confirming the email (trigger `on_auth_user_confirmed`),
or a coordinator saving the email on the record (trigger `students_link_login`). Only `pending`
logins are linked, so a coordinator who is also on a student record keeps the coordinator role.
Linking before confirmation would let anyone claim a record by typing its email
([DECISIONS.md #13](DECISIONS.md)).

Roles other than `student` are given by the Guru in the app (G2, see "Coordinators and roles"), or for the very first Guru, in the
Supabase dashboard (OPERATIONS.md). The Guru can also link a pending login to a student record
that has no login (`link_student_login`), for a student whose record carries another email or none. The trigger `profiles_guard` stops app users other than the
Guru from changing `role`, `is_treasurer` or `active`; the dashboard is not blocked.

**Since 0025** ([DECISIONS.md #73](DECISIONS.md)) no app user, the Guru included, writes
`students.profile_id`, `qr_token`, `created_by` or the withdrawal fields directly
(`students_frozen_guard`, error `student_field_locked`); the linking paths above run as the
function owner and are not stopped, and saving an email on a record without a login still links.
The Guru takes a wrong link off with `unlink_student_login` (the login goes back to `pending`), and
a deleted record's login goes back to `pending` too. A student's own record is readable only while
the login is an active student.

## Database functions (call these from the app)

Supabase lets the app's roles (`anon`, `authenticated`) run any function unless told otherwise,
so every function is revoked from them and granted only where needed
([DECISIONS.md #14](DECISIONS.md)). Since 0025 anon holds no right at all in `public` (no table, sequence
or function; [#77](DECISIONS.md)), and a role check never lets a NULL role through ([#72](DECISIONS.md)): a
switched-off login is refused like a stranger.

| Function | Who may call | What it does |
|---|---|---|
| `toggle_visit(student, method, device)` | Guru, coordinator, kiosk | Check in if no open visit, else check out. A check-in sets status *Active* and closes open follow-up tasks. Returns the student's name, roll number and time |
| `scan_qr(qr_token, device)` | Guru, coordinator, kiosk | Finds the student by their QR token and calls `toggle_visit`. Returns `unknown` for an unrecognised code |
| `mark_visit(student, action, device)` | Guru, coordinator | Checks the student in (`action = 'in'`) or out (`'out'`), or returns `already_in` / `already_out` and changes nothing. See "Attendance" |
| `check_out_all(centre)` | Guru, coordinator | Closes every open visit, at one centre or all (`null`, the default). Returns how many |
| `log_call(student, outcome, reason, comment, next_date)` | Guru, coordinator | Records a follow-up call and applies its outcome (pause, leave, new call task, retry). See "Follow-up calls" |
| `register_student(...)` | Guru, coordinator | Saves a new student, and for a minor the guardian and consent, in one step. Returns the id, roll number and whether an existing login was linked. See "Registering a student" |
| `staff_names()` | Guru, coordinator, student (others get nothing) | Id and name of every Guru and coordinator, active or not, for "posted by". Security definer. See "Announcements" |
| `student_home()` | Anyone signed in (a student gets their own numbers) | The student home's numbers. See "Home screens" |
| `coordinator_dashboard()` | Guru, coordinator | The coordinator dashboard's numbers. See "Home screens" |
| `guru_dashboard()` | Guru | The Guru dashboard's numbers. See "Home screens" |
| `move_syllabus_item(item, up)` | Guru | Moves a syllabus item one place up or down among the items in use. See "Syllabus editor" |
| `syllabus_item_counts()` | Guru, coordinator | Ticks and materials per syllabus item. See "Syllabus editor" |
| `week_start_ist()` | Anyone signed in | First day of "this week" in India (Monday, or 6 days ago with `week_starts` = `rolling7`); used by the functions above |
| `link_student_login(profile, student)` | Guru | Links a pending login to a student record without a login; the person becomes that student. Security definer. See "Coordinators and roles" |
| `reassign_mentees(students, to)` | Guru | Moves the students to another mentor (an active coordinator or the Guru); returns how many. See "Coordinators and roles" |
| `unlink_student_login(student)` | Guru | Takes the login off a student record; the login goes back to `pending`. Security definer. See "Linking a login to a student" |
| `withdraw_consent(student, note)` | Guru (or the owner in the SQL editor) | Records a withdrawal of consent and freezes the record. See "Withdrawal and erasure (0025)" |
| `erase_student(student, reason, request_ref)` | Guru (or the owner in the SQL editor) | Erases the student, the login and the audit copies; leaves a tombstone. See "Withdrawal and erasure (0025)" |
| `import_students(rows)` | Guru | Saves up to 500 adult students, each row on its own; returns the roll number or the error per row. See "Importing students" |
| `save_settings(values)` | Guru | Saves several settings at once, all or nothing. See "Settings" |
| `mark_notifications_read(ids)` | Guru, coordinator, student | Marks the person's own due notices read (the given ids, or all with `null`); returns how many. Security definer. See "Notifications inbox" |
| `inbox_unread_count()` | Anyone signed in | The person's unread notices that are due. See "Notifications inbox" |
| `class_report(from, to, mentor)` | Guru, coordinator (own mentees) | The reports C21 and G8 as one JSON object. See "Reports" |
| `register_push_token(token, platform)` | Guru, coordinator, student | Saves this phone's Expo push token for the signed-in person, taking it over from another login on the same phone; at most 5 phones each. Security definer. Errors `not_allowed`, `bad_token`, `bad_platform`. See "Announcements" → "Push notifications" |
| `claim_due_push()`, `release_push_claim(ids)` | Only the Edge Function (service role) | Mark waiting announcements notified and return the phones to notify; put them back when nothing could be sent |
| `release_assessment`, `mark_assessment_seen`, `submit_assessment`, `review_submission`, `remind_assessment` | See "Assessments (Phase 2)" | Phase 2 (0016) |
| `claim_push_outbox()`, `release_push_outbox(ids)`, `claim_expired_submission_files()`, `release_submission_files(ids)` | Only the Edge Function (service role) | Send the queued assessment and promotion notifications; delete expired recordings (0016) |
| `review_submission(…, p_voice_note)` | See "Media (Phase 2)" | Phase 2 (0020) replaces 0016's version |
| `next_level`, `promotion_criteria`, `nominate_for_promotion`, `give_promotion_feedback`, `decide_promotion`, `withdraw_nomination`, `promotion_ready_students`, `promotion_home` | See "Promotion approval (Phase 2)" | Phase 2 (0017) |
| `decide_material_suggestion`, `issue_inventory_item`, `return_inventory_item`, `check_inventory_item`, `save_duty_shift` | See "Team tools (Phase 2)" | Phase 2 slice 8 (0023) |
| `record_fund_entry`, `decide_fund_entry`, `withdraw_fund_entry`, `reverse_fund_entry`, `fund_balance`, `is_treasurer`, `is_fund_keeper` | See "Class fund (Phase 2)" (0026) |
| `ig_sloka_of_day`, `set_theme_slokas`, `is_ig_editor`, `ig_reader` | See "Ishtagoshti (Phase 2)" | Phase 2 (0021) |
| `ig_my_state`, `ig_join`, `ig_send_parent_code`, `ig_confirm_parent`, `ig_leave`, `ig_subscriber_list`, `ig_subscriber_weeks`, `ig_block_subscriber` | See "Ishtagoshti subscribers (Phase 2)" | Phase 2 slice 7 (0025) |
| `rsvp_event`, `event_counts`, `event_people_list`, `event_student_list`, `set_event_performers`, `mark_event_attendance`, `remind_event`, `vote_poll`, `poll_state`, `poll_voters`, `remind_poll` | See "Events and polls (Phase 2)" | Phase 2 (0022) |

The Storage rules `announcement_file_readable`, `announcement_file_uploadable`,
`announcement_file_deletable` and `announcement_file_path_ok` are run by row-level security as
the person asking, so signed-in people may execute them; each answers only yes or no about that
person's own access. The same holds for `material_file_readable`, `material_file_uploadable`,
`material_file_deletable` and `youtube_link_ok` (0013), `video_link_ok` (0020), and `ig_audio_readable`, `ig_audio_uploadable` and `ig_audio_path_ok` (0021), and `audience_profiles`, `clean_audience`, `event_visible_to` and `poll_is_closed` (0022).

Internal functions (not called by the app, and not allowed to): `refresh_student_statuses`,
`close_open_visits`, `send_due_push`, `handle_new_user`, `handle_user_confirmed`,
`link_login_to_student`, `link_student_email`, `assign_roll_no`, `check_minor_consent`, the guard
and audit triggers (including `guard_student_progress`, `audit_student_progress`,
`guard_announcement`, `guard_announcement_attachments`, `guard_announcement_notified`,
`guard_group`, `guard_announcement_reply`, `guard_syllabus_item`, `protect_syllabus_item`,
`guard_progress_item_in_use`, `guard_material`, `guard_profile_details`, `guard_profile_admin`, `guard_student_mentor`,
`follow_mentor_tasks`, `guard_setting`, `audit_setting`, `guard_centre`, `guard_centre_details`,
`inbox_on_announcement`, `inbox_on_read`, `guard_student_level`, `guard_taal`, `inbox_on_push_outbox`, `guard_profile_ig_editor`, `guard_ig_sloka`, `guard_ig_theme` and `guard_ig_pin`), `inbox_kind_for_url` (0019),
`inbox_sync_announcement`, `inbox_cleanup`, the promotion helpers `promotion_push_line`,
`queue_staff_push`, `promotion_tell_guru`, `queue_student_promoted`, `submission_file_expired` (0017),
the events and polls helpers `audience_students`, `event_people`, `guard_event`, `guard_event_delete`, `guard_poll`,
`guard_poll_delete`, `event_push_line`, `queue_people_push`, `event_notify`, `poll_notify`, `events_polls_daily` (0022),
the team-tools helpers `team_push_line`, `queue_team_push`, `guru_ids`, `inventory_note`, `duty_daily`
and the triggers `guard_material_suggestion`, `notify_material_suggestion`, `guard_inventory_item`,
`inventory_item_added`, `inventory_check_recorded`, `guard_duty_shift`, `guard_duty_assignment` (0023),
the security-round triggers `guard_student_frozen`, `note_level_change`, `release_student_login`,
`guard_consent`, `recheck_minor_consent`, `refuse_withdrawn` and the check `privacy_caller_ok` (0025),
and the helpers `my_role`, `is_guru`, `is_staff`,
`setting_int`, `today_ist`.

## Scheduled jobs (pg_cron, times in UTC)

| Job | Runs | Does |
|---|---|---|
| `mridanga-status-refresh` | 00:30 UTC = 06:00 IST | `refresh_student_statuses()` — ends expired pauses, moves quiet students on, creates call tasks, flags overdue ones |
| `mridanga-close-visits` | 15:30 UTC = 21:00 IST | `close_open_visits()` — closes visits left open, at the centre's closing time |
| `mridanga-push` | Every minute | `send_due_push()` — calls the Edge Function `notify-announcements` when a published announcement waits for its push notification; does nothing while push is not set up (0011); since 0016 also when an assessment or promotion notification of the last day waits in `push_outbox` |
| `mridanga-inbox-cleanup` | 01:00 UTC = 06:30 IST | `inbox_cleanup()` — deletes inbox notices older than a year (0015) |
| `mridanga-assessments` | 03:30 UTC = 09:00 IST | `assessment_daily()` — reminders for assessments due today or tomorrow that are not sent yet; asks the Edge Function (`{"cleanup": true}`) to delete recordings 30 days past their review (0016); level-up ones 30 days after the promotion decision (0017) |
| `mridanga-duty` | 12:30 UTC = 18:00 IST | `duty_daily()` — reminds everyone on tomorrow's duty shifts, once (0023) |
| `mridanga-events-polls` | 03:30 UTC = 09:00 IST | `events_polls_daily()` — reminds those going or maybe of an event tomorrow, and those who have not voted on a poll closing within 24 hours; each once (0022) |

## Who can see what

| Data | Student | Coordinator | Guru |
|---|---|---|---|
| Own student record, visits, progress, level history | Read (while the login is an active student) | Read / write | Read / write |
| Other students | — | Read / write | Read / write / delete |
| Guardians | — | Read / write (a minor keeps one) | Read / write (a minor keeps one) |
| Consents | — | Read; add (verified by themselves, now) | Read; add; revoke or delete (a minor keeps a current one, unless withdrawn) |
| Erasure tombstones (`erasures`) | — | — | Read |
| Call logs, follow-up tasks, status history | — | Read / write | Read / write |
| Materials | Approved ones up to own level | All; suggest (C18); take back or remove own suggestion | All; add, edit, delete; add or decline suggestions |
| Material files (Storage) | Those on materials they can read | All on materials, and own uploads; upload for a suggestion (10 a day) | All; upload; delete any |
| Own name and phone | Read / write | Read / write | Read / write |
| Announcements | Published ones addressed to them | All, can post; edit, pin or delete own | All, can post; edit, pin or delete any |
| Read receipts | Own; can add | All (for "seen by"); add own | All; add own |
| Replies to announcements | Own; can add | Own, and all replies to their own announcements; can add | All; can add; can delete |
| Photos and PDFs on announcements (Storage) | Those on announcements they can read | All on announcements, and own uploads; upload; delete own uploads and files on own announcements | All; upload; delete any |
| Push tokens | Own; delete own | Own; delete own | Own; delete own |
| Notifications inbox | Own, once due; mark own read | Same | Same |
| Reports (`class_report`) | — | Own mentees | Everyone, or one coordinator's mentees |
| Groups | Name of the groups they are in | All; create, rename, switch off, add or remove members | Same as coordinator |
| Staff names (`staff_names`) | Guru and coordinators' names only | Same | Same |
| Settings, levels, syllabus, centres | Read | Read | Read / write (settings through `save_settings`, checked) |
| Roles, switching a login off, duty hours of others | — | — | Write (not their own role; Guru role only in the dashboard) |
| Audit log | — | — | Read |
| Assessments (Phase 2) | Those given to them, with the release notes and files | Sent ones; create none | All, drafts too; create, send, delete unreleased |
| Assessment assignments, submissions, tracker | Own; submit through `submit_assessment` | All; release, remind, review through the functions | Same as coordinator |
| Assessment files (Storage) | Files of their assessments and their own recordings; upload audio or video while one is open (10 a day) | All on sent assessments and all recordings | All; upload; delete any |
| Promotion nominations and answers (Phase 2) | — (a push when promoted) | All; nominate, answer, withdraw own, through the functions | All; nominate, decide, withdraw any |
| A student's level | Read | Read (changed only by the Guru) | Read / write; Promote |
| Inventory items, loans (Phase 2) | Items they hold now and their own loans | All, with history; lend, take back, check through the functions | Same; add, edit, retire, delete one never lent |
| Duty roster (Phase 2) | — | All shifts and who is on them | All; plan, change, delete |
| Ishtagoshti slokas, themes, pins (Phase 2) | Published ones | Published ones; editors (marked by the Guru) all, and write | All; write; marks editors |
| Ishtagoshti notes, memorised ticks | Own only | Own notes; students' ticks (not public subscribers') | Own notes; all ticks |
| Ishtagoshti subscribers (Phase 2) | — | — (not even their profiles) | All; block, unblock |
| Recitations (Storage) | Those on published slokas | Same; editors all, upload, delete | All; upload; delete |
| Events (Phase 2) | Those for them, or where they perform | All; create; edit, cancel, delete own | All; create; edit, cancel, delete any |
| Event answers, performers, attendance | Own answer (through `rsvp_event`), own part and attendance; counts only | All by name; performers, attendance, Remind through the functions | Same as coordinator |
| Polls (Phase 2) | Those for them; vote through `vote_poll`; results when the poll allows | All; create; edit, close, delete own; who voted, and what unless anonymous | All; same for any poll |
| Poll votes | Own choice (through `poll_state`) | Never read directly | Never read directly |
| Class fund (Phase 2) | Nothing (no money is shown to students or parents) | All entries, bills, the balance; read only (a treasurer records, reverses, and approves the Guru's own) | All; record, approve or decline, reverse; treasurers and categories |

A **public Ishtagoshti subscriber** (0025) reads only published slokas, themes, pins and their
recitations, and its own profile, subscription row, notes and ticks. A login still waiting for a role
(`pending`) reads nothing at all.

## Changing the database

1. **Never edit a migration that has been applied.** Add a new file: `0003_short_name.sql`, `0004_...`.
2. Every new table: `enable row level security`, policies for each role, and `COMMENT ON` for the
   table and its non-obvious columns.
3. Every new function: `revoke execute ... from public, anon, authenticated`, then `grant` it only
   to the role that should run it.
4. Run the smoke test (below) and add a check for the new rule.
5. Update this document and, if a rule changed, add an entry to [DECISIONS.md](DECISIONS.md).

## Testing a migration before it goes live

`supabase/tests/smoke-test.mjs` runs every migration and `seed.sql` on an in-memory Postgres
([PGlite](https://pglite.dev)) on your own computer, then checks the rules that protect student
data: login linking, the profile guard, registration and consent, attendance marking, the
student overview, follow-up calls, syllabus ticks, announcements with their read receipts,
edits, staff names and private replies, groups, the home-screen numbers, photos and PDFs (who
may upload, open and delete a file), push tokens and the push queue, the inbox, the reports and the centre checks,
assessments (Phase 2: drafts, releases, submitting, reviews, reminders, the push queue, keeping files),
promotion approval (criteria, nominate, answers, Promote / Not yet / More feedback, only the Guru changes
a level), practice tools (taals, the practice log), Phase 2 notices in the inbox, who may run each function,
and row-level security. It needs only Node.js, no database server and no Supabase account.
`npm test` also runs `push-messages.test.mjs`, which checks how the Edge Function words and
batches the notifications (Node 23.6 or later reads its TypeScript directly).

```bash
cd supabase/tests
npm install
npm test
```

It imitates Supabase's `auth` schema, roles, `storage.objects` and the service role, which is
close but not exact: the bucket's size and type limits, pg_net and the Vault are not imitated.
After it passes, still run a new migration on a test project before the live one.
