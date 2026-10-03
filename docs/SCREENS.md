# Screens

The Phase 1 screens and how far each one is (Phase 2 at the end). Screen numbers (A1, C2, G4 ...) come from the
screen list the team approved; code comments use them. Phase 2 and 3 screens are added here when
their building starts.

Status: **Built** works end to end · **Placeholder** a simple stand-in exists · blank = not started.

Since 1 Oct 2026 each role has tabs ([DECISIONS.md #36](DECISIONS.md)): students Home (S1) · My QR (S3) ·
Announcements (S10); the Guru and coordinators Home (G1 or C1) · Attendance (C5) · Students (C7) ·
Calls (C10) · Announcements (C15), at the bottom on a phone and as a sidebar on a wide screen. The other
screens open on top of the tabs with a back button.

## Common (everyone)

| # | Screen | Status | Code |
|---|---|---|---|
| A1 | Login: sign in, create an account, forgot and reset password; under the saffron band with the drum mark and the motto, the card centred on a laptop | Built | `app/src/app/sign-in.tsx`, `sign-up.tsx`, `forgot-password.tsx`, `reset-password.tsx` |
| — | Waiting for access (signed in, no role yet) | Built | `app/src/app/pending.tsx` |
| A2 | Notifications inbox (push notifications themselves work on Android: see C15, S10) | | |
| A3 | Profile and app language: my name and phone (editable), email and role, the language switch, Sign out; a student also sees their roll number, the name on the roll (kept by coordinators) and a button to My QR. Opened from the student ring and from "My profile" at the foot of every home (round 7; no team pick in the doc yet, built on Praveen's brief) | Built | `app/src/screens/my-profile.tsx` (routes `student/profile.tsx`, `staff/profile.tsx`), `app/src/data/my-profile.ts`, `app/src/components/account-footer.tsx` |

## Student

| # | Screen | Status | Code |
|---|---|---|---|
| S1 | Home (tab): saffron header with the drum mark, "Hare Krishna", the name and the maha-mantra line; a large My QR button (works without internet), visits this week (from Monday) and days since the last visit, my level with syllabus progress and a link to S4, the ring of my screens around the drum (My QR, Announcements, My progress, Attendance, My profile; Events under construction, opening Coming soon), the latest 3 announcements with "New" on unopened ones and the number of new ones, link to all announcements, language switch; on the Android app "A new version is ready" with Restart, and the version line; pull down to refresh on a phone | Built | `app/src/app/student/(tabs)/index.tsx`, `app/src/data/home.ts`, `app/src/components/home-header.tsx`, `module-ring.tsx`, `stat-tile.tsx`, `account-footer.tsx`, `update-notice.tsx` |
| S3 | My QR card (tab): the code the coordinator scans at the door; works without internet (the copy saved on the phone shows at once, before the server answers) | Built | `app/src/app/student/(tabs)/my-qr.tsx`, `app/src/components/qr-code.tsx`, `app/src/data/my-student.ts` |
| S4 | My progress: my level's syllabus in order with a tick and the date on the items shown in class, and the progress bar (read-only; opened from the ring on S1); the lessons for the whole level first and each item's lessons under it (YouTube opens in the YouTube app or browser, PDFs and photos in the browser); a retired item shows only when ticked, marked "No longer taught", and does not count | Built | `app/src/app/student/progress.tsx`, `app/src/data/syllabus.ts`, `app/src/data/materials.ts`, `app/src/components/material-row.tsx` |
| — | Coming soon (student area): what Events on the ring opens | Built | `app/src/app/student/coming-soon.tsx`, `app/src/screens/coming-soon.tsx` |
| S9 | Attendance history: my visits by month, newest first, each month with visits and time at class, each visit with day, time in and out and how long; 3 months, then "Show earlier months". Opened from the student ring; staff open the same list from C8 (round 7; no team pick in the doc yet) | Built | `app/src/screens/visit-history.tsx` (routes `student/visits.tsx`, `staff/visits/[id].tsx`), `app/src/data/visits.ts` |
| S10 | Announcements (tab): the ones addressed to me, pinned first, "New" until opened, who posted it, "Edited" when changed, its photos (a strip of squares; one photo large) and PDFs, as one card with a Pinned strip and the facts under it; opening one tells the coordinator it was seen; a private reply to the author, with my earlier replies. On Android a push notification opens it | Built | `app/src/app/student/(tabs)/announcements.tsx`, `app/src/app/student/announcements/[id].tsx`, `app/src/data/announcements.ts`, `app/src/components/announcement-card.tsx`, `announcement-detail.tsx`, `attachment-list.tsx`, `reply-box.tsx`, `reply-card.tsx`, `app/src/lib/push.ts` |

## Coordinator

| # | Screen | Status | Code |
|---|---|---|---|
| C1 | Dashboard (Home tab, `/staff`): saffron header, a big Mark attendance button (C5), here now (opens C6), today's visits (opens C5), calls due for my students (opens C10), new joiners of the last 4 weeks with their visits (each opens C8), the ring of modules around the drum (Students, Attendance, Here now, Calls, Announcements, Groups, Syllabus and lessons; Instruments and Events marked under construction, opening Coming soon), language switch; pull down to refresh on a phone; on the Android app "A new version is ready" with Restart, and the version line. Reviews pending come with assessments (Phase 2) | Built | `app/src/screens/coordinator-home.tsx` (shown by `app/src/app/staff/(tabs)/index.tsx`), `app/src/data/home.ts`, `app/src/components/staff-shortcuts.tsx`, `app/src/components/update-notice.tsx` |
| C2 | Register a student (photo comes later) | Built | `app/src/app/staff/register.tsx`, `app/src/data/students.ts` |
| C3 | Guardian consent (under 18): part of the C2 form, shown when the date of birth is under 18 | Built | same as C2 |
| C5 | Mark attendance (tab): scan a QR code or search a name and tap | Built | `app/src/app/staff/(tabs)/attendance.tsx`, `app/src/data/attendance.ts` |
| C6 | Who is here now, with "Check out all" for closing time | Built | `app/src/app/staff/here-now.tsx` |
| C7 | Student list (tab): Register a student at the top, search by name or roll number; filter by level, status, mentor, days since last visit; two columns on a laptop, pull down to refresh on a phone | Built | `app/src/app/staff/(tabs)/students.tsx`, `app/src/data/student-overview.ts` |
| C8 | Student profile: details as a compact grid, parent and consent (minors, staff only), follow-up calls, visits, syllabus progress (read-only; a button opens C9), level history, "All visits by month" (opens S9); log a call, check in or out | Built | `app/src/app/staff/students/[id].tsx`, `app/src/data/student-profile.ts` |
| C9 | Syllabus tick-off: every level's items in order with a progress bar; one tap ticks (dated today, your name), or "Tick with a remark" in one step; untick asks first; says when the student's level is complete (moving up stays the Guru's decision); opened from C8 | Built | `app/src/app/staff/syllabus/[id].tsx`, `app/src/data/syllabus.ts`, `app/src/components/syllabus-item-card.tsx`, `app/src/components/progress-bar.tsx` |
| C10 | Follow-up queue (tab "Calls"): needs the Guru, call due, call later, no call planned; everyone or my students; two columns on a laptop, pull down to refresh on a phone | Built | `app/src/app/staff/(tabs)/follow-up.tsx`, `app/src/data/follow-up.ts` |
| C11 | Call log: phone the student or parent, then outcome, reason, comment (required), date; "Stopped coming" asks once more | Built | `app/src/app/staff/call/[id].tsx`, `app/src/data/follow-up.ts` |
| C15 | Announcements (tab): list with "seen by N of M", the number of replies and of files (two columns on a laptop, pull down to refresh on a phone); post (title, message, up to 3 photos or PDFs with a photo-consent reminder, audience as chips with icons: all / level / my mentees / staff / group, pin, now or a later time); one announcement as a card (Pinned strip, photo strip, facts with icons) with the not-seen list, the private replies (author and Guru; the Guru can delete one), edit (files too; "Edited" once published; the time only while scheduled), pin or unpin, delete (author or Guru, asks first; its files go too). A push notification goes to Android phones when it is published | Built | `app/src/app/staff/(tabs)/announcements.tsx`, `app/src/app/staff/announcements/new.tsx`, `[id].tsx`, `edit/[id].tsx`, `app/src/data/announcements.ts`, `app/src/data/announcement-files.ts`, `app/src/components/announcement-form.tsx`, `attachment-picker.tsx`, `attachment-list.tsx` |
| — | Groups: list with member counts; make a group; one group: rename, purpose, switch off or on, members, add students with the app and staff (number to be given by the team) | Built | `app/src/app/staff/groups/index.tsx`, `[id].tsx`, `app/src/data/groups.ts` |
| — | Coming soon: what the Instruments and Events circles of the home's ring open; says in one line what the module will do, with an "Under construction" label and a way back ([DECISIONS.md #39](DECISIONS.md)) | Built | `app/src/app/staff/coming-soon.tsx`, `app/src/screens/coming-soon.tsx` |
| C21 | My reports | | |

## Guru

| # | Screen | Status | Code |
|---|---|---|---|
| G1 | Dashboard (Home tab, `/staff`): saffron header, a big Mark attendance button (C5), students who came this week, students in class, new joiners, follow-ups overdue or escalated (opens C10); students per level and per status; overdue and escalated follow-ups per coordinator; the ring of modules around the drum (as on C1); language switch; pull down to refresh on a phone; on the Android app "A new version is ready" with Restart, and the version line. Visit trend, practice hours and the level-up queue come later | Built | `app/src/screens/guru-home.tsx` (shown by `app/src/app/staff/(tabs)/index.tsx`), `app/src/data/home.ts`, `app/src/components/staff-shortcuts.tsx`, `app/src/components/update-notice.tsx` |
| G2 | Coordinators: add, deactivate, reassign mentees | | |
| G3 | Students: whole database, Excel import | | |
| G4 | Levels and syllabus editor ("Syllabus and lessons" on the staff ring): the three fixed levels with counts; per level the items in teaching order with Up / Down, add an item, retired items with Put back; per item edit title and description, its lessons, Retire (ticks stay) or Delete (only when nobody ticked it and no lesson points to it), both asking first. Coordinators read-only | Built | `app/src/app/staff/levels/index.tsx`, `levels/[id].tsx`, `levels/item/[id].tsx`, `app/src/data/syllabus-editor.ts` |
| G5 | Materials library (inside G4's level and item pages): add a YouTube link, a PDF or a photo (10 MB, same picker as announcements) for a level and optionally an item, with an optional note; edit the title, link, note, level and item; delete asks first. Guru only (coordinators' suggestions = C18, Phase 2) | Built | `app/src/app/staff/materials/[id].tsx`, `app/src/data/materials.ts`, `app/src/components/material-row.tsx` |
| G8 | Reports (basic) | | |
| G9 | Centres and geofence | | |
| G10 | Settings | | |
| G11 | Audit log | | |

Coordinator screens that the Guru also uses live in `app/src/app/staff/`
(see ARCHITECTURE.md "Navigation by role").

## Phase 2 (branch `phase2-assessments`, not on main yet)

Slice 1, the assessment flow ([DECISIONS.md #43](DECISIONS.md)). It reaches main and the
volunteers' phones only when Praveen decides; Phase 2 goes live 1 Mar 2027. Each home's ring has an
Assessments circle. Slice 2 is the promotion approval (C22, C23, G7).

| # | Screen | Who | Status | Code |
|---|---|---|---|---|
| G6 | Create assessment: title, instructions, type, level, level-up flag, a rubric (1-8 lines, top score 1-10 each), up to 3 files (photo, PDF, audio, video; 50 MB each) and a link; Send to coordinators or Save as draft; send a draft later, delete one never released | Guru | Built (no edit yet) | `app/src/app/staff/assessments/new.tsx`, `[id].tsx`, `app/src/data/assessments.ts`, `app/src/data/assessment-files.ts` |
| C12 | Assessments from the Guru: the list with level, type, level-up and counts per state; give one to students: notes, a due date (3, 7 or 14 days, or typed), students picked by level and name, "Select all shown" | Coordinator (and Guru) | Built | `app/src/app/staff/assessments/index.tsx`, `release/[id].tsx` |
| C13 | Assessment tracker: each student Not seen / Seen / Submitted / Reviewed / Redo and Late, filters, no-login note, last reminder; "Remind everyone who has not sent it" (push); automatic reminders at 09:00 IST on the day before and the due day | Coordinator (and Guru) | Built | `app/src/app/staff/assessments/[id].tsx`, `app/src/components/assessment-parts.tsx` |
| C14 | Review submission: the recording (Play in the browser view) or link and the student's note; a score per rubric line, a comment, Accept or Ask for a redo, "Send level-up to the facilitator" on a level-up assessment; earlier recordings with their reviews; Remind while nothing is sent. No voice note yet (needs expo-audio) | Coordinator (and Guru) | Built | `app/src/app/staff/assessments/review/[id].tsx` |
| S7 | Assessments: my list (to do first, by due date); one assessment with the instructions, files, the coordinator's note, the rubric; send a recording (an audio or video file, or a link) with a note; the score per line and the comment; send again after a redo. No team pick in the doc; kept by Praveen 3 Oct 2026 | Student | Built | `app/src/app/student/assessments/index.tsx`, `[id].tsx` |

## Build order

~~A1~~ → ~~C2, C3~~ → ~~C5, C6~~ → ~~C7, C8~~ → ~~C10, C11~~ → ~~C9~~ → ~~G4, G5~~ → ~~C15, S10~~ → ~~S1~~, ~~S3~~, ~~S4, S9~~ →
~~G1~~, ~~C1~~, C21, G8 → G2, G3 → G9, G10, G11.
