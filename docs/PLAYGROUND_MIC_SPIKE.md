# Spike: microphone and pitch detection on Android (Rhythm Playground W5)

28-10-2026 · worker W5 · docs/RHYTHM_PLAYGROUND.md §11.2-§11.3 · docs/DECISIONS.md #764, #767.
**Desk spike — no phone was tested and no APK was built** (an APK build needs Praveen). Every claim below is from the
code in this repository and its installed packages (expo 57, expo-audio ~57.0.5, react-native-webview 13.16.1), and
says which device test would confirm it.

## Question

The Voice games (§7.5, §7.13) may show an approximate pitch line ("a little higher / lower / close"). The web build
has one now (lib/pitch.web.ts, TEST builds only). What would the Android app need, and can it be done without a new
APK (fingerprint 23dc7e4a)?

## What the installed APK can do

| Capability | In the APK today? | Evidence |
|---|---|---|
| Record a take to a file (AAC .m4a) and play it back | **Yes** | expo-audio recorder, `lib/recording.ts`; "Record myself" and assessments use it |
| Microphone permission asked at the moment of use | **Yes** | `app.json` expo-audio plugin `microphonePermission`; `askMicrophone()` |
| A loudness level while recording ("too quiet") | **Probably** | expo-audio `RecordingOptions.isMeteringEnabled` → `status.metering` (dB). Not enabled in `RECORDING_OPTIONS` yet; needs a phone check. Never used to judge quality |
| Live audio samples in JavaScript (needed for pitch) | **No** | expo-audio records to a file only; no sample stream or tap API in `AudioModule.types.d.ts` |
| A web page in the app using the browser microphone | **Very likely** | react-native-webview 13.16.1 is in the APK (lesson videos). Its Android `RNCWebChromeClient.onPermissionRequest` maps `RESOURCE_AUDIO_CAPTURE` to `RECORD_AUDIO`: granted at once when the app already holds the permission, otherwise it asks Android and grants on yes. `RECORD_AUDIO` is in the manifest (expo-audio plugin) and not in `blockedPermissions` |

## Routes for a pitch line on Android

1. **WebView route — no new APK (recommended to try first).** A small `<WebView>` (hidden or a strip) loads an inline
   page that runs the same YIN code as `lib/pitch-estimate.ts` on `getUserMedia` audio and posts
   `{hz, clarity, level}` to the app with `postMessage` ~10 times a second. Needs: `source={{ html, baseUrl:
   'https://mridanga-seva-test.pages.dev' }}` so the page is a secure context; `mediaPlaybackRequiresUserAction`
   left as is (no playback). Risks to measure: Android System WebView versions on cheap phones (getUserMedia needs
   WebView 47+ — all supported phones have it), the delay of the WebView audio path (unimportant for a pitch
   word, important for timing — timing is not attempted), echo cancellation/noise suppression (turn off in
   constraints as the web build does; some WebViews ignore it), the app's own audio session while recording.
   **Device test (1 day):** a TEST-only screen behind the same TEST switch, sent as an OTA to the TEST APK; sing
   10 notes against a tuner app on 3 phones (one cheap); record grant/deny flows and whether the word is stable.
2. **Native route — new APK.** An audio-input module (an open-source Expo/React Native module, or a small own Expo
   module on Android `AudioRecord`) streaming frames to JavaScript or computing pitch natively. Changes the
   fingerprint: new APK on Praveen's hotspot (office network blocks EAS uploads), new GitHub release, every
   student reinstalls, OTA updates for older APKs stop matching. Only if route 1 fails, and only **bundled with the
   next planned APK (the face APK)**, with Praveen's go (§11.3, #695).
3. **Upload and analyse later — rejected.** Sending singing to a server or an outside AI service is ruled out
   (§13.2: never sent to outside AI services; takes only through "Send to my facilitator").

## Mic onset detection of real khol strokes (timing of real playing)

Not attempted (§11.3, §11.4 research only). It needs sample-accurate input with a measured input delay (a clap
calibration) and headphones, i.e. route 2 plus a research spike on 3-4 cheap phones. The WebView route's input delay
is unknown and likely variable; it should not be used for timing.

## What W5 shipped (JavaScript only)

- Web/iPhone home-screen app: `lib/pitch.web.ts` + `lib/pitch-estimate.ts`, only in a build pointing at the TEST
  project and only after the student turns it on; nothing recorded, kept or sent; words only, never stored.
- Android/iOS app: `lib/pitch.ts` says "not available"; the voice games work fully without it (self-check, optional
  recording, "Send to my facilitator").

## Recommendation

No APK for Phase 3. Next step when the lead wants it: the 1-day WebView device test above on the TEST APK. Before any
pitch line counts for anything, compare it with Prji's judgement on 10+ real voices (§11.2, DYN-08).
