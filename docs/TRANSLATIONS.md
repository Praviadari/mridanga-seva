# Translations

Every word the app shows is in three files, one per language. Screens never contain the words
themselves ([DECISIONS.md #12](DECISIONS.md)).

| Language | File | State |
|---|---|---|
| English | [`app/src/i18n/locales/en.json`](../app/src/i18n/locales/en.json) | Source: every key is defined here first |
| Telugu | [`app/src/i18n/locales/te.json`](../app/src/i18n/locales/te.json) | Draft, **needs review by a Telugu speaker** |
| Hindi | [`app/src/i18n/locales/hi.json`](../app/src/i18n/locales/hi.json) | Draft, **needs review by a Hindi speaker** |

## How it works

- The files are grouped by screen or topic: `signIn.title`, `pending.body`, `common.email`.
- A screen shows text with `t('signIn.title')` (from `useTranslation()` in react-i18next).
- `{{name}}` in a text is filled in by the app, e.g. `"Hare Krishna, {{name}}"`. Keep the
  `{{...}}` part exactly as it is when translating; move it wherever the sentence needs it.
- TypeScript checks the files: `npx tsc --noEmit` fails if a key is misspelt in a screen, or if
  Telugu or Hindi is missing a key that English has. So a missing translation is caught before
  release, not seen by a student.
- Some values are stored in the database as a code and translated only on screen: levels by
  number (`levels.1` = Beginner), relations (`relations.mother`), ID types (`idTypes.aadhaar`),
  student statuses (`statuses.irregular`), call outcomes (`callOutcomes.paused`), reasons for a
  call (`callReasons.studies`) and who an announcement is for (`announcements.audience.all`,
  `announcements.compose.audienceChoices.level` ...). The codes are listed in
  [DATABASE.md](DATABASE.md#registering-a-student), [DATABASE.md](DATABASE.md#follow-up-calls)
  and [DATABASE.md](DATABASE.md#announcements); never translate a code itself.
- The title and message of an announcement, replies, file names, and group names and purposes
  are shown exactly as people typed them, in whatever language they wrote; the app does not
  translate them. The words around them are in `announcements.*` (including
  `announcements.edit.*`, `announcements.replies.*` and `announcements.files.*`) and `groups.*`.
- A push notification shows the announcement's own title and text, so it is never translated.
  Only the name of the Android notification channel, which people see in the phone's settings,
  is in `push.*`; it is set in the language the app shows when the person signs in.
- Reasons for a call are a list the Guru can extend (`settings.call_reasons`). A reason added
  there without a translation in these files is shown as the Guru typed it, in every language,
  until a translator adds `callReasons.<code>` ([DECISIONS.md #19](DECISIONS.md)).
- The helpers in `app/src/i18n/labels.ts` (`levelName`, `statusName`, `callReasonName`,
  `lastVisitText`, `audienceName` ...) turn codes into words, so every screen words them the same way.
- Language names in the language picker are always written in their own script (English,
  తెలుగు, हिन्दी), so people can find their language whatever the app shows now.

## Which language the app shows

1. The language the person picked on this device: the picker on the sign-in screens and, once
   signed in, at the bottom of the home screen (S1, C1, G1; later also the profile screen). The
   choice is also saved to their profile — at once when they are signed in, otherwise when they
   sign in.
2. Otherwise the language saved on their profile (after they sign in on a new phone).
3. Otherwise the phone's or browser's language, if it is Telugu or Hindi.
4. Otherwise English.

The code is in `app/src/i18n/index.ts`, `app/src/components/language-picker.tsx`, and
`syncLanguageWithProfile` / `saveProfileLanguage` in `app/src/auth/auth-provider.tsx`.

## Adding or changing text

1. Add the key and the English text to `en.json`.
2. Add the same key to `te.json` and `hi.json`. If you cannot translate it, copy the English text
   and say so in the pull request, so a translator can pick it up.
3. Use it in the screen with `t('group.key')`.
4. Run `npx tsc --noEmit` in `app/`.

## Style for translators

- Plain, everyday words; short sentences. Many users are young students or their parents.
- Keep the devotional register the class uses: "Hare Krishna" as the greeting, "గురువుగారు" /
  "गुरुजी" in sentences about the Guru.
- Mridanga words (bol, taal, dayan, baya) stay as they are; see [GLOSSARY.md](GLOSSARY.md).
- Technical words people already know in English are fine in the local script: ఈమెయిల్ / ईमेल,
  పాస్‌వర్డ్ / पासवर्ड.
- The motto "Saṅkalpa · Sādhana · Seva" (`app.motto`) is the same in all three files, in Latin letters
  with diacritics ([DECISIONS.md #39](DECISIONS.md)); do not translate it. The tab labels
  (`tabs.*`), the mantra lines (`home.mantraLine1/2`), the module names (`modules.*`) and the Coming
  soon lines (`comingSoon.*`) in Telugu and Hindi are drafts that still need the review.
- Telugu and Devanagari letters are taller than Latin ones. The app's line heights allow for this;
  if a translated label looks cut off, report it with a screenshot.
