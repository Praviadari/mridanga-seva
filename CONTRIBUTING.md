# Contributing to Mridanga Seva

Thank you for offering your seva. Code, testing, translations of the app's interface text and bug
reports are all welcome.

## Before you start

- **Open an issue first** for anything larger than a small fix, so we can agree on the approach.
- Check the open issues; comment on one before you start work on it.

## Making a change

1. Fork the repository and create a branch from `main`, e.g. `fix/attendance-checkout`.
2. Follow the setup steps in the [README](README.md).
3. Keep each pull request to one change, with a clear description and screenshots for UI changes.
4. Before opening the pull request, run in `app/`:
   ```bash
   npx expo lint
   npx tsc --noEmit
   ```
   If you changed anything in `supabase/`, also run the database smoke test in `supabase/tests/`
   (`npm install`, then `npm test`; see [docs/DATABASE.md](docs/DATABASE.md#testing-a-migration-before-it-goes-live)).
5. Add Expo packages with `npx expo install <package>`, not `npm install`, so versions match the SDK.

## Rules for this project

- **No real personal data.** Use only dummy students in code, tests, seeds and screenshots. Many
  students are minors.
- **No secrets.** Never commit `.env` files or the Supabase `service_role` key.
- **Database changes go in a new migration file** in `supabase/migrations/` (`0002_...sql`,
  `0003_...sql`). Never edit a migration that has already been applied. Every new table needs
  row-level security policies. Every new function is revoked from `public, anon` (and internal
  ones from `authenticated`), and a role check is NULL-safe: `if not coalesce(my_role() in (...), false)`
  ([docs/DECISIONS.md](docs/DECISIONS.md) #14, #72, #77; the grant sweep in `supabase/tests` checks it).
- **No hard-coded interface text.** Put every string in the translation files so it can be shown in
  English, Telugu and Hindi ([docs/TRANSLATIONS.md](docs/TRANSLATIONS.md)). Translators are very welcome.
- **Respect content rights.** Do not add copyrighted scripture translations, purports, books or
  videos to the repository. Link to YouTube videos through the YouTube player; do not download them.

## Documentation and comments

This project will have few maintainers. Anyone should be able to understand it from the code and
the [docs](docs/README.md), without asking the person who wrote it. A change is not finished until
its documentation is.

- **Every source file starts with a short header comment**: what the file is for and who uses it.
  ```ts
  // Attendance screen for coordinators: scan a student's QR code or tap a name to check in or out.
  // Calls the scan_qr / toggle_visit database functions (docs/DATABASE.md).
  ```
- **Every exported function and component has a doc comment** saying what it does, what its
  inputs mean (with units), and any side effect.
- **Comment the why, not the what.** Good names show what the code does; comments explain the
  reason, the rule or the trap. Point business rules to their decision: `// Paused/Left only via a
  call log — docs/DECISIONS.md #4`.
- **SQL:** a header comment for each section, and `COMMENT ON` for every table and every column
  whose meaning is not obvious. These show up in the Supabase dashboard.
- **Update the docs in the same pull request.** Behaviour changed → update `docs/DATABASE.md` or
  `docs/ARCHITECTURE.md`. A new rule or trade-off → add a numbered entry to `docs/DECISIONS.md`.
  A new term → add it to `docs/GLOSSARY.md`.
- **Write plainly.** Short sentences, everyday words. Many readers are more at ease in Telugu or
  Hindi than English. Explain mridanga terms or link the glossary.
- **Prefer boring code.** Simple, obvious code that a newcomer can follow beats clever code.

## License of contributions

By submitting a contribution, you agree that it is licensed under the project's
[MIT License](LICENSE).

## Conduct

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).
