# One notation key for the class — the C/O key

**Status: AGREED 02-11-2026 (C/O).** Praveen and Sarvesh Prji (head facilitator) agreed the team's own scheme: a
capital `I` per finger of the right hand, then **C** (closed) or **O** (open) — `IIIIC`, `IIIIO`, `IC`, `IO`. Bols stay
written as words (`te re khe ta`). The bol names, the strokes and the mantras are the team's and Śrīla Prabhupāda's;
this page only says **how to write them** so that every level, the app, WhatsApp and a printed page show the same thing.

Decisions: docs/DECISIONS.md #782 (this key), #783 (Playground bol cards), #784 (LIVE syllabus file), #776 (the
first draft), #774 (guna 1/2/4/8).

## The rule

- **Bols are written as words** (`te re khe ta`, `tere kheta`), as the app already writes them (Rhythm Playground,
  lessons). The **marks** show *how* a stroke is played; they stand beside the bols, never in place of them.
- **Right hand:** one capital `I` per finger, then `C` for a closed (pressed, damped) stroke or `O` for an open
  (ringing) one: `IIIIC` four fingers closed, `IIIIO` four fingers open, `IC` index finger closed, `IO` index finger
  open. Always the capital letter I — never `|` (the vibhāg line), the digit `1` or a small `l`.
- **The finger count belongs to the mantra.** The technique depends on the mantra, not only the bol or the level, so
  each lesson line keeps its own document's count: `te` is `IIIIC` in the Beginner lessons and `IIIC` in the
  Intermediate notes. The Playground's bol cards show one default per bol (the Beginner one).
- **Left hand** unchanged: `●` khe (closed), `O` ga (open), `▲` ge (Beginner; the Intermediate notes write ge `●`
  "like khe at the left side top end"). An `O` on its own is ga; an `O` after I's means open.
- **`/`** re, as the team writes it. **`+`** played together (`O+IIIIO` = ga + ta).
- **Lines:** `|` vibhāg, `||` end of the line or cycle, `–` (dash) a silent beat. For tāla lines Bhatkhande's marks
  are the recognised standard (`X` sam, `0` khālī, `2 3 …` tālī) if the team wants them later.
- **Thumb strokes**, if the class writes them: `T` (`TC`, `TO`) — a lead suggestion, not yet used.

## The key, row by row

| Stroke | Beginner (working copy) | Intermediate (draft V1) | Written now | Note |
|---|---|---|---|---|
| **te** (right, closed) | `IIIIC` (was four bars underlined) | `IIIC` (was III underlined) | each document's own | Four fingers in Beginner, three in Intermediate: kept per mantra. |
| **ta** (right, open) | `IIIIO` (was four bars plain) | `IO` (was I) | each document's own | Prabhupāda's notes: "index finger open sound". |
| **re** | `/` | — | `/` | |
| **ri** | — | `IC` (was I underlined) | `IC` | No longer looks like ta (`IO`). |
| **ti** | — | `IIC` (was II underlined) | `IIC` | Prabhupāda's mantra writes ti `IIIC` (three fingers closed): kept as written there. |
| **khe** (left, closed) | `●` | `●` | `●` | |
| **ga** (left, open) | `O` | `O` | `O` | |
| **ge** | `▲` | `●` (like khe, top end) | each document's own | |
| **gam** (ga → ge) | — | "ga -> ge" | "ga -> ge" | |
| **jha** (ga + ta) | `O+IIIIO` | — | `O+IIIIO` | Intermediate calls ga + ta **Dha**. |
| **tak** (khe + ta) | `●+IIIIO` | — | `●+IIIIO` | |
| **tere / kheta / khene** (Lesson 2) | `IIIIC/`, `●IIIIO`, `●/` | — | as the team joins them | |
| **jere / ghena / tikhi / takhi** (HS1, HS2) | `(O+IIIIO)/`, `OIIIIO`, `IIIIC●`, `IIIIO●` | — | as the team joins them | |
| **ghe ne re** (Lesson 4, HA 1) | `O IIIIC /` | — | as written | ghe is written `O` here (not `▲`). |
| **ghenere** (HA1a) | `OIIIIC/` | — | as written | |

### Prabhupāda's mantra (Intermediate)

The mantra keeps Śrīla Prabhupāda's syllables (`ki ti ta`, `gi ti ta`) and its own key, written with the class's
letters: `ki` = `●` (left closed), `gi` = `O` (left open), `ti` = `IIIC` (three fingers closed), `ta` = `IO` (index
finger open sound).

## Where the app holds the marks (02-11-2026)

- **Lessons** (plain text, no app change): TEST seed `supabase/seed/syllabus_beginner_test.sql` — Lessons 1, 2 and 4
  and the Intermediate "Notations" and Prabhupāda's mantra carry the C/O marks, each with a one-line key. Lessons 3,
  5-9, Bonus and the Intermediate exercises have no marks in the team's pages, so none were added. LIVE copy:
  `supabase/seed/syllabus_live.sql` (same lessons, no TEST PDFs), pasted on the lead's word.
- **Rhythm Playground:** Sound Detective's cards show the default mark beside the hand ("right hand · IIIIC") with the
  key under the cards; the staff bol editor shows the bol's default mark and the key. Defaults: te `IIIIC`, ta
  `IIIIO`, re `/`, khe `●`, ga `O`, ge `▲`, jha `O+IIIIO`, tak `●+IIIIO` (app/src/lib/playground/marks.ts). The
  dictionary's `written` stays the spelling (`tā`); TEST's placeholder bols' technique words say the same marks.
- **Not changed:** the practice tools' hand drawings (lib/bols.ts, #404) follow the kksongs khol course (te = middle
  finger closed, ta = index finger at the edge of the syahi): they differ from the class key — see the questions.

## Still open (for the team)

| Question | Where |
|---|---|
| Is Intermediate's `ri` the same stroke as Beginner's `re`? Sources disagree on `re` (thumb closed in 4evatalent, thumb open in Bablu Das). | L1, Intermediate key |
| `jha` and `dha`: Beginner names ga + ta `jha` (Lessons 1, 5, Bonus) but also writes `dha` in Lessons 6-8; Intermediate calls ga + ta `Dha`. Same stroke? | L1, L6-8, Intermediate |
| `ti`: two fingers (`IIC`, Intermediate key) or three (`IIIC`, Prabhupāda's mantra) — or two different strokes? | Intermediate |
| HS2, last line: the first `kheta` is marked `●/` (as khene), elsewhere kheta is `●IIIIO`. Typo? | Beginner L2 |
| `ghe` is written `O` in HA 1 and ghena (the ga mark), `▲` in Lesson 1. Is ghe ga here? | Beginner L2, L4 |
| The practice tools' hand drawings show te with the middle finger and ta with the index finger; the class key says four fingers. Redraw them to the class key? | app hand view |

## Spellings and small questions for the team

The app keeps the team's spelling everywhere until the team chooses (the TEST lessons use the documents' words).

| Seen | Where | Question / proposal |
|---|---|---|
| Kaharaba, Kaharba (Beginner L7), Keharwa (Intermediate), Kaherva (the app's sample syllabus) | | One spelling for the taal. |
| Bhija mantra | Beginner L2 | Bīja (as the app's Rhythm Playground writes it: "the four bīja strokes")? |
| Hastha Sadhana | Beginner L2 | Hasta Sādhana? |
| Hatuthi Mantras | Beginner L4 | Spelling, and what "HA" stands for. |
| Tehais | Beginner L5 | Tihāī? (Advanced in the app's sample syllabus says "tihais".) |
| Madhya laya / Madyam Laya; Dhrut laya / Drut Laya | Beginner L3 | One spelling each (the TEST lesson writes "Madhyam" in the table; please confirm). |
| "Three Levels of Speed Practice" | Beginner L3 | The lesson lists four gunas (1, 2, 4, 8): "Four levels"? |
| "bole ie mantra" | Beginner L3 | "bol, i.e. the mantra"? (TEST writes "bole i.e.".) |
| Matra's | Beginner L2 | Mātrās (TEST writes "Matras"). |
| kne na | Bonus, last line | "khe na"? (kept as written on TEST) |
| ghe ne\*, khe ne\* | Bonus | What does the `*` mean? |
| jha -- | Bonus | Is `--` one silent beat (`–`) or two? |
| khik_khi, jhenow_, thenow_ | L6, L7 | What does `_` mean (a held sound, a joined stroke)? |
| Kheta (capital K) | Beginner HS2 | Typo for kheta (TEST writes "kheta"). |
| Left-hand exercises 1 and 2 | Beginner L2 **and** Intermediate 5-6 (same lines) | Taught in both levels, or only one? |
| Lesson 7 taals | Das Pahira, Kaharaba, Bhajani | **No vibhāg marks** (`\|`): please add them, so the app's taal player and students know where each vibhāg starts. Only "Kaharba Lohara" has them. |
| Kaharaba under Das Pahira | Beginner L7 | Is Kaharaba a separate taal (item 2) or part of Das Pahira? |
| "1. Hand Practice Mantra…" | Intermediate p. 2 | The numbering starts again at 1: a new list (e.g. "Section 1, Mantras")? |
| Section 2: Ārati Mantras, Kīrtana Mantras | Intermediate proposal | The lessons are not written yet; the app shows the two titles with "The team will add this lesson". |

## How the key was reached

1. **29-10-2026, the problem.** In the Beginner notes `te` was four bars *underlined* and `ta` four bars *plain*; app
   text, WhatsApp and most phones cannot show an underline, so the two looked the same (the Intermediate draft told
   `ri` from `ta` the same way). The two levels also used different marks for the same stroke, and the bar `|` meant
   both a stroke and the vibhāg line. The first draft (#776) proposed square brackets for closed.
2. **30-10-2026, the team's answer** (mail "Photo"): brackets "also work", but their own proposal was capital I's plus
   C or O; the technique depends on the mantra.
3. **02-11-2026, research** (Prji, 01-11: use the most widely recognised way). No single world-wide written key for khol
   hand strokes exists; the tradition is oral, and every source writes the **bols as words** (KKSongs Khol Guide, Art
   of Kirtan Mridanga 1, Mayapur Mridanga via mridang.am, Bablu Das's Basic Mridanga Handbook). Guides that write the
   technique write **hand + fingers + open/closed** as text (4evatalent Hasta-Sādhana: te = RH 4 closed, ta = RH 4
   open, khe = LH closed; `+` together), which the team's `IIIIC` / `IIIIO` carries compactly. No source uses an
   underline for a closed stroke; in Bhatkhande notation a curve under bols means "one mātrā", so an underline would
   clash with it.
4. **02-11-2026, agreed:** Praveen and Prji — the team's C/O letters, one scheme, capital I only.
