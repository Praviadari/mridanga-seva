# Phase 3 — Work plan: face self-scan (10-10-2026)

The build plan for Phase 3, split into **9 work packages**, one worktree (git branch) each, so any
volunteer (or a Claude worker chat) can pick one up from this file alone.

**Decided (DECISIONS #212, #213, #231 answers, #248):**
- Face scan = the **student's own phone only** (self-scan, 1:1: "is this the student whose login it
  is?"). No door tablet, no face scan on coordinator phones.
- **No phone** → the coordinator checks the student in as today (C5): scan the **printed QR card**
  or type the **roll number / name** (search already matches roll numbers, 0039).
- Location is read **once, at the check-in/out action**, never tracked (#212). Self-scan is
  **refused** outside the area, offline or outside the class window; the coordinator path stays.
- Face is a **separate opt-in**; QR stays for everyone for good (#213).
- Parent emails on **check-out only** (#231 answers, 0044).
- **Budget ₹0**: on-device open models, free plans. Lawyer review: pro-bono, team to arrange.

Background: [FACE_ATTENDANCE_PLAN.md](FACE_ATTENDANCE_PLAN.md) (read its UPDATE box first; modes
A/B there are dropped), [MODEL_OPTIONS.md](MODEL_OPTIONS.md), [DPIA_DRAFT.md](DPIA_DRAFT.md),
[CONSENT_DRAFT.md](CONSENT_DRAFT.md), Guru items: [DECISIONS_FOR_GURU.md](DECISIONS_FOR_GURU.md).

## 1. Packages at a glance

| ID | Package | Branch | Needs first | Earliest start | Days (est.) | Native? | Status |
|---|---|---|---|---|---|---|---|
| P3-1 | Printed QR cards for students without phones | `p3-qr-cards` | — | **now** | 1.5 | No (OTA) | taken — lead chat 6 worker, 10-10-2026, branch p3-qr-cards; migration 0045 if needed, DECISIONS #249-#252 |
| P3-8 | DPIA, consent and privacy notice revised for self-scan | `p3-privacy-docs` | — | **now** | 2 | No (docs) | READY 7a5d620 — branch p3-privacy-docs; DECISIONS #253-#255; pack: [LAWYER_PACK.md](LAWYER_PACK.md) |
| P3-0 | Native spike: camera → detect → embed → match on a cheap phone | `p3-spike` (never merged) | brief 9 APK merged | Jan 2027 | 5 | Throwaway dev build | open |
| P3-2 | Data layer: face templates, enrol/withdraw, visit columns | `p3-data` | Guru answers (15 Nov); P3-8 reviewed | Feb 2027 | 3 | No (migration) | open |
| P3-3 | Native foundation for the Phase 3 APK | `p3-native` | P3-0 result | 1 Mar 2027 | 3 | **Yes** | open |
| P3-4 | Enrolment at the desk + "face on/off" | `p3-enrol` | P3-2, P3-3 | Mar wk 2 | 4 | on P3-3 | open |
| P3-6 | Integrity check (Play Integrity) + staff view of face use | `p3-integrity` | P3-2, P3-3 | Mar wk 2 | 3 | on P3-3 | open |
| P3-5 | Self-scan check-in / check-out | `p3-selfscan` | P3-4 (P3-6 for the integrity step) | Mar wk 3 | 6 | on P3-3 | open |
| P3-7 | Phase 3 APK, TEST calibration, pilot, runbooks | `p3-pilot` | all above | Apr 2027 | 3 + Praveen | builds the APK | open |
| | **Total** | | | | **≈30.5 worker-days** | | |

**Never more than 2 worktrees at once.** Waves:

```
Now – Nov 2026   P3-1 ‖ P3-8                      (no blockers; P3-1 helps the Nov pilot)
Jan – Feb 2027   P3-0 spike (GATE) → P3-2
1–7 Mar          P3-3  (Phase 3 APK branch; fingerprint changes)
Mar wk 2         P3-4 ‖ P3-6                      (both branch from p3-native)
Mar wk 3 – Apr 1 P3-5
Apr (to 25 Apr)  P3-7 → live 30 Apr 2027
```

Gates: **Guru answers by 15 Nov 2026**; **lawyer feedback on P3-8 before face is switched on**
(DECISIONS_FOR_GURU item 1); **P3-0 must pass** or Phase 3 falls back to Plan B (below).
Plan B for 30 Apr: parent emails + QR cards only, face after 13 May 2027.

## 2. How to pick up a package

1. **Claim it:** on `main`, change the package's Status above to `taken — <name>, <dd-mm-yyyy>,
   branch <branch>`, add the numbers you reserve (next free migration and DECISIONS number: look at
   `supabase/migrations/` and the last `## NNN.` in docs/DECISIONS.md, plus the lead's log in
   NOTES_lead.md if you have it), commit "Phase 3: claim P3-x" and push. First push wins; if the push
   is rejected, pull and look again.
2. **Worktree:** `git worktree add .claude/worktrees/<branch> -b <branch> origin/main` (packages
   built on P3-3 branch from `origin/p3-native` instead).
3. **Environment (TEST only):** get the TEST values for `app/.env.test` from Praveen privately —
   never from chat logs, never commit them; copy that file as `app/.env.test` **and**
   `app/.env.development`. **Never** use LIVE values (a plain `app/.env` in Praveen's main folder is
   LIVE). `npm ci` in `app/` and `supabase/tests/`.
4. **Rules:** nothing runs against LIVE. Never run `supabase` deploy/db/link commands yourself (the
   CLI on Praveen's PC is logged in and really deploys) — write SQL/commands out for Praveen to run
   on TEST and check his pasted output. No `eas build`, `eas update` or publish without Praveen's
   explicit go. Never push to `main` except the claim commit and docs fixes to this file; the lead
   (or Praveen) merges.
5. **Done means:** `npx tsc --noEmit` 0 · `npx expo lint --no-cache` 0 · `npm test` in `app/` and in
   `supabase/tests/` (the live-replay test fails if a new migration has no row in
   docs/GO_LIVE_CHECKLIST.md — add it) · fingerprint stays **185e839f** for JS-only packages
   (`npx expo-updates runtimeversion:resolve --platform android`; native packages record the new
   one) · `npm run update:preview -- --check-only --message x` for JS packages · browser or phone
   check on TEST · docs updated (DECISIONS with your reserved numbers, SCREENS, DATABASE,
   TRANSLATIONS — te/hi as drafts for native review) · a NOTES.md section "<date> — Phase 3 P3-x" ·
   Status here set to `READY <sha>` · tell the lead / Praveen.
6. For a Claude worker chat, the whole prompt can be: *"Mridanga Seva app, WORKER for Phase 3
   package P3-x. Read docs/phase3/WORK_PLAN.md (sections 2 and P3-x) and follow it. No workflows or
   subagents."*

## 3. Packages

### P3-1 — Printed QR cards for students without phones (now; JS only)
**Goal:** a student with no phone gets a printed card the coordinator can scan in C5.
**Scope:** a staff "Print QR cards" screen (pick a batch / centre / selected students) producing a
printable A4 sheet of wallet cards: QR, full name, roll number, centre, class logo placeholder.
Reuse the C19 asset-label print approach (DECISIONS #156-#161: print-only copy, QR size and quiet
zone). The QR must carry what C5 already accepts — check how My QR is encoded (#17, #21); if My QR
is time-limited or signed per session, design a long-lived card code that C5 accepts and that the
Guru can revoke (lost card), and record the choice in DECISIONS. C5's search hint should say
"name or roll number". Who may print: staff of the student's centre. en/te/hi.
**Acceptance:** print a sheet on TEST, scan a printed card with C5 → correct student checked in; a
revoked card is refused; roll-number search finds the student.
**Owns:** new print screen, C5 hint text, i18n; a migration only if a card code is needed.

### P3-8 — DPIA, consent and privacy notice revised for self-scan (now; docs)
**Goal:** the papers the lawyer reviews match the decided design.
**Scope:** rewrite DPIA_DRAFT.md and CONSENT_DRAFT.md for self-scan only: no tablet/kiosk; the
child's own phone reads location once at check-in/out (#212) — argue why this is not "tracking"
under DPDP s.9(3) and flag it as the lawyer's first question; supervised first enrolment; liveness +
Play Integrity; templates only for 1:1 (no centre-wide cache); retention and withdrawal (plan §6.3,
§6.4 minus the scanner caches); parent emails check-out only. Update the privacy notice draft
(brief 6/6b text in docs/) with face + location + parent emails. te/hi drafts marked for native
review. A one-page summary for the lawyer with the 5-8 questions to answer.
**Acceptance:** no mention of modes A/B left except as history; Praveen sends the pack to the
lawyer. **Owns:** docs/phase3/*.md (not WORK_PLAN status rows of others), privacy notice draft.

### P3-0 — Native spike (Jan 2027; throwaway; GATE)
**Goal:** prove the on-device chain works on Expo SDK 57 (or the SDK brief 9 ends on) and a
₹10-15k Android phone.
**Scope:** a dev build on a throwaway branch with `react-native-vision-camera` + ML Kit face
detector plugin + `react-native-fast-tflite` or `onnxruntime-react-native`; SFace embedding;
MiniFASNet passive liveness; a simple active challenge (blink / turn). Measure: time from frame to
match (< 500 ms target), false accept / false reject on 5-10 consenting adult volunteers (no
children), liveness against a printed photo and a phone-screen replay, APK size increase, memory,
New Architecture compatibility. Also check expo-sqlite SQLCipher or secure-store for the local
template, and Play Integrity setup cost (free quota).
**Acceptance:** docs/phase3/SPIKE_RESULT.md with numbers, the chosen packages and versions, and a
go / no-go. **Never merged.** Volunteers' face data deleted after the spike (write down how).

### P3-2 — Data layer (Feb 2027; migration)
**Goal:** storage and rules for face templates, 1:1 only.
**Scope:** table `face_templates` (student, model_version, template encrypted with a Vault key,
created_at/by, confirmed_by staff, expires_at: 12 months minors / 24 months adults); no direct
select for any role; `enrol_face(student, template, model_version)` — refuses without a current
`face` consent (consents scope `face`, exists since 0001) and needs a staff confirmation step;
`my_face_template()` returns only the caller's own template (for re-install); `remove_face()`
(student / parent via desk / Guru); deletion inside `withdraw_consent`, `erase_student`, status
Left + 30 days, expiry, model change; `visits.match_score`, `visits.liveness_ok`; reads logged in
`access_log` (0034). Tests in supabase/tests for every rule; GO_LIVE_CHECKLIST row; DATABASE.md.
**Acceptance:** smoke tests pass; Praveen runs it on TEST; probe shows the functions exist.

### P3-3 — Native foundation for the Phase 3 APK (1-7 Mar 2027)
**Goal:** the packages chosen in P3-0 installed and configured; app builds; nothing visible yet.
**Scope:** add the packages, config plugins, camera permission text (en/te/hi), Android
`blockedPermissions` kept from brief 9; record the **new fingerprint**; a hidden dev screen that
runs detect → embed on the camera to prove the build. Branch-only: from this merge on, main's
updates reach only the Phase 3 APK, so it merges right before P3-7's APK build.
**Acceptance:** `npx expo config --type introspect` shows the permissions; a dev build runs the
hidden screen on a phone.

### P3-4 — Enrolment at the desk + face on/off (Mar wk 2)
**Goal:** a student turns face scan on, once, at the desk, on their own phone.
**Scope:** student screen "Face scan" (only when a `face` consent exists; otherwise explains how
to give it): 3-5 frames with liveness → template on the phone → `enrol_face` → a coordinator
confirms on the student's phone or their own (e.g. a short code / staff sign-in confirmation —
design it, record in DECISIONS). The template is also kept on the phone (Android Keystore /
SQLCipher per P3-0). "Turn face scan off" = `remove_face`, one tap, QR continues. Re-enrol prompt
near expiry. Minimum age rule from the Guru's item 3. en/te/hi.
**Acceptance:** on a phone with TEST: enrol (with confirmation), turn off → server row gone and
local template wiped; without consent the screen refuses.

### P3-6 — Integrity check + staff view (Mar wk 2)
**Goal:** make a self-scan from a rooted or tampered phone fail on the server.
**Scope:** Play Integrity native call with a server nonce; an Edge Function that verifies the
verdict with Google and returns a short-lived signed token the self-scan RPC requires; Google
Cloud project setup steps for Praveen (no cost at our volume — verify). Staff view: per centre,
how many students use face, failed self-scan counts by reason (outside, mocked, integrity,
liveness, no match) — counts only, no ranking of students who said no (#213, item 11).
**Acceptance:** a normal phone passes, an emulator / rooted device is refused; the staff view shows
counts on TEST. Function deploy command written out for Praveen.

### P3-5 — Self-scan check-in / check-out (Mar wk 3 – Apr wk 1)
**Goal:** the student checks themself in and out with their face, at the class only.
**Scope:** "Check in" on the student home (a circle, per the simple-home design) only inside the
centre's open window; one location fix (foreground, ≤ 8 s); refuse when outside radius (Abids 100 m
per Guru item 4) + accuracy allowance, accuracy > 100 m, `mocked`, offline, no integrity token, or
outside the window — always offering "Ask a coordinator (QR card / roll number)". Active + passive
liveness → 1:1 match with the local template, conservative threshold (prefer "use your QR") → a
self-scan RPC that re-checks location result, window, integrity token and consent server-side and
saves the visit with `method = 'face'`, `marked_by` = the student, score and liveness. Check-out:
same scan, location read once, outside = saved and flagged, never blocked. The parent email follows
from the existing check-out notice (0043/0044). Never a guess; three failures → suggest the
coordinator.
**Acceptance:** on TEST phones: inside → saved; outside / mocked / offline → refused with the
coordinator message; check-out outside → flagged; parent email (dry run) queued on check-out only.

### P3-7 — Phase 3 APK, calibration, pilot, runbooks (Apr 2027)
**Goal:** a signed Phase 3 APK on volunteers' phones, thresholds tuned, docs complete.
**Scope:** merge P3-3/4/5/6 in order; `eas build --profile production` on a hotspot (office network
blocks EAS uploads) — Praveen runs it; TEST with consenting adult volunteers, then the pilot at
Abids (adults first, then minors with parental consent); tune radius and match/liveness thresholds
from the data; privacy notice v-next and Play Data-safety form (from P3-8); OPERATIONS runbook:
template deletion, lost phone, model change, how to switch face off for everyone; LIVE migration
rows in GO_LIVE_CHECKLIST.
**Acceptance:** live 30 Apr 2027 with the Guru's sign-off and the lawyer's feedback applied.

## 4. Not in Phase 3
Door tablet / kiosk face scan, 1:N matching, a parent app login, iOS self-scan (Android first;
iOS later if at all), Wi-Fi BSSID checks, cloud face APIs, background location of any kind.
