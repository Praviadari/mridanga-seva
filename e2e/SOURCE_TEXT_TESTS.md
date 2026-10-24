# App tests that only read source text, and the E2E flow that now covers them

Audit 22-10-2026 §2.12 / fix 24: "stop adding source-text tests". Many tests in `app/tests/` read a screen's source
and match strings in it; they prove the code *says* something, not that the screen *does* it. This list (24-10-2026,
main b2e5fb5) names the source-text tests on the five E2E flows and says which flow now checks the behaviour in a
browser. **None is deleted:** a test marked "covered" may go once the lead agrees; "partly" and "not covered" stay.

How they were found: each `test()` block was sorted by whether it calls code (functions, rules, data shaping: these
are real unit tests and stay) or only matches the text of `src/` files. Only blocks on the five flows are listed.

| App test (file: title) | E2E flow | Verdict |
|---|---|---|
| staff-mfa: #581 the code step is its own area: no profile, no remembered copy, no other screen before it | 1 sign-in (coordinator gets the code step before any home) | covered |
| student-screens: Sign-in: New student registration comes before the sign-in form… (#380) | 1 sign-in (form works; order not checked) | partly |
| offline-shell: the app registers the worker only in an exported build after sign-in, removes it at sign-out | none (E2E never signs out: that would end the shared session) | not covered |
| launch-ui-2: Welcome desk: step 1 Who, Next checks it; step 2 More details with Save; the optional block folded | 2 desk (step 1 → Next → step 2 → Save; folding not checked) | covered except the fold |
| launch-audit: Register a student asks possible_duplicates at Next and on Accept, and shows the answer (mixed) | 2 desk (Next with no duplicate) | partly |
| weekend-app: Register a student draws the matches a page at a time… | none (waiting sign-ups list) | not covered |
| weekend-app: an adult registered at the desk keeps the privacy notice… (#290, #292) | none (what is stored is a database check) | not covered |
| weekend-app: the desk's email hint no longer promises a child a login… | none (wording) | not covered |
| minor-signup: the screens: sign-up sends the parent… the desk accepts a child with the ID seen | none (minors are not in the E2E flows) | not covered |
| launch-ui: Check-in opens with one big Scan button; its answer sits under it; a name tap buzzes like a scan | 3 check-in (name tap → answer under it; Scan button and buzz not checked) | partly |
| after-launch-design: the attendance tab still opens the camera for ?scan= (#339) | none (camera) | not covered |
| offline-queue: the screens queue on "no connection" only, and show the count; the root layout sends | 4 practice (queue, count, automatic send); the door queue is not in E2E | covered for practice |
| practice-extras: how did it go: asked after Stop and save, optional with Skip, and on the typed-in form | 4 practice (typed-in form saved without it; the question itself not checked) | partly |
| staff-own-record: Back home and the practice log follow the area | none (staff "Me" practice) | not covered |
| whats-new: My profile has the info icon just above the version line, for students and staff | 5 What's new (student; position and staff not checked) | partly |
| whats-new: the icon is a labelled button with a 44 px target that opens the area's own screen | 5 What's new (labelled button opens it; size not checked) | covered except the 44 px size |
| launch-ui-2: announcement cards: one short meta line; "New" never on your own post… | 5 news (a card's spoken label and opening it) | partly |
| notice-card: the three homes show the card | none yet (the card shows on the E2E Student's home, but asserting it would break once anyone agrees for that login) | not covered |

**Candidates to delete once the lead agrees:** staff-mfa #581 code-step area, launch-ui-2 Welcome desk steps (keep
one line for the fold), offline-queue "the screens queue…" (keep its door half). Everything else stays.

**From now on:** behaviour on these five flows gets a step in `e2e/`, not a new regex over a screen file. Unit tests
that call real code (rules in `src/lib/`, data shaping in `src/data/`) are still the right tool and stay welcome.
