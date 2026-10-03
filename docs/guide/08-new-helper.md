# 8. For a new helper (developer or volunteer)

Thank you for offering your seva. This page helps you start: first the ways to help without code,
then how to run the app on your own laptop, where things are in the code, and how to make a small
change safely.

[← Back to the guide](README.md) · Previous: [7. How it was built](07-how-it-was-built.md) · Next: [Glossary →](../GLOSSARY.md)

---

**Contents**

1. [Helping without code](#helping-without-code)
2. [Run the app on your laptop](#run-the-app-on-your-laptop)
3. [Where things are in the code](#where-things-are-in-the-code)
4. [Make a small change safely](#make-a-small-change-safely)
5. [Never do these](#never-do-these)
6. [Where to ask](#where-to-ask)

## Helping without code

- **Test.** Use the test web site or the test Android app with a test login, and try the steps in
  the user guides ([student](02-student-guide.md), [coordinator](03-coordinator-guide.md),
  [Facilitator](04-facilitator-guide.md)). Report what confused you, with a screenshot and the
  version line from the bottom of the home screen.
- **Translate.** If you read Telugu or Hindi well, review the app's words. You do not need to code:
  the words are in three files, explained in [TRANSLATIONS.md](../TRANSLATIONS.md).
- **Report a problem** as a GitHub issue (see [Where to ask](#where-to-ask)). A security problem goes
  privately, as [SECURITY.md](../../SECURITY.md) explains.

Use only made-up names in tests and screenshots. Many students are minors.

## Run the app on your laptop

This runs the web version of the app on your own computer, talking to a **test** database. It
takes about 15 minutes the first time.

**1. Install the tools**

- **Node.js**, the program that runs the app's tools: the current LTS version from
  [nodejs.org](https://nodejs.org) (version 24 works; the notification test needs at least 23.6).
- **Git**, which fetches the code and keeps its history: from [git-scm.com](https://git-scm.com).
- A code editor, for example Visual Studio Code.

Check them in a terminal (Command Prompt, PowerShell or Terminal):

```bash
node --version
```

```bash
git --version
```

**2. Get the code**

```bash
git clone https://github.com/Praviadari/mridanga-seva.git
```

This makes a folder `mridanga-seva` with the code.

**3. Point the app at a test project**

The app needs the address and the **public** key of a Supabase project. Use a **test** project only:

- ask the maintainer for the test project's two values, or
- make your own free test project, with the steps in
  [OPERATIONS.md "Setting up a new environment"](../OPERATIONS.md#setting-up-a-new-environment)
  (run the migrations and `seed.sql` for dummy data).

In the folder `app/`, copy `.env.example` to a new file named `.env`, and fill in the two values:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-test-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=your-test-publishable-key
```

Also copy it to `.env.test` with the same test values; some scripts read that file. These files are
never put in git. **Never** put the live project's values in your `.env` for development, and
**never** the secret (`service_role` / `sb_secret_…`) key anywhere: the app refuses to start with it.

**4. Install the app's packages**

```bash
cd mridanga-seva/app
```

```bash
npm ci
```

`npm ci` installs exactly the package versions the project uses (from `package-lock.json`). It
takes a few minutes.

**5. Start the web version**

```bash
npm run web
```

The terminal shows an address, usually `http://localhost:8081`. Open it in a browser. You see the
**Sign in** screen. Sign in with a **test** login (the maintainer can give you one for the shared
test project; on your own project, create logins as the seed file's header explains).

If the app says **App not set up**, the address or key in `app/.env` is missing; fix it and start
again. Press `Ctrl + C` in the terminal to stop the app.

**6. Run the checks**

From `app/`:

```bash
npx tsc --noEmit
```

```bash
npx expo lint
```

If you change anything in `supabase/`, also run the database smoke test (no Supabase account
needed; it uses a temporary database on your laptop):

```bash
cd ../supabase/tests
```

```bash
npm install
```

```bash
npm test
```

It ends with **All checks passed**.

Tip: after adding or moving a screen, start the app once (`npm run web`) before `npx tsc --noEmit`,
so Expo can update its list of screen addresses; otherwise the type check reports false errors.

## Where things are in the code

```
mridanga-seva/
  README.md, CONTRIBUTING.md, SECURITY.md   Start here; how to contribute; reporting security problems
  docs/                 How it works and why (this guide is docs/guide/)
  app/                  The app (Expo, React Native, TypeScript)
    app.json            App name, icon, settings (a change here needs a new Android app)
    src/
      app/              The screens. Every file is a screen; the folder is its address
        student/        Student screens: (tabs)/ = Home, My QR, News; progress, visits, profile
        staff/          Coordinator and Facilitator screens: (tabs)/ = Home, Attendance,
                        Students, Calls, News; register, here-now, call/, syllabus/, levels/,
                        materials/, coordinators/, database/, settings, audit-log ...
        sign-in.tsx ... The sign-in, sign-up, password and waiting screens
      screens/          Screens shown in both areas (the two staff homes, profile, visit history)
      components/       Building blocks: buttons, cards, the QR code and scanner, the ring ...
      data/             Reading and saving records, one file per area (students.ts, attendance.ts ...)
      auth/             Who is signed in and with which role
      i18n/             The words: locales/en.json, te.json, hi.json
      lib/              Helpers: the Supabase connection, dates in India time, notifications, updates
      theme/            Colours, sizes, the card look
    scripts/            Publishing the web version and Android updates (with safety checks)
  supabase/
    migrations/         The database, as numbered files run in order (0001, 0002 ...)
    functions/          The server program that sends notifications
    seed.sql            Made-up students for a test project
    tests/              The database smoke test and the notification test
```

Screens never talk to the database directly: they call a file in `data/`. Screens never contain
words: they use `t('…')` with a name from the language files. More detail:
[ARCHITECTURE.md "The app's code"](../ARCHITECTURE.md#the-apps-code).

Each source file starts with a comment saying what it is for, and comments point to the decision
behind a rule, for example `docs/DECISIONS.md #4`. Follow those pointers.

## Make a small change safely

Example: a button label is unclear.

1. **Open an issue first** for anything bigger than a small fix, so the approach is agreed
   ([CONTRIBUTING.md](../../CONTRIBUTING.md)).
2. **Make a branch** from `main`, for example `fix/clearer-check-out-label`. On GitHub you first
   *fork* (copy) the repository to your own account.
3. **Change the word in all three language files**: `app/src/i18n/locales/en.json`, `te.json` and
   `hi.json`. If you cannot translate it, copy the English text into Telugu and Hindi and say so in
   the pull request.
4. **Look at it** in the running web version.
5. **Run the checks** (`npx tsc --noEmit`, `npx expo lint`, and the smoke test if `supabase/` changed).
6. **Update the docs in the same change** if behaviour changed: [SCREENS.md](../SCREENS.md),
   [DATABASE.md](../DATABASE.md), [ARCHITECTURE.md](../ARCHITECTURE.md), a new entry in
   [DECISIONS.md](../DECISIONS.md) for a new rule, [GLOSSARY.md](../GLOSSARY.md) for a new word.
7. **Open a pull request** with a clear description and a screenshot for a visual change. The pull
   request template has a checklist.

The maintainer reviews it, tries it on the test project, and decides when it reaches the phones.

Admin tasks (building the Android app, publishing updates, notifications, backups, handing over)
are written step by step in [OPERATIONS.md](../OPERATIONS.md). Please read them there rather than
from memory; they include the safety checks.

## Never do these

- Put real personal data in code, tests, the seed file or screenshots. Use made-up students.
- Commit a `.env` file, a password, a keystore, or the Supabase secret key.
- Edit a database migration that has already been applied. Add a new numbered file instead.
- Add a table without row-level security, or a database function without saying who may run it.
- Write words directly in a screen instead of the language files.
- Install Expo packages with `npm install`. Use `npx expo install <package>`, so versions match.
- Run `eas update` by hand. Use the project's publish scripts, which check which project a version
  talks to ([OPERATIONS.md "Updating the Android app"](../OPERATIONS.md#updating-the-android-app)).
- Change the Android package name in `app.json`. Phones would treat it as a different app.
- Copy scripture translations with copyright, books or videos into the repository.

## Where to ask

- **A question, an idea or a bug:** open an issue on the GitHub repository
  ([github.com/Praviadari/mridanga-seva](https://github.com/Praviadari/mridanga-seva)).
- **A security problem:** privately, never in a public issue ([SECURITY.md](../../SECURITY.md)).
- **About the class:** a coordinator or the Facilitator, in person at the class.

Everyone taking part follows the [Code of Conduct](../../CODE_OF_CONDUCT.md).

---

[← Back to the guide](README.md) · Previous: [7. How it was built](07-how-it-was-built.md) · Next: [Glossary →](../GLOSSARY.md)
