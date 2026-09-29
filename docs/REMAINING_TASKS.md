# Remaining Tasks & Roadmap

This document provides a complete, transparent breakdown of what has been built so far and what is still left to complete for Mridanga Seva across all phases, infrastructure, and native Android production readiness.

---

## 1. Quick Status Overview

| Phase | Milestone | Target Date | Current Status |
|---|---|---|---|
| **Phase 1 (Core)** | Attendance, Registration, Follow-ups, Syllabus, Android Studio Project | 1 Dec 2026 | **95% Complete** (Live Supabase database, pg_cron, Brevo SMTP provisioned; core screens, contexts, offline seed, rules, and native Android Studio prebuild done. Hardware camera scan & audio metronome samples remaining) |
| **Phase 2 (Learning & Operations)** | Assessments, Promotion Approvals, Drum Inventory, Events, Seva Fund | 1 Mar 2027 | **Planned / Backlog** |
| **Phase 3 (Automation)** | Optional Face-Recognition Attendance (Consent-only) | 30 Apr 2027 | **Backlog** |

---

## 2. Phase 1 — Remaining Items for Production Go-Live

Although the Phase 1 app core, business logic, offline seed data, trilingual translations, unit tests, and Android Studio generation are fully functional, the following items remain for local app connection and device integration:

### A. Live Supabase Backend Provisioning
- [x] **Run Live Migration:** Applied [`supabase/migrations/0001_phase1.sql`](../supabase/migrations/0001_phase1.sql) to the production Supabase Mumbai project. *(Completed)*
- [x] **Activate Scheduled Jobs:** Activated `pg_cron` extension on the live project for: *(Completed)*
  - `mridanga-status-refresh` (06:00 IST) — auto-transitions quiet students to *Irregular* and creates follow-up tasks.
  - `mridanga-close-visits` (21:00 IST) — auto-closes any visits left open at centre closing.
- [x] **Configure Brevo SMTP:** Connected Brevo SMTP in Supabase Auth to enable high-volume transaction emails. *(Completed)*
- [ ] **App Environment Linking:** Paste the project's URL and anon key (`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY`) into `app/.env` (from Supabase Dashboard → Project Settings → API).
- [ ] **Initialize First Guru Account:** Sign up in the app, then in the Supabase Table Editor set that user's `role` to `guru` in `profiles`.

### B. Hardware & Native Device Integrations
- [ ] **Physical Camera QR Scanner:**
  - Currently, the app includes a working QR token attendance simulation.
  - *Remaining:* Connect `expo-camera` with live barcode scanning on Android to scan students' physical badges or digital phone passes directly from the device camera.
- [ ] **Audio Engine for Taal Metronome:**
  - Currently, the metronome displays synchronized visual beats and bouncing animated syllables (Dha, Ge, Na, Tin, etc.).
  - *Remaining:* Integrate `expo-av` with bundled lightweight `.mp3`/`.wav` percussive samples so students hear acoustic clicks and authentic mridanga Dayan/Bayan bols at any BPM.
- [ ] **Push Notifications:**
  - Connect Expo Push Notifications (`expo-notifications`) so coordinators receive alerts when students go *Irregular* and students receive class announcements.

### C. Distribution & Release
- [ ] **EAS Build / Production Release:**
  - Configure `eas.json` for Continuous Native Generation or create a production release keystore in Android Studio (`app/android`) to generate release APK/AAB builds for Android devices.
- [ ] **Centre Door Tablet Kiosk Pinning:**
  - Lock the tablet into Android Kiosk / Screen Pinning mode at the Abids class entrance running the full-screen Kiosk mode.

---

## 3. Phase 2 — Learning & Operations Backlog (Target: 1 Mar 2027)

Phase 2 deepens the spiritual learning experience and community management:

### A. Assessments & Promotion Approvals
- [ ] **Formal Practical Assessments:** Standardized scoring forms evaluating rhythm (*Laya*), hand posture (*Hath-sadhana*), bol clarity, and speed transitions (*Dvigun*, *Chaugun*).
- [ ] **Guru Promotion Review:** Workflow enabling coordinators to recommend a student for level advancement (e.g. Beginner $\rightarrow$ Intermediate), requiring digital sign-off from the Guru per [DECISIONS.md #10](DECISIONS.md).
- [ ] **Digital Milestone Certificates:** Auto-generated achievement cards when a student completes all syllabus items in a level.

### B. Instrument Inventory & Asset Management
- [ ] **Mridanga Drum Inventory:** Registering temple drums with unique IDs, head sizes (*Dayan* / *Bayan*), and shell wood type.
- [ ] **Tuning & Maintenance Log:** Tracking *syahi* (black paste) condition, strap tightening, and leather repair dates.
- [ ] **Instrument Borrowing / Check-Out:** Lending tracker for students taking temple mridangas home for practice.

### C. Community & Transparency
- [ ] **Ishtagoshti & Event Manager:** Coordination module for monthly community gatherings, festival kirtan seva schedules, and RSVP counts.
- [ ] **In-App Polls:** Quick polls for class schedule adjustments or special workshop preferences.
- [ ] **Seva Fund / Transparency Ledger:** Read-only ledger for class repairs and consumables (straps, khol paste, talcum powder), accessible by users flagged as `profiles.is_treasurer`.

---

## 4. Phase 3 — Edge Face Recognition (Target: 30 Apr 2027)

- [ ] **On-Device Facial Verification (Opt-In Only):**
  - Fully compliant with India's Digital Personal Data Protection (DPDP) Act.
  - Requires signed guardian consent for minors.
  - Operates strictly offline/on-device (128-dimensional embedding vectors; no raw photos sent to cloud servers).
  - Acts as a hands-free alternative to QR scanning during peak rush hours at the door tablet.

---

## 5. DevOps & Continuous Quality

- [ ] **GitHub Actions CI Pipeline:**
  - Add `.github/workflows/ci.yml` to automatically run:
    - `npm test` (Business rules & translation parity)
    - `npx tsc --noEmit` (TypeScript type safety)
    - `npx expo lint` (ESLint adherence)
    on every pull request to `main`.
- [ ] **Automated Weekly Supabase Backup Script:**
  - Create a lightweight script leveraging `pg_dump` or Supabase CLI to back up Postgres tables and store encrypted snapshots as outlined in [`OPERATIONS.md`](OPERATIONS.md).

---

## 6. What Is Already 100% Complete Today

For reference, the following items are fully implemented, tested, and tracked on branch `feat/phase1-app-core`:

1. **Architecture & Database Schema:** Complete 17-table schema with RLS policies, trigger-based status state machine, audit logging, and `seed.sql`.
2. **Trilingual System:** Dynamic trilingual localization (English, Telugu `te`, Hindi `hi`) with 100% dictionary key parity.
3. **Role Architecture:** Complete role views for Guru, Coordinator, Student, and Kiosk Door Tablet with quick-switching.
4. **Attendance System:** 1-tap check-in/out, live count cards, QR simulation, and daily attendance summary sharing for WhatsApp/SMS.
5. **Student Directory & Profile Modal:** Searchable student list, status filtering, per-student syllabus ticking, visit logs, and call records.
6. **DPDP Minor Registration:** Registration form with automatic minor detection (<18) and statutory parental consent verification.
7. **Follow-Up Call Desk:** Absentee management strictly enforcing Decision #4 (paused/left require logged calls).
8. **Syllabus & Material Access:** Multi-level curriculum with YouTube practice integration.
9. **Communication Groups:** Structured in-app teams replacing WhatsApp groups.
10. **Visual Metronome:** Interactive taal metronome with animated bols for Kaherva, Dadra, Bhajani, and Dasapahira.
11. **Door Tablet Kiosk Mode:** Fullscreen check-in kiosk with live IST clock and welcome banners.
12. **Student Portal:** Self-service portal with personal QR pass and progress tracker.
13. **Unit Test Suite:** 6 passing test cases validating roll number formats, minor age calculations, status guards, and i18n keys.
14. **Native Android Studio Project:** Full Continuous Native Generation setup (`app/android`) with Gradle wrapper and SDK configuration.
