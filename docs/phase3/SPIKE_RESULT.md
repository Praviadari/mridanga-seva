# Phase 3 — P3-0 native face spike: result

> **Status 12-10-2026: DESK PART DONE, PHONE PART WAITS FOR THE TEST DAY (after Wed 21-10-2026).**
> Built on branch `p3-spike` (never merged) from `brief9-apk` 3a5dcc0. Everything that can be settled
> without a phone and volunteers is settled below, with numbers; the rows marked **⏳ phone** are filled
> in after the test day ([§9](#9-test-day-for-praveen-after-wed-21-10-2026)). Face scanning stays **off
> for everyone** in the real app until Praveen says it is fully tested (WORK_PLAN rule).
> Go / no-go today: **GO for the native path** (the release APK builds; models, pipeline, storage settled);
> **the feature's go / no-go** comes from the phone: first **Gate 1** (§0) — if a Play Integrity verdict cannot be
> bound to each check-in on our link-installed APK, the answer is **no self-scan for anyone** — then the numbers in §1.

## 0. Acceptance gates (security audit phase 3, 12-10-2026 — binding, not optional)

From the audit's face review (private audit repo, `2026-10-12/find/phase3/S4-face.md`, findings S4F-01…11), sent by
the lead chat on 12-10-2026:

| Gate | What must be shown | If it fails |
|---|---|---|
| **Gate 1 — request-bound integrity** | On a **link-installed** APK (not from Play): the server issues a single-use challenge (≤ 60 s); the app gets a Play Integrity token whose `requestHash` = hash(login, action, challenge, location result); the token is decoded by Google and checked **server-side**: hash, package name, **pinned signing-certificate digest**, `MEETS_DEVICE_INTEGRITY`, single use. Device verdict seen on 3 budget phones. | **No self-scan for anyone** (not "minors wait"); Phase 3 = QR, coordinator and parent emails (Plan B). Recorded in DECISIONS. |
| **Gate 2 — device-only face codes** | The design and every measurement use **no server copy** of any face code (no `my_face_template()`); the server would keep only an enrolment record (who approved, when, model version). Adults first; minors only after the lawyer's answers and the Guru's minimum age. | Not a pass/fail test: a design rule the spike follows (it has no server at all) and P3-2 must adopt. |
| Own-phone fingerprint | **Not an attendance factor** (it shows only who unlocked the phone). Measured only as a possible add-on to a future rotating My QR; never in Friday's APK. | — |
| Centre fingerprint reader | **No** (children's fingerprints stored by the class, hardware, conflicts with #248). | — |
| Also asked (S4F-04/07/08) | Attacks incl. **live video-call relay** and mask/cut-out; pass = passive score ≥ t **and** 2-step challenge within 4 s **and** face never leaves the frame. Developer-verification status and Play fee. Model files with SHA-256 and licence text, APK delta per ABI, peak RAM, cold start on the cheapest phone. | Recorded as measured. |

**Gate status 12-10-2026:** Gate 1 — **documented YES on paper, ⏳ proof on the phone.** Google's verdict reference
says `appIntegrity.packageName`, `certificateSha256Digest` and `versionCode` are filled "iff appRecognitionVerdict !=
UNEVALUATED" — i.e. also for **UNRECOGNIZED_VERSION**, which is what a non-Play APK gets — so a server *can* pin our
certificate. The spike app, a PC "server" (`spike-tools/gate1-server.mjs`) and a Cloud Shell decoder
(`spike-tools/gate1-decode.py`) are ready to prove it in one sitting (§8 "Gate 1 steps"); the checker was tested
on made-up verdicts (valid → PASS; replayed challenge, wrong certificate, wrong hash → FAIL). Gate 2 — met by the spike
(templates only in the phone's Keystore-encrypted store, nothing on any server).

Background: [WORK_PLAN.md](WORK_PLAN.md) § P3-0, [MODEL_OPTIONS.md](MODEL_OPTIONS.md),
[DPIA_DRAFT.md](DPIA_DRAFT.md), [CONSENT_DRAFT.md](CONSENT_DRAFT.md), DECISIONS #212-#213, #248, #253-#255.

## 1. Results against the targets

| Question | Target | Desk result (12-10-2026) | Phone result |
|---|---|---|---|
| Builds with Expo SDK 57 / RN 0.86, New Architecture | yes | prebuild OK; Gradle release build: see §6 | ⏳ installs and runs on Android 10-15 |
| Frame → match time | < 500 ms on a ₹10-15k phone | arithmetic in Node 2-4 ms per face; model sizes small (§4) | ⏳ median / p90 (Results tab) |
| False accept / false reject | FAR ≈ 1 in 10,000 at the chosen threshold; FRR low enough that most check-ins pass first time | 4 public portraits: same person 0.81, different 0.11-0.31 (threshold 0.363) — sanity only | ⏳ 5-10 adults: genuine vs impostor scores |
| Printed photo | refused | challenge (blink + turn) cannot be done by a photo | ⏳ attacks logged |
| Phone-screen replay | refused | a video can blink/turn → relies on MiniFASNet + integrity | ⏳ attacks logged |
| APK size increase | known | **+65.9 MB** (72.1 → 138.0 MB, both ABIs); ≈ +50 MB without SQLCipher + GPU delegate, ≈ +35 MB arm64-only (§6) | — |
| Memory | known | — | ⏳ peak MB |
| Local template storage | encrypted on the phone | expo-secure-store (Keystore) chosen; SQLCipher built in for comparison (§7) | ⏳ timings |
| **Gate 1**: integrity verdict bound to each check-in, link-installed APK | all 8 server checks pass (§0) | documented possible: package + certificate digest are filled for UNRECOGNIZED_VERSION; device verdict default; free 10,000/day, no raise off Play (§8) | ⏳ gate1-server.mjs PASS on the test phone + device verdict on 3 budget phones |
| Key attestation (alternative / second check) | chain to Google root, challenge, locked + verified boot, our package + certificate | verifier written and tested on Google's sample chain (§8) | ⏳ chain from the test phone |
| **Gate 2**: no server copy of face codes | none | spike has no server; templates only in the phone's Keystore store | — |
| Phone fingerprint | UX only, **not attendance** | proves who unlocked the phone, not identity (§8) | ⏳ prompt time |

## 2. What was built

A separate test app, **"Mridanga Seva SPIKE"**, from the class app's code on branch `p3-spike`:

- Android applicationId **`org.mridangaseva.app.spike`**, URL scheme `mridangasevaspike`, purple icon
  background, its own EAS build profile and update channel **`spike`** — it installs **next to** the real
  app and can never replace it or receive the real app's updates (fingerprint 7aced01a…, real app 0dea00a3…).
- **No server at all**: the root layout opens the spike screens directly; no sign-in, no Supabase, no push
  (no `google-services.json`: Firebase knows only the real package). The EAS build guard on the branch lets
  the `spike` profile through only with no Supabase settings or TEST ones, never LIVE.
- The class app's screens and native modules stay in the APK, so the build proves the face packages
  coexist with everything the real app ships (camera, audio, location, notifications, SQLite…).
- Tabs: **Start** (enrolled codes, "Delete all face data"), **Enrol**, **Check**, **Attack**, **Results**
  (FAR/FRR table, attack outcomes, timings, CSV export), **Phone** (fingerprint, Keystore, SQLCipher, key
  attestation, Play Integrity, model speed, memory), **Settings** (thresholds, challenge, fast path,
  photo instead of frame).
- Volunteers are **codes only** (V01…V10); names stay on the paper consent forms.

Code: `app/src/spike/` (face-math.ts, liveness.ts, pipeline.ts, face-camera.tsx, scan-screen.tsx, store.ts,
phone-checks.tsx, results.ts, spike-app.tsx), tests `app/tests/spike-face.test.mjs` (12 tests).

## 3. Packages chosen (exact versions)

| Piece | Package | Version | Notes |
|---|---|---|---|
| Camera + frame processing | `react-native-vision-camera` | 5.2.3 | Nitro-based (New Architecture only); frame output in YUV, VGA 4:3, frames dropped while busy |
| Worklet runtime glue | `react-native-vision-camera-worklets` | 5.2.3 | uses the app's `react-native-worklets` 0.10.1 (built upstream against 0.9.1) |
| Nitro runtime | `react-native-nitro-modules` | 0.37.1 | shared by VisionCamera, face detector, TFLite |
| Image type | `react-native-nitro-image` | 0.15.2 | Frame → Image conversion, crop/rotate, raw RGBA pixels |
| Face detection + landmarks | `react-native-vision-camera-face-detector` (Google ML Kit face-detection 16.1.7, bundled model) | 2.1.0 | live frames and still pictures; eye-open, yaw/pitch for the challenge |
| Model runtime | `react-native-fast-tflite` (LiteRT 1.4.0) | 3.0.1 | CPU; GPU delegate not needed for these sizes |
| Template store | `expo-secure-store` | ~57.0.4 | Android Keystore; optional fingerprint lock |
| Fingerprint test | `expo-local-authentication` | ~57.0.3 | BiometricPrompt, class 3 ("strong") only |
| Integrity | `@expo/app-integrity` (alpha) | ^57.0.2 (57.0.2) | Play Integrity standard request **and** hardware key attestation |
| Encrypted SQLite (comparison) | `expo-sqlite` with `useSQLCipher: true` | ~57.0.4 | not needed for one template (§7) |

Rejected: `onnxruntime-react-native` (bigger, JS-thread API, would need ONNX in the frame loop),
InsightFace packs (non-commercial licence), `expo-face-detector` (removed since SDK 51), VisionCamera's
`useAsyncRunner` (its 5.2.3 source carries a TODO that `scheduleOnRuntime` throws; not needed).

## 4. Models

| Model | Source / licence | TFLite file | Size | Input → output |
|---|---|---|---|---|
| SFace 2021dec (MobileFaceNet + SFace loss) | OpenCV Zoo, **Apache 2.0** | `sface_2021dec_int8.tflite` | 9.9 MB (fp16 19.3 MB, fp32 38.6 MB) | 112×112 RGB aligned face → 128 numbers |
| MiniFASNetV2, box ×2.7 | minivision Silent-Face-Anti-Spoofing, **Apache 2.0** (LICENSE file read 12-10) | `minifasnet_v2_2_7_int8.tflite` | 0.6 MB | 80×80 BGR → real / fake |
| MiniFASNetV1SE, box ×4.0 | same | `minifasnet_v1se_4_0_int8.tflite` | 0.6 MB | same; the two are averaged as upstream does |

Conversion (scripts in [spike-tools/](spike-tools/)): ONNX → onnxsim → onnx2tf 1.28.8 (TF 2.21) →
TFLiteConverter "dynamic range" int8 (int8 weights, float maths); MiniFASNet `.pth` → PyTorch 2.14 ONNX
export with softmax added → same path. sha256 of every file in `app/assets/models/README.md`.

**Parity check on the PC** (public-domain portraits; OpenCV 5.0 `FaceRecognizerSF` on the original ONNX as
reference; inputs made by the app's own `face-math.ts`):

| | fp32 | fp16 | int8 (shipped) |
|---|---|---|---|
| cosine(app pipeline + TFLite, OpenCV reference), 4 faces | 0.9999-1.0000 | 0.9999-1.0000 | 0.9990-0.9992 |
| same person (2 photos) | 0.813 | 0.813 | 0.815 (ref 0.813) |
| different people (5 pairs) | 0.110-0.311 | 0.110-0.311 | 0.115-0.315 (ref 0.110-0.312) |

MiniFASNet TFLite matched the PyTorch model on the upstream crop within 0.02 (real-face probability);
the app's crop differs from upstream's by 0.2/255 per pixel on average.

**Open licence point (unchanged, for the lawyer):** SFace's training data is not named on the model card
(the paper used CASIA-WebFace / VGGFace2 / MS-Celeb-1M). MODEL_OPTIONS §6 item 1.

## 5. How a scan works (and where the time goes)

1. VisionCamera streams the **front camera** in YUV at VGA; on the camera's own thread ML Kit finds the face,
   5 landmarks, eye-open probabilities and head angles (`detectLive`).
2. The numbers go to the screen, which runs the **challenge**: blink and turn the head, in random order,
   8 s per step; a lost face or a second face fails it. A printed photo cannot pass.
3. On a good frontal frame after the challenge, that frame becomes a picture (`convert`).
4. **Landmarks on the picture:** "exact" = save a temporary JPEG, run ML Kit on it, delete the file at once
   (`saveJpg`, `detectStill`); "fast" = carry the live landmarks over (`place`) using the turn/mirror learnt
   from one exact run. (VisionCamera 5.2.3's converter turns the bitmap by its own orientation enum, whose
   mapping from CameraX's rotation is not obvious in the source, so the app learns it instead of assuming it.)
5. Raw pixels (`pixels`) → aligned 112×112 face + two 80×80 crops (`crops`, 2-4 ms in Node) → SFace (`sface`)
   → MiniFASNet pair (`fas`) → cosine with the volunteer's template → decision.
6. If the frame path fails on a phone, the app switches to a **still photo** automatically (slower).

⏳ phone: median and p90 of frame → result, per step, for fast and exact.

## 6. APK size, build and New Architecture

**The release APK builds.** GitHub Actions run 38268132141 on 2cb1d44 (12-10-2026): `npm ci`, lint, tsc,
98 unit tests, `expo prebuild`, then `./gradlew :app:assembleRelease` (minified, arm64-v8a + armeabi-v7a, New
Architecture, Hermes) — **all green on the first try**, Gradle 31 min on GitHub's 4-core runner. So VisionCamera 5.2.3,
Nitro 0.37.1 (fast-tflite's code was generated with nitrogen 0.35 and still compiles), worklets 0.10.1, ML Kit, LiteRT,
SQLCipher and every module of the class app (reanimated 4.5.1, expo-camera, expo-audio, expo-notifications…) build
together on Expo SDK 57 / RN 0.86 / AGP 8.12 (several libraries declare AGP 9.x in their own buildscript; Gradle uses
the app's AGP and that works). Runtime behaviour on a phone: ⏳.

**APK size** (run 38272364374 on 8999b60, 12-10-2026; release, both ABIs in one APK as the class app ships; native
libraries are stored uncompressed, so APK size ≈ download size):

| | Bytes | MB |
|---|---|---|
| Baseline: brief9-apk 3a5dcc0, same build, no face packages | 72,106,180 | 72.1 |
| Spike (8999b60) | 137,979,446 | 138.0 |
| **Increase** | 65,873,266 | **+65.9** |

Where the +65.9 MB goes (arm64-v8a libraries listed by the build; armeabi-v7a is the remainder):

| Part | arm64 MB | Needed for face? |
|---|---|---|
| ML Kit face detection (`libface_detector_v2_jni.so`) | 8.5 | yes |
| VisionCamera (`libVisionCamera.so` + worklets 0.1) | 6.0 | yes |
| SQLCipher's `libcrypto.so` | 5.0 | **no** (#278: SecureStore instead) |
| LiteRT CPU (`libtensorflowlite_jni.so` + `libNitroTflite.so` 0.4) | 4.7 | yes |
| LiteRT GPU delegate (`libtensorflowlite_gpu_jni.so`) | 2.5 | **no** (CPU only) |
| Nitro runtime + NitroImage + face-detector glue | 3.0 | yes |
| expo-sqlite grew with SQLCipher | 0.1 | no |
| **arm64 total** | **29.8** | 22.2 needed |
| armeabi-v7a libraries (remainder) | ≈ 22 | ≈ 17 needed (estimate, same ratio) |
| Our three models (SFace 9.9 + MiniFASNet 2×0.6) | 11.0 | yes |
| ML Kit's bundled face models (`fssd_*`) | 1.7 | yes |
| Java/Kotlin code (dex, compressed) + JS bundle | ≈ 0.6 | yes |

So the Phase 3 APK needs about **+50 MB** with both ABIs (dropping SQLCipher and the GPU delegate, both P3-3 items), or
about **+35 MB** for an **arm64-only** APK — every ₹10-15k phone sold since ~2019 is 64-bit; a separate 32-bit APK
could stay available for old phones (P3-3 decides). fp16 SFace instead of int8 would add 9.4 MB for no measurable
accuracy gain (§4). Peak RAM and cold start: ⏳ phone.

The GitHub artifact of each push is kept 30 days (from 673bd8b); re-run the workflow for a fresh one.

## 7. Keeping the template on the phone

- **Chosen: `expo-secure-store`** — the template (128 floats = 512 bytes, plus 5 samples ≈ 4 KB as text) is
  encrypted with a key held in the Android Keystore; `allowBackup` stays false (the plugin adds backup
  exclusion rules too). Optional `requireAuthentication` ties reading it to the phone's fingerprint/PIN —
  measured in the Phone tab, not proposed for the class (a student without a fingerprint set up would be
  locked out of face check-in).
- **SQLCipher** (`expo-sqlite` `useSQLCipher`) works for a whole encrypted database but is more than one
  template needs, changes the class app's existing SQLite build for everyone, and still needs its key kept
  in the Keystore — so it adds nothing for P3-4. Measured anyway (Phone tab: cipher_version, wrong key refused).
- **Gate 2 (device-only):** this is the only copy. P3-2 keeps a server *enrolment record* (student, device key /
  attestation id, model version, approved by, dates, revoked) and **no face code**; `my_face_template()` is dropped; a
  re-install or new phone means a supervised re-enrolment at the desk; the phone wipes its template on every
  sign-out path and whenever the server says the enrolment is no longer current (audit S4F-02/03/06).
- No picture is ever stored; the "exact" path's temporary JPEG lives in the app's cache for the few
  milliseconds ML Kit needs and is deleted in a `finally`.

## 8. Integrity and fingerprint

**Play Integrity on a link-installed APK** (Google's setup page, read 12-10-2026):
- Needs a **Google Cloud project** (free); linking to Play Console is for Play apps only.
- Tokens are decrypted **on Google's servers** (self-managed keys need a Play listing) → a backend call with a
  service account (an Edge Function in P3-6).
- Verdicts: **device integrity** (MEETS_DEVICE_INTEGRITY, or empty on rooted / emulated / hooked phones) is
  available; **app recognition = UNRECOGNIZED_VERSION** and **licensing = UNLICENSED** for any APK not from Play, so
  those two verdicts cannot be used — but the same reference says packageName and certificateSha256Digest are
  still filled for UNRECOGNIZED_VERSION, which is what certificate pinning needs (Gate 1). Stronger labels (STRONG /
  BASIC) are returned on Android 13+ only for apps installed or updated by Play.
- **Quota:** 10,000 token requests and 10,000 decryptions per day per Cloud project, free; raises are only for
  apps on Play. Class need: ~200 students × 2 scans × a few days a week ≪ 10,000/day.

**Hardware key attestation** (`generateHardwareAttestedKeyAsync` + certificate chain, same package): free, no
Google account, verified on our own server against Google's attestation root and revocation list. It proves the
key lives in the phone's secure hardware (TEE/StrongBox), the **bootloader is locked and verified boot is green**,
and — unlike Play Integrity off Play — **which app (package + signing certificate) asked**. It can be bound to a check-in too (the server's challenge goes into the
attested key). Offered as a **second check**, or as a stand-in only if the audit agrees — the gate rule is Play Integrity.
Verifier: spike-tools/attest-verify.py (tested on Google's own sample chain). ⏳ phone: supported? chain?

**Gate 1 steps (Praveen + this chat, one sitting, ~30 min after the volunteers' session; ₹0):**
1. Google Cloud console (personal Google account): create project "mridanga-seva-spike", note its **project number**,
   enable **Play Integrity API**; IAM → Service accounts → create "integrity-decoder" → Keys → add JSON key (stays in
   Cloud Shell).
2. PC, this worktree: `node docs/phase3/spike-tools/gate1-server.mjs issue` → challenge (16 hex, valid 60 s).
3. Phone, Phone tab: project number, challenge, code V01 → **Gate 1: Play Integrity for this check-in** → Share the raw
   result (to the PC, as `shared.json`). Same challenge → **Gate 1: key attestation** → share (`attest.json`).
4. Cloud Shell: upload `shared.json` + `gate1-decode.py` → `python3 gate1-decode.py key.json shared.json > decoded.json`
   → download `decoded.json`; then delete the key (`gcloud iam service-accounts keys delete …`).
5. PC: `node gate1-server.mjs check shared.json decoded.json --cert <SHA-256 from npx eas-cli credentials -p android>`
   and `python -I attest-verify.py attest.json <roots dir> --cert <same SHA-256>`. Run the first check twice: the
   second must FAIL (single use). Repeat step 2-5 on two more budget phones for the device verdict.
6. Paste all outputs to the spike chat. Gate 1 passes only if every rule says PASS on the test phone.

If decodeIntegrityToken refuses an unlinked project, or the payload has no certificate digest for our APK, Gate 1
**fails → no self-scan for anyone** (unless the Guru decides to publish the app on Play, US$25 one-time — a ₹0 conflict).
Key attestation alone does not change that rule: it is the audit's call whether it can stand in for Play Integrity.

**Developer verification (S4F-07):** Google's Android developer verification applies to apps installed outside Play
on certified phones from 30-09-2026 in Brazil, Indonesia, Singapore and Thailand, "globally in 2027 and beyond"; India has
no date yet. Registration in the Android Developer Console needs ID documents and a one-time US$25 (waived for
"limited distribution" accounts) — the class app itself will need this before 2027 whatever happens to face scan
(source: support.google.com/android-developer-console/answer/16561738, read 12-10-2026).

**Phone fingerprint** (Praveen's "biometric thumb", lead chat 7; audit S4F-10: **not an attendance factor**): `expo-local-authentication` with
`biometricsSecurityLevel: 'strong'` shows Android's own prompt; the app gets only success / failure, never the
fingerprint. It proves **an enrolled finger on this phone**, which may be a parent's or a friend's — **owner
presence, not identity**. It is not an attendance factor (audit S4F-10); the only use worth measuring is unlocking a future **rotating My QR**
(stops screenshot sharing) in the Phase 3 APK — never Friday's APK. A **centre fingerprint reader: No** (S4F-11).
⏳ phone: prompt time, how many volunteers have a fingerprint set up.

## 9. Test day (for Praveen, after Wed 21-10-2026)

**People and phones.** A **dedicated test phone** (no class login, TEST only; **factory reset** at the end, with a
deletion log line). 5-10 **adult** volunteers (18+; **no children** at all), each signs the consent sheet
(appendix A) first; give each a code V01…V10 and write code + name **only on the paper**. One test phone of the
₹10-15k class (note model and Android version), plus one other phone or tablet for screen replays, plus a colour
print of one volunteer's face (A4, normal printer) — that volunteer consents to it in the sheet; shred it after.

**Install.** The spike APK (§10). It appears as "Mridanga Seva SPIKE" next to the real app.

**Steps (≈ 90 minutes for 8 people):**
1. **Phone tab** first: run every button once (fingerprint only with the phone owner); **Share all these lines**.
2. **Enrol** each volunteer (Settings unchanged): code, tick "signed consent form", follow the prompts
   (blink, turn, hold still). One enrolment each.
3. **Check** each volunteer **10 times**, varying a little: 3 in the room's normal light, 3 by a window, 2 with
   glasses on/off or hair changed, 2 holding the phone lower. Every check also scores against all the others
   (impostor scores) — no extra work.
4. **Attack**, for 3 volunteers: 3× printed photo, 3× photo on the other phone's screen, 3× a short video of
   the volunteer (blinking, turning) played on the other phone, 2× **live video-call relay** (the volunteer on a
   video call doing the blink/turn, the call screen held to the test phone), and a paper mask/cut-out if at hand.
   Pick the attacked volunteer's code each time.
5. Settings → turn **Fast path** off, do 5 more checks (exact-path timing); turn **photo** on, do 3 checks.
6. **Results tab** → "Save scores as CSV" (to Downloads) and "Share this summary"; send both to the spike chat.
   The CSV has codes and scores only — no names, no pictures.
7. **Delete**: Start tab → "Delete all face data" (the message lists what was removed, with the time) →
   **uninstall** the app → **factory reset** the test phone → shred the printed photo → delete the replay
   photo/video from the other phone.
   Note the date and time in §11.

**What decides go / no-go:** frame → result median < 500 ms on the test phone; at the threshold where no
impostor score passes, at least ~90 % of genuine checks pass first time; no printed photo and no screen photo
accepted; screen video outcome recorded (if videos pass, minors' self-scan waits for the integrity check +
supervised enrolment, as DPIA says). 10 people give ~90 genuine and ~800 impostor scores — enough to see the
gap, **not** enough to prove 1 in 10,000; the pilot (P3-7) keeps measuring.

## 10. Build steps (Praveen; one build)

The office network blocks EAS uploads — use the phone hotspot. In a **new** PowerShell terminal on the PC
(docs/OPERATIONS.md "Building the Android app" has the same two setup lines):

```powershell
cd C:\Users\praveen.a\Mridanga_Seva_App\.claude\worktrees\recursing-mahavira-33ad66\app
$env:Path = "C:\Users\praveen.a\AppData\Local\Programs\Git\cmd;$env:Path"
$env:NODE_OPTIONS = '--use-system-ca'
npx eas-cli build --platform android --profile spike
```

- It asks **"Generate a new Android Keystore?"** → **Yes** (a new key just for `org.mridangaseva.app.spike`;
  the real app's key is not touched).
- It may say the channel `spike` is new → accept.
- At the end it prints an install link/QR for the APK. Paste the last ~30 lines of the output to the spike chat.

**Alternative with no EAS build at all:** GitHub builds the same APK on every push to `p3-spike`
(Actions → "Spike APK (p3-spike)" → artifact `face-spike-apk`, kept 30 days, debug-signed; the run's annotations
show its signing-certificate SHA-256, which Gate 1 then pins instead of the EAS one: run 38276340855 on 4fd24ef, 137,982,258 B,
V2 signer SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`, the debug key — fine for a test, never for real). Fine for a throwaway
test app; an EAS build is needed only if we want updates on the `spike` channel.

## 11. Deleting the volunteers' data

- **Where it is:** only on the test phone — templates in the Android Keystore-encrypted store, scores in the
  app's own folder. Nothing on any server, no pictures anywhere (temporary JPEGs are deleted within the scan).
  The exported CSV (codes + scores) goes to the spike chat for the numbers in this file; the code ↔ name list
  exists only on the paper consent sheets.
- **How:** "Delete all face data" (lists each item removed, with the time) → uninstall the app (Android removes
  the app's folder and its Keystore keys) → shred the printed photo, delete replay media.
- **When:** at the end of the test day, and in any case **by 31-10-2026**. A volunteer who withdraws earlier:
  Start tab → Remove next to their code (their scores stay as numbers without a name).
- **Record:** ⏳ date/time of deletion and uninstall, by whom.
- After the numbers are in this file: delete the CSV from the chat/Downloads; the paper sheets are kept with the
  class's consent records for 1 year, then shredded (or as the lawyer advises).

## 12. Risks

1. **Frame → picture turn/mirror** (§5) — handled by learning it; if the fast path misplaces landmarks the exact
   path still works (slower). P3-3 should fix the mapping once on real phones and drop the temporary JPEG.
2. **Screen-video replays** — MiniFASNet is a small open model; a good video on a good screen may pass blink/turn
   and the passive check. Mitigations: supervised first enrolment, key attestation/Play Integrity, location once
   at check-in (#212), coordinator fallback, conservative thresholds, logging.
3. **Accuracy on children and siblings** is not measurable in the spike (adults only, by rule). Minors need the
   pilot data and the Guru's minimum-age answer (DECISIONS_FOR_GURU 3).
4. **Alpha / young packages:** `@expo/app-integrity` is alpha; VisionCamera 5 and Nitro move fast — pin exact
   versions (done), re-test on every SDK upgrade (SDK 58 waits, #258).
5. **APK size** +65.9 MB as built (§6): a 138 MB download on students' mobile data is heavy. Trim to ≈ +35-50 MB in P3-3 (no SQLCipher, no GPU delegate, arm64-only APK) and keep the APK link on Wi-Fi at the desk.
6. **Licence of SFace training data** — lawyer question stays open.

## 13. What P3-3 (native foundation) must include

- The packages and **exact versions** in §3; `tflite` in Metro `assetExts`; the three model files with their
  README (licences, sha256).
- Camera permission text in en/te/hi ("…for the face scan, only when you check in or out"); keep brief 9's
  `blockedPermissions` and `allowBackup: false`; add `expo-secure-store` and `expo-local-authentication` plugins
  only if P3-4 uses them.
- The fingerprint changes → a **new APK** for everyone (record the new fingerprint); from then on main's updates
  reach only that APK (WORK_PLAN P3-3).
- `src/spike/face-math.ts` and `liveness.ts` with their tests as the starting point of the real code
  (they are pure and tested); the screens are throwaway.
- Do not ship SQLCipher; exclude `libtensorflowlite_gpu_jni.so` (Gradle packaging exclude via a small config plugin);
  consider an arm64-only APK (`buildArchs`) — together ≈ 30 MB less (§6). Ship `@expo/app-integrity` only with P3-6.
- A hidden dev screen (WORK_PLAN) can be a cut-down Phone tab + one scan.

## 14. Decisions (proposed; numbers reserved #277-#279, final after the test day)

- **#277** On-device chain = VisionCamera 5.2.3 + ML Kit face detector 2.1.0 + fast-tflite 3.0.1 with SFace int8 +
  MiniFASNet V2/V1SE int8 (models converted by us, parity ≥ 0.999 with OpenCV). ⏳ confirm with phone timings.
- **#278** The local template lives in `expo-secure-store` (Keystore), not in SQLCipher; no pictures kept, the
  temporary JPEG of the exact path deleted in the same call.
- **#279** Gate rule (audit S4F-01): self-scan exists only if a Play Integrity verdict bound to each check-in
  (single-use server challenge, requestHash, pinned certificate, MEETS_DEVICE_INTEGRITY, decoded by Google, checked
  server-side) works for the link-installed APK; otherwise **no self-scan for anyone**. Face codes device-only (S4F-02).
  Own-phone fingerprint is not an attendance factor; centre reader rejected. ⏳ pass/fail from the Gate 1 steps.

## Appendix A — Consent sheet for spike volunteers (adults only; print one per person)

**Face scan test — Mridanga Seva class app — volunteer consent** · Version spike-1, 12-10-2026

We are testing, on **one test phone**, whether a face scan could later let students check themselves in.
This is a **test only**; it has nothing to do with your attendance and is not the class app.

- The test phone takes a few pictures of your face and turns them into a **face code** (a list of numbers;
  this is biometric data). The pictures are **deleted at once**; no photo of you is kept by the app.
- Your face code and your test scores stay **only on the test phone**, under a code (for example V03) — your
  name is only on this paper. Nothing is sent to any server or company.
- You will check in about 10 times. If you agree below, we may also hold a printed photo or a video of you up
  to the phone to see whether the app can be fooled; the print is shredded and the video deleted the same day.
- **Everything is deleted by 31-10-2026 at the latest** (the app is wiped and uninstalled). Only the numbers
  (no names) are kept in the test report.
- Taking part is **voluntary**. You can stop at any time, and ask us to delete your face code at once.
- Only adults (18 or over) take part.

Questions: [organiser name, phone] · Privacy contact: [privacy contact].

☐ I am 18 or over and I **agree** to take part in the face scan test as described.
☐ I also agree to a printed photo / short video of my face being used for the "can it be fooled" test.

Code: V___  Name: ______________  Signature: ______________  Date: __________
