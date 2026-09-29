# Mridanga Seva — Mobile App

Cross-platform mobile application for mridanga class management, attendance, curriculum tracking, and practice. Built with **Expo (React Native + TypeScript)** and **Supabase (Postgres)**.

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   Copy `.env.example` to `.env` and enter your Supabase project credentials:
   ```bash
   cp .env.example .env
   ```
   *(If credentials are not yet supplied, the app automatically runs in offline demo mode with seed data parity).*

3. **Start the app**:
   ```bash
   npm run android    # Run on Android Studio Emulator or connected device
   npm run ios        # Run on iOS simulator
   npm run web        # Run in web browser
   ```

4. **Run tests & quality checks**:
   ```bash
   npm test           # Execute unit tests for business rules & translations
   npm run lint       # Run Expo ESLint
   npx tsc --noEmit   # Typecheck TypeScript codebase
   ```

## Roles Supported

The app includes an instant role-switcher header allowing testing and switching between:
- **Coordinator**: Daily class management, tap-to-mark attendance, follow-up calls desk, student registration, syllabus checklist.
- **Guru**: Administrator access, approval of curriculum materials, class health retention reports.
- **Student**: Personal digital QR pass, syllabus progress tracker, attendance history.
- **Door Tablet (`kiosk`)**: Fullscreen entrance check-in tablet with live clock and greeting notifications.

## Languages

Trilingual interface supporting:
- **English (`EN`)**
- **Telugu (`తెలుగు`)**
- **Hindi (`हिंदी`)**

Language can be switched dynamically with one tap in the header.

## Features

- **Attendance**: 1-tap check-in/out, live presence counts, QR code scanning.
- **Students Directory**: Filter by status (*Active*, *New*, *Irregular*, *Inactive*, *Paused*, *Left*) and Level (1, 2, 3).
- **DPDP Minor Protection**: Verified parental consent tracking for students under 18.
- **Mentor Follow-Up**: Mandatory call logging workflow for absent students enforcing database triggers.
- **Curriculum & Bols**: Detailed syllabi for Beginner, Intermediate, and Advanced levels with YouTube lesson links.
- **Taal Metronome**: Interactive rhythm practice with animated bols (Kaherva, Dadra, Bhajani, Dasapahira).
- **In-App Groups**: Coordination teams replacing external WhatsApp groups.
- **Reports & Analytics**: Active retention metrics and status distribution.
