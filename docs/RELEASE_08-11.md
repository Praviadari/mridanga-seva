# Release of Sunday 08-11-2026: face scan, wake-up alarm, khol sounds

One new Android APK for the class. It carries three things that cannot come by update:

- **Face scan** (check-in by face at the desk and on the student's own phone; [DECISIONS.md #295-#300, #307-#312,
  #344-#349, #430-#437](DECISIONS.md)). It stays **off** on LIVE until the facilitator switches it on.
- **Smaller face models** (`.bin`, [#631](DECISIONS.md)).
- **Wake-up alarm with the class's khol** and the **khol sound on notifications** ([#791-#796](DECISIONS.md)).
- **Version 1.1.0** (was 1.0.0; [#798](DECISIONS.md)): the version line under Sign out and the website say 1.1.0.
- **The native additions for the coming months** ([#800-#806](DECISIONS.md), round 3, 03-11-2026): My QR at full
  brightness, labels and QR cards printed from the phone, Copy buttons, a **kartal** notification sound with a
  khol / kartal setting, https app links (production app only), the taal player playing on with the screen locked,
  and the **new icon and splash** (Prji's khol on its cushion, royal blue). No new Android permission; `WRITE_SETTINGS`
  is blocked.

With it, the database gets 0070, 0071 (face scan) and 0073 (face scan in "My data", [#799](DECISIONS.md)).

Everything is on the branch **`claude/release-0811-44b0e4`** (pushed to GitHub, not on `main`). `main` stays as it is
until the production APK is built (part 3), because an update from `main` must keep reaching today's APK.

## Which build is which

| Build | Profile | App on the phone | Database | Fingerprint (runtime) | Built from |
|---|---|---|---|---|---|
| Face test app (part 1) | `facetest` | "Mridanga Seva TEST" (`org.mridangaseva.app.test`), next to the class app | TEST | **c54e6ac4…** (`c54e6ac4a28697a02519f2ef63ba8d17ea3aa18b`) | the branch head the lead names |
| Production APK (part 3) | `production` | "Mridanga Seva" (`org.mridangaseva.app`), replaces the class app | LIVE | **3a91fab5…** (`3a91fab5ecb94c35a46801f814f5b25dff49e90d`) | the branch head on the day, then `main` = that commit |
| Today's class APK (16-10-2026) | `production` | "Mridanga Seva" | LIVE | 23dc7e4a | main f835830 |

- Both new builds use **the same `app/eas.json`** (it has both profiles). `eas.json` is part of the fingerprint
  ([#432](DECISIONS.md)): it must not change between the production build and `main`. `main` gets exactly the state the
  production APK was built from (part 3, step 6), nothing native on top.
- The face test app's fingerprint differs from production's only by `APP_VARIANT=facetest` (its name, icon, package).
- The face test app has **no push notifications** ([#431](DECISIONS.md)): the announcement sound can only be tried on
  the production APK.
- A later commit on the branch that changes nothing native keeps both fingerprints. If the lead names another number
  on the day, use the lead's.

## Part 1. Build the face test app (Praveen, phone hotspot)

1. **Network.** Unplug the office cable. Connect the PC to the phone hotspot.
2. **PowerShell**, one window for everything below:
   ```powershell
   $env:Path = "$env:LOCALAPPDATA\Programs\Git\cmd;$env:Path"
   $env:NODE_OPTIONS = '--use-system-ca'
   git -C C:\Users\praveen.a\Mridanga_Seva_App fetch origin
   ```
3. **A clean folder for the release** (once; never the main folder, its `app\.env` is LIVE):
   ```powershell
   git -C C:\Users\praveen.a\Mridanga_Seva_App worktree add --detach C:\Users\praveen.a\release-0811 origin/claude/release-0811-44b0e4
   cd C:\Users\praveen.a\release-0811\app
   npm ci
   ```
   If the folder already exists from an earlier try:
   `cd C:\Users\praveen.a\release-0811; git checkout --detach origin/claude/release-0811-44b0e4; cd app; npm ci`.
4. **Check**, each line prints one value:
   ```powershell
   git log --oneline -1
   npx eas-cli --version
   $env:APP_VARIANT = 'facetest'; (npx expo-updates runtimeversion:resolve --platform android | ConvertFrom-Json).runtimeVersion; Remove-Item Env:APP_VARIANT
   ```
   Expected: the commit the lead named; `eas-cli/24.12.1`; `c54e6ac4a28697a02519f2ef63ba8d17ea3aa18b`. Anything else:
   stop and send the three lines to the lead.
5. **Build:**
   ```powershell
   npx eas-cli build -p android --profile facetest
   ```
   It must **not** ask to generate a new keystore (the test app has one since 24-10-2026). If it asks: answer **no**
   and tell the lead. The log shows `eas-build-guard: profile facetest → project fhuqykssenuhczdqbafu, app variant
   facetest` before the packages install. The free queue can take an hour.
6. **Send the lead:** the build id (first 8 characters), the build page's **runtime version** (must be c54e6ac4…),
   the version code, and after downloading the APK: `Get-FileHash .\<file>.apk -Algorithm SHA256`.
7. Install it on the test phone over the old "Mridanga Seva TEST" (same key, it updates in place).

Each build uses one of the 15 free Android builds of the month (`npx eas-cli build:list --platform android --limit 15`
shows November's).

## Part 2. Phone checklist (TEST login on "Mridanga Seva TEST")

Write down the phone model and Android version. The lead switches face scan on for TEST first (it is off since
26-10-2026) and sets the TEST centre's point and hours to where and when you test. Tick each line ok / not ok.

**Face scan**
- [ ] The app opens and stays open (the models load: the first face picture appears, not "picture 0 of 5").
- [ ] My profile → Face scan: enrolment with a coordinator confirming at the desk finishes ("5 of 5").
- [ ] Home: the **Check in** circle is first in the ring, blue, before My QR. Check in inside the area works.
- [ ] Check out after 10 minutes works; the circle then says Check in again.
- [ ] Another person in front of the camera, alone: refused. A photo or a video of you: refused.
- [ ] My QR still scans at the desk (the QR scanner shares ML Kit with the face check).

**Wake-up alarm** (Practice tools → Wake-up alarm; [OPERATIONS.md "Wake-up alarm: phone test"](OPERATIONS.md))
- [ ] Alarm at now **+2 minutes**, Snooze 5, Save: "It rings next on …". *Open "Alarms & reminders"* opens the setting:
  turn it on for Mridanga Seva TEST.
- [ ] Phone on **silent**, screen off: the khol plays about 27 s on the **locked screen**, with Stop and Snooze.
  (If silent mutes it, write the phone model: this is the key check.)
- [ ] **Stop** silences it at once; nothing rings 5 minutes later.
- [ ] **Snooze**: silent at once, rings again after 5 minutes.
- [ ] Stop and Snooze again with the app **swiped away** from recent apps.
- [ ] **Reboot**: alarm at +5 min, restart the phone, do not open the app: it still rings.
- [ ] **Battery saver** on: it still rings (note any delay).
- [ ] The **practice reminder** at its time plays the short khol.
- [ ] Sign out: nothing rings at the alarm's time.

**Icon and splash** ([#806](DECISIONS.md))
- [ ] The home screen shows the new icon: the red-and-gold khol on its navy cushion, royal blue, with the red **TEST**
  band. Nothing of the drum is cut off by the phone's icon shape (round, squircle or square).
- [ ] With **themed icons** on (Android 13+: Wallpaper & style → Themed icons): the drum and cushion read as a drum in the
  phone's tint, not a blob.
- [ ] Opening the app: royal-blue splash with the drum and **MRIDANGA SEVA** on the cushion, then the app's own blue
  loading screen with the same picture: no jump in colour or size between the two.
- [ ] The small drum in the headers and on the My QR pass is the khol on its cushion.

**My QR brightness** ([#800](DECISIONS.md))
- [ ] Turn the phone's brightness low. Open My QR: the screen goes fully bright. Go back: the low brightness returns.
  Lock and unlock on My QR: bright again.

**Print from the phone** ([#801](DECISIONS.md); a staff login)
- [ ] Instruments → Print labels: pick two items → **Print**: Android's print window shows the A4 sheet with the
  labels at the chosen start. **Save as PDF** saves it; open the PDF: QR codes sharp, text in place.
- [ ] Print QR cards: pick a student → Print: the card sheet shows the same way.

**Copy buttons** ([#802](DECISIONS.md))
- [ ] My profile → My data and rights → **Copy** under the contact: paste in WhatsApp gives the email exactly.
- [ ] (Staff) My sign-in code → set up → **Copy** under the key: paste into the authenticator app works.

**Notification sound** ([#803](DECISIONS.md))
- [ ] My profile → **Notification sound**: Khol | Kartal shows (Android only). Choose **Kartal**; Practice tools →
  practice reminder at the next time slot: it plays the short kartal ring, not the khol.
- [ ] Phone settings → Apps → Mridanga Seva TEST → Notifications: a new "Practice reminder (kartal)" channel; the
  khol ones are still there. Choose Khol again: the next reminder plays the khol.

**Taal player in the background** ([#805](DECISIONS.md))
- [ ] Practice tools → taal player: **Keep playing with the screen locked** is off. Play, lock the phone: the sound
  stops (as before).
- [ ] Tick it, play, lock the phone for **5 minutes**: it keeps playing; the lock screen shows the taal's name with a
  pause control. Unlock, Stop: it stops, the lock-screen player goes.

Not testable here: the announcement sound (no push in the test app) → part 3, step 4; the app links (#804: production
app only) → part 3, step 3.

Send the list to the lead. A JS-only fix can reach the test app by its own update (OPERATIONS "Face scan: the test
app", JS fixes); a native fix means a new test build.

## Part 3. Production day (Sunday 08-11-2026), in this order

**Before:** the lead has sent the last update from `main` to LIVE, merged `main` into the release branch, re-run the
checks and named the **build commit** and its fingerprint. Phone hotspot, the PowerShell lines of part 1 step 2.

1. **LIVE database, 0070 → 0071 → 0073** (Praveen pastes; the lead reads the result):
   [GO_LIVE_CHECKLIST.md](GO_LIVE_CHECKLIST.md) part B, rows **M0070**, **M0071** and **M0073**, one file per run, the
   probe after each: after 0070 `LAST IN ORDER` 0070, `MISSING` 0071; after 0071 `LAST IN ORDER` 0072, `MISSING` none;
   after 0073 `LAST IN ORDER` 0073, `MISSING` none. Then the lead checks **part F**: row 1 `0073`, row 2 `none`, row 3
   `18 of 18`. Face scan stays **off** (`face_enabled` false): only the facilitator switches it on, later.
2. **Production APK** from `C:\Users\praveen.a\release-0811\app`, at the build commit:
   ```powershell
   cd C:\Users\praveen.a\release-0811; git fetch origin; git checkout --detach <build commit>; cd app; npm ci
   git status
   (npx expo-updates runtimeversion:resolve --platform android | ConvertFrom-Json).runtimeVersion
   npx eas-cli env:list --environment production --format long
   npx eas-cli build -p android --profile production
   ```
   `git status`: nothing to commit. The fingerprint: the one the lead named (3a91fab5… unless main brought something
   native). env:list: the URL `https://qeozvvizcojzxcjgnaei.supabase.co` and a key starting `sb_publishable_`. If the
   build offers to **generate a new keystore**: answer **no** and stop (the class's key must stay the same). The log
   shows `eas-build-guard: profile production → project qeozvvizcojzxcjgnaei`. Then as in
   [OPERATIONS.md "Building the Android app"](OPERATIONS.md#building-the-android-app) steps 7-9: download, SHA-256,
   rename `mridanga-seva-production-<build id first 8>.apk`, Drive folder, a row in the APK log.
3. **One phone first** (it replaces the class app; sign in with a LIVE login): opens, each home loads, a QR scan at the
   desk, the metronome, Practice tools → Wake-up alarm at +2 min rings (silent mode on). Face scan shows nowhere (off).
   The new icon and splash (no TEST band). **App links** ([#804](DECISIONS.md)) work only after step 6's website upload
   with the key: then a label's QR scanned with the phone camera, or an `https://app.mridangaseva.com/student/...` link
   tapped in WhatsApp, opens the app, not the browser. Check with the phone on USB if needed:
   `adb shell pm get-app-links org.mridangaseva.app` → `app.mridangaseva.com: verified`; else
   `adb shell pm verify-app-links --re-verify org.mridangaseva.app`.
4. **notify-announcements**, TEST then LIVE (sends with the khol channel; older APKs still get notices, with the usual
   sound). From the repository root at the build commit (`cd C:\Users\praveen.a\release-0811`):
   ```powershell
   npx supabase@2.118.0 functions deploy notify-announcements --project-ref fhuqykssenuhczdqbafu --no-verify-jwt --use-api
   npx supabase@2.118.0 functions deploy notify-announcements --project-ref qeozvvizcojzxcjgnaei --no-verify-jwt --use-api
   ```
   Then a test announcement on LIVE: on the new APK it arrives with the short khol (also with Kartal chosen: the
   server sends every announcement on the khol channel until 0074, [#803](DECISIONS.md)).
5. **The lead puts the release on `main`:** `main` = the build commit (or `main` merged with it, nothing native on top);
   `npx expo-updates runtimeversion:resolve` on `main` = the APK's fingerprint; push. From now on updates from `main`
   reach only the new APK.
6. **Download link:** the lead adds the GitHub Release **`android-1.1.0`** (asset `mridanga-seva-1.1.0.apk`,
   [#798](DECISIONS.md)) and changes `website/site.config.mjs` `apkUrl` and `apkSha256` (and the text to 1.1.0), then
   uploads the website on Praveen's go. **App links:** Praveen reads the production keystore's SHA-256
   (`npx eas-cli credentials -p android` → production → *SHA256 Fingerprint*, read only) and the lead puts it in
   `app/scripts/export-web.mjs` `PRODUCTION_CERT_SHA256` (step 6b; a live export stops while it is empty), then the
   class site is exported and uploaded (`npm run export:web -- --site live`, OPERATIONS "Publishing the web version"):
   `https://app.mridangaseva.com/.well-known/assetlinks.json` must answer with that fingerprint. What's new: an entry `version` 1.1.0, kind `installed`, with the build id.
7. **Tell the class:** install the new APK over the old app (Get the app page or the Drive link); they stay signed in.

**Updates after the release:**
- `npm run update:production` reaches only phones with the new APK. Phones still on the 16-10 APK keep their last
  update until they install it; there is nothing more to send them.
- Any change to `app/app.json`, `app/eas.json`, a native package or the sounds means a new APK, not an update.

## Later, before the facilitator switches face scan on (not on the 8th)

- Google Play Integrity for LIVE ([OPERATIONS.md "Face scan: integrity check"](OPERATIONS.md#face-scan-integrity-check)):
  deploy `verify-integrity` to LIVE; LIVE secrets `GOOGLE_SERVICE_ACCOUNT_JSON`, `PLAY_INTEGRITY_PACKAGE` =
  `org.mridangaseva.app`, `PLAY_INTEGRITY_CERT_SHA256` = the **production** keystore's SHA-256
  (`npx eas-cli credentials -p android` → production). Without them a self-scan says "not ready yet"; desk enrolment
  works.
- The LIVE centre's GPS point and radius, the consent forms ([phase3/ADULT_TEST.md](phase3/ADULT_TEST.md)), then the
  switch: `update settings set value = 'true' where key = 'face_enabled';` on LIVE, on the facilitator's word.
