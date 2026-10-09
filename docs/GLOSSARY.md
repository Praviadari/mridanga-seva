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
| Vibhag | A section of a taal's cycle. Marked X (sam, the first beat), 2, 3 (tali: an open baya stroke) or 0 (khali), as the kksongs khol course writes them; the taal player (S5) shows them |
| Mātrā | One beat of a taal ("beat" in the app) |
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
| Inactive | No visit for 30 days (setting). Their open follow-up tasks are escalated to the Guru once due |
| Call log | Record of a follow-up call: outcome, reason, comment, next date |
| Follow-up task | A reminder for a coordinator to call a student: `call` (first call) or `retry` (after "not reachable") |
| Follow-up queue | Screen C10: everyone who needs a call, grouped as *needs the Guru*, *call due*, *call later* and *no call planned* |
| Escalated | A follow-up task handed to the Guru: several calls with no answer, or no call before the student became Inactive |
| Days since last visit | Whole days since the student's last check-in, counted in the time zone of the student's centre (India for Abids), or since joining if they never came. The student list filters by it |
| Call reason code | A short code for why a student stopped coming (`studies`, `health` ...), kept in `settings.call_reasons` and translated by the app (DECISIONS.md #19) |
| Group | A set of people who receive the same announcements; replaces a WhatsApp group |
| Announcement | A message from a coordinator or the Guru to an audience: all students, one level, the author's mentees, staff only, or a group (screens C15, S10) |
| Audience | Who an announcement is for (`announcements.audience`). Coordinators and the Guru see every announcement whatever its audience |
| Pinned | An announcement kept at the top of every list until it is unpinned |
| Scheduled | An announcement whose publish time is still to come: staff see it, students only from that time |
| Read receipt | The note the app saves when a person first opens an announcement (`announcement_reads`) |
| Seen by N of M | On an announcement: M = the people it is addressed to who can open it in the app, N = how many have opened it (DECISIONS.md #25) |
| Edited | Shown on an announcement whose title, message, audience or files were changed after it was published, with the time (`announcements.edited_at`, DECISIONS.md #27, #32) |
| Reply | A private answer to an announcement, read only by its writer, the announcement's author and the Guru (`announcement_replies`, DECISIONS.md #29) |
| Member | A person in a group: a student who uses the app, a coordinator or the Guru (`group_members`) |
| Switched off (group) | A group no longer offered when posting; old announcements keep it. Groups are switched off, never deleted (DECISIONS.md #28) |
| Home screen | The first screen after signing in: S1 for a student, the dashboard C1 for a coordinator, G1 for the Guru. Its numbers come from one database function each (DECISIONS.md #31) |
| This week | On the home screens: Monday to today at the person's centre, or the last 7 days when the Facilitator chose that on G10 (`week_start_ist()`, DECISIONS.md #31) |
| New joiner | A student who joined in the last 4 weeks (`settings.new_joiner_weeks`) and has not left |
| In class | Every student who has not left; the Guru dashboard counts levels among them |
| Overdue follow-up | An open follow-up task whose due date has passed and that is not yet escalated; shown per coordinator on the Guru dashboard |
| Requested screen | The screen a link asked for when the app was opened; shown once the login has been checked (DECISIONS.md #30) |
| File (on an announcement) | A photo or PDF attached to an announcement, at most 3; kept in the private Storage bucket `announcement-files` and listed in `announcements.attachments` (DECISIONS.md #32) |
| Signed link | A link to a private file that works for one hour; the app asks Storage for one each time a file is shown, and only for people who may read the announcement |
| Push notification | A message the phone shows even when the app is closed; sent for a newly published announcement to the Android app (DECISIONS.md #33) |
| Push token | The address Expo gives a phone for push notifications (`ExponentPushToken[...]`), saved in `push_tokens` for the login signed in on that phone |
| Kiosk, door tablet | The door tablet account (Phase 2), allowed only to check students in and out. The role exists; its screen does not yet |
| Staff | The Guru and the coordinators together (`is_staff()` in the database) |
| Mentee | A student whose mentor is a given coordinator (`students.mentor_id`) |
| Treasurer | A person the Facilitator marks to record the class fund (`profiles.is_treasurer`, Phase 2) |
| Channel | The EAS Update line an APK listens to: `preview` (test) or `production` (live). An update reaches only APKs of its channel |
| Pending | A new login that has no role yet |
| Area | In the app's code: the part of the app a person may use now (loading, signed out, password recovery, pending, Ishtagoshti subscriber, guru, coordinator, student; `app/src/auth/types.ts`). See ARCHITECTURE.md "Navigation by role" |
| Linking | Joining a login to the student record with the same email, once the email is confirmed (see DATABASE.md) |
| RLS | Row-level security: database rules that decide which rows each person may read or change |

## Phase 2 words

Added for [9. Learning and community](guide/09-learning-and-community.md).

| Term | Meaning |
|---|---|
| Assessment | A piece the Facilitator asks students to play or sing and record; coordinators give it out and review it (C12-C14, G6, S7) |
| Rubric | The lines an assessment is scored on, such as rhythm or clarity of the bols, each with a top score |
| Redo | A review that asks the student to record the piece again |
| Level-up assessment | An assessment whose accepted recording can support moving the student up a level |
| Nomination | A coordinator's proposal that a student move up a level; other coordinators answer Ready, Almost or Not yet |
| Promotion | Moving a student up a level. Only the Facilitator promotes; the app never does it by itself |
| Level-up queue | The Facilitator's list of nominations waiting for a decision (G7) |
| Metronome | A steady click at a chosen tempo, with the first beat of each bar accented |
| Tempo | The speed of the beat, in beats a minute |
| Taal player | Plays the bols of a taal in a loop at a chosen tempo and speed |
| Both heads (two-head view) | A drawing of the drum's two heads in which the ring struck by each bol lights up (V1) |
| Placeholder | A stand-in taal, sloka or syllabus item until the real one is entered |
| Practice log | A student's practice minutes, from the timer or typed in, shown week by week |
| A-B loop | Repeating one part of a lesson video, from point A to point B |
| Mirrored | A lesson video flipped left to right, so the teacher's right hand is on the viewer's right |
| Record myself | Recording one's own playing on the phone, with or without the metronome or taal |
| Voice note | A short spoken comment a coordinator records with a review |
| Event | A festival, yatra or programme where the class plays; students answer Going, Maybe or Not going |
| Performer | A student picked to play at an event, with a part such as mridanga or kartal |
| Poll | A question with 2 to 6 answers; each person chooses one. An anonymous poll never shows who chose what |
| Sloka of the day | The sloka shown to everyone on the Slokas tab that day |
| Ishtagoshti editor | A coordinator the Facilitator allows to add and edit slokas and themes |
| Instrument loan | A temple instrument lent to a student or coordinator, with its condition and a date to bring it back |
| Duty roster | Who is on duty at the class when, planned by the Facilitator |
| Material suggestion | A lesson a coordinator proposes; the Facilitator adds it or declines it |
| Flagged check-in | A visit saved while the marking phone was outside the centre's area or gave no location; the visit counts, the Facilitator sees the flag |
## Technical words for beginners

Added for the [beginner's guide](guide/README.md). Plain meanings, for readers who have never coded.

| Term | Meaning |
|---|---|
| App (phone app) | A program installed on a phone. It draws the screens and talks to the server over the internet |
| Web version | The same app running inside a browser (Safari, Chrome), with nothing installed. iPhones and laptops use it |
| Server | A computer on the internet that is always on and keeps the class records. Ours is run by Supabase |
| Database | Where the records are kept on the server. Each kind of record is a **table** (like one Excel sheet); each record is a **row** |
| Supabase | The service that provides our database, login, file storage, scheduled jobs and the notification program, on a free plan |
| Expo, React Native | The tools the app is written with. One code gives the Android app and the web version |
| TypeScript | The programming language of the app: JavaScript with checks that catch mistakes before the app runs |
| APK | An Android app package: the file that installs the app on an Android phone. Ours is shared by a link, not the Play Store |
| EAS Build, EAS Update | Expo's cloud services: Build makes the APK; Update sends new screens and words to installed apps without a reinstall |
| Fingerprint | A short code computed from the native part of the app. An update reaches only the APKs with the same fingerprint; a native change needs a new APK |
| Native | The part of an app built into the APK itself: camera, notifications, icon, permissions. Changing it needs a new APK |
| Publish | Sending an update to the phones. Done only on the maintainer's word, after a dry run (`--check-only`) |
| Test project, live project | Two separate Supabase projects: test holds made-up students for trying changes; live holds the class's real records |
| Seed data | The made-up students (`supabase/seed.sql`) loaded into a test project. Never into live |
| Migration | A numbered file (`0001_…sql`, `0002_…sql`) that changes the database. They run in order; one already applied is never edited |
| Trigger, guard | A check the database runs by itself whenever a row is saved, refusing the save if it breaks a rule |
| Database function | An action that runs on the server as one step, such as checking a student in or logging a call. It either fully happens or not at all, and checks who is asking |
| Public key, secret key | The public (anon / publishable) key is inside the app and safe, because RLS protects the data. The secret (`service_role`) key skips every rule and is never in the app or the code |
| Edge Function | A small program that runs on Supabase's servers. Ours sends notifications to Android phones |
| Push service, Firebase | The services that carry a notification to an Android phone (Expo's push service, then Google's Firebase Cloud Messaging) |
| Smoke test | An automatic test that builds the whole database on a laptop and checks hundreds of rules, as each role (`supabase/tests`) |
| Type check, lint | Automatic checks of the code: `npx tsc --noEmit` (types, missing translations) and `npx expo lint` (common mistakes) |
| Git, repository, commit | Git keeps the code's full history. The repository is the project's folder with that history; a commit is one saved change with a message |
| Branch, main | A branch is a separate line of work on the code. `main` is the branch the app is built from; other work joins it only when checked and agreed |
| Pull request | A request on GitHub to add a branch's changes to `main`, where they are reviewed first |
| Open source, MIT licence | The code is public for anyone to read, use and improve; the MIT licence says so and asks only that the copyright notice is kept |
| Pilot | The first real use, by one class at Abids (planned 16-29 Nov 2026), before going live for everyone |
