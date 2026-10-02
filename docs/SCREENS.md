# Screens

The Phase 1 screens and how far each one is. Screen numbers (A1, C2, G4 ...) come from the
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
| A1 | Login: sign in, create an account, forgot and reset password; under the saffron band with the drum mark | Built | `app/src/app/sign-in.tsx`, `sign-up.tsx`, `forgot-password.tsx`, `reset-password.tsx` |
| — | Waiting for access (signed in, no role yet) | Built | `app/src/app/pending.tsx` |
| A2 | Notifications inbox (push notifications themselves work on Android: see C15, S10) | | |
| A3 | Profile and app language | | |

## Student

| # | Screen | Status | Code |
|---|---|---|---|
| S1 | Home (tab): saffron header with the drum mark, "Hare Krishna", the name and the maha-mantra line; a large My QR button (works without internet), visits this week (from Monday) and days since the last visit, my level with syllabus progress, the latest 3 announcements with "New" on unopened ones and the number of new ones, link to all announcements, language switch; on the Android app "A new version is ready" with Restart, and the version line | Built | `app/src/app/student/(tabs)/index.tsx`, `app/src/data/home.ts`, `app/src/components/home-header.tsx`, `stat-tile.tsx`, `account-footer.tsx`, `update-notice.tsx` |
| S3 | My QR card (tab): the code the coordinator scans at the door; works without internet (the copy saved on the phone shows at once, before the server answers) | Built | `app/src/app/student/(tabs)/my-qr.tsx`, `app/src/components/qr-code.tsx`, `app/src/data/my-student.ts` |
| S4 | Learn: my level's syllabus and lessons | | |
| S9 | Attendance history | | |
| S10 | Announcements (tab): the ones addressed to me, pinned first, "New" until opened, who posted it, "Edited" when changed, its photos and PDFs; opening one tells the coordinator it was seen; a private reply to the author, with my earlier replies. On Android a push notification opens it | Built | `app/src/app/student/(tabs)/announcements.tsx`, `app/src/app/student/announcements/[id].tsx`, `app/src/data/announcements.ts`, `app/src/components/announcement-card.tsx`, `attachment-list.tsx`, `reply-box.tsx`, `reply-card.tsx`, `app/src/lib/push.ts` |

## Coordinator

| # | Screen | Status | Code |
|---|---|---|---|
| C1 | Dashboard (Home tab, `/staff`): saffron header, a big Mark attendance button (C5), here now (opens C6), today's visits (opens C5), calls due for my students (opens C10), new joiners of the last 4 weeks with their visits (each opens C8), the ring of modules around the drum (Students, Attendance, Here now, Calls, Announcements, Groups; Instruments and Events marked under construction, opening Coming soon), language switch; pull down to refresh on a phone; on the Android app "A new version is ready" with Restart, and the version line. Reviews pending come with assessments (Phase 2) | Built | `app/src/screens/coordinator-home.tsx` (shown by `app/src/app/staff/(tabs)/index.tsx`), `app/src/data/home.ts`, `app/src/components/staff-shortcuts.tsx`, `app/src/components/update-notice.tsx` |
| C2 | Register a student (photo comes later) | Built | `app/src/app/staff/register.tsx`, `app/src/data/students.ts` |
| C3 | Guardian consent (under 18): part of the C2 form, shown when the date of birth is under 18 | Built | same as C2 |
| C5 | Mark attendance (tab): scan a QR code or search a name and tap | Built | `app/src/app/staff/(tabs)/attendance.tsx`, `app/src/data/attendance.ts` |
| C6 | Who is here now, with "Check out all" for closing time | Built | `app/src/app/staff/here-now.tsx` |
| C7 | Student list (tab): Register a student at the top, search by name or roll number; filter by level, status, mentor, days since last visit; two columns on a laptop, pull down to refresh on a phone | Built | `app/src/app/staff/(tabs)/students.tsx`, `app/src/data/student-overview.ts` |
| C8 | Student profile: details as a compact grid, parent and consent (minors, staff only), follow-up calls, visits, syllabus progress (read-only; a button opens C9), level history; log a call, check in or out | Built | `app/src/app/staff/students/[id].tsx`, `app/src/data/student-profile.ts` |
| C9 | Syllabus tick-off: every level's items in order with a progress bar; one tap ticks (dated today, your name), or "Tick with a remark" in one step; untick asks first; says when the student's level is complete (moving up stays the Guru's decision); opened from C8 | Built | `app/src/app/staff/syllabus/[id].tsx`, `app/src/data/syllabus.ts`, `app/src/components/syllabus-item-card.tsx`, `app/src/components/progress-bar.tsx` |
| C10 | Follow-up queue (tab "Calls"): needs the Guru, call due, call later, no call planned; everyone or my students; two columns on a laptop, pull down to refresh on a phone | Built | `app/src/app/staff/(tabs)/follow-up.tsx`, `app/src/data/follow-up.ts` |
| C11 | Call log: phone the student or parent, then outcome, reason, comment (required), date; "Stopped coming" asks once more | Built | `app/src/app/staff/call/[id].tsx`, `app/src/data/follow-up.ts` |
| C15 | Announcements (tab): list with "seen by N of M", the number of replies and of files (two columns on a laptop, pull down to refresh on a phone); post (title, message, up to 3 photos or PDFs with a photo-consent reminder, audience as chips with icons: all / level / my mentees / staff / group, pin, now or a later time); one announcement with its photos and PDFs, the not-seen list, the private replies (author and Guru; the Guru can delete one), edit (files too; "Edited" once published; the time only while scheduled), pin or unpin, delete (author or Guru, asks first; its files go too). A push notification goes to Android phones when it is published | Built | `app/src/app/staff/(tabs)/announcements.tsx`, `app/src/app/staff/announcements/new.tsx`, `[id].tsx`, `edit/[id].tsx`, `app/src/data/announcements.ts`, `app/src/data/announcement-files.ts`, `app/src/components/announcement-form.tsx`, `attachment-picker.tsx`, `attachment-list.tsx` |
| — | Groups: list with member counts; make a group; one group: rename, purpose, switch off or on, members, add students with the app and staff (number to be given by the team) | Built | `app/src/app/staff/groups/index.tsx`, `[id].tsx`, `app/src/data/groups.ts` |
| — | Coming soon: what the Instruments and Events circles of the home's ring open; says in one line what the module will do, with an "Under construction" label and a way back ([DECISIONS.md #39](DECISIONS.md)) | Built | `app/src/app/staff/coming-soon.tsx` |
| C21 | My reports | | |

## Guru

| # | Screen | Status | Code |
|---|---|---|---|
| G1 | Dashboard (Home tab, `/staff`): saffron header, a big Mark attendance button (C5), students who came this week, students in class, new joiners, follow-ups overdue or escalated (opens C10); students per level and per status; overdue and escalated follow-ups per coordinator; the ring of modules around the drum (as on C1); language switch; pull down to refresh on a phone; on the Android app "A new version is ready" with Restart, and the version line. Visit trend, practice hours and the level-up queue come later | Built | `app/src/screens/guru-home.tsx` (shown by `app/src/app/staff/(tabs)/index.tsx`), `app/src/data/home.ts`, `app/src/components/staff-shortcuts.tsx`, `app/src/components/update-notice.tsx` |
| G2 | Coordinators: add, deactivate, reassign mentees | | |
| G3 | Students: whole database, Excel import | | |
| G4 | Levels and syllabus editor | | |
| G5 | Materials library | | |
| G8 | Reports (basic) | | |
| G9 | Centres and geofence | | |
| G10 | Settings | | |
| G11 | Audit log | | |

Coordinator screens that the Guru also uses live in `app/src/app/staff/`
(see ARCHITECTURE.md "Navigation by role").

## Build order

~~A1~~ → ~~C2, C3~~ → ~~C5, C6~~ → ~~C7, C8~~ → ~~C10, C11~~ → ~~C9~~ → G4, G5 → ~~C15, S10~~ → ~~S1~~, ~~S3~~, S4, S9 →
~~G1~~, ~~C1~~, C21, G8 → G2, G3 → G9, G10, G11.
