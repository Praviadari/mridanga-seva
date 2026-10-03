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
| `0012_assessments.sql` | **Phase 2, branch `phase2-assessments`, TEST only.** Assessments, releases, assignments and submissions with their rules; the private bucket `assessment-files`; the push queue `push_outbox`; the daily reminder job ([DECISIONS.md #43](DECISIONS.md)). See "Assessments (Phase 2)" |

Every table and important column also carries a `COMMENT ON` description, so you can read it in
the Supabase dashboard (Table Editor → table → description).

Dummy data for a test project is in [`supabase/seed.sql`](../supabase/seed.sql): a placeholder
syllabus, 15 fictional students covering every status (some minors, with guardians and written
consent), sample visits, groups and an announcement. Never run it on the live project.

## Tables by area

| Area | Tables | Notes |
|---|---|---|
| Settings | `settings` | Day limits for follow-up, list of reasons for leaving. Change here, not in code |
| Places | `centres` | One row per class location (Abids today) with GPS point, radius and opening hours |
| People | `profiles` | One row per login: role, name, language, treasurer flag |
| Students | `students`, `guardians`, `consents`, `roll_counters` | A student record can exist without a login |
| Attendance | `visits` | One row per check-in; `check_out` empty while the student is still there |
| Follow-up | `call_logs`, `follow_up_tasks`, `status_history` | Every call and every status change is kept |
| Learning | `levels`, `syllabus_items`, `student_progress`, `level_history`, `materials` | Three levels; each has an ordered syllabus |
| Communication | `announcements`, `announcement_reads`, `announcement_replies`, `groups`, `group_members`, `push_tokens` | Groups replace the WhatsApp groups. Views `announcement_audience` and `announcement_seen` give "seen by", `announcement_reply_list` the replies with names, `group_summary` the member counts. Photos and PDFs are files in the Storage bucket `announcement-files`, listed in `announcements.attachments` |
| Assessments (Phase 2) | `assessments`, `assessment_releases`, `assessment_assignments`, `assessment_submissions`, `push_outbox` | Views `assessment_tracker` (C13) and `assessment_summary` (counts). Files in the Storage bucket `assessment-files` |
| Practice (Phase 2) | `taals`, `practice_logs` | Taals the S5 player loops (the Guru edits them); practice minutes from the S5 timer or typed in (S6). See "Practice tools (Phase 2)" |
| Audit | `audit_log` | Who changed a student, profile, call log, level, syllabus tick or announcement, or deleted a reply, and when |

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

## Student overview

`student_overview` is a view: one row per student with the list columns of `students` (roll
number, name, level, status, pause date, mentor, joined) plus:

| Column | Meaning |
|---|---|
| `last_visit_at` | Check-in time of the latest visit; empty if the student has never come |
| `days_since_visit` | Whole days (India time) since that visit, or since joining when there is none, the same count the daily job uses for Irregular and Inactive |
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
| This week | Monday to today, India time: `week_start_ist()` |
| New joiner | `joined_on` within the last `settings.new_joiner_weeks` weeks (4), and not *Left* |
| In class | Status is not *Left* |
| Calls due for my students (C1) | Students with an open follow-up task due today or earlier, or escalated, that is assigned to me or whose mentor I am: the *needs the Guru* and *call due* groups of C10 for "My students" |
| Overdue (G1) | Students with an open task past its due date, not escalated. Escalated ones are counted separately. Grouped by the task's assignee (the mentor when the task was made); no assignee = the student had no mentor |

## Assessments (Phase 2)

Migration 0012, on the branch `phase2-assessments`, run on the TEST project only until Phase 2
goes live ([DECISIONS.md #43](DECISIONS.md)). Screens G6, C12, C13, C14, S7 (SCREENS.md).

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

Migration 0014, on the branch `phase2-promotion`, TEST project only until Phase 2 goes live
([DECISIONS.md #45](DECISIONS.md)). Screens C22, C23, G7 (SCREENS.md). A student moves up only
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
before 0014 a coordinator's phone could change it through the `staff_update` policy. The
dashboard and the SQL editor are not stopped.

**Keeping level-up recordings.** A recording sent to the Guru stays while a nomination using it is
open, and is deleted 30 days after that nomination is decided (promoted, not yet or withdrawn); one
never used for a nomination goes 180 days after its review (`submission_file_expired`, used by
`claim_expired_submission_files` and `assessment_daily`, both redefined in 0014).

**Notifications** go through `push_outbox` (0012), worded by `promotion_push_line` in the
person's language, to `/staff/promotion/<nomination>` or `/student/progress`; never to the person
whose action it is. The Edge Function accepts these two screens since this branch, so it must be
deployed again from it (the slice-1 redeploy is still pending on TEST).

## Practice tools (Phase 2)

Migration 0016, on the branch `phase2-practice`, TEST project only until Phase 2 goes live
([DECISIONS.md #49](DECISIONS.md)); renumbered with the other Phase 2 files at the merge. Screens S5,
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

Roles other than `student` are given by the Guru in the app, or for the very first Guru, in the
Supabase dashboard (OPERATIONS.md). The trigger `profiles_guard` stops app users other than the
Guru from changing `role`, `is_treasurer` or `active`; the dashboard is not blocked.

## Database functions (call these from the app)

Supabase lets the app's roles (`anon`, `authenticated`) run any function unless told otherwise,
so every function is revoked from them and granted only where needed
([DECISIONS.md #14](DECISIONS.md)).

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
| `week_start_ist()` | Anyone signed in | Monday of this week in India; used by the functions above |
| `register_push_token(token, platform)` | Guru, coordinator, student | Saves this phone's Expo push token for the signed-in person, taking it over from another login on the same phone; at most 5 phones each. Security definer. Errors `not_allowed`, `bad_token`, `bad_platform`. See "Announcements" → "Push notifications" |
| `claim_due_push()`, `release_push_claim(ids)` | Only the Edge Function (service role) | Mark waiting announcements notified and return the phones to notify; put them back when nothing could be sent |
| `release_assessment`, `mark_assessment_seen`, `submit_assessment`, `review_submission`, `remind_assessment` | See "Assessments (Phase 2)" | Phase 2 (0012) |
| `claim_push_outbox()`, `release_push_outbox(ids)`, `claim_expired_submission_files()`, `release_submission_files(ids)` | Only the Edge Function (service role) | Send the queued assessment notifications; delete expired recordings (0012) |
| `next_level`, `promotion_criteria`, `nominate_for_promotion`, `give_promotion_feedback`, `decide_promotion`, `withdraw_nomination`, `promotion_ready_students`, `promotion_home` | See "Promotion approval (Phase 2)" | Phase 2 (0014) |

The Storage rules `announcement_file_readable`, `announcement_file_uploadable`,
`announcement_file_deletable` and `announcement_file_path_ok` are run by row-level security as
the person asking, so signed-in people may execute them; each answers only yes or no about that
person's own access. The same holds for `material_file_readable`, `material_file_uploadable`,
`material_file_deletable` and `youtube_link_ok` (0013).

Internal functions (not called by the app, and not allowed to): `refresh_student_statuses`,
`close_open_visits`, `send_due_push`, `handle_new_user`, `handle_user_confirmed`,
`link_login_to_student`, `link_student_email`, `assign_roll_no`, `check_minor_consent`, the guard
and audit triggers (including `guard_student_progress`, `audit_student_progress`,
`guard_announcement`, `guard_announcement_attachments`, `guard_announcement_notified`,
`guard_group`, `guard_announcement_reply`, `guard_syllabus_item`, `protect_syllabus_item`,
`guard_progress_item_in_use`, `guard_material`, `guard_profile_details` and `guard_student_level`), the promotion helpers `promotion_push_line`, `queue_staff_push`, `promotion_tell_guru`, `queue_student_promoted`, `submission_file_expired` (0014), and the helpers `my_role`, `is_guru`, `is_staff`,
`setting_int`, `today_ist`.

## Scheduled jobs (pg_cron, times in UTC)

| Job | Runs | Does |
|---|---|---|
| `mridanga-status-refresh` | 00:30 UTC = 06:00 IST | `refresh_student_statuses()` — ends expired pauses, moves quiet students on, creates call tasks, flags overdue ones |
| `mridanga-close-visits` | 15:30 UTC = 21:00 IST | `close_open_visits()` — closes visits left open, at the centre's closing time |
| `mridanga-push` | Every minute | `send_due_push()` — calls the Edge Function `notify-announcements` when a published announcement waits for its push notification; does nothing while push is not set up (0011); since 0012 also when an assessment notification of the last day waits in `push_outbox` |
| `mridanga-assessments` | 03:30 UTC = 09:00 IST | `assessment_daily()` — reminders for assessments due today or tomorrow that are not sent yet; asks the Edge Function (`{"cleanup": true}`) to delete recordings 30 days past their review (0012); level-up ones 30 days after the promotion decision (0014) |

## Who can see what

| Data | Student | Coordinator | Guru |
|---|---|---|---|
| Own student record, visits, progress, level history | Read | Read / write | Read / write |
| Other students | — | Read / write | Read / write / delete |
| Guardians, consents | — | Read / write | Read / write |
| Call logs, follow-up tasks, status history | — | Read / write | Read / write |
| Materials | Approved ones up to own level | All (suggesting = Phase 2) | All; add, edit, delete |
| Material files (Storage) | Those on materials they can read | All on materials, and own uploads | All; upload; delete any |
| Own name and phone | Read / write | Read / write | Read / write |
| Announcements | Published ones addressed to them | All, can post; edit, pin or delete own | All, can post; edit, pin or delete any |
| Read receipts | Own; can add | All (for "seen by"); add own | All; add own |
| Replies to announcements | Own; can add | Own, and all replies to their own announcements; can add | All; can add; can delete |
| Photos and PDFs on announcements (Storage) | Those on announcements they can read | All on announcements, and own uploads; upload; delete own uploads and files on own announcements | All; upload; delete any |
| Push tokens | Own; delete own | Own; delete own | Own; delete own |
| Groups | Name of the groups they are in | All; create, rename, switch off, add or remove members | Same as coordinator |
| Staff names (`staff_names`) | Guru and coordinators' names only | Same | Same |
| Settings, levels, syllabus, centres | Read | Read | Read / write |
| Audit log | — | — | Read |
| Assessments (Phase 2) | Those given to them, with the release notes and files | Sent ones; create none | All, drafts too; create, send, delete unreleased |
| Assessment assignments, submissions, tracker | Own; submit through `submit_assessment` | All; release, remind, review through the functions | Same as coordinator |
| Assessment files (Storage) | Files of their assessments and their own recordings; upload audio or video while one is open (10 a day) | All on sent assessments and all recordings | All; upload; delete any |
| Promotion nominations and answers (Phase 2) | — (a push when promoted) | All; nominate, answer, withdraw own, through the functions | All; nominate, decide, withdraw any |
| A student's level | Read | Read (changed only by the Guru) | Read / write; Promote |

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
may upload, open and delete a file), push tokens and the push queue, assessments (Phase 2: drafts,
releases, submitting, reviews, reminders, the push queue, keeping files), promotion approval (criteria,
nominate, answers, Promote / Not yet / More feedback, only the Guru changes a level), who may run each function,
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
