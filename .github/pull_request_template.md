## What this changes

<!-- One or two sentences. Link the issue: "Closes #12". -->

## Why

<!-- The reason. If it follows or changes a decision, link docs/DECISIONS.md. -->

## Checklist

- [ ] `npx expo lint` and `npx tsc --noEmit` pass in `app/`
- [ ] New or changed files have a header comment; exported functions have a doc comment
- [ ] Database changes are in a **new** migration, with RLS policies, `revoke`/`grant` for new functions and `COMMENT ON` descriptions
- [ ] `npm test` passes in `supabase/tests/` (if anything in `supabase/` changed)
- [ ] Docs updated in this PR (ARCHITECTURE, DATABASE, DECISIONS, GLOSSARY, OPERATIONS — whichever apply)
- [ ] Interface text is in the translation files, not hard-coded
- [ ] No real personal data, no `.env`, no secret keys
- [ ] Screenshots attached for screen changes
