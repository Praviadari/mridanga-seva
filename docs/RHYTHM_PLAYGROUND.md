# Rhythm Playground — design and requirements review

**Status:** proposal for Prji's sign-off. **No app code has been written for it.** 28 October 2026, playground-design
worker (branch `claude/playground-design-504412`). Decisions recorded as [DECISIONS.md #690-#699](DECISIONS.md).

**Sources:** Prji's "Rhythm Playground master prompt" (pasted by Praveen 28-10-2026); "Rhythm Playground —
Comprehensive Development & Learning Specification v3.0" (27-10-2026; called "the spec" below); the Facilitator SOP
360° review (terminology only); Praveen's answers of 28-10-2026; and the app's real code on `main` at `c9b93fd`.

> **The prompt assumed React.js + Java Spring Boot. That is not this app.** Mridanga Seva is one **Expo SDK 57** app
> (React Native, the same code for Android phones and for the web/iPhone home-screen app) on **Supabase** (a Postgres
> database with row-level security, Storage for files, scheduled jobs, and a few Edge Functions). There is no Java,
> no Spring Boot and no separate REST server. Everything below is designed for the real stack; where the prompt or the
> spec names React/Spring parts or REST endpoints, §5 and §9 say what takes their place. Because the source code was
> available and was read, the architecture here is **not provisional** except where a line is marked *Assumption*.

**How each statement is marked:**
**[Confirmed]** = asked for by Prji's prompt or spec, or decided by Praveen/the lead, or already in the app.
**[Proposed]** = this design's suggestion. **[Assumption]** = believed true, not yet checked with a person.
**[Needs approval]** = Prji (music/teaching), Praveen (product/money) or the lead (technical) must say yes first.

| Prji's "first task" step | Where answered |
|---|---|
| 1 Read spec v3.0 fully | §1 (read in full; gaps in §2) |
| 2 Summarise product and learning objectives | Part A, §1 |
| 3 Missing information, dependencies, ambiguities, improvements | §2, §16 |
| 4 Integration with the existing app | §5, §6, §10 |
| 5 Architecture, game classification, roadmap, proof of concept | §5, §3-4, §14, §17 |
| 6 What must be verified against source | Appendix A |
| 7 Decisions needing the technical team's approval | §16.2 |

---

## Part A — Summary for Prji (plain English, about two pages)

**What you asked for.** A "Rhythm Playground" inside the Mridanga Seva app: 14 short practice games that make students
better listeners, steadier in laya, surer of the tāla cycle and sam, more comfortable singing, and in the end better
kīrtan accompanists. Not addictive, not competitive, always built on material you have approved, and never claiming a
student plays well just because they won a quiz.

**What already exists in the app (built in October).** About a third of the work is done in a simple form:

- **"Which bol?"** — the app sounds a bol or a short phrase and the student picks it from cards. This becomes
  **Sound Detective**.
- **Tap pad** — two drum pads on the screen; the student taps along with a taal and each tap is checked as on time,
  early or late, after the phone's own delay is measured once. This becomes **Tap the Beat**.
- **Echo me** — the app plays one vibhag, then leaves the same time silent for the student to play it back. This
  becomes **Echo Challenge**.
- **Layakari** (barabar, dugun, tigun, chaugun) and **silent cycles** in the taal player — the base of **Rhythm
  Switching** and **Tāla Cycle Master**.
- The **Daily Mission** card on the student's Home and Practice tab — the base of **Daily Sādhana Quest**.
- **Record myself** and **sending a recording to an assessment** for a facilitator to review — the base of every
  "send to your facilitator" step in the voice and kīrtan games.
- A ready place for **your real khol recordings**: the app plays a made-up (synthesised) likeness of each stroke today
  and switches to your recordings as soon as they are added.

**What is new.** Rhythm Builder, Missing Beat, Tempo Detective, Sound Explorer, Tāla Cycle Master (the full game),
Rhythm Switching (switching guna inside one exercise), Voice Companion, Vocal Sādhana Studio, Kīrtan Companion, Kīrtan
Synchronization, Surprise Me, the Playground home, the progress view, and — most important — **the content engine**.

**The content engine is the heart of it.** You approve three things: (1) a **bol dictionary** — every stroke name the
class uses, with your recording; (2) an **exercise bank** — phrases and patterns you have checked, with the tempo
range and guna each may be played at; (3) the **rules** for each game (how many choices, how long a phrase, which
levels). The app then makes fresh rounds for every student every day by choosing, shuffling and combining only those
approved pieces. It **never invents a bol, a phrase or a tāla.** It never asks the same question twice in a row; it
brings back what a student got wrong a day, three days and a week later, and labels that "Review". When there is not
enough approved material for real variety it says so ("Review practice") instead of making something up. Every round
can be replayed exactly, so a mistake a student reports can be found.

**Where it sits.** On the student's **Practice** tab, one "Rhythm Playground" entry replaces today's three game tiles.
Inside: four groups — **Listening, Rhythm, Voice, Kīrtan** — plus **Surprise me** and **My Playground progress**. The
Daily Mission stays the one daily plan: it gains two or three short Playground challenges next to the real-khol
practice, chosen from the student's weakest skill. For facilitators it sits under **Teaching** on the new Facilitator
Home: the content library, your approval queue, assignments to a level or a group, and each student's progress.

**Listening is not playing.** The app keeps two kinds of result apart: **recognition** (picked the right bol, found
the sam, heard the tempo change) and **performance** (kept the beat, played it back, sang it, accompanied the kīrtan).
Screen taps are only a stand-in for playing. Real playing and singing are judged **by you or a facilitator** from a
recording the student chooses to send. Progress words are gentle — **Exploring, Practising, Steady, Ready for
Review** — and "Ready for Review" means "please check this in class", not "mastered". No points race, no ranking, no
streak that can be lost, nothing shown to other students.

**Sound: what works now and what is later.** Works now on every phone and in the browser: your recorded strokes and
phrases, playing them at exact times on the beat, tempo changes, and tap timing after the phone's delay is measured.
Later and only after testing on real cheap phones: the microphone **listening to** a student's singing pitch or drum
strokes. In the web app this can be tried without a new app download; on Android it needs a new app (APK) build, so
it waits until it is proven. The microphone is **off by default**, the student turns it on, and no voice or playing
leaves the phone unless the student taps **"Send to my facilitator"**.

**What we need from you (the release blocker).** Nothing can reach students until you approve real content. The first
gate is **30-50 approved prompts** spread over the first four games, plus your **9 single-stroke recordings**, the
**real taals** (the three in the app today are placeholders), the tempo range and guna per level, and later short
**kīrtan clips** whose singers and players have given written permission. The full list is §18. Until then the team
builds and tests with clearly marked TEST sounds that can never be published to the real app.

**Recommended first step.** Build **Sound Detective** completely first (§17): it needs only your 9 stroke recordings,
it upgrades a game students already know, and it proves the whole engine — your approval, fresh rounds, no repeats,
saving results, the progress words — before anything harder is built.

**Your decisions are listed in §16.2.** The most important: approve the bol dictionary and the first 30-50 prompts;
confirm the pilot group (8-12 beginners from your class, with parents' consent for children); say whether Playground
time counts towards the weekly practice goal (we suggest it does not — the goal stays real-khol practice).

---

## 1. Executive summary of understanding (deliverable 1; steps 1-2)

**Product.** [Confirmed] A module of the existing app — not a separate app (prompt §20.1) — offering short, private,
content-driven practice activities in four skill areas: listening (A), rhythm (B), vocal (C), kīrtan accompaniment
(D) (prompt §4). 14 games (prompt §5; spec §3, §23-26). It supplements the facilitator and the real mṛdaṅga; it does
not replace them (spec §1).

**Learning objectives.** [Confirmed] Every game has one specific objective and a way to measure progress (prompt §4,
§16). Recognition and performance are assessed separately (prompt §10; spec §22). No claim of improvement without
evidence; completing a game is not proficiency (prompt §16).

**The mandatory core.** [Confirmed] A reusable engine that makes fresh, valid challenges from a growing approved
library, adapts difficulty, revisits weak skills, avoids repetition, and never produces musically incorrect, unapproved
or untaught combinations (prompt §6; spec §15-16, §28 DYN-01…08). A game is not "dynamic" because buttons shuffle
(spec §20.3).

**Values.** [Confirmed] Practice as sādhana and seva; no addictive mechanics, public rankings, punitive streaks,
autoplay surprises or excessive screen time (spec §1, §4, §18; prompt §6). Children, adults and seniors; beginners
first; cheap phones and slow networks (spec §1).

**Decided on 28-10-2026.** [Confirmed] Content approver = **Prji**. Launch **English only** (data keeps room for
Telugu). Pilot = **8-12 beginners Prji picks from his own class**, children and adults, with parental consent for
minors. Retention (lead): raw attempts 180 days, then weekly per-skill summaries kept while enrolled, deleted with the
account; no audio stored unless the student taps "Send to facilitator"; such a take is deleted 30 days after review or
60 days if never reviewed. Colours: keep the current indigo and gold, saffron accent only — no palette change.
Unreleased items show dimmed "Coming soon", not tappable.

**The real starting point.** [Confirmed, read in the code] Expo + Supabase; the student has four tabs (Home | Learn |
Practice | Me, #670); the Practice tab is `/student/my-practice` and already lists three games (tap pad, Which bol?, Echo
me); one bol notation already drives the taal player, the two-head drawing, the tap pad, the ear quiz and Echo me
(`lib/bols.ts`, `lib/practice-pattern.ts`); taals live in the `taals` table, written only by the head facilitator
login; recordings for review go through assessments.

---

## 2. Requirements review and gap analysis (deliverable 2; step 3)

### 2.1 Confirmed requirements (from the prompt and spec, kept as they are)

| # | Requirement | Source |
|---|---|---|
| R1 | 14 games, each with the 12-point card | prompt §5 |
| R2 | Engine: approved bol dictionary, exercise bank, templates, seeded generator, repeat guard, curriculum guard, adaptive rules, low-content "Review practice" | spec §16, §28; prompt §6 |
| R3 | Recognition and performance kept apart; labels Exploring / Practising / Steady / Ready for Review | spec §22, §30; prompt §10 |
| R4 | Facilitator approval before any exercise is published; versioned, auditable content | prompt §12; spec §9 |
| R5 | Microphone optional, off by default, consented, separate from non-recording games | spec §20.1, §25 |
| R6 | No automatic grading of real playing or singing until piloted and compared with facilitator ratings | spec §4, §11, §28 DYN-08 |
| R7 | Private progress; no leaderboards, public profiles, messaging or pressure streaks | spec §4, §31 |
| R8 | 3-5 minute sessions; exit always available; progress kept on interruption | spec §5 table, §28 |
| R9 | Accessibility: large targets, contrast, screen readers, reduced motion, non-colour cues, replayable instructions, no hearing-only sole path | spec §18, §20.1, §31 |
| R10 | Authentic, licensed recordings with source, performer permission, revision and approver tracked | spec §6, §26 |
| R11 | "Coming soon" for unreleased games; no dead icons | spec §5 table |
| R12 | Release gate: content diversity, repeat tests, syllabus compliance, small pilot, pedagogy sign-off | spec §20.3 |

### 2.2 Gaps — information missing before build or release

| Gap | Why it matters | Who | Blocks |
|---|---|---|---|
| G1 The class's **real taals** (the 3 in the app are placeholders: `taals.placeholder = true`) | The curriculum guard takes phrases from approved taals | Prji | Release |
| G2 **Approved bol dictionary**: the app's stroke map has 4 unverified mappings (tin, kha/khe, ge/gi, dhi — `lib/bols.ts`) | Wrong stroke names would teach wrong technique | Prji | Release |
| G3 **Recordings**: 9 single strokes (docs/KHOL_RECORDINGS.md), phrases, kīrtan clips, instruments, voice prompts | Spec requires authentic sound | Prji | Release |
| G4 **Tempo range and guna per level** (e.g. Beginner 60-80 bpm, guna 1-2) | Generator must not exceed approved BPM/guna (DYN-03) | Prji | Release |
| G5 What **"guna"** means in this class: spec says 1/2/4/8; the app's layakari is 1/2/3/4 (barabar, dugun, tigun, chaugun) | Rhythm Switching must use the class's convention | Prji | **Closed 29-10-2026: 1/2/4/8, #774** |
| G6 **Kīrtan clip rights**: performers' written permission, lyrics status, where they may be used | Licensing (spec §26) | Prji + Praveen | Kīrtan games |
| G7 **Tonic (Sa) choices** and comfortable ranges for children/adults | Vocal games (spec §6) | Prji | Voice games |
| G8 **Rubric wording** (0-3) for kīrtan entry, chant clarity, rhythm sample | Facilitator review (spec §30) | Prji | Phase 3 |
| G9 Who owns **privacy review, accessibility QA, go/no-go** (spec §14) | Release gates | Praveen | Release |
| G10 The **class's kartāl pattern** (the app plays a placeholder, #492) | Kīrtan and Sound Explorer realism | Prji | Phase 3 |

### 2.3 Contradictions and ambiguities found

1. **Home icon vs the current student Home.** The spec wants a circular "Rhythm Playground" icon on Home beside "My
   Learning, Practice, Vocal Studio, My Progress, Events". The student Home is now a card layout with the Daily
   Mission first (#674); the ring of circles was replaced on 27-10 and a "ring version" is still with Praveen. A
   separate "Vocal Studio" icon would duplicate the Playground's Voice group. → §6 resolves it.
2. **MVP list differs.** Spec §4/§3 = four games (Sound Detective, Rhythm Builder, Missing Beat, Tempo Detective);
   spec §28 P0 adds a visual Tāla Cycle Master; the prompt's Phase 1 = the four + basic progress. → §14 puts the visual
   Tāla Cycle Master in Phase 1 (it needs no new audio).
3. **Guna 1/2/4/8 vs layakari 1/2/3/4** (G5).
4. **Two pairs overlap:** Voice Companion vs Vocal Sādhana Studio (both pitch match and steadiness); Kīrtan Companion
   vs Kīrtan Synchronization (both "follow a recording and keep the pulse"). "Instrument Explorer" (spec) = "Sound
   Explorer" (prompt). → §7 keeps all 14 names, but each pair shares one screen engine: the first is the guided
   beginner entry, the second the full studio (Needs approval).
5. **Per-question "Attempt" rows** (spec §8) would grow the free 500 MB database fast. → one row per finished round
   with its items inside (§9.3, §13.4); same information, about a tenth of the rows.
6. **REST endpoints and a "generation service"** (spec §29) → Supabase functions and client-side generation (§5, §9).
7. **Roles.** The spec names Student, Facilitator, Content reviewer, Admin. The app has `guru` (shown in English as
   the head facilitator), `coordinator`, `student`, `pending`, `kiosk`. → Content reviewer and Admin = the head
   facilitator login; coordinators = facilitators (§10). *Assumption:* Prji uses the head facilitator login.
8. **Pilot "Tirupati Beginner"** (spec §32) → replaced by Prji's own 8-12 beginners (decided 28-10).
9. **Telugu bol spelling** in the dictionary vs English-only launch → keep an optional column, show nothing until the
   native review.
10. **"Weekly reflection"** in Daily Sādhana Quest → the app already asks "How did it go?" after practice (#494):
    reuse it, no second questionnaire.
11. **Offline is "optional Phase 2"** in the spec; the app is already offline-first for practice (#593), and ₹10k
    phones on poor networks are the norm → approved packs are cached on the phone from the start.

### 2.4 Improvements proposed beyond the spec

- [Proposed] **Reuse assessments for "Send to my facilitator"** (§10.4): no new upload store, the existing review
  screen and rubric, and the existing 30-days-after-review deletion already match the lead's retention decision.
- [Proposed] **Phrases are built from the approved single-stroke recordings** by the existing exact-timing renderer,
  so one recording session of 9 strokes already feeds hundreds of approved phrase prompts at any approved tempo.
  Played phrase recordings are added where Prji wants the natural feel (Echo, Tempo Detective).
- [Proposed] **One Playground switch per pilot group**: Playground visible only to members of a group Prji chooses
  (the app's existing `groups`), so the pilot needs no special build.
- [Proposed] **Relaxed timing** setting (wider on-time window) for motor or device limits, never labelled failure.
- [Proposed] A gentle **"Time for your real khol"** prompt after 15 minutes of Playground in a day (spec §18 "easy
  stop"; prompt §6 "not time in app").

---

## 3. Skill-to-game mapping matrix (deliverable 3)

Skill areas from prompt §4. **R** = recognition evidence (quiz-type); **P** = performance evidence (timing measured on
taps, or a facilitator's rating of a recording); **·** = practised but not measured there.

| # | Game | A Listening | B Rhythm | C Vocal | D Kīrtan | Evidence kind | Main skill id (§8.2) |
|---|---|---|---|---|---|---|---|
| 1 | Sound Detective | strokes, similar sounds, phrases — R | · | · | · | R | `listen.stroke`, `listen.phrase` |
| 2 | Tap the Beat | · | steady laya, mātrā, pulse — P (taps) | · | · | P (tap timing, calibrated) | `rhythm.pulse` |
| 3 | Echo Challenge | auditory memory — R | reproduce sequences — P (taps / sent take) | call-and-response (later) | · | R + P | `rhythm.recall` |
| 4 | Missing Beat | mistakes in patterns, sequences — R | pattern sense — R | · | · | R | `listen.phrase`, `rhythm.sequence` |
| 5 | Voice Companion | reference notes | · | pitch, steadiness — P (self/facilitator) | · | P (indicative only) | `vocal.pitch`, `vocal.steady` |
| 6 | Rhythm Builder | · | mātrā count, sequence — R | · | · | R | `rhythm.sequence` |
| 7 | Kīrtan Companion | follow singer — R | identify cycle — R | · | enter at right point — R/P | R + P | `kirtan.entry` |
| 8 | Tempo Detective | tempo change — R | laya awareness — R | · | tempo changes — R | R | `listen.tempo` |
| 9 | Sound Explorer | instruments, ensemble — R | · | · | attentive ensemble — R | R | `listen.instrument` |
| 10 | Daily Sādhana Quest | (mix) | (mix) | (mix) | (mix) | inherits each challenge's | — (consistency: days practised) |
| 11 | Tāla Cycle Master | · | cycles, sam, mātrā count, without visuals — R + P (sam taps) | · | identify cycle | R + P | `rhythm.cycle_sam` |
| 12 | Rhythm Switching | which guna — R | guna 1/2/4(/8) transitions, steady laya — P (taps) | rhythmic chanting (later) | · | R + P | `rhythm.guna` |
| 13 | Vocal Sādhana Studio | melodic movement | rhythmic chanting | pitch, steadiness, pronunciation, call-response — P (facilitator) | singing confidence | P (facilitator-reviewed) | `vocal.*` |
| 14 | Kīrtan Synchronization | follow lead singer — R | keep cycle, follow tempo — P (taps) | · | enter, keep, recover, soft/pause — P (facilitator) | R + P | `kirtan.entry`, `kirtan.keep`, `kirtan.recover` |

Coverage check against prompt §4: every listed objective appears at least once. Two objectives can only be trained,
not measured, in an app — "when to play softly, emphasise or pause" and "attentive ensemble playing" (D): these are
judged by the facilitator from a sent recording or in class (§12).

---

## 4. Feature prioritisation (deliverable 4)

| # | Game | Exists today | Built on | Priority | Phase (§14) | Needs Prji's content first? |
|---|---|---|---|---|---|---|
| 1 | Sound Detective | **Partly** — "Which bol?" (#471) | ear-quiz.ts | **P0 / PoC** | 1 | 9 strokes + dictionary |
| 6 | Rhythm Builder | No | bank sequences, taal notation | P0 | 1 | approved sequences |
| 4 | Missing Beat | No | bank sequences | P0 | 1 | approved sequences |
| 8 | Tempo Detective | No | renderer at two tempos | P0 | 1 | sequences + BPM ranges |
| 11 | Tāla Cycle Master (visual + audio, no grading of sam taps yet) | **Partly** — silent cycles (#490), vibhag marks | taals table, silent cycles | P0 | 1 | real taals |
| 2 | Tap the Beat | **Partly** — tap pad (#470) | tap-grading.ts | P1 | 2 | none (beat clicks) |
| 3 | Echo Challenge | **Partly** — Echo me (#472) | echo.ts | P1 | 2 | phrases (played phrases optional) |
| 12 | Rhythm Switching | **Partly** — layakari (#491) | practice-pattern.ts | P1 | 2 | guna convention (G5) |
| 10 | Daily Sādhana Quest | **Partly** — Daily Mission (#673) | today-practice.ts | P1 | 2 | — |
| — | Surprise Me | No | engine | P1 | 2 | — |
| 9 | Sound Explorer | No | clip player | P2 | 3 | instrument clips |
| 5 | Voice Companion | No (Record myself exists) | recorder, reference tones | P2 | 3 | tonic choices, prompts |
| 13 | Vocal Sādhana Studio | No (Record myself + assessments exist) | same | P2 | 3 | voice prompts, rubric |
| 7 | Kīrtan Companion | No | clip player + beat grid | P2 | 3 | licensed kīrtan clips |
| 14 | Kīrtan Synchronization | No | same + tap grading | P2 | 3 (stages A-B), 4 (C-D) | clips with annotations |
| — | Mic pitch / onset analysis | No | — | P3 research | 4 | validation samples |

---

## 5. Architecture and integration strategy (deliverable 5; steps 4-5)

### 5.1 The prompt's assumed parts → the real ones

| Prompt / spec assumes | This app actually has | Playground uses |
|---|---|---|
| React.js web frontend | Expo SDK 57, React Native + React Native Web, expo-router file routes under `app/src/app/` | New routes under `student/playground/` and `staff/playground/`; screens under `app/src/screens/playground/` |
| Java Spring Boot services + REST API | Supabase: Postgres tables read directly under **row-level security**; writes through **security-definer SQL functions** (RPC); Edge Functions only for mail/push/integrity | Tables + RLS + RPCs in migration 0065 (§9). **No Edge Function and no new server.** |
| "Generation service" on the server | Pure TypeScript in `app/src/lib/` (as ear-quiz.ts, echo.ts), tested with `npm test` | Seeded generator on the phone (works offline), checked again by the server when a round is saved |
| DB "to be verified" | Postgres on the Supabase free tier (500 MB DB, 1 GB Storage); migrations `supabase/migrations/0001…0064` | Migration **0065** (reserved) |
| Auth "to be reviewed" | Supabase Auth; roles in `profiles.role` (`guru`, `coordinator`, `student`, `pending`, `kiosk`); helper functions `is_guru()`, `is_staff()`, `my_student_id()` | Same helpers in every policy |
| Media server / signed URLs | Supabase Storage, private buckets, signed links (e.g. lesson audio, #683) | New private bucket `playground-audio` for approved content; student takes reuse `assessment-files` |
| Analytics service | `client_errors` table with a scrubber (0061); no third-party analytics | Playground generation failures go to `client_errors` with no personal data |
| Feature flags | `settings` key-value table (e.g. parent page switch) | `playground_enabled`, `playground_pilot_group` |
| Deployment | OTA updates (expo-updates) for JS; web on Cloudflare Pages; APK only for native changes; TEST and LIVE Supabase projects | JS-only for Phases 1-3 (fingerprint 23dc7e4a unchanged); native only in Phase 4 |

### 5.2 Layers

```
Student screens (Playground home, game screens, progress)      Facilitator screens (Teaching → Rhythm Playground)
            │ one GameShell: instructions · round · feedback · summary · exit
            ▼
Engine (app/src/lib/playground/): notation · eligibility (curriculum guard) · seeded generator · repeat guard ·
          adaptive rules · progress labels · pack cache · round queue (offline)
            │                                     │
Audio (exists): practice-sounds renderer ·        Data (app/src/data/playground.ts): pack download, round upload
 khol-samples (recorded strokes) · practice-audio  │
 (exact-time loop on phones, audio clock on web) · ▼
 tap-grading (calibrated)                          Supabase: play_* tables, RLS, RPCs, Storage bucket, nightly job
```

### 5.3 Integration rules

- [Confirmed] No separate app; existing modules untouched unless named in a work package (§19).
- [Proposed] The existing tap pad, "Which bol?" and Echo me screens **become** Tap the Beat, Sound Detective and
  Echo Challenge: same addresses (`/student/tap-pad`, `/student/which-bol`, `/student/echo-me`), so What's new
  entries and old links still open them; the free-play modes they have today stay as a "Free play" choice inside.
- [Proposed] All games share one **GameShell** (instructions preview, progress dots, replay, feedback, round summary,
  always-visible exit) and one **round recorder**; their musical logic stays separate (prompt §5 "share components
  without losing educational differences").
- [Proposed] **One bol notation** for everything (§8.1): the `taals` notation already used by every practice tool.

### 5.4 Build versus buy

| Need | Decision | Why |
|---|---|---|
| Rhythm timing, scheduling, rendering | **Build on what exists** | Measured drift −0.16 ms on web (ARCHITECTURE "Practice tools"); sample-exact loop on phones |
| Question engine | **Build** (small TypeScript) | No product fits the approval/curriculum rules; rules-based, no machine learning (spec §17) |
| Content management | **Build** in the staff area | Must use the app's roles and audit log |
| Pitch detection on web | **Build** later from a published method (autocorrelation/YIN) | Small, JS only, no licence cost |
| Mic analysis on Android | **Buy/borrow** an open-source native audio module if the spike proves the need | Native code is a new APK; keep it to one well-tested library |
| Speech recognition of bols | **Neither** for now | Unreliable on Sanskrit/Telugu syllables (spec §22 table) |

---

## 6. Home screen and navigation (deliverable 6)

### 6.1 Students

```
Practice tab (/student/my-practice)
 ├ Daily Mission card            ← unchanged place; gains 2-3 Playground challenges (Daily Sādhana Quest)
 ├ Practice tools · Weekly Practice · My Practice Goal · Practice History   (unchanged)
 └ Rhythm Playground  (one large card; replaces today's "Games" tiles)
      /student/playground
      ├ Surprise me   (one optional mixed round)
      ├ Listening:  Sound Detective · Missing Beat · Tempo Detective · Sound Explorer
      ├ Rhythm:     Tap the Beat · Echo Challenge · Rhythm Builder · Tāla Cycle Master · Rhythm Switching
      ├ Voice:      Voice Companion · Vocal Sādhana Studio
      ├ Kīrtan:     Kīrtan Companion · Kīrtan Synchronization
      └ My Playground progress
```

- [Proposed] **One address per game.** The Playground home links to each game; the Daily Mission and Surprise me open
  the same game screens with a ready round. No game exists twice (prompt §11 "no duplication").
- [Proposed] **Circular icons inside the Playground home** (prompt §11 "attractive circular module icons"), three per
  row, in the current indigo/gold style; unreleased games dimmed with "Coming soon" and not tappable (lead 28-10;
  spec §5 "no dead icons").
- [Proposed] **Home tab:** no separate Playground icon while the Home is the card layout (#674) — the Daily Mission
  card already leads there. If Praveen chooses the "ring version" of Home that student-nav is preparing, a Playground
  circle may join it as **a link to the same `/student/playground`**, not a second path. [Needs approval: Praveen]
- [Proposed] The **game flow** (spec §18): Instructions (10-15 s, read aloud on request, skipped after the first time
  unless asked) → round of 4-8 challenges → feedback after each → round summary → "Listen again · Practise this bol ·
  Try a new pattern · Change difficulty · Back to Playground", plus "Now play it on your khol" where it fits. Back
  and Exit always visible; leaving mid-round keeps the answered items.
- [Proposed] **Waiting logins** (not yet accepted by the desk) keep their current practice screen; the Playground
  comes with acceptance (it needs a student record for progress).
- [Proposed] The Playground screens load in the **student area bundle**, not the first web download (#650).

### 6.2 Facilitators

- [Proposed] Facilitator Home (11 modules, facilitator-home worker) → **Teaching** → "Rhythm Playground" row →
  Content library · Approval queue · Assignments · Class progress · Recordings to review. One row is added to the
  Teaching landing screen — **that file belongs to facilitator-home**; the Playground worker adds the row after it
  merges (§19).
- [Proposed] The **Student profile** gains a "Rhythm Playground" section: labels per skill, last practised,
  "Ready for review" items, the facilitator's own ratings.
- Facilitators can open every game in **preview** (nothing saved), as they open the practice tools today.

---

## 7. Game-specific UX: the 14 game cards (deliverable 7)

Each card has the 12 points Prji asked for. "Existing" says what is in the app now; "New" what must be built.
**Levels** use the app's levels (Beginner, Intermediate, Advanced) and per-game **difficulty steps** inside a level.
Feedback words throughout: correct = "That's it!" with a tick icon and the word (never colour alone); wrong = "Not
yet — listen again" and the right answer after the set number of tries; never "wrong", "failed" or "off beat".

### 7.1 Sound Detective — Listening · Phase 1 · **PoC**

| Point | |
|---|---|
| Existing / new | **Existing:** "Which bol?" (#471): 3 cards with hand drawings, single bols or 2-4-bol phrases from the level's taals, "in a row" count on the phone. **New:** approved dictionary and recordings only; 2→4 choices; "sounds alike" pairs; rounds saved; progress label |
| Objective | Recognise each taught stroke by ear and tell closely related strokes apart; later recognise short phrases (A) |
| Level | Beginner steps 1-4; phrases from Beginner step 5; Intermediate adds closer pairs and 3-4-bol phrases |
| Instructions | "Listen. Which bol did you hear? Tap the card. You can listen again as often as you like." |
| Content | Approved bols with Prji's recordings; "sounds-alike" and "close pair" lists in the dictionary; approved phrases (bank or real taals) |
| Interaction | Play (auto only after the student taps Start, never on opening) → tap a card (large, drawing + bol name) → hear each card afterwards to compare |
| Progression | Step 1: 2 choices on different heads (dayan vs baya) · 2: 3 choices · 3: 4 choices · 4: close pairs (e.g. tā/nā) · 5: 2-bol phrases · 6: 3-4-bol phrases where one bol differs |
| Variations | Which stroke, which card order, which distractors (from approved bols of the level), single vs phrase, prompt as sound→name or name→sound ("Which one is tī?": three sounds) |
| Feedback | Per item; after 2 tries the answer is shown and played; summary "You recognised 6 of 8. tā and nā were close — practise them?" |
| Scoring | Recognition: correct/total per bol and per pair; replays counted (more replays = less sure, not "worse") |
| Facilitator controls | Enable for level/group; choose bols in play; mark close pairs; max step; assign |
| Technical | JS only. Recorded strokes via `khol-samples` (bundled, OTA); phrases rendered by the existing renderer |
| Acceptance | 10 seeded sessions: no back-to-back repeat when ≥2 alternatives; 100% of prompts use approved bols with recordings; a card's sound = its label (parity test); works offline after the first pack download; screen reader reads each card's bol and hand |

### 7.2 Tap the Beat — Rhythm · Phase 2

| Point | |
|---|---|
| Existing / new | **Existing:** Tap pad (#470): two pads, taal strokes graded on the audio clock, "Tune to this phone" calibration, 0-3 stars, best per taal on the phone. **New:** "pulse" mode (tap each beat or each mātrā of 4/8 with the metronome), evenness measure, fading guide, rounds saved |
| Objective | Keep a steady pulse with and then without the click; count mātrās (B) |
| Level | Beginner: 4 then 8 pulses; Intermediate: whole taal strokes (today's mode) |
| Instructions | "Tap the big pad on every click. Then the clicks get quieter — keep going." |
| Content | None new for pulse mode (synthesised clicks); taal mode uses approved taals |
| Interaction | Count-in → tap with clicks → clicks fade (silent cycles, #490) → clicks return to show where you are |
| Progression | Tempo within the level's approved range; guide visible → hidden; clicks every beat → only on sam → silent bars |
| Variations | Tempo, number of silent bars, pulse vs mātrā vs taal strokes, visual guide on/off |
| Feedback | After each cycle: "Steady" / "A little rushed" / "A little slow" from the median error; a calm "heartbeat line" of the taps; no beep on a miss |
| Scoring | Performance (taps): median timing error (ms), spread (ms), share of beats tapped; **shown only when the phone is calibrated** — otherwise "practice only" (spec §11, §24) |
| Facilitator controls | Tempo range per level; silent-bar options; "Relaxed timing" for a student |
| Technical | JS only; existing tap grading and calibration |
| Acceptance | Calibrated phone: steady taps at 70 bpm score "Steady"; uncalibrated: no timing label shown; taps during silent bars graded against the hidden pulse; no drift over 3 minutes (web schedule log) |

### 7.3 Echo Challenge — Rhythm · Phase 2

| Point | |
|---|---|
| Existing / new | **Existing:** Echo me (#472): plays a vibhag, then silence of the same length with optional clicks; pad answers graded; Record myself takes kept apart. **New:** calls drawn from the approved bank (not only vibhags), growing length, recall after a delay, rounds saved, optional "Send my answer" |
| Objective | Listen, remember and reproduce a short pattern (A auditory memory, B reproduce) |
| Level | Beginner: 2-4 strokes; Intermediate: one vibhag; Advanced: two vibhags or delayed recall |
| Instructions | "Listen. Then play it back on the pads — or on your khol." |
| Content | Approved phrases (rendered from strokes, or Prji's played recordings) |
| Interaction | Call → answer window with soft clicks → next call; pad answers graded; drum answers practised (and may be recorded) |
| Progression | Length 2→8 strokes; tempo up within range; clicks on → off; immediate → after one silent cycle |
| Variations | Which phrase, length, tempo, clicks, answer mode (pads / khol / say the bols aloud) |
| Feedback | Pads: which strokes matched in order and timing; khol: "Did it sound the same? Listen to both" (self-check) |
| Scoring | Recognition-type: order of strokes correct; performance: timing per stroke (calibrated only); khol answers: not scored by the app |
| Facilitator controls | Phrases in play; answer modes allowed; enable "Send to my facilitator" for a level |
| Technical | JS only (existing echo plan + tap grading + recorder) |
| Acceptance | Answer windows exactly as long as the call; only answer-window taps count; a sent take arrives in the facilitator's review list |

### 7.4 Missing Beat — Listening · Phase 1

| Point | |
|---|---|
| Existing / new | **New** |
| Objective | Notice what is missing or changed in a known pattern (A mistakes in patterns, B pattern sense) |
| Level | Beginner from step 1 |
| Instructions | "Listen to the pattern. One bol is missing. Which one?" |
| Content | Approved sequences of 4-8 bols (bank or real taals) |
| Interaction | The phrase plays with one position silent (the grid shows "?" there) → choose from 3-4 bols → hear the full phrase |
| Progression | 1: one gap, 3 choices, grid visible · 2: 4 choices · 3: grid hidden · 4: two gaps · 5: "one bol is changed — which position?" |
| Variations | Sequence, gap position, distractors, tempo within range, visual on/off |
| Feedback | Plays the complete phrase with the answer lit |
| Scoring | Recognition: correct per gap; by position (start/middle/end) to spot attention patterns |
| Facilitator controls | Sequences in play; max gaps; allow "changed bol" step |
| Technical | JS only; the gap is the approved sequence with one event removed (no new music created) |
| Acceptance | Gap never falls on a rest; the "complete" playback equals the approved sequence exactly; distractors are approved bols of the level and never the right answer's sound-alike |

### 7.5 Voice Companion — Voice · Phase 3 (guided entry to Vocal Sādhana Studio)

| Point | |
|---|---|
| Existing / new | **New** (Record myself exists) |
| Objective | Pitch awareness: hear a reference note, sing it back comfortably; sustain a note without strain (C) |
| Level | All ages; the student picks a comfortable range (child / higher / lower voice) |
| Instructions | "Listen to the note. Sing it softly on 'aa'. Stop whenever you like." Health line: "Sing gently. Stop if your throat feels tired." |
| Content | Reference tones generated from Prji's chosen tonics (no recording needed); Prji's sung examples optional |
| Interaction | **Without microphone (default):** listen → sing → listen again → "Did you match it? Yes / Not sure" (self-check). **With microphone (opt-in):** record 5-10 s → play yours next to the reference. **Pitch line (research, web first):** an approximate "higher / lower / close" line with a confidence note |
| Progression | Single note → note held 3/5/8 s (student-chosen) → two-note step → short phrase |
| Variations | Tonic, note, duration, with/without drone |
| Feedback | Never about loudness, pitch height or "good voice"; only "closer / listen again" and replay |
| Scoring | Performance, indicative only: self-check counts; pitch line results stored only as "practised" until validated (spec §25, DYN-08) |
| Facilitator controls | Allowed tonics/ranges; mic features on/off per group; "Send to my facilitator" on/off |
| Technical | No mic: JS only. Record & compare: existing recorder (in the APK). Pitch line: web JS-only; Android needs new native code → Phase 4 (§11) |
| Acceptance | Mic never starts without a tap; recording indicator visible; the no-mic path completes the game; nothing uploaded without "Send" |

### 7.6 Rhythm Builder — Rhythm · Phase 1

| Point | |
|---|---|
| Existing / new | **New** |
| Objective | Build a heard pattern from bol tiles in the right order and count; learn the vocabulary and the mātrā structure (B) |
| Level | Beginner: 3-4 bols in one vibhag; Intermediate: whole theka with vibhag marks |
| Instructions | "Listen. Put the bols in the order you heard. Tap a tile, then tap its place." (tap-to-place; no dragging needed) |
| Content | Approved sequences; distractor tiles only from approved bols of the level |
| Interaction | Hear → place tiles on a beat grid (sam X, khali 0 marks shown) → Play mine → Check |
| Progression | No extra tiles → 1-2 extra tiles → hidden grid marks → build from the spoken bols only (padhant) → place the vibhag marks yourself |
| Variations | Sequence, tile order, extra tiles, with/without sound replay, notation shown or heard only |
| Feedback | Wrong places marked with a symbol and "listen to this part again" (that beat replays) |
| Scoring | Recognition: whole order correct; per-position correctness |
| Facilitator controls | Sequences; extra tiles on/off; levels |
| Technical | JS only; "Play mine" renders the student's order with the same notation and renderer |
| Acceptance | Accessible without drag (keyboard and screen reader can place tiles); "Play mine" always matches the tiles shown; never accepts an order that differs from the approved one unless the two sound the same (same sound key) |

### 7.7 Kīrtan Companion — Kīrtan · Phase 3 (guided entry to Kīrtan Synchronization)

| Point | |
|---|---|
| Existing / new | **New** |
| Objective | Follow a real kīrtan: recognise its pulse and cycle, find where the mṛdaṅga joins (D) |
| Level | Beginner kīrtan (mahāmantra, slow) upward |
| Instructions | "Listen to the singer. Tap when you think the khol should start." |
| Content | Licensed, annotated clips (sam times, cycle length, entry points), at least two tempos each |
| Interaction | Stage A of §7.14: listen → tap the pulse → tap the entry point → hear the entry played by Prji |
| Progression | Beat hints on → hints only at sam → no hints; slow clip → medium clip |
| Variations | Clip, starting point in the clip, hints, tempo version |
| Feedback | Shows where the entry was and replays it |
| Scoring | Recognition: entry point found (within half a beat); pulse taps' timing as practice only (clip latency must be calibrated as on the tap pad) |
| Facilitator controls | Clips in play per level; hints policy |
| Technical | JS only: clip played with expo-audio / Web Audio; the beat grid read against the player's own clock, as the tap pad does |
| Acceptance | Annotated sam times line up with the audio within 20 ms on test devices; the clip never starts by itself |

### 7.8 Tempo Detective — Listening · Phase 1

| Point | |
|---|---|
| Existing / new | **New** |
| Objective | Hear tempo differences and changes; later hear subdivision changes (A tempo, B laya) |
| Level | Beginner from step 1 |
| Instructions | "Listen to both. Was the second one faster, slower or the same?" |
| Content | Approved sequences with approved BPM ranges; optional Prji's played clips at two tempos |
| Interaction | Play A → play B → choose Faster / Slower / Same |
| Progression | Difference 25% → 15% → 8%; "same" included; then a gradual drift inside one example ("did it speed up?"); then guna change vs tempo change |
| Variations | Sequence, base tempo, difference, order, drift vs step |
| Feedback | Replays both with a moving beat line so the change can be seen |
| Scoring | Recognition: correct per difference size (the smallest reliably heard difference is the skill measure) |
| Facilitator controls | Base tempo range; smallest difference allowed |
| Technical | JS only; both examples rendered from the same approved sequence at two tempos inside its approved range |
| Acceptance | Both tempos always inside the approved range; "same" examples exactly equal; the right answer is never decided by loudness or length |

### 7.9 Sound Explorer (= the spec's "Instrument Explorer") — Listening · Phase 3

| Point | |
|---|---|
| Existing / new | **New** |
| Objective | Identify mṛdaṅga, kartāl, harmonium and other kīrtan instruments, alone and together (A ensemble listening, D) |
| Level | All |
| Instructions | "Which instrument do you hear?" / "Which instruments are playing together?" |
| Content | 3-5 short clips per instrument Prji approves; 6-10 ensemble clips with the instruments named |
| Interaction | Hear → tap instrument pictures (one or several) |
| Progression | One instrument, 3 choices → one of 5 → two together → "which one stopped?" |
| Variations | Clip, choices, single/ensemble |
| Feedback | Replays with the instrument's picture lit while it plays |
| Scoring | Recognition: correct per instrument and per combination |
| Facilitator controls | Instruments and clips in play |
| Technical | JS only |
| Acceptance | Every clip's label approved; pictures have text names; the game works with sound and text alone (no colour) |

### 7.10 Daily Sādhana Quest — Daily Practice · Phase 2

| Point | |
|---|---|
| Existing / new | **Existing:** the Daily Mission card (#673): one Weekly Practice item a day with minutes and Start/Continue. **New:** 2-3 short Playground challenges on the same card, chosen by the engine |
| Objective | Consistent, balanced daily practice: one listening, one rhythm/cycle, one optional voice/kīrtan, and real-khol practice (spec §27) |
| Level | The student's own |
| Instructions | On the card: "Today: Listen 2 min · Rhythm 2 min · Your khol 15 min" |
| Content | Whatever is approved and eligible |
| Interaction | Tap a line → that game opens with a ready round → back to the card with the line ticked |
| Progression | Picks the weakest skill (lowest label, longest unpractised), one review item set, and an optional surprise; never the same pair of games two days running |
| Variations | Games, skills, items differ daily (seed = student + date) |
| Feedback | The card ticks lines; the existing "How did it go?" faces after the khol practice (#494) are the reflection |
| Scoring | None of its own; each challenge records its own round. Consistency = days with any practice (existing milestones, #493) |
| Facilitator controls | Daily length (2-4 challenges), surprise on/off, assigned skills first |
| Technical | JS only; `lib/today-practice.ts` gains the Playground lines |
| Acceptance | Missions differ across 7 test days without leaving the syllabus; no penalty or "lost" wording when a day is skipped; the khol line stays first in importance |

### 7.11 Tāla Cycle Master — Rhythm · Phase 1 (visual + listening), Phase 2 (sam taps graded)

| Point | |
|---|---|
| Existing / new | **Partly existing:** taals with vibhags and marks (X sam, 0 khali, 2-9 tali), the beat grid, silent cycles (#490). **New:** the game |
| Objective | Understand mātrā, recurring cycles and sam; follow several cycles without visual help; rejoin at sam (B, D) |
| Level | Beginner: 4/8 even pulses; Developing: a taught taal; Advanced: no visuals, a pause, rejoin |
| Instructions | "Count with the beats. Tap the big circle when the cycle comes back to sam." |
| Content | Approved real taals (G1); optional Prji's recorded theka |
| Interaction | Beginner: choose "where does it restart?" on the grid; Developing: count cycles heard, answer "how many mātrās passed?"; Advanced: sound stops for 1-2 cycles (silent cycles) → tap at sam |
| Progression | Visual grid → grid fades → silent cycles → changed accompaniment (kartāl only) while the cycle continues |
| Variations | Taal, tempo, number of cycles, where the question starts (not always at sam) |
| Feedback | Shows the cycle wheel with sam lit and replays from the last sam |
| Scoring | Kept separately (spec §23): identification accuracy, cycle-count accuracy, continuity (sam taps within window, calibrated only) |
| Facilitator controls | Taals per level; visuals policy; silent-cycle lengths |
| Technical | JS only (silent cycles and beat positions exist) |
| Acceptance | Cycles wrap at the right mātrā; no off-by-one counts (count from 1 at sam); re-entry keeps the original cycle; replay/seek keeps audio and grid aligned |

### 7.12 Rhythm Switching Challenge — Rhythm · Phase 2

| Point | |
|---|---|
| Existing / new | **Partly existing:** layakari 1×-4× in the taal player (#491, one guna per play). **New:** switching guna inside one exercise with a steady pulse; guna 8 where allowed |
| Objective | Keep the underlying pulse while switching subdivisions, especially guna 1 → 2 → 4 → 1 (B) |
| Level | Beginner: listen and name the guna; Developing: tap through changes; Advanced: changes without visual prompts, return to guna 1 exactly at a marked pulse |
| Instructions | "The beat stays the same. The strokes get faster inside it. Tap the beat — not the strokes." |
| Content | Approved theka(s) and the class's guna convention (G5); BPM limits per guna |
| Interaction | One loop of sections (e.g. 2 cycles guna 1, 2 × guna 2, 2 × guna 4, 2 × guna 1) with a pulse light and subdivision dots |
| Progression | Name the guna → tap the pulse through changes → tap subdivisions → no visual cue for the change |
| Variations | Order of switches (only orders Prji approves), tempo, cycles per section |
| Feedback | Section by section: "steady through dugun, rushed into chaugun" |
| Scoring | Per-section pulse deviation, missed transitions, re-entry stability (spec §24); speed is never "better" |
| Facilitator controls | Allowed guna per level and BPM caps (guna 8 only where set) |
| Technical | JS only: a new pattern function builds the sections into one loop (the phone's loop file is capped at 160 s, as silent cycles) |
| Acceptance | Pulse positions identical across all sections; guna 8 never offered above its BPM cap; at 4×/8× the mix never clips |

### 7.13 Vocal Sādhana Studio — Voice · Phase 3

| Point | |
|---|---|
| Existing / new | **New** (recorder, assessments and review exist) |
| Objective | Active listening, comfortable pitch matching, controlled note duration, clear rhythmic chanting, confident call-and-response (C) — music pedagogy, not voice therapy |
| Level | After Voice Companion's first steps |
| Instructions | Per activity; always "comfortable, gentle, stop any time" |
| Content | Prji's (or a singer's) recorded call phrases; bol-recitation prompts (padhant, e.g. te-re-khe-ta); reference tones |
| Interaction | Five activities (spec §25 table): **Pitch Match**, **Steady Note** (duration only, never loudness), **Bol Pronunciation** (hear → repeat → compare recordings), **Call & Response** (entry timing by tap or teacher review), **Rhythmic Chanting** (recite bols on the pulse, recorded) |
| Progression | Short → longer phrases; with drone → without; with pulse → silent bars |
| Variations | Phrase, tonic, pulse tempo, drone |
| Feedback | Side-by-side replay; self-check; facilitator comment if sent |
| Scoring | Performance only by **self-check and facilitator rubric (0-3)**; no automatic pronunciation or "voice quality" grade (spec §22, §28) |
| Facilitator controls | Activities on/off per group; which may be sent; rubric |
| Technical | JS only (recorder in the APK); pitch line as §7.5 |
| Acceptance | Mic muted by default; delete before sending; nothing visible to other students; a take can be sent only by the student |

### 7.14 Kīrtan Synchronization Challenge — Kīrtan · Phase 3 (stages A-B), Phase 4 (C-D)

| Point | |
|---|---|
| Existing / new | **New** |
| Objective | Bridge from strokes to playing with a singer and ensemble: enter, keep, adapt, recover (D) |
| Level | After Kīrtan Companion; real-khol accompaniment taught in class |
| Instructions | Per stage (spec §26): **A Listen** — mark pulse, cycle, best entry; **B Respond** — play in the window after a call; **C Accompany** — keep laya across cycles, soft playing, pauses; **D Recover** — rejoin after a tempo change or a dropout without rushing |
| Content | Licensed clips annotated with beat grid, sam, entries, tempo changes; slow and medium versions |
| Interaction | A and B in the app (taps graded against the clip clock); C and D on the real khol along with the clip, **recorded and sent to the facilitator** |
| Progression | Guided (subtitles, beat hints) → reduced hints → free practice → submit to facilitator |
| Variations | Clip, entry point, hint level, tempo version |
| Feedback | A/B: entry found, taps steady (calibrated); C/D: facilitator rubric 0-3 (spec §30: 0 needs demonstration … 3 maintains and responds) |
| Scoring | A/B recognition + calibrated timing; C/D facilitator-reviewed competency only — never a game score (spec §22) |
| Facilitator controls | Clips per level; which stages are open; review |
| Technical | A/B JS only. Slower playback of the clip: expo-audio playback-rate with pitch kept must be **checked on real Android phones**; if poor, Prji records separate slow/medium versions (spec §26 allows this) |
| Acceptance | Clips align to their annotated grid; the phrase-entry cue is unambiguous in a test with 3 pilot students; no automatic grade of live accompaniment |

### 7.15 Surprise Me (not one of the 14; a mode)

One optional round of 3 challenges from different games, chosen from the student's eligible content, never loud and
never during another sound. Can be switched off by the student or the facilitator (spec §16.2 table).

---

## 8. Dynamic challenge engine (deliverable 8)

### 8.1 One bol notation drives all games [Proposed — #691]

The notation is the one the `taals` table and every practice tool already use (migration 0018, `lib/bols.ts`):

- A sequence is a list of **beats**; each beat is `-` (rest) or 1-4 bols joined with `.` (`te.re` = two half-beats).
- A bol is matched in its **plain form**: lower case, long-vowel marks removed (`tā` → `ta`); the class's spelling is
  kept for display.
- Guna/layakari, tempo, vibhags (`divisions`) and marks (`X`, `0`, `2-9`) are separate fields, never written into the
  bols.

Example: te | re | khe | ta (4 counts) = `['te','re','khe','ta']`; a dugun phrase is the same bols with `guna = 2`.

`lib/bols.ts` keeps the **stroke anatomy** (head, zone, fingers, open/closed, sound) for the drawings; the new
database **bol dictionary** says which bols are **approved**, at what level, with which recording, which bols sound
alike and which are close pairs. A bol the dictionary has not approved can never appear in a generated challenge.

### 8.2 Skills (ids used by rounds, progress and the Daily Mission)

`listen.stroke`, `listen.phrase`, `listen.tempo`, `listen.instrument`, `listen.kirtan`, `rhythm.pulse`,
`rhythm.matra`, `rhythm.cycle_sam`, `rhythm.guna`, `rhythm.sequence`, `rhythm.recall`, `vocal.pitch`,
`vocal.steady`, `vocal.bol_recite`, `vocal.call_response`, `kirtan.entry`, `kirtan.keep`, `kirtan.recover`.

### 8.3 Parts

| Part | What it is | Where |
|---|---|---|
| **Bol dictionary** | Approved bols, recordings, sound-alike and close-pair lists | table `play_bols` |
| **Audio assets** | Every approved sound file with licence, performer, approver, revision | table `play_assets`, bucket `playground-audio` (strokes also bundled in the app) |
| **Templates** | The rule of a challenge type: game, skill, response mode, level range, difficulty steps, parameters (choices, length, BPM, guna, variation policy) | table `play_templates` |
| **Exercise bank** | Approved musical items: sequence, answer, optional distractors, BPM range, guna set, tāla, prerequisite syllabus item, assets, attribution | table `play_exercises` |
| **Publication** | A content version number; students only see published, approved, non-placeholder content | table `play_publications` |
| **Generator** | Builds a round from the eligible pool with a seed | `lib/playground/generator.ts` |
| **Guards** | Curriculum guard (eligibility), repeat guard, challenge check | `lib/playground/eligibility.ts`, `repeat-guard.ts`, `check.ts` |
| **Adaptive rules** | Offer harder/easier steps from recent results | `lib/playground/adaptive.ts` |
| **Server check** | `record_round` re-checks every item when saving | migration 0065 |

### 8.4 Seeded generator [Proposed]

- Random numbers from a small seeded generator (32-bit, the same on every device); seed = hash of student id + game +
  date + the day's round number. A round's **recipe** = {seed, content version, game, level, difficulty step}.
- The recipe is saved with the round, so QA and facilitators can **replay exactly** what a student saw
  (DYN-06): staff "Preview" takes a seed and shows the same round.
- The generator only **selects and transforms approved items**: choose an exercise; choose a gap position (Missing
  Beat); choose two tempos inside its range (Tempo Detective); shuffle tiles (Rhythm Builder); choose distractors from
  approved bols of the level or the exercise's own distractor list. It never joins two exercises into a new phrase
  and never writes a new sequence.

### 8.5 Curriculum guard (eligibility) [Proposed]

An item is eligible for a student only when **all** hold (DYN-01, DYN-03):

1. The exercise is `approved`, published, and not a placeholder (placeholders exist only on TEST, §19.3).
2. Its level is the student's level or lower (the facilitator may allow one level up per student).
3. Every bol in its sequence is an approved dictionary bol whose level is at or below the student's.
4. Its prerequisite syllabus item, if set, is ticked for the student (the teacher's ticks, `student_progress`).
5. Every sound it needs is approved and present (cached or downloadable now).
6. The chosen tempo is inside its BPM range and the chosen guna is allowed at the level.
7. The game is enabled for the student's level/group, and assigned items come first.

Before showing a challenge the client runs a **challenge check** (answer present among the cards; no card sounds like
the answer; the gap is not a rest; tempos inside range). A failing challenge is **dropped, not shown**, and a note
with the template id, exercise id, content version and seed — no personal data — goes to `client_errors`.

### 8.6 Repeat guard and spaced review [Proposed]

1. **Never back-to-back:** the same exercise never appears twice in a row while another eligible one exists (DYN-02).
2. **Recent exclusion:** exercises seen in the last *K* items of that game are excluded, *K* = min(8, pool − round
   length).
3. **Freshness weight:** items not seen for 3+ days are preferred; distractors rotate.
4. **Spaced review:** an item answered wrongly comes back after 1 day, then 3, then 7 (three boxes); at most a third
   of a round is review, and it is **labelled "Review"**, so it is not mistaken for a repetition fault.
5. **Skill rotation** in Daily Mission and Surprise me: no skill twice in a row; different game pair each day.
6. Recent history comes from the phone (this login) and, at the start of a session, the last 30 days of the
   student's saved rounds, so a new phone does not reset it.

### 8.7 Low-content fallback [Proposed — DYN-07]

When fewer than max(6, 2 × round length) items are eligible, the round is shown as **"Review practice — new
exercises come as your facilitator adds them"**; items may repeat (still never back-to-back if two exist). Nothing is
synthesised to fill the gap. The facilitator's Content library shows the pool size per game and level, so thin pools
are visible.

### 8.8 Adaptive rules (rules-based, to calibrate in the pilot) [Proposed — DYN-04]

Per student, per game, per difficulty step:

- **Offer harder** after 2 rounds in a row with ≥ 80% correct and on average ≤ 1 replay per item: "Ready to try a
  harder one?" — the student chooses.
- **Offer easier** after 2 rounds in a row below 50%: "Shall we slow it down / use fewer choices / show the grid?"
- **Mixed results** → stay.
- **After 14 days away** → start one step lower as a warm-up.
- **Manual:** the student may choose any step up to their highest reached; the facilitator may set a minimum and
  maximum step per student or group (override always wins).
- Timing games only adapt on **calibrated** phones; otherwise they offer tempo choice only.
- Weight: correctness and steady laya, never speed (spec §17).

### 8.9 Round size and session

A round = 4-8 challenges (about 2-4 minutes); a session suggests at most 3 rounds and then "Now play it on your khol".
After 15 minutes of Playground in a day a calm card suggests the real khol; it does not lock anything.

---

## 9. Database changes and API (deliverable 9) — migration 0065 (design only)

> **Sketch only.** No migration file is added by this design. The engine worker (§19, package W1) writes
> `supabase/migrations/0065_playground.sql` from this sketch, with tests, TEST first, and the lead's review.

### 9.1 Tables

```sql
-- 0065_playground.sql — DRAFT IN docs/RHYTHM_PLAYGROUND.md ONLY

-- Approved audio. Strokes are also bundled in the app (lib/khol-samples.ts); everything else is in Storage.
create table play_assets (
  id            bigint generated always as identity primary key,
  kind          text not null check (kind in ('stroke','phrase','tempo','kirtan','instrument','voice','tone')),
  path          text unique,                    -- 'playground-audio/<kind>/<uuid>.<m4a|wav>', null = bundled
  bundled_key   text,                           -- e.g. 'ta' for a bundled stroke
  mime          text check (mime in ('audio/wav','audio/mp4','audio/mpeg')),
  duration_ms   int check (duration_ms between 50 and 180000),
  bytes         int check (bytes between 1 and 15728640),
  sha256        text check (sha256 ~ '^[0-9a-f]{64}$'),
  bpm           numeric(5,1),                   -- recorded tempo, when it has one
  beat_grid     jsonb,                          -- kīrtan: {"sam_ms":[...],"beats":8,"entries_ms":[...],"tempo_changes":[...]}
  instruments   text[] not null default '{}',   -- Sound Explorer labels
  licence       text not null check (licence in ('own','permission','cc_by','public_domain')),
  performer     text check (char_length(performer) <= 120),
  permission_ref text check (char_length(permission_ref) <= 200),  -- where the signed permission is kept (not the form itself)
  credit        text check (char_length(credit) <= 200),           -- shown in About for cc_by
  status        text not null default 'draft' check (status in ('draft','in_review','approved','retired')),
  placeholder   boolean not null default false, -- TEST stand-in; can never be published on LIVE (9.4)
  revision      int not null default 1,
  approved_by   uuid references profiles (id) on delete set null,
  approved_at   timestamptz,
  created_by    uuid references profiles (id) on delete set null default auth.uid(),
  updated_at    timestamptz not null default now(),
  check (path is not null or bundled_key is not null),
  check (status <> 'approved' or (approved_by is not null and approved_at is not null))
);

-- The approved bol dictionary. id = the plain form used by lib/bols.ts plainBol().
create table play_bols (
  id            text primary key check (id ~ '^[a-z]{1,10}$'),
  written       text not null check (char_length(written) between 1 and 12),   -- as the class writes it: 'dhā'
  telugu        text check (char_length(telugu) <= 12),                         -- optional; not shown at launch
  head          text not null check (head in ('dayan','baya','both')),
  technique     text check (char_length(technique) <= 200),                      -- finger/hand, in Prji's words
  open          boolean,
  level_id      smallint not null references levels (id),                         -- first taught at
  sounds_like   text[] not null default '{}',   -- one card for these (e.g. ke = ka)
  close_pairs   text[] not null default '{}',   -- approved "hard" distractors (e.g. ta ↔ na)
  asset_id      bigint references play_assets (id),
  transcription text check (char_length(transcription) <= 60),
  status        text not null default 'draft' check (status in ('draft','in_review','approved','retired')),
  placeholder   boolean not null default false,
  revision      int not null default 1,
  approved_by   uuid references profiles (id) on delete set null,
  approved_at   timestamptz,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references profiles (id) on delete set null
);

create table play_templates (
  id            bigint generated always as identity primary key,
  game          text not null check (game in ('sound_detective','tap_the_beat','echo','missing_beat',
                  'voice_companion','rhythm_builder','kirtan_companion','tempo_detective','sound_explorer',
                  'daily_quest','tala_cycle','rhythm_switching','vocal_studio','kirtan_sync')),
  skill         text not null,                  -- §8.2 ids
  response_mode text not null check (response_mode in ('choose','order','tap','count','record','self_check')),
  level_min     smallint not null references levels (id),
  level_max     smallint not null references levels (id),
  steps         jsonb not null,                 -- [{"step":1,"choices":2,"len":[1,1],"grid":true}, ...]
  params        jsonb not null default '{}',    -- bpm_delta, guna_set, max_gaps, round_len, review_share ...
  status        text not null default 'draft' check (status in ('draft','in_review','approved','retired')),
  revision      int not null default 1,
  approved_by   uuid references profiles (id) on delete set null,
  approved_at   timestamptz,
  check (level_min <= level_max)
);

-- The exercise bank: approved musical items, in the taal notation (0018).
create table play_exercises (
  id            bigint generated always as identity primary key,
  game          text not null,                  -- same list as play_templates.game
  template_id   bigint references play_templates (id),
  level_id      smallint not null references levels (id),
  skills        text[] not null,
  taal_id       bigint references taals (id) on delete restrict,
  sequence      text[],                         -- beats: '-' or 1-4 bols joined by '.', as taals.bols
  divisions     smallint[],                     -- vibhags, when the item is a cycle
  answer        jsonb not null,                 -- e.g. {"bols":["ta"]} | {"order":[...]} | {"tempo":"faster"} | {"instruments":["kartal"]}
  distractors   jsonb not null default '[]',    -- optional approved distractors for this item
  prompt_assets bigint[] not null default '{}', -- play_assets ids (recorded prompts); empty = rendered from strokes
  bpm_min       numeric(5,1) check (bpm_min between 30 and 240),
  bpm_max       numeric(5,1) check (bpm_max between 30 and 240),
  guna          smallint[] not null default '{1}' check (guna <@ array[1,2,3,4,8]::smallint[]),
  requires_item bigint references syllabus_items (id),   -- only after the teacher has ticked this item
  locale        text not null default 'en',
  attribution   text check (char_length(attribution) <= 200),
  status        text not null default 'draft' check (status in ('draft','in_review','approved','retired')),
  placeholder   boolean not null default false,
  revision      int not null default 1,
  published_in  int,                            -- play_publications.version that first published this revision
  created_by    uuid references profiles (id) on delete set null default auth.uid(),
  approved_by   uuid references profiles (id) on delete set null,
  approved_at   timestamptz,
  updated_at    timestamptz not null default now(),
  check (bpm_min is null or bpm_max is null or bpm_min <= bpm_max)
);
create index play_exercises_pool_idx on play_exercises (game, level_id) where status = 'approved';

-- Publishing: one number per publish; clients refresh their cached pack when it changes.
create table play_publications (
  version       int primary key,
  published_at  timestamptz not null default now(),
  published_by  uuid references profiles (id) on delete set null,
  note          text check (char_length(note) <= 300),
  counts        jsonb not null                  -- {"bols":13,"exercises":{"sound_detective":24,...}}
);

-- Facilitator assignments: a game/skill to a level or a group (groups = the app's existing groups), optional due day.
create table play_assignments (
  id            bigint generated always as identity primary key,
  game          text not null,
  skill         text,
  level_id      smallint references levels (id),
  group_id      bigint references groups (id) on delete cascade,
  student_id    uuid references students (id) on delete cascade,
  step_min      smallint, step_max smallint,
  from_day      date not null default current_date,
  due_day       date,
  note          text check (char_length(note) <= 200),
  created_by    uuid references profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  check (num_nonnulls(level_id, group_id, student_id) = 1)
);

-- Per-student settings a facilitator or the student sets.
create table play_student_settings (
  student_id     uuid primary key references students (id) on delete cascade,
  surprise       boolean not null default true,
  relaxed_timing boolean not null default false,
  level_up_ok    boolean not null default false,     -- may see one level above
  steps          jsonb not null default '{}',         -- {"sound_detective":{"min":1,"max":4}}
  updated_by     uuid references profiles (id) on delete set null,
  updated_at     timestamptz not null default now()
);

-- One row per finished (or left) round. id made on the phone = the offline queue's request id (idempotent).
create table play_rounds (
  id              uuid primary key,
  student_id      uuid not null references students (id) on delete cascade,
  game            text not null,
  mode            text not null check (mode in ('play','review','daily','surprise','assigned')),
  level_id        smallint references levels (id),
  step            smallint,
  seed            bigint not null,
  content_version int not null,
  started_at      timestamptz not null,
  finished_at     timestamptz,
  items           jsonb not null,   -- [{"e":12,"r":2,"a":"na","ok":true,"rp":1,"ms":2300}, ...] ≤ 40 items
  n_items         smallint not null,
  n_correct       smallint,
  timing          jsonb,            -- {"median_ms":-12,"spread_ms":34,"calibrated":true,"offset_ms":180}
  device          text check (device in ('android','ios','web')),
  created_at      timestamptz not null default now()
);
create index play_rounds_student_idx on play_rounds (student_id, created_at desc);

-- Weekly summaries, kept while the account exists (rounds older than 180 days are folded in and deleted).
create table play_skill_weeks (
  student_id     uuid not null references students (id) on delete cascade,
  week           date not null,     -- Monday
  skill          text not null,
  opportunities  int not null,
  correct        int,
  timing_median_ms int, timing_spread_ms int,
  rounds         int not null,
  primary key (student_id, week, skill)
);

-- A facilitator's rating of a performance skill (in class or from a sent recording). 0-3 rubric (spec §30).
create table play_ratings (
  id            bigint generated always as identity primary key,
  student_id    uuid not null references students (id) on delete cascade,
  skill         text not null,
  rating        smallint not null check (rating between 0 and 3),
  note          text check (char_length(note) <= 300),
  submission_id bigint references assessment_submissions (id) on delete set null,
  rated_by      uuid references profiles (id) on delete set null default auth.uid(),
  rated_at      timestamptz not null default now()
);

-- Recordings sent from a game reuse assessments (§10.4): mark which assessments belong to the Playground.
alter table assessments add column if not exists playground_game text;
```

Plus: guard triggers (notation shape as `guard_taal`; every bol of an approved exercise approved in `play_bols`;
editing an approved row returns it to `in_review` with `revision + 1`; only the head facilitator login may set
`approved`/`retired` or publish), the existing `audit_row()` trigger on every content table, and the Storage bucket:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('playground-audio', 'playground-audio', false, 15728640, array['audio/wav','audio/mp4','audio/mpeg'])
on conflict (id) do nothing;
-- read: any signed-in class role; write/delete: staff (drafts), guru (approved files); listed files only.
```

### 9.2 Row-level security

| Table | Students | Coordinators (facilitators) | Head facilitator (Prji's login) |
|---|---|---|---|
| play_bols, play_assets, play_templates, play_exercises | read **approved, published, non-placeholder** rows only | read all; insert/update **drafts**, submit for review | read all; approve, retire, publish |
| play_publications | read | read | write via `publish_playground` |
| play_assignments | read rows for their level, their groups, themselves | read all; write | read all; write |
| play_student_settings | read own; update own `surprise` only (via RPC) | read/write | read/write |
| play_rounds, play_skill_weeks | read own; insert only via `record_round` | read all (as practice logs today, #495) | read all |
| play_ratings | read own | read all; insert/update own ratings | all |

Students never update or delete rounds; deletion happens through the retention job, account deletion (cascade) and
the data-rights erasure (0059 must list the new tables).

### 9.3 Functions (what replaces the spec's REST endpoints)

| Spec endpoint (§8, §29) | Supabase function / read | Notes |
|---|---|---|
| `GET /games`, `/skill-packs`, `/exercises?game=` | `playground_pack(p_have_version int)` → the whole published pack (bols, assets, templates, exercises) or `null` if unchanged | One call per content change, cached on the phone; signed links for missing audio via Storage `createSignedUrls` |
| `POST /playground/sessions`, `GET …/next` | none — generated on the phone | Works offline; recipe saved with the round |
| `POST /attempts` | `record_round(p_round jsonb)` (security definer) | Caller must be the student; ≤ 40 items; every exercise approved and published in a version ≤ current; **correctness recomputed on the server** for recognition items; duplicate id → returns the saved row (idempotent); ≤ 200 rounds a day |
| `GET /me/progress` | `my_playground_progress()` | Per skill: label, opportunities, recent accuracy with sample size, last practised; recognition and performance separately |
| `POST /assignments` | `play_assign(...)`, `play_unassign(id)` | Staff only |
| `GET /facilitator/students/{id}/progress` | `staff_playground_progress(p_student uuid)` and `staff_playground_class(p_level, p_group)` | Staff only (`not_allowed` otherwise); "Ready for review" first |
| `POST /facilitator/content` | `play_save_bol`, `play_save_exercise`, `play_save_template`, `play_save_asset` | Coordinators save drafts; head facilitator approves |
| (approval) | `play_set_status(p_kind, p_id, p_status, p_note)`; `publish_playground(p_note)` | Guru only; publish refuses placeholders unless `settings.playground_allow_placeholders` is true (TEST only) |
| `POST /facilitator/reviews` | existing assessment review (C14) + `play_rate(p_student, p_skill, p_rating, p_note, p_submission)` | §10.4 |
| `POST /privacy/audio-deletion` | existing: the student deletes a take before sending; data-rights erasure (0059) | — |

### 9.4 Nightly job `playground_daily()` (cron `mridanga-playground`, after `mridanga-retention`)

1. Fold rounds older than 180 days into `play_skill_weeks` (upsert by student, week, skill) and delete them.
2. Remove files of Playground recordings (`assessments.playground_game is not null`) **60 days after sending if never
   reviewed** (the existing assessment job already removes them 30 days after review).
3. Nothing else is deleted while the account exists; account deletion cascades.

---

## 10. Facilitator dashboard (deliverable 10)

### 10.1 Screens (under Teaching → Rhythm Playground)

| Screen | Who | What |
|---|---|---|
| **Content library** | facilitators | Tabs: Bols · Sounds · Exercises · Templates. Each row shows status (Draft / Waiting for approval / Approved / Retired), revision and pool size per game and level ("Sound Detective, Beginner: 14 items — enough for variety") |
| **Add / edit exercise** | facilitators | Pick game and level; type the sequence in the taal notation (with the beat grid preview and Play), choose the tempo range and guna, the answer and optional distractors, attach a recorded prompt, prerequisite syllabus item, attribution |
| **Upload a sound** | facilitators | Pick an audio file (m4a, mp3, wav ≤ 15 MB), kind, licence, performer, where the written permission is kept; the app checks length and loudness |
| **Approval queue** | head facilitator (Prji) | Everything waiting; **Preview generated variants**: 5 sample rounds from the item with different seeds; Approve / Send back with a note / Retire |
| **Publish** | head facilitator | Shows what changed since the last version and the pool sizes; Publish with a note |
| **Assignments** | facilitators | Assign a game/skill and step range to a level, a group (e.g. "Playground pilot") or one student, optional due day |
| **Class progress** | facilitators | Students of a level or group, "Ready for review" first, then longest without practice; labels per skill; never a ranking |
| **Recordings to review** | facilitators | The existing assessment review list, filtered to Playground assessments; rubric 0-3 and a comment |
| **Settings** | head facilitator | Playground on/off; pilot group; repetition limit; review share; daily challenge count; surprise on/off; label thresholds (§12) |
| **Flag a problem** | any facilitator | "This sound / notation is wrong" on any item → it is unpublished at the next publish and goes back to the queue |

### 10.2 Who may do what [Proposed — Needs approval: Prji]

- **Head facilitator (Prji):** approve, retire, publish, settings — the single content approver (decided 28-10).
- **Coordinators (facilitators):** draft content, upload sounds, assign, view progress, review recordings, rate.
- **Students:** play, see their own progress, send their own recordings.
- The approver may approve their own drafts (there is one approver by decision); every change is in the audit log
  with who and when, and every approved revision keeps its approver.

### 10.3 Versions

An edit to an approved item makes a new revision waiting for approval; the old revision stays live until the next
publish. Rounds store the exercise revision, so results stay explainable (DYN-01 "content/version IDs"). An
**approved exemplar pack** (spec §9) is kept in the repository as test data for regression tests.

### 10.4 Recordings sent to the facilitator: reuse assessments [Proposed — #694]

The app already lets a student record, listen, delete and **send a recording to an assessment**, which coordinators
review with a rubric (assessments, #52; receipt #687; "Under review" #686). The Playground uses the same path:

1. The facilitator releases a Playground assessment (e.g. "Kīrtan entry — mahāmantra slow"; `playground_game` set)
   to the pilot group or a level, with a 0-3 rubric line.
2. In the game, **"Send to my facilitator"** appears only when such an assessment is open for the student; it opens
   the existing send screen with the take attached (as Record myself does today).
3. Review, receipt, statuses and file removal 30 days after review work as today; the nightly job adds removal after
   60 days unreviewed (§9.4); the facilitator may also save a `play_ratings` row for the skill.

No new upload store, no new review screen, no new storage rules.

---

## 11. Audio technology recommendations (deliverable 11)

### 11.1 What works reliably now (JavaScript only; app fingerprint 23dc7e4a unchanged; reaches phones as an OTA)

| Capability | How it works in this app | Evidence |
|---|---|---|
| Pre-recorded strokes | `lib/khol-samples.ts` loads WAVs from the app's assets, trims silence, evens loudness; used by every tool | #473; empty until Prji records |
| Phrases at any approved tempo, exact timing | **Phones:** the whole cycle is mixed into one WAV and looped by the audio hardware (sample-exact; tempo change re-mixes at the same beat). **Web/iPhone:** Web Audio look-ahead scheduler on the audio clock | Web drift measured −0.16 ms over 136 s (ARCHITECTURE) |
| Metronome sync, silent cycles, layakari, kartāl layer | Built into the pattern, both engines | #490-#492 |
| Tap timing with latency calibration | Taps read the player's own clock; "Tune to this phone" measures the delay once | #470; on-time ±70 ms, close ±160 ms |
| Playing a recorded clip (kīrtan, instrument, voice prompt) | expo-audio player / Web Audio buffer; the screen follows the player's position | as lesson audio (#683, #684) |
| Recording with permission asked at the moment of use | expo-audio recorder (in the APK); AAC mono 96 kbit/s ≈ 0.7 MB a minute | Record myself (#56), assessments |
| Generated reference tones and drones (Voice games) | Synthesised like the practice sounds | practice-sounds.ts method |

Limits to respect: the phone's loop file is capped at 160 s (#490), so long Rhythm Switching sequences must fit; at
4×/8× guna fast strokes overlap (mix kept below clipping, #491); a clip's slower playback with pitch kept must be
**checked on real Android phones** before Kīrtan games rely on it — otherwise use separate recorded tempos.

### 11.2 Possible without a new APK, but research first

| Feature | Route | Risk |
|---|---|---|
| **Pitch line for singing, web/iPhone app** | Browser microphone → audio worklet → pitch estimate (autocorrelation/YIN) on the device | Accuracy on cheap mics and in noisy rooms unknown; must be compared with Prji's judgement on 10+ real voices before any feedback beyond "approximate" |
| **Pitch line on Android via the existing WebView** | react-native-webview is in the APK (lesson videos, #56); a page inside it may use the browser microphone if the app grants the WebView's request | Unproven: permission handling, latency; 1-day spike |
| **Loudness meter** (e.g. "too quiet to hear") | expo-audio recorder metering (to verify in the installed version) | Too coarse for timing; never used to judge quality |

### 11.3 Needs new native code (a new APK — every Android phone must install it)

| Feature | Why native | Impact |
|---|---|---|
| Pitch on Android without the WebView route | expo-audio gives no live audio samples to JavaScript | New native module (e.g. an open-source audio library, or a small own Expo module) → **new fingerprint**, new APK build on Praveen's hotspot, new GitHub release, every student reinstalls; OTA updates for older APKs stop matching |
| Mic onset detection of real khol strokes (timing of real playing) | Needs live samples with known input latency (clap calibration) | Same as above, plus a research spike on 3-4 cheap phones, headphones required (the phone's own sound would leak into the mic) |

[Proposed — #695] **No Phase 1-3 feature needs a new APK.** Native audio comes only in Phase 4, only after the web
pitch line and a spike show a validated need, and only bundled with another planned APK (the face-scan production APK
is the next one).

### 11.4 Research only (no build planned)

Automatic stroke classification (which bol was played), pronunciation scoring by speech recognition, judging live
ensemble accompaniment, simultaneous singing-and-drumming assessment (spec §33 P3).

### 11.5 Device, room and browser notes

- Quiet vs noisy rooms: listening games recommend headphones; the mic games show a noise warning and fall back to
  self-check.
- Bluetooth headphones add 150-300 ms of delay: timing games ask to tune again when the output changes.
- The browser blocks sound until the first tap — every game starts audio only after a tap (also spec §4 "sound never
  starts unexpectedly").
- Muted phone: a visible "Sound is off" hint when the phone's volume is zero (where readable).
- One sound at a time: starting a prompt stops any other Playground sound (spec §11 "simultaneous audio prevention").

---

## 12. Student progress and assessment framework (deliverable 12)

### 12.1 Two kinds of evidence, never added together [Confirmed — prompt §10, spec §22]

| Kind | Examples | Shown as |
|---|---|---|
| **Recognition** | Sound Detective, Missing Beat, Rhythm Builder, Tempo Detective, Sound Explorer, Tāla Cycle identification, Kīrtan entry point | accuracy with sample size ("12 of 15 in the last 2 weeks") and the label |
| **Performance (measured)** | Tap the Beat, Echo pad answers, Rhythm Switching, sam taps, Kīrtan A/B taps | median error and spread in ms, **only on calibrated phones**, with "timing confidence: calibrated / not calibrated" |
| **Performance (judged by a person)** | sent recordings, class checks | facilitator rubric 0-3 with a comment |

### 12.2 Labels (starting rules, calibrated in the pilot) [Proposed — Needs approval: Prji]

| Label | Recognition skill | Measured timing skill |
|---|---|---|
| **Exploring** | fewer than 10 items in the last 30 days | fewer than 3 calibrated rounds |
| **Practising** | 10+ items | 3+ calibrated rounds |
| **Steady** | ≥ 80% of the last 20 items, on at least 2 different days, at the current step, ≤ 1 replay on average | median error ≤ 60 ms and spread ≤ 50 ms in 3 rounds on 2 days |
| **Ready for Review** | Steady at the level's highest step | Steady at the level's highest tempo |

"Ready for Review" puts the student on the facilitator's **Class progress** list to check **in class** or from a sent
recording. Only the facilitator's rating says a performance skill is shown; only the teacher's syllabus tick moves the
level path (#685). The thresholds live in settings and are changed by Prji after the pilot, not by code.

### 12.3 For every skill (prompt §10)

| Step | How |
|---|---|
| Baseline | The first 2 rounds of a game at step 1 (marked "first try") |
| Practice | The games of §3 |
| Objective indicators | Recognition accuracy by step; timing median/spread (calibrated); pool coverage |
| Follow-up | A "check round" offered every 4 weeks at the baseline's step and one above |
| Mastery criteria | Recognition: Steady at the top step. Performance: facilitator rating 3 |
| Facilitator review needed | Every performance skill; any "Ready for Review"; any recognition skill where the student is Steady but the facilitator sees a problem (the facilitator can reset the label with a note — "correct false positives", spec §30) |

### 12.4 What the student sees

My Playground progress: one row per skill with the label word and a small trend (more / same / fewer correct than
2 weeks ago), last practised, and sample size; recognition and performance in separate blocks; a line "Playing on
your khol is checked by your facilitator in class." No points totals, no comparisons, no "lost streak".

### 12.5 Pilot metrics (spec §13, §20.2; prompt §16)

Weekly active pilot students; rounds completed vs left; voluntary replays; repeat-practice rate; per-skill accuracy
trend; timing trend (calibrated only); facilitator ratings before and after 4 weeks; a 3-question confidence survey at
weeks 0 and 4; boring/hard games found by aggregate completion. **Not tracked:** time in app as a goal, rankings.

---

## 13. Privacy, security and accessibility review (deliverable 13)

### 13.1 Data minimisation

New personal data = **game results** (rounds, weekly summaries, facilitator ratings) and **settings**. No date of
birth, no voice or playing audio unless sent. Device field is only android/ios/web. [Needs approval] This is new
learning data about minors: the privacy notice's "Learning" row must name "practice game results" before the update
reaches phones, with the next notice version (as #494 did).

### 13.2 Microphone and recordings

Off by default; asked only when the student taps a mic feature; recording indicator always visible; pause and delete
before sending; **never uploaded without "Send to my facilitator"**; visible only to the student and staff (as
assessment recordings); never used to train AI; never sent to outside AI services (prompt §15). Takes deleted 30 days
after review or 60 days unreviewed. Minors: the same parental-consent basis as assessment recordings today
[Needs approval: Praveen — confirm the consent form covers recordings sent from games].

### 13.3 Security (threat model of spec §31)

| Threat | Control |
|---|---|
| A student reading another's results or takes (IDOR) | RLS on every table; takes in the private `assessment-files` bucket with its existing rules |
| Faked or replayed results | `record_round` recomputes correctness, rejects unpublished content, idempotent ids, daily cap |
| Unapproved content reaching students | RLS shows only approved + published; publish refuses placeholders on LIVE |
| Role escalation | Approve/publish checked with `is_guru()` in functions and triggers, not only in the screen |
| Malicious upload | Bucket accepts only audio types ≤ 15 MB; staff-only writes; files referenced by a row |
| Media URL leakage | Signed links for content (1 hour), never stored |
| Logs leaking voice or identity | `client_errors` gets template/exercise/seed only; the existing scrubber (0061) |

### 13.4 Retention and storage on the free tiers (lead's decision of 28-10)

**Database (500 MB).** One round row with up to 8 items ≈ 0.6 KB with its index.

| Scenario | Rounds kept (180 days) | Size |
|---|---|---|
| Pilot: 12 students, 2 rounds a day, 4 days a week | ≈ 2,500 | ≈ 1.5 MB |
| Whole class later: 200 students, same habit | ≈ 41,600 | ≈ 25 MB |
| Weekly summaries: 200 students × 18 skills × 52 weeks | ≈ 190,000 rows a year (≈ 80 B) | ≈ 15 MB a year, kept while enrolled |
| Content tables (dictionary, bank, templates) | a few thousand rows | < 2 MB |

A per-question row design (spec §8) would be ≈ 8× the round rows. **Conclusion:** well inside 500 MB; summaries grow
slowly and can be reviewed after 3 years.

**Storage (1 GB, shared with lesson files and assessment recordings).**

| Item | Size |
|---|---|
| 9 strokes (bundled in the app, WAV 22.05 kHz mono, ~1.5 s) | ≈ 0.6 MB in the app download (not in Storage) |
| Played phrase recordings (20 × 3 s, AAC) | ≈ 0.7 MB |
| Tempo clips (10 × 10 s) | ≈ 1.2 MB |
| Kīrtan clips (8 × 90 s, AAC 128 kbit/s stereo, two tempos each) | ≈ 20 MB |
| Instruments (6 × 5 clips × 5 s) | ≈ 2.5 MB |
| Voice prompts (20 × 5 s) | ≈ 1 MB |
| **Content total** | **≈ 25 MB** |
| Student takes: ≤ 90 s ≈ 1 MB each; cap 2 open Playground takes per student | pilot ≤ 24 MB; 100 students ≤ 200 MB worst case |

**Conclusion:** fits, provided the cap and the 30/60-day deletion hold. [Needs approval: lead] check the current
Storage use on the LIVE dashboard before Phase 3. **Bandwidth:** content is cached on the phone after the first
download (≈ 25 MB per student once if they open everything); the free plan's monthly egress (5 GB, to confirm on the
dashboard) covers ~200 first downloads a month; strokes come with the app and cost no egress.

### 13.5 Accessibility (WCAG 2.2 AA direction; spec §18, §31)

Touch targets ≥ 48 dp; contrast as the existing theme; every result by icon + word, never colour alone; screen reader
labels on cards, tiles and pads (bol name + hand), results announced once; reduced motion respected (as #622);
instructions readable and replayable; no drag-only interaction (Rhythm Builder is tap-to-place, keyboard on web);
"Relaxed timing" for motor needs; a visual-first path (Rhythm Builder with notation, Tāla Cycle with the grid) so
hearing-only games are not the only route; text size follows the phone (tested at 200%, as student-nav did).

### 13.6 International readiness and legal review

UI strings in the existing en/te/hi files (English only at launch; content has a `locale`). **For legal review, not
legal advice:** India's DPDP Act and Rules (verifiable parental consent for children's data, purpose limits);
GDPR/UK GDPR and COPPA if overseas students join; performers' rights and copyright for recordings; accessibility law
where the app is offered. One country's rules do not satisfy all (prompt §15).

---

## 14. Phased roadmap (deliverable 14)

Re-sequenced for dependencies (allowed by prompt §18): the engine and one complete game come first, before Prji's
recordings exist, so the recordings can be checked in a working game the day they arrive.

| Phase | Deliverables | Depends on | Effort | Risks | Tests | Gate |
|---|---|---|---|---|---|---|
| **0 Foundation (now)** | Migration 0065 on TEST; engine; GameShell; Playground home; content manager (drafts, approval, publish); **Sound Detective PoC** with TEST sounds | Prji's sign-off of this design | Medium (W1-W3) | Engine rules too strict/loose | Seeded variety, repeat and curriculum guard tests; RLS tests | PoC walk on TEST with Prji |
| **1 MVP content** | Prji's 9 strokes + dictionary + real taals + 30-50 prompts; Sound Detective, Missing Beat, Rhythm Builder, Tempo Detective, Tāla Cycle Master (visual/listening); My Playground progress; pilot group switch | **Recordings, dictionary, taals (G1-G4)** | Medium (W2) | Pool too small → "Review practice" | Content parity; 5 test sessions without blockers (spec §12 B) | Prji approves content; privacy notice line; Praveen's "publish" |
| **Pilot** | 8-12 beginners, 4 weeks | Phase 1 live for the pilot group | — | Confusing distractors; children's UI | Observation sheet; baseline/follow-up; survey | Issues triaged; accuracy verified by Prji |
| **2 Interactive rhythm** | Tap the Beat (pulse mode), Echo Challenge, Rhythm Switching, sam taps graded, Daily Sādhana Quest, Surprise me, adaptive offers | Guna convention (G5) | Medium (W4) | Phone latency variance | Calibrated vs uncalibrated paths; 3-4 cheap Android phones + iPhone web | Timing labels only on calibrated phones |
| **3 Voice and kīrtan** | Sound Explorer, Voice Companion, Vocal Sādhana Studio (no-mic + record + send), Kīrtan Companion, Kīrtan Synchronization A-B, Playground assessments, 60-day rule; web pitch line behind a TEST switch | Licensed clips (G6), tonics (G7), rubric (G8) | Large (W5) | Licensing; clip slow-down quality | Mic consent; deletion; clip alignment | Facilitator-reviewed only |
| **4 Advanced** | Validated web pitch feedback; Android mic (native, new APK) if justified; Kīrtan C-D with facilitator review; refined recommendations; facilitator analytics | Pilot data; APK plan | Large | Accuracy claims | Algorithm vs facilitator ratings on diverse voices | Independent validation (spec §12 E) |

---

## 15. QA and acceptance test plan (deliverable 15)

### 15.1 Automated (run by every worker; `npm test` in `app/`, `npm test` in `supabase/tests/`)

| Area | Test | Pass |
|---|---|---|
| Musical correctness | Every generated challenge over 1,000 seeds uses only approved bols, sequences, BPM and guna (DYN-01, DYN-03) | 100% |
| Repeat guard | 10 sessions on a pool of 12: no back-to-back duplicate; repeated ids reported | 0 back-to-back while ≥ 2 eligible |
| Variety | 10 sessions: ordering and content vary (report of exercise ids) | ≥ 3 sessions differ in items |
| Spaced review | A wrong item returns after 1/3/7 days, labelled Review, ≤ ⅓ of a round | as stated |
| Low content | Pool below minimum → "Review practice" label, no synthetic item | as stated |
| Seed replay | Same seed + content version → identical round | identical |
| Adaptive | Success, struggle, inactivity, manual override paths give the documented next step | as §8.8 |
| Audio parity | Every exercise's sounds exist and match its notation and answer | 100% |
| Timing | Pulse/guna patterns put pulses at identical positions; cycles wrap at the right mātrā | exact |
| Server | `record_round`: wrong caller, unpublished item, > 40 items, duplicate id, tampered "ok" → rejected or corrected | all |
| RLS | Student cannot read drafts, others' rounds, others' takes; coordinator cannot approve or publish | all |
| Retention | Rounds > 180 days folded into summaries and deleted; unreviewed takes removed at 60 days | all |
| Replay of migrations | `supabase/tests` live-replay and smoke include 0065 | 0 failures |

### 15.2 Manual and device (TEST site and TEST APK)

Mic permission refused / granted / revoked; headphones vs speaker; Bluetooth delay → retune prompt; muted phone;
airplane mode mid-round and after (rounds kept and sent once); slow network first download; screen reader
(TalkBack, VoiceOver, browser); 200% text; reduced motion; keyboard on web; child-appropriate wording (no "wrong",
"failed"); facilitator permissions; regression of the existing practice tools, tap pad, "Which bol?", Echo me, Record
myself, assessments.

### 15.3 Usability (with consent)

Children (8-12), adult beginners, a senior; each: find the Playground, finish a round, understand feedback, stop.
Observation sheet: confusing bol choices, confusing feedback, time to first success.

### 15.4 Release-blocking issues

Any unapproved or placeholder content visible on LIVE; a student seeing another's data; sound starting by itself; mic
active without the student's tap; a recording uploaded without "Send"; a timing label shown on an uncalibrated phone;
a crash on a cheap Android phone; a game with no exit; a back-to-back repeat while alternatives exist.

---

## 16. Open questions, risks, dependencies (deliverable 16; step 7)

### 16.1 Risks

| Risk | Likelihood | Effect | Mitigation |
|---|---|---|---|
| Recordings arrive late | High | Nothing reaches students | Build and test with TEST sounds; PoC needs only 9 strokes |
| Too little approved content → monotony | Medium | Games feel repetitive | Phrases rendered from strokes; taal thekas as sources; pool sizes visible to Prji |
| Phone latency makes timing feedback unfair | High on cheap phones | Discouragement | Labels only when calibrated; Relaxed timing; practice-only otherwise |
| Over-claiming (quiz = playing) | Medium | Wrong teaching signals | Separate blocks; "checked by your facilitator" line; Ready for Review means class check |
| Licensing of kīrtan clips | Medium | Clips unusable | Record in class with written permission; licence fields required to approve |
| Screen time grows | Low-Medium | Against the class's values | Short rounds; khol prompt after 15 min; Playground time not counted in the practice goal (proposal) |
| Free-tier limits | Low (numbers in §13.4) | Uploads fail | Takes cap; deletion jobs; dashboard check before Phase 3 |
| Native audio need | Later | New APK for everyone | Web first; spike; bundle with another APK |

### 16.2 Decisions needed

| # | Decision | Who | Our suggestion |
|---|---|---|---|
| D1 | Approve this design (placement, engine, labels, phases) | Prji | — |
| D2 | Approve the bol dictionary incl. the 4 unverified mappings | Prji | — |
| D3 | The class's guna convention (1/2/4/8 vs 1/2/3/4; when guna 8) | Prji | **Closed 29-10-2026: 1/2/4/8** (team Beginner Lesson 3, Praveen's yes; DECISIONS #774) |
| D4 | Tempo range and guna per level | Prji | Beginner 60-80 bpm, guna 1-2, to be set by Prji |
| D5 | Voice Companion and Vocal Sādhana Studio share one engine (beginner entry + full studio); same for the two kīrtan games | Prji | Yes |
| D6 | Pilot group members (8-12 beginners, consent for minors) | Prji | Create a group "Playground pilot" |
| D7 | Does Playground time count towards the weekly practice goal? | Prji + Praveen | **No** — the goal stays real-khol practice; the Daily Mission shows both |
| D8 | Label thresholds (§12.2) as starting values | Prji | Yes, review after the pilot |
| D9 | Recordings sent from games use assessments (§10.4) | Lead | Yes |
| D10 | Privacy notice line for game results; consent form covers game recordings | Praveen (privacy owner) | Add to the next notice version |
| D11 | Playground circle on Home if the ring version returns | Praveen | Only as a link to the same screen |
| D12 | Who owns accessibility QA and go/no-go (spec §14) | Praveen | Praveen go/no-go; lead QA |
| D13 | Native mic analysis: only after the web pilot, bundled with the face-scan APK or later | Praveen + lead | Yes |
| D14 | Approved non-personal audio (strokes) on the public website host to save egress | Praveen | Not needed now; revisit if egress grows |

### 16.3 Dependencies

Prji's content (§18) → Phase 1; facilitator-home's Teaching landing → the staff entry row; the native review for
Telugu/Hindi → non-English launch; the next APK → Phase 4 native audio; migrations run on LIVE in number order, so if facilitator-p0's 0066 is ready
for LIVE long before 0065, the lead either ships 0065 first or gives the engine the next free number (0068).

---

## 17. Recommended first proof-of-concept game (deliverable 17)

**Sound Detective (beginner), end to end.** [Proposed — #698]

Why this one:
1. It needs the least new audio: Prji's **9 single strokes** (already specified in docs/KHOL_RECORDINGS.md); until they
   exist, the synthesised strokes clearly labelled "TEST sounds".
2. It **upgrades a game students already know** ("Which bol?"), at the same address, so it tests integration without
   adding a new path.
3. It exercises **the whole engine**: dictionary approval, exercise bank, template steps, seeded rounds, repeat guard,
   curriculum guard (level + approved bols), spaced review, low-content fallback, server-checked results, offline
   queue, labels, facilitator preview/approve/publish.
4. Recognition only — no timing or mic uncertainty muddies the first pilot.

PoC done = on TEST: Prji approves 6+ bols and 12+ items in the Content library → publishes → a TEST student plays 3
rounds offline and online → results appear on the facilitator's Class progress with the right label → automated tests
of §15.1 pass → a one-page "how to add and approve a bol" instruction for facilitators.

(Missing Beat would be the second PoC candidate; Tap the Beat is not recommended first because timing on cheap phones
adds uncertainty.)

---

## 18. Content list for Prji to record and approve

### 18.1 The gate before any student sees a game [Confirmed — spec §21]

**30-50 approved prompts** spread across the first four games, for example:

| Game | Minimum approved items | From |
|---|---|---|
| Sound Detective | 8 bols with recordings + 8 short phrases | dictionary + taals/bank |
| Missing Beat | 10 sequences (4-8 bols) | bank or real taals |
| Rhythm Builder | 10 sequences (3-8 bols) | bank or real taals |
| Tempo Detective | 6 sequences with BPM ranges | bank |
| **Total** | **≈ 42** | |

### 18.2 To approve (no recording needed)

1. **The bol dictionary**: every bol the class uses, its written form, which hand/head, technique in your words,
   first level; which bols sound alike (one card) and which are close pairs. Check the app's guesses: *tin* = tī?
   *kha/khe* = closed baya ka? *ge/gi* = ga? *dhi* = dhin?
2. **The real taals** replacing the 3 placeholders: bols, vibhags, marks (sam X, khali 0, tali), level.
3. **Tempo ranges and guna per level**, and your guna convention (1/2/4/8?).
4. **Sequences for the four first games** (can be typed by a coordinator and approved by you).
5. **The class's kartāl pattern** (to replace the placeholder, #492).
6. **Rubric wording** (0-3) for kīrtan entry, chant clarity, rhythm sample.
7. **Instruments** to include in Sound Explorer.
8. **Tonic (Sa) choices** for children and adults.

### 18.3 To record

| Item | Amount | How | When needed |
|---|---|---|---|
| Single strokes tā, nā, tī, ra, te, ka, gha, ga, gin | 9 × 5 takes | docs/KHOL_RECORDINGS.md (quiet room, WAV 16-bit mono) | Phase 0-1 (PoC) |
| Combined bols dhā, jhā, dhin, kat (optional: the app combines two strokes today) | 4 × 3 takes | same | Phase 1, if you prefer real ones |
| Played phrases (natural feel) for Echo and Tempo Detective | 10-20 × 2 tempos | phone in a quiet room, 3-5 s each | Phase 2 |
| Kīrtan clips (mahāmantra and 2-3 bhajans the class plays) | 6-8 × 60-90 s, slow and medium | recorded in class; singer + khol + kartāl; written permission from each performer (guardian for minors) | Phase 3 |
| Instruments: khol, kartāl, harmonium (+ any you choose) | 3-5 clips × 5 s each, plus 6-10 ensemble clips | in class | Phase 3 |
| Call-and-response phrases (sung) | 10 × 5 s | your voice or a singer's | Phase 3 |
| Bol recitation (padhant) prompts, e.g. te-re-khe-ta | 10 × 3-5 s | your voice | Phase 3 |

### 18.4 Licences

Your own and the class's recordings: **licence "own"**, with each performer's written permission kept by Praveen
(guardian's for a child); a CC BY sample needs a credit in About; NC or unknown licences are not used (#473); bought
or downloaded clips are not used unless the licence allows teaching apps and is recorded. The mahāmantra text is a
traditional prayer; a specific bhajan's lyrics need checking if shown on screen.

---

## 19. Build plan: five worker packages

**Rules for every package:** own worktree from `origin/main`; TEST `.env` only (never the main folder's LIVE `.env`);
JavaScript only (fingerprint 23dc7e4a must not change); checks before READY: `tsc`, lint, `npm test` (app),
`supabase/tests npm test` where SQL changed, fingerprint; screen names, not codes, in messages; DECISIONS numbers as
below (**proposed — the lead allocates; next free after this design is #720**); report READY to the lead.

### 19.1 Packages

| | Package | Owns (files) | Migration / DECISIONS | Depends on | Can start before Prji's recordings? |
|---|---|---|---|---|---|
| **W1** | **Engine + shell** | `supabase/migrations/0065_playground.sql`; `supabase/tests` (smoke, replay list); `app/src/lib/playground/*` (rng, notation, eligibility, generator, repeat-guard, check, adaptive, labels, pack-cache, round-queue); `app/src/data/playground.ts`; `app/src/components/playground/*` (GameShell, ChoiceCards, FeedbackPanel, RoundSummary, InstructionsPreview); `app/tests/playground-*.test.mjs`; `docs/DATABASE.md` section; TEST seed `supabase/seed/playground_test.sql` (placeholders) | **0065**; #720-#729 | This design approved | **Yes** (synthesised strokes, placeholder rows) |
| **W2** | **Student Playground + Listening games (PoC first)** | `app/src/app/student/playground/*`; `app/src/screens/playground/{home,sound-detective,missing-beat,rhythm-builder,tempo-detective,progress}.tsx`; `app/src/screens/which-bol.tsx` → Sound Detective; the "Games" section of `app/src/app/student/(tabs)/my-practice.tsx`; `playground.*` keys in `en.json` (te/hi drafts) | none; #730-#739 | W1's interfaces (can start on the §9 types, merge after W1) | **Yes** — TEST sounds labelled |
| **W3** | **Facilitator content manager** | `app/src/app/staff/playground/*`; `app/src/screens/staff-playground/*`; `app/src/data/playground-admin.ts`; the Playground section on the Student profile; one row on the Teaching landing (facilitator-home's file — after it merges) | none (uses 0065); #740-#749 | W1 migration on TEST | **Yes** |
| **W4** | **Rhythm games + Daily Quest** | `app/src/screens/tap-pad.tsx`, `echo-me.tsx` (pulse mode, bank calls); new `tala-cycle.tsx`, `rhythm-switching.tsx`, `surprise.tsx`; additions to `lib/practice-pattern.ts` (guna sections), `lib/tap-grading.ts` (pulse/evenness), `lib/echo.ts`; `lib/today-practice.ts` + `components/today-practice-card.tsx` (Daily Sādhana Quest) | none; #750-#759 | W1 + W2's home (tiles) | **Yes** (rhythm needs no recordings) |
| **W5** | **Voice, kīrtan, instruments + mic research** | `app/src/screens/playground/{sound-explorer,voice-companion,vocal-studio,kirtan-companion,kirtan-sync}.tsx`; `lib/playground/clip-player(.web).ts`, `beat-grid.ts`, `tones.ts`; `lib/pitch.web.ts` (behind a TEST switch); Playground assessments wiring; 60-day rule in a small follow-up migration **0068** if 0065 is already on LIVE; spike report on Android mic (no APK build without Praveen) | 0068 (only if needed); #760-#769 | W1, W2; real content needs Prji's clips | **Partly** — structure with TEST clips recorded by the team (never internet downloads); real content waits |

### 19.2 Order and parallelism

`W1` first (≈ 2-3 days). Then `W2`, `W3`, `W4` in parallel (no shared files; W2 owns the Playground home that W4's
tiles appear on, so W4 adds its tiles after W2 merges). `W5` last (Phase 3). With facilitator-home and facilitator-p0
still running, at most three Playground packages at once keeps the lead within the 5-session limit.

### 19.3 TEST placeholders — never on LIVE

- Placeholder rows carry `placeholder = true`; `publish_playground` refuses them unless the TEST-only setting
  `playground_allow_placeholders` is on; RLS never shows placeholders to students when that setting is off.
- TEST sounds: the app's synthesised strokes, shown with a "TEST sounds" badge in every Playground screen while no
  recording is approved.
- Team-recorded TEST clips live only in the TEST project's bucket.

---

## Appendix A — What was verified in the code (step 6) and what still needs checking

**Verified on `main` c9b93fd (28-10-2026):**

- Student tabs and Practice tab: `app/src/app/student/(tabs)/_layout.tsx`, `my-practice.tsx` (Games: tap pad, Which
  bol?, Echo me; Daily Mission card; `/student/practice` = Practice tools).
- One notation: `app/src/lib/bols.ts` (plainBol, readBeat, stroke anatomy, 4 unverified mappings),
  `app/src/lib/practice-pattern.ts` (taalPattern, layaGroups for 1-4×, silent cycles).
- Games: `lib/ear-quiz.ts` (#471), `lib/echo.ts` (#472), `lib/tap-grading.ts` (#470: 70/160 ms, stars,
  calibration), `screens/{which-bol,echo-me,tap-pad,practice-tools}.tsx`.
- Audio: `lib/practice-audio.ts` (phone: rendered WAV loop, no scheduled start in expo-audio), `practice-audio.web.ts`
  (Web Audio scheduler), `practice-sounds.ts` (synthesised strokes), `khol-samples.ts` (empty `KHOL_SAMPLE_FILES`),
  `recording.ts` (AAC 96 kbit/s).
- Data: `supabase/migrations/0018_practice.sql` (taals, practice_logs, RLS via `is_staff()`/`my_student_id()`,
  `guard_taal`), `0016_assessments.sql` (submissions, `assessment-files` bucket 50 MB, removal 30 days after review),
  `0001_phase1.sql` (roles enum, `groups`, `settings`, `levels`), `0060` (`retention_daily`), migrations end at 0064.
- Packages: no native audio-stream module; expo-audio, expo-asset, expo-file-system, react-native-webview present.
- DECISIONS #470-#474, #490-#495, #620-#622, #670-#689.

**Still to check (by the worker named):**

| Item | Who |
|---|---|
| expo-audio playback-rate with pitch kept on Android 10-14 cheap phones | W5 spike |
| expo-audio recorder metering availability in the installed version | W5 |
| WebView microphone route on Android | W5 spike |
| Whether facilitator-p0's 0066 touches assessment functions used here | W1 at merge time |
| The Teaching landing file and route after facilitator-home merges | W3 |
| Current LIVE Storage use and monthly egress | lead (dashboard) |
| Whether the student "ring version" of Home is chosen | Praveen / student-nav |
