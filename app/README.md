# Mridanga Seva — app

The Expo (React Native + TypeScript) app: Android, iOS and the web version from one code base.

## Run it

1. Copy `.env.example` to `.env` and fill in the Supabase project URL and the **publishable
   (anon)** key. Never the `service_role` key.
2. Install and start:
   ```bash
   npm install
   npx expo start
   ```
   Press `w` for the web version, or scan the QR code with Expo Go on an Android phone.

## Before you commit

```bash
npx expo lint
npx tsc --noEmit
```

Add packages with `npx expo install <package>` so their versions match Expo SDK 57. Before using
any Expo API, check the docs for this version: https://docs.expo.dev/versions/v57.0.0/
(see `AGENTS.md`).

## Where things are

The folder map, the login flow and how role-based navigation works are in
[../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md). Translations: [../docs/TRANSLATIONS.md](../docs/TRANSLATIONS.md).
Screens built so far: [../docs/SCREENS.md](../docs/SCREENS.md).
