# Mridanga Seva — documentation

Start here. These documents explain how the app works and why it was built this way, so that a new
maintainer can understand it without asking anyone.

| Document | Read it when you want to know |
|---|---|
| [guide/](guide/README.md) | The beginner's guide: the class and the instrument, a user guide per role, how the app works and how it was built, in plain words |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the pieces fit together: app, database, roles, security |
| [DATABASE.md](DATABASE.md) | What each table holds, the student status rules, the database functions and scheduled jobs, how to test a migration |
| [SCREENS.md](SCREENS.md) | Which screens exist, which are still to build, and in what order |
| [TRANSLATIONS.md](TRANSLATIONS.md) | How the English, Telugu and Hindi text works, and how to add or translate it |
| [DECISIONS.md](DECISIONS.md) | Why things are the way they are — every important decision, with its reason |
| [GLOSSARY.md](GLOSSARY.md) | What a word means: mridanga terms (bol, taal, dayan) and app terms (visit, mentor, irregular) |
| [OPERATIONS.md](OPERATIONS.md) | How to set up, run, back up and hand over the live system |

## Rules for keeping these documents useful

1. **Docs change in the same pull request as the code.** A change that makes a document wrong is not finished.
2. **Write for a busy volunteer.** Plain English, short sentences, one idea per paragraph.
3. **Explain why, not only what.** The code shows what it does; the documents and comments say why.
4. **A new decision gets a new entry in DECISIONS.md.** Never rewrite an old entry — mark it
   *Replaced by #N* and add the new one, so the history stays readable.
5. **Use the words in GLOSSARY.md.** If you need a new term, add it there first.
