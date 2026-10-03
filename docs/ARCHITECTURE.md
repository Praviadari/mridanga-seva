# Architecture

Mridanga Seva is one app (Android, iPhone through the web, and later the app stores) talking to one
Supabase project. Almost all business rules live in the database, so they hold no matter which
screen, device or version of the app is used.

```mermaid
flowchart LR
  subgraph Devices
    A[Android app<br/>installed from a link]
    W[Web version<br/>iPhone home screen]
  end
  subgraph Supabase
    AU[Auth<br/>email + password]
    DB[(Postgres<br/>tables, rules, functions)]
    ST[Storage<br/>photos, PDFs]
    CR[pg_cron<br/>scheduled jobs]
    EF[Edge Function<br/>notify-announcements]
  end
  YT[YouTube<br/>lesson videos]
  BR[Brevo<br/>login emails]
  EX[Expo push service<br/>+ Firebase]
  A --> AU
  W --> AU
  AU --> DB
  A --> DB
  W --> DB
  A --> ST
  W --> ST
  CR --> DB
  CR -- pg_net --> EF
  EF --> DB
  EF --> EX
  EX -. notification .-> A
  AU --> BR
  A -. plays .-> YT
  W -. plays .-> YT
```

## The pieces

| Piece | What it does | Where |
|---|---|---|
| App | Screens for Guru, Coordinator and Student. Built with Expo (React Native + TypeScript); one code base gives Android, iOS and web | `app/` — screens in `app/src/app/` |
| Auth | Sign-up and login with email + password | Supabase Auth |
| Database | All records, and the rules about them (who may see what, how a student's status changes) | `supabase/migrations/` |
| Storage | Photos and PDFs on announcements, in the private bucket `announcement-files`; later student photos (only with consent). Phase 2: assessment files and students' recordings in `assessment-files` (50 MB a file, deleted 30 days after review) | Supabase Storage, rules in `supabase/migrations/0010_announcement_files.sql` and `0016_assessments.sql` |
| Scheduled jobs | Move quiet students to *Irregular*, create follow-up calls, close check-ins left open (daily); send push notifications for new announcements (every minute) | `pg_cron`, defined in the migrations |
| Push notifications | Tell Android phones about a new announcement; in Phase 2 also about assessments (given, reminded, reviewed, a recording sent), queued in `push_outbox` | Edge Function `supabase/functions/notify-announcements/` → Expo's push service → Firebase Cloud Messaging (OPERATIONS.md "Push notifications") |
| Email | Sends sign-up confirmation and password-reset emails | Brevo free plan, plugged into Supabase as SMTP |
| Videos | Lesson videos stay on YouTube; the app only stores links | YouTube |
| Web hosting | Serves the web version that iPhone users add to their home screen | Cloudflare Pages, uploaded from `app/dist` (OPERATIONS.md) |
| Android builds | Builds the APK that Android users install from a link | EAS Build, `app/eas.json` (OPERATIONS.md) |
| Android updates | Sends new screens and text to installed APKs without a reinstall; the home screens offer Restart once one is downloaded | EAS Update, channels `preview` and `production`, published with `npm run update:preview` / `update:production` (`app/scripts/publish-update.mjs`, OPERATIONS.md "Updating the Android app") |

## Roles

| Role | Who | Can |
|---|---|---|
| `guru` | The Guru / admin | Everything, including giving roles and approving promotions |
| `coordinator` | Teachers who run the daily class | Register students, mark attendance, log follow-up calls, tick syllabus, post announcements |
| `student` | Enrolled learners | See their own record, attendance, progress, materials and announcements; study Ishtagoshti slokas |
| `kiosk` | The door tablet (Phase 2) | Only check students in and out |
| `pending` | Anyone who signed up but has no role yet | Nothing until the Guru gives a role |

A new login starts as `pending`. If its email matches a registered student, it is linked to that
student and becomes `student` automatically, once the email is confirmed. Only the Guru can make
someone a coordinator, or link a login to a student record by hand, on screen G2; the database
keeps the Guru role a dashboard matter and stops anyone changing their own role ([DECISIONS.md #45](DECISIONS.md)). The Guru can also mark a coordinator as an **Ishtagoshti editor** (`profiles.ig_editor`), who then adds and edits slokas and themes ([DECISIONS.md #57](DECISIONS.md)); it is a permission on a coordinator, not a role. See [DECISIONS.md #11 and #13](DECISIONS.md) and
[DATABASE.md](DATABASE.md#linking-a-login-to-a-student).

## The app's code

```
app/
  app.json             App name, icons, splash screen, web settings
  .env                 Supabase URL and public key (not in git; copy .env.example)
  scripts/             Helper scripts: the web export, publishing an Android update (both check
                       the bundle holds the right Supabase project), the placeholder icon generator
  src/
    app/               Screens. Every file is a screen (Expo Router); _layout.tsx files arrange them
      student/         The student's screens; (tabs)/ holds Home, My QR and Announcements; one
                       announcement, progress.tsx (S4), visits.tsx (S9), profile.tsx (A3),
                       notifications.tsx (A2), assessments/ (S7), practice.tsx (S5) and
                       practice-log.tsx (S6) (Phase 2), ishtagoshti/ (I2, I3; the I1 tab is in
                       (tabs)/), and coming-soon.tsx open on top
      staff/           The Guru's and coordinators' screens: register, attendance, follow-up ...,
                       levels/ (G4 syllabus editor), materials/ (G5), visits/ (S9 of one student),
                       profile.tsx (A3), the Guru's coordinators/ (G2), database/ (G3 and the
                       import), settings.tsx (G10), audit-log.tsx (G11), notifications.tsx (A2),
                       reports.tsx (C21 and G8) and centres/ (G9), and coming-soon.tsx
                       for the modules not built yet; (tabs)/
                       holds Home (G1 or C1 by role) and the four used most. Phase 2:
                       assessments/ holds G6, C12-C14, promotion/ holds C22, C23, G7,
                       practice.tsx (S5) and taals/ (the Guru's taal editor), ishtagoshti/ (I2, I3,
                       and the editors' edit-sloka/ I12 and edit-theme/ I11)
    auth/              Who is signed in, their role, and the sign-in / sign-up calls
    screens/           The two staff homes, G1 and C1 (shown by staff/(tabs)/index.tsx), and the
                       pages both areas show: Coming soon, Attendance history (S9), My profile (A3),
                       Notifications (A2); Phase 2: Practice tools (S5), the lesson player (V3), and
                       Ishtagoshti I1-I3 (ishtagoshti-*.tsx, with an `area` of student or staff)
    data/              Reading and saving records: one file per area (students.ts ...), with the
                       form checks. Screens call these, never the database directly
    components/        Building blocks shared by screens: text, buttons, fields, choices, list rows,
                       the QR scanner, the syllabus item card, the announcement card, form and
                       detail card (announcement-detail.tsx),
                       the file picker and file list of an announcement, the reply box and reply
                       card, a progress bar, the number tiles of the home screens, the
                       ring of modules of the home screens (module-ring.tsx, staff-shortcuts.tsx;
                       DECISIONS.md #39, #41), the "new version is ready" notice, the page frame (with
                       pull to refresh on phones), columns.tsx (two columns of cards on a laptop),
                       detail-grid.tsx (label-over-value cells on C8);
                       the look of rounds 1 and 2 (DECISIONS.md #36): icon.tsx (the icon set),
                       saffron-band.tsx (the gradient band), home-header.tsx (the band with the
                       greeting), brand.tsx (the band on the sign-in screens), mridanga-mark.tsx
                       (the drum mark), person-header.tsx (initials and name on C8, C11),
                       status-chip.tsx (coloured level and status labels on lists and C8),
                       loading-cards.tsx (grey shapes while loading), empty-state.tsx,
                       account-footer.tsx (language, My profile, Sign out, version),
                       material-row.tsx (a lesson with Open, on G4/G5 and S4; DECISIONS.md #44),
                       admin-links.tsx ("Running the class" on G1, "My reports" on C1) and
                       guru-only.tsx (round 8); inbox-bell.tsx (the bell on the home header) and
                       data-table.tsx (tables of the reports on a laptop) (round 9)
    i18n/              Interface text in English, Telugu and Hindi (docs/TRANSLATIONS.md), and
                       labels.ts, which words levels, file sizes and lengths of time the same on
                       every screen
    lib/               The Supabase client, on-device storage, date helpers (India time), the
                       Excel/CSV reader of the student import (sheet-reader.ts, with fflate), push
                       notifications and app updates (push.ts and app-update.ts on Android; the
                       .web.ts copies do nothing), the report's CSV (csv.ts; save-csv.ts saves it to a
                       folder or shares it on Android, save-csv.web.ts downloads it) and the reader of
                       a Google Maps link for G9 (map-link.ts)
    theme/             Colours, spacing and text sizes, light and dark; the card look, the header
                       bars and the tab bar (use-theme.ts)
supabase/
  migrations/          The database, in number order (docs/DATABASE.md)
  functions/           Edge Functions: notify-announcements sends the push notifications
  tests/               The database smoke test and the push message test
```

Screens use only `components/` and `theme/` for their look, and `t('...')` for every word, so a
change of colour or wording is made in one place.

## Logging in

1. **Create an account** (sign-up screen): name, email, password. The database creates a
   `profiles` row with role `pending`.
2. **Confirm the email:** Supabase sends a link (through Brevo). The link opens the web version.
   On confirmation the database links the login to the student record with the same email, if
   there is one, and the role becomes `student`.
3. **Sign in** with email and password. The login is kept on the device (in `localStorage`,
   which expo-sqlite provides on phones), so people stay signed in.
4. **Forgot password:** the app emails a link; it opens the web version on a *Set a new password*
   screen. Links are *implicit-flow* links, so one asked for on a phone also works in a laptop browser.

5. **Next start:** the app keeps a copy of the person's own profile on the device
   (`src/auth/saved-profile.ts`) and opens their home from it at once, while the login is
   restored and the profile fetched behind it; without internet the copy keeps their screens
   ([DECISIONS.md #37](DECISIONS.md)). Sign-out forgets it. With no internet and an expired
   token, Supabase reports no session although the login is still saved; the app then keeps the
   person's screens from that copy until the login is refreshed, and Sign out still works
   ([DECISIONS.md #42](DECISIONS.md)).

Links in emails go to the address set as **Site URL** in Supabase, or to the web address the
request came from (see OPERATIONS.md).

## Navigation by role

The app is split into **areas**: `signedOut` (sign-in screens), `recovery` (set a new password),
`pending` (waiting for a role), `guru`, `coordinator` and `student`, plus `loading` while the
saved login and the profile are being fetched.

- `src/auth/auth-provider.tsx` works out the area from the login and the `profiles` row.
- `src/app/_layout.tsx` opens only that area's screens (Expo Router's `Stack.Protected`).
  A screen of another area cannot be opened, even by typing its address on the web.
- The `staff/` folder is open to both `guru` and `coordinator`, because the Guru sees every
  coordinator screen. Put a new screen there unless only one role may use it.
- Each role has **tabs** ([DECISIONS.md #36](DECISIONS.md)): the student Home (S1), My QR (S3)
  and Announcements (S10) in `student/(tabs)/`; staff Home, Attendance (C5), Students (C7),
  Calls (C10) and Announcements (C15) in `staff/(tabs)/`; since Phase 2 slice 6 both also have
  Slokas (Ishtagoshti I1). The tabs are at the bottom on a phone;
  for staff they become a sidebar from 900 px wide. A folder in brackets adds nothing to the
  address, so `/staff/students` and `/student/my-qr` stay as they were.
- The first screen is the Home tab: `/student` (S1) or `/staff`, which shows the Guru dashboard
  (G1, `screens/guru-home.tsx`) or the coordinator dashboard (C1,
  `screens/coordinator-home.tsx`) by role. The old addresses `/guru` and `/coordinator` are gone.
  Other screens (a profile, a call, Who is here now, groups ...) open on top of the tabs with a
  back button; C1 and G1 reach the ones without a tab through the same tiles
  (`components/staff-shortcuts.tsx`).
- `src/app/index.tsx` shows the splash while loading, then sends the person to their area's
  first screen, or to the screen a link asked for when it belongs to their area
  (`src/auth/requested-path.ts`, [DECISIONS.md #30](DECISIONS.md)). A web address or shared link
  to, say, one announcement therefore still opens that announcement after the login check, with
  the role's tabs underneath, so Back leads to them.

Hiding screens makes the app clear to use; it is **not** the security. The database refuses any
read or write the person is not allowed, whatever the app shows.

## Security model

- **Row-level security (RLS) is on for every table.** The database itself decides which rows a
  person may read or change; the app cannot get around it. See [DATABASE.md](DATABASE.md#who-can-see-what).
- **Views read as the person asking.** Every view (`student_overview`, `announcement_audience`,
  `announcement_seen`, `announcement_reply_list`, `group_summary`) is created
  `with (security_invoker = true)`, so the row-level security of the tables under it still
  applies ([DECISIONS.md #20](DECISIONS.md)). The one exception that shows more than the tables
  allow is the function `staff_names()`: staff names only, for "posted by" ([DECISIONS.md #26](DECISIONS.md)).
  The functions that count the home screens' numbers (`student_home`, `coordinator_dashboard`,
  `guru_dashboard`) are security invoker for the same reason ([DECISIONS.md #31](DECISIONS.md)).
- **Files follow the same rules.** Storage has row-level security too: a photo or PDF on an
  announcement opens only for people who may read that announcement, and the app shows it
  through a signed link that works for an hour ([DECISIONS.md #32](DECISIONS.md)).
- **The app holds only the public (anon / publishable) key.** It is safe to ship because RLS protects
  the data. The `service_role` key bypasses RLS and must never be in the app or the repository.
  Only the Edge Function `notify-announcements` uses it, inside Supabase, which provides the key
  to it by itself; the Firebase service-account key lives only in EAS ([DECISIONS.md #33](DECISIONS.md)).
- **The app refuses to start with the `service_role` key** in `app/.env` and shows a warning
  instead (`src/lib/supabase.ts`), because everything in `EXPO_PUBLIC_*` ends up in the public web version.
- **Actions that change several things at once run as database functions** (`toggle_visit`,
  `scan_qr`, `log_call`), so they either fully happen or not at all, and they check the caller's role.
  Each function is granted only to the roles that need it ([DECISIONS.md #14](DECISIONS.md)).
- **Personal data is kept to a minimum.** Only the area and pincode, not the full address. Only the
  *type* of ID a coordinator checked for consent, never the ID number. See [DECISIONS.md #8](DECISIONS.md).

## How attendance flows (Phase 1)

1. The student opens *My QR* (S3) on their phone. The code holds `MS1:` and the student's secret
   QR token ([DECISIONS.md #17](DECISIONS.md)). It is drawn on the phone, and the last one loaded
   is kept there, so it shows even without internet ([DECISIONS.md #21](DECISIONS.md)).
2. The coordinator opens *Mark attendance* (C5) and scans it with their phone's camera
   (expo-camera). Without a camera, or on a laptop, they search the name and tap instead.
3. A scan calls `scan_qr`, which toggles: in if the student has no open visit, otherwise out.
   A tap calls `mark_visit` with *in* or *out*, and changes nothing if the student already is
   ([DECISIONS.md #18](DECISIONS.md)).
4. Any check-in makes the student *Active* again and closes their open follow-up tasks.
5. *Who is here now* (C6) lists open visits. At closing time the coordinator taps *Check out all*
   (`check_out_all`).
6. At 21:00 IST a daily job closes any visit still open, at the centre's closing time.

The camera also works in the web version (on `https` only). Browsers without built-in QR reading,
such as Safari on iPhone, use a reader that expo-camera downloads from a public CDN; see
OPERATIONS.md "Publishing the web version".

## How follow-up flows (Phase 1)

1. Each morning a daily job moves a student with no visit for 14 days to *Irregular* and gives
   their mentor a *call* task, due in 3 days (the day limits are in `settings`, set on G10). When
   the mentor changes, the open tasks go to the new mentor ([DECISIONS.md #48](DECISIONS.md)).
2. The coordinator opens *Follow-up calls* (C10). Students are grouped: *needs the Guru*
   (escalated), *call due*, *call later*, and Irregular or Inactive students with *no call planned*.
3. Tapping a student opens the call screen (C11), with buttons that open the phone's dialler for
   the student or, for a minor, the parent. After the call the coordinator records the outcome, a
   reason from the list, a comment and, for *coming back* or *taking a break*, the date.
4. `log_call` saves it and applies the outcome: *taking a break* sets *Paused* until the date;
   *stopped coming* sets *Left* (the screen asks once more); *coming back* sets a new call for the
   day after the date; *not reachable* sets a retry, handed to the Guru after several tries.
   This is the only way to reach Paused or Left ([DECISIONS.md #4](DECISIONS.md)).
5. The next visit makes the student *Active* again and closes their open tasks.

## How announcements flow (Phase 1)

1. A coordinator or the Guru opens *Announcements* (C15) and taps *New announcement*: title,
   message, up to 3 photos or PDFs, who it is for (all students, one level, my mentees, staff
   only, or a group), pin or not, and publish now or at a later date and time.
2. On *Post*, the app makes photos smaller, uploads the files to Storage and saves the
   announcement straight into `announcements` with the list of files; database triggers check
   it and record the author. A later publish time keeps it from students until then; staff see
   it at once ([DECISIONS.md #32](DECISIONS.md)).
3. Within a minute of its publish time, the Edge Function sends a push notification to the
   Android phones of the people it is addressed to; a tap opens it ([DECISIONS.md #33](DECISIONS.md)).
4. A student opens *Announcements* (S10). Row-level security gives them only the published ones
   addressed to them, and signed links to their files. Opening one saves a read receipt.
5. Back on C15, each announcement shows "seen by N of M", worked out by the database views
   `announcement_seen` and `announcement_audience`, with the names of those who have not seen it
   and how many students it is meant for have no app login ([DECISIONS.md #25](DECISIONS.md)).
6. The author or the Guru can edit, pin, unpin or delete it; the audit log keeps a copy. An
   edit keeps the read receipts; once published, the announcement shows "Edited" with the time
   ([DECISIONS.md #27](DECISIONS.md)). Files taken off, or on a deleted announcement, are removed
   from Storage by the app.
7. Under an announcement a student (or a coordinator reading someone else's) can reply to the
   author. Replies are private: only the writer, the author and the Guru read them
   ([DECISIONS.md #29](DECISIONS.md)). The author sees "Replies: N" on the list and the replies
   with names on the announcement, and answers in person or by phone.

Groups for the audience "A group" are made on the groups screen (`staff/groups/`): a name, a
purpose, and members chosen from students with the app and staff. A group is switched off,
never deleted ([DECISIONS.md #28](DECISIONS.md)).

Push notifications reach only the Android app built by EAS, once push is set up (OPERATIONS.md
"Push notifications"). The web version (iPhones) has none yet: people there see new
announcements when they open the app, with the number of unread notices on the bell of the home
header. That inbox (A2) is filled by the database for every addressee, push or not: a trigger on
`announcements` writes one `notifications` row per person from `announcement_audience`, the same
people the push goes to, and opening the announcement marks it read ([DECISIONS.md #49](DECISIONS.md)).

## How assessments flow (Phase 2)

On main since the Phase 2 merge; it reaches Android phones with the next APK, which also carries
expo-audio ([DECISIONS.md #52 and #55](DECISIONS.md)).

1. The Guru creates an assessment (G6): instructions, type, level, level-up or not, a rubric,
   files and a link. It stays a draft, seen only by the Guru, until *Send to coordinators*.
2. A coordinator opens it from *Assessments* on the home's ring (C12), writes notes, sets a due
   date and picks students. `release_assessment` gives each one an assignment and queues a push
   notification for those with the app.
3. The student opens it (S7): the coordinator sees *Seen*. They record with the phone's own
   recorder or camera and send the file (at most 50 MB) or a link, with a note.
   `submit_assessment` checks the file is theirs and in Storage, and tells the coordinator.
4. The tracker (C13) shows each student Not seen / Seen / Submitted / Reviewed / Redo and Late.
   *Remind* queues a reminder; a daily job at 09:00 IST reminds anyone due today or tomorrow.
5. A coordinator reviews (C14): plays the recording, scores each rubric line, comments, and
   accepts or asks for a redo; for a level-up assessment, marks it for the Guru (the promotion
   approval below). The student sees the score and the comment.
6. The Edge Function sends the queued notifications with the announcements, and once a day
   deletes recordings 30 days past their review. Every queued notice (push_outbox) also lands
   in the person's notifications inbox (A2), with or without the app (0019, DATABASE.md).

Audio and video open in the phone's browser view (expo-web-browser); the app has no player and
no in-app recorder, because each would be a native package and a new APK.

## How promotion flows (Phase 2)

[DECISIONS.md #53](DECISIONS.md). The app never promotes anyone by itself.

1. `promotion_criteria` checks a student against the Guru's settings: the current level's
   syllabus ticked, 8+ visits in 8 weeks, an accepted level-up recording (step 5 above). The C1
   card and the Promotions list show a coordinator their own students who meet all of it; C8
   shows the check for any student.
2. A coordinator nominates (C22) with a reason and picks coordinators to ask (those who taught
   the student lately come first). Their own view counts as one "Ready"; the asked ones get a
   push notification.
3. Coordinators answer (C23): Ready / Almost / Not yet with a comment. At 2 answers the Guru gets
   a notification and the nomination moves to "Waiting for your decision" (the G1 card counts it).
4. The Guru decides (G7), with the criteria, the recording and the answers side by side:
   *Promote* (`students.level_id` + a `level_history` row; the student is told), *Not yet* with
   guidance and a date before which the student cannot be nominated again, or *More feedback*.
5. Only the Guru can change a student's level at all (a database trigger), and the level-up
   recording is kept until 30 days after the decision.

## Practice tools (Phase 2)

[DECISIONS.md #54](DECISIONS.md). S5 plays a **pattern** (`lib/practice-pattern.ts`):
one cycle of sounds, each at a position in beats (a metronome bar, or a taal's bols spread over
their beats, `lib/bols.ts` saying which head, zone, fingers and sound a bol is). A **player**
(`lib/practice-player.ts`) loops it at a tempo:

- **Browser** (`lib/practice-audio.web.ts`): Web Audio look-ahead scheduler. A 25 ms timer looks
  150 ms ahead (more when the timer is seen running late, as in a background tab where browsers fire
  it about once a second: 1.5 × the gap, up to 2 s) and starts each sound with
  `AudioBufferSourceNode.start(time)` on the audio clock, time = anchor + beats × 60 / bpm. A tempo
  change sets a new anchor and takes back what was scheduled after it. The sounds are synthesised
  once into AudioBuffers (`lib/practice-sounds.ts`).
- **Phone** (`lib/practice-audio.ts`, expo-audio, next APK): the cycle is mixed into one WAV
  (22.05 kHz mono, tails wrapped round) in the cache folder and played with `loop` on, so the audio
  hardware keeps the time; a tempo change writes a new file and seeks to the same beat.
- **The screen follows the sound**: `lib/use-playhead.ts` reads the player's position every frame
  (web: audio clock minus `outputLatency`; phone: `player.currentTime`) and re-renders only when the
  beat or bol changes. The beat dots, the beat grid and V1 (`components/two-head-view.tsx`, SVG)
  light from it.
- **Timer and log**: `lib/practice-timer.ts` keeps the start time on the device (survives leaving
  the screen and reloads); Stop calls `log_practice` (DATABASE.md "Practice tools").
- **Offline**: taals are saved on the device after each load, with the seeded placeholders built in
  as a last resort; sounds need no network.

**Drift, measured 3 Oct 2026** (Chrome in the desktop app's browser pane, 80 beats a minute,
2+ minutes, click onsets detected in the audio output itself by an AudioWorklet on the audio thread, stamped with `currentFrame`):
no sound missed (183 clicks over 136.5 s), drift at the end −0.16 ms, worst error 0.16 ms (the detector's own resolution, about 7 samples), every interval 749.84-750.16 ms, each click 0.39-0.54 ms after its planned time (a constant: the click's 2 ms fade-in), 0 sounds scheduled late. The tab was in the background during the run, its timer slowed to about 1 a second, and the look-ahead grew to 1.5 s by itself. A plain `setInterval` metronome run beside it was off by up to 16 ms (539 ms in an earlier run while the page's main thread stalled). Tempo change 80 → 85 while playing: the next sounds came at 705.88 ms, none late; slow-down 50 % of 60 = 2000 ms a beat. In development builds the web player is on `globalThis.__practicePlayer` (schedule
log, `late`, `minLead`) for such checks.

## Media: lesson videos and recording (Phase 2, branch `phase2-media`)

On the branch `phase2-media`, rebased on main after the Phase 2 merge; not on main yet ([DECISIONS.md #56](DECISIONS.md)).

- **V3 player = one HTML page** (`lib/lesson-player-html.ts`), shown in an OS WebView on phones
  (`components/lesson-video-frame.tsx`, react-native-webview, next APK; loaded with base URL
  `https://mridanga-seva.app` so YouTube sees a Referer) and in an iframe (`srcdoc`) in the browser
  (`lesson-video-frame.web.tsx`), so both run the same code. The app sends commands (`play`, `pause`,
  `seek`, `rate`, `mirror`, `zoom`, `loop`, `hello`) and the page answers with events (`ready`,
  `state` 10 times a second, `aspect`, `zoom`, `error`): web by `postMessage` with a tag, phone by
  `injectJavaScript` / `ReactNativeWebView.postMessage`. `hello` is sent when the frame has loaded,
  because a fast page can speak before the app listens.
- **YouTube** plays in YouTube's own embedded player through the IFrame Player API
  (`setPlaybackRate`, `seekTo`, `getCurrentTime`); nothing is drawn over it, it is at least 200 px
  high, and its picture is never transformed (YouTube's terms). **The team's own video file** plays in
  a `<video>` element (a `#t=0.001` fragment paints the first frame), where mirror is `scaleX(-1)` on
  the stage and zoom shows one of n side-by-side panes by making the video n times as wide and
  shifting it; a tap maps to a pane (mirrored taps counted from the other side). The A-B loop runs
  inside the page (back to A when the time passes B), so the bridge's delay does not matter.
- **Recording** (`lib/recording.ts`, `components/audio-recorder.tsx`): expo-audio's recorder, mono
  96 kbit/s; phones write .m4a (AAC), browsers .webm (Opus, MediaRecorder). iOS switches to recording
  mode only while recording. A take is played back before it is used; it is uploaded only when the S7
  or C14 form is sent (`recordingAsMedia` → `uploadMedia`). The upload re-types a browser Blob to the
  bucket's type (`audio/webm` → `video/webm`).
- **Record myself** keeps takes on the phone (`lib/my-recordings.ts`: `Paths.document/recordings/`,
  `index.json` with what played; newest 30) — in the browser only in memory. Recording "with the
  sound" restarts the metronome or taal from beat 1 as recording starts, so "Play with the sound"
  later starts both together and they line up (give or take the device's latency).

## Ishtagoshti: sloka study (Phase 2, branch `phase2-ishtagoshti`)

[DECISIONS.md #57](DECISIONS.md); tables in DATABASE.md "Ishtagoshti (Phase 2)".

- **One set of screens, two areas.** I1-I3 are in `screens/ishtagoshti-*.tsx` and take `area`
  (`student` or `staff`), because an area opens only its own routes; thin route files sit in
  `student/` and `staff/`. Links go through `openIg` in `components/ishtagoshti-parts.tsx`. The editors'
  screens (I11, I12) are staff routes only; whether the person may edit comes from `is_ig_editor()`,
  and the database checks every write again.
- **Languages.** A sloka holds a translation and purport per language (en, te, hi). `inLanguage`
  picks the reader's own, else English, Telugu, Hindi; I3 says when it fell back and offers the
  others as chips. The Devanagari and transliteration are the same for everyone; phones and browsers
  draw Devanagari with their own fonts (no font file added).
- **Copyright.** Only the temple's own translation, word meanings and purport: the editor ticks
  "the temple's own, not BBT" and the database refuses to publish without it. The Sanskrit verse is
  free to use.
- **Sloka of the day** is `ig_sloka_of_day()`: an editor's pin for that day, else the published
  slokas in turn, the same for everyone on an India date.
- **Recitation** reuses slice 4's recorder (`AudioRecorderPanel`, review mode) and file picker;
  uploaded on Save into the bucket `ishtagoshti-audio`, played through a one-hour signed link.
- **Slice 7** (free public sign-up) adds its subscriber role to `ig_reader()`; notes and ticks are
  kept per login (`profiles`), so they work for subscribers unchanged.
## Phases

| Phase | Adds | Target |
|---|---|---|
| 1 | Registration, consent, QR attendance, follow-up, syllabus, materials, announcements, groups, reports | Live 1 Dec 2026 |
| 2 | Assessments, promotion workflow, practice tools, events, polls, door tablet, inventory, Ishtagoshti, fund | Live 1 Mar 2027 |
| 3 | Face-recognition attendance (only with consent) | Live 30 Apr 2027 |
