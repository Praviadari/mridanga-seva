# Screens

The Phase 1 screens and how far each one is. Screen numbers (A1, C2, G4 ...) come from the
screen list the team approved; code comments use them. Phase 2 and 3 screens are added here when
their building starts.

Status: **Built** works end to end · **Placeholder** a simple stand-in exists · blank = not started.

## Common (everyone)

| # | Screen | Status | Code |
|---|---|---|---|
| A1 | Login: sign in, create an account, forgot and reset password | Built | `app/src/app/sign-in.tsx`, `sign-up.tsx`, `forgot-password.tsx`, `reset-password.tsx` |
| — | Waiting for access (signed in, no role yet) | Built | `app/src/app/pending.tsx` |
| A2 | Notifications inbox | | |
| A3 | Profile and app language | | |

## Student

| # | Screen | Status | Code |
|---|---|---|---|
| S1 | Home: announcements, visits this week, My QR | Placeholder (has the button to My QR) | `app/src/app/student/index.tsx` |
| S3 | My QR card: the code the coordinator scans at the door; works without internet | Built | `app/src/app/student/my-qr.tsx`, `app/src/components/qr-code.tsx`, `app/src/data/my-student.ts` |
| S4 | Learn: my level's syllabus and lessons | | |
| S9 | Attendance history | | |
| S10 | Announcements: the ones addressed to me, pinned first, "New" until opened, who posted it, "Edited" when changed; opening one tells the coordinator it was seen; a private reply to the author, with my earlier replies | Built | `app/src/app/student/announcements/index.tsx`, `[id].tsx`, `app/src/data/announcements.ts`, `app/src/components/announcement-card.tsx`, `reply-box.tsx`, `reply-card.tsx` |

## Coordinator

| # | Screen | Status | Code |
|---|---|---|---|
| C1 | Dashboard: here now, today's visits, follow-ups due, new joiners | Placeholder | `app/src/app/coordinator/index.tsx` |
| C2 | Register a student (photo comes later) | Built | `app/src/app/staff/register.tsx`, `app/src/data/students.ts` |
| C3 | Guardian consent (under 18): part of the C2 form, shown when the date of birth is under 18 | Built | same as C2 |
| C5 | Mark attendance: scan a QR code or search a name and tap | Built | `app/src/app/staff/attendance.tsx`, `app/src/data/attendance.ts` |
| C6 | Who is here now, with "Check out all" for closing time | Built | `app/src/app/staff/here-now.tsx` |
| C7 | Student list: search by name or roll number; filter by level, status, mentor, days since last visit | Built | `app/src/app/staff/students/index.tsx`, `app/src/data/student-overview.ts` |
| C8 | Student profile: details, parent and consent (minors, staff only), follow-up calls, visits, syllabus progress (read-only; a button opens C9), level history; log a call, check in or out | Built | `app/src/app/staff/students/[id].tsx`, `app/src/data/student-profile.ts` |
| C9 | Syllabus tick-off: every level's items in order with a progress bar; one tap ticks (dated today, your name), or "Tick with a remark" in one step; untick asks first; says when the student's level is complete (moving up stays the Guru's decision); opened from C8 | Built | `app/src/app/staff/syllabus/[id].tsx`, `app/src/data/syllabus.ts`, `app/src/components/syllabus-item-card.tsx`, `app/src/components/progress-bar.tsx` |
| C10 | Follow-up queue: needs the Guru, call due, call later, no call planned; everyone or my students | Built | `app/src/app/staff/follow-up.tsx`, `app/src/data/follow-up.ts` |
| C11 | Call log: phone the student or parent, then outcome, reason, comment (required), date; "Stopped coming" asks once more | Built | `app/src/app/staff/call/[id].tsx`, `app/src/data/follow-up.ts` |
| C15 | Announcements: list with "seen by N of M" and the number of replies; post (title, message, audience all / level / my mentees / staff / group, pin, now or a later time); one announcement with the not-seen list, the private replies (author and Guru; the Guru can delete one), edit ("Edited" once published; the time only while scheduled), pin or unpin, delete (author or Guru, asks first). Images and files come later | Built | `app/src/app/staff/announcements/index.tsx`, `new.tsx`, `[id].tsx`, `edit/[id].tsx`, `app/src/data/announcements.ts`, `app/src/components/announcement-form.tsx` |
| — | Groups: list with member counts; make a group; one group: rename, purpose, switch off or on, members, add students with the app and staff (number to be given by the team) | Built | `app/src/app/staff/groups/index.tsx`, `[id].tsx`, `app/src/data/groups.ts` |
| C21 | My reports | | |

## Guru

| # | Screen | Status | Code |
|---|---|---|---|
| G1 | Dashboard | Placeholder | `app/src/app/guru/index.tsx` |
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

~~A1~~ → ~~C2, C3~~ → ~~C5, C6~~ → ~~C7, C8~~ → ~~C10, C11~~ → ~~C9~~ → G4, G5 → ~~C15, S10~~ → S1, ~~S3~~, S4, S9 →
G1, C1, C21, G8 → G2, G3 → G9, G10, G11.
