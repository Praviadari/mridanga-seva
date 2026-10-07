# Mridanga Seva — app

The Expo (React Native + TypeScript) app: Android, iOS and the web version from one code base.

## Run it

1. Copy `.env.example` to `.env.development` and `.env.test`, and fill both in with the **TEST**
   Supabase project's URL and **publishable (anon)** key. Never the `service_role` key.
2. Install and start:
   ```bash
   npm install
   npx expo start
   ```
   Press `w` for the web version, or scan the QR code with Expo Go on an Android phone.

## Settings files

Development always talks to the TEST project; the live project's values are used only by an
explicit live build ([../docs/DECISIONS.md #145](../docs/DECISIONS.md)). None of these files is in git.

| File | Project | Read by |
|---|---|---|
| `.env.development` | TEST | `npx expo start` (Expo loads it by itself in development) |
| `.env.test` | TEST | `npm run export:web -- --site test`, anon-key probes of TEST, `eas env:push --environment preview` |
| `.env.live` | LIVE | only `npm run export:web -- --site live` and `eas env:push --environment production` |

Keep **no plain `.env`**: Expo loads `.env` in every mode, so a live `.env` would put the class's
real data behind `npx expo start`. The export scripts set `EXPO_NO_DOTENV=1`, so Expo loads no file
of its own during a build; `export-web.mjs` reads the site's file itself and refuses if its URL is
not that site's project (TEST `fhuqykssenuhczdqbafu`, LIVE `qeozvvizcojzxcjgnaei`). Updates for the
Android app take their settings from the EAS environments, never from these files.

## Building the web version

```bash
npm run export:web -- --site test   # the test site, Cloudflare Pages project mridanga-seva-test
npm run export:web -- --site live   # the class's site, mridanga-seva (go-live only)
```

Without `--site` it stops. The result is `dist/`, with `_headers` (Content-Security-Policy and the
other security headers, filled in for that site from `public/_headers`), the QR reader
(`zxing/<version>/zxing_reader.wasm`, checked against its published SHA-256) and `version.txt`
(site, commit, time). The same build id shows under **Sign out** on the web. Upload and the header
check: [../docs/OPERATIONS.md](../docs/OPERATIONS.md) "Publishing the web version".

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
