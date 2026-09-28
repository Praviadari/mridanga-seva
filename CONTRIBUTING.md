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
5. Add Expo packages with `npx expo install <package>`, not `npm install`, so versions match the SDK.

## Rules for this project

- **No real personal data.** Use only dummy students in code, tests, seeds and screenshots. Many
  students are minors.
- **No secrets.** Never commit `.env` files or the Supabase `service_role` key.
- **Database changes go in a new migration file** in `supabase/migrations/` (`0002_...sql`,
  `0003_...sql`). Never edit a migration that has already been applied. Every new table needs
  row-level security policies.
- **No hard-coded interface text.** Put every string in the translation files so it can be shown in
  English, Telugu and Hindi.
- **Respect content rights.** Do not add copyrighted scripture translations, purports, books or
  videos to the repository. Link to YouTube videos through the YouTube player; do not download them.

## License of contributions

By submitting a contribution, you agree that it is licensed under the project's
[MIT License](LICENSE).

## Conduct

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).
