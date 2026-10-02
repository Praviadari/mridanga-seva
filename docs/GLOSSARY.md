# Glossary

## Mridanga and kirtan terms

| Term | Meaning |
|---|---|
| Mridanga (mṛdaṅga) | Two-headed drum used in Gaudiya Vaishnava kirtan. Also called **khol** in Bengali. Not the South Indian *mridangam* |
| Khol | Bengali name for the mridanga |
| Dayan | The small, high-pitched head, played with the right hand |
| Baya | The large bass head, played with the left hand |
| Syahi | The black circle in the centre of a head |
| Kinar, maidan | The outer ring and the middle field of a head |
| Bol | A syllable naming one stroke, such as *tā*, *ghe*, *dhin* |
| Taal (tala) | A rhythm cycle with a fixed number of beats, such as Kaherva (8) or Dasapahira (16) |
| Kartal | Small hand cymbals that keep time with the mridanga |
| Kirtan | Congregational singing of the holy names |
| Seva | Voluntary service. The class and this app are seva |
| Guru | The senior teacher who leads the class. The English screens call this role **Facilitator**; Telugu and Hindi keep Guru. In the database and code it stays `guru` (DECISIONS.md #40) |
| Sloka | A Sanskrit verse from scripture |
| Ishtagoshti | A gathering of devotees to discuss scripture; in the app, the thematic sloka-study section |

## App terms

| Term | Meaning |
|---|---|
| Visit | One check-in (and later check-out) of a student at a centre. Attendance is counted in visits |
| Open visit | A visit with a check-in but no check-out yet: the student is "here now" |
| QR token | The secret value in a student's QR code (`students.qr_token`). Not the roll number, so a code cannot be guessed. The code's text is `MS1:` followed by the token (DECISIONS.md #17) |
| Check out all | The button on *Who is here now* that closes every open visit at closing time |
| Centre | A place where the class runs. Today only Abids |
| Roll number | Permanent student ID like `MS-2026-0001`. Never changed, never reused |
| My QR card | The screen (S3) that shows the student's QR code on their phone for the coordinator to scan at the door |
| Level | Beginner, Intermediate or Advanced |
| Syllabus item | One thing a student learns within a level; ticked by a coordinator when shown in class |
| Mentor | The coordinator responsible for following up with a student |
| Minor | A student under 18. Needs a parent's written consent before their details are kept |
| Guardian | The parent or other adult who gives consent for a minor |
| Consent | A parent's agreement, recorded per purpose: `data` (keep details), `photo`, `face` (Phase 3) |
| Status | Where a student stands: New, Active, Irregular, Inactive, Paused, Left (see DATABASE.md) |
| Irregular | No visit for 14 days (setting). A follow-up call is due |
| Inactive | No visit for 30 days (setting). Overdue follow-ups are shown to the Guru |
| Call log | Record of a follow-up call: outcome, reason, comment, next date |
| Follow-up task | A reminder for a coordinator to call a student: `call` (first call) or `retry` (after "not reachable") |
| Follow-up queue | Screen C10: everyone who needs a call, grouped as *needs the Guru*, *call due*, *call later* and *no call planned* |
| Escalated | A follow-up task handed to the Guru: several calls with no answer, or no call before the student became Inactive |
| Days since last visit | Whole days (India time) since the student's last check-in, or since joining if they never came. The student list filters by it |
| Call reason code | A short code for why a student stopped coming (`studies`, `health` ...), kept in `settings.call_reasons` and translated by the app (DECISIONS.md #19) |
| Group | A set of people who receive the same announcements; replaces a WhatsApp group |
| Announcement | A message from a coordinator or the Guru to an audience: all students, one level, the author's mentees, staff only, or a group (screens C15, S10) |
| Audience | Who an announcement is for (`announcements.audience`). Coordinators and the Guru see every announcement whatever its audience |
| Pinned | An announcement kept at the top of every list until it is unpinned |
| Scheduled | An announcement whose publish time is still to come: staff see it, students only from that time |
| Read receipt | The note the app saves when a person first opens an announcement (`announcement_reads`) |
| Seen by N of M | On an announcement: M = the people it is addressed to who can open it in the app, N = how many have opened it (DECISIONS.md #25) |
| Edited | Shown on an announcement whose title, message or audience was changed after it was published, with the time (`announcements.edited_at`, DECISIONS.md #27) |
| Reply | A private answer to an announcement, read only by its writer, the announcement's author and the Guru (`announcement_replies`, DECISIONS.md #29) |
| Member | A person in a group: a student who uses the app, a coordinator or the Guru (`group_members`) |
| Switched off (group) | A group no longer offered when posting; old announcements keep it. Groups are switched off, never deleted (DECISIONS.md #28) |
| Home screen | The first screen after signing in: S1 for a student, the dashboard C1 for a coordinator, G1 for the Guru. Its numbers come from one database function each (DECISIONS.md #31) |
| This week | On the home screens: Monday to today, India time (`week_start_ist()`, DECISIONS.md #31) |
| New joiner | A student who joined in the last 4 weeks (`settings.new_joiner_weeks`) and has not left |
| In class | Every student who has not left; the Guru dashboard counts levels among them |
| Overdue follow-up | An open follow-up task whose due date has passed and that is not yet escalated; shown per coordinator on the Guru dashboard |
| Requested screen | The screen a link asked for when the app was opened; shown once the login has been checked (DECISIONS.md #30) |
| File (on an announcement) | A photo or PDF attached to an announcement, at most 3; kept in the private Storage bucket `announcement-files` and listed in `announcements.attachments` (DECISIONS.md #32) |
| Signed link | A link to a private file that works for one hour; the app asks Storage for one each time a file is shown, and only for people who may read the announcement |
| Push notification | A message the phone shows even when the app is closed; sent for a newly published announcement to the Android app (DECISIONS.md #33) |
| Push token | The address Expo gives a phone for push notifications (`ExponentPushToken[...]`), saved in `push_tokens` for the login signed in on that phone |
| Kiosk | The door tablet account (Phase 2), allowed only to check students in and out |
| Pending | A new login that has no role yet |
| Area | In the app's code: the part of the app a person may use now (signed out, pending, guru, coordinator, student). See ARCHITECTURE.md "Navigation by role" |
| Linking | Joining a login to the student record with the same email, once the email is confirmed (see DATABASE.md) |
| RLS | Row-level security: database rules that decide which rows each person may read or change |
