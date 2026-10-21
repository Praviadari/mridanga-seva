// Is What's new ready for this update? For scripts/publish-update.mjs (docs/DECISIONS.md #406). The app shows the
// newest dated entry of src/content/whats-new.json as the version it runs, so a production update needs an entry of
// its own: dated, with no "_todo" left, and not older than the last change to the app's code. A production run stops
// on a problem; preview and --check-only only print it. Same-day releases are not told apart (the date has no time).
// Plain Node, no packages.

import { readFileSync } from 'node:fs';

import { runGit } from './release-git.mjs';

/** The notes file, from app/ (where the publish script runs). */
export const NOTES_FILE = 'src/content/whats-new.json';

/** What the bundle is made of: a commit here after the newest entry's day means the entry is missing. */
const CODE_PATHS = ['src', 'assets', 'package-lock.json'];

/**
 * The problems with the notes for code last changed on `codeDate`; empty when the newest entry is ready.
 * @param {{ releases?: Array<{ date?: string | null, _todo?: string }> } | null} notes the parsed notes file
 * @param {string | null} codeDate YYYY-MM-DD of the newest commit that changed the code (not the notes), or null
 */
export function whatsNewProblems(notes, codeDate) {
  const newest = notes?.releases?.[0];
  if (!newest) return [`${NOTES_FILE} has no release.`];
  const problems = [];
  if (newest._todo) problems.push(`the newest What's new entry still has a _todo: ${newest._todo}`);
  if (!newest.date) {
    problems.push(`the newest What's new entry has no date: set it to the day of publishing (YYYY-MM-DD).`);
  } else if (codeDate && newest.date < codeDate) {
    problems.push(`the newest What's new entry is of ${newest.date}, but the app's code changed on ${codeDate}: add an entry for this update.`);
  }
  return problems;
}

/**
 * The day (YYYY-MM-DD) of the newest commit that changed the app's code, leaving out the notes file; null when git
 * cannot tell.
 * @param {(args: string[]) => string | null} git runs git (runGit, or a stand-in in tests)
 */
export function codeChangedOn(git = runGit) {
  const out = git(['log', '-1', '--format=%cs', '--', ...CODE_PATHS, `:(exclude)${NOTES_FILE}`]);
  return out?.trim() || null;
}

/** The problems for the notes file on disk and this folder's git history. */
export function whatsNewState() {
  let notes;
  try {
    notes = JSON.parse(readFileSync(NOTES_FILE, 'utf8'));
  } catch (error) {
    return [`${NOTES_FILE} could not be read: ${error.message}`];
  }
  return whatsNewProblems(notes, codeChangedOn());
}
