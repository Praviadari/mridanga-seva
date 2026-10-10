# Phase 3 — Face-scan attendance plan (DRAFT, 09-10-2026)

> **UPDATE 10-10-2026 — read first (Praveen, DECISIONS #248):** face scan is **mode C only —
> student self-scan on their own phone (1:1)**. Modes A (door tablet) and B (coordinator phone face
> scan) below are **dropped**, and so is the tablet in the budget and timeline. Students without a
> phone: **printed QR card or roll number** at the coordinator (C5, as today). The first enrolment is
> done at the desk on the student's phone with a coordinator confirming. Parent emails: check-out
> only (#231 answers). Where this file says A/B, 1:N, kiosk cache or tablet, it is history. The build
> plan that replaces §9 is **[WORK_PLAN.md](WORK_PLAN.md)**.

**Status:** preparation only. Nothing here is built or decided, except DECISIONS #212 (Praveen,
09-10-2026: **no live or continuous location tracking at all** — GPS read only at the moment of
check-in and check-out, against the class geofence; verifiable parental consent; face a separate
biometric opt-in) and #213 (face only by its own opt-in, QR always there).
Every other item is a proposal for the Guru and the team ([DECISIONS_FOR_GURU.md](DECISIONS_FOR_GURU.md)).
Companion files: [MODEL_OPTIONS.md](MODEL_OPTIONS.md), [DPIA_DRAFT.md](DPIA_DRAFT.md),
[CONSENT_DRAFT.md](CONSENT_DRAFT.md).

**Timeline (NOTES.md):** Phase 3 build 1 Mar - 25 Apr 2027, live 30 Apr 2027, DPDP Rules in force
13 May 2027 (rules 3, 5-16, 22, 23; verify against the Gazette G.S.R. 846(E)).

## 1. What the Guru asked for, and what actually delivers it

Guru (09-10-2026, via Praveen): attendance by face scan, bounded by GPS like the railways' UTS
general-ticket app (works only in or near the allowed area), so parents get accurate attendance and
ask fewer questions about where their children were.

Three separate things are in that request; they have different costs and risks:

| Want | What delivers it | Needs face? | Needs a new APK? |
|---|---|---|---|
| Parents know when a child arrived and left | A **notice to the parent** at check-in and check-out | **No** — works with today's QR and tap | No (email); yes if push to a parent app |
| The check-in really happened at the class | The **GPS check** of #70 (already live: marking phone, saved + flagged) | No | No |
| The person checked in is really that student (no QR screenshot, no friend marking a friend, #17) | **Face match** with liveness | **Yes** | Yes |

So the part parents feel most (the notice) can come **before** face, from the existing check-in,
without biometric data. Face adds identity certainty. This matters for the DPIA: a regulator asks
whether a less intrusive means achieves the purpose (Swedish DPA, Skellefteå school, 2019 — see
DPIA §5). The honest purpose of face is "the right person, with less coordinator time", not
"knowing where children are".

## 2. Flows

### 2.1 Who scans — three modes

| Mode | Device | Match type | Who is present | GPS checked on | Good for |
|---|---|---|---|---|---|
| **A. Door tablet (kiosk)** | One Android tablet at the entrance, role `kiosk` (exists, #72) | 1:N among the centre's enrolled students (~200) | Coordinator on duty nearby | the tablet (fixed; mainly proves the tablet was not taken home) | Children without phones, beginners who won't install the app, queues |
| **B. Coordinator phone** | Staff phone, like C5's QR scan today | 1:N, same as A | The coordinator holding it | the marking phone (#70, as now) | No tablet yet; second door; events |
| **C. Student self-scan** | Student's own phone | 1:1 (is this the student whose login it is?) | Nobody | the student's phone, **at that moment only** | Adults who come and go on their own |

**Proposal:** build A and B first (same code: a scanner screen that does 1:N). C comes after A/B
work, **adults only** in the first term; minors' self-scan is a Guru decision after the pilot
(DECISIONS_FOR_GURU #2). Reasons: a supervised scan needs much weaker anti-spoofing; most children
don't have their own phone; a child's own phone sending its location is closer to "tracking" (DPDP
s.9(3)) than a fixed tablet at the door.

### 2.2 Enrolment (once per student, renewed yearly for minors)

1. Face consent recorded first: `consents` row with `scope = 'face'` (exists since 0001), signed by
   the parent for a minor and by the student for an adult, with the notice version (#150). The
   child's own "no" is respected even if the parent signed (DPIA §6).
2. At the desk, a coordinator opens the student → **Enrol face** (staff phone or tablet). The ID
   check of C2 already happened at registration.
3. The camera takes 3-5 frames with a liveness check; the phone computes the **template**
   (embedding: a list of 128-512 numbers) and **throws the images away** — nothing is written to the
   gallery, cache or server.
4. Only the template, the model version and the date go to the server (§6).
5. The student sees "Face scan is on for you" and can switch it off (= withdraw, §6.4).

### 2.3 Check-in (mode A/B)

1. The scanner shows the camera; face detection runs continuously **only while the screen is open**.
2. Face found → liveness passes → template computed → compared with the centre's cached templates.
3. Best match above the threshold **and** clearly ahead of the second best → the result card shows
   name and roll number large (as the QR card today, #17) and the coordinator glances at the person.
   It cannot show an enrolment photo, because none is kept (§6). (If the student has a separate
   photo consent, the existing class photo could be shown — a Guru decision.)
4. The app calls the existing `toggle_visit`/`mark_visit` with `method = 'face'` (enum value exists,
   0001) and the location payload of #70.
5. No match / low confidence → "Not recognised — show your QR or tell the coordinator". Never a
   guess. Three failures in a row for the same face → the scanner suggests QR.

### 2.4 Check-in (mode C, self-scan)

1. Student opens **Check in** inside the open window of their centre (opens_at-closes_at).
2. The app reads one location fix (foreground, #55/#70). **Refuse self-scan** (not the visit) when:
   outside radius + accuracy allowance; accuracy worse than 100 m; `mocked = true` (Android, expo-
   location); no fix in 8 s; outside the open window; offline. The message always offers the
   fallback: "Ask a coordinator to check you in" (which then saves + flags as #70).
3. Liveness (active: blink or turn the head on a random prompt, plus passive) → 1:1 match against
   the student's own template → visit saved with `method = 'face'`, `marked_by` = the student.
4. Unlike #70 (staff marking: never block), self-scan **blocks** outside the area — this is the UTS
   behaviour the Guru wants, and it is safe because a staff check-in remains as the fallback.

### 2.5 Check-out

| Way | Recorded time | Parent notice says |
|---|---|---|
| Face scan at the door / self-scan on leaving | scan time | "left at 18:10" |
| Coordinator taps Check out (C6/C8) | tap time | "left at 18:10 (marked by coordinator)" |
| Nightly `close_open_visits` at closing time | closing time | "**no check-out recorded**; visit closed at 20:00" — never "left at 20:00" |

Proposal: check-out by self-scan also reads one location fix (the same single-moment rule as
check-in, #212); outside → saved and flagged, not blocked, because a student must always be able to
leave the record. Today #70 does not check check-outs; changing that is a Guru decision.

### 2.6 What parents see

Parents have no app login today (guardians are rows with a phone; #146 limits who reads them).
Options for the notice, cheapest first:

| Channel | Cost | Needs | Notes |
|---|---|---|---|
| **Email** via Brevo (already used for parent codes, #88) | Free plan has a daily send cap (≈300/day when last checked — **verify**) | Parent email on the guardian row; Brevo key in Vault (brief 8) | ~200 students, maybe 40-80 visits a day × 2 notices fits; delayed, less noticed |
| **Parent login in the app** (new role `parent`, push) | Free (Expo push) | New role, RLS for parent → child, linking flow, consent | Biggest build; best experience; a project of its own |
| WhatsApp Business API / SMS | Paid per message (SMS rejected for cost, #7) | Provider contract, templates, processor in D4-12 register | Most noticed in India; ongoing cost |

**Proposal:** email in Phase 3 (on by default for minors, parent can switch off; adults: off), with
the parent-login option costed separately. Content: student first name, centre, time, in/out, how it
was marked (face / QR / coordinator) — **never** the location, distance or a photo. A flagged
check-in shows to staff only (#70), not to the parent, until the Guru decides otherwise.

## 3. GPS geofence model

### 3.1 How UTS did it (for comparison)

- Booking was allowed only when the phone was **outside the station premises but within an outer
  distance** of the station; booking inside the station or on a moving train was blocked (on some
  sections a fence of ~20 m either side of the track). The outer limit moved from 2 km/5 km to
  20 km and was **withdrawn on 25 Apr 2024**; the journey had to start within one to two hours of
  booking (sources differ). [eastmojo 06-05-2024; latestly; easternmirror; erail.in — see sources]
- UTS's general booking moved to the **RailOne** app (2025-26). In April 2026 a RailOne geofence
  flaw let passengers book from moving trains for weeks [trak.in 04-2026] — a reminder that a
  phone-side geofence is a deterrent, not proof.
- **Unverified:** a Southern Railway post says UTS on Mobile is decommissioned from 01-03-2026; not
  confirmed from an official source.

What we copy: the check runs **once, at the action**, on the phone, and the server decides; the
area is a point + radius; outside = the self-service action is refused, a counter (here: the
coordinator) remains. What we don't copy: UTS's inverted fence (it keeps you *out* of the station;
we want you *in* the centre).

### 3.2 Our area (exists: #51, #70)

- `centres.lat/lng/radius_m` (25-2000 m, default 150, set on G9). **Inside** = distance ≤ radius +
  min(fix accuracy, 100 m). The database computes the distance (`visit_location_result`) and keeps
  only `location_check` + `location_distance_m`, **never the position** (#70). Phase 3 keeps all of
  this.
- **Proposal for Abids:** radius **100 m** for self-scan (temple compound + street), kept at 150 m
  for staff check-ins. Measure first: during the pilot, record the reported accuracy of 20-30 staff
  check-ins indoors (already in the data as the distance + result) and set the radius from that.

### 3.3 Accuracy limits

- Phones indoors typically report ±30-80 m (seen on staff phones, #70); in a large hall with a
  concrete roof a fix may not come at all within 8 s. Wi-Fi/cell positioning gives a fast but coarse
  fix (±100-500 m). Use the reported `accuracy` honestly: a fix worse than 100 m cannot say
  "inside" for a 100-150 m area.
- Warm-up: the scanner asks for a fix when it opens and reuses it for 2 minutes (#70), so the queue
  is not slowed.

### 3.4 Spoofing (fake location)

| Signal | Platform | Strength | Use |
|---|---|---|---|
| `LocationObject.mocked` (expo-location) | Android only | Catches the developer-options mock app; misses root-level spoofers | Refuse self-scan when true |
| iOS `isSimulatedBySoftware` (iOS 15+) | iOS | Not exposed by expo-location; Apple forum: misses some tools | Not used (iOS self-scan later, if at all) |
| **Play Integrity API** verdict (device + app integrity) | Android | Detects rooted / modified devices and re-signed apps; needs a server check | Proposal: require for self-scan; needs a small Edge Function + Google Cloud project (no cost at our volume — **verify quota**) |
| Temple Wi-Fi BSSID seen | Android/iOS | Hard to fake casually; needs a known access point; Android scan rules | Later option, not Phase 3 |
| Pattern review | Server | Repeated `outside`/`no_fix` per student in C21/G8 reports (exists) | The Guru looks into repeats (as #70) |

None is proof. The real control is the **face + liveness + a human in the loop** (mode A/B), and a
fallback that is equally easy.

### 3.5 Never tracking (DECISIONS #212, decided by Praveen 09-10-2026)

No live or continuous location tracking at all. Location is read **only at a check-in or check-out action, in the foreground**, never in the
background, never on a timer, never while the app is merely open; only the result is stored. No
"where is my child now" map. This keeps Phase 3 outside DPDP s.9(3) "tracking or behavioural
monitoring of children" without relying on the Fourth Schedule exemption (DPIA §4), and outside
Google Play's background-location review (NOTES 28-09-2026). app.json already has background
location, Android foreground service and iOS background switched **off** — keep it so.

## 4. Liveness / anti-spoofing

| Threat | Mode A/B (supervised) | Mode C (self-scan) |
|---|---|---|
| Printed photo / phone screen held up | Passive liveness model (e.g. MiniFASNet, ~2 MB) + the coordinator sees it | Passive + **active** challenge (random blink / turn left-right) |
| Video replay | Coordinator | Active random challenge |
| Mask / twin / sibling | Coordinator; conservative threshold | Hard; conservative threshold; pattern review |
| Camera injection on a rooted phone (deepfake stream) | n/a (our tablet) | Play Integrity; accept the residual risk; visits stay reviewable |

Thresholds are tuned to prefer **false rejects** (student uses QR) over **false accepts** (wrong
child marked present — the worst outcome for a parent notice). Expected passive-liveness quality on
cheap phone cameras is unknown — measure in the pilot (MODEL_OPTIONS §5).

## 5. Fallback for no consent, failed match, no phone

- **QR stays for everyone, permanently** (#213). No-consent students use My QR (#17, #21) or a
  coordinator tap; they are never asked again at the door, never shown as "face missing", and no
  report ranks them differently.
- Failed match → "Not recognised — show your QR" on the same screen; the coordinator can mark by
  name (C5/C8).
- Self-scan refused (outside, mocked, offline) → "Ask a coordinator to check you in".
- Device lost or broken → the tablet's cache is encrypted and wiped by switching the kiosk login off
  (OPERATIONS lost-phone runbook, brief 7).

## 6. Data design

### 6.1 What is stored

| Item | Where | Form | Who reads |
|---|---|---|---|
| Face template | Supabase (Mumbai, ap-south-1 — OPERATIONS) new table `face_templates` (student, model_version, created_at, created_by, expires_at, template **encrypted**) | Bytes, encrypted with a key held in Supabase Vault; decrypted only inside a security-definer function | Only the `kiosk` login and staff of the student's centre, through a logging function (like #146), only to fill the scanner cache |
| Scanner cache | Tablet / staff phone, while the scanner is in use | Encrypted SQLite (expo-sqlite's SQLCipher option — **verify** in SDK 57) or in memory only | The app |
| Self-scan template | Proposal: the student's **own** template only, on their phone, encrypted with the Android Keystore; plus the server copy for re-install | — | The app |
| Visit | `visits` as today, `method = 'face'`, plus proposed `match_score` and `liveness_ok` | Numbers only | As today (#70 rules) |
| Images | **Nowhere** | — | — |
| Failed attempts | Count per scanner per day | Number | Guru |

Templates are biometric personal data: research shows faces can be partly reconstructed from
embeddings, so they get the same care as photos (encrypted, logged reads, deletion).
**Templates are not portable between models:** a model change means re-enrolment.

### 6.2 Encryption and access

- In transit: HTTPS (as all calls). At rest: Supabase disk encryption + column encryption with a
  Vault key (proposal; check the current Supabase guidance — pgsodium was announced deprecated for
  new use, Vault remains: **verify**).
- RLS: no direct `select` on `face_templates` for any app role; reads only via
  `face_templates_for_centre()` (kiosk/staff of that centre, logged in `access_log`, 0034).
- Writes only via `enrol_face(student, template, model_version)`, which refuses unless a current
  `face` consent exists — the same pattern as `register_student` and the consent recheck (#16, #74).

### 6.3 Retention (proposal)

| Event | Template |
|---|---|
| Face consent revoked / student switches face off | Deleted at once; scanner caches refresh at next open (≤ 1 day) |
| `withdraw_consent` (#75) | Deleted in the same call |
| `erase_student` (#76) | Deleted (and audit copies, as #76) |
| Status **Left** | Deleted after 30 days (re-enrol if they come back) |
| Minor | Expires 12 months after enrolment (faces change); re-enrol |
| Adult | Expires 24 months after enrolment |
| Model upgrade | Old templates deleted when the new model is live |
| `match_score`/`liveness_ok` on visits | Follow visit retention (D4-07, team decision) |

### 6.4 Withdrawal

As easy as giving it (DPDP s.6(4)): the student or parent can switch face off in the app (student's
own profile; parent: by telling the desk until a parent login exists) or ask the desk; the Guru's
`withdraw_consent` also covers it. Effect: template deleted, QR continues, nothing else changes.

## 7. Offline behaviour

- **Tablet/coordinator (A/B):** matching is on-device, so it works without internet once the cache
  is loaded that day. Check-ins queue locally with the device time, the method, the match score and
  the location result, and sync when back online; the server accepts queued check-ins up to 12 hours
  old (proposal) and the parent notice goes out on sync with the real time ("arrived 16:05, sent
  late"). Needs an offline queue — the app's QR check-in is online today; `_reuse/` offline parts
  from the field app may carry over (NOTES 28-09-2026). If this is too much for Phase 3: no offline
  face, fall back to the online path, and say so on the screen.
- **Self-scan (C):** refused offline ("Show your QR to a coordinator") — a check-in that the server
  cannot see at the time cannot be trusted. My QR works offline (#21).
- Cache freshness: refresh on open and every 30 minutes while online; a revoked template must leave
  every cache within a day.

## 8. Native needs (new APK)

| Need | Candidate | Notes |
|---|---|---|
| Camera frames to JS | `react-native-vision-camera` (v4 or v5) with frame processors | Not in Expo Go; needs a dev build (we already build APKs with EAS). Could also replace `expo-camera` for QR (built-in code scanner) — decide in the spike |
| Face detection | ML Kit face detection via a vision-camera plugin (`react-native-vision-camera-face-detector`) | On-device, free; detection + landmarks only, **no recognition** |
| Embedding model runtime | `react-native-fast-tflite` (+ `react-native-nitro-modules`) or `onnxruntime-react-native` | Depends on the model format (SFace ships as ONNX; MobileFaceNet as TFLite) |
| Liveness model | Same runtime | ~2-4 MB |
| Integrity | Play Integrity (a native module) | Only for mode C |
| Encrypted cache | expo-sqlite SQLCipher option or expo-secure-store for a key | Verify |
| Location | `expo-location` (already in the APK, foreground only) | No change |

**Compatibility with Expo SDK 57 / RN 0.86 / New Architecture: unverified.** A one-week spike on a
throwaway dev build (Jan-Feb 2027, before Phase 3 starts) should prove: frames → detection →
embedding → match on a ₹10-15k Android phone in < 500 ms, and an APK size increase (estimate
+10-25 MB).

**Fits brief 9's production APK?** No (proposal). Brief 9 ships before go-live (Nov-Dec 2026,
NOTES_lead) and is about hardening; face needs the DPIA, a lawyer's review and the team's consent
wording first, and its native packages are untested on SDK 57. Putting them in brief 9 would add
risk to the go-live APK for a feature that can't be switched on for months. Plan a **Phase 3 APK**
(early March 2027); if the Expo SDK upgrade in brief 9 slips, do it in the Phase 3 APK instead, and
if the fingerprint changes anyway for another reason in Feb 2027, the spike result decides whether
to include vision-camera early (unused).

## 9. Effort and timeline (against 1 Mar - 25 Apr 2027)

### Before 1 March (no app code except the spike)

| When | What | Who |
|---|---|---|
| by 15 Nov 2026 | DECISIONS_FOR_GURU answered | Guru, team |
| Nov-Dec 2026 | DPIA + consent wording to a lawyer; te/hi native review | Praveen/team |
| Dec 2026 | Parent notice by email can ship **independently** on the QR flow (JS + migration, no face) if the Guru wants it early | lead |
| Jan 2027 | Buy the tablet (Android, good front camera, ~₹15-25k — estimate) | team |
| Jan-Feb 2027 | 1-week native spike (§8) on a dev build; model + liveness pick confirmed | worker |
| Feb 2027 | Collect face consents with the new forms (paper/written, as #16) so enrolment can start in March | desk |

### Build (8 weeks)

| Week | Work | Days (estimate) |
|---|---|---|
| 1 (1-7 Mar) | Migration: `face_templates`, `enrol_face`, logging read function, deletions in `withdraw_consent`/`erase_student`, visit score columns, parent-notice settings; dev build with native packages | 4 |
| 2-3 | Enrolment at the desk; scanner 1:N for tablet + coordinator phone; liveness; thresholds | 8 |
| 4 | Check-out flow; parent email notices (if not shipped in Dec); staff screens (who uses face, failed counts) | 4 |
| 5 | Self-scan for adults: geofence block, mocked check, Play Integrity, active liveness | 4 |
| 6 | Phase 3 APK on EAS (hotspot, office network blocks EAS uploads); TEST with consenting adult volunteers; calibration | 3 |
| 7 (12-18 Apr) | Pilot at Abids: adults first, then minors with parental consent | 3 |
| 8 (19-25 Apr) | Fixes; privacy notice v-next (face + notices), Play Data safety update, OPERATIONS runbook (template deletion, lost tablet), docs | 3 |
| **Total** | | **≈29 worker-days**, plus Praveen's phone/desk checks |

Risk to the date: high if the spike fails (model runtime on SDK 57) or the lawyer's answer comes
late. Plan B for 30 Apr: ship parent notices + supervised face on the tablet only (mode A), self-scan
later. Plan C: notices only; face after 13 May with a fuller legal review.

## Sources

See MODEL_OPTIONS.md and DPIA_DRAFT.md for the full list. UTS/RailOne:
- eastmojo, "UTS app unleashes geo-free ticket bookings", 06-05-2024 — https://www.eastmojo.com/national-news/2024/05/06/uts-app-unleashes-geo-free-ticket-bookings/
- Eastern Mirror, "Railways withdraws outer limit of geo-fencing restrictions on UTS mobile app" (2024) — https://www.easternmirrornagaland.com/railways-withdraws-outer-limit-of-geo-fencing-restrictions-on-uts-mobile-app
- LatestLY, UTS distance relaxed to 20 km (undated in source) — https://www.latestly.com/india/news/uts-mobile-app-indian-railways-relaxes-distance-restriction-on-booking-train-tickets-online-now-book-upto-20-km-from-station-on-non-suburban-sections-4446175.html
- erail.in, UTS booking info — https://erail.in/info/ticket-booking-uts/208
- trak.in, RailOne glitch lets passengers book after boarding (04-2026) — https://trak.in/stories/railone-glitch-allows-passengers-to-book-tickets-after-boarding-train/
- Business Today, RailOne general tickets (23-08-2026) — https://www.businesstoday.in/latest/trends/photo/no-more-ticket-queues-railone-app-lets-you-book-general-train-tickets-from-your-phone-550511-2026-08-23
- Expo Location docs (`mocked`, Android only; `accuracy` in metres), read 09-10-2026 — https://docs.expo.dev/versions/latest/sdk/location/
- Apple forum on `isSimulatedBySoftware` limits — https://developer.apple.com/forums/thread/797864
