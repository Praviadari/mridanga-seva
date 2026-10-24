# E2E tests (Playwright)

Browser tests of the **web version** against the **TEST** project (`fhuqyk…`), for the five flows a class day depends
on (audit 22-10-2026 fix 24, DECISIONS #610-#619). They run the real TEST export in a phone-sized Chromium and in
WebKit (Safari's engine, for iPhones), with three dedicated E2E logins. They never touch LIVE: every script stops
unless `app/.env.test` names the TEST project.

| Flow | Spec | What it does on TEST |
|---|---|---|
| 1. Sign in | `tests/sign-in.spec.mjs` | Wrong password refused; student, coordinator (with the six-digit sign-in code, 0061) and Guru reach their homes; sessions kept in `.auth/` for the other flows |
| 2. Register at the desk | `tests/register.spec.mjs` | Coordinator: Students tab → Welcome desk → an adult "Endtoend Desk …" → roll number. The E2E Guru deletes the record afterwards ("entered by mistake", 0054) |
| 3. Check-in by name | `tests/attendance.spec.mjs` | Coordinator: Check-in tab → "E2E Student" → Check in → Check out |
| 4. Practice log + offline queue | `tests/practice.spec.mjs` | Student: My practice log → Save; then with the connection off (`context.setOffline`) → kept on the phone → sent when back. Entries deleted afterwards |
| 5. News and What's new | `tests/news.spec.mjs` | Student: News tab → the newest announcement opens; My profile → What's new shows the releases and "You have this" |

The app itself is not changed for the tests (no test ids): selectors are roles and the English accessible names, the
words a screen reader says. `app/package.json` does not know about Playwright, so the app's fingerprint never changes.

## Running

```bash
npm ci
npm run e2e
```

`npm run e2e` (from `e2e/`) exports the TEST site into `app/dist` when it is missing or `app/` changed since it was
built (`npm run export:web -- --site test`, a few minutes), serves it on http://127.0.0.1:8190 with the site's own
headers (`scripts/serve-dist.mjs`), and runs every flow in both browsers, one test at a time (~5 minutes). Options:

- `npm run e2e -- --build` exports again (after changing app code without committing).
- `npm run e2e -- --project chromium` or `E2E_BROWSERS=chromium npm run e2e` for one browser; `--headed` to watch.
- `npm run e2e:check` signs each login in and counts what a failed clean-up left on TEST (should be 0, 0, 0).
- A failure leaves a screenshot, the page's accessibility tree and a trace in `test-results/`
  (`npx playwright show-trace test-results/<test>/trace.zip`); `playwright-report/` holds the HTML report.

**Browsers.** `npm run e2e:install` downloads Chromium and WebKit. On the office network Chromium's download fails (the
firewall re-signs storage.googleapis.com, the same block as EAS uploads); the tests then use the installed Google Chrome
(`channel: 'chrome'`) automatically. WebKit comes from another host and installs.

## One-time set-up (per PC, and once on TEST)

1. `npm ci`, `npm run e2e:install`; copy `app/.env.test` from the main folder (TEST values only).
2. `npm run e2e:env` writes `e2e/.env.e2e` (gitignored) with the three addresses and new random passwords; its keys are
   listed in `.env.e2e.example`. Never commit it or paste it in a chat.
3. Once on TEST (already done 24-10-2026): the maintainer adds the three users in the TEST dashboard
   (Authentication → Users → Add user → Create new user, **Auto Confirm User**, addresses and passwords from
   `.env.e2e`), then runs `setup-test-logins.sql` in the TEST SQL editor. On another PC, copy the existing
   `.env.e2e` from the maintainer's password manager instead of making new passwords.
4. `npm run e2e:code` gives the E2E coordinator a sign-in code and keeps its set-up key in `.env.e2e`.
   If the coordinator already has a code this file does not know, a Guru resets it first (Set-up → Sign-in codes).
5. `npm run e2e:check`: student / coordinator / guru with the right roles, the student linked.

## What the tests leave on TEST

Nothing that lasts, except what the class records keep by design: each run adds a check-in + check-out of
"E2E Student" (visits are history), uses up a roll number per desk registration (deleted records never give theirs
back), and the change history keeps a row for each deleted desk record. Volunteers on the test site may
see "E2E Student" in lists. Practice notes start with "E2E", desk records with "Endtoend Desk"; both are deleted
after each test, also when the test failed.

## CI

Not in GitHub Actions yet: the tests need the E2E passwords and the coordinator's code key, which CI does not have
(today CI needs no secrets at all, OPERATIONS "CI"). To add it later: three repository secrets (the `.env.e2e`
values), a job that writes `app/.env.test` (URL + publishable key, not secret) and `e2e/.env.e2e` from them, then
`npm ci`, `npx playwright install --with-deps chromium webkit`, `npm run e2e`. Run it on pushes to `main` and by hand,
not on pull requests from forks (secrets). Until then, run `npm run e2e` before merging app changes.

## Files

- `playwright.config.mjs` projects, browsers, the local server; `tests/helpers.mjs` sign-in steps, sessions, clean-up client.
- `scripts/run.mjs` (`npm run e2e`), `serve-dist.mjs`, `make-env.mjs`, `sign-in-code.mjs`, `check-logins.mjs`,
  `lib/env.mjs` (TEST-only guard), `lib/totp.mjs` (six-digit codes, tested by `npm test` here).
- `SOURCE_TEXT_TESTS.md`: the app unit tests that only read source text, and which flow here now covers them.
