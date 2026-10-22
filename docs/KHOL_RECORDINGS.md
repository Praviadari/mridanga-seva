# Real khol sounds: what the Guru records

The practice tools (taal player, step mode's Hear it, the tap pad, Which bol?, Echo me) play **synthesised** strokes
today. The app is ready to play the class's own khol instead ([DECISIONS.md #473](DECISIONS.md)): a setting "Drum
sound: synthesised / real khol" appears under Practice → Play and learn as soon as recordings are in the app. No
recording ships until the Guru has made them. This page says exactly what to record and how they get into the app.

## What to record: 9 strokes

Each is **one stroke of one hand**, as `app/src/lib/bols.ts` plays it. The combined bols (dhā = tā + ga, dhin = tī + ga,
jhā = ga then tā, kat = ka + tī) are made by the app from these two together, so they need no recording of their own.

| File | Bol | Head · hand | How it is played (bols.ts) | Rings or damped |
|---|---|---|---|---|
| `ta.wav` | tā | dayan · right | index finger on the edge of the syahi | rings (lift at once) |
| `na.wav` | nā | dayan · right | index finger on the kinar (outer ring) | rings |
| `ti.wav` | tī (tin) | dayan · right | three fingers flat on the syahi | damped (press and stay) |
| `ra.wav` | ra / re | dayan · right | index finger on the syahi | damped |
| `te.wav` | te | dayan · right | middle finger on the syahi | damped |
| `ka.wav` | ka / ke / ki | baya · left | flat hand over the head | damped |
| `gha.wav` | gha | baya · left | fingers on the syahi | rings |
| `ga.wav` | ga / ge | baya · left | wrist on the head, fingers strike the maidan | rings |
| `gin.wav` | gin / jin | baya · left | the slide on the maidan (pitch rises) | rings |

Optional, for later (not used by the app yet): `dha.wav`, `dhin.wav`, `jha.wav`, `kat.wav`, played as one bol with both
hands, in case the Guru prefers the app to play them as recorded.

If the Guru plays a stroke differently from the table, record it as the Guru plays it and tell the team: the table (and
bols.ts) is then corrected, not the recording. The unverified bols (tin → tī, kha/khe → ka, ge/gi → ga, dhi → dhin) wait
for the Guru's word in the same way.

## How to record (about 15 minutes, at the class)

1. **A quiet room**: fan and AC off, doors and windows closed, other phones on silent, nobody talking. Recordings with
   voices or children in them are not used.
2. **The class's own khol**, tuned as for class.
3. **One phone**, on a stand or held still by someone else, about **30 cm** from the head being played, pointing at it.
   The same place for all the strokes of that head (one place for the dayan's five, one for the baya's four).
4. For each stroke: say the bol's name once (it helps to label the files; the voice is cut out afterwards), wait two
   seconds, then play the stroke **5 times, 3 seconds apart**, at the loudness used in class. Let an open stroke ring
   out completely; do not touch the head until the sound has died away.
5. Any recording app works. Better a **WAV** setting if the app has one; otherwise its usual format (m4a) is fine and
   the team converts it.

## What the team does with them

1. Pick the cleanest of the 5 takes of each stroke (no knock, no voice, full ring).
2. In Audacity (free): cut to start a few milliseconds before the stroke and end when the sound has died away (at most
   1.5 s; the app also cuts the silence before the stroke and evens out the loudness, `lib/stroke-samples.ts`); no
   effects, no reverb. Export as **WAV, 16-bit PCM, mono**, 44.1 kHz (22.05 kHz is enough and halves the size). Nine
   strokes are well under 1 MB.
3. Save them as `app/assets/sounds/khol/<file>.wav` with the names in the table, and add one line per file to
   `KHOL_SAMPLE_FILES` in `app/src/lib/khol-samples.ts`, e.g. `ta: require('../../assets/sounds/khol/ta.wav'),`.
   A stroke without a file keeps its synthesised sound.
4. Check: `npm test`, `npx tsc --noEmit`, and the fingerprint is still the production APK's (sound files are assets;
   expo-asset is in the APK, so this is an over-the-air update). Listen on a phone with the setting on "Real khol":
   taal player, Hear it, tap pad (only the beat), Which bol?.
5. Credit: the Guru's own recordings belong to the class; nothing to credit. If a stroke is taken instead from a
   CC BY recording (e.g. Freesound "Low Khol 1" by ap_krishna), its author is named in About. CC BY-NC or unknown
   licences are not used.

The recordings are of the instrument only: no personal data. They are part of the app like its pictures.
